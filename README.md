# ASVA: Advanced Speech and Voice Activation

**Offline voice activation on an ESP32 device, with a full website to monitor, control and evaluate it.**

ASVA detects a wake word ("Hello ASVA") and a small set of fixed commands ("Light on", "Light off", "Status") directly on the device. No audio ever leaves the board. This repository contains three parts:

| Part | What it is |
|---|---|
| `firmware/` | ESP-IDF (C++) code running on the ESP32 board: microphone, wake word, command recognition, LED, Wi-Fi and MQTT |
| `hub/` | The **ASVA Hub**: a local server (backend + MQTT broker + database) that serves the website |
| `ml/` | Python and TensorFlow scripts to prepare data and train or evaluate models |

The full product requirements are in [PRD.md](./PRD.md). This README explains what is used, why, and how to build it step by step.

---

## ⚡ Quick Start (Run from GitHub in 2 Minutes)

### Prerequisites
- **Git**
- **Node.js 20+ or 24+** (Node.js 24 recommended, includes built-in `node:sqlite` with zero C++ compilation required)

### Option A: Windows (One-Click)
1. **Clone the repository:**
   ```bash
   git clone https://github.com/amitabhchondar-ux/ASVA.git
   cd ASVA
   ```
2. Run **`setup.bat`** (double-click in File Explorer or run in terminal) to install dependencies and compile the 3D UI.
3. Run **`start-all.bat`** to launch the Hub Server & Simulator.
4. Your browser will automatically open **[`http://localhost:8080`](http://localhost:8080)**.

---

### Option B: Cross-Platform (Mac / Linux / Windows Terminal)
1. **Clone the repository:**
   ```bash
   git clone https://github.com/amitabhchondar-ux/ASVA.git
   cd ASVA
   ```
2. **Install & Build:**
   ```bash
   # 1. Build frontend 3D UI
   cd hub/web && npm install && npm run build

   # 2. Setup Hub Server
   cd ../server && npm install && npm run build

   # 3. Setup Virtual ESP32 Simulator
   cd ../simulator && npm install
   ```
3. **Start the Hub Server (Terminal 1):**
   ```bash
   cd hub/server
   npm start
   ```
   *(Starts Fastify, WebSocket link, and embedded MQTT broker on port 1883)*
4. **Start the Virtual Device Simulator (Terminal 2):**
   ```bash
   cd hub/simulator
   npm run simulate
   ```
   *(Connects over MQTT as an active ESP32 device sending telemetry every 10s)*
5. **Open Dashboard:**
   Navigate to **[`http://localhost:8080`](http://localhost:8080)** in Google Chrome or any browser.

---

## 1. What the website does

The website is the control and evaluation centre for one or more ASVA devices.

1. **Dashboard:** shows every device with its online/offline state, LED state and last activity.
2. **Live device view:** shows in real time when the wake word is heard, which command was recognized, its confidence and latency.
3. **Remote control:** buttons to turn the LED on or off, request status, and change the wake sensitivity threshold.
4. **Command actions:** shows the fixed command set and lets you choose which action each command triggers (for example "Light on" switches GPIO 10 high).
5. **Evaluation:** records test sessions and calculates detection rate, false activations per hour, latency and memory use. This matches the evaluation plan in the project deck.
6. **Event history:** searchable log of everything the device detected, exportable to CSV.
7. **Accounts and roles:** admin and viewer logins.
8. **Privacy page:** states plainly what the system stores. Only event data is stored, never audio.

> **Important limit:** the spoken words themselves ("Light on", "Light off", "Status") are fixed inside the trained model. The website cannot add a new spoken command. Adding one needs retraining (see `ml/`). The website controls what each command *does*.

---

## 2. Architecture

```
 ┌──────────────────────┐       Wi-Fi (local network only)
 │  ESP32 device         │
 │  mic → wake word →    │──── MQTT ───────┐
 │  command → LED        │                 │
 └──────────────────────┘                 ▼
                              ┌────────────────────────────┐
                              │  ASVA Hub (laptop or        │
                              │  Raspberry Pi on same Wi-Fi)│
                              │                             │
                              │  Mosquitto  (MQTT broker)   │
                              │      │                      │
                              │  Node.js API server         │
                              │      │          │           │
                              │  SQLite DB   WebSocket+REST │
                              └──────────────────┬──────────┘
                                                 │ HTTP (LAN)
                                      ┌──────────▼──────────┐
                                      │  Website (React)    │
                                      │  opened in Chrome   │
                                      └─────────────────────┘
```

**Why a hub instead of the browser talking to the ESP32 directly?**
- One broker handles many devices and many browser tabs at once.
- Browsers block a secure (https) page from calling a plain `ws://` device address. The hub serves the website and does the device talking, so this problem disappears.
- History, accounts and evaluation results need a database. The ESP32 should not store them.
- The whole system still works with **no internet**. Everything runs on your local network.

---

## 3. Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| Board | ESP32-S3 (N16R8 recommended) | PSRAM and vector instructions for on-device AI. Works with ESP-SR. The website is board-independent, so a plain ESP32 also works over the same protocol. |
| Firmware | ESP-IDF 5.x, C++ | Official framework. Includes Wi-Fi, I²S, `esp-mqtt` and the ESP-SR component. |
| On-device AI | ESP-SR (WakeNet and MultiNet), or TensorFlow Lite Micro | ESP-SR is the fastest route to a working demo. TFLite Micro is the fallback for a custom wake word. |
| Device protocol | MQTT over TCP | Small messages, retained status, and "last will" so the hub knows when a device drops off. |
| MQTT broker | Eclipse Mosquitto | Light, free, runs in Docker. |
| Backend | Node.js 20+ with TypeScript, Fastify | Fast, typed, built-in schema validation, good WebSocket support. |
| Database | SQLite (via Drizzle ORM) | Single file, zero setup, fully offline. Can move to PostgreSQL later without changing the app logic. |
| Realtime to browser | WebSocket | Pushes live events to open pages. |
| Auth | Email and password, JWT in an HTTP-only cookie, bcrypt or argon2 hashing | Simple and safe for a local system. |
| Frontend | React, Vite, TypeScript, Tailwind CSS | Quick to build and a common stack. |
| Data fetching and charts | TanStack Query, Recharts | Caching and live updates. Charts for the evaluation page. |
| Packaging | Docker Compose | One command starts the broker, API and website. |
| Testing | Vitest, Playwright | Unit and end-to-end tests. |
| ML | Python, TensorFlow | Data preparation, training and evaluation. |

---

## 4. Repository layout

```
asva/
├─ README.md
├─ PRD.md
├─ firmware/                  # ESP-IDF project
│  ├─ main/
│  │  ├─ app_main.cpp
│  │  ├─ wifi_manager.cpp
│  │  ├─ mqtt_link.cpp        # connects to hub, publishes events, handles commands
│  │  ├─ audio_i2s.cpp        # microphone capture
│  │  ├─ voice_engine.cpp     # wake word and command recognition
│  │  └─ actuator.cpp         # LED / relay control
│  └─ sdkconfig.defaults
├─ hub/
│  ├─ docker-compose.yml
│  ├─ mosquitto/mosquitto.conf
│  ├─ server/                 # Fastify API, MQTT bridge, WebSocket, DB
│  ├─ web/                    # React website
│  └─ simulator/              # fake ASVA device for development
└─ ml/
   ├─ prepare_data.py
   ├─ train.py
   └─ evaluate.py
```

---

## 5. Step-by-step build guide

Follow these in order. Steps 2 to 4 need no hardware, so website work can start immediately.

### Step 1. Buy the hardware
- ESP32-S3 DevKitC with PSRAM (N8R8 or N16R8)
- I²S MEMS microphone (ICS43434 or INMP441)
- 1 LED, 1 resistor (220 Ω), breadboard, jumper wires
- USB data cable (not a charge-only cable)

### Step 2. Install the tools on your computer
- Node.js 20 LTS or newer
- Docker Desktop (or Docker Engine on Linux)
- Git
- For firmware: ESP-IDF 5.x (follow Espressif's install guide for your OS)
- For ML: Python 3.10+ and `pip`

### Step 3. Start the hub
```bash
cd hub
cp .env.example .env          # then edit the values (see section 6)
docker compose up -d          # starts Mosquitto, API server and website
```
Open `http://localhost:8080` in Chrome and log in with the admin account from your `.env`.

Find your computer's local IP address (for example `192.168.1.50`). The device needs it.

### Step 4. Develop with the simulator (no hardware needed)
```bash
cd hub/simulator
npm install
npm run simulate -- --broker mqtt://localhost:1883 --id asva-sim-01
```
The simulator behaves like a real device. It sends wake and command events and responds to LED commands. Build and test every website page against it.

### Step 5. Wire the hardware
Suggested pins (all can be changed in `menuconfig`):

| Part | Connects to |
|---|---|
| Mic VDD | 3.3 V |
| Mic GND | GND |
| Mic BCLK (SCK) | GPIO 4 |
| Mic WS (LRCL) | GPIO 5 |
| Mic SD (DOUT) | GPIO 6 |
| Mic L/R | GND (left channel) |
| LED (through 220 Ω) | GPIO 10 to GND |

Keep the microphone wires short. Long wires add noise.

### Step 6. Flash the firmware
```bash
cd firmware
idf.py set-target esp32s3
idf.py menuconfig             # set Wi-Fi name/password, hub IP, device ID, pins
idf.py build flash monitor
```
In the serial monitor you should see the device join Wi-Fi and connect to MQTT. In the website, the device appears on the dashboard as **Online**.

### Step 7. Bring up the voice engine
1. Start with a built-in ESP-SR wake word to prove the full path works.
2. Check that the "Light on" and "Light off" commands switch the LED and appear on the website.
3. Move to the custom "Hello ASVA" wake word once confirmed. If ESP-SR cannot provide it, train a small keyword model with TensorFlow Lite Micro (see `ml/`).

### Step 8. Run evaluation sessions
1. In the website, open **Evaluation** and start a session.
2. Test with different speakers, distances and background noise.
3. Mark wrong detections in the log.
4. Download the CSV and the charts for your report.

### Step 9. Harden and finish
- Change all default passwords and the JWT secret.
- Enable MQTT username and password (see `mosquitto.conf`).
- Run the tests (section 8).
- Run the privacy check: capture network traffic from the device and confirm it contains only small MQTT messages, never audio.

---

## 6. Configuration

`hub/.env.example`:

```env
PORT=8080
JWT_SECRET=change-me-to-a-long-random-string
DB_PATH=./data/asva.db
MQTT_URL=mqtt://mosquitto:1883
MQTT_USERNAME=hub
MQTT_PASSWORD=change-me
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-now
```

Device settings (set in `idf.py menuconfig`): Wi-Fi SSID, Wi-Fi password, hub IP, MQTT username and password, device ID, microphone pins, LED pin.

---

## 7. How devices and the hub talk (summary)

All topics start with `asva/<deviceId>/`.

| Topic | Direction | Purpose |
|---|---|---|
| `status` | device to hub (retained) | LED state, memory, signal strength, uptime, firmware version |
| `event` | device to hub | Wake word and command detections |
| `cmd` | hub to device | LED on/off, status request, threshold change |
| `ack` | device to hub | Confirms a command was applied |
| `online` | device to hub (retained, with last will) | `online` or `offline` |

Example event:
```json
{"kind":"command","text":"Light on","conf":0.88,"latency_ms":140,"ts":1767225600}
```
The full message and API reference is in [PRD.md](./PRD.md).

---

## 8. Testing

```bash
cd hub/server && npm test         # API and MQTT bridge unit tests
cd hub/web && npm test            # component tests
cd hub/web && npx playwright test # end-to-end tests against the simulator
```

Manual tests: wake word at 0.5 m, 1 m and 3 m; quiet room and noisy room; different speakers; similar-sounding words for false triggers; unplug Wi-Fi and confirm the device keeps working locally.

---

## 9. Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| Device never shows Online | Wrong hub IP, or the computer firewall blocks port 1883. Allow it. Check that both are on the same Wi-Fi. |
| Website loads but no live updates | WebSocket blocked by a proxy or an old browser tab. Hard refresh. |
| Microphone gives silence or noise | Swapped BCLK/WS pins, L/R pin not grounded, or a loose wire. |
| Many false wake-ups | Raise the threshold slider and retest. Add more negative training samples. |
| Flash fails | Use a data-capable USB cable. Hold BOOT while pressing RESET, then retry. |

---

## 10. Roadmap

- **v1 (this project):** dashboard, live view, control, evaluation, history, accounts.
- **v1.1:** device setup through the website (Wi-Fi provisioning).
- **v2:** over-the-air firmware updates, multiple output actions (relay, servo), mobile-friendly install as an app.

---

## 11. Privacy statement

ASVA processes speech on the device. The firmware sends only event data (which command, confidence, time). Raw audio is never transmitted or stored. The hub and website work on a local network without internet access.
