import mqtt from 'mqtt';
import readline from 'readline';

// Parse CLI args: --broker <url> --id <deviceId>
const args = process.argv.slice(2);
let brokerUrl = 'mqtt://127.0.0.1:1883';
let deviceId = 'asva-sim-01';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--broker' && args[i + 1]) {
    brokerUrl = args[i + 1];
    i++;
  } else if (args[i] === '--id' && args[i + 1]) {
    deviceId = args[i + 1];
    i++;
  }
}

console.log(`\n======================================================`);
console.log(`  Starting ASVA Virtual ESP32 Device Simulator`);
console.log(`  Device ID : ${deviceId}`);
console.log(`  Broker    : ${brokerUrl}`);
console.log(`======================================================\n`);

let ledState = false;
let threshold = 0.80;
let heapBytes = 184500;
let rssi = -58;
let uptimeSeconds = 0;
const firmwareVersion = '1.0.0-SIM';

const topicOnline = `asva/${deviceId}/online`;
const topicStatus = `asva/${deviceId}/status`;
const topicEvent = `asva/${deviceId}/event`;
const topicCmd = `asva/${deviceId}/cmd`;
const topicAck = `asva/${deviceId}/ack`;

// Connect with Last-Will-and-Testament (LWT)
const client = mqtt.connect(brokerUrl, {
  clientId: `device-${deviceId}`,
  clean: true,
  will: {
    topic: topicOnline,
    payload: Buffer.from('offline'),
    qos: 1,
    retain: true,
  },
});

function publishStatus() {
  // Add small realistic noise to telemetry
  heapBytes = Math.max(140000, Math.min(220000, heapBytes + Math.floor((Math.random() - 0.5) * 1200)));
  rssi = Math.max(-85, Math.min(-45, rssi + Math.floor((Math.random() - 0.5) * 3)));

  const payload = {
    led: ledState,
    heap: heapBytes,
    rssi,
    uptime: uptimeSeconds,
    fw: firmwareVersion,
    threshold,
  };

  client.publish(topicStatus, JSON.stringify(payload), { retain: true, qos: 0 });
  console.log(`[STATUS] Published telemetry: LED=${ledState ? 'ON' : 'OFF'}, Heap=${heapBytes}B, RSSI=${rssi}dBm, Uptime=${uptimeSeconds}s`);
}

function emitEvent(kind: 'wake' | 'command', text: string, conf?: number, latency?: number) {
  const c = conf !== undefined ? conf : Number((0.85 + Math.random() * 0.12).toFixed(2));
  const l = latency !== undefined ? latency : Math.floor(90 + Math.random() * 60);
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    kind,
    text,
    conf: c,
    latency_ms: l,
    ts: now,
  };

  client.publish(topicEvent, JSON.stringify(payload), { qos: 0 });
  console.log(`[EVENT] Emitted: [${kind.toUpperCase()}] "${text}" (conf: ${c}, latency: ${l}ms)`);
}

client.on('connect', () => {
  console.log(`[MQTT] Connected to broker successfully!`);

  // 1. Publish retained online message
  client.publish(topicOnline, 'online', { retain: true, qos: 1 });
  console.log(`[ONLINE] Published online presence.`);

  // 2. Publish initial status
  publishStatus();

  // 3. Subscribe to command topic
  client.subscribe(topicCmd, (err) => {
    if (err) console.error('[MQTT] Subscription error on cmd topic:', err);
    else console.log(`[MQTT] Subscribed to commands on: ${topicCmd}`);
  });

  // Uptime ticker and periodic 10-second status publisher
  setInterval(() => {
    uptimeSeconds += 10;
    publishStatus();
  }, 10000);

  printHelp();
});

client.on('message', (topic, message) => {
  if (topic !== topicCmd) return;

  try {
    const data = JSON.parse(message.toString());
    console.log(`[CMD RECEIVED]`, data);

    const cmdId = data.id || 'unknown';

    if (data.cmd === 'led') {
      ledState = data.state === 'on';
      console.log(`[ACTUATOR] LED switched -> ${ledState ? '💡 HIGH (ON)' : '⚫ LOW (OFF)'}`);
      client.publish(topicAck, JSON.stringify({ id: cmdId, ok: true }), { qos: 0 });
      publishStatus();
    } else if (data.cmd === 'threshold') {
      if (typeof data.value === 'number') {
        threshold = Math.max(0.5, Math.min(0.99, Number(data.value.toFixed(2))));
        console.log(`[CONFIG] Wake sensitivity threshold adjusted -> ${threshold}`);
        client.publish(topicAck, JSON.stringify({ id: cmdId, ok: true }), { qos: 0 });
        publishStatus();
      } else {
        client.publish(topicAck, JSON.stringify({ id: cmdId, ok: false, error: 'Invalid threshold' }), { qos: 0 });
      }
    } else if (data.cmd === 'status') {
      client.publish(topicAck, JSON.stringify({ id: cmdId, ok: true }), { qos: 0 });
      publishStatus();
    } else {
      client.publish(topicAck, JSON.stringify({ id: cmdId, ok: false, error: `Unknown command "${data.cmd}"` }), { qos: 0 });
    }
  } catch (err: any) {
    console.error('[ERROR] Failed to handle command:', err.message);
  }
});

function printHelp() {
  console.log(`\n--- Interactive Simulator Controls ---`);
  console.log(`  [w] Trigger Wake Word ("Hello ASVA")`);
  console.log(`  [1] Recognize "Light on"`);
  console.log(`  [0] Recognize "Light off"`);
  console.log(`  [s] Recognize "Status"`);
  console.log(`  [f] Trigger false positive wake word (for testing "wrong" flags)`);
  console.log(`  [d] Simulate disconnect & reconnect`);
  console.log(`  [q] Quit`);
  console.log(`--------------------------------------\n`);
}

// Interactive terminal listener
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  process.stdin.on('keypress', (str, key) => {
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      console.log('\nStopping simulator cleanly...');
      client.publish(topicOnline, 'offline', { retain: true, qos: 1 }, () => {
        client.end();
        process.exit(0);
      });
    } else if (key.name === 'w') {
      emitEvent('wake', 'Hello ASVA');
    } else if (str === '1') {
      emitEvent('command', 'Light on');
      ledState = true;
      publishStatus();
    } else if (str === '0') {
      emitEvent('command', 'Light off');
      ledState = false;
      publishStatus();
    } else if (key.name === 's') {
      emitEvent('command', 'Status');
      publishStatus();
    } else if (key.name === 'f') {
      emitEvent('wake', 'Hello ASVA', 0.54, 180); // Low confidence false trigger
    } else if (key.name === 'd') {
      console.log('[NETWORK] Simulating power cut / disconnect...');
      client.publish(topicOnline, 'offline', { retain: true, qos: 1 });
      setTimeout(() => {
        console.log('[NETWORK] Reconnecting...');
        client.publish(topicOnline, 'online', { retain: true, qos: 1 });
        publishStatus();
      }, 3000);
    }
  });
}

