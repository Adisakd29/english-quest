/*
  ความคืบหน้า C2 — คำนวณจากข้อมูลเดิม (word_progress · answer_events · vocab_lessons) ไม่มีตารางสถิติแยก
    learned   = status 'known' (ตอบถูกในแบบฝึก/บทเรียน)
    mastered  = known และช่วงทบทวน SRS ≥ 21 วัน (เกณฑ์เดียวกับ Vocabulary Browser)
    weak      = sense ที่ตอบผิดใน 30 วัน (แยกตาม facet: ความหมาย / ความหมายขั้นสูง / collocation / register / ...)
*/
const pool = require('../../config/db');
const S = require('./c2Store');
const P = require('./c2Practice');

const MASTERED_DAYS = 21;
const FACET_TH = { meaning: 'ความหมาย', sense: 'ความหมายขั้นสูง/บริบท', collocation: 'Collocation', precision: 'ความแม่นยำของคำ',
  register: 'ระดับภาษา', connotation: 'ความหมายแฝง', phrase: 'สำนวน/วลี', form: 'รูปคำ', usage: 'การใช้ที่มักผิด' };

async function summary(userId) {
  await S.ready();
  const all = S.all();
  const prog = new Map((await pool.query(
    `SELECT word_id, status, srs_interval, srs_due_at, times_seen, times_correct FROM word_progress WHERE user_id = $1 AND level = 'C2'`,
    [userId])).rows.map((r) => [r.word_id, r]));
  const tierStat = (tier) => {
    const list = all.filter((s) => s.tier === tier);
    const learned = list.filter((s) => (prog.get(s.id) || {}).status === 'known').length;
    const mastered = list.filter((s) => { const p = prog.get(s.id); return p && p.status === 'known' && (p.srs_interval || 0) >= MASTERED_DAYS; }).length;
    return { total: list.length, learned, mastered, percent: list.length ? Math.round((learned / list.length) * 100) : 0 };
  };
  const byKind = {};
  for (const s of all) {
    const k = byKind[s.kind] || (byKind[s.kind] = { total: 0, learned: 0 });
    k.total += 1; if ((prog.get(s.id) || {}).status === 'known') k.learned += 1;
  }
  const now = Date.now();
  const due = [...prog.entries()].filter(([id, p]) => S.get(id) && p.status === 'known' && (!p.srs_due_at || new Date(p.srs_due_at).getTime() <= now)).length;
  const acc = (await pool.query(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE correct)::int AS ok,
            count(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS n30,
            count(*) FILTER (WHERE correct AND created_at >= NOW() - INTERVAL '30 days')::int AS ok30
       FROM answer_events WHERE user_id = $1 AND skill = 'vocab' AND level = 'C2'`, [userId])).rows[0];
  const weakRows = (await pool.query(
    `SELECT item_id, facet, count(*) FILTER (WHERE NOT correct)::int AS wrong, count(*)::int AS n
       FROM answer_events WHERE user_id = $1 AND skill = 'vocab' AND level = 'C2' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY item_id, facet`, [userId])).rows;
  const senseWrong = new Map(); const facetWrong = {};
  for (const r of weakRows) {
    if (!r.wrong) continue;
    senseWrong.set(r.item_id, (senseWrong.get(r.item_id) || 0) + r.wrong);
    const f = r.facet || 'meaning';
    (facetWrong[f] || (facetWrong[f] = new Map())).set(r.item_id, ((facetWrong[f].get(r.item_id)) || 0) + r.wrong);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([id, wrong]) => { const s = S.get(id); return s ? { id, form: s.form, short: s.short, kind: s.kind, wrong } : null; }).filter(Boolean);
  const cont = (await pool.query(
    `SELECT unit_id, current_step, last_study_at FROM vocab_lessons WHERE user_id = $1 AND unit_id LIKE 'C2-%'
      AND lesson_completed_at IS NULL ORDER BY last_study_at DESC NULLS LAST LIMIT 1`, [userId])).rows[0] || null;
  const access = await P.c2Access(userId);
  return {
    unlocked: access.unlocked, unlockedVia: access.via,
    core: tierStat('core'), extended: tierStat('extended'), byKind,
    accuracy: acc.n ? Math.round((acc.ok / acc.n) * 100) : null, accuracy30: acc.n30 ? Math.round((acc.ok30 / acc.n30) * 100) : null, answered: acc.n,
    due,
    weakSenses: top(senseWrong, 8),
    weakByFacet: Object.fromEntries(Object.entries(facetWrong).map(([f, m]) => [f, { th: FACET_TH[f] || f, items: top(m, 5) }])),
    weakCollocations: facetWrong.collocation ? top(facetWrong.collocation, 6) : [],
    continue: cont ? { unitId: cont.unit_id, step: cont.current_step } : null,
    bank: { total: all.length, note: 'coverage-driven C2 vocabulary bank — ขยายเพิ่มได้เรื่อย ๆ' },
  };
}

module.exports = { summary, FACET_TH, MASTERED_DAYS };
