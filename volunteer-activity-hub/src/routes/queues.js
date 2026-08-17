import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { executeQuery } from '../config/db';

const queues = new Hono();

// POST /api/queues — เข้าคิวรอ (กรณีกิจกรรมเต็ม)
queues.post('/', requireAuth, async (c) => {
  const session = c.get('session');
  const { activityId } = await c.req.json();

  if (!activityId) {
    return c.json({ error: 'กรุณาระบุกิจกรรม' }, 400);
  }

  const existing = await executeQuery(`
    SELECT QueueID FROM queues
    WHERE UserID = ? AND ActivityID = ? AND Status = 'waiting'
    LIMIT 1
  `, [session.user.id, activityId], c.env);

  if (existing.length > 0) {
    return c.json({ error: 'คุณอยู่ในคิวสำหรับกิจกรรมนี้แล้ว' }, 400);
  }

  const result = await executeQuery(`
    INSERT INTO queues (UserID, ActivityID, Status) VALUES (?, ?, 'waiting')
  `, [session.user.id, activityId], c.env);

  return c.json({ success: true, queueId: result.insertId });
});

// GET /api/queues — ดูคิวของตัวเอง
queues.get('/', requireAuth, async (c) => {
  const session = c.get('session');

  const result = await executeQuery(`
    SELECT q.*, a.Title
    FROM queues q
    JOIN activities a ON q.ActivityID = a.ActivityID
    WHERE q.UserID = ?
    ORDER BY q.created_at DESC
  `, [session.user.id], c.env);

  return c.json(result);
});

// DELETE /api/queues/:id — ออกจากคิว
queues.delete('/:id', requireAuth, async (c) => {
  const session = c.get('session');
  const queueId = c.req.param('id');

  await executeQuery(
    "UPDATE queues SET Status = 'cancelled' WHERE QueueID = ? AND UserID = ?",
    [queueId, session.user.id],
    c.env
  );

  return c.json({ success: true });
});

// เรียกเมื่อมีคนยกเลิกการลงทะเบียน -> แจ้งคนถัดไปในคิวว่ามีที่ว่างแล้ว
export async function checkAndNotifyQueue(activityId, env) {
  const waitingUsers = await executeQuery(`
    SELECT q.QueueID, q.UserID, u.Email, u.Name
    FROM queues q
    JOIN users u ON q.UserID = u.UserID
    WHERE q.ActivityID = ? AND q.Status = 'waiting'
    ORDER BY q.created_at ASC
    LIMIT 1
  `, [activityId], env);

  if (waitingUsers.length > 0) {
    const queueUser = waitingUsers[0];

    await executeQuery("UPDATE queues SET Status = 'notified' WHERE QueueID = ?", [queueUser.QueueID], env);

    const activity = await executeQuery('SELECT Title FROM activities WHERE ActivityID = ?', [activityId], env);

    await executeQuery(
      'INSERT INTO notifications (UserID, Message) VALUES (?, ?)',
      [queueUser.UserID, `กิจกรรม "${activity[0]?.Title || ''}" มีที่ว่างแล้ว กรุณาสมัครภายใน 24 ชั่วโมง`],
      env
    );

    console.log(`Queue notification sent to user ${queueUser.UserID}`);
  }
}

export default queues;
