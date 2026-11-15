#!/usr/bin/env node
/**
 * Creates hub/.env from hub/.env.example with freshly generated random secrets.
 *
 *  - Never overwrites an existing hub/.env.
 *  - Writes the file with owner-only permissions (0600 on macOS/Linux).
 *  - Prints the generated admin password ONCE. Copy it now; it is not shown again.
 *
 * Usage:  node scripts/bootstrap-env.mjs      (or: npm run bootstrap)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(root, 'hub', '.env.example');
const targetPath = join(root, 'hub', '.env');

if (!existsSync(examplePath)) {
  console.error(`Missing ${examplePath}. Copy hub/.env.example into your repo first.`);
  process.exit(1);
}
if (existsSync(targetPath)) {
  console.log('hub/.env already exists - leaving it untouched.');
  process.exit(0);
}

const secret = (bytes) => randomBytes(bytes).toString('base64url');
const generated = {
  JWT_SECRET: secret(48), //      64 chars
  MQTT_PASSWORD: secret(24), //   32 chars
  ADMIN_PASSWORD: secret(15), //  20 chars
};

let text = readFileSync(examplePath, 'utf8');
for (const [key, value] of Object.entries(generated)) {
  text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
}
writeFileSync(targetPath, text, { mode: 0o600 });

console.log('\nCreated hub/.env with random secrets.\n');
console.log('  Admin email   : admin@example.com  (change ADMIN_EMAIL in hub/.env if you like)');
console.log(`  Admin password: ${generated.ADMIN_PASSWORD}`);
console.log('\nSave this password now - it will not be displayed again.');
console.log('You will be asked to change it at first login.\n');
