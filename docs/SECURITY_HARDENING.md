# ASVA Security Hardening Guide

A step-by-step guide to closing the security gaps found in the ASVA review, with copy-ready code and tests to prove each fix works.

> **Read this first**
> - The code below is written for **Fastify 5 + TypeScript + Node 24 + `node:sqlite` + Aedes**, matching what your README describes. I could not see your source, so file names and variable names are suggestions. **Adapt them to your structure** and keep your own naming.
> - Package APIs change between major versions. After pasting, run the project and the tests in [section 15](#15-verification-tests); they tell you whether it really works.
> - Do the steps **in order**. Sections 1-3 give the biggest safety gain for the least effort.

## Contents

1. [Refuse to start with weak secrets](#1-refuse-to-start-with-weak-secrets)
2. [First-run admin and forced password change](#2-first-run-admin-and-forced-password-change)
3. [Fastify security plugins](#3-fastify-security-plugins)
4. [Login, logout and password change routes](#4-login-logout-and-password-change-routes)
5. [Role-based access on the server](#5-role-based-access-on-the-server)
6. [Authenticated WebSocket](#6-authenticated-websocket)
7. [MQTT broker: authentication and topic ACL](#7-mqtt-broker-authentication-and-topic-acl)
8. [Validate everything that comes in](#8-validate-everything-that-comes-in)
9. [SQL safety and data retention](#9-sql-safety-and-data-retention)
10. [CSV export safety](#10-csv-export-safety)
11. [Logging and error handling](#11-logging-and-error-handling)
12. [Firmware hardening](#12-firmware-hardening)
13. [Secrets in git history](#13-secrets-in-git-history)
14. [GitHub repository settings](#14-github-repository-settings)
15. [Verification tests](#15-verification-tests)
16. [Pre-demo checklist](#16-pre-demo-checklist)

### Packages to install (hub/server)

```bash
cd hub/server
npm install argon2 @fastify/helmet @fastify/rate-limit @fastify/cors @fastify/cookie @fastify/jwt @fastify/websocket
```
Use the versions that match your installed Fastify major version. If a plugin refuses to load, check its README for the compatible Fastify version.

### Root `package.json` scripts

Add the bootstrap command and call it from setup so every install gets random secrets:

```json
{
  "scripts": {
    "bootstrap": "node scripts/bootstrap-env.mjs",
    "setup": "<your existing setup command> && npm run bootstrap"
  }
}
```
In `setup.sh` and `setup.bat`, add `node scripts/bootstrap-env.mjs` as the last step.

---

## 1. Refuse to start with weak secrets

**Problem:** a server that boots with an empty or example `JWT_SECRET` lets anyone forge a login cookie.
**Fix:** validate configuration at startup and exit with a clear message.

`hub/server/src/config.ts`

```ts
import { existsSync } from 'node:fs';

// Values that must never be accepted as real secrets.
const PLACEHOLDER = /^(|change[-_ ]?me.*|admin123|password|secret|test|example|todo|xxx+)$/i;

function readSecret(name: string, minLength: number): string {
  const value = (process.env[name] ?? '').trim();
  if (PLACEHOLDER.test(value) || value.length < minLength) {
    throw new Error(
      `${name} is missing, a placeholder, or shorter than ${minLength} characters.\n` +
      `Run "npm run bootstrap" to generate secure values in hub/.env.`,
    );
  }
  return value;
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === '' ? fallback : Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return n;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? '').toLowerCase();
  if (raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be "true" or "false".`);
}

function load() {
  const nodeEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:8080')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (corsOrigins.includes('*')) throw new Error('CORS_ORIGIN must not contain "*".');

  return {
    nodeEnv,
    logLevel: process.env.LOG_LEVEL ?? 'info',
    host: process.env.HOST ?? '0.0.0.0',
    port: readInt('PORT', 8080, 1, 65535),
    corsOrigins,
    jwtSecret: readSecret('JWT_SECRET', 32),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '2h',
    cookieSecure: readBool('COOKIE_SECURE', false),
    adminEmail: (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase(),
    adminPassword: readSecret('ADMIN_PASSWORD', 12),
    loginRateMax: readInt('LOGIN_RATE_MAX', 5, 1, 1000),
    loginRateWindow: process.env.LOGIN_RATE_WINDOW ?? '1 minute',
    apiRateMax: readInt('API_RATE_MAX', 300, 1, 100000),
    apiRateWindow: process.env.API_RATE_WINDOW ?? '1 minute',
    dbPath: process.env.DB_PATH ?? './data/asva.db',
    mqttHost: process.env.MQTT_HOST ?? '0.0.0.0',
    mqttPort: readInt('MQTT_PORT', 1883, 1, 65535),
    mqttUsername: process.env.MQTT_USERNAME ?? 'hub',
    mqttPassword: readSecret('MQTT_PASSWORD', 16),
    maxDevices: readInt('MAX_DEVICES', 20, 1, 1000),
  } as const;
}

export type Config = ReturnType<typeof load>;

export const config: Config = (() => {
  try {
    return load();
  } catch (err) {
    console.error('\nConfiguration error:\n' + (err as Error).message + '\n');
    process.exit(1);
  }
})();
```

If you run Node with `--env-file=hub/.env` (Node 20.6+) or a library such as `dotenv`, keep whichever you use now; just make sure it loads **before** `config.ts` is imported.

---

## 2. First-run admin and forced password change

**Problem:** a fixed `admin@example.com` / `admin123` account.
**Fix:** create the first admin from `ADMIN_PASSWORD` (random after `npm run bootstrap`), only when no users exist, and force a password change at first login.

### Schema

```ts
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    email                TEXT NOT NULL UNIQUE,
    password_hash        TEXT NOT NULL,
    role                 TEXT NOT NULL CHECK (role IN ('admin','viewer')),
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at           INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS devices (
    id             TEXT PRIMARY KEY CHECK (length(id) BETWEEN 3 AND 32),
    label          TEXT NOT NULL DEFAULT '',
    mqtt_pass_hash TEXT NOT NULL,
    enabled        INTEGER NOT NULL DEFAULT 1,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      INTEGER NOT NULL DEFAULT (unixepoch()),
    user_id INTEGER,
    action  TEXT NOT NULL,
    target  TEXT,
    ip      TEXT,
    ok      INTEGER NOT NULL DEFAULT 1
  );
`);
```
(Keep your existing tables; add only what is missing.)

### Hashing and password rules

```ts
import argon2 from 'argon2';

// OWASP-recommended minimum for argon2id: 19 MiB memory, 2 iterations, 1 lane.
export const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (plain: string) => argon2.hash(plain, HASH_OPTIONS);

export function validatePassword(pw: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 256) return 'Password is too long.';
  if (/^(.)\1+$/.test(pw)) return 'Password cannot be a single repeated character.';
  const common = ['password1234', '123456789012', 'qwertyuiop12', 'admin1234567'];
  if (common.includes(pw.toLowerCase())) return 'Password is too common.';
  return null; // OK
}
```

### Create the first admin (once)

```ts
export async function ensureFirstAdmin() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (row.n > 0) return;
  const hash = await hashPassword(config.adminPassword);
  db.prepare(
    'INSERT INTO users (email, password_hash, role, must_change_password) VALUES (?, ?, ?, 1)',
  ).run(config.adminEmail, hash, 'admin');
  console.log(`First admin created: ${config.adminEmail} (password change required at first login).`);
}
```
Call `await ensureFirstAdmin()` once during startup. **Remove any seed or migration that inserts a fixed `admin123` user.**

---

## 3. Fastify security plugins

`hub/server/src/app.ts`

```ts
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { config } from './config.js';

export async function buildApp() {
  const app = Fastify({
    bodyLimit: 64 * 1024, // 64 KB: nothing in ASVA needs bigger JSON bodies
    trustProxy: false,    // set to true ONLY if you put a reverse proxy in front
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
        ],
        censor: '[redacted]',
      },
    },
  });

  await app.register(helmet, {
    // HSTS only makes sense (and only works) over HTTPS.
    strictTransportSecurity: config.cookieSecure,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind/Three.js inline styles; tighten if you can
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],   // WebSocket to the same host
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // keep false unless you verified the 3D assets still load
  });

  await app.register(cors, {
    origin: config.corsOrigins, // exact list, never '*'
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  await app.register(rateLimit, {
    global: true,
    max: config.apiRateMax,
    timeWindow: config.apiRateWindow,
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'asva_session', signed: false },
    sign: { algorithm: 'HS256', expiresIn: config.jwtExpiresIn },
    verify: { algorithms: ['HS256'] }, // pin the algorithm
  });

  // CSRF defence in depth (the cookie is already SameSite=Strict):
  // reject state-changing requests that come from a different origin.
  app.addHook('onRequest', async (req, reply) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && !config.corsOrigins.includes(origin)) {
        return reply.code(403).send({ error: 'Origin not allowed' });
      }
    }
  });

  // Generic error handler: never leak stack traces to clients.
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'request failed');
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? 'Internal server error' : err.message });
  });

  return app;
}
```

**If the 3D page goes blank after enabling CSP:** open the browser console (F12), read the `Content-Security-Policy` violation, and loosen only that one directive. Do not remove the CSP entirely.

---

## 4. Login, logout and password change routes

```ts
import argon2 from 'argon2';
import { db, HASH_OPTIONS, hashPassword, validatePassword } from './db.js';
import { config } from './config.js';

type UserRow = { id: number; email: string; password_hash: string; role: 'admin' | 'viewer'; must_change_password: number };

// Hash of a throwaway string: lets us do the same amount of work whether or not
// the email exists, so response time does not reveal which emails are registered.
const DUMMY_HASH = await argon2.hash('timing-equaliser-not-a-real-password', HASH_OPTIONS);

const sessionSeconds = 2 * 60 * 60; // keep in sync with JWT_EXPIRES_IN

function audit(userId: number | null, action: string, target: string | null, ip: string, ok: boolean) {
  db.prepare('INSERT INTO audit_log (user_id, action, target, ip, ok) VALUES (?,?,?,?,?)')
    .run(userId, action, target, ip, ok ? 1 : 0);
}

function setSession(app: FastifyInstance, reply: FastifyReply, user: UserRow) {
  const token = app.jwt.sign({ sub: String(user.id) }); // role is NOT in the token; it is read from the DB
  reply.setCookie('asva_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/',
    maxAge: sessionSeconds,
  });
}

app.post('/auth/login', {
  config: { rateLimit: { max: config.loginRateMax, timeWindow: config.loginRateWindow } },
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
}, async (req, reply) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = db.prepare(
    'SELECT id, email, password_hash, role, must_change_password FROM users WHERE email = ?',
  ).get(email.trim().toLowerCase()) as UserRow | undefined;

  const valid = await argon2.verify(user?.password_hash ?? DUMMY_HASH, password).catch(() => false);
  if (!user || !valid) {
    audit(user?.id ?? null, 'login', null, req.ip, false);
    return reply.code(401).send({ error: 'Invalid email or password' }); // same message for both cases
  }

  audit(user.id, 'login', null, req.ip, true);
  setSession(app, reply, user);
  return { ok: true, role: user.role, mustChangePassword: user.must_change_password === 1 };
});

app.post('/auth/logout', async (_req, reply) => {
  reply.clearCookie('asva_session', { path: '/' });
  return { ok: true };
});

app.post('/auth/change-password', {
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
}, async (req, reply) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const id = Number((req.user as { sub: string }).sub);
  const user = db.prepare('SELECT id, email, password_hash, role, must_change_password FROM users WHERE id = ?')
    .get(id) as UserRow;

  if (!(await argon2.verify(user.password_hash, currentPassword).catch(() => false))) {
    audit(id, 'change-password', null, req.ip, false);
    return reply.code(401).send({ error: 'Current password is incorrect' });
  }
  const problem = validatePassword(newPassword);
  if (problem) return reply.code(400).send({ error: problem });
  if (newPassword === currentPassword) return reply.code(400).send({ error: 'Choose a different password.' });

  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(await hashPassword(newPassword), id);
  audit(id, 'change-password', null, req.ip, true);
  setSession(app, reply, user); // fresh token
  return { ok: true };
});
```
Add the missing imports (`FastifyInstance`, `FastifyReply`) from `fastify`.

**Frontend:** when `/auth/login` returns `mustChangePassword: true`, show only the change-password screen until it succeeds. The server enforces this too (next section), so the UI is a convenience, not the security control.

---

## 5. Role-based access on the server

**Problem:** hiding buttons in the UI does not stop a viewer from calling the API directly.
**Fix:** one reusable guard, applied to every protected route. The role is read from the database on each request, so demoting or deleting a user takes effect immediately.

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';

export function requireRole(...roles: Array<'admin' | 'viewer'>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify(); // reads the cookie configured above
    } catch {
      return reply.code(401).send({ error: 'Not signed in' });
    }
    const row = db.prepare('SELECT role, must_change_password FROM users WHERE id = ?')
      .get(Number((req.user as { sub: string }).sub)) as { role: 'admin' | 'viewer'; must_change_password: number } | undefined;

    if (!row) return reply.code(401).send({ error: 'Account no longer exists' });
    if (!roles.includes(row.role)) {
      audit(Number((req.user as { sub: string }).sub), 'forbidden', req.url, req.ip, false);
      return reply.code(403).send({ error: 'Not allowed for your role' });
    }
    if (row.must_change_password && req.routeOptions.url !== '/auth/change-password') {
      return reply.code(403).send({ error: 'Password change required' });
    }
    (req as FastifyRequest & { role: string }).role = row.role;
  };
}
```

Apply it like this:

| Route type | Guard |
|---|---|
| Read devices, events, sessions | `requireRole('admin', 'viewer')` |
| Send LED / threshold / status commands | `requireRole('admin')` |
| Create or delete devices, create users | `requireRole('admin')` |
| Flag an event as wrong | `requireRole('admin')` (or both, your choice, but decide deliberately) |
| Start an evaluation session | `requireRole('admin')` |
| CSV export | `requireRole('admin', 'viewer')` |

```ts
app.post('/api/devices/:id/command', { preHandler: requireRole('admin'), schema: commandSchema }, handler);
app.get('/api/events',               { preHandler: requireRole('admin', 'viewer') }, handler);
```

Also add an explicit **deny by default** habit: when you add a new route, add its guard in the same commit. A short test (section 15, test 10) loops over all routes as a viewer and checks that write routes return 403.

---

## 6. Authenticated WebSocket

**Problem:** a WebSocket that accepts anyone broadcasts live events to strangers and may accept commands from them.
**Fix:** authenticate and check the Origin **before** the upgrade, limit connections, and treat any message from the browser as untrusted.

```ts
import websocket from '@fastify/websocket';
await app.register(websocket, { options: { maxPayload: 4 * 1024 } }); // 4 KB max incoming frame

const socketsByUser = new Map<number, Set<import('ws').WebSocket>>();
const MAX_SOCKETS_PER_USER = 5;

app.get('/ws', {
  websocket: true,
  preValidation: async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin || !config.corsOrigins.includes(origin)) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }
    await requireRole('admin', 'viewer')(req, reply);
  },
}, (socket, req) => {
  const userId = Number((req.user as { sub: string }).sub);
  const role = (req as unknown as { role: 'admin' | 'viewer' }).role;

  const set = socketsByUser.get(userId) ?? new Set();
  if (set.size >= MAX_SOCKETS_PER_USER) { socket.close(1008, 'Too many connections'); return; }
  set.add(socket); socketsByUser.set(userId, set);
  socket.on('close', () => set.delete(socket));

  // Server -> browser: use the same `broadcast()` you already have, but only to sockets in these sets.

  // Browser -> server: ignore everything except a small allow-list.
  socket.on('message', (raw) => {
    let msg: { type?: string };
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'ping') { socket.send('{"type":"pong"}'); return; }
    if (msg.type === 'command' && role !== 'admin') {
      socket.send(JSON.stringify({ type: 'error', error: 'Not allowed for your role' }));
      return;
    }
    // Route commands through the SAME validated function your REST route uses.
  });
});
```
Regenerate your broadcast function so it iterates `socketsByUser`, not a global list of every socket ever opened.

**Browser side:** connect with `new WebSocket('ws://' + location.host + '/ws')` (use `wss://` when on HTTPS). The session cookie is sent automatically. Do **not** put tokens in the URL.

---

## 7. MQTT broker: authentication and topic ACL

**Problem:** an open broker on port 1883 lets anyone on the Wi-Fi turn your LED on or off, read events, or impersonate a device.
**Fix:** require credentials, bind each device to its own topics, and limit message size and rate.

### Create a device and its credential (admin-only route)

```ts
import { randomBytes } from 'node:crypto';

app.post('/api/devices', {
  preHandler: requireRole('admin'),
  schema: {
    body: {
      type: 'object', required: ['id'], additionalProperties: false,
      properties: {
        id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{2,31}$' },
        label: { type: 'string', maxLength: 64 },
      },
    },
  },
}, async (req, reply) => {
  const { id, label = '' } = req.body as { id: string; label?: string };
  const count = (db.prepare('SELECT COUNT(*) AS n FROM devices').get() as { n: number }).n;
  if (count >= config.maxDevices) return reply.code(409).send({ error: 'Device limit reached' });

  const password = randomBytes(18).toString('base64url');         // 24 chars
  try {
    db.prepare('INSERT INTO devices (id, label, mqtt_pass_hash) VALUES (?,?,?)')
      .run(id, label, await hashPassword(password));
  } catch {
    return reply.code(409).send({ error: 'Device ID already exists' });
  }
  audit(Number((req.user as { sub: string }).sub), 'create-device', id, req.ip, true);
  // The plaintext password is shown ONCE. Only the hash is stored.
  return reply.code(201).send({ id, mqttUsername: id, mqttPassword: password });
});
```
Also add `DELETE /api/devices/:id` (admin-only) and a "rotate credential" route so a lost device can be locked out.

### Broker setup with authentication and ACL

`hub/server/src/mqtt/broker.ts`

```ts
import Aedes from 'aedes';
import { createServer } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { db } from '../db.js';
import { config } from '../config.js';

// Aedes 0.5x: `new Aedes(opts)`. Aedes 1.x: `await Aedes.createBroker(opts)`. Use whichever your version documents.
const aedes = new Aedes({
  id: 'asva-hub',
  connectTimeout: 5000,       // drop clients that connect but never authenticate
  maxClientsIdLength: 64,
});

const DEVICE_ID = /^[a-z0-9][a-z0-9-]{2,31}$/;
type Ctx = { role?: 'hub' | 'device'; deviceId?: string };
const ctx = (c: unknown) => c as Ctx;

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}
function reject(done: (err: Error | null, ok: boolean) => void) {
  // MQTT CONNACK return code 4 = bad user name or password
  done(Object.assign(new Error('Bad credentials'), { returnCode: 4 }), false);
}

aedes.authenticate = (client, username, password, done) => {
  (async () => {
    const user = username ?? '';
    const pass = password ? password.toString() : '';

    // 1) the hub's own internal client (used by tooling / simulator in development)
    if (user === config.mqttUsername && safeEqual(pass, config.mqttPassword)) {
      ctx(client).role = 'hub';
      return done(null, true);
    }

    // 2) a registered device: username must equal its client ID and its device ID
    if (!DEVICE_ID.test(user) || client.id !== user) return reject(done);
    const row = db.prepare('SELECT mqtt_pass_hash FROM devices WHERE id = ? AND enabled = 1')
      .get(user) as { mqtt_pass_hash: string } | undefined;
    const ok = row ? await argon2.verify(row.mqtt_pass_hash, pass).catch(() => false) : false;
    if (!ok) return reject(done);

    ctx(client).role = 'device';
    ctx(client).deviceId = user;
    done(null, true);
  })().catch(() => reject(done));
};

// Small per-device message budget: 20 messages per 10 seconds.
const budget = new Map<string, { count: number; resetAt: number }>();
function withinBudget(id: string): boolean {
  const now = Date.now();
  const b = budget.get(id);
  if (!b || now > b.resetAt) { budget.set(id, { count: 1, resetAt: now + 10_000 }); return true; }
  return ++b.count <= 20;
}

aedes.authorizePublish = (client, packet, done) => {
  if (!client) return done(null);                       // published by the broker process itself
  const c = ctx(client);
  if (c.role === 'hub') return done(null);

  const id = c.deviceId!;
  const allowed = [`asva/${id}/status`, `asva/${id}/event`, `asva/${id}/ack`, `asva/${id}/online`];
  if (!allowed.includes(packet.topic)) return done(new Error('Topic not allowed'));
  if (packet.payload.length > 2048) return done(new Error('Payload too large'));
  if (!withinBudget(id)) return done(new Error('Rate limit'));
  done(null);
};

aedes.authorizeSubscribe = (client, sub, done) => {
  const c = ctx(client);
  if (c.role === 'hub') return done(null, sub);
  if (sub.topic === `asva/${c.deviceId}/cmd`) return done(null, sub); // devices may only read their own commands
  done(new Error('Subscription not allowed'));
};

export function startBroker() {
  const server = createServer(aedes.handle);
  server.maxConnections = 50;
  server.listen(config.mqttPort, config.mqttHost, () => {
    console.log(`MQTT broker listening on ${config.mqttHost}:${config.mqttPort} (authenticated)`);
  });
  return { aedes, server };
}
```

**Notes**
- Messages the hub publishes itself through `aedes.publish(...)` (for example commands to a device) do not pass through `authorizePublish`, which is what you want.
- The firmware must set the MQTT **client ID** and **username** to the same device ID, and use the password shown when the device was created.
- The simulator can either register as a normal device (recommended) or use the `hub` credential (acceptable only in local development).
- Test the three callbacks with your exact Aedes version (section 15, tests 8-9): small API differences between versions are common.

### Validate what devices publish

Even an authenticated device could send garbage. Validate in the handler that stores events (next section) and drop anything that does not match.

### Bind to a specific interface if you can

If the hub runs on a laptop with Ethernet and Wi-Fi, set `MQTT_HOST` to the Wi-Fi interface's IP instead of `0.0.0.0`, so the broker is not offered on networks you did not intend.

---

## 8. Validate everything that comes in

### REST

Every route needs a `schema` for `body`, `querystring` and `params`, with `additionalProperties: false` and length limits. Example for a search endpoint:

```ts
app.get('/api/events', {
  preHandler: requireRole('admin', 'viewer'),
  schema: {
    querystring: {
      type: 'object', additionalProperties: false,
      properties: {
        q:      { type: 'string', maxLength: 64 },
        device: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{2,31}$' },
        limit:  { type: 'integer', minimum: 1, maximum: 500, default: 100 },
        offset: { type: 'integer', minimum: 0, maximum: 1000000, default: 0 },
      },
    },
  },
}, handler);
```

### MQTT events from devices

Hand-written, dependency-free validator for the event format in the README:

```ts
export type AsvaEvent = { kind: 'wake' | 'command'; text: string; conf: number; latency_ms: number; ts: number };

const ALLOWED_TEXT = new Set(['Hello ASVA', 'Light on', 'Light off', 'Status']);

export function parseEvent(payload: Buffer): AsvaEvent | null {
  if (payload.length === 0 || payload.length > 512) return null;
  let o: unknown;
  try { o = JSON.parse(payload.toString('utf8')); } catch { return null; }
  if (typeof o !== 'object' || o === null) return null;
  const e = o as Record<string, unknown>;

  if (e.kind !== 'wake' && e.kind !== 'command') return null;
  if (typeof e.text !== 'string' || !ALLOWED_TEXT.has(e.text)) return null;      // fixed vocabulary only
  if (typeof e.conf !== 'number' || !(e.conf >= 0 && e.conf <= 1)) return null;
  if (!Number.isInteger(e.latency_ms) || (e.latency_ms as number) < 0 || (e.latency_ms as number) > 60_000) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(e.ts) || Math.abs((e.ts as number) - now) > 86_400 * 365) return null; // sane timestamp

  return { kind: e.kind, text: e.text, conf: e.conf, latency_ms: e.latency_ms as number, ts: e.ts as number };
}
```
Restricting `text` to the known command set also guarantees that **free text, and therefore anything resembling overheard speech, can never be stored** (privacy threat P3). If your events carry other fields (`id`, `session`), extend the validator; do not remove checks.

Also validate the **topic's device ID against the authenticated client** before storing: the `<deviceId>` in the topic must equal `client.deviceId`.

### Frontend

- React escapes text by default. **Never** use `dangerouslySetInnerHTML` with event data or device labels.
- Do not build URLs or `innerHTML` from event text in the Three.js labels.

---

## 9. SQL safety and data retention

**Rule:** never build SQL with string concatenation or template literals containing user data.

```ts
// WRONG: vulnerable to SQL injection
db.exec(`SELECT * FROM events WHERE text LIKE '%${q}%'`);

// RIGHT: parameterised
db.prepare('SELECT id, device_id, kind, text, conf, latency_ms, ts FROM events WHERE text LIKE ? ESCAPE \'\\\' ORDER BY ts DESC LIMIT ? OFFSET ?')
  .all(`%${escapeLike(q)}%`, limit, offset);

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');
```
Sorting columns and table names cannot be parameters. If you let the user choose a sort column, map it through an allow-list:

```ts
const SORTABLE = { time: 'ts', confidence: 'conf', latency: 'latency_ms' } as const;
const col = SORTABLE[req.query.sort as keyof typeof SORTABLE] ?? 'ts';
```

Search your code for risky patterns:

```bash
grep -rnE "db\.(exec|prepare)\(\s*`[^`]*\\$\{" hub/server/src
grep -rnE "(exec|prepare)\([^)]*\+" hub/server/src
```
Any hit needs review.

### Retention (privacy threat P2)

Event history reveals when people were home. Keep it only as long as needed.

```ts
// run daily, e.g. with setInterval(..., 24 * 3600 * 1000)
const days = 90;
db.prepare('DELETE FROM events WHERE ts < unixepoch() - ?').run(days * 86400);
db.prepare('DELETE FROM audit_log WHERE ts < unixepoch() - ?').run(365 * 86400);
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
```
Make `RETENTION_DAYS` an environment variable and show the setting in the Privacy Seal volume.

---

## 10. CSV export safety

**Problem:** if a cell begins with `=`, `+`, `-` or `@`, Excel and Google Sheets may run it as a formula ("CSV injection").
**Fix:** neutralise those cells and use proper quoting.

```ts
export function csvCell(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'bigint') return String(value); // numbers (e.g. -62 dBm) are safe
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;                // neutralise formulas
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`; // RFC 4180 quoting
  return s;
}

app.get('/api/events/export.csv', { preHandler: requireRole('admin', 'viewer') }, async (req, reply) => {
  const rows = db.prepare('SELECT ts, device_id, kind, text, conf, latency_ms, flagged_wrong FROM events ORDER BY ts DESC LIMIT 50000').all();
  const header = 'time,device,kind,text,confidence,latency_ms,flagged_wrong';
  const lines = rows.map((r: any) => [new Date(r.ts * 1000).toISOString(), r.device_id, r.kind, r.text, r.conf, r.latency_ms, r.flagged_wrong].map(csvCell).join(','));
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', 'attachment; filename="asva-events.csv"')
    .header('Cache-Control', 'no-store')
    .send('\uFEFF' + [header, ...lines].join('\r\n')); // BOM helps Excel read UTF-8
});
```
Because section 8 limits `text` to the fixed vocabulary, the risk is already low; keep the sanitiser anyway for device labels and future fields.

---

## 11. Logging and error handling

- Redaction for passwords, cookies and tokens is already configured in section 3. After login, search your log file for the password you typed. It must not appear.
- Never `console.log` request bodies, headers, JWTs or MQTT passwords.
- In `catch` blocks return a generic message; log the detail on the server.
- Audit-log these events: login success/failure, password change, device create/delete/rotate, command sent (who, which device, which command), role/forbidden denials, event flagged wrong, CSV export.
- Set `LOG_LEVEL=info` (not `debug`) when demoing.
- Do not log full IPs forever if privacy matters; the audit retention in section 9 covers this.

---

## 12. Firmware hardening

| Item | What to do |
|---|---|
| **No secrets in git** | Wi-Fi and MQTT passwords come from `menuconfig` only. `firmware/sdkconfig` and `sdkconfig.old` are git-ignored. `sdkconfig.defaults` must contain **placeholders only** (`CONFIG_ASVA_WIFI_PASSWORD=""`) |
| **Per-device credentials** | Each board gets its own MQTT username (= device ID) and password. Do not flash the same password onto every board |
| **Client ID = username** | The broker rejects anything else (section 7) |
| **Minimum Wi-Fi security** | In the Wi-Fi config set `threshold.authmode = WIFI_AUTH_WPA2_PSK` so the board will not join an open or WEP network by accident |
| **TLS for MQTT** (roadmap v1.2) | Use `mqtts://hub:8883` with `.verification.certificate` set to your CA, and enable certificate verification. Never set `skip_cert_common_name_check` in production |
| **No audio on the network** | Keep the I²S buffer in a static RAM ring buffer. Only the event JSON (<512 bytes) is ever passed to `esp_mqtt_client_publish`. Do not add UDP/HTTP/WebSocket code that touches audio buffers |
| **No audio on flash** | Do not mount SPIFFS/LittleFS/SD for recordings. Keep the partition table free of data partitions meant for audio |
| **No secret logging** | Do not `ESP_LOGI` the Wi-Fi password, MQTT password or full payloads at normal log levels. Use `ESP_LOG_NONE` or `WARN` in release builds |
| **Safe actuator state** | GPIO 10 is initialised **low** at boot. A Wi-Fi/MQTT disconnect must not change the output. Only a recognised local command or a valid hub command does |
| **Input checks on `cmd`** | Parse the JSON with a size limit (~256 B); accept only known actions (`led`, `status`, `threshold`) and clamp `threshold` to the valid range |
| **Task safety** | Bound all buffers; check return values; enable the task watchdog; avoid `strcpy`/`sprintf`, use `snprintf` |
| **Flash encryption / secure boot** | Optional and **hard to undo** in release mode (burns eFuses). Try it on a spare board first, following Espressif's documentation. Leave it off for ordinary development boards |
| **Debug interfaces** | For a deployed unit, consider disabling JTAG and the ROM download mode through eFuses (again, irreversible; only for finished units) |
| **Build provenance** | Record the firmware version and git commit in `status` messages so you know which build a device runs |

Quick self-check in the firmware folder:

```bash
grep -rn "publish" firmware/main | grep -v "event\|status\|ack\|online"   # nothing audio-related should show
grep -rniE "password|secret|ssid" firmware --include=*.cpp --include=*.h --include=*.defaults | grep -v "CONFIG_"   # no hard-coded credentials
```

---

## 13. Secrets in git history

Deleting a file does not remove it from history. Check whether anything real was ever committed.

```bash
# 1. Look for the demo password and obvious files
git log --all -p -S'admin123' --oneline
git log --all --full-history --oneline -- hub/.env .env firmware/sdkconfig '*.db' '*.pem' '*.key'

# 2. Scan the whole history with a secret scanner
gitleaks git --redact -v .                       # gitleaks v8.19+; older versions: gitleaks detect --source . --log-opts="--all" --redact -v
trufflehog git file://. --only-verified          # optional second opinion

# 3. List big or suspicious files ever added
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sort -k3 -n -r | head -20
```

**If you find a real secret:**
1. **Rotate it first** (new Wi-Fi password, new JWT secret, new MQTT password). Treat the old one as public.
2. Remove it from history only after rotating:
   ```bash
   pip install git-filter-repo
   git filter-repo --invert-paths --path hub/.env --path firmware/sdkconfig
   git push --force --all && git push --force --tags
   ```
   (Back up the repo first; collaborators must re-clone. Your repo had 0 forks when reviewed, so this is easy now and harder later.)
3. Note it in `CHANGELOG.md` under "Security".

If `admin123` was only a README demo value and you never used it anywhere real, rotation is just "never reuse it". Do not use it on any other account.

---

## 14. GitHub repository settings

Settings → **Code security** (turn everything on):

- [ ] Private vulnerability reporting
- [ ] Dependency graph
- [ ] Dependabot alerts and Dependabot security updates
- [ ] Secret scanning and **push protection** (blocks a commit containing a recognised token)
- [ ] Code scanning (CodeQL), already provided by `.github/workflows/security.yml`

Settings → **Branches** → add a rule for `main`:

- [ ] Require a pull request before merging (even if you are the only developer, it gives you CI runs and a history)
- [ ] Require status checks to pass: `CI / server`, `CI / web`, `Security / codeql`
- [ ] Block force pushes and deletion
- [ ] Require conversation resolution

Account level:

- [ ] Two-factor authentication on your GitHub account
- [ ] SSH or passkeys instead of passwords

---

## 15. Verification tests

Run these after implementing the fixes. Each has an expected result. Tick them as you go, and keep the output as proof for your report.

Replace `localhost:8080` and credentials with yours. `jq` and `curl` are assumed; the MQTT tests use `mosquitto-clients` (`sudo apt install mosquitto-clients`, `brew install mosquitto`, or on Windows install Mosquitto) or `npx mqtt` as an alternative.

**1. Refuses to start without secrets**
```bash
mv hub/.env hub/.env.bak
npm start
```
Expected: exits immediately with "Configuration error: JWT_SECRET is missing...". Restore with `mv hub/.env.bak hub/.env`.

**2. Refuses placeholder secrets**
```bash
JWT_SECRET=CHANGE_ME npm start
```
Expected: same error. Also try `ADMIN_PASSWORD=admin123`.

**3. Login rate limit**
```bash
for i in $(seq 1 8); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"a@b.co","password":"wrongwrongwrong"}'; done
```
Expected: `401` for the first five, then `429`.

**4. No generic error detail on login**
```bash
curl -s -X POST http://localhost:8080/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrongwrongwrong"}'
curl -s -X POST http://localhost:8080/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_ADMIN_EMAIL","password":"wrongwrongwrong"}'
```
Expected: both return exactly `{"error":"Invalid email or password"}`.

**5. Unauthenticated API access refused**
```bash
curl -i http://localhost:8080/api/devices
curl -i http://localhost:8080/api/events
```
Expected: `401`.

**6. Cookie flags**
```bash
curl -i -X POST http://localhost:8080/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_ADMIN_EMAIL","password":"YOUR_PASSWORD"}' | grep -i set-cookie
```
Expected: `asva_session=...; HttpOnly; SameSite=Strict` (and `Secure` if `COOKIE_SECURE=true`).

**7. Security headers**
```bash
curl -sI http://localhost:8080/ | grep -iE "content-security-policy|x-content-type-options|x-frame-options|referrer-policy|cross-origin"
```
Expected: CSP present; `x-content-type-options: nosniff`.

**8. MQTT: anonymous and wrong-password connections rejected**
```bash
mosquitto_pub -h localhost -p 1883 -t asva/test/cmd -m '{}' -d
mosquitto_pub -h localhost -p 1883 -u asva-01 -P wrongpassword -i asva-01 -t asva/asva-01/event -m '{}' -d
```
Expected: "Connection Refused: bad user name or password" (or "not authorised").

**9. MQTT: a device cannot cross into another device's topics**
```bash
# Subscribing to another device: expect a failure code in the SUBACK (128)
mosquitto_sub -h localhost -p 1883 -u asva-01 -P 'DEVICE_PASSWORD' -i asva-01 -t 'asva/asva-02/#' -d -W 5
# Publishing to another device: the hub must show no event for asva-02
mosquitto_pub -h localhost -p 1883 -u asva-01 -P 'DEVICE_PASSWORD' -i asva-01 -t asva/asva-02/cmd -m '{"led":"on"}' -d
```
Expected: subscription refused; command never reaches `asva-02` or the dashboard.

**10. Viewer cannot control devices (REST)**
Create a viewer user, log in as that user storing the cookie, then:
```bash
curl -i -b viewer-cookies.txt -X POST http://localhost:8080/api/devices/asva-01/command \
  -H 'Content-Type: application/json' -d '{"action":"led","value":"on"}'
```
Expected: `403`. Repeat for every write route (create device, delete device, start session).

**11. WebSocket requires login and a valid Origin**
```bash
npx wscat -c ws://localhost:8080/ws
npx wscat -c ws://localhost:8080/ws -H "Origin: http://evil.example" -H "Cookie: asva_session=VALID_COOKIE"
```
Expected: both refused (`401`/`403`). Then log in through the browser and confirm live events still arrive.

**12. CORS and cross-origin POST**
```bash
curl -i -H 'Origin: http://evil.example' http://localhost:8080/api/devices | grep -i access-control
curl -i -X POST -H 'Origin: http://evil.example' -H 'Content-Type: application/json' -d '{}' http://localhost:8080/auth/login
```
Expected: no `Access-Control-Allow-Origin` header; the POST returns `403`.

**13. Oversized body**
```bash
head -c 1000000 /dev/zero | tr '\0' 'a' | curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' --data-binary @-
```
Expected: `413`.

**14. SQL injection probe**
```bash
curl -s -b admin-cookies.txt "http://localhost:8080/api/events?q=%27%20OR%201%3D1%20--" | jq '.length // .'
```
Expected: empty result or `400`, never a list of all events.

**15. CSV injection**
Temporarily store a device label of `=1+1` (or a test event), export the CSV, open it in a text editor.
Expected: the cell reads `'=1+1`, not `=1+1`.

**16. Invalid device messages dropped**
```bash
mosquitto_pub -h localhost -p 1883 -u asva-01 -P 'DEVICE_PASSWORD' -i asva-01 -t asva/asva-01/event -m '{"kind":"command","text":"<script>alert(1)</script>","conf":9,"latency_ms":-5,"ts":0}' -d
```
Expected: nothing appears in the ledger; a warning appears in the hub log.

**17. Secrets not logged**
Log in, then:
```bash
grep -rn "YOUR_PASSWORD" hub/server/*.log 2>/dev/null; echo "exit: $?"
```
Expected: no matches (exit 1).

**18. Dependencies and secrets scans**
```bash
for d in hub/server hub/web hub/simulator; do (cd $d && npm audit --omit=dev --audit-level=high); done
gitleaks git --redact .
```
Expected: no high or critical issues; no leaks.

**19. Privacy: no audio on the network**
Follow [`PRIVACY_VERIFICATION.md`](PRIVACY_VERIFICATION.md) and attach the results.

**20. Automated**
Add the critical checks (3, 5, 8, 10, 11, 13, 15) as automated tests in `hub/server` using `fastify.inject()` and an MQTT client so CI catches regressions.

---

## 16. Pre-demo checklist

Before showing ASVA to anyone:

- [ ] `npm run bootstrap` was used; no `CHANGE_ME` left; `hub/.env` is not in git (`git status` and `git check-ignore hub/.env`)
- [ ] First admin password changed; README contains no real password
- [ ] A **viewer** account exists for observers; you demo with it unless you need commands
- [ ] Each real device has its own credential; the simulator is not using the `hub` credential in "production" mode
- [ ] Ports 8080 and 1883 are **not** forwarded on your router
- [ ] The laptop firewall allows 8080/1883 for the **private** profile only
- [ ] `LOG_LEVEL=info`; no secrets in the terminal you are screen-sharing
- [ ] `git log -p` and gitleaks show no secrets; Dependabot alerts are cleared
- [ ] CI is green on `main`
- [ ] Evaluation table in the README is filled with real numbers
- [ ] Privacy verification screenshots or logs are saved
- [ ] You can explain what is **not** protected (plain HTTP/MQTT on LAN, replayed audio): see `THREAT_MODEL.md`
