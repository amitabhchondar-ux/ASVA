import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database directory & file path
const dbFile = path.resolve(process.cwd(), config.dbPath);
const dataDir = path.dirname(dbFile);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new DatabaseSync(dbFile);

// Pragmas
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

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

export async function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'viewer')) NOT NULL DEFAULT 'viewer',
      must_change_password INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT DEFAULT 'Lab Bench 1',
      firmware_version TEXT DEFAULT '1.0.0',
      mqtt_pass_hash TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_seen_at INTEGER NOT NULL,
      online INTEGER NOT NULL DEFAULT 0,
      led_on INTEGER NOT NULL DEFAULT 0,
      threshold REAL NOT NULL DEFAULT 0.80,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      session_id TEXT,
      kind TEXT CHECK(kind IN ('wake', 'command')) NOT NULL,
      text TEXT NOT NULL,
      confidence REAL NOT NULL,
      latency_ms INTEGER NOT NULL,
      wrong INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id);
    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      device_id TEXT NOT NULL,
      speaker TEXT DEFAULT 'Evaluator',
      distance_m REAL DEFAULT 1.0,
      noise_level TEXT DEFAULT 'Quiet room (~40dB)',
      attempts INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS telemetry (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      heap_bytes INTEGER NOT NULL,
      rssi INTEGER NOT NULL,
      uptime_s INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry(device_id, ts DESC);

    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      phrase TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_target TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      device_id TEXT,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT,
      ip TEXT,
      ok INTEGER NOT NULL DEFAULT 1,
      ts INTEGER NOT NULL
    );
  `);

  // Migrate existing tables if columns are missing
  try {
    const userCols = db.prepare('PRAGMA table_info(users)').all() as any[];
    if (!userCols.some((c) => c.name === 'must_change_password')) {
      db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
    }
  } catch {}

  try {
    const deviceCols = db.prepare('PRAGMA table_info(devices)').all() as any[];
    if (!deviceCols.some((c) => c.name === 'mqtt_pass_hash')) {
      db.exec('ALTER TABLE devices ADD COLUMN mqtt_pass_hash TEXT');
    }
    if (!deviceCols.some((c) => c.name === 'enabled')) {
      db.exec('ALTER TABLE devices ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
    }
  } catch {}

  // Ensure first admin exists with argon2id hash and must_change_password = 1
  await ensureFirstAdmin();

  // Seed sample device if none exists
  const countDevices = db.prepare('SELECT count(*) as count FROM devices').get() as { count: number };
  if (!countDevices || countDevices.count === 0) {
    const now = Math.floor(Date.now() / 1000);
    const defaultMqttHash = await hashPassword(config.mqttPassword);

    db.prepare(`
      INSERT INTO devices (id, name, location, firmware_version, mqtt_pass_hash, enabled, last_seen_at, online, led_on, threshold, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, 1, 0, 0.80, ?)
    `).run('asva-esp32-01', 'ASVA Edge Node Alpha', 'Speech Lab Room 4', '1.0.0-IDF5', defaultMqttHash, now, now);

    db.prepare(`
      INSERT INTO devices (id, name, location, firmware_version, mqtt_pass_hash, enabled, last_seen_at, online, led_on, threshold, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, 1, 0, 0.80, ?)
    `).run('asva-sim-01', 'Virtual Simulator Twin', 'Simulated Environment', '1.0.0-SIM', defaultMqttHash, now, now);

    // Insert sample command mappings
    const insertCmd = db.prepare('INSERT INTO commands (id, device_id, phrase, action_type, action_target) VALUES (?, ?, ?, ?, ?)');
    insertCmd.run('cmd-1', 'asva-esp32-01', 'Light on', 'gpio_high', 'GPIO_10');
    insertCmd.run('cmd-2', 'asva-esp32-01', 'Light off', 'gpio_low', 'GPIO_10');
    insertCmd.run('cmd-3', 'asva-esp32-01', 'Status', 'report_telemetry', 'MQTT_STATUS');

    // Seed sample events
    const insertEvt = db.prepare(`
      INSERT INTO events (id, device_id, session_id, kind, text, confidence, latency_ms, wrong, ts)
      VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?)
    `);
    insertEvt.run('evt-1', 'asva-esp32-01', 'wake', 'Hello ASVA', 0.94, 108, now - 120);
    insertEvt.run('evt-2', 'asva-esp32-01', 'command', 'Light on', 0.91, 142, now - 118);
    insertEvt.run('evt-3', 'asva-esp32-01', 'wake', 'Hello ASVA', 0.96, 95, now - 60);
    insertEvt.run('evt-4', 'asva-esp32-01', 'command', 'Status', 0.89, 130, now - 58);
  }
}

export async function ensureFirstAdmin() {
  const row = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
  if (!row || row.count === 0) {
    const hash = await hashPassword(config.adminPassword);
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, must_change_password, active, created_at)
      VALUES (?, ?, ?, 'admin', 1, 1, ?)
    `).run('user-admin-01', config.adminEmail, hash, now);

    console.log(`[DB] Created first admin user: ${config.adminEmail} (password change required at first login).`);
  } else {
    const admin = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(config.adminEmail) as any;
    if (admin && !admin.password_hash.startsWith('$argon2')) {
      const hash = await hashPassword(config.adminPassword);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, admin.id);
      console.log(`[DB] Upgraded admin user password hash to argon2id.`);
    }
  }
}

export function runDataRetention() {
  const retentionSec = config.retentionDays * 86400;
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM events WHERE ts < ?').run(now - retentionSec);
  db.prepare('DELETE FROM audit_log WHERE ts < ?').run(now - 365 * 86400);
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {}
}
