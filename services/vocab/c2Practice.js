/*
  C2 Vocabulary Challenge — รอบฝึกผสมหลายชนิดข้อ (ไม่ใช่แค่แปลคำ)
    mode = mixed   : ผสม due + weak + ใหม่ · ชนิดข้อหมุนเวียน (context / collocation / precision / register / ...)
    mode = context : Guess from Context ล้วน (กิจกรรมหลักของ C2)
    mode = daily   : ชุดประจำวัน (ชุดเดียวกันทั้งวัน) — ถึงกำหนดทบทวน → จุดอ่อน → ใหม่
  เลือกข้อ: ถึงกำหนดทบทวน (SRS) ก่อน → sense ที่ตอบผิดบ่อย (30 วัน) → ใหม่ (core, priority สูงก่อน)
  EXP: ตอบถูกครั้งแรกของ "ข้อนี้ในวันนี้" +8 · รอบ perfect +15 (ครั้งเดียวต่อวันต่อโหมด) · ไม่มีเพดานรายวัน
*/
const pool = require('../../config/db');
const S = require('./c2Store');
const I = require('./c2Items');
const L = require('./c2Lesson');
const { grantOnce, mergeGrants } = require('../../utils/exp');

const MODES = ['mixed', 'context', 'daily'];
const SIZE = { mixed: 10, context: 8, daily: 8 };
const EXP = { item: 8, perfect: 15 };
const MIXED_TYPES = ['context', 'colloc', 'nearsyn', 'register', 'connot', 'idiom', 'formtype', 'mistake', 'reverse', 'meaning'];
const bkkDay = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/** ผู้เรียนเข้าถึง C2 ได้ไหม: ระดับ C2 ปลดล็อกบน Learning Path หรือเคยเรียน C2 มาแล้ว */
async function c2Access(userId) {
  const P = require('../../routes/path');
  const { levels } = await P.getUserPathState(userId);
  const lv = levels.find((l) => l.level === 'C2');
  if (lv && lv.unlocked) return { unlocked: true, via: 'path' };
  const any = (await pool.query("SELECT 1 FROM word_progress WHERE user_id = $1 AND level = 'C2' LIMIT 1", [userId])).rowCount > 0;
  return { unlocked: any, via: any ? 'explored' : null };
}

/** เลือก sense ตามลำดับความสำคัญ: due → weak → (learning) → new */
async function pickSenses(userId, n, seed) {
  await S.ready();
  const prog = (await pool.query(
    `SELECT word_id, status, srs_due_at FROM word_progress WHERE user_id = $1 AND level = 'C2'`, [userId])).rows;
  const weakRows = (await pool.query(
    `SELECT item_id, count(*) FILTER (WHERE NOT correct)::int AS wrong, count(*)::int AS n FROM answer_events
      WHERE user_id = $1 AND skill = 'vocab' AND level = 'C2' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY item_id HAVING count(*) FILTER (WHERE NOT correct) > 0 ORDER BY 2 DESC, 3 DESC`, [userId])).rows;
  const now = Date.now();
  const seen = new Set(prog.map((p) => p.word_id));
  const due = prog.filter((p) => p.status === 'known' && (!p.srs_due_at || new Date(p.srs_due_at).getTime() <= now)).map((p) => p.word_id);
  const weak = weakRows.map((r) => r.item_id);
  const learning = prog.filter((p) => p.status === 'learning').map((p) => p.word_id);
  const fresh = S.all().filter((s) => !seen.has(s.id))
    .sort((a, b) => (a.tier === 'core' ? 0 : 1) - (b.tier === 'core' ? 0 : 1) || b.priority - a.priority);
  const out = []; const used = new Set();
  const add = (ids, max) => { for (const id of ids) { if (out.length >= max) break; if (used.has(id) || !S.get(id)) continue; used.add(id); out.push({ id, why: null }); } };
  // สัดส่วนโดยประมาณ: due ≤ 40% · weak ≤ 30% · ที่เหลือใหม่/กำลังเรียน
  add(I.seededShuffle(due, `${seed}:due`), Math.ceil(n * 0.4));
  add(weak, out.length + Math.ceil(n * 0.3));
  add(fresh.slice(0, n * 3).map((s) => s.id), n);
  add(I.seededShuffle(learning, `${seed}:l`), n);
  add(I.seededShuffle([...due, ...weak], `${seed}:r`), n);
  const tag = (id) => (due.includes(id) ? 'due' : weak.includes(id) ? 'weak' : seen.has(id) ? 'learning' : 'new');
  return out.slice(0, n).map((x) => ({ id: x.id, why: tag(x.id) }));
}

function itemsFor(picks, mode, seed) {
  const ids = [];
  picks.forEach((p, i) => {
    const s = S.get(p.id);
    const prefs = mode === 'context' ? ['context', 'meaning']
      : [...MIXED_TYPES.slice(i % MIXED_TYPES.length), ...MIXED_TYPES.slice(0, i % MIXED_TYPES.length)];
    for (const t of prefs) { if (I.build(s, t, seed)) { ids.push(`${s.id}~${t}`); break; } }
  });
  return ids;
}

async function start(userId, mode = 'mixed') {
  if (!MODES.includes(mode)) throw new L.C2Error('BAD_MODE', 'โหมดไม่ถูกต้อง');
  const access = await c2Access(userId);
  if (!access.unlocked) throw new L.C2Error('C2_LOCKED', 'ระดับ C2 ยังล็อกอยู่ — ผ่าน C1 ตามเกณฑ์ หรือสอบวัดระดับได้ C1 เต็มก่อน', 403);
  const day = bkkDay();
  if (mode === 'daily') {
    const ex = (await pool.query(
      `SELECT * FROM c2_sessions WHERE user_id = $1 AND mode = 'daily' AND seed = $2 ORDER BY id DESC LIMIT 1`, [userId, `d:${userId}:${day}`])).rows[0];
    if (ex) return view(ex);
  }
  const seed = mode === 'daily' ? `d:${userId}:${day}` : `${mode}:${userId}:${Date.now().toString(36)}`;
  const picks = await pickSenses(userId, SIZE[mode], seed);
  const items = itemsFor(picks, mode, seed);
  if (!items.length) throw new L.C2Error('EMPTY', 'ยังไม่มีข้อให้ฝึกในตอนนี้');
  const row = (await pool.query(
    `INSERT INTO c2_sessions (user_id, mode, seed, items) VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
    [userId, mode, seed, JSON.stringify(items)])).rows[0];
  return view(row, picks);
}

function view(row, picks = null) {
  const why = picks ? Object.fromEntries(picks.map((p) => [p.id, p.why])) : {};
  return {
    sessionId: Number(row.id), mode: row.mode, finished: Boolean(row.finished_at),
    items: row.items.map((id) => { const p = I.parseItemId(id); const pub = I.publicView(I.build(p.senseId, p.type, row.seed)); return pub && { ...pub, pick: why[p.senseId] || null }; }).filter(Boolean),
    answered: row.answers,
  };
}

async function sessionOf(userId, sid) {
  const id = Number(sid);
  if (!Number.isInteger(id) || id <= 0) throw new L.C2Error('BAD_SESSION', 'รหัสรอบฝึกไม่ถูกต้อง');
  const row = (await pool.query('SELECT * FROM c2_sessions WHERE id = $1 AND user_id = $2', [id, userId])).rows[0];
  if (!row) throw new L.C2Error('NO_SESSION', 'ไม่พบรอบฝึกนี้', 404);
  return row;
}

async function answer(userId, sid, itemId, ans) {
  const row = await sessionOf(userId, sid);
  if (!row.items.includes(itemId)) throw new L.C2Error('NOT_IN_SESSION', 'ข้อนี้ไม่อยู่ในรอบฝึกนี้');
  await S.ready();
  const p = I.parseItemId(itemId);
  const it = I.build(p.senseId, p.type, row.seed);
  if (!it) throw new L.C2Error('GONE', 'ข้อนี้ไม่พร้อมใช้งานแล้ว', 410);
  const fb = I.check(it, ans);
  const first = (await pool.query(
    `UPDATE c2_sessions SET answers = answers || jsonb_build_object($3::text, $4::boolean)
      WHERE id = $1 AND user_id = $2 AND finished_at IS NULL AND NOT (answers ? $3) RETURNING id`,
    [row.id, userId, itemId, fb.correct])).rowCount === 1;
  fb.counted = first;
  let g = { gained: 0, levelInfo: null, leveledUp: false };
  if (first) {
    const prog = await L.withClient((c) => L.recordSense(c, userId, p.senseId, fb.correct, { facet: fb.facet, source: `c2${row.mode}`.slice(0, 16) }));
    fb.senseStatus = prog.status;
    // ได้ครั้งเดียวต่อข้อต่อวัน — ทำซ้ำได้แต่ไม่ปั๊ม EXP
    if (fb.correct) g = await grantOnce(userId, `c2x:${itemId}:${bkkDay()}`, EXP.item, { reason: 'c2_practice' });
  }
  fb.exp = g.gained; fb.levelInfo = g.levelInfo; fb.leveledUp = g.leveledUp;
  return fb;
}

async function finish(userId, sid) {
  const row = await sessionOf(userId, sid);
  const ans = row.answers || {};
  const total = row.items.length; const answered = Object.keys(ans).length;
  const correct = Object.values(ans).filter(Boolean).length;
  if (!row.finished_at) await pool.query('UPDATE c2_sessions SET finished_at = NOW() WHERE id = $1', [row.id]);
  const grants = [];
  if (!row.finished_at && answered === total && correct === total) {
    grants.push(await grantOnce(userId, `c2xp:${row.mode}:${bkkDay()}`, EXP.perfect, { reason: 'c2_practice' }));
  }
  await S.ready();
  const wrong = row.items.filter((id) => ans[id] === false).map((id) => {
    const p = I.parseItemId(id); const s = S.get(p.senseId);
    return s ? { itemId: id, senseId: s.id, form: s.form, short: s.short, type: p.type, typeTh: I.TYPE_TH[p.type] } : null;
  }).filter(Boolean);
  const e = mergeGrants(grants);
  return { sessionId: Number(row.id), mode: row.mode, total, answered, correct, accuracy: answered ? Math.round((correct / answered) * 100) : 0,
    wrong, exp: e.gained, levelInfo: e.levelInfo, leveledUp: e.leveledUp };
}

module.exports = { start, answer, finish, pickSenses, c2Access, MODES, EXP };
