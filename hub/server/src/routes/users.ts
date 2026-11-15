import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, hashPassword, validatePassword } from '../db/db.js';
import { requireRole, audit } from '../auth/guard.js';

export async function userRoutes(fastify: FastifyInstance) {
  // GET /api/users (admin only)
  fastify.get('/', {
    preHandler: requireRole('admin'),
  }, async () => {
    const users = db.prepare('SELECT id, email, role, must_change_password, active, created_at FROM users ORDER BY created_at ASC').all();
    return { users };
  });

  // POST /api/users (admin only)
  fastify.post('/', {
    preHandler: requireRole('admin'),
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', maxLength: 254 },
          password: { type: 'string', minLength: 12, maxLength: 256 },
          role: { type: 'string', enum: ['admin', 'viewer'] },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, password, role = 'viewer' } = req.body as any || {};
    const normalizedEmail = email.trim().toLowerCase();

    const pwError = validatePassword(password);
    if (pwError) {
      return reply.status(400).send({ error: pwError });
    }

    const id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const hash = await hashPassword(password);
    const now = Math.floor(Date.now() / 1000);

    try {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, must_change_password, active, created_at)
        VALUES (?, ?, ?, ?, 1, 1, ?)
      `).run(id, normalizedEmail, hash, role, now);

      audit((req as any).user?.id, 'create-user', id, req.ip, true, `Created user ${normalizedEmail} (${role})`);
      return { success: true, user: { id, email: normalizedEmail, role, active: 1, created_at: now } };
    } catch (err: any) {
      return reply.status(400).send({ error: 'User with that email already exists' });
    }
  });

  // PATCH /api/users/:id (admin only)
  fastify.patch('/:id', {
    preHandler: requireRole('admin'),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { role, active, password } = req.body as any || {};

    if (role && (role === 'admin' || role === 'viewer')) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    }
    if (active !== undefined) {
      db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    }
    if (password) {
      const pwError = validatePassword(password);
      if (pwError) return reply.status(400).send({ error: pwError });
      const hash = await hashPassword(password);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    }

    audit((req as any).user?.id, 'update-user', id, req.ip, true);
    return { success: true };
  });

  // DELETE /api/users/:id (admin only)
  fastify.delete('/:id', {
    preHandler: requireRole('admin'),
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const currentUserId = (req as any).user?.id;
    if (id === currentUserId) {
      return reply.status(400).send({ error: 'Cannot delete your own admin account.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    audit(currentUserId, 'delete-user', id, req.ip, true);
    return { success: true };
  });
}
