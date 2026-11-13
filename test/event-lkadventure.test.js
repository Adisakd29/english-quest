/*
  ตะลุยด่านลอยกระทง 2569 (LOY KRATHONG RIVER JOURNEY · 2–24 พ.ย. 2569) — ระบบผจญภัยเดิม + รางวัลรายบท
  ทดสอบ: ช่วงเวลา · โครงสร้าง 4 บท + Final · ทุกด่านสร้างโจทย์ได้ (คำศัพท์ธีมลอยกระทง) · ปลดล็อกตามลำดับ
  · รับรางวัลรายบท (Coin + ของ 3D) ครั้งเดียว · รับก่อนผ่านไม่ได้ · Final ได้เอฟเฟกต์ + ป้าย · หลังจบรับไม่ได้แต่ของอยู่ครบ
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
// ช่วงทดสอบครอบเวลาจริง (ข้อมูลที่ใส่ใช้เวลา DB จริง) — ตรรกะเดียวกับ 2–24 พ.ย.
process.env.EVENT_LKADV_2026_START = new Date(Date.now() - 86400e3).toISOString();
process.env.EVENT_LKADV_2026_END = new Date(Date.now() + 20 * 86400e3).toISOString();
const pool = require('../config/db');
const { createApp } = require('../app');
const ev = require('../services/events');
const cfg = require('../config/events');

const EID = 'loykrathong-adventure-2026';
const E = cfg.EVENT_BY_ID[EID];
const END = new Date(E.endsAt).getTime();
const MID = END - 3600e3;
const atTime = (t) => ev._setNow(() => t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEW_ITEMS = ['hat_lk26_ngob', 'back_lk26_basket', 'top_lk26_lotus', 'outer_lk26_sabai', 'fx_lk26_fireflies'];

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let b = null; try { b = buf ? JSON.parse(buf) : null; } catch (_) { b = buf; } resolve({ status: res.statusCode, body: b }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'la') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
async function addRounds(u, n, { correct = 9, total = 10 } = {}) {
  await pool.query(`INSERT INTO event_activity (event_id, user_id, kind, ref, correct, total)
                    SELECT $1, $2, 'round', 't:' || gen_random_uuid(), $3, $4 FROM generate_series(1, $5)`, [EID, u.id, correct, total, n]);
  await sleep(15);
}
async function addCorrect(u, n) {
  await pool.query(`INSERT INTO answer_events (user_id, skill, item_id, level, correct) SELECT $1, 'grammar', 'test', NULL, TRUE FROM generate_series(1, $2)`, [u.id, n]);
  await sleep(15);
}
async function addPass(u, sid) {
  await pool.query(`INSERT INTO event_challenge_attempts (event_id, user_id, questions, stage_id, score, passed, started_at, finished_at)
                    VALUES ($1, $2, '[]', $3, 0, TRUE, NOW(), NOW())`, [EID, u.id, sid]);
  await sleep(15);
}
/** ทำภารกิจของบทให้ครบ (ข้อมูลแบบเดียวกับที่ระบบจริงบันทึก) */
async function completeChapter(u, ch) {
  for (const m of ch.missions) {
    if (m.kind === 'rounds' || m.kind === 'goodRounds') await addRounds(u, m.target);
    else if (m.kind === 'correct') await addCorrect(u, m.target);
    else if (m.kind === 'stages') for (const sid of m.stages) await addPass(u, sid);
  }
}
const state = async (u) => (await req('GET', `/api/events/${EID}`, { token: u.token })).body;
const claimCh = (u, cid) => req('POST', `/api/events/${EID}/chapters/${cid}/claim`, { token: u.token });
const wallet = async (u) => (await req('GET', '/api/coins/wallet', { token: u.token })).body.balance;
const inv = async (uid) => (await pool.query('SELECT item_id, acquisition_type FROM user_inventory WHERE user_id = $1', [uid])).rows;

test.before(async () => {
  await pool.query('SELECT 1');
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await require('../services/avatar/catalog').syncCatalog(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(() => ev._setNow(null));
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('ตั้งค่า: 2 พ.ย. 00:00 – 24 พ.ย. 23:59:59 (วันลอยกระทง) · 4 บท + Final · รางวัลทุกบท = ของ 3D ใหม่ 5 ชิ้น (ซื้อไม่ได้) · ป้าย', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'config', 'events.js'), 'utf8');
  assert.ok(src.includes("'2026-11-02T00:00:00+07:00'") && src.includes("'2026-11-25T00:00:00+07:00'"));
  assert.deepStrictEqual(E.chapters.map((c) => c.id), ['l1', 'l2', 'l3', 'l4', 'lfinal']);
  assert.deepStrictEqual(E.chapters.map((c) => c.reward.coins), [30, 40, 50, 60, 100]);
  assert.deepStrictEqual(E.chapters.flatMap((c) => c.reward.items), NEW_ITEMS);
  assert.strictEqual(E.chapters[4].reward.badge, 'loykrathong_adventure_2026');
  assert.ok(require('../config/achievements').find((a) => a.id === 'loykrathong_adventure_2026'));
  const u = await makeUser();
  const cat = (await req('GET', '/api/avatar/catalog', { token: u.token })).body.items;
  for (const id of NEW_ITEMS) {
    const it = cat.find((x) => x.id === id);
    assert.ok(it && it.purchasable === false, `${id} ซื้อไม่ได้`);
    assert.ok(it.model && it.model.glbUrl && fs.existsSync(path.join(__dirname, '..', 'public', it.model.glbUrl)), `${id} มีโมเดล 3D จริง`);
  }
  // ทุกด่านสร้างโจทย์ครบทุกระดับภาษา · คำศัพท์ธีมมาจากคำลอยกระทง (ไม่ใช่ฮาโลวีน) · ไม่มีด่านยาวเกิน 6 นาที
  const words = new Set(cfg.LOYKRATHONG_WORDS.flat());
  const hw = new Set(cfg.HALLOWEEN_WORDS.flat());
  for (const cefr of ['A1', 'B1', 'C1']) {
    for (const [sid, s] of Object.entries(E.stages)) {
      const qs = await ev.buildStageQuestions(s, cefr, 7);
      assert.strictEqual(qs.length, Object.values(s.mix).reduce((a, b) => a + b, 0), `${sid} @${cefr}`);
      for (const q of qs.filter((x) => x.kind === 'theme')) {
        const toks = JSON.stringify(q).split('"');
        assert.ok(toks.some((t) => words.has(t)) && !toks.some((t) => hw.has(t) && !words.has(t)), `${sid}: คำธีมลอยกระทง`);
      }
    }
  }
  assert.ok(Object.values(E.stages).every((s) => s.timeLimitSec > 0 && s.timeLimitSec <= 360));
  assert.ok(!Object.values(E.stages).some((s) => s.mix.halloween), 'ไม่มีโจทย์ฮาโลวีน');
});

test('ปลดล็อกตามลำดับ · รับรางวัลบท 1 (30 Coin + งอบ) ครั้งเดียว · รับบทที่ยังไม่ผ่านไม่ได้ · ไม่มีปุ่มรับรางวัลรวม', async () => {
  atTime(MID);
  const u = await makeUser();
  const c0 = await wallet(u);
  let st = await state(u);
  assert.strictEqual(st.status, 'active');
  assert.deepStrictEqual(st.chapters.map((c) => c.unlocked), [true, false, false, false, false]);
  assert.deepStrictEqual(st.chapters[0].reward, { coins: 30, items: ['hat_lk26_ngob'] });
  assert.strictEqual(st.chapters[0].canClaimReward, false);
  assert.strictEqual(st.canClaim, false);
  assert.strictEqual((await claimCh(u, 'l1')).body.code, 'CHAPTER_INCOMPLETE');
  // ด่านบทที่ยังล็อกเริ่มไม่ได้
  assert.strictEqual((await req('POST', `/api/events/${EID}/stages/l2-1/start`, { token: u.token })).body.code, 'STAGE_LOCKED');
  await completeChapter(u, E.chapters[0]);
  st = await state(u);
  assert.strictEqual(st.chapters[0].complete, true);
  assert.strictEqual(st.chapters[1].unlocked, true);
  assert.strictEqual(st.chapters[0].canClaimReward, true);
  // ด่านบท 2 เปิดแล้ว: โจทย์ 8 ข้อ ไม่มีเฉลย
  const s1 = await req('POST', `/api/events/${EID}/stages/l2-1/start`, { token: u.token });
  assert.strictEqual(s1.status, 200, JSON.stringify(s1.body));
  assert.strictEqual(s1.body.questions.length, 8);
  assert.ok(s1.body.questions.every((q) => !('correctIndex' in q) && !('answer' in q)));
  // รับรางวัลบท 1 — กดพร้อมกัน 5 ครั้ง ได้ครั้งเดียว
  const burst = await Promise.all(Array.from({ length: 5 }, () => claimCh(u, 'l1')));
  assert.strictEqual(burst.filter((r) => r.status === 200).length, 1, burst.map((r) => r.status).join(','));
  const ok = burst.find((r) => r.status === 200).body;
  assert.strictEqual(ok.coins, 30);
  assert.deepStrictEqual(ok.added, ['hat_lk26_ngob']);
  assert.ok(ok.state.chapters[0].rewardClaimed);
  assert.strictEqual(await wallet(u), c0 + 30);
  assert.deepStrictEqual((await inv(u.id)).filter((x) => x.item_id === 'hat_lk26_ngob'), [{ item_id: 'hat_lk26_ngob', acquisition_type: 'event_quest' }]);
  assert.strictEqual((await claimCh(u, 'l2')).body.code, 'CHAPTER_INCOMPLETE');
  assert.strictEqual((await req('POST', `/api/events/${EID}/claim`, { token: u.token })).body.code, 'USE_CHAPTER_CLAIM');
  assert.strictEqual((await claimCh(u, 'nope')).status, 404);
  // สวมงอบได้จริง
  assert.strictEqual((await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'hat', itemId: 'hat_lk26_ngob' } })).status, 200);
});

test('ครบทุกบท: ของ 3D 5 ชิ้น + 280 Coin + ป้าย · หลังจบรับไม่ได้ ของยังอยู่ · EXP/รูปโปรไฟล์ไม่ถูกแตะ', async () => {
  atTime(MID);
  const u = await makeUser();
  const before = (await pool.query('SELECT avatar, avatar_image, exp FROM users WHERE id = $1', [u.id])).rows[0];
  const c0 = await wallet(u);
  for (const ch of E.chapters.slice(0, 4)) await completeChapter(u, ch);
  let st = await state(u);
  assert.deepStrictEqual(st.chapters.map((c) => c.complete), [true, true, true, true, false]);
  // หลังจบกิจกรรม: รับบทที่ผ่านแล้วแต่ยังไม่กดรับไม่ได้ (กติกาเดียวกับฮาโลวีน — ต้องรับในช่วงกิจกรรม)
  for (const cid of ['l1', 'l2', 'l3']) assert.strictEqual((await claimCh(u, cid)).status, 200, cid);
  await completeChapter(u, E.chapters[4]);
  st = await state(u);
  assert.ok(st.complete);
  for (const cid of ['l4', 'lfinal']) assert.strictEqual((await claimCh(u, cid)).status, 200, cid);
  const fin = (await state(u)).chapters.find((c) => c.id === 'lfinal');
  assert.ok(fin.rewardClaimed);
  assert.ok((await pool.query("SELECT 1 FROM user_achievements WHERE user_id = $1 AND achievement_id = 'loykrathong_adventure_2026'", [u.id])).rows[0]);
  const mine = (await inv(u.id)).filter((x) => NEW_ITEMS.includes(x.item_id));
  assert.strictEqual(mine.length, 5);
  assert.strictEqual(await wallet(u), c0 + 280);
  atTime(END + 60e3);
  st = await state(u);
  assert.strictEqual(st.status, 'ended');
  assert.strictEqual((await claimCh(u, 'l1')).body.code, 'EVENT_ENDED');
  assert.strictEqual((await req('POST', `/api/events/${EID}/stages/lf-1/start`, { token: u.token })).status, 403);
  assert.strictEqual((await inv(u.id)).filter((x) => NEW_ITEMS.includes(x.item_id)).length, 5, 'หลังจบของยังอยู่');
  assert.strictEqual((await req('POST', '/api/avatar/equip', { token: u.token, body: { slot: 'effect', itemId: 'fx_lk26_fireflies' } })).status, 200);
  assert.deepStrictEqual((await pool.query('SELECT avatar, avatar_image, exp FROM users WHERE id = $1', [u.id])).rows[0], before);
});

test('ไม่กระทบกิจกรรมอื่น: รายการกิจกรรมมีตะลุยด่าน (adventure · ไม่ retired) · ฮาโลวีนยัง retired · ต้องล็อกอิน', async () => {
  assert.strictEqual((await req('POST', `/api/events/${EID}/chapters/l1/claim`)).status, 401);
  const u = await makeUser();
  const list = (await req('GET', '/api/events', { token: u.token })).body.events;
  const me = list.find((e) => e.id === EID);
  assert.ok(me && me.kind === 'adventure' && me.retired === false && me.status === 'active');
  assert.ok(list.find((e) => e.id === 'halloween-2026').retired);
  // จบเกมจริง (จุดเดียวกับที่ Ranked/แข่ง/แบบฝึกเรียก) → บันทึกรอบให้ตะลุยด่านลอยกระทง · เกมเดียวกันนับครั้งเดียว
  ev.recordRound(u.id, 'lk-e2e:1', { correct: 8, total: 10 }); ev.recordRound(u.id, 'lk-e2e:1', { correct: 8, total: 10 });
  let n = 0;
  for (let i = 0; i < 40 && !n; i++) { await sleep(50); n = (await pool.query("SELECT COUNT(*)::int AS n FROM event_activity WHERE user_id = $1 AND event_id = $2 AND ref = 'lk-e2e:1'", [u.id, EID])).rows[0].n; }
  await sleep(150);
  assert.strictEqual((await pool.query("SELECT COUNT(*)::int AS n FROM event_activity WHERE user_id = $1 AND event_id = $2 AND ref = 'lk-e2e:1'", [u.id, EID])).rows[0].n, 1);
  const st = await state(u);
  assert.strictEqual(st.chapters[0].missions.find((m) => m.id === 'l1.rounds').progress, 1);
  assert.strictEqual(st.chapters[0].missions.find((m) => m.id === 'l1.good').progress, 1, 'แม่น 80% นับเป็นเกมผ่านเกณฑ์');
});
