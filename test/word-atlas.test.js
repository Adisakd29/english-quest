/*
  Word Atlas (v1.14.0) — คลังคำศัพท์ A–Z
  ครอบคลุม PART 28: Browse A–Z · Search EN/TH · Filter CEFR · Learn/Complete Step · Shared EXP · กัน EXP ซ้ำ · Mastery · Review ·
  Resume ข้ามอุปกรณ์ · คำเดียวกันใน Oxford และ Word Atlas · lemma หลายความหมาย · แบ่งหน้าคลังใหญ่ · Migration · Validator · Unit ID คงที่
  ใช้ชุดข้อมูลจริง data/word-atlas/atlas-*.jsonl.gz (นำเข้าใน DB ทดสอบ ~10–15 วินาที)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const { seed } = require('../services/wordAtlas/seed');
const { validateSense, auditDb } = require('../services/wordAtlas/validator');
const A = require('../services/wordAtlas');

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'wa') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
const login = async (u) => (await req('POST', '/api/auth/login', { body: { identifier: `${u.name}@gmail.com`, password: 'password123' } })).body.token;
const expOf = async (uid) => (await pool.query('SELECT exp FROM users WHERE id = $1', [uid])).rows[0].exp;
/** ตอบข้อตามเฉลยในตารางรอบฝึก (ใช้เฉพาะในชุดทดสอบ) */
async function answerAll(token, s, { right = true } = {}) {
  const row = (await pool.query('SELECT questions FROM atlas_sessions WHERE id = $1', [s.sessionId])).rows[0];
  const out = [];
  for (const q of s.questions) {
    const full = row.questions[q.i];
    let body;
    if (q.type === 'spell') body = { i: q.i, text: right ? full.answer : 'zzzz' };
    else if (q.type === 'match') {
      const pairs = {};
      full.left.forEach((l, k) => { const r = right ? full.right.find((x) => x.senseId === l.senseId) : full.right[(k + 1) % full.right.length]; pairs[l.key] = r.key; });
      body = { i: q.i, pairs };
    } else body = { i: q.i, key: full.options.find((o) => o.correct === right).key };
    const r = await req('POST', `/api/word-atlas/sessions/${s.sessionId}/answer`, { token, body });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    out.push(r.body);
  }
  return out;
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await seed(pool, { force: true });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('Migration 070: ตาราง Word Atlas ครบ · progress_id = COALESCE(oxford, id) · ไม่ลบ/แก้ตารางเดิม', async () => {
  const t = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'atlas_%'")).rows.map((r) => r.table_name).sort();
  assert.deepStrictEqual(t, ['atlas_collection', 'atlas_lemmas', 'atlas_meta', 'atlas_reward_events', 'atlas_senses', 'atlas_sessions', 'atlas_unit_items', 'atlas_unit_progress', 'atlas_units']);
  const g = (await pool.query("SELECT is_generated FROM information_schema.columns WHERE table_name = 'atlas_senses' AND column_name = 'progress_id'")).rows[0];
  assert.strictEqual(g.is_generated, 'ALWAYS');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '070_word_atlas.sql'), 'utf8');
  assert.ok(!/\bDROP\b|DELETE FROM|TRUNCATE|ALTER TABLE (?!atlas_)/i.test(sql.replace(/--.*$/gm, '')), 'migration ต้องเพิ่มอย่างเดียว');
});

test('นำเข้าคลัง: จำนวนจริง · ลิงก์ Oxford ครบไม่ซ้ำ · Validator ไม่พบข้อผิดพลาดในรายการที่เรียนได้ · นำเข้าซ้ำ = ข้าม', async () => {
  const st = (await pool.query(`SELECT (SELECT count(*)::int FROM atlas_lemmas) AS lemmas, count(*)::int AS senses,
     count(*) FILTER (WHERE learnable)::int AS learnable, count(*) FILTER (WHERE oxford_sense_id IS NOT NULL)::int AS ox FROM atlas_senses`)).rows[0];
  assert.ok(st.lemmas >= 20000, `lemmas ${st.lemmas}`);
  assert.ok(st.learnable >= 8000, `learnable ${st.learnable}`);
  const visibleOx = (await pool.query(`SELECT count(*)::int AS n FROM vocab_senses WHERE public_id IS NOT NULL AND NOT is_supplemental
     AND (cefr <> 'C2' OR verification_status IN ('autoChecked','reviewed'))`)).rows[0].n;
  assert.strictEqual(st.ox, visibleOx, 'ทุกความหมาย Oxford ที่แสดงได้ถูกอ้างอิง (ไม่สร้างซ้ำ)');
  const audit = await auditDb(pool);
  assert.strictEqual(audit.duplicateLemmas, 0);
  assert.strictEqual(audit.duplicateOxfordLinks, 0);
  assert.strictEqual(audit.brokenOxfordLinks, 0);
  assert.strictEqual(audit.learnableWithErrors, 0, JSON.stringify(audit.sample));
  // ความหมายใหม่ห้ามมี CEFR ที่เดาเอง
  const guessed = (await pool.query('SELECT count(*)::int AS n FROM atlas_senses WHERE cefr IS NOT NULL AND oxford_sense_id IS NULL')).rows[0].n;
  assert.strictEqual(guessed, 0);
  // ที่เรียนได้ต้องมีคำแปลไทย + ผ่านการตรวจ + มีที่มา/สัญญาอนุญาต
  const bad = (await pool.query(`SELECT count(*)::int AS n FROM atlas_senses WHERE learnable AND (verification_status NOT IN ('reviewed','autoChecked')
     OR (oxford_sense_id IS NULL AND cardinality(thai) = 0) OR source = '' OR license = '')`)).rows[0].n;
  assert.strictEqual(bad, 0);
  const again = await seed(pool);
  assert.ok(again.skipped, 'checksum เดิม = ไม่นำเข้าซ้ำ');
});

test('Validator: จับ CEFR ที่เดา · คำแปลไทยปนอังกฤษ · ไม่ผ่านการตรวจแต่จะใช้เรียน · ป้ายหยาบ · ไฟล์เสียงเสีย · ไม่มีที่มา · รูปคำผิด', () => {
  const ok = { lemma: 'abandon', pos: 'verb', definition_en: 'To leave behind.', thai: ['ละทิ้ง'], source: 'WIKTIONARY', license: 'CC BY-SA 4.0',
    verification_status: 'autoChecked', learnable: true, labels: [], examples: [{ en: 'They had to abandon the car.' }], ipa_uk: 'əˈbændən' };
  assert.deepStrictEqual(validateSense(ok).errors, []);
  const e = (patch) => validateSense({ ...ok, ...patch }).errors;
  assert.ok(e({ cefr: 'B2' }).includes('cefr_without_verified_source'));
  assert.ok(e({ thai: ['ละทิ้ง abandon'] }).includes('thai_has_latin'));
  assert.ok(e({ verification_status: 'unverified' }).includes('learnable_unverified'));
  assert.ok(e({ labels: ['vulgar'] }).includes('sensitive_usage'));
  assert.ok(e({ audio_us: 'https://evil.example/x.mp3' }).includes('broken_audio_url'));
  assert.ok(e({ source: '' }).includes('missing_source_license'));
  assert.ok(e({ lemma: 'ab<script>' }).includes('invalid_word_form'));
  assert.ok(e({ pos: 'verbz' }).includes('invalid_pos'));
  assert.ok(e({ definition_en: null }).includes('missing_meaning'));
  assert.ok(e({ examples: [{ en: 'ok' }] }).includes('unnatural_example'));
  assert.ok(validateSense({ ...ok, ipa_uk: null }).warnings.includes('missing_pronunciation'));
});

test('Browse A–Z: ครบ 26 ตัว · คำขึ้นต้นด้วยตัวอักษรนั้น · Cursor pagination ไม่ซ้ำ/เรียงถูก · ไม่ส่งคลังทั้งหมด', async () => {
  const u = await makeUser();
  const hub = (await req('GET', '/api/word-atlas', { token: u.token })).body;
  assert.strictEqual(hub.letters.length, 26);
  assert.ok(hub.letters.every((l) => l.learned <= l.available));
  let cursor = null; const seen = new Set(); let prev = '';
  for (let p = 0; p < 4; p += 1) {
    const r = await req('GET', `/api/word-atlas/words?letter=m${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { token: u.token });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.words.length <= 30 && r.body.words.length > 0);
    for (const w of r.body.words) {
      assert.strictEqual(w.letter, 'm');
      assert.ok(!seen.has(w.id), 'ไม่ซ้ำข้ามหน้า'); seen.add(w.id);
      const k = w.lemma.replace(/^\([^)]*\)\s*/, '');
      assert.ok(k.localeCompare(prev, 'en') >= 0 || k >= prev, `เรียง ${prev} → ${k}`); prev = k;
    }
    cursor = r.body.nextCursor; assert.ok(cursor);
  }
  // หน้าใหญ่สุดยัง 30 รายการ · ตัวเลขรวมมาจาก DB จริง
  const all = await req('GET', '/api/word-atlas/words?sort=common&page=50', { token: u.token });
  assert.strictEqual(all.body.words.length, 30);
  const n = (await pool.query('SELECT count(*)::int AS n FROM atlas_lemmas')).rows[0].n;
  assert.strictEqual(all.body.total, n);
});

test('Search: อังกฤษขึ้นต้นด้วย + ตรงทั้งคำขึ้นก่อน · คำไทย · คำพ้องความหมาย · Filter CEFR/ชนิดคำ/Unclassified · ค่าแปลกไม่พัง', async () => {
  const u = await makeUser();
  const en = (await req('GET', '/api/word-atlas/words?q=abandon', { token: u.token })).body;
  assert.strictEqual(en.words[0].lemma, 'abandon');
  assert.ok(en.words.every((w) => w.lemma.startsWith('abandon')));
  const th = (await req('GET', `/api/word-atlas/words?q=${encodeURIComponent('แมว')}`, { token: u.token })).body;
  assert.ok(th.words.some((w) => w.lemma === 'cat'), JSON.stringify(th.words.map((w) => w.lemma)));
  const syn = (await req('GET', '/api/word-atlas/words?q=happy&rel=synonym', { token: u.token })).body;
  assert.ok(syn.total > 0);
  const b2 = (await req('GET', '/api/word-atlas/words?cefr=B2&pos=verb&sort=common', { token: u.token })).body;
  assert.ok(b2.total > 50);
  for (const w of b2.words) { assert.ok(w.cefrList.includes('B2')); assert.ok(w.posList.includes('verb')); }
  const un = (await req('GET', '/api/word-atlas/words?cefr=U&sort=common', { token: u.token })).body;
  assert.ok(un.words.every((w) => w.cefrList.length === 0 && w.cefr === null));
  for (const s of ['alpha', 'common', 'recommended', 'easy', 'recent', 'notLearned', 'needReview']) {
    const r = await req('GET', `/api/word-atlas/words?sort=${s}&letter=c`, { token: u.token });
    assert.strictEqual(r.status, 200, s);
  }
  const weird = await req('GET', `/api/word-atlas/words?q=${encodeURIComponent("%_'\";--")}&cefr=ZZ&pos=x&topic=../../`, { token: u.token });
  assert.strictEqual(weird.status, 200);
  assert.strictEqual((await req('GET', '/api/word-atlas/words')).status, 401, 'ต้องล็อกอิน');
});

test('Word Detail: lemma หลายความหมาย · Oxford เป็นหลัก + ส่วนเสริม · ที่มา/สัญญาอนุญาต · ความหมายที่ยังไม่ตรวจไม่แสดงคำแปลไทย', async () => {
  const u = await makeUser();
  const id = (await req('GET', '/api/word-atlas/words?q=bank&exact=1', { token: u.token })).body.words[0].id;
  const d = (await req('GET', `/api/word-atlas/words/${id}`, { token: u.token })).body;
  assert.ok(d.senses.length >= 2, 'bank มีหลายความหมาย');
  assert.ok(d.senses[0].oxfordId, 'ความหมาย Oxford ขึ้นก่อน');
  for (const s of d.senses) {
    assert.ok(s.source && s.license);
    if (!s.learnable && !s.oxfordId && s.verification === 'unverified') assert.deepStrictEqual(s.thai, []);
  }
  assert.strictEqual((await req('GET', '/api/word-atlas/words/L-000000000000', { token: u.token })).status, 404);
  assert.strictEqual((await req('GET', '/api/word-atlas/words/abc', { token: u.token })).status, 400);
});

test('เรียน Unit: ขั้นตอนตามข้อมูลจริง · เฉลยไม่หลุด · ตอบซ้ำไม่ได้ · EXP เข้าบัญชีเดียวกัน · จบ Unit ได้รางวัลครั้งเดียว · Resume ข้ามอุปกรณ์', async () => {
  const u = await makeUser();
  const unit = (await req('GET', '/api/word-atlas/units/B-001', { token: u.token })).body;
  assert.ok(unit.items.length >= 6 && unit.items.length <= 12);
  // เลือก Unit แล้วเข้าทายความหมายทันที (ไม่มีหน้าเนื้อหาก่อน)
  assert.deepStrictEqual(unit.steps.map((x) => x.k), ['quiz', 'complete']);
  assert.deepStrictEqual(unit.steps[0].quiz, ['meaning']);
  // ยังไม่ทำแบบฝึก → จบไม่ได้
  assert.strictEqual((await req('POST', '/api/word-atlas/units/B-001/complete', { token: u.token })).status, 409);
  // Resume: บันทึกขั้น แล้วเข้าจาก "อีกอุปกรณ์" (token ใหม่)
  await req('PUT', '/api/word-atlas/units/B-001/step', { token: u.token, body: { step: 1 } });
  const t2 = await login(u);
  const hub = (await req('GET', '/api/word-atlas', { token: t2 })).body;
  assert.strictEqual(hub.continue.unitId, 'B-001'); assert.strictEqual(hub.continue.step, 1);
  const exp0 = await expOf(u.id);
  let gained = 0;
  for (const [k, st] of unit.steps.entries()) {
    if (!st.quiz) continue;
    const s = (await req('POST', '/api/word-atlas/sessions', { token: u.token, body: { kind: 'unit', unitId: 'B-001', step: k } })).body;
    assert.ok(s.questions.length > 0);
    assert.ok(s.questions.every((q) => q.type === 'meaning' && q.options.length === 5), 'ทายความหมาย 5 ตัวเลือก');
    const raw = JSON.stringify(s.questions);
    assert.ok(!/"correct"|"answer"|senseId|progressId/.test(raw), `เฉลยหลุด: ${raw.slice(0, 200)}`);
    const res = await answerAll(u.token, s);
    gained += res.reduce((a, r) => a + r.gainedExp, 0);
    const dup = await req('POST', `/api/word-atlas/sessions/${s.sessionId}/answer`, { token: u.token, body: { i: 0, key: 'x' } });
    assert.strictEqual(dup.status, 409, 'ตอบข้อเดิมซ้ำไม่ได้');
  }
  assert.ok(gained > 0);
  const c1 = (await req('POST', '/api/word-atlas/units/B-001/complete', { token: u.token })).body;
  assert.strictEqual(c1.pct, 100);
  assert.strictEqual(c1.gainedExp, 15, 'จบ Unit +10 · ทำถูกหมด +5');
  assert.strictEqual(await expOf(u.id), exp0 + gained + 15, 'EXP เข้าบัญชีเดียวกัน (users.exp)');
  const logs = (await pool.query("SELECT reason, sum(amount)::int AS n FROM exp_log WHERE user_id = $1 GROUP BY 1", [u.id])).rows;
  assert.ok(logs.some((r) => r.reason === 'card_known'));
  assert.ok(logs.some((r) => r.reason === 'atlas_unit' && r.n === 10));
  const c2 = (await req('POST', '/api/word-atlas/units/B-001/complete', { token: u.token })).body;
  assert.strictEqual(c2.gainedExp, 0); assert.ok(c2.alreadyRewarded, 'รางวัล Unit ได้ครั้งเดียว');
  // ทำซ้ำทันที: ความหมายเดิมไม่ได้ EXP ซ้ำ (cooldown 20 ชม.)
  const s = (await req('POST', '/api/word-atlas/sessions', { token: u.token, body: { kind: 'unit', unitId: 'B-001', step: unit.steps.findIndex((x) => x.quiz) } })).body;
  const again = await answerAll(u.token, s);
  assert.strictEqual(again.reduce((a, r) => a + r.gainedExp, 0), 0, 'ไม่ได้ EXP ซ้ำจากการเปิดคำเดิม');
  assert.ok(again.every((r) => r.noExpReason === 'cooldown' || r.noExpReason === 'repeat'));
});

test('คำเดียวกันใน Oxford และ Word Atlas: ความคืบหน้า/EXP ชุดเดียว ไม่นับซ้ำ · Mastery แยกตามความหมาย', async () => {
  const u = await makeUser();
  // ความหมายแรกของ A-001 คือ Oxford "and" — ตอบผ่าน Word Atlas
  const unit = (await req('GET', '/api/word-atlas/units/A-001', { token: u.token })).body;
  const ox = unit.items.find((x) => x.oxfordId);
  assert.ok(ox);
  const s = (await req('POST', '/api/word-atlas/sessions', { token: u.token, body: { kind: 'unit', unitId: 'A-001', step: unit.steps.findIndex((x) => x.quiz) } })).body;
  await answerAll(u.token, s);
  const wp = (await pool.query('SELECT word_id, ever_known FROM word_progress WHERE user_id = $1 AND word_id = $2', [u.id, ox.oxfordId])).rows[0];
  assert.ok(wp && wp.ever_known, 'บันทึกในแถว word_progress ของ Oxford (public_id เดียวกัน)');
  const atlasOnlyRow = (await pool.query("SELECT count(*)::int AS n FROM word_progress WHERE user_id = $1 AND word_id LIKE 'WA-%' AND word_id IN (SELECT id FROM atlas_senses WHERE oxford_sense_id IS NOT NULL)", [u.id])).rows[0].n;
  assert.strictEqual(atlasOnlyRow, 0, 'ไม่สร้างแถวซ้ำด้วยรหัส Word Atlas');
  // หน้าคำศัพท์ Oxford เห็นความคืบหน้าเดียวกัน
  const vb = (await req('GET', `/api/vocab/${ox.oxfordId}`, { token: u.token })).body;
  assert.notStrictEqual(vb.status, 'new');
  // ตอบคำเดียวกันจาก Oxford ซ้ำ (บทเรียนเดิม) → ไม่ได้โบนัสคำใหม่ซ้ำ
  const { recordCardAnswer } = require('../services/vocab/record');
  const client = await pool.connect();
  try { await client.query('BEGIN'); const r = await recordCardAnswer(client, { userId: u.id, wordId: ox.oxfordId, level: ox.cefr, known: true }); await client.query('COMMIT'); assert.strictEqual(r.gainedExp, 0); assert.strictEqual(r.isFirstTimeKnown, false); }
  finally { client.release(); }
  // lemma หลายความหมาย: เรียนความหมายหนึ่ง อีกความหมายยัง "new"
  const multi = (await pool.query(`SELECT lemma_id, array_agg(id ORDER BY sense_no) AS ids, array_agg(progress_id ORDER BY sense_no) AS pids FROM atlas_senses WHERE learnable
     GROUP BY lemma_id HAVING count(*) >= 2 LIMIT 1`)).rows[0];
  const c2 = await pool.connect();
  try { await c2.query('BEGIN'); await recordCardAnswer(c2, { userId: u.id, wordId: multi.pids[0], level: 'WA', known: true, skill: 'atlas' }); await c2.query('COMMIT'); } finally { c2.release(); }
  const d = (await req('GET', `/api/word-atlas/words/${multi.lemma_id}`, { token: u.token })).body;
  const st = Object.fromEntries(d.senses.map((x) => [x.id, x.status]));
  assert.notStrictEqual(st[multi.ids[0]], 'new');
  assert.strictEqual(st[multi.ids[1]], 'new', 'ความหมายอื่นยังไม่ถูกนับว่ารู้');
});

test('Review Mistakes + SRS เดิม · Add to Review · Quiz หลายรูปแบบ (ไม่ใช่ Multiple Choice อย่างเดียว) · Collection', async () => {
  const u = await makeUser();
  const q = (await req('POST', '/api/word-atlas/sessions', { token: u.token, body: { kind: 'quiz', source: 'recommended' } })).body;
  assert.ok(q.questions.length >= 5);
  assert.ok(q.questions.every((x) => ['meaning', 'idiom', 'phrasal'].includes(x.type) && x.options.length === 5), 'ค่าเริ่มต้น = ทายความหมาย 5 ตัวเลือก');
  // เลือกหมวด (ตัวอักษร / หัวข้อ / ระดับ) → ทายความหมายทันที
  for (const body of [{ source: 'letter', letter: 'c' }, { source: 'topic', topic: 'food' }, { source: 'cefr', cefr: 'B1' }]) {
    const r = await req('POST', '/api/word-atlas/sessions', { token: u.token, body: { kind: 'quiz', ...body } });
    assert.strictEqual(r.status, 200, JSON.stringify(body));
    assert.ok(r.body.questions.length >= 5 && r.body.questions.every((x) => x.options.length === 5), JSON.stringify(body));
  }
  // ยังขอรูปแบบอื่นได้ผ่าน API (เช่น สะกดคำ)
  const sp = (await req('POST', '/api/word-atlas/sessions', { token: u.token, body: { kind: 'quiz', source: 'recommended', types: ['spell', 'match'] } })).body;
  assert.ok(sp.questions.some((x) => x.type === 'spell' || x.type === 'match'));
  await answerAll(u.token, q, { right: false });
  const rv = (await req('GET', '/api/word-atlas/review', { token: u.token })).body;
  assert.ok(rv.count.mistakes >= 1 && rv.items.length >= 1, 'คำที่ตอบผิดเข้ารายการทบทวน');
  const rs = await req('POST', '/api/word-atlas/sessions', { token: u.token, body: { kind: 'review' } });
  assert.strictEqual(rs.status, 200);
  // Add to Review: ไม่ให้ EXP · ใช้ word_progress เดิม
  const sid = (await pool.query('SELECT id, progress_id FROM atlas_senses WHERE learnable AND oxford_sense_id IS NULL LIMIT 1')).rows[0];
  const e0 = await expOf(u.id);
  const ar = await req('POST', `/api/word-atlas/review/${sid.id}`, { token: u.token, body: {} });
  assert.strictEqual(ar.status, 200); assert.strictEqual(await expOf(u.id), e0);
  assert.strictEqual((await pool.query('SELECT level FROM word_progress WHERE user_id = $1 AND word_id = $2', [u.id, sid.progress_id])).rows[0].level, 'WA');
  // Collection
  const lid = (await req('GET', '/api/word-atlas/words?q=abandon&exact=1', { token: u.token })).body.words[0].id;
  assert.strictEqual((await req('PUT', `/api/word-atlas/collection/${lid}`, { token: u.token })).status, 200);
  assert.deepStrictEqual((await req('GET', '/api/word-atlas/collection', { token: u.token })).body.words.map((w) => w.id), [lid]);
  const other = await makeUser();
  assert.strictEqual((await req('GET', '/api/word-atlas/collection', { token: other.token })).body.words.length, 0, 'ของคนอื่นไม่เห็น');
  assert.strictEqual((await req('POST', `/api/word-atlas/sessions/${q.sessionId}/answer`, { token: other.token, body: { i: 0, key: 'x' } })).status, 404);
  assert.strictEqual((await req('DELETE', `/api/word-atlas/collection/${lid}`, { token: u.token })).status, 200);
  assert.strictEqual((await req('PUT', '/api/word-atlas/collection/zzz', { token: u.token })).status, 400);
});

test('Daily / Recommended: เป็นคำที่เรียนได้และยังไม่เคยเห็น · Daily คงที่ทั้งวัน', async () => {
  const u = await makeUser();
  const h1 = (await req('GET', '/api/word-atlas', { token: u.token })).body;
  const h2 = (await req('GET', '/api/word-atlas', { token: u.token })).body;
  assert.strictEqual(h1.daily.length, 5);
  assert.deepStrictEqual(h1.daily.map((x) => x.id), h2.daily.map((x) => x.id));
  assert.ok(h1.recommended.every((w) => w.learnable > 0 && w.status === 'new'));
});

test('Unit ID คงที่: นำเข้าซ้ำไม่สลับ Unit · ชุดข้อมูลใหม่ = ต่อท้าย Unit ใหม่ · ความหมายที่หายไปเลิกใช้แต่ความคืบหน้ายังอยู่', async () => {
  const before = (await pool.query('SELECT unit_id, sense_id FROM atlas_unit_items ORDER BY unit_id, ord')).rows;
  const r = await seed(pool, { force: true });
  assert.strictEqual(r.report.unitsCreated, 0);
  const after = (await pool.query('SELECT unit_id, sense_id FROM atlas_unit_items ORDER BY unit_id, ord')).rows;
  assert.deepStrictEqual(after, before);
  // ชุดข้อมูลทดสอบเล็ก: 1 คำใหม่ที่ผ่านการตรวจ
  const maxQ = (await pool.query("SELECT COALESCE(max(seq),0)::int AS n FROM atlas_units WHERE letter = 'q'")).rows[0].n;
  const tmp = path.join(os.tmpdir(), `atlas-zz-test-${process.pid}.jsonl.gz`);
  const row = { lemma: 'quokkatestword', display: 'quokkatestword', kind: 'word', zipf: 3.1, band: 5, rank: 99999, ipa_uk: 'ˈkwɒkə', senses: [
    { id: 'WA-0123456789ab', pos: 'noun', def: 'A small marsupial found in Western Australia.', thai: ['ควอกกา'], ex: ['We saw a quokkatestword on the island.'],
      syn: [], ant: [], topics: ['nature'], labels: [], source: 'WIKTIONARY+REVIEW', license: 'CC BY-SA 4.0', status: 'autoChecked', flags: [], learnable: true }] };
  fs.writeFileSync(tmp, zlib.gzipSync(`${JSON.stringify(row)}\n`));
  try {
    const r2 = await seed(pool, { file: tmp, force: true });
    assert.strictEqual(r2.report.unitsCreated, 1);
    const nu = (await pool.query("SELECT unit_id FROM atlas_unit_items WHERE sense_id = 'WA-0123456789ab'")).rows[0];
    assert.strictEqual(nu.unit_id, `Q-${String(maxQ + 1).padStart(3, '0')}`);
    const keep = (await pool.query('SELECT unit_id, sense_id FROM atlas_unit_items WHERE sense_id <> $1 ORDER BY unit_id, ord', ['WA-0123456789ab'])).rows;
    assert.deepStrictEqual(keep, before, 'Unit เดิมไม่เปลี่ยน');
    assert.ok(r2.report.retired > 0, 'ความหมายที่ไม่มีในชุดใหม่ = เลิกใช้ทำแบบฝึก (ไม่ลบ)');
    assert.ok((await pool.query('SELECT count(*)::int AS n FROM atlas_senses')).rows[0].n > 70000, 'ไม่ลบแถวเดิม');
  } finally { fs.unlinkSync(tmp); await seed(pool, { force: true }); }
});

test('ผู้ดูแลเท่านั้นที่ดูรายงานคุณภาพได้', async () => {
  const u = await makeUser();
  assert.strictEqual((await req('GET', '/api/word-atlas/admin/quality', { token: u.token })).status, 403);
  assert.ok(A._internal.lessonPlan);
});
