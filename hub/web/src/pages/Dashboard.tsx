import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Device } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import {
  Monitor,
  Wifi,
  Clock,
  Battery,
  RefreshCw,
  ChevronRight,
  Circle,
  TriangleAlert,
} from 'lucide-react';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.devices.list();
      setDevices(data.devices || []);
      setError('');
    } catch (err: any) {
      setError(err.message === 'UNAUTHORIZED' ? 'Session expired' : err.message || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleOpenDevice = (id: string) => {
    navigate(`/device/${id}`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="w-12 h-12 rounded-full border-4 border-[#c87046]/30 border-t-[#c87046] rounded-full" />
          <p className="text-[#b9b4ae]">Loading devices…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <TriangleAlert size={32} className="text-[#f43f5e] mb-3" />
          <h2 className="text-lg font-medium text-[#f4eee6]">{error}</h2>
          <button
            onClick={fetchDevices}
            className="mt-4 px-4 py-2 text-sm bg-[#c87046]/20 text-[#c87046] rounded hover:bg-[#c87046]/40"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-[#f4eee6]">Dashboard</h1>
          <p className="text-[#b9b4ae]">Monitor and control your ASVA devices</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#6b6a66]">{user?.role}</span>
          <button
            onClick={fetchDevices}
            className="px-3 py-1.5 text-xs bg-[#2a2f3e] text-[#b9b4ae] rounded hover:bg-[#3a4150] transition-colors"
          >
            <RefreshCw size={14} className="mr-1" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {devices.length === 0 ? (
          <div className="col-span-3 bg-[#171a24] border border-[#2a2f3e] rounded-xl p-12 text-center">
            <Monitor size={48} className="mx-auto mb-3 text-[#6b6a66]" />
            <h3 className="text-lg font-medium text-[#f4eee6]">No devices found</h3>
            <p className="text-[#6b6a66] mt-1">Connect an ASVA device or run the simulator to see it here.</p>
          </div>
        ) : (
          devices.map((dev) => (
            <div
              key={dev.id}
              onClick={() => handleOpenDevice(dev.id)}
              className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5 hover:border-[#c87046]/50 transition-colors cursor-pointer group"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-medium text-[#f4eee6]">{dev.name}</h3>
                  <p className="text-xs text-[#6b6a66]">{dev.id}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dev.online ? 'bg-[#4ade80]' : 'bg-[#94a3b8]'}`} />
                  <span className="text-xs font-medium">{dev.online ? 'Online' : 'Offline'}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#b9b4ae]">LED</span>
                  <span className={`text-sm font-medium ${dev.led_on ? 'text-[#4ade80]' : 'text-[#94a3b8]'}`}>
                    {dev.led_on ? 'On' : 'Off'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#b9b4ae]">Threshold</span>
                  <span className="text-[#f4eee6]">{dev.threshold.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#b9b4ae]">Firmware</span>
                  <span className="text-[#f4eee6] text-xs font-mono">{dev.firmware_version}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Wifi size={14} className="text-[#6b6a66]" />
                  <span className="text-[#6b6a66]">RSSI: N/A</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#2a2f3e]">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[#b9b4ae]">Last seen:</span>
                  <span className="text-[#f4eee6] font-mono text-xs">
                    {new Date(dev.last_seen_at * 1000).toLocaleTimeString()}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleOpenDevice(dev.id); }}
                  className="mt-3 w-full py-1.5 text-xs bg-[#c87046]/10 text-[#c87046] rounded hover:bg-[#c87046]/20 flex items-center justify-center gap-1"
                >
                  <ChevronRight size={14} /> Open device
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
