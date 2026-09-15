-- ============================================================
-- ข้อมูลทดสอบ / Test Data for Volunteer Activity Hub
-- ============================================================

-- ------------------------------------------------------------
-- Users (รหัสผ่านทั้งหมดคือ "password123" - bcrypt hash)
-- ------------------------------------------------------------
INSERT INTO users (Name, Email, Password, Role, Faculty, Department, force_change_password) VALUES
('Admin User', 'admin@university.ac.th', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzq5q5q5q5', 'admin', 'IT', 'Computer Science', 0),
('Organizer Somchai', 'organizer1@ngo.org', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzq5q5q5q5', 'organizer', NULL, NULL, 0),
('Organizer Suda', 'organizer2@ngo.org', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzq5q5q5q5', 'organizer', NULL, NULL, 0),
('Student Nop', 'student1@university.ac.th', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzq5q5q5q5', 'student', 'Engineering', 'Computer Engineering', 1),
('Student Mali', 'student2@university.ac.th', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzq5q5q5q5', 'student', 'Business', 'Accounting', 1),
('Student Som', 'student3@university.ac.th', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzq5q5q5q5', 'student', 'Arts', 'Design', 1),
('Student Dang', 'student4@university.ac.th', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzq5q5q5q5', 'student', 'Science', 'Physics', 1),
('Student Nam', 'student5@university.ac.th', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzq5q5q5q5', 'student', 'IT', 'Information Technology', 1);

-- ------------------------------------------------------------
-- Activities (กิจกรรมจิตอาสา)
-- ------------------------------------------------------------
INSERT INTO activities (Title, Description, Category, OrganizerID, OrganizerName, Location, LocationLat, LocationLng, StartDate, EndDate, StartTime, EndTime, MaxParticipants, HoursAwarded, Status) VALUES
('ทำความสะอาดชายหาดบางแสน', 'ร่วมกันเก็บขยะและทำความสะอาดชายหาดเพื่อสิ่งแวดล้อม', 'environment', 2, 'Organizer Somchai', 'ชายหาดบางแสน', 13.2847, 100.5725, '2026-09-20', '2026-09-20', '08:00:00', '12:00:00', 30, 4.0, 'open'),
('สอนเด็กยากจนคอมพิวเตอร์พื้นฐาน', 'สอนการใช้คอมพิวเตอร์และอินเทอร์เน็ตเบื้องต้นให้เด็กในชุมชน', 'education', 2, 'Organizer Somchai', 'ศูนย์เรียนรู้ชุมชน', 13.7368, 100.5231, '2026-09-25', '2026-09-25', '09:00:00', '16:00:00', 15, 8.0, 'open'),
('ตรวจสุขภาพฟรีชุมชน', 'ตรวจสุขภาพและให้คำปรึกษาด้านสุขภาพแก่ผู้สูงอายุ', 'health', 3, 'Organizer Suda', 'วัดใจกลาง', 13.7563, 100.5018, '2026-10-01', '2026-10-01', '08:30:00', '15:00:00', 50, 6.5, 'open'),
('เตรียมอาหารกลางวันให้ผู้ยากไร้', 'ปรุงอาหารและแจกจ่ายให้ผู้ยากไร้ในชุมชน', 'community', 3, 'Organizer Suda', 'มูลนิธิช่วยคนยากไร้', 13.7432, 100.4889, '2026-10-05', '2026-10-05', '07:00:00', '13:00:00', 20, 6.0, 'draft'),
('ช่วยเหลือผู้ประสบภัยน้ำท่วม', 'ส่งของและช่วยเหลือผู้ประสบภัยน้ำท่วมในพื้นที่', 'disaster_relief', 2, 'Organizer Somchai', 'จังหวัดอยุธยา', 14.3694, 100.5879, '2026-09-15', '2026-09-17', '08:00:00', '18:00:00', 100, 24.0, 'ongoing');

-- ------------------------------------------------------------
-- Registrations (การลงทะเบียนเข้าร่วมกิจกรรม)
-- ------------------------------------------------------------
-- การลงทะเบียนที่อนุมัติแล้ว
INSERT INTO registrations (UserID, ActivityID, Status) VALUES
(4, 1, 'approved'),
(5, 1, 'approved'),
(4, 2, 'approved');

-- การลงทะเบียนที่รออนุมัติ
INSERT INTO registrations (UserID, ActivityID, Status) VALUES
(6, 1, 'pending'),
(7, 2, 'pending'),
(8, 3, 'pending');

-- การลงทะเบียนที่ถูกปฏิเสธ
INSERT INTO registrations (UserID, ActivityID, Status) VALUES
(5, 3, 'rejected');

-- การลงทะเบียนที่ถูกยกเลิก
INSERT INTO registrations (UserID, ActivityID, Status) VALUES
(6, 2, 'cancelled');

-- การลงทะเบียนที่เข้าร่วมแล้ว
INSERT INTO registrations (UserID, ActivityID, Status) VALUES
(4, 5, 'attended');

-- ------------------------------------------------------------
-- Queues (คิวรอเข้าร่วมกิจกรรมเมื่อเต็ม)
-- ------------------------------------------------------------
INSERT INTO queues (UserID, ActivityID, Status) VALUES
(7, 1, 'waiting'),
(8, 2, 'waiting');

-- ------------------------------------------------------------
-- Notifications (การแจ้งเตือน)
-- ------------------------------------------------------------
INSERT INTO notifications (UserID, RegistrationID, Message, IsRead) VALUES
(6, 4, 'การลงทะเบียนกิจกรรม "ทำความสะอาดชายหาดบางแสน" ของคุณรอการอนุมัติ', 0),
(7, 5, 'การลงทะเบียนกิจกรรม "สอนเด็กยากจนคอมพิวเตอร์พื้นฐาน" ของคุณรอการอนุมัติ', 0),
(5, 7, 'การลงทะเบียนกิจกรรม "ตรวจสุขภาพฟรีชุมชน" ของคุณถูกปฏิเสธ', 1),
(4, 1, 'การลงทะเบียนกิจกรรม "ทำความสะอาดชายหาดบางแสน" ของคุณได้รับการอนุมัติแล้ว', 1);

-- ------------------------------------------------------------
-- Photo Verifications (การยืนยันด้วยรูปถ่าย)
-- ------------------------------------------------------------
INSERT INTO photo_verifications (RegistrationID, PhotoUrl, ExifLat, ExifLng, ExifTakenAt, DistanceMeters, Status) VALUES
(8, 'https://r2.dev/volunteer-activity-photos/verification_001.jpg', 14.3694, 100.5879, '2026-09-15 10:30:00', 15.5, 'verified');

-- ------------------------------------------------------------
-- Hours Log (บันทึกชั่วโมงจิตอาสา)
-- ------------------------------------------------------------
INSERT INTO hours_log (UserID, ActivityID, RegistrationID, Hours, GrantedAt, GrantedBy) VALUES
(4, 5, 8, 24.0, '2026-09-17 18:00:00', 1);

-- ------------------------------------------------------------
-- หมายเหตุ:
-- - รหัสผ่านทั้งหมดคือ "password123" (bcrypt hash)
-- - Admin ไม่ต้องเปลี่ยนรหัสผ่าน (force_change_password = 0)
-- - Students ทั้งหมดต้องเปลี่ยนรหัสผ่านครั้งแรก (force_change_password = 1)
-- - ข้อมูลการลงทะเบียนมีสถานะต่างๆ เพื่อทดสอบ workflow ทั้งหมด
-- ============================================================
