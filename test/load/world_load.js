/*
  Load Test — EnglishQuest World (ผู้เล่นทดสอบที่เชื่อม WebSocket จริงกับเซิร์ฟเวอร์จริง ในห้องเดียวกัน)
    DATABASE_URL=... JWT_SECRET=... node test/load/world_load.js --url http://localhost:3100 --sizes 10,20,25 --secs 30 [--out docs/world/load.json]
  * บัญชีทดสอบ (lt_*) สร้างในฐานข้อมูลที่ระบุ — ไม่ใช่ NPC ในเกม: เป็น client WebSocket ที่ทำตัวเหมือนผู้เล่นจริง
    (เดินวน 10 ครั้ง/วินาที · ส่งประโยคสำเร็จรูปทุก ~12 วินาที · ทำท่าทางเป็นระยะ) เพื่อวัดภาระของเซิร์ฟเวอร์และเครือข่ายเท่านั้น
  วัด: เวลาต่อ tick ของเซิร์ฟเวอร์ · CPU/หน่วยความจำของ process · ปริมาณข้อมูลต่อผู้เล่น · ความหน่วง (เดิน → คนอื่นเห็น) · RTT
*/
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg('url', 'http://localhost:3100');
const SIZES = arg('sizes', '10,20,25').split(',').map(Number);
const SECS = Number(arg('secs', 30));
const OUT = arg('out', null);
const ROOM = arg('room', 'campus-9');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const secret = process.env.JWT_SECRET;

async function users(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const name = `lt_${process.pid}_${i}`;
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, created_at) VALUES ($1, $2, 'x', NOW() - INTERVAL '30 days')
       ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id, token_version`, [name, `${name}@loadtest.local`]);
    out.push({ id: rows[0].id, name, token: jwt.sign({ userId: rows[0].id, tv: rows[0].token_version || 0 }, secret) });
  }
  return out;
}
async function adminToken() {
  const { rows } = await pool.query(`INSERT INTO users (username, email, password_hash, role) VALUES ('lt_admin', 'lt_admin@loadtest.local', 'x', 'admin')
     ON CONFLICT (username) DO UPDATE SET role = 'admin' RETURNING id, token_version`);
  return jwt.sign({ userId: rows[0].id, tv: rows[0].token_version || 0 }, secret);
}
function getJson(path, token, method = 'GET') {
  return new Promise((res, rej) => {
    const u = new URL(URL_ + path);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method, headers: { Authorization: `Bearer ${token}` } }, (r) => {
      let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    });
    req.on('error', rej); req.end();
  });
}
function procStat(pid) {
  try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return { cpu: Number(f[11]) + Number(f[12]), rss: Number(f[21]) * 4096 }; } catch (_) { return null; }
}

function client(u, idx, n, stats) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${URL_.replace('http', 'ws')}/ws?token=${u.token}`);
    const c = { ws, u, pid: null, x: 0, z: 0, sentPos: new Map(), bytes: 0, msgs: 0, snaps: 0, rtts: [], delays: [], timers: [] };
    ws.on('message', (raw) => {
      c.bytes += raw.length; c.msgs += 1;
      const m = JSON.parse(String(raw));
      if (m.type === 'connected') ws.send(JSON.stringify({ type: 'world:join', roomId: ROOM }));
      else if (m.type === 'world:joined') { c.pid = m.you.pid; c.x = m.you.x; c.z = m.you.z; stats.pids.set(c.pid, c); resolve(c); }
      else if (m.type === 'world:error') reject(new Error(m.code));
      else if (m.type === 'world:pong') c.rtts.push(Date.now() - m.t);
      else if (m.type === 'world:snap') {
        c.snaps += 1;
        const now = Date.now();
        for (const row of m.p) {
          const other = stats.pids.get(row[0]);
          if (!other) continue;
          const key = `${row[1]},${row[2]}`;
          const t = other.sentPos.get(key);
          if (t) c.delays.push(now - t);
        }
      }
    });
    ws.on('error', reject);
    c.start = () => {
      // เดินวนรอบลานกลาง (รัศมีต่างกันต่อคน) 10 ครั้ง/วินาที · เส้นทางเดินได้จริง (ไม่ชนน้ำพุ)
      const r = 3.9 + (idx % 4) * 0.55; let a = (idx / n) * Math.PI * 2;   // วงรอบน้ำพุ (r 3.9–5.55) ไม่ชนม้านั่ง (r ≥ 5.86) — ทดสอบภาระ ไม่ใช่การชน
      c.timers.push(setInterval(() => {
        a += 0.04; const x = Math.cos(a) * r; const z = Math.sin(a) * r;
        c.x = x; c.z = z;
        const key = `${Math.round(x * 100)},${Math.round(z * 100)}`;
        c.sentPos.set(key, Date.now()); if (c.sentPos.size > 40) c.sentPos.delete(c.sentPos.keys().next().value);
        ws.send(JSON.stringify({ type: 'world:move', x, z, ry: a + Math.PI / 2, st: 'walk' }));
      }, 100));
      c.timers.push(setInterval(() => ws.send(JSON.stringify({ type: 'world:chat', mode: Math.random() < 0.5 ? 'local' : 'room', phrase: ['hello', 'good_luck', 'nice_meet', 'practice'][idx % 4] })), 12000 + idx * 150));
      c.timers.push(setInterval(() => ws.send(JSON.stringify({ type: 'world:emote', e: 'wave' })), 20000 + idx * 200));
      c.timers.push(setInterval(() => ws.send(JSON.stringify({ type: 'world:ping', t: Date.now() })), 2000));
    };
    c.stop = () => { c.timers.forEach(clearInterval); ws.close(); };
  });
}
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

async function run(n, admin, serverPid) {
  const us = await users(n);
  const stats = { pids: new Map() };
  const cs = [];
  for (let i = 0; i < n; i += 1) { cs.push(await client(us[i], i, n, stats)); await new Promise((r) => setTimeout(r, 30)); }
  await getJson('/api/admin/world/metrics/reset', admin, 'POST');
  cs.forEach((c) => { c.bytes = 0; c.msgs = 0; c.snaps = 0; c.delays = []; c.rtts = []; });
  const p0 = serverPid ? procStat(serverPid) : null; const t0 = Date.now();
  cs.forEach((c) => c.start());
  await new Promise((r) => setTimeout(r, SECS * 1000));
  const p1 = serverPid ? procStat(serverPid) : null; const secs = (Date.now() - t0) / 1000;
  const m = await getJson('/api/admin/world/metrics', admin);
  cs.forEach((c) => c.stop());
  await new Promise((r) => setTimeout(r, 1500));
  const delays = cs.flatMap((c) => c.delays); const rtts = cs.flatMap((c) => c.rtts);
  const res = {
    players: n, seconds: Math.round(secs),
    server: { tickMsAvg: m.tickMsAvg, tickMsMax: m.tickMsMax, tickBudgetMs: 1000 / m.tickHz, cpuPercent: p0 && p1 ? +((((p1.cpu - p0.cpu) / 100) / secs) * 100).toFixed(1) : null,
      rssMB: p1 ? +(p1.rss / 1048576).toFixed(1) : m.memoryMB, bytesOutPerSec: m.bytesOutPerSec, msgsOutPerSec: m.msgsOutPerSec, movesInPerSec: m.movesInPerSec, corrections: m.corrections },
    perClient: { kbPerSecDown: +(cs.reduce((a, c) => a + c.bytes, 0) / n / secs / 1024).toFixed(2), msgsPerSec: +(cs.reduce((a, c) => a + c.msgs, 0) / n / secs).toFixed(1),
      snapsPerSec: +(cs.reduce((a, c) => a + c.snaps, 0) / n / secs).toFixed(1), kbPerSecUp: +((10 * 75) / 1024).toFixed(2) },
    latencyMs: { moveToSeenP50: pct(delays, 0.5), moveToSeenP95: pct(delays, 0.95), rttP50: pct(rtts, 0.5), rttP95: pct(rtts, 0.95), samples: delays.length },
  };
  await pool.query("DELETE FROM world_chat_log WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'lt\\_%')");
  return res;
}

async function hold(n, secs) {
  // โหมดผู้เล่นทดสอบค้างในห้อง (ใช้วัดฝั่ง browser: ตัวละครที่วาด/draw call/triangle เมื่อห้องมีคนเยอะ)
  const us = await users(n); const stats = { pids: new Map() }; const cs = [];
  for (let i = 0; i < n; i += 1) { cs.push(await client(us[i], i, n, stats)); }
  cs.forEach((c) => c.start());
  console.log(`holding ${n} players in ${ROOM} for ${secs}s`);
  await new Promise((r) => setTimeout(r, secs * 1000));
  cs.forEach((c) => c.stop());
}

(async () => {
  if (arg('hold', null)) { await hold(Number(arg('hold')), SECS); await pool.end(); process.exit(0); }
  const admin = await adminToken();
  const serverPid = Number(arg('pid', 0)) || null;
  const out = { at: new Date().toISOString(), url: URL_, room: ROOM, secondsPerRun: SECS, note: 'ผู้เล่นทดสอบ = WebSocket client จริงจากเครื่องเดียวกับเซิร์ฟเวอร์ (localhost) — ไม่รวมความหน่วงอินเทอร์เน็ตจริง', runs: [] };
  for (const n of SIZES) {
    const r = await run(n, admin, serverPid);
    out.runs.push(r);
    console.log(JSON.stringify(r));
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  await pool.end();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
