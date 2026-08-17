import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { notifyAdminNewRegistration } from '../utils/mailer';
import { checkAndNotifyQueue } from './queues';
import { executeQuery } from '../config/db';

const registrations = new Hono();

// GET /api/registrations — ดูการลงทะเบียนของตัวเอง
registrations.get('/', requireAuth, async (c) => {
  const session = c.get('session');

  const result = await executeQuery(`
    SELECT r.*, a.Title, a.StartDate, a.EndDate, a.Location, a.HoursAwarded
    FROM registrations r
    JOIN activities a ON r.ActivityID = a.ActivityID
    WHERE r.UserID = ?
    ORDER BY a.StartDate DESC
  `, [session.user.id], c.env);

  return c.json(result);
});

// POST /api/registrations — สมัครเข้าร่วมกิจกรรม
registrations.post('/', requireAuth, async (c) => {
  const session = c.get('session');
  const { activityId, note } = await c.req.json();

  if (!activityId) {
    return c.json({ error: 'กรุณาระบุกิจกรรมที่ต้องการสมัคร' }, 400);
  }

  const activityRows = await executeQuery(
    'SELECT * FROM activities WHERE ActivityID = ? LIMIT 1',
    [activityId],
    c.env
  );
  const activity = activityRows[0];

  if (!activity) return c.json({ error: 'ไม่พบกิจกรรมนี้' }, 404);
  if (activity.Status !== 'open') {
    return c.json({ error: 'กิจกรรมนี้ไม่ได้เปิดรับสมัครในขณะนี้' }, 400);
  }

  // ตรวจว่าสมัครซ้ำหรือยัง
  const already = await executeQuery(
    `SELECT RegistrationID FROM registrations
     WHERE UserID = ? AND ActivityID = ? AND Status IN ('pending','approved','attended') LIMIT 1`,
    [session.user.id, activityId],
    c.env
  );
  if (already.length > 0) {
    return c.json({ error: 'คุณลงทะเบียนกิจกรรมนี้ไว้แล้ว' }, 400);
  }

  // ตรวจจำนวนที่นั่งเต็มหรือยัง
  if (activity.MaxParticipants) {
    const countRows = await executeQuery(
      `SELECT COUNT(*) AS cnt FROM registrations
       WHERE ActivityID = ? AND Status IN ('pending','approved','attended')`,
      [activityId],
      c.env
    );
    if (countRows[0].cnt >= activity.MaxParticipants) {
      return c.json({ error: 'กิจกรรมนี้มีผู้สมัครเต็มจำนวนแล้ว สามารถเข้าคิวรอได้ที่ /api/queues' }, 400);
    }
  }

  const result = await executeQuery(
    `INSERT INTO registrations (UserID, ActivityID, Status, Note) VALUES (?, ?, 'pending', ?)`,
    [session.user.id, activityId, note || null],
    c.env
  );

  const registrationId = result.insertId;

  // แจ้ง admin/organizer ว่ามีผู้สมัครใหม่
  const notifyTargets = await executeQuery(
    `SELECT UserID, Email FROM users WHERE Role = 'admin' OR UserID = ?`,
    [activity.OrganizerID || 0],
    c.env
  );

  const user = await executeQuery('SELECT Name, Email FROM users WHERE UserID = ?', [session.user.id], c.env);

  for (const target of notifyTargets) {
    await executeQuery(
      'INSERT INTO notifications (UserID, RegistrationID, Message) VALUES (?, ?, ?)',
      [target.UserID, registrationId, `มีผู้สมัครเข้าร่วมกิจกรรม "${activity.Title}" รอการอนุมัติ`],
      c.env
    );
    if (target.Email) {
      notifyAdminNewRegistration({
        ActivityTitle: activity.Title,
        UserName: user[0]?.Name,
        UserEmail: user[0]?.Email,
      }, target.Email, c.env).catch(err => console.error('Email error:', err));
    }
  }

  return c.json({ success: true, registrationId });
});

// PATCH /api/registrations/:id/cancel — ยกเลิกการลงทะเบียน
registrations.patch('/:id/cancel', requireAuth, async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');

  const rows = await executeQuery(
    'SELECT * FROM registrations WHERE RegistrationID = ? AND UserID = ? LIMIT 1',
    [id, session.user.id],
    c.env
  );

  if (!rows[0]) return c.json({ error: 'ไม่พบการลงทะเบียนนี้' }, 404);
  if (!['pending', 'approved'].includes(rows[0].Status)) {
    return c.json({ error: 'ไม่สามารถยกเลิกได้ในสถานะนี้' }, 400);
  }

  const registration = rows[0];

  await executeQuery("UPDATE registrations SET Status = 'cancelled' WHERE RegistrationID = ?", [id], c.env);

  // แจ้งคนที่รอคิวถัดไปสำหรับกิจกรรมนี้
  await checkAndNotifyQueue(registration.ActivityID, c.env);

  return c.json({ success: true });
});

export default registrations;
