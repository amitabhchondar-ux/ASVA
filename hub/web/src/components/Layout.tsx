import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Monitor,
  History,
  BarChart3,
  Settings,
  Lock,
  LogOut,
  User,
  ShieldAlert,
  HelpCircle,
  ChevronLeft,
  Activity,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/device', label: 'Live Device', icon: Monitor },
  { path: '/history', label: 'History', icon: History },
  { path: '/evaluation', label: 'Evaluation', icon: BarChart3 },
  { path: '/commands', label: 'Commands', icon: Activity },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/privacy', label: 'Privacy', icon: ShieldAlert },
  { path: '/setup', label: 'Setup Help', icon: HelpCircle },
];

export function Layout({ children, user, onLogout }: { children?: React.ReactNode; user: any; onLogout: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = window.innerWidth < 768;

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  const renderNav = () => (
    <nav className="mt-4 px-3 space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              active
                ? 'bg-[#c87046]/20 text-[#c87046]'
                : 'text-[#b9b4ae] hover:text-white hover:bg-[#2a2f3e]'
            }`}
          >
            <Icon size={18} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen bg-[#10131b] text-[#f4eee6] overflow-hidden">
      {!isMobile && (
        <aside className="fixed inset-y-0 left-0 z-20 w-64 bg-[#171a24] border-r border-[#2a2f3e]">
          <div className="flex items-center justify-between h-12 px-4 bg-[#171a24] border-b border-[#2a2f3e]">
            <span className="font-serif font-semibold text-lg tracking-tight">ASVA</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-[#b9b4ae] hover:text-white"
            >
              <ChevronLeft size={20} />
            </button>
          </div>
          {renderNav()}
          <div className="mt-auto px-3 pb-4">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-[#b9b4ae] hover:text-white hover:bg-[#2a2f3e] transition-colors"
            >
              <LogOut size={18} />
              Log out
            </button>
            <p className="text-xs text-[#6b6a66] mt-2">{user.email}</p>
            <p className="text-xs text-[#6b6a66]">{user.role}</p>
          </div>
        </aside>
      )}
      <div className={`flex-1 ${isMobile ? 'relative' : 'ml-64'}`}>
        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 z-50 bg-[#171a24] border-r border-[#2a2f3e] w-64 transform transition-transform duration-300 translate-x-0">
            <div className="flex items-center justify-between h-12 px-4 border-b border-[#2a2f3e]">
              <span className="font-serif font-semibold text-lg tracking-tight">ASVA</span>
              <button onClick={() => setSidebarOpen(false)} className="p-2 text-[#b9b4ae]">
                <span>Close</span>
              </button>
            </div>
            {renderNav()}
            <div className="mt-auto px-3 pb-4">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-[#b9b4ae] hover:text-white hover:bg-[#2a2f3e] transition-colors"
              >
                <LogOut size={18} />
                Log out
              </button>
            </div>
          </div>
        )}
        <main className="flex-1 p-6 overflow-y-auto bg-[#10131b]">{children}</main>
      </div>
    </div>
  );
}
