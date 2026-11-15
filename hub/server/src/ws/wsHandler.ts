import { WebSocket } from 'ws';

export type WsUser = { id: string; role: 'admin' | 'viewer' };
const socketsByUser = new Map<string, Set<WebSocket>>();
const allSockets = new Set<WebSocket>();

const MAX_SOCKETS_PER_USER = 5;

export function registerWsClient(socket: WebSocket, user?: WsUser) {
  const userId = user?.id || 'guest';
  const set = socketsByUser.get(userId) ?? new Set();

  if (set.size >= MAX_SOCKETS_PER_USER) {
    socket.close(1008, 'Too many connections');
    return;
  }

  set.add(socket);
  socketsByUser.set(userId, set);
  allSockets.add(socket);

  // Send initial welcome message
  socket.send(JSON.stringify({
    type: 'system.ready',
    message: 'Connected to ASVA Hub Real-Time WebSocket Link',
    role: user?.role || 'viewer',
    serverTime: Math.floor(Date.now() / 1000),
  }));

  socket.on('close', () => {
    set.delete(socket);
    allSockets.delete(socket);
  });

  socket.on('error', (err) => {
    console.warn('[WS] Client socket error:', err.message);
    set.delete(socket);
    allSockets.delete(socket);
  });

  // Basic message handling (e.g. ping/pong)
  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', ts: Math.floor(Date.now() / 1000) }));
      }
    } catch {}
  });
}

export function broadcastWs(message: any) {
  const payload = JSON.stringify(message);
  for (const client of allSockets) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        allSockets.delete(client);
      }
    }
  }
}
