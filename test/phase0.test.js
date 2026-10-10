/*
  ชุดทดสอบ Phase 0 — ความปลอดภัย + ไม่ให้ฟีเจอร์เดิมพัง (regression)
  รันด้วย: npm test
  ต้องมี PostgreSQL + ตั้ง TEST_DATABASE_URL (หรือใช้ DATABASE_URL)

  ชุดนี้เปิดเซิร์ฟเวอร์จริงบนพอร์ตสุ่ม แล้วยิง HTTP/WebSocket เหมือนผู้ใช้จริง
  ไม่ mock อะไร เพื่อให้ผลเชื่อถือได้
*/
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// ---- เตรียม env ให้ชี้ DB ทดสอบก่อน require โมดูลที่ใช้ config/db ----
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/eq_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-phase0';

const pool = require('../config/db');
const { createApp } = require('../app');

let server;
let base;
const LEGACY_TO_NEW = new Map();
// ID เดิม (A1-0010) -> ID ใหม่ (A1-S….) — ID ที่ไม่มีในแผนที่ (เช่น FAKE) คืนค่าเดิม
function N(legacyId) { return LEGACY_TO_NEW.get(legacyId) || legacyId; }

// ---- helper ยิง HTTP แบบสั้น ----
function reqRaw(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(base + path, { method, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch (_e) { /* non-json */ }
        resolve({ status: res.statusCode, body: json, raw: buf, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uniq(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function makeUser() {
  const name = uniq('u');
  const r = await reqRaw('POST', '/api/auth/register', {
    body: { username: name, email: `${name}@gmail.com`, password: 'password123' },
  });
  return { name, token: r.body && r.body.token, res: r };
}

// ---- เปิด/ปิดเซิร์ฟเวอร์รอบชุดทดสอบ ----
test.before(async () => {
  // ตรวจว่าต่อ DB ได้ ไม่งั้นข้ามทั้งชุด
  await pool.query('SELECT 1');
  // รัน migration จริง (เส้นทางเดียวกับ production)
  const { runMigrations } = require('../db/migrate');
  await runMigrations(pool);

  // แผนที่ ID เดิม -> ID ใหม่ (จากฐานข้อมูลจริง) ให้เทสต์เดิมใช้กับคำศัพท์ชุด Oxford
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (legacy_word_id) legacy_word_id, public_id FROM vocab_legacy_map
      WHERE sense_id IS NOT NULL ORDER BY legacy_word_id, public_id`
  );
  rows.forEach((r) => LEGACY_TO_NEW.set(r.legacy_word_id, r.public_id));

  const app = createApp();
  server = http.createServer(app);
  await new Promise((res) => server.listen(0, res));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((res) => server.close(res));
  await pool.end();
});

/* ============ AUTH ============ */
test('สมัครด้วยรหัสสั้นกว่า 8 ตัว ต้องถูกปฏิเสธ', async () => {
  const name = uniq('short');
  const r = await reqRaw('POST', '/api/auth/register', {
    body: { username: name, email: `${name}@gmail.com`, password: 'abc123' },
  });
  assert.strictEqual(r.status, 400);
});

test('สมัคร + ล็อกอิน + /me ทำงานครบ', async () => {
  const u = await makeUser();
  assert.strictEqual(u.res.status, 201);
  assert.ok(u.token, 'ต้องได้ token');

  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.user.username, u.name);
});

test('ล็อกอินผิดรัว ๆ โดนบล็อก (429)', async () => {
  const u = await makeUser();
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const r = await reqRaw('POST', '/api/auth/login', {
      body: { identifier: u.name, password: `wrong${i}` },
    });
    last = r.status;
  }
  assert.strictEqual(last, 429, 'ครั้งท้าย ๆ ต้องถูก rate limit');
});

test('logout-all เพิกถอน token เก่า แต่ token ใหม่ยังใช้ได้', async () => {
  const u = await makeUser();
  const out = await reqRaw('POST', '/api/auth/logout-all', { token: u.token });
  assert.strictEqual(out.status, 200);
  assert.ok(out.body.token, 'ต้องได้ token ใหม่');

  const oldOne = await reqRaw('GET', '/api/auth/me', { token: u.token });
  assert.strictEqual(oldOne.status, 401, 'token เก่าต้องใช้ไม่ได้');

  const newOne = await reqRaw('GET', '/api/auth/me', { token: out.body.token });
  assert.strictEqual(newOne.status, 200, 'token ใหม่ต้องใช้ได้');
});

/* ============ EXP / กันโกง ============ */
test('ตอบถูก (เซิร์ฟเวอร์ตัดสินเอง) ได้ EXP ครั้งแรก', async () => {
  const u = await makeUser();
  const r = await reqRaw('POST', '/api/progress/review', {
    token: u.token,
    body: { wordId: N('A1-0010'), level: 'A1', chosenWordId: N('A1-0010') },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.correct, true);
  assert.ok(r.body.gainedExp > 0, 'ตอบถูกครั้งแรกต้องได้ EXP');
});

test('ตอบผิด correct=false', async () => {
  const u = await makeUser();
  const r = await reqRaw('POST', '/api/progress/review', {
    token: u.token,
    body: { wordId: N('A1-0011'), level: 'A1', chosenWordId: N('A1-0012') },
  });
  assert.strictEqual(r.body.correct, false);
});

test('กันปั๊ม: คำเดิมซ้ำในวันเดียวไม่ได้ EXP', async () => {
  const u = await makeUser();
  const first = await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0013'), level: 'A1', chosenWordId: N('A1-0013') },
  });
  assert.ok(first.body.gainedExp > 0);
  const second = await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0013'), level: 'A1', chosenWordId: N('A1-0013') },
  });
  assert.strictEqual(second.body.gainedExp, 0, 'คำเดิมซ้ำต้องไม่ได้ EXP');
});

test('exploit: ยิง 30 ครั้งด้วยคำเดิม EXP ต้องไม่บานปลาย', async () => {
  const u = await makeUser();
  for (let i = 0; i < 30; i++) {
    const r = await reqRaw('POST', '/api/progress/review', {
      token: u.token, body: { wordId: N('A1-0014'), level: 'A1', chosenWordId: N('A1-0014') },
    });
    // ต้องตรวจว่าคำขอสำเร็จ — เดิมไม่ได้ตรวจ ทำให้เทสต์ผ่านทั้งที่ครั้งที่ 3+ พังเป็น 500 (บั๊ก SRS NaN)
    assert.strictEqual(r.status, 200, `ครั้งที่ ${i + 1} ต้องสำเร็จ (ได้ ${r.status})`);
  }
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  // ยิง 30 ครั้งคำเดียว ควรได้ EXP แค่ครั้งแรกครั้งเดียว (<= 20)
  assert.ok(me.body.user.exp <= 20, `EXP ต้องไม่บานปลาย แต่ได้ ${me.body.user.exp}`);
});

test('srs: ตอบถูกคำเดิมหลายครั้ง ช่วงทบทวนเพิ่มขึ้นและไม่พัง (บั๊ก NaN)', async () => {
  const u = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const intervals = [];
  for (let i = 0; i < 5; i++) {
    // จำลองว่าถึงกำหนดทบทวนแล้ว (ตอบก่อนถึงกำหนดจะไม่ขยายระยะ — P0-c)
    await pool.query("UPDATE word_progress SET srs_due_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1 AND word_id = $2",
      [me.body.user.id, N('A1-0015')]);
    const r = await reqRaw('POST', '/api/progress/review', {
      token: u.token, body: { wordId: N('A1-0015'), level: 'A1', chosenWordId: N('A1-0015') },
    });
    assert.strictEqual(r.status, 200, `ครั้งที่ ${i + 1} ต้องสำเร็จ`);
    const { rows } = await pool.query(
      'SELECT srs_interval, srs_ease::text AS ease FROM word_progress WHERE user_id = $1 AND word_id = $2',
      [me.body.user.id, N('A1-0015')]
    );
    assert.notStrictEqual(rows[0].ease, 'NaN', 'ease ต้องไม่เป็น NaN');
    intervals.push(rows[0].srs_interval);
  }
  assert.deepStrictEqual(intervals, [1, 3, 8, 22, 64], 'ช่วงทบทวนต้องเพิ่มขึ้นตามที่ออกแบบ');
});

test('srs: ตอบถูกคำที่รู้แล้ว (แม้สถานะ SRS ไม่สอดคล้อง) ต้องไม่ถูกลดสถานะ', async () => {
  const u = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  // จำลองคำที่รู้ก่อนมีระบบ SRS: status known แต่ srs_reps = 0
  await pool.query(
    "INSERT INTO word_progress (user_id, word_id, level, status, srs_reps, ever_known) VALUES ($1, $2, 'A1', 'known', 0, TRUE)",
    [me.body.user.id, N('A1-0016')]
  );
  const r = await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0016'), level: 'A1', chosenWordId: N('A1-0016') },
  });
  assert.strictEqual(r.status, 200);
  const { rows } = await pool.query('SELECT status FROM word_progress WHERE user_id = $1 AND word_id = $2',
    [me.body.user.id, N('A1-0016')]);
  assert.strictEqual(rows[0].status, 'known', 'ตอบถูกแล้วสถานะ known ต้องไม่ลดลง');
});

test('srs: ซ่อมข้อมูลที่เสีย (ease = NaN) ได้', async () => {
  const srs = require('../utils/srs');
  const n = srs.schedule({ reps: '2', ease: 'NaN', interval: '3', lapses: '0' }, true);
  assert.ok(Number.isFinite(n.ease) && Number.isFinite(n.interval) && !Number.isNaN(n.dueAt.getTime()));
});

test('กันโกง: chosenWordId ที่ไม่มีจริงถูกปฏิเสธ', async () => {
  const u = await makeUser();
  const r = await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0010'), level: 'A1', chosenWordId: 'FAKE-9999' },
  });
  assert.strictEqual(r.status, 400);
});

/* ============ TRANSLATE ============ */
test('/translate ต้องล็อกอิน', async () => {
  const no = await reqRaw('POST', '/api/translate', { body: { wordIds: [N('A1-0010')] } });
  assert.strictEqual(no.status, 401);

  const u = await makeUser();
  const yes = await reqRaw('POST', '/api/translate', {
    token: u.token, body: { wordIds: [N('A1-0010')] },
  });
  assert.strictEqual(yes.status, 200);
});

/* ============ SECURITY HEADERS ============ */
test('มี security headers', async () => {
  const r = await reqRaw('GET', '/api/health');
  assert.strictEqual(r.headers['x-frame-options'], 'DENY');
  assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
});

/* ============ FRIENDS ============ */
test('ค้นหาเพื่อนด้วย wildcard "_" ไม่กวาดทุกคน', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/friends/search?q=' + encodeURIComponent('__'), { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.results.length, 0, '_ ต้องถูก escape ไม่ใช่ wildcard');
});

test('เพิ่มเพื่อน + ตอบรับ ทำงานครบ', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const reqAdd = await reqRaw('POST', '/api/friends/request', {
    token: a.token, body: { username: b.name },
  });
  assert.strictEqual(reqAdd.status, 200);

  const pending = await reqRaw('GET', '/api/friends/requests', { token: b.token });
  assert.strictEqual(pending.body.incoming.length, 1);
  const fid = pending.body.incoming[0].friendshipId;

  const accept = await reqRaw('POST', `/api/friends/${fid}/accept`, { token: b.token });
  assert.strictEqual(accept.status, 200);

  const list = await reqRaw('GET', '/api/friends', { token: a.token });
  assert.ok(list.body.friends.some((f) => f.username === b.name), 'ต้องเป็นเพื่อนกันแล้ว');
});

/* ============ GRAMMAR (regression) ============ */
test('แกรมม่ามี 16 บท และดึงข้อสอบได้', async () => {
  const u = await makeUser();
  const list = await reqRaw('GET', '/api/grammar', { token: u.token });
  assert.strictEqual(list.body.chapters.length, 16);

  const quiz = await reqRaw('GET', '/api/grammar/tenses/quiz?mode=basic', { token: u.token });
  assert.ok(quiz.body.quiz.length > 0, 'ต้องมีข้อสอบ');
  // เฉลยต้องไม่หลุดมากับคำถาม
  assert.ok(quiz.body.quiz.every((q) => q.correctIndex === undefined), 'เฉลยต้องไม่รั่ว');
});


// ทำแบบฝึกแกรมม่าผ่าน attempt: ตรวจทีละข้อ (ล็อกคำตอบ) แล้วส่งผล
async function doGrammarQuiz(u, chapter, mode, pick = () => 0) {
  const quiz = await reqRaw('GET', `/api/grammar/${chapter}/quiz?mode=${mode}`, { token: u.token });
  for (let i = 0; i < quiz.body.quiz.length; i++) {
    await reqRaw('POST', `/api/grammar/${chapter}/check`, { token: u.token, body: { attemptId: quiz.body.attemptId, index: i, choice: pick(i) } });
  }
  const sub = await reqRaw('POST', `/api/grammar/${chapter}/submit`, { token: u.token, body: { attemptId: quiz.body.attemptId } });
  return { quiz, sub };
}

test('ส่งข้อสอบแกรมม่าแล้วเซิร์ฟเวอร์ตรวจให้', async () => {
  const u = await makeUser();
  const { quiz, sub } = await doGrammarQuiz(u, 'tenses', 'basic');
  assert.strictEqual(sub.status, 200);
  assert.ok(typeof sub.body.score === 'number');
  assert.strictEqual(sub.body.total, quiz.body.quiz.length);
});

/* ============ WORDS / LEADERBOARD (regression) ============ */
test('ดึงคำศัพท์ A1 ได้', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/words/A1', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.total > 0);
});

test('leaderboard ใช้งานได้', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/leaderboard', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body.top));
});

/* ============ WORDS จาก DB (Phase 1B-2) ============ */
test('คำศัพท์ถูกย้ายเข้า DB ครบ 5,322 คำ', async () => {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM words');
  assert.strictEqual(rows[0].n, 5322, 'ตาราง words ต้องมี 5,322 คำ');
});

test('/words/levels นับจาก DB ถูกต้อง', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/words/levels', { token: u.token });
  // จำนวน sense ของ Oxford ต่อระดับ (ตรงกับต้นฉบับ PDF — ดู reports/vocab_validation.md)
  assert.strictEqual(r.body.counts.A1, 1075);
  assert.strictEqual(r.body.counts.B2, 1570);
  assert.strictEqual(r.body.counts.C1, 1402);
});

test('/words/:level คืน field ครบเหมือนเดิม', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/words/A1', { token: u.token });
  assert.strictEqual(r.body.total, 1075);
  const w = r.body.words[0];
  assert.match(w.id, /^A1-S\d{4}$/, 'ID ต้องเป็นรูปแบบใหม่');
  // ต้องมี field เดิมครบ ไม่งั้น frontend/flashcard จะพัง
  assert.ok(w.id && w.word && w.category && w.level, 'field หลักต้องครบ');
  assert.ok('status' in w, 'ต้องมี status (merge จาก progress)');
});

/* ============ SRS (Phase 2A) ============ */
test('SRS: ตอบถูกครั้งแรก = known ทันที (นับความคืบหน้า) · ตอบผิด = learning', async () => {
  const u = await makeUser();
  const r1 = await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0020'), level: 'A1', chosenWordId: N('A1-0020') },
  });
  assert.strictEqual(r1.body.status, 'known', 'ตอบถูกในแบบฝึก = รู้แล้ว ไม่ต้องวนกลับมาตอบซ้ำ');
  const bad = await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0021'), level: 'A1', chosenWordId: N('A1-0022') },
  });
  assert.strictEqual(bad.body.status, 'learning', 'ตอบผิด = ยังเรียนอยู่');
  // ครั้งที่ 2 ต้องตอบ "เมื่อถึงกำหนดทบทวน" (P0-c: ตอบซ้ำทันทีไม่นับเป็นการทบทวน)
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  await pool.query("UPDATE word_progress SET srs_due_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1 AND word_id = $2",
    [me.body.user.id, N('A1-0020')]);
  const r2 = await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0020'), level: 'A1', chosenWordId: N('A1-0020') },
  });
  assert.strictEqual(r2.body.status, 'known', 'ตอบถูกครั้งที่ 2 เมื่อถึงกำหนด = known');
});

test('SRS: answer_events ถูกบันทึกทุกคำตอบ', async () => {
  const u = await makeUser();
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0021'), level: 'A1', chosenWordId: N('A1-0021') },
  });
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0022'), level: 'A1', chosenWordId: N('A1-0099') },
  });
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n, bool_or(NOT correct) AS has_wrong FROM answer_events WHERE user_id = $1',
    [me.body.user.id]
  );
  assert.strictEqual(rows[0].n, 2, 'บันทึก 2 เหตุการณ์');
  assert.strictEqual(rows[0].has_wrong, true, 'บันทึกคำตอบผิดด้วย');
});

/* ============ Vocabulary V2 (Oxford source of truth) ============ */
test('vocab v2: ฐานข้อมูลตรงกับต้นฉบับทุก sense', async () => {
  const src = require('../data/oxford/senses.json');
  const { rows } = await pool.query('SELECT id, entry_id, pos, cefr, sense_label, source_list FROM vocab_senses');
  assert.strictEqual(rows.length, src.length);
  const db = new Map(rows.map((r) => [r.id, r]));
  const mismatch = src.filter((s) => {
    const r = db.get(s.senseId);
    return !r || r.entry_id !== s.entryId || r.pos !== s.pos || r.cefr !== s.cefr
      || (r.sense_label || null) !== (s.senseLabel || null) || r.source_list !== s.sourceList;
  });
  assert.deepStrictEqual(mismatch.map((s) => s.senseId), [], 'ทุก sense ต้องตรงต้นฉบับ');
  const { rows: e } = await pool.query('SELECT count(*)::int AS n FROM vocab_entries');
  assert.strictEqual(e[0].n, 4965);
});

test('vocab v2: import ซ้ำไม่เปลี่ยนอะไร และไม่ทับคำแปลที่คนตรวจแล้ว', async () => {
  const { importOxford } = require('../scripts/oxford/import');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE vocab_senses SET thai_meaning = 'ธนาคาร', translation_source = 'HUMAN_REVIEWED',
                        translation_status = 'reviewed' WHERE id = 'bank|noun|money'`);
    const r = await importOxford(client, { log: () => {} });
    assert.strictEqual(r.inserted, 0);
    assert.strictEqual(r.updated, 0, 'ต้นฉบับไม่เปลี่ยน ต้องไม่มีแถวถูกเขียนใหม่');
    const { rows } = await client.query("SELECT thai_meaning, translation_status FROM vocab_senses WHERE id = 'bank|noun|money'");
    assert.strictEqual(rows[0].thai_meaning, 'ธนาคาร');
    assert.strictEqual(rows[0].translation_status, 'reviewed');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test('vocab v2: ต้นฉบับเปลี่ยน -> อัปเดตเฉพาะที่เปลี่ยน, sense ที่หายไม่ถูกลบ', async () => {
  const { importOxford } = require('../scripts/oxford/import');
  const senses = JSON.parse(JSON.stringify(require('../data/oxford/senses.json')));
  senses.find((s) => s.senseId === 'bank|noun|money').cefr = 'A2';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await importOxford(client, { senses: senses.filter((s) => s.entryId !== 'achieve'), log: () => {} });
    assert.strictEqual(r.updated, 1);
    assert.deepStrictEqual(r.staleNotInSource, ['achieve|verb|-']);
    const { rows } = await client.query("SELECT count(*)::int AS n FROM vocab_senses WHERE entry_id = 'achieve'");
    assert.strictEqual(rows[0].n, 1, 'ห้ามลบ sense ที่อาจมีความก้าวหน้าผู้ใช้ผูกอยู่');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test('vocab v2: constraint ฐานข้อมูลปฏิเสธข้อมูลผิด', async () => {
  const bad = [
    "INSERT INTO vocab_senses (id, entry_id, pos, cefr, source_list) VALUES ('t1', 'bank', 'verb', 'D9', 'OXFORD_3000')",
    "INSERT INTO vocab_senses (id, entry_id, pos, cefr, source_list) VALUES ('t2', 'bank', 'blah', 'A1', 'OXFORD_3000')",
    "INSERT INTO vocab_senses (id, entry_id, pos, cefr, source_list) VALUES ('t3', 'bank', NULL, 'A1', 'OXFORD_3000')",
    "INSERT INTO vocab_senses (id, entry_id, pos, cefr, source_list, is_supplemental) VALUES ('t4', 'bank', 'noun', 'A1', 'OXFORD_3000', TRUE)",
  ];
  for (const sql of bad) {
    await assert.rejects(pool.query(sql), /check constraint/, sql);
  }
});

test('vocab v4b: ตารางคำศัพท์เดิมยังอยู่ครบ (ย้อนกลับได้) แต่แอปใช้ Oxford', async () => {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM words');
  assert.strictEqual(rows[0].n, 5322, 'ตาราง words เดิมต้องไม่ถูกลบ');
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/words/A1', { token: u.token });
  assert.strictEqual(r.body.total, 1075, 'API ต้องใช้คำศัพท์ Oxford');
});

test('thai v3: ทั้ง 5,947 sense ถูกนำเข้าครบเป็น AI_GENERATED/unreviewed — ไม่มีคำแปลใดอ้างว่ามาจาก Oxford', async () => {
  const { rows } = await pool.query(`SELECT count(*)::int AS n,
      count(*) FILTER (WHERE s.translation_source = 'AI_GENERATED' AND s.translation_status = 'unreviewed')::int AS ai,
      count(s.translation_note)::int AS flagged
    FROM vocab_senses s`);
  assert.strictEqual(rows[0].n, 5947, 'ทุก sense ต้องมีคำแปล');
  assert.strictEqual(rows[0].ai, 5947);
  assert.ok(rows[0].flagged > 0, 'คำที่ไม่มั่นใจต้องมีเหตุผลกำกับ');
  const { rows: o } = await pool.query("SELECT count(*)::int AS n FROM vocab_senses WHERE translation_source ILIKE '%oxford%'");
  assert.strictEqual(o[0].n, 0);
});

test('thai v3: นำเข้าซ้ำไม่ทับคำแปลที่คนตรวจแล้ว', async () => {
  const { applyThai } = require('../scripts/oxford/apply_thai');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE vocab_senses SET thai_meaning = 'ธนาคาร (ครูแก้)', translation_source = 'HUMAN_REVIEWED',
                        translation_status = 'reviewed' WHERE id = 'bank|noun|money'`);
    const r = await applyThai(client, { log: () => {} });
    assert.strictEqual(r.written, 0, 'ไม่มีอะไรเปลี่ยน ต้องไม่เขียนใหม่');
    assert.strictEqual(r.protected, 1);
    const { rows } = await client.query("SELECT thai_meaning FROM vocab_senses WHERE id = 'bank|noun|money'");
    assert.strictEqual(rows[0].thai_meaning, 'ธนาคาร (ครูแก้)');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

/* ============ V4a: ID สาธารณะ + แผนที่ ID เดิม ============ */
test('v4a: ทุก sense มี ID สาธารณะไม่ซ้ำ รูปแบบ A1-S0001 (ต่างจาก ID เดิม A1-0001)', async () => {
  const { rows } = await pool.query(`SELECT count(*)::int AS n, count(public_id)::int AS has,
      count(DISTINCT public_id)::int AS uniq,
      count(*) FILTER (WHERE public_id !~ '^(A1|A2|B1|B2|C1)-S[0-9]{4}$')::int AS bad,
      count(*) FILTER (WHERE substr(public_id, 1, 2) <> cefr)::int AS wrong_level
    FROM vocab_senses`);
  assert.deepStrictEqual(rows[0], { n: 5947, has: 5947, uniq: 5947, bad: 0, wrong_level: 0 });
});

test('v4a: ID สาธารณะไม่เปลี่ยนเมื่อ import ซ้ำ', async () => {
  const { importOxford } = require('../scripts/oxford/import');
  const before = (await pool.query("SELECT public_id FROM vocab_senses WHERE id = 'bank|noun|money'")).rows[0].public_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await importOxford(client, { log: () => {} });
    assert.strictEqual(r.newPublicIds, 0);
    const after = (await client.query("SELECT public_id FROM vocab_senses WHERE id = 'bank|noun|money'")).rows[0].public_id;
    assert.strictEqual(after, before);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test('v4a: ID เดิมทุกรายการจับคู่ได้ — ไม่มี unmatched', async () => {
  const { rows } = await pool.query(`SELECT
      (SELECT count(*) FROM words)::int AS legacy,
      count(DISTINCT legacy_word_id) FILTER (WHERE sense_id IS NOT NULL)::int AS mapped,
      count(*) FILTER (WHERE match_type = 'unmatched')::int AS unmatched
    FROM vocab_legacy_map`);
  assert.strictEqual(rows[0].mapped, rows[0].legacy);
  assert.strictEqual(rows[0].unmatched, 0);
});

test('v4a: คำพ้องรูปที่ชุดเดิมทิ้งเลข จับคู่ถูกตัว (tear n. = tear2 น้ำตา, ring v. = ring2)', async () => {
  const m = async (legacy) => (await pool.query(
    'SELECT array_agg(sense_id ORDER BY sense_id) AS s FROM vocab_legacy_map WHERE legacy_word_id = $1', [legacy]
  )).rows[0].s;
  const tearV = (await pool.query("SELECT id FROM words WHERE word = 'tear' AND pos = 'v., n.'")).rows[0].id;
  const tearN = (await pool.query("SELECT id FROM words WHERE word = 'tear' AND pos = 'n.'")).rows[0].id;
  assert.deepStrictEqual(await m(tearV), ['tear#1|noun|-', 'tear#1|verb|-']);
  assert.deepStrictEqual(await m(tearN), ['tear#2|noun|-'], 'tear n. ต้องเป็น tear2 (น้ำตา) ไม่ใช่ tear1 (ฉีก)');
  const ringV = (await pool.query("SELECT id FROM words WHERE word = 'ring' AND pos = 'v.' AND cefr = 'A2'")).rows[0].id;
  assert.deepStrictEqual(await m(ringV), ['ring#2|verb|-']);
});

test('v4a: ระดับที่ชุดเดิมผิด จับคู่ไปยังระดับตามต้นฉบับ (spare v. B2 -> C1)', async () => {
  const id = (await pool.query("SELECT id FROM words WHERE word = 'spare' AND pos = 'v.'")).rows[0].id;
  const { rows } = await pool.query(
    'SELECT m.match_type, s.cefr FROM vocab_legacy_map m JOIN vocab_senses s ON s.id = m.sense_id WHERE m.legacy_word_id = $1', [id]
  );
  assert.deepStrictEqual(rows, [{ match_type: 'cefr_corrected', cefr: 'C1' }]);
});

test('v4a: ย้ายเนื้อหาเสริม — ไม่ใส่ IPA ให้คำพ้องรูป และความหมายเฉพาะชนิดคำที่ตรง', async () => {
  const one = async (id) => (await pool.query('SELECT ipa, topic, simple_definition, pos FROM vocab_senses WHERE id = $1', [id])).rows[0];
  const bank = await one('bank|noun|money');
  assert.ok(bank.ipa && bank.topic, 'คำปกติต้องได้ IPA และหัวข้อ');
  assert.strictEqual((await one('live#2|adjective|-')).ipa, null, 'live2 /laɪv/ ต่างจาก live1 /lɪv/ — ห้ามใส่ IPA อัตโนมัติ');
  assert.strictEqual((await one('tear#2|noun|-')).ipa, null);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM vocab_senses s
      JOIN vocab_legacy_map m ON m.sense_id = s.id JOIN words w ON w.id = m.legacy_word_id
     WHERE s.simple_definition IS NOT NULL AND s.definition_source = 'WORDNET'
       AND s.pos <> (CASE w.category WHEN 'noun' THEN 'noun' WHEN 'verb' THEN 'verb'
                     WHEN 'adj' THEN 'adjective' WHEN 'adv' THEN 'adverb' END)
       AND (SELECT count(*) FROM vocab_legacy_map m2 WHERE m2.sense_id = s.id) = 1`);
  assert.strictEqual(rows[0].n, 0, 'ความหมาย WordNet ต้องอยู่เฉพาะ sense ที่ชนิดคำตรงกัน');
});

/* ============ V5: Vocabulary Browser ============ */
test('vocab browser: ค้น "bank" ได้ 2 sense แยกความหมายถูกต้อง', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/vocab/search?q=bank', { token: u.token });
  assert.strictEqual(r.status, 200);
  const banks = r.body.words.filter((w) => w.headword === 'bank');
  assert.deepStrictEqual(banks.map((w) => [w.senseLabel, w.cefr, w.thai]),
    [['money', 'A1', 'ธนาคาร'], ['river', 'B1', 'ตลิ่ง, ฝั่งแม่น้ำ']]);
});

test('vocab browser: ค้นด้วยภาษาไทยได้ และกรองระดับ/ชนิดคำ/รายการได้', async () => {
  const u = await makeUser();
  const th = await reqRaw('GET', `/api/vocab/search?q=${encodeURIComponent('ธนาคาร')}`, { token: u.token });
  assert.ok(th.body.words.some((w) => w.headword === 'bank'));
  const f = await reqRaw('GET', '/api/vocab/search?level=C1&source=OXFORD_5000_ADDITIONAL&pos=verb', { token: u.token });
  assert.ok(f.body.total > 0 && f.body.words.every((w) => w.cefr === 'C1' && w.pos === 'verb' && w.sourceList === 'OXFORD_5000_ADDITIONAL'));
  const all = await reqRaw('GET', '/api/vocab/search', { token: u.token });
  assert.deepStrictEqual(all.body.countsByLevel, { A1: 1075, A2: 993, B1: 907, B2: 1570, C1: 1402 });
});

test('vocab browser: สถานะ 4 แบบรวมกันเท่ากับคำทั้งหมด', async () => {
  const u = await makeUser();
  await reqRaw('POST', '/api/progress/review', { token: u.token, body: { wordId: N('A1-0017'), level: 'A1', chosenWordId: N('A1-0017') } });
  let sum = 0;
  for (const s of ['new', 'learning', 'reviewing', 'mastered']) {
    sum += (await reqRaw('GET', `/api/vocab/search?status=${s}`, { token: u.token })).body.total;
  }
  assert.strictEqual(sum, 5947);
  // ตอบถูกในแบบฝึก = รู้แล้ว -> แสดงเป็น "reviewing" (รู้แล้ว แต่ความจำยังไม่ถาวร) ไม่ใช่ learning
  const reviewing = await reqRaw('GET', '/api/vocab/search?status=reviewing', { token: u.token });
  assert.ok(reviewing.body.words.some((w) => w.id === N('A1-0017')));
});

test('vocab card: แสดงความหมายอื่นรวมคำพ้องรูป (close1 / close2)', async () => {
  const u = await makeUser();
  const s = await reqRaw('GET', '/api/vocab/search?q=close', { token: u.token });
  const closeV = s.body.words.find((w) => w.headword === 'close' && w.pos === 'verb');
  const d = await reqRaw('GET', `/api/vocab/${closeV.id}`, { token: u.token });
  assert.strictEqual(d.status, 200);
  assert.deepStrictEqual(d.body.otherSenses.map((o) => [o.homograph, o.pos]).sort(),
    [[1, 'noun'], [2, 'adjective'], [2, 'adverb']]);
  assert.ok(d.body.sourceRawEntry);
});

test('vocab card: ประเมินตัวเอง "รู้" ไม่ให้ EXP และไม่เปลี่ยนเป็นรู้แล้ว', async () => {
  const u = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const id = N('A1-0018');
  const r = await reqRaw('POST', `/api/vocab/${id}/rate`, { token: u.token, body: { rating: 'know' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.gainedExp, 0);
  const after = await reqRaw('GET', '/api/auth/me', { token: u.token });
  assert.strictEqual(after.body.user.exp, me.body.user.exp, 'EXP ต้องไม่เปลี่ยน');
  const { rows } = await pool.query('SELECT status FROM word_progress WHERE user_id = $1 AND word_id = $2', [me.body.user.id, id]);
  assert.notStrictEqual(rows[0].status, 'known', 'กด "รู้" เองต้องไม่ทำให้เป็นรู้แล้ว (กันปลดล็อก Unit โดยไม่เรียน)');
  const bad = await reqRaw('POST', `/api/vocab/${id}/rate`, { token: u.token, body: { rating: 'mastered' } });
  assert.strictEqual(bad.status, 400);
});

test('vocab browser: ต้องล็อกอิน และกรอง input ผิดรูปแบบ', async () => {
  assert.strictEqual((await reqRaw('GET', '/api/vocab/search')).status, 401);
  const u = await makeUser();
  assert.strictEqual((await reqRaw('GET', '/api/vocab/x;drop', { token: u.token })).status, 400);
  const w = await reqRaw('GET', `/api/vocab/search?q=${encodeURIComponent('%%')}&level=Z9&pos=hack`, { token: u.token });
  assert.strictEqual(w.status, 200);
  assert.strictEqual(w.body.total, 0, 'อักขระ % ต้องถูก escape ไม่ใช่ wildcard');
});

/* ============ V7: Google Sign-In ============ */
// จำลอง Google: credential รูปแบบ "fake:<sub>:<email>:<verified>"
const googleAuth = require('../utils/googleAuth');
function useFakeGoogle() {
  googleAuth.setVerifierForTests(async (cred) => {
    const m = /^fake:([^:]+):([^:]+):(true|false)$/.exec(cred);
    if (!m) { const e = new Error('bad'); e.code = 'INVALID_TOKEN'; throw e; }
    return { sub: m[1], email: m[2].toLowerCase(), emailVerified: m[3] === 'true', name: '<img src=x onerror=alert(1)>', picture: null };
  });
}
const gcred = (sub, email, verified = true) => `fake:${sub}:${email}:${verified}`;

test('google: ผู้ใช้ใหม่สมัครได้ — ไม่มีรหัสผ่าน, ชื่อผู้ใช้ผ่านกติกา, token ใช้ได้', async () => {
  useFakeGoogle();
  const email = `${uniq('gnew')}@gmail.com`;
  const r = await reqRaw('POST', '/api/auth/google', { body: { credential: gcred(uniq('sub'), email) } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.created, true);
  assert.match(r.body.user.username, /^[a-zA-Z0-9_]{3,20}$/, 'ชื่อผู้ใช้ต้องไม่มาจากชื่อ Google ตรง ๆ (กัน XSS)');
  const me = await reqRaw('GET', '/api/auth/me', { token: r.body.token });
  assert.strictEqual(me.body.user.googleLinked, true);
  assert.strictEqual(me.body.user.hasPassword, false);
});

test('google: ผู้ใช้เดิมที่เคยเชื่อมแล้ว เข้าสู่ระบบได้บัญชีเดิม', async () => {
  useFakeGoogle();
  const sub = uniq('sub');
  const email = `${uniq('gold')}@gmail.com`;
  const first = await reqRaw('POST', '/api/auth/google', { body: { credential: gcred(sub, email) } });
  const again = await reqRaw('POST', '/api/auth/google', { body: { credential: gcred(sub, email) } });
  assert.strictEqual(again.status, 200);
  assert.strictEqual(again.body.created, false);
  assert.strictEqual(again.body.user.id, first.body.user.id);
});

test('google: อีเมลตรงกับบัญชีเดิม -> ไม่เชื่อมอัตโนมัติ และไม่สร้างบัญชีซ้ำ', async () => {
  useFakeGoogle();
  const u = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const before = (await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
  const r = await reqRaw('POST', '/api/auth/google', { body: { credential: gcred(uniq('sub'), me.body.user.email) } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.code, 'ACCOUNT_EXISTS');
  assert.strictEqual(r.body.token, undefined, 'ต้องไม่ได้ token ของบัญชีเดิม');
  const after = (await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
  assert.strictEqual(after, before, 'ต้องไม่สร้างบัญชีซ้ำ');
  const ids = await pool.query('SELECT count(*)::int AS n FROM user_identities WHERE user_id = $1', [me.body.user.id]);
  assert.strictEqual(ids.rows[0].n, 0);
});

test('google: อีเมลที่ Google ยังไม่ยืนยัน / token ปลอม ถูกปฏิเสธ', async () => {
  useFakeGoogle();
  const unv = await reqRaw('POST', '/api/auth/google', { body: { credential: gcred(uniq('sub'), `${uniq('u')}@x.com`, false) } });
  assert.strictEqual(unv.status, 403);
  assert.strictEqual(unv.body.code, 'EMAIL_UNVERIFIED');
  const bad = await reqRaw('POST', '/api/auth/google', { body: { credential: 'forged.jwt.token' } });
  assert.strictEqual(bad.status, 401);
  assert.strictEqual(bad.body.code, 'AUTH_FAILED');
});

test('google: เชื่อมจากบัญชีเดิม (ผู้ใช้กดเอง) แล้วเข้าด้วย Google ได้บัญชีเดิม', async () => {
  useFakeGoogle();
  const u = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const sub = uniq('sub');
  const link = await reqRaw('POST', '/api/auth/google/link', { token: u.token, body: { credential: gcred(sub, me.body.user.email) } });
  assert.strictEqual(link.status, 200);
  const login = await reqRaw('POST', '/api/auth/google', { body: { credential: gcred(sub, me.body.user.email) } });
  assert.strictEqual(login.status, 200);
  assert.strictEqual(login.body.user.id, me.body.user.id);
  // บัญชี Google เดียวกันเชื่อมกับผู้ใช้อื่นไม่ได้
  const other = await makeUser();
  const steal = await reqRaw('POST', '/api/auth/google/link', { token: other.token, body: { credential: gcred(sub, 'x@gmail.com') } });
  assert.strictEqual(steal.status, 409);
  assert.strictEqual(steal.body.code, 'IDENTITY_IN_USE');
});

test('google: บัญชีที่ไม่มีรหัสผ่าน — ล็อกอินด้วยรหัสผ่านได้ 400 (ไม่ใช่ 500) และยกเลิกการเชื่อมไม่ได้', async () => {
  useFakeGoogle();
  const email = `${uniq('gonly')}@gmail.com`;
  const r = await reqRaw('POST', '/api/auth/google', { body: { credential: gcred(uniq('sub'), email) } });
  const login = await reqRaw('POST', '/api/auth/login', { body: { identifier: r.body.user.username, password: 'whatever123' } });
  assert.strictEqual(login.status, 400);
  assert.strictEqual(login.body.code, 'USE_GOOGLE');
  const unlink = await reqRaw('DELETE', '/api/auth/google/link', { token: r.body.token });
  assert.strictEqual(unlink.status, 400);
  assert.strictEqual(unlink.body.code, 'NEED_PASSWORD', 'ห้ามยกเลิกจนเข้าบัญชีไม่ได้');
});

test('google: ออกจากระบบทุกอุปกรณ์ทำให้ token จาก Google ใช้ไม่ได้', async () => {
  useFakeGoogle();
  const r = await reqRaw('POST', '/api/auth/google', { body: { credential: gcred(uniq('sub'), `${uniq('glo')}@gmail.com`) } });
  await reqRaw('POST', '/api/auth/logout-all', { token: r.body.token });
  const me = await reqRaw('GET', '/api/auth/me', { token: r.body.token });
  assert.strictEqual(me.status, 401);
});

test('google: ไม่ได้ตั้ง GOOGLE_CLIENT_ID -> config คืน null และ endpoint ตอบ 503', async () => {
  googleAuth.setVerifierForTests(null);
  const saved = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    const cfg = await reqRaw('GET', '/api/auth/config');
    assert.strictEqual(cfg.body.googleClientId, null);
    const r = await reqRaw('POST', '/api/auth/google', { body: { credential: 'x'.repeat(40) } });
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.body.code, 'NOT_CONFIGURED');
  } finally {
    if (saved) process.env.GOOGLE_CLIENT_ID = saved;
  }
});

/* ============ P0-a: บั๊กด่วน ============ */
test('p0a: เกณฑ์รหัสผ่านในหน้าเว็บตรงกับเซิร์ฟเวอร์ (เดิมหน้าเว็บ 6 / เซิร์ฟเวอร์ 8)', async () => {
  const cfg = await reqRaw('GET', '/api/auth/config');
  const min = cfg.body.minPasswordLength;
  assert.strictEqual(min, 8);
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const pwInputs = html.match(/<input[^>]*type="password"[^>]*autocomplete="new-password"[^>]*>/g) || [];
  assert.ok(pwInputs.length >= 3);
  for (const tag of pwInputs) {
    assert.match(tag, new RegExp(`minlength="${min}"`), `ช่องรหัสผ่านต้องใช้ minlength=${min}: ${tag}`);
  }
  assert.ok(!/อย่างน้อย [0-7] ตัวอักษร/.test(html), 'ข้อความในหน้าเว็บต้องไม่บอกเกณฑ์ต่ำกว่าเซิร์ฟเวอร์');
});

test('p0a: ไฟล์หน้าเว็บถูกบีบอัด gzip', async () => {
  const res = await new Promise((resolve, reject) => {
    const req = http.get(`${base}/js/app.js`, { headers: { 'Accept-Encoding': 'gzip' } }, resolve);
    req.on('error', reject);
  });
  res.resume();
  assert.strictEqual(res.headers['content-encoding'], 'gzip');
});

/* ============ P0-b: หน้า Home ============ */
test('p0b: /progress/home — เป้าหมายวันนี้นับคำตอบจริง และ Mastery ต้องมีข้อมูลพอก่อนแสดงตัวเลข', async () => {
  const u = await makeUser();
  const before = await reqRaw('GET', '/api/progress/home', { token: u.token });
  assert.strictEqual(before.status, 200);
  assert.strictEqual(before.body.today.answers, 0);
  assert.strictEqual(before.body.today.goal, 20);
  assert.strictEqual(before.body.mastery.vocab.accuracy, null, 'ยังไม่มีคำตอบ = ยังไม่พอประเมิน');
  assert.strictEqual(before.body.mastery.vocab.needed, 10);
  await reqRaw('POST', '/api/progress/review', { token: u.token, body: { wordId: N('A1-0020'), level: 'A1', chosenWordId: N('A1-0020') } });
  const after = await reqRaw('GET', '/api/progress/home', { token: u.token });
  assert.strictEqual(after.body.today.answers, 1);
  assert.strictEqual(after.body.mastery.vocab.accuracy, null, '1 ข้อยังไม่พอ — ห้ามแสดง 100%');
  assert.strictEqual(after.body.mastery.vocab.needed, 9);
});

test('p0b: จำนวนคำที่ต้องทบทวนบนหน้า Home ตรงกับหน้าทบทวน', async () => {
  const u = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  await pool.query(
    `INSERT INTO word_progress (user_id, word_id, level, status, srs_reps, srs_due_at)
     VALUES ($1, $2, 'A1', 'known', 2, NOW() - INTERVAL '1 day'), ($1, $3, 'A1', 'known', 2, NULL)`,
    [me.body.user.id, N('A1-0021'), N('A1-0022')]
  );
  const home = await reqRaw('GET', '/api/progress/home', { token: u.token });
  const due = await reqRaw('GET', '/api/progress/due', { token: u.token });
  assert.strictEqual(home.body.dueCount, due.body.total);
  assert.ok(home.body.dueCount >= 1);
});

/* ============ P0-c: Again / Hard / Good / Easy ============ */
async function reviewAs(u, wordId, chosen, rating) {
  return reqRaw('POST', '/api/progress/review', { token: u.token, body: { wordId, level: wordId.slice(0, 2), chosenWordId: chosen, rating } });
}
async function srsRow(u, wordId) {
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  return (await pool.query('SELECT status, srs_reps, srs_interval, srs_due_at FROM word_progress WHERE user_id = $1 AND word_id = $2',
    [me.body.user.id, wordId])).rows[0];
}

test('p0c: ตอบผิด = Again — กลับมาภายในไม่กี่นาที', async () => {
  const u = await makeUser();
  const r = await reviewAs(u, N('A1-0030'), N('A1-0031'), 'easy'); // ตอบผิดแต่ส่ง easy มา
  assert.strictEqual(r.body.correct, false);
  assert.strictEqual(r.body.schedule.rating, 'again', 'ตอบผิดต้องเป็น again เสมอ ไม่ว่าจะส่งระดับอะไรมา');
  const row = await srsRow(u, N('A1-0030'));
  const mins = (new Date(row.srs_due_at) - Date.now()) / 60000;
  assert.ok(mins > 5 && mins <= 10.5, `ควรกลับมาใน ~10 นาที (ได้ ${mins.toFixed(1)})`);
});

test('p0c: ตอบถูกก่อนถึงกำหนด ไม่ขยายระยะทบทวน (แก้ปัญหาตอบซ้ำในวันเดียว)', async () => {
  const u = await makeUser();
  const w = N('A1-0032');
  const first = await reviewAs(u, w, w, 'good');
  assert.strictEqual(first.body.schedule.early, false);
  const second = await reviewAs(u, w, w, 'good');
  assert.strictEqual(second.body.schedule.early, true);
  const row = await srsRow(u, w);
  assert.strictEqual(row.srs_interval, 1, 'ช่วงทบทวนต้องยังเป็น 1 วัน (เดิมจะกลายเป็น 3 วันภายในไม่กี่วินาที)');
  assert.strictEqual(row.status, 'known', 'ตอบถูก = รู้แล้ว (ตารางทบทวนไม่ขยาย แต่ความคืบหน้านับ)');
});

test('p0c: Hard / Good / Easy กำหนดระยะต่างกัน และ Easy ข้ามขั้นเป็นรู้แล้ว', async () => {
  const u = await makeUser();
  await reviewAs(u, N('A1-0033'), N('A1-0033'), 'hard');
  await reviewAs(u, N('A1-0034'), N('A1-0034'), 'good');
  await reviewAs(u, N('A1-0035'), N('A1-0035'), 'easy');
  const hard = await srsRow(u, N('A1-0033'));
  const good = await srsRow(u, N('A1-0034'));
  const easy = await srsRow(u, N('A1-0035'));
  assert.deepStrictEqual([hard.srs_interval, good.srs_interval, easy.srs_interval], [1, 1, 4]);
  assert.deepStrictEqual([hard.srs_reps, good.srs_reps], [0, 1], 'Hard อยู่ขั้นเดิม · Good ขึ้นขั้น');
  assert.strictEqual(easy.status, 'known');
});

test('p0c: ระดับที่เลือกไม่มีผลกับ EXP', async () => {
  const u = await makeUser();
  const a = await reviewAs(u, N('A1-0036'), N('A1-0036'), 'easy');
  const b = await reviewAs(u, N('A1-0037'), N('A1-0037'), 'hard');
  assert.strictEqual(a.body.gainedExp, b.body.gainedExp);
  assert.ok(a.body.gainedExp > 0);
});

/* ============ P0-e: ยืนยันอีเมล ============ */
// ดึง token ล่าสุดของผู้ใช้จาก log ไม่ได้ -> สร้าง token ทดสอบตรงในฐานข้อมูล (เก็บแค่ hash เหมือนระบบจริง)
async function makeVerifyToken(userId, hours = 24) {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + make_interval(hours => $3))`,
    [userId, crypto.createHash('sha256').update(token).digest('hex'), hours]
  );
  return token;
}

test('p0e: สวิตช์ปิด (ค่าเริ่มต้น) — สมัครแล้วใช้งานได้ทันที แต่ยังไม่ยืนยัน', async () => {
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
  const name = uniq('ev');
  const r = await reqRaw('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  assert.strictEqual(r.status, 201);
  assert.ok(r.body.token, 'สวิตช์ปิด = ได้ token ทันที (ระบบเดิมไม่พัง)');
  assert.strictEqual(r.body.user.emailVerified, false);
});

test('p0e: สวิตช์เปิด — สมัครแล้วไม่ได้ token, เข้าสู่ระบบไม่ได้จนกว่าจะยืนยัน', async () => {
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
  try {
    const name = uniq('evon');
    const r = await reqRaw('POST', '/api/auth/register', { body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.requiresVerification, true);
    assert.strictEqual(r.body.token, undefined, 'อีเมลปลอมต้องใช้งานทันทีไม่ได้');
    const login = await reqRaw('POST', '/api/auth/login', { body: { identifier: name, password: 'password123' } });
    assert.strictEqual(login.status, 403);
    assert.strictEqual(login.body.code, 'EMAIL_NOT_VERIFIED');
    const wrong = await reqRaw('POST', '/api/auth/login', { body: { identifier: name, password: 'wrongpass99' } });
    assert.strictEqual(wrong.status, 401, 'รหัสผิดต้องไม่บอกว่าบัญชีนี้รอยืนยัน (ไม่รั่วข้อมูล)');
    const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [name]);
    const v = await reqRaw('POST', '/api/auth/verify-email', { body: { token: await makeVerifyToken(rows[0].id) } });
    assert.strictEqual(v.status, 200);
    assert.ok(v.body.token, 'ยืนยันแล้วเข้าสู่ระบบทันที');
    assert.strictEqual(v.body.user.emailVerified, true);
    const again = await reqRaw('POST', '/api/auth/login', { body: { identifier: name, password: 'password123' } });
    assert.strictEqual(again.status, 200);
  } finally {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
  }
});

test('p0e: ผู้ใช้เดิมไม่ถูกล็อกเมื่อเปิดสวิตช์', async () => {
  const u = await makeUser(); // สมัครตอนสวิตช์ปิด
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
  try {
    const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
    const login = await reqRaw('POST', '/api/auth/login', { body: { identifier: me.body.user.username, password: 'password123' } });
    assert.strictEqual(login.status, 200);
  } finally {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
  }
});

test('p0e: ลิงก์ยืนยันใช้ได้ครั้งเดียว และหมดอายุได้', async () => {
  const u = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const t = await makeVerifyToken(me.body.user.id);
  assert.strictEqual((await reqRaw('POST', '/api/auth/verify-email', { body: { token: t } })).status, 200);
  const reuse = await reqRaw('POST', '/api/auth/verify-email', { body: { token: t } });
  assert.strictEqual(reuse.body.code, 'INVALID_LINK');
  const old = await makeVerifyToken(me.body.user.id, -1);
  assert.strictEqual((await reqRaw('POST', '/api/auth/verify-email', { body: { token: old } })).body.code, 'EXPIRED_LINK');
  assert.strictEqual((await reqRaw('POST', '/api/auth/verify-email', { body: { token: 'abc' } })).body.code, 'INVALID_LINK');
});

test('p0e: ขอส่งอีเมลยืนยันใหม่ ตอบเหมือนกันเสมอ (ไม่บอกว่ามีบัญชีหรือไม่)', async () => {
  const exists = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: exists.token });
  const a = await reqRaw('POST', '/api/auth/resend-verification', { body: { identifier: me.body.user.username } });
  const b = await reqRaw('POST', '/api/auth/resend-verification', { body: { identifier: 'no_such_user_xyz' } });
  assert.strictEqual(a.status, 200);
  assert.deepStrictEqual(a.body, b.body);
});

test('p0e: บัญชีที่สร้างด้วย Google ถือว่ายืนยันอีเมลแล้ว', async () => {
  useFakeGoogle();
  const r = await reqRaw('POST', '/api/auth/google', { body: { credential: gcred(uniq('sub'), `${uniq('gv')}@gmail.com`) } });
  assert.strictEqual(r.body.user.emailVerified, true);
});

/* ============ P1-2: สำรวจอิสระ ============ */
test('p1-2: โหมดสำรวจเปิด Unit ที่ล็อกเพื่อเรียนได้ แต่สอบ Unit และ Boss ยังถูกล็อก', async () => {
  const u = await makeUser();
  const path = await reqRaw('GET', '/api/path', { token: u.token });
  const lockedUnit = path.body.levels.find((l) => l.level === 'B2').units.find((x) => x.status === 'locked');
  assert.ok(lockedUnit, 'ผู้ใช้ใหม่ต้องมี Unit B2 ที่ล็อก');
  const normal = await reqRaw('GET', `/api/path/units/${lockedUnit.id}`, { token: u.token });
  assert.strictEqual(normal.status, 403, 'เส้นทางแนะนำ: Unit ที่ล็อกเปิดไม่ได้');
  const explore = await reqRaw('GET', `/api/path/units/${lockedUnit.id}?explore=1`, { token: u.token });
  assert.strictEqual(explore.status, 200, 'สำรวจอิสระ: เปิดเรียนได้');
  assert.strictEqual(explore.body.explored, true);
  assert.ok(explore.body.wordIds.length > 0);
  const test = await reqRaw('POST', `/api/assessments/unit/${lockedUnit.id}/start?explore=1`, { token: u.token });
  assert.strictEqual(test.status, 403, 'สอบ Unit ที่ล็อกยังไม่ได้ แม้ส่ง explore มา');
  const boss = await reqRaw('POST', '/api/assessments/boss/B2/start?explore=1', { token: u.token });
  assert.strictEqual(boss.status, 403, 'Boss ยังต้องผ่านเกณฑ์ตามลำดับ');
});

/* ============ P1-3: Leaderboard ============ */
test('p1-3: Weekly ให้ผู้ใช้ใหม่แข่งได้ — ผู้เล่นเก่าที่ไม่ได้เล่นสัปดาห์นี้ไม่ติดอันดับ', async () => {
  const veteran = await makeUser();
  const rookie = await makeUser();
  const vMe = (await reqRaw('GET', '/api/auth/me', { token: veteran.token })).body.user;
  const rMe = (await reqRaw('GET', '/api/auth/me', { token: rookie.token })).body.user;
  // ผู้เล่นเก่า: EXP สะสมมาก แต่ได้มาเมื่อเดือนก่อน
  await pool.query('UPDATE users SET exp = 99999 WHERE id = $1', [vMe.id]);
  await pool.query("INSERT INTO exp_log (user_id, amount, reason, created_at) VALUES ($1, 99999, 'old', NOW() - INTERVAL '40 days')", [vMe.id]);
  // ผู้ใช้ใหม่: เพิ่งเรียนวันนี้
  await reqRaw('POST', '/api/progress/review', { token: rookie.token, body: { wordId: N('A1-0040'), level: 'A1', chosenWordId: N('A1-0040') } });

  const week = await reqRaw('GET', '/api/leaderboard', { token: rookie.token }); // ค่าเริ่มต้น = week
  assert.strictEqual(week.body.period, 'week');
  const names = week.body.top.map((e) => e.username);
  assert.ok(names.includes(rMe.username), 'ผู้ใช้ใหม่ต้องติดอันดับสัปดาห์นี้');
  assert.ok(!names.includes(vMe.username), 'คะแนนเก่าไม่นับในสัปดาห์นี้');
  const all = await reqRaw('GET', '/api/leaderboard?period=all', { token: rookie.token });
  const allNames = all.body.top.map((e) => e.username);
  assert.ok(allNames.indexOf(vMe.username) < allNames.indexOf(rMe.username) || !allNames.includes(rMe.username),
    'ตลอดกาลยังเรียงตาม EXP สะสม');
  const vWeek = await reqRaw('GET', '/api/leaderboard', { token: veteran.token });
  assert.strictEqual(vWeek.body.me.score, 0, 'ตัวเองต้องแสดงเสมอ แม้ยังไม่มีคะแนนสัปดาห์นี้');
  assert.strictEqual(vWeek.body.me.rank, null);
});

test('p1-3: แท็บเพื่อน แสดงเฉพาะเพื่อนที่ยอมรับแล้ว + ตัวเอง และไม่เปิดเผยอีเมล', async () => {
  const a = await makeUser(); const b = await makeUser(); const stranger = await makeUser();
  const [ma, mb, ms] = await Promise.all([a, b, stranger].map(async (u) => (await reqRaw('GET', '/api/auth/me', { token: u.token })).body.user));
  await pool.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')", [ma.id, mb.id]);
  for (const u of [a, b, stranger]) {
    await reqRaw('POST', '/api/progress/review', { token: u.token, body: { wordId: N('A1-0041'), level: 'A1', chosenWordId: N('A1-0041') } });
  }
  const r = await reqRaw('GET', '/api/leaderboard?period=week&scope=friends', { token: a.token });
  const names = r.body.top.map((e) => e.username).sort();
  assert.deepStrictEqual(names, [ma.username, mb.username].sort());
  assert.ok(!names.includes(ms.username));
  assert.ok(r.body.top.every((e) => !('email' in e) && !('id' in e)), 'ห้ามเปิดเผยอีเมลหรือ id');
});

test('p1-3: ค่า period/scope แปลก ๆ ไม่ทำให้พัง (ใช้ค่าเริ่มต้น)', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', "/api/leaderboard?period=week';DROP TABLE users;--&scope=x", { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.period, 'week');
  assert.strictEqual(r.body.scope, 'global');
});

/* ============ P1-4: ผล Placement ============ */
async function placementAnswers(attemptId, strategy) {
  const { rows } = await pool.query('SELECT questions FROM placement_attempts WHERE id = $1', [attemptId]);
  return rows[0].questions.map((q, i) => strategy(q, i));
}

test('p1-4: ตอบถูกหมด -> จุดแข็งครบ, ไม่มีจุดที่ต้องฝึก, แนะนำ Unit จริงในระดับที่แนะนำ', async () => {
  const u = await makeUser();
  const st = await reqRaw('POST', '/api/placement/start', { token: u.token });
  const answers = await placementAnswers(st.body.attemptId, (q) => q.correctIndex);
  const r = await reqRaw('POST', `/api/placement/${st.body.attemptId}/submit`, { token: u.token, body: { answers } });
  assert.strictEqual(r.status, 200);
  const res = r.body.result;
  assert.ok(res.strengths.length > 0);
  assert.deepStrictEqual(res.practice, []);
  assert.ok(res.recommendedUnit, 'ต้องมี Unit ที่แนะนำ');
  assert.strictEqual(res.recommendedUnit.level, res.recommendedStart);
  assert.match(res.recommendedUnit.id, /^[A-C][12]-[a-z]+-\d+$/);
  const latest = await reqRaw('GET', '/api/placement/latest', { token: u.token });
  assert.deepStrictEqual(latest.body.result.strengths, res.strengths, 'เปิดผลดูภายหลังได้');
  assert.ok(latest.body.result.recommendedUnit);
});

test('p1-4: ข้ามแกรมม่าทั้งหมด -> "ควรฝึก" ระบุบทแกรมม่าที่ข้ามจริง', async () => {
  const u = await makeUser();
  const st = await reqRaw('POST', '/api/placement/start', { token: u.token });
  const answers = await placementAnswers(st.body.attemptId, (q) => (q.skill === 'vocab' ? q.correctIndex : null));
  const r = await reqRaw('POST', `/api/placement/${st.body.attemptId}/submit`, { token: u.token, body: { answers } });
  const res = r.body.result;
  assert.ok(res.practice.some((p) => p.startsWith('แกรมม่า: ')), 'ต้องบอกบทแกรมม่าที่ควรฝึก');
  assert.ok(res.strengths.every((s) => s.startsWith('คำศัพท์')), 'จุดแข็งต้องมาจากส่วนที่ตอบถูกจริง (คำศัพท์) เท่านั้น');
});

/* ============ P1-5: Grammar Learning Path ============ */
test('p1-5: /grammar/path จัดเป็นขั้นตามระดับ มีเวลา/จำนวนข้อ/ความคืบหน้า และแนะนำบทถัดไป', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/grammar/path', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.stages.map((st) => st.level), ['A1–A2', 'B1', 'B2', 'C1', 'TOEIC', 'TOEFL']);
  const basic = r.body.stages[0];
  assert.strictEqual(basic.total, 16);
  assert.ok(basic.chapters.every((c) => c.questions > 0 && c.minutes >= 3 && c.percent === 0 && c.mastery === null));
  assert.strictEqual(r.body.recommendedMode, 'basic');
  assert.strictEqual(r.body.next.chapterId, basic.chapters[0].id);
});

test('p1-5: ตรวจทีละข้อได้คำอธิบายทันที และคำตอบแรกถูกล็อก (เปลี่ยนไม่ได้)', async () => {
  const u = await makeUser();
  const quiz = await reqRaw('GET', '/api/grammar/nouns/quiz?mode=basic', { token: u.token });
  const first = await reqRaw('POST', '/api/grammar/nouns/check', { token: u.token, body: { attemptId: quiz.body.attemptId, index: 0, choice: 0 } });
  assert.strictEqual(first.status, 200);
  assert.ok(first.body.explain && first.body.correctAnswer, 'ต้องได้เฉลยและคำอธิบายทันที');
  const correct = first.body.correctIndex;
  // พยายามเปลี่ยนเป็นคำตอบที่ถูกหลังเห็นเฉลย -> ต้องไม่ได้
  const again = await reqRaw('POST', '/api/grammar/nouns/check', { token: u.token, body: { attemptId: quiz.body.attemptId, index: 0, choice: correct } });
  assert.strictEqual(again.body.chosenIndex, 0, 'คำตอบแรกต้องถูกล็อก');
});

test('p1-5: ดูเฉลยแล้วส่งคำตอบใหม่ทั้งชุดไม่ได้ — คะแนนมาจากคำตอบที่ล็อกเท่านั้น', async () => {
  const u = await makeUser();
  const quiz = await reqRaw('GET', '/api/grammar/nouns/quiz?mode=basic', { token: u.token });
  const n = quiz.body.quiz.length;
  const correctOnes = [];
  for (let i = 0; i < n; i++) {
    const c = await reqRaw('POST', '/api/grammar/nouns/check', { token: u.token, body: { attemptId: quiz.body.attemptId, index: i, choice: null } });
    correctOnes.push(c.body.correctIndex);
  }
  const sub = await reqRaw('POST', '/api/grammar/nouns/submit', { token: u.token, body: { attemptId: quiz.body.attemptId, answers: correctOnes, mode: 'basic' } });
  assert.strictEqual(sub.body.score, 0, 'ข้ามทุกข้อ = 0 คะแนน แม้ส่งเฉลยมาเอง');
  assert.strictEqual(sub.body.gainedExp, 0);
  const reuse = await reqRaw('POST', '/api/grammar/nouns/submit', { token: u.token, body: { attemptId: quiz.body.attemptId } });
  assert.strictEqual(reuse.status, 410, 'ส่งซ้ำด้วย attempt เดิมไม่ได้');
});

test('p1-5: Fill in the blank — พิมพ์คำตอบที่ถูกได้คะแนน (ไม่สนตัวพิมพ์)', async () => {
  const u = await makeUser();
  // หาบท/ระดับแรกที่มีข้อแบบช่องว่าง + คำตอบคำเดียว (ข้อมูลจริง)
  const { GRAMMAR_CHAPTERS } = require('../data/grammar');
  let ch = null; let mode = null;
  for (const c of GRAMMAR_CHAPTERS) {
    for (const [m, arr] of Object.entries(c.quiz)) {
      if (arr.some((x) => /_{2,}/.test(x.question) && x.choices.every((y) => !/\s/.test(String(y).trim())))) { ch = c; mode = m; break; }
    }
    if (ch) break;
  }
  assert.ok(ch, 'ข้อมูลต้องมีข้อที่พิมพ์ตอบได้');
  const quiz = await reqRaw('GET', `/api/grammar/${ch.id}/quiz?mode=${mode}`, { token: u.token });
  const i = quiz.body.quiz.findIndex((q) => q.typeable);
  assert.ok(i >= 0, 'endpoint ต้องบอกว่าข้อนี้พิมพ์ตอบได้');
  const q = ch.quiz[mode][i];
  const r = await reqRaw('POST', `/api/grammar/${ch.id}/check`, {
    token: u.token, body: { attemptId: quiz.body.attemptId, index: i, text: `  ${q.choices[q.correctIndex].toUpperCase()} ` },
  });
  assert.strictEqual(r.body.correct, true);
  assert.strictEqual(r.body.typedMatched, true);
});

/* ============ P1-7: Social Safety ============ */
async function meOf(u) { return (await reqRaw('GET', '/api/auth/me', { token: u.token })).body.user; }

test('p1-7: ความเป็นส่วนตัว — คนที่ไม่ใช่เพื่อนไม่เห็นสถานะออนไลน์/เวลาออนไลน์ล่าสุด และไม่เห็นอีเมล', async () => {
  const a = await makeUser(); const b = await makeUser();
  const mb = await meOf(b);
  const r = await reqRaw('GET', `/api/friends/search?q=${encodeURIComponent(mb.username)}`, { token: a.token });
  const hit = r.body.results.find((x) => x.username === mb.username);
  assert.ok(hit);
  assert.strictEqual(hit.online, null);
  assert.strictEqual(hit.lastSeen, null);
  assert.ok(!('email' in hit));
});

test('p1-7: บล็อก — ลบความเป็นเพื่อน, ค้นหาไม่เจอ, ส่งคำขอเป็นเพื่อนไม่ได้ (ทั้งสองทิศทาง), ปลดบล็อกได้', async () => {
  const a = await makeUser(); const b = await makeUser();
  const [ma, mb] = [await meOf(a), await meOf(b)];
  await pool.query("INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')", [ma.id, mb.id]);
  const bl = await reqRaw('POST', `/api/friends/block/${mb.id}`, { token: a.token });
  assert.strictEqual(bl.status, 200);
  const f = await pool.query('SELECT count(*)::int AS n FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)', [ma.id, mb.id]);
  assert.strictEqual(f.rows[0].n, 0, 'ต้องลบความเป็นเพื่อน');
  const search = await reqRaw('GET', `/api/friends/search?q=${encodeURIComponent(ma.username)}`, { token: b.token });
  assert.ok(!search.body.results.some((x) => x.id === ma.id), 'ผู้ถูกบล็อกต้องค้นหาผู้บล็อกไม่เจอ');
  const req1 = await reqRaw('POST', '/api/friends/request', { token: b.token, body: { username: ma.username } });
  assert.strictEqual(req1.status, 403);
  assert.ok(!/บล็อก/.test(req1.body.error), 'ข้อความต้องไม่บอกว่าถูกบล็อก');
  const req2 = await reqRaw('POST', '/api/friends/request', { token: a.token, body: { username: mb.username } });
  assert.strictEqual(req2.status, 403, 'ผู้บล็อกเองก็ส่งไม่ได้จนกว่าจะปลดบล็อก');
  const list = await reqRaw('GET', '/api/friends/blocked', { token: a.token });
  assert.deepStrictEqual(list.body.blocked.map((x) => x.id), [mb.id]);
  await reqRaw('DELETE', `/api/friends/block/${mb.id}`, { token: a.token });
  const req3 = await reqRaw('POST', '/api/friends/request', { token: a.token, body: { username: mb.username } });
  assert.ok([200, 201].includes(req3.status), 'ปลดบล็อกแล้วส่งคำขอได้');
});

test('p1-7: รายงานผู้ใช้ -> ผู้ดูแลเห็นและตรวจได้ · รายงานซ้ำไม่สร้างใหม่ · ผู้ใช้ทั่วไปดูรายงานไม่ได้', async () => {
  const a = await makeUser(); const b = await makeUser();
  const mb = await meOf(b);
  const bad = await reqRaw('POST', '/api/friends/report', { token: a.token, body: { userId: mb.id, reason: 'hack' } });
  assert.strictEqual(bad.status, 400);
  for (let i = 0; i < 2; i++) {
    const r = await reqRaw('POST', '/api/friends/report', { token: a.token, body: { userId: mb.id, reason: 'harassment', details: '<script>x</script>' } });
    assert.strictEqual(r.status, 200);
  }
  const ma = await meOf(a);
  const n = await pool.query("SELECT count(*)::int AS n FROM user_reports WHERE reporter_id = $1 AND reported_id = $2 AND status = 'open'", [ma.id, mb.id]);
  assert.strictEqual(n.rows[0].n, 1, 'รายงานซ้ำต้องไม่สร้างใหม่');
  assert.strictEqual((await reqRaw('GET', '/api/admin/reports', { token: a.token })).status, 403);
  const admin = await makeAdmin();
  const list = await reqRaw('GET', '/api/admin/reports', { token: admin.token });
  const rep = list.body.reports.find((x) => x.reported_id === mb.id);
  assert.ok(rep);
  assert.strictEqual((await reqRaw('POST', `/api/admin/reports/${rep.id}`, { token: admin.token, body: { status: 'reviewed' } })).status, 200);
});

/* ============ P2-3: Mascot insights ============ */
test('p2-3: insights — แนวโน้มความแม่นยำต้องมีข้อมูลพอทั้งสองช่วง และคำที่ผิดบ่อยไม่รวมคำที่รู้แล้ว', async () => {
  const u = await makeUser();
  const me = await meOf(u);
  const ins0 = (await reqRaw('GET', '/api/progress/home', { token: u.token })).body.insights;
  assert.deepStrictEqual(ins0.accuracy, { recent: null, previous: null }, 'ไม่มีข้อมูล = ไม่แสดงตัวเลข');
  assert.strictEqual(ins0.topMistake, null);
  // สัปดาห์ก่อน: 10 ข้อ ถูก 6 (60%) · สัปดาห์นี้: 10 ข้อ ถูก 8 (80%)
  const ev = (correct, daysAgo) => pool.query(
    "INSERT INTO answer_events (user_id, skill, item_id, level, correct, created_at) VALUES ($1, 'grammar', 'nouns:0', NULL, $2, NOW() - make_interval(days => $3))",
    [me.id, correct, daysAgo]
  );
  for (let i = 0; i < 10; i++) { await ev(i < 6, 10); await ev(i < 8, 1); }
  // คำที่ผิด 3 ครั้ง
  const w = N('A1-0050');
  for (let i = 0; i < 3; i++) {
    await pool.query("INSERT INTO answer_events (user_id, skill, item_id, level, correct) VALUES ($1, 'vocab', $2, 'A1', FALSE)", [me.id, w]);
  }
  const ins = (await reqRaw('GET', '/api/progress/home', { token: u.token })).body.insights;
  // 7 วันล่าสุด = แกรมม่า 10 ข้อ (ถูก 8) + คำศัพท์ที่ผิด 3 ข้อ = 8/13 = 61.5% -> 62
  assert.deepStrictEqual(ins.accuracy, { recent: 62, previous: 60 });
  assert.strictEqual(ins.topMistake.wordId, w);
  assert.strictEqual(ins.topMistake.wrong, 3);
  // รู้คำนั้นแล้ว -> ไม่แนะนำอีก
  await pool.query("INSERT INTO word_progress (user_id, word_id, level, status, srs_reps) VALUES ($1, $2, 'A1', 'known', 2)", [me.id, w]);
  const after = (await reqRaw('GET', '/api/progress/home', { token: u.token })).body.insights;
  assert.strictEqual(after.topMistake, null);
});

/* ============ Listening (Phase 4A) ============ */
test('listening: ตอบโหมดฟังบันทึกเป็นทักษะการฟัง + Mastery แสดงผล', async () => {
  const u = await makeUser();
  const r = await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0070'), level: 'A1', chosenWordId: N('A1-0070'), mode: 'listening' },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.correct, true);
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const { rows } = await pool.query(
    "SELECT skill FROM answer_events WHERE user_id = $1", [me.body.user.id]
  );
  assert.deepStrictEqual(rows.map((x) => x.skill), ['listening']);
  const m = await reqRaw('GET', '/api/mistakes/mastery', { token: u.token });
  assert.strictEqual(m.body.listening.accuracy, 100);
  assert.deepStrictEqual(m.body.vocab, {}, 'โหมดฟังต้องไม่ปนกับคำศัพท์แบบอ่าน');
});

test('listening: ไม่ส่ง mode = โหมดอ่านแบบเดิม, mode ปลอมถูกปฏิเสธ', async () => {
  const u = await makeUser();
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0071'), level: 'A1', chosenWordId: N('A1-0071') },
  });
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const { rows } = await pool.query("SELECT skill FROM answer_events WHERE user_id = $1", [me.body.user.id]);
  assert.strictEqual(rows[0].skill, 'vocab');
  const bad = await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0072'), level: 'A1', chosenWordId: N('A1-0072'), mode: 'hack' },
  });
  assert.strictEqual(bad.status, 400);
});

test('listening: ความคืบหน้า/EXP แยกจากโหมดอ่าน · คำซ้ำในโหมดเดียวกันวันเดียวไม่ได้ EXP', async () => {
  const u = await makeUser();
  const review = (mode) => reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0073'), level: 'A1', chosenWordId: N('A1-0073'), mode },
  });
  const a = await review('read');
  assert.strictEqual(a.body.gainedExp, 15, 'อ่านครั้งแรก = 15');
  const b = await review('listening');
  assert.strictEqual(b.body.gainedExp, 15, 'ฟังครั้งแรก = 15 (ทักษะใหม่ นับแยก)');
  const c = await review('listening');
  assert.strictEqual(c.body.gainedExp, 0, 'ฟังคำเดิมซ้ำวันเดียวกัน = 0');
  assert.strictEqual(c.body.noExpReason, 'cooldown');

  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const lp = await pool.query('SELECT status FROM listening_progress WHERE user_id = $1 AND word_id = $2', [me.body.user.id, N('A1-0073')]);
  assert.strictEqual(lp.rows[0].status, 'known', 'โหมดฟังบันทึกแยกใน listening_progress');
  const pathRead = await reqRaw('GET', '/api/path', { token: u.token });
  const pathListen = await reqRaw('GET', '/api/path?mode=listening', { token: u.token });
  assert.strictEqual(pathListen.body.mode, 'listening');
  assert.strictEqual(pathRead.body.mode, 'read');
});

test('EXP: ทวนคำที่รู้แล้ว (พ้น 20 ชม.) ได้ 5 — น้อยกว่าครั้งแรก', async () => {
  const u = await makeUser();
  const w = N('A1-0074');
  const first = await reqRaw('POST', '/api/progress/review', { token: u.token, body: { wordId: w, level: 'A1', chosenWordId: w } });
  assert.strictEqual(first.body.gainedExp, 15);
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  await pool.query("UPDATE word_progress SET last_exp_at = NOW() - INTERVAL '21 hours' WHERE user_id = $1 AND word_id = $2", [me.body.user.id, w]);
  const again = await reqRaw('POST', '/api/progress/review', { token: u.token, body: { wordId: w, level: 'A1', chosenWordId: w } });
  assert.strictEqual(again.body.gainedExp, 5, 'ทวนคำเดิม = 5');
  assert.strictEqual(again.body.expKind, 'review');
});

/* ============ Unit Test + Boss (Phase 3C) ============ */
async function answersFor(attemptId) {
  const { rows } = await pool.query('SELECT questions FROM assessments WHERE id = $1', [attemptId]);
  return rows[0].questions.map((q) => q.correctIndex);
}

test('unit test: สร้าง 10 ข้อ เฉลยไม่รั่ว, Unit ที่ล็อกสอบไม่ได้', async () => {
  const u = await makeUser();
  const r = await reqRaw('POST', '/api/assessments/unit/A1-food-1/start', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.questions.length >= 6);
  assert.ok(r.body.questions.every((q) => q.correctIndex === undefined));
  const locked = await reqRaw('POST', '/api/assessments/unit/A1-food-2/start', { token: u.token });
  assert.strictEqual(locked.status, 403);
});

test('unit test: ผ่านแล้ว Unit เสร็จทันที + EXP เฉพาะครั้งแรก', async () => {
  const u = await makeUser();
  const s1 = await reqRaw('POST', '/api/assessments/unit/A1-food-1/start', { token: u.token });
  const r1 = await reqRaw('POST', `/api/assessments/${s1.body.attemptId}/submit`, {
    token: u.token, body: { answers: await answersFor(s1.body.attemptId) },
  });
  assert.strictEqual(r1.body.result.passed, true);
  assert.strictEqual(r1.body.result.gainedExp, 30);

  const path = await reqRaw('GET', '/api/path', { token: u.token });
  const unit = path.body.levels[0].units.find((x) => x.id === 'A1-food-1');
  assert.strictEqual(unit.status, 'completed');
  assert.strictEqual(unit.testPassed, true);

  const s2 = await reqRaw('POST', '/api/assessments/unit/A1-food-1/start', { token: u.token });
  const r2 = await reqRaw('POST', `/api/assessments/${s2.body.attemptId}/submit`, {
    token: u.token, body: { answers: await answersFor(s2.body.attemptId) },
  });
  assert.strictEqual(r2.body.result.gainedExp, 0, 'ผ่านซ้ำต้องไม่ได้ EXP');
});

test('unit test: ส่งซ้ำ/ส่งของคนอื่นไม่ได้, ตอบผิดไม่ผ่าน', async () => {
  const u = await makeUser();
  const other = await makeUser();
  const s = await reqRaw('POST', '/api/assessments/unit/A1-people-1/start', { token: u.token });
  const wrong = (await answersFor(s.body.attemptId)).map((c) => (c + 1) % 4);
  const stolen = await reqRaw('POST', `/api/assessments/${s.body.attemptId}/submit`, { token: other.token, body: { answers: wrong } });
  assert.strictEqual(stolen.status, 404);
  const r = await reqRaw('POST', `/api/assessments/${s.body.attemptId}/submit`, { token: u.token, body: { answers: wrong } });
  assert.strictEqual(r.body.result.passed, false);
  const again = await reqRaw('POST', `/api/assessments/${s.body.attemptId}/submit`, { token: u.token, body: { answers: wrong } });
  assert.strictEqual(again.status, 409);
});

test('boss: ล็อกจนกว่าผ่าน 60% แล้วเคลียร์ได้ + ปลดล็อกระดับถัดไป', async () => {
  const u = await makeUser();
  const locked = await reqRaw('POST', '/api/assessments/boss/A1/start', { token: u.token });
  assert.strictEqual(locked.status, 403);

  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  await pool.query(
    `INSERT INTO word_progress (user_id, word_id, level, status)
     SELECT $1, public_id, 'A1', 'known' FROM vocab_senses WHERE cefr = 'A1' ON CONFLICT DO NOTHING`,
    [me.body.user.id]
  );
  const s = await reqRaw('POST', '/api/assessments/boss/A1/start', { token: u.token });
  assert.strictEqual(s.status, 200);
  assert.ok(s.body.questions.some((q) => q.skill === 'grammar'), 'Boss ต้องมีข้อแกรมม่า');
  const r = await reqRaw('POST', `/api/assessments/${s.body.attemptId}/submit`, {
    token: u.token, body: { answers: await answersFor(s.body.attemptId) },
  });
  assert.strictEqual(r.body.result.passed, true);
  assert.strictEqual(r.body.result.gainedExp, 100);
  const path = await reqRaw('GET', '/api/path', { token: u.token });
  assert.strictEqual(path.body.levels[0].boss, 'cleared');
  assert.strictEqual(path.body.levels[1].unlocked, true);
});

test('assessment: คำตอบถูกบันทึกลง answer_events (ป้อน Mastery)', async () => {
  const u = await makeUser();
  const s = await reqRaw('POST', '/api/assessments/unit/A1-time-1/start', { token: u.token });
  await reqRaw('POST', `/api/assessments/${s.body.attemptId}/submit`, {
    token: u.token, body: { answers: await answersFor(s.body.attemptId) },
  });
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM answer_events WHERE user_id = $1', [me.body.user.id]);
  assert.strictEqual(rows[0].n, s.body.questions.length);
});

/* ============ Learning Path (Phase 3B) ============ */
test('path: มี 5 ระดับ, A1 เปิด, ระดับอื่นล็อก, ทุก Unit ≥ 8 คำ', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/path', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.levels.map((l) => l.level), ['A1', 'A2', 'B1', 'B2', 'C1']);
  assert.strictEqual(r.body.levels[0].unlocked, true);
  assert.strictEqual(r.body.levels[1].unlocked, false);
  const sizes = r.body.levels.flatMap((l) => l.units.map((x) => x.total));
  assert.ok(Math.min(...sizes) >= 8, 'Unit ต้องมีอย่างน้อย 8 คำ (พอสร้างโจทย์ 4 ตัวเลือก)');
  assert.ok(r.body.next && r.body.next.id.startsWith('A1-'), 'Unit ถัดไปต้องอยู่ที่ A1');
});

test('path: Unit แรกของทุกหัวข้อเปิด, Unit ย่อยถัดไปยังล็อก', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/path', { token: u.token });
  const a1 = r.body.levels[0].units;
  const firsts = a1.filter((x) => /-1$/.test(x.id));
  assert.ok(firsts.every((x) => x.status === 'available'), 'part 1 ของทุกหัวข้อต้องเปิด');
  const second = a1.find((x) => /-2$/.test(x.id));
  assert.strictEqual(second.status, 'locked');
});

test('path: เปิด Unit ที่ล็อกไม่ได้ (ตรวจฝั่งเซิร์ฟเวอร์)', async () => {
  const u = await makeUser();
  const ok = await reqRaw('GET', '/api/path/units/A1-people-1', { token: u.token });
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.body.wordIds.length >= 8);
  const locked = await reqRaw('GET', '/api/path/units/A1-people-2', { token: u.token });
  assert.strictEqual(locked.status, 403);
  const lockedLevel = await reqRaw('GET', '/api/path/units/B2-people-1', { token: u.token });
  assert.strictEqual(lockedLevel.status, 403);
});

test('path: ผ่าน Unit (รู้ 80%) แล้ว Unit ย่อยถัดไปปลดล็อก', async () => {
  const u = await makeUser();
  const unit = await reqRaw('GET', '/api/path/units/A1-people-1', { token: u.token });
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  for (const id of unit.body.wordIds) {
    await pool.query(
      "INSERT INTO word_progress (user_id, word_id, level, status) VALUES ($1, $2, 'A1', 'known') ON CONFLICT DO NOTHING",
      [me.body.user.id, id]
    );
  }
  const next = await reqRaw('GET', '/api/path/units/A1-people-2', { token: u.token });
  assert.strictEqual(next.status, 200, 'ผ่าน part 1 แล้ว part 2 ต้องเปิด');
});

test('path: หัวข้อถูกจัดจากหมวดความหมาย (banana=food, CD ไม่ใช่ธาตุ)', async () => {
  const { rows } = await pool.query(
    "SELECT word_id, topic, definition_en FROM word_content WHERE word_id IN (SELECT id FROM words WHERE word IN ('banana','CD','mother'))"
  );
  const by = Object.fromEntries(rows.map((r) => [r.word_id, r]));
  const banana = rows.find((r) => /fruit/.test(r.definition_en || ''));
  assert.ok(banana && banana.topic === 'food', 'banana ต้องเป็นผลไม้หมวดอาหาร');
  assert.ok(rows.every((r) => !/metallic element/.test(r.definition_en || '')), 'CD ต้องไม่ใช่ธาตุแคดเมียม');
  assert.ok(Object.keys(by).length >= 3);
});

test('admin: เปลี่ยนหัวข้อคำแล้วบันทึกในฐาน Oxford', async () => {
  const a = await makeAdmin();
  const r = await reqRaw('PATCH', `/api/admin/words/${N('A1-0010')}`, { token: a.token, body: { topic: 'places' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.content.topic, 'places');
  const { rows } = await pool.query('SELECT topic FROM vocab_senses WHERE public_id = $1', [N('A1-0010')]);
  assert.strictEqual(rows[0].topic, 'places', 'หัวข้อต้องถูกบันทึกในฐาน Oxford');
  const bad = await reqRaw('PATCH', `/api/admin/words/${N('A1-0010')}`, { token: a.token, body: { topic: 'hacking' } });
  assert.strictEqual(bad.status, 400, 'หัวข้อที่ไม่มีอยู่จริงต้องถูกปฏิเสธ');
});

/* ============ Placement Test (Phase 3A) ============ */
test('placement: สร้างข้อสอบ 31 ข้อ และไม่ส่งเฉลยออกไป', async () => {
  const u = await makeUser();
  const r = await reqRaw('POST', '/api/placement/start', { token: u.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.questions.length, 31);
  assert.ok(r.body.questions.every((q) => q.correctIndex === undefined && q.level === undefined),
    'เฉลยและระดับต้องไม่ถูกส่งไปก่อนส่งคำตอบ');
});

test('placement: เริ่มซ้ำได้ชุดเดิม (กันสุ่มหาข้อง่าย)', async () => {
  const u = await makeUser();
  const a = await reqRaw('POST', '/api/placement/start', { token: u.token });
  const b = await reqRaw('POST', '/api/placement/start', { token: u.token });
  assert.strictEqual(a.body.attemptId, b.body.attemptId);
  assert.strictEqual(b.body.resumed, true);
});

test('placement: ส่งของคนอื่นไม่ได้ / ส่งซ้ำไม่ได้', async () => {
  const u = await makeUser();
  const other = await makeUser();
  const s = await reqRaw('POST', '/api/placement/start', { token: u.token });
  const answers = s.body.questions.map(() => 0);
  const stolen = await reqRaw('POST', `/api/placement/${s.body.attemptId}/submit`, { token: other.token, body: { answers } });
  assert.strictEqual(stolen.status, 404);
  const ok = await reqRaw('POST', `/api/placement/${s.body.attemptId}/submit`, { token: u.token, body: { answers } });
  assert.strictEqual(ok.status, 200);
  const again = await reqRaw('POST', `/api/placement/${s.body.attemptId}/submit`, { token: u.token, body: { answers } });
  assert.strictEqual(again.status, 409);
});

test('placement: เซิร์ฟเวอร์ให้คะแนนเอง — ตอบถูกหมดได้ C1', async () => {
  const u = await makeUser();
  const s = await reqRaw('POST', '/api/placement/start', { token: u.token });
  // อ่านเฉลยจาก DB (ทำได้เฉพาะในเทสต์) เพื่อจำลองผู้ที่ตอบถูกทุกข้อ
  const { rows } = await pool.query('SELECT questions FROM placement_attempts WHERE id = $1', [s.body.attemptId]);
  const answers = rows[0].questions.map((q) => q.correctIndex);
  const r = await reqRaw('POST', `/api/placement/${s.body.attemptId}/submit`, { token: u.token, body: { answers } });
  assert.strictEqual(r.body.result.overall, 'C1');
  assert.strictEqual(r.body.result.correct, 31);
  const latest = await reqRaw('GET', '/api/placement/latest', { token: u.token });
  assert.strictEqual(latest.body.result.overall, 'C1');
});

test('placement: คำตอบผิดรูปแบบถือว่าผิด ไม่ทำให้ระบบพัง', async () => {
  const u = await makeUser();
  const s = await reqRaw('POST', '/api/placement/start', { token: u.token });
  const answers = s.body.questions.map(() => 'hack');
  const r = await reqRaw('POST', `/api/placement/${s.body.attemptId}/submit`, { token: u.token, body: { answers } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.result.correct, 0);
});

test('placement: กันการเดาฟลุ๊ก — ต้องผ่านต่อเนื่องจากระดับล่าง', () => {
  const p = require('../utils/placement');
  const qs = [];
  for (const l of ['A1', 'A2', 'B1', 'B2', 'C1']) for (let i = 0; i < 3; i++) qs.push({ skill: 'vocab', level: l, correctIndex: 0 });
  // ถูกเฉพาะ A1 กับ C1 (ตก A2) → ต้องได้ A1 ไม่ใช่ C1
  const answers = qs.map((q) => (['A1', 'C1'].includes(q.level) ? 0 : 1));
  assert.strictEqual(p.scorePlacement(qs, answers).vocab, 'A1');
});

/* ============ Admin (Phase 2D) ============ */
async function makeAdmin() {
  const u = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [me.body.user.id]);
  return u;
}

test('authRequired ตอบทุก request (ไม่ค้าง) — กันบั๊ก scoping ซ้ำ', async () => {
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/auth/me', { token: u.token });
  assert.strictEqual(r.status, 200, 'endpoint ที่ต้องล็อกอินต้องตอบได้');
  assert.strictEqual(r.body.user.role, 'user');
});

test('admin: ผู้ใช้ทั่วไปและคนนอกเข้าไม่ได้', async () => {
  const anon = await reqRaw('GET', '/api/admin/stats');
  assert.strictEqual(anon.status, 401);
  const u = await makeUser();
  const r = await reqRaw('GET', '/api/admin/stats', { token: u.token });
  assert.strictEqual(r.status, 403);
  const patch = await reqRaw('PATCH', `/api/admin/words/${N('A1-0010')}`, { token: u.token, body: { thai: 'hacked' } });
  assert.strictEqual(patch.status, 403);
});

test('admin: ปลอม role ใน JWT ไม่ได้ผล (role อ่านจาก DB)', async () => {
  const jwt = require('jsonwebtoken');
  const u = await makeUser();
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  const fake = jwt.sign({ userId: me.body.user.id, tv: 0, role: 'admin' }, process.env.JWT_SECRET);
  const r = await reqRaw('GET', '/api/admin/stats', { token: fake });
  assert.strictEqual(r.status, 403);
});

test('admin: แก้คำแปลไทย → flashcard ใช้ทันที + บันทึกประวัติ', async () => {
  const a = await makeAdmin();
  const r = await reqRaw('PATCH', `/api/admin/words/${N('B1-0300')}`, {
    token: a.token, body: { thai: 'ทอด', definition: 'cook in hot fat or oil' },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.content.status, 'reviewed');

  const tr = await reqRaw('POST', '/api/translate', { token: a.token, body: { wordIds: [N('B1-0300')] } });
  assert.strictEqual(tr.body.translations[N('B1-0300')], 'ทอด', 'คำแปลที่แอดมินตรวจต้องถูกใช้ทันที');

  const h = await reqRaw('GET', `/api/admin/words/${N('B1-0300')}/history`, { token: a.token });
  assert.ok(h.body.history.length >= 1, 'ต้องมีประวัติการแก้ไข');
});

test('admin: ยืนยันคำแปลที่ flag -> ใช้ในแบบทดสอบได้ทันที', async () => {
  const a = await makeAdmin();
  const list = await reqRaw('GET', '/api/admin/words?status=flagged&level=A1', { token: a.token });
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.total > 0 && list.body.words.every((w) => w.flagNote), 'ตัวกรอง flagged ต้องคืนเฉพาะคำที่ flag');
  const target = list.body.words.find((w) => w.thai);
  const before = await reqRaw('POST', '/api/translate', { token: a.token, body: { wordIds: [target.id] } });
  assert.strictEqual(before.body.translations[target.id], undefined, 'คำที่ flag ต้องไม่ถูกใช้ในแบบทดสอบ');
  const ok = await reqRaw('POST', `/api/admin/words/${target.id}/approve`, { token: a.token });
  assert.strictEqual(ok.status, 200);
  const after = await reqRaw('POST', '/api/translate', { token: a.token, body: { wordIds: [target.id] } });
  assert.strictEqual(after.body.translations[target.id], target.thai, 'ยืนยันแล้วต้องใช้ได้ทันที');
  const { rows } = await pool.query('SELECT translation_source, translation_note FROM vocab_senses WHERE public_id = $1', [target.id]);
  assert.deepStrictEqual(rows[0], { translation_source: 'HUMAN_REVIEWED', translation_note: null });
});

test('admin: validation กันข้อมูลผิดรูปแบบ', async () => {
  const a = await makeAdmin();
  const badId = await reqRaw('PATCH', '/api/admin/words/x%3Bdrop', { token: a.token, body: { thai: 'a' } });
  assert.strictEqual(badId.status, 400);
  const tooLong = await reqRaw('PATCH', `/api/admin/words/${N('A1-0010')}`, { token: a.token, body: { definition: 'a'.repeat(600) } });
  assert.strictEqual(tooLong.status, 400);
  const badType = await reqRaw('PATCH', `/api/admin/words/${N('A1-0010')}`, { token: a.token, body: { thai: { x: 1 } } });
  assert.strictEqual(badType.status, 400);
});

test('admin: ถอดสิทธิ์แล้วเข้าไม่ได้ทันที (ไม่ต้องรอ token หมดอายุ)', async () => {
  const a = await makeAdmin();
  const before = await reqRaw('GET', '/api/admin/stats', { token: a.token });
  assert.strictEqual(before.status, 200);
  const me = await reqRaw('GET', '/api/auth/me', { token: a.token });
  await pool.query("UPDATE users SET role = 'user' WHERE id = $1", [me.body.user.id]);
  const after = await reqRaw('GET', '/api/admin/stats', { token: a.token });
  assert.strictEqual(after.status, 403, 'token เดิมต้องเสียสิทธิ์ admin ทันที');
});

/* ============ Word Content (Phase 2C) ============ */
test('word_content ถูกเติมจากพจนานุกรม (IPA + ความหมาย)', async () => {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n, count(ipa)::int AS ipa, count(definition_en)::int AS def FROM word_content WHERE status = 'auto'"
  );
  assert.ok(rows[0].n > 5000, `ต้องมีเนื้อหามากกว่า 5000 คำ (ได้ ${rows[0].n})`);
  assert.ok(rows[0].ipa > 5000, 'IPA ต้องครอบคลุมเกือบทุกคำ');
  assert.ok(rows[0].def > 4500, 'ความหมายต้องครอบคลุมคำเนื้อหาเกือบทุกคำ');
});

test('/words/content คืนเนื้อหาและกรอง id ที่ผิดรูปแบบ', async () => {
  const ok = await reqRaw('GET', `/api/words/content?ids=${N('A2-0007')}`);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.content[N('A2-0007')].ipa, 'əˈtʃiːv', 'achieve ต้องได้ IPA ถูกต้อง');
  assert.strictEqual(ok.body.content[N('A2-0007')].reviewed, false);

  const bad = await reqRaw('GET', '/api/words/content?ids=' + encodeURIComponent("x';DROP TABLE words;--,../../etc"));
  assert.strictEqual(bad.status, 200);
  assert.deepStrictEqual(bad.body.content, {}, 'id ผิดรูปแบบต้องถูกกรองทิ้ง');
});

test('seed ซ้ำไม่เขียนทับเนื้อหาที่มนุษย์ตรวจแล้ว', async () => {
  await pool.query(
    "UPDATE word_content SET definition_en = 'reviewed-def', status = 'reviewed' WHERE word_id = 'A1-0010'"
  );
  const migration = require('../migrations/005_seed_word_content');
  const client = await pool.connect();
  try { await migration.run(client); } finally { client.release(); }
  const { rows } = await pool.query("SELECT definition_en, status FROM word_content WHERE word_id = 'A1-0010'");
  assert.strictEqual(rows[0].definition_en, 'reviewed-def', 'ความหมายที่ตรวจแล้วต้องไม่ถูกเขียนทับ');
  assert.strictEqual(rows[0].status, 'reviewed');
});

test('/words/:level ไม่บวม (ไม่แนบเนื้อหาพจนานุกรม)', async () => {
  const r = await reqRaw('GET', '/api/words/A1');
  const w = r.body.words[0];
  assert.ok(!('definition' in w) && !('ipa' in w), 'เนื้อหาต้องดึงแยกผ่าน /words/content');
});

/* ============ My Mistakes + Mastery (Phase 2B) ============ */
test('Mastery: คำนวณ % ความแม่นยำจาก answer_events', async () => {
  const u = await makeUser();
  // ตอบถูก 1, ผิด 2 → accuracy 33%
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0040'), level: 'A1', chosenWordId: N('A1-0040') },
  });
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0041'), level: 'A1', chosenWordId: N('A1-0099') },
  });
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0042'), level: 'A1', chosenWordId: N('A1-0098') },
  });
  const r = await reqRaw('GET', '/api/mistakes/mastery', { token: u.token });
  assert.ok(r.body.vocab.A1, 'ต้องมี mastery ของ A1');
  assert.strictEqual(r.body.vocab.A1.attempts, 3);
  assert.strictEqual(r.body.vocab.A1.accuracy, 33, 'ถูก 1/3 = 33%');
});

test('My Mistakes: ดึงคำที่ผิดมากกว่าถูก', async () => {
  const u = await makeUser();
  // คำ A1-0050 ตอบผิด 2 ครั้ง
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0050'), level: 'A1', chosenWordId: N('A1-0099') },
  });
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0050'), level: 'A1', chosenWordId: N('A1-0088') },
  });
  const r = await reqRaw('GET', '/api/mistakes', { token: u.token });
  assert.ok(r.body.count >= 1, 'ต้องมีคำผิด');
  const w = r.body.words.find((x) => x.id === N('A1-0050'));
  assert.ok(w, 'A1-0050 ต้องอยู่ในรายการ');
  assert.strictEqual(w.wrong, 2);
});

test('My Mistakes: practice-session คืนคำพร้อม suggestedLevel', async () => {
  const u = await makeUser();
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0060'), level: 'A1', chosenWordId: N('A1-0099') },
  });
  const r = await reqRaw('GET', '/api/mistakes/practice-session', { token: u.token });
  assert.ok(r.body.count >= 1);
  assert.strictEqual(r.body.suggestedLevel, 'A1');
});

test('Mastery: แกรมม่าถูกบันทึกและคำนวณได้', async () => {
  const u = await makeUser();
  const { quiz } = await doGrammarQuiz(u, 'nouns', 'basic');
  const r = await reqRaw('GET', '/api/mistakes/mastery', { token: u.token });
  assert.ok(r.body.grammar, 'ต้องมี mastery แกรมม่า');
  assert.strictEqual(r.body.grammar.attempts, quiz.body.quiz.length);
});

test('SRS: /progress/due และ review-session ทำงาน', async () => {
  const u = await makeUser();
  // ตอบถูกแล้วกด "ง่ายมาก" = known ทันที (P0-c)
  await reqRaw('POST', '/api/progress/review', {
    token: u.token, body: { wordId: N('A1-0030'), level: 'A1', chosenWordId: N('A1-0030'), rating: 'easy' },
  });
  const me = await reqRaw('GET', '/api/auth/me', { token: u.token });
  // บังคับให้ถึงกำหนด (เมื่อวาน)
  await pool.query(
    "UPDATE word_progress SET srs_due_at = NOW() - INTERVAL '1 day' WHERE user_id = $1 AND word_id = $2",
    [me.body.user.id, N('A1-0030')]
  );
  const due = await reqRaw('GET', '/api/progress/due', { token: u.token });
  assert.ok(due.body.total >= 1, 'ต้องมีคำถึงกำหนดอย่างน้อย 1');
  const session = await reqRaw('GET', '/api/progress/review-session?level=A1', { token: u.token });
  assert.ok(session.body.count >= 1, 'review-session ต้องคืนคำ');
  assert.ok(session.body.words[0].word, 'คำต้องมีข้อมูลครบ');
});
