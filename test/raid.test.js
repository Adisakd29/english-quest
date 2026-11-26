/*
  v1.27.0 World Raid Boss + นำ "วาดทายศัพท์" ออก
  ทดสอบกับฐานข้อมูลจริง (eq_test) ผ่าน HTTP/WebSocket จริง:
    - บอสกลางตัวเดียว · เกิดครั้งเดียวแม้ tick พร้อมกัน · HP ลดจริงและตรงกับบันทึกดาเมจทุกแถว
    - ตอบผิด = 0 ดาเมจ · ตอบถูก = ดาเมจครั้งเดียว (ส่งซ้ำได้ผลเดิม) · หน้าเว็บส่งตัวเลขดาเมจเองไม่ได้ · ตอบเร็วเกินคน = ไม่มีดาเมจ + ติดธง
    - Phase 1→2→3 · โล่ + ทำลายโล่ (มึน + Team Bonus) · HP ถึง 0 ตายครั้งเดียวแม้โจมตีพร้อมกัน · ประกาศไม่ซ้ำ
    - สรุปผล → บอสเลเวลถัดไปเกิดครั้งเดียว · ข้อมูลบอสเก่า/ผู้เล่นไม่หาย · "รีสตาร์ต" ไม่ทำให้ย้อนระดับ
    - รางวัล: รับได้ครั้งเดียว (กดพร้อมกันหลายครั้ง) · EXP/Coin เพิ่มเท่าที่ควรและของเดิมไม่หาย · ไม่ผ่านเกณฑ์ = รับไม่ได้
    - จำกัดรอบต่อวัน · ผู้ดูแล: สิทธิ์ · ต้องมีเหตุผล · Audit Log · ปิดฉุกเฉิน (ข้อมูลอยู่ครบ)
    - WebSocket: ผู้เล่นอีกคนเห็น HP ใหม่
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const Raid = require('../services/raid');
const R = require('../config/raidBosses');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server; let base; let wsBase;
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
  const name = `${prefix}${Date.now() % 1e7}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id, name };
}
async function setSettings(patch) {
  await pool.query("UPDATE raid_settings SET data = data || $1::jsonb WHERE id = 1", [JSON.stringify(patch)]);
  Raid._resetCache();
}
async function boss() { return (await pool.query("SELECT * FROM raid_boss_instances WHERE status <> 'cancelled' ORDER BY level DESC LIMIT 1")).rows[0]; }
async function attempt(id) { return (await pool.query('SELECT * FROM raid_attempts WHERE id = $1', [id])).rows[0]; }
/** ตอบข้อปัจจุบัน: right = เลือกเฉลย / ผิด = ตัวเลือกอื่น (อ่านเฉลยจาก DB เพราะหน้าเว็บไม่ได้รับเฉลย) */
async function answer(u, attemptId, right, extra = {}) {
  let a = await attempt(attemptId);
  if (a.status === 'open' && a.shown_idx < a.current) { await req('POST', '/api/raid/round/next', { token: u.token, body: { attemptId } }); a = await attempt(attemptId); }
  const q = a.questions[a.current];
  if (q.type === 'spell') {   // Spelling Strike: ส่งตัวอักษร (ผิด = สลับตัวท้าย)
    const text = right ? q.answer : `${q.answer.slice(0, -1)}${q.answer.endsWith('z') ? 'y' : 'z'}`;
    return req('POST', '/api/raid/answer', { token: u.token, body: { attemptId, index: a.current, text, ...extra } });
  }
  const choice = right ? q.correctIndex : (q.correctIndex + 1) % q.choices.length;
  return req('POST', '/api/raid/answer', { token: u.token, body: { attemptId, index: a.current, choice, ...extra } });
}
/** ลด HP ให้ถึงค่าที่ต้องการ โดยบันทึกเป็นดาเมจจริง (ข้อมูลยังสอดคล้องกันทุกตาราง) */
async function cutHp(b0, target, userId = null) {
  const uid = userId || (await pool.query('SELECT MIN(user_id) AS u FROM raid_contributions WHERE instance_id = $1', [b0.id])).rows[0].u;
  const cut = Number(b0.hp) - target;
  await pool.query('UPDATE raid_boss_instances SET hp = $2, total_damage = total_damage + $3 WHERE id = $1', [b0.id, target, cut]);
  await pool.query('INSERT INTO raid_damage_events (instance_id, user_id, attempt_id, qidx, amount, kind, hp_after, phase) VALUES ($1, $2, gen_random_uuid(), 0, $3, $4, $5, 1)', [b0.id, uid, cut, 'normal', target]);
  await pool.query(`INSERT INTO raid_contributions (instance_id, user_id, damage) VALUES ($1, $2, $3)
                    ON CONFLICT (instance_id, user_id) DO UPDATE SET damage = raid_contributions.damage + EXCLUDED.damage`, [b0.id, uid, cut]);
}
async function consistent() {
  const b = await boss();
  const sum = (await pool.query('SELECT COALESCE(SUM(amount), 0)::bigint AS s FROM raid_damage_events WHERE instance_id = $1', [b.id])).rows[0].s;
  const csum = (await pool.query('SELECT COALESCE(SUM(damage), 0)::bigint AS s FROM raid_contributions WHERE instance_id = $1', [b.id])).rows[0].s;
  assert.strictEqual(Number(b.max_hp) - Number(b.hp), Number(sum), 'HP ที่หาย = ผลรวมบันทึกดาเมจ');
  assert.strictEqual(Number(b.total_damage), Number(sum), 'total_damage = ผลรวมบันทึกดาเมจ');
  assert.strictEqual(Number(csum), Number(sum), 'ผลรวม contribution = ผลรวมบันทึกดาเมจ');
  return b;
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  // เริ่มจากสถานะ Raid ว่าง (ฐานข้อมูลทดสอบเท่านั้น)
  await pool.query('TRUNCATE raid_boss_instances, raid_admin_audit_logs RESTART IDENTITY CASCADE');
  await pool.query("UPDATE raid_settings SET data = '{}'::jsonb WHERE id = 1");
  // ชุดทดสอบเดิมตรวจรอบ 10 ข้อแบบไม่มีพลังชีวิต · v1.27.1 พลังชีวิตทดสอบแยก (เปิดเฉพาะในเทสต์นั้น)
  await setSettings({ minAnswerMs: 0, prepareSec: 0, cooldownMin: 0, minCorrectForReward: 2, roundsPerDay: 50, questionsPerRound: 10, playerHpOn: false, questionMode: 'mixed' });   // v1.27.1 ค่าเริ่มต้นจริง = spell (ทดสอบแยกด้านล่าง)
  server = http.createServer(createApp());
  realtime.attach(server);
  realtime.registerMessageHandler(Raid._onSocket);   // ตัวจัดการ WebSocket ของ Raid (ไม่เปิด tick อัตโนมัติ — ทดสอบเรียก tick เอง)
  realtime.registerDisconnectHandler(Raid._onClose);   // v1.27.1 ออกจากหน้า Raid/ปิดแท็บ → นับคนในศึกลดลง
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  wsBase = `ws://127.0.0.1:${server.address().port}`;
});
test.after(async () => { Raid.stop(); await new Promise((r) => server.close(r)); await pool.end(); });

test('วาดทายศัพท์ถูกนำออก: ไฟล์ไม่มีแล้ว · API 410 · ข้อมูลเดิมในฐานข้อมูลยังอยู่ · ผู้ดูแลยังดูหลักฐานเก่าได้', async () => {
  for (const f of ['services/draw', 'public/js/draw.js', 'public/css/draw.css', 'data/draw']) assert.ok(!fs.existsSync(path.join(ROOT, f)), `ต้องไม่มี ${f}`);
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.ok(!/data-nav-to="draw"|screen-draw|js\/draw\.js/.test(html), 'หน้าเว็บไม่มีทางเข้าโหมดวาดทายศัพท์');
  const u = await makeUser('dg');
  for (const [m, p] of [['GET', '/api/draw'], ['POST', '/api/draw/rooms'], ['GET', '/api/draw/rooms']]) {
    const r = await req(m, p, { token: u.token, body: m === 'POST' ? {} : undefined });
    assert.strictEqual(r.status, 410); assert.strictEqual(r.body.code, 'MODE_REMOVED');
  }
  const ev = await req('GET', '/api/draw/admin/evidence/1', { token: u.token });
  assert.strictEqual(ev.status, 403, 'หลักฐานภาพวาด = ผู้ดูแลเท่านั้น');
  const t = await pool.query("SELECT to_regclass('draw_games') AS a, to_regclass('draw_game_players') AS b, to_regclass('draw_report_evidence') AS c");
  assert.ok(t.rows[0].a && t.rows[0].b && t.rows[0].c, 'ตารางข้อมูลเดิมยังอยู่');
});

test('บอสเกิดครั้งเดียวแม้ tick พร้อมกัน 6 ครั้ง · state เห็นบอสตัวเดียวกัน', async () => {
  await Promise.all(Array.from({ length: 6 }, () => Raid.tick()));
  const all = (await pool.query('SELECT level, status FROM raid_boss_instances')).rows;
  assert.strictEqual(all.length, 1); assert.strictEqual(all[0].level, 1); assert.strictEqual(all[0].status, 'active');
  const u = await makeUser(); const v = await makeUser();
  const a = await req('GET', '/api/raid/state', { token: u.token }); const b = await req('GET', '/api/raid/state', { token: v.token });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.body.boss.id, b.body.boss.id);
  assert.strictEqual(a.body.boss.family, 'forest');
  assert.strictEqual(a.body.boss.hp, a.body.boss.maxHp);
});

test('ตอบผิด 0 ดาเมจ · ตอบถูกดาเมจครั้งเดียว · ส่งซ้ำได้ผลเดิม · ส่งตัวเลขดาเมจเองไม่มีผล · ผู้เล่นอีกคนเห็น HP ใหม่', async () => {
  const u = await makeUser(); const v = await makeUser();
  const r = await req('POST', '/api/raid/round', { token: u.token });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.total, 10);
  assert.ok(!('correctIndex' in r.body.question) && !('explain' in r.body.question), 'ไม่ส่งเฉลยไปหน้าเว็บ');
  const hp0 = (await boss()).hp;
  const w = await answer(u, r.body.attemptId, false, { damage: 999999 });
  assert.strictEqual(w.status, 200); assert.strictEqual(w.body.correct, false); assert.strictEqual(w.body.damage, 0);
  assert.strictEqual((await boss()).hp, hp0, 'ตอบผิด HP ไม่ลด');
  const c = await answer(u, r.body.attemptId, true, { damage: 999999, amount: 999999 });
  assert.strictEqual(c.body.correct, true);
  assert.ok(c.body.damage > 0 && c.body.damage < 1000, `ดาเมจจากเซิร์ฟเวอร์ (${c.body.damage}) ไม่ใช่ตัวเลขที่ส่งมา`);
  const hp1 = (await boss()).hp;
  assert.strictEqual(Number(hp0) - Number(hp1), c.body.damage);
  // ส่งข้อเดิมซ้ำ (เน็ตหลุดแล้วกดใหม่) → replay ผลเดิม ไม่หักซ้ำ
  const a = await attempt(r.body.attemptId);
  const again = await req('POST', '/api/raid/answer', { token: u.token, body: { attemptId: r.body.attemptId, index: 1, choice: Math.max(0, a.questions[1].correctIndex) } });   // ข้อสะกดมี correctIndex = -1
  assert.strictEqual(again.body.replay, true); assert.strictEqual(again.body.damage, c.body.damage);
  assert.strictEqual((await boss()).hp, hp1, 'ส่งซ้ำไม่หัก HP ซ้ำ');
  // ข้ามข้อ (ส่ง index ล่วงหน้า) ไม่ได้
  const skip = await req('POST', '/api/raid/answer', { token: u.token, body: { attemptId: r.body.attemptId, index: 5, choice: 0 } });
  assert.strictEqual(skip.status, 409); assert.strictEqual(skip.body.code, 'WRONG_INDEX');
  // คนอื่นใช้รอบของเราไม่ได้
  const steal = await req('POST', '/api/raid/answer', { token: v.token, body: { attemptId: r.body.attemptId, index: 2, choice: 0 } });
  assert.strictEqual(steal.status, 404);
  const sv = await req('GET', '/api/raid/state', { token: v.token });
  assert.strictEqual(sv.body.boss.hp, Number(hp1), 'ผู้เล่นอีกคนเห็น HP ที่อัปเดต');
  await consistent();
});

test('ผู้เล่นหลายคนโจมตีพร้อมกัน: HP ตรงกับบันทึกดาเมจทุกแถว (ไม่มี race)', async () => {
  const users = await Promise.all(Array.from({ length: 6 }, () => makeUser('rc')));
  const rounds = await Promise.all(users.map((u) => req('POST', '/api/raid/round', { token: u.token })));
  for (let k = 0; k < 4; k += 1) {
    await Promise.all(users.map((u, i) => answer(u, rounds[i].body.attemptId, true)));
  }
  const b = await consistent();
  assert.ok(b.participants >= 7, `นับผู้ร่วมต่อสู้จริง (${b.participants})`);
  const resp = (await pool.query('SELECT COUNT(*)::int AS n FROM raid_question_responses WHERE attempt_id = ANY($1::uuid[])', [rounds.map((r) => r.body.attemptId)])).rows[0].n;
  assert.strictEqual(resp, 24);
});

test('ตอบเร็วเกินคนอ่านทัน = ไม่มีดาเมจ + ติดธงให้ผู้ดูแลตรวจ', async () => {
  await setSettings({ minAnswerMs: 5000 });
  const u = await makeUser('fast');
  const r = await req('POST', '/api/raid/round', { token: u.token });
  const hp0 = (await boss()).hp;
  const x = await answer(u, r.body.attemptId, true);
  assert.strictEqual(x.body.damage, 0); assert.strictEqual(x.body.flagged, 'too_fast');
  assert.strictEqual((await boss()).hp, hp0);
  const f = (await pool.query("SELECT flagged FROM raid_question_responses WHERE attempt_id = $1", [r.body.attemptId])).rows[0];
  assert.strictEqual(f.flagged, 'too_fast');
  await setSettings({ minAnswerMs: 0 });
});

test('Phase 2: โล่ปรากฏ (เป้าจากผู้เล่นจริง) · ดาเมจลดระหว่างมีโล่ · ทำลายโล่ → มึน + Team Bonus · Phase ไม่ย้อน', async () => {
  const b0 = await boss();
  await cutHp(b0, Math.floor(Number(b0.max_hp) * 0.705));
  await consistent();
  const u = await makeUser('ph');
  const r = await req('POST', '/api/raid/round', { token: u.token });
  let x = await answer(u, r.body.attemptId, true);
  let b = await boss();
  assert.strictEqual(b.phase, 2, 'เข้า Phase 2');
  assert.ok(b.shield_goal >= 10, `เป้าโล่ ${b.shield_goal}`);
  const ann = (await pool.query("SELECT COUNT(*)::int AS n FROM raid_announcements WHERE instance_id = $1 AND kind = 'phase2'", [b.id])).rows[0].n;
  assert.strictEqual(ann, 1);
  // ระหว่างมีโล่: ชนิด shield และดาเมจลดลง
  x = await answer(u, r.body.attemptId, true);
  assert.strictEqual(x.body.kind, 'shield');
  assert.ok(x.body.boss.shield.up && x.body.boss.shield.progress === 1);
  // ผู้ดูแลตั้งเป้าโล่ = 2 → คำตอบถัดไปทำลายโล่
  await pool.query('UPDATE raid_boss_instances SET shield_goal = 2 WHERE id = $1', [b.id]);
  x = await answer(u, r.body.attemptId, true);
  assert.strictEqual(x.body.kind, 'break');
  b = await boss();
  assert.ok(b.stun_until && new Date(b.stun_until) > new Date(), 'บอสมึน');
  x = await answer(u, r.body.attemptId, true);
  assert.ok(['team', 'critical'].includes(x.body.kind), `Team Bonus ระหว่างมึน (${x.body.kind})`);
  const sb = (await pool.query("SELECT COUNT(*)::int AS n FROM raid_announcements WHERE instance_id = $1 AND kind = 'shield_broken'", [b.id])).rows[0].n;
  assert.strictEqual(sb, 1);
  await consistent();
});

test('HP ถึง 0: บอสตายครั้งเดียวแม้หลายคนโจมตีพร้อมกัน · ผู้ล้มมีคนเดียว · ประกาศครั้งเดียว · โจมตีต่อไม่ได้', async () => {
  const users = await Promise.all(Array.from({ length: 5 }, () => makeUser('kl')));
  const rounds = await Promise.all(users.map((u) => req('POST', '/api/raid/round', { token: u.token })));
  const b0 = await boss();
  // ให้เหลือ HP น้อย (บันทึกเป็นดาเมจจริงเพื่อให้ตรวจความสอดคล้องได้)
  const left = 5;
  await cutHp(b0, left, users[0].id);
  await pool.query('UPDATE raid_boss_instances SET phase = 3 WHERE id = $1', [b0.id]);
  await consistent();
  const res = await Promise.all(users.map((u, i) => answer(u, rounds[i].body.attemptId, true)));
  const b = await boss();
  assert.strictEqual(Number(b.hp), 0); assert.strictEqual(b.status, 'defeated');
  const hits = res.filter((x) => x.body.damage > 0);
  assert.strictEqual(hits.length, 1, 'ผู้ล้มมีคนเดียว');
  assert.strictEqual(hits[0].body.damage, left, 'ดาเมจไม่เกิน HP ที่เหลือ');
  assert.ok(users.some((u) => u.id === b.killer_user_id));
  assert.strictEqual((await pool.query("SELECT COUNT(*)::int AS n FROM raid_announcements WHERE instance_id = $1 AND kind = 'defeated'", [b.id])).rows[0].n, 1);
  await consistent();
  // โจมตีต่อ / เริ่มรอบใหม่ ไม่ได้
  const more = await req('POST', '/api/raid/round', { token: users[1].token });
  assert.strictEqual(more.status, 409); assert.strictEqual(more.body.code, 'NOT_ACTIVE');
});

test('สรุปผล → บอสเลเวล 2 เกิดครั้งเดียว (tick พร้อมกัน) · ข้อมูลบอสเก่าอยู่ครบ · "รีสตาร์ต" ไม่ย้อนระดับ', async () => {
  const old = await boss();
  const contribBefore = (await pool.query('SELECT COUNT(*)::int AS n, SUM(damage)::bigint AS d FROM raid_contributions WHERE instance_id = $1', [old.id])).rows[0];
  await Raid.tick();   // defeated → settled
  let b = await boss();
  assert.strictEqual(b.id, old.id); assert.strictEqual(b.status, 'settled'); assert.ok(b.next_spawn_at);
  await Promise.all(Array.from({ length: 5 }, () => Raid.tick()));
  const lv = (await pool.query('SELECT level, status FROM raid_boss_instances ORDER BY level')).rows;
  assert.deepStrictEqual(lv.map((x) => x.level), [1, 2], 'เลเวล 2 เกิดครั้งเดียว');
  b = await boss();
  assert.strictEqual(b.level, 2); assert.strictEqual(Number(b.hp), Number(b.max_hp), 'บอสใหม่ HP เต็ม');
  assert.ok(b.scaling && b.scaling.history >= 1, 'HP บอสใหม่ใช้สถิติการต่อสู้จริง');
  const after = (await pool.query('SELECT COUNT(*)::int AS n, SUM(damage)::bigint AS d FROM raid_contributions WHERE instance_id = $1', [old.id])).rows[0];
  assert.deepStrictEqual(after, contribBefore, 'ข้อมูลผู้เล่นของบอสเก่าไม่ถูกล้าง');
  // จำลองรีสตาร์ต: ล้าง cache แล้ว tick ใหม่หลายครั้ง
  Raid._resetCache();
  await Raid.tick(); await Raid.tick();
  assert.strictEqual((await boss()).level, 2);
  assert.strictEqual((await pool.query('SELECT COUNT(*)::int AS n FROM raid_boss_instances')).rows[0].n, 2);
});

test('รางวัล: รับได้ครั้งเดียวแม้กดพร้อมกัน · EXP/Coin เพิ่มตามจริง · ของรางวัลถาวร · ไม่ผ่านเกณฑ์รับไม่ได้', async () => {
  const lv1 = (await pool.query('SELECT * FROM raid_boss_instances WHERE level = 1')).rows[0];
  const top = (await pool.query('SELECT user_id FROM raid_contributions WHERE instance_id = $1 AND correct >= 2 ORDER BY correct DESC LIMIT 1', [lv1.id])).rows[0];
  assert.ok(top, 'มีผู้เล่นที่ผ่านเกณฑ์');
  const tok = require('jsonwebtoken').sign({ userId: top.user_id }, process.env.JWT_SECRET);
  const me = await req('GET', '/api/auth/me', { token: tok });
  const token = me.status === 200 ? tok : null;
  assert.ok(token, 'token ของผู้เล่นใช้ได้');
  const u = { token, id: top.user_id };
  const expBefore = Number((await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp);
  const coinBefore = Number(((await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [u.id])).rows[0] || { balance: 0 }).balance);
  const list = await req('GET', '/api/raid/rewards', { token });
  const row = list.body.rewards.find((x) => x.instanceId === Number(lv1.id));
  assert.ok(row && row.claimable.includes('participation') && row.claimable.includes('defeat'));
  const tiers = row.tiers.filter((t) => row.claimable.includes(t.tier));
  const wantExp = tiers.reduce((a, t) => a + t.exp, 0); const wantCoin = tiers.reduce((a, t) => a + t.coin, 0);
  const res = await Promise.all(Array.from({ length: 4 }, () => req('POST', '/api/raid/rewards/claim', { token, body: { instanceId: lv1.id } })));
  const ok = res.filter((x) => x.status === 200 && x.body.granted.length);
  assert.strictEqual(ok.length, 1, 'กดพร้อมกัน 4 ครั้ง ได้รางวัลครั้งเดียว');
  const expAfter = Number((await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp);
  const coinAfter = Number((await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [u.id])).rows[0].balance);
  assert.strictEqual(expAfter - expBefore, wantExp, 'EXP เพิ่มตามรางวัลพอดี (ของเดิมไม่หาย)');
  assert.ok(coinAfter - coinBefore >= wantCoin && coinAfter - coinBefore <= wantCoin + 150, 'Coin เพิ่มตามรางวัล (+Coin ต้อนรับถ้าเพิ่งสร้างกระเป๋า)');
  const items = (await pool.query('SELECT reward_id FROM raid_user_rewards WHERE user_id = $1', [u.id])).rows.map((r) => r.reward_id);
  assert.ok(items.includes('raid-badge:forest-raider') && items.includes('trophy:forest'), `ของรางวัลถาวร ${items}`);
  const again = await req('POST', '/api/raid/rewards/claim', { token, body: { instanceId: lv1.id } });
  assert.strictEqual(again.body.granted.length, 0);
  // ไม่ผ่านเกณฑ์ / ไม่ได้ร่วม
  const n = await makeUser('nq');
  const nr = await req('POST', '/api/raid/rewards/claim', { token: n.token, body: { instanceId: lv1.id } });
  assert.strictEqual(nr.status, 403);
  // ใส่ฉายาที่ไม่มี = ไม่ได้
  const t = await req('PUT', '/api/raid/title', { token, body: { rewardId: 'raid-title:ice-dragon-slayer' } });
  assert.strictEqual(t.status, 403);
});

test('จำกัดรอบต่อวัน (กันฟาร์ม) · รอบที่ค้างกลับมาทำต่อได้หลังรีเฟรช', async () => {
  await setSettings({ roundsPerDay: 1 });
  const u = await makeUser('lim');
  const r1 = await req('POST', '/api/raid/round', { token: u.token });
  assert.strictEqual(r1.status, 200);
  await answer(u, r1.body.attemptId, true);
  const st = await req('GET', '/api/raid/state', { token: u.token });
  assert.ok(st.body.open && st.body.open.attemptId === r1.body.attemptId && st.body.open.index === 1, 'กลับมาทำต่อจากข้อเดิม');
  const r2 = await req('POST', '/api/raid/round', { token: u.token });
  assert.strictEqual(r2.status, 429); assert.strictEqual(r2.body.code, 'DAILY_LIMIT');
  await setSettings({ roundsPerDay: 50 });
});

test('ผู้ดูแล: ผู้ใช้ทั่วไปเข้าไม่ได้ · ต้องมีเหตุผล · ค่าผิดถูกปฏิเสธ · Audit Log · ปิดฉุกเฉินแล้วข้อมูลอยู่ครบ', async () => {
  const u = await makeUser('na');
  assert.strictEqual((await req('GET', '/api/admin/raid', { token: u.token })).status, 403);
  const a = await makeUser('ad');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [a.id]);
  const g = await req('GET', '/api/admin/raid', { token: a.token });
  assert.strictEqual(g.status, 200); assert.ok(g.body.metrics && g.body.boss);
  assert.strictEqual((await req('PUT', '/api/admin/raid/settings', { token: a.token, body: { patch: { hpCap: 5 } } })).status, 400, 'ไม่มีเหตุผล');
  assert.strictEqual((await req('PUT', '/api/admin/raid/settings', { token: a.token, body: { patch: { hpCap: 5 }, reason: 'test' } })).status, 400, 'ค่านอกช่วง');
  assert.strictEqual((await req('PUT', '/api/admin/raid/settings', { token: a.token, body: { patch: { evil: 1 }, reason: 'test' } })).status, 400, 'คีย์แปลก');
  const b0 = await boss();
  const s = await req('POST', '/api/admin/raid/boss', { token: a.token, body: { action: 'set_hp', value: Number(b0.hp) - 10, reason: 'ปรับสมดุลทดสอบ' } });
  assert.strictEqual(s.status, 200);
  const log = (await pool.query("SELECT * FROM raid_admin_audit_logs WHERE action = 'set_hp' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.ok(log && log.admin_id === a.id && log.before.hp === Number(b0.hp) && log.after.hp === Number(b0.hp) - 10 && log.reason);
  // ปิดฉุกเฉิน
  const off = await req('PUT', '/api/admin/raid/settings', { token: a.token, body: { patch: { enabled: false }, reason: 'ปิดฉุกเฉินทดสอบ' } });
  assert.strictEqual(off.status, 200);
  assert.strictEqual((await boss()).status, 'paused');
  const r = await req('POST', '/api/raid/round', { token: u.token });
  assert.strictEqual(r.status, 503);
  const on = await req('PUT', '/api/admin/raid/settings', { token: a.token, body: { patch: { enabled: true }, reason: 'เปิดกลับ' } });
  assert.strictEqual(on.status, 200);
  const b1 = await boss();
  assert.strictEqual(b1.status, 'active'); assert.strictEqual(Number(b1.hp), Number(b0.hp) - 10, 'ข้อมูลบอสอยู่ครบหลังปิด/เปิด');
});

test('WebSocket: ผู้เล่นที่เปิดหน้า Raid ได้รับ raid:state เมื่อคนอื่นสร้างดาเมจ', async () => {
  const u = await makeUser('ws'); const v = await makeUser('ws');
  const t = await req('POST', '/api/realtime/ticket', { token: u.token });
  const ws = new WebSocket(`${wsBase}/ws?ticket=${t.body.ticket}`);
  const got = [];
  ws.on('message', (m) => { try { const d = JSON.parse(m); if (d.type === 'raid:state') got.push(d); } catch (_) { /* - */ } });
  await new Promise((r) => ws.on('open', r));
  await sleep(200);
  ws.send(JSON.stringify({ type: 'raid:sub' }));
  await sleep(500);
  const r = await req('POST', '/api/raid/round', { token: v.token });
  const x = await answer(v, r.body.attemptId, true);
  assert.ok(x.body.damage > 0);
  await sleep(900);
  const last = got[got.length - 1];
  assert.ok(last && last.state && last.state.hp === x.body.boss.hp, `ได้ HP ใหม่ทาง WebSocket (${last && last.state && last.state.hp} vs ${x.body.boss.hp})`);
  assert.ok(got.some((g) => (g.hits || []).some((h) => h.u === v.id && h.d === x.body.damage)), 'ได้ฟีดดาเมจ');
  ws.close();
});

test('ดาเมจตามระดับ: ผู้เริ่มต้นยังช่วยได้จริง · Critical มีกติกาตายตัว · Combo มีเพดาน', () => {
  const s = { answerLimitMs: 30000 };
  const inst = { phase: 1, shield_goal: 0, shield_progress: 0, defense: 0, stun_until: null };
  const a1 = Raid.computeDamage({ cefr: 'A1', qtype: 'vocab', combo: 0, answerMs: 20000, s, inst, nowMs: Date.now() });
  const c1 = Raid.computeDamage({ cefr: 'C1', qtype: 'vocab', combo: 0, answerMs: 20000, s, inst, nowMs: Date.now() });
  assert.ok(a1.dmg / c1.dmg >= 0.7 && a1.dmg < c1.dmg, 'A1 ได้ ≥ 70% ของ C1 แต่น้อยกว่า');
  const fast = Raid.computeDamage({ cefr: 'B1', qtype: 'vocab', combo: 2, answerMs: 5000, s, inst, nowMs: Date.now() });
  const fastNoCombo = Raid.computeDamage({ cefr: 'B1', qtype: 'vocab', combo: 0, answerMs: 5000, s, inst, nowMs: Date.now() });
  assert.strictEqual(fast.crit, true); assert.strictEqual(fastNoCombo.crit, false);
  const c5 = Raid.computeDamage({ cefr: 'B1', qtype: 'vocab', combo: 5, answerMs: 20000, s, inst, nowMs: Date.now() });
  const c50 = Raid.computeDamage({ cefr: 'B1', qtype: 'vocab', combo: 50, answerMs: 20000, s, inst, nowMs: Date.now() });
  assert.strictEqual(c5.dmg, c50.dmg, 'Combo ไม่เกินเพดาน');
  // v1.27.1 แต่ละเลเวลเป็นบอสคนละตัว (วนตระกูลที่มีโมเดลพร้อม)
  // v1.27.1 ครบ 10 ตัว: Lv1–10 ไม่ซ้ำกันเลย · Lv11+ = ร่างวิวัฒน์ (บอกตรง ๆ)
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => R.familyForLevel(l).key);
  assert.deepStrictEqual(ten, ['forest', 'inferno', 'frost', 'shadow', 'celestial', 'titan', 'leviathan', 'phoenix', 'void', 'mythic']);
  assert.strictEqual(new Set(ten).size, 10, 'Lv1–10 ไม่ซ้ำกันเลย');
  for (const k of ten) assert.ok(R.BY_KEY[k].ready && R.BY_KEY[k].model === k, `${k} มีโมเดลของตัวเอง`);
  assert.deepStrictEqual([11, 17, 22].map((l) => R.familyForLevel(l).key), ['forest', 'leviathan', 'inferno']);
  assert.deepStrictEqual([1, 10, 11, 20, 21].map((l) => R.evolutionOf(l).stage), [1, 1, 2, 2, 3]);
  const fs = require('fs'); const path = require('path');
  const assets = require('../data/raid/assets.json');
  for (const k of ten) {
    const f = R.BY_KEY[k];
    assert.ok(assets[`boss-${k}`] && fs.existsSync(path.join(__dirname, '..', 'public', assets[`boss-${k}`].url)), `ไฟล์โมเดล boss-${k} มีจริง`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'img', 'raid', `${k}.webp`)), `ภาพสำรอง ${k}.webp มีจริง`);
    assert.ok(Object.keys(assets).some((a) => a.startsWith('arena-') && fs.existsSync(path.join(__dirname, '..', 'public', assets[a].url))), 'ไฟล์ฉากมีจริง');
    assert.ok(f.arena, `${k} มีฉาก`);
  }
});

test('Spelling Strike: คำแปลไทย → สะกด · ไม่ส่งคำตอบไปหน้าเว็บ · ตรวจที่เซิร์ฟเวอร์ · ตัวพิมพ์ใหญ่/อักขระแปลกไม่มีผล · ผิด = 0 ดาเมจ', async () => {
  const Q = require('../services/raid/questions');
  const r = await Q.buildRound({ cefr: 'A2', phase: 3, seed: 5 });
  const sp = r.filter((q) => q.type === 'spell');
  assert.ok(sp.length >= 1, 'มีข้อสะกดในรอบ');
  for (const q of sp) {
    assert.ok(/^[a-z]{3,10}$/.test(q.answer) && q.length === q.answer.length && q.hint === q.answer[0]);
    const pub = Q.publicQuestion(q, 0);
    assert.ok(!('answer' in pub) && !JSON.stringify(pub).includes(`"${q.answer}"`), 'ไม่ส่งคำตอบไปหน้าเว็บ');
  }
  // เล่นจริงผ่าน API จนเจอข้อสะกด
  let found = 0;
  for (let k = 0; k < 6 && found < 2; k += 1) {
    const u = await makeUser('sp');
    const rr = await req('POST', '/api/raid/round', { token: u.token });
    for (let i = 0; i < rr.body.total && found < 2; i += 1) {
      const a = await attempt(rr.body.attemptId);
      const q = a.questions[a.current];
      if (q.type !== 'spell') { await answer(u, rr.body.attemptId, true); continue; }
      assert.strictEqual(q.length, q.answer.length);
      if (found === 0) {
        if (a.shown_idx < a.current) await req('POST', '/api/raid/round/next', { token: u.token, body: { attemptId: rr.body.attemptId } });
        const x = await req('POST', '/api/raid/answer', { token: u.token, body: { attemptId: rr.body.attemptId, index: a.current, text: ` ${q.answer.toUpperCase()}!! ` } });
        assert.strictEqual(x.body.correct, true, 'ตัวพิมพ์ใหญ่/ช่องว่าง/อักขระอื่นถูกตัดก่อนตรวจ');
        assert.ok(x.body.damage > 0); assert.strictEqual(x.body.answerText, q.answer);
      } else {
        const x = await answer(u, rr.body.attemptId, false);
        assert.strictEqual(x.body.correct, false); assert.strictEqual(x.body.damage, 0);
        const row = (await pool.query('SELECT answer_text, choice FROM raid_question_responses WHERE attempt_id = $1 AND qidx = $2', [rr.body.attemptId, a.current])).rows[0];
        assert.ok(row.answer_text && row.answer_text !== q.answer && row.choice === null, 'บันทึกสิ่งที่สะกด');
      }
      found += 1;
    }
  }
  assert.strictEqual(found, 2, 'เจอข้อสะกดในรอบจริง');
});

test('รางวัลทุกชิ้นของบอสที่พร้อมใช้มีอยู่จริง: กรอบอยู่ในแคตตาล็อก + มีลายใน frames.svg · โมเดล/ฉาก/ภาพสำรองมีไฟล์จริง', () => {
  const COS = require('../config/cosmetics');
  const assets = require('../data/raid/assets.json');
  const svg = fs.readFileSync(path.join(ROOT, 'public/assets/frames/frames.svg'), 'utf8');
  const Raid = require('../services/raid');
  for (const f of R.FAMILIES.filter((x) => x.ready)) {
    const items = [...(f.rewards.defeat || []), ...Object.values(f.skins || {}).flatMap((k) => (k.rewards && k.rewards.defeat) || [])];
    for (const it of items) {
      if (it.kind === 'pframe') {
        assert.ok(COS.BY_ID[it.id] && COS.BY_ID[it.id].source === 'event', `${it.id} อยู่ในแคตตาล็อก (ได้จากกิจกรรมเท่านั้น)`);
        assert.ok(svg.includes(`id="${it.id}"`), `${it.id} มีลายใน frames.svg`);
      } else assert.ok(/^raid-(badge|title):/.test(it.id), `${it.id} รูปแบบ id ถูกต้อง`);
    }
    for (const skin of [null, ...Object.keys(f.skins || {})]) {
      const d = Raid.publicState({ id: 1, level: f.from, family: f.key, skin, status: 'settled', hp: 0, max_hp: 1, phase: 3, defense: 0, shield_goal: 0, shield_progress: 0, total_damage: 1, participants: 1, version: 1 }, R.DEFAULT_SETTINGS);
      for (const u of [d.assets.boss, d.assets.arena, d.assets.art]) {
        assert.ok(u && fs.existsSync(path.join(ROOT, 'public', u)), `${f.key}${skin ? `/${skin}` : ''}: มีไฟล์ ${u}`);
      }
      const boss = Object.values(assets).find((a) => a.url === d.assets.boss);
      assert.deepStrictEqual([...boss.clips].sort(), ['attack', 'death', 'enrage', 'hit', 'idle', 'phase', 'prepare', 'spawn', 'special', 'stun'], `${f.key}: Animation ครบ 10 สถานะ`);
    }
  }
});

test('ข้อถัดไปเปิดเมื่อผู้เล่นกดจริง: ตอบข้อที่ยังไม่เปิดไม่ได้ · เวลาเริ่มตอนเปิด · ขอซ้ำไม่รีเซ็ตเวลา · คำตอบไม่ส่งข้อถัดไปล่วงหน้า', async () => {
  const u = await makeUser('nx');
  const r = await req('POST', '/api/raid/round', { token: u.token });
  const x = await answer(u, r.body.attemptId, true);
  assert.strictEqual(x.body.next, null, 'คำตอบไม่แนบข้อถัดไป (กันอ่านโจทย์ล่วงหน้าก่อนเริ่มจับเวลา)');
  assert.strictEqual(x.body.hasNext, true);
  let a = await attempt(r.body.attemptId);
  const q = a.questions[1];
  const early = await req('POST', '/api/raid/answer', { token: u.token, body: { attemptId: r.body.attemptId, index: 1, choice: q.type === 'spell' ? undefined : q.correctIndex, text: q.type === 'spell' ? q.answer : undefined } });
  assert.strictEqual(early.status, 409); assert.strictEqual(early.body.code, 'NOT_SHOWN');
  await sleep(300);
  const n1 = await req('POST', '/api/raid/round/next', { token: u.token, body: { attemptId: r.body.attemptId } });
  assert.strictEqual(n1.status, 200); assert.strictEqual(n1.body.index, 1);
  assert.ok(!('correctIndex' in n1.body.question) && !('answer' in n1.body.question));
  a = await attempt(r.body.attemptId);
  const t1 = new Date(a.q_at).getTime();
  await sleep(400);
  await req('POST', '/api/raid/round/next', { token: u.token, body: { attemptId: r.body.attemptId } });
  const st = await req('GET', '/api/raid/state', { token: u.token });   // รีเฟรชหน้า
  assert.strictEqual(st.body.open.index, 1);
  a = await attempt(r.body.attemptId);
  assert.strictEqual(new Date(a.q_at).getTime(), t1, 'ขอซ้ำ/รีเฟรช ไม่รีเซ็ตเวลา');
});

test('v1.27.1 Listening: ใช้คลิป TOEIC Part 2 ต้นฉบับที่มีไฟล์จริง · ส่งเฉพาะช่วงคำถาม · ไม่ส่ง transcript/เฉลยไปหน้าเว็บ · Phase 1 ไม่มีข้อฟัง', async () => {
  const Q = require('../services/raid/questions');
  const bank = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'toeic', 'part2', 'bank.json'), 'utf8')).questions;
  const byId = new Map(bank.map((b) => [b.id, b]));
  for (const cefr of ['A1', 'B1', 'C1']) {
    for (const phase of [2, 3]) {
      const r = await Q.buildRound({ cefr, phase, seed: 11 + phase });
      assert.strictEqual(r.length, 10);
      const ls = r.filter((q) => q.type === 'listening');
      assert.strictEqual(ls.length, 1, `${cefr} phase ${phase} มีข้อฟัง 1 ข้อ`);
      for (const q of ls) {
        const src = byId.get(q.ref.toeicP2); assert.ok(src, 'มาจากคลัง Part 2 จริง');
        const v = src.variants.find((x) => x.v === q.ref.v);
        assert.deepStrictEqual(q.choices, v.order.map((k) => src.responses[k].text), 'ตัวเลือกตรงกับลำดับของคลิป');
        assert.strictEqual(q.choices[q.correctIndex], src.responses.find((x) => x.isCorrect).text, 'เฉลยตรงกับคลัง');
        const clip = require('../data/raid/listen.json').clips[`${src.id}:${v.v}`];
        const segs = Object.fromEntries(v.audio.segments.map((g) => [g.letter, g]));
        assert.deepStrictEqual(q.audio, { url: clip.url, start: 0, end: clip.duration }, 'ใช้ไฟล์เฉพาะช่วงคำถาม');
        assert.ok(clip.duration >= segs.Q.end - segs.Q.start && segs.Q.start - 0.05 + clip.duration <= segs.A.start - 0.3 + 1e-6, 'ไฟล์ครอบคำถามครบ และจบก่อนคำตอบ A');
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', q.audio.url)), 'ไฟล์เสียงมีจริง');
        assert.ok(cefr !== 'A1' || src.difficulty === 'easy', 'A1 ได้ข้อฟังระดับง่าย');
        assert.ok(q.explain.includes(src.prompt), 'หลังตอบแสดงประโยคที่ได้ยิน');
        const pub = Q.publicQuestion(q, 0);
        const s = JSON.stringify(pub);
        assert.ok(!('correctIndex' in pub) && !('transcript' in pub) && !('explain' in pub) && !s.includes(src.prompt), 'ไม่ส่งเฉลย/ประโยคที่ได้ยินไปหน้าเว็บ');
      }
    }
  }
  const p1 = await Q.buildRound({ cefr: 'B1', phase: 1, seed: 3 });
  assert.strictEqual(p1.filter((q) => q.type === 'listening').length, 0, 'Phase 1 สอนกลไก ยังไม่มีข้อฟัง');
  assert.strictEqual(R.TYPE_MULT.listening, 1.2);
});

test('v1.27.1 พลังชีวิตผู้เล่น: ตอบผิด/หมดเวลา = บอสตีตาม Phase · ฟื้นพลังเมื่อถูกติดกัน · หมด = จบรอบ · คิดที่เซิร์ฟเวอร์ · ไม่เสีย Coin/EXP', async () => {
  await setSettings({ playerHpOn: true, playerHp: 100, bossHit1: 20, bossHit2: 25, bossHit3: 30, healEvery: 5, healAmount: 10, questionsPerRound: 40, levelHitStep: 0 });   // แรงตีตามเลเวลทดสอบแยก
  try {
    const b0 = await boss(); const td0 = Number(b0.total_damage); const hpb0 = Number(b0.hp);
    await pool.query('UPDATE raid_boss_instances SET phase = 1, shield_goal = 0, shield_progress = 0 WHERE id = $1', [b0.id]);
    const u = await makeUser('php');
    const u0 = (await pool.query('SELECT u.exp, COALESCE(w.balance, 0) AS coins FROM users u LEFT JOIN coin_wallets w ON w.user_id = u.id WHERE u.id = $1', [u.id])).rows[0];
    const r = await req('POST', '/api/raid/round', { token: u.token });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.total, 40, 'รอบยาวสูงสุด 40 ข้อ');
    assert.deepStrictEqual(r.body.player, { hp: 100, maxHp: 100 });
    const id = r.body.attemptId;
    const hpBoss = Number((await boss()).hp);
    // ตอบผิด → บอสตี −20 (Phase 1) · ส่งค่าพลังชีวิตเองไม่มีผล · HP บอสไม่ลด
    const w = await answer(u, id, false, { playerHp: 999, hp: 999 });
    assert.strictEqual(w.body.correct, false);
    assert.deepStrictEqual(w.body.player, { hp: 80, maxHp: 100, hit: 20, heal: 0, ko: false });
    assert.strictEqual(Number((await boss()).hp), hpBoss);
    assert.strictEqual((await attempt(id)).player_hp, 80, 'บันทึกพลังชีวิตที่เซิร์ฟเวอร์');
    // ส่งซ้ำข้อเดิม → ผลเดิม ไม่โดนตีซ้ำ
    const a0 = await attempt(id);
    const rep = await req('POST', '/api/raid/answer', { token: u.token, body: { attemptId: id, index: 0, choice: 0 } });
    assert.strictEqual(rep.body.replay, true); assert.strictEqual(rep.body.player.hp, 80); assert.strictEqual(rep.body.player.hit, 20);
    assert.strictEqual((await attempt(id)).player_hp, a0.player_hp);
    // ตอบถูก 5 ข้อติดกัน → ฟื้น +10 ที่ข้อที่ 5 เท่านั้น
    const heals = [];
    for (let i = 0; i < 5; i += 1) { const c = await answer(u, id, true); assert.strictEqual(c.body.correct, true, JSON.stringify(c.body)); heals.push(c.body.player.heal); }
    assert.deepStrictEqual(heals, [0, 0, 0, 0, 10]);
    assert.strictEqual((await attempt(id)).player_hp, 90);
    // Phase 2 → ตีแรงขึ้น −25
    await pool.query('UPDATE raid_boss_instances SET phase = 2, shield_goal = 0, shield_progress = 0 WHERE id = $1', [b0.id]);
    const w2 = await answer(u, id, false);
    assert.strictEqual(w2.body.player.hit, 25); assert.strictEqual(w2.body.player.hp, 65);
    // หมดเวลา (ส่งว่าง) = โดนตีเหมือนตอบผิด
    let a = await attempt(id);
    if (a.shown_idx < a.current) await req('POST', '/api/raid/round/next', { token: u.token, body: { attemptId: id } });
    a = await attempt(id);
    const to = await req('POST', '/api/raid/answer', { token: u.token, body: a.questions[a.current].type === 'spell' ? { attemptId: id, index: a.current, text: '' } : { attemptId: id, index: a.current, choice: null } });
    assert.strictEqual(to.body.timedOut, true); assert.strictEqual(to.body.player.hit, 25); assert.strictEqual(to.body.player.hp, 40);
    // ตีจนหมด: 40 → 15 → 0 (ไม่ติดลบ) → จบรอบ
    const k1 = await answer(u, id, false); assert.strictEqual(k1.body.player.hp, 15); assert.strictEqual(k1.body.finished, false);
    const k2 = await answer(u, id, false);
    assert.deepStrictEqual(k2.body.player, { hp: 0, maxHp: 100, hit: 15, heal: 0, ko: true });
    assert.strictEqual(k2.body.finished, true); assert.strictEqual(k2.body.knockedOut, true); assert.strictEqual(k2.body.hasNext, false);
    const af = await attempt(id);
    assert.strictEqual(af.status, 'finished'); assert.strictEqual(af.knocked_out, true); assert.strictEqual(af.player_hp, 0);
    const more = await req('POST', '/api/raid/answer', { token: u.token, body: { attemptId: id, index: af.current, choice: 0 } });
    assert.strictEqual(more.status, 409, 'หมดแรงแล้วตอบต่อไม่ได้');
    const sum = await req('GET', `/api/raid/round/${id}/summary`, { token: u.token });
    assert.deepStrictEqual(sum.body.player, { hp: 0, maxHp: 100, ko: true });
    assert.strictEqual(sum.body.damage, Number(af.damage), 'ดาเมจที่ทำไปนับครบ');
    assert.ok(sum.body.damage > 0);
    const u1 = (await pool.query('SELECT u.exp, COALESCE(w.balance, 0) AS coins FROM users u LEFT JOIN coin_wallets w ON w.user_id = u.id WHERE u.id = $1', [u.id])).rows[0];
    const hitExp = Number((await pool.query("SELECT COALESCE(SUM(amount), 0) AS n FROM exp_log WHERE user_id = $1 AND reason = 'raid_hit'", [u.id])).rows[0].n);
    assert.strictEqual(String(u1.coins), String(u0.coins), 'หมดแรงไม่เสีย Coin');
    assert.strictEqual(Number(u1.exp), Number(u0.exp) + hitExp, 'หมดแรงไม่เสีย EXP (เพิ่มเฉพาะ EXP จากการตีโดน v1.27.1)');
    // เริ่มรอบใหม่ได้ทันที (พลังเต็ม)
    const r2 = await req('POST', '/api/raid/round', { token: u.token });
    assert.strictEqual(r2.status, 200); assert.strictEqual(r2.body.player.hp, 100);
    // บอสไม่อยู่ในสถานะต่อสู้ → ไม่ตี
    await pool.query("UPDATE raid_boss_instances SET status = 'paused' WHERE id = $1", [b0.id]);
    const wp = await answer(u, r2.body.attemptId, false);
    assert.strictEqual(wp.body.player.hit, 0, 'บอสพักอยู่ ไม่ตีผู้เล่น');
    await pool.query("UPDATE raid_boss_instances SET status = 'active' WHERE id = $1", [b0.id]);
    // ปิดระบบพลังชีวิต → รอบใหม่ไม่มีพลังชีวิต ตอบผิดไม่จบรอบ
    await setSettings({ playerHpOn: false });
    const r3 = await req('POST', '/api/raid/round', { token: u.token });
    assert.strictEqual(r3.body.player, null);
    for (let i = 0; i < 6; i += 1) { const x = await answer(u, r3.body.attemptId, false); assert.strictEqual(x.body.player, null); assert.strictEqual(x.body.finished, false); }
    // ดาเมจระหว่างเทสต์นี้: HP บอสที่ลด = total_damage ที่เพิ่ม = ผลรวมบันทึกดาเมจของรอบเหล่านี้ (เทสต์ผู้ดูแลก่อนหน้าปรับ HP โดยตรง มี Audit Log แยก)
    const b1 = await boss(); const ids = [id, r2.body.attemptId, r3.body.attemptId];
    const ev = Number((await pool.query('SELECT COALESCE(SUM(amount), 0) AS s FROM raid_damage_events WHERE attempt_id = ANY($1::uuid[])', [ids])).rows[0].s);
    assert.strictEqual(hpb0 - Number(b1.hp), ev); assert.strictEqual(Number(b1.total_damage) - td0, ev);
  } finally {
    await setSettings({ playerHpOn: false, questionsPerRound: 10 });
    const b = await boss(); await pool.query('UPDATE raid_boss_instances SET phase = 1 WHERE id = $1', [b.id]);
  }
});

test('v1.27.1 HP สดถึงทุกคนที่ออนไลน์ (raid:hp · ไม่ต้องเปิดหน้า Raid) · ชวนเพื่อนในแชทโลก: การ์ดบอส ข้อความคงที่ ไม่มีข้อมูลส่วนตัว · จำกัดความถี่ · ปิดแชท = ส่งไม่ได้', async () => {
  const b0 = await boss();
  if (b0.status !== 'active') await pool.query("UPDATE raid_boss_instances SET status = 'active' WHERE id = $1", [b0.id]);
  const u = await makeUser('inv'); const v = await makeUser('inv'); const w = await makeUser('inv');
  // w ออนไลน์อยู่หน้าอื่น (ไม่ได้ raid:sub)
  const t = await req('POST', '/api/realtime/ticket', { token: w.token });
  const ws = new WebSocket(`${wsBase}/ws?ticket=${t.body.ticket}`);
  const got = [];
  ws.on('message', (m) => { try { const d = JSON.parse(m); if (d.type === 'raid:hp') got.push(d); } catch (_) { /* - */ } });
  await new Promise((r) => ws.on('open', r));
  await sleep(300);
  const r = await req('POST', '/api/raid/round', { token: v.token });
  const x = await answer(v, r.body.attemptId, true);
  assert.ok(x.body.damage > 0);
  await sleep(2600);
  const last = got[got.length - 1];
  assert.ok(last && last.boss && last.boss.hp === x.body.boss.hp, `ได้ HP ใหม่ทาง raid:hp (${last && last.boss && last.boss.hp} vs ${x.body.boss.hp})`);
  assert.deepStrictEqual(Object.keys(last.boss).sort(), ['hp', 'id', 'level', 'maxHp', 'online', 'participants', 'phase', 'status'], 'ข้อมูลบอสสาธารณะเท่านั้น (ไม่มีข้อมูลผู้เล่น)');
  // ตอบถี่ ๆ → ส่งรวมไม่เกินทุก 2 วินาที
  const n0 = got.length;
  for (let i = 0; i < 4; i += 1) await answer(v, r.body.attemptId, true);
  await sleep(300);
  assert.ok(got.length - n0 <= 1, `raid:hp ถูกรวมชุด (${got.length - n0} ครั้งใน ~0.5 วินาที)`);
  ws.close();
  // ชวนเพื่อน: ข้อความจากเซิร์ฟเวอร์ (ไม่รับข้อความจากหน้าเว็บ)
  const iv = await req('POST', '/api/raid/invite', { token: u.token, body: { text: 'ข้อความปลอม 0812345678', ref: 'R999' } });
  assert.strictEqual(iv.status, 200, JSON.stringify(iv.body));
  const h = await req('GET', '/api/world-chat', { token: v.token });
  const m = h.body.messages.find((x2) => x2.id === iv.body.messageId);
  assert.ok(m, 'คำชวนขึ้นในแชทโลก');
  const fam = R.BY_KEY[(await boss()).family];
  assert.deepStrictEqual(m.invite, { kind: 'raid', code: `R${String(b0.id).padStart(3, '0')}` });
  assert.ok(m.body.includes(fam.nameEn) && !m.body.includes('ปลอม') && !m.body.includes('0812345678'), m.body);
  assert.ok(!JSON.stringify(m).includes('@'), 'ไม่มีอีเมลในข้อความแชท');
  assert.deepStrictEqual(Object.keys(m.user).sort(), ['avatar', 'avatarImage', 'id', 'level', 'username']);
  // ความถี่
  const again = await req('POST', '/api/raid/invite', { token: u.token });
  assert.strictEqual(again.status, 429); assert.strictEqual(again.body.code, 'INVITE_WAIT');
  // ปิดแชทโลก = ส่งคำชวนไม่ได้
  const so = await req('PUT', '/api/world-chat/settings', { token: w.token, body: { enabled: false } });
  assert.strictEqual(so.status, 200);
  const off = await req('POST', '/api/raid/invite', { token: w.token });
  assert.strictEqual(off.status, 403, JSON.stringify(off.body));
  // บอสไม่อยู่ในสถานะต่อสู้ = ชวนไม่ได้
  await pool.query("UPDATE raid_boss_instances SET status = 'paused' WHERE id = $1", [b0.id]);
  const paused = await req('POST', '/api/raid/invite', { token: v.token });
  assert.strictEqual(paused.status, 409);
  await pool.query("UPDATE raid_boss_instances SET status = 'active' WHERE id = $1", [b0.id]);
});

test('v1.27.1 จำนวนคน "อยู่ในศึก" = คนที่เปิดหน้า Raid ตอนนี้ (WebSocket + Polling) · ออกแล้วลดลง · นับคนไม่ซ้ำ · ไม่นับคนที่ดูแค่หน้าแรก', async () => {
  const base0 = Raid.presentCount();
  const u = await makeUser('pr'); const v = await makeUser('pr');
  const open = async (usr) => {
    const t = await req('POST', '/api/realtime/ticket', { token: usr.token });
    const ws = new WebSocket(`${wsBase}/ws?ticket=${t.body.ticket}`);
    const got = []; ws.on('message', (m) => { try { const d = JSON.parse(m); if (d.type === 'raid:state') got.push(d); } catch (_) { /* - */ } });
    await new Promise((r) => ws.on('open', r)); await sleep(150);
    return { ws, got };
  };
  const a1 = await open(u); const a2 = await open(u);   // คนเดียวกัน 2 แท็บ
  a1.ws.send(JSON.stringify({ type: 'raid:sub' })); a2.ws.send(JSON.stringify({ type: 'raid:sub' }));
  await sleep(300);
  assert.strictEqual(Raid.presentCount(), base0 + 1, 'คนเดียว 2 แท็บ = 1 คน');
  // หน้าแรก (poll ปกติ) ไม่นับ · หน้า Raid ที่ใช้ Polling นับ
  await req('GET', '/api/raid/poll', { token: v.token });
  assert.strictEqual(Raid.presentCount(), base0 + 1, 'ดูการ์ดหน้าแรกไม่นับว่าอยู่ในศึก');
  const pv = await req('GET', '/api/raid/poll?in=raid', { token: v.token });
  assert.strictEqual(Raid.presentCount(), base0 + 2);
  assert.strictEqual(pv.body.boss.online, base0 + 2, 'สถานะบอสบอกจำนวนคนในศึก');
  // คนเข้า/ออก → ส่งสถานะใหม่ให้คนในหน้า Raid (ไม่ต้องรอมีดาเมจ)
  await sleep(1300);
  const lastOnline = () => { const g = a1.got.filter((x) => x.state); return g.length ? g[g.length - 1].state.online : null; };
  assert.strictEqual(lastOnline(), base0 + 2, `ได้จำนวนคนในศึกทาง WebSocket (${lastOnline()})`);
  a2.ws.send(JSON.stringify({ type: 'raid:unsub' })); await sleep(200);
  assert.strictEqual(Raid.presentCount(), base0 + 2, 'ปิดแท็บเดียว ยังอยู่อีกแท็บ');
  a2.ws.close(); a1.ws.close(); await sleep(400);
  assert.strictEqual(Raid.presentCount(), base0 + 1, 'ออกจากหน้า Raid ครบทุกแท็บ → ลดลง');
});

test('v1.27.1 โหมดโจทย์ "spell" (ค่าเริ่มต้น): ทุกข้อ = ความหมายไทย → พิมพ์คำอังกฤษ · ไม่ส่งคำตอบไปหน้าเว็บ · ผู้ดูแลสลับกลับเป็นแบบผสมได้', async () => {
  const Q = require('../services/raid/questions');
  assert.strictEqual(R.DEFAULT_SETTINGS.questionMode, 'spell', 'ค่าเริ่มต้น = spell');
  for (const cefr of ['A1', 'A2', 'B1', 'B2', 'C1']) {
    for (const phase of [1, 2, 3]) {
      const r = await Q.buildRound({ cefr, phase, count: 40, seed: 7 + phase, mode: 'spell' });
      assert.strictEqual(r.length, 40, `${cefr} P${phase} ครบ 40 ข้อ`);
      assert.ok(r.every((q) => q.type === 'spell' && /^[a-z]{3,10}$/.test(q.answer) && q.length === q.answer.length && q.hint === q.answer[0] && q.prompt), `${cefr} P${phase} ทุกข้อเป็นข้อสะกด (ความหมายไทย + คำตอบ a–z)`);
      assert.strictEqual(new Set(r.map((q) => q.id)).size, 40, 'ไม่มีข้อซ้ำในรอบ');
      assert.strictEqual(new Set(r.map((q) => q.prompt)).size, 40, 'ความหมายไทยไม่ซ้ำ (ไม่กำกวม)');
    }
  }
  // แบบผสมยังทำงานเหมือนเดิม
  const mixed = await Q.buildRound({ cefr: 'B1', phase: 3, count: 40, seed: 9, mode: 'mixed' });
  assert.ok(new Set(mixed.map((q) => q.type)).size >= 4, 'แบบผสมมีหลายชนิด');
  // ผู้ดูแล: ค่าแปลกถูกปฏิเสธ
  assert.throws(() => Raid._sanitize({ questionMode: 'hack' }), /questionMode/);
  // เล่นจริงผ่าน API ในโหมด spell
  const b0 = await boss();
  if (b0.status !== 'active') await pool.query("UPDATE raid_boss_instances SET status = 'active' WHERE id = $1", [b0.id]);
  await setSettings({ questionMode: 'spell' });
  try {
    const u = await makeUser('sm');
    const r = await req('POST', '/api/raid/round', { token: u.token });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.question.type, 'spell');
    assert.ok(!('answer' in r.body.question) && r.body.question.length >= 3 && r.body.question.hint, 'หน้าเว็บได้แค่จำนวนช่อง + ตัวอักษรแรก');
    const a = await attempt(r.body.attemptId);
    assert.ok(a.questions.every((q) => q.type === 'spell'), 'ทุกข้อในรอบเป็นข้อสะกด');
    const ok1 = await answer(u, r.body.attemptId, true);
    assert.strictEqual(ok1.body.correct, true); assert.ok(ok1.body.damage > 0, 'สะกดถูก = ดาเมจ');
    const st = await req('GET', '/api/raid/state', { token: u.token });
    assert.strictEqual(st.body.config.questionMode, 'spell');
  } finally {
    await setSettings({ questionMode: 'mixed' });
  }
});

test('v1.27.1 บอสแต่ละเลเวลคนละตัว + เก่งขึ้นตามเลเวล (HP · เกราะ · แรงตี) · บอสเลเวลถัดไปที่เกิดจริงใช้ตระกูลถัดไป', async () => {
  const ready = R.FAMILIES.filter((f) => f.ready).map((f) => f.key);
  for (let l = 1; l < 12; l += 1) assert.notStrictEqual(R.familyForLevel(l).key, R.familyForLevel(l + 1).key, `Lv${l} กับ Lv${l + 1} ต้องเป็นบอสคนละตัว`);
  assert.strictEqual(R.familyForLevel(1 + ready.length).key, R.familyForLevel(1).key, 'ครบวงแล้วกลับมาตัวแรก (แต่เลเวลสูงกว่า = เก่งกว่า)');
  let prev = null;
  for (let l = 1; l <= 30; l += 1) {
    const p = R.levelPower(l);
    if (prev) {
      assert.ok(p.hpBase > prev.hpBase, `Lv${l} HP พื้นฐานมากกว่า Lv${l - 1}`);
      assert.ok(p.defense >= prev.defense && p.hitMult >= prev.hitMult, `Lv${l} เกราะ/แรงตีไม่น้อยกว่าเดิม`);
    }
    prev = p;
  }
  assert.ok(R.levelPower(100).defense <= 0.35 && R.levelPower(100).hitMult <= 2, 'มีเพดาน (บอสไม่เก่งจนตีไม่เข้า)');
  assert.strictEqual(R.levelPower(1).hitMult, 1); assert.ok(Math.abs(R.levelPower(5).hitMult - 1.2) < 1e-9);
  // บอสเกิดใหม่จริงในฐานข้อมูล: ตระกูล = ตามเลเวล · เกราะ = ตามเลเวล
  let b0 = await boss();
  if (b0.status !== 'active') { await pool.query("UPDATE raid_boss_instances SET status = 'active', active_at = NOW() WHERE id = $1", [b0.id]); b0 = await boss(); }
  const killer = await makeUser('lvk');
  const kr = await req('POST', '/api/raid/round', { token: killer.token });
  assert.strictEqual(kr.status, 200, JSON.stringify(kr.body));
  await cutHp(b0, 3, killer.id);
  const kx = await answer(killer, kr.body.attemptId, true);
  assert.strictEqual(kx.body.correct, true);
  assert.strictEqual((await boss()).status, 'defeated', 'บอสล้มด้วยคำตอบจริง');
  await Raid.tick();   // defeated → settled
  await pool.query("UPDATE raid_boss_instances SET next_spawn_at = NOW() - interval '1 second' WHERE id = $1", [b0.id]);
  await Raid.tick(); await Raid.tick();
  const b1 = await boss();
  assert.strictEqual(b1.level, b0.level + 1, 'บอสตัวถัดไปเกิด');
  assert.strictEqual(b1.family, R.familyForLevel(b1.level).key, 'ตระกูลตามเลเวล');
  assert.notStrictEqual(b1.family, R.familyForLevel(b0.level).key, 'คนละตัวกับบอสเลเวลก่อนหน้า');
  assert.ok(Math.abs(Number(b1.defense) - R.levelPower(b1.level).defense) < 1e-6, `เกราะตามเลเวล (${b1.defense})`);
  // แรงตีผู้เล่นตามเลเวล (ผ่าน API จริง)
  await setSettings({ playerHpOn: true, playerHp: 100, bossHit1: 20, levelHitStep: 0.05 });
  try {
    await pool.query("UPDATE raid_boss_instances SET status = 'active', active_at = NOW(), phase = 1 WHERE id = $1", [b1.id]);
    const u = await makeUser('lvh');
    const r = await req('POST', '/api/raid/round', { token: u.token });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const w = await answer(u, r.body.attemptId, false);
    assert.strictEqual(w.body.player.hit, Math.round(20 * R.levelPower(b1.level).hitMult), `Lv${b1.level} ตีแรงขึ้นตามเลเวล`);
    const st = await req('GET', '/api/raid/state', { token: u.token });
    assert.strictEqual(st.body.config.bossHit[0], w.body.player.hit, 'หน้าเว็บแสดงแรงตีเท่าที่ตีจริง');
  } finally { await setSettings({ playerHpOn: false }); }
});

test('v1.27.1 ตีโดนได้ EXP: ตอบถูก+ทำดาเมจ = +hitExp เข้า EXP บัญชี · ตอบผิด/ตอบเร็วผิดปกติ/ส่งซ้ำ ไม่ได้ · เพดานต่อวัน · ผู้ดูแลปิดได้', async () => {
  const u = await makeUser();
  const expOf = async () => Number((await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp);
  const logOf = async () => Number((await pool.query("SELECT COALESCE(SUM(amount), 0) AS n FROM exp_log WHERE user_id = $1 AND reason = 'raid_hit'", [u.id])).rows[0].n);
  const r = await req('POST', '/api/raid/round', { token: u.token });
  assert.strictEqual(r.status, 200);
  const e0 = await expOf();
  const w = await answer(u, r.body.attemptId, false);
  assert.strictEqual(w.body.exp, null, 'ตอบผิดไม่ได้ EXP'); assert.strictEqual(await expOf(), e0);
  const c = await answer(u, r.body.attemptId, true);
  assert.ok(c.body.damage > 0);
  assert.strictEqual(c.body.exp.gained, R.DEFAULT_SETTINGS.hitExp, `ตีโดน +${R.DEFAULT_SETTINGS.hitExp} EXP`);
  assert.ok(c.body.exp.levelInfo && c.body.exp.levelInfo.exp === e0 + c.body.exp.gained, 'ส่ง levelInfo ให้แถบ EXP อัปเดต');
  assert.strictEqual(await expOf(), e0 + c.body.exp.gained); assert.strictEqual(await logOf(), c.body.exp.gained, 'บันทึก exp_log reason raid_hit');
  // ส่งข้อเดิมซ้ำ → replay ไม่ได้ EXP ซ้ำ
  const a = await attempt(r.body.attemptId);
  const again = await req('POST', '/api/raid/answer', { token: u.token, body: { attemptId: r.body.attemptId, index: 1, choice: Math.max(0, a.questions[1].correctIndex) } });
  assert.strictEqual(again.body.replay, true); assert.strictEqual(await expOf(), e0 + c.body.exp.gained, 'ส่งซ้ำไม่ได้ EXP ซ้ำ');
  // เพดานต่อวัน: เหลืออีก 1 → ได้แค่ 1 · ครบแล้ว → 0 + capped
  const cap = R.DEFAULT_SETTINGS.hitExpDailyCap;
  await pool.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, 'raid_hit')", [u.id, cap - c.body.exp.gained - 1]);
  const c2 = await answer(u, r.body.attemptId, true);
  assert.strictEqual(c2.body.exp.gained, 1, 'ได้เท่าที่เหลือในเพดาน'); assert.strictEqual(c2.body.exp.capped, true);
  const c3 = await answer(u, r.body.attemptId, true);
  assert.ok(c3.body.damage > 0, 'ครบเพดาน EXP แล้วดาเมจยังนับ');
  assert.strictEqual(c3.body.exp.gained, 0); assert.strictEqual(c3.body.exp.capped, true);
  // ผู้ดูแลปิด (hitExp = 0) → ไม่มี EXP
  const ad = await makeUser(); await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [ad.id]);
  const off = await req('PUT', '/api/admin/raid/settings', { token: ad.token, body: { patch: { hitExp: 0 }, reason: 'ทดสอบปิด EXP ต่อการตี' } });
  assert.strictEqual(off.status, 200, JSON.stringify(off.body));
  try {
    const v = await makeUser(); const rv = await req('POST', '/api/raid/round', { token: v.token });
    const cv = await answer(v, rv.body.attemptId, true);
    assert.ok(cv.body.damage > 0); assert.strictEqual(cv.body.exp, null, 'ปิดแล้วไม่ได้ EXP');
  } finally {
    await req('PUT', '/api/admin/raid/settings', { token: ad.token, body: { patch: { hitExp: R.DEFAULT_SETTINGS.hitExp }, reason: 'คืนค่า' } });
  }
  await consistent();
});

test('v1.27.1 ศัพท์ยากขึ้นตามเลเวลบอส: ระดับรอบ = สูงกว่าระหว่างผู้เล่น/บอส · ~70% ระดับบอส ที่เหลือต่ำกว่า 1 ระดับ · ไม่ต่ำกว่านั้น · ดาเมจตามระดับข้อ', async () => {
  const L = ['A1', 'A2', 'B1', 'B2', 'C1'];
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30].map((l) => R.bossWordLevel(l)), ['A1', 'A1', 'A2', 'A2', 'B1', 'B1', 'B2', 'B2', 'C1', 'C1', 'C1']);
  assert.deepStrictEqual(R.roundWordPlan('C1', 1), { top: 'C1', low: null, share: 1, boss: 'A1', user: 'C1' }, 'ผู้เล่นระดับสูงกว่าบอส = ใช้ระดับผู้เล่น');
  const b0 = await boss();
  const lvl0 = (await pool.query('SELECT level FROM raid_boss_instances WHERE id = $1', [b0.id])).rows[0].level;
  const big = lvl0 + 1000;   // เลเวลสูงมาก (UNIQUE level) → ศัพท์ C1
  await pool.query('UPDATE raid_boss_instances SET level = $2 WHERE id = $1', [b0.id, big]);
  const ad = await makeUser(); await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [ad.id]);
  // โหมดสะกด (ค่าเริ่มต้นจริง) — ทุกข้อติดระดับของคำ · โหมดผสมมีข้อหาจุดผิดที่ติดระดับของประโยคเอง
  assert.strictEqual((await req('PUT', '/api/admin/raid/settings', { token: ad.token, body: { patch: { questionMode: 'spell' }, reason: 'ทดสอบ' } })).status, 200);
  try {
    const u = await makeUser();   // ยังไม่วัดระดับ = A1
    const r = await req('POST', '/api/raid/round', { token: u.token });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.wordPlan, { top: 'C1', low: 'B2', boss: 'C1', user: 'A1' });
    const a = await attempt(r.body.attemptId);
    const lv = a.questions.map((q) => q.cefr);
    const nTop = lv.filter((c) => c === 'C1').length; const nLow = lv.filter((c) => c === 'B2').length;
    assert.strictEqual(nTop + nLow, lv.length, `ทุกข้อเป็น C1/B2 เท่านั้น (${lv.join(',')})`);
    assert.strictEqual(nTop, Math.round(lv.length * 0.7), '~70% ระดับบอส');
    assert.ok(lv.slice(0, Math.ceil(lv.length / 2)).includes('B2') && lv.slice(Math.ceil(lv.length / 2)).includes('B2'), 'ข้อง่ายกว่ากระจายทั้งรอบ ไม่กองท้าย');
    // ดาเมจตามระดับของข้อ (ศัพท์ยากกว่า = ดาเมจฐานสูงกว่า)
    const d1 = Raid.computeDamage({ cefr: 'B1', qtype: 'spell', combo: 0, answerMs: 20000, s: { ...R.DEFAULT_SETTINGS }, inst: { phase: 1, shield_goal: 0, shield_progress: 0, stun_until: null, defense: 0 }, nowMs: Date.now() });
    const d0 = Raid.computeDamage({ cefr: 'A1', qtype: 'spell', combo: 0, answerMs: 20000, s: { ...R.DEFAULT_SETTINGS }, inst: { phase: 1, shield_goal: 0, shield_progress: 0, stun_until: null, defense: 0 }, nowMs: Date.now() });
    assert.ok(d1.dmg >= d0.dmg, `B1 (${d1.dmg}) ≥ A1 (${d0.dmg})`);
    const st = await req('GET', '/api/raid/state', { token: u.token });
    assert.strictEqual(st.body.config.wordLevel, 'C1', 'หน้าเว็บรู้ระดับศัพท์ของบอส');
    // ผู้ดูแลปรับให้ขึ้นช้าลง (ทุก 20 เลเวล) → ระดับตามสูตรใหม่
    assert.strictEqual((await req('PUT', '/api/admin/raid/settings', { token: ad.token, body: { patch: { wordLevelEvery: 20 }, reason: 'ทดสอบ' } })).status, 200);
    const st2 = await req('GET', '/api/raid/state', { token: u.token });
    assert.strictEqual(st2.body.config.wordLevel, R.bossWordLevel(big, { wordLevelEvery: 20 }));
    assert.strictEqual(R.bossWordLevel(30, { wordLevelEvery: 20 }), 'A2');
    await req('PUT', '/api/admin/raid/settings', { token: ad.token, body: { patch: { wordLevelEvery: R.DEFAULT_SETTINGS.wordLevelEvery }, reason: 'คืนค่า' } });
    assert.ok(L.includes(st2.body.config.wordLevel));
  } finally {
    await pool.query('UPDATE raid_boss_instances SET level = $2 WHERE id = $1', [b0.id, lvl0]);
    await req('PUT', '/api/admin/raid/settings', { token: ad.token, body: { patch: { questionMode: 'mixed' }, reason: 'คืนค่าโหมดของชุดทดสอบ' } });
  }
});
