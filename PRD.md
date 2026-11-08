# Product Requirements Document: ASVA Web Platform

| | |
|---|---|
| **Product** | ASVA (Advanced Speech and Voice Activation): web platform for device interaction |
| **Project code** | SIH26172 |
| **Document status** | Draft v1.0 |
| **Related** | [README.md](./README.md) for setup and build steps |

---

## 1. Overview

ASVA is an offline voice-activation device built on an ESP32 board. It detects a wake word and recognizes a few fixed voice commands on the device, without internet. The **ASVA Web Platform** is the website and local server that lets people connect to, control, monitor and evaluate ASVA devices.

The platform runs on the local network. It has to work with no internet connection, and it must never receive or store audio.

## 2. Problem and opportunity

The device alone has no screen and no way to show what it heard. During development and in real use, people need to:

- see that a device is alive and what state it is in,
- see what the device detected, how confident it was, and how fast it responded,
- control the device without speaking,
- collect test results (detection rate, false activations, latency) to prove the system works,
- manage more than one device.

Without a website, all of this means reading a serial monitor, which is slow and unusable for non-developers.

## 3. Goals and non-goals

### Goals
1. Show live device state and detections with under 1 second of display delay on a local network.
2. Let authorized users control the device (LED on/off, status, wake threshold) from the browser.
3. Produce evaluation data that matches the project's stated metrics: detection rate, false activations per hour, latency, RAM and power notes.
4. Work completely offline on a local network.
5. Store and display only event metadata, never audio.
6. Support several devices and several users.

### Non-goals (version 1)
- Cloud hosting, remote access from outside the local network.
- Streaming, recording or playing back audio.
- Adding new spoken commands from the website (this needs model retraining).
- Native mobile apps (the website will be mobile-friendly instead).
- Over-the-air firmware updates (planned for v2).
- Voice assistant features beyond the fixed command set.

## 4. Users

| Persona | Needs |
|---|---|
| **Developer / student (primary)** | See raw detections, confidence and latency; test quickly; export data for the project report. |
| **Evaluator / judge** | Clear dashboard that shows the system working live, plus summary results. |
| **End user (home or lab)** | Simple on/off control and status; trust that voice stays private. |
| **Admin** | Manage users, devices and settings. |

## 5. Scope summary

The system has four parts:

1. **Device (ESP32):** detects voice, acts on commands, reports events over MQTT. Firmware requirements for the website's needs are in section 10.
2. **MQTT broker (Mosquitto):** carries messages between devices and the server.
3. **Server (Node.js, SQLite):** bridges MQTT to the web, stores data, handles accounts, serves the website.
4. **Website (React):** the user interface.

## 6. Functional requirements

Priority: **P0** = must have for v1, **P1** = should have, **P2** = nice to have.

### 6.1 Accounts and access
| ID | Requirement | Priority |
|---|---|---|
| FR-A1 | Users log in with email and password. | P0 |
| FR-A2 | Two roles: **Admin** (everything) and **Viewer** (read-only, plus LED control if allowed by admin). | P0 |
| FR-A3 | First admin account is created from server configuration. | P0 |
| FR-A4 | Admin can create, disable and delete users. | P1 |
| FR-A5 | Sessions expire after a configurable time. Logout works on all pages. | P0 |

### 6.2 Device management
| ID | Requirement | Priority |
|---|---|---|
| FR-D1 | Dashboard lists all known devices with name, online/offline state, LED state, last event time. | P0 |
| FR-D2 | A device appears automatically the first time it sends a message with a valid device credential. | P0 |
| FR-D3 | Admin can rename a device and set its location label. | P1 |
| FR-D4 | Offline detection uses MQTT last-will, so a device that loses power shows Offline within 30 seconds. | P0 |
| FR-D5 | Admin can remove a device and choose whether to delete its history. | P1 |

### 6.3 Live device view
| ID | Requirement | Priority |
|---|---|---|
| FR-L1 | A device page shows a live indicator: **Idle** or **Listening** (after a wake word, for 5 seconds or until a command). | P0 |
| FR-L2 | Shows current LED state and telemetry: free memory, Wi-Fi signal, uptime, firmware version. | P0 |
| FR-L3 | Shows a live feed of events (wake word and commands) with confidence and latency. | P0 |
| FR-L4 | Page updates without refreshing, through WebSocket. | P0 |
| FR-L5 | If the connection to the server drops, the page shows a clear message and reconnects automatically. | P0 |

### 6.4 Remote control
| ID | Requirement | Priority |
|---|---|---|
| FR-C1 | Buttons: **Light on**, **Light off**, **Get status**. | P0 |
| FR-C2 | Each command waits for a device acknowledgement and shows success, failure or timeout (5 seconds). | P0 |
| FR-C3 | Wake sensitivity threshold slider (0.50 to 0.99), applied to the device and saved. | P0 |
| FR-C4 | Controls are disabled when the device is offline, with a plain explanation. | P0 |
| FR-C5 | Every control action is written to an audit log (who, what, when). | P1 |

### 6.5 Command actions
| ID | Requirement | Priority |
|---|---|---|
| FR-M1 | Page lists the device's fixed voice commands ("Light on", "Light off", "Status"). | P1 |
| FR-M2 | Admin can map each command to an output action (set GPIO high/low, toggle, report status). | P2 |
| FR-M3 | The page states that spoken command words cannot be changed here. | P1 |

### 6.6 Event history
| ID | Requirement | Priority |
|---|---|---|
| FR-H1 | Table of all stored events with time, device, type, text, confidence, latency. | P0 |
| FR-H2 | Filter by device, event type, date range and confidence. | P1 |
| FR-H3 | Export the filtered events to CSV. | P0 |
| FR-H4 | A user can mark an event as **Wrong** (false activation or misrecognition) and undo it. | P0 |
| FR-H5 | Retention setting: automatically delete events older than N days. | P2 |

### 6.7 Evaluation
| ID | Requirement | Priority |
|---|---|---|
| FR-E1 | User can start and stop a **test session** with a name, notes, and conditions (speaker, distance in metres, noise level). | P0 |
| FR-E2 | Events during a session are attached to it. | P0 |
| FR-E3 | Session summary shows: wake detections, commands recognized, false activations, false activations per hour, average and 95th percentile latency, average confidence. | P0 |
| FR-E4 | Detection rate is calculated from the user's count of attempts. The user can type how many times they spoke the wake word, and the platform shows detected / attempted. | P0 |
| FR-E5 | Charts: latency over time, confidence distribution, detections by distance or noise condition. | P1 |
| FR-E6 | Compare two sessions side by side. | P2 |
| FR-E7 | Export session summary and raw events to CSV. | P0 |
| FR-E8 | Show device memory and signal telemetry recorded during the session. | P1 |

### 6.8 Settings, privacy and help
| ID | Requirement | Priority |
|---|---|---|
| FR-S1 | A **Privacy** page states what is stored (event metadata) and what is never stored (audio). | P0 |
| FR-S2 | A **Setup help** page shows the hub address, the MQTT details and a checklist for connecting a new device. | P1 |
| FR-S3 | Admin settings: session length, retention, default threshold. | P2 |

## 7. User flows

1. **First use:** admin logs in, opens Setup help, connects a device, sees it on the Dashboard as Online.
2. **Control:** user opens the device page, presses **Light on**, sees "Sent", then "Done" when the device acknowledges, and the LED indicator switches on.
3. **Voice:** someone says "Hello ASVA", the ring changes to **Listening**; they say "Light on"; the event appears in the live feed and the LED indicator turns on.
4. **Evaluation:** evaluator starts a session (speaker A, 1 m, quiet room), runs 20 attempts, enters "20 attempts", stops the session, marks two wrong events, and reads the summary and charts, then exports the CSV.
5. **Device loses power:** the device turns Offline on the Dashboard within 30 seconds; controls are disabled.

## 8. Screens

| Screen | Contents |
|---|---|
| **Login** | Email, password, clear error messages. |
| **Dashboard** | Device cards (state, LED, last activity), count of devices online. |
| **Device** | Live indicator, LED state, control buttons, threshold slider, telemetry, live event feed. |
| **History** | Filterable event table, mark wrong, CSV export. |
| **Evaluation** | List of sessions; session detail with summary, charts, notes, export. |
| **Commands** | Fixed command list and action mapping. |
| **Settings** (admin) | Users, devices, retention, defaults. |
| **Privacy and Setup help** | Static information pages. |

Design principles: plain language, sentence case, large clear controls, readable on a phone, keyboard accessible, no motion beyond the Listening indicator, and clear error messages that say what happened and how to fix it.

## 9. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Offline:** all functions work with no internet. No external fonts, scripts or APIs are loaded. |
| NFR-2 | **Latency:** an event reaches the browser in under 1 second on a local network. |
| NFR-3 | **Capacity:** supports at least 10 devices and 10 simultaneous browser sessions on a Raspberry Pi 4 class machine. |
| NFR-4 | **Reliability:** the server recovers by itself when the broker or database restarts. No event is lost if the browser is closed. |
| NFR-5 | **Security:** hashed passwords, HTTP-only session cookies, input validation, MQTT authentication, no default credentials in production, rate-limited login. |
| NFR-6 | **Privacy:** no audio fields in any message, database table or log. Verified by a network-capture test. |
| NFR-7 | **Compatibility:** latest Chrome and Edge, Firefox, Safari; phone and desktop layouts. |
| NFR-8 | **Accessibility:** keyboard operable, visible focus, text contrast at least 4.5:1, labels on all controls. |
| NFR-9 | **Maintainability:** typed code, automated tests, one-command start with Docker Compose. |

## 10. Device (firmware) requirements for the platform

The website depends on the firmware doing the following.

| ID | Requirement |
|---|---|
| FW-1 | Join Wi-Fi using stored settings and reconnect automatically. |
| FW-2 | Connect to the MQTT broker with a username and password and a unique device ID. |
| FW-3 | Publish a retained `online` message on connect and register `offline` as the MQTT last-will. |
| FW-4 | Publish `status` every 10 seconds and after every state change. |
| FW-5 | Publish an `event` for every wake word and every recognized command, with confidence and latency. |
| FW-6 | Subscribe to `cmd`, apply the command, and publish an `ack`. |
| FW-7 | Voice recognition and LED control keep working when Wi-Fi or the broker is unavailable. |
| FW-8 | Never include audio samples in any message. |

## 11. Data model

SQLite tables (field names indicative).

**users**: `id`, `email` (unique), `password_hash`, `role` (admin or viewer), `active`, `created_at`

**devices**: `id` (device ID string), `name`, `location`, `firmware_version`, `last_seen_at`, `online`, `led_on`, `threshold`, `created_at`

**events**: `id`, `device_id`, `session_id` (nullable), `kind` (wake or command), `text`, `confidence`, `latency_ms`, `wrong` (boolean), `ts`

**sessions**: `id`, `name`, `device_id`, `speaker`, `distance_m`, `noise_level`, `attempts` (number the user typed), `notes`, `started_at`, `ended_at`

**telemetry**: `id`, `device_id`, `heap_bytes`, `rssi`, `uptime_s`, `ts`

**commands**: `id`, `device_id`, `phrase`, `action_type`, `action_target`

**audit_log**: `id`, `user_id`, `device_id`, `action`, `detail`, `ts`

There is no audio table or field.

## 12. Interfaces

### 12.1 MQTT topics

All topics start with `asva/<deviceId>/`.

| Topic | Direction | Retained | Payload |
|---|---|---|---|
| `online` | device to server | yes (last-will sets `offline`) | `online` or `offline` |
| `status` | device to server | yes | `{"led":true,"heap":183000,"rssi":-58,"uptime":3600,"fw":"1.0.0","threshold":0.80}` |
| `event` | device to server | no | `{"kind":"wake","text":"Hello ASVA","conf":0.93,"latency_ms":110,"ts":1767225600}` |
| `cmd` | server to device | no | `{"id":"c-123","cmd":"led","state":"on"}` or `{"id":"c-124","cmd":"threshold","value":0.8}` or `{"id":"c-125","cmd":"status"}` |
| `ack` | device to server | no | `{"id":"c-123","ok":true}` or `{"id":"c-123","ok":false,"error":"unknown command"}` |

### 12.2 REST API (server)

All routes require login except `/api/auth/login`.

| Method and path | Purpose |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Session handling |
| `GET /api/devices`, `GET /api/devices/:id`, `PATCH /api/devices/:id`, `DELETE /api/devices/:id` | Device list and management |
| `POST /api/devices/:id/commands` | Send a command and wait for the ack |
| `GET /api/devices/:id/telemetry?from=&to=` | Telemetry history |
| `GET /api/events?device=&kind=&from=&to=&minConf=&page=` | Event history |
| `PATCH /api/events/:id` | Mark or unmark as wrong |
| `GET /api/events/export.csv` | CSV export with the same filters |
| `GET /api/sessions`, `POST /api/sessions`, `PATCH /api/sessions/:id`, `POST /api/sessions/:id/stop` | Evaluation sessions |
| `GET /api/sessions/:id/summary` | Calculated metrics |
| `GET /api/sessions/:id/export.csv` | Session export |
| `GET/POST/PATCH/DELETE /api/users` (admin) | User management |

### 12.3 WebSocket (server to browser)

Endpoint `/ws`, authenticated by the session cookie. Messages:

- `device.status`: updated state of a device
- `device.online`: online or offline change
- `device.event`: a new event
- `command.result`: result of a command sent by this user

## 13. Evaluation metric definitions

| Metric | Definition |
|---|---|
| Detection rate | Wake words detected / wake word attempts typed by the tester |
| False activations per hour | Wake events marked wrong / session duration in hours |
| Command accuracy | Commands recognized correctly / commands spoken (tester-entered) |
| Latency | Time from end of speech to the device acting, reported by the device (`latency_ms`). Report the average and the 95th percentile. |
| Memory | Free memory reported in telemetry, minimum and average |
| Signal | Wi-Fi signal strength from telemetry |

Power use cannot be measured by the website. It is recorded manually with a USB power meter and typed into the session notes.

## 14. Success metrics

- A device shows Online within 5 seconds of power-up on the same network.
- An event appears in the browser within 1 second of being sent.
- 100% of events in the database contain no audio data.
- An evaluator can run a session and export results in under 5 minutes without help.
- All P0 requirements pass their acceptance tests.

## 15. Acceptance criteria (P0 examples)

- **FR-C2:** pressing **Light on** with the device online shows "Done" within 2 seconds and the LED indicator turns on. With the device offline, the button is disabled and a message explains why.
- **FR-D4:** unplugging a device turns it Offline on the Dashboard within 30 seconds.
- **FR-E3:** for a session with 10 events, 2 marked wrong and a 30-minute duration, the summary shows 4 false activations per hour if all 2 wrong events are wake events.
- **NFR-6:** a packet capture of 10 minutes of device traffic shows only MQTT messages under 1 KB each and no audio payloads.

## 16. Milestones (aligned to the four-week plan)

The simulator lets website work run in parallel with firmware work.

| Week | Website and server | Firmware and ML |
|---|---|---|
| 1 | Repo, Docker Compose, Mosquitto, server skeleton, login, simulator | Mic capture, Wi-Fi, MQTT connect |
| 2 | Dashboard, Device page, live events, control buttons | Wake word working with the built-in model, LED control, ack messages |
| 3 | History, mark wrong, CSV export, Evaluation sessions and summary | Custom wake word and command model, threshold setting |
| 4 | Charts, Privacy and Setup pages, tests, polish, documentation | Full testing with speakers, distance and noise; final report data |

## 17. Risks and open questions

| Risk or question | Mitigation or decision needed |
|---|---|
| The custom wake word "Hello ASVA" may not be available in ESP-SR | Start with a built-in wake word; train a custom keyword model with TFLite Micro if needed. The website is unaffected. |
| Latency figure depends on how the firmware measures it | Define one measurement point in firmware (end of speech to action) and document it. |
| Board may be a plain ESP32 instead of the S3 | The platform uses the same MQTT protocol for both. Voice accuracy and speed will differ. |
| Hub computer or router blocks MQTT port 1883 | Document firewall steps in Troubleshooting; support a phone hotspot as a fallback network. |
| Local network security | Use MQTT authentication, change default passwords, keep the hub off public networks. |
| Open question: should viewers be able to control the device? | Default: yes for LED only, admin can disable. Confirm with the team. |
| Open question: how many devices will be demonstrated? | Design supports many; confirm so demo data and layout can be tested. |

## 18. Future work

Over-the-air firmware updates, Wi-Fi setup from the website, more output actions (relay, servo, buzzer), optional remote access through a secure tunnel, installable web app, multi-language command models.
