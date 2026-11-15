<div align="center">

# ASVA: Advanced Speech and Voice Activation

**Offline wake-word and voice-command detection on an ESP32-S3, managed from an interactive 3D web dashboard.**

*Project SIH26172 · Sub-second recognition · No audio stored or transmitted · Works with no internet*

[![CI](https://github.com/amitabhchondar-ux/ASVA/actions/workflows/ci.yml/badge.svg)](https://github.com/amitabhchondar-ux/ASVA/actions/workflows/ci.yml)
[![CodeQL](https://github.com/amitabhchondar-ux/ASVA/actions/workflows/security.yml/badge.svg)](https://github.com/amitabhchondar-ux/ASVA/actions/workflows/security.yml)
![Node.js](https://img.shields.io/badge/Node.js-24%20LTS-green.svg)
![Backend](https://img.shields.io/badge/Backend-Fastify-blue.svg)
![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Three.js-orange.svg)
![MQTT](https://img.shields.io/badge/Protocol-MQTT%203.1.1-purple.svg)
![Privacy](https://img.shields.io/badge/Privacy-Zero%20audio%20storage-red.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

</div>

> **Status: prototype (v0.x).** ASVA is a college project built for demonstration and learning. It is designed for a trusted local network. It is **not** certified for safety-critical use, and it must not switch mains-voltage loads without proper isolation (see [Safety](#safety-notes)).

---

## Table of contents

1. [What is ASVA?](#1-what-is-asva)
2. [Key features](#2-key-features)
3. [Screenshots and demo](#3-screenshots-and-demo)
4. [Quick start (no hardware needed)](#4-quick-start-no-hardware-needed)
5. [How it works](#5-how-it-works)
6. [The seven dashboard volumes](#6-the-seven-dashboard-volumes)
7. [Voice commands and their limits](#7-voice-commands-and-their-limits)
8. [Hardware build guide](#8-hardware-build-guide)
9. [Configuration reference](#9-configuration-reference)
10. [Device protocol (MQTT) summary](#10-device-protocol-mqtt-summary)
11. [Security](#11-security)
12. [Privacy and how to verify it](#12-privacy-and-how-to-verify-it)
13. [Evaluation and results](#13-evaluation-and-results)
14. [Testing](#14-testing)
15. [Troubleshooting](#15-troubleshooting)
16. [Project structure](#16-project-structure)
17. [Alternative: external MQTT broker and Docker](#17-alternative-external-mqtt-broker-and-docker)
18. [Roadmap](#18-roadmap)
19. [Contributing](#19-contributing)
20. [License, credits and contact](#20-license-credits-and-contact)

---

## 1. What is ASVA?

Most voice assistants stream your audio to a cloud server. That costs privacy, needs internet, and adds delay.

ASVA does the opposite. A small ESP32-S3 board listens through an I²S microphone and runs a neural wake-word and command model **on the chip itself**. When it hears the wake word ("Hello ASVA") followed by a command ("Light on", "Light off", "Status"), it:

1. performs the action locally (for example, switches an LED or relay on GPIO 10), and
2. sends only a **tiny JSON event** (which command, confidence, latency, timestamp) to a hub on your local network.

The hub stores those events in a local SQLite database and shows them live on a web dashboard. The audio itself never leaves the chip's RAM.

**Who is it for?** Students and makers who want a private, offline voice interface for simple device control, and anyone studying TinyML on microcontrollers.

**What it is not:** a general-purpose assistant. The spoken words are fixed inside the trained model (see [section 7](#7-voice-commands-and-their-limits)).

---

## 2. Key features

**On the device (ESP32-S3)**
- Offline wake-word and command recognition, no cloud
- Audio held only in RAM circular buffers, never written to flash
- Wi-Fi + MQTT link with "last will" so the hub knows when a device drops off
- Local actuator control (LED / relay on GPIO 10) that keeps working if Wi-Fi is down

**On the hub (laptop or Raspberry Pi)**
- Fastify REST API + WebSocket live feed
- Embedded MQTT broker (Aedes) with per-device credentials
- SQLite storage (devices, telemetry, events, evaluation sessions, audit log)
- Command acknowledgement with a 5-second timeout
- Role-based accounts (admin / viewer), JWT in an HTTP-only cookie

**In the browser**
- Interactive 3D bookshelf interface (React + Three.js), one "volume" per tool
- Live gauges: heap, Wi-Fi RSSI, uptime
- Event ledger with search, "Mark Wrong" flagging and CSV export
- Evaluation Lab computing detection rate, false activations per hour and P95 latency
- A virtual ESP32 so everything can be tried without hardware

---

## 3. Screenshots and demo

> **TODO (add before publishing):** capture these and save them in `docs/images/`.

| Screenshot | File | What to show |
|---|---|---|
| 3D bookshelf home | `docs/images/bookshelf.png` | All seven volumes visible |
| Live console | `docs/images/live-console.png` | Gauges moving, LED toggle |
| Event ledger | `docs/images/event-ledger.png` | A few detections, one flagged wrong |
| Evaluation lab | `docs/images/evaluation.png` | A finished session with results |
| Hardware prototype | `docs/images/prototype.jpg` | The wired board, mic and LED |
| Short demo | `docs/images/demo.gif` | Say "Hello ASVA, light on" and the LED lights |

<!-- After adding the files, replace this comment with:
![3D bookshelf](docs/images/bookshelf.png)
![Live console](docs/images/live-console.png)
![Demo](docs/images/demo.gif)
-->

---

## 4. Quick start (no hardware needed)

A virtual ESP32 is included, so you can run the whole platform on your computer in about two minutes.

### Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Git | any recent | `git --version` |
| Node.js | **24 LTS** (needs the built-in `node:sqlite` module) | `node --version` |

> **TODO (verify):** make sure `engines.node` in `package.json` matches what you state here. `node:sqlite` is only available in recent Node releases, so "Node 20" will not work if you rely on it.

### Option 1: Windows (one-click)

```bash
git clone https://github.com/amitabhchondar-ux/ASVA.git
cd ASVA
```
1. Double-click **`setup.bat`**. It installs dependencies, builds the 3D UI and creates `hub/.env` with random secrets.
2. **Read the console**: it prints your admin password **once**. Save it.
3. Double-click **`start-all.bat`**. It starts the hub and the simulator and opens your browser.
4. To stop everything, double-click **`stop-all.bat`**.

### Option 2: macOS / Linux

```bash
git clone https://github.com/amitabhchondar-ux/ASVA.git
cd ASVA
chmod +x setup.sh start-all.sh
./setup.sh          # installs, builds, creates hub/.env, prints admin password once
./start-all.sh      # starts hub + simulator
```
Open <http://localhost:8080> in Chrome, Edge or Firefox.

### Option 3: plain npm (any OS)

```bash
git clone https://github.com/amitabhchondar-ux/ASVA.git
cd ASVA
npm run setup       # one-step install + build for all modules
npm run bootstrap   # creates hub/.env with random secrets (prints admin password once)

# Terminal 1: hub server + MQTT broker
npm start

# Terminal 2: virtual ESP32
npm run simulate
```

### First login

1. Open <http://localhost:8080>.
2. Sign in with `ADMIN_EMAIL` from `hub/.env` and the password printed during setup.
3. You will be asked to **change the password** immediately.

### Ports used

| Port | Purpose | Exposed to |
|---|---|---|
| `8080` | Website, REST API, WebSocket (`/ws`) | Your LAN |
| `1883` | Embedded MQTT broker (authenticated) | Your LAN (devices must connect) |

If a port is busy, change `PORT` or `MQTT_PORT` in `hub/.env`.

> **No default password is shipped.** Earlier versions of this README listed a fixed demo password. That has been removed: every installation now gets its own random secrets.

---

## 5. How it works

### Architecture

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           FRONTEND (hub/web)                           │
  │    React 18 + Vite + Three.js r165 3D Bookshelf Interface              │
  │    Runs in your browser at http://localhost:8080                       │
  │    • Volume I-VII interactive panels    • Live gauges & controls       │
  │    • WebSocket client for live events   • REST client for queries      │
  └───────────────────▲──────────────────────────────────▲─────────────────┘
                      │ HTTP / REST                      │ WebSocket (ws://)
                      ▼                                  ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                         BACKEND HUB (hub/server)                       │
  │    Fastify + Node.js 24 + built-in SQLite (node:sqlite)                │
  │    • REST: /api/devices, /api/events, /api/sessions, /auth             │
  │    • WebSocket hub (/ws) pushing live events to authenticated browsers │
  │    • Audit log + session aggregator (P95 latency, false alarms/hr)     │
  │                                                                        │
  │    ┌──────────────────────────────────────────────────────────────┐    │
  │    │            EMBEDDED MQTT BROKER (Aedes, port 1883)           │    │
  │    │  per-device login · topic ACL · last-will offline detection  │    │
  │    └──────────────────────────────▲───────────────────────────────┘    │
  └───────────────────────────────────┼────────────────────────────────────┘
                                      │ MQTT 3.1.1 over TCP
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │                DEVICE LAYER                     │
             │  Option A: real ESP32-S3 (firmware/)            │
             │   I²S mic → on-chip wake word → command → GPIO  │
             │  Option B: virtual twin (hub/simulator/)        │
             │   Node.js emulation of the same MQTT behaviour  │
             └─────────────────────────────────────────────────┘
```

**Why a hub instead of the browser talking to the ESP32 directly?**
- One broker handles many devices and many browser tabs.
- Browsers block secure (`https`) pages from calling plain `ws://` device addresses; the hub avoids this.
- History, accounts and evaluation results need a database, which the ESP32 should not hold.
- Everything stays on your local network, so it works with no internet.

### What happens when you say "Hello ASVA, light on"

1. The MEMS microphone streams audio over I²S into a **RAM-only** circular buffer.
2. The on-device model scores each frame for the wake word.
3. Once the wake word fires, the command model listens for a short window.
4. "Light on" is recognised with a confidence score. The firmware sets GPIO 10 high.
5. The firmware publishes a small JSON event to `asva/<deviceId>/event`.
6. The hub validates the sender, writes the event to SQLite and broadcasts it over WebSocket.
7. Your browser shows the detection, confidence and latency within a moment.
8. The audio buffer is overwritten by new samples. Nothing was ever saved.

### Components

| # | Component | Directory | Technology | Purpose |
|---|---|---|---|---|
| 1 | Frontend | `hub/web/` | React 18, Vite, Three.js r165, Tailwind CSS | Browser UI: 3D bookshelf, gauges, controls, reports |
| 2 | Backend | `hub/server/` | Fastify, TypeScript, Node 24 | REST API, auth, WebSocket, command ACK handling |
| 3 | Database | `hub/server/data/` | `node:sqlite` | Single-file store for devices, events, sessions, audit log |
| 4 | MQTT broker | `hub/server/src/mqtt/` | Aedes | Device ↔ hub messaging with per-device ACL |
| 5 | Simulator | `hub/simulator/` | Node.js, TypeScript, MQTT.js | Virtual ESP32 (heap noise, RSSI, ACKs, fake wake words) |
| 6 | Firmware | `firmware/` | ESP-IDF 5.x, C++ | Microphone capture, wake word, GPIO control, Wi-Fi, MQTT |
| 7 | ML pipeline | `ml/` | Python 3, TensorFlow, TFLite | Train, evaluate and INT8-quantise the keyword model |

---

## 6. The seven dashboard volumes

| Volume | Title | What you can do |
|---|---|---|
| **I** | ASVA Live Console | See heap, RSSI, uptime; toggle the LED; adjust detection sensitivity |
| **II** | Event Ledger | Search detections, view confidence, flag false activations (`Mark Wrong`), export CSV |
| **III** | Evaluation Lab | Run test sessions; see detection rate, false alarms/hour, P95 latency |
| **IV** | Command Matrix | Map each fixed command to an action; view pin mappings (GPIO 10) |
| **V** | Virtual ESP32 Twin | Trigger `Hello ASVA`, `Light on`, `Light off`, `Status`; watch raw MQTT packets |
| **VI** | Privacy Seal | Shows what is and is not stored (0 bytes of audio, RAM-only buffers) |
| **VII** | Blueprint & Specs | ESP32-S3 pinout, state machine and network topology |

---

## 7. Voice commands and their limits

| Spoken phrase | Effect |
|---|---|
| "Hello ASVA" | Wake word. Arms the command recogniser for a short window |
| "Light on" | Sets GPIO 10 high |
| "Light off" | Sets GPIO 10 low |
| "Status" | Device reports LED state, memory and signal strength |

> **Important limit:** the spoken words are baked into the trained model. The website controls *what a command does* (which action it triggers), but it **cannot add a new spoken command**. Adding one means collecting data and retraining with the scripts in `ml/`.

Known recognition limits (fill in from your own measurements, see [section 13](#13-evaluation-and-results)):
- Accuracy drops with distance and background noise.
- Similar-sounding words can cause false activations; raise the threshold slider if this happens.
- Accents and voices not in the training data may be recognised less reliably.

---

## 8. Hardware build guide

You can skip this entire section and use the simulator. Steps 2 to 4 of the software need no hardware.

### 8.1 Bill of materials

| Qty | Part | Notes |
|---|---|---|
| 1 | ESP32-S3 DevKitC with PSRAM (N8R8 or N16R8) | PSRAM helps on-device AI. A plain ESP32 can speak the same protocol but is not tested |
| 1 | I²S MEMS microphone: INMP441 or ICS-43434 | Digital; no analog front-end needed |
| 1 | LED + 220 Ω resistor | For the demo output |
| 1 | Breadboard + jumper wires | Keep microphone wires short (under 15 cm) to limit noise |
| 1 | USB **data** cable | Charge-only cables will not flash the board |
| optional | 3.3 V relay module with optocoupler | Only if you switch a real load; see [Safety](#safety-notes) |

### 8.2 Wiring

| Part | Pin | Connects to |
|---|---|---|
| Microphone | VDD | 3.3 V |
| Microphone | GND | GND |
| Microphone | SCK / BCLK | GPIO 4 |
| Microphone | WS / LRCL | GPIO 5 |
| Microphone | SD / DOUT | GPIO 6 |
| Microphone | L/R | GND (selects the left channel) |
| LED (via 220 Ω) | Anode side | GPIO 10 |
| LED | Cathode | GND |

> Pins can be changed in `idf.py menuconfig`. On N8R8/N16R8 modules, avoid GPIO 26-32 (flash) and GPIO 33-37 (octal PSRAM). The default pins above avoid these.

### 8.3 Safety notes

- Power the microphone from **3.3 V**, never 5 V.
- Never connect mains voltage directly to a GPIO pin. To switch a mains appliance, use a certified relay module with optical isolation, a proper enclosure and fuse, and ideally have a qualified person wire it.
- This prototype has no fail-safe state tested for safety-critical loads.

### 8.4 Install the tools

| For | Install |
|---|---|
| Hub and website | Node.js 24 LTS, Git |
| Firmware | ESP-IDF 5.x following [Espressif's official install guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/get-started/) |
| ML (optional) | Python 3.10+ and `pip` |

### 8.5 Flash the firmware

```bash
cd firmware
idf.py set-target esp32s3
idf.py menuconfig      # ASVA settings: Wi-Fi SSID/password, hub IP, MQTT user/password, device ID, pins
idf.py build flash monitor
```

In `menuconfig` set:

| Setting | Value |
|---|---|
| Wi-Fi SSID / password | Your 2.4 GHz network (ESP32 does not support 5 GHz) |
| Hub IP | Your computer's LAN address, e.g. `192.168.1.50` |
| MQTT username / password | The **per-device** credentials created in the dashboard (Volume IV) |
| Device ID | Unique, e.g. `asva-01` (must match the MQTT username) |
| Pins | Defaults above unless you changed the wiring |

`firmware/sdkconfig` stores these in plain text and is **git-ignored**. Never commit it.

In the serial monitor you should see the device join Wi-Fi and connect to MQTT. In the website, the device then appears as **Online**.

### 8.6 Find your hub's IP address

| OS | Command |
|---|---|
| Windows | `ipconfig` → "IPv4 Address" of your Wi-Fi adapter |
| macOS | `ipconfig getifaddr en0` |
| Linux | `hostname -I` |

Allow inbound TCP **1883** and **8080** on your computer's firewall for the private network profile only.

### 8.7 Bring up the voice engine

1. Start with a built-in ESP-SR wake word to prove the whole path works.
2. Confirm "Light on" / "Light off" toggle the LED **and** appear in the website.
3. Move to the custom "Hello ASVA" wake word once the path is proven. If ESP-SR cannot provide it, train a keyword model with TensorFlow Lite Micro (see `ml/`).

---

## 9. Configuration reference

All hub settings live in `hub/.env` (template: [`hub/.env.example`](hub/.env.example)). The server **refuses to start** if a required secret is empty or still a placeholder.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` enables stricter checks |
| `LOG_LEVEL` | no | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace` |
| `PORT` | no | `8080` | Website + API + WebSocket port |
| `HOST` | no | `0.0.0.0` | Interface to bind (`127.0.0.1` = this machine only) |
| `CORS_ORIGIN` | no | `http://localhost:8080` | Allowed browser origin(s); never `*` |
| `JWT_SECRET` | **yes** | none | Random, 32+ characters |
| `JWT_EXPIRES_IN` | no | `2h` | Session lifetime |
| `COOKIE_SECURE` | no | `false` | `true` only when served over HTTPS |
| `ADMIN_EMAIL` | no | `admin@example.com` | First admin account |
| `ADMIN_PASSWORD` | **yes** | none | 12+ characters; changed at first login |
| `LOGIN_RATE_MAX` / `LOGIN_RATE_WINDOW` | no | `5` / `1 minute` | Login brute-force limit |
| `API_RATE_MAX` / `API_RATE_WINDOW` | no | `300` / `1 minute` | General API limit |
| `DB_PATH` | no | `./data/asva.db` | SQLite file |
| `MQTT_PORT` / `MQTT_HOST` | no | `1883` / `0.0.0.0` | Embedded broker address |
| `MQTT_USERNAME` | no | `hub` | Internal broker credential |
| `MQTT_PASSWORD` | **yes** | none | Random, 16+ characters |
| `MAX_DEVICES` | no | `20` | Device registration cap |

---

## 10. Device protocol (MQTT) summary

All topics start with `asva/<deviceId>/`. A device may only touch its **own** topics.

| Topic | Direction | Retained | Purpose |
|---|---|---|---|
| `status` | device → hub | yes | LED state, free heap, RSSI, uptime, firmware version |
| `event` | device → hub | no | Wake word and command detections |
| `cmd` | hub → device | no | LED on/off, status request, threshold change |
| `ack` | device → hub | no | Confirms a command was applied |
| `online` | device → hub | yes (+ last will) | `online` / `offline` |

Example event:

```json
{"kind":"command","text":"Light on","conf":0.88,"latency_ms":140,"ts":1767225600}
```

Full REST, WebSocket and MQTT reference: [`docs/API.md`](docs/API.md).

---

## 11. Security

ASVA is meant for a **trusted local network**, but it still defends itself:

- No shipped default passwords; secrets are generated per install and validated at startup
- Passwords hashed with argon2id; sessions in HTTP-only, `SameSite=Strict` cookies
- Rate limiting on login and the API; security headers via Helmet; CORS locked to your origin
- Roles enforced on the **server** for both REST and WebSocket (viewers cannot send commands)
- MQTT requires per-device credentials, and each device is restricted to its own topics
- Input validated with JSON schemas; SQL uses parameterised statements; CSV export neutralises spreadsheet formulas
- Dependabot, CodeQL and secret scanning run in CI

Read more:
- Reporting a vulnerability: [`SECURITY.md`](SECURITY.md)
- What we defend against (and what we do not): [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
- Step-by-step hardening guide and tests: [`docs/SECURITY_HARDENING.md`](docs/SECURITY_HARDENING.md)

> **Do not expose ports 8080 or 1883 to the public internet.** If you need remote access, use a VPN such as WireGuard or Tailscale.

---

## 12. Privacy and how to verify it

**What is stored:** event metadata only (command text, confidence, latency, timestamp), device telemetry, evaluation results and audit logs.

**What is never stored or sent:** raw or recorded audio, transcripts of conversation, or anything captured outside a detected command.

**Where the data lives:** one SQLite file on your own machine. No cloud, no third parties, no analytics.

You should not just trust this statement. [`docs/PRIVACY_VERIFICATION.md`](docs/PRIVACY_VERIFICATION.md) shows how to prove it with a packet capture, a firmware inspection and a storage check, and where to record your results.

---

## 13. Evaluation and results

The **Evaluation Lab** (Volume III) computes:

| Metric | Definition |
|---|---|
| Detection rate | Correctly detected commands ÷ commands spoken |
| False activations / hour | Detections with no matching utterance ÷ hours of listening |
| P95 latency | 95th-percentile time from end of command to the action |
| Memory use | Minimum free heap observed during the session |

The full test protocol is in [`docs/EVALUATION.md`](docs/EVALUATION.md). Results table (**TODO: fill with your measurements**):

| Condition | Distance | Noise | Speakers | Utterances | Detection rate | False act./hr | P95 latency |
|---|---|---|---|---|---|---|---|
| Quiet room | 0.5 m | ~35-40 dBA | [n] | [n] | [%] | [x] | [ms] |
| Quiet room | 1 m | ~35-40 dBA | [n] | [n] | [%] | [x] | [ms] |
| Quiet room | 3 m | ~35-40 dBA | [n] | [n] | [%] | [x] | [ms] |
| Noisy room | 1 m | ~65 dBA | [n] | [n] | [%] | [x] | [ms] |

Do not publish claims such as "sub-second" or "high accuracy" until this table is filled in.

---

## 14. Testing

```bash
cd hub/server && npm test           # API + MQTT bridge unit tests
cd hub/web    && npm test           # component tests
cd hub/web    && npx playwright test   # end-to-end tests against the simulator
```

Manual tests to run before a demo:

- Wake word at 0.5 m, 1 m and 3 m; quiet and noisy room; several speakers
- Similar-sounding words to look for false triggers
- Unplug Wi-Fi and confirm the LED command still works locally
- Unplug and re-plug the device; confirm it goes Offline then Online
- Log in as a **viewer** and confirm commands are refused
- Try the security checks in [`docs/SECURITY_HARDENING.md`](docs/SECURITY_HARDENING.md#15-verification-tests)

GitHub Actions runs the automated parts on every push and pull request.

---

## 15. Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| Server exits immediately with a "secret" error | `hub/.env` is missing or still has `CHANGE_ME`. Run `npm run bootstrap` |
| Cannot log in | Wrong password, or too many attempts (rate limit). Wait one minute and retry |
| `node:sqlite` not found | Node is too old. Install Node 24 LTS |
| Port 8080 or 1883 already in use | Another program uses it. Change `PORT` / `MQTT_PORT` or stop that program |
| Device never shows Online | Wrong hub IP, firewall blocking 1883, device and computer on different Wi-Fi networks, or wrong MQTT credentials. Check the broker log for "not authorised" |
| MQTT "connection refused: not authorised" | Device ID does not match the MQTT username, or password is wrong |
| Wi-Fi will not connect | The ESP32 supports 2.4 GHz only; check SSID and password in `menuconfig` |
| Website loads but no live updates | WebSocket blocked by a proxy, or your session expired. Hard refresh and log in again |
| Microphone gives silence or noise | Swapped BCLK/WS pins, L/R pin not grounded, loose wire, or microphone powered from 5 V |
| Many false wake-ups | Raise the threshold slider; add more negative samples when retraining |
| Wake word never fires | Speak 0.5-1 m from the mic; check the microphone is on the left channel (L/R to GND) |
| `idf.py flash` fails | Use a data-capable USB cable; hold BOOT while pressing RESET, then retry |
| 3D scene is blank or slow | Enable hardware acceleration in your browser; try Chrome; update GPU drivers |
| CSV shows odd characters | Open it as UTF-8 (in Excel use Data → From Text/CSV) |
| Simulator shows offline immediately | Start the hub first; check `MQTT_PASSWORD` matches |

Still stuck? [Open an issue](https://github.com/amitabhchondar-ux/ASVA/issues/new/choose) and include your OS, Node version, and the last 30 log lines. **Remove any passwords first.**

---

## 16. Project structure

```
ASVA/
├── README.md
├── PRD.md                      # product requirements and full message reference
├── LICENSE
├── SECURITY.md                 # how to report a vulnerability
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
├── package.json                # root scripts: setup, bootstrap, start, simulate
├── setup.bat / setup.sh        # install + build + create hub/.env
├── start-all.bat / start-all.sh
├── stop-all.bat
├── scripts/
│   └── bootstrap-env.mjs       # generates hub/.env with random secrets
├── docs/
│   ├── API.md                  # REST, WebSocket and MQTT reference
│   ├── THREAT_MODEL.md
│   ├── SECURITY_HARDENING.md
│   ├── PRIVACY_VERIFICATION.md
│   ├── EVALUATION.md
│   └── images/                 # screenshots and demo GIF
├── .github/
│   ├── workflows/ci.yml, security.yml
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   └── dependabot.yml
├── firmware/                   # ESP-IDF project
│   ├── main/
│   │   ├── app_main.cpp
│   │   ├── wifi_manager.cpp
│   │   ├── mqtt_link.cpp       # connects to hub, publishes events, handles commands
│   │   ├── audio_i2s.cpp       # microphone capture
│   │   ├── voice_engine.cpp    # wake word + command recognition
│   │   └── actuator.cpp        # LED / relay control
│   └── sdkconfig.defaults
├── hub/
│   ├── .env.example
│   ├── server/                 # Fastify API, MQTT broker, WebSocket, DB
│   ├── web/                    # React + Three.js website
│   └── simulator/              # virtual ESP32
└── ml/
    ├── prepare_data.py
    ├── train.py
    └── evaluate.py
```

---

## 17. Alternative: external MQTT broker and Docker

> **TODO (decide):** the original design notes mention Eclipse Mosquitto and Docker Compose, while the quick-start scripts use the embedded Aedes broker. Keep this section **only if** `hub/docker-compose.yml` and `hub/mosquitto/mosquitto.conf` exist and work. Otherwise delete this section and move the idea to the roadmap.

If you prefer a separate broker:

```bash
cd hub
cp .env.example .env            # then set MQTT_URL=mqtt://mosquitto:1883
docker compose up -d            # starts Mosquitto, API server and website
```

Create a Mosquitto password file and ACL (so each device only reaches its own topics):

```bash
docker run --rm -it -v "$PWD/mosquitto:/mosquitto/config" eclipse-mosquitto \
  mosquitto_passwd -c /mosquitto/config/passwd hub
```

`mosquitto.conf` essentials:

```
listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl
```

`acl` essentials:

```
user hub
topic readwrite asva/#

pattern read  asva/%u/cmd
pattern write asva/%u/status
pattern write asva/%u/event
pattern write asva/%u/ack
pattern write asva/%u/online
```

(`%u` is the connected username, so a device named `asva-01` can only use `asva/asva-01/...`. Devices must use their device ID as MQTT username.)

---

## 18. Roadmap

- [x] **v0.1:** dashboard, live view, control, evaluation, history, accounts
- [ ] **v0.2:** security hardening, CI, full documentation (this release)
- [ ] **v1.0:** measured evaluation results published; tagged release
- [ ] **v1.1:** device setup through the website (Wi-Fi provisioning)
- [ ] **v1.2:** MQTT over TLS and optional HTTPS with a local certificate
- [ ] **v2.0:** OTA firmware updates (signed), multiple output actions (relay, servo), installable mobile web app

---

## 19. Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) first and follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, do **not** open a public issue; follow [`SECURITY.md`](SECURITY.md).

---

## 20. License, credits and contact

Released under the [MIT License](LICENSE).

**Team (SIH26172):** Amitabh Chondar (Project Lead & Maintainer)
**Institution:** Smart India Hackathon (SIH26172)
**Maintainer:** [@amitabhchondar-ux](https://github.com/amitabhchondar-ux)

Built with [Fastify](https://fastify.dev/), [React](https://react.dev/), [Three.js](https://threejs.org/), [Aedes](https://github.com/moscajs/aedes), [ESP-IDF](https://github.com/espressif/esp-idf), [ESP-SR](https://github.com/espressif/esp-sr) and [TensorFlow Lite](https://www.tensorflow.org/lite).

If this project helps you, consider giving it a star.
