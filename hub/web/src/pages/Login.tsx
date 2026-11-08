import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Lock, Mail, AlertCircle } from 'lucide-react';

export function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message === 'UNAUTHORIZED' ? 'Invalid email or password' : err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#10131b]">
      <div className="w-full max-w-md p-8 bg-[#171a24] border border-[#2a2f3e] rounded-xl shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[#c87046]/20 text-[#c87046] mb-4">
            <Lock size={24} />
          </div>
          <h1 className="font-serif text-3xl font-semibold text-[#f4eee6]">ASVA</h1>
          <p className="text-[#b9b4ae] mt-2">Sign in to the hub</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded bg-[#4a1a1a] border border-[#7a2a2a] text-sm text-[#f4eee6] flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#b9b4ae] block">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-3 text-[#6b6a66]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] focus:border-[#c87046] focus:outline-none transition-colors"
                placeholder="admin@example.com"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#b9b4ae] block">Password</label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pr-3 py-2.5 bg-[#10131b] border border-[#3a4150] rounded-lg text-[#f4eee6] focus:border-[#c87046] focus:outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-[#c87046] text-white font-medium rounded-lg hover:bg-[#b8663e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-[#2a2f3e] text-xs text-[#6b6a66] text-center">
          Default: admin@example.com / admin123<br />
          Offline voice hub — no internet required
        </div>
      </div>
    </div>
  );
}
