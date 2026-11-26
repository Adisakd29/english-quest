/*
  v1.7.0 — Ranked ยิ่งแรงค์สูงยิ่งยาก (คำศัพท์ + แกรมม่า) · ของขวัญแรงค์สูงสุด "ธีมดาราศาสตร์"
  - ตารางความยากไล่ระดับ (ไม่มีแรงค์ไหนง่ายกว่าแรงค์ต่ำกว่า) · ไม่ทำให้คำถามง่ายกว่าระดับของผู้เล่น · แกรมม่าไม่เกิน C1 / คำศัพท์ไม่เกิน C2
  - เกมจริง: แรงค์สูงสุดได้คำถามระดับสูงกว่าและมีข้อท้าทาย · แรงค์ต่ำสุดตามระดับผู้เล่นเหมือนเดิม
  - ถึงแรงค์สูงสุด -> ได้ธีมดาราศาสตร์ครั้งเดียว (หน้าผลบอก) · ธีมยังล็อกสำหรับคนที่ยังไม่ถึง · แจกย้อนหลังให้คนที่เคยถึง
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const L = require('../config/leagues');
const svc = require('../services/ranked/matchService');
const { buildMatchQuestions, publicQuestion } = require('../services/ranked/questionBank');

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser(prefix = 'rd') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  await req('GET', '/api/ranked/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const IDX = (c) => ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(c);

test.before(async () => {
  await pool.query('SELECT 1');
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('ตารางความยาก: ไล่ระดับตามแรงค์ · ไม่ต่ำกว่าระดับผู้เล่น · เพดาน C1 (แกรมม่า) / C2 (คำศัพท์)', () => {
  for (const mode of ['vocab', 'grammar']) {
    for (const player of ['A1', 'A2', 'B1', 'B2', 'C1']) {
      let prev = null;
      for (const lg of L.LEAGUES) {
        const d = L.rankDifficulty(lg.id, player, mode);
        assert.ok(IDX(d.level) >= IDX(player), `${lg.id}/${mode}: ไม่ง่ายกว่าระดับผู้เล่น`);
        assert.ok(IDX(d.level) <= IDX(mode === 'grammar' ? 'C1' : 'C2'));
        if (prev) {
          assert.ok(IDX(d.level) >= IDX(prev.level), `${lg.id}/${mode}/${player}: ระดับไม่ลดลงเมื่อแรงค์สูงขึ้น`);
          assert.ok(d.stretch >= prev.stretch && d.hard >= prev.hard);
        }
        prev = d;
      }
    }
  }
  const low = L.rankDifficulty('trail-finch', 'A1', 'vocab'); const top = L.rankDifficulty('aurora-lion', 'A1', 'vocab');
  assert.deepStrictEqual([low.level, low.stretch], ['A1', 0], 'แรงค์แรกตามระดับผู้เล่นเหมือนเดิม');
  assert.deepStrictEqual([top.level, top.upLevel], ['C1', 'C2'], 'แรงค์สูงสุด: คำศัพท์ C1 + ข้อท้าทาย C2');
  assert.strictEqual(L.rankDifficulty('aurora-lion', 'A1', 'grammar').level, 'C1');
  assert.ok(L.publicConfig().rankDifficulty['aurora-lion'].vocab.includes('C1'));
});

test('เกมคำศัพท์: แรงค์สูงสุดได้คำถาม C1 + ข้อท้าทาย C2 ~70% · แรงค์ต่ำสุดยัง A1 ล้วน · ข้อท้าทายติดป้าย', async () => {
  const top = await buildMatchQuestions({ cefr: 'A1', tier: 'advanced', seed: 4242, mode: 'vocab', league: 'aurora-lion' });
  assert.strictEqual(top.length, L.RULES.questionsPerMatch);
  assert.ok(top.every((q) => IDX(q.cefr) >= IDX('C1')), JSON.stringify(top.map((q) => q.cefr)));
  const ch = top.filter((q) => q.challenge);
  assert.strictEqual(ch.length, Math.round(L.RULES.questionsPerMatch * 0.7));
  assert.ok(ch.every((q) => q.cefr === 'C2' || q.cefr === 'C1'));
  assert.ok(publicQuestion(ch[0], 0).challenge === true && !('correctIndex' in publicQuestion(ch[0], 0)));
  assert.strictEqual(new Set(top.map((q) => q.ref.wordId)).size, top.length, 'คำไม่ซ้ำในเกมเดียว');
  const low = await buildMatchQuestions({ cefr: 'A1', tier: 'beginner', seed: 4242, mode: 'vocab', league: 'trail-finch' });
  assert.ok(low.every((q) => q.cefr === 'A1' && !q.challenge));
  // ไม่ส่ง league (ระบบอื่นที่เรียกใช้) = พฤติกรรมเดิม
  const legacy = await buildMatchQuestions({ cefr: 'B1', tier: 'beginner', seed: 7, mode: 'vocab' });
  assert.ok(legacy.every((q) => q.cefr === 'B1'));
});

test('เกมคำศัพท์ทุกแรงค์: ทายความหมายคำอย่างเดียว — ไม่มีประโยค/บทอ่าน รวมข้อท้าทาย C2', async () => {
  for (const [league, cefr, tier] of [['trail-finch', 'A1', 'beginner'], ['moon-wolf', 'B1', 'intermediate'], ['aurora-lion', 'C1', 'advanced']]) {
    for (const seed of [1, 2, 3]) {
      const qs = await buildMatchQuestions({ cefr, tier, seed, mode: 'vocab', league });
      assert.strictEqual(qs.length, 10);
      for (const q of qs) {
        assert.strictEqual(q.type, 'vocabulary', `${league}: ${q.id}`);
        assert.ok(!q.passage, 'ไม่มีบทอ่าน');
        assert.ok(q.prompt.split(/\s+/).length <= 5, `โจทย์สั้น (คำ/วลี): ${q.prompt}`);
        assert.ok(!/_{2,}/.test(q.prompt), 'ไม่มีช่องเติมคำ');
        assert.strictEqual(q.choices.length, 4, 'ตัวเลือกเท่ากันทุกข้อ');
        assert.ok(q.correctIndex >= 0 && q.correctIndex < 4);
      }
    }
  }
  const top = await buildMatchQuestions({ cefr: 'C1', tier: 'advanced', seed: 9, mode: 'vocab', league: 'aurora-lion' });
  assert.ok(top.some((q) => q.cefr === 'C2'), 'แรงค์สูงสุดยังมีข้อ C2 (แบบทายความหมาย)');
});

test('เกมแกรมม่า: แรงค์สูงสุดได้ข้อ C1 และข้อยาก (difficulty ≥ 3) มากกว่าแรงค์ต่ำสุดชัดเจน', async () => {
  const hardShare = async (league, cefr) => {
    let hard = 0; let n = 0; const levels = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const qs = await buildMatchQuestions({ cefr, tier: L.LEAGUE_BY_ID[league].questionTier, seed, mode: 'grammar', league });
      qs.forEach((q) => { n += 1; levels.add(q.cefr); if (q.difficultyAdj > 0) hard += 1; });
    }
    return { share: hard / n, levels };
  };
  const top = await hardShare('aurora-lion', 'B1');
  const low = await hardShare('trail-finch', 'B1');
  assert.deepStrictEqual([...top.levels], ['C1'], 'ผู้เล่น B1 ที่แรงค์สูงสุดได้คำถาม C1');
  assert.ok(top.share > low.share + 0.2, `ข้อยาก: แรงค์สูงสุด ${Math.round(top.share * 100)}% vs แรงค์แรก ${Math.round(low.share * 100)}%`);
});

test('เริ่มเกมจริงที่แรงค์สูง: ระดับคำถามในเกมถูกยกขึ้นตามแรงค์ (บันทึกใน ranked_matches.cefr)', async () => {
  const u = await makeUser('rx');
  await pool.query("UPDATE ranked_profiles SET league = 'river-otter', division_index = 2, quest_rating = 1150 WHERE user_id = $1 AND mode = 'vocab'", [u.id]);
  const s = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode: 'vocab' } });
  assert.ok(s.body.matchId, JSON.stringify(s.body));
  const m = (await pool.query('SELECT cefr, questions FROM ranked_matches WHERE id = $1', [s.body.matchId])).rows[0];
  assert.strictEqual(m.cefr, 'A2', 'ผู้เล่นยังไม่วัดระดับ (A1) ที่แรงค์ 3 ได้ขั้นต่ำ A2');
  assert.ok(m.questions.every((q) => IDX(q.cefr) >= IDX('A2')));
});

test('บอททุกแรงค์: Ranked เริ่มเกมกับบอททันที (ไม่เข้าคิว) ทุกแรงค์/ทุก Division · บอทเป็นของแรงค์นั้นเอง · เลื่อนแรงค์ = บอส', async () => {
  const NPCS = require('../config/rankedNpcs');
  assert.strictEqual(L.MATCHMAKING.allBots, true);
  for (const lg of L.LEAGUES) {
    for (let d = 0; d < lg.divisions.length; d += 1) {
      for (const mode of ['vocab', 'grammar']) {
        const u = await makeUser('ab');
        await pool.query('UPDATE ranked_profiles SET league = $2, division_index = $3, quest_rating = $4 WHERE user_id = $1',
          [u.id, lg.id, d, lg.minQr[d] + 10]);
        const s = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode } });
        assert.ok(s.body.matchId && !s.body.queue, `${lg.id} ${d} ${mode}: ${JSON.stringify(s.body).slice(0, 200)}`);
        const m = (await pool.query('SELECT npc_id FROM ranked_matches WHERE id = $1', [s.body.matchId])).rows[0];
        assert.strictEqual(NPCS.BY_ID[m.npc_id].league, lg.id, `${lg.id}: คู่แข่งเป็นบอทของแรงค์นี้`);
        await req('POST', `/api/ranked/matches/${s.body.matchId}/forfeit`, { token: u.token });
        await pool.query('UPDATE users SET ranked_cooldown_until = NULL WHERE id = $1', [u.id]);
      }
    }
  }
  // ด่านเลื่อนแรงค์ของแรงค์สูง = บอส Guardian (เดิมต้องรอคิวผู้เล่นจริง)
  const u = await makeUser('ap');
  await pool.query("UPDATE ranked_profiles SET league = 'storm-falcon', division_index = 2, quest_rating = 4790, promotion_status = 'pending' WHERE user_id = $1 AND mode = 'vocab'", [u.id]);
  const pr = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'promotion', mode: 'vocab' } });
  assert.ok(pr.body.matchId && !pr.body.queue, JSON.stringify(pr.body).slice(0, 200));
  assert.strictEqual((await pool.query('SELECT npc_id FROM ranked_matches WHERE id = $1', [pr.body.matchId])).rows[0].npc_id, 'zephyr');
  assert.strictEqual(L.publicConfig().matchmaking.allBots, true);
});

test('บอทหลากหลาย: ทุกแรงค์มีบอท ≥ 15 ตัว หลายสไตล์ · id ไม่ซ้ำ · บอทชุดเดิมไม่เปลี่ยน id · สไตล์ใหม่ทำงานจริง', () => {
  const NPCS = require('../config/rankedNpcs');
  const { planAnswers } = require('../services/ranked/npcEngine');
  const ids = NPCS.NPCS.map((n) => n.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const lg of L.LEAGUES) {
    const bots = lg.npcs.map((id) => NPCS.BY_ID[id]);
    assert.ok(bots.length >= 15, `${lg.id}: ${bots.length}`);
    assert.ok(new Set(bots.map((b) => b.personality)).size >= 12, `${lg.id} หลายสไตล์`);
    assert.ok(new Set(bots.map((b) => b.name)).size === bots.length, 'ชื่อไม่ซ้ำในแรงค์เดียวกัน');
  }
  // id ของบอทชุดก่อน v1.7.0 ยังอยู่ (เกมเก่าอ้างถึง)
  for (const id of ['milo', 'nox', 'vera']) assert.ok(NPCS.BY_ID[id]);
  assert.ok(ids.filter((id) => /^(trail|swift|river|crest|moon|shadow)-/.test(id)).length >= 54);
  // บอทแรงค์บนเก่งกว่าแรงค์ล่าง (เฉลี่ย)
  const avg = (lg) => { const b = L.LEAGUE_BY_ID[lg].npcs.map((id) => NPCS.BY_ID[id]); return b.reduce((a, x) => a + x.skills.vocabulary, 0) / b.length; };
  assert.ok(avg('trail-finch') < avg('moon-wolf') && avg('moon-wolf') < avg('aurora-lion'));
  // curve: Slow Starter ตอบถูกช่วงท้ายมากกว่าช่วงต้น · Fast Starter กลับกัน (เฉลี่ยหลายเกม)
  const qs = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, type: 'vocabulary', cefr: 'B1', choices: ['a', 'b', 'c', 'd'], correctIndex: 0 }));
  const halves = (npc) => { let a = 0; let b = 0; for (let seed = 1; seed <= 400; seed += 1) { planAnswers(npc, qs, 'B1', seed).forEach((p, i) => { if (p.correct) { if (i < 5) a += 1; else b += 1; } }); } return [a, b]; };
  const pick = (pers) => NPCS.NPCS.find((n) => n.league === 'river-otter' && n.personality === pers);
  const [w1, w2] = halves(pick('Slow Starter')); assert.ok(w2 > w1 * 1.1, `warmup ${w1} → ${w2}`);
  const [f1, f2] = halves(pick('Fast Starter')); assert.ok(f1 > f2 * 1.1, `fader ${f1} → ${f2}`);
  const lightning = pick('Lightning'); const sharp = pick('Sharpshooter');
  assert.ok(lightning.responseMs[1] < sharp.responseMs[0] + 2000 && lightning.responseMs[0] < sharp.responseMs[0], 'Lightning ตอบไวกว่า Sharpshooter');
});

test('ธีมดาราศาสตร์: ล็อกจนกว่าจะถึงแรงค์สูงสุด · ได้ครั้งเดียว (หน้าผลบอก) · ใช้ได้หลังได้รับ', async () => {
  const u = await makeUser('as');
  const t0 = (await req('GET', '/api/themes', { token: u.token })).body;
  const astro = t0.premium.find((t) => t.id === 'astronomy');
  assert.ok(astro && !astro.owned && /ราชสีห์แสงเหนือ/.test(astro.unlockTh));
  assert.strictEqual((await req('PUT', '/api/themes/current', { token: u.token, body: { theme: 'astronomy' } })).status, 403);

  await pool.query("UPDATE ranked_profiles SET league = 'aurora-lion', division_index = 0, quest_rating = 5300 WHERE user_id = $1 AND mode = 'vocab'", [u.id]);
  const season = await svc.getActiveSeason();
  const client = await pool.connect();
  let first; let second;
  try {
    await client.query('BEGIN');
    first = await svc.applyOutcome(client, { userId: u.id, seasonId: season.id, matchId: null, matchType: 'ranked', outcome: 'win', opponentRating: 5300, mode: 'vocab', pvp: true });
    second = await svc.applyOutcome(client, { userId: u.id, seasonId: season.id, matchId: null, matchType: 'ranked', outcome: 'win', opponentRating: 5300, mode: 'vocab', pvp: true });
    await client.query('COMMIT');
  } finally { client.release(); }
  assert.deepStrictEqual(first.r.themeUnlocked, { id: 'astronomy', name: 'ธีมดาราศาสตร์' });
  assert.strictEqual(second.r.themeUnlocked, undefined, 'ได้ครั้งเดียว');
  const t1 = (await req('GET', '/api/themes', { token: u.token })).body;
  assert.ok(t1.owned.includes('astronomy'));
  const set = await req('PUT', '/api/themes/current', { token: u.token, body: { theme: 'astronomy' } });
  assert.strictEqual(set.status, 200); assert.strictEqual(set.body.current, 'astronomy');
  // ตกแรงค์ภายหลัง ธีมยังอยู่
  await pool.query("UPDATE ranked_profiles SET league = 'crown-eagle' WHERE user_id = $1", [u.id]);
  assert.ok((await req('GET', '/api/themes', { token: u.token })).body.owned.includes('astronomy'));
  // หน้าผลแสดงของขวัญ (buildResult ส่งต่อ)
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'services/ranked/matchService.js'), 'utf8').includes('themeUnlocked: practice ? null'));
});

test('แจกย้อนหลัง (migration 044): คนที่เคยถึงแรงค์สูงสุดได้ธีม · คนที่ไม่เคยถึงไม่ได้', async () => {
  const a = await makeUser('bk'); const b = await makeUser('bn');
  await pool.query("UPDATE ranked_profiles SET season_highest_league = 'aurora-lion', league = 'storm-falcon' WHERE user_id = $1", [a.id]);
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '044_astronomy_theme.sql'), 'utf8'));
  const own = async (id) => (await pool.query("SELECT 1 FROM user_themes WHERE user_id = $1 AND theme_id = 'astronomy'", [id])).rowCount;
  assert.strictEqual(await own(a.id), 1);
  assert.strictEqual(await own(b.id), 0);
});
