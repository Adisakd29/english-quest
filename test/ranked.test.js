/*
  ชุดทดสอบ Ranked Quest (Phase 1) — ตรรกะล้วน + API จริงบน PostgreSQL
  รัน: npm test (ต้องมี TEST_DATABASE_URL)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const leagues = require('../config/leagues');
const NPCS = require('../config/rankedNpcs');
const { calculateQuestRating } = require('../services/ranked/rating');
const npcEngine = require('../services/ranked/npcEngine');
const { pointsFor } = require('../services/ranked/matchService');

/* ======================= ตรรกะล้วน (ไม่ใช้ DB) ======================= */

test('league config: 9 Animal League ตามสเปก · Division ถูกต้อง · ไม่มีชื่อแรงค์เกมทั่วไป/Fox', () => {
  assert.deepStrictEqual(leagues.LEAGUES.map((l) => l.nameEn), ['Trail Finch', 'Swift Hare', 'River Otter', 'Crest Lynx',
    'Moon Wolf', 'Shadow Panther', 'Storm Falcon', 'Crown Eagle', 'Aurora Lion']);
  // ชื่อหลักที่แสดงเป็นภาษาไทย (ลำดับเดิม)
  assert.deepStrictEqual(leagues.LEAGUES.map((l) => l.name), ['กระจิบพเนจร', 'กระต่ายเหินลม', 'นากสายน้ำ', 'แมวป่ายอดผา',
    'หมาป่าจันทรา', 'เสือดำพรางเงา', 'เหยี่ยวพายุ', 'อินทรีมงกุฎ', 'ราชสีห์แสงเหนือ']);
  assert.ok(leagues.LEAGUES.every((l) => l.region && l.motto && l.theme), 'ทุกแรงค์มีข้อมูลดินแดนบนแผนที่');
  assert.deepStrictEqual(leagues.LEAGUES.map((l) => l.divisions.length), [3, 3, 3, 4, 4, 4, 3, 1, 1]);
  assert.strictEqual(leagues.STEPS.length, 26);
  // ชื่อ/รหัส/สัตว์ของแรงค์ต้องไม่ใช่ชื่อแรงค์เกมทั่วไป และไม่ใช่ Fox (Fox = Mascot)
  const names = leagues.LEAGUES.flatMap((l) => [l.id, l.name, l.animal]).join(' ').toLowerCase();
  for (const banned of ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'grandmaster', 'legend', 'fox']) {
    assert.ok(!new RegExp(`\\b${banned}\\b`).test(names), `ห้ามมี ${banned}`);
  }
  // QR ขั้นต่ำเพิ่มขึ้นตลอดทั้ง 26 ขั้น
  for (let i = 1; i < leagues.STEPS.length; i += 1) assert.ok(leagues.STEPS[i].minQr > leagues.STEPS[i - 1].minQr);
  // League 1–8 มี Guardian · Aurora Lion มี Apex Challenge แทน
  leagues.LEAGUES.slice(0, 8).forEach((l) => assert.ok(NPCS.BY_ID[l.guardian], `${l.name} ต้องมี Guardian`));
  assert.strictEqual(leagues.LEAGUE_BY_ID['aurora-lion'].apexChallenge, 'solari');
});

test('NPC: ทุกตัวมีป้าย NPC ชัดเจน และ publicNpc ไม่ส่งค่าความเก่งภายใน', () => {
  for (const n of [...NPCS.NPCS, ...NPCS.GUARDIANS]) {
    const p = NPCS.publicNpc(n);
    assert.strictEqual(p.isNpc, true);
    assert.ok(p.label && /NPC|GUARDIAN|APEX/.test(p.label));
    assert.strictEqual(p.skills, undefined);
    assert.strictEqual(p.rating, undefined);
  }
});

const K40 = { league: 'crest-lynx', divisionIndex: 1, qr: 1550 };
const delta = (profile, outcome, opp, type = 'ranked') => calculateQuestRating(profile, { type, outcome, opponentRating: opp }).delta;

test('QR: ชนะ ≈ +20 · ชนะคู่แข็งกว่า +22..+28 · แพ้ −10..−15 · เสมอ 0..+2', () => {
  assert.strictEqual(delta(K40, 'win', 1550), 20);
  const strong = delta(K40, 'win', 1700);
  assert.ok(strong >= 22 && strong <= 28, `ชนะคู่แข็งกว่าได้ ${strong}`);
  assert.ok(delta(K40, 'win', 2500) <= 28, 'มีเพดานต่อเกม');
  const loss = delta(K40, 'loss', 1550);
  assert.ok(loss <= -10 && loss >= -15, `แพ้เสีย ${loss}`);
  assert.ok(delta(K40, 'loss', 900) >= -15, 'แพ้มากสุด −15');
  const draw = delta(K40, 'draw', 1650);
  assert.ok(draw >= 0 && draw <= 2);
  assert.strictEqual(delta(K40, 'win', 1550, 'practice'), 0, 'ฝึกซ้อมไม่กระทบ QR');
});

test('QR: Beginner Protection — Trail Finch / Swift Hare III ไม่เสีย · River Otter เสีย · หลังเลื่อนคุ้มครอง 2 เกม', () => {
  assert.strictEqual(delta({ league: 'trail-finch', divisionIndex: 1, qr: 150 }, 'loss', 120), 0);
  assert.strictEqual(delta({ league: 'swift-hare', divisionIndex: 0, qr: 350 }, 'loss', 470), 0);
  assert.ok(delta({ league: 'swift-hare', divisionIndex: 1, qr: 500 }, 'loss', 470) < 0);
  assert.ok(delta({ league: 'river-otter', divisionIndex: 0, qr: 800 }, 'loss', 900) < 0);
  const r1 = calculateQuestRating({ ...K40, protectionMatches: 2 }, { type: 'ranked', outcome: 'loss', opponentRating: 1550 });
  assert.strictEqual(r1.delta, 0);
  assert.strictEqual(r1.protectionMatches, 1);
});

test('Promotion: QR หยุดที่ขอบ League -> รอ Trial · ชนะ = เลื่อน League · แพ้ = ไม่ตกขั้น + รอเล่นเกมปกติ', () => {
  const r = calculateQuestRating({ league: 'trail-finch', divisionIndex: 2, qr: 290 }, { type: 'ranked', outcome: 'win', opponentRating: 170 });
  assert.strictEqual(r.qr, 299);
  assert.strictEqual(r.promotionStatus, 'pending');
  assert.strictEqual(r.league, 'trail-finch', 'ข้าม League ด้วย QR อย่างเดียวไม่ได้');

  const win = calculateQuestRating({ league: 'river-otter', divisionIndex: 2, qr: 1299, promotionStatus: 'pending' }, { type: 'promotion', outcome: 'win' });
  assert.deepStrictEqual([win.league, win.divisionIndex, win.qr, win.protectionMatches], ['crest-lynx', 0, 1300, 2]);
  assert.ok(win.events.some((e) => e.type === 'promoted'));

  const lose = calculateQuestRating({ league: 'river-otter', divisionIndex: 2, qr: 1299, promotionStatus: 'pending' }, { type: 'promotion', outcome: 'loss' });
  assert.deepStrictEqual([lose.league, lose.qr, lose.promotionStatus, lose.promotionRetryAfter], ['river-otter', 1299, 'retry', 2]);
  // เล่นเกมปกติครบ 2 เกม -> กลับมาเป็น pending
  let p = { league: 'river-otter', divisionIndex: 2, qr: 1299, promotionStatus: 'retry', promotionRetryAfter: 2 };
  p = { ...p, ...calculateQuestRating(p, { type: 'ranked', outcome: 'win', opponentRating: 950 }) };
  assert.strictEqual(p.promotionStatus, 'retry');
  p = { ...p, ...calculateQuestRating(p, { type: 'ranked', outcome: 'win', opponentRating: 950 }) };
  assert.strictEqual(p.promotionStatus, 'pending');
});

test('Division / Demotion: ขึ้นเมื่อถึงเกณฑ์ · ลดมี buffer 50 · ตก League ได้เมื่อต่ำกว่าเกณฑ์เกิน buffer', () => {
  const up = calculateQuestRating({ league: 'crest-lynx', divisionIndex: 0, qr: 1490 }, { type: 'ranked', outcome: 'win', opponentRating: 1500 });
  assert.strictEqual(up.divisionIndex, 1);
  const stay = calculateQuestRating({ league: 'crest-lynx', divisionIndex: 1, qr: 1505 }, { type: 'ranked', outcome: 'loss', opponentRating: 1505 });
  assert.strictEqual(stay.divisionIndex, 1, 'ต่ำกว่าเกณฑ์นิดเดียวยังไม่ตก (buffer)');
  const down = calculateQuestRating({ league: 'crest-lynx', divisionIndex: 1, qr: 1455 }, { type: 'ranked', outcome: 'loss', opponentRating: 1455 });
  assert.strictEqual(down.divisionIndex, 0);
  const drop = calculateQuestRating({ league: 'crest-lynx', divisionIndex: 0, qr: 1252 }, { type: 'ranked', outcome: 'loss', opponentRating: 1250 });
  assert.strictEqual(drop.league, 'river-otter');
});

test('Apex: Crown Eagle -> Aurora Lion ต้องผ่าน QR + จำนวนเกม + Win Rate ก่อนปลดล็อก Trial', () => {
  const base = { league: 'crown-eagle', divisionIndex: 0, qr: 5190 };
  const notYet = calculateQuestRating({ ...base, wins: 10, losses: 5, draws: 0 }, { type: 'ranked', outcome: 'win', opponentRating: 5200 });
  assert.strictEqual(notYet.qr, 5199);
  assert.strictEqual(notYet.promotionStatus, 'none', 'เกมยังไม่ครบ 40 -> ยังไม่ปลดล็อก');
  const ready = calculateQuestRating({ ...base, wins: 30, losses: 15, draws: 0 }, { type: 'ranked', outcome: 'win', opponentRating: 5200 });
  assert.strictEqual(ready.promotionStatus, 'pending');
});

test('Scoring: ความถูกต้องสำคัญกว่าความเร็ว (70/30) · ตอบผิด 0', () => {
  assert.strictEqual(pointsFor(false, 500), 0);
  assert.strictEqual(pointsFor(true, 0), 1000);
  assert.ok(pointsFor(true, 19000) >= 700, 'ตอบถูกช้ายังได้คะแนนดี');
  // ถูก 10 ข้อแบบช้า ชนะ ถูก 7 ข้อแบบเร็วที่สุด — เดาเร็วไม่ได้เปรียบ
  assert.ok(10 * pointsFor(true, 19000) > 7 * pointsFor(true, 0));
});

/* ---------- NPC engine ---------- */
function fakeQuestions(n, type = 'vocabulary', cefr = 'A1') {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, type, cefr, choices: ['able', 'apple', 'ample', 'zebra'], correctIndex: 0 }));
}
function simulate(npc, type, cefr, matchCefr = cefr, n = 4000) {
  const plan = npcEngine.planAnswers(npc, fakeQuestions(n, type, cefr), matchCefr, 12345);
  return { acc: plan.filter((p) => p.correct).length / n, plan };
}

test('NPC: ความแม่นยำจริงใกล้ค่าที่ออกแบบ (Milo ~55–60%, Nora ~62%, Pip ~55%)', () => {
  // ค่าเฉลี่ยข้ามชนิดคำถามตามสัดส่วน beginner (vocab 6 · grammar 3 · context 1)
  const mixAcc = (npc) => (simulate(npc, 'vocabulary', 'A1').acc * 6 + simulate(npc, 'grammar', 'A1').acc * 3 + simulate(npc, 'context', 'A1').acc) / 10;
  const milo = mixAcc(NPCS.BY_ID.milo); const nora = mixAcc(NPCS.BY_ID.nora); const pip = mixAcc(NPCS.BY_ID.pip);
  assert.ok(milo > 0.50 && milo < 0.64, `Milo ${milo}`);
  assert.ok(nora > 0.58 && nora < 0.70, `Nora ${nora}`);
  assert.ok(pip > 0.50 && pip < 0.62, `Pip ${pip}`);
});

test('NPC: ความเก่งแยกตามชนิดคำถาม (Kai เก่งคำศัพท์ · Luna เก่งแกรมม่า) และข้อยากกว่าตอบผิดมากขึ้น', () => {
  const kai = NPCS.BY_ID.kai; const luna = NPCS.BY_ID.luna;
  assert.ok(simulate(kai, 'vocabulary', 'A2').acc > simulate(kai, 'grammar', 'A2').acc + 0.08);
  assert.ok(simulate(luna, 'grammar', 'A2').acc > simulate(luna, 'vocabulary', 'A2').acc + 0.08);
  assert.ok(simulate(kai, 'vocabulary', 'B2', 'A2').acc < simulate(kai, 'vocabulary', 'A2', 'A2').acc - 0.15, 'ข้อระดับสูงกว่าเกม -> แม่นน้อยลง');
});

test('NPC: เวลาตอบอยู่ในช่วงของตัวเอง มี variance (ไม่เท่ากันทุกข้อ) · Pip เร็วกว่า Nora · seed เดิม = ผลเดิม', () => {
  const pipPlan = simulate(NPCS.BY_ID.pip, 'vocabulary', 'A1', 'A1', 300).plan;
  const noraPlan = simulate(NPCS.BY_ID.nora, 'vocabulary', 'A1', 'A1', 300).plan;
  const times = pipPlan.map((p) => p.responseMs);
  assert.ok(new Set(times).size > 200, 'เวลาตอบต้องหลากหลาย');
  assert.ok(Math.min(...times) >= 2500 * 0.85 && Math.max(...times) <= leagues.RULES.questionMs);
  const avg = (pl) => pl.reduce((s, p) => s + p.responseMs, 0) / pl.length;
  assert.ok(avg(pipPlan) < avg(noraPlan) - 1000);
  const q = fakeQuestions(10);
  assert.deepStrictEqual(npcEngine.planAnswers(NPCS.BY_ID.milo, q, 'A1', 777), npcEngine.planAnswers(NPCS.BY_ID.milo, q, 'A1', 777));
});

test('Balance: ผู้เล่นใหม่ (แม่น ~75%, ตอบ ~6 วิ) ชนะ NPC ใน Trail Finch ได้ประมาณ 70–90% (ไม่กำหนดผลล่วงหน้า)', () => {
  const { mulberry32 } = require('../services/ranked/rng');
  const rng = mulberry32(99);
  let wins = 0; const games = 600;
  for (let g = 0; g < games; g += 1) {
    const npc = NPCS.BY_ID[['milo', 'nora', 'pip'][g % 3]];
    const qs = [...fakeQuestions(6, 'vocabulary'), ...fakeQuestions(3, 'grammar'), ...fakeQuestions(1, 'context')];
    const plan = npcEngine.planAnswers(npc, qs, 'A1', 1000 + g);
    let me = 0; let them = 0;
    plan.forEach((p) => {
      me += pointsFor(rng() < 0.75, 4000 + rng() * 4000);
      them += pointsFor(p.correct, p.responseMs);
    });
    if (me > them) wins += 1;
  }
  const rate = wins / games;
  assert.ok(rate >= 0.65 && rate <= 0.92, `อัตราชนะ ${rate}`);
});

/* ======================= API จริง ======================= */
let server; let base;
function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + path, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser() {
  const name = `rk${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const r = await req('POST', '/api/auth/register', { body: { username: name.slice(0, 20), email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
async function correctIndexOf(matchId, i) {
  const { rows } = await pool.query('SELECT questions FROM ranked_matches WHERE id = $1', [matchId]);
  return rows[0].questions[i].correctIndex;
}
/** เล่นจนจบ: answerFn(i) คืน choiceIndex */
async function playOut(u, state, answerFn) {
  let s = state;
  while (s.status === 'active') {
    if (s.phase === 'question') {
      const a = await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token, body: { questionIndex: s.index, choiceIndex: await answerFn(s.matchId, s.index) } });
      assert.strictEqual(a.status, 200, JSON.stringify(a.body));
    }
    s = (await req('POST', `/api/ranked/matches/${s.matchId}/next`, { token: u.token })).body;
  }
  return s;
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

test('API: ผู้เล่นใหม่เริ่มที่ Trail Finch III · QR 0 · CEFR แยกจาก Rank', async () => {
  const u = await makeUser();
  const me = await req('GET', '/api/ranked/me', { token: u.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.profile.label, 'กระจิบพเนจร III');
  assert.strictEqual(me.body.profile.questRating, 0);
  assert.ok(me.body.season.theme, 'มีชื่อธีมของซีซัน (ซีซันเปลี่ยนได้ตามเวลา — ไม่ผูกกับชื่อใดชื่อหนึ่ง)');
  assert.ok(me.body.cefr.cefr, 'มี CEFR แยกต่างหาก');
  const cfg = await req('GET', '/api/ranked/config', { token: u.token });
  assert.strictEqual(cfg.body.leagues.length, 9);
});

test('API: เกม NPC -> ผลแพ้ชนะ/QR คำนวณฝั่งเซิร์ฟเวอร์ · ส่งข้อมูลกลับระบบเรียน', async () => {
  const u = await makeUser();
  const start = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', score: 99999, qr: 5000 } });
  assert.strictEqual(start.status, 200, JSON.stringify(start.body));
  assert.strictEqual(start.body.total, 10);
  assert.strictEqual(start.body.opponent.isNpc, true);
  assert.match(start.body.opponent.label, /NPC/);
  assert.strictEqual(start.body.question.correctIndex, undefined, 'ห้ามส่งเฉลยก่อนตอบ');
  assert.strictEqual(NPCS.BY_ID[start.body.opponent.id].league, 'trail-finch', 'Trail Finch เจอคู่แข่งของ League นี้');

  assert.strictEqual(start.body.hp, null, 'ระบบ HP ปิดอยู่ -> ไม่ส่ง HP');
  assert.strictEqual(start.body.mode, 'vocab', 'ค่าเริ่มต้นเป็นโหมดคำศัพท์');
  assert.ok(['vocabulary', 'context'].includes(start.body.question.type));
  const end = await playOut(u, start.body, (id, i) => correctIndexOf(id, i));   // ตอบถูกทุกข้อ
  assert.strictEqual(end.status, 'finished');
  assert.strictEqual(end.result.answered, 10, 'ไม่มี HP = เล่นครบทุกข้อ');
  assert.strictEqual(end.result.correct, 10);
  assert.ok(['win', 'draw', 'loss'].includes(end.result.outcome));
  assert.ok(['questions_complete', 'draw'].includes(end.result.resultReason));
  assert.strictEqual(end.result.hp, null);
  assert.ok(end.result.qr.after >= 0 && end.result.qr.after < 300);
  const me = await req('GET', '/api/ranked/me', { token: u.token });
  assert.strictEqual(me.body.profile.questRating, end.result.qr.after, 'QR ในโปรไฟล์ตรงกับผลเกม (ไม่ใช่ค่าที่ client ส่งมา)');
  const ev = await pool.query("SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND source = 'ranked'", [u.id]);
  assert.strictEqual(ev.rows[0].n, end.result.answered);
  const hist = await req('GET', '/api/ranked/history', { token: u.token });
  assert.strictEqual(hist.body.matches.length, 1);
});

test('Security: ส่งซ้ำ / ผิดข้อ / ตัวเลือกปลอม / เกมคนอื่น / หลังจบเกม / id ปลอม -> ถูกปฏิเสธ', async () => {
  const u = await makeUser(); const other = await makeUser();
  const s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } })).body;
  const again = await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } });
  assert.strictEqual(again.body.matchId, s.matchId, 'มีเกมค้าง -> ได้เกมเดิม ไม่เปิดเกมใหม่ทับ');

  assert.strictEqual((await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token, body: { questionIndex: 3, choiceIndex: 0 } })).status, 409);
  assert.strictEqual((await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token, body: { questionIndex: 0, choiceIndex: 9 } })).status, 400);
  assert.strictEqual((await req('POST', `/api/ranked/matches/${s.matchId}/next`, { token: u.token })).status, 409, 'ข้ามข้อโดยไม่ตอบไม่ได้');
  assert.strictEqual((await req('GET', `/api/ranked/matches/${s.matchId}`, { token: other.token })).status, 404, 'ดูเกมของคนอื่นไม่ได้');
  assert.strictEqual((await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: other.token, body: { questionIndex: 0, choiceIndex: 0 } })).status, 404);
  assert.strictEqual((await req('GET', '/api/ranked/matches/abc', { token: u.token })).status, 404);
  assert.strictEqual((await req('GET', '/api/ranked/matches/1', {})).status, 401);

  const ok = await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token, body: { questionIndex: 0, choiceIndex: 0, userId: other.id } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token, body: { questionIndex: 0, choiceIndex: 1 } })).status, 409, 'ตอบซ้ำไม่ได้');

  const fin = await req('POST', `/api/ranked/matches/${s.matchId}/forfeit`, { token: u.token });
  assert.strictEqual(fin.body.result.outcome, 'loss', 'ยอมแพ้ = แพ้');
  assert.strictEqual(fin.body.result.label, 'surrender');
  assert.strictEqual(fin.body.result.qr.delta, 0, 'QR 0 ติดลบไม่ได้ (penalty ผู้เล่นใหม่มีแค่ −3)');
  assert.strictEqual((await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token, body: { questionIndex: 1, choiceIndex: 0 } })).status, 409, 'ส่งหลังจบเกมไม่ได้');
  const otherProfile = await req('GET', '/api/ranked/me', { token: other.token });
  assert.strictEqual(otherProfile.body.profile.questRating, 0, 'ส่ง userId ของคนอื่นมาไม่มีผล');
});

test('Security: ตอบหลังหมดเวลา (ตามเวลาเซิร์ฟเวอร์) = ไม่ได้คะแนน แม้เลือกถูก', async () => {
  const u = await makeUser();
  const s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } })).body;
  await pool.query("UPDATE ranked_matches SET question_opened_at = NOW() - INTERVAL '60 seconds' WHERE id = $1", [s.matchId]);
  const r = await req('POST', `/api/ranked/matches/${s.matchId}/answer`, { token: u.token,
    body: { questionIndex: 0, choiceIndex: await correctIndexOf(s.matchId, 0) } });
  assert.strictEqual(r.body.timedOut, true);
  assert.strictEqual(r.body.points, 0);
  await req('POST', `/api/ranked/matches/${s.matchId}/forfeit`, { token: u.token });
});

test('Promotion: ยังไม่ถึงขอบ = ลง Trial ไม่ได้ · ถึงแล้วเจอ Guardian (มีป้าย) · ชนะ = Swift Hare III + คุ้มครอง 2 เกม', async () => {
  const u = await makeUser();
  await req('GET', '/api/ranked/me', { token: u.token });
  assert.strictEqual((await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'promotion' } })).status, 403);

  await pool.query(`UPDATE ranked_profiles SET quest_rating = 299, division_index = 2, promotion_status = 'pending' WHERE user_id = $1`, [u.id]);
  const s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'promotion' } })).body;
  assert.strictEqual(s.opponent.id, 'rowan');
  assert.strictEqual(s.opponent.label, 'PROMOTION GUARDIAN');
  // บังคับให้ชนะ: ตอบถูกทุกข้อเร็ว และทำให้ Guardian ตอบผิดทุกข้อ (ทดสอบการเลื่อนขั้น ไม่ใช่ความเก่ง NPC)
  await pool.query(`UPDATE ranked_matches SET npc_plan = (SELECT jsonb_agg(jsonb_set(p, '{correct}', 'false')) FROM jsonb_array_elements(npc_plan) p) WHERE id = $1`, [s.matchId]);
  const end = await playOut(u, s, (id, i) => correctIndexOf(id, i));
  assert.strictEqual(end.result.outcome, 'win');
  assert.ok(end.result.events.includes('promoted'));
  const me = (await req('GET', '/api/ranked/me', { token: u.token })).body.profile;
  assert.deepStrictEqual([me.label, me.questRating, me.protectionMatches], ['กระต่ายเหินลม III', 300, 2]);
  const hist = await pool.query("SELECT event FROM rank_history WHERE user_id = $1", [u.id]);
  assert.ok(hist.rows.some((r) => r.event === 'promoted'));
});

test('Questions: บทอ่านต้องไม่มีคำตอบของตัวเองอยู่ในเนื้อหา (กันเฉลยหลุด)', async () => {
  const { buildMatchQuestions } = require('../services/ranked/questionBank');
  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let reading = 0;
  for (const cefr of ['A2', 'B1', 'B2', 'C1']) {
    for (let seed = 1; seed <= 25; seed += 1) {
      const qs = await buildMatchQuestions({ cefr, tier: 'advanced', seed: seed * 104729, mode: 'grammar' });
      for (const q of qs.filter((x) => x.type === 'reading')) {
        reading += 1;
        const ans = String(q.choices[q.correctIndex]).trim();
        if (ans.length < 3) continue;
        const has = (c) => new RegExp(`(^|[^A-Za-z])${escRe(String(c).trim())}([^A-Za-z]|$)`, 'i').test(q.passage);
        const leak = has(ans) && !q.choices.some((c, k) => k !== q.correctIndex && String(c).trim().length > 2 && has(c));
        assert.ok(!leak, `${q.id} บทอ่านมีคำตอบ "${ans}"`);
      }
    }
  }
  assert.ok(reading > 20, 'ยังมีข้อการอ่านให้ใช้');
  // คำเดียวกันไม่ออกซ้ำในเกมเดียว (แบบคำศัพท์ + แบบบริบท)
  for (let seed = 1; seed <= 40; seed += 1) {
    const qs = await buildMatchQuestions({ cefr: 'A2', tier: 'intermediate', seed: seed * 7907 });
    const ids = qs.filter((q) => q.ref.wordId).map((q) => q.ref.wordId);
    assert.strictEqual(new Set(ids).size, ids.length, `seed ${seed} มีคำซ้ำในเกม`);
  }
});

test('Learning: คำที่ตอบผิดใน Ranked เพิ่มเข้าคิวทบทวนได้ (ถึงกำหนดทันที) และหน้า Home รู้ว่ามีคำรอทบทวน', async () => {
  const u = await makeUser();
  assert.strictEqual((await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'practice' } })).status, 400, 'ไม่มีโหมดซ้อมกับบอท');
  const s = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked' } })).body;
  // ตอบผิดทุกข้อ
  const end = await playOut(u, s, async (id, i) => ((await correctIndexOf(id, i)) + 1) % 4);
  assert.strictEqual(end.result.qr.delta, 0, 'Trail Finch แพ้ไม่เสีย QR');
  const wordsMissed = new Set(end.result.missed.filter((x) => x.ref.wordId).map((x) => x.ref.wordId)).size;
  const pending = (await req('GET', '/api/ranked/me', { token: u.token })).body.pendingReview;
  if (wordsMissed) assert.strictEqual(pending.words, wordsMissed);
  const rv = await req('POST', `/api/ranked/matches/${s.matchId}/review`, { token: u.token });
  assert.strictEqual(rv.body.wordsAdded, wordsMissed);
  const due = await pool.query('SELECT COUNT(*)::int AS n FROM word_progress WHERE user_id = $1 AND srs_due_at <= NOW()', [u.id]);
  assert.strictEqual(due.rows[0].n, wordsMissed);
  assert.strictEqual((await req('GET', '/api/ranked/me', { token: u.token })).body.pendingReview, null);
});

test('คู่แข่งหลากหลาย: League ที่มีคู่แข่งฝึก มีอย่างน้อย 10 คน หลายสไตล์ · id ไม่ซ้ำ · ความเก่งอยู่ในกรอบ League · ฟอร์มแกว่งแต่ผลซ้ำได้ด้วย seed เดิม', () => {
  const ids = NPCS.NPCS.map((n) => n.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id ไม่ซ้ำ');
  assert.strictEqual(new Set(NPCS.NPCS.map((n) => n.name)).size, NPCS.NPCS.length, 'ชื่อไม่ซ้ำ');
  const avg = (n) => Object.values(n.skills).reduce((a, b) => a + b, 0) / 4;
  for (const id of ['trail-finch', 'swift-hare', 'river-otter', 'crest-lynx', 'moon-wolf', 'shadow-panther']) {
    const pool = leagues.LEAGUE_BY_ID[id].npcs.map((x) => NPCS.BY_ID[x]);
    assert.ok(pool.length >= 10, `${id} มีคู่แข่ง ${pool.length} คน`);
    assert.ok(new Set(pool.map((n) => n.personality)).size >= 8, `${id} มีหลายสไตล์`);
    const speeds = pool.map((n) => n.responseMs[0]);
    assert.ok(Math.max(...speeds) / Math.min(...speeds) > 1.8, 'มีทั้งคนตอบเร็วและคนตอบช้า');
  }
  const tf = leagues.LEAGUE_BY_ID['trail-finch'].npcs.map((x) => avg(NPCS.BY_ID[x]));
  const sp = leagues.LEAGUE_BY_ID['shadow-panther'].npcs.map((x) => avg(NPCS.BY_ID[x]));
  assert.ok(Math.max(...tf) < Math.min(...sp), 'League ต้นไม่มีคู่แข่งที่เก่งเท่า League สูง');
  const streaky = NPCS.NPCS.find((n) => n.personality === 'Streaky');
  const q = fakeQuestions(10, 'vocabulary', 'B1');
  assert.deepStrictEqual(npcEngine.planAnswers(streaky, q, 'B1', 42), npcEngine.planAnswers(streaky, q, 'B1', 42), 'seed เดิม = ผลเดิม (ตรวจย้อนได้)');
});
