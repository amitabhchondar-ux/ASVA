import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { db, hashPassword } from '../db/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'asva-super-secret-hub-jwt-key-2026';

export async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post('/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = req.body as any || {};
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const hashed = hashPassword(password);
    const user = db.prepare('SELECT id, email, role, active FROM users WHERE email = ? AND password_hash = ?').get(email, hashed) as any;

    if (!user || user.active === 0) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    reply.setCookie('asva_token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // local network HTTP
    });

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  });

  // Logout
  fastify.post('/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('asva_token', { path: '/' });
    return { success: true };
  });

  // Me
  fastify.get('/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies.asva_token;
    if (!token) {
      // Default to guest/viewer viewer fallback if offline local demo
      return { authenticated: false, role: 'viewer' };
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(decoded.id) as any;
      if (!user) return { authenticated: false, role: 'viewer' };
      return { authenticated: true, user };
    } catch {
      return { authenticated: false, role: 'viewer' };
    }
  });
}

