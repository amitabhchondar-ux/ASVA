# ASVA: Advanced Speech and Voice Activation

> **Edge-Native Offline Voice Activation for ESP32 with Interactive 3D Management Platform**  
> *Project SIH26172 · Sub-Second Recognition · Zero-Audio Retention · Air-Gapped Local Operation*

[![Node.js](https://img.shields.io/badge/Node.js-24%20LTS-green.svg)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Backend-Fastify-blue.svg)](https://fastify.dev/)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Three.js-orange.svg)](https://threejs.org/)
[![MQTT](https://img.shields.io/badge/Protocol-MQTT%201883-purple.svg)](https://mqtt.org/)
[![Privacy](https://img.shields.io/badge/Privacy-Zero--Audio%20Storage-red.svg)](#privacy--zero-audio-architecture)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

---

## ⚡ Quick Start (Run in 2 Minutes)

Anyone can clone and run this entire platform locally in **under 2 minutes**—no ESP32 hardware required! A virtual hardware twin is included.

### Prerequisites
- **Git**
- **Node.js 20+ or 24+** ([Download Node.js](https://nodejs.org/))

---

### 💻 Option 1: Windows (One-Click)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/amitabhchondar-ux/ASVA.git
   cd ASVA
   ```
2. **Setup:** Double-click **`setup.bat`**  
   *(Installs all dependencies and builds the 3D UI in ~40 seconds)*
3. **Launch:** Double-click **`start-all.bat`**  
   *(Launches the Hub Server + Simulator and automatically opens your browser)*

---

### 🍏 Option 2: Mac / Linux (One-Command)

1. **Clone and setup:**
   ```bash
   git clone https://github.com/amitabhchondar-ux/ASVA.git
   cd ASVA
   chmod +x setup.sh start-all.sh
   ./setup.sh
   ```
2. **Launch:**
   ```bash
   ./start-all.sh
   ```
3. Open **[`http://localhost:8080`](http://localhost:8080)** in Google Chrome or any browser.

---

### 📦 Option 3: Standard NPM Commands (Any OS)

```bash
git clone https://github.com/amitabhchondar-ux/ASVA.git
cd ASVA

# 1. One-step install & build across all modules
npm run setup

# 2. In Terminal 1: Start Hub Server & MQTT Broker
npm start

# 3. In Terminal 2: Start Virtual ESP32 Simulator
npm run simulate
```

---

### 🔑 Default Credentials & Network Ports
- **Dashboard URL:** [`http://localhost:8080`](http://localhost:8080)
- **Admin Email:** `admin@example.com`
- **Admin Password:** `admin123`
- **WebSocket Gateway:** `ws://localhost:8080/ws`
- **Embedded MQTT Broker:** `localhost:1883`

---

## 📚 Interactive 3D Working Volumes

When you open **[`http://localhost:8080`](http://localhost:8080)**, you will see the **ThreeUI 3D Bookshelf**. Click **Open / Inspect** on any volume to interact with it:

| Volume | Title | Functionality |
|---|---|---|
| **I** | **ASVA Live Console** | Real-time device telemetry (Heap, RSSI, Uptime), physical LED switch, and detection sensitivity slider. |
| **II** | **Event Ledger** | Searchable chronological detection audit log, confidence scores, one-click false-activation flag (`Mark Wrong`), and CSV export. |
| **III** | **Evaluation Lab** | Session test runner, detection rate %, false alarms/hr, and P95 latency calculations. |
| **IV** | **Command Matrix** | Actuator controls, pin mappings (GPIO 10 Relay), and command action binding. |
| **V** | **Virtual ESP32 Twin** | In-browser speech simulation buttons (`Hello ASVA`, `Light on`, `Light off`, `Status`) and raw MQTT wire packet monitor. |
| **VI** | **Privacy Seal** | Mathematical air-gap proof: 0-byte audio storage, RAM-only circular DMA buffers, and lightweight 142-byte JSON metadata. |
| **VII** | **Blueprint & Specs** | ESP32-S3 hardware pinout, state machine transitions, and network topology. |

---

## 🧩 System Architecture: What Each Component Is & What It Does

To help you and any reviewer understand how the pieces connect, here is a breakdown of every layer in the ASVA platform:

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                           FRONTEND (hub/web)                           │
  │    React 18 + Vite + Three.js r165 3D Bookshelf Interface              │
  │    Runs in your web browser at http://localhost:8080                   │
  │    • Volume I-VII Interactive Panels    • Live Gauges & Controls       │
  │    • WebSocket Client for live alerts   • REST Client for DB queries   │
  └───────────────────▲──────────────────────────────────▲─────────────────┘
                      │ HTTP / REST                      │ WebSocket (ws://)
                      ▼                                  ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │                         BACKEND HUB (hub/server)                       │
  │    Fastify + Node.js 24 + Native SQLite Database (node:sqlite)         │
  │    Runs locally on port 8080                                           │
  │    • REST Endpoints (/api/devices, /api/events, /api/sessions, /auth)  │
  │    • WebSocket Hub (/ws) broadcasting live telemetry to all browsers   │
  │    • Audit Log & Session Aggregator with P95 Latency & False Alarm math│
  │                                                                        │
  │    ┌──────────────────────────────────────────────────────────────┐    │
  │    │            EMBEDDED MQTT BROKER (Aedes, Port 1883)           │    │
  │    │  IoT communication backbone between Devices and Backend      │    │
  │    │  • asva/<id>/online   • asva/<id>/status   • asva/<id>/cmd   │    │
  │    └──────────────────────────────▲───────────────────────────────┘    │
  └───────────────────────────────────┼────────────────────────────────────┘
                                      │ MQTT Protocol (Port 1883)
                                      ▼
             ┌─────────────────────────────────────────────────┐
             │                DEVICE LAYER                     │
             │                                                 │
             │   Option A: Physical Hardware (firmware/)       │
             │   • ESP32-S3 Microcontroller + I²S Microphone    │
             │   • On-device Neural Wake Word (Zero-Audio)     │
             │   • Physical Relay / LED switch on GPIO 10      │
             │                                                 │
             │   Option B: Virtual Twin (hub/simulator/)       │
             │   • Node.js software emulation of the ESP32     │
             │   • Allows testing all features without hardware│
             └─────────────────────────────────────────────────┘
```

### Component Breakdown Table

| Component | Directory | Technologies Used | What It Is | What It Is Used For |
|---|---|---|---|---|
| **1. Frontend** | `hub/web/` | React 18, Vite, Three.js (r165), Tailwind CSS | The visual user interface running inside your browser. | Displays the interactive **3D Bookshelf**, live telemetry dials, toggles physical/virtual LEDs, triggers speech simulations, reviews detection history, flags misrecognitions (`Mark Wrong`), and downloads CSV reports. |
| **2. Backend Server** | `hub/server/` | Fastify, TypeScript, Node.js 24 | The central API and application server. | Serves the web dashboard, manages user authentication (JWT cookies), runs database queries, validates device command ACKs with 5-second timeouts, and pushes real-time WebSocket events. |
| **3. Embedded Database** | `hub/server/data/` | Native SQLite (`node:sqlite`) | Lightweight, zero-setup, serverless SQL database stored in a single file (`asva.db`). | Stores persistent records: registered devices, telemetry time-series, historical voice events, evaluation benchmark sessions, and security audit logs with zero external database dependencies. |
| **4. MQTT Broker** | `hub/server/src/mqtt/` | Aedes (Embedded MQTT) | An ultra-lightweight message broker listening on port `1883`. | The "air traffic controller" for hardware. Devices publish status heartbeats and detection events here; the server publishes actuator commands (`led`, `threshold`) here with instant Last-Will failover detection. |
| **5. Device Simulator** | `hub/simulator/` | Node.js, TypeScript, MQTT.js | A software-based "hardware twin" that acts exactly like an ESP32. | Enables full end-to-end testing without buying or wiring hardware. Publishes realistic heap memory noise, Wi-Fi RSSI signals, responds to LED commands with ACKs, and simulates voice wake words. |
| **6. Microcontroller Firmware** | `firmware/` | ESP-IDF 5.x, C++ | Code compiled directly onto the physical ESP32-S3 microcontroller. | Samples raw audio from the I²S MEMS microphone, runs on-chip neural wake-word detection, controls physical relays/LEDs on GPIO 10, and connects to local Wi-Fi and MQTT. **Audio never leaves RAM.** |
| **7. Machine Learning Pipeline** | `ml/` | Python 3, TensorFlow, TFLite | Offline model training and optimization scripts. | Prepares acoustic datasets, trains Depthwise Separable CNN (DS-CNN) models, and performs INT8 quantization so the model fits in the tight memory of the ESP32 SRAM. |

---

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
