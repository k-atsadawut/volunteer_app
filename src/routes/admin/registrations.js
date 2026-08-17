import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/auth';
import { executeQuery } from '../../config/db';
import { notifyRegistrationApproved, notifyRegistrationRejected } from '../../utils/mailer';

const adminRegistrations = new Hono();

// GET /api/admin/registrations — ดูการลงทะเบียนทั้งหมด (filter ตาม status / activityId)
adminRegistrations.get('/', requireAdmin, async (c) => {
  const { status, activityId } = c.req.query();

  let query = `
    SELECT r.*, u.Name AS UserName, u.Email AS UserEmail, a.Title AS ActivityTitle
    FROM registrations r
    JOIN users u ON r.UserID = u.UserID
    JOIN activities a ON r.ActivityID = a.ActivityID
  `;

  const params = [];
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
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY r.created_at DESC';

  const result = await executeQuery(query, params, c.env);
  return c.json(result);
});

// PATCH /api/admin/registrations/:id — approve หรือ reject
adminRegistrations.patch('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const { action } = await c.req.json();

  if (!['approved', 'rejected'].includes(action)) {
    return c.json({ error: 'action ต้องเป็น approved หรือ rejected' }, 400);
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

export default adminRegistrations;
