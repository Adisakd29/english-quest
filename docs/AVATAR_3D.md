# 3D Avatar (v1.8.0) — Profile Photo ≠ Avatar · Blender → GLB → three.js

## 1. หลักสำคัญ: รูปโปรไฟล์กับ Avatar แยกกัน (Avatar = opt-in)
| ข้อมูล | ที่เก็บ | ใครเปลี่ยนได้ |
|---|---|---|
| profilePhoto (รูปอัปโหลด) | `users.avatar_image` (เดิม) | `PATCH/DELETE /api/auth/avatar-image` เท่านั้น |
| รูปสัตว์เดิม | `users.avatar` (เดิม) | `PATCH /api/auth/avatar` เท่านั้น |
| รูป Google | `user_identities.avatar_url` (เดิม) | ระบบ Google Sign-in เดิม |
| avatarEnabled | `user_avatar.avatar_enabled` (ค่าเริ่มต้น `FALSE`) | `PUT /api/avatar/display {useAvatar}` (setProfileDisplayPreference) |
| avatarConfig | `user_avatar.<slot>_item_id` (item IDs ไม่ใช่โมเดล) | `PUT /api/avatar/outfit` (updateAvatar) · `POST /api/avatar/equip` (equipAvatarItem) |
| avatarThumbnail | `user_avatar.thumb` (+version, outfit hash) | `POST /api/avatar/thumbnail` (ของตัวเอง) |
| avatarModelVersion | `user_avatar.model_version` | — |

- ไม่มี migration หรือ endpoint ใดของ Avatar ที่ `UPDATE users` / `user_identities`
- `048_avatar_optin_3d.js` ตั้ง `avatar_enabled = FALSE` ให้ทุกบัญชีที่ยังไม่เคยเลือกเอง (รวมถึงบัญชีที่รุ่นก่อนหน้าเคยแสดงตัวละครเป็นค่าเริ่มต้น)
- หน้าเว็บ: `G.avatar(..., uid)` → แสดง Avatar แทนรูปโปรไฟล์ **เฉพาะเมื่อเจ้าของบัญชี `enabled`** · ไม่งั้นรูปเดิม (DOM node เดิม) ไม่ถูกแตะ · สลับกลับคืน node เดิมทันที
- userId มาจาก token เสมอ (ไม่มี endpoint เขียนข้อมูลที่รับ userId จาก client)

## 2. Blender pipeline
```
python3.11 -m venv bpyenv && bpyenv/bin/pip install bpy        # Blender 5.0 แบบ headless (หรือใช้ blender -b -P ...)
bpyenv/bin/python scripts/avatar3d/blender/build_avatar3d.py <out> [ASSET,ASSET…]   # ทั้งชุด ~9 นาที (สร้าง + ตรวจ 11 ท่า + ความเข้ากันได้ + ภาพย่อ) · ระบุ asset = สร้างเฉพาะชิ้น
node scripts/avatar3d/optimize.mjs <out> [--merge]                # dedup/prune(เก็บ UV)/weld/quantize + meshopt -> public/assets/avatar3d (ไฟล์มี hash) · data/avatar/models.json · ชิ้นที่ไม่ผ่านด่านตรวจ = active:false (EQ_ALLOW_FAIL=1 สำหรับดีบักเท่านั้น)
npx esbuild scripts/avatar3d/three-entry.js --bundle --format=esm --minify --outfile=public/vendor/eq-three.min.js
```
- Source: `assets-src/avatar3d/EQ_Avatar_Master.blend` (ARM_Main · CHR_Base_01 · sockets · materials · ไฟ/กล้อง · Text `ASSET_RULES`) และ `EQ_Avatar_Items.blend` (ทุก item แยก collection ตามหมวด) · QA renders `QA_Outfit_A..E` (หน้า/หลัง) อยู่ใน `<out>`
- โค้ดโมเดล: `eqlib.py` (primitive · rig · skinning · animation) · `eqdetail.py` (ลายผ้า · UV · ท่อเปิดปลาย · ตัดขอบ/ขอบผ้า · ความหนา) · `garments.py` (แพตเทิร์น: ลำตัวเสื้อ แขนเสื้อ ปก กระดุม ซิป กางเกง กระโปรง รองเท้า) · `items_wear.py` / `items_head.py` (ทุกชิ้น) · `registry.py` (ITEMS: asset ↔ itemId ↔ slot) · `build_avatar3d.py` (base · mask · ตรวจ · export)
- มาตรฐาน: เมตร · สูง 1.0 m · Blender Z-up หันหน้า -Y · origin ที่พื้นกลางเท้า → glTF +Y up หันหน้า +Z
- Skeleton `ARM_Main` (20 bones): Root Hips Spine Chest Neck Head Eye.L/R UpperArm/LowerArm/Hand.L/R UpperLeg/LowerLeg/Foot.L/R
- Sockets: SOCK_Head (ผม/หมวก/แว่น/หูฟัง) · SOCK_Back (กระเป๋า) · SOCK_Spine · SOCK_Hand_L/R
- เสื้อผ้า skin กับ ARM_Main (vertex groups = ชื่อ bone) · ของติดตัว weight 1.0 ที่ bone ของ socket → runtime rebind แบบเดียวกันทุกชิ้น
- ใบหน้าแยกเป็น item (FACE_*) ไม่ฝังใน base · ตาผูกกับ Eye.L/R (กะพริบได้)
- แสง/เงา: Ambient Occlusion bake ลง vertex color `AO` (Cycles) → export เป็น `COLOR_0` (ไม่มี texture) · ลาย gradient (Galaxy/Aurora) ใช้ vertex tint
- Naming: `CHR_Base_01 · FACE_* · HAIR_* · TOP_* · BOT_* · OUT_* · SHOE_* · HAT_* · ACC_* · BACK_* · FX_* · ARM_Main · MAT_<Item>_<Part> · ANIM_<Clip>`
- Animations (บน ARM_Main ใช้ร่วมทุกตัว · 11 คลิป): ANIM_Idle · ANIM_Blink · ANIM_Wave · ANIM_RaiseArmL · ANIM_RaiseArmR · ANIM_BothArmsUp · ANIM_Turn (หมุน 360°) · ANIM_Celebrate · ANIM_Victory · ANIM_Defeat · ANIM_Walk — ยกแขนสูงสุด 125° (เดิม 150° แขนทะลุหัว)
- Thumbnail ร้าน/ตู้: render Cycles 256×256 → WebP (ชิ้นที่อยู่บนหัวแสดงพร้อมใบหน้า)

## 3. แคตตาล็อก + งบ (วัดจากไฟล์จริงหลัง optimize)
แคตตาล็อก 129 ชิ้น = **121 GLB** (57 ของเดิมออกแบบใหม่ + 64 ชิ้นใหม่) + 4 สีผิว (เปลี่ยนสี material `MAT_Skin*` ของ base) + 4 พื้นหลัง (ฉากหลังของ viewer) → **ไม่มีชิ้นใดในแคตตาล็อกที่เป็น 2D อย่างเดียว** · 12 คอลเลกชัน (`catalog.json` → `collections`)
ของที่ admin อัปโหลดภายหลัง (ภาพ 2D) ยังไม่มีโมเดล → ร้านเปิด Preview 2D ของชิ้นนั้นจริง + ข้อความ "ชุดนี้รองรับ Preview 2D เท่านั้น"
งบ: ≤ 12k tris ต่อชิ้น · ชุดหนักสุด (ชิ้นหนักสุดทุกช่อง + base) ≤ 90k (ปัจจุบัน ~81k) — ทดสอบใน `test/avatar-optin.test.js`

| หมวด | ชิ้น | tris | ขนาด (meshopt) |
|---|---|---|---|
| Base CHR_Base_01 | 1 | 14,560 | 303 KB |
| ใบหน้า | 4 | 1.3k–2.9k | 38–58 KB |
| ทรงผม | 10 | 3.9k–5.8k | 53–84 KB |
| เสื้อ | 19 | 4.6k–10.0k | 91–165 KB |
| กางเกง/กระโปรง | 14 | 1.8k–7.9k | 40–134 KB |
| เสื้อคลุม | 9 | 8.0k–10.2k | 136–173 KB |
| รองเท้า | 15 | 4.0k–9.4k | 79–161 KB |
| หมวก | 11 | 1.0k–4.3k | 28–65 KB |
| แว่น | 6 | 1.0k–1.6k | 25–44 KB |
| หูฟัง | 5 | 1.6k–2.4k | 32–55 KB |
| เครื่องประดับ | 14 | 0.2k–3.2k | 12–61 KB |
| กระเป๋า/ของหลัง | 8 | 0.9k–4.3k | 27–77 KB |
| เอฟเฟกต์ | 6 | 0.5k–4.6k | 13–60 KB |
| **รวม GLB** | 121 | | **9,727 KB** (โหลดเฉพาะชิ้นที่สวม/ลอง) |
| Texture | — | ไม่มีไฟล์ | สี PBR + AO vertex color + normal map ลายผ้า 12 แบบสร้างตอนรัน (128², แชร์ทุกชิ้น) |

## 4. Runtime
- `public/js/avatar3d.js` (EQAvatar3D) + `public/vendor/eq-three.min.js` (three r169 tree-shaken ~149 KB gzip — โหลดเฉพาะหน้าที่มี 3D)
- ความคมชัด: pixel ratio = `min(devicePixelRatio, 2)` (Save-Data 1.5) จำกัด ~2.2 ล้านพิกเซล · MSAA · drawing buffer = ขนาด CSS × ratio (ResizeObserver) · ไม่ใช้ CSS ขยายภาพ
- แสง: PBR MeshStandardMaterial + RoomEnvironment (PMREM) + hemisphere/key/rim · NeutralToneMapping · sRGB
- Adaptive quality: เฉลี่ยเวลาเฟรม 45 เฟรม > 22 ms → ลด ratio ทีละ 0.25 (ต่ำสุด 1) → แล้วจำกัด 30fps · `stats()` รายงานค่าจริง
- Modular: base GLB + item GLB ทีละชิ้น → `SkinnedMesh.bind(new Skeleton(bonesByName…))` · เปลี่ยนชิ้นไหนโหลด/ถอดเฉพาะ slot นั้น · ตัวนับ generation ต่อ slot → ผลโหลดที่มาช้ากว่าการเลือกล่าสุดถูกทิ้ง (กดเร็ว ๆ ไม่มีชุดเก่าทับ) · dispose geometry/material ที่ถอด
- Lazy: ร้าน/ตู้ใช้ภาพย่อ · โหลด GLB ตอนกด "ลองสวม" · SW cache `eq-avatar3d` (ไฟล์มี hash = cache ได้ถาวร)
- กล้อง: หมุนตัวละครรอบแกน Y · มุมก้มเงย [-0.12, 0.42] · ระยะ [1.45, 3.6] m · ระยะเริ่มต้นคำนวณให้เห็นเต็มตัวตามสัดส่วนจอ
- ควบคุม: Pointer Events (เมาส์/นิ้ว/ปากกา, capture บน canvas) ลากหมุน · เมาส์ลากขึ้นลง = ก้มเงย · pinch ซูม · wheel ซูม (ไม่ดักการเลื่อนหน้าเมื่อถึงขอบเขต) · double-click รีเซ็ต · ปุ่ม หมุนซ้าย/ขวา ซูมเข้า/ออก รีเซ็ต (≥44px) · คีย์ ← → + − 0 · canvas `touch-action: pan-y` (ปัดขึ้นลงยังเลื่อนหน้าได้)
- render เฉพาะตอนมองเห็น (IntersectionObserver + visibilitychange) · prefers-reduced-motion → ไม่มี idle loop · ออกจากหน้า → dispose context
- WebGL context lost → preventDefault + mount ใหม่อัตโนมัติเมื่อ restored · ไม่มี WebGL → 2D + ข้อความ · โหลดไม่ได้/timeout 20s → 2D + ปุ่ม "ลองโหลด 3D อีกครั้ง"
- สถานะในร้าน: ยังไม่มี · กำลังลอง · มีแล้ว · สวมอยู่ · ล็อก (Achievement) · 2D เท่านั้น — Preview ไม่บันทึกลงชุดจริง · ยกเลิก = กลับชุดที่สวม · Coin ไม่พอ → ปุ่มซื้อ disabled + "ต้องการอีก N Coin" (ลองสวมฟรีเสมอ)

## 4.1 ตรวจ Asset (ทำทุกครั้งก่อน deploy)
- `node scripts/avatar3d/audit.mjs --md docs/AVATAR_ASSET_AUDIT.md` — ตรวจไฟล์จริงทุกชิ้น: SVG 2D ทุก layer + ภาพย่อ · GLB เปิดได้ (meshopt) · มี mesh/skin · joint อยู่ใน ARM_Main · ทุก primitive มี material + AO · ไม่มี texture > 1024 · tris/ขนาดตรง manifest · ภาพย่อ WebP — exit 1 ถ้ามีชิ้นเสีย
- `python3 test/e2e/avatar_assets_e2e.py` — โหลดทุกชิ้นที่ขายจริง (จาก API/DB) ลง viewer ทีละชิ้น: อยู่ใน slot ถูก · กล่องขอบเขตหลัง skinning อยู่ตำแหน่งร่างกายที่ถูก (หมวกบนหัว รองเท้าที่เท้า) · tris ที่เรนเดอร์เพิ่มตรงโมเดล · ภาพเปลี่ยนจริง · ภาพย่อ 2D/3D โหลดได้ · Preview 2D มี layer ของชิ้นนั้น

## 4.2 Preset 1–3 · Reset
- บันทึก Preset พร้อมภาพตัวอย่างเต็มตัวจาก viewer 3D (`snapshot(192, 'full')`, WebP หรือ PNG ≤ 80 KB ตรวจลายเซ็นไฟล์ที่เซิร์ฟเวอร์ → `outfit_presets.thumb`, migration 050) · ไม่มี WebGL = ภาพ 2D
- "รีเซ็ตชุด" (ข้างปุ่มบันทึก) = ทิ้งการแต่งที่ยังไม่บันทึก · ปุ่ม ⌖ ใต้ viewer = รีเซ็ตมุมกล้องเท่านั้น (ไม่แตะชุด)

## 4.3 PWA
- GLB + three.js อยู่ในแคช `eq-avatar3d` (cache-first, ชื่อไฟล์มี hash) · API ไม่แคช (กันข้อมูลชุด/Coin เก่า)
- เปิดแอปตอนออฟไลน์: แสดง "ยังเชื่อมต่อไม่ได้" และ **ไม่ออกจากระบบ** (เดิม token ถูกลบเมื่อ /auth/me ล้มเพราะเน็ต) · กลับมาออนไลน์แล้วโหลดต่อเอง

## 5. เพิ่ม item 3D ใหม่
1. เขียน builder ใน `items_wear.py`/`items_head.py` (ใช้แพตเทิร์นใน `garments.py`) แล้วเพิ่มใน `registry.py` ด้วย `itemId` ของแคตตาล็อก (ราคา/ร้าน/inventory เดิม) — เสื้อผ้า skin อัตโนมัติด้วยการโอน weight จากผิว base ส่วนเดียวกัน · ของแข็งใส่ `rigid=<bone>`
2. `bpyenv/bin/python scripts/avatar3d/blender/build_avatar3d.py <out> NEW_ASSET` → ดู `FAILED` / `VALIDATION` ใน log (ต้องว่าง) + QA render
3. `node scripts/avatar3d/optimize.mjs <out> --merge` → `node scripts/avatar3d/audit.mjs` → deploy (เซิร์ฟเวอร์ sync `avatar_items.model` เอง)

## 6. Public Profile + Privacy
- หน้า `#/user/:userId` เปิดได้จากชื่อ/รูปใน เพื่อน · Leaderboard · Ranked (ผลการแข่งกับผู้เล่นจริง) · `GET /api/profile/:userId` (rate limit 120/นาที)
- ตั้งค่าที่ โปรไฟล์ → ความเป็นส่วนตัว (`GET/PUT /api/privacy`) · ตาราง `user_privacy_settings` (migration 049) · ไม่มีแถว = ค่าเริ่มต้นใน `config/privacy.js`
- ระดับ: private / friends / public ต่อ field: profile · avatar · level · rank · achievements (ค่าเริ่มต้น friends) · stats · vocab · grammar · toeic · coins · inventory · friends (ค่าเริ่มต้น private) + allowFriendRequests · discoverable
- ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ทีละ field (`services/privacy.js`): ผู้ชมจาก token เท่านั้น · field ที่ไม่ได้รับอนุญาตไม่ถูกอ่านจาก DB เลย · ตอบกลับเฉพาะ `fields` ที่อนุญาต + รายชื่อ `hidden`
- ถูกเจ้าของบล็อก → 404 (ไม่เปิดเผยว่าถูกบล็อก) · เราบล็อกเขา → ไม่แสดงข้อมูล มีปุ่มปลดบล็อก · Ranked ไม่จับคู่ผู้ใช้ที่บล็อกกัน (เดิม)
- ไม่ส่งเลย: email · เบอร์ · วันเกิด · ที่อยู่ · รายการ Coin · ประวัติคำตอบรายข้อ · รายละเอียดการซื้อ
- discoverable = false → ไม่ปรากฏในการค้นหาเพื่อน · allowFriendRequests = false → `403 REQUESTS_CLOSED`

## 7. v2 — แก้ Rig แขน/เสื้อซ้อน + ออกแบบชุดใหม่ทั้งหมด (ยังอยู่ใน v1.8.0)

### 7.1 สาเหตุบั๊กแขนกับเสื้อซ้อนกันตอนยกแขน/โบกมือ (หาจากการวัดจริงใน Blender)
1. **Skin weight ของ base คิดจากระยะ (1/d⁴)** → ผิวรักแร้/ไหล่ได้ weight ของ Chest ~50% · พอยกแขน ผิวช่วงนั้นถูกดึงครึ่งทาง (ยุบ/ยืดผิดรูป)
2. **เสื้อผ้าคำนวณ weight ของตัวเองแยกจากผิว** → ผ้ากับผิวที่อยู่ติดกันขยับคนละแบบ ผิวจึงโผล่ทะลุแขนเสื้อเมื่อยกแขน
3. **ท่ายกแขน 150°** ทำให้แขนทะลุเข้าไปในหัว (หัวใหญ่แบบ chibi)
4. **แขนเสื้อเป็น capsule ช่วงยาวช่วงเดียว** (ไม่มี edge loop ที่ข้อพับ) → พับแล้วเป็นรูที่ข้อศอก/เข่า
5. **ยอดไหล่ของ base (capsule ต้นแขน) สูงกว่าผิวเสื้อ 1–2 ซม.** → เห็นผิวเป็นจุด ๆ บนไหล่แม้ยืนเฉย (วัดได้ 9% ของผิวต้นแขน)

### 7.2 สิ่งที่แก้
- **Chain weights**: ผิวแต่ละส่วนผูกกับ bone ของตัวเอง ผสมกับ bone แม่เฉพาะช่วงแคบรอบข้อต่อ (`JOINT_ZONE`) · สูงสุด 3 bone ต่อ vertex
- **Weight transfer**: เสื้อผ้า "ลอก" weight จากผิว base ส่วนเดียวกัน (แขน/ขา/ลำตัว/สะโพก) → ผ้ากับผิวขยับด้วยกัน · ลำตัวเสื้อผสม weight แขนที่ไหล่ · กระโปรง 55% สะโพก + 45% Hips (ไม่ยืดตามขา)
- **Edge loops** ทุกท่อ (แขนเสื้อ ขากางเกง แขน/ขา base) ถี่ 1.2–2.2 ซม. → พับข้อศอก/เข่าได้ไม่เป็นรู
- **Body mask**: ส่วนของ base ที่เสื้อผ้าปิดมิด (ตรวจด้วย ray จากผิว) ถูกซ่อนตอนสวม → ผิวโผล่ทะลุไม่ได้ · ถอดชิ้นออกแสดงกลับ (ไม่ได้ซ่อนแขน — แขนที่ไม่ได้ถูกปิดยังแสดงและขยับตามปกติ)
- ยอดไหล่ base ต่ำลง 1.4 ซม. · เท้า (ถุงเท้า) เล็กลงเล็กน้อย · กางเกงขาสั้น/กางเกงชายหาดซ่อนกางเกงซับในของ base · รองเท้าหุ้มเท้าซ่อนเท้า base · เสื้อกล้ามใส่ "ผิว" ใต้เสื้อแทนเสื้อยืดขาวของ base
- ท่ายกแขนสูงสุด 125° · ปอยผมยาว/เปียย้ายไปหน้า-หลังไหล่ (เว้นช่องให้แขนยกผ่าน)
- **หมวกทรงครอบ**: ระนาบขอบหมวก (fit จากจุดต่ำสุดของทรงหมวก 24 มุม รองรับหมวกเอียง) → runtime ตัดผม/ก้านหูฟังส่วนที่อยู่ในหมวก (clipping plane ที่ขยับตามกระดูก Head ทุกเฟรม) — ผมฟู/มวย/ผมชี้ไม่ทะลุหมวก ทุกทรงผมใส่กับทุกหมวกได้

### 7.3 ด่านตรวจ Asset (Validation Gate) — ใน Blender ทุกครั้งที่ build
ทุกชิ้นที่ใส่บนตัว × 11 คลิป × 1–8 เฟรม (รวม ~35 ท่า):
| ตรวจ | วิธี | เกณฑ์ |
|---|---|---|
| ผิวโผล่ระหว่างขยับ | ผิวที่ชิ้นนี้ปิดตอนยืน (ลึกจากขอบ ≥ 1.5 ซม.) แล้ว ray ออกไม่โดนผ้า | ≤ 2% |
| ผิวทะลุผ้า | ผิวอยู่ "หน้า" ผิวด้านนอกของผ้าที่ใกล้ที่สุด (ไม่นับจุดที่อยู่ในร่างกายส่วนอื่น) | ≤ 5% (ปรับจากภาพ: บั๊กไหล่ที่เห็นชัด = 9%) |
| ของติดตัวจมในร่างกาย | vertex ลึกกว่า 4 มม. ใต้ผิว base | ≤ 5% |
| แขน/มือจมในผม/หมวก/หูฟัง | จุดของแขนอยู่ในเนื้อชิ้น | ≤ 2% |
| แขนทะลุหัว/ลำตัว | ellipsoid หัว + capsule ลำตัว | หัว 0 จุด · ลำตัว ≤ 5 |
ชิ้นที่ไม่ผ่าน → `optimize.mjs` ตั้ง `active: false` (ไม่เปิดขายแบบ 3D) · ผลอยู่ใน `models.json` → `validation` และ `docs/AVATAR_ASSET_AUDIT.md`

### 7.4 ความเข้ากันได้ระหว่างชิ้น (Compatibility)
- ตรวจเรขาคณิตจริงทุกคู่: หมวก×ผม · หมวก×หูฟัง · หูฟัง×ผม · ผ้าคลุม×เสื้อคลุม → `models.json` `compat: [{with, reason}]`
- ผลปัจจุบัน: **ไม่มีคู่ที่ชนกัน** หลังใช้ระนาบตัดผมใต้หมวก (เกณฑ์ ray เดิมแจ้งเตือนเกินจริง — ตรวจด้วยภาพ QA ทุกคู่หมวก×ผมแล้ว)
- กติกาที่ยังบังคับ: หมวก ↔ หูฟัง (ภาพ 2D ซ้อนกันไม่ได้)
- `services/avatar conflictsWith()` + ฝั่งหน้าเว็บ `conflictsOf()` ใช้กติกาเดียวกัน: สวมชิ้นใหม่ → ถอดชิ้นที่ชนออก (ทรงผมเปลี่ยนเป็นทรงสั้น) พร้อมบอกเหตุผล · `validateOutfit` ปฏิเสธชุดที่ชนกัน · การ์ดในร้านแสดงสถานะ "จะถอด … · เหตุผล"

### 7.5 วัสดุผ้า (PBR)
- MeshStandardMaterial (สี · roughness · metalness) + **normal map ลายผ้า 12 แบบ** สร้างด้วยโค้ด (weave · canvas · twill · knit · rib · corduroy · leather · fleece · tread · mesh · straw · quilt) — สูตรเดียวกันใน Blender (ภาพย่อ) และ runtime (DataTexture 128² ต่อแบบ แชร์ทุกชิ้น)
- UV แบบฉาย 3 แกนตามความถี่ลายของผ้า เก็บย่อ ÷64 (quantize 12 บิต) · runtime repeat 64
- ไม่มี texture สีเฉพาะชิ้น (ไม่ได้วาด/สแกนลายผ้าจริง) · เครื่องช้าระดับต่ำสุดปิด normal map อัตโนมัติ

### 7.6 Animation Preview
ปุ่มใต้ viewer (หน้าแต่งตัว + ร้านค้า): โบกมือ · ยกแขน · หมุนตัว · เดิน · ดีใจ — คลิปเดียวกับที่ใช้ตรวจ · ซ่อนเมื่อผู้ใช้ตั้ง "ลดการเคลื่อนไหว"

## 8. ทรงผม v3 (Premium Stylized) + ของ Halloween 2026
- **เดิม:** ทรงผม = shell ทรงรี + ellipsoid/capsule/cone วางต่อกัน (มวย = ลูกบอล · เปีย = sphere เรียง · ผมชี้ = กรวยบนหมวกครึ่งวงกลม)
- **ใหม่ (`hair.py` + `hair_styles.py`):** ทุกทรง (10 ทรง) สร้างจาก "ช่อผม" (clump) ที่เดินตามผิวศีรษะจากรากผมตามทิศไหลของผม แล้วร่วงตามแรงโน้มถ่วง
  · หน้าตัดเลนส์แบน กว้างที่ราก เรียวที่ปลาย · ชั้นในปิดช่องว่าง (ผมยาว/บ๊อบ) · หน้าม้า/ปอยข้างแยกช่อ
  · **Sculpt pass:** รวมหนังศีรษะ + ช่อผม → Voxel Remesh (2.4–2.6 มม.) → Laplacian smooth → Decimate ตามงบ (= retopology อัตโนมัติ) → ผิวต่อเนื่อง ไม่มีชิ้นลอย/ช่อทะลุกัน/รอยต่อกับหนังศีรษะ
  · **Twin Buns:** ช่อผมไหลจากทุกทิศเข้าหามวย · มวย = ช่อผม 2 เส้นบิดเกลียวพันขด 2.4 รอบ (ไม่กลมเป๊ะ) · ยางรัด
  · **Side Braid:** ผมกวาดไปรวมใต้หูขวา (ผมหลังกวาดผ่านท้ายทอยก่อน) → เปีย 3 เส้นถักสลับจริง (สูตร x = sin(φ), y = sin(2φ)) เรียวลง → ยางรัด → ปลายผมบาน
  · **Spiky:** ช่อผมก้อนใหญ่แบน 3 ชั้น โค้งขึ้นแล้วชี้ไปหลัง ความหนาต่างกัน ฐานหลอมกับหนังศีรษะ
  · **วัสดุ:** normal map ลายเส้นผม ('hair') ตามทิศไหล (UV meridian รอบศีรษะ) · เปีย/มวย UV ตามแนวช่อ (`eq_uvmode keep`)
  · ตรวจ 360°: `EQ_TURNTABLE=1` → `<out>/turntable/<asset>_000…300.png` · `EQ_CLOSEUP="z,scale,yaw"` ภาพใกล้ 512px
- **Halloween Costume Festival 2026 (`items_halloween.py`):** 11 โมเดล — Pumpkin Hat (ไหมพรมกลีบฟักทอง + หน้าแจ็กโอแลนเทิร์น + ก้านบิดหลอมด้วย remesh) · Bat Wings (พังผืดขอบเว้า + กระดูกปีก) · Ghost Hoodie · Witch Hat (กรวยงอปลาย + ปีกเป็นลอน + หัวเข็มขัด) · Halloween Boots · Pumpkin Backpack · Midnight Coat/Pants/Moon Pendant · Candy Corn Necklace · Bat Glasses + พื้นหลัง 2D — ผ่านด่านตรวจ 11 ท่าเหมือนทุกชิ้น
- **ด่านตรวจใหม่:** "แขนจมในชิ้น" (แขน/มือเข้าไปในผม/หมวก/หูฟัง ≤ 2%) — เจอผมยาวขวางแขนตอนท่า Victory 2.9% → ย้ายปอยผมไปหน้า/หลังไหล่

## 9. Style v3 "หัวโตตัวเล็ก" (เปลี่ยนสไตล์ตัวละครทั้งชุด · ยังอยู่ใน v1.8.0)
สไตล์ต้นฉบับของ EnglishQuest: หัวกลมใหญ่ ตัวสั้นป้อม มือกลมไม่มีนิ้ว ผมเป็นก้อนปั้นผิวเรียบ ผิวผ้าเรียบสะอาด
(ไม่ลอกแบบตัวละคร/ระบบ Avatar ของแบรนด์อื่น)

**สัดส่วน — `eqlib.STYLE` + `style_warp()`**
- ทุกชิ้น (ร่างกาย 141 ชิ้นของตกแต่ง ผม หมวก ฯลฯ) ยังปั้นใน "พิกัดต้นแบบ" (`BONES_SRC`, `HEAD_C`/`HEAD_R`) แล้ว
  `skin()` เรียก `warp_object()` แปลงเป็นสัดส่วนจริงก่อนผูกกระดูก — ฟิลด์เดียวกันกับร่างกาย → ของทุกชิ้นยังพอดีตัว
  · ลำตัว/แขน/ขา: กว้าง ×0.86 · สูง ×0.84 · หัว + ของบนหัว: ขยายสม่ำเสมอ ×1.17 รอบจุดคอ · ช่วงคอ (z 0.555–0.625 ต้นแบบ) ผสมนุ่ม
  · ของที่ติดหัวทั้งชิ้น (rigid Head/Eye) ใช้การขยายหัวล้วน · ผมยาวที่ห้อยต่ำกว่าคอ: ความยาวย่อตามลำตัว ความกว้างค่อย ๆ กลับเป็นสัดส่วนลำตัว
  · โครงกระดูก (`BONES`) = แปลงจาก `BONES_SRC` ด้วยฟังก์ชันเดียวกัน (ชื่อ bone/socket เดิม — runtime ไม่ต้องแก้)
  · ด่านตรวจใช้ `HEAD_C_W`/`HEAD_R_W` และค่าระยะที่คูณสัดส่วนแล้ว
- มือ: ทรงกลมแป้น (ไม่มีนิ้วโป้ง) · ถุงมือ/กำไลปรับให้ครอบมือกลม
- ท่าโบกมือ: ต้นแขน 114° · ศอก 6–26° (หัวใหญ่ขึ้น มือไม่เข้าหัว) · ท่าอื่นเดิม (ผ่านด่านตรวจ arm-in-head = 0 ทุกเฟรม)
- ผ้า: ความเข้มลายผ้า (normal map) ×0.6 — ผิวเรียบสะอาด ยังเห็นเนื้อผ้าเมื่อซูม

**ทรงผม — `hair_sculpt.py` (แทน `hair_styles.py` ที่เป็นระบบช่อผมรุ่นก่อน เก็บไว้อ้างอิง)**
- หมวกผม (`cap`): ผิวที่งอกจากผิวศีรษะตามสนามความหนา · ขอบไรผม/หน้าม้าตัดด้วยฟังก์ชันขอบ (bisect → ขอบเรียบ) · ขอบหนาเห็นเป็นขอบผม
  · ร่องผมกว้างตื้นวิ่งออกจากขวัญ/แสก/จุดรวบผม (`grooves`) · ก้อนผมนูนสลับ (`locks`)
- ม่านผม (`curtain`): ผมที่ห้อยใต้ศีรษะ (บ๊อบ/ยาว/ลอน) — แนบหัวช่วงบน ห้อยตรง · ด้านข้างค่อย ๆ รวบไปหลังไหล่ (`gather`)
  เว้นทางแขนที่ยกขึ้นด้านข้าง · นูนรอบใบหู · ร่องแนวตั้ง · ปลายงุ้ม/บาน/ลอน
- มวย (`knot`): ก้อนแป้นไม่กลมเป๊ะ มีร่องพันก้นหอยจากโคนขึ้นยอด · ผมบนหัววิ่งร่องเข้าหามวย · ยางรัดที่โคน
- หางม้า: โคนพองแล้วเรียวโค้ง S · ผมชี้: ก้อนเปลวโค้งไปหลัง ปลายมน (ความกว้างหันตามแนวรอบศีรษะ) · เปีย: ถักสามเส้นสลับจริง
- Sculpt pass: `hair.fuse` (voxel remesh 2.6–3.4 มม. → smooth → decimate ตามงบ)
