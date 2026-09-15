import { Hono } from 'hono';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { executeQuery } from '../config/db';
import { distanceMeters } from '../utils/geo';

const verifications = new Hono();

// ระยะห่างสูงสุดที่ยอมรับได้ระหว่างพิกัดรูปกับพิกัดกิจกรรม (เมตร)
const MAX_DISTANCE_METERS = 300;

// Upload limits
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_UPLOADS_PER_REGISTRATION = 3;

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

  // Validate file size
  const binary = Uint8Array.from(atob(photoBase64.replace(/^data:image\/\w+;base64,/, '')), ch => ch.charCodeAt(0));
  if (binary.length > MAX_FILE_SIZE_BYTES) {
    return c.json({ error: `ขนาดไฟล์ต้องไม่เกิน ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` }, 400);
  }

  // Validate MIME type
  const mimeType = photoBase64.match(/^data:(image\/\w+);base64,/)?.[1];
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return c.json({ error: 'รองรับเฉพาะไฟล์รูปภาพประเภท JPEG และ PNG เท่านั้น' }, 400);
  }

  // Check upload count per registration
  const existingUploads = await executeQuery(
    'SELECT COUNT(*) AS cnt FROM photo_verifications WHERE RegistrationID = ?',
    [registrationId],
    c.env
  );
  if (existingUploads[0].cnt >= MAX_UPLOADS_PER_REGISTRATION) {
    return c.json({ error: `อัปโหลดรูปภาพครบจำนวนแล้ว (สูงสุด ${MAX_UPLOADS_PER_REGISTRATION} รูป)` }, 400);
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
    const key = `verifications/${registrationId}/${Date.now()}.${mimeType.split('/')[1]}`;
    await c.env.PHOTOS_BUCKET.put(key, binary, { httpMetadata: { contentType: mimeType } });
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

  let query = `
    SELECT v.*, r.UserID, r.ActivityID, a.Title, a.OrganizerID, u.Name AS UserName
    FROM photo_verifications v
    JOIN registrations r ON v.RegistrationID = r.RegistrationID
    JOIN activities a ON r.ActivityID = a.ActivityID
    JOIN users u ON r.UserID = u.UserID
    WHERE v.Status = 'pending'
  `;

  const params = [];
  
  // Organizers can only see verifications for their own activities
  if (session.user.role === 'organizer') {
    query += ' AND a.OrganizerID = ?';
    params.push(session.user.id);
  }

  query += ' ORDER BY v.created_at ASC';

  const rows = await executeQuery(query, params, c.env);
  return c.json(rows);
});

// GET /api/verifications — ดูรูปยืนยันของตัวเอง
verifications.get('/', requireAuth, async (c) => {
  const session = c.get('session');

  const rows = await executeQuery(`
    SELECT v.*, a.Title AS ActivityTitle, a.StartDate, a.EndDate
    FROM photo_verifications v
    JOIN registrations r ON v.RegistrationID = r.RegistrationID
    JOIN activities a ON r.ActivityID = a.ActivityID
    WHERE r.UserID = ?
    ORDER BY v.created_at DESC
  `, [session.user.id], c.env);

  return c.json(rows);
});

// GET /api/verifications/:id/photo-url — Generate signed URL for photo access (with auth check)
verifications.get('/:id/photo-url', requireAuth, async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');

  // Get verification details
  const rows = await executeQuery(
    `SELECT v.*, r.UserID, a.OrganizerID
     FROM photo_verifications v 
     JOIN registrations r ON v.RegistrationID = r.RegistrationID
     JOIN activities a ON r.ActivityID = a.ActivityID
     WHERE v.VerificationID = ? LIMIT 1`,
    [id],
    c.env
  );
  const verification = rows[0];
  if (!verification) return c.json({ error: 'ไม่พบรายการนี้' }, 404);

  // Authorization check: user can only access their own photos, admin/organizer can access photos they're reviewing
  const isOwner = verification.UserID === session.user.id;
  const isAdmin = session.user.role === 'admin';
  const isOrganizer = session.user.role === 'organizer' && verification.OrganizerID === session.user.id;

  if (!isOwner && !isAdmin && !isOrganizer) {
    return c.json({ error: 'ไม่มีสิทธิ์เข้าถึงรูปภาพนี้' }, 403);
  }

  // Generate signed URL (valid for 1 hour)
  if (!c.env.PHOTOS_BUCKET) {
    return c.json({ error: 'ระบบยังไม่ได้ตั้งค่าที่เก็บรูปภาพ' }, 500);
  }

  try {
    const signedUrl = await c.env.PHOTOS_BUCKET.signUrl(verification.PhotoUrl, {
      expiresIn: 3600, // 1 hour
    });
    return c.json({ url: signedUrl });
  } catch (error) {
    console.error('Failed to generate signed URL:', error);
    // Fallback: return direct URL if R2 is public bucket (for backward compatibility)
    if (c.env.R2_PUBLIC_URL) {
      return c.json({ url: `${c.env.R2_PUBLIC_URL}/${verification.PhotoUrl}` });
    }
    return c.json({ error: 'ไม่สามารถสร้างลิงก์เข้าถึงรูปภาพได้' }, 500);
  }
});

// PATCH /api/verifications/:id/review — เจ้าหน้าที่ตรวจสอบด้วยตนเอง (approve/reject)
verifications.patch('/:id/review', requireAuth, async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');
  const { approve, reason } = await c.req.json();

  if (!['admin', 'organizer'].includes(session.user.role)) {
    return c.json({ error: 'ไม่มีสิทธิ์ตรวจสอบรูปยืนยัน' }, 403);
  }

  const rows = await executeQuery(
    `SELECT v.*, r.UserID, r.ActivityID, a.OrganizerID
     FROM photo_verifications v JOIN registrations r ON v.RegistrationID = r.RegistrationID
     JOIN activities a ON r.ActivityID = a.ActivityID
     WHERE v.VerificationID = ? LIMIT 1`,
    [id],
    c.env
  );
  const verification = rows[0];
  if (!verification) return c.json({ error: 'ไม่พบรายการนี้' }, 404);

  // Organizers can only review verifications for their own activities
  if (session.user.role === 'organizer' && verification.OrganizerID !== session.user.id) {
    return c.json({ error: 'ไม่มีสิทธิ์ตรวจสอบกิจกรรมนี้' }, 403);
  }

  if (approve) {
    await executeQuery(
      "UPDATE photo_verifications SET Status = 'verified', ReviewedBy = ?, ReviewedAt = CURRENT_TIMESTAMP WHERE VerificationID = ?",
      [session.user.id, id],
      c.env
    );
    await grantHours(verification, id, c.env, session.user.id);
    
    // Notify user that verification was approved
    await executeQuery(
      'INSERT INTO notifications (UserID, Message, IsRead) VALUES (?, ?, 0)',
      [verification.UserID, `รูปยืนยันการเข้าร่วมกิจกรรมได้รับการอนุมัติแล้ว บันทึกชั่วโมงจิตอาสาให้แล้ว`],
      c.env
    );
  } else {
    await executeQuery(
      "UPDATE photo_verifications SET Status = 'rejected', RejectReason = ?, ReviewedBy = ?, ReviewedAt = CURRENT_TIMESTAMP WHERE VerificationID = ?",
      [reason || null, session.user.id, id],
      c.env
    );
    
    // Notify user that verification was rejected
    await executeQuery(
      'INSERT INTO notifications (UserID, Message, IsRead) VALUES (?, ?, 0)',
      [verification.UserID, `รูปยืนยันการเข้าร่วมกิจกรรมถูกปฏิเสธ${reason ? ': ' + reason : ''}`],
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
