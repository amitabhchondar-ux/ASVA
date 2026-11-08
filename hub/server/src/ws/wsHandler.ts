import { WebSocket } from 'ws';

const activeClients = new Set<WebSocket>();

export function registerWsClient(socket: WebSocket) {
  activeClients.add(socket);
  // Send initial welcome message
  socket.send(JSON.stringify({
    type: 'system.ready',
    message: 'Connected to ASVA Hub Real-Time WebSocket Link',
    serverTime: Math.floor(Date.now() / 1000),
  }));

  socket.on('close', () => {
    activeClients.delete(socket);
  });

  socket.on('error', (err) => {
    console.warn('[WS] Client socket error:', err.message);
    activeClients.delete(socket);
  });
}

export function broadcastWs(message: any) {
  const payload = JSON.stringify(message);
  for (const client of activeClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        activeClients.delete(client);
      }
    }
  }
}

