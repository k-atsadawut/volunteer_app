# เว็บไซต์รวบรวมกิจกรรมจิตอาสา / Volunteer Activity Hub

**Stack:** Cloudflare Workers (Node.js) + Hono · MySQL/TiDB · HTML + Tailwind CSS

---

## โครงสร้างโปรเจกต์

```
volunteer-activity-hub/
├── src/
│   ├── config/
│   │   └── db.js                 MySQL/TiDB connection via Hyperdrive
│   ├── middleware/
│   │   ├── auth.js               Session/role validation
│   │   └── session.js            KV-based sessions
│   ├── routes/
│   │   ├── auth.js               POST /api/auth/login|logout|me|change-password
│   │   ├── activities.js         GET|POST /api/activities
│   │   ├── registrations.js      GET|POST /api/registrations, PATCH /:id/cancel
│   │   ├── queues.js Queue management
│   │   ├── verifications.js      Photo verification workflow
│   │   ├── password-reset.js     Password reset requests
│   │   └── admin/
│   │       ├── registrations.js  GET|PATCH /api/admin/registrations
│   │       ├── users.js          CRUD /api/admin/users
│   │       ├── reports.js        Reports
│   │       ├── notify.js         Send notifications
│   │       └── password-requests.js Password reset admin
│   ├── scheduled/
│   │   └── reminder.js           Daily reminder cron job
│   ├── utils/
│   │   ├── password.js           bcrypt hashing
│   │   ├── mailer.js             Email sending
│   │   ├── authLock.js           Account lockout logic
│   │   ├── securityLog.js        Security event logging
│   │   └── geo.js                GPS distance calculation
│   └── index.js                  Entry point
├── frontend/
│   ├── login.html                Login page
│   ├── dashboard.html            User dashboard
│   ├── change-password.html      Password change
│   ├── forgot-password.html      Password reset
│   ├── admin/                    Admin pages
│   ├── assets/                   Static assets
│   └── styles/                   CSS files
├── database/
│   ├── schema.sql                Volunteer domain schema
│   ├── migrations/               Database migrations
│   └── test_data.sql             Sample data
├── wrangler.toml                 Cloudflare Workers configuration
├── package.json
├── .env.example
└── README-CLOUDFLARE.md          Detailed deployment guide
```

---

## วิธีติดตั้งและรัน

### 1. ติดตั้ง dependencies
```bash
npm install
```

### 2. ตั้งค่า Environment Variables
```bash
# Use wrangler secret put for sensitive values
wrangler secret put DATABASE_URL
wrangler secret put DB_CA_CERT
wrangler secret put SMTP_HOST
wrangler secret put SMTP_PORT
wrangler secret put SMTP_USER
wrangler secret put SMTP_PASSWORD
wrangler secret put SMTP_FROM
```

### 3. Local Development
```bash
npm run dev
# or
wrangler dev
```

เข้า `http://localhost:8787`

### 4. Deploy to Cloudflare
```bash
wrangler deploy
```

หรือเชื่อมต่อ GitHub repository ใน Cloudflare Dashboard

---

## หมายเหตุด้านความปลอดภัย

| ข้อ | FR | รายละเอียด |
|-----|----|-----------|
| รหัสผ่าน bcrypt | FR-15 | `bcrypt.hash(password, 12)` |
| ล็อกบัญชี 10 ครั้ง | FR-14 | lock 6 ชม. |
| บังคับเปลี่ยนรหัสครั้งแรก | BR-11 | `force_change_password = 1` |
| SQL Injection | FR-16 | ใช้ Prepared Statement ทุก query |
| Session Cookie | FR-19 | httpOnly + sameSite |
| Admin สร้าง User เท่านั้น | FR-17 | ไม่มีหน้าสมัครสมาชิก |
| SSL Connection | - | Database CA certificate verification |
| Password Hash Protection | - | Password field excluded from API responses |

---

## เอกสารเพิ่มเติม

ดู [README-CLOUDFLARE.md](README-CLOUDFLARE.md) สำหรับคำแนะนำการ deploy โดยละเอียด

## ฟีเจอร์ที่เพิ่มใน 2026-09-16

### 1) ปักหมุด GPS สถานที่กิจกรรม
- ผู้จัดกิจกรรมสามารถกด **📍 ใช้ตำแหน่งปัจจุบัน** ตอนสร้าง/แก้ไขกิจกรรม
- ระบบบันทึก `LocationLat` และ `LocationLng` ลงใน `activities`
- สามารถกรอก Latitude/Longitude เองได้ และมีลิงก์เปิดจุดบน OpenStreetMap
- พิกัดนี้สามารถนำไปใช้ตรวจระยะ GPS ของรูปยืนยันการเข้าร่วมได้

### 2) ผู้จัดเพิ่มรูปเกียรติบัตรหลังเช็คชื่อ
- ผู้จัดจะเห็นปุ่ม **เพิ่มเกียรติบัตร** เมื่อผู้สมัครมีสถานะ `attended` แล้ว
- รองรับ JPG / PNG / WebP ขนาดไม่เกิน 10MB
- ไฟล์เก็บใน R2 และบันทึก key ใน `registrations.CertificateUrl`
- ผู้เข้าร่วมสามารถกด **ดูเกียรติบัตร** จากรายการกิจกรรมของตัวเอง

### Database Migration
สำหรับฐานข้อมูลเดิม ให้รันครั้งเดียว:

```sql
-- database/migrations/2026-09-16-activity-gps-certificates.sql
ALTER TABLE registrations
  ADD COLUMN CertificateUrl VARCHAR(500) NULL AFTER reminder_sent;
```

> `LocationLat` และ `LocationLng` มีอยู่แล้วในตาราง `activities` จึงไม่ต้องเพิ่ม column GPS ใหม่
