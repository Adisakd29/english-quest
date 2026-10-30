/*
  TOEIC — แผนฝึกรายวัน + streak
  - แผน 3 งาน · ต่าง Part · มีทั้ง Listening/Reading · ทบทวนข้อผิดมาก่อนเมื่อมี · แผนคงที่ทั้งวัน
  - เริ่มงาน: ใช้ body ของงานจากเซิร์ฟเวอร์ (ไม่เชื่อขนาด/กลุ่มจากหน้าเว็บ) · Part ไม่ตรง/งานไม่ถูกต้อง = 404 · งานเสร็จแล้ว = 409
  - ครบ 3 งาน → completed + โบนัส EXP ครั้งเดียว · streak นับวันต่อเนื่อง · ต้องล็อกอิน
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const bank = require('../services/toeic/bank');
const D = require('../services/toeic/daily');

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
async function makeUser(prefix = 'td') {
  const name = `${prefix}${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
const userExp = async (id) => (await pool.query('SELECT exp FROM users WHERE id = $1', [id])).rows[0].exp;
const SEC = (p) => (p <= 4 ? 'L' : 'R');
/** ตอบทุกข้อของ session (ตอบ A) แล้วส่ง */
async function completeSession(u, part, s) {
  for (const it of s.items) {
    if (it.questions) for (const q of it.questions) await req('POST', `/api/toeic/p${part}/sessions/${s.id}/answer`, { token: u.token, body: { id: q.id, selected: 'A' } });
    else if (it.blanks) for (const b of it.blanks) await req('POST', `/api/toeic/p${part}/sessions/${s.id}/answer`, { token: u.token, body: { id: b.id, selected: 'A' } });
    else await req('POST', `/api/toeic/p${part}/sessions/${s.id}/answer`, { token: u.token, body: { qid: it.qid, selected: 'A' } });
  }
  return (await req('POST', `/api/toeic/p${part}/sessions/${s.id}/finish`, { token: u.token })).body;
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  await bank.syncFromFiles();
  bank.invalidate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await pool.end(); });

test('buildTasks: ไม่มีข้อมูล → 3 งานต่าง Part มีทั้ง L/R · มีข้อผิด → ทบทวนมาก่อน', () => {
  const g = (id, status, extra = {}) => ({ id, th: id, status, available: 10, score: 70, answered: 0, accuracy: null, ...extra });
  const empty = { parts: [1, 2, 3, 4, 5, 6, 7].map((part) => ({ part, mistakes: 0, groups: [g(`g${part}a`, 'untried'), g(`g${part}b`, 'untried')] })) };
  const t = D._internal.buildTasks(empty);
  assert.strictEqual(t.length, 3);
  assert.strictEqual(new Set(t.map((x) => x.part)).size, 3);
  assert.strictEqual(new Set(t.map((x) => SEC(x.part))).size, 2);
  assert.deepStrictEqual(t.map((x) => x.k), [0, 1, 2]);
  const withData = JSON.parse(JSON.stringify(empty));
  withData.parts[6].mistakes = 4;
  withData.parts[4].groups[0] = g('prepositions', 'weak', { score: 40, answered: 10, accuracy: 20 });
  const t2 = D._internal.buildTasks(withData);
  assert.strictEqual(t2[0].kind, 'mistakes'); assert.strictEqual(t2[0].part, 7); assert.deepStrictEqual(t2[0].body, { size: 1, source: 'mistakes' });
  assert.strictEqual(t2[1].kind, 'drill'); assert.strictEqual(t2[1].group, 'prepositions');
  assert.ok(t2.every((x) => x.minutes > 0 && x.th && x.reason));
  const total = t.reduce((a, x) => a + x.minutes, 0);
  assert.ok(total >= 8 && total <= 15, `เวลารวม ${total} นาที`);
});

test('ต้องล็อกอิน · แผนคงที่ทั้งวัน · เริ่มงานใช้ body ของเซิร์ฟเวอร์ · Part/งานผิด = 404', async () => {
  assert.strictEqual((await req('GET', '/api/toeic/daily')).status, 401);
  const u = await makeUser();
  const a = (await req('GET', '/api/toeic/daily', { token: u.token })).body;
  assert.strictEqual(a.tasks.length, 3); assert.strictEqual(a.done, 0); assert.strictEqual(a.completed, false);
  assert.strictEqual(a.streak.current, 0); assert.strictEqual(a.streak.week.length, 7); assert.strictEqual(a.next, 0);
  const b = (await req('GET', '/api/toeic/daily', { token: u.token })).body;
  assert.deepStrictEqual(b.tasks.map((t) => [t.part, t.group, t.kind]), a.tasks.map((t) => [t.part, t.group, t.kind]), 'แผนเดิมทั้งวัน');
  const t0 = a.tasks[0];
  const s = await req('POST', `/api/toeic/p${t0.part}/sessions`, { token: u.token, body: { mode: 'practice', size: 20, group: 'nonsense', dailyTask: 0 } });
  assert.strictEqual(s.status, 200);
  assert.strictEqual(s.body.config.dailyTask, `${a.day}:0`);
  if (t0.group) assert.strictEqual(s.body.config.group, t0.group);
  assert.strictEqual(s.body.config.size, t0.body.size, 'ขนาดตามงาน ไม่ใช่ค่าจากหน้าเว็บ');
  const wrongPart = t0.part === 5 ? 6 : 5;
  assert.strictEqual((await req('POST', `/api/toeic/p${wrongPart}/sessions`, { token: u.token, body: { mode: 'practice', dailyTask: 0 } })).status, 404);
  assert.strictEqual((await req('POST', `/api/toeic/p${t0.part}/sessions`, { token: u.token, body: { mode: 'practice', dailyTask: 9 } })).status, 404);
  assert.strictEqual((await req('POST', `/api/toeic/p${t0.part}/sessions`, { token: u.token, body: { mode: 'practice', dailyTask: 'x' } })).status, 404);
  const c = (await req('GET', '/api/toeic/daily', { token: u.token })).body;
  assert.strictEqual(c.tasks[0].state, 'active'); assert.strictEqual(c.tasks[0].sessionId, s.body.id);
  // Mock ไม่ผูกกับแผน
  const m = await req('POST', '/api/toeic/p5/sessions', { token: u.token, body: { mode: 'mock', dailyTask: 0 } });
  assert.strictEqual(m.body.config.dailyTask, undefined);
});

test('ทำครบ 3 งาน → completed + EXP ครั้งเดียว · streak 1 · งานที่เสร็จแล้วเริ่มซ้ำไม่ได้ · streak ต่อเนื่องจากวันก่อน', async () => {
  const u = await makeUser();
  const plan = (await req('GET', '/api/toeic/daily', { token: u.token })).body;
  for (const t of plan.tasks) {
    const s = (await req('POST', `/api/toeic/p${t.part}/sessions`, { token: u.token, body: { mode: 'practice', dailyTask: t.k } })).body;
    if (t.k < 2) {
      await completeSession(u, t.part, s);
      const mid = (await req('GET', '/api/toeic/daily', { token: u.token })).body;
      assert.strictEqual(mid.tasks[t.k].state, 'done'); assert.strictEqual(mid.completed, false);
    } else {
      // ส่งก่อนตอบครบ → ยังไม่นับ
      const first = s.items[0];
      if (first.questions) await req('POST', `/api/toeic/p${t.part}/sessions/${s.id}/answer`, { token: u.token, body: { id: first.questions[0].id, selected: 'A' } });
      else if (first.blanks) await req('POST', `/api/toeic/p${t.part}/sessions/${s.id}/answer`, { token: u.token, body: { id: first.blanks[0].id, selected: 'A' } });
      else await req('POST', `/api/toeic/p${t.part}/sessions/${s.id}/answer`, { token: u.token, body: { qid: first.qid, selected: 'A' } });
      const total = s.total;
      if (total > 1) {
        await req('POST', `/api/toeic/p${t.part}/sessions/${s.id}/finish`, { token: u.token });
        assert.notStrictEqual((await req('GET', '/api/toeic/daily', { token: u.token })).body.tasks[2].state, 'done', 'ตอบไม่ครบไม่นับ');
        const s2 = (await req('POST', `/api/toeic/p${t.part}/sessions`, { token: u.token, body: { mode: 'practice', dailyTask: t.k } })).body;
        await completeSession(u, t.part, s2);
      } else await req('POST', `/api/toeic/p${t.part}/sessions/${s.id}/finish`, { token: u.token });
    }
  }
  const before = await userExp(u.id);
  const r = (await req('GET', '/api/toeic/daily', { token: u.token })).body;
  assert.strictEqual(r.completed, true); assert.strictEqual(r.done, 3);
  assert.strictEqual(r.justCompleted.exp, D.BONUS_EXP);
  assert.strictEqual(await userExp(u.id), before + D.BONUS_EXP);
  assert.strictEqual(r.streak.current, 1); assert.strictEqual(r.streak.todayDone, true); assert.strictEqual(r.streak.week[6].done, true);
  const again = (await req('GET', '/api/toeic/daily', { token: u.token })).body;
  assert.strictEqual(again.justCompleted, null); assert.strictEqual(await userExp(u.id), before + D.BONUS_EXP);
  assert.strictEqual((await req('POST', `/api/toeic/p${plan.tasks[0].part}/sessions`, { token: u.token, body: { mode: 'practice', dailyTask: 0 } })).status, 409);
  // วันก่อน ๆ (ใส่ตรง) → streak ต่อเนื่อง · ช่องว่างตัด streak
  const today = r.day; const day = (n) => D._internal.addDays(today, n);
  for (const n of [-1, -2, -4]) await pool.query(`INSERT INTO toeic_daily_plans (user_id, day, tasks, completed_at) VALUES ($1, $2, '[]', NOW())`, [u.id, day(n)]);
  const st = (await req('GET', '/api/toeic/daily', { token: u.token })).body.streak;
  assert.strictEqual(st.current, 3); assert.strictEqual(st.best, 3);
  assert.deepStrictEqual(st.week.map((w) => w.done), [false, false, true, false, true, true, true]);
});

test('streak: วันนี้ยังไม่ครบแต่เมื่อวานครบ → ยังนับต่อจากเมื่อวาน', async () => {
  const u = await makeUser();
  const today = D._internal.bkkDay();
  await pool.query(`INSERT INTO toeic_daily_plans (user_id, day, tasks, completed_at) VALUES ($1, $2, '[]', NOW())`, [u.id, D._internal.addDays(today, -1)]);
  const st = await D._internal.streakOf(u.id, today);
  assert.strictEqual(st.current, 1); assert.strictEqual(st.todayDone, false);
});
