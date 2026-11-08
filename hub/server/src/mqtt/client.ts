import mqtt, { MqttClient } from 'mqtt';
import { db } from '../db/db.js';
import { broadcastWs } from '../ws/wsHandler.js';
import crypto from 'crypto';

export let mqttClient: MqttClient;

// Map of pending command callbacks: cmdId -> { resolve, reject, timer }
const pendingCommands = new Map<string, {
  resolve: (res: any) => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}>();

export function initMqttClient(brokerUrl = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883') {
  console.log(`[MQTT Client] Connecting to broker at ${brokerUrl}...`);
  mqttClient = mqtt.connect(brokerUrl, {
    clientId: `asva-hub-server-${Math.random().toString(16).substring(2, 8)}`,
    clean: true,
    reconnectPeriod: 2000,
  });

  mqttClient.on('connect', () => {
    console.log('[MQTT Client] Connected to MQTT broker.');
    // Subscribe to all ASVA topics: asva/<deviceId>/<topic>
    mqttClient.subscribe('asva/+/+', (err) => {
      if (err) console.error('[MQTT Client] Subscription error:', err);
      else console.log('[MQTT Client] Subscribed to asva/+/+');
    });
  });

  mqttClient.on('error', (err) => {
    console.warn('[MQTT Client] Connection error:', err.message);
  });

  mqttClient.on('message', (topic, payloadBuffer) => {
    const payloadStr = payloadBuffer.toString().trim();
    const parts = topic.split('/');
    if (parts.length !== 3 || parts[0] !== 'asva') return;

    const deviceId = parts[1];
    const subTopic = parts[2];
    const now = Math.floor(Date.now() / 1000);

    // Ensure device exists in DB
    const checkDev = db.prepare('SELECT id FROM devices WHERE id = ?').get(deviceId);
    if (!checkDev) {
      db.prepare(`
        INSERT INTO devices (id, name, location, firmware_version, last_seen_at, online, led_on, threshold, created_at)
        VALUES (?, ?, 'Auto-Registered Lab Node', '1.0.0', ?, 1, 0, 0.80, ?)
      `).run(deviceId, `ASVA Node (${deviceId})`, now, now);
      console.log(`[MQTT] Auto-registered new device: ${deviceId}`);
    }

    try {
      if (subTopic === 'online') {
        const isOnline = payloadStr === 'online' ? 1 : 0;
        db.prepare('UPDATE devices SET online = ?, last_seen_at = ? WHERE id = ?').run(isOnline, now, deviceId);
        broadcastWs({
          type: 'device.online',
          deviceId,
          online: Boolean(isOnline),
          ts: now,
        });
      } else if (subTopic === 'status') {
        const data = JSON.parse(payloadStr);
        // {"led":true,"heap":183000,"rssi":-58,"uptime":3600,"fw":"1.0.0","threshold":0.80}
        const ledOn = data.led ? 1 : 0;
        const threshold = typeof data.threshold === 'number' ? data.threshold : 0.80;
        const fw = data.fw || '1.0.0';

        db.prepare(`
          UPDATE devices
          SET online = 1, led_on = ?, threshold = ?, firmware_version = ?, last_seen_at = ?
          WHERE id = ?
        `).run(ledOn, threshold, fw, now, deviceId);

        // Store telemetry if heap & rssi present
        if (typeof data.heap === 'number' && typeof data.rssi === 'number') {
          const telemId = `telem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          db.prepare(`
            INSERT INTO telemetry (id, device_id, heap_bytes, rssi, uptime_s, ts)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(telemId, deviceId, data.heap, data.rssi, data.uptime || 0, now);
        }

        broadcastWs({
          type: 'device.status',
          deviceId,
          status: {
            online: true,
            led: Boolean(ledOn),
            heap: data.heap,
            rssi: data.rssi,
            uptime: data.uptime,
            fw,
            threshold,
          },
          ts: now,
        });
      } else if (subTopic === 'event') {
        const data = JSON.parse(payloadStr);
        // {"kind":"wake"|"command","text":"...","conf":0.93,"latency_ms":110,"ts":1767225600}
        const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const kind = data.kind === 'wake' ? 'wake' : 'command';
        const text = data.text || (kind === 'wake' ? 'Hello ASVA' : 'Light on');
        const conf = typeof data.conf === 'number' ? data.conf : 0.90;
        const latency = typeof data.latency_ms === 'number' ? data.latency_ms : 120;
        const eventTs = data.ts || now;

        // Check if an active session exists for this device
        const activeSession = db.prepare(`
          SELECT id FROM sessions WHERE device_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1
        `).get(deviceId) as { id: string } | undefined;

        db.prepare(`
          INSERT INTO events (id, device_id, session_id, kind, text, confidence, latency_ms, wrong, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).run(eventId, deviceId, activeSession ? activeSession.id : null, kind, text, conf, latency, eventTs);

        // If command was recognized and it affects LED, update device LED state in DB
        if (kind === 'command') {
          if (text.toLowerCase().includes('light on')) {
            db.prepare('UPDATE devices SET led_on = 1, last_seen_at = ? WHERE id = ?').run(now, deviceId);
          } else if (text.toLowerCase().includes('light off')) {
            db.prepare('UPDATE devices SET led_on = 0, last_seen_at = ? WHERE id = ?').run(now, deviceId);
          }
        }

        broadcastWs({
          type: 'device.event',
          deviceId,
          event: {
            id: eventId,
            deviceId,
            sessionId: activeSession ? activeSession.id : null,
            kind,
            text,
            confidence: conf,
            latency_ms: latency,
            wrong: false,
            ts: eventTs,
          },
        });
      } else if (subTopic === 'ack') {
        const data = JSON.parse(payloadStr);
        // {"id":"c-123","ok":true} or {"id":"c-123","ok":false,"error":"unknown"}
        if (data.id && pendingCommands.has(data.id)) {
          const pending = pendingCommands.get(data.id)!;
          clearTimeout(pending.timer);
          pendingCommands.delete(data.id);
          pending.resolve(data);
        }
        broadcastWs({
          type: 'command.result',
          deviceId,
          ack: data,
          ts: now,
        });
      }
    } catch (parseErr: any) {
      console.warn(`[MQTT] Error parsing message on ${topic}:`, parseErr.message);
    }
  });
}

/**
 * Send command to device over MQTT and await acknowledgement within timeoutMs (default 5000ms)
 */
export function sendDeviceCommand(deviceId: string, commandObj: any, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const cmdId = commandObj.id || `c-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const fullPayload = { ...commandObj, id: cmdId };

    const timer = setTimeout(() => {
      pendingCommands.delete(cmdId);
      reject(new Error(`Command ${cmdId} timed out after ${timeoutMs}ms without ACK from device.`));
    }, timeoutMs);

    pendingCommands.set(cmdId, { resolve, reject, timer });

    const topic = `asva/${deviceId}/cmd`;
    mqttClient.publish(topic, JSON.stringify(fullPayload), { qos: 0 }, (err) => {
      if (err) {
        clearTimeout(timer);
        pendingCommands.delete(cmdId);
        reject(err);
      }
    });
  });
}

