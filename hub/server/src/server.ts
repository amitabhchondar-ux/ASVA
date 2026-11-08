import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { initDatabase } from './db/db.js';
import { startEmbeddedBroker } from './mqtt/broker.js';
import { initMqttClient } from './mqtt/client.js';
import { registerWsClient, broadcastWs } from './ws/wsHandler.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { eventRoutes } from './routes/events.js';
import { sessionRoutes } from './routes/sessions.js';
import { userRoutes } from './routes/users.js';
import { db } from './db/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'asva-super-secret-hub-jwt-key-2026';
const OFFLINE_TIMEOUT_SECONDS = 30;

function authenticate(request: any, reply: any) {
  const token = request.cookies?.asva_token;
  if (!token) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = db.prepare('SELECT id, email, role, active FROM users WHERE id = ?').get(decoded.id) as any;
    if (!user || user.active === 0) {
      return reply.code(401).send({ error: 'User not found or inactive' });
    }
    request.user = user;
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

async function markOfflineDevices() {
  const now = Math.floor(Date.now() / 1000);
  const stale = db.prepare(`
    SELECT id, name FROM devices
    WHERE online = 1 AND last_seen_at < ?
  `).all(now - OFFLINE_TIMEOUT_SECONDS) as { id: string; name: string }[];

  for (const dev of stale) {
    db.prepare('UPDATE devices SET online = 0 WHERE id = ?').run(dev.id);
    broadcastWs({
      type: 'device.online',
      deviceId: dev.id,
      online: false,
      ts: now,
    });
  }
}

async function main() {
  initDatabase();

  await startEmbeddedBroker(1883);

  initMqttClient();

  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(cookie, {
    secret: JWT_SECRET,
  });

  await fastify.register(fastifyWebsocket);

  fastify.addHook('onRequest', async (request: any, reply: any) => {
    const url = request.routerPath || request.url || '';
    // Only enforce authentication on /api/ endpoints (except /api/auth and /health)
    if (!url.startsWith('/api/')) return;
    if (url.startsWith('/api/auth') || url === '/api/health') return;
    authenticate(request, reply);
  });

  fastify.get('/ws', { websocket: true }, (connection: any, req: any) => {
    const socket = connection.socket || connection;
    // Allow WebSocket streaming for dashboard telemetry and live alerts
    registerWsClient(socket);
  });

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(deviceRoutes, { prefix: '/api/devices' });
  await fastify.register(eventRoutes, { prefix: '/api/events' });
  await fastify.register(sessionRoutes, { prefix: '/api/sessions' });
  await fastify.register(userRoutes, { prefix: '/api/users' });

  const landingPagesDir = path.join(__dirname, '..', '..', 'web', 'public', 'landing-pages');
  if (!fs.existsSync(landingPagesDir)) {
    fs.mkdirSync(landingPagesDir, { recursive: true });
  }

  const webDistDir = path.join(__dirname, '..', '..', 'web', 'dist');
  if (fs.existsSync(webDistDir)) {
    await fastify.register(fastifyStatic, {
      root: webDistDir,
      prefix: '/',
    });
  } else {
    const webPublicDir = path.join(__dirname, '..', '..', 'web', 'public');
    if (fs.existsSync(webPublicDir)) {
      await fastify.register(fastifyStatic, {
        root: webPublicDir,
        prefix: '/',
      });
    }
  }

  fastify.get('/health', async () => {
    return { status: 'healthy', timestamp: Math.floor(Date.now() / 1000) };
  });

  setInterval(markOfflineDevices, 5000);

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n======================================================`);
    console.log(`  ASVA Hub Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`  WebSocket live link: ws://localhost:${PORT}/ws`);
    console.log(`  MQTT Broker listening on port 1883`);
    console.log(`======================================================\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
