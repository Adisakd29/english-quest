# Avatar · Coin · Wardrobe · Shop (v1.8.0)

## หลักการ
- **Coin ≠ EXP ≠ Rank ≠ Mastery** — แยกตาราง แยก logic · Coin ใช้ซื้อของตกแต่งเท่านั้น ไม่มี endpoint ใดแปลง Coin เป็นความสามารถ
- ไม่มีเงินจริง · ไม่มีกล่องสุ่ม/gacha · เห็นชื่อ หน้าตา ราคา ก่อนซื้อเสมอ
- เซิร์ฟเวอร์เป็นผู้ตัดสินทุกอย่าง: ยอด Coin, ราคา (อ่านจาก DB), ความเป็นเจ้าของ, การสวม

## ตาราง (migrations/046_avatar_coins.sql)
| ตาราง | หน้าที่ |
|---|---|
| `avatar_items` | แคตตาล็อก (category=slot, rarity, price, parts[] = layer+z+url, is_purchasable, is_achievement_reward, achievement_id, event_id, is_active, admin_override) |
| `avatar_assets` | ภาพที่ผู้ดูแลอัปโหลด (bytea) เสิร์ฟที่ `/api/avatar/asset/:id` |
| `coin_wallets` | ยอดคงเหลือ (`CHECK balance >= 0`) + lifetime_earned |
| `coin_transactions` | ทุกการเข้า/ออก: id, user_id, amount, type, source_key (**UNIQUE ต่อผู้ใช้**), source_id, description, balance_after, created_at |
| `user_inventory` | ของที่มี (PK user+item) · acquisition_type purchase/achievement/event/starter/admin · last_equipped_at |
| `user_avatar` | ชุดที่สวม 14 ช่อง (`<slot>_item_id`) + display_mode character/classic |
| `outfit_presets` | 3 ช่อง |
| `user_achievements` | Achievement ที่ปลดล็อก (PK user+achievement) |

`047_avatar_backfill.js` นำเข้าแคตตาล็อก + เตรียมผู้ใช้เดิมทุกคน (กระเป๋า + 150 Coins ต้อนรับ + ของเริ่มต้น + ชุดเริ่มต้น) — idempotent

## Coin
- ค่ารางวัลทั้งหมด: `config/coinRewards.js` (ที่เดียว)
- `services/coins.js grant()` — ล็อกกระเป๋า `FOR UPDATE` · ตรวจ source_key ซ้ำ · เพดานรายวัน (review) · บันทึก balance_after
- แหล่งที่มา:
  - hook ใน `utils/exp.js grantOnce` (key EXP ที่ได้ครั้งแรก → Coin ตาม `EXP_KEY_RULES`): จบบทแกรมม่า/C2, เต็มร้อย, เขียน, TOEIC Practice/Mock, ทบทวน, Daily C2
  - Grammar Daily Challenge (`services/grammar/engine.js`) — key `daily:<วัน>` ร่วมกับ C2 Daily = วันละครั้ง
  - `services/avatar/achievements.js reconcileActivityCoins` — Mastery แกรมม่า, ผ่าน Unit Test/Boss ครั้งแรก, เลื่อนแรงค์ (ต่อซีซัน/โหมด/ตำแหน่ง), เป้าหมายรายวัน (20 ข้อจาก answer_events) และรายสัปดาห์ (5 วัน)
  - Achievement
- **ไม่แจกย้อนหลัง**: Mastery/Assessment นับเฉพาะที่เกิดหลังเปิดกระเป๋า (`coin_wallets.created_at`) · เลื่อนแรงค์ให้ตำแหน่งปัจจุบันครั้งเดียว

## Avatar
- **Avatar เป็น opt-in**: รูปโปรไฟล์เดิมไม่ถูกแทนที่จนกว่าเจ้าของบัญชีเลือก "ใช้ Avatar ของฉัน" เอง — รายละเอียด + 3D ดู `docs/AVATAR_3D.md`
- Asset: `scripts/avatar/art.js` (วาด SVG) + `scripts/avatar/catalog.js` (รายการ) → `node scripts/avatar/build-assets.js` → `public/assets/avatar/items|thumbs` + `data/avatar/catalog.json`
- canvas 240×320 เดียวกันทุกไฟล์ · ลำดับ layer (`LAYER_Z`): background → effect(หลัง) → back item → hair(หลัง) → body → bottom → shoes → top → back item(สายหน้า) → outerwear → face → glasses → hair → headphones → hat → accessory → effect
- Renderer: `EQAvatar.render(outfit, 'full'|'half'|'head'|'thumb')` — viewBox crop ไม่มี CSS วางตำแหน่งรายหน้า
- Avatar Everywhere: `G.avatar(id, image, cls, uid|'bot:<seed>')` → `<span class="eqav">` → MutationObserver แทนด้วยตัวละคร (ดึง `/api/avatar/looks?ids=` เป็นชุด + cache)

## กติกาการสวม
body/face/hair ต้องมีเสมอ · หมวกกับหูฟังใส่พร้อมกันไม่ได้ · ช่องละ 1 ชิ้น · ต้องเป็นเจ้าของ (ตรวจที่เซิร์ฟเวอร์)

## เพิ่มของใหม่
1. วาดใน `art.js` + เพิ่มใน `catalog.js` แล้วรัน build-assets (deploy แล้วเซิร์ฟเวอร์ sync เอง) หรือ
2. หน้า Admin → "ของตกแต่ง Avatar" → อัปโหลด PNG/WebP/SVG (canvas 240×320) → ดูตัวอย่าง layer → เพิ่ม (ปิดไว้) → เปิดใช้

## ทดสอบ
- `test/avatar-coins.test.js` (15 เทสต์)
- `python3 test/e2e/avatar_e2e.py <width> [light|dark]`
