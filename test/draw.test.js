/*
  v1.20.0 วาดทายศัพท์ (Draw & Guess)
  - คลังคำ: อ้างอิง senseId ของคลังคำศัพท์จริง · ระดับ/ชนิดคำตรงกับคลัง (ไม่เดา) · ไม่มีคำต้องห้าม
  - ห้อง: สร้าง/เข้า/เต็ม/บล็อกกัน/ถูกเตะ · peek ไม่มีข้อมูลส่วนตัว
  - เกม: คำส่งให้คนวาดคนเดียว · คนทายไม่ได้รับคำจนกว่าจะทายถูก · คำตอบที่ถูกไม่ถูกส่งต่อ · คนวาดพิมพ์คำตอบไม่ได้ · เส้นวาดเฉพาะคนวาด + ตรวจพิกัด
  - แชทในห้องผ่านตัวกรองเดิม · ถูกปิดแชท = ทายได้แต่ข้อความไม่ถูกส่งต่อ
  - รายงานคนวาด = เก็บเส้นเป็นหลักฐาน · คำเชิญในแชทโลก: ข้อความคงที่ ไม่มีอีเมล · ถูกปิดแชทส่งไม่ได้
  - EXP ไม่เกินเพดานต่อวัน · เก็บคำเข้าคิวทบทวนไม่ให้ EXP
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';
process.env.DRAW_RATE_PER_MIN = '100000';

const pool = require('../config/db');
const { createApp } = require('../app');
const realtime = require('../realtime');
const D = require('../services/draw');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server; let base; let wsBase;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + p, { method, headers: h }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null, raw: buf }));
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
let n = 0;
async function makeUser(prefix = 'dg') {
  n += 1;
  const name = `${prefix}${Date.now() % 1e7}${n}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  return { token: r.body.token, id: r.body.user.id, name, email: `${name}@gmail.com` };
}
/** ต่อ WebSocket และเก็บข้อความ draw:* ทั้งหมด */
async function connect(u) {
  const ws = new WebSocket(`${wsBase}/ws?token=${u.token}`);
  const inbox = [];
  ws.on('message', (d) => { try { const m = JSON.parse(String(d)); inbox.push(m); } catch (_) { /* - */ } });
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  await sleep(150);
  u.ws = ws; u.inbox = inbox;
  u.send = (type, p = {}) => ws.send(JSON.stringify({ type, ...p }));
  u.last = (type) => [...inbox].reverse().find((m) => m.type === type);
  u.all = (type) => inbox.filter((m) => m.type === type);
  u.raw = () => JSON.stringify(inbox);
  return u;
}
async function waitFor(fn, ms = 4000) {
  const t0 = Date.now();
  for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout'); await sleep(40); }
}

test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  realtime.attach(server);
  D.init();
  Object.assign(D.CFG, { chooseMs: 1500, revealMs: 300, playerGraceMs: 400, drawerGraceMs: 300 });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  wsBase = `ws://127.0.0.1:${server.address().port}`;
});
test.after(async () => { D._reset(); await new Promise((r) => server.close(r)); await pool.end(); });

test('คลังคำวาด: อ้างอิง senseId จริง · ระดับ/ชนิดคำตรงคลัง · ครบทุกระดับ · ไม่ซ้ำ · มีคำแปลไทยและตัวอย่าง · ไม่มีคำต้องห้าม', () => {
  const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/draw/words.json'), 'utf8')).words;
  const senses = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/oxford/senses.json'), 'utf8')).map((s) => [s.senseId, s]));
  assert.ok(W.length >= 300, `มี ${W.length} คำ`);
  const per = {};
  const seen = new Set();
  for (const w of W) {
    const s = senses.get(w.senseId);
    assert.ok(s, `${w.senseId} ไม่มีในคลัง`);
    assert.strictEqual(s.cefr, w.level, `${w.word}: ระดับต้องตรงคลัง`);
    assert.strictEqual(s.pos, w.pos, `${w.word}: ชนิดคำต้องตรงคลัง`);
    assert.strictEqual(s.headword.toLowerCase(), w.word);
    assert.ok(!s.needsReview);
    assert.match(w.word, /^[a-z]{3,12}$/);
    assert.match(w.th, /[ก-๙]/); assert.match(w.exampleTh, /[ก-๙]/);
    const ex = w.example.toLowerCase();
    const stems = [w.word, w.word.replace(/y$/, 'i'), w.word.replace(/e$/, ''), w.word.slice(0, -1)].filter((x) => x.length >= 3);
    // กริยาผันรูปไม่ปกติ (swim→swam ฯลฯ) ตรวจไว้แล้วในสคริปต์สร้างคลัง — ที่นี่ต้องมีอย่างน้อยรากคำ หรือเป็นกริยา
    assert.ok(stems.some((x) => ex.includes(x)) || w.pos === 'verb', `${w.word}: ตัวอย่างต้องมีคำนี้`);
    assert.ok(!seen.has(w.word)); seen.add(w.word);
    per[w.level] = (per[w.level] || 0) + 1;
  }
  for (const lv of ['A1', 'A2', 'B1', 'B2']) assert.ok(per[lv] >= 25, `${lv}: ${per[lv]}`);
  for (const bad of ['gun', 'bomb', 'cigarette', 'beer', 'wine', 'blood', 'church', 'temple', 'king', 'queen']) assert.ok(!seen.has(bad), bad);
});

test('สร้าง/เข้าห้อง · peek ไม่มีข้อมูลส่วนตัว · ห้องเต็ม · บล็อกกัน · ต้องเข้าสู่ระบบ', async () => {
  const a = await makeUser(); const b = await makeUser(); const blocked = await makeUser();
  assert.strictEqual((await req('POST', '/api/draw/rooms', { body: {} })).status, 401);
  const r = (await req('POST', '/api/draw/rooms', { token: a.token, body: { level: 'A2', rounds: 1, drawSecs: 60 } })).body;
  assert.match(r.code, /^[A-Z0-9]{5}$/);
  assert.deepStrictEqual([r.settings.level, r.settings.rounds, r.settings.drawSecs], ['A2', 1, 60]);
  const pk = (await req('GET', `/api/draw/rooms/${r.code}/peek`, { token: b.token })).body;
  assert.strictEqual(pk.open, true); assert.strictEqual(pk.players, 1); assert.strictEqual(pk.status, 'waiting');
  assert.ok(!JSON.stringify(pk).includes('@'), 'peek ไม่มีอีเมล');
  const j = await req('POST', `/api/draw/rooms/${r.code.toLowerCase()}/join`, { token: b.token });
  assert.strictEqual(j.status, 200); assert.strictEqual(j.body.players.length, 2);
  assert.ok(!j.raw.includes('@gmail.com'), 'ข้อมูลห้องไม่มีอีเมล');
  await pool.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [a.id, blocked.id]);
  assert.strictEqual((await req('POST', `/api/draw/rooms/${r.code}/join`, { token: blocked.token })).status, 403, 'บล็อกกัน = เข้าห้องเดียวกันไม่ได้');
  assert.strictEqual((await req('POST', '/api/draw/rooms/ZZZZZ/join', { token: b.token })).status, 404);
  // เต็ม 8 คน
  const extra = [];
  for (let i = 0; i < 6; i++) extra.push(await makeUser('dx'));
  for (const u of extra) assert.strictEqual((await req('POST', `/api/draw/rooms/${r.code}/join`, { token: u.token })).status, 200);
  const ninth = await makeUser('dx');
  assert.strictEqual((await req('POST', `/api/draw/rooms/${r.code}/join`, { token: ninth.token })).body.code, 'FULL');
  assert.strictEqual((await req('GET', `/api/draw/rooms/${r.code}/peek`, { token: ninth.token })).body.status, 'full');
  for (const u of [a, b, ...extra]) await req('POST', '/api/draw/leave', { token: u.token });
  assert.strictEqual((await req('GET', `/api/draw/rooms/${r.code}/peek`, { token: a.token })).body.open, false, 'ทุกคนออก = ห้องปิด');
});

test('เกม: คำส่งให้คนวาดคนเดียว · คนทายเห็นแค่ช่องว่าง · เส้นวาดเฉพาะคนวาด · ทายถูกไม่ถูกส่งต่อ · คนวาดพิมพ์คำตอบไม่ได้ · เฉลย', async () => {
  const a = await connect(await makeUser()); const b = await connect(await makeUser()); const c = await connect(await makeUser());
  const r = (await req('POST', '/api/draw/rooms', { token: a.token, body: { level: 'A1', rounds: 1 } })).body;
  await req('POST', `/api/draw/rooms/${r.code}/join`, { token: b.token });
  await req('POST', `/api/draw/rooms/${r.code}/join`, { token: c.token });
  b.send('draw:start');
  await waitFor(() => b.last('draw:error'));
  assert.strictEqual(b.last('draw:error').code, 'NOT_HOST');
  a.send('draw:start');
  const st = await waitFor(() => a.all('draw:state').find((m) => m.phase === 'choosing'));
  const drawerId = st.turn.drawerId;
  const U = { [a.id]: a, [b.id]: b, [c.id]: c };
  const drawer = U[drawerId]; const [g1, g2] = [a, b, c].filter((u) => u.id !== drawerId);
  const dState = await waitFor(() => drawer.all('draw:state').find((m) => m.phase === 'choosing'));
  assert.strictEqual(dState.turn.choices.length, 3);
  const gState = await waitFor(() => g1.all('draw:state').find((m) => m.phase === 'choosing'));
  assert.ok(!gState.turn.choices, 'คนทายไม่เห็นตัวเลือกคำ');
  drawer.send('draw:choose', { index: 1 });
  const word = dState.turn.choices[1].word;
  const dd = await waitFor(() => drawer.all('draw:state').find((m) => m.phase === 'drawing'));
  assert.strictEqual(dd.turn.word, word);
  const gd = await waitFor(() => g1.all('draw:state').find((m) => m.phase === 'drawing'));
  assert.ok(!gd.turn.word && /^_+$/.test(gd.turn.mask) && gd.turn.mask.length === word.length);
  assert.ok(!g1.raw().includes(`"${word}"`), 'คนทายไม่ได้รับคำในข้อมูลใด ๆ');
  // เส้นวาด: คนทายส่งไม่ได้ · พิกัดเกินถูกตัด · ของคนวาดส่งต่อ
  g1.send('draw:stroke', { s: { id: 1, c: 0, w: 1, p: [[10, 10], [20, 20]] } });
  drawer.send('draw:stroke', { s: { id: 2, c: 0, w: 1, p: [[10, 10], [5000, 20]] } });
  drawer.send('draw:stroke', { s: { id: 3, c: 1, w: 2, p: [[100, 100], [200, 150], [300, 120]] } });
  await waitFor(() => g2.last('draw:stroke'));
  await sleep(150);
  assert.deepStrictEqual(g2.all('draw:stroke').map((m) => m.s.id), [3]);
  assert.deepStrictEqual(D._rooms.get(r.code).turn.strokes.map((s) => s.id), [3]);
  // คนวาดพิมพ์คำตอบลงแชท = ไม่ส่งต่อ
  drawer.send('draw:guess', { text: `it is ${word}` });
  await sleep(300);
  assert.ok(!g1.all('draw:chat').some((m) => String(m.text).includes(word)), 'คนวาดบอกคำในแชทไม่ได้');
  // ทายผิด = ส่งต่อ · ทายถูก = ไม่ส่งข้อความ มีแค่ "ทายถูกแล้ว"
  g1.send('draw:guess', { text: 'definitelywrong' });
  await waitFor(() => g2.all('draw:chat').find((m) => m.text === 'definitelywrong'));
  await sleep(700);
  g1.send('draw:guess', { text: ` ${word.toUpperCase()} ` });
  const gg = await waitFor(() => g2.last('draw:guessed'));
  assert.strictEqual(gg.userId, g1.id); assert.ok(gg.pts > 100 && gg.first);
  assert.ok(!g2.all('draw:chat').some((m) => String(m.text || '').toLowerCase().includes(word)), 'คำตอบที่ถูกไม่ถูกส่งให้คนที่ยังไม่ทาย');
  assert.strictEqual((await waitFor(() => g1.last('draw:word'))).word, word, 'ทายถูกแล้วได้เห็นคำ');
  // ช่องคนที่ทายถูกแล้ว: g2 (ยังไม่ทาย) ไม่เห็น
  await sleep(700);
  g1.send('draw:guess', { text: 'nice drawing' });
  await waitFor(() => drawer.all('draw:chat').find((m) => m.text === 'nice drawing'));
  assert.ok(!g2.all('draw:chat').some((m) => m.text === 'nice drawing'), 'คนที่ยังไม่ทายไม่เห็นแชทของคนที่ทายถูก');
  // ใกล้แล้ว (ผิด 1 ตัวอักษร)
  await sleep(700);
  g2.send('draw:guess', { text: `${word.slice(0, -1)}q` });
  if (word.length >= 4) await waitFor(() => g2.last('draw:close'));
  await sleep(700);
  g2.send('draw:guess', { text: word });
  const rv = await waitFor(() => a.all('draw:state').find((m) => m.phase === 'reveal'));
  assert.strictEqual(rv.turn.reveal.word, word); assert.match(rv.turn.reveal.th, /[ก-๙]/);
  assert.ok(rv.turn.reveal.example.length > 5);
  for (const u of [a, b, c]) { await req('POST', '/api/draw/leave', { token: u.token }); u.ws.close(); }
});

test('แชทในห้อง: ข้อมูลติดต่อไม่ถูกส่ง · คำหยาบถูกปิด · ถูกปิดแชท = ข้อความไม่ถูกส่งต่อ', async () => {
  const a = await connect(await makeUser()); const b = await connect(await makeUser());
  const r = (await req('POST', '/api/draw/rooms', { token: a.token, body: {} })).body;
  await req('POST', `/api/draw/rooms/${r.code}/join`, { token: b.token });
  a.send('draw:guess', { text: 'add me line id 0812345678' });
  await waitFor(() => a.all('draw:chat').find((m) => m.sys && /ห้ามแชร์/.test(m.text)));
  await sleep(200);
  assert.ok(!b.all('draw:chat').some((m) => String(m.text || '').includes('0812345678')));
  await pool.query("INSERT INTO world_restrictions (user_id, kind, reason, ends_at) VALUES ($1, 'chat', 'test', NOW() + INTERVAL '1 hour')", [b.id]);
  await sleep(700);
  b.send('draw:guess', { text: 'hello everyone' });
  await waitFor(() => b.all('draw:chat').find((m) => m.sys && /จำกัดการแชท/.test(m.text)));
  await sleep(200);
  assert.ok(!a.all('draw:chat').some((m) => m.text === 'hello everyone'));
  // คำเชิญในแชทโลก: ถูกปิดแชท = ส่งไม่ได้
  await req('POST', '/api/draw/leave', { token: a.token });
  const r2 = (await req('POST', '/api/draw/rooms', { token: b.token, body: {} })).body;
  assert.ok(r2.code);
  const inv = await req('POST', '/api/draw/invite/world', { token: b.token });
  assert.strictEqual(inv.status, 403, 'ถูกปิดแชทส่งคำเชิญไม่ได้');
  for (const u of [a, b]) { await req('POST', '/api/draw/leave', { token: u.token }); u.ws.close(); }
});

test('คำเชิญในแชทโลก: ข้อความคงที่ + รหัสห้อง · ไม่มีอีเมล · ประวัติแชทมีการ์ด · ส่งถี่ไม่ได้ · ห้องปิดแล้วการ์ดบอกสถานะ', async () => {
  const a = await makeUser(); const b = await connect(await makeUser());
  const r = (await req('POST', '/api/draw/rooms', { token: a.token, body: { level: 'B1' } })).body;
  const inv = await req('POST', '/api/draw/invite/world', { token: a.token });
  assert.strictEqual(inv.status, 200, inv.raw);
  const m = inv.body.message;
  assert.deepStrictEqual(m.invite, { kind: 'draw', code: r.code });
  assert.match(m.body, new RegExp(`วาดทายศัพท์.*B1.*ห้อง ${r.code}`));
  assert.ok(!JSON.stringify(m).includes('@'), 'ไม่มีอีเมลในคำเชิญ');
  const got = await waitFor(() => b.inbox.find((x) => x.type === 'gchat:msg' && x.invite && x.invite.code === r.code));
  assert.ok(!JSON.stringify(got).includes(a.email));
  const h = (await req('GET', '/api/world-chat', { token: b.token })).body;
  const inH = h.messages.find((x) => x.invite && x.invite.code === r.code);
  assert.ok(inH, 'ประวัติแชทโลกมีการ์ดคำเชิญ');
  assert.strictEqual((await req('POST', '/api/draw/invite/world', { token: a.token })).status, 429, 'ชวนซ้ำภายใน 60 วินาทีไม่ได้');
  await req('POST', '/api/draw/leave', { token: a.token });
  await waitFor(() => b.all('draw:invite_state').find((x) => x.code === r.code && x.open === false));
  assert.strictEqual((await req('GET', `/api/draw/rooms/${r.code}/peek`, { token: b.token })).body.status, 'closed');
  b.ws.close();
});

test('เจ้าของห้องเตะได้ · ถูกเตะเข้าซ้ำไม่ได้ · ไม่ใช่เจ้าของเตะไม่ได้ · รายงานคนวาดเก็บเส้นเป็นหลักฐาน (ผู้ดูแลดูได้)', async () => {
  const a = await connect(await makeUser()); const b = await connect(await makeUser()); const c = await connect(await makeUser());
  const adm = await makeUser(); await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.id]);
  const r = (await req('POST', '/api/draw/rooms', { token: a.token, body: { rounds: 1 } })).body;
  await req('POST', `/api/draw/rooms/${r.code}/join`, { token: b.token });
  await req('POST', `/api/draw/rooms/${r.code}/join`, { token: c.token });
  b.send('draw:kick', { userId: c.id });
  await waitFor(() => b.all('draw:error').find((m) => m.code === 'NOT_HOST'));
  a.send('draw:start');
  const st = await waitFor(() => a.all('draw:state').find((m) => m.phase === 'choosing'));
  const U = { [a.id]: a, [b.id]: b, [c.id]: c };
  const drawer = U[st.turn.drawerId];
  drawer.send('draw:choose', { index: 0 });
  await waitFor(() => drawer.all('draw:state').find((m) => m.phase === 'drawing'));
  drawer.send('draw:stroke', { s: { id: 7, c: 2, w: 1, p: [[100, 100], [400, 400]] } });
  await sleep(200);
  const reporter = [a, b, c].find((u) => u.id !== drawer.id);
  const rp = await req('POST', '/api/draw/report', { token: reporter.token, body: { userId: drawer.id, reason: 'drawing', note: 'test' } });
  assert.strictEqual(rp.status, 200); assert.strictEqual(rp.body.evidence, true);
  const row = (await pool.query("SELECT r.id, r.details FROM user_reports r WHERE r.reporter_id = $1 AND r.reported_id = $2 ORDER BY id DESC LIMIT 1", [reporter.id, drawer.id])).rows[0];
  assert.match(row.details, /^\[วาดทายศัพท์\]/);
  assert.strictEqual((await req('GET', `/api/draw/admin/evidence/${row.id}`, { token: reporter.token })).status, 403);
  const ev = (await req('GET', `/api/draw/admin/evidence/${row.id}`, { token: adm.token })).body;
  assert.deepStrictEqual(ev.strokes.map((s) => s.id), [7]);
  assert.strictEqual((await req('POST', '/api/draw/report', { token: reporter.token, body: { userId: drawer.id, reason: 'drawing' } })).body.duplicate, true);
  // เตะ c (ถ้า c ไม่ใช่เจ้าของ — เจ้าของคือ a)
  a.send('draw:kick', { userId: c.id });
  await waitFor(() => c.last('draw:kicked'));
  assert.strictEqual((await req('POST', `/api/draw/rooms/${r.code}/join`, { token: c.token })).body.code, 'KICKED');
  for (const u of [a, b, c]) { await req('POST', '/api/draw/leave', { token: u.token }); u.ws.close(); }
});

test('จบเกม: สรุปผล · บันทึก draw_games · EXP ไม่เกินเพดานต่อวัน · เก็บคำเข้าคิวทบทวนไม่ให้ EXP · คนวาดหลุด = ข้ามตา', async () => {
  const a = await connect(await makeUser()); const b = await connect(await makeUser());
  // ใกล้เพดาน: มี EXP จากโหมดนี้ 195 แล้ววันนี้
  await pool.query("INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, 195, 'draw')", [b.id]);
  const r = (await req('POST', '/api/draw/rooms', { token: a.token, body: { rounds: 1 } })).body;
  await req('POST', `/api/draw/rooms/${r.code}/join`, { token: b.token });
  a.send('draw:start');
  const play = async (no) => {
    const st = await waitFor(() => a.all('draw:state').find((m) => m.phase === 'choosing' && m.turn.turnNo === no));
    const dr = st.turn.drawerId === a.id ? a : b; const gs = dr === a ? b : a;
    const cs = await waitFor(() => dr.all('draw:state').filter((m) => m.phase === 'choosing' && m.turn.turnNo === st.turn.turnNo).pop());
    dr.send('draw:choose', { index: 2 });
    await waitFor(() => gs.all('draw:state').find((m) => m.phase === 'drawing' && m.turn.turnNo === st.turn.turnNo));
    await sleep(650);
    gs.send('draw:guess', { text: cs.turn.choices[2].word });
    await waitFor(() => a.all('draw:state').find((m) => m.phase === 'reveal' && m.turn.turnNo === st.turn.turnNo));
    return cs.turn.choices[2].word;
  };
  const w1 = await play(1); const w2 = await play(2);
  const end = await waitFor(() => a.all('draw:state').find((m) => m.phase === 'ended'), 6000);
  assert.strictEqual(end.result.players.length, 2);
  assert.deepStrictEqual(end.result.words.map((x) => x.word).sort(), [w1, w2].sort());
  await sleep(500);
  const g = (await pool.query('SELECT id, turns, players FROM draw_games WHERE room_code = $1', [r.code])).rows[0];
  assert.deepStrictEqual([g.turns, g.players], [2, 2]);
  const bExp = (await pool.query("SELECT COALESCE(SUM(amount),0)::int AS n FROM exp_log WHERE user_id = $1 AND reason = 'draw'", [b.id])).rows[0].n;
  assert.strictEqual(bExp, 200, 'ไม่เกินเพดาน 200 ต่อวัน');
  const aExp = (await pool.query("SELECT COALESCE(SUM(amount),0)::int AS n FROM exp_log WHERE user_id = $1 AND reason = 'draw'", [a.id])).rows[0].n;
  assert.ok(aExp >= 8 + 3 + 10, `a ได้ EXP ${aExp}`);
  const e0 = (await pool.query('SELECT exp FROM users WHERE id = $1', [a.id])).rows[0].exp;
  const sv = (await req('POST', '/api/draw/save-words', { token: a.token })).body;
  assert.strictEqual(sv.saved, 2);
  const wp = (await pool.query("SELECT COUNT(*)::int AS n FROM word_progress wp JOIN vocab_senses s ON s.public_id = wp.word_id WHERE wp.user_id = $1 AND s.id = ANY($2::text[])",
    [a.id, end.result.words.map((x) => x.senseId)])).rows[0].n;
  assert.strictEqual(wp, 2, 'คำเข้าคิวทบทวน');
  assert.strictEqual((await pool.query('SELECT exp FROM users WHERE id = $1', [a.id])).rows[0].exp, e0, 'เก็บคำไม่ให้ EXP');
  // เล่นอีกรอบ แล้วคนวาดหลุด -> ข้ามตา
  a.send('draw:rematch');
  await waitFor(() => a.all('draw:state').filter((m) => m.phase === 'lobby').length >= 1);
  const c = await connect(await makeUser());
  await req('POST', `/api/draw/rooms/${r.code}/join`, { token: c.token });
  a.inbox.length = 0;
  a.send('draw:start');
  const st = await waitFor(() => a.all('draw:state').find((m) => m.phase === 'choosing'));
  const U = { [a.id]: a, [b.id]: b, [c.id]: c };
  const dr = U[st.turn.drawerId];
  if (dr !== a) {
    dr.ws.close();
    await waitFor(() => a.all('draw:state').find((m) => m.phase === 'reveal' && m.turn.reveal.why === 'drawer_left'), 5000);
  }
  for (const u of [a, b, c]) { await req('POST', '/api/draw/leave', { token: u.token }); try { u.ws.close(); } catch (_) { /* - */ } }
});

test('ไม่มีชื่อไฟล์ World เดิมกลับมา', () => {
  for (const f of ['routes/world.js', 'services/world', 'public/js/world.js']) assert.ok(!fs.existsSync(path.join(ROOT, f)), f);
});

test('v1.21.0 รายการห้องที่เปิดอยู่: ห้องสาธารณะเห็นและกดเข้าได้ · ห้องส่วนตัว/เต็ม/บล็อกกัน/ไม่มีคนออนไลน์ ไม่แสดง · ไม่มีอีเมล', async () => {
  D._reset(); D.init();
  const host = await connect(await makeUser('rl'));
  const viewer = await connect(await makeUser('rv'));
  const blockedU = await connect(await makeUser('rb'));
  const priv = await connect(await makeUser('rp'));
  assert.strictEqual((await req('GET', '/api/draw/rooms')).status, 401);
  const pub = await req('POST', '/api/draw/rooms', { token: host.token, body: { level: 'A2' } });   // ไม่ส่ง public = สาธารณะ
  assert.strictEqual(pub.body.settings.isPublic, true);
  const pr = await req('POST', '/api/draw/rooms', { token: priv.token, body: { public: false } });
  assert.strictEqual(pr.body.settings.isPublic, false);
  let L = await req('GET', '/api/draw/rooms', { token: viewer.token });
  assert.strictEqual(L.status, 200);
  const row = L.body.rooms.find((r) => r.code === pub.body.code);
  assert.ok(row, 'เห็นห้องสาธารณะ');
  assert.strictEqual(row.players, 1); assert.strictEqual(row.max, D.CFG.maxPlayers); assert.strictEqual(row.status, 'waiting');
  assert.strictEqual(row.level, 'A2'); assert.strictEqual(row.host.username, host.name); assert.strictEqual(row.mine, false);
  assert.ok(!L.body.rooms.some((r) => r.code === pr.body.code), 'ห้องส่วนตัวไม่แสดง');
  assert.ok(!L.raw.includes('@gmail.com') && !L.raw.includes('email'), 'ไม่มีอีเมล');
  assert.deepStrictEqual(Object.keys(row.host).sort(), ['avatar', 'avatarImage', 'id', 'level', 'username']);
  // กดเข้าร่วมจากรายการ (ใช้รหัสจากรายการ — ไม่ต้องพิมพ์เอง)
  const j = await req('POST', `/api/draw/rooms/${row.code}/join`, { token: viewer.token, body: {} });
  assert.strictEqual(j.status, 200);
  L = await req('GET', '/api/draw/rooms', { token: viewer.token });
  const mine = L.body.rooms.find((r) => r.code === pub.body.code);
  assert.strictEqual(mine.players, 2); assert.strictEqual(mine.mine, true);
  // บล็อกกับคนในห้อง (ทางใดทางหนึ่ง) → ไม่เห็นห้อง
  await pool.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [host.id, blockedU.id]);
  L = await req('GET', '/api/draw/rooms', { token: blockedU.token });
  assert.ok(!L.body.rooms.some((r) => r.code === pub.body.code), 'บล็อกกันไม่เห็นห้อง');
  // เจ้าของห้องเปลี่ยนเป็นส่วนตัว → หายจากรายการ
  host.send('draw:settings', { public: false }); await sleep(250);
  L = await req('GET', '/api/draw/rooms', { token: priv.token });
  assert.ok(!L.body.rooms.some((r) => r.code === pub.body.code), 'เปลี่ยนเป็นส่วนตัวแล้วไม่แสดง');
  host.send('draw:settings', { public: true }); await sleep(250);
  L = await req('GET', '/api/draw/rooms', { token: priv.token });
  assert.ok(L.body.rooms.some((r) => r.code === pub.body.code), 'เปลี่ยนกลับเป็นสาธารณะแล้วแสดง');
  // ห้องเต็ม → ไม่แสดง
  const room = D._rooms.get(pub.body.code);
  for (let i = room.players.size; i < D.CFG.maxPlayers; i += 1) room.players.set(-1000 - i, { id: -1000 - i, username: `x${i}`, connected: false });
  L = await req('GET', '/api/draw/rooms', { token: priv.token });
  assert.ok(!L.body.rooms.some((r) => r.code === pub.body.code), 'ห้องเต็มไม่แสดง');
  for (const k of [...room.players.keys()]) if (k < 0) room.players.delete(k);
  // ไม่มีใครออนไลน์ในห้อง → ไม่แสดง
  for (const p of room.players.values()) p.connected = false;
  L = await req('GET', '/api/draw/rooms', { token: priv.token });
  assert.ok(!L.body.rooms.some((r) => r.code === pub.body.code), 'ไม่มีคนออนไลน์ไม่แสดง');
  for (const u of [host, viewer, blockedU, priv]) u.ws.close();
});
