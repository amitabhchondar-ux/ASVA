import { describe, it, assert } from 'node:test';
import { initDatabase, db, hashPassword } from '../src/db/db.js';
import { startEmbeddedBroker } from '../src/mqtt/broker.js';

describe('ASVA Hub Server', () => {
  describe('Database', () => {
    it('initializes all required tables', () => {
      initDatabase();

      const tables = ['users', 'devices', 'events', 'sessions', 'telemetry', 'commands', 'audit_log'];
      for (const table of tables) {
        const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
        assert.ok(result, `Table ${table} should exist`);
      }
    });

    it('seeds default admin user', () => {
      const user = db.prepare("SELECT * FROM users WHERE email='admin@example.com'").get();
      assert.ok(user, 'Default admin should exist');
      assert.equal(user.role, 'admin');
      assert.equal(user.active, 1);
    });

    it('hashes passwords consistently', () => {
      const hash1 = hashPassword('test123');
      const hash2 = hashPassword('test123');
      assert.equal(hash1, hash2, 'Same password should produce same hash');
      assert.notEqual(hash1, 'test123', 'Password should be hashed, not plaintext');
    });

    it('hashes different passwords differently', () => {
      assert.notEqual(hashPassword('aaa'), hashPassword('bbb'));
    });
  });

  describe('Embedded MQTT Broker', () => {
    it('starts and binds to port', async () => {
      const started = await startEmbeddedBroker(1884);
      assert.ok(started, 'Broker should start on available port');
    });
  });
});
