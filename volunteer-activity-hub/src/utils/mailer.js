// Email utility for Cloudflare Workers
// Sends email via Gmail SMTP using nodemailer.
// Cloudflare Workers supports raw TCP sockets via the `nodejs_compat` flag,
// which enables nodemailer's SMTP transport.
//
// Setup:
//   1. Enable 2-Step Verification on the Gmail account
//   2. Create an App Password at https://myaccount.google.com/apppasswords
//   3. Set these secrets via wrangler:
//        npx wrangler secret put GMAIL_USER       (e.g. you@gmail.com)
//        npx wrangler secret put GMAIL_APP_PASSWORD (16-char App Password)

import nodemailer from 'nodemailer';

export async function sendEmail({ to, subject, text }, env) {
  try {
    if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
      console.error('Email configuration missing: GMAIL_USER / GMAIL_APP_PASSWORD not set');
      return { success: false, error: 'Email configuration missing (GMAIL_USER / GMAIL_APP_PASSWORD)' };
    }

    // Create a fresh transporter per request. Workers are stateless, and
    // reusing a pooled connection across invocations is unreliable here.
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: env.GMAIL_USER,   // Gmail forces From = authenticated account
      to,
      subject,
      text,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

export async function notifyAdminNewRegistration(data, adminEmail, env) {
  const subject = 'มีผู้สมัครเข้าร่วมกิจกรรมใหม่';
  const text = `
มีผู้สมัครเข้าร่วมกิจกรรมใหม่:

กิจกรรม: ${data.ActivityTitle}
ผู้สมัคร: ${data.UserName} (${data.UserEmail})

กรุณาเข้าสู่ระบบเพื่ออนุมัติหรือปฏิเสธการสมัคร
  `.trim();

  return await sendEmail({ to: adminEmail, subject, text }, env);
}

export async function notifyRegistrationApproved(data, userEmail, env) {
  const subject = 'การสมัครเข้าร่วมกิจกรรมได้รับการอนุมัติ';
  const text = `
การสมัครเข้าร่วมกิจกรรมของคุณได้รับการอนุมัติแล้ว:

กิจกรรม: ${data.ActivityTitle}
วันที่: ${data.StartDate} - ${data.EndDate}
สถานที่: ${data.Location || '-'}

กรุณามาตามวันเวลาที่กำหนด และอย่าลืมถ่ายภาพยืนยันการเข้าร่วมในระบบ
  `.trim();

  return await sendEmail({ to: userEmail, subject, text }, env);
}

export async function notifyRegistrationRejected(data, userEmail, env) {
  const subject = 'การสมัครเข้าร่วมกิจกรรมถูกปฏิเสธ';
  const text = `
การสมัครเข้าร่วมกิจกรรมของคุณถูกปฏิเสธ:

กิจกรรม: ${data.ActivityTitle}

กรุณาติดต่อผู้จัดกิจกรรมหากต้องการข้อมูลเพิ่มเติม
  `.trim();

  return await sendEmail({ to: userEmail, subject, text }, env);
}

export async function sendReminderEmail(data, env) {
  const subject = 'แจ้งเตือนกิจกรรมจิตอาสาใกล้ถึงเวลา';
  const text = `
เรียน ${data.UserName},

กิจกรรมที่คุณลงทะเบียนไว้ใกล้ถึงเวลาแล้ว:

กิจกรรม: ${data.ActivityTitle}
วันที่: ${data.StartDate} - ${data.EndDate}
สถานที่: ${data.Location || '-'}

กรุณาเตรียมตัวและมาตามเวลาที่กำหนด
  `.trim();

  return await sendEmail({ to: data.UserEmail, subject, text }, env);
}
