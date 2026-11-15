import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import argon2 from 'argon2';
import { db, HASH_OPTIONS, hashPassword, validatePassword } from '../db/db.js';
import { config } from '../config.js';
import { audit, requireRole } from '../auth/guard.js';

// Precomputed dummy hash for constant-time comparisons when email does not exist
let DUMMY_HASH: string = '';
(async () => {
  try {
    DUMMY_HASH = await argon2.hash('timing-equaliser-not-a-real-password', HASH_OPTIONS);
  } catch {}
})();

function setSessionCookies(fastify: FastifyInstance, reply: FastifyReply, user: any) {
  // Sign token with subject ID
  const token = (fastify as any).jwt.sign({
    sub: user.id,
    id: user.id,
    email: user.email,
    role: user.role,
  });

  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.cookieSecure,
    maxAge: 2 * 60 * 60, // 2 hours
  };

  // Set asva_session (as per security hardening) and asva_token (for backward compatibility)
  reply.setCookie('asva_session', token, cookieOptions);
  reply.setCookie('asva_token', token, { ...cookieOptions, sameSite: 'lax' as const });
}

export async function authRoutes(fastify: FastifyInstance) {
  // POST /login
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: config.loginRateMax,
        timeWindow: config.loginRateWindow,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', maxLength: 254 },
          password: { type: 'string', minLength: 1, maxLength: 256 },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = req.body as { email: string; password: string };
    const normalizedEmail = email.trim().toLowerCase();

    const user = db.prepare(
      'SELECT id, email, password_hash, role, must_change_password, active FROM users WHERE email = ?',
    ).get(normalizedEmail) as any;

    const hashToVerify = user?.password_hash ?? (DUMMY_HASH || '$argon2id$v=19$m=19456,t=2,p=1$fake');
    let valid = false;
    try {
      valid = await argon2.verify(hashToVerify, password);
    } catch {
      valid = false;
    }

    if (!user || !valid || user.active === 0) {
      audit(user?.id ?? null, 'login', null, req.ip, false, 'Invalid credentials');
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    audit(user.id, 'login', null, req.ip, true, 'User logged in successfully');
    setSessionCookies(fastify, reply, user);

    return {
      ok: true,
      success: true,
      role: user.role,
      mustChangePassword: user.must_change_password === 1,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  });

  // POST /logout
  fastify.post('/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('asva_session', { path: '/' });
    reply.clearCookie('asva_token', { path: '/' });
    return { ok: true, success: true };
  });

  // POST /change-password
  fastify.post('/change-password', {
    preHandler: requireRole('admin', 'viewer'),
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        additionalProperties: false,
        properties: {
          currentPassword: { type: 'string', maxLength: 256 },
          newPassword: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const userId = (req as any).user.id;

    const user = db.prepare('SELECT id, email, password_hash, role, must_change_password FROM users WHERE id = ?')
      .get(userId) as any;

    let validCurrent = false;
    try {
      validCurrent = await argon2.verify(user.password_hash, currentPassword);
    } catch {
      validCurrent = false;
    }

    if (!validCurrent) {
      audit(userId, 'change-password', null, req.ip, false, 'Current password incorrect');
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }

    const problem = validatePassword(newPassword);
    if (problem) {
      return reply.code(400).send({ error: problem });
    }

    if (newPassword === currentPassword) {
      return reply.code(400).send({ error: 'Choose a different password from your current one.' });
    }

    const newHash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(newHash, userId);

    audit(userId, 'change-password', null, req.ip, true, 'Password changed successfully');
    setSessionCookies(fastify, reply, { ...user, must_change_password: 0 });

    return { ok: true, success: true };
  });

  // GET /me
  fastify.get('/me', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = (req.cookies as any)?.asva_session || (req.cookies as any)?.asva_token;
    if (!token) {
      return { authenticated: false, role: 'viewer' };
    }

    try {
      const decoded = (fastify as any).jwt.verify(token);
      const userId = decoded.sub || decoded.id;
      const user = db.prepare('SELECT id, email, role, must_change_password FROM users WHERE id = ? AND active = 1')
        .get(userId) as any;

      if (!user) {
        return { authenticated: false, role: 'viewer' };
      }

      return {
        authenticated: true,
        role: user.role,
        mustChangePassword: user.must_change_password === 1,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch {
      return { authenticated: false, role: 'viewer' };
    }
  });
}
