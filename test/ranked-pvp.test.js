/*
  Ranked Quest Phase 2 — PvP ผ่าน WebSocket จริง + PostgreSQL จริง (ย่อเวลาด้วย env เพื่อให้ทดสอบเร็ว)
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
process.env.RANKED_GRACE_MS = '700';
process.env.RANKED_OFFER_AFTER_MS = '400';

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const pvp = require('../services/ranked/pvp');

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
async function makeUser(prefix = 'pv') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  await req('GET', '/api/ranked/me', { token: r.body.token }); // สร้างโปรไฟล์ Ranked
  return { token: r.body.token, id: me.body.user.id, name };
}
async function setLeague(u, league, division, qr) {
  await pool.query('UPDATE ranked_profiles SET league = $1, division_index = $2, quest_rating = $3 WHERE user_id = $4', [league, division, qr, u.id]);
}
async function setCefr(u, cefr) {
  await pool.query(`INSERT INTO placement_attempts (user_id, questions, status, result, completed_at)
                    VALUES ($1, '[]'::jsonb, 'completed', $2, NOW())`, [u.id, JSON.stringify({ overall: cefr })]);
}

/** WebSocket client ที่รอข้อความตามชนิดได้ */
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
async function correctIndex(matchId, i) {
  const { rows } = await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [matchId]);
  return rows[0].questions[i].correctIndex;
}
async function pairUp() {
  const a = await makeUser('pa'); const b = await makeUser('pb');
  await setLeague(a, 'crest-lynx', 3, 1950); await setLeague(b, 'crest-lynx', 3, 1960);
  const ca = await connect(a); const cb = await connect(b);
  ca.send('ranked:queue_join'); cb.send('ranked:queue_join');
  const ma = await ca.next('ranked:matched'); const mb = await cb.next('ranked:matched');
  return { a, b, ca, cb, ma, mb };
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
test.after(async () => {
  await new Promise((r) => { server.close(r); setTimeout(r, 300); });
  await pool.end();
  setTimeout(() => process.exit(process.exitCode || 0), 200); // ตัวจับเวลาของ realtime (presence) ยังเปิดอยู่
});

test('PvP: League ที่ยังเป็น NPC (Trail Finch) เข้าคิว PvP ไม่ได้', async () => {
  const u = await makeUser('tf'); const c = await connect(u);
  c.send('ranked:queue_join');
  const err = await c.next('ranked:error');
  assert.strictEqual(err.code, 'NPC_LEAGUE');
  await c.close();
});

test('PvP: REST บอกตรง ๆ ว่าต้องเข้าคิว หรือเป็นเกม NPC พร้อมเหตุผล — ไม่แอบเอา NPC มาแทนผู้เล่น', async () => {
  const u = await makeUser('rq');
  await setLeague(u, 'crest-lynx', 3, 1950);              // Crest Lynx I = ผู้เล่นจริง 100%
  const r1 = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } });
  assert.strictEqual(r1.body.queue, true);
  const r2 = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', npcFallback: true } });
  assert.strictEqual(r2.body.opponent.isNpc, true, 'Crest Lynx ผู้เล่นเลือก League NPC เองได้');
  assert.ok(r2.body.npcReason);
  await req('POST', `/api/ranked/matches/${r2.body.matchId}/forfeit`, { token: u.token });
  await setLeague(u, 'moon-wolf', 1, 2350);
  const r3 = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', npcFallback: true } });
  assert.strictEqual(r3.body.queue, true, 'Moon Wolf ขึ้นไปไม่ใส่ NPC ใน Ranked (ให้ฝึกกับ NPC แทน)');
});

test('PvP: จับคู่ -> เซิร์ฟเวอร์เปิดข้อพร้อมกัน ไม่มี Host -> เฉลยหลังทั้งคู่ตอบ -> ผลและ QR สวนทางกัน', async () => {
  const { a, b, ca, cb, ma, mb } = await pairUp();
  assert.strictEqual(ma.matchId, mb.matchId);
  assert.strictEqual(ma.opponent.isNpc, false);
  assert.strictEqual(ma.opponent.label, 'PLAYER');
  assert.strictEqual(ma.opponent.email, undefined, 'ไม่ส่งอีเมลของคู่แข่ง');
  assert.strictEqual(ma.host, undefined);
  assert.strictEqual(ma.hp, null, 'ระบบ HP ปิดอยู่ (ค่าเริ่มต้น)');
  assert.strictEqual(ma.mode, 'vocab');
  for (let i = 0; i < 10; i += 1) {
    const qa = await ca.next('ranked:question'); const qb = await cb.next('ranked:question');
    assert.strictEqual(qa.openedAt, qb.openedAt, 'เปิดข้อพร้อมกันทั้งสองฝั่ง');
    assert.strictEqual(qa.question.correctIndex, undefined, 'ไม่ส่งเฉลยก่อนตอบ');
    const ci = await correctIndex(ma.matchId, i);
    ca.send('ranked:answer', { matchId: ma.matchId, questionIndex: i, choiceIndex: ci });
    await ca.next('ranked:answer_ack');
    const seen = await cb.next('ranked:opponent_answered');
    assert.strictEqual(seen.correct, undefined, 'ไม่บอกคู่แข่งว่าอีกฝั่งตอบถูกหรือผิด');
    cb.send('ranked:answer', { matchId: ma.matchId, questionIndex: i, choiceIndex: (ci + 1) % 4 });
    const ra = await ca.next('ranked:reveal'); await cb.next('ranked:reveal');
    assert.strictEqual(ra.you.correct, true);
    assert.strictEqual(ra.opponent.correct, false);
    assert.strictEqual(ra.hp, null);
    assert.strictEqual(ra.isLast, i === 9, 'ไม่มี HP = เล่นครบทุกข้อ');
  }
  const ea = await ca.next('ranked:ended'); const eb = await cb.next('ranked:ended');
  assert.strictEqual(ea.result.outcome, 'win');
  assert.strictEqual(eb.result.outcome, 'loss');
  assert.strictEqual(ea.result.resultReason, 'questions_complete');
  assert.strictEqual(ea.result.decidedBy, 'accuracy', 'ตัดสินด้วยความแม่นยำก่อน');
  assert.strictEqual(ea.result.label, 'victory');
  assert.ok(ea.result.qr.delta > 0 && eb.result.qr.delta < 0, 'QR สวนทางกัน');
  assert.strictEqual(eb.result.missed.length, 10, 'ข้อที่ผิดของฝั่งที่สองถูกส่งกลับระบบเรียน');
  const hb = await req('GET', '/api/ranked/history', { token: b.token });
  assert.strictEqual(hb.body.matches[0].pvp, true, 'ผู้เล่นฝั่งที่สองเห็นเกมในประวัติ');
  assert.strictEqual(hb.body.matches[0].outcome, 'loss');
  const lb = await req('GET', '/api/ranked/leaderboard', { token: a.token });
  const meRow = lb.body.top.find((r) => r.userId === a.id);
  assert.ok(meRow && meRow.isMe);
  assert.ok(!JSON.stringify(lb.body).includes('@gmail.com'), 'Leaderboard ไม่มีอีเมล');
  const weekly = await req('GET', '/api/ranked/leaderboard?scope=weekly', { token: a.token });
  assert.ok(weekly.body.top.find((r) => r.userId === a.id).score > 0);
  await ca.close(); await cb.close();
});

test('PvP security: ตอบซ้ำ / ผิดข้อ / ตัวเลือกปลอม / คนนอกส่งคำตอบเข้าเกม -> ถูกปฏิเสธ', async () => {
  const { ca, cb, ma } = await pairUp();
  const outsider = await makeUser('ox'); const co = await connect(outsider);
  await ca.next('ranked:question'); await cb.next('ranked:question');
  co.send('ranked:answer', { matchId: ma.matchId, questionIndex: 0, choiceIndex: 0 });
  assert.strictEqual((await co.next('ranked:error')).code, 'NOT_FOUND');
  ca.send('ranked:answer', { matchId: ma.matchId, questionIndex: 5, choiceIndex: 0 });
  assert.strictEqual((await ca.next('ranked:error')).code, 'WRONG_QUESTION');
  ca.send('ranked:answer', { matchId: ma.matchId, questionIndex: 0, choiceIndex: 7 });
  assert.strictEqual((await ca.next('ranked:error')).code, 'BAD_CHOICE');
  ca.send('ranked:answer', { matchId: ma.matchId, questionIndex: 0, choiceIndex: 0 });
  await ca.next('ranked:answer_ack');
  ca.send('ranked:answer', { matchId: ma.matchId, questionIndex: 0, choiceIndex: 1 });
  assert.strictEqual((await ca.next('ranked:error')).code, 'DUPLICATE_ANSWER');
  ca.send('ranked:forfeit');
  assert.strictEqual((await ca.next('ranked:ended')).result.outcome, 'loss');
  assert.strictEqual((await cb.next('ranked:ended')).result.outcome, 'win');
  await ca.close(); await cb.close(); await co.close();
});

test('PvP disconnect: หลุดแล้วกลับมาในเวลา = เล่นต่อ (resume) · หลุดเกิน grace = แพ้', async () => {
  const { a, ca, cb, ma } = await pairUp();
  await ca.next('ranked:question'); await cb.next('ranked:question');
  await ca.close();
  const st = await cb.next('ranked:opponent_status');
  assert.strictEqual(st.connected, false);
  const ca2 = await connect(a);
  const resume = await ca2.next('ranked:resume');
  assert.strictEqual(resume.matchId, ma.matchId);
  assert.ok(resume.question && resume.question.prompt, 'ได้ข้อปัจจุบันคืน');
  assert.strictEqual((await cb.next('ranked:opponent_status')).connected, true);
  await ca2.close();                                      // หลุดอีกครั้ง และไม่กลับมา
  const ended = await cb.next('ranked:ended', 5000);
  assert.strictEqual(ended.result.outcome, 'win');
  assert.strictEqual(ended.result.opponentForfeited, true);
  await cb.close();
});

test('Matchmaking: CEFR ห่างกันเกินช่วง (A1 กับ C1) ไม่ถูกจับคู่ แม้ QR ใกล้กัน · รอนานได้รับข้อเสนอ (ไม่ใส่ NPC ให้เอง)', async () => {
  const a = await makeUser('ca'); const b = await makeUser('cb');
  await setLeague(a, 'crest-lynx', 3, 1950); await setLeague(b, 'crest-lynx', 3, 1950);
  await setCefr(a, 'A1'); await setCefr(b, 'C1');
  const ca = await connect(a); const cb = await connect(b);
  ca.send('ranked:queue_join'); cb.send('ranked:queue_join');
  const offer = await ca.next('ranked:queue_offer', 3000);
  assert.strictEqual(offer.kind, 'offer');
  await assert.rejects(ca.next('ranked:matched', 800), /timeout/);
  ca.send('ranked:queue_leave'); cb.send('ranked:queue_leave');
  await ca.close(); await cb.close();
});

test('Matchmaking window: ±100 / ±200 / ±350 ตามเวลารอ · CEFR gap 1 -> 2 หลัง 30 วิ', () => {
  const lynx = { matchmakingRange: [100, 200, 350] };
  assert.deepStrictEqual([pvp.qrWindow(0, lynx), pvp.qrWindow(12000, lynx), pvp.qrWindow(25000, lynx)], [100, 200, 350]);
  assert.deepStrictEqual([pvp.cefrGap(5000), pvp.cefrGap(31000)], [1, 2]);
});
