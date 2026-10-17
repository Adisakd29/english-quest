/*
  กิจกรรม HALLOWEEN ADVENTURE 2026 (4 Chapter + Final Challenge) + ธีมรางวัล
  - เปิด/ปิดตามเวลาเซิร์ฟเวอร์ · ปลดล็อกตามลำดับ · ตัวนับ "อีก N" เริ่มนับเมื่อ Chapter ปลดล็อก · ด่านตรวจที่เซิร์ฟเวอร์ (จับเวลา/ส่งครั้งเดียว/เล่นต่อได้)
  - ส่งผลปลอมไม่ได้ · รับรางวัลครั้งเดียว · หลังจบรับไม่ได้ (ยกเว้นแอดมินชดเชย)
  - ธีมถาวร: บันทึกในบัญชี · คงอยู่หลังกิจกรรมจบ · เปลี่ยนกลับได้ · ใช้ธีมที่ไม่ได้เป็นเจ้าของไม่ได้
  - ประวัติ Ranked แบบแบ่งหน้า · รายชื่อเพื่อนบนแผนที่ (ซ่อนแรงค์ / บล็อก)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.RANKED_INTRO_MS = '20';
process.env.RANKED_REVEAL_MS = '20';

// ค่าเริ่มต้นของกิจกรรม = 10–31 ต.ค. 2569 · ถ้ารันชุดทดสอบหลังวันนั้น ให้เลื่อนช่วงเวลามาครอบเวลาปัจจุบัน (ทดสอบตรรกะเดียวกัน)
const DEFAULT_END = Date.parse('2026-11-01T00:00:00+07:00');
const SHIFTED = Date.now() > DEFAULT_END - 2 * 3600e3;
if (SHIFTED) {
  process.env.EVENT_HALLOWEEN_2026_START = new Date(Date.now() - 86400e3).toISOString();
  process.env.EVENT_HALLOWEEN_2026_END = new Date(Date.now() + 20 * 86400e3).toISOString();
}
const pool = require('../config/db');
const { createApp } = require('../app');
const ev = require('../services/events');
const { EVENT_BY_ID } = require('../config/events');

const EID = 'halloween-2026';
const E = EVENT_BY_ID[EID];
const START = new Date(E.startsAt).getTime();
const END = new Date(E.endsAt).getTime();
const MID = END - 3600e3;   // ใกล้หมดเวลา: ข้อมูลที่บันทึกระหว่างทดสอบ (เวลาจริง) อยู่ในช่วงกิจกรรมแน่นอน
const atTime = (t) => ev._setNow(() => t);

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
async function makeUser(prefix = 'ev') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitRounds(u, n) {
  for (let i = 0; i < 40; i++) {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM event_activity WHERE user_id = $1 AND kind = 'round'", [u.id]);
    if (rows[0].n >= n) return rows[0].n;
    await sleep(50);
  }
  return -1;
}
async function playNpcRanked(u) {
  await req('GET', '/api/ranked/me', { token: u.token });
  let s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } })).body;
  assert.ok(s.matchId, JSON.stringify(s));
  while (s.status === 'active') {
    if (s.phase === 'question') {
      const { rows } = await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [s.matchId]);
      // ตอบผิดทุกข้อ: ภารกิจ "เล่นจบ 1 รอบ" ต้องนับแม้แพ้
      const wrong = (rows[0].questions[s.index].correctIndex + 1) % 4;
      await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token, body: { questionIndex: s.index, choiceIndex: wrong } });
    }
    s = (await req('POST', `/api/ranked/matches/${s.matchId}/next`, { token: u.token })).body;
  }
  return s;
}


/* ---------- ตัวช่วย: ใส่ข้อมูลกิจกรรมแบบเดียวกับที่ระบบจริงบันทึก ---------- */
async function addRounds(u, n, { correct = 9, total = 10 } = {}) {
  await pool.query(`INSERT INTO event_activity (event_id, user_id, kind, ref, correct, total)
                    SELECT $1, $2, 'round', 't:' || gen_random_uuid(), $3, $4 FROM generate_series(1, $5)`, [EID, u.id, correct, total, n]);
}
async function addCorrect(u, n) {
  await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct) SELECT $1, 'grammar', 'test', NULL, TRUE FROM generate_series(1, $2)`, [u.id, n]);
}
async function addPass(u, sid) {
  await pool.query(`INSERT INTO event_challenge_attempts (event_id, user_id, questions, stage_id, score, passed, started_at, finished_at)
                    VALUES ($1, $2, '[]', $3, 0, TRUE, NOW(), NOW())`, [EID, u.id, sid]);
}
const state = async (u) => (await req('GET', `/api/events/${EID}`, { token: u.token })).body;
const chapter = (st, id) => st.chapters.find((c) => c.id === id);
const mission = (st, id) => st.chapters.flatMap((c) => c.missions).find((m) => m.id === id);
async function completeChapter1(u) { await addRounds(u, 5); await addCorrect(u, 30); }
async function completeAll(u) {
  await completeChapter1(u);
  await addPass(u, 'c2-1'); await addPass(u, 'c2-2'); await addPass(u, 'c2-3'); await addRounds(u, 8); await addCorrect(u, 50);
  for (const s of ['c3-1', 'c3-2', 'c3-3', 'c3-p']) await addPass(u, s);
  await addRounds(u, 10); await addCorrect(u, 70);
  for (const s of ['c4-1', 'c4-2', 'c4-3', 'c4-4', 'c4-m']) await addPass(u, s);
  await addRounds(u, 12); await addCorrect(u, 80);
  for (const s of ['f-1', 'f-2', 'f-3']) await addPass(u, s);
}
/** เล่นด่านผ่าน API จริง: wrong = จำนวนข้อที่ตั้งใจตอบผิด */
async function playStage(u, sid, wrong = 0) {
  const s = await req('POST', `/api/events/${EID}/stages/${sid}/start`, { token: u.token });
  assert.strictEqual(s.status, 200, JSON.stringify(s.body));
  assert.ok(s.body.questions.every((q) => q.correctIndex === undefined && q.answer === undefined), 'ไม่ส่งเฉลยให้เครื่องผู้เล่น');
  const { rows } = await pool.query('SELECT questions FROM event_challenge_attempts WHERE id = $1', [s.body.attemptId]);
  const answers = rows[0].questions.map((q, i) => {
    if (q.kind === 'spell') return i < wrong ? 'zzzz' : q.answer.toUpperCase();   // ตัวพิมพ์ใหญ่/เล็กไม่มีผล
    return i < wrong ? (q.correctIndex + 1) % q.choices.length : q.correctIndex;
  });
  const r = await req('POST', `/api/events/${EID}/attempts/${s.body.attemptId}/submit`, { token: u.token, body: { answers } });
  return { start: s.body, submit: r };
}

test.before(async () => {
  await pool.query('SELECT 1');
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(() => ev._setNow(null));
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('เวลา: ตั้งค่าได้ · จบ 31 ต.ค. 2569 23:59:59 (เวลาไทย) · ปิดเอง 1 พ.ย. · ใช้เวลาเซิร์ฟเวอร์', async () => {
  if (!SHIFTED) assert.strictEqual(END, DEFAULT_END);
  assert.strictEqual(ev.statusOf(E, END - 1000), 'active', '31 ต.ค. 23:59:59 ยังเปิด');
  assert.strictEqual(ev.statusOf(E, END), 'ended', '1 พ.ย. 00:00:00 ปิดแล้ว');
  assert.strictEqual(ev.statusOf(E, START - 1), 'upcoming');
  const u = await makeUser();
  atTime(START - 60e3);
  assert.strictEqual((await state(u)).status, 'upcoming');
  assert.strictEqual((await req('POST', `/api/events/${EID}/stages/c2-1/start`, { token: u.token })).status, 403, 'ก่อนเริ่มเล่นด่านไม่ได้');
  atTime(END + 1000);
  const st = await state(u);
  assert.strictEqual(st.status, 'ended');
  assert.strictEqual(st.canClaim, false);
  const list = (await req('GET', '/api/events', { token: u.token })).body.events;
  assert.strictEqual(list.find((x) => x.id === EID).status, 'ended', 'หลังจบย้ายไปกิจกรรมที่ผ่านมา');
  const row = (await pool.query('SELECT starts_at, ends_at FROM events WHERE id = $1', [EID])).rows[0];
  assert.strictEqual(new Date(row.ends_at).getTime(), END, 'บันทึกช่วงเวลาในฐานข้อมูล');
});

test('โครงสร้าง: 4 Chapter + Final ครบตามสเปก · เกณฑ์ปรับได้จาก Event Configuration · ยากกว่าเดิม', async () => {
  const ids = E.chapters.map((c) => c.id);
  assert.deepStrictEqual(ids, ['c1', 'c2', 'c3', 'c4', 'final']);
  const t = (id) => E.chapters.flatMap((c) => c.missions).find((m) => m.id === id).target;
  assert.deepStrictEqual([t('c1.rounds'), t('c2.rounds'), t('c3.rounds'), t('c4.rounds')], [5, 8, 10, 12]);
  assert.deepStrictEqual([t('c1.correct'), t('c2.correct'), t('c3.correct'), t('c4.correct')], [30, 50, 70, 80]);
  assert.strictEqual(t('c1.good'), 3);
  assert.strictEqual(t('c2.stages'), 3); assert.strictEqual(t('c3.stages'), 3); assert.strictEqual(t('c4.stages'), 4);
  assert.strictEqual(t('c3.precision'), 1); assert.strictEqual(t('c4.combo'), 1); assert.strictEqual(t('final.stages'), 3);
  // ทุกด่านสร้างโจทย์ได้ครบจำนวนในทุกระดับภาษา และไม่มีเฉลยหลุดในข้อมูลที่ส่งให้ผู้เล่น
  for (const cefr of ['A1', 'B1', 'C1']) {
    for (const [sid, s] of Object.entries(E.stages)) {
      const qs = await ev.buildStageQuestions(s, cefr, 42);
      const want = Object.values(s.mix).reduce((a, b) => a + b, 0);
      assert.strictEqual(qs.length, want, `${sid} @${cefr}`);
      assert.ok(qs.every((q) => (q.kind === 'spell' ? q.answer : q.choices[q.correctIndex] !== undefined)), sid);
    }
  }
  // ความยากจากทักษะ: มีด่านจับเวลา · ด่านห้ามผิด · ด่านต้องผ่านทุกหมวด · ด่านสะกดคำ (พิมพ์เอง)
  assert.strictEqual(E.stages['c3-p'].pass, Object.values(E.stages['c3-p'].mix).reduce((a, b) => a + b, 0));
  assert.ok(E.stages['c4-m'].sectionMin >= 3);
  assert.ok(Object.values(E.stages).some((s) => s.mix.spell));
  assert.ok(Object.values(E.stages).every((s) => s.timeLimitSec > 0 && s.timeLimitSec <= 360), 'ไม่มีด่านยาวเกิน 6 นาที');
});

test('Chapter: ปลดล็อกตามลำดับ · "อีก N" นับหลังปลดล็อก · ทำคะแนนผ่านเกณฑ์ต้องแม่นจริง · บันทึกอัตโนมัติ', async () => {
  atTime(MID);
  const u = await makeUser();
  let st = await state(u);
  assert.deepStrictEqual(st.chapters.map((c) => c.unlocked), [true, false, false, false, false]);
  // ด่านของ Chapter ที่ยังล็อก: เริ่มไม่ได้ (ตรวจที่เซิร์ฟเวอร์)
  const locked = await req('POST', `/api/events/${EID}/stages/c2-1/start`, { token: u.token });
  assert.strictEqual(locked.status, 403); assert.strictEqual(locked.body.code, 'STAGE_LOCKED');
  // เล่นเกมความแม่นยำต่ำ: นับเป็นรอบ แต่ไม่นับ "ผ่านเกณฑ์"
  await addRounds(u, 4, { correct: 3, total: 10 });
  await addRounds(u, 4, { correct: 8, total: 10 });   // รวม 8 รอบ (เกิน 5)
  st = await state(u);
  assert.strictEqual(mission(st, 'c1.rounds').progress, 5);
  assert.strictEqual(mission(st, 'c1.good').progress, 3);
  assert.strictEqual(mission(st, 'c1.correct').progress, 0);
  await addCorrect(u, 30);
  st = await state(u);
  assert.strictEqual(chapter(st, 'c1').complete, true);
  assert.strictEqual(chapter(st, 'c2').unlocked, true);
  assert.strictEqual(mission(st, 'c2.rounds').progress, 0, 'รอบที่เล่นก่อนปลดล็อก (เกินมา 3 รอบ) ไม่นับใน Chapter 2');
  assert.strictEqual(mission(st, 'c2.correct').progress, 0);
  await addRounds(u, 2); await addCorrect(u, 7);
  st = await state(u);
  assert.strictEqual(mission(st, 'c2.rounds').progress, 2);
  assert.strictEqual(mission(st, 'c2.correct').progress, 7);
  // บันทึกอัตโนมัติลงฐานข้อมูล (ดูข้ามเครื่องได้)
  const ch = (await pool.query('SELECT chapter_id, unlocked_at, completed_at FROM event_chapter_progress WHERE event_id = $1 AND user_id = $2 ORDER BY chapter_id', [EID, u.id])).rows;
  assert.ok(ch.find((r) => r.chapter_id === 'c1').completed_at);
  assert.ok(ch.find((r) => r.chapter_id === 'c2').unlocked_at);
  const mp = (await pool.query("SELECT progress FROM event_mission_progress WHERE event_id = $1 AND user_id = $2 AND mission_id = 'c2.rounds'", [EID, u.id])).rows[0];
  assert.strictEqual(mp.progress, 2);
  assert.strictEqual(chapter(st, 'c3').unlocked, false);
  assert.strictEqual(chapter(st, 'final').unlocked, false);
});

test('ทำคะแนนผ่านเกณฑ์: เล่นการ์ดคำศัพท์อย่างเดียวก็นับได้ (ทุก 10 ข้อ = 1 เกม · แม่น 70% ขึ้นไป)', async () => {
  atTime(MID);
  const u = await makeUser();
  const cards = async (correct, wrong) => {
    await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct)
      SELECT $1, 'vocab', 'w' || g, 'A1', g <= $2 FROM generate_series(1, $3) g`, [u.id, correct, correct + wrong]);
  };
  await cards(5, 5);   // เกมที่ 1: 50% ไม่ผ่านเกณฑ์
  for (let k = 0; k < 3; k++) await cards(8, 2);   // เกมที่ 2–4: 80% ผ่านเกณฑ์
  const st = await state(u);
  assert.strictEqual(mission(st, 'c1.rounds').progress, 4);
  assert.strictEqual(mission(st, 'c1.good').progress, 3, 'การ์ด 10 ข้อที่แม่น 70% ขึ้นไปต้องนับ');
  assert.strictEqual(mission(st, 'c1.good').done, true);
});

test('ด่าน: เฉลยอยู่เซิร์ฟเวอร์ · ผ่านตามลำดับ · ส่งซ้ำ/ส่งแทนคนอื่นไม่ได้ · จับเวลา · เล่นต่อหลังออกได้', async () => {
  atTime(MID);
  const u = await makeUser(); const other = await makeUser();
  await completeChapter1(u);
  // ด่านที่ 2 ต้องผ่านด่านแรกก่อน
  assert.strictEqual((await req('POST', `/api/events/${EID}/stages/c2-2/start`, { token: u.token })).body.code, 'STAGE_LOCKED');
  // ผิดเกินเกณฑ์ = ไม่ผ่าน
  const fail = await playStage(u, 'c2-1', 3);
  assert.strictEqual(fail.submit.body.passed, false);
  assert.strictEqual(fail.submit.body.reason, 'score');
  // ผ่าน (ผิด 1 ข้อ — เกณฑ์ 6/8)
  const ok = await playStage(u, 'c2-1', 1);
  assert.strictEqual(ok.submit.status, 200, JSON.stringify(ok.submit.body));
  assert.strictEqual(ok.submit.body.passed, true);
  assert.ok(ok.submit.body.results.every((x) => 'answer' in x), 'เฉลยแสดงหลังส่งเท่านั้น');
  // ส่งซ้ำไม่ได้ · ส่งแทนคนอื่นไม่ได้
  const again = await req('POST', `/api/events/${EID}/attempts/${ok.start.attemptId}/submit`, { token: u.token, body: { answers: [] } });
  assert.strictEqual(again.status, 409);
  const steal = await req('POST', `/api/events/${EID}/attempts/${ok.start.attemptId}/submit`, { token: other.token, body: { answers: [] } });
  assert.strictEqual(steal.status, 404);
  // เล่นต่อ: เริ่มด่านแล้ว "ออก" -> ดึงรอบเดิม (โจทย์เดิม) กลับมาได้ · กดเริ่มซ้ำได้รอบเดิม
  const s1 = await req('POST', `/api/events/${EID}/stages/c2-2/start`, { token: u.token });
  const cur = (await req('GET', `/api/events/${EID}/attempts/current`, { token: u.token })).body.attempt;
  assert.strictEqual(cur.attemptId, s1.body.attemptId);
  assert.deepStrictEqual(cur.questions.map((q) => q.prompt), s1.body.questions.map((q) => q.prompt));
  const s2 = await req('POST', `/api/events/${EID}/stages/c2-2/start`, { token: u.token });
  assert.strictEqual(s2.body.attemptId, s1.body.attemptId); assert.strictEqual(s2.body.resumed, true);
  // หมดเวลา (เวลาเซิร์ฟเวอร์) = ไม่ผ่าน แม้ตอบถูกหมด
  const { rows } = await pool.query('SELECT questions FROM event_challenge_attempts WHERE id = $1', [s1.body.attemptId]);
  const answers = rows[0].questions.map((q) => (q.kind === 'spell' ? q.answer : q.correctIndex));
  atTime(MID + (E.stages['c2-2'].timeLimitSec + E.stageRules.graceSec + 5) * 1000);
  const late = await req('POST', `/api/events/${EID}/attempts/${s1.body.attemptId}/submit`, { token: u.token, body: { answers } });
  assert.strictEqual(late.body.passed, false);
  assert.strictEqual(late.body.reason, 'time_up');
  // ด่านความแม่นยำ: ผิด 1 ข้อก็ไม่ผ่าน
  atTime(MID);
  await addPass(u, 'c2-2'); await addPass(u, 'c2-3'); await addRounds(u, 8); await addCorrect(u, 50);
  assert.strictEqual(chapter(await state(u), 'c3').unlocked, true);
  atTime(MID + 60e3);   // นาฬิกาจำลองเดินต่อ (ด่านถัดไปเล่นหลังเวลาปลดล็อก)
  const prec = await playStage(u, 'c3-p', 1);
  assert.strictEqual(prec.submit.body.passed, false);
  const prec2 = await playStage(u, 'c3-p', 0);
  assert.strictEqual(prec2.submit.body.passed, true);
  // คำตอบที่ถูกในด่าน นับรวมภารกิจ "ตอบถูกสะสม" ของ Chapter ที่กำลังทำ
  assert.ok(mission(await state(u), 'c3.correct').progress >= 15);
});

test('ด่านผสมทักษะ: ต้องผ่านขั้นต่ำทุกหมวด', async () => {
  atTime(MID);
  const u = await makeUser();
  await completeAll(u);
  await pool.query("DELETE FROM event_challenge_attempts WHERE user_id = $1 AND stage_id IN ('c4-m', 'f-1', 'f-2', 'f-3')", [u.id]);
  assert.strictEqual(chapter(await state(u), 'c4').complete, false);
  const s = await req('POST', `/api/events/${EID}/stages/c4-m/start`, { token: u.token });
  const { rows } = await pool.query('SELECT questions FROM event_challenge_attempts WHERE id = $1', [s.body.attemptId]);
  // ถูกทุกข้อยกเว้นหมวดสะกดคำ (ผิดหมด) -> คะแนนรวม 8/12 + หมวดสะกดคำ 0 -> ไม่ผ่าน
  const answers = rows[0].questions.map((q) => (q.kind === 'spell' ? 'wrong' : q.correctIndex));
  const r = await req('POST', `/api/events/${EID}/attempts/${s.body.attemptId}/submit`, { token: u.token, body: { answers } });
  assert.strictEqual(r.body.passed, false);
  assert.ok(['section', 'score'].includes(r.body.reason));
  assert.strictEqual(r.body.bySection.spell.correct, 0);
  const ok = await playStage(u, 'c4-m', 0);
  assert.strictEqual(ok.submit.body.passed, true);
  assert.strictEqual(chapter(await state(u), 'final').unlocked, true, 'ผ่าน Chapter 4 -> ปลดล็อก Final Challenge');
  // Final ต้องผ่านตามลำดับ
  assert.strictEqual((await req('POST', `/api/events/${EID}/stages/f-2/start`, { token: u.token })).body.code, 'STAGE_LOCKED');
});

test('เกมจริงนับภารกิจ: จบ Ranked (แพ้ก็นับ) บันทึกเป็นรอบพร้อมคะแนน · เกมเดียวกันนับครั้งเดียว', async () => {
  atTime(MID);
  const u = await makeUser();
  const end = await playNpcRanked(u);
  assert.strictEqual(end.status, 'finished');
  assert.strictEqual(await waitRounds(u, 1), 1);
  const row = (await pool.query("SELECT correct, total FROM event_activity WHERE user_id = $1 AND kind = 'round'", [u.id])).rows[0];
  assert.strictEqual(row.correct, 0); assert.ok(row.total > 0);
  assert.strictEqual(mission(await state(u), 'c1.rounds').progress, 1);
  assert.strictEqual(mission(await state(u), 'c1.good').progress, 0, 'แพ้ด้วยความแม่นยำ 0% ไม่นับ "ผ่านเกณฑ์"');
  ev.recordRound(u.id, 'dup:1', { correct: 9, total: 10 }); ev.recordRound(u.id, 'dup:1', { correct: 9, total: 10 });
  await waitRounds(u, 2); await sleep(150);
  assert.strictEqual((await pool.query("SELECT COUNT(*)::int AS n FROM event_activity WHERE user_id = $1 AND ref = 'dup:1'", [u.id])).rows[0].n, 1);
});

test('รางวัล: ต้องผ่านครบ 4 Chapter + Final · รับได้ครั้งเดียว · ธีมถาวร หลังกิจกรรมจบยังใช้ได้ · เปลี่ยนกลับได้', async () => {
  atTime(MID);
  const u = await makeUser();
  await completeChapter1(u);
  const early = await req('POST', `/api/events/${EID}/claim`, { token: u.token, body: { complete: true } });
  assert.strictEqual(early.status, 403); assert.strictEqual(early.body.code, 'MISSIONS_INCOMPLETE');
  assert.strictEqual((await req('PUT', '/api/themes/current', { token: u.token, body: { theme: 'halloween-2026' } })).status, 403);
  await pool.query('DELETE FROM event_activity WHERE user_id = $1', [u.id]);
  await pool.query('DELETE FROM answer_events WHERE user_id = $1', [u.id]);
  await completeAll(u);
  const st = await state(u);
  assert.ok(st.chapters.every((c) => c.complete), JSON.stringify(st.chapters.map((c) => [c.id, c.complete])));
  assert.strictEqual(st.canClaim, true);
  const results = await Promise.all([1, 2, 3, 4].map(() => req('POST', `/api/events/${EID}/claim`, { token: u.token })));
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.body)));
  assert.strictEqual(results.filter((r) => !r.body.alreadyClaimed).length, 1, 'ได้รางวัลจริงครั้งเดียว');
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM event_reward_claims WHERE user_id = $1', [u.id])).rows[0].n, 1);
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM user_themes WHERE user_id = $1', [u.id])).rows[0].n, 1);
  assert.strictEqual((await req('PUT', '/api/themes/current', { token: u.token, body: { theme: 'halloween-2026' } })).body.current, 'halloween-2026');
  // หลังกิจกรรมจบ + ล็อกอินใหม่ (อุปกรณ์ใหม่): ธีมยังอยู่ ใช้ต่อได้
  atTime(END + 30 * 86400e3);
  const login = await req('POST', '/api/auth/login', { body: { identifier: u.name, password: 'password123' } });
  assert.strictEqual(login.status, 200, JSON.stringify(login.body));
  const tok = login.body.token;
  const th = (await req('GET', '/api/themes', { token: tok })).body;
  assert.strictEqual(th.current, 'halloween-2026');
  assert.deepStrictEqual(th.owned, ['halloween-2026']);
  const after = (await req('GET', `/api/events/${EID}`, { token: tok })).body;
  assert.strictEqual(after.status, 'ended'); assert.strictEqual(after.claimed, true); assert.strictEqual(after.reward.owned, true);
  assert.ok(after.complete, 'ความสำเร็จยังแสดงหลังกิจกรรมจบ');
  assert.strictEqual((await req('PUT', '/api/themes/current', { token: tok, body: { theme: 'light' } })).body.current, 'light');
  assert.strictEqual((await req('PUT', '/api/themes/current', { token: tok, body: { theme: 'halloween-2026' } })).body.current, 'halloween-2026');
  assert.strictEqual((await req('PUT', '/api/themes/current', { token: tok, body: { theme: 'gold-hacker' } })).status, 400);
});

test('หลังกิจกรรมจบ: ผู้เล่นรับ/เล่นด่านไม่ได้ · ไม่มีบัญชีเรียก API ไม่ได้ · แอดมินชดเชยย้อนหลังได้ (ไม่ซ้ำ)', async () => {
  atTime(MID);
  const u = await makeUser();
  await completeAll(u);
  assert.strictEqual((await state(u)).canClaim, true);
  atTime(END + 5000);   // ผ่านครบแต่ไม่ได้กดรับก่อนหมดเวลา
  assert.strictEqual((await req('POST', `/api/events/${EID}/claim`, { token: u.token })).status, 403);
  assert.strictEqual((await req('POST', `/api/events/${EID}/stages/c2-1/start`, { token: u.token })).status, 403);
  // ไม่มีบัญชี (Guest) = ไม่มีสิทธิ์บันทึกรางวัล
  assert.strictEqual((await req('POST', `/api/events/${EID}/claim`)).status, 401);
  assert.strictEqual((await req('GET', `/api/events/${EID}`)).status, 401);
  const adm = await makeUser('ad');
  assert.strictEqual((await req('POST', `/api/events/${EID}/admin-grant`, { token: u.token, body: { userId: u.id } })).status, 403, 'ผู้เล่นทั่วไปปลดล็อกเองไม่ได้');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.id]);
  assert.strictEqual((await req('POST', `/api/events/${EID}/admin-grant`, { token: adm.token, body: { userId: u.id } })).status, 200);
  assert.strictEqual((await req('POST', `/api/events/${EID}/admin-grant`, { token: adm.token, body: { userId: u.id } })).status, 200);
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM event_reward_claims WHERE user_id = $1', [u.id])).rows[0].n, 1);
  assert.strictEqual((await pool.query('SELECT granted_by FROM event_reward_claims WHERE user_id = $1', [u.id])).rows[0].granted_by, adm.id);
  assert.deepStrictEqual((await req('GET', '/api/themes', { token: u.token })).body.owned, ['halloween-2026']);
});

test('ข้อมูลเดิมไม่หาย: ประวัติ Ranked แบ่งหน้า (ล่าสุด 3 / ทั้งหมด) จากแถวเดิมใน DB', async () => {
  const u = await makeUser('hi');
  for (let i = 0; i < 4; i++) await playNpcRanked(u);
  const total = (await pool.query("SELECT COUNT(*)::int AS n FROM ranked_match_players WHERE user_id = $1", [u.id])).rows[0].n;
  assert.strictEqual(total, 4);
  const last3 = (await req('GET', '/api/ranked/history?limit=3', { token: u.token })).body;
  assert.strictEqual(last3.matches.length, 3);
  assert.strictEqual(last3.more, true);
  const next = (await req('GET', '/api/ranked/history?limit=3&offset=3', { token: u.token })).body;
  assert.strictEqual(next.matches.length, 1);
  assert.strictEqual(next.more, false);
  const ids = [...last3.matches, ...next.matches].map((m) => m.id || m.matchId);
  assert.strictEqual(new Set(ids).size, 4, 'ไม่ซ้ำ ไม่ขาด');
  assert.strictEqual((await pool.query("SELECT COUNT(*)::int AS n FROM ranked_match_players WHERE user_id = $1", [u.id])).rows[0].n, 4, 'อ่านอย่างเดียว ไม่ลบประวัติ');
});

test('เพื่อนบนแผนที่: เห็นเฉพาะเพื่อนที่ยอมรับแล้ว · ซ่อนแรงค์ได้ · ไม่โชว์คนที่บล็อก', async () => {
  const me = await makeUser('fm'); const a = await makeUser('fa'); const b = await makeUser('fb'); const stranger = await makeUser('fs');
  for (const f of [a, b]) {
    await req('POST', '/api/friends/request', { token: me.token, body: { userId: f.id } });
    await req('POST', '/api/friends/request', { token: f.token, body: { userId: me.id } });
    await req('GET', '/api/ranked/me?mode=vocab', { token: f.token });
  }
  await req('GET', '/api/ranked/me?mode=vocab', { token: stranger.token });
  await pool.query("UPDATE ranked_profiles SET league = 'moon-wolf', division_index = 1 WHERE user_id = $1 AND mode = 'vocab'", [a.id]);
  let fr = (await req('GET', '/api/ranked/friends?mode=vocab', { token: me.token })).body.friends;
  assert.deepStrictEqual(fr.map((f) => f.id).sort(), [a.id, b.id].sort());
  const fa = fr.find((f) => f.id === a.id);
  assert.strictEqual(fa.league, 'moon-wolf'); assert.strictEqual(fa.divisionIndex, 1);
  assert.strictEqual((await req('PUT', '/api/ranked/privacy', { token: b.token, body: { hideFromFriends: true } })).status, 200);
  fr = (await req('GET', '/api/ranked/friends?mode=vocab', { token: me.token })).body.friends;
  assert.deepStrictEqual(fr.map((f) => f.id), [a.id], 'คนที่ซ่อนแรงค์ไม่แสดง');
  assert.strictEqual((await req('GET', '/api/ranked/privacy', { token: b.token })).body.hideFromFriends, true);
  // บล็อกกัน -> ไม่แสดงบนแผนที่ (แม้ยังเป็นเพื่อนในตาราง)
  await pool.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [a.id, me.id]);
  fr = (await req('GET', '/api/ranked/friends?mode=vocab', { token: me.token })).body.friends;
  assert.deepStrictEqual(fr, []);
  assert.ok(!(await req('GET', '/api/ranked/friends?mode=vocab', { token: stranger.token })).body.friends.length, 'คนที่ไม่ใช่เพื่อนไม่เห็น');
});
