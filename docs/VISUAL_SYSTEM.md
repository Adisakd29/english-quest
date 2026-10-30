# EnglishQuest — Visual Design System

**กติกาหลัก:** UI ไม่ใช้ emoji เลย ทุกกราฟิกมาจากระบบกลางชุดเดียว ห้าม hard-code SVG หรือสีแยกหน้า

## Art direction: Flat + subtle depth
- ใช้รูปทรงเรขาคณิตมุมมน และไม่มีเส้นขอบรอบวัตถุ
- มิติได้จาก "เงาด้านข้าง" ที่สีเข้มกว่าหนึ่งระดับและเลื่อนลง 4–6px รวมกับเงาพื้นแบบวงรีจาง ๆ ไม่ใช้ gradient
- สีมาจากพาเลต `--il-*` ใน `public/css/visual.css` เท่านั้น ธีมมืดจะ override ค่าเหล่านี้ให้อัตโนมัติ

## ไฟล์
| โฟลเดอร์ | เนื้อหา | สร้างโดย |
|---|---|---|
| `public/assets/icons/icons.svg` | Lucide 94 ไอคอน (ไลบรารีเดียว) | `node scripts/build-icons.js` |
| `public/assets/illustrations/illustrations.svg` | ภาพประกอบ 14 ภาพ: home, placement, vocab, grammar, review, battle, leaderboard, success, empty-review, empty-friends, empty-room, empty-search, offline, login | `python3 scripts/build-graphics.py` |
| `public/assets/mascot/mascot.svg` | Fox 8 อารมณ์: normal, happy, thinking, celebration, encouragement, confused, success, welcome | 〃 |
| `public/assets/avatars/avatars.svg` | อวตาร 12 ตัว (id ตรงกับ `utils/avatars.js`) | 〃 |
| `public/assets/badges/badges.svg` | ตรา CEFR (A1 Foundation สี่เหลี่ยม · A2 Explorer เข็มทิศ · B1 Builder หกเหลี่ยม · B2 Communicator บับเบิล · C1 Advanced ดาว) และเหรียญ (Bronze วงกลม · Silver หกเหลี่ยม · Gold โล่ · Platinum อัญมณี) | 〃 |
| `public/assets/backgrounds/dots.svg` | ลายจุดพื้นหลัง | 〃 |

## ใช้งานในโค้ด (`window.EQG` จาก `public/js/graphics.js`)
```js
G.icon('book-open', 'icon-sm')          // sm 16 / md 20 / lg 24 / xl 32
G.illo('empty-review')                   // ภาพประกอบ (decorative)
G.mascot('success', 'mascot-lg')
G.avatar(user.avatar, user.avatarImage)
G.emblem('B1', { size: 'sm', named: true })
G.tierBadge('gold', '1') / G.rankBadge(rank)
G.emptyState({ art, title, text, cta: { label, id, icon } })
G.feedback(ok, title, bodyHtml)          // แผงผลตอบ ถูก/ผิด
G.skeleton('list' | 'card' | 'grid', n)
G.iconize(element)                       // แปลง ✅ ❌ ⚠️ 💡 ในเนื้อหาบทเรียนเป็นไอคอน
```
ใน HTML คงที่ใช้ placeholder ได้: `data-icon="x"`, `data-illo="home"`, `data-mascot="welcome"`, `data-emblem="A1"`

**เพิ่มไอคอนใหม่:** เพิ่มชื่อในรายการ `ICONS` ของ `scripts/build-icons.js` แล้วเพิ่มใน `ICON_NAMES` ของ `graphics.js` จากนั้นรันสคริปต์ใหม่

## Motion
- ความยาว animation 150–350ms (ใช้ตัวแปร `--motion-*`)
- ใช้เฉพาะ feedback, achievement unlock, progress และ node ปัจจุบันบนเส้นทาง
- รองรับ `prefers-reduced-motion`
