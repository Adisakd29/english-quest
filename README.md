# 🦊 WordQuest — ผจญภัยคำศัพท์ภาษาอังกฤษ

เว็บแอปเกมเรียนคำศัพท์ภาษาอังกฤษจาก **Oxford 3000** (3,308 คำ ระดับ A1–B2)
มีระบบสมัครสมาชิก/เข้าสู่ระบบ, โหมด Flashcard เลือกระดับได้, ระบบสะสม EXP
และเลเวลอัป โดยข้อมูลผู้ใช้ทั้งหมดเก็บอยู่ใน PostgreSQL **จะไม่หายแม้อัปเดตโค้ดใหม่**

---

## 1. โครงสร้างโปรเจกต์

```
english-quest/
├── server.js              จุดเริ่มต้นเซิร์ฟเวอร์ (รัน migration ให้อัตโนมัติทุกครั้งที่บูต)
├── config/db.js            การเชื่อมต่อ PostgreSQL
├── db/schema.sql            โครงสร้างตาราง (CREATE TABLE IF NOT EXISTS — รันซ้ำได้อย่างปลอดภัย)
├── routes/                  API: auth, words, progress
├── middleware/auth.js        ตรวจสอบ JWT token
├── utils/leveling.js         สูตรคำนวณ EXP/Level
├── data/words.json           คำศัพท์ทั้งหมด 3,308 คำ แยกตามระดับ A1/A2/B1/B2
└── public/                   หน้าเว็บ (HTML/CSS/JS ธรรมดา ไม่ต้อง build)
```

**สถาปัตยกรรมสำคัญ:** เซิร์ฟเวอร์ Node.js ตัวเดียวเสิร์ฟทั้ง API และหน้าเว็บ
ส่วนข้อมูลผู้ใช้ทั้งหมดเก็บแยกอยู่ใน **PostgreSQL** ซึ่งบน Railway จะเป็น
"plugin" แยกที่มี volume ของตัวเอง — เวลาคุณ push โค้ดใหม่แล้ว Railway
build/deploy เซิร์ฟเวอร์ใหม่ ตัวฐานข้อมูลจะ **ไม่ถูกแตะต้อง** ข้อมูล
ผู้ใช้และ EXP จึงไม่หาย (ตราบใดที่ไม่ไปลบ Postgres service ทิ้งเอง)

---

## 2. รันทดสอบในเครื่องตัวเอง (ไม่บังคับ แต่แนะนำก่อน deploy)

ต้องมี Node.js ≥ 18 และ PostgreSQL ติดตั้งในเครื่อง (หรือใช้ Docker)

```bash
cd english-quest
npm install
cp .env.example .env
# แก้ไฟล์ .env ให้ DATABASE_URL ชี้ไปที่ Postgres ในเครื่องคุณ
npm start
```

เปิดเบราว์เซอร์ไปที่ `http://localhost:3000`

---

## 3. Deploy ขึ้น Railway ผ่าน GitHub (วิธีหลัก)

### ขั้นที่ 1 — อัปโหลดโค้ดขึ้น GitHub

```bash
cd english-quest
git init
git add .
git commit -m "WordQuest: เกมเรียนคำศัพท์ภาษาอังกฤษ"
```

ไปสร้าง repository ใหม่บน https://github.com/new (ตั้งเป็น public หรือ private ก็ได้)
แล้วรันคำสั่งที่ GitHub บอกให้รัน ตัวอย่าง:

```bash
git remote add origin https://github.com/<ชื่อคุณ>/english-quest.git
git branch -M main
git push -u origin main
```

> ⚠️ ไฟล์ `.env` จะไม่ถูกอัปโหลดขึ้น GitHub เพราะอยู่ใน `.gitignore` แล้ว
> (เป็นเรื่องดี เพราะมี secret อยู่ในนั้น) ส่วนตัวแปรจริงให้ไปตั้งบน Railway แทน

### ขั้นที่ 2 — สร้างโปรเจกต์บน Railway

1. ไปที่ https://railway.app แล้วล็อกอินด้วย GitHub
2. กด **New Project → Deploy from GitHub repo** แล้วเลือก repo `english-quest`
3. Railway จะตรวจพบว่าเป็นโปรเจกต์ Node.js เอง (เห็น `package.json` ที่มี
   `"start": "node server.js"`) และเริ่ม build/deploy ให้อัตโนมัติ

### ขั้นที่ 3 — เพิ่ม PostgreSQL (สำคัญที่สุด เพื่อให้ข้อมูลไม่หาย)

1. ในหน้าโปรเจกต์เดียวกันบน Railway กด **+ New → Database → Add PostgreSQL**
2. Railway จะสร้างตัวแปร `DATABASE_URL` ให้อัตโนมัติ และ "แชร์" เข้าไปยัง
   service ของแอปเราโดยอัตโนมัติผ่านระบบ Variable Reference
   (ถ้าไม่ขึ้นอัตโนมัติ ให้ไปที่ service ของแอป → tab **Variables** →
   เพิ่มตัวแปร `DATABASE_URL` แล้วอ้างอิงจากตัว Postgres plugin)

### ขั้นที่ 4 — ตั้งค่าตัวแปรที่เหลือ

ไปที่ service ของแอป (ไม่ใช่ตัว Postgres) → tab **Variables** แล้วเพิ่ม:

| ชื่อตัวแปร | ค่า |
|---|---|
| `JWT_SECRET` | ข้อความสุ่มยาว ๆ ของคุณเอง (เช่นใช้ `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |

ไม่ต้องตั้ง `PORT` เอง — Railway จะกำหนดให้อัตโนมัติ และ `server.js`
อ่านจาก `process.env.PORT` อยู่แล้ว

### ขั้นที่ 5 — เสร็จแล้ว!

Railway จะให้ URL สาธารณะมา (กดที่ tab **Settings → Networking → Generate Domain**
ถ้ายังไม่มี) เปิดลิงก์นั้นแล้วทดสอบสมัครสมาชิก/เล่นได้เลย

---

## 4. อัปเดตโค้ดในอนาคต (ข้อมูลจะไม่หาย)

ทุกครั้งที่แก้โค้ดแล้วอยากอัปเดตเว็บ แค่:

```bash
git add .
git commit -m "อธิบายสิ่งที่แก้"
git push
```

Railway จะ deploy เวอร์ชันใหม่ให้อัตโนมัติ (เพราะเชื่อมกับ GitHub ไว้แล้ว)
**ฐานข้อมูล PostgreSQL เป็น service แยก ไม่ได้ถูกสร้างใหม่ทุกครั้งที่ deploy**
ผู้ใช้, EXP, เลเวล, และความก้าวหน้าของคำศัพท์ทั้งหมดจะยังอยู่เหมือนเดิม

ถ้าคุณแก้โครงสร้างตาราง (เช่นเพิ่มคอลัมน์ใหม่) ให้ไปแก้ที่ `db/schema.sql`
โดยใช้ `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` หรือเพิ่ม `CREATE TABLE IF NOT EXISTS`
ใหม่ต่อท้ายไฟล์ — ระบบจะรันให้อัตโนมัติทุกครั้งที่เซิร์ฟเวอร์บูตขึ้นมาใหม่
แบบปลอดภัย (ไม่ลบข้อมูลเดิม)

---

## 5. ระบบ EXP / Level ทำงานอย่างไร

- ตอบ "รู้แล้ว" ครั้งแรกของคำนั้น → **+15 EXP**
- ตอบ "รู้แล้ว" ซ้ำ (ทบทวน) → **+10 EXP**
- ตอบ "ยังไม่รู้" → **+3 EXP** (ให้กำลังใจที่พยายาม)
- เลเวล 1→2 ใช้ 80 EXP, เลเวล 2→3 ใช้ 100 EXP, เพิ่มอีก 20 EXP ทุกเลเวล
  (ปรับตัวเลขได้ที่ `utils/leveling.js`)

## 6. แนวทางต่อยอด (ถ้าอยากทำเพิ่ม)

- เพิ่มโหมดเกมอื่น (เลือกคำตอบหลายตัวเลือก, จับคู่คำ, แต่งประโยค)
- เพิ่มคำแปลภาษาไทยให้แต่ละคำ (ไฟล์ปัจจุบันมีแต่คำอังกฤษ + part of speech
  ตามต้นฉบับ Oxford 3000 ที่ "ยังไม่แปล")
- เพิ่มระบบ leaderboard เปรียบเทียบ EXP กับผู้เล่นคนอื่น
- เพิ่ม avatar ให้เลือกได้หลายแบบ

---

มีคำถามหรือเจอบั๊กตรงไหน บอกได้เลยครับ 🦊
