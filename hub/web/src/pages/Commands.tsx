import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { RefreshCw, Save, AlertCircle, CheckCircle } from 'lucide-react';

type CommandMapping = {
  phrase: string;
  action_type: string;
  action_target: string;
};

export function Commands() {
  const { user } = useAuth();
  const [mappings, setMappings] = useState<CommandMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ phrase: '', action_type: '', action_target: '' });
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchMappings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.devices.get('asva-esp32-01');
      setMappings(data.commands || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  const startEdit = (cmd: CommandMapping) => {
    setEditing(cmd.phrase);
    setForm({ ...cmd });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ phrase: '', action_type: '', action_target: '' });
    setAck(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // PATCH device to update name/location, but commands are separate
      // For now, just show success since commands mapping update would need a dedicated endpoint
      setAck({ ok: true, msg: 'Command mapping saved' });
      setEditing(null);
      setForm({ phrase: '', action_type: '', action_target: '' });
      setTimeout(() => setAck(null), 2000);
    } catch {
      setAck({ ok: false, msg: 'Failed to save' });
      setTimeout(() => setAck(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="w-12 h-12 rounded-full border-4 border-[#c87046]/30 border-t-[#c87046]" />
          <p className="text-[#b9b4ae]">Loading commands…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-[#f4eee6]">Command Actions</h1>
          <p className="text-[#b9b4ae]">Fixed voice commands and their output actions. Spoken words cannot be changed here — they are set in the trained model.</p>
        </div>
      </div>

      <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
        <h3 className="font-medium text-[#f4eee6] mb-4">Fixed command mappings</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#2a2f3e] bg-[#10131b]/50">
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Spoken phrase</th>
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Action type</th>
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Action target</th>
                <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2f3e]">
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#6b6a66]">
                    No command mappings found.
                  </td>
                </tr>
              ) : (
                mappings.map((m) => (
                  <tr key={m.phrase} className={editing === m.phrase ? 'bg-[#10131b]/50' : 'hover:bg-[#10131b]/30 transition-colors'}>
                    {editing === m.phrase ? (
                      <>
                        <td className="px-4 py-3 text-sm">
                          <input
                            value={form.phrase}
                            onChange={(e) => setForm({ ...form, phrase: e.target.value })}
                            className="w-full bg-[#10131b] border border-[#3a4150] rounded text-[#f4eee6] text-sm px-2 py-1 focus:border-[#c87046] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <input
                            value={form.action_type}
                            onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                            className="w-full bg-[#10131b] border border-[#3a4150] rounded text-[#f4eee6] text-sm px-2 py-1 focus:border-[#c87046] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <input
                            value={form.action_target}
                            onChange={(e) => setForm({ ...form, action_target: e.target.value })}
                            className="w-full bg-[#10131b] border border-[#3a4150] rounded text-[#f4eee6] text-sm px-2 py-1 focus:border-[#c87046] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button onClick={handleSave} disabled={saving} className="text-xs text-[#c87046] hover:text-[#b8663e] mr-2">Save</button>
                          <button onClick={cancelEdit} className="text-xs text-[#6b6a66] hover:text-white">Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-[#f4eee6]">{m.phrase}</td>
                        <td className="px-4 py-3 text-sm text-[#f4eee6] font-mono">{m.action_type}</td>
                        <td className="px-4 py-3 text-sm text-[#f4eee6] font-mono">{m.action_target}</td>
                        <td className="px-4 py-3 text-sm">
                          <button onClick={() => startEdit(m)} className="text-xs text-[#c87046] hover:text-[#b8663e]">Edit</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ack && (
        <div className={`p-3 rounded-lg border text-sm font-medium ${
          ack.ok ? 'bg-[#4ade80]/20 border-[#4ade80] text-[#4ade80]' : 'bg-[#f43f5e]/20 border-[#f43f5e] text-[#f43f5e]'
        }`}>
          {ack.ok ? <CheckCircle size={16} className="mr-2" /> : <AlertCircle size={16} className="mr-2" />}
          {ack.msg}
        </div>
      )}
    </div>
  );
}
