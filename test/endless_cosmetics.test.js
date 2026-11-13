/*
  v1.21.0 ทายศัพท์ไม่รู้จบ (Endless) · กรอบโปรไฟล์/กรอบแชท · รางวัลทุก 10 เลเวล
  Endless
    - คลังคำใช้เฉพาะความหมายที่ไม่ติดธง + sense ไม่ติด needsReview · ระดับ/ชนิดคำตรงคลังจริง
    - โจทย์ไม่ส่งคำตอบ · ตัวเลือก 4 ตัวไม่ซ้ำ · ตัวลวงไม่ชนความหมายกับคำตอบ · ไม่ซ้ำคำในเกมเดียว
    - ตอบถูก = +1 ข้อ + EXP ตามระดับ (ไม่มีเพดาน) · ผิด/หมดเวลา = เสียหัวใจ · หมด 3 หัวใจ = จบ · ตอบซ้ำข้อเดิมไม่ได้
    - ตอบเร็วเกินคน = ข้อนั้นไม่ได้ EXP · ยากขึ้นตามจำนวนข้อ · อันดับสัปดาห์ไม่มีอีเมล · เก็บคำที่พลาดไม่ให้ EXP
  กรอบ
    - ซื้อ: หัก Coin ตามราคาเซิร์ฟเวอร์ · ไม่พอซื้อไม่ได้ · ซื้อซ้ำไม่ได้ · กรอบรางวัลเลเวลซื้อไม่ได้ · ซื้อพร้อมกันหักครั้งเดียว
    - ใส่ได้เฉพาะของที่มี · looks แสดงกรอบ (ไม่มีข้อมูลส่วนตัว) · ถอดได้
  รางวัลเลเวล
    - เลเวลไม่ถึงรับไม่ได้ · รับได้ครั้งเดียว (รวมกดพร้อมกัน) · รับย้อนหลังทุกขั้น · ได้ Coin + กรอบเฉพาะเลเวล · ไม่แตะ EXP
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.ENDLESS_RATE_PER_MIN = '100000';

const pool = require('../config/db');
const { createApp } = require('../app');
const E = require('../services/endless');
const C = require('../config/cosmetics');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + p, { method, headers: h }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null, raw: buf }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
let n = 0;
async function makeUser(prefix = 'en') {
  n += 1;
  const name = `${prefix}${Date.now() % 1e7}${n}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  return { token: r.body.token, id: r.body.user.id, name, email: `${name}@gmail.com` };
}
/** ข้อถูกของข้อปัจจุบัน (อ่านจาก DB ฝั่งเซิร์ฟเวอร์ — หน้าเว็บไม่มีทางรู้) */
async function answerOf(uid) {
  const r = (await pool.query("SELECT q FROM endless_runs WHERE user_id = $1 AND status = 'active'", [uid])).rows[0];
  return r.q.answer;
}
/** ย้อนเวลาออกข้อ (ไม่ต้องรอจริงเพื่อพ้นเกณฑ์ตอบเร็วเกิน/หมดเวลา) */
async function ageQuestion(uid, ms) {
  await pool.query(`UPDATE endless_runs SET q = jsonb_set(q, '{issuedAt}', to_jsonb(((q->>'issuedAt')::bigint - $2)::bigint)) WHERE user_id = $1 AND status = 'active'`, [uid, ms]);
}
const expOf = async (uid) => Number((await pool.query('SELECT exp FROM users WHERE id = $1', [uid])).rows[0].exp);
const balOf = async (uid) => Number((await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [uid])).rows[0].balance);

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('Endless: คลังคำมาจากคลังจริง ไม่ใช้ความหมายที่ติดธง · ตัวลวงไม่ชนความหมาย', () => {
  const senses = new Map(require('../data/oxford/senses.json').map((s) => [s.senseId, s]));
  const thai = require('../data/oxford/thai_meanings.json');
  const B = E.bank();
  assert.ok(B.list.length > 3000, `คลังคำ ${B.list.length}`);
  for (const w of B.list) {
    const s = senses.get(w.id);
    assert.ok(s && !s.needsReview, w.id);
    assert.strictEqual(w.cefr, s.cefr, `${w.id} ระดับต้องตรงคลัง`);
    assert.strictEqual(w.pos, s.pos);
    assert.ok(thai[w.id] && !thai[w.id].flagged, `${w.id} ความหมายต้องไม่ติดธง`);
  }
  for (let i = 0; i < 400; i += 1) {
    const q = E.makeQuestion(i % 60, []);
    const n = E.choicesOf(i % 60);
    assert.strictEqual(q.options.length, n, 'ยิ่งไกลตัวเลือกยิ่งเยอะ');
    assert.strictEqual(new Set(q.options).size, n, 'ตัวเลือกไม่ซ้ำ');
    const target = B.byId.get(q.senseId);
    q.optionIds.forEach((id, j) => {
      if (j === q.answer) return;
      const d = B.byId.get(id);
      assert.notStrictEqual(d.word.toLowerCase(), target.word.toLowerCase());
      assert.ok(!E.thClash(d, target), `ตัวลวง "${d.th}" ชนกับ "${target.th}"`);
      assert.strictEqual(d.pos, target.pos, 'ชนิดคำเดียวกัน');
    });
  }
  assert.strictEqual(E.stageOf(0), 'A1'); assert.strictEqual(E.stageOf(8), 'A2'); assert.strictEqual(E.stageOf(18), 'B1');
  assert.strictEqual(E.stageOf(30), 'B2'); assert.strictEqual(E.stageOf(60), 'C1');
  assert.deepStrictEqual([0, 17, 18, 44, 45, 120].map(E.choicesOf), [4, 4, 5, 5, 6, 6], 'v1.21.0 จำนวนตัวเลือก 4 → 5 → 6');
});

test('Endless: โจทย์ไม่ส่งคำตอบ · ตอบถูกได้ EXP · ผิดเสียหัวใจ · 3 หัวใจหมด = จบ · ตอบซ้ำไม่ได้', async () => {
  const u = await makeUser();
  assert.strictEqual((await req('POST', '/api/endless/start', { body: {} })).status, 401);
  const s = await req('POST', '/api/endless/start', { token: u.token, body: {} });
  assert.strictEqual(s.status, 200);
  assert.ok(!/"answer"|optionIds|senseId|issuedAt/.test(s.raw), 'โจทย์ต้องไม่มีคำตอบ/ข้อมูลภายใน');
  assert.strictEqual(s.body.run.hearts, 3);
  // ตอบถูก (รอพ้นเกณฑ์ตอบเร็วเกินคน)
  await ageQuestion(u.id, 1500);
  const e0 = await expOf(u.id);
  let key = s.body.q.key;
  const right = await answerOf(u.id);
  const a1 = await req('POST', '/api/endless/answer', { token: u.token, body: { key, choice: right } });
  assert.strictEqual(a1.status, 200);
  assert.strictEqual(a1.body.correct, true);
  assert.strictEqual(a1.body.gained, E.EXP_BY_CEFR.A1);
  assert.strictEqual(await expOf(u.id) - e0, E.EXP_BY_CEFR.A1, 'EXP เข้าบัญชีจริง');
  assert.strictEqual(a1.body.run.score, 1);
  assert.ok(a1.body.next && !/"answer"/.test(JSON.stringify(a1.body.next)));
  // ตอบข้อเดิมซ้ำไม่ได้
  assert.strictEqual((await req('POST', '/api/endless/answer', { token: u.token, body: { key, choice: right } })).body.code, 'STALE');
  // ตัวเลือกไม่ถูกต้อง (นอกช่วง · เกินจำนวนตัวเลือกของข้อนี้)
  assert.strictEqual((await req('POST', '/api/endless/answer', { token: u.token, body: { key: a1.body.next.key, choice: 7 } })).status, 400);
  assert.strictEqual(a1.body.next.options.length, 4);
  assert.strictEqual((await req('POST', '/api/endless/answer', { token: u.token, body: { key: a1.body.next.key, choice: 5 } })).body.code, 'BAD_CHOICE');
  // ผิด 2 ข้อ + หมดเวลา 1 ข้อ = จบ
  key = a1.body.next.key;
  const words = new Set([a1.body.reveal.word.toLowerCase()]);
  let last;
  for (let i = 0; i < 3; i += 1) {
    const ans = await answerOf(u.id);
    // eslint-disable-next-line no-await-in-loop
    if (i === 2) await ageQuestion(u.id, (E.CFG.answerSecs + E.CFG.graceSecs + 1) * 1000);
    last = await req('POST', '/api/endless/answer', { token: u.token, body: { key, choice: i === 2 ? ans : (ans + 1) % 4 } });   // ข้อสุดท้าย: ตอบถูกแต่เลยเวลา = หมดเวลา
    assert.strictEqual(last.body.correct, false);
    assert.strictEqual(last.body.run.hearts, 2 - i);
    assert.ok(!words.has(last.body.reveal.word.toLowerCase()), 'ไม่ซ้ำคำในเกมเดียว');
    words.add(last.body.reveal.word.toLowerCase());
    if (!last.body.over) key = last.body.next.key;
  }
  assert.strictEqual(last.body.timeout, true, 'ตอบหลังหมดเวลา = หมดเวลา');
  assert.strictEqual(last.body.over, true);
  assert.strictEqual(last.body.next, null);
  assert.strictEqual(last.body.summary.score, 1);
  assert.strictEqual(last.body.summary.missed.length, 3);
  assert.strictEqual(last.body.summary.newBest, true);
  assert.strictEqual((await req('POST', '/api/endless/answer', { token: u.token, body: { key, choice: 0 } })).body.code, 'NO_RUN');
  // เก็บคำที่พลาดเข้าคิวทบทวน — ไม่ให้ EXP
  const e1 = await expOf(u.id);
  const sv = await req('POST', `/api/endless/runs/${last.body.summary.id}/save-missed`, { token: u.token });
  assert.strictEqual(sv.status, 200);
  assert.ok(sv.body.saved >= 1);
  assert.strictEqual(await expOf(u.id), e1);
  // เกมของคนอื่นเก็บไม่ได้
  const other = await makeUser();
  assert.strictEqual((await req('POST', `/api/endless/runs/${last.body.summary.id}/save-missed`, { token: other.token })).status, 404);
});

test('Endless: ตอบเร็วเกินคนไม่ได้ EXP · ไม่มีเพดานรายวัน · คอมโบให้โบนัส · ยากขึ้นตามข้อ', async () => {
  const u = await makeUser();
  let s = await req('POST', '/api/endless/start', { token: u.token, body: {} });
  // ตอบถูกทันที (< 0.6 วิ) = ถูกแต่ไม่ได้ EXP
  const fast = await req('POST', '/api/endless/answer', { token: u.token, body: { key: s.body.q.key, choice: await answerOf(u.id) } });
  assert.strictEqual(fast.body.correct, true);
  assert.strictEqual(fast.body.tooFast, true);
  assert.strictEqual(fast.body.gained, 0);
  // EXP วันนี้จากโหมดนี้เกินหลักร้อยแล้วก็ยังได้ต่อ (ไม่มีเพดาน)
  await pool.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, 5000, 'endless')", [u.id]);
  let key = fast.body.next.key; let total = 0; let r;
  for (let i = 0; i < 9; i += 1) {
    await ageQuestion(u.id, 1000);
    r = await req('POST', '/api/endless/answer', { token: u.token, body: { key, choice: await answerOf(u.id) } });
    assert.strictEqual(r.body.correct, true);
    total += r.body.gained;
    key = r.body.next.key;
  }
  assert.strictEqual(r.body.run.score, 10);
  assert.strictEqual(r.body.run.combo, 10);
  assert.ok(total > 9 * 3, `ได้ EXP ต่อเนื่อง ${total}`);
  assert.strictEqual(r.body.run.stage, 'A2', 'ข้อ 8+ = A2');
  assert.ok(['A1', 'A2'].includes(r.body.next.cefr));
  assert.strictEqual(E.comboBonus(5), 1); assert.strictEqual(E.comboBonus(10), 2); assert.strictEqual(E.comboBonus(20), 3);
  // เล่นต่อ (resume) ได้ข้อเดิม · เริ่มใหม่ = เกมเก่าจบ (นับคะแนน)
  const res = await req('POST', '/api/endless/start', { token: u.token, body: { resume: true } });
  assert.strictEqual(res.body.resumed, true);
  assert.strictEqual(res.body.q.key, key);
  s = await req('POST', '/api/endless/start', { token: u.token, body: {} });
  assert.strictEqual(s.body.run.score, 0);
  const st = await req('GET', '/api/endless', { token: u.token });
  assert.strictEqual(st.body.best, 10);
});

test('Endless: อันดับสัปดาห์ส่งเฉพาะข้อมูลสาธารณะ', async () => {
  const u = await makeUser();
  await pool.query("INSERT INTO endless_runs (user_id, status, score, ended_at) VALUES ($1, 'over', 99, NOW())", [u.id]);
  const st = await req('GET', '/api/endless', { token: u.token });
  assert.strictEqual(st.status, 200);
  const row = st.body.week.board.find((x) => x.userId === u.id);
  assert.ok(row, 'อยู่ในอันดับ');
  assert.strictEqual(row.score, 99);
  assert.deepStrictEqual(Object.keys(row).sort(), ['avatar', 'avatarImage', 'rank', 'score', 'userId', 'username']);
  assert.ok(!st.raw.includes('@gmail.com'), 'ไม่มีอีเมล');
  assert.strictEqual(st.body.week.myScore, 99);
});

test('กรอบ: ซื้อตามราคาเซิร์ฟเวอร์ · ไม่พอ/ซ้ำ/กรอบเลเวลซื้อไม่ได้ · ซื้อพร้อมกันหักครั้งเดียว · ใส่ได้เฉพาะของที่มี', async () => {
  const u = await makeUser('cf');
  const cat = await req('GET', '/api/cosmetics', { token: u.token });
  assert.strictEqual(cat.status, 200);
  assert.strictEqual(cat.body.items.length, C.ALL.length);
  const start = cat.body.balance;   // Coin ต้อนรับ
  assert.strictEqual((await req('POST', '/api/cosmetics/purchase', { token: u.token, body: { itemId: 'pf_lv10' } })).body.code, 'LEVEL_ONLY');
  assert.strictEqual((await req('POST', '/api/cosmetics/purchase', { token: u.token, body: { itemId: 'nope' } })).status, 404);
  assert.strictEqual((await req('POST', '/api/cosmetics/purchase', { token: u.token, body: { itemId: 'pf_cute_heart', price: 1 } })).body.code, 'INSUFFICIENT', 'ราคาจากหน้าเว็บไม่มีผล');
  // ซื้อพร้อมกัน 5 คำขอ → สำเร็จ 1 ครั้ง หัก 1 ครั้ง
  const rs = await Promise.all(Array.from({ length: 5 }, () => req('POST', '/api/cosmetics/purchase', { token: u.token, body: { itemId: 'cf_cute_mint' } })));
  assert.strictEqual(rs.filter((r) => r.status === 200).length, 1);
  assert.ok(rs.filter((r) => r.status !== 200).every((r) => r.body.code === 'ALREADY_OWNED'));
  assert.strictEqual(await balOf(u.id), start - C.PRICE.common);
  const tx = await pool.query("SELECT amount FROM coin_transactions WHERE user_id = $1 AND type = 'COSMETIC_PURCHASE'", [u.id]);
  assert.deepStrictEqual(tx.rows.map((x) => x.amount), [-C.PRICE.common]);
  // ใส่
  assert.strictEqual((await req('POST', '/api/cosmetics/equip', { token: u.token, body: { kind: 'cframe', itemId: 'cf_cute_star' } })).body.code, 'NOT_OWNED');
  assert.strictEqual((await req('POST', '/api/cosmetics/equip', { token: u.token, body: { kind: 'pframe', itemId: 'cf_cute_mint' } })).status, 404, 'ใส่ผิดประเภทไม่ได้');
  assert.strictEqual((await req('POST', '/api/cosmetics/equip', { token: u.token, body: { kind: 'cframe', itemId: 'cf_cute_mint' } })).status, 200);
  const viewer = await makeUser('cv');
  const lk = await req('GET', `/api/avatar/looks?ids=${u.id}`, { token: viewer.token });
  assert.strictEqual(lk.body.looks[u.id].cframe, 'cf_cute_mint');
  assert.strictEqual(lk.body.looks[u.id].pframe, null);
  assert.ok(!lk.raw.includes('@'), 'looks ไม่มีอีเมล');
  // ถอด
  assert.strictEqual((await req('POST', '/api/cosmetics/equip', { token: u.token, body: { kind: 'cframe', itemId: null } })).status, 200);
  const lk2 = await req('GET', `/api/avatar/looks?ids=${u.id}`, { token: u.token });
  assert.strictEqual(lk2.body.looks[u.id].cframe, null);
});

test('รางวัลเลเวล: ไม่ถึงรับไม่ได้ · รับครั้งเดียว (กดพร้อมกัน) · รับย้อนหลัง · ไม่แตะ EXP', async () => {
  const u = await makeUser('lv');
  assert.strictEqual((await req('POST', '/api/cosmetics/level-rewards/10/claim', { token: u.token })).body.code, 'LOCKED');
  assert.strictEqual((await req('POST', '/api/cosmetics/level-rewards/15/claim', { token: u.token })).body.code, 'BAD_LEVEL');
  await pool.query('UPDATE users SET exp = 34000 WHERE id = $1', [u.id]);   // เลเวล 30
  const exp0 = await expOf(u.id);
  const lv = await req('GET', '/api/cosmetics/level-rewards', { token: u.token });
  assert.strictEqual(lv.body.level, 30);
  assert.strictEqual(lv.body.claimable, 3);
  assert.deepStrictEqual(lv.body.rewards.slice(0, 4).map((r) => r.status), ['claimable', 'claimable', 'claimable', 'locked']);
  await req('GET', '/api/cosmetics', { token: u.token });   // สร้างกระเป๋า (Coin ต้อนรับ) ก่อนวัดยอด
  const b0 = await balOf(u.id);
  const rs = await Promise.all(Array.from({ length: 4 }, () => req('POST', '/api/cosmetics/level-rewards/20/claim', { token: u.token })));
  assert.strictEqual(rs.filter((r) => r.status === 200).length, 1, 'รับได้ครั้งเดียว');
  assert.strictEqual(await balOf(u.id) - b0, C.LEVEL_COINS[20]);
  const all = await req('POST', '/api/cosmetics/level-rewards/claim-all', { token: u.token });
  assert.strictEqual(all.status, 200);
  assert.deepStrictEqual(all.body.claimed.map((x) => x.level).sort((a, b) => a - b), [10, 30]);
  assert.strictEqual(await balOf(u.id) - b0, C.LEVEL_COINS[10] + C.LEVEL_COINS[20] + C.LEVEL_COINS[30]);
  const owned = (await pool.query('SELECT item_id, via FROM user_cosmetics WHERE user_id = $1 ORDER BY item_id', [u.id])).rows;
  assert.deepStrictEqual(owned.map((x) => x.item_id), ['cf_lv20', 'pf_lv10', 'pf_lv20', 'pf_lv30']);
  assert.ok(owned.every((x) => x.via === 'level'));
  assert.strictEqual(await expOf(u.id), exp0, 'ไม่แตะ EXP');
  assert.strictEqual((await req('POST', '/api/cosmetics/level-rewards/claim-all', { token: u.token })).body.claimed.length, 0);
  // ใส่กรอบรางวัลได้
  assert.strictEqual((await req('POST', '/api/cosmetics/equip', { token: u.token, body: { kind: 'pframe', itemId: 'pf_lv30' } })).status, 200);
  // ตาราง/Coin ของรางวัลไม่ซ้ำ
  const keys = (await pool.query("SELECT source_key FROM coin_transactions WHERE user_id = $1 AND type = 'LEVEL_REWARD' ORDER BY source_key", [u.id])).rows.map((x) => x.source_key);
  assert.deepStrictEqual(keys, ['lvl:10', 'lvl:20', 'lvl:30']);
  // เกินเลเวล 100: Coin ทุก 10 เลเวล ไม่มีกรอบ
  assert.deepStrictEqual(C.rewardFor(110), { level: 110, coins: C.LEVEL_COINS_AFTER_100, items: [] });
  assert.strictEqual(C.rewardFor(100).items.length, 2);
  await sleep(10);
});
