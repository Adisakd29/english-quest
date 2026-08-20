/*
  ระบบห้องแข่งทายคำศัพท์ (Battle Room)

  แนวคิด:
    - ห้องเก็บไว้ในหน่วยความจำ (ไม่ลง DB) เพราะเป็นข้อมูลชั่วคราว จบเกมก็ทิ้ง
      → ข้อจำกัด: ถ้าเซิร์ฟเวอร์รีสตาร์ต ห้องที่ค้างอยู่จะหายไป ซึ่งรับได้
    - "เฉลย" เก็บไว้ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่เคยส่งไปหาผู้เล่นก่อนหมดเวลา
      → กันการโกงด้วยการเปิดดูโค้ดหน้าเว็บ
    - คะแนน = ตอบถูกได้ 100 + โบนัสความเร็วสูงสุด 100 (ยิ่งเร็วยิ่งได้เยอะ)

  ที่มาของคำถาม (ไล่ตามลำดับ):
    1. คำที่มีคำแปลไทยอยู่แล้ว (คลังที่ยืนยันแล้ว + แคชในฐานข้อมูล) → ถามความหมาย
    2. ถ้าคำแปลไม่พอ → ใช้คำถามสะกดคำแทน (สร้างได้ออฟไลน์เสมอ)
    ทำให้ห้องเริ่มเกมได้เสมอ ไม่ต้องรอเรียกบริการแปลภาษาภายนอกกลางเกม
*/

const pool = require('./config/db');
const realtime = require('./realtime');
const wordsData = require('./data/words.json');
const { VERIFIED_TRANSLATIONS } = require('./data/verified_translations');
const { getLevelInfo } = require('./utils/leveling');

const rooms = new Map();        // code -> room
const userRoom = new Map();     // userId -> code

const MAX_PLAYERS = 8;
const QUESTION_MS = 12000;      // เวลาตอบต่อข้อ
const REVEAL_MS = 2500;         // เวลาโชว์เฉลยก่อนไปข้อถัดไป
const COUNTDOWN_S = 3;
const ROOM_IDLE_MS = 30 * 60 * 1000; // ห้องที่ไม่มีใครเล่น 30 นาที จะถูกลบ

/* ---------------- ตัวช่วยทั่วไป ---------------- */

function makeCode() {
  // ตัดตัวที่สับสนออก (0/O, 1/I) เพื่อให้บอกรหัสกันปากเปล่าได้ง่าย
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cleanWord(word) {
  return String(word || '').replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
}

/* ---------------- สร้างคำถาม ---------------- */

// คำถามแบบถามความหมาย: ต้องมีคำแปลไทย
async function buildMeaningQuestions(level, count) {
  const list = wordsData.levels[level] || [];
  if (list.length === 0) return [];

  const ids = list.map((w) => w.id);

  // ดึงคำแปลจากแคชในฐานข้อมูล
  let cached = [];
  try {
    const { rows } = await pool.query(
      'SELECT word_id, th_text FROM translations WHERE word_id = ANY($1)',
      [ids]
    );
    cached = rows;
  } catch (err) {
    console.error('[rooms/translations]', err.message);
  }

  const thById = new Map();
  cached.forEach((r) => {
    const th = String(r.th_text || '').trim();
    // ต้องเป็นภาษาไทยจริง ๆ ไม่มีอังกฤษปน
    if (th && /[\u0E00-\u0E7F]/.test(th) && !/[a-zA-Z]/.test(th)) thById.set(r.word_id, th);
  });

  // เติมจากคลังคำแปลที่ยืนยันแล้ว
  list.forEach((w) => {
    const key = cleanWord(w.word).toLowerCase();
    if (VERIFIED_TRANSLATIONS[key]) thById.set(w.id, VERIFIED_TRANSLATIONS[key]);
  });

  const usable = list.filter((w) => thById.has(w.id));
  // ต้องมีอย่างน้อย 4 คำ ถึงจะสร้างตัวเลือกได้
  if (usable.length < 4) return [];

  const picked = shuffle(usable).slice(0, count);
  return picked.map((w) => {
    const correct = thById.get(w.id);
    // หาตัวลวงจากคำแปลอื่นที่ไม่ซ้ำกับคำตอบ
    const distractors = shuffle(
      usable.filter((x) => x.id !== w.id && thById.get(x.id) !== correct)
    ).slice(0, 3).map((x) => thById.get(x.id));

    if (distractors.length < 3) return null;

    const choices = shuffle([correct, ...distractors]);
    return {
      kind: 'meaning',
      prompt: cleanWord(w.word),
      hint: w.pos || '',
      choices,
      correctIndex: choices.indexOf(correct),
    };
  }).filter(Boolean);
}

// คำถามสะกดคำ: สร้างได้เสมอ ไม่ต้องมีคำแปล (ใช้เป็นตัวสำรอง)
function misspell(word) {
  const w = word.toLowerCase();
  const variants = new Set();

  // สลับตัวอักษรสองตัวติดกัน
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i] !== w[i + 1] && /[a-z]/.test(w[i]) && /[a-z]/.test(w[i + 1])) {
      variants.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
    }
  }
  // เพิ่มตัวอักษรซ้ำ
  for (let i = 0; i < w.length; i++) {
    if (/[a-z]/.test(w[i])) variants.add(w.slice(0, i) + w[i] + w.slice(i));
  }
  // สลับสระที่มักสับสน
  const swaps = [['a', 'e'], ['e', 'i'], ['i', 'y'], ['o', 'u'], ['c', 's']];
  swaps.forEach(([x, y]) => {
    if (w.includes(x)) variants.add(w.replace(x, y));
    if (w.includes(y)) variants.add(w.replace(y, x));
  });

  variants.delete(w);
  return shuffle([...variants]).slice(0, 3);
}

function buildSpellingQuestions(level, count) {
  const list = (wordsData.levels[level] || [])
    .filter((w) => /^[a-zA-Z]{4,}$/.test(cleanWord(w.word)));
  if (list.length === 0) return [];

  return shuffle(list).slice(0, count).map((w) => {
    const correct = cleanWord(w.word).toLowerCase();
    const wrong = misspell(correct);
    if (wrong.length < 3) return null;
    const choices = shuffle([correct, ...wrong]);
    return {
      kind: 'spelling',
      prompt: 'คำใดสะกดถูกต้อง',
      hint: w.pos || '',
      choices,
      correctIndex: choices.indexOf(correct),
    };
  }).filter(Boolean);
}

async function buildQuestions(level, count) {
  const meaning = await buildMeaningQuestions(level, count);
  if (meaning.length >= count) return meaning.slice(0, count);

  // คำแปลไม่พอ → เติมด้วยคำถามสะกดคำ
  const need = count - meaning.length;
  const spelling = buildSpellingQuestions(level, need);
  const combined = shuffle([...meaning, ...spelling]);
  return combined.slice(0, count);
}

/* ---------------- ข้อมูลห้องที่ส่งให้ผู้เล่น ---------------- */

function playerList(room) {
  return [...room.players.values()]
    .map((p) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      avatarImage: p.avatarImage,
      score: p.score,
      isHost: p.id === room.hostId,
      connected: p.connected,
      answered: Boolean(p.answeredIndex !== null && p.answeredIndex !== undefined),
    }))
    .sort((a, b) => b.score - a.score);
}

function roomSnapshot(room) {
  return {
    code: room.code,
    level: room.level,
    status: room.status,
    hostId: room.hostId,
    questionCount: room.questionCount,
    currentIndex: room.currentIndex,
    players: playerList(room),
  };
}

function broadcast(room, type, payload = {}) {
  room.players.forEach((p) => realtime.sendToUser(p.id, type, payload));
}

function broadcastState(room) {
  broadcast(room, 'room:state', roomSnapshot(room));
}

/* ---------------- วงจรเกม ---------------- */

function clearTimers(room) {
  if (room.questionTimer) { clearTimeout(room.questionTimer); room.questionTimer = null; }
  if (room.revealTimer) { clearTimeout(room.revealTimer); room.revealTimer = null; }
  if (room.countdownTimer) { clearInterval(room.countdownTimer); room.countdownTimer = null; }
}

async function startGame(room) {
  room.status = 'preparing';
  broadcastState(room);

  let questions;
  try {
    questions = await buildQuestions(room.level, room.questionCount);
  } catch (err) {
    console.error('[rooms/buildQuestions]', err);
    questions = [];
  }

  if (!questions || questions.length < 3) {
    room.status = 'lobby';
    broadcast(room, 'room:error', {
      message: 'สร้างคำถามไม่สำเร็จ ลองเปลี่ยนระดับคำศัพท์ดูนะ',
    });
    broadcastState(room);
    return;
  }

  room.questions = questions;
  room.questionCount = questions.length;
  room.currentIndex = -1;
  room.players.forEach((p) => { p.score = 0; p.correctCount = 0; });

  // นับถอยหลังก่อนเริ่ม
  room.status = 'countdown';
  let n = COUNTDOWN_S;
  broadcast(room, 'room:countdown', { seconds: n });
  room.countdownTimer = setInterval(() => {
    n -= 1;
    if (n > 0) {
      broadcast(room, 'room:countdown', { seconds: n });
    } else {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
      nextQuestion(room);
    }
  }, 1000);
}

function nextQuestion(room) {
  clearTimers(room);
  room.currentIndex += 1;

  if (room.currentIndex >= room.questions.length) {
    endGame(room);
    return;
  }

  const q = room.questions[room.currentIndex];
  room.status = 'playing';
  room.questionStartedAt = Date.now();
  room.players.forEach((p) => { p.answeredIndex = null; p.answeredAt = null; });

  // ส่งคำถามโดย "ไม่มี" correctIndex ติดไปด้วย
  broadcast(room, 'room:question', {
    index: room.currentIndex,
    total: room.questions.length,
    kind: q.kind,
    prompt: q.prompt,
    hint: q.hint,
    choices: q.choices,
    durationMs: QUESTION_MS,
  });

  room.questionTimer = setTimeout(() => revealAnswer(room), QUESTION_MS);
}

function revealAnswer(room) {
  clearTimers(room);
  if (room.status !== 'playing') return;
  room.status = 'reveal';

  const q = room.questions[room.currentIndex];

  const results = [...room.players.values()].map((p) => ({
    id: p.id,
    username: p.username,
    chosenIndex: p.answeredIndex,
    correct: p.answeredIndex === q.correctIndex,
    score: p.score,
    gained: p.lastGain || 0,
  }));

  broadcast(room, 'room:reveal', {
    index: room.currentIndex,
    correctIndex: q.correctIndex,
    results,
    players: playerList(room),
  });

  room.revealTimer = setTimeout(() => nextQuestion(room), REVEAL_MS);
}

async function endGame(room) {
  clearTimers(room);
  room.status = 'finished';

  const ranking = [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({
      rank: i + 1,
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      avatarImage: p.avatarImage,
      score: p.score,
      correctCount: p.correctCount || 0,
      total: room.questions.length,
    }));

  // ให้ EXP ตามผลงาน (ที่ 1 ได้โบนัส) — เฉพาะห้องที่มีคนตั้งแต่ 2 คนขึ้นไป
  const expAwards = {};
  if (room.players.size >= 2) {
    for (const r of ranking) {
      let exp = Math.round(r.score / 20);          // คะแนน 2000 ≈ 100 EXP
      if (r.rank === 1) exp += 30;                  // โบนัสผู้ชนะ
      else if (r.rank === 2) exp += 15;
      exp = Math.max(0, Math.min(exp, 200));        // กันค่าเพี้ยน
      expAwards[r.id] = exp;

      if (exp > 0) {
        try {
          await pool.query('UPDATE users SET exp = exp + $1 WHERE id = $2', [exp, r.id]);
          await pool.query(
            'INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, $3)',
            [r.id, exp, 'battle_room']
          );
        } catch (err) {
          console.error('[rooms/awardExp]', err.message);
        }
      }
    }
  }

  // ส่งผลให้แต่ละคน พร้อมเลเวลใหม่ของตัวเอง
  for (const p of room.players.values()) {
    let levelInfo = null;
    try {
      const { rows } = await pool.query('SELECT exp FROM users WHERE id = $1', [p.id]);
      if (rows[0]) levelInfo = getLevelInfo(rows[0].exp);
    } catch (_err) { /* ไม่ critical */ }

    realtime.sendToUser(p.id, 'room:ended', {
      ranking,
      gainedExp: expAwards[p.id] || 0,
      levelInfo,
      noExpReason: room.players.size < 2 ? 'เล่นคนเดียวไม่ได้ EXP นะ ชวนเพื่อนมาแข่งสิ!' : null,
    });
  }

  room.status = 'lobby';
  room.currentIndex = -1;
  room.questions = [];
  broadcastState(room);
}

/* ---------------- จัดการห้อง ---------------- */

function leaveRoom(userId, { silent = false } = {}) {
  const code = userRoom.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  userRoom.delete(userId);
  if (!room) return;

  room.players.delete(userId);

  if (room.players.size === 0) {
    clearTimers(room);
    rooms.delete(code);
    return;
  }

  // ถ้าเจ้าของห้องออก ให้คนถัดไปเป็นเจ้าของแทน
  if (room.hostId === userId) {
    room.hostId = [...room.players.keys()][0];
  }

  // ถ้ากำลังเล่นอยู่แล้วเหลือคนเดียว ก็ปล่อยให้เล่นจนจบ ไม่ตัดกลางคัน
  if (!silent) broadcastState(room);
}

function findOrError(socket, code) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) {
    realtime.send(socket, 'room:error', { message: 'ไม่พบห้องนี้ ตรวจรหัสอีกครั้งนะ' });
    return null;
  }
  return room;
}

async function getUserBrief(userId) {
  const { rows } = await pool.query(
    'SELECT id, username, avatar, avatar_image FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    username: rows[0].username,
    avatar: rows[0].avatar || 'fox',
    avatarImage: rows[0].avatar_image || null,
  };
}

function newPlayer(user) {
  return {
    ...user,
    score: 0,
    correctCount: 0,
    answeredIndex: null,
    answeredAt: null,
    lastGain: 0,
    connected: true,
  };
}

/* ---------------- ตัวรับข้อความจาก client ---------------- */

async function handle(socket, msg) {
  const userId = socket.userId;

  switch (msg.type) {
    /* ----- สร้างห้อง ----- */
    case 'room:create': {
      leaveRoom(userId); // ออกจากห้องเดิมก่อน (ถ้ามี)
      const level = ['A1', 'A2', 'B1', 'B2', 'C1'].includes(msg.level) ? msg.level : 'A1';
      const questionCount = Math.min(Math.max(Number(msg.questionCount) || 10, 5), 20);

      const user = await getUserBrief(userId);
      if (!user) return true;

      const room = {
        code: makeCode(),
        hostId: userId,
        level,
        questionCount,
        status: 'lobby',
        players: new Map([[userId, newPlayer(user)]]),
        questions: [],
        currentIndex: -1,
        createdAt: Date.now(),
        lastActive: Date.now(),
      };
      rooms.set(room.code, room);
      userRoom.set(userId, room.code);

      realtime.send(socket, 'room:joined', roomSnapshot(room));
      return true;
    }

    /* ----- เข้าห้องด้วยรหัส ----- */
    case 'room:join': {
      const room = findOrError(socket, msg.code);
      if (!room) return true;

      if (room.players.has(userId)) {
        // กลับเข้าห้องเดิม (เช่น รีเฟรชหน้า)
        room.players.get(userId).connected = true;
        userRoom.set(userId, room.code);
        realtime.send(socket, 'room:joined', roomSnapshot(room));
        broadcastState(room);
        return true;
      }
      if (room.players.size >= MAX_PLAYERS) {
        realtime.send(socket, 'room:error', { message: `ห้องเต็มแล้ว (สูงสุด ${MAX_PLAYERS} คน)` });
        return true;
      }
      if (room.status !== 'lobby') {
        realtime.send(socket, 'room:error', { message: 'ห้องนี้กำลังแข่งอยู่ รอรอบหน้านะ' });
        return true;
      }

      leaveRoom(userId);
      const user = await getUserBrief(userId);
      if (!user) return true;

      room.players.set(userId, newPlayer(user));
      room.lastActive = Date.now();
      userRoom.set(userId, room.code);

      realtime.send(socket, 'room:joined', roomSnapshot(room));
      broadcastState(room);
      return true;
    }

    /* ----- ออกจากห้อง ----- */
    case 'room:leave': {
      leaveRoom(userId);
      realtime.send(socket, 'room:left', {});
      return true;
    }

    /* ----- เริ่มเกม (เจ้าของห้องเท่านั้น) ----- */
    case 'room:start': {
      const code = userRoom.get(userId);
      const room = code ? rooms.get(code) : null;
      if (!room) return true;
      if (room.hostId !== userId) {
        realtime.send(socket, 'room:error', { message: 'เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้' });
        return true;
      }
      if (room.status !== 'lobby') return true;
      room.lastActive = Date.now();
      startGame(room);
      return true;
    }

    /* ----- ตอบคำถาม ----- */
    case 'room:answer': {
      const code = userRoom.get(userId);
      const room = code ? rooms.get(code) : null;
      if (!room || room.status !== 'playing') return true;

      const player = room.players.get(userId);
      if (!player || player.answeredIndex !== null) return true; // ตอบไปแล้ว

      const q = room.questions[room.currentIndex];
      const idx = Number(msg.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= q.choices.length) return true;

      player.answeredIndex = idx;
      player.answeredAt = Date.now();
      room.lastActive = Date.now();

      let gained = 0;
      if (idx === q.correctIndex) {
        const elapsed = player.answeredAt - room.questionStartedAt;
        const remain = Math.max(0, QUESTION_MS - elapsed) / QUESTION_MS;
        gained = 100 + Math.round(100 * remain); // ยิ่งเร็วยิ่งได้เยอะ
        player.score += gained;
        player.correctCount = (player.correctCount || 0) + 1;
      }
      player.lastGain = gained;

      // ตอบแล้วรู้ผลทันทีเฉพาะตัวเอง (คนอื่นยังไม่เห็นเฉลย)
      realtime.send(socket, 'room:answered', {
        index: room.currentIndex,
        gained,
        score: player.score,
      });

      // บอกทุกคนว่าใครตอบแล้วบ้าง (ไม่บอกว่าตอบอะไร)
      broadcast(room, 'room:progress', {
        answered: [...room.players.values()].filter((p) => p.answeredIndex !== null).length,
        total: room.players.size,
      });

      // ถ้าทุกคนตอบครบแล้ว ไม่ต้องรอหมดเวลา
      const allAnswered = [...room.players.values()].every((p) => p.answeredIndex !== null);
      if (allAnswered) revealAnswer(room);
      return true;
    }

    /* ----- ชวนเพื่อนเข้าห้อง ----- */
    case 'room:invite': {
      const code = userRoom.get(userId);
      const room = code ? rooms.get(code) : null;
      if (!room) return true;

      const targetId = Number(msg.userId);
      if (!targetId || !realtime.isOnline(targetId)) {
        realtime.send(socket, 'room:error', { message: 'เพื่อนคนนี้ไม่ได้ออนไลน์อยู่' });
        return true;
      }
      const me = room.players.get(userId);
      realtime.sendToUser(targetId, 'room:invited', {
        code: room.code,
        from: me ? me.username : 'เพื่อน',
        level: room.level,
      });
      realtime.send(socket, 'room:inviteSent', {});
      return true;
    }

    default:
      return false; // ไม่ใช่ข้อความของระบบห้อง ปล่อยให้คนอื่นจัดการ
  }
}

/* ---------------- ติดตั้ง ---------------- */

function init() {
  realtime.registerMessageHandler((socket, msg) => {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('room:')) return false;
    // handle เป็น async — เรียกแล้วดักerror ไว้ ไม่ให้ทำ WebSocket ล้ม
    handle(socket, msg).catch((err) => {
      console.error('[rooms/handle]', err);
      realtime.send(socket, 'room:error', { message: 'เกิดข้อผิดพลาดในห้องแข่ง' });
    });
    return true;
  });

  realtime.registerDisconnectHandler((userId) => {
    const code = userRoom.get(userId);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) { userRoom.delete(userId); return; }

    const player = room.players.get(userId);
    if (!player) return;

    if (room.status === 'lobby') {
      // อยู่ห้องรอ → ออกจากห้องเลย
      leaveRoom(userId);
    } else {
      // กำลังแข่งอยู่ → ทำเครื่องหมายว่าหลุด แต่เก็บคะแนนไว้ เผื่อกลับมา
      player.connected = false;
      broadcastState(room);
    }
  });

  // เก็บกวาดห้องที่ถูกทิ้งร้าง
  const sweeper = setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, code) => {
      const idle = now - (room.lastActive || room.createdAt);
      const nobody = [...room.players.values()].every((p) => !p.connected);
      if (idle > ROOM_IDLE_MS || (nobody && idle > 60000)) {
        clearTimers(room);
        room.players.forEach((p) => userRoom.delete(p.id));
        rooms.delete(code);
      }
    });
  }, 60000);
  sweeper.unref();

  console.log('⚔️  ระบบห้องแข่งพร้อมใช้งาน');
}

module.exports = {
  init,
  // เปิดไว้สำหรับการทดสอบ
  _rooms: rooms,
  _buildQuestions: buildQuestions,
  _buildSpellingQuestions: buildSpellingQuestions,
};
