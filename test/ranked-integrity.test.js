/*
  v1.18.3 ความยุติธรรมของ Ranked — กันบอท/สคริปต์ (F12) ที่อ่านโจทย์แล้วค้นคำตอบเองและตอบทันที
    - ตอบถูกเร็วเกินมนุษย์ = ไม่มีโบนัสความเร็ว · หลายข้อในเกมเดียว = ชนะไม่นับแต้มแรงค์/EXP
    - ระหว่างแข่งค้นคำศัพท์ในแอปไม่ได้
    - ริบแต้มย้อนหลัง + คืนแต้มคู่แข่ง PvP · คืนค่าได้
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// เปิดการตรวจตามค่าจริงของ production (ชุดทดสอบอื่นปิดไว้ใน test/helpers/test-env.js)
process.env.RANKED_MIN_HUMAN_MS = '600';
process.env.LEARN_MIN_HUMAN_MS = '600';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const { RULES, INTEGRITY } = require('../config/leagues');
const svc = require('../services/ranked/matchService');
const I = require('../services/ranked/integrity');

let server; let base;
function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + path, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser() {
  const name = `ig${Date.now() % 1e9}${Math.floor(Math.random() * 1e4)}`;
  const r = await req('POST', '/api/auth/register', { body: { username: name.slice(0, 20), email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const correctOf = async (matchId, i) => (await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [matchId])).rows[0].questions[i].correctIndex;
const profile = async (uid) => (await pool.query("SELECT * FROM ranked_profiles WHERE user_id = $1 AND mode = 'vocab'", [uid])).rows[0];
const exp = async (uid) => (await pool.query('SELECT exp FROM users WHERE id = $1', [uid])).rows[0].exp;

/** เล่นจนจบ ตอบถูกทุกข้อ · humanMs = จำลองว่าผู้เล่นใช้เวลาคิดกี่ ms (null = ตอบทันทีแบบบอท) */
async function playAll(u, { humanMs = null } = {}) {
  let s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode: 'vocab' } })).body;
  assert.ok(s.matchId, JSON.stringify(s));
  const id = s.matchId;
  while (s.status === 'active') {
    if (s.phase === 'question') {
      if (humanMs) await pool.query(`UPDATE ranked_matches SET question_opened_at = NOW() - make_interval(secs => $2::float / 1000) WHERE id = $1`, [id, humanMs]);
      const a = await req('POST', `/api/ranked/matches/${id}/answer`, { token: u.token, body: { questionIndex: s.index, choiceIndex: await correctOf(id, s.index) } });
      assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    }
    s = (await req('POST', `/api/ranked/matches/${id}/next`, { token: u.token })).body;
  }
  return { id, s };
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

test('แต้มต่อข้อ: ตอบถูกเร็วกว่าเกณฑ์มนุษย์ = ไม่มีโบนัสความเร็ว · NPC ใช้สูตรเดิม', () => {
  assert.strictEqual(INTEGRITY.minHumanMs, 600);
  assert.strictEqual(INTEGRITY.flagFastCorrect, 3);
  assert.strictEqual(svc.playerPointsFor(true, 50), RULES.pointsCorrect);
  assert.strictEqual(svc.playerPointsFor(true, 599), RULES.pointsCorrect);
  assert.strictEqual(svc.playerPointsFor(true, 1500), svc.pointsFor(true, 1500));
  assert.ok(svc.playerPointsFor(true, 1500) > RULES.pointsCorrect);
  assert.strictEqual(svc.playerPointsFor(false, 50), 0);
  assert.ok(svc.pointsFor(true, 50) > RULES.pointsCorrect, 'สูตรของ NPC ไม่เปลี่ยน');
});

test('บอทตอบทันที (ถูกทุกข้อ): ชนะแต่ไม่ได้แต้มแรงค์/EXP · บันทึกการตรวจพบ · หน้าผลบอกเหตุผล', async () => {
  const u = await makeUser();
  const e0 = await exp(u.id);
  const { id, s } = await playAll(u);
  const r = s.result;
  assert.strictEqual(r.outcome, 'win');
  assert.strictEqual(r.integrity.voided, true);
  assert.ok(r.integrity.fastCorrect >= 3);
  assert.strictEqual(r.qr.delta, 0);
  assert.strictEqual(r.exp.gained, 0); assert.strictEqual(r.exp.reason, 'integrity');
  assert.strictEqual(await exp(u.id), e0);
  const p = await profile(u.id);
  assert.strictEqual(p.quest_rating, 0); assert.strictEqual(p.wins, 0, 'ไม่นับเป็นชัยชนะ');
  const f = (await pool.query('SELECT * FROM ranked_integrity_flags WHERE match_id = $1', [id])).rows;
  assert.strictEqual(f.length, 1); assert.strictEqual(f[0].action, 'voided'); assert.strictEqual(f[0].source, 'live');
  // ระบบตรวจย้อนหลังไม่นับซ้ำ (แต้มไม่ได้อยู่แล้ว)
  assert.ok(!(await I.planReclaim(pool)).flagged.some((x) => Number(x.match_id) === id));
});

test('คนจริงตอบ ~1.5 วินาที: ได้แต้ม/EXP ตามปกติ · ไม่ถูกตรวจพบ', async () => {
  const u = await makeUser();
  const { id, s } = await playAll(u, { humanMs: 1500 });
  assert.strictEqual(s.result.outcome, 'win');
  assert.strictEqual(s.result.integrity, null);
  assert.ok(s.result.qr.delta > 0 && s.result.exp.gained > 0);
  assert.ok(s.result.scores.you > 10 * RULES.pointsCorrect, 'ได้โบนัสความเร็ว');
  assert.strictEqual((await pool.query('SELECT 1 FROM ranked_integrity_flags WHERE match_id = $1', [id])).rowCount, 0);
});

test('ระหว่างแข่ง Ranked ค้น/เปิดคำศัพท์ในแอปไม่ได้ (423) · จบเกมแล้วใช้ได้', async () => {
  const u = await makeUser();
  assert.strictEqual((await req('GET', '/api/vocab/search?q=write', { token: u.token })).status, 200);
  const st = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode: 'vocab' } })).body;
  const s1 = await req('GET', '/api/vocab/search?q=write', { token: u.token });
  assert.strictEqual(s1.status, 423); assert.strictEqual(s1.body.code, 'RANKED_IN_PROGRESS');
  assert.strictEqual((await req('GET', '/api/vocab/A1-0001', { token: u.token })).status, 423);
  await req('POST', `/api/ranked/matches/${st.matchId}/forfeit`, { token: u.token });
  assert.strictEqual((await req('GET', '/api/vocab/search?q=write', { token: u.token })).status, 200);
});

test('ริบแต้มย้อนหลัง (เกมก่อนมีระบบตรวจ) → ตรวจก่อนไม่แก้อะไร → ทำจริง → คืนค่าได้', async () => {
  const u = await makeUser();
  const { id, s } = await playAll(u, { humanMs: 1500 });
  const gain = s.result.qr.delta;
  const before = await profile(u.id);
  assert.strictEqual(before.quest_rating, gain);
  // จำลองเกมเก่าที่บอทเล่น (ก่อน v1.18.3 ระบบยังไม่ตรวจ)
  await pool.query('UPDATE ranked_answers SET response_ms = 80 WHERE match_id = $1 AND slot = 0', [id]);
  const plan = await I.planReclaim(pool);
  const mine = plan.cheaters.find((c) => c.userId === u.id);
  assert.ok(mine && mine.gain === gain && mine.matches.includes(id));
  assert.strictEqual((await profile(u.id)).quest_rating, gain, 'แค่ตรวจ ไม่แก้');

  const out = await I.applyReclaim(pool, plan);
  const after = await profile(u.id);
  assert.strictEqual(after.quest_rating, 0);
  assert.strictEqual(after.wins, before.wins - 1);
  assert.strictEqual(after.season_highest_qr, 0);
  const f = (await pool.query('SELECT action, source, qr_withheld FROM ranked_integrity_flags WHERE match_id = $1 AND user_id = $2', [id, u.id])).rows[0];
  assert.deepStrictEqual([f.action, f.source, f.qr_withheld], ['reclaimed', 'reclaim', gain]);
  assert.ok(!(await I.planReclaim(pool)).cheaters.some((c) => c.userId === u.id), 'ริบซ้ำไม่ได้');
  // EXP / ประวัติแมตช์ไม่ถูกแตะ
  assert.strictEqual((await pool.query("SELECT status FROM ranked_matches WHERE id = $1", [id])).rows[0].status, 'finished');

  const rv = await I.revertReclaim(pool, out.batchId);
  assert.ok(rv.reverted >= 1);
  const back = await profile(u.id);
  assert.deepStrictEqual([back.quest_rating, back.wins, back.league], [before.quest_rating, before.wins, before.league]);
});

test('PvP: ริบแต้มผู้โกง + คืนแต้มคู่แข่งที่แพ้ · ระหว่างแข่งจริงคนที่แพ้ผู้โกงไม่เสียแต้ม', async () => {
  const cheat = await makeUser(); const victim = await makeUser();
  const { id: srcId } = await playAll(cheat, { humanMs: 1500 });
  await playAll(victim, { humanMs: 1500 });
  // สร้างแมตช์ PvP ในอดีต (คัดลอกโครงจากแมตช์จริง) : ผู้โกงชนะ +20 · คู่แข่งแพ้ −10
  const id = (await pool.query(
    `INSERT INTO ranked_matches SELECT * FROM json_populate_record(NULL::ranked_matches,
       (SELECT (to_jsonb(m) || jsonb_build_object('id', nextval(pg_get_serial_sequence('ranked_matches', 'id')), 'opponent_kind', 'player',
          'player2_id', $2::int, 'npc_id', NULL))::json FROM ranked_matches m WHERE id = $1)) RETURNING id`, [srcId, victim.id])).rows[0].id;
  const pc = await profile(cheat.id); const pv = await profile(victim.id);
  await pool.query(`INSERT INTO ranked_match_players (match_id, slot, user_id, qr_before, qr_after, outcome) VALUES
    ($1, 0, $2, $3, $4, 'win'), ($1, 1, $5, $6, $7, 'loss')`, [id, cheat.id, pc.quest_rating, pc.quest_rating + 20, victim.id, pv.quest_rating, pv.quest_rating - 10]);
  for (let i = 0; i < 4; i += 1) {
    await pool.query('INSERT INTO ranked_answers (match_id, slot, question_index, choice_index, correct, points, response_ms) VALUES ($1, 0, $2, 0, TRUE, 700, 70), ($1, 1, $2, 1, FALSE, 0, 4000)', [id, i]);
  }
  await pool.query("UPDATE ranked_profiles SET quest_rating = quest_rating + 20 WHERE user_id = $1 AND mode = 'vocab'", [cheat.id]);
  await pool.query("UPDATE ranked_profiles SET quest_rating = quest_rating - 10 WHERE user_id = $1 AND mode = 'vocab'", [victim.id]);

  // ตอนจบเกม (live): คู่แข่งที่แพ้ผู้โกงไม่เสียแต้ม
  const j = await I.judge(pool, id, victim.id);
  assert.strictEqual(j.flagged, false); assert.strictEqual(j.opponentFlagged, true);
  assert.strictEqual((await I.judge(pool, id, cheat.id)).flagged, true);

  const plan = await I.planReclaim(pool);
  assert.strictEqual(plan.cheaters.find((c) => c.userId === cheat.id).gain, 20);
  assert.strictEqual(plan.refunds.find((r) => r.userId === victim.id).amount, 10);
  const out = await I.applyReclaim(pool, plan);
  assert.strictEqual((await profile(cheat.id)).quest_rating, pc.quest_rating);
  assert.strictEqual((await profile(victim.id)).quest_rating, pv.quest_rating);
  const log = (await pool.query('SELECT kind, amount FROM ranked_qr_reclaims WHERE batch_id = $1 ORDER BY kind', [out.batchId])).rows;
  assert.ok(log.some((l) => l.kind === 'cheater' && l.amount === -20) && log.some((l) => l.kind === 'refund' && l.amount === 10));
});

test('แอดมินเท่านั้น: ดูรายการ / ริบแต้ม / คืนค่า', async () => {
  const u = await makeUser();
  assert.strictEqual((await req('GET', '/api/ranked/admin/integrity', { token: u.token })).status, 403);
  assert.strictEqual((await req('POST', '/api/ranked/admin/integrity/reclaim', { token: u.token })).status, 403);
  assert.strictEqual((await req('POST', '/api/ranked/admin/integrity/revert', { token: u.token, body: { batchId: 'rc-x-000000' } })).status, 403);
});

/* ======================= EXP (หมวดเรียน + ย้อนหลัง) ======================= */
const { grantOnce } = require('../utils/exp');
const pace = require('../utils/answerPace');
const backdate = (uid, ms = 2000) => pool.query(`UPDATE users SET last_answer_at = NOW() - make_interval(secs => $2::float / 1000) WHERE id = $1`, [uid, ms]);

test('หมวดเรียน: การ์ดคำศัพท์ตอบห่างกัน < 0.6 วิ = ไม่ได้ EXP (ความคืบหน้ายังนับ) · ตอบตามจังหวะคนได้ปกติ', async () => {
  const u = await makeUser();
  const ws = require('../utils/wordStore'); await ws.ready();
  const words = ws.getLevelWords('A1').filter((w) => ws.isPlayable(w.id)).slice(0, 3);
  const ans = (w) => req('POST', '/api/progress/review', { token: u.token, body: { wordId: w.id, level: 'A1', chosenWordId: w.id } });
  const a = (await ans(words[0])).body;
  assert.ok(a.gainedExp > 0, 'ข้อแรกได้ EXP');
  const b = (await ans(words[1])).body;                     // ทันทีหลังข้อแรก (บอท)
  assert.strictEqual(b.gainedExp, 0); assert.strictEqual(b.noExpReason, 'too_fast');
  assert.strictEqual(b.correct, true);
  const pr = (await pool.query('SELECT times_seen, times_correct FROM word_progress WHERE user_id = $1 AND word_id = $2', [u.id, words[1].id])).rows[0];
  assert.deepStrictEqual([pr.times_seen, pr.times_correct], [1, 1], 'ความคืบหน้ายังนับ');
  await backdate(u.id);                                      // คนจริง: ห่างกัน 2 วินาที
  assert.ok((await ans(words[2])).body.gainedExp > 0);
});

test('หมวดเรียน: EXP รายข้อ (grantOnce c2q/glq/tNq…) ตอบเร็วเกินมนุษย์ = 0 และไม่เผาคีย์ · คีย์อื่น (จบขั้น/สตรีค) ไม่ถูกตรวจ', async () => {
  const u = await makeUser();
  await backdate(u.id);
  assert.strictEqual((await grantOnce(u.id, 'glq:test-a', 10, { reason: 'grammar_lesson' })).gained, 10);
  const fast = await grantOnce(u.id, 'glq:test-b', 10, { reason: 'grammar_lesson' });
  assert.strictEqual(fast.gained, 0); assert.strictEqual(fast.tooFast, true);
  assert.strictEqual((await grantOnce(u.id, 'gls:topic:1', 5, { reason: 'grammar_lesson' })).gained, 5, 'จบขั้นในคำขอเดียวกันไม่ถูกตรวจ');
  await backdate(u.id);
  assert.strictEqual((await grantOnce(u.id, 'glq:test-b', 10, { reason: 'grammar_lesson' })).gained, 10, 'ตอบใหม่ตามจังหวะคน ได้ EXP ข้อเดิม (คีย์ไม่ถูกเผา)');
  assert.ok(pace.PACED_KEY.test('t5q:x:2026-11-09') && pace.PACED_KEY.test('c2q:x') && !pace.PACED_KEY.test('streak:7') && !pace.PACED_KEY.test('t5c:x'));
});

test('ริบ EXP ย้อนหลัง: เฉพาะข้อที่เร็วเกินมนุษย์ (≥ 10 ข้อ) + Ranked ที่ผิดปกติ · ลงวันที่เดิม · คนเร็วบังเอิญไม่โดน · คืนค่าได้', async () => {
  const bot = await makeUser(); const human = await makeUser();
  const seed = async (uid, n, gapMs, prefix) => {
    const t0 = Date.now() - 3 * 24 * 3600 * 1000;           // 3 วันก่อน
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      await pool.query("INSERT INTO exp_awards (user_id, award_key, amount, reason, created_at) VALUES ($1, $2, 12, 'c2_lesson', to_timestamp($3 / 1000.0))",
        [uid, `c2q:${prefix}${i}~meaning`, t0 + i * gapMs]);
      await pool.query("INSERT INTO exp_log (user_id, amount, reason, created_at) VALUES ($1, 12, 'c2_lesson', to_timestamp($2 / 1000.0))", [uid, t0 + i * gapMs]);
      sum += 12;
    }
    await pool.query('UPDATE users SET exp = exp + $2 WHERE id = $1', [uid, sum]);
  };
  await seed(bot.id, 15, 80, 'b');          // บอท: 15 ข้อ ห่างกัน 80 ms -> 14 ข้อเร็วผิดปกติ
  await seed(human.id, 4, 300, 'h');        // คน: เร็วบังเอิญ 3 ข้อ (< 10) -> ไม่โดน
  // Ranked: แมตช์ที่ได้ EXP แล้วพบว่าตอบเร็วผิดปกติ (ข้อมูลก่อนมีระบบตรวจ)
  const { id: mid, s } = await playAll(bot, { humanMs: 1500 });
  await pool.query('UPDATE ranked_answers SET response_ms = 90 WHERE match_id = $1 AND slot = 0', [mid]);
  const rankedExp = s.result.exp.gained;
  assert.ok(rankedExp > 0);

  const expPlan = await I.planExpReclaim(pool);
  const b = expPlan.users.find((x) => x.userId === bot.id);
  assert.ok(b, 'พบบอท');
  assert.strictEqual(b.learning.amount, 14 * 12); assert.strictEqual(b.learning.fastAnswers, 14);
  assert.strictEqual(b.ranked.amount, rankedExp);
  assert.ok(!expPlan.users.some((x) => x.userId === human.id), 'คนที่เร็วบังเอิญไม่กี่ข้อไม่โดน');

  const e0 = await exp(bot.id); const h0 = await exp(human.id);
  const out = await I.applyReclaim(pool, { seasonId: null, cheaters: [], refunds: [] }, { users: [b] });
  assert.strictEqual(await exp(bot.id), e0 - b.total);
  assert.strictEqual(await exp(human.id), h0);
  // แถวติดลบลงวันที่เดิม -> สัปดาห์นี้ไม่ติดลบเพราะ EXP เก่า
  const neg = (await pool.query("SELECT amount, created_at FROM exp_log WHERE user_id = $1 AND reason = 'integrity_reclaim'", [bot.id])).rows;
  assert.strictEqual(neg.reduce((a, r) => a + r.amount, 0), -b.total);
  assert.ok(neg.filter((r) => r.amount === -12).every((r) => Date.now() - new Date(r.created_at).getTime() > 2 * 24 * 3600 * 1000));
  assert.ok(!(await I.planExpReclaim(pool)).users.some((x) => x.userId === bot.id), 'ริบซ้ำไม่ได้');
  // คืนค่า
  const rv = await I.revertReclaim(pool, out.batchId);
  assert.strictEqual(rv.expReverted, 1);
  assert.strictEqual(await exp(bot.id), e0);
  assert.strictEqual((await pool.query("SELECT 1 FROM exp_log WHERE user_id = $1 AND reason = 'integrity_reclaim'", [bot.id])).rowCount, 0);
});
