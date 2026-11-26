/*
  Ranked Quest — รางวัล (Cosmetic only · ห้าม Pay-to-win)
  ไม่มีรางวัลใดเพิ่มคะแนน เวลา ตอบง่ายขึ้น หรือได้เปรียบในเกม — เป็นของแสดงผลอย่างเดียว
*/
const { LEAGUES } = require('./leagues');

// ชื่อเรียก (Title) เมื่อไปถึง League ครั้งแรก — ไม่ใช้คำแรงค์เกมทั่วไป
const TITLES = {
  'trail-finch': 'นักเดินทางหน้าใหม่', 'swift-hare': 'นักวิ่งเหินลม', 'river-otter': 'นักคิดสายน้ำ',
  'crest-lynx': 'ผู้แสวงยอดผา', 'moon-wolf': 'นักวางแผนจันทรา', 'shadow-panther': 'นักยุทธ์เงามืด',
  'storm-falcon': 'ผู้มองไกลแห่งพายุ', 'crown-eagle': 'ผู้นำแห่งมงกุฎ', 'aurora-lion': 'ปราชญ์แสงเหนือ',
};

const SEASON_PLAN = {
  weeks: 10,                     // 8–12 สัปดาห์ (ข้อ 37)
  themes: ['The First Trail', 'Across the Wild', 'Rise of the Aurora'],
  fallbackTheme: 'The Endless Trail',
  frameFrom: 'moon-wolf',        // กรอบโปรไฟล์ประจำ League สำหรับคนที่ไปถึง Moon Wolf ขึ้นไปในซีซันนั้น
  auroraNameplate: { topN: 100, minQr: 5200 },   // Aurora Lion: นามเพลตสำหรับ Top N (config)
};

/** รายละเอียดรางวัลจาก id (ใช้แสดงผล) */
function describe(id) {
  const [kind, a, b] = id.split(':');
  const leagueName = (lid) => (LEAGUES.find((l) => l.id === lid) || {}).name || lid;
  if (kind === 'title') return { id, kind, league: a, name: TITLES[a] || a, equip: 'title' };
  if (kind === 'frame') return { id, kind, league: a, name: `กรอบ${leagueName(a)}`, equip: 'frame' };
  if (kind === 'season-badge') return { id, kind, season: a, league: b, name: `${leagueName(b)} · ${a.toUpperCase()}` };
  if (kind === 'nameplate') return { id, kind, season: b, name: `ป้ายชื่อแสงเหนือ · ${String(b).toUpperCase()}`, equip: 'frame' };
  if (kind === 'apex') return { id, kind, name: 'ผู้ท้าชิงแสงเหนือ', equip: 'title' };
  return { id, kind, name: id };
}

module.exports = { TITLES, SEASON_PLAN, describe };
