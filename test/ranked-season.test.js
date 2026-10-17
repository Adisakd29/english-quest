/*
  Ranked Quest Phase 3 — Season / Soft reset / Rewards (cosmetic) / Apex / Upper leagues / Analytics
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const seasons = require('../services/ranked/seasons');

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
async function makeUser(prefix = 'ss') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  await req('GET', '/api/ranked/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
const activeSeason = async () => (await pool.query('SELECT * FROM ranked_seasons WHERE is_active')).rows[0];
async function setProfile(u, fields) {
  const s = await activeSeason();
  const keys = Object.keys(fields);
  await pool.query(`UPDATE ranked_profiles SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE user_id = $${keys.length + 1} AND season_id = $${keys.length + 2}`,
    [...keys.map((k) => fields[k]), u.id, s.id]);
}
async function loseNpcPlan(matchId) {
  await pool.query(`UPDATE ranked_matches SET npc_plan = (SELECT jsonb_agg(jsonb_set(p, '{correct}', 'false')) FROM jsonb_array_elements(npc_plan) p) WHERE id = $1`, [matchId]);
}
async function playAllCorrect(u, s) {
  const { rows } = await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [s.matchId]);
  let st = s;
  while (st.status === 'active') {
    if (st.phase === 'question') {
      await req('POST', `/api/ranked/matches/${st.matchId}/answer`, { token: u.token, body: { questionIndex: st.index, choiceIndex: rows[0].questions[st.index].correctIndex } });
    }
    st = (await req('POST', `/api/ranked/matches/${st.matchId}/next`, { token: u.token })).body;
  }
  return st;
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

test('Upper leagues: Shadow Panther ขึ้นไป Ranked = PvP เท่านั้น (ขอ NPC ไม่ได้) · ไม่มีโหมดซ้อมกับบอท', async () => {
  const u = await makeUser('up');
  await setProfile(u, { league: 'shadow-panther', division_index: 1, quest_rating: 3200 });
  const r1 = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', npcFallback: true } });
  assert.strictEqual(r1.body.queue, true);
  assert.strictEqual((await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'practice' } })).status, 400, 'ไม่มีโหมดซ้อมกับบอท');
  await setProfile(u, { league: 'storm-falcon', division_index: 0, quest_rating: 3950 });
  const r2 = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } });
  assert.strictEqual(r2.body.queue, true, 'Storm Falcon แข่งกับผู้เล่นจริงเท่านั้น');
});

test('Apex Challenge: เฉพาะ Aurora Lion · คู่แข่ง Solari (มีป้าย) · ไม่กระทบ QR · ชนะได้รางวัลตกแต่ง', async () => {
  const u = await makeUser('ax');
  assert.strictEqual((await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'apex' } })).status, 403);
  await setProfile(u, { league: 'aurora-lion', division_index: 0, quest_rating: 5400 });
  const s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'apex' } })).body;
  assert.strictEqual(s.opponent.id, 'solari');
  assert.strictEqual(s.opponent.label, 'APEX CHALLENGE');
  await loseNpcPlan(s.matchId);
  const end = await playAllCorrect(u, s);
  assert.strictEqual(end.result.outcome, 'win');
  assert.strictEqual(end.result.qr.delta, 0);
  assert.strictEqual((await req('GET', '/api/ranked/me', { token: u.token })).body.profile.questRating, 5400);
  const rw = await req('GET', '/api/ranked/rewards', { token: u.token });
  assert.ok(rw.body.catalog.find((c) => c.id === 'apex:solari').owned);
});

test('Rewards: Cosmetic only · ใส่ได้เฉพาะของที่ได้รับและตำแหน่งที่ถูก · แสดงบน Leaderboard', async () => {
  const u = await makeUser('rw');
  assert.strictEqual((await req('POST', '/api/ranked/rewards/equip', { token: u.token, body: { slot: 'title', rewardId: 'title:aurora-lion' } })).status, 403, 'ใส่ของที่ยังไม่ได้ไม่ได้');
  const s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } })).body;
  await playAllCorrect(u, s);                              // จบเกมแรก -> ได้ Title ของ League ปัจจุบัน
  const rw = (await req('GET', '/api/ranked/rewards', { token: u.token })).body;
  assert.ok(rw.catalog.find((c) => c.id === 'title:trail-finch').owned);
  assert.match(rw.note, /ของตกแต่ง/);
  assert.strictEqual((await req('POST', '/api/ranked/rewards/equip', { token: u.token, body: { slot: 'frame', rewardId: 'title:trail-finch' } })).status, 400, 'ผิดตำแหน่ง');
  const eq = await req('POST', '/api/ranked/rewards/equip', { token: u.token, body: { slot: 'title', rewardId: 'title:trail-finch' } });
  assert.strictEqual(eq.body.equipped.title.name, 'นักเดินทางหน้าใหม่');
  const lb = await req('GET', '/api/ranked/leaderboard', { token: u.token });
  assert.strictEqual(lb.body.top.find((r) => r.userId === u.id).title, 'นักเดินทางหน้าใหม่');
  assert.strictEqual((await req('POST', '/api/ranked/rewards/equip', { token: u.token, body: { slot: 'title', rewardId: null } })).status, 200, 'ถอดได้');
});

test('Analytics: เฉพาะผู้ดูแล · มีข้อมูลสำหรับปรับสมดุลครบ', async () => {
  const u = await makeUser('an');
  assert.strictEqual((await req('GET', '/api/ranked/admin/analytics', { token: u.token })).status, 403);
  assert.strictEqual((await req('POST', '/api/ranked/admin/season/rollover', { token: u.token })).status, 403, 'ผู้ใช้ทั่วไปปิดซีซันไม่ได้');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.id]);
  const login = await req('POST', '/api/auth/login', { body: { identifier: u.name, password: 'password123' } });
  const a = await req('GET', '/api/ranked/admin/analytics', { token: login.body.token });
  assert.strictEqual(a.status, 200, JSON.stringify(a.body));
  for (const k of ['overview', 'npcWinRates', 'questionTypes', 'leagueDistribution', 'promotions', 'queue', 'endReasons']) assert.ok(k in a.body, k);
  assert.strictEqual(a.body.leagueDistribution.length, 9);
});

test('Season: Soft reset ตามกฎ (ไม่รีเซ็ตทุกคนไป Trail Finch) · รางวัลปลายซีซัน · เกมที่คร่อมการปิดซีซันนับในซีซันเดิม', async () => {
  const aur = await makeUser('sa'); const wolf = await makeUser('sw'); const hare = await makeUser('sh'); const lynx = await makeUser('sl');
  await setProfile(aur, { league: 'aurora-lion', division_index: 0, quest_rating: 5600, wins: 50, season_highest_league: 'aurora-lion' });
  await setProfile(wolf, { league: 'moon-wolf', division_index: 2, quest_rating: 2550, wins: 9, season_highest_league: 'moon-wolf' });
  await setProfile(hare, { league: 'swift-hare', division_index: 2, quest_rating: 650, wins: 5, season_highest_league: 'swift-hare' });
  await setProfile(lynx, { league: 'crest-lynx', division_index: 1, quest_rating: 1600, wins: 3, season_highest_league: 'crest-lynx' });
  const old = await activeSeason();
  const pending = (await req('POST', '/api/ranked/matches', { token: hare.token, body: { type: 'ranked' } })).body; // เกมค้างตอนปิดซีซัน

  const r = await seasons.rollover();
  const now = await activeSeason();
  assert.notStrictEqual(now.id, old.id);
  assert.strictEqual(r.opened, now.slug);
  assert.ok(now.theme, 'ซีซันใหม่มีธีม');
  const prof = async (u) => (await req('GET', '/api/ranked/me', { token: u.token })).body.profile;
  const pa = await prof(aur); const pw = await prof(wolf); const ph = await prof(hare); const pl = await prof(lynx);
  assert.deepStrictEqual([pa.league, pa.questRating], ['shadow-panther', 2900], 'Aurora Lion -> Shadow Panther');
  assert.deepStrictEqual([pw.league, pw.questRating], ['crest-lynx', 1300], 'Moon Wolf -> Crest Lynx');
  assert.deepStrictEqual([pl.league, pl.questRating], ['river-otter', 750], 'Crest Lynx -> River Otter');
  assert.deepStrictEqual([ph.league, ph.label], ['swift-hare', 'กระต่ายเหินลม III'], 'League ต้นอยู่ League เดิม เริ่ม Division ต่ำสุด');

  const owned = async (u) => (await pool.query('SELECT reward_id FROM user_ranked_rewards WHERE user_id = $1', [u.id])).rows.map((x) => x.reward_id);
  assert.ok((await owned(aur)).includes(`season-badge:${old.slug}:aurora-lion`));
  assert.ok((await owned(aur)).includes(`nameplate:aurora:${old.slug}`), 'Aurora Lion Top N ได้นามเพลต');
  assert.ok((await owned(wolf)).includes('frame:moon-wolf'), 'Moon Wolf ขึ้นไปได้กรอบโปรไฟล์');
  assert.ok(!(await owned(hare)).some((x) => x.startsWith('frame:')), 'League ต้นไม่ได้กรอบ');

  const end = await playAllCorrect(hare, pending);       // จบเกมที่เริ่มก่อนปิดซีซัน
  assert.strictEqual(end.status, 'finished');
  const oldProf = (await pool.query('SELECT wins FROM ranked_profiles WHERE user_id = $1 AND season_id = $2', [hare.id, old.id])).rows[0];
  assert.ok(oldProf.wins >= 5, 'ผลนับในซีซันที่เกมเริ่ม');
});
