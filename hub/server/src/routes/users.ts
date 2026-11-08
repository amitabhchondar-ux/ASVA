import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, hashPassword } from '../db/db.js';

export async function userRoutes(fastify: FastifyInstance) {
  // GET /api/users
  fastify.get('/', async () => {
    const users = db.prepare('SELECT id, email, role, active, created_at FROM users ORDER BY created_at ASC').all();
    return { users };
  });

  // POST /api/users
  fastify.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, password, role = 'viewer' } = req.body as any || {};
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const id = `user-${Date.now()}`;
    const hash = hashPassword(password);
    const now = Math.floor(Date.now() / 1000);

    try {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, active, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(id, email, hash, role, now);
      return { success: true, user: { id, email, role, active: 1, created_at: now } };
    } catch (err: any) {
      return reply.status(400).send({ error: 'User with that email already exists' });
    }
  });

  // PATCH /api/users/:id
  fastify.patch('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { role, active, password } = req.body as any || {};

    if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    if (active !== undefined) db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    if (password) {
      const hash = hashPassword(password);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    }

    return { success: true };
  });

  // DELETE /api/users/:id
  fastify.delete('/:id', async (req: FastifyRequest) => {
    const { id } = req.params as { id: string };
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { success: true };
  });
}

