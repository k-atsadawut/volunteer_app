-- เพิ่มระบบปักหมุด GPS และเกียรติบัตรผู้เข้าร่วมกิจกรรม
-- GPS ของ activities มีอยู่แล้วใน schema: LocationLat / LocationLng

ALTER TABLE registrations
  ADD COLUMN CertificateUrl VARCHAR(500) NULL AFTER reminder_sent;
