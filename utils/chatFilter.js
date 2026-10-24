/*
  ตัวกรองข้อความแชท (EnglishQuest World) — "ด่านแรก" เท่านั้น ไม่ใช่มาตรการเดียว
  มาตรการอื่นที่ทำงานร่วมกัน: ค่าเริ่มต้นแชทเฉพาะประโยคสำเร็จรูป · พิมพ์เองต้องเปิดเองทั้งสองฝ่าย + บัญชีอายุ ≥ 3 วัน ·
  จำกัดอัตรา/กันข้อความซ้ำ · Mute/Block/Report · บันทึกแชท 30 วันให้ผู้ดูแล · ปิดแชทอัตโนมัติเมื่อโดนจับซ้ำ · ผู้ดูแลจำกัดสิทธิ์ + อุทธรณ์
  ผล: { text, flags[], block } — block = ไม่ส่งต่อเลย (ข้อมูลติดต่อ/ลิงก์ ปกป้องข้อมูลส่วนตัวของนักเรียน)
*/
const EN = ['fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch', 'cunt', 'dick', 'pussy', 'bastard', 'asshole', 'arsehole',
  'slut', 'whore', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'wanker', 'twat', 'cock', 'jerk off', 'porn', 'sex', 'sexy', 'nude', 'nudes',
  'kill yourself', 'kys', 'stfu', 'wtf', 'dumbass', 'jackass', 'piss off', 'damn', 'crap', 'idiot', 'stupid', 'loser'];
// (ตัดคำที่ซ้อนอยู่ในคำปกติออก: หี→หีบ · สัด→สัดส่วน · ตีน · ควาย — ใช้รูปที่เป็นคำด่าแทน)
const TH = ['ควย', 'เย็ด', 'เหี้ย', 'เหี่ย', 'เชี่ย', 'สัส', 'ระยำ', 'ชาติหมา', 'อีดอก', 'ดอกทอง', 'อีตัว', 'กะหรี่', 'แม่ง', 'มึง', 'ไอ้สัตว์', 'อีสัตว์',
  'ส้นตีน', 'โง่', 'อีควาย', 'ไอ้ควาย', 'จัญไร', 'เสือก', 'ไปตาย', 'ฆ่าตัวตาย', 'หน้าหี', 'เงี่ยน', 'โป๊'];
// leetspeak → ตัวอักษร (f*ck, sh1t, b!tch …)
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '*': 'u', '+': 't' };

function norm(s) {
  return s.toLowerCase().replace(/[0134578@$!*+]/g, (c) => LEET[c] || c).replace(/(.)\1{2,}/g, '$1$1');
}
const enPat = EN.map((w) => w.split(' ').map((part) => part.split('').join('[._-]?')).join('[\\s._-]*'));
const enRe = new RegExp(`(^|[^a-z])(${enPat.join('|')})(?=$|[^a-z])`, 'gi');
const thRe = new RegExp(`(${TH.map((w) => w.split('').join('[\\s.]?')).join('|')})`, 'g');

const CONTACT = [
  /https?:\/\//i, /www\./i, /\b[a-z0-9-]+\.(com|net|org|co|io|me|ly|gg|app|th|xyz|link|site)\b/i,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /(\d[\s-.]?){8,}/,                                        // เบอร์โทร / เลขบัญชี
  /\b(line|ไลน์|ig|insta(gram)?|facebook|fb|tiktok|discord|snap(chat)?|telegram|whatsapp|twitter|x\.com)\b\s*(id)?\s*[:=]?\s*[@a-z0-9_.]{2,}/i,
  /(^|\s)@[a-z0-9_.]{3,}/i,
  /(บ้าน|ที่อยู่|โรงเรียน)\s*(อยู่|ชื่อ)?\s*[:=]/,           // ชวนบอกที่อยู่/โรงเรียน
];

function filter(input) {
  let text = String(input == null ? '' : input).replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
  const flags = [];
  if (!text) return { text: '', flags: ['empty'], block: true };
  if (CONTACT.some((re) => re.test(text))) return { text: '', flags: ['contact'], block: true };
  // สแปม: ตัวเดิมซ้ำยาว → ย่อ · ตัวพิมพ์ใหญ่ทั้งประโยคยาว → พิมพ์เล็ก
  if (/(.)\1{5,}/.test(text)) { flags.push('spam'); text = text.replace(/(.)\1{3,}/g, '$1$1$1'); }
  if (text.length > 12 && text === text.toUpperCase() && /[A-Z]/.test(text)) { flags.push('caps'); text = text.toLowerCase(); }
  // คำหยาบ: ตรวจบนข้อความที่ normalize แล้ว (ตำแหน่งตรงกันเพราะแทนตัวต่อตัว) → ปิดด้วย *
  const n = norm(text);
  if (n.length === text.length) {
    let out = text.split('');
    let hit = false;
    for (const re of [enRe, thRe]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(n))) {
        const start = m.index + (m[1] && re === enRe ? m[1].length : 0);
        const word = re === enRe ? m[2] : m[1];
        for (let i = start; i < start + word.length; i += 1) if (out[i] !== ' ') out[i] = '*';
        hit = true;
        if (re.lastIndex === m.index) re.lastIndex += 1;
      }
    }
    if (hit) { flags.push('profanity'); text = out.join(''); }
  } else if (enRe.test(n) || thRe.test(n)) {
    flags.push('profanity'); text = text.replace(/\S/g, '*');
  }
  return { text, flags, block: false };
}

module.exports = { filter, _norm: norm };
