import aedesFactory from 'aedes';
import { createServer, Server } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { db } from '../db/db.js';
import { config } from '../config.js';

export let embeddedBrokerServer: Server | null = null;
export let aedesInstance: any = null;

const DEVICE_ID = /^[a-z0-9][a-z0-9-]{2,31}$/;
type Ctx = { role?: 'hub' | 'device'; deviceId?: string };
const ctx = (c: unknown) => c as Ctx;

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

function reject(done: (err: Error | null, ok: boolean) => void) {
  done(Object.assign(new Error('Bad credentials'), { returnCode: 4 }), false);
}

// Small per-device message budget: 20 messages per 10 seconds.
const budget = new Map<string, { count: number; resetAt: number }>();
function withinBudget(id: string): boolean {
  const now = Date.now();
  const b = budget.get(id);
  if (!b || now > b.resetAt) {
    budget.set(id, { count: 1, resetAt: now + 10_000 });
    return true;
  }
  return ++b.count <= 20;
}

export function startEmbeddedBroker(port = config.mqttPort): Promise<boolean> {
  return new Promise((resolve) => {
    const aedes = (aedesFactory as any)({
      id: 'asva-hub',
      connectTimeout: 5000,
      maxClientsIdLength: 64,
    });
    aedesInstance = aedes;

    // Authentication
    aedes.authenticate = (client: any, username: any, password: any, done: any) => {
      (async () => {
        const user = username ? username.toString() : '';
        const pass = password ? password.toString() : '';

        // 1) Internal hub client / simulator using hub credentials
        if (user === config.mqttUsername && safeEqual(pass, config.mqttPassword)) {
          ctx(client).role = 'hub';
          return done(null, true);
        }

        // 2) Registered device: username must equal client ID and match device ID format
        if (!DEVICE_ID.test(user) || client.id !== user) {
          return reject(done);
        }

        const row = db.prepare('SELECT mqtt_pass_hash, enabled FROM devices WHERE id = ?')
          .get(user) as { mqtt_pass_hash: string; enabled: number } | undefined;
        if (!row || row.enabled === 0) {
          return reject(done);
        }

        const ok = row.mqtt_pass_hash ? await argon2.verify(row.mqtt_pass_hash, pass).catch(() => false) : false;
        if (!ok) {
          return reject(done);
        }

        ctx(client).role = 'device';
        ctx(client).deviceId = user;
        done(null, true);
      })().catch(() => reject(done));
    };

    // Authorize Publish
    aedes.authorizePublish = (client: any, packet: any, done: any) => {
      if (!client) return done(null); // published by broker process itself
      const c = ctx(client);
      if (c.role === 'hub') return done(null);

      const id = c.deviceId;
      if (!id) return done(new Error('Unauthenticated client'));

      const allowed = [`asva/${id}/status`, `asva/${id}/event`, `asva/${id}/ack`, `asva/${id}/online`];
      if (!allowed.includes(packet.topic)) {
        return done(new Error('Topic not allowed for device'));
      }
      if (packet.payload.length > 2048) {
        return done(new Error('Payload too large'));
      }
      if (!withinBudget(id)) {
        return done(new Error('Rate limit exceeded'));
      }
      done(null);
    };

    // Authorize Subscribe
    aedes.authorizeSubscribe = (client: any, sub: any, done: any) => {
      const c = ctx(client);
      if (c.role === 'hub') return done(null, sub);
      if (c.deviceId && sub.topic === `asva/${c.deviceId}/cmd`) {
        return done(null, sub); // devices may only listen on their own commands topic
      }
      done(new Error('Subscription not allowed for device'));
    };

    const server = createServer(aedes.handle);
    server.maxConnections = 50;

    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[MQTT Broker] Port ${port} is already in use (external Mosquitto broker active). Using external broker.`);
      } else {
        console.warn(`[MQTT Broker] Failed to bind port ${port}:`, err.message);
      }
      resolve(false);
    });

    server.listen(port, config.mqttHost, () => {
      console.log(`[MQTT Broker] Embedded Aedes broker listening on ${config.mqttHost}:${port} (authenticated)`);
      embeddedBrokerServer = server;
      resolve(true);
    });
  });
}
