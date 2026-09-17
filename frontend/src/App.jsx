import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { formatFormalDate, formatFormalDateRange, formatFormalTime, formatFormalDateTime } from './utils/date';

const Dashboard = lazy(() => import('./components/Dashboard'));

const CATEGORY_LABELS = {
  environment: 'สิ่งแวดล้อม',
  education: 'การศึกษา',
  health: 'สุขภาพ',
  community: 'ชุมชน',
  disaster_relief: 'บรรเทาสาธารณภัย',
  animal_welfare: 'สวัสดิภาพสัตว์',
  other: 'อื่น ๆ'
};

const STATUS_LABELS = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ถูกปฏิเสธ',
  cancelled: 'ยกเลิกแล้ว',
  attended: 'เข้าร่วมแล้ว',
  no_show: 'ไม่เข้าร่วม'
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
  return data;
}

function go(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function Notice({ text, type = 'error' }) {
  if (!text) return null;
  return (
    <div className={`mt-4 rounded-xl p-4 text-sm font-medium border ${type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
      {text}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        <span className="text-sm font-medium">กำลังโหลด…</span>
      </div>
    </div>
  );
}

function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        api('/api/notifications').catch(() => []),
        api('/api/notifications/unread-count').catch(() => ({ count: 0 }))
      ]);
      setNotifications(Array.isArray(listRes) ? listRes : (listRes.data || []));
      setUnreadCount(countRes.count || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 15000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    try {
      await api('/api/notifications/read-all', { method: 'PATCH' });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, IsRead: 1 })));
    } catch (e) {
      console.error(e);
    }
  };

  const markAsRead = async (id) => {
    try {
      await api(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n.NotificationID === id ? { ...n, IsRead: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
        title="การแจ้งเตือน"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white p-4 shadow-2xl border border-slate-200 z-50 animate-fadeIn">
          <div className="flex items-center justify-between border-b pb-3 mb-3">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900 text-sm">การแจ้งเตือนในระบบ</h4>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  ใหม่ {unreadCount} รายการ
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-medium text-emerald-600 hover:underline cursor-pointer"
              >
                อ่านทั้งหมด
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2 divide-y divide-slate-100">
            {notifications.length > 0 ? (
              notifications.map(n => (
                <div
                  key={n.NotificationID}
                  onClick={() => !n.IsRead && markAsRead(n.NotificationID)}
                  className={`pt-2 text-xs transition cursor-pointer ${!n.IsRead ? 'font-semibold bg-emerald-50/50 p-2.5 rounded-xl' : 'opacity-80 p-2.5'}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-slate-900">{n.Title || 'การแจ้งเตือน'}</p>
                    {!n.IsRead && <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1" />}
                  </div>
                  <p className="mt-1 text-slate-600 font-normal">{n.Message}</p>
                  <p className="mt-1.5 text-[10px] text-slate-400 font-normal">
                    {formatFormalDateTime(n.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                ไม่มีการแจ้งเตือนในขณะนี้
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Shell({ user, onLogout, onRefresh, refreshing, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:py-3.5">
          <button onClick={() => go('/')} className="flex items-center gap-2.5 text-left cursor-pointer">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-lg shadow-sm">
              V
            </span>
            <div>
              <span className="font-bold tracking-tight text-slate-900 text-sm sm:text-base">Volunteer Hub</span>
              <span className="block text-[10px] text-slate-500 font-medium">ระบบรวมกิจกรรมจิตอาสา</span>
            </div>
          </button>
          
          <div className="flex items-center gap-2 sm:gap-3">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                className="flex items-center gap-1 rounded-xl bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition cursor-pointer disabled:opacity-50"
                title="อัปเดตข้อมูลสด"
              >
                <span className={`inline-block ${refreshing ? 'animate-spin' : ''}`}>🔄</span>
                <span className="hidden sm:inline">อัปเดต</span>
              </button>
            )}

            {user && <NotificationsDropdown />}

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-2.5">
              {user ? (
                <>
                  <div className="text-right mr-1">
                    <p className="text-xs font-semibold text-slate-900">{user.name}</p>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">{user.role}</p>
                  </div>
                  {['organizer', 'admin'].includes(user.role) && (
                    <button
                      onClick={() => go('/organizer')}
                      className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition cursor-pointer"
                    >
                      จัดการกิจกรรม
                    </button>
                  )}
                  {user.role === 'admin' && (
                    <button
                      onClick={() => go('/admin')}
                      className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                    >
                      ผู้ดูแลระบบ
                    </button>
                  )}
                  <button
                    onClick={onLogout}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition cursor-pointer"
                  >
                    ออกจากระบบ
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => go('/login')}
                    className="rounded-xl border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    เข้าสู่ระบบ
                  </button>
                  <button
                    onClick={() => go('/register')}
                    className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs transition cursor-pointer"
                  >
                    สมัครสมาชิก
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Nav Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 md:hidden rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2 shadow-xl animate-fadeIn">
            {user ? (
              <div className="space-y-2">
                <div className="pb-2 border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-900">{user.name}</p>
                  <p className="text-[11px] text-emerald-600 font-bold uppercase">{user.role}</p>
                </div>
                <button
                  onClick={() => { setMobileMenuOpen(false); go('/'); }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-slate-700 hover:bg-slate-100 flex items-center gap-2 cursor-pointer"
                >
                  <span>🏠</span> หน้าหลัก / รายการกิจกรรม
                </button>
                {['organizer', 'admin'].includes(user.role) && (
                  <button
                    onClick={() => { setMobileMenuOpen(false); go('/organizer'); }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-emerald-700 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-2 cursor-pointer"
                  >
                    <span>📋</span> ศูนย์จัดการกิจกรรม (Organizer)
                  </button>
                )}
                {user.role === 'admin' && (
                  <button
                    onClick={() => { setMobileMenuOpen(false); go('/admin'); }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center gap-2 cursor-pointer"
                  >
                    <span>⚙️</span> ผู้ดูแลระบบ (Admin)
                  </button>
                )}
                <button
                  onClick={() => { setMobileMenuOpen(false); onLogout(); }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                >
                  <span>🚪</span> ออกจากระบบ
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => { setMobileMenuOpen(false); go('/login'); }}
                  className="w-full text-center py-2.5 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  เข้าสู่ระบบ
                </button>
                <button
                  onClick={() => { setMobileMenuOpen(false); go('/register'); }}
                  className="w-full text-center py-2.5 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs cursor-pointer"
                >
                  สมัครสมาชิก
                </button>
              </div>
            )}
          </div>
        )}
      </header>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

function LoginPage({ onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      onAuthenticated(res.user);
      if (res.user.forceChangePassword) {
        go('/change-password');
      } else if (res.user.role === 'admin') {
        go('/admin');
      } else if (res.user.role === 'organizer') {
        go('/organizer');
      } else {
        go('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-slate-200/80">
        <div className="text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white font-black text-xl shadow-md">
            V
          </span>
          <h2 className="mt-4 text-xl font-bold text-slate-900">เข้าสู่ระบบจิตอาสา</h2>
          <p className="text-xs text-slate-500 mt-1">ยินดีต้อนรับกลับเข้าสู่ Volunteer Activity Hub</p>
        </div>

        <Notice text={error} />

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">อีเมล</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              placeholder="example@email.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">รหัสผ่าน</label>
              <button
                type="button"
                onClick={() => go('/forgot-password')}
                className="text-xs text-emerald-600 hover:underline font-medium"
              >
                ลืมรหัสผ่าน?
              </button>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-60 cursor-pointer"
          >
            {loading ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500 border-t pt-4">
          ยังไม่มีบัญชีใช่หรือไม่?{' '}
          <button onClick={() => go('/register')} className="font-semibold text-emerald-600 hover:underline cursor-pointer">
            สมัครสมาชิกใหม่
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterPage({ onAuthenticated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: { name, email, password, role }
      });
      onAuthenticated(res.user);
      if (res.user?.role === 'organizer') {
        go('/organizer');
      } else if (res.user?.role === 'admin') {
        go('/admin');
      } else {
        go('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-slate-200/80">
        <div className="text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white font-black text-xl shadow-md">
            V
          </span>
          <h2 className="mt-4 text-xl font-bold text-slate-900">สมัครสมาชิกใหม่</h2>
          <p className="text-xs text-slate-500 mt-1">สร้างบัญชีเพื่อเข้าร่วมกิจกรรมและสะสมชั่วโมงจิตอาสา</p>
        </div>

        <Notice text={error} />

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อ-นามสกุล *</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              placeholder="สมชาย ใจดี"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">อีเมล *</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              placeholder="example@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสผ่าน *</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              placeholder="ขั้นต่ำ 6 ตัวอักษร"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">ประเภทบัญชี *</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition bg-white"
            >
              <option value="student">นักเรียน / นักศึกษา / อาสาสมัครทั่วไป</option>
              <option value="organizer">ผู้จัดกิจกรรม (Organizer)</option>
              <option value="teacher">ครู / อาจารย์ที่ปรึกษา</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-60 cursor-pointer"
          >
            {loading ? 'กำลังลงทะเบียน…' : 'สมัครสมาชิก'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500 border-t pt-4">
          มีบัญชีอยู่แล้ว?{' '}
          <button onClick={() => go('/login')} className="font-semibold text-emerald-600 hover:underline cursor-pointer">
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    </div>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await api('/api/auth/forgot-password', {
        method: 'POST',
        body: { email }
      });
      setMessage(res.message || 'ส่งคำขอรีเซ็ตรหัสผ่านเรียบร้อยแล้ว กรุณาตรวจสอบอีเมลของคุณ');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-slate-200/80">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">ลืมรหัสผ่าน</h2>
          <p className="text-xs text-slate-500 mt-1">กรอกอีเมลเพื่อขอรับคำขอรีเซ็ตรหัสผ่าน</p>
        </div>

        <Notice text={error} type="error" />
        <Notice text={message} type="success" />

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">อีเมลของคุณ</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              placeholder="example@email.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-60 cursor-pointer"
          >
            {loading ? 'กำลังส่งคำขอ…' : 'ส่งคำขอรีเซ็ตรหัสผ่าน'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500 border-t pt-4">
          <button onClick={() => go('/login')} className="font-semibold text-slate-600 hover:underline cursor-pointer">
            ← กลับหน้าเข้าสู่ระบบ
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordPage({ user, onDone }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    setLoading(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword }
      });
      alert('เปลี่ยนรหัสผ่านสำเร็จแล้ว');
      if (onDone && user) {
        onDone({ ...user, forceChangePassword: false });
      }
      go('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-slate-200/80">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">เปลี่ยนรหัสผ่าน</h2>
          <p className="text-xs text-slate-500 mt-1">กรุณากำหนดรหัสผ่านใหม่เพื่อความปลอดภัยของบัญชี</p>
        </div>

        <Notice text={error} />

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสผ่านปัจจุบัน *</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสผ่านใหม่ *</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              placeholder="อย่างน้อย 6 ตัวอักษร"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">ยืนยันรหัสผ่านใหม่ *</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-60 cursor-pointer"
          >
            {loading ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
          </button>
        </form>
      </div>
    </div>
  );
}

function OrganizerPage({ user, onLogout }) {
  const [tab, setTab] = useState('activities');
  const [activities, setActivities] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [selectedActId, setSelectedActId] = useState('');
  const [regStatusFilter, setRegStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);

  // Certificate modal state
  const [certModalItem, setCertModalItem] = useState(null);
  const [certPreview, setCertPreview] = useState(null);
  const [certFileBase64, setCertFileBase64] = useState('');
  const [certUploading, setCertUploading] = useState(false);
  const [certError, setCertError] = useState('');

  const emptyForm = {
    Title: '',
    Category: 'environment',
    Description: '',
    Location: '',
    LocationLat: '',
    LocationLng: '',
    StartDate: '',
    EndDate: '',
    StartTime: '09:00',
    EndTime: '16:00',
    MaxParticipants: 30,
    HoursAwarded: 3,
    Status: 'open'
  };
  const [form, setForm] = useState(emptyForm);

  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    try {
      const [actRes, regRes] = await Promise.all([
        api('/api/activities?status=all').catch(err => { console.error('Activities load error:', err); return []; }),
        api('/api/organizer/registrations').catch(err => { console.error('Registrations load error:', err); return []; })
      ]);
      setActivities(actRes.data || (Array.isArray(actRes) ? actRes : []));
      setRegistrations(regRes.data || (Array.isArray(regRes) ? regRes : []));
    } catch (e) {
      setError(e.message);
    } finally {
      if (showIndicator) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto sync data every 15 seconds
    const timer = setInterval(() => loadData(false), 15000);
    // Instant fetch when returning to tab
    const handleFocus = () => loadData(false);
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadData]);

  const handleOpenCreateModal = () => {
    setEditingActivity(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const handleOpenEditModal = (act) => {
    setEditingActivity(act);
    setForm({
      Title: act.Title || '',
      Category: act.Category || 'environment',
      Description: act.Description || '',
      Location: act.Location || '',
      LocationLat: act.LocationLat ?? '',
      LocationLng: act.LocationLng ?? '',
      StartDate: act.StartDate ? act.StartDate.split('T')[0] : '',
      EndDate: act.EndDate ? act.EndDate.split('T')[0] : '',
      StartTime: act.StartTime || '09:00',
      EndTime: act.EndTime || '16:00',
      MaxParticipants: act.MaxParticipants || 30,
      HoursAwarded: act.HoursAwarded || 3,
      Status: act.Status || 'open'
    });
    setShowModal(true);
  };

  // GPS Pinning Logic
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('อุปกรณ์ของคุณไม่รองรับระบบดึงตำแหน่ง GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(7);
        const lng = pos.coords.longitude.toFixed(7);
        setForm(prev => ({ ...prev, LocationLat: lat, LocationLng: lng }));
      },
      (err) => {
        alert('ไม่สามารถดึงตำแหน่ง GPS ได้: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSearchLocation = async () => {
    if (!form.Location?.trim()) {
      alert('กรุณากรอกชื่อสถานที่จัดกิจกรรมก่อนค้นหาพิกัด');
      return;
    }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.Location)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat).toFixed(7);
        const lng = parseFloat(data[0].lon).toFixed(7);
        setForm(prev => ({ ...prev, LocationLat: lat, LocationLng: lng }));
      } else {
        alert('ไม่พบพิกัดสำหรับชื่อสถานที่นี้ กรุณากรอกพิกัดเอง หรือวางลิงก์ Google Maps');
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการค้นหาพิกัด: ' + e.message);
    }
  };

  const handleMapsUrlChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const atMatch = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      setForm(prev => ({ ...prev, LocationLat: atMatch[1], LocationLng: atMatch[2] }));
      return;
    }
    const qMatch = val.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (qMatch) {
      setForm(prev => ({ ...prev, LocationLat: qMatch[1], LocationLng: qMatch[2] }));
    }
  };

  const handleOpenGoogleMaps = () => {
    window.open('https://www.google.com/maps', '_blank');
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      LocationLat: form.LocationLat ? parseFloat(form.LocationLat) : null,
      LocationLng: form.LocationLng ? parseFloat(form.LocationLng) : null,
      MaxParticipants: form.MaxParticipants ? parseInt(form.MaxParticipants, 10) : null,
      HoursAwarded: parseFloat(form.HoursAwarded) || 0
    };

    // Optimistic UI update — close modal & update list instantly
    setShowModal(false);
    if (editingActivity) {
      setActivities(prev => prev.map(a => a.ActivityID === editingActivity.ActivityID ? { ...a, ...payload } : a));
    } else {
      setActivities(prev => [{ ActivityID: 'temp-' + Date.now(), ...payload, registered_count: 0 }, ...prev]);
    }

    try {
      if (editingActivity) {
        await api(`/api/activities/${editingActivity.ActivityID}`, { method: 'PUT', body: payload });
      } else {
        await api('/api/activities', { method: 'POST', body: payload });
      }
      loadData(false);
    } catch (err) {
      setError(err.message);
      loadData(false);
    }
  };

  const handleDeleteActivity = async () => {
    if (!deleteConfirmId) return;
    const targetId = deleteConfirmId;
    setDeleteConfirmId(null);

    // Optimistic UI update
    setActivities(prev => prev.filter(a => a.ActivityID !== targetId));

    try {
      await api(`/api/activities/${targetId}`, { method: 'DELETE' });
      loadData(false);
    } catch (err) {
      setError(err.message);
      loadData(false);
    }
  };

  const handleReviewReg = async (regId, status) => {
    // Optimistic UI update
    setRegistrations(prev => prev.map(r => r.RegistrationID === regId ? { ...r, Status: status } : r));
    try {
      await api(`/api/organizer/registrations/${regId}`, {
        method: 'PATCH',
        body: { status, action: status }
      });
      loadData(false);
    } catch (e) {
      setError(e.message);
      loadData(false);
    }
  };

  const handleOpenCertModal = (item) => {
    setCertModalItem(item);
    setCertPreview(null);
    setCertFileBase64('');
    setCertError('');
  };

  const handleCertFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setCertError('ขนาดไฟล์ต้องไม่เกิน 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1600;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        setCertPreview(compressedBase64);
        setCertFileBase64(compressedBase64);
        setCertError('');
      };
      img.onerror = () => {
        setCertPreview(evt.target.result);
        setCertFileBase64(evt.target.result);
        setCertError('');
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleUploadCert = async () => {
    if (!certFileBase64 || !certModalItem) {
      setCertError('กรุณาเลือกไฟล์รูปภาพเกียรติบัตร (JPG, PNG หรือ WebP)');
      return;
    }
    setCertUploading(true);
    setCertError('');
    try {
      await api(`/api/organizer/registrations/${certModalItem.RegistrationID}/certificate`, {
        method: 'POST',
        body: { certificateBase64: certFileBase64 }
      });
      setRegistrations(prev => prev.map(r => r.RegistrationID === certModalItem.RegistrationID ? { ...r, CertificateUrl: 'attached' } : r));
      setCertModalItem(null);
      loadData(false);
    } catch (err) {
      setCertError(err.message || 'เกิดข้อผิดพลาดในการแนบเกียรติบัตร');
    } finally {
      setCertUploading(false);
    }
  };

  const filteredRegs = registrations.filter(r => {
    if (selectedActId && String(r.ActivityID) !== String(selectedActId)) return false;
    if (regStatusFilter && r.Status !== regStatusFilter) return false;
    return true;
  });

  return (
    <Shell user={user} onLogout={onLogout}>
      <main className="mx-auto max-w-6xl px-4 py-7">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">ศูนย์จัดการกิจกรรมสำหรับผู้จัด</h1>
            <p className="text-xs text-slate-500 mt-1">สร้างกิจกรรม ปักหมุดพิกัด GPS อนุมัติการลงทะเบียน และแนบเกียรติบัตรจิตอาสา</p>
          </div>
          <button
            onClick={handleOpenCreateModal}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>+</span> สร้างกิจกรรมใหม่
          </button>
        </div>

        <Notice text={error} />

        <div className="mt-6 flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setTab('activities')}
            className={`px-4 py-2.5 text-xs font-bold transition border-b-2 cursor-pointer ${tab === 'activities' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            กิจกรรมทั้งหมด ({activities.length})
          </button>
          <button
            onClick={() => setTab('registrations')}
            className={`px-4 py-2.5 text-xs font-bold transition border-b-2 cursor-pointer ${tab === 'registrations' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            รายการลงทะเบียน ({registrations.length})
          </button>
        </div>

        {/* TAB 1: ACTIVITIES */}
        {tab === 'activities' && (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {activities.map(a => (
              <div key={a.ActivityID} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {CATEGORY_LABELS[a.Category] || a.Category}
                    </span>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${a.Status === 'open' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {a.Status === 'open' ? 'เปิดรับสมัคร' : 'แบบร่าง'}
                    </span>
                  </div>
                  <h3 className="mt-3 font-bold text-slate-900 text-base line-clamp-2">{a.Title}</h3>
                  <p className="mt-1 text-xs text-slate-500">📅 {formatFormalDateRange(a.StartDate, a.EndDate)}</p>
                  <p className="mt-1 text-xs text-slate-600 font-medium truncate">📍 {a.Location || 'ไม่ระบุสถานที่'}</p>
                  
                  {a.LocationLat && a.LocationLng && (
                    <div className="mt-2 text-xs text-emerald-700 font-semibold flex items-center gap-1">
                      <span>📌 GPS: {a.LocationLat}, {a.LocationLng}</span>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500 border-t pt-3">
                    <span>ผู้สมัคร: <strong className="text-slate-900">{a.registered_count || 0}</strong> / {a.MaxParticipants || 'ไม่จำกัด'}</span>
                    <span className="font-semibold text-emerald-700">{a.HoursAwarded} ชั่วโมง</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2 border-t pt-3">
                  <button
                    onClick={() => handleOpenEditModal(a)}
                    className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(a.ActivityID)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}

            {activities.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-500 bg-white rounded-3xl border border-dashed p-8">
                ยังไม่มีกิจกรรมที่ถูกสร้างขึ้นในขณะนี้ กดปุ่ม "สร้างกิจกรรมใหม่" เพื่อเริ่มสร้างกิจกรรมแรก
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REGISTRATIONS */}
        {tab === 'registrations' && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  กิจกรรม:
                  <select
                    value={selectedActId}
                    onChange={(e) => setSelectedActId(e.target.value)}
                    className="ml-2 rounded-xl border border-slate-300 p-2 text-xs bg-slate-50 outline-none"
                  >
                    <option value="">-- ทั้งหมด --</option>
                    {activities.map(a => (
                      <option key={a.ActivityID} value={a.ActivityID}>{a.Title}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  สถานะ:
                  <select
                    value={regStatusFilter}
                    onChange={(e) => setRegStatusFilter(e.target.value)}
                    className="ml-2 rounded-xl border border-slate-300 p-2 text-xs bg-slate-50 outline-none"
                  >
                    <option value="">-- ทุกสถานะ --</option>
                    <option value="pending">รออนุมัติ</option>
                    <option value="approved">อนุมัติแล้ว</option>
                    <option value="attended">เข้าร่วมแล้ว (แจกชั่วโมง)</option>
                    <option value="rejected">ถูกปฏิเสธ</option>
                    <option value="cancelled">ยกเลิกแล้ว</option>
                  </select>
                </label>
              </div>
              <span className="text-xs text-slate-500 font-medium">พบ {filteredRegs.length} รายการ</span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700 border-b font-medium">
                  <tr>
                    <th className="p-4">ผู้สมัคร</th>
                    <th className="p-4">กิจกรรม</th>
                    <th className="p-4">วันที่ลงชื่อ</th>
                    <th className="p-4">สถานะ</th>
                    <th className="p-4 text-right">จัดการสถานะ / เกียรติบัตร</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRegs.map(item => (
                    <tr key={item.RegistrationID} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="font-semibold text-slate-900">{item.UserName}</div>
                        <div className="text-xs text-slate-500">{item.UserEmail}</div>
                      </td>
                      <td className="p-4 font-medium text-slate-800 text-xs">{item.ActivityTitle}</td>
                      <td className="p-4 text-xs text-slate-500">{formatFormalDate(item.created_at)}</td>
                      <td className="p-4">
                        <span className="inline-block rounded-lg px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700">
                          {STATUS_LABELS[item.Status] || item.Status}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {item.Status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleReviewReg(item.RegistrationID, 'approved')}
                              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 cursor-pointer"
                            >
                              อนุมัติ
                            </button>
                            <button
                              onClick={() => handleReviewReg(item.RegistrationID, 'rejected')}
                              className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 cursor-pointer"
                            >
                              ปฏิเสธ
                            </button>
                          </>
                        )}
                        {item.Status === 'approved' && (
                          <button
                            onClick={() => handleReviewReg(item.RegistrationID, 'attended')}
                            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                          >
                            บันทึกเข้าร่วม (แจกชั่วโมง)
                          </button>
                        )}
                        {item.Status === 'attended' && (
                          <div className="inline-flex items-center gap-1.5">
                            {item.CertificateUrl ? (
                              <>
                                <button
                                  onClick={() => window.open(`/api/registrations/${item.RegistrationID}/certificate`, '_blank')}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                                >
                                  <span>🎓</span> ดูเกียรติบัตรแนบ ↗
                                </button>
                                <button
                                  onClick={() => handleOpenCertModal(item)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 cursor-pointer"
                                  title="เปลี่ยนเกียรติบัตร"
                                >
                                  <span>✏️</span> แก้ไข
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleOpenCertModal(item)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 shadow-xs cursor-pointer"
                              >
                                <span>📎</span> แนบเกียรติบัตร
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredRegs.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-slate-500">
                        ไม่พบข้อมูลการลงทะเบียน
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODAL: CREATE / EDIT ACTIVITY */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-4">
                <h3 className="text-lg font-bold text-slate-900">
                  {editingActivity ? 'แก้ไขกิจกรรมจิตอาสา' : 'สร้างกิจกรรมจิตอาสาใหม่'}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmitForm} className="mt-4 space-y-4 text-sm">
                <div>
                  <label className="block font-semibold text-slate-700">ชื่อกิจกรรม *</label>
                  <input
                    required
                    type="text"
                    value={form.Title}
                    onChange={e => setForm({ ...form, Title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น ปลูกป่าชายเลนเพื่ออนุรักษ์ชายฝั่ง"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700">หมวดหมู่ *</label>
                    <select
                      value={form.Category}
                      onChange={e => setForm({ ...form, Category: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                    >
                      <option value="environment">สิ่งแวดล้อม</option>
                      <option value="education">การศึกษา</option>
                      <option value="health">สุขภาพ</option>
                      <option value="community">ชุมชน</option>
                      <option value="disaster_relief">บรรเทาสาธารณภัย</option>
                      <option value="animal_welfare">สวัสดิภาพสัตว์</option>
                      <option value="other">อื่น ๆ</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700">สถานะเริ่มต้น *</label>
                    <select
                      value={form.Status}
                      onChange={e => setForm({ ...form, Status: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                    >
                      <option value="open">เปิดรับสมัคร (Open)</option>
                      <option value="draft">แบบร่าง (Draft)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700">รายละเอียดกิจกรรม</label>
                  <textarea
                    rows="3"
                    value={form.Description}
                    onChange={e => setForm({ ...form, Description: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="อธิบายกิจกรรม สิ่งที่อาสาสมัครต้องเตรียมตัว..."
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700">สถานที่จัดกิจกรรม</label>
                  <input
                    type="text"
                    value={form.Location}
                    onChange={e => setForm({ ...form, Location: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="เช่น ศูนย์การเรียนรู้ชุมชน บางขุนเทียน"
                  />
                </div>

                {/* GPS PINNING SECTION */}
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white p-4 shadow-xs space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-emerald-100 pb-3">
                    <div>
                      <p className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>📌</span> ปักหมุด GPS สถานที่จัดกิจกรรม
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        ดึงพิกัดจากตำแหน่งปัจจุบัน ค้นหาจากชื่อ หรือวางลิงก์จาก Google Maps
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition flex items-center gap-1 cursor-pointer"
                        title="ใช้พิกัดจาก GPS อุปกรณ์ของคุณ"
                      >
                        <span>📍</span> ใช้ตำแหน่งปัจจุบันของผู้จัด
                      </button>
                      <button
                        type="button"
                        onClick={handleSearchLocation}
                        className="rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 transition flex items-center gap-1 cursor-pointer"
                        title="ค้นหาพิกัดจากชื่อสถานที่ที่กรอกด้านบน"
                      >
                        <span>🔍</span> ค้นหาพิกัดจากชื่อสถานที่
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenGoogleMaps}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition flex items-center gap-1 cursor-pointer"
                        title="เปิดแอป Google Maps ในแท็บใหม่"
                      >
                        <span>🗺️</span> เปิด Google Maps
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      วางลิงก์จาก Google Maps หรือพิกัด (เช่น 13.7563, 100.5018 หรือวาง URL)
                    </label>
                    <input
                      type="text"
                      placeholder="https://www.google.com/maps/place/... หรือ 13.75633, 100.50176"
                      onChange={handleMapsUrlChange}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        ละติจูด (Latitude)
                      </label>
                      <input
                        type="number" step="any" min="-90" max="90"
                        value={form.LocationLat}
                        onChange={e => setForm({ ...form, LocationLat: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="เช่น 13.7563303"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        ลองจิจูด (Longitude)
                      </label>
                      <input
                        type="number" step="any" min="-180" max="180"
                        value={form.LocationLng}
                        onChange={e => setForm({ ...form, LocationLng: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="เช่น 100.5017651"
                      />
                    </div>
                  </div>

                  {form.LocationLat && form.LocationLng && (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-emerald-100/60 p-2.5 rounded-xl border border-emerald-200">
                        <span className="text-emerald-800 font-semibold flex items-center gap-1">
                          📌 พิกัดปัจจุบัน: {form.LocationLat}, {form.LocationLng}
                        </span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${form.LocationLat},${form.LocationLng}`}
                          target="_blank" rel="noreferrer"
                          className="text-blue-700 font-semibold hover:underline"
                        >
                          เปิดดูบน Google Maps ↗
                        </a>
                      </div>

                      {/* Embedded Live Map Preview */}
                      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-inner">
                        <iframe
                          title="GPS Map Preview"
                          width="100%"
                          height="180"
                          loading="lazy"
                          src={`https://maps.google.com/maps?q=${form.LocationLat},${form.LocationLng}&z=15&output=embed`}
                          className="border-0"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700">วันที่เริ่มต้น *</label>
                    <input
                      required
                      type="date"
                      value={form.StartDate}
                      onChange={e => setForm({ ...form, StartDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700">วันที่สิ้นสุด *</label>
                    <input
                      required
                      type="date"
                      value={form.EndDate}
                      onChange={e => setForm({ ...form, EndDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700">เวลาเริ่ม</label>
                    <input
                      type="time"
                      value={form.StartTime}
                      onChange={e => setForm({ ...form, StartTime: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700">เวลาสิ้นสุด</label>
                    <input
                      type="time"
                      value={form.EndTime}
                      onChange={e => setForm({ ...form, EndTime: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700">จำนวนที่รับสมัคร (คน)</label>
                    <input
                      type="number"
                      min="1"
                      value={form.MaxParticipants}
                      onChange={e => setForm({ ...form, MaxParticipants: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="เช่น 50"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700">ชั่วโมงจิตอาสาที่ได้รับ *</label>
                    <input
                      required
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={form.HoursAwarded}
                      onChange={e => setForm({ ...form, HoursAwarded: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 transition disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? 'กำลังบันทึก…' : (editingActivity ? 'บันทึกการแก้ไข' : 'สร้างกิจกรรมใหม่')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DELETE CONFIRMATION MODAL */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center">
              <span className="text-3xl">⚠️</span>
              <h3 className="mt-2 text-lg font-bold text-slate-900">ยืนยันการลบกิจกรรม</h3>
              <p className="mt-1 text-xs text-slate-500">การลบกิจกรรมนี้จะไม่สามารถย้อนกลับได้</p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="w-1/2 rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  disabled={busy}
                  onClick={handleDeleteActivity}
                  className="w-1/2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'กำลังลบ…' : 'ยืนยันลบกิจกรรม'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* MODAL: UPLOAD CERTIFICATE */}
        {certModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>🎓</span> แนบเกียรติบัตรเข้าร่วมกิจกรรม
                </h3>
                <button
                  onClick={() => setCertModalItem(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
                >
                  ×
                </button>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                <p><strong className="text-slate-700">ผู้รับเกียรติบัตร:</strong> {certModalItem.UserName} ({certModalItem.UserEmail})</p>
                <p><strong className="text-slate-700">กิจกรรม:</strong> {certModalItem.ActivityTitle}</p>
                {certModalItem.CertificateUrl && (
                  <p className="text-emerald-700 font-medium pt-1">
                    ✓ มีเกียรติบัตรแนบอยู่แล้ว สามารถเลือกไฟล์ใหม่เพื่อเปลี่ยนเกียรติบัตรได้
                  </p>
                )}
              </div>

              {certError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                  {certError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  เลือกไฟล์รูปภาพเกียรติบัตร (JPG, PNG, WebP ไม่เกิน 10MB)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCertFileChange}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                />
              </div>

              {certPreview && (
                <div className="mt-3 rounded-xl border border-slate-200 p-2 bg-slate-50 text-center">
                  <p className="text-[11px] font-semibold text-slate-500 mb-2">ตัวอย่างรูปเกียรติบัตรที่จะแนบ:</p>
                  <img src={certPreview} alt="Certificate Preview" className="max-h-56 mx-auto rounded-lg shadow-sm border border-slate-200 object-contain" />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setCertModalItem(null)}
                  disabled={certUploading}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleUploadCert}
                  disabled={certUploading || !certFileBase64}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {certUploading ? (
                    <>
                      <span className="animate-spin text-sm">🌀</span>
                      <span>กำลังอัปโหลด...</span>
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>บันทึกเกียรติบัตร</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}

function AdminPage({ user, onLogout }) {
  const [tab, setTab] = useState('activities');
  const [activities, setActivities] = useState([]);
  const [users, setUsers] = useState([]);
  const [actStatusFilter, setActStatusFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    Name: '', Email: '', Password: '', Role: 'student', Faculty: '', Department: ''
  });

  const loadData = useCallback(async () => {
    try {
      const [actRes, userRes] = await Promise.all([
        api('/api/activities?status=all'),
        api('/api/admin/users')
      ]);
      setActivities(actRes.data || (Array.isArray(actRes) ? actRes : []));
      setUsers(userRes.data || (Array.isArray(userRes) ? userRes : []));
      setError('');
    } catch (e) {
      if (e.message.includes('เข้าสู่ระบบ')) {
        go('/login');
      } else {
        setError(e.message);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 15000);
    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadData]);

  const handleUpdateActivityStatus = async (activityId, newStatus) => {
    setError(''); setSuccess('');
    setActivities(prev => prev.map(a => a.ActivityID === activityId ? { ...a, Status: newStatus } : a));
    try {
      await api(`/api/activities/${activityId}`, {
        method: 'PUT',
        body: { Status: newStatus }
      });
      setSuccess(`อัปเดตสถานะกิจกรรมเรียบร้อยแล้วเป็น "${newStatus === 'open' ? 'อนุมัติ (เปิดรับสมัคร)' : newStatus === 'rejected' ? 'ปฏิเสธ' : newStatus}"`);
      loadData();
    } catch (e) {
      setError(e.message);
      loadData();
    }
  };

  const handleDeleteActivity = async (activityId) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบกิจกรรมนี้?')) return;
    setError(''); setSuccess('');
    setActivities(prev => prev.filter(a => a.ActivityID !== activityId));
    try {
      await api(`/api/activities/${activityId}`, { method: 'DELETE' });
      setSuccess('ลบกิจกรรมเรียบร้อยแล้ว');
      loadData();
    } catch (e) {
      setError(e.message);
      loadData();
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    setError(''); setSuccess('');
    setUsers(prev => prev.map(u => u.UserID === userId ? { ...u, Role: newRole } : u));
    try {
      await api(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: { Role: newRole }
      });
      setSuccess('อัปเดตสิทธิ์ผู้ใช้งานเรียบร้อยแล้ว');
      loadData();
    } catch (e) {
      setError(e.message);
      loadData();
    }
  };

  const handleForcePasswordChange = async (userId) => {
    if (!confirm('ต้องการบังคับให้ผู้ใช้นี้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไปใช่หรือไม่?')) return;
    setError(''); setSuccess('');
    try {
      await api(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: { force_change_password: 1 }
      });
      setSuccess('ตั้งค่าให้ผู้ใช้เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้นี้ออกจากระบบ?')) return;
    setError(''); setSuccess('');
    setUsers(prev => prev.filter(u => u.UserID !== userId));
    try {
      await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
      setSuccess('ลบผู้ใช้งานเรียบร้อยแล้ว');
      loadData();
    } catch (e) {
      setError(e.message);
      loadData();
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: newUserForm
      });
      setSuccess('เพิ่มผู้ใช้งานใหม่เรียบร้อยแล้ว');
      setShowAddUserModal(false);
      setNewUserForm({ Name: '', Email: '', Password: '', Role: 'student', Faculty: '', Department: '' });
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const filteredActivities = activities.filter(a => {
    if (actStatusFilter === 'all') return true;
    return a.Status === actStatusFilter;
  });

  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase();
    return (u.Name && u.Name.toLowerCase().includes(term)) || (u.Email && u.Email.toLowerCase().includes(term));
  });

  return (
    <Shell user={user} onLogout={onLogout}>
      <main className="mx-auto max-w-6xl px-4 py-7">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">ศูนย์ผู้ดูแลระบบ (Admin Control Center)</h1>
            <p className="text-xs text-slate-500 mt-1">อนุมัติหรือปฏิเสธกิจกรรมจิตอาสา และจัดการสิทธิ์ผู้ใช้งานในระบบ</p>
          </div>
          {tab === 'users' && (
            <button
              onClick={() => setShowAddUserModal(true)}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-700 transition cursor-pointer flex items-center gap-1.5"
            >
              <span>+</span> เพิ่มผู้ใช้งานใหม่
            </button>
          )}
        </div>

        <Notice text={error} type="error" />
        <Notice text={success} type="success" />

        {/* Tab Navigation */}
        <div className="mt-6 flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setTab('activities')}
            className={`px-4 py-2.5 text-xs font-bold transition border-b-2 cursor-pointer flex items-center gap-2 ${tab === 'activities' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <span>📋</span> การอนุมัติกิจกรรม ({activities.length})
          </button>
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2.5 text-xs font-bold transition border-b-2 cursor-pointer flex items-center gap-2 ${tab === 'users' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <span>👥</span> จัดการผู้ใช้งานระบบ ({users.length})
          </button>
        </div>

        {/* TAB 1: ACTIVITY APPROVAL */}
        {tab === 'activities' && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-700">กรองสถานะกิจกรรม:</label>
                <select
                  value={actStatusFilter}
                  onChange={e => setActStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 p-2 text-xs bg-slate-50 outline-none"
                >
                  <option value="all">ทั้งหมด ({activities.length})</option>
                  <option value="draft">รออนุมัติ / แบบร่าง ({activities.filter(a => a.Status === 'draft').length})</option>
                  <option value="open">อนุมัติแล้ว / เปิดรับสมัคร ({activities.filter(a => a.Status === 'open').length})</option>
                  <option value="rejected">ถูกปฏิเสธ ({activities.filter(a => a.Status === 'rejected').length})</option>
                </select>
              </div>
              <span className="text-xs text-slate-500 font-medium">พบ {filteredActivities.length} กิจกรรม</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredActivities.map(a => (
                <div key={a.ActivityID} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {CATEGORY_LABELS[a.Category] || a.Category}
                      </span>
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        a.Status === 'open' ? 'bg-emerald-100 text-emerald-800' :
                        a.Status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {a.Status === 'open' ? 'อนุมัติแล้ว (เปิดรับ)' : a.Status === 'rejected' ? 'ถูกปฏิเสธ' : 'รออนุมัติ / แบบร่าง'}
                      </span>
                    </div>

                    <h3 className="mt-3 font-bold text-slate-900 text-base line-clamp-2">{a.Title}</h3>
                    <p className="mt-1 text-xs text-slate-500 font-medium">
                      📅 {formatFormalDateRange(a.StartDate, a.EndDate)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 font-medium">
                      ⏰ {formatFormalTime(a.StartTime, a.EndTime)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 truncate">
                      👤 <strong>ผู้จัด:</strong> {a.OrganizerName || 'ไม่ระบุ'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 truncate">
                      📍 <strong>สถานที่:</strong> {a.Location || 'ไม่ระบุ'}
                    </p>

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500 border-t pt-3">
                      <span>รับ {a.MaxParticipants || 'ไม่จำกัด'} คน</span>
                      <span className="font-semibold text-emerald-700">{a.HoursAwarded} ชั่วโมง</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t flex flex-wrap items-center justify-end gap-2">
                    {a.Status !== 'open' && (
                      <button
                        onClick={() => handleUpdateActivityStatus(a.ActivityID, 'open')}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition cursor-pointer"
                      >
                        ✓ อนุมัติกิจกรรม
                      </button>
                    )}
                    {a.Status !== 'rejected' && (
                      <button
                        onClick={() => handleUpdateActivityStatus(a.ActivityID, 'rejected')}
                        className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition cursor-pointer"
                      >
                        ✕ ปฏิเสธ
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteActivity(a.ActivityID)}
                      className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}

              {filteredActivities.length === 0 && (
                <div className="col-span-full py-16 text-center text-slate-500 bg-white rounded-3xl border border-dashed p-8">
                  ไม่พบรายการกิจกรรมตามเงื่อนไขที่เลือก
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: USER MANAGEMENT */}
        {tab === 'users' && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
              <div className="w-full sm:w-72">
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="🔍 ค้นหาตามชื่อ หรือ อีเมล..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <span className="text-xs text-slate-500 font-medium">ผู้ใช้งานทั้งหมด {filteredUsers.length} คน</span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700 border-b font-semibold">
                  <tr>
                    <th className="p-4">ชื่อ-นามสกุล</th>
                    <th className="p-4">อีเมล</th>
                    <th className="p-4">สิทธิ์ในระบบ (Role)</th>
                    <th className="p-4">วันที่สมัคร</th>
                    <th className="p-4 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map(u => (
                    <tr key={u.UserID} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="font-semibold text-slate-900">{u.Name}</div>
                        {u.Faculty && <div className="text-[11px] text-slate-400">{u.Faculty} {u.Department}</div>}
                      </td>
                      <td className="p-4 text-slate-600 text-xs font-mono">{u.Email}</td>
                      <td className="p-4">
                        <select
                          value={u.Role}
                          onChange={e => handleUpdateUserRole(u.UserID, e.target.value)}
                          className="rounded-xl border border-slate-300 p-1.5 text-xs bg-white font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="student">student (นักเรียน/นักศึกษา)</option>
                          <option value="organizer">organizer (ผู้จัดกิจกรรม)</option>
                          <option value="teacher">teacher (อาจารย์ที่ปรึกษา)</option>
                          <option value="admin">admin (ผู้ดูแลระบบ)</option>
                        </select>
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        {formatFormalDate(u.created_at)}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => handleForcePasswordChange(u.UserID)}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer"
                          title="บังคับเปลี่ยนรหัสผ่านเมื่อล็อกอินครั้งถัดไป"
                        >
                          รีเซ็ตรหัสผ่าน
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.UserID)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 cursor-pointer"
                        >
                          ลบผู้ใช้
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-slate-500">
                        ไม่พบผู้ใช้งานตามคำค้นหา
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODAL: ADD NEW USER */}
        {showAddUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-base font-bold text-slate-900">เพิ่มผู้ใช้งานใหม่ในระบบ</h3>
                <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">
                  ×
                </button>
              </div>

              <form onSubmit={handleAddUser} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ชื่อ-นามสกุล *</label>
                  <input
                    type="text" required
                    value={newUserForm.Name}
                    onChange={e => setNewUserForm({ ...newUserForm, Name: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="สมศักดิ์ รักเรียน"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">อีเมล *</label>
                  <input
                    type="email" required
                    value={newUserForm.Email}
                    onChange={e => setNewUserForm({ ...newUserForm, Email: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="somsak@example.com"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">รหัสผ่านเริ่มต้น *</label>
                  <input
                    type="password" required minLength={6}
                    value={newUserForm.Password}
                    onChange={e => setNewUserForm({ ...newUserForm, Password: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">บทบาท/สิทธิ์ (Role) *</label>
                  <select
                    value={newUserForm.Role}
                    onChange={e => setNewUserForm({ ...newUserForm, Role: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="student">student (นักเรียน/นักศึกษา/อาสาสมัคร)</option>
                    <option value="organizer">organizer (ผู้จัดกิจกรรม)</option>
                    <option value="teacher">teacher (อาจารย์ที่ปรึกษา)</option>
                    <option value="admin">admin (ผู้ดูแลระบบ)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="rounded-xl border border-slate-300 px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white shadow-xs hover:bg-emerald-700 cursor-pointer"
                  >
                    เพิ่มผู้ใช้
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  useEffect(() => {
    api('/api/auth/me')
      .then(data => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Handle automatic redirects safely using useEffect
  useEffect(() => {
    if (loading) return;

    if (!user && (path === '/organizer' || path === '/admin' || path === '/change-password')) {
      go('/login');
      return;
    }

    if (user?.forceChangePassword && path !== '/change-password') {
      go('/change-password');
      return;
    }

    if (user && (path === '/login' || path === '/register')) {
      if (user.role === 'admin') go('/admin');
      else if (user.role === 'organizer') go('/organizer');
      else go('/');
      return;
    }

    if (user && path === '/admin' && user.role !== 'admin') {
      go('/');
      return;
    }

    if (user && path === '/organizer' && !['organizer', 'admin'].includes(user.role)) {
      go('/');
      return;
    }
  }, [user, path, loading]);

  const handleLogout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    } finally {
      setUser(null);
      go('/login');
    }
  };

  if (loading) return <LoadingSpinner />;

  if (path === '/login' && !user) return <LoginPage onAuthenticated={setUser} />;
  if (path === '/register' && !user) return <RegisterPage onAuthenticated={setUser} />;
  if (path === '/forgot-password') return <ForgotPasswordPage />;
  if (path === '/change-password') return <ChangePasswordPage user={user} onDone={setUser} />;

  if (path === '/organizer' && user && ['organizer', 'admin'].includes(user.role)) {
    return <OrganizerPage user={user} onLogout={handleLogout} />;
  }

  if (path === '/admin' && user && user.role === 'admin') {
    return <AdminPage user={user} onLogout={handleLogout} />;
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Dashboard user={user} Shell={Shell} go={go} onLogout={handleLogout} />
    </Suspense>
  );
}
