import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'asva.db');
export const db = new DatabaseSync(DB_PATH);

// Pragmas
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'viewer')) NOT NULL DEFAULT 'viewer',
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT DEFAULT 'Lab Bench 1',
      firmware_version TEXT DEFAULT '1.0.0',
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
      detail TEXT,
      ts INTEGER NOT NULL
    );
  `);

  // Seed default admin if no users exist
  const countUsers = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
  if (!countUsers || countUsers.count === 0) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const salt = 'asva_salt_2026';
    const hash = crypto.createHash('sha256').update(adminPassword + salt).digest('hex');
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, active, created_at)
      VALUES (?, ?, ?, 'admin', 1, ?)
    `).run('user-admin-01', adminEmail, hash, Math.floor(Date.now() / 1000));
    console.log(`[DB] Created default admin user: ${adminEmail}`);
  }

  // Seed sample device if none exists
  const countDevices = db.prepare('SELECT count(*) as count FROM devices').get() as { count: number };
  if (!countDevices || countDevices.count === 0) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO devices (id, name, location, firmware_version, last_seen_at, online, led_on, threshold, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, 0.80, ?)
    `).run('asva-esp32-01', 'ASVA Edge Node Alpha', 'Speech Lab Room 4', '1.0.0-IDF5', now, now);

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

export function hashPassword(password: string): string {
  const salt = 'asva_salt_2026';
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}
