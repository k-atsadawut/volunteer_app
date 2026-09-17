import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { executeQuery, executeTransaction } from '../config/db';
import { logAudit, logError, logInfo } from '../utils/logger';
import { notifyAdminNewRegistration } from '../utils/mailer';
import { checkAndNotifyQueue } from './queues';
import { invalidateCache } from '../utils/cache';

const registrations = new Hono();

// GET /api/registrations — ดูการลงทะเบียนของตัวเอง
registrations.get('/', requireAuth, async (c) => {
  const session = c.get('session');

  const result = await executeQuery(`
    SELECT r.*, a.Title, a.StartDate, a.EndDate, a.Location, a.LocationLat, a.LocationLng, a.HoursAwarded
    FROM registrations r
    JOIN activities a ON r.ActivityID = a.ActivityID
    WHERE r.UserID = ?
    ORDER BY a.StartDate DESC
  `, [session.user.id], c.env);

  return c.json(result);
});



// GET /api/registrations/:id/certificate — ดูเกียรติบัตรของตัวเอง
registrations.get('/:id/certificate', requireAuth, async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');

  const rows = await executeQuery(`
    SELECT r.CertificateUrl, r.UserID, a.OrganizerID
    FROM registrations r
    JOIN activities a ON r.ActivityID = a.ActivityID
    WHERE r.RegistrationID = ? LIMIT 1
  `, [id], c.env);
  const registration = rows[0];

  if (!registration) return c.json({ error: 'ไม่พบการลงทะเบียนนี้' }, 404);

  const allowed = registration.UserID === session.user.id
    || session.user.role === 'admin'
    || (session.user.role === 'organizer' && registration.OrganizerID === session.user.id);
  if (!allowed) return c.json({ error: 'ไม่มีสิทธิ์เข้าถึงเกียรติบัตรนี้' }, 403);
  if (!registration.CertificateUrl) return c.json({ error: 'ยังไม่มีเกียรติบัตรสำหรับรายการนี้' }, 404);
  if (!c.env.PHOTOS_BUCKET) return c.json({ error: 'ระบบยังไม่ได้ตั้งค่าที่เก็บรูปภาพ' }, 500);

  const object = await c.env.PHOTOS_BUCKET.get(registration.CertificateUrl);
  if (!object) return c.json({ error: 'ไม่พบไฟล์เกียรติบัตร' }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');
  return new Response(object.body, { headers });
});

// POST /api/registrations — สมัครเข้าร่วมกิจกรรม
registrations.post('/', requireAuth, async (c) => {
  const session = c.get('session');
  const { activityId, note } = await c.req.json();

  if (!activityId) {
    return c.json({ error: 'กรุณาระบุกิจกรรมที่ต้องการสมัคร' }, 400);
  }

  try {
    // Use transaction to prevent race condition when checking capacity
    const results = await executeTransaction([
      // 1. Get activity details
      {
        sql: 'SELECT * FROM activities WHERE ActivityID = ? LIMIT 1 FOR UPDATE',
        params: [activityId]
      },
      // 2. Check duplicate registration
      {
        sql: `SELECT RegistrationID FROM registrations
             WHERE UserID = ? AND ActivityID = ? AND Status IN ('pending','approved','attended') LIMIT 1`,
        params: [session.user.id, activityId]
      },
      // 3. Check capacity if MaxParticipants is set
      {
        sql: `SELECT COUNT(*) AS cnt FROM registrations
             WHERE ActivityID = ? AND Status IN ('pending','approved','attended')`,
        params: [activityId]
      }
    ], c.env);

    const activity = results[0][0];
    if (!activity) return c.json({ error: 'ไม่พบกิจกรรมนี้' }, 404);
    if (activity.Status !== 'open') {
      return c.json({ error: 'กิจกรรมนี้ไม่ได้เปิดรับสมัครในขณะนี้' }, 400);
    }

    const already = results[1];
    if (already.length > 0) {
      return c.json({ error: 'คุณลงทะเบียนกิจกรรมนี้ไว้แล้ว' }, 400);
    }

    // Check capacity with locking
    if (activity.MaxParticipants) {
      const count = results[2][0].cnt;
      if (count >= activity.MaxParticipants) {
        return c.json({ error: 'กิจกรรมนี้มีผู้สมัครเต็มจำนวนแล้ว สามารถเข้าคิวรอได้ที่ /api/queues' }, 400);
      }
    }

    // Insert registration with auto-approved status
    const insertResult = await executeQuery(
      `INSERT INTO registrations (UserID, ActivityID, Status, Note) VALUES (?, ?, 'approved', ?)`,
      [session.user.id, activityId, note || null],
      c.env
    );

    // Create notification for auto-approval
    await executeQuery(
      'INSERT INTO notifications (UserID, RegistrationID, Message) VALUES (?, ?, ?)',
      [
        session.user.id,
        insertResult.insertId,
        `การสมัครเข้าร่วมกิจกรรม "${activity.Title}" ได้รับการอนุมัติเรียบร้อยแล้ว (อนุมัติอัตโนมัติ)`
      ],
      c.env
    ).catch(err => console.error('Notification insert error:', err));

    logAudit('registration_created', session.user.id, {
      activityId,
      activityTitle: activity.Title,
      registrationId: insertResult.insertId,
      status: 'approved'
    });

    // Notify admin
    try {
      await notifyAdminNewRegistration({
        ActivityTitle: activity.Title,
        UserName: session.user.name,
        UserEmail: session.user.email
      }, c.env.ADMIN_EMAIL || 'admin@volunteer.ac.th', c.env);
    } catch (emailError) {
      logError('Failed to send registration notification email', emailError, { registrationId: insertResult.insertId });
    }

    // Invalidate activities list cache to update registered_count immediately
    await invalidateCache('activities', c.env);

    return c.json({ success: true, registrationId: insertResult.insertId, status: 'approved' });
  } catch (error) {
    logError('Registration transaction error', error, { activityId, userId: session.user.id });
    return c.json({ error: 'เกิดข้อผิดพลาดในการลงทะเบียน กรุณาลองใหม่' }, 500);
  }
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

  logAudit('registration_cancelled', session.user.id, {
    registrationId: id,
    activityId: registration.ActivityID,
    previousStatus: registration.Status
  });

  // แจ้งคนที่รอคิวถัดไปสำหรับกิจกรรมนี้
  await checkAndNotifyQueue(registration.ActivityID, c.env);

  // Invalidate activities list cache
  await invalidateCache('activities', c.env);

  return c.json({ success: true });
});

export default registrations;
