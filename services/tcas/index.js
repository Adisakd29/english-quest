/*
  v1.19.0 ติวสอบ TCAS — TGAT1 การสื่อสารภาษาอังกฤษ / A-Level ภาษาอังกฤษ
  ข้อสอบต้นฉบับของ EnglishQuest ตามรูปแบบ blueprint TCAS70 (data/tcas/<exam>/<SETID>.json · docs/tcas/CONTENT_SPEC.md)

  - โหลดเฉพาะชุดที่ "ผ่านการตรวจ" แล้ว (set.review.passed === true) และผ่านตัวตรวจโครงสร้าง (scripts/tcas/validate.js)
  - ผู้ดูแลซ่อนข้อได้ (tcas_item_state.hidden) — ข้อที่ซ่อนไม่ถูกนำมาใช้/คิดคะแนน
  - โหมด
      mock     สอบจำลองจับเวลา (TGAT1 60 นาที / A-Level 90 นาที) · เปลี่ยนคำตอบได้จนส่ง · เฉลยหลังส่ง · คะแนนเต็ม 100 ตามน้ำหนักแต่ละส่วน
      practice ฝึกทีละส่วน · เฉลย+คำอธิบายทันที · EXP ข้อละครั้ง (ตรวจจังหวะตอบ: utils/answerPace)
  - ไม่ส่งเฉลย/คำอธิบายก่อนตอบ (practice) หรือก่อนส่ง (mock)
*/
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../../config/db');
const { grantOnce } = require('../../utils/exp');
const { validateSet } = require('../../scripts/tcas/validate');

class TcasError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'tcas');
const EXAMS = {
  tgat1: {
    name: 'TGAT1', titleTh: 'TGAT1 การสื่อสารภาษาอังกฤษ', minutes: 60,
    sections: [
      { id: 'speaking', th: 'Speaking (การพูดสื่อสาร)', points: 50 },
      { id: 'reading', th: 'Reading (การอ่าน)', points: 50 },
    ],
  },
  alevel: {
    name: 'A-Level', titleTh: 'A-Level ภาษาอังกฤษ', minutes: 90,
    sections: [
      { id: 'listening_speaking', th: 'Listening & Speaking (บทสนทนา)', points: 25 },
      { id: 'reading', th: 'Reading (การอ่าน)', points: 50 },
      { id: 'writing', th: 'Writing (การเขียน)', points: 25 },
    ],
  },
};
const TYPE_TH = {
  qr: 'ถาม–ตอบ', short_conv: 'บทสนทนาสั้น', long_conv: 'บทสนทนายาว', text_completion: 'เติมข้อความ', reading: 'อ่านจับใจความ',
  ad: 'โฆษณา/ประกาศ', review: 'รีวิว', news: 'ข่าว', visual: 'ตาราง/ข้อมูล', article: 'บทความ', paragraph_org: 'เรียงประโยคเป็นย่อหน้า',
};
const SKILL_TH = {
  functional_language: 'ภาษาเพื่อการสื่อสาร', social_response: 'การตอบโต้ในสถานการณ์', vocabulary: 'คำศัพท์', grammar: 'ไวยากรณ์', connector: 'คำเชื่อม',
  main_idea: 'ใจความสำคัญ', detail: 'รายละเอียด', inference: 'การอนุมาน', vocab_in_context: 'ความหมายจากบริบท', reference: 'การอ้างอิง',
  purpose_tone: 'จุดประสงค์/น้ำเสียง', data_reading: 'การอ่านข้อมูล', coherence: 'ความต่อเนื่องของข้อความ',
};
/* v1.19.2 EXP (ปรับขึ้นให้ใกล้โหมดแกรมม่า/C2 · ทุกคีย์ได้ครั้งเดียว กันปั๊ม)
   - ตอบถูกครั้งแรกของแต่ละข้อ (ฝึก หรือสอบจำลองแบบเฉลยทันที): ตามระดับชุด 10 / 14 / 18 · คีย์ tcq:<itemId> (อยู่ในการตรวจจังหวะตอบ)
   - ฝึกจบทั้งส่วนครั้งแรก +30 · ถูกทุกข้อในรอบนั้น +15 (คีย์ tcs / tcsp ต่อชุด+ส่วน)
   - สอบจำลองครั้งแรกของชุด (ตอบ ≥ ครึ่ง): 60 / 90 / 120 ตามระดับ · โบนัสคะแนน ≥60 +30 · ≥80 +50 (ครั้งเดียวต่อชุดต่อขั้น)
   - สอบจำลองแบบเฉลยตอนส่ง: ไม่มี EXP รายข้อระหว่างสอบ (กัน EXP บอกใบ้ว่าข้อไหนถูก) — ได้ EXP ส่ง+โบนัสคะแนน */
const EXP_ITEM = { 1: 10, 2: 14, 3: 18 };
const EXP_SECTION_DONE = 30;
const EXP_SECTION_PERFECT = 15;
const EXP_MOCK_FIRST = { 1: 60, 2: 90, 3: 120 };
const EXP_MOCK_BONUS = [[60, 30], [80, 50]];
const levelOfSet = (setId) => (load().sets.get(setId) || {}).level || 1;
const MOCK_GRACE_MS = 60 * 1000;

/* ---------------- โหลดข้อสอบ ---------------- */
let cache = null;
function load() {
  if (cache) return cache;
  const sets = new Map(); const items = new Map(); const problems = [];
  for (const exam of Object.keys(EXAMS)) {
    const dir = path.join(DATA_DIR, exam);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /^[A-Z0-9-]+\.json$/.test(x)).sort()) {
      let set;
      try { set = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { problems.push(`${f}: ${e.message}`); continue; }
      const errs = validateSet(set);
      if (errs.length) { problems.push(`${f}: ${errs.length} ปัญหาโครงสร้าง`); continue; }
      if (!(set.review && set.review.passed === true) && process.env.TCAS_SHOW_UNREVIEWED !== 'on') { problems.push(`${f}: ยังไม่ผ่านการตรวจ`); continue; }
      const groups = [];
      for (const sec of set.sections) {
        for (const g of sec.groups) {
          const grp = { ...g, section: sec.id, setId: set.setId };
          groups.push(grp);
          for (const it of g.items) items.set(it.id, { ...it, groupId: g.id, section: sec.id, type: g.type, setId: set.setId, exam: set.exam });
        }
      }
      sets.set(set.setId, { ...set, groups });
    }
  }
  if (problems.length) console.warn(`[tcas] ข้ามบางชุด: ${problems.join(' · ')}`);
  cache = { sets, items };
  return cache;
}
function _reload() { cache = null; return load(); }

async function hiddenIds() {
  const { rows } = await pool.query('SELECT item_id FROM tcas_item_state WHERE hidden');
  return new Set(rows.map((r) => r.item_id));
}
function getSet(setId) {
  const s = load().sets.get(String(setId));
  if (!s) throw new TcasError('NOT_FOUND', 'ไม่พบชุดข้อสอบนี้', 404);
  return s;
}

/* ---------------- ข้อมูลสาธารณะ (ไม่มีเฉลย) ---------------- */
function publicGroup(g, ids) {
  const items = g.items.filter((it) => ids.has(it.id));
  if (!items.length) return null;
  return {
    id: g.id, type: g.type, typeTh: TYPE_TH[g.type], section: g.section, instructionTh: g.instructionTh, title: g.title || null,
    dialogue: g.dialogue || null, text: g.text || null, table: g.table || null,
    items: items.map((it) => ({ id: it.id, blank: it.blank === undefined ? null : it.blank, stem: it.stem || '', options: it.options })),
  };
}
function reveal(it) {
  return { answer: it.answer, explanationTh: it.explanationTh, skill: it.skill, skillTh: SKILL_TH[it.skill] || it.skill };
}

/* ---------------- หน้ารวม ---------------- */
const LEVEL_TH = { 1: 'ระดับ 1 · มาตรฐาน', 2: 'ระดับ 2 · ท้าทาย', 3: 'ระดับ 3 · เข้มข้น' };
const LEVEL_READY_SCORE = 60;
async function hub(userId) {
  const { sets } = load();
  const hidden = await hiddenIds();
  const hist = (await pool.query(
    `SELECT set_id, mode, section, COUNT(*) FILTER (WHERE finished_at IS NOT NULL)::int AS done, MAX(score) AS best,
            MAX(id) FILTER (WHERE finished_at IS NULL) AS active_id
       FROM tcas_sessions WHERE user_id = $1 GROUP BY set_id, mode, section`, [userId])).rows;
  const practiced = (await pool.query(
    `SELECT item_id, BOOL_OR(correct) AS ok FROM answer_events WHERE user_id = $1 AND skill = 'tcas' GROUP BY item_id`, [userId])).rows;
  const okSet = new Set(practiced.filter((r) => r.ok).map((r) => r.item_id));
  const seenSet = new Set(practiced.map((r) => r.item_id));
  const exams = Object.entries(EXAMS).map(([id, ex]) => ({
    id, name: ex.name, titleTh: ex.titleTh, minutes: ex.minutes,
    sections: ex.sections.map((s) => ({ id: s.id, th: s.th, points: s.points })),
    // v1.19.2 เรียงจากง่ายไปยาก (ระดับ แล้วเลขชุด)
    sets: [...sets.values()].filter((s) => s.exam === id).sort((a, b) => (a.level - b.level) || a.setId.localeCompare(b.setId, 'en', { numeric: true })).map((s) => {
      const live = s.groups.flatMap((g) => g.items).filter((it) => !hidden.has(it.id));
      const mock = hist.filter((h) => h.set_id === s.setId && h.mode === 'mock');
      return {
        setId: s.setId, title: s.title, total: live.length, level: s.level, levelTh: LEVEL_TH[s.level] || '',
        exp: { item: EXP_ITEM[s.level] || EXP_ITEM[1], section: EXP_SECTION_DONE, mock: EXP_MOCK_FIRST[s.level] || EXP_MOCK_FIRST[1], bonus80: EXP_MOCK_BONUS.reduce((a2, b2) => a2 + b2[1], 0) },
        mock: { attempts: mock.reduce((a, h) => a + h.done, 0), best: mock.length && mock.some((h) => h.best !== null) ? Math.max(...mock.map((h) => Number(h.best) || 0)) : null,
          activeId: (mock.find((h) => h.active_id) || {}).active_id || null },
        sections: ex.sections.map((sec) => {
          const its = live.filter((it) => s.groups.find((g) => g.items.includes(it) && g.section === sec.id));
          const p = hist.find((h) => h.set_id === s.setId && h.mode === 'practice' && h.section === sec.id);
          return { id: sec.id, th: sec.th, total: its.length, seen: its.filter((it) => seenSet.has(it.id)).length,
            correct: its.filter((it) => okSet.has(it.id)).length, activeId: p && p.active_id ? p.active_id : null };
        }),
      };
    }),
  }));
  // แนะนำระดับถัดไป (ไม่ล็อก): สอบจำลองระดับก่อนหน้าได้ ≥ 60 แล้ว -> ชุดระดับถัดไปขึ้น "พร้อมแล้ว"
  for (const e of exams) {
    const best1 = Math.max(-1, ...e.sets.filter((x) => x.level === 1).map((x) => (x.mock.best === null ? -1 : x.mock.best)));
    const best2 = Math.max(-1, ...e.sets.filter((x) => x.level === 2).map((x) => (x.mock.best === null ? -1 : x.mock.best)));
    for (const x of e.sets) if (x.level > 1) x.ready = (x.level === 2 ? best1 : best2) >= LEVEL_READY_SCORE;
  }
  return { exams, levelReadyScore: LEVEL_READY_SCORE, note: 'ข้อสอบต้นฉบับของ EnglishQuest ตามรูปแบบ blueprint TCAS70 (ไม่ใช่ข้อสอบจริงของ สทศ.) · ชื่อบุคคล สถานที่ และองค์กรในข้อสอบเป็นเรื่องสมมุติ' };
}

/* ---------------- เริ่มสอบ ---------------- */
async function start(userId, { setId, mode, section, instant } = {}) {
  const s = getSet(setId);
  if (!['mock', 'practice'].includes(mode)) throw new TcasError('BAD_MODE', 'โหมดไม่ถูกต้อง');
  const ex = EXAMS[s.exam];
  if (mode === 'practice' && !ex.sections.some((x) => x.id === section)) throw new TcasError('BAD_SECTION', 'ส่วนที่เลือกไม่ถูกต้อง');
  const hidden = await hiddenIds();
  // มีชุดเดิมค้างอยู่ -> ทำต่อ (ไม่เปิดซ้อน)
  const ex0 = (await pool.query(
    `SELECT id FROM tcas_sessions WHERE user_id = $1 AND set_id = $2 AND mode = $3 AND COALESCE(section, '') = COALESCE($4, '') AND finished_at IS NULL
      ORDER BY id DESC LIMIT 1`, [userId, s.setId, mode, mode === 'practice' ? section : null])).rows[0];
  if (ex0) return getSession(userId, ex0.id);
  const ids = s.groups.filter((g) => mode === 'mock' || g.section === section).flatMap((g) => g.items.map((it) => it.id)).filter((id) => !hidden.has(id));
  if (!ids.length) throw new TcasError('EMPTY', 'ส่วนนี้ยังไม่มีข้อสอบที่เปิดใช้');
  const { rows } = await pool.query(
    `INSERT INTO tcas_sessions (user_id, exam, set_id, mode, section, item_ids, total, deadline_at, instant)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::int IS NULL THEN NULL ELSE NOW() + make_interval(mins => $8::int) END, $9) RETURNING id`,
    // v1.19.2 สอบจำลอง: เฉลยทันทีเป็นค่าเริ่มต้น (ส่ง instant:false = เฉลยตอนส่งเหมือนสอบจริง)
    [userId, s.exam, s.setId, mode, mode === 'practice' ? section : null, ids, ids.length, mode === 'mock' ? ex.minutes : null, mode === 'mock' && instant !== false]);
  return getSession(userId, rows[0].id);
}

async function loadSession(db, userId, sid, lock = false) {
  const id = Number(sid);
  if (!Number.isInteger(id) || id <= 0) throw new TcasError('NOT_FOUND', 'ไม่พบชุดที่ทำอยู่', 404);
  const r = (await db.query(`SELECT * FROM tcas_sessions WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, userId])).rows[0];
  if (!r) throw new TcasError('NOT_FOUND', 'ไม่พบชุดที่ทำอยู่', 404);
  return r;
}
const expired = (r) => r.mode === 'mock' && !r.finished_at && r.deadline_at && Date.now() > new Date(r.deadline_at).getTime() + MOCK_GRACE_MS;

// answer_events.facet = VARCHAR(16) — ชื่อทักษะที่ยาวกว่าต้องย่อ (functional_language = 19 ตัว ทำให้ส่งข้อสอบไม่ได้)
const FACET = { functional_language: 'functional' };
const facetOf = (skill) => String(FACET[skill] || skill).slice(0, 16);

async function getSession(userId, sid) {
  let r = await loadSession(pool, userId, sid);
  if (expired(r)) { await finish(userId, r.id, { auto: true }); r = await loadSession(pool, userId, sid); }
  const s = getSet(r.set_id);
  const ids = new Set(r.item_ids);
  const groups = s.groups.map((g) => publicGroup(g, ids)).filter(Boolean);
  const done = Boolean(r.finished_at);
  const ans = r.answers || {};
  // practice / mock แบบเฉลยทันที: ข้อที่ตอบแล้วแสดงเฉลย · mock แบบเฉลยตอนส่ง: เฉลยหลังส่งเท่านั้น
  const instantFb = r.mode === 'practice' || Boolean(r.instant);
  const feedback = {};
  for (const id of r.item_ids) {
    const it = load().items.get(id);
    if (!it) continue;
    if (done || (instantFb && ans[id] !== undefined)) feedback[id] = { ...reveal(it), correct: ans[id] === it.answer };
  }
  return {
    id: Number(r.id), exam: r.exam, examName: EXAMS[r.exam].name, setId: r.set_id, title: s.title, mode: r.mode, section: r.section, instant: Boolean(r.instant),
    sectionTh: r.section ? (EXAMS[r.exam].sections.find((x) => x.id === r.section) || {}).th : null,
    sections: EXAMS[r.exam].sections.map((x) => ({ id: x.id, th: x.th })),
    groups, answers: ans, feedback, total: r.item_ids.length,
    deadlineAt: r.deadline_at, serverNow: new Date().toISOString(), finished: done, result: done ? r.result : null,
  };
}

/* ---------------- ตอบ ---------------- */
async function answer(userId, sid, { itemId, choice } = {}) {
  const c = choice === null ? null : Number(choice);
  if (c !== null && (!Number.isInteger(c) || c < 0 || c > 3)) throw new TcasError('BAD_CHOICE', 'ตัวเลือกไม่ถูกต้อง');
  const client = await pool.connect();
  let out; let grant = null; let sectionDone = null; let setOf = null;
  try {
    await client.query('BEGIN');
    const r = await loadSession(client, userId, sid, true);
    if (r.finished_at) throw new TcasError('FINISHED', 'ส่งข้อสอบชุดนี้แล้ว', 409);
    if (expired(r)) throw new TcasError('TIME_UP', 'หมดเวลาสอบแล้ว', 409);
    const id = String(itemId || '');
    if (!r.item_ids.includes(id)) throw new TcasError('BAD_ITEM', 'ไม่มีข้อนี้ในชุดที่ทำอยู่');
    const it = load().items.get(id);
    const ans = r.answers || {};
    setOf = r.set_id;
    if (r.mode === 'practice') {
      if (ans[id] !== undefined) throw new TcasError('ANSWERED', 'ตอบข้อนี้แล้ว', 409);
      if (c === null) throw new TcasError('BAD_CHOICE', 'เลือกคำตอบก่อน');
      ans[id] = c;
      await client.query('UPDATE tcas_sessions SET answers = $2 WHERE id = $1', [r.id, JSON.stringify(ans)]);
      const correct = c === it.answer;
      await client.query("INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet) VALUES ($1, 'tcas', $2, $3, $4, 'tcas', $5)",
        [userId, id, r.exam, correct, facetOf(it.skill)]);
      out = { itemId: id, correct, ...reveal(it), answered: Object.keys(ans).length, total: r.item_ids.length };
      if (correct) grant = id;
      // ฝึกครบทั้งส่วน -> โบนัสจบส่วน (+ ถูกทุกข้อ)
      if (out.answered === out.total) {
        sectionDone = { set: r.set_id, section: r.section, perfect: r.item_ids.every((x) => ans[x] === load().items.get(x).answer) };
      }
    } else if (r.instant) {
      // mock แบบเฉลยทันที: ตอบได้ครั้งเดียวต่อข้อ แล้วเห็นถูก/ผิด+คำอธิบาย · คะแนนรวม/EXP/answer_events คิดตอนส่งเหมือนเดิม
      if (ans[id] !== undefined) throw new TcasError('ANSWERED', 'ตอบข้อนี้แล้ว', 409);
      if (c === null) throw new TcasError('BAD_CHOICE', 'เลือกคำตอบก่อน');
      ans[id] = c;
      await client.query('UPDATE tcas_sessions SET answers = $2 WHERE id = $1', [r.id, JSON.stringify(ans)]);
      out = { itemId: id, saved: true, correct: c === it.answer, ...reveal(it), answered: Object.keys(ans).length, total: r.item_ids.length };
      if (out.correct) grant = id;
    } else {
      if (c === null) delete ans[id]; else ans[id] = c;   // mock แบบเฉลยตอนส่ง: เปลี่ยน/ล้างคำตอบได้จนกว่าจะส่ง
      await client.query('UPDATE tcas_sessions SET answers = $2 WHERE id = $1', [r.id, JSON.stringify(ans)]);
      out = { itemId: id, saved: true, answered: Object.keys(ans).length, total: r.item_ids.length };
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
  const grants = [];
  if (grant) {
    const g = await grantOnce(userId, `tcq:${grant}`, EXP_ITEM[levelOfSet(setOf)] || EXP_ITEM[1], { reason: 'tcas' });
    if (g.tooFast) out.noExpReason = 'too_fast';
    grants.push(g);
  }
  if (sectionDone) {
    grants.push(await grantOnce(userId, `tcs:${sectionDone.set}:${sectionDone.section}`, EXP_SECTION_DONE, { reason: 'tcas_section' }));
    if (sectionDone.perfect) grants.push(await grantOnce(userId, `tcsp:${sectionDone.set}:${sectionDone.section}`, EXP_SECTION_PERFECT, { reason: 'tcas_section' }));
    out.sectionDone = true;
  }
  if (grant || sectionDone) {
    out.gainedExp = grants.reduce((a, g) => a + (g.gained || 0), 0);
    const last = [...grants].reverse().find((g) => g.levelInfo);
    if (last) { out.levelInfo = last.levelInfo; out.leveledUp = grants.some((g) => g.leveledUp); }
  }
  return out;
}

/* ---------------- ส่ง / สรุปผล ---------------- */
function scoreOf(exam, itemIds, answers) {
  const ex = EXAMS[exam];
  const items = itemIds.map((id) => load().items.get(id)).filter(Boolean);
  const sections = ex.sections.map((sec) => {
    const its = items.filter((it) => it.section === sec.id);
    const ok = its.filter((it) => answers[it.id] === it.answer).length;
    return { id: sec.id, th: sec.th, points: sec.points, correct: ok, total: its.length, score: its.length ? Math.round((ok / its.length) * sec.points * 100) / 100 : 0 };
  }).filter((x) => x.total);
  const fullPoints = sections.reduce((a, s) => a + s.points, 0);
  const raw = sections.reduce((a, s) => a + s.score, 0);
  const score = fullPoints ? Math.round((raw / fullPoints) * 100 * 100) / 100 : 0;
  const bySkill = {};
  for (const it of items) {
    const k = it.skill; bySkill[k] = bySkill[k] || { skill: k, th: SKILL_TH[k] || k, correct: 0, total: 0 };
    bySkill[k].total += 1; if (answers[it.id] === it.answer) bySkill[k].correct += 1;
  }
  const skills = Object.values(bySkill).map((x) => ({ ...x, pct: Math.round((x.correct / x.total) * 100) })).sort((a, b) => a.pct - b.pct || b.total - a.total);
  const byType = {};
  for (const it of items) {
    const k = it.type; byType[k] = byType[k] || { type: k, th: TYPE_TH[k], correct: 0, total: 0 };
    byType[k].total += 1; if (answers[it.id] === it.answer) byType[k].correct += 1;
  }
  return {
    score, correct: items.filter((it) => answers[it.id] === it.answer).length, total: items.length,
    answered: items.filter((it) => answers[it.id] !== undefined).length, sections,
    weak: skills.filter((x) => x.total >= 2 && x.pct < 70).slice(0, 3), skills, types: Object.values(byType),
  };
}

async function finish(userId, sid, { auto = false } = {}) {
  const client = await pool.connect();
  let r; let result; let levelUp = null;
  try {
    await client.query('BEGIN');
    r = await loadSession(client, userId, sid, true);
    if (r.finished_at) { await client.query('ROLLBACK'); return getSession(userId, r.id); }
    result = scoreOf(r.exam, r.item_ids, r.answers || {});
    result.auto = Boolean(auto);
    await client.query('UPDATE tcas_sessions SET finished_at = NOW(), correct = $2, score = $3, result = $4 WHERE id = $1',
      [r.id, result.correct, r.mode === 'mock' ? result.score : null, JSON.stringify(result)]);
    if (r.mode === 'mock') {
      const ans = r.answers || {};
      for (const id of r.item_ids) {
        if (ans[id] === undefined) continue;
        const it = load().items.get(id);
        if (!it) continue;
        await client.query("INSERT INTO answer_events (user_id, skill, item_id, level, correct, source, facet) VALUES ($1, 'tcas', $2, $3, $4, 'tcas_mock', $5)",
          [userId, id, r.exam, ans[id] === it.answer, facetOf(it.skill)]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
  // EXP สอบจำลอง: ครั้งแรกของชุดนั้น และต้องตอบอย่างน้อยครึ่งชุด (ส่งว่างไม่ได้ EXP)
  if (r.mode === 'mock' && result.answered >= Math.ceil(result.total / 2)) {
    const lv = levelOfSet(r.set_id);
    const grants = [await grantOnce(userId, `tcm:${r.set_id}`, EXP_MOCK_FIRST[lv] || EXP_MOCK_FIRST[1], { reason: 'tcas' })];
    for (const [min, exp] of EXP_MOCK_BONUS) {
      if (result.score >= min) grants.push(await grantOnce(userId, `tcmb${min}:${r.set_id}`, exp, { reason: 'tcas_score' }));
    }
    const gained = grants.reduce((a, g) => a + (g.gained || 0), 0);
    if (gained) {
      result.gainedExp = gained;
      const last = [...grants].reverse().find((g) => g.levelInfo);
      if (last) levelUp = { levelInfo: last.levelInfo, leveledUp: grants.some((g) => g.leveledUp) };
      await pool.query('UPDATE tcas_sessions SET result = $2 WHERE id = $1', [r.id, JSON.stringify(result)]);
    }
  }
  const view = await getSession(userId, r.id);
  if (levelUp) view.levelUp = levelUp;   // เฉพาะคำตอบของการส่งครั้งนี้ (ไม่เก็บใน result -> เปิดดูภายหลังไม่เด้งซ้ำ)
  return view;
}

async function history(userId) {
  const { rows } = await pool.query(
    `SELECT id, exam, set_id, mode, section, total, correct, score, started_at, finished_at FROM tcas_sessions
      WHERE user_id = $1 AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 20`, [userId]);
  return { sessions: rows.map((x) => ({ id: Number(x.id), exam: x.exam, setId: x.set_id, mode: x.mode, section: x.section, total: x.total, correct: x.correct,
    score: x.score === null ? null : Number(x.score), finishedAt: x.finished_at })) };
}

/* ---------------- แจ้งข้อสอบผิด / ผู้ดูแล ---------------- */
const REPORT_REASONS = { wrong_key: 'เฉลยผิด', ambiguous: 'มีคำตอบถูกมากกว่า 1 ข้อ', typo: 'พิมพ์ผิด/ข้อความไม่ชัด', explanation: 'คำอธิบายไม่ถูกต้อง', other: 'อื่น ๆ' };
async function report(userId, { itemId, reason, note } = {}) {
  const id = String(itemId || '');
  if (!load().items.has(id)) throw new TcasError('BAD_ITEM', 'ไม่พบข้อนี้');
  if (!REPORT_REASONS[reason]) throw new TcasError('BAD_REASON', 'เลือกเหตุผล');
  const seen = await pool.query("SELECT 1 FROM tcas_sessions WHERE user_id = $1 AND $2 = ANY(item_ids) LIMIT 1", [userId, id]);
  if (!seen.rowCount) throw new TcasError('NOT_SEEN', 'แจ้งได้เฉพาะข้อที่ทำแล้ว', 403);
  const recent = await pool.query("SELECT COUNT(*)::int AS n FROM tcas_reports WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'", [userId]);
  if (recent.rows[0].n >= 20) throw new TcasError('LIMIT', 'แจ้งได้วันละ 20 ข้อ', 429);
  const clean = String(note || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 300) || null;
  await pool.query(
    `INSERT INTO tcas_reports (user_id, item_id, reason, note) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, item_id) DO UPDATE SET reason = EXCLUDED.reason, note = EXCLUDED.note, created_at = NOW(), resolved_at = NULL`,
    [userId, id, reason, clean]);
  return { ok: true };
}

async function adminReports() {
  const { rows } = await pool.query(
    `SELECT r.item_id, COUNT(*)::int AS reports, ARRAY_AGG(DISTINCT r.reason) AS reasons,
            (ARRAY_AGG(r.note ORDER BY r.created_at DESC) FILTER (WHERE r.note IS NOT NULL))[1:3] AS notes,
            MAX(r.created_at) AS last_at, COALESCE(s.hidden, FALSE) AS hidden
       FROM tcas_reports r LEFT JOIN tcas_item_state s ON s.item_id = r.item_id
      WHERE r.resolved_at IS NULL GROUP BY r.item_id, s.hidden ORDER BY COUNT(*) DESC, MAX(r.created_at) DESC LIMIT 100`);
  const hiddenRows = (await pool.query('SELECT item_id, note, updated_at FROM tcas_item_state WHERE hidden ORDER BY updated_at DESC')).rows;
  const view = (id) => {
    const it = load().items.get(id);
    if (!it) return null;
    const g = load().sets.get(it.setId).groups.find((x) => x.id === it.groupId);
    return { itemId: id, setId: it.setId, typeTh: TYPE_TH[it.type], stem: it.stem, options: it.options, answer: it.answer, explanationTh: it.explanationTh,
      context: g.text ? g.text.slice(0, 600) : (g.dialogue || []).map((l) => `${l.speaker}: ${l.text}`).join('\n').slice(0, 600) };
  };
  return {
    reasons: REPORT_REASONS,
    reports: rows.map((r) => ({ ...view(r.item_id), reports: r.reports, reasons: r.reasons, notes: r.notes || [], lastAt: r.last_at, hidden: r.hidden })),
    hidden: hiddenRows.map((h) => ({ itemId: h.item_id, note: h.note, updatedAt: h.updated_at })),
    counts: [...load().sets.values()].map((s) => ({ setId: s.setId, title: s.title, items: s.groups.reduce((a, g) => a + g.items.length, 0), review: s.review || null })),
  };
}
async function adminSetHidden(adminId, { itemId, hidden, note } = {}) {
  const id = String(itemId || '');
  if (!load().items.has(id)) throw new TcasError('BAD_ITEM', 'ไม่พบข้อนี้');
  await pool.query(
    `INSERT INTO tcas_item_state (item_id, hidden, note, updated_by, updated_at) VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (item_id) DO UPDATE SET hidden = EXCLUDED.hidden, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [id, Boolean(hidden), String(note || '').slice(0, 300) || null, adminId]);
  await pool.query('UPDATE tcas_reports SET resolved_at = NOW() WHERE item_id = $1 AND resolved_at IS NULL', [id]);
  return { ok: true, itemId: id, hidden: Boolean(hidden) };
}

module.exports = { TcasError, EXAMS, hub, start, getSession, answer, finish, history, report, adminReports, adminSetHidden, REPORT_REASONS, _reload, _load: load, _scoreOf: scoreOf };
