import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/auth';
import { executeQuery } from '../../config/db';

const adminReports = new Hono();

// GET /api/admin/reports/registrations — รายงานสรุปการลงทะเบียน
adminReports.get('/registrations', requireAdmin, async (c) => {
  const { startDate, endDate } = c.req.query();

  let query = `
    SELECT
      COUNT(*) as total_registrations,
      SUM(CASE WHEN r.Status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN r.Status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN r.Status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN r.Status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN r.Status = 'attended' THEN 1 ELSE 0 END) as attended
    FROM registrations r
    JOIN activities a ON r.ActivityID = a.ActivityID
  `;

  const params = [];
  const conditions = [];

  if (startDate) {
    conditions.push('a.StartDate >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('a.EndDate <= ?');
    params.push(endDate);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  const result = await executeQuery(query, params, c.env);
  return c.json(result[0]);
});

// GET /api/admin/reports/activities — รายงานความนิยมของกิจกรรม
adminReports.get('/activities', requireAdmin, async (c) => {
  const { startDate, endDate, category, page = '1', limit = '20' } = c.req.query();
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT
      a.ActivityID, a.Title, a.Category, a.StartDate, a.EndDate, a.MaxParticipants, a.HoursAwarded,
      COUNT(r.RegistrationID) as total_registrations,
      SUM(CASE WHEN r.Status = 'approved' THEN 1 ELSE 0 END) as approved_registrations,
      SUM(CASE WHEN r.Status = 'attended' THEN 1 ELSE 0 END) as attended_count
    FROM activities a
    LEFT JOIN registrations r ON a.ActivityID = r.ActivityID
  `;

  let countQuery = `
    SELECT COUNT(DISTINCT a.ActivityID) as total FROM activities a
    LEFT JOIN registrations r ON a.ActivityID = r.ActivityID
  `;

  const params = [];
  const conditions = [];

  if (startDate) {
    conditions.push('a.StartDate >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('a.EndDate <= ?');
    params.push(endDate);
  }
  if (category) {
    conditions.push('a.Category = ?');
    params.push(category);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
    countQuery += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' GROUP BY a.ActivityID ORDER BY total_registrations DESC';
  query += ' LIMIT ? OFFSET ?';
  params.push(limitNum, offset);

  const countResult = await executeQuery(countQuery, params.slice(0, params.length - 2), c.env);
  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limitNum);

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

// GET /api/admin/reports/users — รายงานผู้ใช้ที่เข้าร่วมกิจกรรมมากที่สุด / สะสมชั่วโมงสูงสุด
adminReports.get('/users', requireAdmin, async (c) => {
  const { page = '1', limit = '20' } = c.req.query();
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT
      u.UserID, u.Name, u.Email, u.Role, u.Faculty, u.Department, u.total_hours,
      COUNT(r.RegistrationID) AS total_registrations,
      SUM(CASE WHEN r.Status = 'attended' THEN 1 ELSE 0 END) AS attended_count
    FROM users u
    LEFT JOIN registrations r ON u.UserID = r.UserID
    GROUP BY u.UserID
    ORDER BY u.total_hours DESC, total_registrations DESC
  `;

  const countQuery = `
    SELECT COUNT(DISTINCT u.UserID) as total FROM users u
    LEFT JOIN registrations r ON u.UserID = r.UserID
    GROUP BY u.UserID
  `;

  query += ' LIMIT ? OFFSET ?';
  const params = [limitNum, offset];

  const countResult = await executeQuery(countQuery, [], c.env);
  const total = countResult.length;
  const totalPages = Math.ceil(total / limitNum);

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

export default adminReports;
