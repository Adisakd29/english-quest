-- v1.17.0: Event Carousel บนหน้าแรก — ขยายตาราง events เดิม (ไม่สร้างระบบกิจกรรมซ้ำ)
-- แถวเดิม (กิจกรรมจาก config/events.js) ยังซิงก์ชื่อ/วันที่จาก config เหมือนเดิม — คอลัมน์ใหม่เป็นข้อมูลการแสดงผลที่ผู้ดูแลแก้ได้
-- แถวใหม่ source='admin' = กิจกรรมที่ผู้ดูแลสร้าง (ชาเลนจ์ที่ผูกกับระบบเรียนจริง + รางวัลที่ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์)
-- เพิ่มคอลัมน์อย่างเดียว · ไม่ลบ/แก้ข้อมูลเดิม
ALTER TABLE events ADD COLUMN IF NOT EXISTS source         VARCHAR(12)  NOT NULL DEFAULT 'system';   -- system | admin
ALTER TABLE events ADD COLUMN IF NOT EXISTS title_th       VARCHAR(120);
ALTER TABLE events ADD COLUMN IF NOT EXISTS description    VARCHAR(400);
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type     VARCHAR(24);                              -- ดู config/eventCarousel.js TYPES
ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_desktop TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_mobile  TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS priority       INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_featured    BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility     VARCHAR(12)  NOT NULL DEFAULT 'published';  -- published | hidden
ALTER TABLE events ADD COLUMN IF NOT EXISTS route          VARCHAR(40);
ALTER TABLE events ADD COLUMN IF NOT EXISTS reward         JSONB        NOT NULL DEFAULT '{}'::jsonb;  -- admin: { coins, exp, items[] }
ALTER TABLE events ADD COLUMN IF NOT EXISTS eligibility    JSONB        NOT NULL DEFAULT '{}'::jsonb;  -- admin: { type, skill, target }
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_events_carousel ON events (visibility, ends_at);
