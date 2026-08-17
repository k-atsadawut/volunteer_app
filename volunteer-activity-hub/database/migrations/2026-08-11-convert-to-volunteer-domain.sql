-- ============================================================
-- Migration: แปลงฐานข้อมูลระบบจองห้อง -> เว็บรวมกิจกรรมจิตอาสา
-- รันบน DB เดิม (มี rooms/bookings อยู่แล้ว) เพื่ออัปเกรดแบบ in-place
-- ⚠️ สำรองข้อมูลก่อนรัน (ข้อมูลการจองเดิมจะถูกแปลงเป็นกิจกรรม/การลงทะเบียน)
-- ============================================================

-- 1) เพิ่ม role 'organizer' และ field ใหม่ให้ users
ALTER TABLE users
  MODIFY Role ENUM('student','teacher','organizer','admin') NOT NULL DEFAULT 'student',
  ADD COLUMN total_hours DECIMAL(6,1) NOT NULL DEFAULT 0 AFTER locked_until;

-- 2) เปลี่ยนชื่อ rooms -> activities และเพิ่มคอลัมน์ที่จำเป็น
RENAME TABLE rooms TO activities;

ALTER TABLE activities
  CHANGE COLUMN RoomID ActivityID INT AUTO_INCREMENT,
  CHANGE COLUMN RoomName Title VARCHAR(200) NOT NULL,
  ADD COLUMN Description TEXT NULL AFTER Title,
  ADD COLUMN Category ENUM('environment','education','health','community','disaster_relief','animal_welfare','other')
        NOT NULL DEFAULT 'other' AFTER Description,
  ADD COLUMN OrganizerID INT NULL AFTER Category,
  ADD COLUMN OrganizerName VARCHAR(150) NULL AFTER OrganizerID,
  ADD COLUMN Location VARCHAR(255) NULL AFTER OrganizerName,
  ADD COLUMN LocationLat DECIMAL(10,7) NULL AFTER Location,
  ADD COLUMN LocationLng DECIMAL(10,7) NULL AFTER LocationLat,
  ADD COLUMN StartDate DATE NOT NULL DEFAULT (CURRENT_DATE) AFTER LocationLng,
  ADD COLUMN EndDate DATE NOT NULL DEFAULT (CURRENT_DATE) AFTER StartDate,
  ADD COLUMN StartTime TIME NULL AFTER EndDate,
  ADD COLUMN EndTime TIME NULL AFTER StartTime,
  ADD COLUMN MaxParticipants INT NULL AFTER EndTime,
  DROP COLUMN Capacity,
  ADD COLUMN HoursAwarded DECIMAL(5,1) NOT NULL DEFAULT 0 AFTER MaxParticipants,
  ADD COLUMN CoverImageUrl VARCHAR(500) NULL,
  MODIFY Status ENUM('draft','open','closed','ongoing','completed','cancelled') NOT NULL DEFAULT 'draft',
  ADD CONSTRAINT fk_activity_organizer FOREIGN KEY (OrganizerID) REFERENCES users(UserID)
        ON DELETE SET NULL ON UPDATE CASCADE,
  ADD INDEX idx_activity_dates (StartDate, EndDate),
  ADD INDEX idx_activity_status (Status),
  ADD INDEX idx_activity_category (Category);

-- 3) เปลี่ยนชื่อ bookings -> registrations
RENAME TABLE bookings TO registrations;

ALTER TABLE registrations
  CHANGE COLUMN BookingID RegistrationID INT AUTO_INCREMENT,
  CHANGE COLUMN RoomID ActivityID INT NOT NULL,
  DROP COLUMN BookingDate,
  DROP COLUMN StartTime,
  DROP COLUMN EndTime,
  ADD COLUMN Note VARCHAR(255) NULL AFTER Status,
  MODIFY Status ENUM('pending','approved','rejected','cancelled','attended','no_show') NOT NULL DEFAULT 'pending',
  ADD UNIQUE KEY uq_user_activity (UserID, ActivityID),
  ADD INDEX idx_registration_activity (ActivityID),
  ADD INDEX idx_registration_status (Status);

ALTER TABLE registrations
  DROP FOREIGN KEY fk_booking_room;
ALTER TABLE registrations
  ADD CONSTRAINT fk_registration_activity FOREIGN KEY (ActivityID) REFERENCES activities(ActivityID)
        ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE registrations
  DROP FOREIGN KEY fk_booking_user;
ALTER TABLE registrations
  ADD CONSTRAINT fk_registration_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) queues: เปลี่ยน RoomID -> ActivityID, ตัด BookingDate/StartTime/EndTime ออก (กิจกรรมมีช่วงวันที่ในตัวเองแล้ว)
ALTER TABLE queues
  DROP FOREIGN KEY fk_queue_room,
  CHANGE COLUMN RoomID ActivityID INT NOT NULL,
  DROP COLUMN BookingDate,
  DROP COLUMN StartTime,
  DROP COLUMN EndTime,
  ADD CONSTRAINT fk_queue_activity FOREIGN KEY (ActivityID) REFERENCES activities(ActivityID)
        ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) notifications: เปลี่ยน BookingID -> RegistrationID
ALTER TABLE notifications
  DROP FOREIGN KEY fk_notification_booking,
  CHANGE COLUMN BookingID RegistrationID INT NULL,
  ADD CONSTRAINT fk_notification_registration FOREIGN KEY (RegistrationID) REFERENCES registrations(RegistrationID)
        ON DELETE SET NULL ON UPDATE CASCADE;

-- 6) ตัดตารางที่ไม่เกี่ยวกับ domain กิจกรรมจิตอาสาออก
DROP TABLE IF EXISTS maintenance_reports;
DROP TABLE IF EXISTS holidays;

-- 7) สร้างตารางใหม่: photo_verifications, hours_log
CREATE TABLE photo_verifications (
    VerificationID  INT AUTO_INCREMENT PRIMARY KEY,
    RegistrationID  INT             NOT NULL,
    PhotoUrl        VARCHAR(500)    NOT NULL,
    ExifLat         DECIMAL(10,7)   NULL,
    ExifLng         DECIMAL(10,7)   NULL,
    ExifTakenAt     DATETIME        NULL,
    DistanceMeters  DECIMAL(10,2)   NULL,
    Status          ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
    RejectReason    VARCHAR(255)    NULL,
    ReviewedBy      INT             NULL,
    ReviewedAt      DATETIME        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_verification_registration FOREIGN KEY (RegistrationID) REFERENCES registrations(RegistrationID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_verification_reviewer FOREIGN KEY (ReviewedBy) REFERENCES users(UserID)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE hours_log (
    LogID           INT AUTO_INCREMENT PRIMARY KEY,
    UserID          INT             NOT NULL,
    ActivityID      INT             NOT NULL,
    RegistrationID  INT             NOT NULL,
    Hours           DECIMAL(5,1)    NOT NULL,
    GrantedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    GrantedBy       INT             NULL,
    CONSTRAINT fk_hourslog_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_hourslog_activity FOREIGN KEY (ActivityID) REFERENCES activities(ActivityID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_hourslog_registration FOREIGN KEY (RegistrationID) REFERENCES registrations(RegistrationID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uq_registration_log (RegistrationID)
) ENGINE=InnoDB;

-- หมายเหตุ: รันเฉพาะกรณีต้องการอัปเกรด DB เดิมแบบ in-place เท่านั้น
-- ถ้าเริ่มโปรเจกต์ใหม่ ใช้ database/schema.sql (สร้างจากศูนย์) แทน
