# ASVA Threat Model

*Version 0.1 · Applies to ASVA hub + ESP32-S3 device · Review this file whenever you add a feature that touches the network, storage or authentication.*

A threat model answers four questions: **What are we protecting? From whom? How could it go wrong? What did we do about it?** This document answers them for ASVA, and is honest about what is **not** covered.

---

## 1. System summary

ASVA has three parts that talk over a local network:

```
 [ESP32-S3 device] --MQTT:1883--> [Hub: Aedes broker + Fastify + SQLite] <--HTTP/WS:8080-- [Browser]
   mic -> on-chip AI                    stores events, runs API                 3D dashboard
   GPIO 10 output
```

Intended deployment: a home, lab or classroom **LAN** with a handful of devices and a few trusted users. **Not** intended for the public internet.

---

## 2. Assets (what we protect)

| ID | Asset | Why it matters |
|---|---|---|
| A1 | Raw microphone audio | The most sensitive data; ASVA's promise is that it never leaves RAM |
| A2 | Event history and audit log (`asva.db`) | Reveals when people were home and what they commanded |
| A3 | Admin/viewer credentials and sessions | Gives control of devices |
| A4 | MQTT credentials | Lets a client control or impersonate a device |
| A5 | Device actuator state (LED / relay on GPIO 10) | Controls a physical output |
| A6 | Wi-Fi credentials stored in firmware config | Gives access to the home network |
| A7 | Integrity of evaluation results | Wrong numbers lead to wrong conclusions in reports |
| A8 | Source code, secrets in git history | Leaked secrets compromise installs |
| A9 | Availability of the hub and devices | A demo or a lab depends on it |

---

## 3. Actors (who might attack)

| Actor | Capability | Considered? |
|---|---|---|
| **Curious LAN user** (guest on Wi-Fi, flatmate) | Can scan ports, sniff unencrypted traffic, try default passwords | **Yes, primary threat** |
| **Malicious website** visited by an admin | Can make the admin's browser send requests (CSRF / cross-site WebSocket) | **Yes** |
| **Compromised device on the LAN** (e.g. a hacked smart TV) | Can reach the hub's ports | **Yes** |
| **Malicious or buggy device client** | Publishes crafted MQTT messages | **Yes** |
| **Insider with the viewer role** | Has a valid login, tries to do admin things | **Yes** |
| **Supply-chain attacker** | Malicious npm/pip package or GitHub Action | **Partly** (Dependabot, lockfiles, pinned actions) |
| **Internet attacker** | Only reachable if the user exposes ports | **No.** Ports must not be exposed; use a VPN |
| **Physical attacker** with the device or the laptop | Can read flash, attach UART/JTAG, read the disk | **No** (see section 8) |
| **Nation-state / advanced acoustic attacks** | Ultrasonic injection, adversarial audio | **No** (see section 7) |

---

## 4. Trust boundaries and data flows

| # | Flow | Boundary crossed | Protocol |
|---|---|---|---|
| F1 | Microphone → firmware RAM | Physical sensor → MCU | I²S (inside the board) |
| F2 | Device → hub: status, events, acks | Untrusted LAN | MQTT/TCP 1883 |
| F3 | Hub → device: commands | Untrusted LAN | MQTT/TCP 1883 |
| F4 | Browser → hub: login and API | Untrusted LAN | HTTP 8080 |
| F5 | Hub → browser: live events | Untrusted LAN | WebSocket 8080 |
| F6 | Hub ↔ SQLite file | Process → disk | local file |
| F7 | Hub → CSV download | Server → user's spreadsheet app | HTTP |
| F8 | Developer → GitHub (code, CI) | Local → cloud | HTTPS/SSH |

Everything that crosses the LAN (F2-F5) is treated as **untrusted input**.

---

## 5. Threats and mitigations (STRIDE)

Status key: ✅ implemented · 🟡 partly or optional · ⬜ planned · ❓ verify in code

> **Maintainer:** replace each ❓ with ✅/🟡/⬜ after checking the code. Do not leave an unchecked ✅ in a published threat model.

### 5.1 Spoofing

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| S1 | Attacker logs in with default or guessed admin password | No shipped default; random generated password; forced change at first login; strong-password rule; login rate limit | ❓ |
| S2 | Attacker publishes MQTT messages pretending to be a device | Per-device username/password; client ID must equal username; broker rejects mismatches | ❓ |
| S3 | Attacker connects to the broker anonymously | `allow_anonymous` equivalent disabled: Aedes `authenticate` rejects missing credentials | ❓ |
| S4 | Stolen session cookie reused | HTTP-only cookie, `SameSite=Strict`, short expiry (`JWT_EXPIRES_IN`), `Secure` when HTTPS | ❓ |
| S5 | Fake hub impersonates the real one to the device | Device pins the hub IP/hostname; MQTT TLS with CA pinning | ⬜ (roadmap v1.2) |

### 5.2 Tampering

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| T1 | Device A changes device B's LED/threshold | Topic ACL restricts each client to `asva/<own-id>/...` | ❓ |
| T2 | Viewer sends an LED command | Role check on the **server** (REST + WebSocket), not only in the UI | ❓ |
| T3 | SQL injection via device names, event text or search box | Parameterised statements only; JSON-schema validation | ❓ |
| T4 | Malicious `text` in an event (`=HYPERLINK(...)`) executed when CSV opened in Excel | CSV export prefixes cells starting with `= + - @ \t \r` with `'` | ❓ |
| T5 | Tampered evaluation results | Audit log of who changed or flagged events; admin-only edits | 🟡 |
| T6 | Cross-site request forgery on the API | `SameSite=Strict` cookie, strict CORS origin, JSON content-type enforced, Origin check on WebSocket | ❓ |
| T7 | Modified firmware flashed to the device | Requires physical access; secure boot is optional and off by default | ⬜ |

### 5.3 Repudiation

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| R1 | "I never turned that off" | Audit log records user, action, device, timestamp, source IP | ❓ |
| R2 | Log tampering | Logs are append-only in the app; protect the DB file with OS permissions | 🟡 |

### 5.4 Information disclosure

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| I1 | Raw audio leaves the device | Firmware never opens a socket for audio; buffers are RAM-only; verified by packet capture (see `PRIVACY_VERIFICATION.md`) | ❓ (verify) |
| I2 | Sniffing credentials or events on Wi-Fi | WPA2/WPA3 on the network; optional TLS for MQTT/HTTPS | 🟡 / ⬜ |
| I3 | Secrets committed to git | `.gitignore`, `.env.example`, secret scanning, gitleaks in CI, history scan | ❓ |
| I4 | Secrets appear in logs | Logger redaction for `authorization`, `cookie`, `password`, `token` | ❓ |
| I5 | Verbose errors leak stack traces | Generic error responses in production; details only in server logs | ❓ |
| I6 | `asva.db` copied from disk or backup | OS file permissions; never commit; keep backups private | 🟡 |
| I7 | Wi-Fi password readable from firmware or `sdkconfig` | `sdkconfig` git-ignored; flash encryption optional | 🟡 |
| I8 | User enumeration through login errors | Same message and similar timing for unknown user and wrong password | ❓ |

### 5.5 Denial of service

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| D1 | Flood of login attempts | Per-IP rate limit on `/auth/login` | ❓ |
| D2 | Flood of API requests | Global rate limit | ❓ |
| D3 | Device spams MQTT events | Per-client message-rate and payload-size limits at the broker; schema validation drops bad messages | ❓ |
| D4 | Many fake devices registered | `MAX_DEVICES` cap; registration is admin-only | ❓ |
| D5 | Huge request bodies | Fastify `bodyLimit` set to a small value (e.g. 64 KB) | ❓ |
| D6 | WebSocket connection flood | Limit connections per user; authenticate before upgrade | ❓ |
| D7 | Jamming Wi-Fi / unplugging power | Out of scope; device keeps working locally without Wi-Fi | n/a |

### 5.6 Elevation of privilege

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| E1 | Viewer becomes admin by editing the JWT or request body | Role read from the server-side record, JWT signed with a strong secret, algorithm pinned | ❓ |
| E2 | Mass assignment (client sets `role: admin`) | Explicit allow-listed fields in each schema | ❓ |
| E3 | Vulnerable dependency exploited | Dependabot, `npm audit` in CI, lockfiles | ✅ (once CI files are added) |
| E4 | Command injection via a device ID in a shell call | Never pass user input to a shell; validate IDs against `^[a-z0-9-]{3,32}$` | ❓ |

---

## 6. Privacy-specific threats

| ID | Threat | Mitigation |
|---|---|---|
| P1 | Always-on microphone is repurposed for eavesdropping | Open firmware; no network audio code path; reviewers can grep for any `send`/`publish` of audio buffers |
| P2 | Event history reveals home occupancy patterns | Retention setting (delete events older than N days); keep the DB private |
| P3 | Event text could contain unintended speech | Only fixed command labels are stored, never free text |
| P4 | Voice of a bystander is processed | Audio is processed in RAM and discarded; no storage; mention in user notice |

---

## 7. Voice-specific risks we do not fully solve

- **Replay and TV/radio triggers.** A recording or another person saying "Hello ASVA, light off" is accepted. There is no speaker verification.
- **Adversarial audio and ultrasonic injection** (inaudible commands that a microphone still picks up). Not defended against.
- **Accent and noise bias** can cause misses and false activations.
- **Do not** use voice activation alone for anything where a wrong action is dangerous (locks, ovens, mains heaters, medical devices).

---

## 8. Out of scope (explicit)

- Physical attackers: someone holding the board can read flash, use UART/JTAG, or swap firmware. Someone with the laptop can read `asva.db`.
- Internet-facing deployments.
- A malicious administrator.
- Side-channel attacks on the ESP32.
- Availability under a determined LAN flood.

---

## 9. Residual risks and how to reduce them

| Residual risk | How to reduce it |
|---|---|
| Plain HTTP/MQTT can be sniffed on a shared Wi-Fi | Use a private network or VLAN; roadmap TLS (v1.2) |
| Anyone nearby can speak a command | Place the mic away from windows; avoid safety-critical loads |
| Physical theft of the board | Enable flash encryption and secure boot (see ESP-IDF docs); do not store reusable Wi-Fi passwords on a shared device |
| Event history is sensitive | Reduce retention; encrypt the disk (BitLocker/FileVault/LUKS) |

---

## 10. Security requirements derived from this model

Every item below should be a test or a checklist entry (see `SECURITY_HARDENING.md`, section 15):

1. The server refuses to start with missing or placeholder secrets.
2. No default account password exists in code, README or database seed.
3. Anonymous MQTT connections are rejected.
4. A device cannot publish or subscribe outside its own topic prefix.
5. A viewer cannot send commands through REST **or** WebSocket.
6. Unauthenticated WebSocket upgrades are refused.
7. Login is rate-limited and errors do not reveal whether the email exists.
8. CSV export neutralises formula-leading characters.
9. All routes validate input with a schema and use parameterised SQL.
10. A packet capture of a voice session shows no audio-sized traffic.
11. `git log -p` contains no real secret.

---

## 11. Review log

| Date | Reviewer | Changes |
|---|---|---|
| 2026-__-__ | [name] | Initial version |
