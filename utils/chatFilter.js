/*
  ตัวกรองข้อความแชท (แชทโลก) — "ด่านแรก" เท่านั้น ไม่ใช่มาตรการเดียว
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
  /https?:\/\//i, /www\./i,
  /\b[a-z0-9-]{2,}\s?\.\s?(com|net|org|co|io|me|ly|gg|app|th|xyz|link|site|tk|ml|ga|cf|gq|ru|cn|info|biz|online|store|shop|club|top|cc|tv|us|to|be|page|dev|live|fun|vip)\b/i,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b[a-z0-9._-]{2,}\s*[([]?\s*at\s*[)\]]?\s*[a-z0-9-]{2,}\s*[([]?\s*(dot|\.)\s*[)\]]?\s*(com|net|org|co|th|me)\b/i,  // kid at gmail dot com
  /(\d[^\p{L}\d]{0,3}){8,}/u,                              // เบอร์โทร / เลขบัญชี (คั่นด้วยอะไรก็ได้ที่ไม่ใช่ตัวอักษร)
  /\b(line|ไลน์|ig|insta(gram)?|facebook|fb|tiktok|discord|snap(chat)?|telegram|whatsapp|twitter|x\.com)\b\s*(id)?\s*[:=]?\s*[@a-z0-9_.]{2,}/i,
  /(^|\s)@[a-z0-9_.]{3,}/i,
  /(บ้าน|ที่อยู่|โรงเรียน)\s*(อยู่|ชื่อ)?\s*[:=]/,           // ชวนบอกที่อยู่/โรงเรียน
];

// v1.18.4 ตัวอักษรหน้าตาเหมือนละติน (ซีริลลิก/กรีก/อาร์เมเนีย ฯลฯ) -> ละติน · ใช้ "ตอนตรวจ" เท่านั้น (แทนตัวต่อตัว ความยาวเท่าเดิม)
const CONFUSABLE = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', һ: 'h', ӏ: 'l', ԛ: 'q', ԝ: 'w', ν: 'v',
  ο: 'o', α: 'a', ε: 'e', ι: 'i', κ: 'k', τ: 't', υ: 'u', ρ: 'p', χ: 'x', ս: 'u', ո: 'n', օ: 'o', ց: 'g', ɩ: 'i', ʟ: 'l', ᴄ: 'c', ᴏ: 'o',
  'А': 'a', 'В': 'b', 'Е': 'e', 'К': 'k', 'М': 'm', 'Н': 'h', 'О': 'o', 'Р': 'p', 'С': 'c', 'Т': 't', 'Х': 'x', 'І': 'i',
};
const THAI_DIGIT = /[๐-๙]/g;
/** ข้อความสำหรับ "ตรวจ": ตัวคล้าย -> ละติน · เลขไทย -> เลขอารบิก · ตัวอักษรเดี่ยวที่เว้นวรรคทีละตัว (l i n e) -> ติดกัน */
function forCheck(text) {
  let t = text.replace(/./gsu, (c) => CONFUSABLE[c] || c).replace(THAI_DIGIT, (d) => String(d.charCodeAt(0) - 0x0E50));
  t = t.replace(/(?<![\p{L}\d])((?:[a-z0-9][\s._\-·•|/]+){2,}[a-z0-9])(?![\p{L}\d])/giu, (m) => m.replace(/[\s._\-·•|/]+/g, ''));
  return t;
}
/** ทำความสะอาดข้อความ: NFKC (ตัวเต็มความกว้าง ０８１ / ｈｔｔｐ -> ปกติ) · ตัดอักขระควบคุม/ล่องหน (\p{Cf} เช่น U+2060, U+00AD, U+FEFF)
 *  · ตัดเครื่องหมายกำกับที่ไม่ใช่ภาษาไทย (กัน Zalgo / f̶u̶ck) — สระ/วรรณยุกต์ไทยคงเดิม */
function clean(input) {
  return String(input == null ? '' : input).normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '').replace(/\p{Cf}/gu, '')
    .replace(/(?![\u0E31\u0E34-\u0E3A\u0E47-\u0E4E])\p{M}/gu, '')
    .replace(/\s+/g, ' ').trim();
}

// v1.18.4 (หลังทดสอบซ้ำ): ชื่อแพลตฟอร์มแบบ leet (L1NE, l!ne, 1g) · ชื่อยาวที่เว้นวรรคกลางคำ (tele gram) · "ไอดี on snap"
const PLATFORM_LONG = /(telegram|instagram|whatsapp|snapchat|discord|tiktok|facebook|kakaotalk|wechat|messenger)/i;
const HANDLE_ON = /\b(?=[a-z0-9_.]*[0-9_])[a-z0-9_.]{3,}\s+(on|at|ที่|ใน|ทาง)\s*(line|ไลน์|ig|insta|snap|tiktok|discord|telegram|whatsapp|facebook|fb|messenger)\b/i;
function leet(t) { return t.toLowerCase().replace(/[0134578@$!|]/g, (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'l' }[c])); }

/** มีข้อมูลติดต่อ/ลิงก์ไหม (ใช้ซ้ำในแชทส่วนตัว/แชททีม) */
function hasContact(text) {
  const c = clean(text);
  const k = forCheck(c);
  if (CONTACT.some((re) => re.test(c) || re.test(k))) return true;
  const l = forCheck(leet(k));
  const platformRe = CONTACT.find((re) => re.source.includes('line|ไลน์'));   // (line|ig|...) + ไอดี
  if (platformRe.test(l) || HANDLE_ON.test(k) || HANDLE_ON.test(l)) return true;
  // ชื่อแพลตฟอร์มยาว ๆ ที่ถูกเว้นวรรค/คั่นกลางคำ (ชื่อพวกนี้ไม่ปรากฏในประโยคปกติ)
  return PLATFORM_LONG.test(l.replace(/[\s._\-·•|/]+/g, ''));
}

function filter(input) {
  let text = clean(input);
  const flags = [];
  if (!text) return { text: '', flags: ['empty'], block: true };
  if (hasContact(text)) return { text: '', flags: ['contact'], block: true };
  // สแปม: ตัวเดิมซ้ำยาว → ย่อ · ตัวพิมพ์ใหญ่ทั้งประโยคยาว → พิมพ์เล็ก
  if (/(.)\1{5,}/.test(text)) { flags.push('spam'); text = text.replace(/(.)\1{3,}/g, '$1$1$1'); }
  // v1.18.4 นับเฉพาะตัวอักษรละติน (เดิม "ข้อนี้น่าจะ B" ถูกมองว่าตะโกนเพราะตัวไทยไม่มีพิมพ์ใหญ่/เล็ก)
  const latin = text.replace(/[^A-Za-z]/g, '');
  if (text.length > 12 && latin.length >= 6 && latin === latin.toUpperCase()) { flags.push('caps'); text = text.toLowerCase(); }
  // คำหยาบ: ตรวจบนข้อความที่ normalize แล้ว (ตำแหน่งตรงกันเพราะแทนตัวต่อตัว) → ปิดด้วย *
  const n = norm(text.replace(/./gsu, (c) => (CONFUSABLE[c] && c.length === 1 ? CONFUSABLE[c] : c)));
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

module.exports = { filter, hasContact, clean, _norm: norm, _forCheck: forCheck };
