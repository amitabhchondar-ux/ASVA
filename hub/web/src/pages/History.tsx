import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Event } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import {
  Filter,
  Download,
  RefreshCcw,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export function History() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    device: '',
    kind: '',
    minConf: '',
    page: 1,
    limit: 20,
  });
  const [exporting, setExporting] = useState(false);
  const [ack, setAck] = useState<{ id: string; ok: boolean } | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.events.list({
        device: filters.device || undefined,
        kind: filters.kind || undefined,
        minConf: filters.minConf || undefined,
        page: String(filters.page),
        limit: String(filters.limit),
      });
      setEvents(data.events || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [filters, navigate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleMarkWrong = async (id: string, wrong: boolean) => {
    try {
      await api.events.markWrong(id, wrong);
      setAck({ id, ok: true });
      setTimeout(() => setAck(null), 2000);
      fetchEvents();
    } catch {
      setAck({ id, ok: false });
      setTimeout(() => setAck(null), 2000);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await api.events.export({
        device: filters.device || undefined,
        kind: filters.kind || undefined,
        minConf: filters.minConf || undefined,
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asva-events-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') navigate('/login');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  const kindLabel = (k: string) => (k === 'wake' ? 'Wake word' : 'Command');

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-[#f4eee6]">Event History</h1>
          <p className="text-[#b9b4ae]">Searchable log of all device detections. Export to CSV.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || total === 0}
            className={`px-4 py-2 text-sm rounded transition-colors ${
              exporting || total === 0
                ? 'bg-[#2a2f3e] text-[#6b6a66] cursor-not-allowed'
                : 'bg-[#c87046] text-white hover:bg-[#b8663e]'
            }`}
          >
            <Download size={16} className="mr-1.5" /> Export CSV
          </button>
        </div>
      </div>

      <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#2a2f3e] flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Filter size={16} className="absolute left-3 top-3 text-[#6b6a66]" />
            <input
              type="text"
              placeholder="Filter by device ID"
              value={filters.device}
              onChange={(e) => setFilters({ ...filters, device: e.target.value, page: 1 })}
              className="w-full pl-8 pr-3 py-2 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
            />
          </div>
          <select
            value={filters.kind}
            onChange={(e) => setFilters({ ...filters, kind: e.target.value, page: 1 })}
            className="pl-3 pr-3 py-2 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
          >
            <option value="">All event types</option>
            <option value="wake">Wake word</option>
            <option value="command">Command</option>
          </select>
          <input
            type="text"
            placeholder="Min confidence (e.g. 0.8)"
            value={filters.minConf}
            onChange={(e) => setFilters({ ...filters, minConf: e.target.value, page: 1 })}
            className="w-full min-w-[180px] pl-3 pr-3 py-2 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <div className="w-12 h-12 rounded-full border-4 border-[#c87046]/30 border-t-[#c87046]" />
              <p className="text-[#b9b4ae]">Loading events…</p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#2a2f3e] bg-[#10131b]/50">
                    <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Time</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Device</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Type</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Text</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Confidence</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Latency</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2f3e]">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-[#6b6a66]">
                        No events found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    events.map((evt) => (
                      <tr key={evt.id} className="hover:bg-[#10131b]/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-[#f4eee6] font-mono">
                          {new Date(evt.ts * 1000).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#f4eee6] font-mono truncate max-w-[150px]">
                          {evt.device_id}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`text-xs font-medium rounded px-1.5 py-0.5 ${
                            evt.kind === 'wake' ? 'bg-[#c87046]/20 text-[#c87046]' : 'bg-[#818cf8]/20 text-[#818cf8]'
                          }`}>
                            {kindLabel(evt.kind)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#f4eee6]">{evt.text}</td>
                        <td className="px-4 py-3 text-sm text-[#f4eee6]">{evt.confidence.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-[#f4eee6] font-mono">{evt.latency_ms} ms</td>
                        <td className="px-4 py-3 text-sm">
                          {evt.wrong ? (
                            <span className="text-xs text-[#f43f5e] font-medium">Marked wrong</span>
                          ) : (
                            <span className="text-xs text-[#6b6a66]">OK</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => handleMarkWrong(evt.id, !evt.wrong)}
                            disabled={ack?.id === evt.id}
                            className={`text-xs px-2.5 py-1 rounded transition-colors ${
                              evt.wrong
                                ? 'text-[#4ade80] bg-[#4ade80]/10 hover:bg-[#4ade80]/20'
                                : 'text-[#f43f5e] bg-[#f43f5e]/10 hover:bg-[#f43f5e]/20'
                            }`}
                          >
                            {evt.wrong ? 'Undo' : 'Mark wrong'}
                          </button>
                          {ack?.id === evt.id && (
                            <span className={`text-xs ${ack.ok ? 'text-[#4ade80]' : 'text-[#f43f5e]'}`}>
                              {ack.ok ? <CheckCircle size={12} className="inline mr-1" /> : <XCircle size={12} className="inline mr-1" />}
                              {ack.ok ? 'Saved' : 'Error'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-[#2a2f3e] flex items-center justify-between">
              <div className="text-sm text-[#b9b4ae]">
                Showing {events.length} of {total} events
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page - 1) })}
                  disabled={filters.page <= 1}
                  className="px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <span className="text-xs text-[#f4eee6]">
                  {filters.page} / {totalPages}
                </span>
                <button
                  onClick={() => setFilters({ ...filters, page: Math.min(totalPages, filters.page + 1) })}
                  disabled={filters.page >= totalPages}
                  className="px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
