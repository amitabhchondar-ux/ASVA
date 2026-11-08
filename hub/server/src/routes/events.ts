import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/db.js';
import { broadcastWs } from '../ws/wsHandler.js';

export async function eventRoutes(fastify: FastifyInstance) {
  // GET /api/events
  fastify.get('/', async (req: FastifyRequest) => {
    const { device, kind, from, to, minConf, page = '1', limit = '50' } = req.query as any;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (device) {
      whereClause += ' AND device_id = ?';
      params.push(device);
    }
    if (kind) {
      whereClause += ' AND kind = ?';
      params.push(kind);
    }
    if (from) {
      whereClause += ' AND ts >= ?';
      params.push(Number(from));
    }
    if (to) {
      whereClause += ' AND ts <= ?';
      params.push(Number(to));
    }
    if (minConf) {
      whereClause += ' AND confidence >= ?';
      params.push(Number(minConf));
    }

    const countRow = db.prepare(`SELECT count(*) as total FROM events ${whereClause}`).get(...params) as { total: number };

    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const query = `
      SELECT id, device_id, session_id, kind, text, confidence, latency_ms, wrong, ts
      FROM events
      ${whereClause}
      ORDER BY ts DESC
      LIMIT ? OFFSET ?
    `;

    const events = db.prepare(query).all(...params, Number(limit), offset);

    return {
      total: countRow.total,
      page: Number(page),
      limit: Number(limit),
      events,
    };
  });

  // POST /api/events - Record a new voice detection event (from simulator / API)
  fastify.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as any || {};
    const targetDevId = body.deviceId || body.device_id || 'asva-esp32-01';
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = Math.floor(Date.now() / 1000);

    // Active session lookup
    const activeSession = db.prepare('SELECT id FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get() as any;
    const sessionId = activeSession?.id || null;

    const conf = body.confidence !== undefined ? body.confidence : (body.conf !== undefined ? body.conf : 0.95);
    const latency = body.latency_ms !== undefined ? body.latency_ms : (body.latency !== undefined ? body.latency : 120);
    const kind = body.kind || 'wake';
    const text = body.text || 'Hello ASVA';
    const wrong = body.wrong ? 1 : 0;

    db.prepare(`
      INSERT INTO events (id, device_id, session_id, kind, text, confidence, latency_ms, wrong, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, targetDevId, sessionId, kind, text, conf, latency, wrong, now);

    const createdEvent = {
      id: eventId,
      device_id: targetDevId,
      session_id: sessionId,
      kind,
      text,
      confidence: conf,
      latency_ms: latency,
      wrong: Boolean(wrong),
      ts: now,
    };

    broadcastWs({
      type: 'event.new',
      event: createdEvent,
    });

    return reply.status(201).send({ success: true, event: createdEvent });
  });

  // PATCH /api/events/:id - Mark wrong / undo
  fastify.patch('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { wrong } = req.body as any || {};

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as any;
    if (!event) return reply.status(404).send({ error: 'Event not found' });

    const newWrong = wrong !== undefined ? (wrong ? 1 : 0) : (event.wrong ? 0 : 1);
    db.prepare('UPDATE events SET wrong = ? WHERE id = ?').run(newWrong, id);

    broadcastWs({
      type: 'event.updated',
      id,
      wrong: Boolean(newWrong),
    });

    return { success: true, id, wrong: Boolean(newWrong) };
  });

  // GET /api/events/export.csv
  fastify.get('/export.csv', async (req: FastifyRequest, reply: FastifyReply) => {
    const { device, kind, minConf } = req.query as any;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    if (device) {
      whereClause += ' AND device_id = ?';
      params.push(device);
    }
    if (kind) {
      whereClause += ' AND kind = ?';
      params.push(kind);
    }
    if (minConf) {
      whereClause += ' AND confidence >= ?';
      params.push(Number(minConf));
    }

    const events = db.prepare(`
      SELECT id, device_id, session_id, kind, text, confidence, latency_ms, wrong, ts
      FROM events
      ${whereClause}
      ORDER BY ts DESC
    `).all(...params) as any[];

    let csv = 'id,device_id,session_id,kind,text,confidence,latency_ms,wrong,timestamp,iso_time\n';
    for (const e of events) {
      const iso = new Date(e.ts * 1000).toISOString();
      const safeText = `"${e.text.replace(/"/g, '""')}"`;
      csv += `${e.id},${e.device_id},${e.session_id || ''},${e.kind},${safeText},${e.confidence},${e.latency_ms},${e.wrong ? 'true' : 'false'},${e.ts},${iso}\n`;
    }

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="asva-events-export.csv"');
    return reply.send(csv);
  });
}

