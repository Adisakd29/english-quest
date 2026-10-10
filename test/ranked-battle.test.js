/*
  Ranked Quest — Battle HP / Disconnect / Leave Penalty / Audio settings
  ตรรกะล้วน + API จริง + WebSocket จริง บน PostgreSQL จริง (ย่อเวลาด้วย env เพื่อให้ทดสอบเร็ว)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.RANKED_INTRO_MS = '40';
process.env.RANKED_REVEAL_MS = '40';
process.env.RANKED_GRACE_MS = '600';           // PvP grace (ย่อจาก 30 วิ)
process.env.RANKED_GRACE_SECONDS = '1';        // เกม NPC grace (ย่อจาก 30 วิ)
process.env.RANKED_NPC_SILENCE_MS = '300';
process.env.RANKED_SWEEP_MS = '100';
process.env.RANKED_OFFER_AFTER_MS = '60000';
process.env.RANKED_HP = 'on';                  // ชุดทดสอบนี้ทดสอบระบบ HP (ค่าเริ่มต้นของแอปปิดไว้)

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const pvp = require('../services/ranked/pvp');
const battle = require('../services/ranked/battle');
const { BATTLE, difficultyOf } = require('../config/battle');
const { calculateQuestRating } = require('../services/ranked/rating');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const Q = (type = 'vocabulary', adj = 0) => ({ type, cefr: 'A1', difficultyAdj: adj });

/* ======================= ตรรกะล้วน ======================= */
test('HP: เริ่ม 100 ทุกฝั่ง · ตอบถูก = คู่แข่งเสีย · ตอบผิด = ตัวเองเสีย · Damage ตามความยาก', () => {
  const s = battle.newHpState(2);
  assert.deepStrictEqual(s.hp, [100, 100]);
  assert.strictEqual(BATTLE.initialHp, 100);
  const r = battle.resolveQuestion(s, Q('grammar'), [{ slot: 0, side: 0, correct: true }, { slot: 1, side: 1, correct: false }]);
  assert.deepStrictEqual(r.state.hp, [100, 88], 'A ถูก + B ผิด -> B เสีย 12 (ตัวอย่างในสเปก: 100 -> 88) ไม่ซ้อนเป็น 24');
  assert.deepStrictEqual(r.taken, [0, 12]);
  const both = battle.resolveQuestion(battle.newHpState(2), Q('grammar'), [{ slot: 0, side: 0, correct: false }, { slot: 1, side: 1, correct: false }]);
  assert.deepStrictEqual(both.state.hp, [88, 88], 'ผิดทั้งคู่ = เสียทั้งคู่');
  assert.deepStrictEqual(r.hits.map((h) => [h.damage, h.target]), [[12, 1], [12, 1]]);
  assert.deepStrictEqual(['vocabulary', 'grammar', 'reading'].map((t) => battle.damageFor(Q(t), false)), [10, 12, 15], 'Easy 10 · Normal 12 · Hard 15');
  assert.strictEqual(difficultyOf(Q('grammar', 0.3)), 'hard', 'ข้อ TOEIC/TOEFL ยากขึ้นหนึ่งระดับ');
});

test('HP: Combo เพิ่มน้อย (+1 ต่อข้อ เพดาน +3) · ตอบผิดรีเซ็ต · ความเร็วไม่มีผลกับ Damage', () => {
  let s = battle.newHpState(2);
  const dmg = [];
  for (let i = 0; i < 6; i += 1) {
    const r = battle.resolveQuestion(s, Q('grammar'), [{ slot: 0, side: 0, correct: true }, { slot: 1, side: 1, correct: true }]);
    dmg.push(r.hits[0].damage); s = r.state;
  }
  assert.deepStrictEqual(dmg, [12, 13, 14, 15, 15, 15]);
  const reset = battle.resolveQuestion({ ...s, hp: [100, 100] }, Q('grammar'), [{ slot: 0, side: 0, correct: false }, { slot: 1, side: 1, correct: true }]);
  assert.strictEqual(reset.state.streak['0'], 0);
  // damageFor ไม่มีพารามิเตอร์เวลาเลย — ตอบเร็วหรือช้าได้ Damage เท่ากัน
  assert.strictEqual(battle.damageFor.length, 2);
});

test('HP: ต่ำสุดคือ 0 (ไม่ติดลบ) · HP 0 = KO · ทีมทำ Damage ครึ่งหนึ่ง · คนที่ออกแล้วไม่ทำ/ไม่รับ Damage', () => {
  const r = battle.resolveQuestion({ hp: [100, 5], min: [100, 5], streak: {} }, Q('reading'),
    [{ slot: 0, side: 0, correct: true }, { slot: 1, side: 1, correct: false }]);
  assert.deepStrictEqual(r.state.hp, [100, 0]);
  assert.strictEqual(r.ko, true);
  const t = battle.resolveQuestion(battle.newHpState(2), Q('grammar'), [
    { slot: 0, side: 0, correct: true }, { slot: 1, side: 0, correct: true },
    { slot: 2, side: 1, correct: true }, { slot: 3, side: 1, correct: false, neutral: true }], { scale: BATTLE.teamDamageScale });
  assert.deepStrictEqual(t.state.hp, [94, 88]);
  assert.strictEqual(t.hits[3].damage, 0);
  assert.ok(battle.isCritical(24) && !battle.isCritical(25) && !battle.isCritical(0), 'Critical = ต่ำกว่า 25%');
});

test('Win condition: HP -> Accuracy -> Battle Score -> เวลาเฉลี่ย -> เสมอ (ความเร็วไม่ใช่เกณฑ์แรก)', () => {
  const side = (hp, correct, score, avgMs) => ({ hp, correct, answered: 10, score, avgMs });
  assert.deepStrictEqual(battle.decide([side(0, 9, 9000, 1000), side(10, 1, 100, 9000)]), { winner: 1, reason: 'hp_zero', decidedBy: 'hp' });
  assert.deepStrictEqual(battle.decide([side(40, 5, 5000, 5000), side(30, 9, 9000, 1000)]), { winner: 0, reason: 'questions_complete', decidedBy: 'hp' });
  assert.strictEqual(battle.decide([side(40, 6, 1, 9000), side(40, 5, 9999, 500)]).decidedBy, 'accuracy', 'HP เท่ากัน -> ความแม่นยำ');
  assert.strictEqual(battle.decide([side(40, 5, 5100, 9000), side(40, 5, 5000, 500)]).decidedBy, 'score');
  assert.deepStrictEqual(battle.decide([side(40, 5, 5000, 3000), side(40, 5, 5000, 2000)]), { winner: 1, reason: 'questions_complete', decidedBy: 'speed' });
  assert.deepStrictEqual(battle.decide([side(40, 5, 5000, 2000), side(40, 5, 5000, 2000)]), { winner: null, reason: 'draw', decidedBy: null });
});

test('QR penalty: ออกกลางเกมหนักกว่าแพ้ปกติ · League ผู้เล่นใหม่หักเล็กน้อย · ครั้งที่ 2 คูณเพิ่ม · config ได้', () => {
  const prof = (league, divisionIndex, qr) => ({ league, divisionIndex, qr, protectionMatches: 0 });
  const loss = (p, forfeit) => calculateQuestRating(p, { type: 'ranked', outcome: 'loss', opponentRating: p.qr, forfeit }).delta;
  assert.strictEqual(loss(prof('trail-finch', 1, 150)), 0, 'Trail Finch แพ้ปกติไม่เสีย QR');
  assert.strictEqual(loss(prof('trail-finch', 1, 150), { reason: 'surrender' }), -3);
  assert.strictEqual(loss(prof('swift-hare', 0, 320), { reason: 'disconnect' }), -5);
  const normal = loss(prof('river-otter', 1, 950));
  assert.ok(normal < 0 && normal > -18);
  assert.strictEqual(loss(prof('river-otter', 1, 950), { reason: 'disconnect' }), -18);
  assert.strictEqual(loss(prof('moon-wolf', 1, 2350), { reason: 'surrender', multiplier: 1.25 }), -23, 'ครั้งที่ 2 ใน 24 ชม. หนักขึ้น');
  // ออกกลางเกมไม่เคย "ถูกกว่า" แพ้ปกติ
  const bigLoss = loss(prof('swift-hare', 2, 640));
  assert.ok(loss(prof('swift-hare', 2, 640), { reason: 'surrender' }) <= bigLoss);
  const win = calculateQuestRating(prof('river-otter', 1, 950), { type: 'ranked', outcome: 'win', opponentRating: 950, forfeit: { reason: 'disconnect' } });
  assert.ok(win.delta > 0, 'ฝ่ายที่ชนะไม่โดน penalty');
});

/* ======================= API + WebSocket จริง ======================= */
let server; let base; let wsBase;
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
async function makeUser(prefix = 'hp') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  await req('GET', '/api/ranked/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
async function setLeague(u, league, division, qr) {
  await pool.query('UPDATE ranked_profiles SET league = $1, division_index = $2, quest_rating = $3 WHERE user_id = $4', [league, division, qr, u.id]);
}
function connect(u) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/ws?token=${u.token}`);
    const inbox = []; const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      const w = waiters.findIndex((x) => x.type === msg.type);
      if (w >= 0) { const [x] = waiters.splice(w, 1); clearTimeout(x.t); x.resolve(msg); } else inbox.push(msg);
    });
    const c = {
      ws,
      send: (type, payload = {}) => ws.send(JSON.stringify({ type, ...payload })),
      next: (type, ms = 4000) => {
        const i = inbox.findIndex((m) => m.type === type);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error(`timeout waiting ${type}`)), ms);
          waiters.push({ type, resolve: res, t });
        });
      },
      close: () => new Promise((r) => { ws.once('close', r); ws.close(); }),
    };
    ws.once('open', () => c.next('connected').then(() => resolve(c)));
    ws.once('error', reject);
  });
}
const correctIndexOf = async (id, i) => (await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [id])).rows[0].questions[i].correctIndex;
const matchRow = async (id) => (await pool.query('SELECT * FROM ranked_matches WHERE id = $1', [id])).rows[0];
async function startNpc(u) {
  const s = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } });
  assert.strictEqual(s.status, 200, JSON.stringify(s.body));
  return s.body;
}
/** ทำให้เกม NPC "เงียบ" (ไม่มี ping) แล้วรอจนเซิร์ฟเวอร์เริ่มนับ grace */
async function goSilent(matchId) {
  await pool.query("UPDATE ranked_matches SET last_seen_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [matchId]);
  for (let i = 0; i < 40; i += 1) { if ((await matchRow(matchId)).reconnect_deadline) return; await sleep(50); }
  throw new Error('server never started reconnect grace');
}

test.before(async () => {
  await pool.query('SELECT 1');
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  realtime.attach(server);
  await pvp.init();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  wsBase = `ws://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('NPC: HP victory — ตอบถูกจน HP คู่แข่งเป็น 0 = ชนะทันที (ไม่ต้องครบ 10 ข้อ) · หน้าผลมี HP ที่เหลือ', async () => {
  const u = await makeUser();
  const s = await startNpc(u);
  assert.deepStrictEqual(s.hp, { you: 100, opponent: 100, max: 100 });
  assert.ok(['easy', 'normal', 'hard'].includes(s.question.difficulty));
  await pool.query(`UPDATE ranked_matches SET npc_plan = (SELECT jsonb_agg(jsonb_set(p, '{correct}', 'false')) FROM jsonb_array_elements(npc_plan) p) WHERE id = $1`, [s.matchId]);
  let st = s; let n = 0; let last;
  while (st.status === 'active') {
    last = (await req('POST', `/api/ranked/matches/${st.matchId}/answer`, { token: u.token,
      body: { questionIndex: st.index, choiceIndex: await correctIndexOf(st.matchId, st.index) } })).body;
    n += 1;
    assert.strictEqual(last.hp.you, 100, 'ตอบถูก + NPC ผิด = เราไม่เสีย HP');
    st = (await req('POST', `/api/ranked/matches/${st.matchId}/next`, { token: u.token })).body;
  }
  assert.strictEqual(last.ko, true);
  assert.ok(n < 10, `จบที่ข้อ ${n}`);
  assert.strictEqual(st.result.outcome, 'win');
  assert.strictEqual(st.result.resultReason, 'hp_zero');
  assert.deepStrictEqual([st.result.hp.you, st.result.hp.opponent], [100, 0]);
  assert.strictEqual(st.result.label, 'victory');
  const row = await matchRow(st.matchId);
  assert.deepStrictEqual([row.final_hp_p1, row.final_hp_p2, row.result_reason], [100, 0, 'hp_zero']);
  const dmg = await pool.query('SELECT SUM(damage)::int AS d FROM ranked_answers WHERE match_id = $1', [st.matchId]);
  assert.ok(dmg.rows[0].d >= 100, 'Damage ของทุกคำตอบถูกบันทึก');
});

test('Security: client ส่ง HP / Damage / QR / ผลชนะปลอม -> ไม่มีผล (เซิร์ฟเวอร์คำนวณเองทั้งหมด)', async () => {
  const u = await makeUser();
  const s = await startNpc(u);
  await pool.query(`UPDATE ranked_matches SET npc_plan = (SELECT jsonb_agg(jsonb_set(p, '{correct}', 'false')) FROM jsonb_array_elements(npc_plan) p) WHERE id = $1`, [s.matchId]);
  const r = await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token,
    body: { questionIndex: 0, choiceIndex: await correctIndexOf(s.matchId, 0), damage: 999, enemyHp: 0, hp: { you: 100, opponent: 0 }, qr: 9999, outcome: 'win' } });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.hp.opponent >= 100 - 15 * 2 && r.body.hp.opponent < 100, `Damage ตามกติกาเท่านั้น (เหลือ ${r.body.hp.opponent})`);
  const f = await req('POST', `/api/ranked/matches/${s.matchId}/forfeit`, { token: u.token, body: { outcome: 'win', qr: 9999, reason: 'technical' } });
  assert.strictEqual(f.body.result.outcome, 'loss');
  assert.strictEqual(f.body.result.label, 'surrender');
  const me = await req('GET', '/api/ranked/me', { token: u.token });
  assert.strictEqual(me.body.profile.questRating, 0);
});

test('NPC disconnect: หลุดแล้วกลับมาภายใน grace = เล่นต่อ ไม่เสีย QR · ping ซ้ำ (duplicate reconnect) ไม่นับซ้ำ', async () => {
  const u = await makeUser();
  await setLeague(u, 'river-otter', 1, 950);
  const s = await startNpc(u);
  await goSilent(s.matchId);
  const p1 = await req('POST', `/api/ranked/matches/${s.matchId}/ping`, { token: u.token });
  const p2 = await req('POST', `/api/ranked/matches/${s.matchId}/ping`, { token: u.token });
  assert.deepStrictEqual([p1.body.status, p2.body.status], ['active', 'active']);
  const row = await matchRow(s.matchId);
  assert.strictEqual(row.reconnect_deadline, null);
  assert.deepStrictEqual([row.disconnects, row.reconnects], [1, 1]);
  const state = await req('GET', `/api/ranked/matches/${s.matchId}`, { token: u.token });
  assert.strictEqual(state.body.index, 0, 'Snapshot เดิม ไม่สร้างเกมใหม่');
  assert.deepStrictEqual(state.body.hp, { you: 100, opponent: 100, max: 100 });
  await req('POST', `/api/ranked/matches/${s.matchId}/forfeit`, { token: u.token });
});

test('NPC disconnect: ปิดเบราว์เซอร์/ไม่กลับมาเกิน grace = Defeat by Disconnect + penalty · กลับมาทีหลังเห็นผล', async () => {
  const u = await makeUser();
  await setLeague(u, 'river-otter', 1, 950);
  const s = await startNpc(u);
  await goSilent(s.matchId);
  await sleep(BATTLE.reconnectGraceSeconds * 1000 + 400);
  const row = await matchRow(s.matchId);
  assert.strictEqual(row.status, 'finished');
  assert.strictEqual(row.result_reason, 'disconnect');
  const back = await req('GET', `/api/ranked/matches/${s.matchId}`, { token: u.token });
  assert.strictEqual(back.body.status, 'finished', 'กลับมาหลังหมดเวลา = เกมจบไปแล้ว');
  assert.strictEqual(back.body.result.label, 'defeat_disconnect');
  assert.strictEqual(back.body.result.qr.delta, -18);
  const ans = await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token, body: { questionIndex: 0, choiceIndex: 0 } });
  assert.strictEqual(ans.status, 409, 'ส่งคำตอบหลังเกมจบไม่ได้');
  const hist = await req('GET', '/api/ranked/history', { token: u.token });
  assert.strictEqual(hist.body.matches[0].label, 'defeat_disconnect');
});

test('Mobile background: WebSocket ยังต่ออยู่ (แค่ ping หน่วง) = ไม่นับว่าหลุด · WebSocket หลุด = เริ่ม grace ทันที · กลับมาทัน = เล่นต่อ', async () => {
  const u = await makeUser();
  const c = await connect(u);
  const s = await startNpc(u);
  await pool.query("UPDATE ranked_matches SET last_seen_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [s.matchId]);
  await sleep(500);
  assert.strictEqual((await matchRow(s.matchId)).reconnect_deadline, null, 'แอปอยู่เบื้องหลังแต่ยังเชื่อมต่อ = ยังไม่เริ่มนับ');
  await c.close();
  await sleep(150);
  assert.ok((await matchRow(s.matchId)).reconnect_deadline, 'WebSocket หลุด = เริ่มนับ grace');
  const c2 = await connect(u);                       // Refresh / เน็ตกลับมา
  await sleep(150);
  const row = await matchRow(s.matchId);
  assert.strictEqual(row.status, 'active');
  assert.strictEqual(row.reconnect_deadline, null);
  await req('POST', `/api/ranked/matches/${s.matchId}/forfeit`, { token: u.token });
  await c2.close();
});

test('Surrender ซ้ำ: ครั้งที่ 2 หักเพิ่ม · ครั้งที่ 3 พัก Ranked 5 นาที · หลุดตอนนำอยู่ไม่นับเป็นการทิ้งเกม', async () => {
  const u = await makeUser();
  await setLeague(u, 'river-otter', 1, 1000);   // League ที่แข่งกับ NPC ผ่าน REST
  const deltas = [];
  for (let i = 0; i < 2; i += 1) {
    const s = await startNpc(u);
    deltas.push((await req('POST', `/api/ranked/matches/${s.matchId}/forfeit`, { token: u.token })).body.result);
  }
  assert.deepStrictEqual(deltas.map((r) => r.qr.delta), [-18, -23]);
  assert.deepStrictEqual(deltas.map((r) => r.penalty.nth), [1, 2]);
  // หลุดตอนนำอยู่ (HP มากกว่า) = น่าจะเป็นปัญหาเน็ต -> แพ้ตามกติกาแต่ไม่นับเพิ่ม
  const t = await startNpc(u);
  await pool.query("UPDATE ranked_matches SET hp = '[90,40]' WHERE id = $1", [t.matchId]);
  await goSilent(t.matchId);
  await sleep(BATTLE.reconnectGraceSeconds * 1000 + 400);
  const tech = (await req('GET', `/api/ranked/matches/${t.matchId}`, { token: u.token })).body.result;
  assert.strictEqual(tech.penalty.counted, false);
  assert.strictEqual(tech.qr.delta, -18, 'ไม่คูณเพิ่ม');
  const s3 = await startNpc(u);
  const third = (await req('POST', `/api/ranked/matches/${s3.matchId}/forfeit`, { token: u.token })).body.result;
  assert.strictEqual(third.penalty.nth, 3);
  assert.ok(third.penalty.cooldownUntil);
  const blocked = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } });
  assert.strictEqual(blocked.status, 429);
  assert.strictEqual(blocked.body.code, 'RANKED_COOLDOWN');
  assert.ok(blocked.body.retryAfter > 200);
  assert.ok((await req('GET', '/api/ranked/me', { token: u.token })).body.cooldownUntil);
});

test('PvP: กด Leave Match = Surrender ทันที · อีกฝ่าย Victory by Forfeit · หลุดเกิน grace = Defeat by Disconnect · Snapshot มี HP', async () => {
  const a = await makeUser('pa'); const b = await makeUser('pb');
  await setLeague(a, 'crest-lynx', 3, 1950); await setLeague(b, 'crest-lynx', 3, 1960);
  let ca = await connect(a); const cb = await connect(b);
  ca.send('ranked:queue_join'); cb.send('ranked:queue_join');
  const ma = await ca.next('ranked:matched'); await cb.next('ranked:matched');
  await ca.next('ranked:question'); await cb.next('ranked:question');
  const ci = await correctIndexOf(ma.matchId, 0);
  ca.send('ranked:answer', { matchId: ma.matchId, questionIndex: 0, choiceIndex: ci, damage: 999, hp: 0 });
  cb.send('ranked:answer', { matchId: ma.matchId, questionIndex: 0, choiceIndex: (ci + 1) % 4 });
  const rv = await ca.next('ranked:reveal'); await cb.next('ranked:reveal');
  assert.ok(rv.hp.opponent > 50, 'Damage ปลอมจาก client ไม่มีผล');
  await ca.next('ranked:question'); await cb.next('ranked:question');
  // A หลุด -> B เห็นนับถอยหลัง + deadline · A กลับมา -> ได้ Snapshot (HP/คะแนน/ข้อปัจจุบัน)
  await ca.close();
  const st = await cb.next('ranked:opponent_status');
  assert.strictEqual(st.connected, false);
  assert.ok(st.deadline && st.graceMs > 0);
  ca = await connect(a);
  const snap = await ca.next('ranked:resume');
  assert.deepStrictEqual(snap.hp, rv.hp);
  assert.strictEqual(snap.index, 1);
  assert.strictEqual((await cb.next('ranked:opponent_status')).connected, true);
  // B ไม่กลับมาเกิน grace
  await cb.close();
  const endA = await ca.next('ranked:ended', 5000);
  assert.strictEqual(endA.result.label, 'victory_forfeit');
  const hb = await req('GET', '/api/ranked/history', { token: b.token });
  assert.strictEqual(hb.body.matches[0].label, 'defeat_disconnect');
  assert.ok(hb.body.matches[0].qrDelta <= -18);
  const row = await matchRow(ma.matchId);
  assert.deepStrictEqual([row.result_reason, row.disconnects >= 2, row.reconnects >= 1], ['disconnect', true, true]);

  // เกมใหม่: กดออกเอง = Surrender ทันที
  const cb2 = await connect(b);
  ca.send('ranked:queue_join'); cb2.send('ranked:queue_join');
  const m2 = await ca.next('ranked:matched'); await cb2.next('ranked:matched');
  await ca.next('ranked:question');
  ca.send('ranked:forfeit');
  const ea = await ca.next('ranked:ended'); const eb = await cb2.next('ranked:ended');
  assert.strictEqual(ea.result.label, 'surrender');
  assert.strictEqual(eb.result.label, 'victory_forfeit');
  assert.strictEqual(eb.result.opponentForfeited, true);
  assert.strictEqual((await matchRow(m2.matchId)).result_reason, 'surrender');
  await ca.close(); await cb2.close();
});

test('Analytics: HP เฉลี่ย · ระยะเวลาเกม · จบด้วย HP 0 / ครบข้อ · อัตราหลุด / กลับมาได้ / ยอมแพ้ · comeback', async () => {
  const admin = await makeUser('ad');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
  const r = await req('GET', '/api/ranked/admin/analytics', { token: admin.token });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const b = r.body.battle;
  for (const k of ['avgHpRemaining', 'avgDurationSec', 'hpZeroPct', 'questionLimitPct', 'disconnectRatePct', 'reconnectSuccessPct', 'surrenderRatePct', 'penaltyCount', 'criticalComebackPct']) {
    assert.ok(k in b, `มี ${k}`);
  }
  assert.ok(b.matches > 0 && b.penaltyCount > 0);
  assert.ok(r.body.resultReasons.some((x) => x.reason === 'surrender'));
});

test('Audio settings: ค่าเริ่มต้น · บันทึกแล้วจำข้ามอุปกรณ์ · ค่าเกินช่วงถูกจำกัด 0–100', async () => {
  const u = await makeUser('au');
  const g = await req('GET', '/api/ranked/audio-settings', { token: u.token });
  assert.strictEqual(g.body.settings, null);
  assert.deepStrictEqual(g.body.defaults, { master: 70, music: 55, sfx: 80, muted: false, appMusic: true });
  const p = await req('PUT', '/api/ranked/audio-settings', { token: u.token, body: { master: 150, music: -5, sfx: 42.4, muted: true, appMusic: false, extra: 'x' } });
  assert.deepStrictEqual(p.body.settings, { master: 100, music: 0, sfx: 42, muted: true, appMusic: false });
  const again = await req('GET', '/api/ranked/audio-settings', { token: u.token });
  assert.deepStrictEqual(again.body.settings, { master: 100, music: 0, sfx: 42, muted: true, appMusic: false });
  assert.strictEqual((await req('GET', '/api/ranked/audio-settings', {})).status, 401);
});

test('Regression: แท็บกระดานอันดับ EXP กับ Ranked แยกกัน (เดิมปุ่มแท็บ EXP ไปผูกกับแท็บของ Ranked จนกดไม่ได้)', () => {
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  assert.match(html, /class="lb-tabs"[^>]*id="lb-tabs"/);
  assert.match(html, /id="rk-lb-tabs"/);
  assert.ok(!/querySelector\('\.lb-tabs'\)/.test(appJs), 'ห้ามเลือก .lb-tabs ตัวแรกของหน้า');
  assert.ok(!/querySelectorAll\('\.lb-tab'\)/.test(appJs), 'ห้ามแตะแท็บของ Ranked');
});
