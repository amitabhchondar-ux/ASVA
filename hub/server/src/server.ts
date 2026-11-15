import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { db, initDatabase, runDataRetention } from './db/db.js';
import { startEmbeddedBroker } from './mqtt/broker.js';
import { initMqttClient } from './mqtt/client.js';
import { registerWsClient, broadcastWs } from './ws/wsHandler.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { eventRoutes } from './routes/events.js';
import { sessionRoutes } from './routes/sessions.js';
import { userRoutes } from './routes/users.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OFFLINE_TIMEOUT_SECONDS = 30;

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
  // 1. Initialise database (schema, migrations, first admin)
  await initDatabase();

  // 2. Start embedded MQTT broker with per-device authentication & ACL
  await startEmbeddedBroker(config.mqttPort);

  // 3. Connect hub's internal MQTT client
  initMqttClient();

  // 4. Build Fastify application with security plugins
  const fastify = Fastify({
    bodyLimit: 64 * 1024, // 64 KB limit
    trustProxy: false,
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.mqttPassword',
        ],
        censor: '[redacted]',
      },
    },
  });

  // Helmet Security Headers
  await fastify.register(helmet, {
    strictTransportSecurity: config.cookieSecure,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // CORS - Exact origin matching
  await fastify.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // Global Rate Limiting
  await fastify.register(rateLimit, {
    global: true,
    max: config.apiRateMax,
    timeWindow: config.apiRateWindow,
  });

  // Cookie Plugin
  await fastify.register(cookie);

  // JWT Plugin
  await fastify.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'asva_session', signed: false },
    sign: { algorithm: 'HS256', expiresIn: config.jwtExpiresIn },
    verify: { algorithms: ['HS256'] },
  });

  // WebSocket Plugin
  await fastify.register(fastifyWebsocket, {
    options: { maxPayload: 4 * 1024 }, // 4 KB max incoming frame
  });

  // CSRF Defense in depth for state-changing requests
  fastify.addHook('onRequest', async (req, reply) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && !config.corsOrigins.includes(origin)) {
        return reply.code(403).send({ error: 'Origin not allowed' });
      }
    }
  });

  // Generic error handler to prevent internal stack leak
  fastify.setErrorHandler((err: any, req, reply) => {
    req.log.error({ err }, 'Request failed');
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? 'Internal server error' : err.message });
  });

  // WebSocket live feed endpoint
  fastify.get('/ws', { websocket: true }, (connection: any, req: any) => {
    const socket = connection.socket || connection;
    const origin = req.headers.origin;
    if (origin && !config.corsOrigins.includes(origin)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }

    // Inspect session cookie
    let user: any = undefined;
    const token = req.cookies?.asva_session || req.cookies?.asva_token;
    if (token) {
      try {
        const decoded = (fastify as any).jwt.verify(token);
        const userId = decoded.sub || decoded.id;
        user = db.prepare('SELECT id, email, role FROM users WHERE id = ? AND active = 1').get(userId);
      } catch {}
    }

    registerWsClient(socket, user);
  });

  // Register API Routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(deviceRoutes, { prefix: '/api/devices' });
  await fastify.register(eventRoutes, { prefix: '/api/events' });
  await fastify.register(sessionRoutes, { prefix: '/api/sessions' });
  await fastify.register(userRoutes, { prefix: '/api/users' });

  // Serve static UI assets
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

  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'healthy', timestamp: Math.floor(Date.now() / 1000) };
  });

  // Background Timers: device offline monitoring & data retention
  setInterval(markOfflineDevices, 5000);
  setInterval(runDataRetention, 24 * 3600 * 1000);

  // Start HTTP and WebSocket server
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`\n======================================================`);
    console.log(`  ASVA Hub Server running on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    console.log(`  WebSocket live link: ws://localhost:${config.port}/ws`);
    console.log(`  MQTT Broker listening on ${config.mqttHost}:${config.mqttPort} (authenticated)`);
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
