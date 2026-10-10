/*
  Battle config — ค่ากลางของระบบ HP / การหลุด / บทลงโทษ ของ Ranked Quest (จุดเดียว ห้าม hard-code กระจายตามไฟล์)
  ใช้ทั้งฝั่งเซิร์ฟเวอร์ (คำนวณ HP / ผลแพ้ชนะ / QR) และส่งบางส่วนให้หน้าเว็บผ่าน GET /api/ranked/config (publicConfig)

  หลัก:
    - HP เท่ากันทุกแรงค์และทุก NPC — แรงค์/ของตกแต่งไม่เพิ่ม HP / Damage / เวลา / คะแนน (ไม่มี Pay-to-win)
    - Damage มาจาก "ความถูกต้อง" เป็นหลัก · ความเร็วไม่คูณ Damage (ใช้แค่ Battle Score และตัดสินเสมอ)
    - ค่าเวลาทั้งหมด override ได้ด้วย env (ใช้ในชุดทดสอบ)
*/
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);

const BATTLE = {
  // ระบบ HP ใน Ranked: ปิดไว้ (เจ้าของระบบต้องการให้เล่นครบทุกข้อ ไม่มีหลอด HP) — เปลี่ยนเป็น true เพื่อเปิดกลับมาได้ทันที
  hpEnabled: process.env.RANKED_HP === 'on',
  initialHp: 100,

  // ความยากของข้อ -> Damage พื้นฐาน (ระดับ CEFR ของข้อเท่ากับระดับเกมเสมอ จึงแบ่งตามชนิดคำถาม + ความยากเฉพาะข้อ)
  damage: { easy: 10, normal: 12, hard: 15 },
  difficultyByType: { vocabulary: 'easy', context: 'normal', grammar: 'normal', reading: 'hard' },
  hardAdjThreshold: 0.3,          // ข้อที่ยากกว่าปกติ (เช่น TOEIC/TOEFL) ขยับขึ้นหนึ่งระดับ

  // Combo: ตอบถูกติดกัน ข้อที่ 2 +1 · ข้อที่ 3 +2 · ตั้งแต่ข้อที่ 4 +3 (เพดาน) — ตอบผิดรีเซ็ต
  comboBonusPerStreak: 1,
  comboBonusMax: 3,

  // เกมทีม 2v2: HP รวมของทีม 100 · แต่ละคนทำ/รับ Damage ครึ่งหนึ่ง (จังหวะเกมเท่ากับ 1v1)
  teamDamageScale: 0.5,

  criticalHpRatio: 0.25,          // ต่ำกว่า 25% = Critical State (UI นุ่มนวล ไม่กระพริบแรง)

  // ---- การเชื่อมต่อ ----
  reconnectGraceSeconds: env('RANKED_GRACE_SECONDS', 30),
  wsHeartbeatMs: env('WS_HEARTBEAT_MS', 10000),        // ตรวจ socket ที่ตายเงียบ ๆ (ปิดฝาโน้ตบุ๊ก / เน็ตดับ)
  npcPingMs: env('RANKED_NPC_PING_MS', 10000),          // เกม NPC (REST): หน้าเว็บส่งสัญญาณว่ายังอยู่
  npcSilenceMs: env('RANKED_NPC_SILENCE_MS', 15000),    // เงียบเกินนี้ = ถือว่าหลุด -> เริ่มนับ grace
  sweepMs: env('RANKED_SWEEP_MS', 3000),
  matchIdleMinutes: env('RANKED_IDLE_MINUTES', 10),     // เชื่อมต่ออยู่แต่ไม่เล่นต่อเลยนานเกินนี้ = timeout

  // ---- Quest Rating penalty ----
  penalties: {
    normalLossQr: 'elo',          // แพ้ปกติ: ใช้สูตร Elo เดิม (ประมาณ −12 ที่ K=40)
    surrenderPenaltyQr: 18,       // กดออก/ยอมแพ้
    disconnectPenaltyQr: 18,      // หลุดแล้วไม่กลับมาในเวลา
    timeoutPenaltyQr: 18,         // ค้างเกมไว้โดยไม่เล่นต่อ
    // League ผู้เล่นใหม่ (มี Beginner Protection): หักเล็กน้อยเฉพาะตอนออกกลางเกม
    beginner: { 'trail-finch': 3, 'swift-hare': 5 },
    // ออกกลางเกมไม่เคย "ถูกกว่า" แพ้ปกติ: ใช้ค่าที่หนักกว่าระหว่าง Elo กับ penalty
  },
  repeat: {
    windowHours: 24,
    escalateFrom: 2,              // ครั้งที่ 2 ในช่วงเวลา -> penalty × multiplier
    multiplier: 1.25,
    cooldownFrom: 3,              // ครั้งที่ 3 ขึ้นไป -> พัก Ranked ชั่วคราว
    cooldownMinutes: 5,
  },
};

/*
  EXP จาก Ranked (เข้าระบบเลเวลเดียวกับการเรียน + กระดานอันดับ EXP)
    ชนะ 20 · เสมอ 15 · แพ้ 10 + ตอบถูกข้อละ 2  ->  เกมละ 10–40 EXP
    ออกกลางเกม/หลุดไม่กลับ = 0 · เพดานวันละ 300 EXP จาก Ranked (กันปั๊มเกมเก็บ EXP — เลยเพดานยังได้แต้มแรงค์ตามปกติ)
*/
const RANKED_EXP = {
  base: { win: 20, draw: 15, loss: 10 },
  perCorrect: 2,
  dailyCap: Number(process.env.RANKED_EXP_DAILY_CAP || 300),
  timezone: 'Asia/Bangkok',
};

/** ความยากของข้อ: 'easy' | 'normal' | 'hard' */
function difficultyOf(q) {
  const order = ['easy', 'normal', 'hard'];
  let i = order.indexOf(BATTLE.difficultyByType[q.type] || 'normal');
  if ((q.difficultyAdj || 0) >= BATTLE.hardAdjThreshold) i = Math.min(2, i + 1);
  return order[i];
}

/** ค่า penalty (บวก) ของการออกกลางเกมตาม League และเหตุผล */
function quitPenalty(leagueId, reason) {
  const p = BATTLE.penalties;
  if (p.beginner[leagueId] !== undefined) return p.beginner[leagueId];
  return reason === 'surrender' ? p.surrenderPenaltyQr : reason === 'timeout' ? p.timeoutPenaltyQr : p.disconnectPenaltyQr;
}

function publicConfig() {
  return {
    hpEnabled: BATTLE.hpEnabled !== false, initialHp: BATTLE.initialHp, damage: BATTLE.damage, comboBonusMax: BATTLE.comboBonusMax,
    criticalHpRatio: BATTLE.criticalHpRatio, reconnectGraceSeconds: BATTLE.reconnectGraceSeconds,
    npcPingMs: BATTLE.npcPingMs, teamDamageScale: BATTLE.teamDamageScale,
    penalties: { surrender: BATTLE.penalties.surrenderPenaltyQr, disconnect: BATTLE.penalties.disconnectPenaltyQr, beginner: BATTLE.penalties.beginner },
    repeat: BATTLE.repeat,
  };
}

module.exports = { BATTLE, RANKED_EXP, difficultyOf, quitPenalty, publicConfig };
