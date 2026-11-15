import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Automatically locate and load environment variables from hub/.env or .env
const envCandidates = [
  resolve(process.cwd(), 'hub', '.env'),
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '..', '..', '.env'),
  resolve(__dirname, '..', '.env'),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    try {
      if (typeof (process as any).loadEnvFile === 'function') {
        (process as any).loadEnvFile(envPath);
      } else {
        const content = readFileSync(envPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const k = trimmed.substring(0, eq).trim();
            const v = trimmed.substring(eq + 1).trim();
            if (!(k in process.env)) {
              process.env[k] = v;
            }
          }
        }
      }
      break;
    } catch {}
  }
}

// Values that must never be accepted as real secrets.
const PLACEHOLDER = /^(|change[-_ ]?me.*|admin123|password|secret|test|example|todo|xxx+)$/i;

function readSecret(name: string, minLength: number): string {
  const value = (process.env[name] ?? '').trim();
  if (PLACEHOLDER.test(value) || value.length < minLength) {
    throw new Error(
      `${name} is missing, a placeholder, or shorter than ${minLength} characters.\n` +
      `Run "npm run bootstrap" to generate secure values in hub/.env.`
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
    retentionDays: readInt('RETENTION_DAYS', 90, 1, 3650),
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

