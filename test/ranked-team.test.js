/*
  Ranked Quest — โหมดทีม 2 คน (2v2) ผ่าน WebSocket จริง + PostgreSQL จริง
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
process.env.RANKED_GRACE_MS = '500';
process.env.RANKED_OFFER_AFTER_MS = '400';

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const pvp = require('../services/ranked/pvp');
const teams = require('../services/ranked/teams');

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
async function makeUser(prefix) {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  await req('GET', '/api/ranked/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
const befriend = (a, b) => pool.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')", [a.id, b.id]);
const setLeague = (u, league, division, qr) => pool.query('UPDATE ranked_profiles SET league = $1, division_index = $2, quest_rating = $3 WHERE user_id = $4', [league, division, qr, u.id]);
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
      send: (type, payload = {}) => ws.send(JSON.stringify({ type, ...payload })),
      next: (type, ms = 6000) => {
        const i = inbox.findIndex((m) => m.type === type);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout ${type}`)), ms); waiters.push({ type, resolve: res, t }); });
      },
      drain: (type) => { for (let i = inbox.length - 1; i >= 0; i -= 1) if (inbox[i].type === type) inbox.splice(i, 1); },
      close: () => new Promise((r) => { ws.once('close', r); ws.close(); }),
    };
    ws.once('open', () => c.next('connected').then(() => resolve(c)));
    ws.once('error', reject);
  });
}
async function makeParty(prefix, league, division, qr) {
  const a = await makeUser(`${prefix}a`); const b = await makeUser(`${prefix}b`);
  await befriend(a, b);
  await setLeague(a, league, division, qr); await setLeague(b, league, division, qr + 5);
  const ca = await connect(a); const cb = await connect(b);
  ca.send('ranked:party_invite', { userId: b.id });
  const inv = await cb.next('ranked:party_invited');
  assert.strictEqual(inv.from.id, a.id);
  cb.send('ranked:party_respond', { partyId: inv.partyId, accept: true });
  let party;
  do { party = await ca.next('ranked:party'); } while (party.members.length < 2);
  return { a, b, ca, cb, party };
}
async function correctIndex(matchId, i) {
  const { rows } = await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [matchId]);
  return rows[0].questions[i].correctIndex;
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
test.after(async () => {
  await new Promise((r) => { server.close(r); setTimeout(r, 300); });
  await pool.end();
  setTimeout(() => process.exit(process.exitCode || 0), 200);
});

test('Team: ชวนได้เฉพาะเพื่อน · สมาชิกที่ไม่ใช่หัวหน้ากดหาเกมไม่ได้', async () => {
  const x = await makeUser('tx'); const y = await makeUser('ty');
  const cx = await connect(x);
  cx.send('ranked:party_invite', { userId: y.id });
  assert.strictEqual((await cx.next('ranked:error')).code, 'NOT_FRIEND');
  const { ca, cb } = await makeParty('tn', 'trail-finch', 1, 150);
  cb.send('ranked:team_queue_join');
  assert.strictEqual((await cb.next('ranked:error')).code, 'NOT_LEADER');
  ca.send('ranked:party_leave');
  await cx.close(); await ca.close(); await cb.close();
});

test('Team vs ทีม NPC (League ต้น): 4 คนได้ข้อเดียวกัน · คะแนนทีม = รวมสมาชิก · QR ของทั้งคู่อัปเดต · ประวัติเป็นเกมทีม', async () => {
  const { a, b, ca, cb } = await makeParty('tv', 'trail-finch', 1, 150);
  ca.send('ranked:team_queue_join');
  const ma = await ca.next('ranked:team_matched'); const mb = await cb.next('ranked:team_matched');
  assert.strictEqual(ma.matchId, mb.matchId);
  assert.strictEqual(ma.players.length, 4);
  assert.deepStrictEqual(ma.players.map((p) => p.team), [0, 0, 1, 1]);
  assert.strictEqual(ma.yourTeam, mb.yourTeam, 'อยู่ทีมเดียวกัน');
  // ย่อเวลาตอบของ NPC ในเทสต์ (ไม่เปลี่ยนว่าตอบถูก/ผิด)
  const lm = teams._state.live.get(ma.matchId);
  Object.values(lm.plans).forEach((plan) => plan.forEach((p) => { p.responseMs = 30; }));
  assert.strictEqual(ma.teamHp, null, 'ระบบ HP ปิดอยู่');
  let played = 0;
  for (let i = 0; i < 10; i += 1) {
    const qa = await ca.next('ranked:team_question'); const qb = await cb.next('ranked:team_question');
    assert.strictEqual(qa.openedAt, qb.openedAt);
    assert.strictEqual(qa.question.correctIndex, undefined);
    const ci = await correctIndex(ma.matchId, i);
    ca.send('ranked:team_answer', { matchId: ma.matchId, questionIndex: i, choiceIndex: ci });
    cb.send('ranked:team_answer', { matchId: ma.matchId, questionIndex: i, choiceIndex: ci });
    const rv = await ca.next('ranked:team_reveal'); await cb.next('ranked:team_reveal');
    assert.strictEqual(rv.answers.length, 4, 'เฉลยแสดงผลของทั้ง 4 คน');
    assert.strictEqual(rv.teamScores[0], rv.playerScores[0] + rv.playerScores[1]);
    played += 1;
    if (rv.isLast) break;
  }
  const ea = await ca.next('ranked:team_ended'); const eb = await cb.next('ranked:team_ended');
  assert.strictEqual(ea.result.outcome, eb.result.outcome, 'เพื่อนร่วมทีมได้ผลเดียวกัน');
  assert.strictEqual(played, 10, 'เล่นครบทุกข้อ');
  assert.strictEqual(ea.result.correct, played);
  assert.ok(ea.result.team && ea.result.team.members.length === 4);
  const h = await req('GET', '/api/ranked/history', { token: b.token });
  assert.strictEqual(h.body.matches[0].team, true);
  const me = await req('GET', '/api/ranked/me', { token: a.token });
  assert.strictEqual(me.body.profile.questRating, ea.result.qr.after);
  assert.strictEqual(me.body.activeMatchId, null);
  ca.send('ranked:party_leave'); await ca.close(); await cb.close();
});

test('Team PvP (Crest Lynx): 2 ทีมผู้เล่นจริงจับคู่กัน · คนที่ออกกลางเกมนับแพ้ แต่เกมของคนอื่นเล่นต่อจนจบ', async () => {
  const t1 = await makeParty('ta', 'crest-lynx', 3, 1950);
  const t2 = await makeParty('tb', 'crest-lynx', 3, 1960);
  t1.ca.send('ranked:team_queue_join'); t2.ca.send('ranked:team_queue_join');
  const all = [t1.ca, t1.cb, t2.ca, t2.cb];
  const matched = await Promise.all(all.map((c) => c.next('ranked:team_matched')));
  const id = matched[0].matchId;
  assert.ok(matched.every((m) => m.matchId === id));
  assert.ok(matched[0].players.every((p) => p.isNpc === false), 'ทั้ง 4 คนเป็นผู้เล่นจริง');
  await Promise.all(all.map((c) => c.next('ranked:team_question')));
  t2.cb.send('ranked:team_forfeit');                                // สมาชิกทีม 2 ออกจากเกม
  await t2.cb.next('ranked:team_left_match');
  for (let i = 0; i < 10; i += 1) {
    if (i > 0) await Promise.all([t1.ca, t1.cb, t2.ca].map((c) => c.next('ranked:team_question')));
    const ci = await correctIndex(id, i);
    [t1.ca, t1.cb, t2.ca].forEach((c) => c.send('ranked:team_answer', { matchId: id, questionIndex: i, choiceIndex: ci }));
    const rvs = await Promise.all([t1.ca, t1.cb, t2.ca].map((c) => c.next('ranked:team_reveal')));
    if (rvs[0].isLast) break;
  }
  const ends = await Promise.all([t1.ca, t1.cb, t2.ca, t2.cb].map((c) => c.next('ranked:team_ended')));
  assert.strictEqual(ends[0].result.outcome, 'win', 'ทีมที่ครบได้คะแนน/ความแม่นยำมากกว่า');
  assert.strictEqual(ends[3].result.outcome, 'loss');
  assert.strictEqual(ends[3].result.forfeited, true);
  assert.strictEqual(ends[3].result.label, 'surrender', 'กดออกเอง = Surrender');
  assert.ok(ends[3].result.qr.delta <= -18, 'ออกกลางเกมเสีย QR มากกว่าแพ้ปกติ');
  const lb = await req('GET', '/api/ranked/leaderboard?scope=weekly', { token: t1.a.token });
  assert.ok(lb.body.top.some((r) => r.userId === t1.a.id));
  for (const c of all) await c.close();
});
