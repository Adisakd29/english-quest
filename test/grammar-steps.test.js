/*
  บทเรียนแกรมม่าทีละขั้น + EXP บัญชีเดียว
  - แผน 12 ขั้น ครบทุกหัวข้อ · ข้อไม่ซ้ำในรอบ · มีแบบฝึกชนิดใหม่ (ลากคำ / หาคำผิด)
  - เรียนข้ามขั้นไม่ได้ · ขั้นแบบฝึกต้องตอบครบก่อนผ่าน · เปิดอ่านอย่างเดียวไม่นับผ่านบท
  - ผ่านบท >= 80% · Perfect · เชี่ยวชาญ = ผ่าน + mastery >= 85% + ทบทวนผ่าน
  - EXP: จบขั้น +2 · ตอบถูก +3 · จบบท +10 · Perfect +5 — ครั้งเดียวต่อคีย์ (refresh/ทำซ้ำ/ส่งพร้อมกันไม่ได้ซ้ำ)
  - คำศัพท์ + แกรมม่า + Ranked เข้า users.exp ตัวเดียว · Account Level คำนวณจากค่าเดียวกัน · exp_log ตรงกับ users.exp
  - ปลดล็อกบนแผนที่ · เรียนต่อ (Continue Learning) · ความคืบหน้าเก็บที่เซิร์ฟเวอร์
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
const L = require('../services/grammar/lesson');
const { getLevelInfo } = require('../utils/leveling');

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
async function makeUser(prefix = 'gs') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
/** คำตอบที่ถูก/ผิดตามโหมดของข้อในบทเรียน */
function right(it) {
  const src = GC.getItem(it.id);
  if (it.mode === 'detect') {
    const err = src.errorPart.split(/\s+/)[0].toLowerCase().replace(/[^a-z']/g, '');
    return it.tokens.findIndex((w) => w.toLowerCase().replace(/[^a-z']/g, '') === err);
  }
  if (['mc', 'choose', 'dialogue', 'context'].includes(src.type)) return src.answer;
  if (src.type === 'match') return src.pairs.map((_, i) => i);
  if (src.type === 'write') return src.sample;
  return src.accepted[0];
}
function wrong(it) {
  const src = GC.getItem(it.id);
  if (it.mode === 'detect') return it.tokens.findIndex((w) => !src.errorPart.toLowerCase().split(/\s+/).includes(w.toLowerCase().replace(/[^a-z']/g, '')));
  if (['mc', 'choose', 'dialogue', 'context'].includes(src.type)) return (src.answer + 1) % src.choices.length;
  if (src.type === 'match') return src.pairs.map((_, i) => (i + 1) % src.pairs.length);
  return 'zzz wrong';
}
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;
const logSum = async (id) => (await pool.query('SELECT COALESCE(SUM(amount),0)::int AS n FROM exp_log WHERE user_id = $1', [id])).rows[0].n;

/** เรียนทั้งบท: answerFn(item, k) คืนคำตอบ */
async function runLesson(u, topicId, answerFn) {
  const ov = (await req('GET', `/api/gl/lessons/${topicId}`, { token: u.token })).body;
  let last = null;
  for (let k = ov.current; k < ov.total; k += 1) {
    const st = (await req('GET', `/api/gl/lessons/${topicId}/steps/${k}`, { token: u.token })).body;
    for (const it of st.content.items || []) {
      await req('POST', `/api/gl/lessons/${topicId}/steps/${k}/answer`, { token: u.token, body: { itemId: it.id, answer: answerFn(it, k) } });
    }
    last = (await req('POST', `/api/gl/lessons/${topicId}/steps/${k}/complete`, { token: u.token })).body;
  }
  return last;
}

test.before(async () => {
  await pool.query('SELECT 1');
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('แผนบทเรียน: ทุกหัวข้อมี 12 ขั้น สลับ Learn/แบบฝึก · ข้อไม่ซ้ำ · มีลากคำ/หาคำผิด · ไม่ใช้ข้อเขียนยาว', () => {
  let drag = 0; let detect = 0;
  for (const t of GC.TOPICS) {
    const p = L.buildPlan(t.id, `u:${t.id}:1`);
    assert.strictEqual(p.length, 12, t.id);
    assert.deepStrictEqual(p.map((s) => s.kind === 'check'), [false, false, false, true, false, true, false, true, false, true, false, true], `${t.id}: Learn → Check สลับกัน`);
    assert.deepStrictEqual(p.filter((s) => s.kind === 'check').map((s) => s.role), ['quick', 'practice', 'practice', 'challenge', 'mastery']);
    const ids = p.flatMap((s) => (s.items || []).map((i) => i.id));
    assert.strictEqual(new Set(ids).size, ids.length, `${t.id}: ข้อซ้ำในรอบเดียว`);
    assert.ok(ids.length >= 10, `${t.id}: มีแบบฝึก ${ids.length}`);
    for (const id of ids) assert.notStrictEqual(GC.getItem(id).type, 'write');
    const types = new Set(ids.map((id) => GC.getItem(id).type));
    assert.ok(types.size >= 4, `${t.id}: ชนิดแบบฝึกหลากหลาย (${[...types]})`);
    const modes = p.flatMap((s) => (s.items || []).map((i) => i.mode));
    if (modes.includes('drag')) drag += 1;
    if (modes.includes('detect')) detect += 1;
    // seed เดิม = แผนเดิม (refresh/เปลี่ยนเครื่องได้ชุดเดิม) · รอบใหม่ = ชุดข้อเปลี่ยน
    assert.deepStrictEqual(L.buildPlan(t.id, `u:${t.id}:1`), p);
  }
  assert.ok(drag >= 70 && detect === GC.TOPICS.length, `drag ${drag} detect ${detect}`);
});

test('เรียนทีละขั้น: ข้ามขั้นไม่ได้ · ขั้นแบบฝึกต้องตอบครบ · ไม่ส่งเฉลยก่อนตอบ · EXP จบขั้น/ตอบถูกได้ครั้งเดียว · HUD ได้ levelInfo', async () => {
  const u = await makeUser();
  const T = 'a1-subject-pronouns';
  const s0 = await req('GET', `/api/gl/lessons/${T}/steps/0`, { token: u.token });
  assert.strictEqual(s0.status, 200);
  assert.strictEqual(s0.body.content.question.includes('Subject Pronouns'), true);
  assert.strictEqual((await req('GET', `/api/gl/lessons/${T}/steps/3`, { token: u.token })).status, 403, 'ข้ามขั้นไม่ได้');
  const e0 = await userExp(u.id);
  const c0 = (await req('POST', `/api/gl/lessons/${T}/steps/0/complete`, { token: u.token })).body;
  assert.strictEqual(c0.exp, L.EXP.step); assert.strictEqual(L.EXP.step, 5); assert.ok(c0.levelInfo && c0.levelInfo.exp === e0 + L.EXP.step);
  // refresh แล้วกดจบขั้นเดิมซ้ำ -> ไม่ได้ EXP ซ้ำ
  const again = (await req('POST', `/api/gl/lessons/${T}/steps/0/complete`, { token: u.token })).body;
  assert.strictEqual(again.exp, 0);
  for (const k of [1, 2]) await req('POST', `/api/gl/lessons/${T}/steps/${k}/complete`, { token: u.token });
  const s3 = (await req('GET', `/api/gl/lessons/${T}/steps/3`, { token: u.token })).body;
  assert.strictEqual(s3.step.role, 'quick');
  const leak = JSON.stringify(s3.content);
  for (const key of ['"answer"', '"accepted"', '"whyNot"', '"explainTh"', '"errorPart"', '"pairs"']) assert.ok(!leak.includes(key), `ไม่ส่ง ${key}`);
  assert.strictEqual((await req('POST', `/api/gl/lessons/${T}/steps/3/complete`, { token: u.token })).status, 400, 'ยังไม่ได้ตอบ');
  const [a, b] = s3.content.items;
  // ส่งคำตอบถูกพร้อมกัน 3 ครั้ง -> นับครั้งเดียว ได้ +3 ครั้งเดียว
  const before = await userExp(u.id);
  const triple = await Promise.all([1, 2, 3].map(() => req('POST', `/api/gl/lessons/${T}/steps/3/answer`, { token: u.token, body: { itemId: a.id, answer: right(a) } })));
  assert.strictEqual(triple.filter((r) => r.body.counted).length, 1);
  assert.strictEqual(triple.reduce((x, r) => x + r.body.exp, 0), L.EXP.check.A1);
  assert.strictEqual(await userExp(u.id), before + L.EXP.check.A1);
  const w = (await req('POST', `/api/gl/lessons/${T}/steps/3/answer`, { token: u.token, body: { itemId: b.id, answer: wrong(b) } })).body;
  assert.strictEqual(w.correct, false); assert.strictEqual(w.exp, 0); assert.ok(w.explainTh, 'มีคำอธิบาย');
  const retry = (await req('POST', `/api/gl/lessons/${T}/steps/3/answer`, { token: u.token, body: { itemId: b.id, answer: right(b) } })).body;
  assert.strictEqual(retry.counted, false, 'ลองใหม่ไม่นับคะแนน'); assert.strictEqual(retry.exp, 0);
  assert.strictEqual((await req('POST', `/api/gl/lessons/${T}/steps/3/answer`, { token: u.token, body: { itemId: 'a2-past-simple-01', answer: 0 } })).status, 400, 'ข้อนอกขั้น');
  assert.strictEqual((await req('POST', `/api/gl/lessons/${T}/steps/3/complete`, { token: u.token })).status, 200);
  // ความคืบหน้าอยู่ที่เซิร์ฟเวอร์ (เครื่องอื่น/ล็อกอินใหม่เห็นเหมือนกัน)
  const ov = (await req('GET', `/api/gl/lessons/${T}`, { token: u.token })).body;
  assert.strictEqual(ov.current, 4); assert.strictEqual(ov.state, 'in_progress');
  assert.deepStrictEqual(ov.steps.filter((s) => s.done).map((s) => s.k), [0, 1, 2, 3]);
  const cont = (await req('GET', '/api/gl/continue', { token: u.token })).body.lesson;
  assert.strictEqual(cont.topicId, T); assert.strictEqual(cont.step, 5); assert.strictEqual(cont.total, 12);
  assert.strictEqual(await userExp(u.id), await logSum(u.id), 'users.exp = ผลรวม exp_log (ไม่มี EXP ลอย)');
});

test('ผ่านบท >= 80% · Perfect +5 · ได้ครั้งเดียวแม้เรียนรอบใหม่ · ต่ำกว่า 80% ไม่ผ่าน · เปิดอ่านอย่างเดียวไม่ผ่าน', async () => {
  const u = await makeUser();
  const T = 'a1-subject-pronouns';
  // เปิดอ่านขั้น Learn ทั้งหมดแต่ตอบผิดทุกข้อ -> ไม่ผ่าน
  const fail = await runLesson(u, T, (it) => wrong(it));
  assert.strictEqual(fail.result.passed, false);
  assert.ok(fail.result.accuracy < 80);
  let hub = (await req('GET', '/api/gl/hub', { token: u.token })).body;
  const st = (id) => hub.levels.flatMap((x) => x.topics).find((t) => t.id === id).lesson.state;
  assert.strictEqual(st(T), 'in_progress');
  // รอบใหม่ ตอบถูกหมด -> ผ่าน + Perfect
  const before = await userExp(u.id);
  await req('POST', `/api/gl/lessons/${T}/restart`, { token: u.token });
  const ok = await runLesson(u, T, (it) => right(it));
  assert.strictEqual(ok.result.passed, true); assert.strictEqual(ok.result.accuracy, 100);
  const gained = (await userExp(u.id)) - before;
  // ขั้น (เคยได้แล้วรอบแรก = 0) + ตอบถูกครั้งแรก 3/ข้อ + จบบท 10 + Perfect 5
  const nItems = L.buildPlan(T, L._seedOf(u.id, T, 2)).flatMap((s) => s.items || []).length;
  const firstCorrect = (await pool.query("SELECT COUNT(*)::int AS n FROM exp_awards WHERE user_id = $1 AND award_key LIKE 'glq:%'", [u.id])).rows[0].n;
  assert.ok(firstCorrect <= nItems * 2);
  assert.ok(gained >= L.EXP.complete + L.EXP.perfect, `ได้ ${gained}`);
  hub = (await req('GET', '/api/gl/hub', { token: u.token })).body;
  assert.strictEqual(st(T), 'completed');
  // เรียนซ้ำอีกรอบ (ถูกหมด) -> ไม่ได้ EXP จบบท/Perfect/จบขั้นซ้ำ
  await req('POST', `/api/gl/lessons/${T}/restart`, { token: u.token });
  const b2 = await userExp(u.id);
  const again = await runLesson(u, T, (it) => right(it));
  assert.strictEqual(again.result.passed, true);
  const awards = (await pool.query("SELECT award_key FROM exp_awards WHERE user_id = $1 AND (award_key LIKE 'glc:%' OR award_key LIKE 'glp:%' OR award_key LIKE 'gls:%')", [u.id])).rows;
  assert.strictEqual(awards.length, 12 + 2, 'จบขั้น 12 + จบบท 1 + Perfect 1');
  const g3 = (await userExp(u.id)) - b2;
  assert.ok(g3 <= nItems * L.EXP.check.A1, `รอบซ้ำได้เฉพาะข้อที่ไม่เคยตอบถูกมาก่อน (${g3})`);
  assert.strictEqual(await userExp(u.id), await logSum(u.id));
});

test('เชี่ยวชาญ = ผ่านบท + mastery >= 85% + ทบทวนผ่าน · ปลดล็อกบนแผนที่ทีละบท / ตามระดับแกรมม่า', async () => {
  const u = await makeUser();
  let hub = (await req('GET', '/api/gl/hub', { token: u.token })).body;
  const topic = (id) => hub.levels.flatMap((x) => x.topics).find((t) => t.id === id);
  const A1 = GC.TOPICS.filter((t) => t.cefr === 'A1');
  assert.strictEqual(topic(A1[0].id).lesson.state, 'available');
  assert.strictEqual(topic(A1[1].id).lesson.state, 'locked');
  assert.strictEqual(topic('b1-passive').lesson.state, 'locked');
  await runLesson(u, A1[0].id, (it) => right(it));
  hub = (await req('GET', '/api/gl/hub', { token: u.token })).body;
  assert.strictEqual(topic(A1[0].id).lesson.state, 'completed');
  assert.strictEqual(topic(A1[1].id).lesson.state, 'available', 'บทถัดไปปลดล็อกเมื่อผ่าน');
  // ทบทวนผ่าน + mastery สูง -> เชี่ยวชาญ
  const items = GC.getTopic(A1[0].id).practice.filter((p) => p.type !== 'write').slice(0, 6).map((p) => GC.getItem(p.id));
  for (const it of items) await G.recordAttempt(u.id, it, true, null, 'review');
  hub = (await req('GET', '/api/gl/hub', { token: u.token })).body;
  assert.ok(topic(A1[0].id).mastery >= 85, `mastery ${topic(A1[0].id).mastery}`);
  assert.strictEqual(topic(A1[0].id).lesson.state, 'mastered');
  // ผู้เรียนระดับ B1 (จากการวัดระดับ): A1–B1 เปิดหมด · B2 บทแรกยังล็อกจนผ่าน B1 >= 60%
  const v = await makeUser('gsv');
  await G.setLevel(v.id, 'B1', 'placement');
  const h2 = (await req('GET', '/api/gl/hub', { token: v.token })).body;
  const all = h2.levels.flatMap((x) => x.topics);
  assert.ok(all.filter((t) => ['A1', 'A2', 'B1'].includes(GC.TOPIC_BY_ID[t.id].cefr)).every((t) => t.lesson.unlocked));
  assert.strictEqual(all.find((t) => t.id === GC.TOPICS.find((x) => x.cefr === 'B2').id).lesson.state, 'locked');
});

test('EXP บัญชีเดียว: คำศัพท์ + แกรมม่า + Ranked เข้า users.exp เดียวกัน · เลเวลคำนวณจากค่าเดียว · ไม่ซ้ำ', async () => {
  const u = await makeUser('gse');
  const wordStore = require('../utils/wordStore');
  await wordStore.ready();
  const w = wordStore.getLevelWords('A1').find((x) => ['noun', 'verb', 'adj'].includes(x.category)) || wordStore.getLevelWords('A1')[0];
  const e0 = await userExp(u.id);
  const v = (await req('POST', '/api/progress/review', { token: u.token, body: { wordId: w.id, level: 'A1', chosenWordId: w.id } })).body;
  assert.ok(v.gainedExp > 0, JSON.stringify(v) + JSON.stringify(w));
  const e1 = await userExp(u.id); assert.strictEqual(e1, e0 + v.gainedExp);
  const g = (await req('POST', '/api/gl/lessons/a1-subject-pronouns/steps/0/complete', { token: u.token }));
  assert.strictEqual(g.status, 400, 'ต้องเปิดขั้นก่อน');
  await req('GET', '/api/gl/lessons/a1-subject-pronouns/steps/0', { token: u.token });
  const gc = (await req('POST', '/api/gl/lessons/a1-subject-pronouns/steps/0/complete', { token: u.token })).body;
  const e2 = await userExp(u.id); assert.strictEqual(e2, e1 + gc.exp);
  assert.strictEqual(gc.levelInfo.exp, e2, 'levelInfo มาจาก users.exp ตัวเดียวกัน');
  // Ranked (ฝึกกับ NPC) — EXP เข้าบัญชีเดียวกัน
  let st = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode: 'vocab' } })).body;
  while (st.status === 'active') {
    const q = (await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [st.matchId])).rows[0].questions[st.index];
    await req('POST', `/api/ranked/matches/${st.matchId}/answer`, { token: u.token, body: { questionIndex: st.index, choiceIndex: q.correctIndex } });
    st = (await req('POST', `/api/ranked/matches/${st.matchId}/next`, { token: u.token })).body;
  }
  const e3 = await userExp(u.id);
  assert.ok(e3 > e2, 'Ranked เพิ่ม EXP บัญชี');
  const me = (await req('GET', '/api/auth/me', { token: u.token })).body.user;
  assert.strictEqual(me.exp, e3);
  assert.strictEqual(me.level, getLevelInfo(e3).level, 'Account Level เดียวจาก EXP รวม');
  assert.strictEqual(e3, await logSum(u.id), 'ทุกแหล่ง EXP ลง exp_log ครั้งเดียว ไม่ซ้ำ');
  const reasons = (await pool.query('SELECT DISTINCT reason FROM exp_log WHERE user_id = $1', [u.id])).rows.map((r) => r.reason).sort();
  assert.ok(reasons.includes('grammar_lesson') && reasons.some((r) => r.startsWith('card_')) && reasons.includes('ranked_match'), reasons.join(','));
});

test('ไม่มีเพดาน EXP รายวัน (บทเรียน/ฝึก/Ranked) แต่กันปั๊มด้วยครั้งเดียวต่อคีย์ · ฝึกข้อเดิมซ้ำวันเดียวกันไม่ได้ EXP ซ้ำ', async () => {
  const { grantOnce } = require('../utils/exp');
  const u = await makeUser('gsc');
  const rs = await Promise.all(Array.from({ length: 5 }, () => grantOnce(u.id, 'test:same', 7, { reason: 'grammar_lesson' })));
  assert.strictEqual(rs.filter((r) => r.gained === 7).length, 1);
  let total = 0;
  for (let i = 0; i < 120; i += 1) total += (await grantOnce(u.id, `test:k${i}`, 8, { reason: 'grammar_lesson', dailyCap: L.DAILY_CAP })).gained;
  assert.strictEqual(total, 960, 'ไม่มีเพดานรายวัน');
  assert.strictEqual(L.DAILY_CAP, null);
  assert.strictEqual(require('../config/battle').RANKED_EXP.dailyCap, null, 'Ranked ไม่มีเพดานรายวัน');
  // ฝึกอิสระ: ชุดเดิมซ้ำวันเดียวกัน ได้ EXP ครั้งแรกเท่านั้น
  const v = await makeUser('gsd');
  const play = async () => {
    const s = (await req('POST', '/api/gl/topics/a1-present-simple/practice', { token: v.token, body: { all: true } })).body;
    for (const it of s.items) await req('POST', `/api/gl/sessions/${s.sessionId}/answer`, { token: v.token, body: { itemId: it.id, answer: right({ id: it.id }) } });
    return (await req('POST', `/api/gl/sessions/${s.sessionId}/finish`, { token: v.token })).body;
  };
  const f1 = await play();
  assert.ok(f1.exp >= f1.correct * 8, `รอบแรก ${f1.exp}`);
  assert.ok(f1.levelInfo && f1.levelInfo.exp === await userExp(v.id));
  const f2 = await play();
  assert.strictEqual(f2.exp, 0, 'ข้อเดิมวันเดียวกันไม่ได้ซ้ำ');
  assert.strictEqual(await userExp(v.id), await logSum(v.id));
});
