/*
  v1.10.0 Phase 2 — บทเรียนคำศัพท์ v2 + เนื้อหาคำศัพท์ระดับผู้เรียน A1–B1
  - เซิร์ฟเวอร์สร้างโจทย์/เก็บเฉลย · client ได้แค่รหัสตัวเลือกสุ่ม (ไม่มี wordId/เฉลยก่อนตอบ)
  - แบบฝึก: meaning · reverse · context · spell · listen · ตอบได้ครั้งเดียว · กติกา SRS/EXP เดิม
  - เนื้อหา: migration 061 แทนความหมาย/ตัวอย่าง WordNet ด้วยเนื้อหาที่เขียนใหม่ + คำแปลตัวอย่าง · ไม่เขียนทับคำแปลที่คนตรวจแล้ว
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const wordStore = require('../utils/wordStore');

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let j = null; try { j = buf ? JSON.parse(buf) : null; } catch (_) { j = null; } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'vl') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const sessionRow = async (id) => (await pool.query('SELECT * FROM vocab_lesson_sessions WHERE id = $1', [id])).rows[0];

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await wordStore.reload();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('เนื้อหา A1–C1: ความหมาย/ตัวอย่างเขียนใหม่ครบทุก sense · คำแปลตัวอย่าง · ไม่มีคำค้าง flag · ผ่าน validator', async () => {
  const { rows } = await pool.query(`SELECT cefr, count(*)::int AS n,
      count(*) FILTER (WHERE definition_source IN ('EQ_LEARNER', 'ORIGINAL') AND learner IS NOT NULL AND example_translation IS NOT NULL)::int AS learner,   -- ORIGINAL = ผู้ดูแลแก้ความหมายภายหลัง (ชุดทดสอบ admin)
      count(*) FILTER (WHERE translation_note IS NOT NULL)::int AS flagged
    FROM vocab_senses WHERE cefr IN ('A1', 'A2', 'B1', 'B2', 'C1') AND public_id IS NOT NULL AND NOT is_supplemental GROUP BY 1 ORDER BY 1`);
  assert.deepStrictEqual(rows.map((r) => [r.cefr, r.n === r.learner, r.flagged]), [['A1', true, 0], ['A2', true, 0], ['B1', true, 0], ['B2', true, 0], ['C1', true, 0]]);
  // B2–C1 (067): ตัวอย่าง WordNet เดิมถูกแทน (abandon: 'We abandoned the old car in the empty parking lot')
  const b2 = (await pool.query("SELECT example_sentence, example_translation, definition_source FROM vocab_senses WHERE public_id = 'B2-S0001'")).rows[0];
  assert.ok(b2.definition_source === 'EQ_LEARNER' && !/parking lot/.test(b2.example_sentence) && /[\u0E00-\u0E7F]/.test(b2.example_translation));
  // ตัวอย่างที่ audit พบว่าผิดความหมาย ต้องถูกแทนแล้ว
  const ex = Object.fromEntries((await pool.query("SELECT public_id, example_sentence FROM vocab_senses WHERE public_id IN ('A1-S0027', 'A1-S0057')")).rows.map((r) => [r.public_id, r.example_sentence]));
  assert.ok(/\balso\b/.test(ex['A1-S0027']) && !/Mercedes/.test(ex['A1-S0027']));
  assert.ok(/\bautumn\b/i.test(ex['A1-S0057']) && !/1973/.test(ex['A1-S0057']));
  // ทุกไฟล์ผ่าน validator (รวมตัวอย่างซ้ำข้ามไฟล์)
  const fs = require('fs'); const path = require('path');
  const { validateBatch } = require('../services/learner/validator');
  const dir = path.join(__dirname, '../data/vocab-learner');
  const seen = new Map(); let n = 0;
  for (const f of fs.readdirSync(path.join(dir, 'out')).filter((x) => /^batch-\d+\.json$/.test(x))) {
    const items = JSON.parse(fs.readFileSync(path.join(dir, 'out', f), 'utf8'));
    const r = validateBatch(items, JSON.parse(fs.readFileSync(path.join(dir, 'input', f), 'utf8')), seen);
    assert.deepStrictEqual(r.errors, [], f); n += items.length;
  }
  assert.strictEqual(n, 2975 + 2972);
  // ตัวเลือกคำตอบใช้คำแปลสั้น (≤ 30 ตัวอักษร)
  const long = ['A1', 'B2', 'C1'].flatMap((lv) => wordStore.getLevelWords(lv)).filter((w) => w.thai && [...w.thai].length > 30);
  assert.strictEqual(long.length, 0);
  // /words/content ส่งคำแปลตัวอย่าง + collocations
  const u = await makeUser();
  const c = await req('GET', '/api/words/content?ids=A1-S0057', { token: u.token });
  assert.ok(c.body.content['A1-S0057'].exampleTH && c.body.content['A1-S0057'].collocations.length >= 2);
});

test('นำเข้าคำแปลซ้ำ (apply_thai) ไม่เขียนทับเนื้อหาระดับผู้เรียน · ย้อนกลับได้จากตารางสำรอง', async () => {
  const { applyThai } = require('../scripts/oxford/apply_thai');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = (await client.query("SELECT thai_meaning FROM vocab_senses WHERE public_id = 'A1-S0640'")).rows[0].thai_meaning;
    await applyThai(client, { log: () => {} });
    const after = (await client.query("SELECT thai_meaning FROM vocab_senses WHERE public_id = 'A1-S0640'")).rows[0].thai_meaning;
    assert.strictEqual(after, before, 'คำแปลที่ผ่านการตรวจรอบใหม่ไม่ถูกย้อนกลับเป็นของเดิม');
    const bak = (await client.query("SELECT count(*)::int AS n FROM vocab_senses_prelearner_backup")).rows[0].n;
    assert.strictEqual(bak, 2975 + 2972, 'มีสำรองค่าเดิมครบสำหรับ _down (061 + 067)');
  } finally { await client.query('ROLLBACK'); client.release(); }
});

test('เริ่มรอบเรียน: 12 ข้อ · คำใหม่ = แบบความหมาย 5 ตัวเลือก · ไม่ส่ง wordId/เฉลยให้ client', async () => {
  const u = await makeUser();
  const r = await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'A1' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.questions.length, 12);
  assert.strictEqual(r.body.mode, 'learn');
  for (const q of r.body.questions) {
    assert.strictEqual(q.type, 'meaning');
    assert.strictEqual(q.options.length, 5);
    assert.strictEqual(new Set(q.options.map((o) => o.text)).size, 5, 'ตัวเลือกไม่ซ้ำ');
    assert.ok(!('wordId' in q) && !('answerKey' in q) && q.options.every((o) => Object.keys(o).sort().join() === 'key,text'));
  }
  const raw = JSON.stringify(r.body);
  const s = await sessionRow(r.body.sessionId);
  assert.ok(!raw.includes(s.questions[0].wordId), 'ไม่มี wordId ใน payload');
  // ระดับ/โหมดผิด
  assert.strictEqual((await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'Z9' } })).status, 400);
  assert.strictEqual((await req('POST', '/api/lesson/start', { body: { level: 'A1' } })).status, 401);
});

test('ตอบ: เซิร์ฟเวอร์ตัดสิน · ตอบถูก +15 EXP และ "ผ่าน" · ตอบซ้ำ 409 · ตัวเลือกปลอม 400 · รอบของคนอื่น 404 · หมดเวลา 410', async () => {
  const u = await makeUser(); const other = await makeUser();
  const st = (await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'A1' } })).body;
  const s = await sessionRow(st.sessionId);
  const q0 = s.questions[0];
  const ok = await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: 0, key: q0.answerKey } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.correct, true); assert.strictEqual(ok.body.gainedExp, 15); assert.strictEqual(ok.body.correctKey, q0.answerKey);
  assert.ok(ok.body.word.example && ok.body.word.thai, 'หลังตอบได้ข้อมูลคำ + ตัวอย่าง');
  const wp = (await pool.query('SELECT ever_known, status FROM word_progress WHERE user_id = $1 AND word_id = $2', [u.id, q0.wordId])).rows[0];
  assert.deepStrictEqual(wp, { ever_known: true, status: 'learning' });
  assert.strictEqual((await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: 0, key: q0.answerKey } })).status, 409);
  const q1 = s.questions[1];
  const wrongKey = q1.options.find((o) => o.key !== q1.answerKey).key;
  const bad = await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: 1, key: wrongKey } });
  assert.strictEqual(bad.body.correct, false); assert.strictEqual(bad.body.gainedExp, 3);
  assert.strictEqual((await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: 2, key: 'fake' } })).status, 400);
  assert.strictEqual((await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: 99, key: 'x' } })).status, 400);
  assert.strictEqual((await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: other.token, body: { i: 2, key: s.questions[2].answerKey } })).status, 404);
  await pool.query("UPDATE vocab_lesson_sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [st.sessionId]);
  assert.strictEqual((await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: 2, key: s.questions[2].answerKey } })).status, 410);
  // รอบใหม่: คำที่ผ่านแล้วไม่ถูกถามซ้ำในโหมดเรียน
  const st2 = await sessionRow((await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'A1' } })).body.sessionId);
  assert.ok(!st2.questions.some((q) => q.wordId === q0.wordId));
});

test('ทบทวนคำถึงกำหนด: แบบเติมคำ/สะกดคำ/ทายคำ · สะกดไม่สนตัวพิมพ์ · ไม่มีคำถึงกำหนด = 409', async () => {
  const u = await makeUser();
  assert.strictEqual((await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'A1', mode: 'due' } })).body.code, 'NOTHING_DUE');
  // คำที่ผ่านแล้วและมีประโยคเติมคำได้ — ตั้งให้ถึงกำหนดทบทวน
  const ids = wordStore.getLevelWords('A1').filter((w) => w.thai && w.learner && w.learner.gapOk && wordStore.CONTENT_CATEGORIES.has(w.category)
    && w.learner.form.toLowerCase() === String(w.word).replace(/\s*\([^)]*\)/g, '').toLowerCase()).slice(0, 12).map((w) => w.id);
  assert.strictEqual(ids.length, 12);
  for (const id of ids) {
    await pool.query(`INSERT INTO word_progress (user_id, word_id, level, status, ever_known, srs_reps, srs_interval, srs_ease, srs_due_at, times_seen, times_correct)
      VALUES ($1, $2, 'A1', 'learning', TRUE, 1, 1, 2.5, NOW() - INTERVAL '1 hour', 1, 1)`, [u.id, id]);
  }
  const st = (await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'A1', mode: 'due' } })).body;
  assert.strictEqual(st.mode, 'due'); assert.strictEqual(st.total, 12);
  const types = new Set(st.questions.map((q) => q.type));
  assert.ok(types.has('context') && types.has('spell') && types.has('reverse'), [...types].join());
  const s = await sessionRow(st.sessionId);
  for (const q of st.questions.filter((x) => x.type === 'context' || x.type === 'spell')) {
    assert.ok(q.sentence.includes('_____'));
    const form = s.questions[q.i].type === 'spell' ? s.questions[q.i].answer : null;
    if (form) assert.ok(!new RegExp(`\\b${form}\\b`, 'i').test(q.sentence), 'ประโยคต้องไม่มีคำตอบ');
  }
  const sp = st.questions.find((q) => q.type === 'spell');
  assert.ok(sp.hint.first && sp.hint.length >= 2 && sp.promptTH);
  const ans = s.questions[sp.i].answer;
  const r = await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: sp.i, text: `  ${ans.toUpperCase()} ` } });
  assert.strictEqual(r.body.correct, true); assert.strictEqual(r.body.correctText, ans);
  const sp2 = st.questions.filter((q) => q.type === 'spell')[1];
  if (sp2) assert.strictEqual((await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: sp2.i, text: 'zzzz' } })).body.correct, false);
  const ctx = st.questions.find((q) => q.type === 'context');
  assert.strictEqual(ctx.options.length, 4);
  assert.strictEqual((await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: ctx.i, key: s.questions[ctx.i].answerKey } })).body.correct, true);
});

test('โหมดฟัง: แบบ listen · บันทึกที่ listening_progress (แยกจากโหมดอ่าน)', async () => {
  const u = await makeUser();
  const st = (await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'A1', mode: 'listen' } })).body;
  assert.ok(st.questions.every((q) => q.type === 'listen' && q.speak && q.options.length === 4));
  const s = await sessionRow(st.sessionId);
  await req('POST', `/api/lesson/${st.sessionId}/answer`, { token: u.token, body: { i: 0, key: s.questions[0].answerKey } });
  const lp = (await pool.query('SELECT count(*)::int AS n FROM listening_progress WHERE user_id = $1', [u.id])).rows[0].n;
  const wp = (await pool.query('SELECT count(*)::int AS n FROM word_progress WHERE user_id = $1', [u.id])).rows[0].n;
  assert.deepStrictEqual([lp, wp], [1, 0]);
});

test('Unit: ล็อกอยู่ = 403 (เว้นโหมดสำรวจ) · ถามเฉพาะคำใน Unit', async () => {
  const u = await makeUser();
  const path = (await req('GET', '/api/path', { token: u.token })).body;
  const a1 = path.levels.find((l) => l.level === 'A1');
  const open = a1.units.find((x) => x.status !== 'locked');
  const locked = a1.units.find((x) => x.status === 'locked');
  const r = await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'A1', unitId: open.id } });
  assert.strictEqual(r.status, 200);
  const unitWords = new Set((await req('GET', `/api/path/units/${open.id}`, { token: u.token })).body.wordIds);
  const s = await sessionRow(r.body.sessionId);
  assert.ok(s.questions.every((q) => unitWords.has(q.wordId)));
  if (locked) {
    assert.strictEqual((await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'A1', unitId: locked.id } })).status, 403);
    assert.strictEqual((await req('POST', '/api/lesson/start', { token: u.token, body: { level: 'A1', unitId: locked.id, explore: true } })).status, 200);
  }
});

test('ช่องทางเดิม /progress/review ปิดใน production (client รู้เฉลย) · เปิดได้ด้วย LEGACY_CARD_REVIEW=on', async () => {
  const u = await makeUser();
  const prev = [process.env.NODE_ENV, process.env.LEGACY_CARD_REVIEW];
  try {
    process.env.NODE_ENV = 'production'; delete process.env.LEGACY_CARD_REVIEW;
    const r = await req('POST', '/api/progress/review', { token: u.token, body: { wordId: 'A1-S0024', level: 'A1', chosenWordId: 'A1-S0024' } });
    assert.strictEqual(r.status, 410); assert.strictEqual(r.body.code, 'USE_LESSON_V2');
    process.env.LEGACY_CARD_REVIEW = 'on';
    assert.strictEqual((await req('POST', '/api/progress/review', { token: u.token, body: { wordId: 'A1-S0024', level: 'A1', chosenWordId: 'A1-S0024' } })).status, 200);
  } finally {
    process.env.NODE_ENV = prev[0]; if (prev[1] === undefined) delete process.env.LEGACY_CARD_REVIEW; else process.env.LEGACY_CARD_REVIEW = prev[1];
  }
});

test('ไวยากรณ์ CEFR: สลับตัวเลือก — คลังวางคำตอบตัวแรก ~80% แต่ผู้เรียนเห็นกระจาย · ตอบตำแหน่งที่เห็นแล้วตรวจถูก', () => {
  const GC = require('../data/grammar-curriculum');
  const E = require('../services/grammar/engine');
  const { checkAnswer } = require('../services/grammar/check');
  const P = require('../utils/placement');
  const items = GC.allItems().filter((it) => ['mc', 'choose', 'dialogue', 'context'].includes(it.type));
  const firstInBank = items.filter((it) => it.answer === 0).length / items.length;
  assert.ok(firstInBank > 0.6, `คลังเอียงจริง (${firstInBank.toFixed(2)})`);
  let first = 0;
  for (const it of items) {
    const seed = `s-${it.id.length}`;
    const pub = E.publicItem(it, seed);
    const shown = pub.choices.indexOf(it.choices[it.answer]);
    if (shown === 0) first += 1;
    assert.strictEqual(checkAnswer(it, E.toOriginalAnswer(it, seed, shown)).correct, true, it.id);
    assert.strictEqual(E.feedbackFor(it, checkAnswer(it, E.toOriginalAnswer(it, seed, shown)), seed).answerIndex, shown);
    assert.deepStrictEqual(E.publicItem(it, seed).choices, pub.choices, 'seed เดิม = ลำดับเดิม');
  }
  assert.ok(first / items.length < 0.4, `ตำแหน่งที่เห็นกระจาย (${(first / items.length).toFixed(2)})`);
  // แบบวัดระดับ: ตอบตัวเลือกแรกทุกข้อต้องไม่ได้ระดับสูง
  let high = 0;
  for (let k = 0; k < 20; k += 1) {
    const qs = P.buildCefrGrammarQuestions(GC.allItems(), Math.random);
    const g = P.scorePlacement(qs, qs.map(() => 0)).grammar;
    if (['B1', 'B2', 'C1'].includes(g)) high += 1;
  }
  assert.ok(high <= 2, `กดตัวเลือกแรกได้ B1+ ${high}/20 ครั้ง`);
});

test('นำเข้าเนื้อหาผู้เรียนซ้ำ: ไม่ทับความหมาย/ประโยคที่ผู้ดูแลแก้เอง (content_edits) · ประโยคที่คงไว้ไม่ใช้ทำแบบเติมคำ', async () => {
  const { applyLearner } = require('../scripts/learner/apply');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE vocab_senses SET simple_definition = 'ADMIN def', example_sentence = 'ADMIN example sentence here.' WHERE public_id IN ('B2-S0001', 'B2-S0002')");
    await client.query(`INSERT INTO content_edits (word_id, editor_id, before_data, after_data) VALUES
      ('B2-S0001', NULL, '{"simple_definition":"x"}', '{"simple_definition":"ADMIN def"}'),
      ('B2-S0002', NULL, '{"example_sentence":"x"}', '{"example_sentence":"ADMIN example sentence here."}')`);
    const r = await applyLearner(client, { levels: ['B2'], log: () => {} });
    assert.ok(r.keptDef >= 1 && r.keptEx >= 1);
    const rows = Object.fromEntries((await client.query("SELECT public_id, simple_definition, example_sentence, learner FROM vocab_senses WHERE public_id IN ('B2-S0001', 'B2-S0002')")).rows.map((x) => [x.public_id, x]));
    assert.strictEqual(rows['B2-S0001'].simple_definition, 'ADMIN def', 'ความหมายที่ผู้ดูแลแก้ไม่ถูกทับ');
    assert.notStrictEqual(rows['B2-S0001'].example_sentence, 'ADMIN example sentence here.', 'ช่องที่ผู้ดูแลไม่ได้แก้ยังได้เนื้อหาใหม่');
    assert.strictEqual(rows['B2-S0002'].example_sentence, 'ADMIN example sentence here.', 'ประโยคที่ผู้ดูแลแก้ไม่ถูกทับ');
    assert.strictEqual(rows['B2-S0002'].learner.gapOk, false, 'ประโยคของผู้ดูแลไม่ใช้ทำแบบเติมคำ');
  } finally { await client.query('ROLLBACK'); client.release(); }
});
