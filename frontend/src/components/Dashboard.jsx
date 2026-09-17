import { useCallback, useEffect, useState } from 'react';
import { formatFormalDate, formatFormalDateRange, formatFormalTime } from '../utils/date';

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

function Notice({ text, type = 'error' }) {
  if (!text) return null;
  return (
    <div className={`mt-4 rounded-xl p-4 text-sm font-medium border ${type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
      {text}
    </div>
  );
}

function nav(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function Dashboard({ user, Shell, onLogout, go: goProp }) {
  const navigate = goProp || nav;
  const [activities, setActivities] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [tab, setTab] = useState('activities');
  const [message, setMessage] = useState('');
  const [detailActivity, setDetailActivity] = useState(null);

  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    try {
      const promises = [api('/api/activities?status=open')];
      if (user) promises.push(api('/api/registrations'));
      const results = await Promise.all(promises);
      setActivities(results[0].data || results[0]);
      if (user) setRegistrations(results[1].data || results[1]);
    } catch (e) {
      setMessage(e.message);
    } finally {
      if (showIndicator) setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    // Instant background sync every 15 seconds
    const timer = setInterval(() => load(false), 15000);
    // Instant fetch when returning to tab
    const handleFocus = () => load(false);
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [load]);

  const isRegistered = id => registrations.some(r => r.ActivityID === id && ['pending', 'approved', 'attended'].includes(r.Status));

  const register = async id => {
    if (!user) { navigate('/login'); return; }
    
    // Optimistic UI update — update local state immediately
    const targetActivity = activities.find(a => a.ActivityID === id);
    setActivities(prev => prev.map(a => a.ActivityID === id ? { ...a, registered_count: (a.registered_count || 0) + 1 } : a));
    if (targetActivity) {
      setRegistrations(prev => [{
        RegistrationID: 'temp-' + Date.now(),
        ActivityID: id,
        Title: targetActivity.Title,
        StartDate: targetActivity.StartDate,
        Location: targetActivity.Location,
        Status: 'approved'
      }, ...prev]);
    }
    setMessage('สมัครเข้าร่วมกิจกรรมสำเร็จแล้ว (อนุมัติอัตโนมัติ)');

    try {
      await api('/api/registrations', { method: 'POST', body: { activityId: id } });
      load();
    } catch (e) {
      setMessage(e.message);
      load();
    }
  };

  const cancel = async id => {
    const reg = registrations.find(r => r.RegistrationID === id);
    setRegistrations(prev => prev.map(r => r.RegistrationID === id ? { ...r, Status: 'cancelled' } : r));
    if (reg) {
      setActivities(prev => prev.map(a => a.ActivityID === reg.ActivityID ? { ...a, registered_count: Math.max(0, (a.registered_count || 1) - 1) } : a));
    }
    setMessage('ยกเลิกการสมัครแล้ว');

    try {
      await api(`/api/registrations/${id}/cancel`, { method: 'PATCH' });
      load();
    } catch (e) {
      setMessage(e.message);
      load();
    }
  };

  return (
    <Shell user={user} onLogout={onLogout} onRefresh={() => load(true)} refreshing={refreshing}>
      <main className="mx-auto max-w-6xl px-4 py-7">
        {user ? (
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-md">
            <div>
              <h1 className="text-2xl font-bold">สวัสดี {user.name}</h1>
              <p className="mt-1 text-blue-100">มาร่วมเป็นส่วนหนึ่งในการทำกิจกรรมดีๆ เพื่อสังคมกันเถอะ</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-xl px-5 py-3 border border-white/20 text-center">
              <p className="text-xs font-medium text-blue-100">ชั่วโมงจิตอาสาสะสม</p>
              <p className="text-2xl font-extrabold">{user.totalHours ?? 0} <span className="text-sm font-normal">ชม.</span></p>
            </div>
          </div>
        ) : (
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-md">
            <div>
              <h1 className="text-2xl font-bold">ยินดีต้อนรับสู่ Volunteer Activity Hub</h1>
              <p className="mt-1 text-blue-100">ค้นหากิจกรรมจิตอาสาที่คุณสนใจ เข้าสู่ระบบหรือสมัครสมาชิกเพื่อลงทะเบียนเข้าร่วม</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => navigate('/login')} className="rounded-xl bg-white/20 backdrop-blur-md px-5 py-2.5 text-sm font-medium text-white border border-white/30 hover:bg-white/30 transition">
                เข้าสู่ระบบ
              </button>
              <button onClick={() => navigate('/register')} className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 shadow-xs hover:bg-blue-50 transition">
                สมัครสมาชิก
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 flex overflow-x-auto whitespace-nowrap gap-3 border-b border-slate-200 pb-0.5">
          <button onClick={() => setTab('activities')} className={`px-4 py-2.5 font-medium border-b-2 text-sm transition cursor-pointer ${tab === 'activities' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            กิจกรรมเปิดรับสมัคร
          </button>
          {user && (
            <button onClick={() => setTab('mine')} className={`px-4 py-2.5 font-medium border-b-2 text-sm transition cursor-pointer ${tab === 'mine' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              การสมัครของฉัน
            </button>
          )}
        </div>

        <Notice text={message} type={message.includes('แล้ว') || message.includes('สำเร็จ') ? 'success' : 'error'} />

        {tab === 'activities' ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {activities.map(item => (
              <article key={item.ActivityID} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-100">
                      {CATEGORY_LABELS[item.Category] || item.Category}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                      +{item.HoursAwarded} ชม.
                    </span>
                  </div>
                  <h2 
                    onClick={() => setDetailActivity(item)}
                    className="mt-3 font-semibold text-slate-900 text-base leading-snug cursor-pointer hover:text-blue-600 transition"
                  >
                    {item.Title}
                  </h2>
                  {item.Description && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{item.Description}</p>}
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <p className="flex items-center gap-1.5">
                      <span>วันที่:</span> {formatFormalDateRange(item.StartDate, item.EndDate)}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span>สถานที่:</span> {item.Location || 'ไม่ระบุสถานที่'}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span>จัดโดย:</span> {item.OrganizerName || 'ผู้จัดจิตอาสา'}
                    </p>
                  </div>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button 
                    onClick={() => setDetailActivity(item)}
                    className="text-xs text-slate-500 hover:text-blue-600 font-medium underline transition cursor-pointer"
                  >
                    ดูรายละเอียด
                  </button>
                  {user ? (
                    isRegistered(item.ActivityID) ? (
                      <span className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                        ลงทะเบียนแล้ว
                      </span>
                    ) : (
                      <button onClick={() => register(item.ActivityID)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-blue-700 transition cursor-pointer">
                        สมัครเข้าร่วม
                      </button>
                    )
                  ) : (
                    <button onClick={() => navigate('/login')} className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-300 transition cursor-pointer">
                      เข้าสู่ระบบเพื่อสมัคร
                    </button>
                  )}
                </div>
              </article>
            ))}
            {activities.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-2xl border border-dashed">
                ยังไม่มีกิจกรรมที่เปิดรับสมัครในขณะนี้
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-700 border-b font-medium">
                <tr>
                  <th className="p-4">กิจกรรม</th>
                  <th className="p-4">วันที่</th>
                  <th className="p-4">สถานที่</th>
                  <th className="p-4">สถานะ</th>
                  <th className="p-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrations.map(item => (
                  <tr key={item.RegistrationID} className="hover:bg-slate-50">
                    <td className="p-4 font-medium text-slate-900">
                      <button 
                        onClick={() => {
                          const act = activities.find(a => a.ActivityID === item.ActivityID) || item;
                          setDetailActivity(act);
                        }}
                        className="text-left font-semibold text-slate-900 hover:text-blue-600 transition cursor-pointer"
                      >
                        {item.Title}
                      </button>
                    </td>
                    <td className="p-4 text-slate-600 text-xs">{formatFormalDate(item.StartDate)}</td>
                    <td className="p-4 text-slate-600 text-xs">{item.Location || '-'}</td>
                    <td className="p-4">
                      <span className="inline-block rounded-lg px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700">
                        {STATUS_LABELS[item.Status] || item.Status}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-3">
                      {['pending', 'approved'].includes(item.Status) && (
                        <button onClick={() => cancel(item.RegistrationID)} className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline cursor-pointer">
                          ยกเลิกสมัคร
                        </button>
                      )}
                      {item.Status === 'attended' && item.CertificateUrl && (
                        <button onClick={() => window.open(`/api/registrations/${item.RegistrationID}/certificate`, '_blank')} className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer">
                          ดูเกียรติบัตร
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {registrations.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-500">
                      คุณยังไม่ได้ลงทะเบียนกิจกรรมใดๆ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Activity Details Modal */}
        {detailActivity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-100 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-100">
                      {CATEGORY_LABELS[detailActivity.Category] || detailActivity.Category}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      +{detailActivity.HoursAwarded || 0} ชม. จิตอาสา
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 leading-snug">{detailActivity.Title}</h2>
                </div>
                <button 
                  onClick={() => setDetailActivity(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                >
                  ✕
                </button>
              </div>

              <div className="py-4 space-y-4 text-sm text-slate-700">
                {detailActivity.Description && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">รายละเอียดกิจกรรม</h3>
                    <p className="whitespace-pre-line text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
                      {detailActivity.Description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-slate-100 p-3 bg-white">
                    <p className="font-semibold text-slate-900 mb-0.5">🗓️ วันที่จัดกิจกรรม</p>
                    <p className="text-slate-600">
                      {formatFormalDateRange(detailActivity.StartDate, detailActivity.EndDate)}
                    </p>
                    {(detailActivity.StartTime || detailActivity.EndTime) && (
                      <p className="text-slate-500 mt-1">
                        {formatFormalTime(detailActivity.StartTime, detailActivity.EndTime)}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-100 p-3 bg-white">
                    <p className="font-semibold text-slate-900 mb-0.5">📍 สถานที่</p>
                    <p className="text-slate-600">{detailActivity.Location || 'ไม่ระบุสถานที่'}</p>
                    {detailActivity.LocationLat && detailActivity.LocationLng && (
                      <div className="mt-2 space-y-2">
                        <a 
                          href={`https://maps.google.com/?q=${detailActivity.LocationLat},${detailActivity.LocationLng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
                        >
                          เปิดดูบน Google Maps ↗
                        </a>
                        <div className="overflow-hidden rounded-xl border border-slate-200 mt-1 shadow-inner">
                          <iframe
                            title="Location Map"
                            width="100%"
                            height="160"
                            loading="lazy"
                            src={`https://maps.google.com/maps?q=${detailActivity.LocationLat},${detailActivity.LocationLng}&z=15&output=embed`}
                            className="border-0"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-100 p-3 bg-white">
                    <p className="font-semibold text-slate-900 mb-0.5">👥 ผู้จัดกิจกรรม</p>
                    <p className="text-slate-600">{detailActivity.OrganizerName || 'ผู้จัดจิตอาสา'}</p>
                  </div>

                  <div className="rounded-xl border border-slate-100 p-3 bg-white">
                    <p className="font-semibold text-slate-900 mb-0.5">📊 จำนวนผู้สมัคร</p>
                    <p className="text-slate-600">
                      สมัครแล้ว <strong className="text-slate-900 font-bold">{detailActivity.registered_count || 0}</strong> {detailActivity.MaxParticipants ? `/ ${detailActivity.MaxParticipants}` : ''} คน
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-2">
                <button 
                  onClick={() => setDetailActivity(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  ปิดหน้าต่าง
                </button>
                {user ? (
                  isRegistered(detailActivity.ActivityID) ? (
                    <span className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700">
                      ลงทะเบียนแล้ว
                    </span>
                  ) : (
                    <button 
                      onClick={() => {
                        register(detailActivity.ActivityID);
                        setDetailActivity(null);
                      }}
                      className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-xs transition"
                    >
                      สมัครเข้าร่วมกิจกรรมนี้
                    </button>
                  )
                ) : (
                  <button 
                    onClick={() => navigate('/login')}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-xs transition"
                  >
                    เข้าสู่ระบบเพื่อสมัคร
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}