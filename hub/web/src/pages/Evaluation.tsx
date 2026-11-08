import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Session, SessionSummary } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import {
  BarChart3,
  Play,
  Square,
  Download,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#c87046', '#6366f1', '#4ade80', '#f43f5e', '#f59e0b'];

export function Evaluation() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDevice, setNewDevice] = useState('');

  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.sessions.list();
      setSessions(data.sessions || []);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newDevice) return;
    setCreating(true);
    try {
      await api.sessions.create({
        name: newName,
        device_id: newDevice,
        speaker: 'Evaluator',
        distance_m: 1,
        noise_level: 'Quiet room (~40dB)',
        attempts: 0,
        notes: '',
      });
      setNewName('');
      setNewDevice('');
      fetchSessions();
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') navigate('/login');
    } finally {
      setCreating(false);
    }
  };

  const viewSession = async (id: string) => {
    setSessionLoading(true);
    try {
      const data = await api.sessions.summary(id);
      setSummary(data);
      setViewMode('detail');
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') navigate('/login');
    } finally {
      setSessionLoading(false);
    }
  };

  const stopSession = async (id: string) => {
    try {
      await api.sessions.stop(id);
      fetchSessions();
      if (summary?.session.id === id) {
        const data = await api.sessions.summary(id);
        setSummary(data);
      }
    } catch {
      // ignore
    }
  };

  const exportSession = async () => {
    if (!summary) return;
    try {
      const csv = await api.sessions.export(summary.session.id);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asva-session-${summary.session.id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  if (viewMode === 'detail' && summary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setViewMode('list')}
            className="flex items-center gap-2 text-sm text-[#c87046] hover:text-[#b8663e]"
          >
            <ChevronLeft size={16} /> Back to sessions
          </button>
          <h1 className="font-serif text-2xl font-semibold text-[#f4eee6]">{summary.session.name}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-4">
            <p className="text-xs text-[#6b6a66] uppercase tracking-wider">Detection rate</p>
            <p className="text-2xl font-medium text-[#f4eee6]">{summary.metrics.detectionRate}%</p>
            <p className="text-xs text-[#b9b4ae] mt-1">{summary.metrics.validWakeCount}/{summary.metrics.attempts} wakes detected</p>
          </div>
          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-4">
            <p className="text-xs text-[#6b6a66] uppercase tracking-wider">False activations/hr</p>
            <p className="text-2xl font-medium text-[#f4eee6]">{summary.metrics.falseActivationsPerHour}</p>
            <p className="text-xs text-[#b9b4ae] mt-1">{summary.metrics.wrongCount} wrong events</p>
          </div>
          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-4">
            <p className="text-xs text-[#6b6a66] uppercase tracking-wider">Avg latency</p>
            <p className="text-2xl font-medium text-[#f4eee6]">{summary.metrics.avgLatency} ms</p>
            <p className="text-xs text-[#b9b4ae] mt-1">P95: {summary.metrics.p95Latency} ms</p>
          </div>
          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-4">
            <p className="text-xs text-[#6b6a66] uppercase tracking-wider">Avg confidence</p>
            <p className="text-2xl font-medium text-[#f4eee6]">{summary.metrics.avgConfidence.toFixed(2)}</p>
            <p className="text-xs text-[#b9b4ae] mt-1">{summary.metrics.durationFormatted}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
            <h3 className="font-medium text-[#f4eee6] mb-4">Event types</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Wake words', value: summary.metrics.wakeCount, color: COLORS[0] },
                      { name: 'Commands', value: summary.metrics.commandCount, color: COLORS[1] },
                      { name: 'Wrong', value: summary.metrics.wrongCount, color: COLORS[3] },
                    ].filter((d) => d.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#888"
                    labelLine={false}
                    label={{ position: 'outside' }}
                  >
                    {[
                      { name: 'Wake words', color: COLORS[0] },
                      { name: 'Commands', color: COLORS[1] },
                      { name: 'Wrong', color: COLORS[3] },
                    ].map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
            <h3 className="font-medium text-[#f4eee6] mb-4">Latency over events</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.events.map((e, i) => ({ name: `E${i + 1}`, latency: e.latency_ms, conf: e.confidence }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2a2f3e" />
                  <XAxis dataKey="name" stroke="#6b6a66" fontSize={10} />
                  <YAxis stroke="#6b6a66" fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="latency" fill="#c87046" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
          <h3 className="font-medium text-[#f4eee6] mb-4">Session details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-[#b9b4ae]">Device</span>
              <span className="text-[#f4eee6] font-mono">{summary.session.device_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b9b4ae]">Speaker</span>
              <span className="text-[#f4eee6]">{summary.session.speaker}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b9b4ae]">Distance</span>
              <span className="text-[#f4eee6]">{summary.session.distance_m} m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b9b4ae]">Noise level</span>
              <span className="text-[#f4eee6]">{summary.session.noise_level}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b9b4ae]">Attempts</span>
              <span className="text-[#f4eee6]">{summary.session.attempts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b9b4ae]">Status</span>
              <span className={`text-xs font-medium ${summary.session.ended_at ? 'text-[#4ade80]' : 'text-[#f59e0b]'}`}>
                {summary.session.ended_at ? 'Ended' : 'Running'}
              </span>
            </div>
          </div>
          {summary.session.notes && (
            <div className="mt-4 pt-4 border-t border-[#2a2f3e]">
              <p className="text-xs text-[#b9b4ae] mb-1">Notes</p>
              <p className="text-[#f4eee6] text-sm">{summary.session.notes}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {summary.session.ended_at === null && (
            <button
              onClick={() => stopSession(summary.session.id)}
              className="px-4 py-2 text-sm bg-[#f43f5e]/10 text-[#f43f5e] rounded hover:bg-[#f43f5e]/20"
            >
              <Square size={16} className="mr-1.5" /> Stop session
            </button>
          )}
          <button
            onClick={exportSession}
            className="px-4 py-2 text-sm bg-[#c87046] text-white rounded hover:bg-[#b8663e]"
          >
            <Download size={16} className="mr-1.5" /> Export CSV
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-[#f4eee6]">Evaluation</h1>
          <p className="text-[#b9b4ae]">Run test sessions, collect metrics, and export results.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSessions}
            className="px-3 py-1.5 text-xs bg-[#2a2f3e] text-[#b9b4ae] rounded hover:bg-[#3a4150] transition-colors"
          >
            <RefreshCw size={14} className="mr-1" /> Refresh
          </button>
        </div>
      </div>

      <form onSubmit={createSession} className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
        <h3 className="font-medium text-[#f4eee6] mb-3">Start new session</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#b9b4ae]">Session name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Speaker A, 1m, quiet"
              className="w-full py-2 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#b9b4ae]">Device</label>
            <select
              value={newDevice}
              onChange={(e) => setNewDevice(e.target.value)}
              className="w-full py-2 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
              required
            >
              <option value="">Select device</option>
              <option value="asva-esp32-01">ASVA Edge Node Alpha</option>
              <option value="asva-sim-01">ASVA Simulator</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="py-2 bg-[#c87046] text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {creating ? 'Creating…' : <><Plus size={16} className="mr-1.5" /> Start session</>}
          </button>
        </div>
      </form>

      <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#2a2f3e] bg-[#10131b]/50">
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Device</th>
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Speaker</th>
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Distance</th>
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Events</th>
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2f3e]">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#6b6a66]">
                    No sessions yet. Create one to begin evaluating.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-[#10131b]/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-[#f4eee6]">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-[#f4eee6] font-mono">{s.device_id}</td>
                    <td className="px-4 py-3 text-sm text-[#f4eee6]">{s.speaker}</td>
                    <td className="px-4 py-3 text-sm text-[#f4eee6]">{s.distance_m} m</td>
                    <td className="px-4 py-3 text-sm text-[#f4eee6] font-mono">{s.event_count || 0}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`text-xs font-medium rounded px-1.5 py-0.5 ${
                        s.ended_at ? 'bg-[#4ade80]/20 text-[#4ade80]' : 'bg-[#f59e0b]/20 text-[#f59e0b]'
                      }`}>
                        {s.ended_at ? 'Ended' : 'Running'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => viewSession(s.id)}
                        className="text-sm text-[#c87046] hover:text-[#b8663e]"
                      >
                        View details <ChevronRight size={14} className="ml-1" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
