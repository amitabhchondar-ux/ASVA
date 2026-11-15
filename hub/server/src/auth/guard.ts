import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/db.js';
import { config } from '../config.js';

export function audit(userId: string | null, action: string, target: string | null, ip: string, ok: boolean, detail: string = '') {
  try {
    const id = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO audit_log (id, user_id, device_id, action, target, detail, ip, ok, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, target, action, target, detail, ip, ok ? 1 : 0, now);
  } catch (err: any) {
    console.warn('[Audit Log Error]', err.message);
  }
}

export function requireRole(...roles: Array<'admin' | 'viewer'>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = (req.cookies as any)?.asva_session || (req.cookies as any)?.asva_token;
    if (!token) {
      return reply.code(401).send({ error: 'Not signed in' });
    }

    let decoded: any;
    try {
      decoded = (req.server as any).jwt.verify(token);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired session' });
    }

    const userId = decoded.sub || decoded.id;
    const row = db.prepare('SELECT id, email, role, must_change_password, active FROM users WHERE id = ?')
      .get(userId) as { id: string; email: string; role: 'admin' | 'viewer'; must_change_password: number; active: number } | undefined;

    if (!row || row.active === 0) {
      return reply.code(401).send({ error: 'Account no longer exists or inactive' });
    }

    if (!roles.includes(row.role)) {
      audit(row.id, 'forbidden', req.url, req.ip, false, 'Insufficient permissions');
      return reply.code(403).send({ error: 'Not allowed for your role' });
    }

    const url = req.url.split('?')[0];
    if (row.must_change_password && url !== '/api/auth/change-password' && url !== '/auth/change-password') {
      return reply.code(403).send({ error: 'Password change required' });
    }

    (req as any).user = row;
  };
}

