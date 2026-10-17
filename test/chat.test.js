/*
  แชทเพื่อน (DM) · สถานะเพื่อนจากกระดานอันดับ · แชท/เสียงในทีม Ranked (ส่งเฉพาะเพื่อนร่วมทีม)
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

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const pvp = require('../services/ranked/pvp');
const teams = require('../services/ranked/teams');
const chat = require('../routes/chat');
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
async function makeUser(prefix = 'dm') {
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
  teams.init();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  wsBase = `ws://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });


async function befriend(a, b) {
  await req('POST', '/api/friends/request', { token: a.token, body: { userId: b.id } });
  await req('POST', '/api/friends/request', { token: b.token, body: { userId: a.id } });   // คำขอสวนกัน = ตอบรับอัตโนมัติ
}

test('cleanBody: ตัดอักขระควบคุม/ตัวซ่อน · ขึ้นบรรทัดติดกันไม่เกิน 2', () => {
  assert.strictEqual(chat.cleanBody('  hi\u0000\u200Bthere\n\n\n\nok  '), 'hithere\n\nok');
});

test('Relations: กระดานอันดับรู้สถานะ none / pending_out / pending_in / friend / self · EXP leaderboard มี userId', async () => {
  const a = await makeUser(); const b = await makeUser(); const c = await makeUser();
  await req('POST', '/api/friends/request', { token: a.token, body: { userId: b.id } });
  const ra = (await req('GET', `/api/friends/relations?ids=${a.id},${b.id},${c.id}`, { token: a.token })).body.relations;
  assert.deepStrictEqual([ra[a.id], ra[b.id], ra[c.id]], ['self', 'pending_out', 'none']);
  const rb = (await req('GET', `/api/friends/relations?ids=${a.id}`, { token: b.token })).body.relations;
  assert.strictEqual(rb[a.id], 'pending_in');
  await req('POST', '/api/friends/request', { token: b.token, body: { userId: a.id } });
  assert.strictEqual((await req('GET', `/api/friends/relations?ids=${b.id}`, { token: a.token })).body.relations[b.id], 'friend');
  await pool.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, 50, 'test')", [a.id]);
  const lb = (await req('GET', '/api/leaderboard?period=week', { token: a.token })).body;
  assert.ok(lb.top.some((r) => r.userId === a.id && r.isMe));
  assert.ok(!JSON.stringify(lb).includes('@gmail.com'));
});

test('DM: เพื่อนส่งหากันได้ · ได้รับทันทีผ่าน WebSocket · ยังไม่อ่าน -> อ่านแล้ว · ไม่ใช่เพื่อน/บล็อก = ส่งไม่ได้', async () => {
  const a = await makeUser(); const b = await makeUser(); const stranger = await makeUser();
  await befriend(a, b);
  const cb = await connect(b);
  const sent = await req('POST', `/api/chat/${b.id}/messages`, { token: a.token, body: { body: 'Hello <b>friend</b>!' } });
  assert.strictEqual(sent.status, 200, JSON.stringify(sent.body));
  const push = await cb.next('chat:message');
  assert.strictEqual(push.message.body, 'Hello <b>friend</b>!', 'เก็บเป็นตัวอักษรล้วน (หน้าเว็บ escape เอง)');
  assert.strictEqual(push.from.id, a.id);
  assert.strictEqual((await req('GET', '/api/chat/unread', { token: b.token })).body.unread, 1);
  const conv = (await req('GET', '/api/chat/conversations', { token: b.token })).body.conversations;
  assert.strictEqual(conv[0].userId, a.id);
  assert.strictEqual(conv[0].unread, 1);
  const thread = (await req('GET', `/api/chat/${a.id}/messages`, { token: b.token })).body;
  assert.strictEqual(thread.messages.length, 1);
  assert.strictEqual(thread.messages[0].mine, false);
  await req('POST', `/api/chat/${a.id}/read`, { token: b.token });
  assert.strictEqual((await req('GET', '/api/chat/unread', { token: b.token })).body.unread, 0);
  // ไม่ใช่เพื่อน
  const s1 = await req('POST', `/api/chat/${stranger.id}/messages`, { token: a.token, body: { body: 'hi' } });
  assert.strictEqual(s1.status, 403);
  assert.strictEqual((await req('GET', `/api/chat/${a.id}/messages`, { token: stranger.token })).status, 403, 'อ่านบทสนทนาของคนอื่นไม่ได้');
  // ข้อความว่าง / ยาวเกิน
  assert.strictEqual((await req('POST', `/api/chat/${b.id}/messages`, { token: a.token, body: { body: '   ' } })).status, 400);
  assert.strictEqual((await req('POST', `/api/chat/${b.id}/messages`, { token: a.token, body: { body: 'x'.repeat(501) } })).status, 400);
  // บล็อก
  await req('POST', `/api/friends/block/${a.id}`, { token: b.token });
  assert.strictEqual((await req('POST', `/api/chat/${b.id}/messages`, { token: a.token, body: { body: 'still there?' } })).status, 403);
  assert.ok(!(await req('GET', '/api/chat/conversations', { token: b.token })).body.conversations.some((c) => c.userId === a.id));
  await cb.close();
});

test('DM: จำกัดความถี่ 30 ข้อความ/นาที · โหลดข้อความก่อนหน้าได้ (before)', async () => {
  const a = await makeUser(); const b = await makeUser();
  await befriend(a, b);
  let last;
  for (let i = 0; i < 31; i += 1) last = await req('POST', `/api/chat/${b.id}/messages`, { token: a.token, body: { body: `m${i}` } });
  assert.strictEqual(last.status, 429);
  const p1 = (await req('GET', `/api/chat/${a.id}/messages`, { token: b.token })).body;
  assert.strictEqual(p1.messages.length, 30);
  assert.strictEqual(p1.more, false);
  const p0 = (await req('GET', `/api/chat/${a.id}/messages?before=${p1.messages[5].id}`, { token: b.token })).body;
  assert.strictEqual(p0.messages.length, 5);
  assert.strictEqual(p0.messages[0].body, 'm0');
});

test('Team Ranked: แชท/สัญญาณเสียงถึงเพื่อนร่วมทีมเท่านั้น · ทีมตรงข้ามไม่ได้รับ', async () => {
  const mk = async (p) => { const u = await makeUser(p); await pool.query("UPDATE ranked_profiles SET league = 'crest-lynx', division_index = 3, quest_rating = 1950 WHERE user_id = $1", [u.id]); return u; };
  const a1 = await mk('ta'); const a2 = await mk('tb'); const b1 = await mk('tc'); const b2 = await mk('td');
  await befriend(a1, a2); await befriend(b1, b2);
  const [c1, c2, c3, c4] = await Promise.all([a1, a2, b1, b2].map(connect));
  c1.send('ranked:party_invite', { userId: a2.id }); const inv1 = await c2.next('ranked:party_invited'); c2.send('ranked:party_respond', { partyId: inv1.partyId, accept: true });
  c3.send('ranked:party_invite', { userId: b2.id }); const inv2 = await c4.next('ranked:party_invited'); c4.send('ranked:party_respond', { partyId: inv2.partyId, accept: true });
  await sleep(150);
  c1.send('ranked:team_queue_join', { mode: 'vocab' }); c3.send('ranked:team_queue_join', { mode: 'vocab' });
  const m1 = await c1.next('ranked:team_matched'); await c3.next('ranked:team_matched');
  c1.send('ranked:team_chat', { matchId: m1.matchId, text: '  ข้อนี้น่าจะ B \u0000 ' });
  const got = await c2.next('ranked:team_chat');
  assert.strictEqual(got.text, 'ข้อนี้น่าจะ B');
  assert.strictEqual((await c1.next('ranked:team_chat')).text, 'ข้อนี้น่าจะ B', 'ผู้ส่งเห็นข้อความตัวเองด้วย');
  await assert.rejects(c3.next('ranked:team_chat', 500), /timeout/, 'ทีมตรงข้ามไม่เห็น');
  // เสียง: เปิดไมค์ทั้งคู่ -> ได้ voice_peer · สัญญาณถึงเพื่อนร่วมทีมเท่านั้น
  c1.send('ranked:voice', { matchId: m1.matchId, on: true });
  assert.strictEqual((await c2.next('ranked:voice_peer')).on, true);
  c2.send('ranked:voice', { matchId: m1.matchId, on: true });
  await c1.next('ranked:voice_peer');
  const slotOfA2 = m1.players.find((p) => p.id === a2.id).slot;
  c1.send('ranked:voice_signal', { matchId: m1.matchId, toSlot: slotOfA2, data: { sdp: { type: 'offer', sdp: 'v=0' } } });
  const sig = await c2.next('ranked:voice_signal');
  assert.strictEqual(sig.data.sdp.type, 'offer');
  const slotOfB1 = m1.players.find((p) => p.id === b1.id).slot;
  c1.send('ranked:voice_signal', { matchId: m1.matchId, toSlot: slotOfB1, data: { sdp: { type: 'offer', sdp: 'v=0' } } });
  await assert.rejects(c3.next('ranked:voice_signal', 500), /timeout/, 'ส่งสัญญาณเสียงไปทีมตรงข้ามไม่ได้');
  // สแปมแชท
  for (let i = 0; i < 9; i += 1) c1.send('ranked:team_chat', { matchId: m1.matchId, text: `x${i}` });
  assert.strictEqual((await c1.next('ranked:error')).code, 'CHAT_RATE');
  c1.send('ranked:team_forfeit'); c2.send('ranked:team_forfeit');
  await c3.next('ranked:team_ended', 5000);
  for (const c of [c1, c2, c3, c4]) await c.close();
});
