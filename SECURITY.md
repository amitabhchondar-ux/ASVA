# Security Policy

ASVA handles voice-triggered device control and stores detection history, so we take security reports seriously, even though this is a student project.

## Supported versions

| Version | Supported |
|---|---|
| `main` branch (latest) | Yes |
| Tagged releases `0.x` | Latest release only |
| Anything older | No |

## How to report a vulnerability

**Please do not open a public GitHub issue for security problems.**

Use either of these private channels:

1. **GitHub private vulnerability reporting (preferred):**
   <https://github.com/amitabhchondar-ux/ASVA/security/advisories/new>
   *(Maintainer: enable it under Settings → Code security → Private vulnerability reporting.)*
2. **Email:** `amitabhchondar@gmail.com` with the subject line `ASVA security report`.

### What to include

- A clear description of the problem and its impact
- The component affected: `hub/server`, `hub/web`, `hub/simulator`, `firmware`, `ml`, or documentation
- The version or commit hash
- Step-by-step instructions to reproduce, or a proof of concept
- Your environment (OS, Node version, browser, ESP-IDF version, hardware)
- Whether you need credit, and the name to use

Please do **not** include real passwords, Wi-Fi credentials or personal audio in your report.

## What to expect from us

This is a volunteer-run project, so these are targets, not guarantees:

| Step | Target time |
|---|---|
| Acknowledge your report | within 3 days |
| Initial assessment (valid / not valid / need more info) | within 7 days |
| Fix or mitigation for high-severity issues | within 30 days |
| Public disclosure (advisory + changelog entry) | after the fix is released, coordinated with you |

If you do not hear back within 7 days, send a reminder to the email address above.

## Scope

**In scope**
- Authentication, session and authorisation flaws (including roles and WebSocket access)
- MQTT broker access control (reading or controlling another device's topics)
- Injection (SQL, command, CSV/formula injection in exports), XSS, CSRF, SSRF
- Secrets or credentials committed to the repository or leaked in logs
- Firmware issues: audio leaving the device, credential exposure, unsafe actuator behaviour
- Vulnerable dependencies that are actually reachable in ASVA
- Any evidence that raw audio is stored or transmitted, which would break our core privacy promise

**Out of scope**
- Attacks that need physical access to the device or the host computer (see the threat model)
- Someone already on your network running a denial-of-service flood against a home LAN
- Social engineering of maintainers
- Findings in third-party software with no ASVA-specific impact (report those upstream)
- Missing best-practice headers with no demonstrated impact
- Results from automated scanners without a working proof of concept

See [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) for the full list of what ASVA is and is not designed to resist.

## Safe harbour

If you act in good faith, we will not pursue or support legal action against you for security research on **your own installation** of ASVA that:

- avoids privacy violations, data destruction and service disruption for others
- only accesses data you own or that is yours to test
- gives us reasonable time to fix the problem before public disclosure

Please do not test against systems you do not own.

## Hardening checklist for people who run ASVA

- Never expose ports `8080` or `1883` to the internet. Use a VPN for remote access.
- Run `npm run bootstrap` so every secret is random, and never commit `hub/.env`.
- Create a separate MQTT credential for each device; delete credentials for lost devices.
- Keep Node.js, ESP-IDF and dependencies up to date (Dependabot is enabled).
- Prefer the **viewer** role for anyone who does not need to send commands.
- Back up `asva.db` only to storage you control; it contains your event history.
- Full guide: [`docs/SECURITY_HARDENING.md`](docs/SECURITY_HARDENING.md)

## Known limitations

These are documented honestly so you can decide whether ASVA fits your situation:

- Traffic between browser and hub is plain HTTP/WebSocket unless you place the hub behind HTTPS. Do not use it on an untrusted network.
- MQTT is unencrypted (port 1883) unless TLS is configured; credentials could be sniffed by someone on the same Wi-Fi.
- Wake-word and command detection can be triggered by a recording or another speaker nearby (replay). ASVA does not do speaker verification.
- Firmware flash encryption and secure boot are not enabled by default.
- There is no account lockout beyond rate limiting.

## Disclosure of leaked secrets

If you find a secret in the repository (password, token, key), report it privately as above. We will rotate it first, then clean the git history if needed.
