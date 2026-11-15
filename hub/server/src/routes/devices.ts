import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import { db, hashPassword } from '../db/db.js';
import { sendDeviceCommand } from '../mqtt/client.js';
import { requireRole, audit } from '../auth/guard.js';
import { config } from '../config.js';

export async function deviceRoutes(fastify: FastifyInstance) {
  // GET /api/devices (admin & viewer)
  fastify.get('/', {
    preHandler: requireRole('admin', 'viewer'),
  }, async () => {
    const devices = db.prepare(`
      SELECT id, name, location, firmware_version, last_seen_at, online, led_on, threshold, enabled, created_at
      FROM devices
      ORDER BY last_seen_at DESC
    `).all();
    return { devices };
  });

  // POST /api/devices (admin only: create device & generate MQTT credentials)
  fastify.post('/', {
    preHandler: requireRole('admin'),
    schema: {
      body: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{2,31}$' },
          name: { type: 'string', maxLength: 64 },
          location: { type: 'string', maxLength: 64 },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id, name = '', location = 'Lab Bench' } = req.body as { id: string; name?: string; location?: string };
    const count = (db.prepare('SELECT COUNT(*) AS n FROM devices').get() as { n: number }).n;
    if (count >= config.maxDevices) {
      return reply.code(409).send({ error: 'Device limit reached' });
    }

    const password = randomBytes(18).toString('base64url'); // 24 chars random password
    const now = Math.floor(Date.now() / 1000);
    const passHash = await hashPassword(password);

    try {
      db.prepare(`
        INSERT INTO devices (id, name, location, firmware_version, mqtt_pass_hash, enabled, last_seen_at, online, led_on, threshold, created_at)
        VALUES (?, ?, ?, '1.0.0', ?, 1, ?, 0, 0, 0.80, ?)
      `).run(id, name || id, location, passHash, now, now);
    } catch {
      return reply.code(409).send({ error: 'Device ID already exists' });
    }

    const userId = (req as any).user?.id || 'admin';
    audit(userId, 'create-device', id, req.ip, true, `Created device ${id}`);

    // Plaintext password is returned ONCE. Only hash is stored.
    return reply.code(201).send({
      id,
      name: name || id,
      mqttUsername: id,
      mqttPassword: password,
      message: 'Save this MQTT password now - it cannot be recovered from the database.',
    });
  });

  // GET /api/devices/:id (admin & viewer)
  fastify.get('/:id', {
    preHandler: requireRole('admin', 'viewer'),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const device = db.prepare('SELECT id, name, location, firmware_version, enabled, last_seen_at, online, led_on, threshold, created_at FROM devices WHERE id = ?').get(id);
    if (!device) return reply.status(404).send({ error: 'Device not found' });

    const recentTelemetry = db.prepare(`
      SELECT heap_bytes, rssi, uptime_s, ts
      FROM telemetry
      WHERE device_id = ?
      ORDER BY ts DESC
      LIMIT 20
    `).all(id);

    const commands = db.prepare('SELECT phrase, action_type, action_target FROM commands WHERE device_id = ?').all(id);

    return { device, recentTelemetry, commands };
  });

  // PATCH /api/devices/:id (admin only)
  fastify.patch('/:id', {
    preHandler: requireRole('admin'),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { name, location, enabled } = req.body as any || {};

    const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(id);
    if (!existing) return reply.status(404).send({ error: 'Device not found' });

    if (name) db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name, id);
    if (location) db.prepare('UPDATE devices SET location = ? WHERE id = ?').run(location, id);
    if (enabled !== undefined) db.prepare('UPDATE devices SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);

    audit((req as any).user?.id, 'update-device', id, req.ip, true);
    return { success: true };
  });

  // DELETE /api/devices/:id (admin only)
  fastify.delete('/:id', {
    preHandler: requireRole('admin'),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { deleteHistory } = req.query as { deleteHistory?: string };

    if (deleteHistory === 'true') {
      db.prepare('DELETE FROM events WHERE device_id = ?').run(id);
      db.prepare('DELETE FROM telemetry WHERE device_id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE device_id = ?').run(id);
    }

    db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    audit((req as any).user?.id, 'delete-device', id, req.ip, true);
    return { success: true };
  });

  // POST /api/devices/:id/commands (admin only)
  fastify.post('/:id/commands', {
    preHandler: requireRole('admin'),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const rawBody = req.body as any || {};
    const cmd = rawBody.cmd || rawBody.command || 'unknown';
    const state = rawBody.state || rawBody.params?.state;
    const value = rawBody.value !== undefined ? rawBody.value : rawBody.params?.value;
    const normalizedBody = { ...rawBody, cmd, ...(state !== undefined ? { state } : {}), ...(value !== undefined ? { value } : {}) };

    const device = db.prepare('SELECT id, online, led_on, threshold FROM devices WHERE id = ?').get(id) as any;
    if (!device) return reply.status(404).send({ error: 'Device not found' });

    if (!device.online) {
      return reply.status(400).send({
        error: 'Device is currently offline. Cannot send commands until it reconnects to the local network.',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const cmdId = `c-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Audit log
    audit((req as any).user?.id || 'admin', 'device-command', id, req.ip, true, JSON.stringify(normalizedBody));

    try {
      const ack = await sendDeviceCommand(id, { ...normalizedBody, id: cmdId }, 5000);

      // If LED changed or threshold changed, update DB immediately
      if (cmd === 'led') {
        const newLed = state === 'on' ? 1 : 0;
        db.prepare('UPDATE devices SET led_on = ?, last_seen_at = ? WHERE id = ?').run(newLed, now, id);
      } else if (cmd === 'threshold' && typeof value === 'number') {
        db.prepare('UPDATE devices SET threshold = ?, last_seen_at = ? WHERE id = ?').run(value, now, id);
      }

      return { success: true, ack };
    } catch (cmdErr: any) {
      return reply.status(504).send({
        error: cmdErr.message || 'Device did not acknowledge command within 5 seconds.',
      });
    }
  });

  // GET /api/devices/:id/telemetry (admin & viewer)
  fastify.get('/:id/telemetry', {
    preHandler: requireRole('admin', 'viewer'),
  }, async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    const { from, to, limit } = req.query as { from?: string; to?: string; limit?: string };

    let query = 'SELECT * FROM telemetry WHERE device_id = ?';
    const params: any[] = [id];

    if (from) {
      query += ' AND ts >= ?';
      params.push(Number(from));
    }
    if (to) {
      query += ' AND ts <= ?';
      params.push(Number(to));
    }

    query += ' ORDER BY ts ASC LIMIT ?';
    params.push(limit ? Math.min(Number(limit), 200) : 50);

    const items = db.prepare(query).all(...params);
    return { telemetry: items };
  });
}
