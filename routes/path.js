const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const wordStore = require('../utils/wordStore');
const curriculum = require('../utils/curriculum');
const { getAllTopics } = require('../utils/vocabContent');

const router = express.Router();
router.use(authRequired);

/*
  Units สร้างจากหัวข้อใน DB (แอดมินแก้แล้วมีผล) และ cache ไว้ 60 วินาที
  เพราะเหมือนกันสำหรับทุกคน — ส่วนที่ต่างกันต่อคนคือความก้าวหน้า (คำนวณทุกครั้ง)
*/
const CACHE_MS = 60 * 1000;
let unitsCache = null;
let unitsCachedAt = 0;

async function getUnits() {
  if (unitsCache && Date.now() - unitsCachedAt < CACHE_MS) return unitsCache;
  await wordStore.ready();
  const topicById = await getAllTopics(); // จากฐาน Oxford หรือชุดเดิม ตามแหล่งที่ใช้อยู่

  const words = [];
  for (const level of curriculum.LEVELS) {
    for (const w of wordStore.getLevelWords(level)) {
      if (!curriculum.CONTENT_CATEGORIES.has(w.category)) continue;
      // จัด Unit จากคำที่ "ฝึกได้จริง" เท่านั้น (คำแปลรอตรวจไม่นับ) — ทุก Unit จึงมีคำพอสร้างโจทย์ (>= 8)
      // คำที่ตรวจคำแปลแล้วจะถูกจัดเข้า Unit เองเมื่อ cache หมดอายุ (ความคืบหน้าเก็บรายคำ จึงไม่หาย)
      if (!wordStore.isPlayable(w.id)) continue;
      const topic = topicById.get(w.id) || curriculum.topicFor(w.category, null);
      words.push({ id: w.id, level, category: w.category, topic });
    }
  }
  unitsCache = curriculum.buildUnits(words);
  unitsCachedAt = Date.now();
  return unitsCache;
}

// ระดับที่แบบทดสอบวัดระดับล่าสุดแนะนำ (ถ้ามี) — ใช้ปลดล็อกระดับที่ต่ำกว่า
async function getPlacementStart(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT result->>'recommendedStart' AS start FROM placement_attempts
        WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`,
      [userId]
    );
    return rows[0] && curriculum.LEVELS.includes(rows[0].start) ? rows[0].start : null;
  } catch (_err) {
    return null; // ยังไม่มีตาราง/ผลวัดระดับ
  }
}

// ผล Unit Test/Boss ที่ผ่านแล้วของผู้ใช้
async function getPassed(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT kind, ref FROM assessments WHERE user_id = $1 AND passed = TRUE`, [userId]
    );
    return {
      units: new Set(rows.filter((r) => r.kind === 'unit').map((r) => r.ref)),
      bosses: new Set(rows.filter((r) => r.kind === 'boss').map((r) => r.ref)),
    };
  } catch (_err) {
    return { units: new Set(), bosses: new Set() }; // ยังไม่มีตาราง assessments
  }
}

/*
  สถานะ Learning Path ของผู้ใช้ — จุดเดียวที่คำนวณการปลดล็อก
  ใช้ร่วมกันทั้ง /path, /path/units/:id และระบบสอบ (กันกฎปลดล็อกแยกกันหลายที่)
*/
// mode: 'read' (ค่าเริ่มต้น — word_progress) | 'listening' (listening_progress) — ความคืบหน้าแยกกัน
// Unit Test / Boss และผลวัดระดับใช้ร่วมกันทั้งสองโหมด
const progressTable = (mode) => (mode === 'listening' ? 'listening_progress' : 'word_progress');
const modeOf = (req) => (req.query.mode === 'listening' ? 'listening' : 'read');

async function getUserPathState(userId, mode = 'read') {
  const units = await getUnits();
  const known = await pool.query(
    `SELECT word_id FROM ${progressTable(mode)} WHERE user_id = $1 AND status = 'known'`, [userId]
  );
  const [placementStart, passed] = await Promise.all([getPlacementStart(userId), getPassed(userId)]);
  const levels = curriculum.computePathState(
    units, new Set(known.rows.map((r) => r.word_id)), placementStart, passed
  );
  return { units, levels, placementStart };
}

// ให้แอดมินล้าง cache หลังแก้หัวข้อ เพื่อเห็นผลทันที
function invalidateUnits() { unitsCache = null; }

const TOPIC_META = Object.fromEntries(curriculum.TOPICS.map((t) => [t.id, t]));
TOPIC_META.mixed = { id: 'mixed', th: 'คำศัพท์เพิ่มเติม', en: 'More Words', icon: 'package' };

function unitTitle(u) {
  const t = TOPIC_META[u.topic] || { th: u.topic, en: u.topic, icon: 'book' };
  const suffix = u.parts > 1 ? ` ${u.part}` : '';
  return { title: `${t.th}${suffix}`, subtitle: `${t.en}${suffix}`, icon: t.icon };
}

/* ==========================================================
   GET /path — Learning Path ทั้งหมดพร้อมความก้าวหน้าของผู้ใช้
   ========================================================== */
router.get('/', async (req, res) => {
  try {
    const mode = modeOf(req);
    const { levels, placementStart } = await getUserPathState(req.userId, mode);
    const next = curriculum.nextUnit(levels);

    // ไม่ส่ง wordIds ของทุก Unit ออกไป (ลดขนาด) — ดึงทีละ Unit ผ่าน /path/units/:id
    const slim = levels.map((lv) => ({
      ...lv,
      units: lv.units.map((u) => ({
        id: u.id, topic: u.topic, ...unitTitle(u),
        known: u.known, total: u.total, status: u.status, testPassed: u.testPassed,
      })),
    }));

    res.json({
      mode,
      levels: slim,
      next: next ? { id: next.id, level: next.level, ...unitTitle(next) } : null,
      placementStart,
      rules: { unitComplete: curriculum.UNIT_COMPLETE, levelUnlock: curriculum.LEVEL_UNLOCK },
    });
  } catch (err) {
    console.error('[path]', err);
    res.status(500).json({ error: 'โหลด Learning Path ไม่สำเร็จ' });
  }
});

/* ==========================================================
   GET /path/units/:id — คำใน Unit (ใช้เริ่มรอบฝึก) — ห้ามเปิด Unit ที่ยังล็อก
   ========================================================== */
router.get('/units/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[A-C][12]-[a-z]+-\d+$/.test(id)) return res.status(400).json({ error: 'รหัส Unit ไม่ถูกต้อง' });

    const { units, levels } = await getUserPathState(req.userId, modeOf(req));
    const level = id.slice(0, 2);
    const unit = (units[level] || []).find((u) => u.id === id);
    if (!unit) return res.status(404).json({ error: 'ไม่พบ Unit นี้' });
    const state = levels.find((l) => l.level === level).units.find((u) => u.id === id);
    // โหมด "สำรวจอิสระ" (?explore=1): เปิด Unit ที่ยังล็อกเพื่อ "เรียน" ได้ — ไม่ล็อกเนื้อหาแรงเกินไป
    // กฎ EXP เดิมทุกข้อยังใช้ (ต่อคำ/วัน/เพดาน) · Unit Test และ Boss ยังต้องผ่านเกณฑ์ตามลำดับ (routes/assessments.js)
    const explore = req.query.explore === '1';
    if (state.status === 'locked' && !explore) {
      return res.status(403).json({ error: 'Unit นี้ยังล็อกอยู่ ผ่าน Unit ก่อนหน้าก่อน หรือเปิดโหมดสำรวจอิสระ', code: 'UNIT_LOCKED' });
    }

    res.json({ id: unit.id, level: unit.level, ...unitTitle(unit), wordIds: unit.wordIds, status: state.status,
      explored: state.status === 'locked' });
  } catch (err) {
    console.error('[path/unit]', err);
    res.status(500).json({ error: 'โหลด Unit ไม่สำเร็จ' });
  }
});

module.exports = router;
module.exports.invalidateUnits = invalidateUnits;
module.exports.getUserPathState = getUserPathState;
module.exports.unitTitle = unitTitle;
