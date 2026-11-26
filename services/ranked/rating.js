/*
  Quest Rating (QR) — คำนวณฝั่งเซิร์ฟเวอร์ที่นี่ที่เดียว (ห้ามคำนวณฝั่ง client)
  ตรรกะล้วน ไม่แตะ DB -> ทดสอบได้ครบทุกกรณี

  สูตร: Elo ปรับแล้ว  E = 1 / (1 + 10^((R_opp − R_me) / 400))   Δ = K · (S − E)
    - ชนะคู่สูสี ≈ +K/2 (K=40 -> +20) · ชนะคู่แข็งกว่า -> +22..+28 · ชนะคู่อ่อนกว่าได้อย่างน้อย +12
    - แพ้คูณ lossMultiplier แล้วจำกัดไม่เกิน −12 (K=40) — แพ้ไม่เคยเสียมากกว่าชนะได้ (v1.18.0) · เสมอ 0..+2
    - แข่งกับ NPC: คะแนน NPC อิงตาม QR ของผู้เล่น (npcOpponentRating) ไม่ใช่ค่าคงที่
  กติกาเพิ่ม:
    - Beginner Protection ตาม League · หลังเลื่อน League คุ้มครอง N เกม
    - ข้ามเส้น League ไม่ได้ด้วย QR อย่างเดียว: QR ถูกหยุดที่ขอบ แล้วต้องชนะ Promotion Trial
    - ลด Division มี buffer (กันเด้งขึ้นลงจากเกมเดียว) · ด่านเลื่อนขั้นแพ้ = ไม่ตกขั้น
*/
const { LEAGUE_BY_ID, LEAGUES, RULES, nextLeague } = require('../../config/leagues');
const { quitPenalty } = require('../../config/battle');

const OUTCOME_SCORE = { win: 1, loss: 0, draw: 0.5 };

function expectedScore(myQr, oppQr) {
  return 1 / (1 + 10 ** ((oppQr - myQr) / 400));
}

/** QR ที่เปลี่ยน (ยังไม่รวมการคุ้มครอง/เพดาน)
    v1.18.0 ปรับสมดุล ("บวกน้อยแต่ลบเยอะ"): ชนะได้อย่างน้อย = แพ้เสียมากสุด (RULES.winFloorK = RULES.lossCapK)
    → ในเกมเดียวกัน แต้มที่เสียตอนแพ้ไม่มีทางมากกว่าแต้มที่ได้ตอนชนะ
    K=40: ชนะ +12..+28 (คู่สูสี +20) · แพ้ −1..−12 (คู่สูสี −12) */
function baseDelta({ qr, opponentRating, outcome, kFactor }) {
  const raw = kFactor * (OUTCOME_SCORE[outcome] - expectedScore(qr, opponentRating));
  if (outcome === 'win') return Math.min(Math.round(kFactor * RULES.winCapK), Math.max(Math.round(kFactor * RULES.winFloorK), Math.round(raw)));
  if (outcome === 'loss') return Math.max(-Math.round(kFactor * RULES.lossCapK), Math.min(0, Math.round(raw * RULES.lossMultiplier)));
  return Math.max(RULES.drawRange[0], Math.min(RULES.drawRange[1], Math.round(raw)));
}

/** v1.18.0 คะแนนความเก่งของ NPC เทียบกับผู้เล่น: เดิมใช้ค่าคงที่ต่อตัว → ผู้เล่นที่ไต่ถึงปลาย League จะ "เก่งกว่าบอทตามตัวเลข"
    ทำให้ชนะได้ +5..+8 แต่แพ้เสีย −15 ทั้งที่บอทถูกจับคู่มาให้สูสี
    ตอนนี้: QR ของผู้เล่น ± ความต่างของ NPC ตัวนั้นจากค่าเฉลี่ย NPC ใน League เดียวกัน (จำกัด ±RULES.npcOffsetMax) */
function npcOpponentRating(playerQr, npc, leagueNpcs) {
  if (!npc) return playerQr;
  const peers = (leagueNpcs || []).filter((n) => n.league === npc.league && Number.isFinite(n.rating));
  const mean = peers.length ? peers.reduce((a, n) => a + n.rating, 0) / peers.length : npc.rating;
  const off = Math.max(-RULES.npcOffsetMax, Math.min(RULES.npcOffsetMax, npc.rating - mean));
  return Math.max(0, Math.round(playerQr + off));
}

function isProtected(league, divisionIndex, protectionMatches) {
  if (protectionMatches > 0) return true;
  if (league.protection === 'full') return true;
  if (league.protection === 'division3' && divisionIndex === 0) return true;
  return false;
}

/** Division ภายใน League จาก QR (มี buffer ตอนลด) */
function divisionFor(league, currentIndex, qr) {
  let idx = currentIndex;
  while (idx + 1 < league.minQr.length && qr >= league.minQr[idx + 1]) idx += 1;           // ขึ้น
  while (idx > 0 && qr < league.minQr[idx] - RULES.demotionBuffer) idx -= 1;              // ลง (มี buffer)
  return idx;
}

/** ผ่านเงื่อนไขปลดล็อก Apex Trial (Crown Eagle -> Aurora Lion) หรือยัง */
function meetsApex(league, stats = {}) {
  const req = league.apexRequirements;
  if (!req) return true;
  const played = (stats.wins || 0) + (stats.losses || 0) + (stats.draws || 0);
  const winRate = played ? (stats.wins || 0) / played : 0;
  return played >= req.minMatches && winRate >= req.minWinRate;
}

/*
  profile : { league, divisionIndex, qr, promotionStatus, promotionRetryAfter, protectionMatches, wins, losses, draws }
  match   : { type: 'ranked'|'promotion'|'practice', outcome: 'win'|'loss'|'draw', opponentRating,
              forfeit?: { reason: 'surrender'|'disconnect'|'timeout', multiplier } }
            forfeit = ผู้เล่นคนนี้ออกกลางเกม -> หักตาม config/battle.js (ไม่เคยถูกกว่าแพ้ปกติ ·
            League ผู้เล่นใหม่หักเล็กน้อยแม้อยู่ในช่วงคุ้มครอง)
  คืน     : { delta, qr, league, divisionIndex, promotionStatus, promotionRetryAfter, protectionMatches, events: [] }
*/
function calculateQuestRating(profile, match) {
  const p = {
    league: profile.league, divisionIndex: profile.divisionIndex, qr: profile.qr,
    promotionStatus: profile.promotionStatus || 'none',
    promotionRetryAfter: profile.promotionRetryAfter || 0,
    protectionMatches: profile.protectionMatches || 0,
  };
  const league = LEAGUE_BY_ID[p.league];
  if (!league) throw new Error(`unknown league ${p.league}`);
  const events = [];

  // ---- ฝึกซ้อม: ไม่กระทบแรงค์ ----
  if (match.type === 'practice') return { ...p, delta: 0, events };

  // ---- ด่านเลื่อนขั้น (Promotion Trial / Apex Trial) ----
  if (match.type === 'promotion') {
    const next = nextLeague(p.league);
    if (match.outcome === 'win' && next) {
      events.push({ type: 'promoted', from: p.league, to: next.id });
      return {
        league: next.id, divisionIndex: 0, qr: Math.max(p.qr, next.minQr[0]), delta: Math.max(0, next.minQr[0] - p.qr),
        promotionStatus: 'none', promotionRetryAfter: 0, protectionMatches: RULES.promotionProtectionMatches, events,
      };
    }
    // แพ้/เสมอ: ไม่ตกขั้น ไม่เสีย QR — ลองใหม่ได้หลังเล่นเกมปกติครบตามกติกา
    events.push({ type: 'promotion_failed' });
    if (match.forfeit) {
      // ทิ้งด่านเลื่อนขั้นกลางคัน = แพ้ด่าน + penalty การออกกลางเกม
      const pen = Math.round(quitPenalty(p.league, match.forfeit.reason) * (match.forfeit.multiplier || 1));
      const qr = Math.max(0, p.qr - pen);
      events.push({ type: 'forfeit_penalty', amount: p.qr - qr });
      return { ...p, qr, divisionIndex: divisionFor(league, p.divisionIndex, qr), delta: qr - p.qr,
        promotionStatus: 'retry', promotionRetryAfter: RULES.promotionRetryAfterMatches, events };
    }
    return { ...p, delta: 0, promotionStatus: 'retry', promotionRetryAfter: RULES.promotionRetryAfterMatches, events };
  }

  // ---- เกม Ranked ปกติ ----
  let delta = baseDelta({ qr: p.qr, opponentRating: match.opponentRating, outcome: match.outcome, kFactor: league.kFactor });
  if (delta < 0 && isProtected(league, p.divisionIndex, p.protectionMatches)) {
    delta = 0;
    events.push({ type: 'protected' });
  }
  if (match.forfeit && match.outcome === 'loss') {
    const quit = -Math.round(quitPenalty(p.league, match.forfeit.reason) * (match.forfeit.multiplier || 1));
    if (quit < delta) {
      delta = quit;
      const i = events.findIndex((e) => e.type === 'protected');
      if (i >= 0) events.splice(i, 1);
    }
    events.push({ type: 'forfeit_penalty', amount: -delta });
  }
  if (p.protectionMatches > 0) p.protectionMatches -= 1;
  if (p.promotionRetryAfter > 0) p.promotionRetryAfter -= 1;

  let qr = Math.max(0, p.qr + delta);
  const next = nextLeague(p.league);

  // ขอบบนของ League: หยุด QR ไว้ แล้วรอ Promotion Trial (Aurora Lion ไม่มีขอบบน)
  if (next) {
    const cap = next.minQr[0] - 1;
    if (qr >= cap) {
      qr = cap;
      const eligible = league.apexRequirements ? meetsApex(league, profile) : true;
      if (eligible && p.promotionStatus !== 'pending') {
        p.promotionStatus = p.promotionRetryAfter > 0 ? 'retry' : 'pending';
        if (p.promotionStatus === 'pending') events.push({ type: 'promotion_pending', to: next.id });
      }
    }
    if (p.promotionStatus === 'retry' && p.promotionRetryAfter === 0 && qr >= cap) {
      p.promotionStatus = 'pending';
      events.push({ type: 'promotion_pending', to: next.id });
    }
    if ((p.promotionStatus === 'pending' || p.promotionStatus === 'retry') && qr < cap - RULES.promotionCancelBelow) {
      p.promotionStatus = 'none';
      events.push({ type: 'promotion_cancelled' });
    }
  }

  // Division ภายใน League / ตก League (มี buffer)
  let leagueId = p.league;
  let divisionIndex = divisionFor(league, p.divisionIndex, qr);
  if (league.order > 1 && qr < league.minQr[0] - RULES.demotionBuffer) {
    const prev = LEAGUES.find((l) => l.order === league.order - 1);
    leagueId = prev.id;
    divisionIndex = divisionFor(prev, prev.minQr.length - 1, qr);
    p.promotionStatus = 'none';
    events.push({ type: 'demoted', from: league.id, to: prev.id });
  } else if (divisionIndex > p.divisionIndex) {
    events.push({ type: 'division_up' });
  } else if (divisionIndex < p.divisionIndex) {
    events.push({ type: 'division_down' });
  }

  return {
    league: leagueId, divisionIndex, qr, delta: qr - profile.qr,
    promotionStatus: p.promotionStatus, promotionRetryAfter: p.promotionRetryAfter,
    protectionMatches: p.protectionMatches, events,
  };
}

/** Elo ของคู่แข่ง: NPC ใช้ค่าประจำตัว · ผู้เล่นใช้ QR */
module.exports = { npcOpponentRating, calculateQuestRating, expectedScore, baseDelta, divisionFor, meetsApex };
