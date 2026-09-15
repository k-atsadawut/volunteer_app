import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { executeQuery } from '../config/db';

const activities = new Hono();

// GET /api/activities — ดูรายการกิจกรรมทั้งหมด (filter ได้ตาม category / status / คำค้นหา)
activities.get('/', requireAuth, async (c) => {
  const { category, status, q, page = '1', limit = '20' } = c.req.query();
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100); // Max 100 per page
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT
      a.*,
      COALESCE((
        SELECT COUNT(*) FROM registrations r
        WHERE r.ActivityID = a.ActivityID AND r.Status IN ('pending','approved','attended')
      ), 0) AS registered_count
    FROM activities a
  `;

  let countQuery = `
    SELECT COUNT(*) AS total FROM activities a
  `;

  const params = [];
  const conditions = [];

  if (category) {
    conditions.push('a.Category = ?');
    params.push(category);
  }
  if (status) {
    conditions.push('a.Status = ?');
    params.push(status);
  } else {
    // ค่าเริ่มต้น: ไม่แสดงกิจกรรมที่เป็น draft ให้ผู้ใช้ทั่วไป
    conditions.push("a.Status != 'draft'");
  }
  if (q) {
    conditions.push('(a.Title LIKE ? OR a.Description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
    countQuery += ' WHERE ' + conditions.join(' AND ');
  }

  // Get total count for pagination
  const countResult = await executeQuery(countQuery, params, c.env);
  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limitNum);

  query += ' ORDER BY a.StartDate ASC';
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

// GET /api/activities/:id — รายละเอียดกิจกรรมเดียว
activities.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');

  const rows = await executeQuery(
    `SELECT a.*, COALESCE((
       SELECT COUNT(*) FROM registrations r
       WHERE r.ActivityID = a.ActivityID AND r.Status IN ('pending','approved','attended')
     ), 0) AS registered_count
     FROM activities a WHERE a.ActivityID = ? LIMIT 1`,
    [id],
    c.env
  );

  if (!rows[0]) return c.json({ error: 'ไม่พบกิจกรรมนี้' }, 404);
  return c.json(rows[0]);
});

// POST /api/activities — สร้างกิจกรรมใหม่ (admin หรือ organizer)
activities.post('/', requireAuth, async (c) => {
  const session = c.get('session');
  if (!['admin', 'organizer'].includes(session.user.role)) {
    return c.json({ error: 'ไม่มีสิทธิ์สร้างกิจกรรม' }, 403);
  }

  const {
    Title, Description, Category, OrganizerName, Location,
    LocationLat, LocationLng, StartDate, EndDate, StartTime, EndTime,
    MaxParticipants, HoursAwarded, Status, CoverImageUrl,
  } = await c.req.json();

  if (!Title || !StartDate || !EndDate) {
    return c.json({ error: 'กรุณาระบุชื่อกิจกรรม วันที่เริ่ม และวันที่สิ้นสุด' }, 400);
  }

  if (StartDate > EndDate) {
    return c.json({ error: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' }, 400);
  }

  const result = await executeQuery(
    `INSERT INTO activities
      (Title, Description, Category, OrganizerID, OrganizerName, Location, LocationLat, LocationLng,
       StartDate, EndDate, StartTime, EndTime, MaxParticipants, HoursAwarded, Status, CoverImageUrl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Title, Description || null, Category || 'other', session.user.id, OrganizerName || null,
      Location || null, LocationLat || null, LocationLng || null,
      StartDate, EndDate, StartTime || null, EndTime || null,
      MaxParticipants || null, HoursAwarded || 0, Status || 'draft', CoverImageUrl || null,
    ],
    c.env
  );

  return c.json({ success: true, activityId: result.insertId });
});

// PATCH /api/activities/:id — แก้ไขกิจกรรม (admin หรือ organizer เจ้าของกิจกรรม)
activities.patch('/:id', requireAuth, async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');

  const existing = await executeQuery('SELECT OrganizerID FROM activities WHERE ActivityID = ? LIMIT 1', [id], c.env);
  if (!existing[0]) return c.json({ error: 'ไม่พบกิจกรรมนี้' }, 404);

  const isOwner = existing[0].OrganizerID === session.user.id;
  if (session.user.role !== 'admin' && !isOwner) {
    return c.json({ error: 'ไม่มีสิทธิ์แก้ไขกิจกรรมนี้' }, 403);
  }

  const body = await c.req.json();
  const allowedFields = [
    'Title', 'Description', 'Category', 'OrganizerName', 'Location', 'LocationLat', 'LocationLng',
    'StartDate', 'EndDate', 'StartTime', 'EndTime', 'MaxParticipants', 'HoursAwarded', 'Status', 'CoverImageUrl',
  ];

  const updates = [];
  const values = [];
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'ไม่มีข้อมูลที่จะอัปเดต' }, 400);
  }

  values.push(id);
  await executeQuery(`UPDATE activities SET ${updates.join(', ')} WHERE ActivityID = ?`, values, c.env);

  return c.json({ success: true });
});

// DELETE /api/activities/:id — ลบกิจกรรม (admin only)
activities.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  await executeQuery('DELETE FROM activities WHERE ActivityID = ?', [id], c.env);
  return c.json({ success: true });
});

export default activities;
