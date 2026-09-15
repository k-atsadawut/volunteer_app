import { Hono } from 'hono';
import { requireAuth } from '../../middleware/auth';
import { executeQuery } from '../../config/db';
import { notifyRegistrationApproved, notifyRegistrationRejected } from '../../utils/mailer';

const organizerRegistrations = new Hono();

// GET /api/organizer/registrations — ดูการลงทะเบียนกิจกรรมของตัวเอง (organizer only)
organizerRegistrations.get('/', requireAuth, async (c) => {
  const session = c.get('session');
  
  if (session.user.role !== 'organizer') {
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
    WHERE a.OrganizerID = ?
  `;

  const countQuery = `
    SELECT COUNT(*) AS total FROM registrations r
    JOIN users u ON r.UserID = u.UserID
    JOIN activities a ON r.ActivityID = a.ActivityID
    WHERE a.OrganizerID = ?
  `;

  const params = [session.user.id];
  const conditions = [];

  if (status) {
    conditions.push('r.Status = ?');
    params.push(status);
  }
  if (activityId) {
    conditions.push('r.ActivityID = ?');
    params.push(activityId);
  }
  if (conditions.length > 0) {
    query += ' AND ' + conditions.join(' AND ');
    countQuery += ' AND ' + conditions.join(' AND ');
  }

  const countResult = await executeQuery(countQuery, params, c.env);
  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limitNum);

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

// PATCH /api/organizer/registrations/:id — approve หรือ reject (organizer only, for their activities)
organizerRegistrations.patch('/:id', requireAuth, async (c) => {
  const session = c.get('session');
  
  if (session.user.role !== 'organizer') {
    return c.json({ error: 'ไม่มีสิทธิ์อนุมัติ/ปฏิเสธการลงทะเบียน' }, 403);
  }

  const id = c.req.param('id');
  const { action } = await c.req.json();

  if (!['approved', 'rejected'].includes(action)) {
    return c.json({ error: 'action ต้องเป็น approved หรือ rejected' }, 400);
  }

  // ตรวจสอบว่ากิจกรรมนี้เป็นของ organizer คนนี้หรือไม่
  const activityCheck = await executeQuery(`
    SELECT a.OrganizerID FROM registrations r
    JOIN activities a ON r.ActivityID = a.ActivityID
    WHERE r.RegistrationID = ? LIMIT 1
  `, [id], c.env);

  if (!activityCheck[0] || activityCheck[0].OrganizerID !== session.user.id) {
    return c.json({ error: 'ไม่มีสิทธิ์จัดการกิจกรรมนี้' }, 403);
  }

  await executeQuery('UPDATE registrations SET Status = ? WHERE RegistrationID = ?', [action, id], c.env);

  const rows = await executeQuery(`
    SELECT r.UserID, a.Title AS ActivityTitle, a.StartDate, a.EndDate, a.Location, u.Email AS UserEmail
    FROM registrations r
    JOIN activities a ON r.ActivityID = a.ActivityID
    JOIN users u ON r.UserID = u.UserID
    WHERE r.RegistrationID = ?
  `, [id], c.env);

  if (rows.length > 0) {
    const reg = rows[0];
    const msg = action === 'approved'
      ? `การสมัครเข้าร่วมกิจกรรม "${reg.ActivityTitle}" ได้รับการอนุมัติแล้ว`
      : `การสมัครเข้าร่วมกิจกรรม "${reg.ActivityTitle}" ถูกปฏิเสธ`;

    await executeQuery(
      'INSERT INTO notifications (UserID, RegistrationID, Message) VALUES (?, ?, ?)',
      [reg.UserID, id, msg],
      c.env
    );

    if (reg.UserEmail) {
      const fn = action === 'approved' ? notifyRegistrationApproved : notifyRegistrationRejected;
      fn(reg, reg.UserEmail, c.env).catch(err => console.error('Email error:', err));
    }
  }

  return c.json({ success: true });
});

export default organizerRegistrations;
