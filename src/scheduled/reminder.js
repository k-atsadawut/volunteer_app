import { executeQuery } from '../config/db';
import { sendReminderEmail } from '../utils/mailer';

// แจ้งเตือนผู้ลงทะเบียนล่วงหน้า 1 วันก่อนกิจกรรมเริ่ม (รันทุกวันตาม cron ใน wrangler.toml)
export async function scheduled(event, env, ctx) {
  const startTime = Date.now();
  console.log(`[Reminder] Starting reminder job at ${new Date(startTime).toISOString()}`);

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
        a.StartTime,
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

    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    for (const reg of registrations) {
      if (!reg.UserEmail) {
        console.warn(`[Reminder] Skipping registration ${reg.RegistrationID}: no email for user ${reg.UserID}`);
        continue;
      }

      try {
        // Retry logic: attempt up to 3 times with exponential backoff
        let emailSent = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await sendReminderEmail(reg, env);
            emailSent = true;
            break;
          } catch (emailError) {
            console.error(`[Reminder] Email attempt ${attempt} failed for registration ${reg.RegistrationID}:`, emailError.message);
            if (attempt < 3) {
              // Exponential backoff: 1s, 2s, 4s
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
            } else {
              throw emailError;
            }
          }
        }

        if (emailSent) {
          await executeQuery(
            'UPDATE registrations SET reminder_sent = 1, reminder_sent_at = CURRENT_TIMESTAMP WHERE RegistrationID = ?',
            [reg.RegistrationID],
            env
          );
          successCount++;
          console.log(`[Reminder] Successfully reminded registration ${reg.RegistrationID} (user: ${reg.UserName})`);
        }
      } catch (error) {
        failureCount++;
        const errorMsg = `Failed to send reminder for registration ${reg.RegistrationID} (user: ${reg.UserName}, email: ${reg.UserEmail}): ${error.message}`;
        console.error(`[Reminder] ${errorMsg}`);
        errors.push(errorMsg);

        // Log to database for tracking
        try {
          await executeQuery(
            'INSERT INTO notifications (UserID, Message, IsRead) VALUES (?, ?, 0)',
            [reg.UserID, `ระบบล้มเหลวในการส่งอีเมลแจ้งเตือนกิจกรรม "${reg.ActivityTitle}" กรุณาติดต่อผู้ดูแลระบบ`],
            env
          );
        } catch (logError) {
          console.error('[Reminder] Failed to log error to database:', logError);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Reminder] Job completed in ${duration}ms - Success: ${successCount}, Failures: ${failureCount}`);

    if (errors.length > 0) {
      console.error('[Reminder] Errors encountered:', errors.join('; '));
    }

    return {
      success: true,
      stats: {
        total: registrations.length,
        success: successCount,
        failure: failureCount,
        duration
      }
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Reminder] Job failed after ${duration}ms:`, error);
    
    // Log critical error to database if possible
    try {
      await executeQuery(
        'INSERT INTO notifications (UserID, Message, IsRead) VALUES (?, ?, 0)',
        [1, `[CRITICAL] Reminder job failed: ${error.message}`], // Notify admin
        env
      );
    } catch (logError) {
      console.error('[Reminder] Failed to log critical error:', logError);
    }

    return {
      success: false,
      error: error.message,
      duration
    };
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduled(event, env, ctx));
  }
};
