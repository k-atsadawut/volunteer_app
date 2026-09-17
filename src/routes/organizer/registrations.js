import { Hono } from 'hono';
import { requireAuth } from '../../middleware/auth';
import { executeQuery } from '../../config/db';
import { notifyRegistrationApproved, notifyRegistrationRejected } from '../../utils/mailer';

const organizerRegistrations = new Hono();

// GET /api/organizer/registrations — ดูการลงทะเบียนกิจกรรม (admin หรือ organizer)
organizerRegistrations.get('/', requireAuth, async (c) => {
  const session = c.get('session');
  
  if (!['admin', 'organizer'].includes(session.user.role)) {
    return c.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, 403);
  }

  const { status, activityId, page = '1', limit = '20' } = c.req.query();
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT r.*, u.Name AS UserName, u.Email AS UserEmail, a.Title AS ActivityTitle, a.OrganizerID
    FROM registrations r
    JOIN users u ON r.UserID = u.UserID
    JOIN activities a ON r.ActivityID = a.ActivityID
  `;

  let countQuery = `
    SELECT COUNT(*) AS total FROM registrations r
    JOIN users u ON r.UserID = u.UserID
    JOIN activities a ON r.ActivityID = a.ActivityID
  `;

  const params = [];
  const conditions = [];

  if (session.user.role !== 'admin') {
    conditions.push('a.OrganizerID = ?');
    params.push(session.user.id);
  }

  if (status) {
    conditions.push('r.Status = ?');
    params.push(status);
  }
  if (activityId) {
    conditions.push('r.ActivityID = ?');
    params.push(activityId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
    countQuery += ' WHERE ' + conditions.join(' AND ');
  }

  const countResult = await executeQuery(countQuery, params, c.env);
  const total = countResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limitNum) || 1;

  query += ' ORDER BY r.created_at DESC';
  query += ' LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const result = await executeQuery(query, params, c.env);

  return c.json({
    data: result,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    }
  });
});

// PATCH /api/organizer/registrations/:id — approve, reject, attended, หรือ no_show
organizerRegistrations.patch('/:id', requireAuth, async (c) => {
  const session = c.get('session');
  
  if (!['admin', 'organizer'].includes(session.user.role)) {
    return c.json({ error: 'ไม่มีสิทธิ์จัดการการลงทะเบียน' }, 403);
  }

  const id = c.req.param('id');
  const body = await c.req.json();
  const action = body.action || body.status;

  const validActions = ['approved', 'rejected', 'attended', 'no_show'];
  if (!action || !validActions.includes(action)) {
    return c.json({ error: 'action ไม่ถูกต้อง' }, 400);
  }

  // ตรวจสอบว่ากิจกรรมนี้เป็นของ organizer คนนี้หรือไม่ (admin ผ่านได้ตลอด)
  const activityCheck = await executeQuery(`
    SELECT a.OrganizerID, a.ActivityID, a.HoursAwarded, r.UserID, r.Status AS CurrentStatus
    FROM registrations r
    JOIN activities a ON r.ActivityID = a.ActivityID
    WHERE r.RegistrationID = ? LIMIT 1
  `, [id], c.env);

  if (!activityCheck[0]) {
    return c.json({ error: 'ไม่พบรายการลงทะเบียน' }, 404);
  }

  const regInfo = activityCheck[0];

  if (session.user.role !== 'admin' && regInfo.OrganizerID !== session.user.id) {
    return c.json({ error: 'ไม่มีสิทธิ์จัดการกิจกรรมนี้' }, 403);
  }

  await executeQuery('UPDATE registrations SET Status = ? WHERE RegistrationID = ?', [action, id], c.env);

  // ถ้าเปลี่ยนสถานะเป็น attended ให้บันทึกชั่วโมงจิตอาสาลง hours_log และเพิ่ม total_hours
  if (action === 'attended' && regInfo.CurrentStatus !== 'attended') {
    const existingLog = await executeQuery(
      'SELECT LogID FROM hours_log WHERE RegistrationID = ? LIMIT 1',
      [id],
      c.env
    );
    if (existingLog.length === 0) {
      const hours = regInfo.HoursAwarded || 0;
      await executeQuery(
        'INSERT INTO hours_log (UserID, ActivityID, RegistrationID, Hours, GrantedBy) VALUES (?, ?, ?, ?, ?)',
        [regInfo.UserID, regInfo.ActivityID, id, hours, session.user.id],
        c.env
      );
      await executeQuery(
        'UPDATE users SET total_hours = total_hours + ? WHERE UserID = ?',
        [hours, regInfo.UserID],
        c.env
      );
    }
  }

  const rows = await executeQuery(`
    SELECT r.UserID, a.Title AS ActivityTitle, a.StartDate, a.EndDate, a.Location, u.Email AS UserEmail
    FROM registrations r
    JOIN activities a ON r.ActivityID = a.ActivityID
    JOIN users u ON r.UserID = u.UserID
    WHERE r.RegistrationID = ?
  `, [id], c.env);

  if (rows.length > 0) {
    const reg = rows[0];
    let msg = `สถานะการลงทะเบียนกิจกรรม "${reg.ActivityTitle}" ถูกเปลี่ยนเป็น ${action}`;
    if (action === 'approved') msg = `การสมัครเข้าร่วมกิจกรรม "${reg.ActivityTitle}" ได้รับการอนุมัติแล้ว`;
    if (action === 'rejected') msg = `การสมัครเข้าร่วมกิจกรรม "${reg.ActivityTitle}" ถูกปฏิเสธ`;
    if (action === 'attended') msg = `ยินดีด้วย! คุณได้รับการบันทึกเข้าร่วมกิจกรรม "${reg.ActivityTitle}" และได้รับชั่วโมงจิตอาสาแล้ว`;

    await executeQuery(
      'INSERT INTO notifications (UserID, RegistrationID, Message) VALUES (?, ?, ?)',
      [reg.UserID, id, msg],
      c.env
    );

    if (reg.UserEmail && (action === 'approved' || action === 'rejected')) {
      const fn = action === 'approved' ? notifyRegistrationApproved : notifyRegistrationRejected;
      fn(reg, reg.UserEmail, c.env).catch(err => console.error('Email error:', err));
    }
  }

  return c.json({ success: true, message: 'อัปเดตสถานะสำเร็จ' });
});


// POST /api/organizer/registrations/:id/certificate — ผู้จัดแนบเกียรติบัตรหลังเช็คชื่อเข้าร่วมแล้ว
organizerRegistrations.post('/:id/certificate', requireAuth, async (c) => {
  try {
    const session = c.get('session');
    if (!['admin', 'organizer'].includes(session.user.role)) {
      return c.json({ error: 'ไม่มีสิทธิ์เพิ่มเกียรติบัตร' }, 403);
    }

    const id = c.req.param('id');
    const { certificateBase64 } = await c.req.json();
    if (!certificateBase64) return c.json({ error: 'กรุณาแนบรูปเกียรติบัตร' }, 400);

    const match = certificateBase64.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
    if (!match) return c.json({ error: 'รองรับเฉพาะ JPG, PNG และ WebP เท่านั้น' }, 400);

    let binary;
    try {
      binary = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    } catch {
      return c.json({ error: 'ไฟล์รูปภาพไม่ถูกต้อง' }, 400);
    }
    const MAX_SIZE = 10 * 1024 * 1024;
    if (binary.length > MAX_SIZE) return c.json({ error: 'ขนาดไฟล์ต้องไม่เกิน 10MB' }, 400);

    const rows = await executeQuery(`
      SELECT r.RegistrationID, r.UserID, r.Status, a.ActivityID, a.Title, a.OrganizerID
      FROM registrations r
      JOIN activities a ON r.ActivityID = a.ActivityID
      WHERE r.RegistrationID = ? LIMIT 1
    `, [id], c.env);
    const registration = rows[0];
    if (!registration) return c.json({ error: 'ไม่พบรายการลงทะเบียน' }, 404);
    if (session.user.role !== 'admin' && String(registration.OrganizerID) !== String(session.user.id)) {
      return c.json({ error: 'ไม่มีสิทธิ์จัดการกิจกรรมนี้' }, 403);
    }
    if (registration.Status !== 'attended') {
      return c.json({ error: 'สามารถเพิ่มเกียรติบัตรได้หลังจากบันทึกสถานะเป็นเข้าร่วมแล้วเท่านั้น' }, 400);
    }
    if (!c.env.PHOTOS_BUCKET) {
      return c.json({ error: 'ระบบยังไม่ได้ตั้งค่าที่เก็บรูปภาพ (R2 bucket)' }, 500);
    }

    const ext = match[1].split('/')[1].toLowerCase().replace('jpeg', 'jpg');
    const key = `certificates/${registration.ActivityID}/${registration.UserID}/${Date.now()}.${ext}`;
    await c.env.PHOTOS_BUCKET.put(key, binary, {
      httpMetadata: { contentType: match[1].toLowerCase() }
    });

    await executeQuery('UPDATE registrations SET CertificateUrl = ? WHERE RegistrationID = ?', [key, id], c.env);
    await executeQuery(
      'INSERT INTO notifications (UserID, RegistrationID, Message) VALUES (?, ?, ?)',
      [registration.UserID, id, `ผู้จัดได้เพิ่มเกียรติบัตรสำหรับกิจกรรม "${registration.Title}" ให้คุณแล้ว`],
      c.env
    );

    return c.json({ success: true, message: 'เพิ่มเกียรติบัตรสำเร็จ' });
  } catch (err) {
    console.error('Error attaching certificate:', err);
    return c.json({ error: err.message || 'เกิดข้อผิดพลาดในการแนบเกียรติบัตร' }, 500);
  }
});

export default organizerRegistrations;
