import { executeQuery } from '../config/db';
import { sendReminderEmail } from '../utils/mailer';

// แจ้งเตือนผู้ลงทะเบียนล่วงหน้า 1 วันก่อนกิจกรรมเริ่ม (รันทุกวันตาม cron ใน wrangler.toml)
export async function scheduled(event, env, ctx) {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    console.log(`[Reminder] Checking for activities starting ${tomorrowStr}...`);

    const registrations = await executeQuery(`
      SELECT
        r.RegistrationID,
        r.UserID,
        a.ActivityID,
        a.Title AS ActivityTitle,
        a.StartDate,
        a.EndDate,
        a.Location,
        u.Name AS UserName,
        u.Email AS UserEmail
      FROM registrations r
      JOIN activities a ON r.ActivityID = a.ActivityID
      JOIN users u ON r.UserID = u.UserID
      WHERE r.Status = 'approved'
        AND a.StartDate = ?
        AND (r.reminder_sent = 0 OR r.reminder_sent IS NULL)
    `, [tomorrowStr], env);

    console.log(`[Reminder] Found ${registrations.length} registrations to remind`);

    for (const reg of registrations) {
      if (reg.UserEmail) {
        await sendReminderEmail(reg, env).catch(err => console.error('[Reminder] Email error:', err));

        await executeQuery(
          'UPDATE registrations SET reminder_sent = 1 WHERE RegistrationID = ?',
          [reg.RegistrationID],
          env
        );
        console.log(`[Reminder] Marked registration ${reg.RegistrationID} as reminded`);
      }
    }
  } catch (error) {
    console.error('[Reminder] Error:', error);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduled(event, env, ctx));
  }
};
