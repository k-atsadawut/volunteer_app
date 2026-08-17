-- ============================================================
-- เว็บไซต์รวบรวมกิจกรรมจิตอาสา / Volunteer Activity Aggregator
-- Database Schema (MySQL / TiDB compatible)
-- แปลงจาก schema ระบบจองห้องผลิตสื่อดิจิทัลเดิม
-- ============================================================

-- ------------------------------------------------------------
-- ตาราง User (คงโครงสร้างเดิม — student/teacher ใช้เข้าร่วมกิจกรรม,
-- เพิ่ม role 'organizer' สำหรับหน่วยงาน/ผู้จัดกิจกรรม)
-- ------------------------------------------------------------
CREATE TABLE users (
    UserID              INT AUTO_INCREMENT PRIMARY KEY,
    Name                VARCHAR(100)        NOT NULL,
    Email               VARCHAR(150)        NOT NULL UNIQUE,
    Password            VARCHAR(255)        NOT NULL,
    Role                ENUM('student','teacher','organizer','admin') NOT NULL DEFAULT 'student',
    Faculty             VARCHAR(100)        NULL,
    Department          VARCHAR(100)        NULL,
    force_change_password TINYINT(1)        NOT NULL DEFAULT 1,
    failed_login_count  TINYINT             NOT NULL DEFAULT 0,
    locked_until        DATETIME            NULL,
    total_hours         DECIMAL(6,1)        NOT NULL DEFAULT 0,
    created_at          DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Activities (เดิมคือ rooms)
-- ------------------------------------------------------------
CREATE TABLE activities (
    ActivityID      INT AUTO_INCREMENT PRIMARY KEY,
    Title           VARCHAR(200)        NOT NULL,
    Description     TEXT                NULL,
    Category        ENUM('environment','education','health','community','disaster_relief','animal_welfare','other')
                                         NOT NULL DEFAULT 'other',
    OrganizerID     INT                 NULL,
    OrganizerName   VARCHAR(150)        NULL,
    Location        VARCHAR(255)        NULL,
    LocationLat     DECIMAL(10,7)       NULL,
    LocationLng     DECIMAL(10,7)       NULL,
    StartDate       DATE                NOT NULL,
    EndDate         DATE                NOT NULL,
    StartTime       TIME                NULL,
    EndTime         TIME                NULL,
    MaxParticipants INT                 NULL,
    HoursAwarded    DECIMAL(5,1)        NOT NULL DEFAULT 0,
    Status          ENUM('draft','open','closed','ongoing','completed','cancelled') NOT NULL DEFAULT 'draft',
    CoverImageUrl   VARCHAR(500)        NULL,
    created_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_organizer FOREIGN KEY (OrganizerID) REFERENCES users(UserID)
        ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_activity_dates (StartDate, EndDate),
    INDEX idx_activity_status (Status),
    INDEX idx_activity_category (Category)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Registrations (เดิมคือ bookings)
-- ------------------------------------------------------------
CREATE TABLE registrations (
    RegistrationID  INT AUTO_INCREMENT PRIMARY KEY,
    UserID          INT                 NOT NULL,
    ActivityID      INT                 NOT NULL,
    Status          ENUM('pending','approved','rejected','cancelled','attended','no_show')
                                         NOT NULL DEFAULT 'pending',
    Note            VARCHAR(255)        NULL,
    reminder_sent   TINYINT(1)          NOT NULL DEFAULT 0,
    created_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_registration_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_registration_activity FOREIGN KEY (ActivityID) REFERENCES activities(ActivityID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uq_user_activity (UserID, ActivityID),
    INDEX idx_registration_activity (ActivityID),
    INDEX idx_registration_status (Status)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Queue (คงแนวคิดเดิม — คิวรอ กรณีกิจกรรมเต็ม)
-- ------------------------------------------------------------
CREATE TABLE queues (
    QueueID     INT AUTO_INCREMENT PRIMARY KEY,
    UserID      INT                 NOT NULL,
    ActivityID  INT                 NOT NULL,
    Status      ENUM('waiting','notified','expired','cancelled') NOT NULL DEFAULT 'waiting',
    created_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_queue_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_queue_activity FOREIGN KEY (ActivityID) REFERENCES activities(ActivityID)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Notifications (คงเดิม)
-- ------------------------------------------------------------
CREATE TABLE notifications (
    NotificationID  INT AUTO_INCREMENT PRIMARY KEY,
    UserID          INT             NOT NULL,
    RegistrationID  INT             NULL,
    Message         VARCHAR(255)    NOT NULL,
    IsRead          TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_registration FOREIGN KEY (RegistrationID) REFERENCES registrations(RegistrationID)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง Photo Verifications (ใหม่)
-- พิสูจน์การเข้าร่วมกิจกรรมด้วยรูปถ่าย + พิกัด GPS จาก EXIF
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- ตาราง Hours Log (ใหม่)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- ตาราง Password Reset Requests (คงเดิม)
-- ------------------------------------------------------------
CREATE TABLE password_reset_requests (
    RequestID   INT AUTO_INCREMENT PRIMARY KEY,
    UserID      INT             NOT NULL,
    Email       VARCHAR(150)    NOT NULL,
    Status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    RequestDate DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ProcessedDate DATETIME      NULL,
    ProcessedBy INT             NULL,
    Notes       VARCHAR(255)    NULL,
    CONSTRAINT fk_reset_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reset_admin FOREIGN KEY (ProcessedBy) REFERENCES users(UserID)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- ตาราง OTP (คงเดิม)
-- ------------------------------------------------------------
CREATE TABLE otp_codes (
    OTPID       INT AUTO_INCREMENT PRIMARY KEY,
    UserID      INT             NOT NULL,
    Email       VARCHAR(150)    NOT NULL,
    Code        VARCHAR(6)      NOT NULL,
    Type        ENUM('password_change','email_verification','password_reset') NOT NULL DEFAULT 'password_change',
    ExpiresAt   DATETIME        NOT NULL,
    Used        TINYINT(1)      NOT NULL DEFAULT 0,
    CreatedAt   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_otp_user FOREIGN KEY (UserID) REFERENCES users(UserID)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_otp_code (Code),
    INDEX idx_otp_user (UserID),
    INDEX idx_otp_expires (ExpiresAt)
) ENGINE=InnoDB;

-- ============================================================
-- ตารางที่ตัดออกจาก schema เดิม (ไม่เกี่ยวกับ domain กิจกรรมจิตอาสา):
--   - rooms, bookings          -> แทนที่ด้วย activities, registrations
--   - holidays                 -> กิจกรรมจิตอาสาไม่ผูกกับวันหยุดมหาวิทยาลัย
--   - maintenance_reports      -> ฟีเจอร์แจ้งซ่อมห้อง ไม่เกี่ยวกับ domain นี้
-- ============================================================
