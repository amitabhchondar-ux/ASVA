import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/db.js';
import { sendDeviceCommand } from '../mqtt/client.js';

export async function deviceRoutes(fastify: FastifyInstance) {
  // GET /api/devices
  fastify.get('/', async () => {
    const devices = db.prepare(`
      SELECT id, name, location, firmware_version, last_seen_at, online, led_on, threshold, created_at
      FROM devices
      ORDER BY last_seen_at DESC
    `).all();
    return { devices };
  });

  // GET /api/devices/:id
  fastify.get('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
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

  // PATCH /api/devices/:id
  fastify.patch('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { name, location } = req.body as any || {};

    const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(id);
    if (!existing) return reply.status(404).send({ error: 'Device not found' });

    if (name) db.prepare('UPDATE devices SET name = ? WHERE id = ?').run(name, id);
    if (location) db.prepare('UPDATE devices SET location = ? WHERE id = ?').run(location, id);

    return { success: true };
  });

  // DELETE /api/devices/:id
  fastify.delete('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { deleteHistory } = req.query as { deleteHistory?: string };

    if (deleteHistory === 'true') {
      db.prepare('DELETE FROM events WHERE device_id = ?').run(id);
      db.prepare('DELETE FROM telemetry WHERE device_id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE device_id = ?').run(id);
    }

    db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    return { success: true };
  });

  // POST /api/devices/:id/commands
  // Body: { cmd: 'led'|'threshold'|'status', state?: 'on'|'off', value?: number }
  fastify.post('/:id/commands', async (req: FastifyRequest, reply: FastifyReply) => {
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
    const auditId = `aud-${Date.now()}`;
    const userId = (req as any).user?.id || 'system';
    db.prepare(`
      INSERT INTO audit_log (id, user_id, device_id, action, detail, ts)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auditId, userId, id, cmd, JSON.stringify(normalizedBody), now);

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

  // GET /api/devices/:id/telemetry
  fastify.get('/:id/telemetry', async (req: FastifyRequest) => {
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

