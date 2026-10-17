/*
  คำศัพท์ C2 (Pilot Dataset) — ต่อยอดระบบคำศัพท์เดิม
  - validator ตรวจข้อมูล/โจทย์ (ตัวเลือกซ้ำ · เฉลยในตัวลวง · ตัวลวงที่ถูกได้ด้วย · ไทยเสีย · ซ้ำกับ A1–C1)
  - นำเข้า idempotent · ID เดิมไม่เปลี่ยน · แถวที่คนตรวจแล้วไม่ถูกทับ · unverified ไม่เข้าแบบฝึก/ค้นหา
  - คำเดียวกันต่างระดับต่างความหมาย (address: A1 n. / C2 v.) อยู่ใต้ entry เดียวกัน
  - A1–C1 เดิมทำงานเหมือนเดิม · ปลดล็อก C2 ตามกฎ Learning Path เดิม (+ placement C1 เต็ม)
  - บทเรียน 12 ขั้น · ความคืบหน้าต่อ sense (word_progress + SRS เดิม) · facet ของข้อผิด
  - EXP เข้าบัญชีเดียว (users.exp = exp_log) · ได้ครั้งเดียวต่อคีย์ · ไม่มีเพดานรายวัน
  - ค้นหา C2 (คำ / ไทย / วลี / collocation / synonym / หัวข้อ / ชนิด / tier) · Ranked C2 · รับคำตอบหลายแบบ
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const V = require('../scripts/c2/validate');
const S = require('../services/vocab/c2Store');
const I = require('../services/vocab/c2Items');
const L = require('../services/vocab/c2Lesson');
const wordStore = require('../utils/wordStore');

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
async function makeUser(prefix = 'c2') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;
const logSum = async (id) => (await pool.query('SELECT COALESCE(SUM(amount),0)::int AS n FROM exp_log WHERE user_id = $1', [id])).rows[0].n;
/** ปลดล็อก C2 ตามกฎเดิม: เคลียร์ Boss ของ C1 */
async function clearC1Boss(uid) {
  await pool.query(`INSERT INTO assessments (user_id, kind, ref, questions, status, passed, completed_at)
    VALUES ($1, 'boss', 'C1', '[]'::jsonb, 'completed', TRUE, NOW())`, [uid]);
}
/** สร้างข้อเดิมฝั่งเซิร์ฟเวอร์เพื่อรู้เฉลย (เทสต์เท่านั้น) */
async function answerOf(userId, unitId, itemId, run = 1) {
  await S.ready();
  const p = I.parseItemId(itemId);
  const it = I.build(p.senseId, p.type, L._seedOf(userId, unitId, run));
  return it.input ? it.accepted[0] : it.answer;
}
async function wrongOf(userId, unitId, itemId, run = 1) {
  const p = I.parseItemId(itemId);
  const it = I.build(p.senseId, p.type, L._seedOf(userId, unitId, run));
  return it.input ? 'zzzz' : (it.answer + 1) % it.choices.length;
}
async function runLesson(u, unitId, pickWrong = () => false) {
  const ov = (await req('GET', `/api/c2/lessons/${unitId}`, { token: u.token })).body;
  let last = null;
  for (let k = ov.current; k < ov.total; k += 1) {
    const st = (await req('GET', `/api/c2/lessons/${unitId}/steps/${k}`, { token: u.token })).body;
    for (const it of st.content.items || []) {
      const ans = pickWrong(it, k) ? await wrongOf(u.id, unitId, it.id, ov.runNo) : await answerOf(u.id, unitId, it.id, ov.runNo);
      await req('POST', `/api/c2/lessons/${unitId}/steps/${k}/answer`, { token: u.token, body: { itemId: it.id, answer: ans } });
    }
    last = (await req('POST', `/api/c2/lessons/${unitId}/steps/${k}/complete`, { token: u.token })).body;
  }
  return last;
}

test.before(async () => {
  await pool.query('SELECT 1');
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await wordStore.reload();
  await S.reload();
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

/* ---------------- Validator ---------------- */
test('validator: Pilot Dataset ผ่านทั้งหมด และครอบคลุมทุกชนิดหน่วยคำศัพท์', async () => {
  const entries = V.loadBatches();
  assert.ok(entries.length >= 100 && entries.length <= 300, 'Pilot 100–300 รายการ');
  const r = V.validateAll(entries, { existingLemmas: await V.loadExistingLemmas(pool) });
  assert.strictEqual(r.summary.unverified, 0, JSON.stringify(r.results.filter((x) => x.errors.length).slice(0, 3)));
  const kinds = new Set(entries.map((e) => e.kind));
  for (const k of ['word', 'sense', 'collocation', 'phrasal', 'idiom', 'fixed', 'colloquial']) assert.ok(kinds.has(k), `ต้องมี kind=${k}`);
  assert.ok(entries.some((e) => e.tier === 'extended') && entries.some((e) => e.tier === 'core'));
});

test('validator: จับโจทย์ที่ผิด — ตัวเลือกซ้ำ · เฉลยอยู่ในตัวลวง · ตัวลวงเป็น synonym · ไม่มีคำอธิบาย · ไทยเสีย · tier ผิด', () => {
  const good = JSON.parse(JSON.stringify(V.loadBatches()[0]));
  const bad = (mut) => { const e = JSON.parse(JSON.stringify(good)); mut(e); return V.validateEntry(e).errors.join(' | '); };
  assert.strictEqual(V.validateEntry(good).errors.length, 0);
  assert.match(bad((e) => { e.q.collocation.distractors[1] = e.q.collocation.distractors[0]; }), /ตัวเลือกซ้ำ/);
  assert.match(bad((e) => { e.q.collocation.distractors[0] = e.q.collocation.answer; }), /คำตอบถูกอยู่ในตัวลวง/);
  assert.match(bad((e) => { e.q.nearSyn.answer = e.lemma; e.q.nearSyn.distractors[0].word = e.synonyms[0]; }), /synonym.*หลายข้อ/);
  assert.match(bad((e) => { delete e.q.collocation.whyTH; }), /whyTH/);
  assert.match(bad((e) => { e.q.nearSyn.distractors[2].whyNotTH = ''; }), /whyNotTH/);
  assert.match(bad((e) => { e.meaningTH = 'ิความหมาย'; }), /สระ\/วรรณยุกต์ไทยลอย/);
  assert.match(bad((e) => { e.exampleTH = 'ตัวอย่าง�'; }), /U\+FFFD/);
  assert.match(bad((e) => { e.shortMeaningTH = 'ก'.repeat(31); }), /ยาวเกิน/);
  assert.match(bad((e) => { e.context.text = e.context.text.replace(/\[\[|\]\]/g, ''); }), /\[\[เป้าหมาย\]\] 1 จุด/);
  assert.match(bad((e) => { e.realWorldPriority = 1; e.tier = 'core'; }), /ต้องเป็น extended/);
  assert.match(bad((e) => { e.meaningTH = ''; }), /ขาด meaningTH/);
  assert.match(bad((e) => { e.cefr = 'C1'; }), /cefr ต้องเป็น C2/);
  assert.match(bad((e) => { delete e.sourceReference; }), /sourceReference/);
  assert.match(bad((e) => { e.q.formation = { sentence: 'The ___ is clear.', root: 'x', answer: 'a', accepted: ['a', 'b'], options: ['a', 'b', 'c', 'd'] }; }), /ถูกหลายข้อ/);
});

test('duplicate prevention: key ซ้ำ · ความหมายซ้ำ · คำถามซ้ำ · คำเดียวกัน pos เดียวกับ A1–C1', async () => {
  const [a] = V.loadBatches();
  const b = JSON.parse(JSON.stringify(a));
  const r = V.validateAll([a, b]);
  const errs = r.results.flatMap((x) => x.errors).join(' | ');
  assert.match(errs, /key ซ้ำ/);
  const c = JSON.parse(JSON.stringify(a)); c.key = 'zzz|adjective|x';
  assert.match(V.validateAll([a, c]).results.flatMap((x) => x.errors).join(' | '), /sense ซ้ำ|คำถาม .* ซ้ำ/);
  // "mandate" (n.) มีใน C1 แล้ว → ห้ามนำเข้าเป็นคำใหม่ pos เดียวกัน
  const existing = await V.loadExistingLemmas(pool);
  const d = JSON.parse(JSON.stringify(a)); Object.assign(d, { key: 'mandate|noun|x', lemma: 'mandate', displayForm: 'mandate', pos: 'noun', kind: 'word' });
  assert.match(V.validateAll([d], { existingLemmas: existing }).results[0].errors.join(' | '), /มีอยู่แล้วใน C1/);
  // ฐานข้อมูล: c2_key ไม่ซ้ำ (unique index)
  const { rows } = await pool.query("SELECT count(*)::int AS n, count(DISTINCT c2_key)::int AS u FROM vocab_senses WHERE cefr = 'C2'");
  assert.strictEqual(rows[0].n, rows[0].u);
});

/* ---------------- นำเข้า / migration ---------------- */
test('C2 entry loads correctly: public_id C2-S#### · ข้อมูลครบ · ไทยไม่เสีย (Thai rendering)', async () => {
  const { rows } = await pool.query(`SELECT public_id, display_form, thai_meaning, c2, kind, tier, register, verification_status, source_list, source
    FROM vocab_senses WHERE cefr = 'C2'`);
  assert.ok(rows.length >= 100);
  for (const r of rows) {
    assert.match(r.public_id, /^C2-S\d{4}$/);
    assert.strictEqual(r.source_list, 'C2_BANK'); assert.strictEqual(r.source, 'EDITORIAL');
    assert.ok(r.display_form && r.thai_meaning && r.c2.meaningTH && r.kind && r.tier && r.register);
    for (const t of [r.thai_meaning, r.c2.meaningTH, r.c2.usageNoteTH]) {
      assert.deepStrictEqual(V.textProblems(t), [], `${r.public_id}: ${t}`);
      assert.strictEqual(t, t.normalize('NFC'));
    }
  }
  await wordStore.ready();
  const w = wordStore.getLevelWords('C2');
  assert.strictEqual(w.length, rows.filter((r) => ['autoChecked', 'reviewed'].includes(r.verification_status)).length);
  assert.ok(w.every((x) => wordStore.isPlayable(x.id)), 'ทุก sense C2 ที่ผ่านการตรวจฝึกได้ (รวม idiom/phrasal)');
  assert.ok(w.some((x) => x.word === 'cut someone some slack' || x.word.includes(' ')), 'แสดงรูปวลีเต็ม');
});

test('import ซ้ำ: idempotent · public_id เดิมไม่เปลี่ยน · แถว reviewed ไม่ถูกทับ · ไม่แตะ A1–C1', async () => {
  const { importC2 } = require('../scripts/c2/import');
  const before = (await pool.query("SELECT c2_key, public_id FROM vocab_senses WHERE cefr = 'C2' ORDER BY c2_key")).rows;
  const oxford = (await pool.query("SELECT md5(string_agg(id || coalesce(thai_meaning,'') || coalesce(public_id,''), ',' ORDER BY id)) AS h FROM vocab_senses WHERE cefr <> 'C2'")).rows[0].h;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE vocab_senses SET thai_meaning = 'ครูแก้แล้ว', verification_status = 'reviewed' WHERE public_id = 'C2-S0001'");
    const r = await importC2(client);
    assert.strictEqual(r.stats.inserted, 0);
    assert.strictEqual(r.stats.keptReviewed, 1);
    const after = (await client.query("SELECT c2_key, public_id FROM vocab_senses WHERE cefr = 'C2' ORDER BY c2_key")).rows;
    assert.deepStrictEqual(after, before, 'public_id ต้องคงเดิม');
    assert.strictEqual((await client.query("SELECT thai_meaning FROM vocab_senses WHERE public_id = 'C2-S0001'")).rows[0].thai_meaning, 'ครูแก้แล้ว');
    const ox2 = (await client.query("SELECT md5(string_agg(id || coalesce(thai_meaning,'') || coalesce(public_id,''), ',' ORDER BY id)) AS h FROM vocab_senses WHERE cefr <> 'C2'")).rows[0].h;
    assert.strictEqual(ox2, oxford, 'แถว A1–C1 ต้องไม่ถูกแตะ');
  } finally { await client.query('ROLLBACK'); client.release(); }
});

test('same lemma, different CEFR sense: address (A1 n.) + address (C2 v. จัดการปัญหา) อยู่ใต้ entry เดียวกัน', async () => {
  const { rows } = await pool.query(`SELECT s.public_id, s.cefr, s.pos, s.entry_id, s.base_sense_id FROM vocab_senses s
    JOIN vocab_entries e ON e.id = s.entry_id WHERE e.headword = 'address' ORDER BY s.cefr`);
  const c2 = rows.find((r) => r.cefr === 'C2');
  assert.ok(c2 && rows.some((r) => r.cefr === 'A1'));
  assert.strictEqual(new Set(rows.map((r) => r.entry_id)).size, 1, 'ไม่สร้างคำซ้ำ — เพิ่ม sense ใหม่ใต้ entry เดิม');
  assert.ok(c2.base_sense_id && c2.base_sense_id.startsWith('A1-'));
  const u = await makeUser();
  const d = await req('GET', `/api/vocab/${c2.public_id}`, { token: u.token });
  assert.strictEqual(d.status, 200);
  assert.strictEqual(d.body.cefr, 'C2');
  assert.ok(d.body.otherSenses.some((o) => o.cefr === 'A1'), 'เห็นความหมายพื้นฐานระดับ A1 ด้วย');
  assert.ok(d.body.c2 && d.body.c2.baseMeaningTH && d.body.c2.collocations.length);
  assert.ok(!('q' in d.body.c2), 'ไม่ส่งเฉลยคำถาม');
  // progress ของ sense พื้นฐานไม่ปนกับ sense C2 (word_id ต่างกัน)
  assert.notStrictEqual(c2.public_id, c2.base_sense_id);
});

test('existing A1–C1 still works: จำนวนคำ · ตอบคำศัพท์ A1 · ID เดิม', async () => {
  const u = await makeUser();
  const c = await req('GET', '/api/words/content', { token: u.token });
  assert.strictEqual(c.status, 200);
  const a1 = await req('GET', '/api/words/A1', { token: u.token });
  assert.strictEqual(a1.status, 200);
  const w = (a1.body.words || a1.body).find((x) => x.id && /^A1-S\d{4}$/.test(x.id) && wordStore.isPlayable(x.id));
  const r = await req('POST', '/api/progress/review', { token: u.token, body: { wordId: w.id, level: 'A1', chosenWordId: w.id } });
  assert.strictEqual(r.status, 200);
  const wp = (await pool.query('SELECT status, level FROM word_progress WHERE user_id = $1 AND word_id = $2', [u.id, w.id])).rows[0];
  assert.deepStrictEqual(wp, { status: 'known', level: 'A1' });
  const p = await req('GET', '/api/path', { token: u.token });
  assert.deepStrictEqual(p.body.levels.slice(0, 5).map((l) => [l.level, l.totalUnits > 0]), [['A1', true], ['A2', true], ['B1', true], ['B2', true], ['C1', true]]);
  const sum = await req('GET', '/api/progress/summary', { token: u.token });
  assert.ok(sum.body.summary.A1.known >= 1 && sum.body.summary.C2.total > 0);
});

/* ---------------- ปลดล็อก ---------------- */
test('C2 unlock: ผู้ใช้ใหม่ล็อก · โหมดสำรวจเปิดได้ · เคลียร์ Boss C1 แล้วปลดล็อก · placement C1 เต็มปลดล็อก', async () => {
  const u = await makeUser();
  let p = await req('GET', '/api/path', { token: u.token });
  const c2 = p.body.levels.find((l) => l.level === 'C2');
  assert.strictEqual(c2.unlocked, false);
  assert.ok(c2.units.length > 0 && c2.units.every((x) => /^C2-[a-z]+-\d+$/.test(x.id)));
  assert.strictEqual(c2.units[0].id, 'C2-words-1', 'Core words เรียนก่อน');
  assert.ok(c2.units[c2.units.length - 1].id.startsWith('C2-extended'), 'Extended อยู่ท้ายสุด');
  assert.strictEqual((await req('GET', '/api/c2/lessons/C2-words-1', { token: u.token })).status, 403);
  assert.strictEqual((await req('GET', '/api/c2/lessons/C2-words-1?explore=1', { token: u.token })).status, 200);
  assert.strictEqual((await req('POST', '/api/c2/practice/start', { token: u.token, body: { mode: 'mixed' } })).status, 403);

  await clearC1Boss(u.id);
  p = await req('GET', '/api/path', { token: u.token });
  assert.strictEqual(p.body.levels.find((l) => l.level === 'C2').unlocked, true);
  assert.strictEqual((await req('GET', '/api/c2/lessons/C2-words-1', { token: u.token })).status, 200);

  const v = await makeUser();
  await pool.query(`INSERT INTO placement_attempts (user_id, questions, status, result, completed_at) VALUES ($1, '[]', 'completed', $2, NOW())`,
    [v.id, JSON.stringify({ overall: 'C1', vocab: 'C1', grammar: 'C1', recommendedStart: 'C1', breakdown: { vocab: { C1: { correct: 3, total: 3 } } } })]);
  p = await req('GET', '/api/path', { token: v.token });
  assert.strictEqual(p.body.levels.find((l) => l.level === 'C2').unlocked, true, 'placement C1 เต็ม → เปิด C2');
  const w = await makeUser();
  await pool.query(`INSERT INTO placement_attempts (user_id, questions, status, result, completed_at) VALUES ($1, '[]', 'completed', $2, NOW())`,
    [w.id, JSON.stringify({ overall: 'C1', vocab: 'C1', grammar: 'C1', recommendedStart: 'C1', breakdown: { vocab: { C1: { correct: 2, total: 3 } } } })]);
  p = await req('GET', '/api/path', { token: w.token });
  assert.strictEqual(p.body.levels.find((l) => l.level === 'C2').unlocked, false, 'C1 ไม่เต็ม → ยังต้องผ่าน C1 ก่อน');
});

/* ---------------- บทเรียน ---------------- */
test('บทเรียน C2: 12 ขั้น · ไม่ส่งเฉลยก่อนตอบ · ข้ามขั้นไม่ได้ · ตอบผิดได้คำอธิบาย · นับคำตอบแรกเท่านั้น', async () => {
  const u = await makeUser(); await clearC1Boss(u.id);
  const ov = (await req('GET', '/api/c2/lessons/C2-senses-1', { token: u.token })).body;
  assert.strictEqual(ov.total, 12);
  assert.deepStrictEqual(ov.steps.map((s) => s.title), ['New Words', 'Meanings', 'In Context', 'Quick Check', 'Collocations', 'Practice',
    'Synonym Nuance', 'Practice', 'Idioms & Phrases', 'Context Challenge', 'Review', 'Mastery Check']);
  assert.strictEqual((await req('GET', '/api/c2/lessons/C2-senses-1/steps/3', { token: u.token })).status, 403, 'ข้ามขั้นไม่ได้');
  for (let k = 0; k < 3; k++) await req('POST', `/api/c2/lessons/C2-senses-1/steps/${k}/complete`, { token: u.token });
  const st = (await req('GET', '/api/c2/lessons/C2-senses-1/steps/3', { token: u.token })).body;
  assert.ok(st.content.items.length > 0);
  for (const it of st.content.items) {
    assert.ok(!('answer' in it) && !('whyNot' in it) && !('explainTH' in it) && !('accepted' in it), 'ไม่มีเฉลยในข้อมูลที่ส่งออก');
    assert.ok(it.choices.length >= 2);
  }
  assert.strictEqual((await req('POST', '/api/c2/lessons/C2-senses-1/steps/3/complete', { token: u.token })).status, 400, 'ต้องตอบให้ครบก่อน');
  const it = st.content.items[0];
  const bad = await wrongOf(u.id, 'C2-senses-1', it.id);
  const r1 = (await req('POST', '/api/c2/lessons/C2-senses-1/steps/3/answer', { token: u.token, body: { itemId: it.id, answer: bad } })).body;
  assert.strictEqual(r1.correct, false);
  assert.ok(r1.explainTH && r1.expected, 'มีคำอธิบายและเฉลยหลังตอบ');
  assert.ok(r1.whyNot, 'บอกว่าทำไมตัวเลือกที่เลือกจึงผิด');
  assert.strictEqual(r1.facet, 'sense', 'ความหมายขั้นสูงของคำคุ้นเคย → facet sense');
  const r2 = (await req('POST', '/api/c2/lessons/C2-senses-1/steps/3/answer', { token: u.token, body: { itemId: it.id, answer: await answerOf(u.id, 'C2-senses-1', it.id) } })).body;
  assert.strictEqual(r2.correct, true); assert.strictEqual(r2.counted, false, 'ตอบซ้ำไม่นับ'); assert.strictEqual(r2.exp, 0);
  const ev = (await pool.query("SELECT facet, correct, level, skill FROM answer_events WHERE user_id = $1", [u.id])).rows;
  assert.deepStrictEqual(ev, [{ facet: 'sense', correct: false, level: 'C2', skill: 'vocab' }]);
});

test('C2 sense-based progress + EXP บัญชีเดียว: จบบท ≥80% ผ่าน · EXP ตามคีย์ · ทำซ้ำไม่ได้ EXP ซ้ำ · ไม่มีเพดานรายวัน', async () => {
  const u = await makeUser(); await clearC1Boss(u.id);
  const unit = 'C2-idioms-1';
  const e0 = await userExp(u.id);
  const last = await runLesson(u, unit);
  assert.strictEqual(last.result.passed, true); assert.strictEqual(last.result.accuracy, 100);
  const ov = (await req('GET', `/api/c2/lessons/${unit}`, { token: u.token })).body;
  const nItems = ov.steps.reduce((a, s) => a + s.items, 0);
  const expected = 12 * L.EXP.step + nItems * L.EXP.firstCorrect + L.EXP.complete + L.EXP.perfect;
  assert.strictEqual((await userExp(u.id)) - e0, expected);
  assert.strictEqual(await userExp(u.id), await logSum(u.id), 'users.exp = ผลรวม exp_log (EXP ระบบเดียว)');
  // progress ต่อ sense
  const prog = (await pool.query("SELECT word_id, status, level, srs_due_at FROM word_progress WHERE user_id = $1", [u.id])).rows;
  assert.ok(prog.length > 0 && prog.every((p) => p.level === 'C2' && /^C2-S/.test(p.word_id)));
  assert.ok(prog.every((p) => p.status === 'known'));
  assert.ok(ov.known === prog.filter((p) => ov.senses.some((s) => s.id === p.word_id)).length);
  // เริ่มรอบใหม่: EXP ที่เคยได้ไม่ได้ซ้ำ
  const itemsOf = async () => { const o = (await req('GET', `/api/c2/lessons/${unit}`, { token: u.token })).body; const ids = [];
    for (const st of o.steps.filter((x) => x.check)) ids.push(...(await req('GET', `/api/c2/lessons/${unit}/steps/${st.k}`, { token: u.token })).body.content.items.map((x) => x.id));
    return ids; };
  const run1 = new Set(await itemsOf());
  await req('POST', `/api/c2/lessons/${unit}/restart`, { token: u.token });
  const e1 = await userExp(u.id);
  const again = await runLesson(u, unit);
  assert.strictEqual(again.result.passed, true);
  const run2 = await itemsOf();
  const fresh = run2.filter((id) => !run1.has(id)).length;
  // รอบใหม่สุ่มชนิดข้อใหม่: ได้ EXP เฉพาะ "ข้อที่ไม่เคยตอบถูก" · จบขั้น/จบบท/Perfect ไม่ได้ซ้ำ
  assert.strictEqual((await userExp(u.id)) - e1, fresh * L.EXP.firstCorrect);
  assert.ok(fresh < run2.length, 'ข้อที่เคยตอบแล้วไม่ได้ EXP ซ้ำ');
  assert.strictEqual(L.DAILY_CAP, null);
});

test('ตอบผิด → sense เป็น learning · เข้าคิวทบทวน/จุดอ่อน · ไม่ผ่านบทถ้าต่ำกว่า 80%', async () => {
  const u = await makeUser(); await clearC1Boss(u.id);
  const last = await runLesson(u, 'C2-collocations-1', (it, k) => k === 5 || k === 9 || k === 11);
  assert.strictEqual(last.result.passed, false);
  assert.ok(last.result.weak.length > 0, 'สรุปท้ายบทบอก sense ที่ยังอ่อน');
  const learning = (await pool.query("SELECT count(*)::int AS n FROM word_progress WHERE user_id = $1 AND status = 'learning'", [u.id])).rows[0].n;
  assert.ok(learning > 0);
  const sum = (await req('GET', '/api/c2/summary', { token: u.token })).body;
  assert.ok(sum.weakSenses.length > 0);
  assert.ok(Object.keys(sum.weakByFacet).length > 0);
  assert.ok(sum.core.total > 0 && sum.extended.total > 0 && typeof sum.accuracy === 'number');
  assert.match(sum.bank.note, /coverage-driven/);
});

/* ---------------- SRS / Challenge ---------------- */
test('C2 review/SRS: sense ที่ถึงกำหนดถูกเลือกก่อนในรอบ Challenge · นับใน /progress/due · daily ชุดเดิมทั้งวัน', async () => {
  const u = await makeUser(); await clearC1Boss(u.id);
  await S.ready();
  const target = S.all().find((s) => s.kind === 'word');
  await pool.query(`INSERT INTO word_progress (user_id, word_id, level, status, times_seen, times_correct, ever_known, srs_reps, srs_interval, srs_ease, srs_due_at)
    VALUES ($1, $2, 'C2', 'known', 2, 2, TRUE, 2, 3, 2.5, NOW() - INTERVAL '1 day')`, [u.id, target.id]);
  const due = (await req('GET', '/api/progress/due', { token: u.token })).body;
  assert.strictEqual(due.byLevel.C2, 1);
  const s = (await req('POST', '/api/c2/practice/start', { token: u.token, body: { mode: 'mixed' } })).body;
  const first = s.items.find((x) => x.senseId === target.id);
  assert.ok(first && first.pick === 'due', 'sense ที่ถึงกำหนดอยู่ในรอบและติดป้าย due');
  assert.ok(new Set(s.items.map((x) => x.type)).size >= 4, 'ผสมหลายชนิดข้อ ไม่ใช่แค่แปลคำ');
  // ตอบถูก → SRS ขยายช่วง
  const it = I.build(target.id, first.type, (await pool.query('SELECT seed FROM c2_sessions WHERE id = $1', [s.sessionId])).rows[0].seed);
  const r = (await req('POST', `/api/c2/practice/${s.sessionId}/answer`, { token: u.token, body: { itemId: first.id, answer: it.input ? it.accepted[0] : it.answer } })).body;
  assert.strictEqual(r.correct, true); assert.strictEqual(r.exp, 8);
  const row = (await pool.query('SELECT srs_due_at, srs_reps FROM word_progress WHERE user_id = $1 AND word_id = $2', [u.id, target.id])).rows[0];
  assert.ok(new Date(row.srs_due_at) > new Date(), 'ทบทวนแล้วเลื่อนกำหนดออกไป');
  // ตอบข้อเดิมซ้ำในรอบใหม่วันเดียวกัน: ไม่ได้ EXP ซ้ำ
  const d1 = (await req('POST', '/api/c2/practice/start', { token: u.token, body: { mode: 'daily' } })).body;
  const d2 = (await req('POST', '/api/c2/practice/start', { token: u.token, body: { mode: 'daily' } })).body;
  assert.strictEqual(d1.sessionId, d2.sessionId, 'Daily ชุดเดียวทั้งวัน');
  const ctx = (await req('POST', '/api/c2/practice/start', { token: u.token, body: { mode: 'context' } })).body;
  assert.ok(ctx.items.every((x) => x.type === 'context' || x.type === 'meaning'));
  assert.ok(ctx.items.some((x) => x.passage && /\[\[.+\]\]/.test(x.passage)), 'Guess from Context มีข้อความที่ไฮไลต์คำเป้าหมาย');
  const fin = (await req('POST', `/api/c2/practice/${s.sessionId}/finish`, { token: u.token })).body;
  assert.strictEqual(fin.answered, 1);
});

test('multiple accepted answers: Word Formation แบบพิมพ์ รับทุกคำตอบใน accepted (ไม่สนตัวพิมพ์/ช่องว่าง)', async () => {
  await S.ready();
  const s = S.all().find((x) => x.q.formation && x.q.formation.accepted.length > 1) || S.all().find((x) => x.q.formation);
  const it = I.build(s, 'formtype', 'seed');
  assert.ok(it && it.input);
  for (const a of it.accepted) {
    assert.strictEqual(I.check(it, a).correct, true);
    assert.strictEqual(I.check(it, `  ${a.toUpperCase()} `).correct, true);
  }
  assert.strictEqual(I.check(it, 'zzzz').correct, false);
  assert.strictEqual(I.check(it, '').correct, false);
  const wrongOpt = s.q.formation.options.find((o) => !it.accepted.includes(o));
  assert.strictEqual(I.check(it, wrongOpt).correct, false);
  assert.ok(!('accepted' in I.publicView(it)));
});

test('question validation (runtime): ทุกข้อที่สร้างจากคลังมีตัวเลือกไม่ซ้ำ เฉลยเดียว และตัวลวงไม่ใช่ synonym ของเฉลย', async () => {
  await S.ready();
  let n = 0;
  for (const s of S.all()) {
    for (const t of I.TYPES) {
      const it = I.build(s, t, 'qa');
      if (!it || it.input) continue;
      n += 1;
      assert.strictEqual(new Set(it.choices.map((c) => c.toLowerCase())).size, it.choices.length, `${it.id} ตัวเลือกซ้ำ`);
      assert.ok(it.answer >= 0 && it.answer < it.choices.length);
      if (['meaning', 'context', 'reverse'].includes(t)) {
        const syn = new Set([...s.synonyms, ...s.nearSynonyms.map((x) => x.word)].map((x) => x.toLowerCase()));
        it.choices.forEach((c, i) => { if (i !== it.answer) assert.ok(!syn.has(c.toLowerCase()), `${it.id}: ตัวลวง ${c} เป็น synonym`); });
      }
    }
  }
  assert.ok(n > 1000, `สร้างข้อได้ ${n} ข้อ`);
});

/* ---------------- ค้นหา ---------------- */
test('C2 search: คำ · ไทย · วลี · collocation · synonym · ชนิด/tier/หัวข้อ · กรอง C2 · unverified ไม่แสดง', async () => {
  const u = await makeUser();
  const q = async (qs) => (await req('GET', `/api/vocab/search?${qs}`, { token: u.token })).body;
  const w = await q('q=ubiquitous&level=C2');
  assert.ok(w.words.some((x) => x.displayForm === 'ubiquitous' && x.cefr === 'C2'));
  const th = await q(`q=${encodeURIComponent('มีอยู่ทุกที่')}&level=C2`);
  assert.ok(th.total > 0);
  const phrase = await q(`q=${encodeURIComponent('slack')}&level=C2`);
  assert.ok(phrase.words.some((x) => /slack/.test(x.displayForm)), 'ค้นวลีด้วยคำกลางวลีได้');
  const col = await q(`q=${encodeURIComponent('become ubiquitous')}&level=C2`);
  assert.ok(col.words.some((x) => x.displayForm === 'ubiquitous'), 'ค้นด้วย collocation ได้');
  const syn = await q('q=omnipresent&level=C2');
  assert.ok(syn.words.some((x) => x.displayForm === 'ubiquitous'), 'ค้นด้วย synonym ได้');
  const idioms = await q('level=C2&kind=idiom');
  assert.ok(idioms.total > 0 && idioms.words.every((x) => x.kind === 'idiom'));
  const ext = await q('level=C2&tier=extended');
  assert.ok(ext.total > 0 && ext.words.every((x) => x.tier === 'extended'));
  const topic = await q('level=C2&topic=technology');
  assert.ok(topic.total > 0);
  const all = await q('level=C2');
  assert.strictEqual(all.countsByLevel.C2, all.total);
  assert.ok(all.words.length <= all.pageSize, 'แบ่งหน้าฝั่งเซิร์ฟเวอร์');
  // unverified ไม่แสดง
  await pool.query("UPDATE vocab_senses SET verification_status = 'unverified' WHERE public_id = 'C2-S0002'");
  try {
    const hidden = await q('level=C2');
    assert.strictEqual(hidden.total, all.total - 1);
    assert.strictEqual((await req('GET', '/api/vocab/C2-S0002', { token: u.token })).status, 404);
  } finally { await pool.query("UPDATE vocab_senses SET verification_status = 'autoChecked' WHERE public_id = 'C2-S0002'"); }
  // A1–C1 search ยังเหมือนเดิม
  const bank = await q('q=bank');
  assert.ok(bank.words.some((x) => x.headword === 'bank' && x.cefr !== 'C2'));
});

/* ---------------- Ranked ---------------- */
test('C2 Ranked questions: ผู้เล่น placement C1 + รู้ C2 ≥ 30 sense ได้คำถาม C2 · ไม่มีเฉลยหลุด · Core เท่านั้น', async () => {
  const svc = require('../services/ranked/matchService');
  const { buildMatchQuestions, publicQuestion } = require('../services/ranked/questionBank');
  const u = await makeUser();
  await pool.query(`INSERT INTO placement_attempts (user_id, questions, status, result, completed_at) VALUES ($1, '[]', 'completed', $2, NOW())`,
    [u.id, JSON.stringify({ overall: 'C1', vocab: 'C1', grammar: 'C1', recommendedStart: 'C1' })]);
  assert.strictEqual((await svc.getUserCefr(u.id)).cefr, 'C1');
  await S.ready();
  const ids = S.all().slice(0, 30).map((s) => s.id);
  await pool.query(`INSERT INTO word_progress (user_id, word_id, level, status, ever_known) SELECT $1, x, 'C2', 'known', TRUE FROM unnest($2::text[]) x`, [u.id, ids]);
  assert.strictEqual((await svc.getUserCefr(u.id)).cefr, 'C2');
  const qs = await buildMatchQuestions({ cefr: 'C2', tier: 'advanced', seed: 12345 });
  assert.ok(qs.length >= 5);
  const c2 = qs.filter((q) => q.cefr === 'C2');
  assert.ok(c2.length >= 5);
  for (const q of c2) {
    assert.ok(q.correctIndex >= 0 && q.correctIndex < q.choices.length);
    assert.strictEqual(S.get(q.ref.wordId).tier, 'core');
    const pub = publicQuestion(q, 0);
    assert.ok(!('correctIndex' in pub) && !('explain' in pub));
  }
  // A1 ยังได้คำถามเดิม
  const a1 = await buildMatchQuestions({ cefr: 'A1', tier: 'beginner', seed: 1 });
  assert.ok(a1.every((q) => q.cefr === 'A1'));
});

/* ---------------- Admin: C2 Content Audit ---------------- */
test('admin C2 audit: ผู้ใช้ทั่วไปเข้าไม่ได้ · กรอง/แบ่งหน้า · แก้แล้วตรวจซ้ำ · reviewed ไม่ได้ถ้ามี error · unverified ถูกถอดจากแบบฝึก', async () => {
  const u = await makeUser();
  assert.strictEqual((await req('GET', '/api/admin/c2/audit', { token: u.token })).status, 403);
  const a = await makeUser('ad');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [a.id]);
  const m = (await req('GET', '/api/admin/c2/metrics', { token: a.token })).body;
  assert.ok(m.totals.senses > 0 && m.status.autoChecked > 0 && m.kind.idiom > 0);
  const list = (await req('GET', '/api/admin/c2/audit?kind=idiom', { token: a.token })).body;
  assert.ok(list.total > 0 && list.items.every((x) => x.kind === 'idiom') && list.items.length <= list.pageSize);
  const warn = (await req('GET', '/api/admin/c2/audit?issue=warnings', { token: a.token })).body;
  assert.ok(warn.items.every((x) => x.issues.warnings.length > 0));
  const target = list.items[0];
  // reviewed + error (ไทยเสีย) → ปฏิเสธ
  const bad = await req('PATCH', `/api/admin/c2/${target.id}`, { token: a.token, body: { meaningTH: 'ิเสีย', status: 'reviewed' } });
  assert.strictEqual(bad.status, 400); assert.strictEqual(bad.body.code, 'HAS_ERRORS');
  // แก้ถูกต้อง + reviewed
  const ok = await req('PATCH', `/api/admin/c2/${target.id}`, { token: a.token, body: { shortMeaningTH: target.short, status: 'reviewed' } });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.item.status, 'reviewed');
  assert.strictEqual((await pool.query('SELECT count(*)::int AS n FROM content_edits WHERE word_id = $1', [target.id])).rows[0].n, 1);
  // ถอดออก (unverified) → ไม่อยู่ในคลังแบบฝึกทันที
  await req('PATCH', `/api/admin/c2/${target.id}`, { token: a.token, body: { status: 'unverified' } });
  assert.strictEqual(wordStore.findWord('C2', target.id), null);
  assert.strictEqual(S.get(target.id), null);
  await req('PATCH', `/api/admin/c2/${target.id}`, { token: a.token, body: { status: 'autoChecked' } });
  assert.ok(S.get(target.id));
});
