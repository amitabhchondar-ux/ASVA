# ASVA API Reference

Covers the three interfaces of the hub: **REST** (browser ↔ hub), **WebSocket** (hub → browser, live), and **MQTT** (device ↔ hub).

> **DRAFT: align with the code.** The MQTT topics and the event message come from the original project notes. The REST routes and the other payloads are the **proposed contract** used by the hardening guide. Before publishing, compare each route with your actual code and fix whatever differs:
> ```bash
> grep -rnE "app\.(get|post|put|patch|delete)\(" hub/server/src
> ```
> Mark each section below ✅ (matches the code) or edit it. Do not publish a reference that disagrees with the implementation.

**Base URL:** `http://<hub-ip>:8080` · **Content type:** `application/json` · **Time:** Unix seconds (UTC) unless stated

---

## 1. Conventions

### Authentication
Browser clients log in with `POST /auth/login`; the server sets an `asva_session` cookie (`HttpOnly`, `SameSite=Strict`, `Secure` over HTTPS). Send it automatically with `credentials: 'include'` (fetch) or `-b cookies.txt` (curl). There are two roles:

| Role | Can do |
|---|---|
| `viewer` | Read devices, events, sessions; export CSV; watch live events |
| `admin` | Everything a viewer can, plus send commands, manage devices/users, flag events, run sessions |

### Errors
All errors use the same shape:
```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|---|---|
| 400 | Invalid input (schema validation failed) |
| 401 | Not signed in, or bad credentials |
| 403 | Signed in but not allowed (role, origin, or password change required) |
| 404 | Not found |
| 409 | Conflict (duplicate ID, device limit reached) |
| 413 | Request body too large (limit 64 KB) |
| 429 | Rate limit exceeded; check the `Retry-After` header |
| 500 | Server error (details only in server logs) |
| 504 | Device did not acknowledge a command within 5 s |

### Rate limits
Login: 5 requests/minute/IP (`LOGIN_RATE_MAX`). Other routes: 300 requests/minute/IP (`API_RATE_MAX`).

### IDs
Device IDs match `^[a-z0-9][a-z0-9-]{2,31}$` (3-32 characters, lowercase letters, digits and hyphens).

---

## 2. REST API

### 2.1 Authentication

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | none | Sign in |
| POST | `/auth/logout` | none | Clear the session cookie |
| POST | `/auth/change-password` | any user | Change own password |
| GET | `/auth/me` | any user | Current user and role |

**`POST /auth/login`**
```json
// request
{ "email": "admin@example.com", "password": "..." }
// 200
{ "ok": true, "role": "admin", "mustChangePassword": true }
// 401
{ "error": "Invalid email or password" }
```

**`POST /auth/change-password`**
```json
// request
{ "currentPassword": "...", "newPassword": "at least 12 characters" }
// 200
{ "ok": true }
```
While `mustChangePassword` is true, every other route returns 403 `Password change required`.

**`GET /auth/me`**
```json
{ "id": 1, "email": "admin@example.com", "role": "admin" }
```

### 2.2 Devices

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/devices` | viewer | List devices with online state and latest status |
| GET | `/api/devices/:id` | viewer | One device |
| POST | `/api/devices` | admin | Register a device and create its MQTT credential |
| DELETE | `/api/devices/:id` | admin | Remove a device and revoke its credential |
| POST | `/api/devices/:id/rotate-credential` | admin | Issue a new MQTT password |
| POST | `/api/devices/:id/command` | admin | Send a command and wait for the acknowledgement |

**`GET /api/devices` → 200**
```json
[
  {
    "id": "asva-01",
    "label": "Desk lamp",
    "online": true,
    "lastSeen": 1767225600,
    "status": { "led": true, "heap": 182340, "rssi": -58, "uptime": 8421, "fw": "0.2.0", "threshold": 0.6 }
  }
]
```

**`POST /api/devices` → 201** (the password is shown **once**)
```json
// request
{ "id": "asva-01", "label": "Desk lamp" }
// response
{ "id": "asva-01", "mqttUsername": "asva-01", "mqttPassword": "k3Jd...24 chars" }
```

**`POST /api/devices/:id/command`**
```json
// request: exactly one of these shapes
{ "action": "led", "value": "on" }          // or "off"
{ "action": "status" }
{ "action": "threshold", "value": 0.65 }    // 0.30 to 0.95

// 200: device acknowledged
{ "ok": true, "ackMs": 83, "applied": { "led": true } }
// 504: no ACK within 5 seconds
{ "error": "Device did not acknowledge in time" }
```

### 2.3 Events (Event Ledger)

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/events` | viewer | Search detections |
| POST | `/api/events/:id/flag` | admin | Mark a detection as wrong (or clear the flag) |
| GET | `/api/events/export.csv` | viewer | Download events as CSV |

**`GET /api/events`** query parameters:

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string ≤ 64 | none | Text search in the command text |
| `device` | device ID | none | Filter by device |
| `kind` | `wake` or `command` | none | |
| `from`, `to` | Unix seconds | none | Time window |
| `limit` | 1-500 | 100 | |
| `offset` | ≥ 0 | 0 | |

```json
{
  "total": 482,
  "items": [
    { "id": 9120, "device": "asva-01", "kind": "command", "text": "Light on", "conf": 0.88, "latencyMs": 140, "ts": 1767225600, "flaggedWrong": false }
  ]
}
```

**`POST /api/events/:id/flag`** → `{ "flaggedWrong": true }` (body: `{ "wrong": true }`)

**CSV columns:** `time (ISO 8601), device, kind, text, confidence, latency_ms, flagged_wrong`. Cells that start with `= + - @` are prefixed with `'` to prevent spreadsheet formula injection.

### 2.4 Evaluation sessions

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/sessions` | viewer | List sessions |
| POST | `/api/sessions` | admin | Start a session |
| POST | `/api/sessions/:id/stop` | admin | Stop a session and compute results |
| GET | `/api/sessions/:id` | viewer | Session details and metrics |

```json
// POST /api/sessions  request
{ "device": "asva-01", "condition": "Q-1", "speaker": "S3", "notes": "1 m, quiet", "spoken": 60 }
// GET /api/sessions/12  response
{
  "id": 12, "device": "asva-01", "condition": "Q-1", "speaker": "S3",
  "startedAt": 1767225000, "endedAt": 1767225900,
  "spoken": 60, "detected": 57, "correct": 56, "wrong": 1, "missed": 3,
  "detectionRate": 0.933, "falseActivations": 0, "durationHours": 0.25, "falsePerHour": 0,
  "latencyMedianMs": 132, "latencyP95Ms": 211, "minHeap": 179400
}
```

### 2.5 Users (admin)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create a user with a role; sets `mustChangePassword` |
| PATCH | `/api/users/:id` | Change role or disable |
| DELETE | `/api/users/:id` | Delete a user |

### 2.6 System

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | `{ "ok": true, "version": "0.2.0" }`, for monitoring only; reveals nothing sensitive |
| GET | `/api/privacy` | viewer | Data the system stores, retention days, audio stored: 0 bytes |

---

## 3. WebSocket

**URL:** `ws://<hub-ip>:8080/ws` (use `wss://` behind HTTPS)
**Auth:** the session cookie is sent during the upgrade. The `Origin` header must be in `CORS_ORIGIN`. Max 5 connections per user. Max incoming frame 4 KB.

### Server → browser messages

Every message is JSON with a `type` field.

```json
{ "type": "device.online",  "device": "asva-01", "online": true, "ts": 1767225600 }
{ "type": "device.status",  "device": "asva-01", "status": { "led": true, "heap": 182340, "rssi": -58, "uptime": 8421 } }
{ "type": "event",          "device": "asva-01", "event": { "kind": "command", "text": "Light on", "conf": 0.88, "latencyMs": 140, "ts": 1767225600 } }
{ "type": "command.ack",    "device": "asva-01", "action": "led", "ok": true, "ackMs": 83 }
{ "type": "pong" }
{ "type": "error",          "error": "Not allowed for your role" }
```

### Browser → server messages

| Message | Role | Notes |
|---|---|---|
| `{ "type": "ping" }` | any | Server replies `pong` |
| `{ "type": "command", "device": "...", "action": "...", "value": ... }` | admin | Same validation as the REST command route (optional; REST is the preferred path) |

Anything else is ignored.

---

## 4. MQTT (device ↔ hub)

**Broker:** `mqtt://<hub-ip>:1883` (MQTT 3.1.1). TLS (`mqtts://…:8883`) is on the roadmap.

### 4.1 Connecting

| Setting | Value |
|---|---|
| Client ID | the device ID, e.g. `asva-01` |
| Username | the device ID (must equal the client ID) |
| Password | the credential created when the device was registered |
| Clean session | true |
| Keep-alive | 30 s recommended |
| Last will | topic `asva/<id>/online`, payload `offline`, QoS 1, retained |

A device may **publish** only to its own `status`, `event`, `ack`, `online` topics and **subscribe** only to its own `cmd` topic. Everything else is refused. Max payload 2 KB; rate limit about 20 messages / 10 s.

### 4.2 Topics

| Topic | Direction | QoS | Retained | Purpose |
|---|---|---|---|---|
| `asva/<id>/online` | device → hub | 1 | yes | `online` on connect; `offline` is the last will |
| `asva/<id>/status` | device → hub | 0 | yes | Telemetry heartbeat, every 5-10 s |
| `asva/<id>/event` | device → hub | 1 | no | Wake-word and command detections |
| `asva/<id>/cmd` | hub → device | 1 | no | Commands from the dashboard |
| `asva/<id>/ack` | device → hub | 1 | no | Confirmation that a command was applied |

### 4.3 Payloads

**`online`** → plain text: `online` or `offline`

**`status`** (proposed; match with firmware)
```json
{ "led": true, "heap": 182340, "rssi": -58, "uptime": 8421, "fw": "0.2.0", "threshold": 0.6 }
```
| Field | Type | Meaning |
|---|---|---|
| `led` | boolean | Output on GPIO 10 is high |
| `heap` | integer | Free heap in bytes |
| `rssi` | integer | Wi-Fi signal in dBm (negative) |
| `uptime` | integer | Seconds since boot |
| `fw` | string | Firmware version |
| `threshold` | number | Current detection threshold 0.30-0.95 |

**`event`** (from the project notes)
```json
{"kind":"command","text":"Light on","conf":0.88,"latency_ms":140,"ts":1767225600}
```
| Field | Type | Rules |
|---|---|---|
| `kind` | string | `wake` or `command` |
| `text` | string | One of `Hello ASVA`, `Light on`, `Light off`, `Status`; anything else is rejected |
| `conf` | number | 0.0-1.0 |
| `latency_ms` | integer | 0-60000 |
| `ts` | integer | Unix seconds; hub rejects values far from its own clock |

The device ID is **not** inside the payload; the hub takes it from the topic and checks it matches the authenticated client.

**`cmd`** (hub → device)
```json
{ "id": "c-18f3a", "action": "led", "value": "on" }
{ "id": "c-18f3b", "action": "status" }
{ "id": "c-18f3c", "action": "threshold", "value": 0.65 }
```
`id` is a unique command ID used to match the acknowledgement.

**`ack`** (device → hub)
```json
{ "id": "c-18f3a", "ok": true, "applied": { "led": true } }
{ "id": "c-18f3c", "ok": false, "error": "threshold out of range" }
```
If no `ack` with the matching `id` arrives in **5 seconds**, the REST call returns 504.

### 4.4 Sequence: a dashboard command

```
Browser          Hub (REST + broker)                       Device
  │ POST /api/devices/asva-01/command  │                        │
  │ ──────────────────────────────────►│ publish asva/asva-01/cmd {id:c1,...}
  │                                    │ ─────────────────────►│ set GPIO 10
  │                                    │      asva/asva-01/ack {id:c1,ok:true}
  │                                    │ ◄─────────────────────│
  │ 200 { ok:true, ackMs:83 }          │ also: WebSocket "command.ack"
  │ ◄──────────────────────────────────│
```

### 4.5 Sequence: a spoken command

```
You: "Hello ASVA, light on"
Device: wake word → command recognised → GPIO 10 high
Device ─► asva/asva-01/event  {"kind":"command","text":"Light on","conf":0.88,...}
Device ─► asva/asva-01/status {"led":true,...}
Hub: validates → stores in SQLite → WebSocket {type:"event"} ─► browsers
```

---

## 5. Examples

### curl
```bash
# log in and keep the cookie
curl -c cookies.txt -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YOUR_PASSWORD"}'

# list devices
curl -b cookies.txt http://localhost:8080/api/devices

# turn the LED on
curl -b cookies.txt -X POST http://localhost:8080/api/devices/asva-01/command \
  -H 'Content-Type: application/json' -d '{"action":"led","value":"on"}'

# download events as CSV
curl -b cookies.txt -o events.csv http://localhost:8080/api/events/export.csv
```

### MQTT (testing a device by hand)
```bash
# listen for your own commands
mosquitto_sub -h <hub-ip> -u asva-01 -P 'DEVICE_PASSWORD' -i asva-01 -t 'asva/asva-01/cmd' -v

# publish a fake detection
mosquitto_pub -h <hub-ip> -u asva-01 -P 'DEVICE_PASSWORD' -i asva-01 -t 'asva/asva-01/event' \
  -m '{"kind":"command","text":"Light on","conf":0.9,"latency_ms":120,"ts":'$(date +%s)'}'
```

### Browser (JavaScript)
```js
await fetch('/auth/login', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
ws.onmessage = (m) => console.log(JSON.parse(m.data));
```

---

## 6. Versioning and change policy

- The API is **unversioned** while ASVA is 0.x; breaking changes are listed under "Changed" in `CHANGELOG.md`.
- From v1.0 the REST routes move under `/api/v1/…` and breaking changes require a major version bump.
- Firmware and hub should report their versions (`fw` in `status`, `/api/health`) so mismatches are easy to spot.
