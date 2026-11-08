import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/db.js';

export async function sessionRoutes(fastify: FastifyInstance) {
  // GET /api/sessions
  fastify.get('/', async () => {
    const sessions = db.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) as event_count
      FROM sessions s
      ORDER BY s.started_at DESC
    `).all();
    return { sessions };
  });

  // POST /api/sessions - Start session
  fastify.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, device_id, speaker, distance_m, noise_level, attempts, notes } = req.body as any || {};

    if (!name || !device_id) {
      return reply.status(400).send({ error: 'Session name and device_id are required' });
    }

    const sessionId = `ses-${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO sessions (id, name, device_id, speaker, distance_m, noise_level, attempts, notes, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      sessionId,
      name,
      device_id,
      speaker || 'Evaluator',
      distance_m !== undefined ? Number(distance_m) : 1.0,
      noise_level || 'Quiet room (~40dB)',
      attempts ? Number(attempts) : 0,
      notes || '',
      now
    );

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    return { success: true, session };
  });

  // PATCH /api/sessions/:id - Update session
  fastify.patch('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { attempts, notes, name, speaker, distance_m, noise_level } = req.body as any || {};

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    if (attempts !== undefined) db.prepare('UPDATE sessions SET attempts = ? WHERE id = ?').run(Number(attempts), id);
    if (notes !== undefined) db.prepare('UPDATE sessions SET notes = ? WHERE id = ?').run(notes, id);
    if (name) db.prepare('UPDATE sessions SET name = ? WHERE id = ?').run(name, id);
    if (speaker) db.prepare('UPDATE sessions SET speaker = ? WHERE id = ?').run(speaker, id);
    if (distance_m !== undefined) db.prepare('UPDATE sessions SET distance_m = ? WHERE id = ?').run(Number(distance_m), id);
    if (noise_level) db.prepare('UPDATE sessions SET noise_level = ? WHERE id = ?').run(noise_level, id);

    return { success: true };
  });

  // POST /api/sessions/:id/stop - End session
  fastify.post('/:id/stop', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    const now = Math.floor(Date.now() / 1000);
    db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, id);

    return { success: true, ended_at: now };
  });

  // GET /api/sessions/:id/summary - Calculated SIH metrics
  fastify.get('/:id/summary', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    const events = db.prepare(`
      SELECT kind, text, confidence, latency_ms, wrong, ts
      FROM events
      WHERE session_id = ?
      ORDER BY ts ASC
    `).all(id) as any[];

    const wakeEvents = events.filter((e) => e.kind === 'wake');
    const commandEvents = events.filter((e) => e.kind === 'command');
    const wrongEvents = events.filter((e) => e.wrong === 1);
    const wrongWakeEvents = wakeEvents.filter((e) => e.wrong === 1);

    // Latency metrics
    const latencies = events.map((e) => e.latency_ms).sort((a, b) => a - b);
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length)
      : 0;
    
    // 95th percentile
    const p95Latency = latencies.length > 0
      ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
      : 0;

    // Confidence
    const avgConfidence = events.length > 0
      ? Number((events.reduce((sum, e) => sum + e.confidence, 0) / events.length).toFixed(3))
      : 0;

    // Session duration in hours
    const endTime = session.ended_at || Math.floor(Date.now() / 1000);
    const durationSeconds = Math.max(1, endTime - session.started_at);
    const durationHours = durationSeconds / 3600;

    // False activations per hour
    const falseActivationsPerHour = durationHours > 0
      ? Number((wrongWakeEvents.length / durationHours).toFixed(2))
      : 0;

    // Detection rate (wake words detected / attempts)
    const validWakeDetections = wakeEvents.length - wrongWakeEvents.length;
    const attempts = session.attempts || wakeEvents.length;
    const detectionRate = attempts > 0
      ? Number(Math.min(100, (validWakeDetections / attempts) * 100).toFixed(1))
      : 0;

    // Telemetry during session
    const telemetry = db.prepare(`
      SELECT heap_bytes, rssi, uptime_s, ts
      FROM telemetry
      WHERE device_id = ? AND ts >= ? AND ts <= ?
      ORDER BY ts ASC
    `).all(session.device_id, session.started_at, endTime) as any[];

    const avgHeap = telemetry.length > 0
      ? Math.round(telemetry.reduce((sum, t) => sum + t.heap_bytes, 0) / telemetry.length)
      : 0;
    const minHeap = telemetry.length > 0
      ? Math.min(...telemetry.map((t) => t.heap_bytes))
      : 0;
    const avgRssi = telemetry.length > 0
      ? Math.round(telemetry.reduce((sum, t) => sum + t.rssi, 0) / telemetry.length)
      : -60;

    return {
      session,
      metrics: {
        totalEvents: events.length,
        wakeCount: wakeEvents.length,
        commandCount: commandEvents.length,
        wrongCount: wrongEvents.length,
        validWakeCount: validWakeDetections,
        attempts,
        detectionRate, // percentage
        durationSeconds,
        durationFormatted: `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`,
        falseActivationsPerHour,
        avgLatency,
        p95Latency,
        avgConfidence,
        telemetry: {
          sampleCount: telemetry.length,
          avgHeapBytes: avgHeap,
          minHeapBytes: minHeap,
          avgRssi,
        },
      },
      events,
    };
  });

  // GET /api/sessions/:id/export.csv
  fastify.get('/:id/export.csv', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    const events = db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts ASC').all(id) as any[];

    let csv = `# ASVA Session Evaluation Report\n`;
    csv += `# Session ID: ${session.id}\n`;
    csv += `# Session Name: "${session.name.replace(/"/g, '""')}"\n`;
    csv += `# Device: ${session.device_id}\n`;
    csv += `# Speaker: ${session.speaker}\n`;
    csv += `# Distance: ${session.distance_m}m\n`;
    csv += `# Noise Level: ${session.noise_level}\n`;
    csv += `# Attempts: ${session.attempts}\n`;
    csv += `# Started: ${new Date(session.started_at * 1000).toISOString()}\n`;
    csv += `# Ended: ${session.ended_at ? new Date(session.ended_at * 1000).toISOString() : 'Running'}\n\n`;

    csv += 'id,kind,text,confidence,latency_ms,wrong,timestamp\n';
    for (const e of events) {
      csv += `${e.id},${e.kind},"${e.text.replace(/"/g, '""')}",${e.confidence},${e.latency_ms},${e.wrong ? '1' : '0'},${e.ts}\n`;
    }

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="asva-session-${session.id}.csv"`);
    return reply.send(csv);
  });
}

