/*
  Ranked Quest — แยกโหมด Vocab / Grammar (แรงค์แยก) + ปิดระบบ HP (ค่าเริ่มต้น)
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
process.env.RANKED_OFFER_AFTER_MS = '60000';
delete process.env.RANKED_HP;

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const pvp = require('../services/ranked/pvp');
const { BATTLE } = require('../config/battle');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
async function makeUser(prefix = 'md') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  await req('GET', '/api/ranked/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
async function setLeague(u, league, division, qr, mode = 'vocab') {
  await req('GET', `/api/ranked/me?mode=${mode}`, { token: u.token });
  await pool.query('UPDATE ranked_profiles SET league = $1, division_index = $2, quest_rating = $3 WHERE user_id = $4 AND mode = $5', [league, division, qr, u.id, mode]);
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
async function startNpc(u, mode = 'vocab') {
  const s = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode } });
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


test('ค่าเริ่มต้น: ระบบ HP ปิดอยู่ (ไม่มีหลอด HP / ไม่มี KO)', () => {
  assert.strictEqual(BATTLE.hpEnabled, false);
});

test('Grammar mode: คำถามเป็นแกรมม่า/บทอ่านเท่านั้น · เล่นครบ 10 ข้อ · แรงค์ Grammar เปลี่ยน แรงค์ Vocab ไม่เปลี่ยน', async () => {
  const u = await makeUser();
  await setLeague(u, 'river-otter', 1, 1000, 'grammar');
  await setLeague(u, 'river-otter', 1, 1000, 'vocab');
  const s = await startNpc(u, 'grammar');
  assert.strictEqual(s.mode, 'grammar');
  assert.strictEqual(s.hp, null);
  const qs = (await pool.query('SELECT questions, mode FROM ranked_matches WHERE id = $1', [s.matchId])).rows[0];
  assert.strictEqual(qs.mode, 'grammar');
  assert.ok(qs.questions.every((q) => ['grammar', 'reading'].includes(q.type)), 'โหมดแกรมม่ามีแต่แกรมม่า/บทอ่าน');
  let st = s;
  while (st.status === 'active') {
    await req('POST', `/api/ranked/matches/${st.matchId}/answer`, { token: u.token, body: { questionIndex: st.index, choiceIndex: await correctIndexOf(st.matchId, st.index) } });
    st = (await req('POST', `/api/ranked/matches/${st.matchId}/next`, { token: u.token })).body;
  }
  assert.strictEqual(st.result.answered, 10);
  assert.strictEqual(st.result.mode, 'grammar');
  const g = (await req('GET', '/api/ranked/me?mode=grammar', { token: u.token })).body;
  const v = (await req('GET', '/api/ranked/me?mode=vocab', { token: u.token })).body;
  assert.strictEqual(g.mode, 'grammar');
  assert.strictEqual(g.profile.questRating, st.result.qr.after);
  assert.strictEqual(v.profile.questRating, 1000, 'แรงค์ Vocab แยก ไม่ได้รับผลจากเกม Grammar');
  assert.deepStrictEqual(Object.keys(g.modes).sort(), ['grammar', 'vocab']);
  assert.strictEqual(g.modes.vocab.questRating, 1000);
  const hist = (await req('GET', '/api/ranked/history?mode=vocab', { token: u.token })).body.matches;
  assert.strictEqual(hist.length, 0, 'ประวัติกรองตามโหมดได้');
});

test('Vocab mode: คำถามเป็นคำศัพท์/บริบทเท่านั้น', async () => {
  const u = await makeUser();
  const s = await startNpc(u, 'vocab');
  const qs = (await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [s.matchId])).rows[0].questions;
  assert.ok(qs.every((q) => ['vocabulary', 'context'].includes(q.type)));
  await req('POST', `/api/ranked/matches/${s.matchId}/forfeit`, { token: u.token });
});

test('Leaderboard แยกโหมด: เล่น Grammar แล้วขึ้นกระดาน Grammar เท่านั้น', async () => {
  const u = await makeUser();
  await setLeague(u, 'river-otter', 1, 1111, 'grammar');
  await pool.query("UPDATE ranked_profiles SET wins = 1 WHERE user_id = $1 AND mode = 'grammar'", [u.id]);
  const g = (await req('GET', '/api/ranked/leaderboard?mode=grammar', { token: u.token })).body;
  const v = (await req('GET', '/api/ranked/leaderboard?mode=vocab', { token: u.token })).body;
  assert.strictEqual(g.mode, 'grammar');
  assert.ok(g.top.some((r) => r.userId === u.id && r.questRating === 1111));
  assert.ok(!v.top.some((r) => r.userId === u.id), 'ไม่อยู่บนกระดาน Vocab');
});

test('PvP: จับคู่เฉพาะโหมดเดียวกัน (Vocab ไม่เจอ Grammar)', async () => {
  const a = await makeUser('ma'); const b = await makeUser('mb'); const c = await makeUser('mc');
  await setLeague(a, 'crest-lynx', 3, 1950, 'vocab'); await setLeague(b, 'crest-lynx', 3, 1950, 'grammar'); await setLeague(c, 'crest-lynx', 3, 1955, 'grammar');
  const ca = await connect(a); const cb = await connect(b);
  ca.send('ranked:queue_join', { mode: 'vocab' }); cb.send('ranked:queue_join', { mode: 'grammar' });
  await assert.rejects(ca.next('ranked:matched', 1500), /timeout/, 'คนละโหมดไม่ถูกจับคู่');
  const cc = await connect(c);
  cc.send('ranked:queue_join', { mode: 'grammar' });
  const mb = await cb.next('ranked:matched'); const mc = await cc.next('ranked:matched');
  assert.strictEqual(mb.matchId, mc.matchId);
  assert.strictEqual(mb.mode, 'grammar');
  assert.strictEqual(mb.you.rankLabel, 'แมวป่ายอดผา I', 'แสดงแรงค์ของโหมดที่เล่น');
  cb.send('ranked:forfeit'); await cb.next('ranked:ended'); await cc.next('ranked:ended');
  ca.send('ranked:queue_leave');
  await ca.close(); await cb.close(); await cc.close();
});
