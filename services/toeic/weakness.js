/*
  TOEIC — วิเคราะห์จุดอ่อน (รวมทุก Part)
  - อ่านคำตอบจาก toeic_answers ของผู้ใช้เอง (userId จาก token เท่านั้น) · นับเฉพาะ Practice และ Mock ที่ส่งแล้ว (เหมือนหน้าสรุปของแต่ละ Part)
  - จัดกลุ่มตามกลุ่มทักษะที่แต่ละ Part ใช้อยู่แล้ว (ไม่สร้างหมวดใหม่ · ไม่แก้ข้อมูลเดิม)
  - คะแนนจุดอ่อน = ความแม่นยำแบบปรับด้วยค่าตั้งต้น (prior 70% น้ำหนัก 4 ข้อ) → กลุ่มที่ตอบน้อยข้อไม่ถูกตัดสินเกินจริง
  - ชุดฝึกจุดอ่อน = Practice ปกติของ Part นั้นที่กรองเฉพาะกลุ่มทักษะ (กติกา EXP/Coin เดิมทุกอย่าง ไม่มีรางวัลพิเศษ)
*/
const pool = require('../../config/db');
const bank = require('./bank');
const { PART1, PART2, PART34, PART5, PART6, PART7 } = require('../../config/toeic');
const P1 = require('./part1');
const P6 = require('./part6');
const P7 = require('./part7');

const PRIOR = 0.7;
const PRIOR_N = 4;
const MIN_N = 3;          // ตอบน้อยกว่านี้ = "ข้อมูลยังน้อย"
const RECENT_N = 8;       // ดูแนวโน้มจาก 8 ข้อล่าสุดของกลุ่ม
const RANGE = { '30': "NOW() - INTERVAL '30 days'", all: "'-infinity'::timestamptz" };

const PART_NAME = { 1: 'Part 1 · ภาพถ่าย', 2: 'Part 2 · คำถาม–คำตอบ', 3: 'Part 3 · บทสนทนา', 4: 'Part 4 · การพูดสั้น ๆ',
  5: 'Part 5 · เติมประโยค', 6: 'Part 6 · เติมข้อความ', 7: 'Part 7 · อ่านจับใจความ' };
const SECTION = (part) => (part <= 4 ? 'L' : 'R');

const p1Group = (skill) => Object.keys(PART1.skillGroups).find((g) => PART1.skillGroups[g].includes(skill)) || 'objects';
const p5Group = (skill) => Object.keys(PART5.skillGroups).find((g) => PART5.skillGroups[g].includes(skill)) || 'vocabulary';
const p34Group = (type) => PART34.groupOf[type] || 'detail';
const p6Group = P6._internal.groupOf;
const p7Group = P7._internal.groupOf;

/** กลุ่มทักษะของแต่ละ Part: รายการ · ชื่อไทย · วิธีแปลงคำตอบ → กลุ่ม · วิธีนับข้อในคลัง · body สำหรับเริ่มชุดฝึก */
const DEF = {
  1: { groups: Object.keys(PART1.skillGroups), th: PART1.skillGroupTh, size: 10,
    ofAnswer: (r) => [...new Set((r.skills && r.skills.length ? r.skills : [r.skill]).map(p1Group))],
    bankCount: async () => count((await bank.pool1()).filter((q) => q.variants.some((v) => v.audio)), (q) => [...new Set(q.skills.map(p1Group))]) },
  2: { groups: Object.keys(PART2.categoryTh), th: PART2.categoryTh, size: 10,
    ofAnswer: (r) => [r.skill],
    bankCount: async () => count(await bank.pool2(), (q) => [q.category]) },
  3: { groups: Object.keys(PART34.groupTh), th: PART34.groupTh, size: 3,
    ofAnswer: (r) => [p34Group(r.skill)],
    bankCount: async () => count((await bank.poolOf(3)).flatMap((p) => p.questions), (q) => [p34Group(q.type)]) },
  4: { groups: Object.keys(PART34.groupTh), th: PART34.groupTh, size: 3,
    ofAnswer: (r) => [p34Group(r.skill)],
    bankCount: async () => count((await bank.poolOf(4)).flatMap((p) => p.questions), (q) => [p34Group(q.type)]) },
  5: { groups: Object.keys(PART5.skillGroups), th: PART5.skillGroupTh, size: 10,
    ofAnswer: (r) => [p5Group(r.skill)],
    bankCount: async () => count(await bank.pool5(), (q) => [p5Group(q.skill)]) },
  6: { groups: Object.keys(PART6.groupTh), th: PART6.groupTh, size: 2,
    ofAnswer: (r) => [p6Group(r.skill)],
    bankCount: async () => count((await bank.pool6()).flatMap((p) => p.questions), (q) => [p6Group(q.skill)]) },
  7: { groups: Object.keys(PART7.groupTh), th: PART7.groupTh, size: 3,
    ofAnswer: (r) => [p7Group(r.skill)],
    bankCount: async () => count((await bank.pool7()).flatMap((p) => p.questions), (q) => [p7Group(q.type)]) },
};
function count(items, groupsOf) {
  const out = {};
  items.forEach((q) => groupsOf(q).forEach((g) => { out[g] = (out[g] || 0) + 1; }));
  return out;
}

/** เคล็ดลับสั้น ๆ ต่อกลุ่มทักษะ (เขียนเอง · ใช้ทั่วไปกับข้อสอบแนว TOEIC) */
const TIPS = {
  1: {
    actions: 'ฟังกริยาให้ชัด แล้วเทียบกับท่าทางในภาพจริง ๆ ตัวเลือกหลอกมักมีคำนามถูกแต่การกระทำผิด',
    objects: 'ดูสภาพของสิ่งของ (วางอยู่ เปิด/ปิด ซ้อนกัน) และระวังคำที่ไม่มีในภาพ',
    people: 'นับจำนวนคนและดูว่าใครทำอะไร "They are…" กับ "A woman is…" ต่างกัน',
    locations: 'ระบุสถานที่จากสิ่งที่เห็นในภาพเท่านั้น อย่าเดาจากบรรยากาศ',
    prepositions: 'จับคำบอกตำแหน่ง next to / on / under / in front of แล้วชี้ในภาพให้ตรง',
    passive: '"has been + V3" บอกสภาพที่เสร็จแล้ว ส่วน "is being + V3" ต้องมีคนกำลังทำในภาพ',
  },
  2: {
    wh: 'จำคำแรกของคำถาม (Who/When/Where/Why/How) แล้วตัดคำตอบที่ตอบคนละเรื่องทิ้ง',
    yesNo: 'คำตอบที่ดีไม่จำเป็นต้องขึ้นต้นด้วย Yes/No ให้ดูว่าตอบเรื่องที่ถามหรือเปล่า',
    choice: 'คำถาม A or B มักตอบด้วยตัวเลือกหนึ่ง หรือ "ได้ทั้งคู่/ไม่เอาทั้งคู่" ระวังคำตอบ Yes/No',
    tag: 'Tag question (…, isn\'t it?) ให้ฟังประโยคหลักแล้วตอบตามข้อเท็จจริง',
    negative: 'คำถามปฏิเสธ (Didn\'t you…?) ตอบเหมือนคำถามบอกเล่าปกติ',
    statement: 'ประโยคบอกเล่าไม่มีคำถาม ให้หาคำตอบที่เป็นการตอบสนองที่สมเหตุสมผล',
    request: 'ขอร้อง/เสนอ/ชวน มักตอบด้วยการรับ ปฏิเสธอย่างสุภาพ หรือถามกลับ',
  },
  34: {
    gist: 'อ่านคำถามก่อนเสียงเริ่ม หัวข้อ/ผู้พูด/สถานที่มักบอกในช่วงแรกของบทสนทนา',
    detail: 'จำคำสำคัญในคำถาม (วัน เวลา จำนวน) แล้วรอฟังช่วงนั้น คำตอบมักใช้คำพ้องความหมาย',
    inference: 'คำตอบไม่ได้พูดตรง ๆ ให้รวมข้อมูลหลายจุดแล้วเลือกข้อที่สรุปได้แน่นอน',
    intent: 'ถาม "ทำไมผู้พูดพูดว่า…" ให้ดูบริบทก่อนและหลังประโยคนั้น ไม่ใช่ความหมายตรงตัว',
    graphic: 'ดูกราฟิกก่อนเสียงเริ่ม คำตอบมักเป็นข้อมูลอีกคอลัมน์ ไม่ใช่คำที่ได้ยิน',
  },
  5: {
    wordForm: 'ดูตำแหน่งของช่องว่าง: หน้าคำนามใช้ adjective หลัง the/a ใช้ noun ขยายกริยาใช้ adverb',
    verbs: 'หาประธานและคำบอกเวลา (by next week, since, yesterday) ก่อนเลือก tense/voice',
    pronouns: 'ดูว่าช่องว่างเป็นประธาน กรรม หรือแสดงความเป็นเจ้าของ และคำบอกปริมาณคู่กับนามนับได้/ไม่ได้',
    comparisons: 'มี than → ขั้นกว่า · มี the/of all → ขั้นสุด · as … as → รูปปกติ',
    prepositions: 'จำคู่ที่ใช้บ่อย (in charge of, responsible for, by + เวลาสิ้นสุด)',
    connectors: 'ดูความสัมพันธ์ของสองส่วน: ขัดแย้ง (although) เหตุผล (because) เงื่อนไข (unless) และตามด้วยประโยคหรือคำนาม',
    vocabulary: 'อ่านทั้งประโยคก่อน แล้วเลือกคำที่เข้ากับบริบทและ collocation ไม่ใช่แค่ความหมายใกล้เคียง',
  },
  6: {
    grammar: 'ไวยากรณ์ใน Part 6 มักต้องดูประโยครอบ ๆ เช่น tense ตามเหตุการณ์ในอีเมล',
    vocabulary: 'คำศัพท์ต้องเข้ากับเรื่องทั้งบทความ อ่านประโยคก่อนและหลังช่องว่างเสมอ',
    context: 'คำเชื่อม/คำอ้างอิงต้องอ่านจากบริบททั้งเรื่อง ไม่ใช่แค่ประโยคเดียว',
    sentence: 'ประโยคที่เติมต้องต่อเนื่องทั้งกับประโยคก่อนหน้าและหลัง ดูคำอ้างอิง (this, these, it)',
  },
  7: {
    detail: 'อ่านคำถามก่อน แล้ว scan หาคำสำคัญในเอกสาร คำตอบมักใช้คำพ้องความหมาย',
    inference: 'เลือกข้อที่มีหลักฐานรองรับในเอกสาร ระวังข้อที่ "อาจจริง" แต่ไม่ได้กล่าวถึง',
    vocabulary: 'แทนแต่ละตัวเลือกลงในประโยคเดิม แล้วเลือกความหมายที่เข้ากับบริบทนั้น',
    notTrue: 'ข้อ NOT ให้ตรวจทีละตัวเลือกกับเอกสาร ตัวที่หาไม่เจอคือคำตอบ',
    insertion: 'ดูคำเชื่อมและคำอ้างอิงในประโยคที่ให้มา แล้วหาตำแหน่งที่ต่อเรื่องได้ลื่นที่สุด',
    cross: 'คำถามเชื่อมหลายเอกสาร: หาข้อมูลชิ้นแรกในฉบับหนึ่ง แล้วใช้ไปค้นต่อในอีกฉบับ',
  },
};
const tipOf = (part, g) => ((part === 3 || part === 4) ? TIPS[34][g] : (TIPS[part] || {})[g]) || '';

const smooth = (ok, n) => (ok + PRIOR * PRIOR_N) / (n + PRIOR_N);
function statusOf(n, s) {
  if (n < MIN_N) return 'few';
  if (s < 0.6) return 'weak';
  if (s < 0.78) return 'fair';
  return 'strong';
}

async function analyze(userId, rangeIn = 'all') {
  const range = RANGE[rangeIn] ? rangeIn : 'all';
  const { rows } = await pool.query(
    `SELECT a.part, a.skill, a.skills, a.is_correct, a.distractor_type, a.created_at
       FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
      WHERE a.user_id = $1 AND a.created_at >= ${RANGE[range]} AND (a.mode = 'practice' OR s.status = 'finished')
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 20000`, [userId]);
  // ข้อที่ยังผิดอยู่ (คำตอบล่าสุดของข้อนั้นผิด) — นับทั้งหมด ไม่ขึ้นกับช่วงเวลา
  const mis = await pool.query(
    `SELECT part, COUNT(*)::int AS n FROM (
       SELECT DISTINCT ON (a.question_id) a.part, a.is_correct
         FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
        WHERE a.user_id = $1 AND (a.mode = 'practice' OR s.status = 'finished')
        ORDER BY a.question_id, a.created_at DESC, a.id DESC) t
      WHERE NOT is_correct GROUP BY part`, [userId]);
  const mistakes = Object.fromEntries(mis.rows.map((r) => [r.part, r.n]));

  const parts = [];
  for (const part of [1, 2, 3, 4, 5, 6, 7]) {
    const d = DEF[part];
    const mine = rows.filter((r) => r.part === part);
    const bankN = await d.bankCount();
    const stat = Object.fromEntries(d.groups.map((g) => [g, { n: 0, ok: 0, recent: [] }]));
    mine.forEach((r) => d.ofAnswer(r).forEach((g) => {
      const x = stat[g]; if (!x) return;
      x.n += 1; if (r.is_correct) x.ok += 1;
      if (x.recent.length < RECENT_N) x.recent.push(r.is_correct);   // rows เรียงล่าสุดก่อน
    }));
    const groups = d.groups.map((g) => {
      const x = stat[g]; const s = smooth(x.ok, x.n);
      const acc = x.n ? x.ok / x.n : null;
      const rAcc = x.recent.length ? x.recent.filter(Boolean).length / x.recent.length : null;
      let trend = null;
      if (x.n >= RECENT_N * 2) { const diff = rAcc - acc; trend = diff >= 0.1 ? 'up' : diff <= -0.1 ? 'down' : 'flat'; }
      const available = bankN[g] || 0;
      return {
        id: g, th: d.th[g] || g, answered: x.n, correct: x.ok,
        accuracy: acc === null ? null : Math.round(acc * 100), recentAccuracy: rAcc === null ? null : Math.round(rAcc * 100),
        score: Math.round(s * 100), status: x.n ? statusOf(x.n, s) : 'untried', trend, available, tip: tipOf(part, g),
        drill: available ? { part, body: { size: d.size, group: g, drill: true } } : null,
      };
    });
    const ok = mine.filter((r) => r.is_correct).length;
    parts.push({ part, section: SECTION(part), name: PART_NAME[part], answered: mine.length,
      accuracy: mine.length ? Math.round((ok / mine.length) * 100) : null, mistakes: mistakes[part] || 0, groups });
  }

  const sec = (k) => { const xs = rows.filter((r) => SECTION(r.part) === k); const ok = xs.filter((r) => r.is_correct).length;
    return { answered: xs.length, accuracy: xs.length ? Math.round((ok / xs.length) * 100) : null }; };

  const all = parts.flatMap((p) => p.groups.map((g) => ({ ...g, part: p.part, partName: p.name })));
  const plan = all.filter((g) => (g.status === 'weak' || g.status === 'fair') && g.drill)
    .sort((a, b) => a.score - b.score || b.answered - a.answered).slice(0, 3)
    .map((g) => ({ part: g.part, partName: g.partName, id: g.id, th: g.th, accuracy: g.accuracy, answered: g.answered,
      status: g.status, tip: g.tip, drill: g.drill }));
  // กลุ่มที่ยังไม่เคยฝึก: เรียงสลับ Part (Part ละ 1 กลุ่มก่อน) ให้เห็นหลากหลาย
  const seenPart = {};
  const untried = all.filter((g) => g.status === 'untried' && g.drill)
    .map((g) => { seenPart[g.part] = (seenPart[g.part] || 0) + 1; return { g, round: seenPart[g.part] }; })
    .sort((a, b) => a.round - b.round || a.g.part - b.g.part)
    .map(({ g }) => ({ part: g.part, partName: g.partName, id: g.id, th: g.th, drill: g.drill }));

  // กับดักที่พลาดบ่อย (มีข้อมูลประเภทตัวเลือกหลอกเฉพาะ Part 1–2)
  const trapTh = { 1: P1._internal.DISTRACTOR_TH, 2: PART2.distractorTh };
  const trapCount = {};
  rows.filter((r) => !r.is_correct && r.distractor_type && (r.part === 1 || r.part === 2)).forEach((r) => {
    const k = `${r.part}:${r.distractor_type}`; trapCount[k] = (trapCount[k] || 0) + 1;
  });
  const traps = Object.entries(trapCount).map(([k, n]) => { const [p, id] = k.split(':'); return { part: Number(p), id, th: (trapTh[p] || {})[id] || id, count: n }; })
    .sort((a, b) => b.count - a.count).slice(0, 4);

  return { range, answered: rows.length, minAnswers: MIN_N, sections: { L: sec('L'), R: sec('R') }, parts, plan,
    untried: untried.slice(0, 6), untriedTotal: untried.length, traps,
    mistakesTotal: Object.values(mistakes).reduce((a, b) => a + b, 0) };
}

module.exports = { analyze, _internal: { smooth, statusOf, DEF, TIPS, tipOf } };
