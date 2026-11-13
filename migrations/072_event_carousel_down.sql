-- ย้อน v1.17.0 Event Carousel (ใช้เฉพาะกรณีจำเป็น — ลบกิจกรรมที่ผู้ดูแลสร้างและรางวัลที่เคยรับของกิจกรรมนั้น ๆ ก่อน DROP คอลัมน์)
-- DELETE FROM event_reward_claims WHERE event_id IN (SELECT id FROM events WHERE source = 'admin');
-- DELETE FROM events WHERE source = 'admin';
ALTER TABLE events DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS title_th, DROP COLUMN IF EXISTS description, DROP COLUMN IF EXISTS event_type,
  DROP COLUMN IF EXISTS banner_desktop, DROP COLUMN IF EXISTS banner_mobile, DROP COLUMN IF EXISTS priority, DROP COLUMN IF EXISTS is_featured,
  DROP COLUMN IF EXISTS visibility, DROP COLUMN IF EXISTS route, DROP COLUMN IF EXISTS reward, DROP COLUMN IF EXISTS eligibility,
  DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS created_at;
