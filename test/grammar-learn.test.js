/*
  ระบบเรียนแกรมม่า A1–C1 (/api/gl)
  - หลักสูตรครบ 5 ระดับ · บทเรียน 6 ขั้น · ไม่ส่งเฉลยก่อนตอบ · feedback อธิบายเหตุผล + ทำไมข้ออื่นผิด
  - คำตอบที่ถูกได้หลายแบบ · การย่อคำ · นับคำตอบแรกเท่านั้น · EXP มีเพดาน
  - ทบทวนแบบเว้นระยะ · Mastery · Error Notebook · Placement แบบ Adaptive (แยกจาก Account Level/Rank)
  - Daily Challenge วันละครั้ง · Badge จากผลจริง · Progress · คำแนะนำ
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const GC = require('../data/grammar-curriculum');
const G = require('../services/grammar/engine');

let server; let base;
function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + path, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'gl') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
/** คำตอบที่ถูกของข้อ (ใช้ข้อมูลฝั่งเซิร์ฟเวอร์ในชุดทดสอบ) */
function rightAnswer(itemId) {
  const it = GC.getItem(itemId);
  if (['mc', 'choose', 'dialogue', 'context'].includes(it.type)) return it.answer;
  if (it.type === 'match') return it.pairs.map((_, i) => i);
  if (it.type === 'write') return it.sample;
  return it.accepted[0];
}
function wrongAnswer(itemId) {
  const it = GC.getItem(itemId);
  if (['mc', 'choose', 'dialogue', 'context'].includes(it.type)) return (it.answer + 1) % it.choices.length;
  if (it.type === 'match') return it.pairs.map((_, i) => (i + 1) % it.pairs.length);
  return 'zzz wrong answer';
}
const LEAK_KEYS = ['answer', 'accepted', 'whyNot', 'explainTh', 'sample', 'checks', 'pairs', 'errorPart'];

test.before(async () => {
  await pool.query('SELECT 1');
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(() => G._setNow(null));
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('หลักสูตร: A1–C1 ครบทุกหัวข้อ · Learning Map แยกระดับ · ระดับแกรมม่าไม่ใช้ Account Level', async () => {
  const u = await makeUser();
  await pool.query('UPDATE users SET exp = 99999 WHERE id = $1', [u.id]);   // เลเวลบัญชีสูง ≠ เก่งแกรมม่า
  const h = (await req('GET', '/api/gl/hub', { token: u.token })).body;
  assert.deepStrictEqual(h.levels.map((l) => l.id), ['A1', 'A2', 'B1', 'B2', 'C1']);
  assert.strictEqual(h.levels.reduce((a, l) => a + l.topics.length, 0), GC.TOPICS.length);
  assert.ok(h.levels.every((l) => l.topics.every((t) => t.available)), 'ทุกหัวข้อมีเนื้อหา');
  assert.strictEqual(h.level, null, 'ยังไม่วัดระดับ = ยังไม่มีระดับแกรมม่า (ไม่เดาจาก EXP)');
  assert.ok(h.recommendations.some((r) => r.kind === 'placement'));
});

test('บทเรียน 6 ขั้น: Concept / Structure / Examples / Mistakes / Compare / Practice · ไม่มีเฉลยในหน้าเรียน', async () => {
  const u = await makeUser();
  const t = (await req('GET', '/api/gl/topics/b1-pp-vs-past', { token: u.token })).body;
  assert.ok(t.concept.what && t.concept.when && t.concept.why);
  assert.ok(t.structure.formula && t.structure.rows.length >= 2);
  assert.ok(t.examples.length >= 5 && t.examples.every((e) => e.en && e.th));
  assert.ok(t.mistakes.length >= 3);
  assert.ok(t.compare && t.compare.rows.length >= 2 && t.compare.with.length >= 1);
  assert.ok(t.contexts.length >= 1 && t.terms.length >= 1);
  assert.strictEqual(t.practice, undefined, 'ไม่ส่งข้อแบบฝึก (และเฉลย) มากับหน้าเรียน');
  assert.ok(t.practiceTypes.length >= 6);
  assert.strictEqual((await req('POST', '/api/gl/topics/b1-pp-vs-past/step', { token: u.token, body: { step: 2 } })).status, 200);
});

test('แบบฝึก: ไม่ส่งเฉลย · หลายรูปแบบ · คำตอบถูกหลายแบบ/การย่อคำ · feedback ทำไมถูก + ทำไมข้ออื่นผิด · นับคำตอบแรก', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/gl/topics/a2-past-simple/practice', { token: u.token })).body;
  assert.ok(s.sessionId && s.items.length >= 8);
  assert.ok(new Set(s.items.map((i) => i.type)).size >= 5, 'สุ่มหลายรูปแบบ');
  s.items.forEach((i) => LEAK_KEYS.forEach((k) => assert.strictEqual(i[k], undefined, `${i.id} รั่ว ${k}`)));
  const mc = s.items.find((i) => ['mc', 'choose', 'dialogue', 'context'].includes(i.type));
  const wrong = await req('POST', `/api/gl/sessions/${s.sessionId}/answer`, { token: u.token, body: { itemId: mc.id, answer: wrongAnswer(mc.id) } });
  assert.strictEqual(wrong.body.correct, false);
  assert.ok(wrong.body.explainTh && wrong.body.yourMistake, 'อธิบายว่าคำตอบที่เลือกผิดเพราะอะไร');
  assert.ok(wrong.body.whyNot.length >= 2, 'Why not the other choices?');
  // ลองใหม่ข้อเดิม = ตอบถูกแต่ไม่นับ
  const retry = await req('POST', `/api/gl/sessions/${s.sessionId}/answer`, { token: u.token, body: { itemId: mc.id, answer: rightAnswer(mc.id) } });
  assert.strictEqual(retry.body.correct, true); assert.strictEqual(retry.body.counted, false);
  for (const it of s.items) if (it.id !== mc.id) await req('POST', `/api/gl/sessions/${s.sessionId}/answer`, { token: u.token, body: { itemId: it.id, answer: rightAnswer(it.id) } });
  const fin = (await req('POST', `/api/gl/sessions/${s.sessionId}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.correct, s.items.length - 1);
  assert.ok(fin.exp > 0);
  const n = (await pool.query('SELECT COUNT(*)::int AS n FROM grammar_attempts WHERE user_id = $1', [u.id])).rows[0].n;
  assert.strictEqual(n, s.items.length, 'บันทึกครั้งเดียวต่อข้อ');
  // คำตอบที่ถูกได้หลายแบบ + การย่อคำ (ผ่าน API จริง)
  const all = (await req('POST', '/api/gl/topics/a2-past-simple/practice', { token: u.token, body: { all: true } })).body;
  const neg = (await req('POST', `/api/gl/sessions/${all.sessionId}/answer`, { token: u.token, body: { itemId: 'a2-past-simple-03', answer: 'did not see' } })).body;
  assert.strictEqual(neg.correct, true);
  const contracted = (await req('POST', `/api/gl/sessions/${all.sessionId}/answer`, { token: u.token, body: { itemId: 'a2-past-simple-04', answer: 'did you go to school by bus' } })).body;
  assert.strictEqual(contracted.correct, true, 'ไม่สนตัวพิมพ์ใหญ่/เครื่องหมายท้ายประโยค');
  const outside = await req('POST', `/api/gl/sessions/${all.sessionId}/answer`, { token: u.token, body: { itemId: 'b1-passive-01', answer: 0 } });
  assert.strictEqual(outside.status, 400, 'ตอบข้อที่ไม่ได้อยู่ในชุดไม่ได้');
});

test('ทบทวนแบบเว้นระยะ: ผิด -> พรุ่งนี้ · ถูกในรอบทบทวน -> 3 วัน · ครบรอบ = เชี่ยวชาญ · Review Today', async () => {
  const u = await makeUser();
  const t0 = Date.now();
  G._setNow(() => t0);
  const s = (await req('POST', '/api/gl/topics/a1-verb-to-be/practice', { token: u.token, body: { all: true } })).body;
  const item = s.items.find((i) => i.type === 'fill');
  await req('POST', `/api/gl/sessions/${s.sessionId}/answer`, { token: u.token, body: { itemId: item.id, answer: wrongAnswer(item.id) } });
  let rv = (await pool.query('SELECT * FROM grammar_reviews WHERE user_id = $1 AND item_id = $2', [u.id, item.id])).rows[0];
  assert.strictEqual(rv.stage, 0);
  assert.ok(Math.abs(new Date(rv.due_at).getTime() - (t0 + 86400000)) < 2000, 'ทบทวนพรุ่งนี้');
  assert.strictEqual((await req('GET', '/api/gl/review', { token: u.token })).body.due, 0, 'ยังไม่ถึงกำหนด');
  G._setNow(() => t0 + 86400000 + 1000);
  assert.strictEqual((await req('GET', '/api/gl/review', { token: u.token })).body.due, 1);
  const r = (await req('POST', '/api/gl/review/start', { token: u.token })).body;
  assert.ok(r.items.some((i) => i.id === item.id));
  await req('POST', `/api/gl/sessions/${r.sessionId}/answer`, { token: u.token, body: { itemId: item.id, answer: rightAnswer(item.id) } });
  rv = (await pool.query('SELECT * FROM grammar_reviews WHERE user_id = $1 AND item_id = $2', [u.id, item.id])).rows[0];
  assert.strictEqual(rv.stage, 1);
  assert.ok(Math.abs(new Date(rv.due_at).getTime() - (t0 + 4 * 86400000 + 1000)) < 2000, 'ถัดไป 3 วัน');
  // ถูกนอกรอบก่อนถึงกำหนด ไม่เลื่อนขั้น (กันจำระยะสั้น)
  const p2 = (await req('POST', '/api/gl/topics/a1-verb-to-be/practice', { token: u.token, body: { all: true } })).body;
  await req('POST', `/api/gl/sessions/${p2.sessionId}/answer`, { token: u.token, body: { itemId: item.id, answer: rightAnswer(item.id) } });
  assert.strictEqual((await pool.query('SELECT stage FROM grammar_reviews WHERE user_id = $1 AND item_id = $2', [u.id, item.id])).rows[0].stage, 1);
  assert.deepStrictEqual(G.INTERVALS, [1, 3, 7, 14, 30]);
});

test('Mastery: ใช้ความแม่นยำ + จำนวนครั้ง + ผลล่าสุด + ความยาก + การทบทวน (ไม่ใช่จำนวนข้อถูกสะสมอย่างเดียว)', () => {
  const t = Date.now(); const d = 86400000;
  const mk = (arr, opt = {}) => arr.map((c, i) => ({ c, d: opt.d || 2, src: opt.src || 'practice', t: t - (arr.length - i) * (opt.gap || 3600000) }));
  const few = G.masteryOf(mk([1, 1, 1]), t); const many = G.masteryOf(mk(Array(12).fill(1)), t);
  assert.ok(few < many, 'ตอบถูก 3 ครั้ง < ถูก 12 ครั้ง (ความมั่นใจ)');
  assert.strictEqual(many, 100);
  const recentBad = G.masteryOf(mk([1, 1, 1, 1, 1, 1, 1, 0, 0, 0]), t); const recentGood = G.masteryOf(mk([0, 0, 0, 1, 1, 1, 1, 1, 1, 1]), t);
  assert.ok(recentGood > recentBad, 'ผลล่าสุดสำคัญกว่า');
  const stale = G.masteryOf(mk(Array(12).fill(1)), t + 90 * d);
  assert.ok(stale < many, 'ไม่ได้ฝึกนาน mastery ลดลง');
  const hard = G.masteryOf(mk([1, 1, 1, 0, 0, 0, 1, 1, 1, 1], { d: 3 }).map((a, i) => ({ ...a, d: a.c ? 3 : 1 })), t);
  const easy = G.masteryOf(mk([1, 1, 1, 0, 0, 0, 1, 1, 1, 1]).map((a) => ({ ...a, d: a.c ? 1 : 3 })), t);
  assert.ok(hard > easy, 'ตอบข้อยากถูกมีน้ำหนักมากกว่า');
  assert.strictEqual(G.statusOf(90, 10), 'mastered'); assert.strictEqual(G.statusOf(90, 3), 'learning'); assert.strictEqual(G.statusOf(30, 6), 'weak');
});

test('Placement แบบ Adaptive: เริ่ม A2 · ถูกมาก = ยากขึ้นถึง C1 · ผิดมาก = ลดลง A1 · ไม่ถาม A1 ทั้งหมด · ผลแยกจาก EXP/Rank', async () => {
  async function run(u, strategy) {
    let s = (await req('POST', '/api/gl/placement/start', { token: u.token })).body;
    assert.strictEqual(s.item.cefr, 'A2', 'เริ่มที่ระดับกลาง (A2)');
    LEAK_KEYS.forEach((k) => assert.strictEqual(s.item[k], undefined));
    const seen = [s.item.cefr];
    let cur = s.item; let res;
    for (let i = 0; i < 40; i++) {
      const r = (await req('POST', `/api/gl/placement/${s.id}/answer`, { token: u.token, body: { itemId: cur.id, answer: strategy(cur) } })).body;
      assert.strictEqual(r.correct, undefined, 'ไม่บอกผลระหว่างสอบ');
      if (r.done) { res = r.result; break; }
      cur = r.item; seen.push(cur.cefr);
    }
    return { res, seen };
  }
  const expBefore = 0;
  const strong = await makeUser();
  const a = await run(strong, (it) => rightAnswer(it.id));
  assert.strictEqual(a.res.level, 'C1');
  assert.ok(a.seen.includes('C1') && !a.seen.includes('A1'), 'คนเก่งไม่ต้องทำข้อ A1');
  assert.ok(a.seen.length <= 28);
  assert.ok(a.res.strong.length > 0);
  const weak = await makeUser();
  const b = await run(weak, (it) => wrongAnswer(it.id));
  assert.strictEqual(b.res.level, 'A1');
  assert.ok(b.res.needsPractice.length > 0);
  const mid = await makeUser();
  const c = await run(mid, (it) => (['A1', 'A2', 'B1'].includes(it.cefr) ? rightAnswer(it.id) : wrongAnswer(it.id)));
  assert.strictEqual(c.res.level, 'B1');
  // ระดับแกรมม่าเก็บแยก — ไม่แตะ EXP / Rank
  const prof = (await pool.query('SELECT cefr, cefr_source FROM grammar_profiles WHERE user_id = $1', [mid.id])).rows[0];
  assert.deepStrictEqual(prof, { cefr: 'B1', cefr_source: 'placement' });
  assert.strictEqual((await pool.query('SELECT exp FROM users WHERE id = $1', [mid.id])).rows[0].exp, expBefore);
  const h = (await req('GET', '/api/gl/hub', { token: mid.token })).body;
  assert.strictEqual(h.level, 'B1'); assert.strictEqual(h.placementTaken, true);
});

test('My Grammar Mistakes: คำถาม · คำตอบเรา · เฉลย · คำอธิบาย · กรองตาม CEFR/หัวข้อ/สถานะ', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/gl/topics/b1-passive/practice', { token: u.token, body: { all: true } })).body;
  const it = s.items.find((i) => i.type === 'mc' || i.type === 'choose');
  await req('POST', `/api/gl/sessions/${s.sessionId}/answer`, { token: u.token, body: { itemId: it.id, answer: wrongAnswer(it.id) } });
  const s2 = (await req('POST', '/api/gl/topics/a1-articles/practice', { token: u.token, body: { all: true } })).body;
  const it2 = s2.items.find((i) => i.type === 'fill');
  await req('POST', `/api/gl/sessions/${s2.sessionId}/answer`, { token: u.token, body: { itemId: it2.id, answer: 'zzz' } });
  const m = (await req('GET', '/api/gl/mistakes', { token: u.token })).body;
  assert.strictEqual(m.total, 2);
  const row = m.items.find((x) => x.itemId === it.id);
  assert.ok(row.question && row.yours && row.correct && row.explainTh && row.whyNot);
  assert.strictEqual(row.mastered, false);
  assert.deepStrictEqual(m.topics.map((t) => t.topicId).sort(), ['a1-articles', 'b1-passive']);
  assert.strictEqual((await req('GET', '/api/gl/mistakes?cefr=A1', { token: u.token })).body.total, 1);
  assert.strictEqual((await req('GET', '/api/gl/mistakes?topic=b1-passive', { token: u.token })).body.total, 1);
  assert.strictEqual((await req('GET', '/api/gl/mistakes?status=mastered', { token: u.token })).body.total, 0);
  // Try again -> ชุดทบทวนเฉพาะข้อนั้น
  const tr = (await req('POST', '/api/gl/review/start', { token: u.token, body: { itemIds: [it.id] } })).body;
  assert.deepStrictEqual(tr.items.map((x) => x.id), [it.id]);
});

test('Daily Grammar Challenge: วันละครั้ง · EXP ครั้งเดียว · ต้องตอบครบ', async () => {
  const u = await makeUser();
  const d = (await req('GET', '/api/gl/daily', { token: u.token })).body;
  assert.strictEqual(d.completed, false);
  assert.ok(d.items.length >= 5 && d.items.length <= 10);
  assert.strictEqual((await req('POST', '/api/gl/daily/finish', { token: u.token, body: { sessionId: d.sessionId } })).status, 400, 'ต้องตอบครบ');
  for (const it of d.items) await req('POST', `/api/gl/sessions/${d.sessionId}/answer`, { token: u.token, body: { itemId: it.id, answer: rightAnswer(it.id) } });
  const f = (await req('POST', '/api/gl/daily/finish', { token: u.token, body: { sessionId: d.sessionId } })).body;
  assert.strictEqual(f.correct, d.items.length); assert.ok(f.exp > 0); assert.strictEqual(f.perfect, true);
  assert.ok(f.newBadges.some((b) => b.id === 'no-mistakes'), 'Badge จากผลจริง');
  const again = (await req('GET', '/api/gl/daily', { token: u.token })).body;
  assert.strictEqual(again.completed, true);
  assert.strictEqual((await req('POST', '/api/gl/daily/finish', { token: u.token, body: { sessionId: d.sessionId } })).status, 409);
  const n = (await pool.query("SELECT COUNT(*)::int AS n FROM exp_log WHERE user_id = $1 AND reason = 'grammar_daily'", [u.id])).rows[0].n;
  assert.strictEqual(n, 1);
});

test('Badge ต้องมาจาก mastery จริง: เปิดบทเรียนเฉย ๆ ไม่ได้ Badge · Perfect 10 ต้องถูกครบจริง', async () => {
  const u = await makeUser();
  await req('GET', '/api/gl/topics/a1-articles', { token: u.token });
  for (let s = 1; s <= 6; s++) await req('POST', '/api/gl/topics/a1-articles/step', { token: u.token, body: { step: s } });
  let b = (await req('GET', '/api/gl/badges', { token: u.token })).body.badges;
  assert.ok(b.every((x) => !x.earned));
  const s = (await req('POST', '/api/gl/topics/a1-articles/practice', { token: u.token, body: { all: true } })).body;
  for (const it of s.items) await req('POST', `/api/gl/sessions/${s.sessionId}/answer`, { token: u.token, body: { itemId: it.id, answer: rightAnswer(it.id) } });
  const f = (await req('POST', `/api/gl/sessions/${s.sessionId}/finish`, { token: u.token })).body;
  assert.ok(f.newBadges.some((x) => x.id === 'perfect-10'));
  assert.ok(f.newBadges.some((x) => x.id === 'article-apprentice'), 'mastery Articles ≥ 70% จากการตอบถูกจริง');
  b = (await req('GET', '/api/gl/badges', { token: u.token })).body.badges;
  assert.ok(!b.find((x) => x.id === 'grammar-guardian').earned);
});

test('Grammar Progress: ระดับ · mastery รวม · ความแม่นยำ · จำนวนข้อ · หัวข้อที่เชี่ยวชาญ/ควรฝึก · กราฟ 7/30/ทั้งหมด · คำแนะนำ', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/gl/topics/a1-present-simple/practice', { token: u.token, body: { all: true } })).body;
  for (const [i, it] of s.items.entries()) await req('POST', `/api/gl/sessions/${s.sessionId}/answer`, { token: u.token, body: { itemId: it.id, answer: i % 3 === 0 ? wrongAnswer(it.id) : rightAnswer(it.id) } });
  const p7 = (await req('GET', '/api/gl/progress?range=7', { token: u.token })).body;
  assert.strictEqual(p7.series.length, 7);
  assert.strictEqual(p7.answered, s.items.length);
  assert.ok(p7.accuracy > 50 && p7.accuracy < 80);
  assert.ok(p7.overallMastery > 0);
  assert.strictEqual((await req('GET', '/api/gl/progress?range=30', { token: u.token })).body.series.length, 30);
  assert.ok((await req('GET', '/api/gl/progress?range=all', { token: u.token })).body.series.length >= 1);
  const h = (await req('GET', '/api/gl/hub', { token: u.token })).body;
  assert.ok(h.recommendations.some((r) => r.kind === 'mistakes' || r.kind === 'next'));
  const terms = (await req('GET', '/api/gl/terms', { token: u.token })).body.terms;
  assert.ok(terms.length > 50 && terms.every((t) => t.en && t.th));
});

test('Grammar Battle (Ranked): คำถามจากคลัง A1–C1 ตามระดับแกรมม่า · หน้าก่อนเริ่มมีระดับ/หัวข้อ · ผลมี breakdown + หัวข้อ · บันทึกกลับระบบเรียน', async () => {
  const u = await makeUser('gb');
  await G.setLevel(u.id, 'B1', 'placement');
  const s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode: 'grammar' } }));
  assert.strictEqual(s.status, 200, JSON.stringify(s.body));
  assert.strictEqual(s.body.cefr, 'B1', 'ใช้ระดับแกรมม่า ไม่ใช่ผลวัดระดับรวม/แรงค์');
  assert.ok(s.body.grammar && s.body.grammar.level === 'B1' && s.body.grammar.total === 10 && s.body.grammar.topics.length >= 3);
  assert.ok(!JSON.stringify(s.body.question).includes('correctIndex'), 'ไม่ส่งเฉลย');
  const row = (await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [s.body.matchId])).rows[0];
  assert.ok(row.questions.every((q) => q.id.startsWith('gc:') && ['A2', 'B1', 'B2'].includes(q.cefr)));
  assert.ok(row.questions.filter((q) => q.cefr === 'B1').length >= 7, 'ส่วนใหญ่เป็นระดับของผู้เล่น');
  let st = s.body; let k = 0; let wrongItem = null;
  while (st.status === 'active') {
    const q = row.questions[st.index];
    const choice = k === 0 ? (q.correctIndex + 1) % q.choices.length : q.correctIndex;
    if (k === 0) wrongItem = q.ref.glItem;
    await req('POST', `/api/ranked/matches/${st.matchId}/answer`, { token: u.token, body: { questionIndex: st.index, choiceIndex: choice } });
    st = (await req('POST', `/api/ranked/matches/${st.matchId}/next`, { token: u.token })).body;
    k += 1;
  }
  const r = st.result;
  assert.strictEqual(r.correct, 9);
  assert.ok(r.breakdown && r.breakdown.accuracyScore === 9 * 700 && r.breakdown.speedBonus >= 0 && r.breakdown.maxStreak === 9 && r.breakdown.streakBonus > 0);
  assert.ok(Array.isArray(r.grammarTopics) && r.grammarTopics.reduce((a, t) => a + t.total, 0) === 10);
  assert.ok(r.grammarTopics.some((t) => t.correct < t.total));
  await new Promise((res) => setTimeout(res, 300));   // บันทึกกลับระบบเรียนทำแบบไม่บล็อกเกม
  const att = (await pool.query("SELECT item_id, correct, answer FROM grammar_attempts WHERE user_id = $1 AND source = 'ranked'", [u.id])).rows;
  assert.strictEqual(att.length, 10);
  const w = att.find((a) => a.item_id === wrongItem);
  assert.ok(w && !w.correct && Number.isInteger(w.answer) && w.answer !== GC.getItem(wrongItem).answer, 'เก็บดัชนีตัวเลือกเดิม (ก่อนสลับ)');
  const m = (await req('GET', '/api/gl/mistakes', { token: u.token })).body;
  assert.ok(m.items.some((x) => x.itemId === wrongItem), 'ข้อที่พลาดในเกมเข้า My Grammar Mistakes');
  // โหมดคำศัพท์ไม่ได้รับผลกระทบ
  const v = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode: 'vocab' } })).body;
  const vq = (await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [v.matchId])).rows[0].questions;
  assert.ok(vq.every((q) => !q.id.startsWith('gc:')) && !v.grammar);
});

test('Grammar Battle: ระดับปรับตามผลงานล่าสุด (แม่นมาก +1 · พลาดมาก −1)', async () => {
  const GB = require('../services/ranked/grammarBank');
  const u = await makeUser('gba');
  await G.setLevel(u.id, 'A2', 'placement');
  assert.strictEqual((await GB.effectiveLevel(u.id, pool)).cefr, 'A2');
  const items = GC.allItems().filter((it) => it.cefr === 'A2').slice(0, 25);
  for (const it of items) await G.recordAttempt(u.id, it, true, null, 'practice');
  const up = await GB.effectiveLevel(u.id, pool);
  assert.strictEqual(up.cefr, 'B1'); assert.strictEqual(up.adjust, 1);
  const u2 = await makeUser('gbb');
  await G.setLevel(u2.id, 'B2', 'placement');
  for (const it of GC.allItems().filter((x) => x.cefr === 'B2').slice(0, 25)) await G.recordAttempt(u2.id, it, false, null, 'practice');
  assert.strictEqual((await GB.effectiveLevel(u2.id, pool)).cefr, 'B1');
});

test('Writing Practice: โจทย์ครบทุกระดับ · ตรวจแล้วอธิบายเหตุผล · EXP ครั้งแรกที่ผ่านเท่านั้น · ประวัติ', async () => {
  const u = await makeUser('gw');
  const p = (await req('GET', '/api/gl/writing', { token: u.token })).body;
  assert.ok(p.prompts.length >= 70);
  for (const L of ['A1', 'A2', 'B1', 'B2', 'C1']) assert.ok(p.prompts.some((x) => x.cefr === L), L);
  assert.ok(p.prompts.every((x) => !('sample' in x) && !('checks' in x)), 'ไม่ส่งตัวอย่างคำตอบก่อนเขียน');
  const it = GC.allItems().find((x) => x.type === 'write' && x.expectTense === 'past');
  const bad = (await req('POST', '/api/gl/writing/check', { token: u.token, body: { promptId: it.id, text: 'yesterday i go to a umbrella shop. She dont like it' } })).body;
  assert.strictEqual(bad.passed, false);
  assert.ok(bad.issues.some((i) => i.type === 'article' && i.suggestion === 'an umbrella'));
  assert.ok(bad.issues.some((i) => i.type === 'agreement'));
  assert.ok(bad.issues.some((i) => i.type === 'tense'));
  assert.ok(bad.sample && bad.explainTh && bad.topic.id === it.topic, 'มีตัวอย่าง + คำอธิบาย + หัวข้อ');
  assert.strictEqual(bad.exp, 0);
  const good = (await req('POST', '/api/gl/writing/check', { token: u.token, body: { promptId: it.id, text: it.sample } })).body;
  assert.strictEqual(good.passed, true, JSON.stringify(good.issues));
  assert.ok(good.exp > 0);
  const again = (await req('POST', '/api/gl/writing/check', { token: u.token, body: { promptId: it.id, text: it.sample } })).body;
  assert.strictEqual(again.exp, 0, 'EXP ครั้งแรกที่ผ่านเท่านั้น');
  assert.strictEqual((await req('POST', '/api/gl/writing/check', { token: u.token, body: { promptId: it.id, text: '   ' } })).status, 400);
  assert.strictEqual((await req('POST', '/api/gl/writing/check', { token: u.token, body: { promptId: 'nope', text: 'Hi.' } })).status, 404);
  const h = (await req('GET', '/api/gl/writing/history', { token: u.token })).body;
  assert.strictEqual(h.items.length, 3);
  const n = (await pool.query("SELECT COUNT(*)::int AS n FROM grammar_attempts WHERE user_id = $1 AND source = 'writing'", [u.id])).rows[0].n;
  assert.strictEqual(n, 3, 'งานเขียนนับเป็นการฝึกของหัวข้อ');
});
