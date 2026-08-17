import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { executeQuery } from '../config/db';
import { distanceMeters } from '../utils/geo';

const verifications = new Hono();

// ระยะห่างสูงสุดที่ยอมรับได้ระหว่างพิกัดรูปกับพิกัดกิจกรรม (เมตร)
const MAX_DISTANCE_METERS = 300;

// POST /api/verifications — อัปโหลดรูปพิสูจน์การเข้าร่วมกิจกรรม
// body: { registrationId, photoBase64, exifLat, exifLng, exifTakenAt }
// หมายเหตุ: การอ่านค่า EXIF (lat/lng/เวลาถ่ายภาพ) ทำที่ฝั่ง frontend ด้วยไลบรารี exifr
// ก่อนส่งเข้ามา เพราะ Cloudflare Workers runtime ไม่เหมาะกับการ parse binary EXIF โดยตรง
verifications.post('/', requireAuth, async (c) => {
  const session = c.get('session');
  const { registrationId, photoBase64, exifLat, exifLng, exifTakenAt } = await c.req.json();

  if (!registrationId || !photoBase64) {
    return c.json({ error: 'กรุณาระบุ registrationId และแนบรูปภาพ' }, 400);
  }

  const regRows = await executeQuery(
    `SELECT r.*, a.LocationLat, a.LocationLng, a.Title
     FROM registrations r JOIN activities a ON r.ActivityID = a.ActivityID
     WHERE r.RegistrationID = ? AND r.UserID = ? LIMIT 1`,
    [registrationId, session.user.id],
    c.env
  );
  const registration = regRows[0];

  if (!registration) return c.json({ error: 'ไม่พบการลงทะเบียนนี้' }, 404);
  if (registration.Status !== 'approved') {
    return c.json({ error: 'ต้องได้รับการอนุมัติการลงทะเบียนก่อนจึงจะอัปโหลดรูปยืนยันได้' }, 400);
  }

  // เก็บไฟล์รูปลง R2 (ถ้ามี binding) — key แบบ verifications/{registrationId}/{timestamp}.jpg
  let photoUrl = null;
  if (c.env.PHOTOS_BUCKET) {
    const key = `verifications/${registrationId}/${Date.now()}.jpg`;
    const binary = Uint8Array.from(atob(photoBase64.replace(/^data:image\/\w+;base64,/, '')), ch => ch.charCodeAt(0));
    await c.env.PHOTOS_BUCKET.put(key, binary, { httpMetadata: { contentType: 'image/jpeg' } });
    photoUrl = key; // แปลงเป็น public URL ที่ฝั่ง frontend ตาม R2 public bucket config
  } else {
    return c.json({ error: 'ระบบยังไม่ได้ตั้งค่าที่เก็บรูปภาพ (R2 bucket) กรุณาติดต่อผู้ดูแลระบบ' }, 500);
  }

  const dist = distanceMeters(exifLat, exifLng, registration.LocationLat, registration.LocationLng);
  const autoStatus = dist !== null && dist <= MAX_DISTANCE_METERS ? 'verified' : 'pending';

  const result = await executeQuery(
    `INSERT INTO photo_verifications
      (RegistrationID, PhotoUrl, ExifLat, ExifLng, ExifTakenAt, DistanceMeters, Status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [registrationId, photoUrl, exifLat || null, exifLng || null, exifTakenAt || null, dist, autoStatus],
    c.env
  );

  // ถ้าผ่านการตรวจอัตโนมัติ (อยู่ในระยะที่ยอมรับได้) ให้บันทึกชั่วโมงจิตอาสาทันที
  if (autoStatus === 'verified') {
    await grantHours(registration, result.insertId, c.env, null);
  }

  return c.json({
    success: true,
    verificationId: result.insertId,
    status: autoStatus,
    distanceMeters: dist,
    message: autoStatus === 'verified'
      ? 'ยืนยันการเข้าร่วมสำเร็จ ระบบบันทึกชั่วโมงจิตอาสาให้แล้ว'
      : 'พิกัดรูปภาพอยู่นอกระยะที่กำหนด รอเจ้าหน้าที่ตรวจสอบด้วยตนเอง',
  });
});

// GET /api/verifications/pending — รายการรอตรวจสอบด้วยตนเอง (admin/organizer)
verifications.get('/pending', requireAuth, async (c) => {
  const session = c.get('session');
  if (!['admin', 'organizer'].includes(session.user.role)) {
    return c.json({ error: 'ไม่มีสิทธิ์เข้าถึง' }, 403);
  }

  const rows = await executeQuery(`
    SELECT v.*, r.UserID, r.ActivityID, a.Title, u.Name AS UserName
    FROM photo_verifications v
    JOIN registrations r ON v.RegistrationID = r.RegistrationID
    JOIN activities a ON r.ActivityID = a.ActivityID
    JOIN users u ON r.UserID = u.UserID
    WHERE v.Status = 'pending'
    ORDER BY v.created_at ASC
  `, [], c.env);

  return c.json(rows);
});

// PATCH /api/verifications/:id/review — เจ้าหน้าที่ตรวจสอบด้วยตนเอง (approve/reject)
verifications.patch('/:id/review', requireAdmin, async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');
  const { approve, reason } = await c.req.json();

  const rows = await executeQuery(
    `SELECT v.*, r.UserID, r.ActivityID
     FROM photo_verifications v JOIN registrations r ON v.RegistrationID = r.RegistrationID
     WHERE v.VerificationID = ? LIMIT 1`,
    [id],
    c.env
  );
  const verification = rows[0];
  if (!verification) return c.json({ error: 'ไม่พบรายการนี้' }, 404);

  if (approve) {
    await executeQuery(
      "UPDATE photo_verifications SET Status = 'verified', ReviewedBy = ?, ReviewedAt = CURRENT_TIMESTAMP WHERE VerificationID = ?",
      [session.user.id, id],
      c.env
    );
    await grantHours(verification, id, c.env, session.user.id);
  } else {
    await executeQuery(
      "UPDATE photo_verifications SET Status = 'rejected', RejectReason = ?, ReviewedBy = ?, ReviewedAt = CURRENT_TIMESTAMP WHERE VerificationID = ?",
      [reason || null, session.user.id, id],
      c.env
    );
  }

  return c.json({ success: true });
});

// Helper: บันทึกชั่วโมงจิตอาสาเมื่อ verification ผ่าน (auto หรือ manual)
async function grantHours(registration, verificationId, env, grantedBy) {
  const already = await executeQuery(
    'SELECT LogID FROM hours_log WHERE RegistrationID = ? LIMIT 1',
    [registration.RegistrationID || registration.RegistrationID],
    env
  );
  if (already.length > 0) return; // กันบันทึกซ้ำ

  const activityRows = await executeQuery(
    'SELECT HoursAwarded FROM activities WHERE ActivityID = ?',
    [registration.ActivityID],
    env
  );
  const hours = activityRows[0]?.HoursAwarded || 0;

  await executeQuery(
    'INSERT INTO hours_log (UserID, ActivityID, RegistrationID, Hours, GrantedBy) VALUES (?, ?, ?, ?, ?)',
    [registration.UserID, registration.ActivityID, registration.RegistrationID, hours, grantedBy],
    env
  );

  await executeQuery(
    'UPDATE users SET total_hours = total_hours + ? WHERE UserID = ?',
    [hours, registration.UserID],
    env
  );

  await executeQuery(
    "UPDATE registrations SET Status = 'attended' WHERE RegistrationID = ?",
    [registration.RegistrationID],
    env
  );
}

export default verifications;
