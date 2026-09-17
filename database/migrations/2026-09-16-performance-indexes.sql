-- Performance Optimization Indexes
-- เพิ่ม indexes เพื่อเพิ่มประสิทธิภาพการ query ที่ใช้บ่อย

-- Index สำหรับ registrations ที่ใช้ค้นหาตาม activity และ status
ALTER TABLE registrations 
  ADD INDEX idx_reg_activity_status (ActivityID, Status);

-- Index สำหรับ registrations ที่ใช้ค้นหาตาม user และ activity (unique key อยู่แล้ว แต่เพิ่ม regular index สำหรับ performance)
ALTER TABLE registrations 
  ADD INDEX idx_reg_user_activity (UserID, ActivityID);

-- Index สำหรับ activities ที่ใช้ค้นหาตาม organizer และ status
ALTER TABLE activities 
  ADD INDEX idx_act_organizer_status (OrganizerID, Status);

-- Index สำหรับ activities ที่ใช้ค้นหาตาม category และ status
ALTER TABLE activities 
  ADD INDEX idx_act_category_status (Category, Status);

-- Index สำหรับ queues ที่ใช้ค้นหาตาม activity และ status
ALTER TABLE queues 
  ADD INDEX idx_queue_activity_status (ActivityID, Status);

-- Index สำหรับ notifications ที่ใช้ค้นหาตาม user และ read status
ALTER TABLE notifications 
  ADD INDEX idx_notif_user_read (UserID, IsRead);

-- Index สำหรับ photo_verifications ที่ใช้ค้นหาตาม status
ALTER TABLE photo_verifications 
  ADD INDEX idx_verif_status (Status);

-- Index สำหรับ hours_log ที่ใช้ค้นหาตาม user
ALTER TABLE hours_log 
  ADD INDEX idx_hours_user (UserID);

-- Index สำหรับ users ที่ใช้ค้นหาตาม email (มี unique อยู่แล้ว แต่เพิ่มสำหรับ performance)
ALTER TABLE users 
  ADD INDEX idx_user_email (Email);

-- Index สำหรับ users ที่ใช้ค้นหาตาม role
ALTER TABLE users 
  ADD INDEX idx_user_role (Role);