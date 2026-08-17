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
  const { startDate, endDate, category } = c.req.query();

  let query = `
    SELECT
      a.ActivityID, a.Title, a.Category, a.StartDate, a.EndDate, a.MaxParticipants, a.HoursAwarded,
      COUNT(r.RegistrationID) as total_registrations,
      SUM(CASE WHEN r.Status = 'approved' THEN 1 ELSE 0 END) as approved_registrations,
      SUM(CASE WHEN r.Status = 'attended' THEN 1 ELSE 0 END) as attended_count
    FROM activities a
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
  }

  query += ' GROUP BY a.ActivityID ORDER BY total_registrations DESC';

  const result = await executeQuery(query, params, c.env);
  return c.json(result);
});

// GET /api/admin/reports/users — รายงานผู้ใช้ที่เข้าร่วมกิจกรรมมากที่สุด / สะสมชั่วโมงสูงสุด
adminReports.get('/users', requireAdmin, async (c) => {
  const { limit } = c.req.query();

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

  const n = limit ? Math.max(1, Math.min(1000, parseInt(limit, 10) || 10)) : 10;
  query += ' LIMIT ' + n;

  const result = await executeQuery(query, [], c.env);
  return c.json(result);
});

export default adminReports;
