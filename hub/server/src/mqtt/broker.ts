import aedesFactory from 'aedes';
import { createServer, Server } from 'net';

export let embeddedBrokerServer: Server | null = null;

export function startEmbeddedBroker(port = 1883): Promise<boolean> {
  return new Promise((resolve) => {
    const broker = (aedesFactory as any)();
    const server = createServer(broker.handle);

    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[MQTT Broker] Port ${port} is already in use (external Mosquitto broker active). Using external broker.`);
      } else {
        console.warn(`[MQTT Broker] Failed to bind port ${port}:`, err.message);
      }
      resolve(false);
    });

    server.listen(port, '0.0.0.0', () => {
      console.log(`[MQTT Broker] Embedded Aedes broker listening on port ${port}`);
      embeddedBrokerServer = server;
      resolve(true);
    });
  });
}
