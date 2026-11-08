import { useEffect, useState, useCallback, useRef } from 'react';

type WsMessage =
  | { type: 'system.ready'; message: string; serverTime: number }
  | { type: 'device.status'; deviceId: string; status: any; ts: number }
  | { type: 'device.online'; deviceId: string; online: boolean; ts: number }
  | { type: 'device.event'; deviceId: string; event: any; ts: number }
  | { type: 'command.result'; deviceId: string; ack: any; ts: number }
  | { type: 'event.updated'; id: string; wrong: boolean };

export function useWs(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          // attempt reconnect handled by remount
        }
      }, 3000);
    };
    ws.onerror = () => setConnected(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage;
        cbRef.current(msg);
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const send = useCallback((payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { connected, send };
}
