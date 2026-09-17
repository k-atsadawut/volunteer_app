import { Hono } from 'hono';
import { executeQuery } from '../config/db';
import { createSession, getSession, destroySession } from '../middleware/session';
import { requireAuth } from '../middleware/auth';
import { logAudit, logError, logWarn } from '../utils/logger';
import { hashPassword, verifyPassword, isLegacyHash } from '../utils/password';
import { evaluateLoginAttempt, DEFAULT_MAX_ATTEMPTS, DEFAULT_LOCK_MINUTES } from '../utils/authLock';
import { logSecurityEvent } from '../utils/securityLog';

const auth = new Hono();

// POST /api/auth/login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, 400);
  }

  // FR-19: อ่าน config จาก env (wrangler.toml [vars]) — ไม่ hardcode
  const maxAttempts = Number(c.env?.MAX_LOGIN_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS;
  const lockMinutes = Number(c.env?.LOGIN_LOCK_MINUTES) || DEFAULT_LOCK_MINUTES;

  const users = await executeQuery(
    'SELECT * FROM users WHERE Email = ? LIMIT 1',
    [email],
    c.env
  );

  const user = users[0];

  const logEvent = (evt) => {
    const promise = logSecurityEvent(evt, c.env).catch(err => console.error('logSecurityEvent error:', err));
    if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
      c.executionCtx.waitUntil(promise);
    }
  };

  if (!user) {
    logEvent({
      email,
      eventType: 'login_failed',
      ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
      userAgent: c.req.header('user-agent'),
      details: 'email not found',
    });
    return c.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, 401);
  }

  const passwordValid = await verifyPassword(password, user.Password);

  const result = evaluateLoginAttempt({
    user,
    passwordValid,
    now: new Date(),
    maxAttempts,
    lockMinutes,
  });

  // ── เขียน DB state ตามผล ──
  if (result.action === 'allow' && result.shouldResetCount) {
    const updatePromise = executeQuery(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE UserID = ?',
      [user.UserID],
      c.env
    ).catch(err => console.error('Reset counter error:', err));
    if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
      c.executionCtx.waitUntil(updatePromise);
    }
  } else if (result.action === 'lock' && result.shouldResetCount) {
    await executeQuery(
      'UPDATE users SET failed_login_count = 0, locked_until = ? WHERE UserID = ?',
      [result.lockedUntil, user.UserID],
      c.env
    );
  } else if (result.action === 'reject') {
    const expectedCount = Number(user.failed_login_count) || 0;
    await executeQuery(
      'UPDATE users SET failed_login_count = ? WHERE UserID = ? AND failed_login_count = ?',
      [result.attempts, user.UserID, expectedCount],
      c.env
    );
  }

  // ── response ──
  if (result.action === 'lock') {
    logEvent({
      userId: user.UserID,
      email: user.Email,
      eventType: 'account_locked',
      ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
      userAgent: c.req.header('user-agent'),
      failedAttempt: maxAttempts,
      details: result.errorMessage,
    });
    return c.json({ error: result.errorMessage, isLocked: true }, 403);
  }
  if (result.action === 'reject') {
    logEvent({
      userId: user.UserID,
      email: user.Email,
      eventType: 'login_failed',
      ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
      userAgent: c.req.header('user-agent'),
      failedAttempt: result.attempts,
      details: result.errorMessage,
    });
    return c.json({ error: result.errorMessage }, 401);
  }

  // action === 'allow'
  logEvent({
    userId: user.UserID,
    email: user.Email,
    eventType: 'login_success',
    ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
    userAgent: c.req.header('user-agent'),
    details: result.shouldResetCount ? 'success (counter reset)' : 'success',
  });

  if (isLegacyHash(user.Password)) {
    const rehashPromise = (async () => {
      const newHash = await hashPassword(password);
      await executeQuery(
        'UPDATE users SET Password = ? WHERE UserID = ?',
        [newHash, user.UserID],
        c.env
      );
      console.log('[Auth] Auto-rehashed password for user', user.UserID);
    })().catch(err => console.error('[Auth] Failed to auto-rehash password:', err));

    if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
      c.executionCtx.waitUntil(rehashPromise);
    }
  }

  const userData = {
    id: user.UserID,
    name: user.Name,
    email: user.Email,
    role: user.Role,
    totalHours: Number(user.total_hours) || 0,
    forceChangePassword: user.force_change_password === 1,
  };

  const sessionId = await createSession(userData, c.env);

  const isProduction = !!c.env?.ALLOWED_ORIGINS;
  const cookieFlags = isProduction ? 'HttpOnly; Secure; SameSite=Lax' : 'HttpOnly; SameSite=Lax';
  c.header('Set-Cookie', `session=${sessionId}; ${cookieFlags}; Max-Age=${21600}; Path=/`);

  return c.json({
    success: true,
    user: userData,
  });
});

// POST /api/auth/register — สมัครสมาชิกสำหรับ Student / Organizer
auth.post('/register', async (c) => {
  const { name, email, password, confirmPassword, role, faculty, department } = await c.req.json();

  if (!name || !email || !password) {
    return c.json({ error: 'กรุณากรอกข้อมูลที่จำเป็น (ชื่อ, อีเมล, รหัสผ่าน) ให้ครบถ้วน' }, 400);
  }

  const cleanEmail = email.trim().toLowerCase();

  if (password.length < 6) {
    return c.json({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' }, 400);
  }

  if (confirmPassword && password !== confirmPassword) {
    return c.json({ error: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน' }, 400);
  }

  // อนุญาตเฉพาะบทบาท student และ organizer ผ่านหน้าสมัครสมาชิก
  const userRole = ['student', 'organizer'].includes(role) ? role : 'student';

  const existing = await executeQuery('SELECT UserID FROM users WHERE Email = ? LIMIT 1', [cleanEmail], c.env);
  if (existing.length > 0) {
    return c.json({ error: 'อีเมลนี้ถูกใช้งานในระบบแล้ว' }, 400);
  }

  const hashedPassword = await hashPassword(password);

  const result = await executeQuery(
    `INSERT INTO users (Name, Email, Password, Role, Faculty, Department, force_change_password)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [name.trim(), cleanEmail, hashedPassword, userRole, faculty ? faculty.trim() : null, department ? department.trim() : null],
    c.env
  );

  const userId = result.insertId;

  const userData = {
    id: userId,
    name: name.trim(),
    email: cleanEmail,
    role: userRole,
    totalHours: 0,
    forceChangePassword: false,
  };

  const sessionId = await createSession(userData, c.env);

  const isProduction = !!c.env?.ALLOWED_ORIGINS;
  const cookieFlags = isProduction ? 'HttpOnly; Secure; SameSite=Lax' : 'HttpOnly; SameSite=Lax';
  c.header('Set-Cookie', `session=${sessionId}; ${cookieFlags}; Max-Age=${21600}; Path=/`);

  return c.json({
    success: true,
    message: 'สมัครสมาชิกสำเร็จ',
    user: userData,
  });
});

// POST /api/auth/logout
auth.post('/logout', async (c) => {
  const sessionId = c.get('sessionId');
  await destroySession(sessionId, c.env);
  
  const isProduction = !!c.env?.ALLOWED_ORIGINS;
  const cookieFlags = isProduction ? 'HttpOnly; Secure; SameSite=Lax' : 'HttpOnly; SameSite=Lax';
  c.header('Set-Cookie', `session=; ${cookieFlags}; Max-Age=0; Path=/`);
  return c.json({ success: true });
});

// GET /api/auth/me — ดึง total_hours ล่าสุดจาก DB เสมอ (session อาจเก่ากว่าหลังได้รับชั่วโมงใหม่)
auth.get('/me', requireAuth, async (c) => {
  const session = c.get('session');
  const rows = await executeQuery('SELECT total_hours FROM users WHERE UserID = ?', [session.user.id], c.env);
  const totalHours = rows[0] ? Number(rows[0].total_hours) || 0 : session.user.totalHours || 0;
  return c.json({ user: { ...session.user, totalHours } });
});

// POST /api/auth/change-password
auth.post('/change-password', requireAuth, async (c) => {
  const { currentPassword, newPassword, confirmPassword } = await c.req.json();
  const session = c.get('session');

  if (!newPassword || newPassword.length < 6) {
    return c.json({ error: 'รหัสผ่านใหม่ต้องมีความยาวไม่น้อยกว่า 6 ตัวอักษร (FR-19)' }, 400);
  }
  if (newPassword !== confirmPassword) {
    return c.json({ error: 'รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน (FR-19)' }, 400);
  }

  const users = await executeQuery(
    'SELECT Password, force_change_password FROM users WHERE UserID = ?',
    [session.user.id],
    c.env
  );
  
  const user = users[0];

  // If not force change, verify current password
  if (!user.force_change_password) {
    const valid = await verifyPassword(currentPassword, user.Password);
    if (!valid) {
      return c.json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, 401);
    }
  }

  const hashedPassword = await hashPassword(newPassword);

  await executeQuery(
    'UPDATE users SET Password = ?, force_change_password = 0 WHERE UserID = ?',
    [hashedPassword, session.user.id],
    c.env
  );

  // Update session in KV store to reflect the password change
  const sessionId = c.get('sessionId');
  if (sessionId) {
    const updatedSessionData = {
      user: {
        ...session.user,
        forceChangePassword: false
      },
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    };
    await c.env.SESSIONS.put(sessionId, JSON.stringify(updatedSessionData), {
      expirationTtl: 21600 // 6 hours in seconds
    });
  }

  return c.json({ success: true });
});

export default auth;
