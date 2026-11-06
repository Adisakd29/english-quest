/*
  ศูนย์กลางระบบ Realtime ของ WordQuest (WebSocket)

  หน้าที่หลักตอนนี้:
    1. เช็คว่าใครออนไลน์อยู่บ้าง (presence)
    2. นับจำนวนคนที่กำลังใช้งานเว็บ
    3. แจ้งเตือนเรื่องเพื่อน (คำขอเป็นเพื่อน / เพื่อนออนไลน์)

  ออกแบบเผื่อระบบห้องแข่งคำศัพท์ในอนาคต จึงแยกเป็นโมดูลกลาง
  ให้ส่วนอื่นเรียกใช้ผ่าน sendToUser() / broadcastAll() ได้

  หมายเหตุเรื่อง Railway:
    ผู้ใช้คนเดียวอาจเปิดหลายแท็บ → 1 userId มีได้หลาย socket
    จึงเก็บเป็น Map<userId, Set<socket>> ไม่ใช่ Map<userId, socket>
*/

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const pool = require('./config/db');

// userId -> Set ของ socket ที่ user คนนั้นเปิดอยู่
const online = new Map();

let wss = null;

// โมดูลอื่นลงทะเบียนตัวจัดการข้อความเข้ามาได้ (เช่น ระบบห้องแข่ง)
// เพื่อเลี่ยงการ require กันไปมาจนเกิด circular dependency
const messageHandlers = [];   // fn(socket, msg) -> true ถ้าจัดการแล้ว
const disconnectHandlers = []; // fn(userId, socket, { stillOnline })
const connectHandlers = [];    // fn(userId, socket) — เช่น กลับเข้าห้องแข่งเดิมหลังเน็ตหลุด/รีเฟรช

function registerMessageHandler(fn) { messageHandlers.push(fn); }
function registerDisconnectHandler(fn) { disconnectHandlers.push(fn); }
function registerConnectHandler(fn) { connectHandlers.push(fn); }

/* ---------------- ตัวช่วยพื้นฐาน ---------------- */

function isOnline(userId) {
  const set = online.get(Number(userId));
  return Boolean(set && set.size > 0);
}

function getOnlineCount() {
  // นับ "จำนวนคน" ไม่ใช่จำนวนแท็บ
  return online.size;
}

function getOnlineUserIds() {
  return Array.from(online.keys());
}

function send(socket, type, payload = {}) {
  if (socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify({ type, ...payload }));
  } catch (_err) {
    // ถ้าส่งไม่ได้ก็ข้ามไป ไม่ต้องทำให้ทั้งระบบพัง
  }
}

// ส่งข้อความหา user คนหนึ่ง (ทุกแท็บที่เขาเปิดอยู่)
function sendToUser(userId, type, payload = {}) {
  const set = online.get(Number(userId));
  if (!set) return false;
  set.forEach((socket) => send(socket, type, payload));
  return true;
}

// ส่งหาทุกคนที่ออนไลน์
function broadcastAll(type, payload = {}) {
  online.forEach((set) => set.forEach((socket) => send(socket, type, payload)));
}

// ส่งหาเฉพาะเพื่อนของ user คนนี้
async function sendToFriendsOf(userId, type, payload = {}) {
  try {
    const { rows } = await pool.query(
      `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
         FROM friendships
        WHERE status = 'accepted'
          AND (requester_id = $1 OR addressee_id = $1)`,
      [userId]
    );
    rows.forEach((r) => sendToUser(r.friend_id, type, payload));
  } catch (err) {
    console.error('[realtime/sendToFriendsOf]', err.message);
  }
}

/* ---------------- อัปเดตฐานข้อมูล ---------------- */

async function touchLastSeen(userId) {
  try {
    await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId]);
  } catch (err) {
    // ฐานข้อมูลล่มไม่ควรทำให้ WebSocket ตาย
    console.error('[realtime/touchLastSeen]', err.message);
  }
}

/* ---------------- จำนวนคนออนไลน์ ---------------- */

let countTimer = null;

// รวบการแจ้งเตือนจำนวนคนออนไลน์ ไม่ให้ยิงถี่เกินไปตอนคนเข้าออกพร้อมกัน
function scheduleCountBroadcast() {
  if (countTimer) return;
  countTimer = setTimeout(() => {
    countTimer = null;
    broadcastAll('presence:count', { count: getOnlineCount() });
  }, 400);
}

/* ---------------- ตัวจัดการการเชื่อมต่อ ---------------- */

async function handleConnection(socket, userId, username) {
  socket.userId = userId;
  socket.isAlive = true;

  const firstConnection = !isOnline(userId);

  if (!online.has(userId)) online.set(userId, new Set());
  online.get(userId).add(socket);

  await touchLastSeen(userId);

  // บอกตัวเองว่าเชื่อมต่อสำเร็จแล้ว
  send(socket, 'connected', {
    userId,
    username,
    onlineCount: getOnlineCount(),
  });

  connectHandlers.forEach((fn) => {
    try { fn(userId, socket); } catch (err) { console.error('[realtime/connect]', err.message); }
  });

  // ถ้าเพิ่งออนไลน์ (ไม่ใช่แค่เปิดแท็บเพิ่ม) ค่อยแจ้งเพื่อน
  if (firstConnection) {
    sendToFriendsOf(userId, 'friend:presence', { userId, online: true });
  }
  scheduleCountBroadcast();

  socket.on('pong', () => { socket.isAlive = true; });

  // จำกัดอัตราข้อความต่อ socket กันสแปม (เช่น ยิง room:answer รัว ๆ)
  socket.msgWindow = { count: 0, resetAt: Date.now() + 1000 };

  socket.on('message', (raw) => {
    const now = Date.now();
    if (now > socket.msgWindow.resetAt) {
      socket.msgWindow.count = 0;
      socket.msgWindow.resetAt = now + 1000;
    }
    socket.msgWindow.count += 1;
    if (socket.msgWindow.count > 20) return; // เกิน 20 ข้อความ/วินาที — ทิ้ง

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_err) {
      return; // ข้อความไม่ใช่ JSON — ไม่สนใจ
    }
    handleMessage(socket, msg);
  });

  socket.on('close', () => {
    const set = online.get(userId);
    if (set) set.delete(socket);
    // แจ้งโมดูลอื่น "หลัง" เอา socket ออกแล้ว พร้อมบอกว่ายังมีแท็บอื่นเชื่อมต่ออยู่ไหม
    // (เดิมแจ้งก่อน — ปิดแท็บหนึ่งก็ถือว่าผู้เล่นหลุด แม้ยังเล่นอยู่อีกแท็บ)
    const stillOnline = Boolean(set && set.size > 0);
    disconnectHandlers.forEach((fn) => {
      try { fn(userId, socket, { stillOnline }); } catch (err) { console.error('[realtime/disconnect]', err.message); }
    });
    if (!set) return;

    if (set.size === 0) {
      online.delete(userId);
      touchLastSeen(userId);
      sendToFriendsOf(userId, 'friend:presence', { userId, online: false });
    }
    scheduleCountBroadcast();
  });

  socket.on('error', () => {
    try { socket.terminate(); } catch (_e) { /* ปิดไปแล้ว */ }
  });
}

// ส่งรายชื่อเฉพาะเพื่อนที่กำลังออนไลน์ให้ socket นี้
async function sendFriendsOnline(socket) {
  try {
    const { rows } = await pool.query(
      `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
         FROM friendships
        WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
      [socket.userId]
    );
    const onlineFriendIds = rows
      .map((r) => r.friend_id)
      .filter((id) => isOnline(id));
    send(socket, 'presence:list', {
      userIds: onlineFriendIds,
      count: getOnlineCount(),
    });
  } catch (err) {
    console.error('[realtime/sendFriendsOnline]', err.message);
    send(socket, 'presence:list', { userIds: [], count: getOnlineCount() });
  }
}

function handleMessage(socket, msg) {
  switch (msg.type) {
    case 'ping':
      send(socket, 'pong');
      break;
    case 'presence:who':
      // ส่งเฉพาะ "เพื่อนที่ออนไลน์" ไม่เปิดเผยรายชื่อคนทั้งระบบ
      // (ยอดรวมคนออนไลน์ส่งได้ เพราะเป็นตัวเลขรวม ไม่ชี้ตัวบุคคล)
      sendFriendsOnline(socket);
      break;
    default: {
      // ส่งต่อให้โมดูลที่ลงทะเบียนไว้ (เช่น ระบบห้องแข่ง)
      for (const fn of messageHandlers) {
        try {
          if (fn(socket, msg) === true) return;
        } catch (err) {
          console.error('[realtime/handler]', err.message);
        }
      }
      break;
    }
  }
}

/* ---------------- ตั๋วเชื่อมต่อ WebSocket (v1.10.0 Phase 5) ----------------
   POST /api/realtime/ticket (ต้องเข้าสู่ระบบ) → ตั๋วสุ่ม 32 ไบต์ ใช้ได้ครั้งเดียวภายใน 30 วินาที
   เก็บในหน่วยความจำ (เซิร์ฟเวอร์เดียว — สถานะ online ก็อยู่ในหน่วยความจำเช่นกัน) */
const crypto = require('crypto');
const TICKET_TTL_MS = 30 * 1000;
const TICKET_MAX = 20000;
const tickets = new Map(); // ticket -> { userId, username, tv, exp }
function queryTokenAllowed() {
  return process.env.WS_QUERY_TOKEN === 'on' || (process.env.NODE_ENV !== 'production' && process.env.WS_QUERY_TOKEN !== 'off');
}
function sweepTickets(now = Date.now()) {
  for (const [k, v] of tickets) if (v.exp <= now) tickets.delete(k);
}
function issueTicket(userId, username, tv) {
  if (tickets.size >= TICKET_MAX) sweepTickets();
  if (tickets.size >= TICKET_MAX) tickets.delete(tickets.keys().next().value);
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(ticket, { userId: Number(userId), username: username || null, tv: tv || 0, exp: Date.now() + TICKET_TTL_MS });
  return { ticket, expiresIn: TICKET_TTL_MS / 1000 };
}
function consumeTicket(ticket) {
  if (typeof ticket !== 'string' || ticket.length > 64) return null;
  const v = tickets.get(ticket);
  if (!v) return null;
  tickets.delete(ticket); // ใช้ครั้งเดียว
  return v.exp > Date.now() ? v : null;
}

/* ---------------- ติดตั้งเข้ากับ HTTP server ---------------- */

function attach(httpServer) {
  // ใช้ noServer แล้วจัดการ upgrade เอง เพื่อจะได้ตรวจ token ก่อนรับเข้า
  // จำกัดขนาดข้อความที่ 16KB (ค่าเริ่มต้นของไลบรารีคือ 100MB ซึ่งอันตราย)
  // ข้อความในระบบนี้ใหญ่สุดคือ passage ของห้องแข่ง ยังเล็กกว่านี้มาก
  wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  httpServer.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch (_err) {
      socket.destroy();
      return;
    }

    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // v1.10.0 Phase 5: ใช้ "ตั๋ว" ใช้ครั้งเดียวอายุ 30 วิ แทน JWT ใน URL (URL ถูกเก็บใน log ของ proxy/เซิร์ฟเวอร์ได้)
    //   ?token= (แบบเดิม) ใช้ได้เฉพาะนอก production หรือเมื่อตั้ง WS_QUERY_TOKEN=on ชั่วคราว
    const reject = (code, text) => { socket.write(`HTTP/1.1 ${code} ${text}\r\n\r\n`); socket.destroy(); };
    const ticketParam = url.searchParams.get('ticket');
    const token = url.searchParams.get('token');
    let claim = null; // { userId, username, tv }
    if (ticketParam) {
      claim = consumeTicket(ticketParam);
      if (!claim) return reject(401, 'Unauthorized');
    } else if (token && queryTokenAllowed()) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        claim = { userId: payload.userId, username: payload.username || null, tv: payload.tv || 0 };
      } catch (_err) { return reject(401, 'Unauthorized'); }
    } else {
      return reject(401, 'Unauthorized');
    }

    // ตรวจ token_version เหมือน REST (ออกจากระบบทุกอุปกรณ์/เปลี่ยนรหัสผ่านแล้ว token เก่าต่อ WebSocket ไม่ได้ — เดิมตรวจแค่ลายเซ็น)
    pool.query('SELECT token_version FROM users WHERE id = $1', [claim.userId]).then(({ rows }) => {
      if (!rows[0] || (rows[0].token_version || 0) !== (claim.tv || 0)) return reject(401, 'Unauthorized');
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleConnection(ws, Number(claim.userId), claim.username || null);
      });
    }).catch(() => reject(503, 'Service Unavailable'));
  });

  // ตรวจสุขภาพการเชื่อมต่อทุก 10 วินาที (config/battle.js)
  // เผื่อกรณีเน็ตหลุดแบบไม่ส่งสัญญาณปิด (เช่น ปิดฝาโน้ตบุ๊ก / มือถือดับ) — Ranked ต้องรู้เร็วพอจะเริ่มนับ grace 30 วินาที
  const interval = setInterval(() => {
    sweepTickets();
    wss.clients.forEach((socket) => {
      if (socket.isAlive === false) {
        try { socket.terminate(); } catch (_e) { /* ปิดไปแล้ว */ }
        return;
      }
      socket.isAlive = false;
      try { socket.ping(); } catch (_e) { /* ปิดไปแล้ว */ }
    });
  }, require('./config/battle').BATTLE.wsHeartbeatMs);
  interval.unref();

  wss.on('close', () => clearInterval(interval));

  console.log('WebSocket พร้อมใช้งานที่ /ws');
  return wss;
}

module.exports = {
  issueTicket,
  consumeTicket,
  attach,
  send,
  registerMessageHandler,
  registerDisconnectHandler,
  registerConnectHandler,
  isOnline,
  getOnlineCount,
  getOnlineUserIds,
  sendToUser,
  broadcastAll,
  sendToFriendsOf,
};
