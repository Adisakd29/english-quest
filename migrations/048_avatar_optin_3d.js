/*
  v1.8.0 (ต่อ): แยก "รูปโปรไฟล์" กับ "Avatar" ออกจากกัน + รองรับ 3D Avatar (GLB)
  - Avatar เป็นระบบเสริม: ทุกบัญชี avatar_enabled = FALSE -> แสดงรูปโปรไฟล์เดิมเหมือนเดิมทุกหน้า
    จนกว่าเจ้าของบัญชีจะเลือก "ใช้ Avatar ของฉัน" เอง
  - migration นี้ไม่ UPDATE ตาราง users / user_identities เลย (users.avatar · users.avatar_image · รูป Google คงเดิม 100%)
  - idempotent: รันซ้ำได้ · รันหลังเวอร์ชันที่เคยแสดงตัวละครเป็นค่าเริ่มต้น -> ปิดกลับเป็นรูปโปรไฟล์ทั้งหมด
    (ช่วงนั้นยังไม่มีหน้าขอความยินยอมแบบเลือกเอง จึงถือว่ายังไม่มีใครเปิดใช้)
*/
/** คอลัมน์ใหม่ (idempotent) — 047 เรียกด้วยบน DB ใหม่ที่ 047 รันก่อน 048 */
async function ensureColumns(client) {
  await client.query(`
    ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS avatar_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS display_pref_at TIMESTAMPTZ;          -- เวลาที่เจ้าของเลือกเอง (NULL = ยังไม่เคยเลือก)
    ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS model_version INTEGER NOT NULL DEFAULT 1; -- avatarModelVersion (Base Character)
    ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS thumb BYTEA;                            -- avatarThumbnail (portrait จาก 3D viewer)
    ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS thumb_mime VARCHAR(16);
    ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS thumb_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS thumb_outfit_hash VARCHAR(16);
    ALTER TABLE user_avatar ALTER COLUMN display_mode SET DEFAULT 'classic';
    ALTER TABLE avatar_items ADD COLUMN IF NOT EXISTS model JSONB;                            -- 3D: { glbUrl, fileSize, version, compatibleBaseVersion, ... }
  `);
}

async function run(client) {
  await ensureColumns(client);
  // ยังไม่เคยเลือกเอง -> ปิด Avatar (แสดงรูปโปรไฟล์เดิม)
  const r = await client.query(
    "UPDATE user_avatar SET avatar_enabled = FALSE, display_mode = 'classic' WHERE display_pref_at IS NULL AND (avatar_enabled OR display_mode <> 'classic')");
  console.log(`[avatar] opt-in: ปิดการแสดง Avatar อัตโนมัติ ${r.rowCount} บัญชี (รูปโปรไฟล์เดิมไม่ถูกแตะ)`);
}

module.exports = { run, ensureColumns };
