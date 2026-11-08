import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { User, Plus, Trash2, RefreshCw, ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react';

export function Settings() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [ack, setAck] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.users.list();
      setUsers(data.users || []);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        // still render, but show error
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const isAdmin = user?.role === 'admin';

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;
    setCreating(true);
    try {
      await api.users.create({ email: newEmail, password: newPassword, role: newRole });
      setNewEmail('');
      setNewPassword('');
      setNewRole('viewer');
      setAck({ ok: true, msg: 'User created' });
      fetchUsers();
      setTimeout(() => setAck(null), 2000);
    } catch (err: any) {
      setAck({ ok: false, msg: err.message || 'Failed to create user' });
      setTimeout(() => setAck(null), 3000);
    } finally {
      setCreating(false);
    }
  };

  const updateUser = async (id: string, field: 'role' | 'active', value: any) => {
    try {
      await api.users.update(id, { [field]: value });
      setAck({ ok: true, msg: 'User updated' });
      fetchUsers();
      setTimeout(() => setAck(null), 2000);
    } catch {
      setAck({ ok: false, msg: 'Failed to update user' });
      setTimeout(() => setAck(null), 3000);
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    try {
      await api.users.remove(id);
      setAck({ ok: true, msg: 'User deleted' });
      fetchUsers();
      setTimeout(() => setAck(null), 2000);
    } catch {
      setAck({ ok: false, msg: 'Failed to delete user' });
      setTimeout(() => setAck(null), 3000);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-6">
        <ShieldCheck size={48} className="text-[#f59e0b] mb-4" />
        <h2 className="text-xl font-medium text-[#f4eee6]">Admin access required</h2>
        <p className="text-[#b9b4ae] mt-2">Only administrators can access user and device settings.</p>
        <Link to="/" className="mt-6 inline-block px-4 py-2 text-sm bg-[#c87046] text-white rounded hover:bg-[#b8663e]">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-[#f4eee6]">Settings</h1>
          <p className="text-[#b9b4ae]">Manage users, devices, and system defaults.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
          <h3 className="font-medium text-[#f4eee6] mb-4">Users</h3>
          <form onSubmit={createUser} className="space-y-3 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email"
                className="py-2 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
                required
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password"
                className="py-2 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
                required
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="py-2 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="w-full py-2 bg-[#c87046] text-white rounded-lg text-sm disabled:opacity-50"
            >
              {creating ? 'Creating…' : <><Plus size={16} className="mr-1.5" /> Add user</>}
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#2a2f3e] bg-[#10131b]/50">
                  <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Email</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Role</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#b9b4ae]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2f3e]">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[#6b6a66]">
                      Loading users…
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#10131b]/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-[#f4eee6]">{u.email}</td>
                      <td className="px-4 py-3 text-sm">
                        <select
                          value={u.role}
                          onChange={(e) => updateUser(u.id, 'role', e.target.value)}
                          className="bg-[#10131b] border border-[#3a4150] rounded text-[#f4eee6] text-xs px-2 py-1 focus:border-[#c87046] focus:outline-none"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={u.active === 1}
                            onChange={(e) => updateUser(u.id, 'active', e.target.checked ? 1 : 0)}
                            className="rounded bg-[#10131b] border-[#3a4150] text-[#c87046] focus:ring-0"
                          />
                          {u.active === 1 ? 'Active' : 'Inactive'}
                        </label>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {u.id !== 'user-admin-01' ? (
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="text-xs text-[#f43f5e] hover:text-[#f43f5e]/80"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        ) : (
                          <span className="text-xs text-[#6b6a66]">Default admin</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#171a24] border border-[#2a2f3e] rounded-xl p-5">
          <h3 className="font-medium text-[#f4eee6] mb-4">System defaults</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#f4eee6]">Session timeout</p>
                <p className="text-xs text-[#6b6a66]">After how long user sessions expire.</p>
              </div>
              <select className="bg-[#10131b] border border-[#3a4150] rounded text-[#f4eee6] text-sm px-2 py-1 focus:border-[#c87046] focus:outline-none">
                <option value="7d">7 days</option>
                <option value="1d">1 day</option>
                <option value="12h">12 hours</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#f4eee6]">Default wake threshold</p>
                <p className="text-xs text-[#6b6a66]">Applied to new devices.</p>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.5"
                max="0.99"
                defaultValue="0.80"
                className="w-20 py-1.5 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#f4eee6]">Event retention</p>
                <p className="text-xs text-[#6b6a66]">Auto-delete events older than N days.</p>
              </div>
              <input
                type="number"
                defaultValue="90"
                className="w-20 py-1.5 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] text-sm focus:border-[#c87046] focus:outline-none"
              />
            </div>
          </div>
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
