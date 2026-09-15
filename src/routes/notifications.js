import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { executeQuery } from '../config/db';

const notifications = new Hono();

// GET /api/notifications — ดูการแจ้งเตือนของตัวเอง
notifications.get('/', requireAuth, async (c) => {
  const session = c.get('session');

  const result = await executeQuery(`
    SELECT n.*, 
           CASE 
             WHEN n.RegistrationID IS NOT NULL THEN 
               (SELECT Title FROM activities WHERE ActivityID = 
                 (SELECT ActivityID FROM registrations WHERE RegistrationID = n.RegistrationID)
               )
             ELSE NULL
           END AS ActivityTitle
    FROM notifications n
    WHERE n.UserID = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `, [session.user.id], c.env);

  return c.json(result);
});

// GET /api/notifications/unread-count — นับจำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน
notifications.get('/unread-count', requireAuth, async (c) => {
  const session = c.get('session');

  const result = await executeQuery(
    'SELECT COUNT(*) AS count FROM notifications WHERE UserID = ? AND IsRead = 0',
    [session.user.id],
    c.env
  );

  return c.json({ count: result[0].count });
});

// PATCH /api/notifications/:id/read — ทำเครื่องหมายว่าอ่านแล้ว
notifications.patch('/:id/read', requireAuth, async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');

  const rows = await executeQuery(
    'SELECT * FROM notifications WHERE NotificationID = ? AND UserID = ? LIMIT 1',
    [id, session.user.id],
    c.env
  );

  if (!rows[0]) return c.json({ error: 'ไม่พบการแจ้งเตือนนี้' }, 404);

  await executeQuery(
    'UPDATE notifications SET IsRead = 1 WHERE NotificationID = ?',
    [id],
    c.env
  );

  return c.json({ success: true });
});

// PATCH /api/notifications/read-all — ทำเครื่องหมายว่าอ่านทั้งหมด
notifications.patch('/read-all', requireAuth, async (c) => {
  const session = c.get('session');

  await executeQuery(
    'UPDATE notifications SET IsRead = 1 WHERE UserID = ?',
    [session.user.id],
    c.env
  );

  return c.json({ success: true });
});

// DELETE /api/notifications/:id — ลบการแจ้งเตือน
notifications.delete('/:id', requireAuth, async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');

  const rows = await executeQuery(
    'SELECT * FROM notifications WHERE NotificationID = ? AND UserID = ? LIMIT 1',
    [id, session.user.id],
    c.env
  );

  if (!rows[0]) return c.json({ error: 'ไม่พบการแจ้งเตือนนี้' }, 404);

  await executeQuery(
    'DELETE FROM notifications WHERE NotificationID = ?',
    [id],
    c.env
  );

  return c.json({ success: true });
});

export default notifications;
