/**
 * ASVA Hub Server – Unit Tests
 *
 * Sets all required env vars BEFORE any project module is imported,
 * so config.ts never calls process.exit(1).
 * Uses DB_PATH=:memory: so no file-system state is created.
 * Run via: npm test  (tsx --test --test-force-exit test/server.test.ts)
 */

// ── Environment must be set BEFORE any project import ──────────────────────
process.env['JWT_SECRET']     = 'ci-only-jwt-secret-0123456789abcdef0123456789abcdef';
process.env['ADMIN_PASSWORD'] = 'ci-only-admin-password-123';
process.env['MQTT_PASSWORD']  = 'ci-only-mqtt-password-123';
process.env['DB_PATH']        = ':memory:';
process.env['NODE_ENV']       = 'test';
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { initDatabase, db, hashPassword } from '../src/db/db.js';
import { startEmbeddedBroker, embeddedBrokerServer } from '../src/mqtt/broker.js';

describe('ASVA Hub Server', () => {
  describe('Database', () => {
    it('initializes all required tables', async () => {
      await initDatabase();

      const tables = ['users', 'devices', 'events', 'sessions', 'telemetry', 'commands', 'audit_log'];
      for (const table of tables) {
        const result = db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
          .get(table);
        assert.ok(result, `Table "${table}" should exist`);
      }
    });

    it('seeds default admin user', () => {
      const user = db
        .prepare("SELECT * FROM users WHERE email='admin@example.com'")
        .get() as { role: string; active: number } | undefined;
      assert.ok(user, 'Default admin user should exist');
      assert.strictEqual(user!.role, 'admin');
      assert.strictEqual(user!.active, 1);
    });

    it('hashes passwords with argon2id', async () => {
      const hash = await hashPassword('test-password-ci-123');
      assert.ok(hash.startsWith('$argon2id$'), 'Hash must be an argon2id PHC string');
      assert.notStrictEqual(hash, 'test-password-ci-123', 'Hash must not equal plaintext');
    });
  });

  describe('Embedded MQTT Broker', () => {
    it('starts and binds to an available port', async () => {
      // Port 0 → OS assigns a free ephemeral port; avoids collisions.
      const started = await startEmbeddedBroker(0);
      assert.strictEqual(started, true, 'startEmbeddedBroker() should resolve true');
    });

    after(() => {
      // Close the broker TCP server so it does not keep the process alive.
      // embeddedBrokerServer is set by startEmbeddedBroker() as a module export.
      // We re-import it dynamically so we see the updated reference.
      import('../src/mqtt/broker.js').then(({ embeddedBrokerServer: srv }) => {
        srv?.close();
      }).catch(() => {});
    });
  });
});
