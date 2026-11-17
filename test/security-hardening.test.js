/*
  v1.18.4 ความปลอดภัย (ตรวจทั้งระบบ) — ทุกช่องโหว่ที่พบมีเทสต์ยืนยันว่าปิดแล้ว
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.ADMIN_EMAILS = 'boss.admin@gmail.com';

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');

let server; let base;
function req(method, path, { token, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + path, { method, headers: h }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let b = null; try { b = buf ? JSON.parse(buf) : null; } catch (_e) { b = buf; } resolve({ status: res.statusCode, body: b }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
let seq = 0;
async function makeUser(prefix = 'sh', email = null) {
  seq += 1;
  const name = `${prefix}${Date.now() % 1e7}${seq}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: email || `${name}@gmail.com`, password: 'password123' } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return { token: r.body.token, id: r.body.user.id, name, role: r.body.user.role };
}
async function makeAdmin() {
  const u = await makeUser('adm');
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.id]);
  return u;
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('A2/สภาพแวดล้อม: บน Railway ถือเป็น production อัตโนมัติ · ช่องฝึกการ์ดแบบเก่าปิดเป็นค่าเริ่มต้น', () => {
  const env = require('../utils/env');
  const keep = { ...process.env };
  try {
    delete process.env.NODE_ENV; delete process.env.RAILWAY_ENVIRONMENT_NAME;
    assert.strictEqual(env.isProd(), false);
    process.env.NODE_ENV = 'development'; process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    assert.strictEqual(env.isProd(), true, 'NODE_ENV=development บน Railway ยังถือเป็น production');
    assert.ok(env.startupWarnings().some((w) => /NODE_ENV/.test(w)));
    process.env.JWT_SECRET = 'change-me';
    assert.ok(env.startupWarnings().some((w) => /JWT_SECRET/.test(w)));
  } finally { process.env = keep; }
  const src = require('node:fs').readFileSync(require.resolve('../routes/progress.js'), 'utf8');
  assert.ok(/const legacyReviewEnabled = \(\) => process\.env\.LEGACY_CARD_REVIEW === 'on';/.test(src), 'เปิดได้เฉพาะเจ้าของระบบตั้งเอง (ไม่เปิดเองตาม NODE_ENV)');
});

test('A3: สมัครด้วยอีเมลแอดมินที่ยังไม่ยืนยัน = ผู้ใช้ธรรมดา · ยืนยันอีเมลแล้วจึงเป็น admin · syncAdmins ไม่เลื่อนบัญชีที่ยังไม่ยืนยัน', async () => {
  await pool.query("DELETE FROM users WHERE LOWER(email) = 'boss.admin@gmail.com'");
  const u = await makeUser('bo', 'boss.admin@gmail.com');
  assert.strictEqual(u.role, 'user');
  assert.strictEqual((await req('GET', '/api/admin/users', { token: u.token })).status, 403);
  const { syncAdmins, promoteIfAdmin } = require('../utils/adminSync');
  await syncAdmins(pool);
  assert.strictEqual((await pool.query('SELECT role FROM users WHERE id = $1', [u.id])).rows[0].role, 'user');
  await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [u.id]);
  assert.strictEqual(await promoteIfAdmin(pool, u.id), true);
  assert.strictEqual((await req('GET', '/api/admin/users', { token: u.token })).status, 200);
  // admin เดิมที่ยังอยู่ในรายการ: คงสิทธิ์แม้ยังไม่ยืนยัน (ไม่ล็อกเจ้าของระบบออก)
  await pool.query('UPDATE users SET email_verified = FALSE WHERE id = $1', [u.id]);
  await syncAdmins(pool);
  assert.strictEqual((await pool.query('SELECT role FROM users WHERE id = $1', [u.id])).rows[0].role, 'admin');
});

test('A4: ตัวกรองแชทจับเบอร์/ไอดี/ลิงก์ที่หลบด้วยตัวอักษรพิเศษ · ข้อความปกติภาษาไทย/อังกฤษผ่าน', () => {
  const f = require('../utils/chatFilter');
  for (const bad of ['０８１２３４５６７８', 'ｈｔｔｐｓ://evil.example', 'l i n e : kid_123', '๐๘๑๒๓๔๕๖๗๘', '081/234/5678',
    'kid at gmail dot com', 'evil.tk', 'іg: kid_99', 'add me on l.i.n.e kid99',
    'l!ne me kid_123', 'L1NE me kidxx', 'tele gram : kiddo', 'teleg ram kiddo123', 'reach me kid123 on snap', '𝗹𝗶𝗻𝗲: kid_7']) {
    assert.strictEqual(f.filter(bad).block, true, bad);
  }
  for (const ok of ['สวัสดีครับ วันนี้เรียนอะไรกัน', 'I am online now', 'meet on line 3 of the poem', 'the telephone rang', 'fine thanks and you', 'I scored 100 in 3 games', 'see you at 5 pm', 'ครูให้การบ้าน 20 ข้อ', 'e.g. this is fine']) {
    const r = f.filter(ok);
    assert.strictEqual(r.block, false, ok); assert.strictEqual(r.text, ok, `${ok} ไม่ถูกแก้`);
  }
  assert.ok(f.filter('f⁠uck').flags.includes('profanity'));
  assert.ok(f.filter('fսck').flags.includes('profanity'));
  assert.strictEqual(f.clean('ภาษาไทย่'), 'ภาษาไทย่', 'สระ/วรรณยุกต์ไทยไม่ถูกตัด');
});

test('A6: เปิดสอบ Unit พร้อมกัน 3 ครั้ง = รอบเดียว · ส่งพร้อมกันได้โบนัสผ่านครั้งแรกครั้งเดียว', async () => {
  const u = await makeUser();
  const path = (await req('GET', '/api/path', { token: u.token })).body;
  const unit = path.levels.find((l) => l.level === 'A1').units.find((x) => x.status !== 'locked');
  const starts = await Promise.all([1, 2, 3].map(() => req('POST', `/api/assessments/unit/${unit.id}/start`, { token: u.token })));
  assert.ok(starts.every((s) => s.status === 200), JSON.stringify(starts.map((s) => s.body)));
  const ids = new Set(starts.map((s) => s.body.attemptId));
  assert.strictEqual(ids.size, 1, 'ได้ attempt เดียวกัน');
  const id = [...ids][0];
  const qs = (await pool.query('SELECT questions FROM assessments WHERE id = $1', [id])).rows[0].questions;
  const answers = qs.map((q) => q.correctIndex);
  const subs = await Promise.all([1, 2, 3].map(() => req('POST', `/api/assessments/${id}/submit`, { token: u.token, body: { answers } })));
  assert.strictEqual(subs.filter((s) => s.status === 200).length, 1);
  const n = (await pool.query("SELECT COUNT(*)::int AS n FROM exp_log WHERE user_id = $1 AND reason = 'unit_test'", [u.id])).rows[0].n;
  assert.strictEqual(n, 1, 'โบนัสครั้งเดียว');
  // สอบใหม่หลังผ่านแล้ว: ไม่ได้โบนัสซ้ำ (คีย์ใน exp_awards)
  const again = (await req('POST', `/api/assessments/unit/${unit.id}/start`, { token: u.token })).body;
  const qs2 = (await pool.query('SELECT questions FROM assessments WHERE id = $1', [again.attemptId])).rows[0].questions;
  const r2 = (await req('POST', `/api/assessments/${again.attemptId}/submit`, { token: u.token, body: { answers: qs2.map((q) => q.correctIndex) } })).body;
  assert.strictEqual(r2.result.gainedExp, 0);
});

test('A6: เพดาน EXP รายวันไม่ทะลุเมื่อยิงพร้อมกัน', async () => {
  const u = await makeUser();
  const { grantExp } = require('../utils/exp');
  const rs = await Promise.all(Array.from({ length: 20 }, () => grantExp(u.id, 5, { reason: 'speaking', dailyCap: 40 })));
  assert.strictEqual(rs.reduce((a, r) => a + r.gained, 0), 40);
});

test('A7: เป้าหมายรายวันนับ "ข้อไม่ซ้ำ" — ตอบข้อเดิมซ้ำ/ส่งว่างไม่ครบเป้า', async () => {
  const u = await makeUser();
  for (let i = 0; i < 25; i += 1) {
    await pool.query("INSERT INTO answer_events (user_id, skill, item_id, level, correct) VALUES ($1, 'vocab', 'A1-S0001', 'A1', FALSE)", [u.id]);
  }
  const s = (await req('GET', '/api/streak', { token: u.token })).body;
  assert.strictEqual(s.progress.answers, 1, 'ตอบข้อเดิม 25 ครั้ง = 1 ข้อ');
  assert.strictEqual(s.doneToday, false);
  // graded: ส่งว่างทั้งเรื่องไม่บันทึกเป็นการตอบ
  const G = require('../services/graded');
  const t = (await G.list(u.id)).levels.find((l) => l.texts.length).texts[0];
  const full = await G.get(u.id, t.id, 'reading');
  const before = (await pool.query("SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND source = 'graded'", [u.id])).rows[0].n;
  await G.submit(u.id, t.id, { mode: 'reading', answers: full.questions.map(() => null) });
  const after = (await pool.query("SELECT COUNT(*)::int AS n FROM answer_events WHERE user_id = $1 AND source = 'graded'", [u.id])).rows[0].n;
  assert.strictEqual(after, before);
});

test('A8: /api/words ต้องเข้าสู่ระบบ · ระหว่างแข่ง Ranked ใช้ /api/words และ Word Atlas ค้นคำไม่ได้', async () => {
  assert.strictEqual((await req('GET', '/api/words/A1')).status, 401);
  const u = await makeUser();
  assert.strictEqual((await req('GET', '/api/words/A1', { token: u.token })).status, 200);
  await req('POST', '/api/ranked/tutorial-done', { token: u.token });
  const st = (await req('POST', '/api/ranked/matches', { token: u.token, body: { type: 'ranked', mode: 'vocab' } })).body;
  assert.ok(st.matchId);
  for (const p of ['/api/words/A1', '/api/words/content?ids=A1-S0001', '/api/word-atlas/words?q=a', '/api/vocab/search?q=a', '/api/theme-vocab', '/api/flashcards/options']) {
    assert.strictEqual((await req('GET', p, { token: u.token })).status, 423, p);
  }
  assert.strictEqual((await req('POST', '/api/translate', { token: u.token, body: { text: 'apple' } })).status, 423);
  await req('POST', `/api/ranked/matches/${st.matchId}/forfeit`, { token: u.token });
  assert.strictEqual((await req('GET', '/api/words/A1', { token: u.token })).status, 200);
});

test('B1: คนอื่นใส่รหัสผิดรัว ๆ ไม่ทำให้เจ้าของ (คนละ IP) เข้าไม่ได้ · IP เดียวกันยังถูกจำกัด', async () => {
  const u = await makeUser('vic');
  // ผู้โจมตีจาก IP อื่น (ผ่าน trust proxy 1 ชั้น)
  for (let i = 0; i < 9; i += 1) {
    await req('POST', '/api/auth/login', { body: { identifier: u.name, password: 'wrongpass1' }, headers: { 'X-Forwarded-For': '203.0.113.9' } });
  }
  const blocked = await req('POST', '/api/auth/login', { body: { identifier: u.name, password: 'wrongpass1' }, headers: { 'X-Forwarded-For': '203.0.113.9' } });
  assert.strictEqual(blocked.status, 429, 'IP ผู้โจมตีโดนจำกัด');
  const owner = await req('POST', '/api/auth/login', { body: { identifier: u.name, password: 'password123' }, headers: { 'X-Forwarded-For': '198.51.100.7' } });
  assert.strictEqual(owner.status, 200, 'เจ้าของเข้าได้');
  // ไม่พบบัญชี = ข้อความเดียวกับรหัสผิด
  const none = await req('POST', '/api/auth/login', { body: { identifier: 'nobody_here_x', password: 'password123' }, headers: { 'X-Forwarded-For': '198.51.100.8' } });
  assert.strictEqual(none.status, 401); assert.match(none.body.error, /ไม่พบบัญชีนี้ หรือรหัสผ่านไม่ถูกต้อง/);
});

test('B2: รายงานใช้เป็นอาวุธไม่ได้ — บัญชีใหม่ 3 คนรายงานไม่ทำให้ถูกปิดแชท · รายงานเกิน 5 ครั้ง/ชม.ไม่ได้', async () => {
  const victim = await makeUser('vc');
  const msg = (await pool.query("INSERT INTO world_chat_messages (user_id, body) VALUES ($1, 'hello') RETURNING id", [victim.id])).rows[0].id;
  for (let i = 0; i < 3; i += 1) {
    const r = await makeUser('rp');
    const x = await req('POST', `/api/world-chat/${msg}/report`, { token: r.token, body: { reason: 'spam' } });
    assert.ok([200, 201].includes(x.status), JSON.stringify(x.body));
  }
  const act = await require('../services/moderation/chat').activeRestrictions(victim.id);
  assert.strictEqual(act.length, 0, 'ผู้รายงานบัญชีใหม่ไม่ถูกนับ');
  // ผู้รายงานที่น่าเชื่อถือ (อายุบัญชี > 3 วัน) 3 คน -> ปิดชั่วคราวรอผู้ดูแล (กติกาเดิม)
  for (let i = 0; i < 3; i += 1) {
    const r = await makeUser('ro');
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '10 days' WHERE id = $1", [r.id]);
    await req('POST', `/api/world-chat/${msg}/report`, { token: r.token, body: { reason: 'spam' } });
  }
  assert.ok((await require('../services/moderation/chat').activeRestrictions(victim.id)).some((x) => x.kind === 'chat'));
  // ข้อความเก่ากว่า 24 ชม. รายงานไม่ได้
  const old = (await pool.query("INSERT INTO world_chat_messages (user_id, body, created_at) VALUES ($1, 'old', NOW() - INTERVAL '2 days') RETURNING id", [victim.id])).rows[0].id;
  const r0 = await makeUser('rq');
  assert.strictEqual((await req('POST', `/api/world-chat/${old}/report`, { token: r0.token, body: { reason: 'spam' } })).status, 404);
});

test('B3: ออกจากระบบทุกอุปกรณ์/รีเซ็ตรหัสผ่าน -> ปิดการเชื่อมต่อสดที่ค้างอยู่ · จำกัด 6 การเชื่อมต่อต่อบัญชี', () => {
  assert.strictEqual(typeof realtime.disconnectUser, 'function');
  const src = require('node:fs').readFileSync(require.resolve('../routes/auth.js'), 'utf8');
  assert.ok(/disconnectUser\(uid, 'logout_all'\)/.test(src) && /disconnectUser\(userId, 'password_reset'\)/.test(src));
  const rt = require('node:fs').readFileSync(require.resolve('../realtime.js'), 'utf8');
  assert.ok(/MAX_SOCKETS_PER_USER = 6/.test(rt));
});

test('B5/C1: ลืมรหัสผ่าน — ตอบเหมือนกันทั้งอีเมลที่มี/ไม่มี · production ไม่พิมพ์ลิงก์ลง log', async () => {
  const u = await makeUser('fp');
  const a = await req('POST', '/api/auth/forgot-password', { body: { email: `${u.name}@gmail.com` }, headers: { 'X-Forwarded-For': '192.0.2.50' } });
  const b = await req('POST', '/api/auth/forgot-password', { body: { email: 'nobody-x@gmail.com' }, headers: { 'X-Forwarded-For': '192.0.2.51' } });
  assert.strictEqual(a.status, 200); assert.strictEqual(b.status, 200);
  assert.strictEqual(a.body.message, b.body.message);
  const src = require('node:fs').readFileSync(require.resolve('../utils/mailer.js'), 'utf8');
  assert.ok(/isProd\(\) && process\.env\.MAILER_LOG_LINKS !== 'on'/.test(src));
});

test('B6: การกระทำของผู้ดูแลถูกบันทึก (แก้ข้อมูล + เปิดดูแชทผู้ใช้) ไม่บันทึกรหัสผ่าน', async () => {
  const a = await makeAdmin(); const u = await makeUser();
  await req('GET', `/api/admin/moderation/chat?userId=${u.id}`, { token: a.token });
  await req('POST', '/api/admin/moderation/restrict', { token: a.token, body: { userId: u.id, kind: 'chat', minutes: 5, reason: 'test', password: 'x' } });
  await new Promise((r) => setTimeout(r, 200));
  const logs = (await pool.query('SELECT action, details FROM audit_logs WHERE actor_id = $1 ORDER BY id', [a.id])).rows;
  assert.ok(logs.some((l) => l.action === 'admin_view_chat'), JSON.stringify(logs));
  const w = logs.find((l) => l.action === 'admin_post');
  assert.ok(w); assert.strictEqual(w.details.body.password, '[ซ่อน]');
});

test('B7: ถูกปิดแชท = ส่งข้อความส่วนตัวไม่ได้ · ข้อความส่วนตัวห้ามมีเบอร์/ไอดี/ลิงก์', async () => {
  const a = await makeUser('dm'); const b = await makeUser('dm');
  const fr = await req('POST', '/api/friends/request', { token: a.token, body: { userId: b.id } });
  const fid = fr.body && (fr.body.friendshipId || fr.body.id || (fr.body.friendship && fr.body.friendship.id));
  if (fid) await req('POST', `/api/friends/${fid}/accept`, { token: b.token });
  else await pool.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted') ON CONFLICT DO NOTHING", [a.id, b.id]);
  await pool.query("UPDATE friendships SET status = 'accepted' WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)", [a.id, b.id]);
  assert.strictEqual((await req('POST', `/api/chat/${b.id}/messages`, { token: a.token, body: { body: 'สวัสดี' } })).status, 200);
  const c = await req('POST', `/api/chat/${b.id}/messages`, { token: a.token, body: { body: 'แอดไลน์ l i n e : kid_99' } });
  assert.strictEqual(c.status, 400); assert.strictEqual(c.body.code, 'CONTACT_BLOCKED');
  await require('../services/moderation/chat').restrict(a.id, 'chat', 10, 'test');
  assert.strictEqual((await req('POST', `/api/chat/${b.id}/messages`, { token: a.token, body: { body: 'hi' } })).body.code, 'RESTRICTED');
});

test('C3: ถูกปฏิเสธคำขอเพื่อน -> ส่งซ้ำถึงคนเดิมไม่ได้ 3 วัน', async () => {
  const a = await makeUser('fa'); const b = await makeUser('fb');
  await req('POST', '/api/friends/request', { token: a.token, body: { userId: b.id } });
  const fid = (await pool.query('SELECT id FROM friendships WHERE requester_id = $1 AND addressee_id = $2', [a.id, b.id])).rows[0].id;
  assert.strictEqual((await req('POST', `/api/friends/${fid}/decline`, { token: b.token })).status, 200);
  const again = await req('POST', '/api/friends/request', { token: a.token, body: { userId: b.id } });
  assert.strictEqual(again.status, 429); assert.strictEqual(again.body.code, 'REQUEST_COOLDOWN');
});

test('C6: รูปโปรไฟล์ — ตัดข้อมูลแฝง (EXIF/GPS) ที่เซิร์ฟเวอร์ · ภาพยังเปิดได้', async () => {
  const u = await makeUser('img');
  // JPEG จริง 4x4 + APP1 EXIF ปลอมที่มีข้อความพิกัด
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwClRRRXtHjn/9k=', 'base64');
  const exif = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0x00, 0x17]), Buffer.from('Exif\0\0GPS-13.75-100.5', 'latin1')]);
  const withExif = Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
  const r = await req('PATCH', '/api/auth/avatar-image', { token: u.token, body: { image: `data:image/jpeg;base64,${withExif.toString('base64')}` } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const saved = (await pool.query('SELECT avatar_image FROM users WHERE id = $1', [u.id])).rows[0].avatar_image;
  const buf = Buffer.from(saved.split(',')[1], 'base64');
  assert.ok(!buf.toString('latin1').includes('GPS-13.75'), 'ไม่มีพิกัดเหลือ');
  assert.ok(buf.equals(jpeg), 'เนื้อภาพเท่าเดิม');
});

test('C7: สอบวัดระดับได้วันละ 3 ครั้ง', async () => {
  const u = await makeUser('pl');
  for (let i = 0; i < 3; i += 1) {
    const s = await req('POST', '/api/placement/start', { token: u.token });
    assert.strictEqual(s.status, 200);
    await pool.query("UPDATE placement_attempts SET status = 'completed' WHERE id = $1", [s.body.attemptId]);
  }
  const s4 = await req('POST', '/api/placement/start', { token: u.token });
  assert.strictEqual(s4.status, 429); assert.strictEqual(s4.body.code, 'PLACEMENT_DAILY_LIMIT');
});

test('C8: ผู้ดูแลระงับบัญชีชั่วคราว -> เข้าสู่ระบบ/API ไม่ได้ (ไม่ลบข้อมูล) · ยกเลิกแล้วใช้ได้ · ระงับผู้ดูแล/ตัวเองไม่ได้', async () => {
  const a = await makeAdmin(); const u = await makeUser('sus');
  await pool.query('UPDATE users SET exp = 1234 WHERE id = $1', [u.id]);
  assert.strictEqual((await req('POST', `/api/admin/users/${u.id}/suspend`, { token: u.token, body: { hours: 24 } })).status, 403);
  const r = await req('POST', `/api/admin/users/${u.id}/suspend`, { token: a.token, body: { hours: 24, reason: 'สแปมแชท' } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const me = await req('GET', '/api/auth/me', { token: u.token });
  assert.strictEqual(me.status, 403); assert.strictEqual(me.body.code, 'ACCOUNT_SUSPENDED'); assert.match(me.body.error, /สแปมแชท/);
  const login = await req('POST', '/api/auth/login', { body: { identifier: u.name, password: 'password123' }, headers: { 'X-Forwarded-For': '198.51.100.30' } });
  assert.strictEqual(login.status, 403);
  assert.strictEqual((await pool.query('SELECT exp FROM users WHERE id = $1', [u.id])).rows[0].exp, 1234, 'ข้อมูลไม่หาย');
  assert.strictEqual((await req('POST', `/api/admin/users/${a.id}/suspend`, { token: a.token, body: { hours: 24 } })).status, 400);
  assert.strictEqual((await req('POST', `/api/admin/users/${u.id}/suspend`, { token: a.token, body: { hours: 0 } })).status, 200);
  assert.strictEqual((await req('GET', '/api/auth/me', { token: u.token })).status, 200);
  const log = (await pool.query("SELECT action FROM audit_logs WHERE target_user = $1 ORDER BY id", [u.id])).rows.map((x) => x.action);
  assert.deepStrictEqual(log.filter((x) => /suspend/.test(x)), ['suspend', 'unsuspend']);
});

test('C9: โหมดพูด/เขียนตามคำบอกอยู่ในการตรวจจังหวะตอบ', () => {
  const { PACED_KEY } = require('../utils/answerPace');
  assert.ok(PACED_KEY.test('spk:x') && PACED_KEY.test('spkd:x'));
});

test('ไม่รับ token ผ่าน cookie (กัน CSRF)', async () => {
  const u = await makeUser('ck');
  assert.strictEqual((await req('GET', '/api/auth/me', { headers: { Cookie: `token=${u.token}` } })).status, 401);
});
