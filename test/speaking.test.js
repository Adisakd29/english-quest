/*
  Speaking (ฝึกพูด) — ตัวให้คะแนน + API
  - ตัวให้คะแนน: ตรงคำ · คำย่อ/ตัวเลข/คำพ้องเสียง · ใกล้เคียง · ตกหล่น · คำเกิน · หลายตัวเลือก
  - API: เนื้อหามาจากบทเรียนเดิม · ต้องล็อกอิน · ตรวจ itemId/คะแนน · บันทึกคะแนนดีที่สุด · EXP ครั้งเดียว + เพดานรายวัน · ไม่มี Coin
  - ฟังแล้วพิมพ์: เซิร์ฟเวอร์ตรวจเอง (คะแนนที่ client ส่งมาไม่ถูกใช้)
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');
const SC = require('../public/js/speak-score');

let server; let base;
function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(base + p, { method, headers }, (res) => {
      let buf = ''; res.on('data', (c) => { buf += c; });
      res.on('end', () => { let b = null; try { b = buf ? JSON.parse(buf) : null; } catch (_) { b = buf; } resolve({ status: res.statusCode, body: b }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function makeUser() {
  const name = `spk${Date.now() % 1e8}${Math.floor(Math.random() * 1e4)}`.slice(0, 20);
  const r = await req('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await req('GET', '/api/auth/me', { token: r.body.token });
  return { token: r.body.token, id: me.body.user.id };
}
test.before(async () => {
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((r) => server.close(r)); await pool.end(); });

test('ตัวให้คะแนน: ตรง · คำย่อ · ตัวเลข · คำพ้องเสียง · ใกล้เคียง · ตกหล่น · คำเกิน · หลายตัวเลือก', () => {
  assert.strictEqual(SC.score('I [[always]] brush my teeth before bed.', 'i always brush my teeth before bed').score, 100);
  assert.strictEqual(SC.score("I'm going to buy 6 eggs.", 'I am going to buy six eggs').score, 100, 'คำย่อ + ตัวเลข');
  assert.strictEqual(SC.score('I want two apples.', 'I want to apples').score, 100, 'คำพ้องเสียง two/to');
  assert.strictEqual(SC.score('He was born in 1995.', 'he was born in nineteen ninety five').score, 100, 'ปี');
  const close = SC.score('She usually walks to school.', 'she usually walk to school');
  assert.ok(close.score >= 85 && close.score < 100);
  assert.strictEqual(close.words.find((w) => w.text === 'walks').mark, 'close', 'เสียงท้ายหาย = ใกล้เคียง');
  const miss = SC.score('I always brush my teeth before bed.', 'I always brush my tea before bed');
  assert.strictEqual(miss.words.find((w) => w.text === 'teeth').mark, 'miss');
  assert.ok(SC.score('We often eat noodles.', 'we eat').score < 60, 'ตกหล่นหลายคำ');
  assert.strictEqual(SC.score('We often eat noodles.', '').score, 0);
  assert.ok(SC.score('We often eat noodles.', 'um we often eat uh noodles yeah').score >= 85, 'คำเกิน (um/uh) หักเล็กน้อย');
  assert.strictEqual(SC.score('banana', ['bandana', 'banana']).score, 100, 'เลือกตัวเลือกที่ดีที่สุด');
  assert.ok(SC.score('cat', 'dog').score === 0);
  assert.strictEqual(SC.band(95).id, 'excellent'); assert.strictEqual(SC.band(72).id, 'good'); assert.strictEqual(SC.band(10).id, 'retry');
});

test('เนื้อหา: ประโยค/คำศัพท์/บทสนทนา จากบทเรียนเดิมทุกระดับ · ต้องล็อกอิน', async () => {
  const u = await makeUser();
  assert.strictEqual((await req('GET', '/api/speak/meta')).status, 401);
  const m = await req('GET', '/api/speak/meta', { token: u.token });
  assert.strictEqual(m.status, 200);
  assert.deepStrictEqual(m.body.levels.map((l) => l.id), ['A1', 'A2', 'B1', 'B2', 'C1']);
  for (const l of m.body.levels) assert.ok(l.sentences >= 100 && l.dialogues >= 5, `${l.id} มีเนื้อหา`);
  const s = await req('GET', '/api/speak/sets?level=A1&kind=sentences', { token: u.token });
  assert.ok(s.body.sets.length >= 10 && s.body.sets[0].count > 0);
  const set = await req('GET', `/api/speak/sets/${encodeURIComponent(s.body.sets[0].id)}`, { token: u.token });
  assert.strictEqual(set.status, 200);
  const it = set.body.items[0];
  assert.ok(it.text && !it.text.includes('[[') && it.th, 'ประโยคสะอาด + คำแปลไทย');
  const d = await req('GET', '/api/speak/sets?level=A1&kind=dialogues', { token: u.token });
  const ds = await req('GET', `/api/speak/sets/${encodeURIComponent(d.body.sets[0].id)}`, { token: u.token });
  assert.strictEqual(ds.body.speakers.length, 2);
  assert.ok(ds.body.items.every((x) => ds.body.speakers.includes(x.speaker)));
  const w = await req('GET', '/api/speak/sets?level=A1&kind=words', { token: u.token });
  const ws = await req('GET', `/api/speak/sets/${encodeURIComponent(w.body.sets[0].id)}`, { token: u.token });
  assert.ok(ws.body.items.length === 10 && ws.body.items.every((x) => x.text && x.th), 'คำศัพท์ 10 คำ + คำแปล');
  assert.strictEqual((await req('GET', '/api/speak/sets?level=Z9&kind=words', { token: u.token })).status, 400);
  assert.strictEqual((await req('GET', '/api/speak/sets/nope', { token: u.token })).status, 404);
});

test('ผลการพูด: ตรวจค่า · เก็บคะแนนดีที่สุด · EXP ครั้งแรกที่ผ่านเท่านั้น · เพดานรายวัน · ไม่มี Coin', async () => {
  const u = await makeUser();
  const s = await req('GET', '/api/speak/sets?level=A2&kind=sentences', { token: u.token });
  const set = (await req('GET', `/api/speak/sets/${encodeURIComponent(s.body.sets[0].id)}`, { token: u.token })).body;
  const id = set.items[0].id;
  // v1.10.0 Phase 3: ส่งข้อความที่เบราว์เซอร์ได้ยิน → เซิร์ฟเวอร์ให้คะแนนเอง (ไม่รับคะแนนจากหน้าเว็บแล้ว)
  const text = set.items[0].text.replace(/\[\[|\]\]/g, '');
  for (const bad of [{ itemId: id, score: 100 }, { itemId: id, heard: 'x' }, { itemId: id, heard: [] }, { itemId: id, heard: [1] }, { itemId: id, heard: ['a'.repeat(301)] }, { itemId: id }]) {
    assert.strictEqual((await req('POST', '/api/speak/attempt', { token: u.token, body: bad })).status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await req('POST', '/api/speak/attempt', { token: u.token, body: { itemId: id, score: 100 } })).body.code, 'SEND_HEARD');
  assert.strictEqual((await req('POST', '/api/speak/attempt', { token: u.token, body: { itemId: 'x:fake', heard: ['hi'] } })).status, 404);
  const coin0 = (await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [u.id])).rows[0];
  const r1 = await req('POST', '/api/speak/attempt', { token: u.token, body: { itemId: id, heard: [text.split(/\s+/)[0]] } });
  assert.strictEqual(r1.status, 200); assert.strictEqual(r1.body.passed, false); assert.strictEqual(r1.body.exp, 0);
  assert.ok(Array.isArray(r1.body.words) && r1.body.words.some((w) => w.mark === 'miss'), 'บอกคำที่ฟังไม่ออก');
  const r2 = await req('POST', '/api/speak/attempt', { token: u.token, body: { itemId: id, heard: ['zzz', text.toLowerCase()] } });
  assert.strictEqual(r2.body.passed, true); assert.strictEqual(r2.body.exp, 2); assert.strictEqual(r2.body.best, 100, 'เลือกผลที่ดีที่สุดจากหลายแบบ');
  assert.ok(!JSON.stringify(r2.body).includes('zzz'), 'ไม่ส่งข้อความที่ได้ยินกลับ');
  const r3 = await req('POST', '/api/speak/attempt', { token: u.token, body: { itemId: id, heard: [text.split(/\s+/).slice(0, -1).join(' ')] } });
  assert.strictEqual(r3.body.exp, 0, 'ผ่านซ้ำไม่ได้ EXP'); assert.strictEqual(r3.body.best, 100, 'เก็บคะแนนดีที่สุด'); assert.strictEqual(r3.body.attempts, 3);
  // เพดานรายวัน 40 EXP: ผ่าน 25 ประโยคใหม่ → ได้ไม่เกิน 40
  const many = (await req('GET', '/api/speak/sets?level=A1&kind=sentences', { token: u.token })).body.sets;
  const ids = [];
  for (const st of many) { const x = (await req('GET', `/api/speak/sets/${encodeURIComponent(st.id)}`, { token: u.token })).body; ids.push(...x.items.map((i) => i.id)); if (ids.length >= 25) break; }
  let gained = 2;
  const textOf = {};
  for (const st of many) { const x = (await req('GET', `/api/speak/sets/${encodeURIComponent(st.id)}`, { token: u.token })).body; x.items.forEach((i) => { textOf[i.id] = i.text.replace(/\[\[|\]\]/g, ''); }); if (Object.keys(textOf).length >= 25) break; }
  for (const i of ids.slice(0, 25)) gained += (await req('POST', '/api/speak/attempt', { token: u.token, body: { itemId: i, heard: [textOf[i]] } })).body.exp;
  assert.strictEqual(gained, 40, `EXP จากการพูดวันนี้ไม่เกิน 40 (${gained})`);
  const coin1 = (await pool.query('SELECT balance FROM coin_wallets WHERE user_id = $1', [u.id])).rows[0];
  assert.deepStrictEqual(coin1, coin0, 'ไม่มี Coin จากการพูด');
  const sum = await req('GET', '/api/speak/summary', { token: u.token });
  assert.ok(sum.body.passed >= 26 && sum.body.tried >= 26 && sum.body.avg >= 80);
  // ไม่มีการเก็บเสียง/ข้อความที่ได้ยิน
  const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'speaking_progress'")).rows.map((r) => r.column_name);
  assert.ok(!cols.some((c) => /audio|transcript|heard|text/.test(c)), cols.join(','));
  // คนอื่นไม่เห็นคะแนนของเรา
  const v = await makeUser();
  const other = (await req('GET', `/api/speak/sets/${encodeURIComponent(s.body.sets[0].id)}`, { token: v.token })).body;
  assert.strictEqual(other.items[0].best, null);
});

test('ฟังแล้วพิมพ์: เซิร์ฟเวอร์ตรวจเอง (ไม่เชื่อคะแนนจาก client) · แสดงรายคำ + เฉลย', async () => {
  const u = await makeUser();
  const s = await req('GET', '/api/speak/sets?level=B1&kind=sentences', { token: u.token });
  const set = (await req('GET', `/api/speak/sets/${encodeURIComponent(s.body.sets[0].id)}`, { token: u.token })).body;
  const it = set.items[0];
  const wrong = await req('POST', '/api/speak/dictation', { token: u.token, body: { itemId: it.id, text: 'hello', score: 100 } });
  assert.strictEqual(wrong.status, 200); assert.ok(wrong.body.score < 40, 'ส่ง score มาเองไม่มีผล'); assert.strictEqual(wrong.body.answer, it.text);
  const right = await req('POST', '/api/speak/dictation', { token: u.token, body: { itemId: it.id, text: it.text.toUpperCase() } });
  assert.strictEqual(right.body.score, 100); assert.strictEqual(right.body.exp, 2);
  assert.ok(right.body.words.every((w) => w.mark === 'ok'));
  assert.strictEqual((await req('POST', '/api/speak/dictation', { token: u.token, body: { itemId: it.id, text: 5 } })).status, 400);
});
