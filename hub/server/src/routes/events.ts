import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/db.js';
import { broadcastWs } from '../ws/wsHandler.js';
import { requireRole, audit } from '../auth/guard.js';

// Section 10: Formula injection neutralisation
export function csvCell(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formulas
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`; // RFC 4180 quotes
  return s;
}

export async function eventRoutes(fastify: FastifyInstance) {
  // GET /api/events (admin & viewer)
  fastify.get('/', {
    preHandler: requireRole('admin', 'viewer'),
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          device: { type: 'string', maxLength: 64 },
          kind: { type: 'string', enum: ['wake', 'command'] },
          from: { type: 'string' },
          to: { type: 'string' },
          minConf: { type: 'string' },
          page: { type: 'string' },
          limit: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest) => {
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

  // POST /api/events - Record a new voice detection event (admin & viewer)
  fastify.post('/', {
    preHandler: requireRole('admin', 'viewer'),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
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

  // PATCH /api/events/:id - Mark wrong / undo (admin & viewer)
  fastify.patch('/:id', {
    preHandler: requireRole('admin', 'viewer'),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { wrong } = req.body as any || {};

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as any;
    if (!event) return reply.status(404).send({ error: 'Event not found' });

    const newWrong = wrong !== undefined ? (wrong ? 1 : 0) : (event.wrong ? 0 : 1);
    db.prepare('UPDATE events SET wrong = ? WHERE id = ?').run(newWrong, id);

    audit((req as any).user?.id, 'flag-event', id, req.ip, true, `Flagged wrong: ${Boolean(newWrong)}`);

    broadcastWs({
      type: 'event.updated',
      id,
      wrong: Boolean(newWrong),
    });

    return { success: true, id, wrong: Boolean(newWrong) };
  });

  // GET /api/events/export.csv (admin & viewer)
  fastify.get('/export.csv', {
    preHandler: requireRole('admin', 'viewer'),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
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
      LIMIT 50000
    `).all(...params) as any[];

    const header = ['id', 'device_id', 'session_id', 'kind', 'text', 'confidence', 'latency_ms', 'wrong', 'timestamp', 'iso_time'].join(',');
    const lines = events.map((e: any) => [
      csvCell(e.id),
      csvCell(e.device_id),
      csvCell(e.session_id || ''),
      csvCell(e.kind),
      csvCell(e.text),
      csvCell(e.confidence),
      csvCell(e.latency_ms),
      csvCell(e.wrong ? 'true' : 'false'),
      csvCell(e.ts),
      csvCell(new Date(e.ts * 1000).toISOString()),
    ].join(','));

    audit((req as any).user?.id, 'export-csv', null, req.ip, true, `Exported ${events.length} rows`);

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="asva-events.csv"')
      .header('Cache-Control', 'no-store')
      .send('\uFEFF' + [header, ...lines].join('\r\n')); // BOM ensures Excel renders UTF-8 correctly
  });
}
