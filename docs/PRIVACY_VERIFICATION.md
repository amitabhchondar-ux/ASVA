# Verifying ASVA's Privacy Claims

ASVA claims that **raw audio is never stored or transmitted**. A claim is only worth something if someone can check it. This guide gives you three independent checks, a place to record the results, and the numbers to compare against.

You need to complete all three checks to make the claim in your README, report or presentation.

| Check | Question it answers | Needs |
|---|---|---|
| A. Network capture | Does audio-sized traffic leave the device? | A laptop with Wireshark or `tcpdump` |
| B. Firmware inspection | Is there any code path that sends or saves audio? | The firmware source |
| C. Storage check | Does the hub or the device keep any audio file? | Access to the hub and the build |

---

## Why the numbers matter

Speech for wake-word models is normally sampled at 16 kHz, 16-bit, mono:

```
16,000 samples/s × 2 bytes = 32,000 bytes per second (≈ 31 KiB/s ≈ 256 kbit/s)
```

Streaming even compressed speech would show up as a steady flow of at least several KiB/s while someone is talking. An ASVA event is a JSON message of roughly 70-150 bytes, sent once per detection. **That is hundreds of times smaller than the audio it came from.** The capture below should show exactly that difference.

If your microphone runs at a different rate or width, recompute: `rate × bytes_per_sample × channels`.

---

## A. Network capture

### A.1 Set up a capture point

The device talks Wi-Fi to the router, so your laptop must see that traffic. Pick one:

| Method | How | Notes |
|---|---|---|
| **Laptop as hotspot** (easiest) | Turn on your laptop's mobile hotspot, connect the ESP32 to it, set the hub IP to the laptop's hotspot address, capture on the hotspot interface | All device traffic passes through the laptop |
| **Capture on the hub** | The hub already receives everything the device sends to it | Shows traffic **to the hub** only; misses anything sent elsewhere, so also do A.4 |
| **Router/switch mirror** | A managed switch or OpenWrt router mirrors the device port | Most complete, more setup |

Use the hotspot method plus A.4 for a complete picture.

### A.2 Capture

Find the device's IP in your router, hotspot client list or the serial monitor. Then:

```bash
# Linux/macOS (replace wlan0/en0 and the IP)
sudo tcpdump -i wlan0 -nn host 192.168.137.50 -w asva-session.pcap

# Windows: open Wireshark, choose the hotspot adapter, capture filter:  host 192.168.137.50
```

Capture a **session** of at least 10 minutes:

1. 2 minutes of silence
2. 2 minutes of continuous talking near the device, **without** the wake word
3. 10 uses of "Hello ASVA, light on" / "light off" / "status"
4. 2 minutes of TV or music playing nearby
5. Unplug and re-plug the device once

Stop the capture. Save it as `asva-session.pcap` (it is git-ignored; do not commit it, it contains LAN details).

### A.3 Analyse

```bash
# Who did the device talk to, and how much?
tshark -r asva-session.pcap -q -z conv,ip
tshark -r asva-session.pcap -q -z conv,tcp
tshark -r asva-session.pcap -q -z conv,udp

# Throughput per second (look for sustained flows near 32 KB/s)
tshark -r asva-session.pcap -q -z io,stat,1

# Largest packets
tshark -r asva-session.pcap -T fields -e frame.len | sort -n | tail -5

# Anything that is not MQTT, DNS, NTP, ARP or DHCP?
tshark -r asva-session.pcap -Y '!(tcp.port==1883 || tcp.port==8883 || udp.port==53 || udp.port==123 || arp || udp.port==67 || udp.port==68)' | head
```

In Wireshark you can also use **Statistics → Conversations**, **Statistics → I/O Graph**, and **Statistics → Protocol Hierarchy**.

### A.4 What a pass looks like

| Observation | Pass | Fail |
|---|---|---|
| Destinations | Only the hub IP (plus optional DNS/NTP/DHCP) | Any other IP, cloud server or domain |
| TCP connections | One long-lived connection to hub port 1883 (or 8883) | Extra connections to other ports |
| UDP flows | DNS/NTP only | Any RTP, WebSocket or UDP stream |
| Throughput while talking without the wake word | Same as silence (heartbeat only) | Rises while you talk |
| Largest packet | Under ~500 bytes | Anything near 1,000+ bytes in steady streams |
| Total bytes in a 10 min session | A few KiB to a few tens of KiB | Megabytes |
| Payload when decoded | Small JSON (`status`, `event`, `ack`, `online`) | Binary blobs, base64, WAV/PCM headers (`RIFF`) |

To inspect MQTT payloads (they are plain text unless you enable TLS):

```bash
tshark -r asva-session.pcap -Y mqtt -T fields -e mqtt.topic -e mqtt.msg | head -40
```

Also test the negative: search for audio signatures.

```bash
strings -n 8 asva-session.pcap | grep -iE "RIFF|WAVE|fmt |data" | head
```
Expected: no output.

### A.5 Measure the real event size

The Privacy Seal volume currently states a figure (142 bytes). **Measure it and make the UI and README match reality:**

```bash
tshark -r asva-session.pcap -Y 'mqtt.topic contains "/event"' -T fields -e mqtt.len | sort -n | uniq -c
```
Record the minimum, typical and maximum in the results table below.

### A.6 If TLS is enabled

You will not see MQTT payloads, but you will still see sizes and destinations. Repeat the throughput checks; they are the important ones.

---

## B. Firmware inspection

The goal is to show there is **no code path** that sends or stores audio.

### B.1 Read every network call

```bash
cd firmware/main
grep -rnE "esp_mqtt_client_publish|esp_http_client|esp_websocket|lwip_send|send\(|sendto\(|httpd_" .
```
For each hit, write down what data it sends. Only the event, status, ack and online JSON strings are allowed. Confirm none takes the I²S buffer or any pointer derived from it.

### B.2 Follow the audio buffer

```bash
grep -rnE "i2s_(channel_)?read|audio_buf|ring|dma" .
```
Draw the data path (microphone → buffer → model → score). The buffer should end at the model input and be overwritten continuously. Note the buffer size and confirm it is a fixed static array or ring buffer (RAM), not a growing allocation.

### B.3 Look for storage

```bash
grep -rnE "fopen|fwrite|SPIFFS|LittleFS|FATFS|sdmmc|nvs_set_blob|esp_vfs" .
cat ../partitions.csv 2>/dev/null
```
Expected: no file writes of audio; no data partition intended for recordings; NVS used only for small settings (Wi-Fi, threshold, device ID).

### B.4 Check the build

```bash
cd firmware
idf.py size-components | head -30
idf.py size
```
Record the free heap you observe at runtime: the `heap` value in the Live Console. A ring buffer should keep memory flat during a long session; steady growth suggests a leak or accumulation.

### B.5 Peer check

Ask a classmate to read B.1-B.3 and sign off in the table below. A second pair of eyes catches what you stop seeing.

---

## C. Storage check on the hub

```bash
# The database holds events, not audio
sqlite3 hub/server/data/asva.db ".tables"
sqlite3 hub/server/data/asva.db ".schema events"

# Look for audio-like columns or big blobs
sqlite3 hub/server/data/asva.db "SELECT name, type FROM pragma_table_info('events');"
sqlite3 hub/server/data/asva.db "SELECT MAX(LENGTH(text)), MAX(LENGTH(CAST(text AS BLOB))) FROM events;"

# Any audio files anywhere in the project?
find . -type f \( -name "*.wav" -o -name "*.mp3" -o -name "*.pcm" -o -name "*.raw" -o -name "*.flac" -o -name "*.ogg" \) -not -path "./node_modules/*" -not -path "./ml/data/*"

# Size of the database after the full capture session
ls -lh hub/server/data/asva.db
```
Expected: no BLOB/audio columns; text limited to the command vocabulary; no audio files outside `ml/` training data; database size in the KB range after a short session.

> The `ml/` folder may legitimately contain training audio you recorded or downloaded. Say clearly in the README that **training data is separate from runtime behaviour**, and do not commit recordings of real people without their consent.

---

## Results record (fill in and keep in the repo)

| Field | Value |
|---|---|
| Date | |
| Firmware commit | |
| Hub commit | |
| Device IP | |
| Capture method | hotspot / hub / mirror |
| Capture length | |
| Total bytes device → hub | |
| Destinations seen | |
| Largest packet (bytes) | |
| Throughput while talking (no wake word) | |
| Event size: min / typical / max (bytes) | |
| Non-MQTT/DNS/NTP traffic | none / describe |
| `RIFF`/`WAVE` signatures found | none / describe |
| B.1 network calls reviewed | ☐ |
| B.2 audio data path documented | ☐ |
| B.3 no storage code for audio | ☐ |
| C database has no audio | ☐ |
| Reviewer (name) | |

Store the screenshots (Conversations table, I/O graph, protocol hierarchy) in `docs/images/privacy-*.png`. **Do not** commit the `.pcap` itself.

## What you can honestly claim afterwards

If everything passes, you can write: *"In a 10-minute capture covering silence, continuous speech and 10 commands, the device sent only N KiB, all to the hub over MQTT; the largest packet was X bytes, versus about 32 KB/s that raw 16 kHz 16-bit audio would require. Source review found no code that transmits or stores audio."*

If anything fails, **fix it, or change the claim**. A smaller true claim is better than a larger one that a reviewer can disprove.

## Limits of this verification

- It shows behaviour in your test session, not a mathematical proof. Avoid the phrase "mathematical proof" unless you have actually formalised and proven something.
- A modified firmware could behave differently; secure boot and signed updates (roadmap) address that.
- It covers the device-to-hub path. If you add cloud features later, repeat the checks.
