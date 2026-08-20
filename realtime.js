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
const disconnectHandlers = []; // fn(userId, socket)

function registerMessageHandler(fn) { messageHandlers.push(fn); }
function registerDisconnectHandler(fn) { disconnectHandlers.push(fn); }

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

  // ถ้าเพิ่งออนไลน์ (ไม่ใช่แค่เปิดแท็บเพิ่ม) ค่อยแจ้งเพื่อน
  if (firstConnection) {
    sendToFriendsOf(userId, 'friend:presence', { userId, online: true });
  }
  scheduleCountBroadcast();

  socket.on('pong', () => { socket.isAlive = true; });

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_err) {
      return; // ข้อความไม่ใช่ JSON — ไม่สนใจ
    }
    handleMessage(socket, msg);
  });

  socket.on('close', () => {
    // แจ้งโมดูลอื่นก่อน (เช่น เอาผู้เล่นออกจากห้องแข่ง)
    disconnectHandlers.forEach((fn) => {
      try { fn(userId, socket); } catch (err) { console.error('[realtime/disconnect]', err.message); }
    });

    const set = online.get(userId);
    if (!set) return;
    set.delete(socket);

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

function handleMessage(socket, msg) {
  switch (msg.type) {
    case 'ping':
      send(socket, 'pong');
      break;
    case 'presence:who':
      // ขอรายชื่อ id ที่ออนไลน์ (ใช้ตอนเปิดหน้าเพื่อน)
      send(socket, 'presence:list', {
        userIds: getOnlineUserIds(),
        count: getOnlineCount(),
      });
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

/* ---------------- ติดตั้งเข้ากับ HTTP server ---------------- */

function attach(httpServer) {
  // ใช้ noServer แล้วจัดการ upgrade เอง เพื่อจะได้ตรวจ token ก่อนรับเข้า
  wss = new WebSocketServer({ noServer: true });

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

    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, Number(payload.userId), payload.username || null);
    });
  });

  // ตรวจสุขภาพการเชื่อมต่อทุก 30 วินาที
  // เผื่อกรณีเน็ตหลุดแบบไม่ส่งสัญญาณปิด (เช่น ปิดฝาโน้ตบุ๊ก / มือถือดับ)
  const interval = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (socket.isAlive === false) {
        try { socket.terminate(); } catch (_e) { /* ปิดไปแล้ว */ }
        return;
      }
      socket.isAlive = false;
      try { socket.ping(); } catch (_e) { /* ปิดไปแล้ว */ }
    });
  }, 30000);
  interval.unref();

  wss.on('close', () => clearInterval(interval));

  console.log('🔌 WebSocket พร้อมใช้งานที่ /ws');
  return wss;
}

module.exports = {
  attach,
  send,
  registerMessageHandler,
  registerDisconnectHandler,
  isOnline,
  getOnlineCount,
  getOnlineUserIds,
  sendToUser,
  broadcastAll,
  sendToFriendsOf,
};
