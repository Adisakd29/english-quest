/*
  Matchmaking แรงค์สูง (ผู้เล่นจริงเท่านั้น) · ความห่างแรงค์ · คิวต่อเนื่อง/ยกเลิก/กู้คืนหลังเน็ตหลุด
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
process.env.RANKED_OFFER_AFTER_MS = '300';
process.env.RANKED_QUEUE_GRACE_MS = '1500';

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const pvp = require('../services/ranked/pvp');
const teams = require('../services/ranked/teams');
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
          const w = { type, resolve: res, t: null };
          w.t = setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) waiters.splice(k, 1); rej(new Error(`timeout waiting ${type}`)); }, ms);
          waiters.push(w);
        });
      },
      close: () => new Promise((r) => { ws.once('close', r); ws.close(); }),
    };
    ws.once('open', () => c.next('connected').then(() => resolve(c)));
    ws.once('error', reject);
  });
}

const leagues = require('../config/leagues');
const svc = require('../services/ranked/matchService');

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

const noMsg = async (c, type, ms) => { try { await c.next(type, ms); return false; } catch (_) { return true; } };

test('กติกาความห่างแรงค์: ใช้ลำดับ (Rank ID) ไม่ใช้ชื่อ · ต่างได้ไม่เกิน 1 ระดับ · ห้าม ≥ 2 เสมอ', () => {
  const L = (o) => leagues.LEAGUES.find((l) => l.order === o).id;
  assert.ok(leagues.leagueGapAllowed(L(5), L(6)), 'แรงค์ 5 กับ 6 ได้');
  assert.ok(leagues.leagueGapAllowed(L(6), L(6)), 'แรงค์เดียวกันได้');
  assert.ok(!leagues.leagueGapAllowed(L(3), L(6)), 'แรงค์ 3 กับ 6 ไม่ได้');
  assert.ok(!leagues.leagueGapAllowed(L(7), L(9)), 'แรงค์ 7 กับ 9 ไม่ได้');
  assert.ok(!leagues.leagueGapAllowed('กระจิบพเนจร', L(1)), 'ชื่อภาษาไทยใช้คำนวณไม่ได้');
  assert.ok(leagues.groupGapAllowed([L(6), L(7), L(6), L(7)]));
  assert.ok(!leagues.groupGapAllowed([L(6), L(7), L(8), L(7)]), 'กลุ่ม 4 คนต้องห่างกันไม่เกินเพดานทุกคู่');
  assert.deepStrictEqual([6, 7, 8, 9].map((o) => leagues.isHighRank(L(o))), [true, true, true, true]);
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((o) => leagues.isHighRank(L(o))), [false, false, false, false, false]);
  const e = (userId, league, extra = {}) => ({ userId, league, mode: 'vocab', offline: false, ...extra });
  assert.ok(!pvp.canPair(e(1, L(6)), e(1, L(6))), 'ไม่จับคู่กับตัวเอง');
  assert.ok(!pvp.canPair(e(1, L(6)), e(2, L(6), { mode: 'grammar' })), 'คนละโหมด');
  assert.ok(!pvp.canPair(e(1, L(6)), e(2, L(6), { offline: true })), 'คนที่เน็ตหลุดไม่ถูกจับคู่');
  assert.ok(pvp.canPair(e(1, L(6)), e(2, L(7))));
});

test('แรงค์สูง: REST ไม่เคยสร้างเกม NPC (Ranked / ขอ NPC เอง / แมตช์เลื่อนแรงค์) -> เข้าคิวผู้เล่นจริงเสมอ', async () => {
  const u = await makeUser('hr');
  for (const lg of ['shadow-panther', 'aurora-lion']) {   // (จำกัด 12 ครั้ง/นาที ต่อผู้ใช้)
    await setLeague(u, lg, 0, leagues.LEAGUE_BY_ID[lg].minQr[0] + 10);
    for (const body of [{ type: 'ranked' }, { type: 'ranked', npcFallback: true }, { type: 'ranked', npcFallback: true, npcId: 'milo' }]) {
      const r = await req('POST', '/api/ranked/matches', { token: u.token, body: { ...body, mode: 'vocab' } });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.queue, true, `${lg} ${JSON.stringify(body)} ต้องเข้าคิว`);
    }
  }
  await setLeague(u, 'storm-falcon', 2, 4799);
  await pool.query("UPDATE ranked_profiles SET promotion_status = 'pending' WHERE user_id = $1", [u.id]);
  const pr = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'promotion', mode: 'vocab' } });
  assert.deepStrictEqual([pr.body.queue, pr.body.promotion], [true, true], 'แมตช์เลื่อนแรงค์ของแรงค์สูง = เข้าคิวผู้เล่นจริง');
  const npcGames = await pool.query("SELECT COUNT(*)::int AS n FROM ranked_matches WHERE user_id = $1 AND opponent_kind = 'npc' AND match_type <> 'apex'", [u.id]);
  assert.strictEqual(npcGames.rows[0].n, 0, 'ไม่มีเกม NPC เลย');
  // แรงค์ระดับต้นยังเล่นกับ NPC ได้ตามเดิม
  const low = await makeUser('lo');
  const s = await req('POST', '/api/ranked/matches', { token: low.token, body: { type: 'ranked', mode: 'vocab' } });
  assert.ok(s.body.matchId && !s.body.queue, 'กระจิบพเนจรได้เกมทันที');
});

test('แรงค์สูง: ชนะเกมกับผู้เล่นจริงขณะรอเลื่อนแรงค์ = เลื่อนแรงค์ · เกมปกติที่ไม่ใช่ PvP ไม่นับ', async () => {
  const u = await makeUser('pp');
  await setLeague(u, 'storm-falcon', 2, 4799);
  await pool.query("UPDATE ranked_profiles SET promotion_status = 'pending' WHERE user_id = $1 AND mode = 'vocab'", [u.id]);
  const season = await svc.getActiveSeason();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const notPvp = await svc.applyOutcome(client, { userId: u.id, seasonId: season.id, matchId: null, matchType: 'ranked', outcome: 'win', opponentRating: 4700, mode: 'vocab' });
    assert.strictEqual(notPvp.r.league, 'storm-falcon');
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    const win = await svc.applyOutcome(client, { userId: u.id, seasonId: season.id, matchId: null, matchType: 'ranked', outcome: 'win', opponentRating: 4700, mode: 'vocab', pvp: true });
    assert.strictEqual(win.r.league, 'crown-eagle', 'ชนะผู้เล่นจริง = ขึ้นอินทรีมงกุฎ');
    assert.ok(win.r.events.some((e) => e.type === 'promoted'));
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    const loss = await svc.applyOutcome(client, { userId: u.id, seasonId: season.id, matchId: null, matchType: 'ranked', outcome: 'loss', opponentRating: 4700, mode: 'vocab', pvp: true });
    assert.deepStrictEqual([loss.r.league, loss.r.promotionStatus, loss.r.delta], ['storm-falcon', 'retry', 0], 'แพ้ไม่ตกขั้น ไม่เสียแต้ม');
    await client.query('ROLLBACK');
  } finally { client.release(); }
});

test('คิว: แรงค์ห่าง 2 ระดับไม่ถูกจับคู่แม้รอนาน · ห่าง 1 ระดับจับคู่ได้ · ไม่มีข้อเสนอ NPC สำหรับแรงค์สูง', async () => {
  const a = await makeUser('qa'); const b = await makeUser('qb'); const c = await makeUser('qc');
  await setLeague(a, 'storm-falcon', 0, 3950);     // 7
  await setLeague(b, 'aurora-lion', 0, 5300);      // 9
  await setLeague(c, 'shadow-panther', 3, 3880);   // 6 (แต้มใกล้กัน)
  const ca = await connect(a); const cb = await connect(b);
  ca.send('ranked:queue_join', { mode: 'vocab' }); cb.send('ranked:queue_join', { mode: 'vocab' });
  await ca.next('ranked:queue'); await cb.next('ranked:queue');
  assert.ok(await noMsg(ca, 'ranked:matched', 2500), 'แรงค์ 7 กับ 9 ไม่จับคู่');
  assert.ok(await noMsg(ca, 'ranked:queue_offer', 10), 'แรงค์สูงไม่มีข้อเสนอให้เล่นกับ NPC');
  assert.strictEqual(pvp._state.queue.size, 2, 'ยังค้นหาต่อเนื่องทั้งคู่');
  // กดซ้ำไม่เกิดคิวซ้ำ
  ca.send('ranked:queue_join', { mode: 'vocab' }); await ca.next('ranked:queue');
  assert.strictEqual(pvp._state.queue.size, 2);
  const cc = await connect(c);
  cc.send('ranked:queue_join', { mode: 'vocab' });
  await cc.next('ranked:queue');
  const [ma, mc] = await Promise.all([ca.next('ranked:matched', 5000), cc.next('ranked:matched', 5000)]);
  assert.strictEqual(ma.matchId, mc.matchId, 'แรงค์ 7 กับ 6 จับคู่กัน');
  assert.notStrictEqual(ma.opponent.id, a.id);
  assert.strictEqual(ma.opponent.isNpc, false);
  assert.strictEqual(pvp._state.queue.has(b.id), true, 'แรงค์ 9 ยังค้นหาต่อ');
  const rows = await pool.query('SELECT COUNT(*)::int AS n FROM ranked_matches WHERE (user_id = $1 OR player2_id = $1) AND status = $2', [a.id, 'active']);
  assert.strictEqual(rows.rows[0].n, 1, 'สร้างห้องแข่งเพียงห้องเดียว');
  cb.send('ranked:queue_leave'); await cb.next('ranked:queue');
  assert.strictEqual(pvp._state.queue.has(b.id), false, 'ยกเลิกแล้วออกจากคิวจริง');
  ca.send('ranked:forfeit'); await ca.next('ranked:ended', 5000);
  await Promise.all([ca.close(), cb.close(), cc.close()]);
});

test('คิว: เน็ตหลุดแล้วกลับมาทัน = คิวเดิมต่อ · ไม่กลับมาในเวลา = ออกจากคิว (ไม่มี timer ค้าง)', async () => {
  const a = await makeUser('ra');
  await setLeague(a, 'crown-eagle', 0, 4850);
  let ca = await connect(a);
  ca.send('ranked:queue_join', { mode: 'vocab' });
  const first = await ca.next('ranked:queue');
  await ca.close(); await sleep(150);
  assert.strictEqual(pvp._state.queue.get(a.id).offline, true, 'ระหว่างหลุด: ยังอยู่ในคิวแต่ไม่ถูกจับคู่');
  ca = await connect(a);
  const back = await ca.next('ranked:queue');
  assert.deepStrictEqual([back.status, back.resumed, back.since], ['searching', true, first.since], 'กู้คิวเดิม (เวลารอนับต่อ)');
  assert.strictEqual(pvp._state.queue.get(a.id).offline, false);
  await ca.close();
  await sleep(1900);
  assert.strictEqual(pvp._state.queue.has(a.id), false, 'หลุดเกินเวลา -> ออกจากคิว');
});

test('ทีม: สมาชิกแรงค์ห่างเกินเพดานลงคิวทีมไม่ได้ · ทีมแรงค์สูงขอทีม NPC ไม่ได้ (ตรวจฝั่งเซิร์ฟเวอร์)', async () => {
  const a = await makeUser('ta'); const b = await makeUser('tb');
  await req('POST', '/api/friends/request', { token: a.token, body: { userId: b.id } });
  await req('POST', '/api/friends/request', { token: b.token, body: { userId: a.id } });
  await setLeague(a, 'shadow-panther', 0, 2950); await setLeague(b, 'river-otter', 0, 800);
  const ca = await connect(a); const cb = await connect(b);
  ca.send('ranked:party_invite', { userId: b.id });
  const inv = await cb.next('ranked:party_invited');
  cb.send('ranked:party_respond', { partyId: inv.partyId, accept: true });
  await ca.next('ranked:party'); await ca.next('ranked:party');
  ca.send('ranked:team_queue_join', { mode: 'vocab' });
  const e = await ca.next('ranked:error');
  assert.strictEqual(e.code, 'RANK_GAP');
  await setLeague(b, 'moon-wolf', 0, 2150);     // 5 กับ 6 = ได้
  ca.send('ranked:team_queue_join', { mode: 'vocab' });
  await ca.next('ranked:team_queue');
  ca.send('ranked:team_queue_npc');            // ยิงตรง ๆ ไม่ผ่านข้อเสนอ -> ต้องไม่มีเกม NPC
  assert.ok(await noMsg(ca, 'ranked:team_matched', 1200), 'ไม่มีทีม NPC สำหรับทีมแรงค์สูง');
  ca.send('ranked:team_queue_leave');
  await Promise.all([ca.close(), cb.close()]);
});
