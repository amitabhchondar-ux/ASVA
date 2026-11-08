import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, Device, Event } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useWs } from '../hooks/useWs';
import {
  Power,
  RefreshCw,
  ToggleRight,
  Terminal,
  Wifi,
  Clock,
  RefreshCcw,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';

type StatusData = {
  led: boolean;
  heap: number;
  rssi: number;
  uptime: number;
  fw: string;
  threshold: number;
};

export function DevicePage() {
  const { deviceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [ackStatus, setAckStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [newThreshold, setNewThreshold] = useState('');

  const { connected, send } = useWs((msg) => {
    if (msg.type === 'device.status' && msg.deviceId === deviceId) {
      setStatus(msg.status);
      if (msg.status.led !== undefined) {
        setDevice((d) => (d ? { ...d, led_on: msg.status.led ? 1 : 0 } : d));
      }
      if (msg.status.threshold !== undefined) {
        setDevice((d) => (d ? { ...d, threshold: msg.status.threshold } : d));
      }
    }
    if (msg.type === 'device.online' && msg.deviceId === deviceId) {
      setDevice((d) => (d ? { ...d, online: msg.online ? 1 : 0 } : d));
    }
    if (msg.type === 'device.event' && msg.deviceId === deviceId) {
      setEvents((prev) => [msg.event, ...prev].slice(0, 50));
    }
    if (msg.type === 'command.result' && msg.deviceId === deviceId) {
      const ack = msg.ack;
      if (ack.ok) {
        setAckStatus({ ok: true, msg: 'Command acknowledged by device' });
      } else {
        setAckStatus({ ok: false, msg: ack.error || 'Command failed' });
      }
      setTimeout(() => setAckStatus(null), 3000);
    }
  });

  const fetchDevice = useCallback(async () => {
    try {
      const data = await api.devices.get(deviceId!);
      setDevice(data.device);
      if (data.recentTelemetry && data.recentTelemetry.length > 0) {
        const latest = data.recentTelemetry[0];
        setStatus({
          led: data.device.led_on === 1,
          heap: latest.heap_bytes,
          rssi: latest.rssi,
          uptime: latest.uptime_s,
          fw: data.device.firmware_version,
          threshold: data.device.threshold,
        });
      }
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchDevice();
  }, [fetchDevice, connected]);

  useEffect(() => {
    const interval = setInterval(fetchDevice, 10000);
    return () => clearInterval(interval);
  }, [fetchDevice]);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api.events.list({ device: deviceId!, limit: '50' });
      setEvents(data.events || []);
    } catch {
      // ignore
    }
  }, [deviceId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const sendCommand = async (cmd: { cmd: string; state?: string; value?: number }) => {
    if (!device?.online) return;
    setSending(cmd.cmd);
    setAckStatus(null);
    try {
      await api.devices.command(deviceId!, cmd);
      // Wait briefly for ack via WebSocket
    } catch (err: any) {
      setAckStatus({ ok: false, msg: err.message || 'Command failed' });
      setTimeout(() => setAckStatus(null), 3000);
    } finally {
      setSending(null);
    }
  };

  const handleLedToggle = () => {
    sendCommand({ cmd: 'led', state: device?.led_on ? 'off' : 'on' });
  };

  const handleStatusRequest = () => {
    sendCommand({ cmd: 'status' });
  };

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewThreshold(e.target.value);
  };

  const handleThresholdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newThreshold);
    if (isNaN(val) || val < 0.5 || val > 0.99) {
      setAckStatus({ ok: false, msg: 'Threshold must be between 0.50 and 0.99' });
      setTimeout(() => setAckStatus(null), 3000);
      return;
    }
    sendCommand({ cmd: 'threshold', value: val });
    setNewThreshold('');
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="w-12 h-12 rounded-full border-4 border-[#c87046]/30 border-t-[#c87046]" />
          <p className="text-[#b9b4ae]">Loading device…</p>
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div>
          <AlertCircle size={48} className="text-[#f43f5e] mb-3" />
          <h2 className="text-lg font-medium text-[#f4eee6]">Device not found</h2>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 text-sm bg-[#c87046] text-white rounded hover:bg-[#b8663e]"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-[#f4eee6]">{device.name}</h1>
          <p className="text-[#b9b4ae]">{device.id} · {device.location}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            device.online ? 'bg-[#4ade80]/20 border-[#4ade80] text-[#4ade80]' : 'bg-[#94a3b8]/20 border-[#94a3b8] text-[#94a3b8]'
          }`}>
            <div className={`w-2 h-2 rounded-full ${device.online ? 'bg-[#4ade80]' : 'bg-[#94a3b8]'}`} />
            {device.online ? 'Online' : 'Offline'}
          </div>
          <button
            onClick={fetchDevice}
            disabled={!device.online}
            className="px-3 py-1.5 text-xs bg-[#2a2f3e] text-[#b9b4ae] rounded hover:bg-[#3a4150] disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className="mr-1" /> Refresh
          </button>
        </div>
      </div>

      {!device.online && (
        <div className="rounded-lg bg-[#4a1a1a]/50 border border-[#7a2a2a]/50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-[#f43f5e]" />
            <span className="text-sm text-[#f4eee6]">Device is offline. Controls are disabled. The device will reconnect automatically when it returns to the network.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Live controls */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
            <h3 className="font-medium text-[#f4eee6] mb-4">Controls</h3>
            <div className="space-y-3">
              <button
                onClick={handleLedToggle}
                disabled={!device.online || sending === 'led'}
                className={`w-full py-3 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-colors ${
                  device.led_on
                    ? 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/50'
                    : 'bg-[#c87046] text-white'
                } ${!device.online ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Power size={16} />
                {device.led_on ? 'Light Off' : 'Light On'}
              </button>
              <button
                onClick={handleStatusRequest}
                disabled={!device.online || sending === 'status'}
                className={`w-full py-3 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-colors ${
                  !device.online ? 'opacity-50 cursor-not-allowed' : ''
                } bg-[#2a2f3e] text-[#b9b4ae] border border-[#3a4150] hover:bg-[#3a4150]`}
              >
                <Terminal size={16} />
                Get Status
              </button>
              <form onSubmit={handleThresholdSubmit} className="space-y-2">
                <label className="text-xs font-medium text-[#b9b4ae] block">Wake threshold</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newThreshold}
                    onChange={handleThresholdChange}
                    step="0.01"
                    min="0.5"
                    max="0.99"
                    disabled={!device.online || sending === 'threshold'}
                    className="w-20 py-2 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-xs focus:border-[#c87046] focus:outline-none"
                    placeholder="0.80"
                  />
                  <button
                    type="submit"
                    disabled={!device.online || sending === 'threshold'}
                    className="px-3 py-2 bg-[#c87046] text-white rounded-lg text-xs disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
                <p className="text-[10px] text-[#6b6a66]">Range: 0.50 – 0.99</p>
              </form>
            </div>
          </div>

          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
            <h3 className="font-medium text-[#f4eee6] mb-4">Device</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[#b9b4ae]">Device ID</span>
                <span className="text-[#f4eee6] text-xs font-mono truncate">{device.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#b9b4ae]">Location</span>
                <span className="text-[#f4eee6]">{device.location}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#b9b4ae]">Firmware</span>
                <span className="text-[#f4eee6]">{device.firmware_version}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status + Telemetry */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
            <h3 className="font-medium text-[#f4eee6] mb-4">Live indicator</h3>
            <div className="flex items-center gap-3 py-2">
              <div className="w-3 h-3 rounded-full bg-[#c87046] animate-pulse" />
              <span className="text-sm font-medium text-[#f4eee6]">
                {status ? 'Listening' : 'Idle'}
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#2a2f3e]">
              <h4 className="text-xs font-medium text-[#b9b4ae] mb-2">Telemetry</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#b9b4ae]">Free memory</span>
                  <span className="text-[#f4eee6] font-mono">{status ? status.heap.toLocaleString() : '—'} B</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b9b4ae]">Wi-Fi signal</span>
                  <span className="text-[#f4eee6] font-mono">{status ? status.rssi : '—'} dBm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b9b4ae]">Uptime</span>
                  <span className="text-[#f4eee6] font-mono">{status ? Math.floor(status.uptime / 60) + 'm' : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b9b4ae]">Threshold</span>
                  <span className="text-[#f4eee6] font-mono">{status ? status.threshold.toFixed(2) : '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live event feed */}
        <div className="lg:col-span-2">
          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-[#f4eee6]">Live events</h3>
              <button
                onClick={fetchEvents}
                className="text-xs text-[#c87046] hover:text-[#b8663e]"
              >
                <RefreshCcw size={14} className="mr-1" /> Refresh
              </button>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {events.length === 0 ? (
                <div className="text-center py-8 text-[#6b6a66] text-sm">
                  No events yet. Say "Hello ASVA" or trigger events from the simulator.
                </div>
              ) : (
                events.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-start gap-3 p-2.5 rounded bg-[#10131b]/50 border border-transparent hover:border-[#2a2f3e] transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${evt.kind === 'wake' ? 'bg-[#c87046]' : 'bg-[#6366f1]'}`} />
                    <div className="text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${evt.kind === 'wake' ? 'text-[#c87046]' : 'text-[#818cf8]'}`}>
                          {evt.kind === 'wake' ? 'WAKE' : 'CMD'}
                        </span>
                        <span className="text-[#f4eee6] font-mono">{evt.text}</span>
                        {evt.wrong && (
                          <span className="text-xs text-[#f43f5e] bg-[#4a1a1a]/50 px-1.5 py-0.5 rounded">WRONG</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[#6b6a66] mt-0.5">
                        <span>conf {evt.confidence.toFixed(2)}</span>
                        <span>•</span>
                        <span>{evt.latency_ms} ms</span>
                        <span>•</span>
                        <span>{new Date(evt.ts * 1000).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {ackStatus && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg border text-sm font-medium ${
            ackStatus.ok
              ? 'bg-[#4ade80]/20 border-[#4ade80] text-[#4ade80]'
              : 'bg-[#f43f5e]/20 border-[#f43f5e] text-[#f43f5e]'
          }`}
        >
          {ackStatus.ok ? <CheckCircle size={16} className="mr-2" /> : <XCircle size={16} className="mr-2" />}
          {ackStatus.msg}
        </div>
      )}
    </div>
  );
}
