/*
  แปลงรหัสเสียง ARPAbet (จาก CMU Pronouncing Dictionary) เป็น IPA
  ใช้รูปแบบ IPA ที่พจนานุกรมสำหรับผู้เรียนนิยม (มีเครื่องหมายเสียงยาว ː)
  ตัวอย่าง: "AH0 CH IY1 V" -> "əˈtʃiːv" (achieve)

  ข้อมูลจาก CMU เป็นสำเนียงอเมริกัน (US)
*/

const VOWELS = {
  AA: 'ɑː', AE: 'æ', AO: 'ɔː', AW: 'aʊ', AY: 'aɪ',
  EH: 'e', EY: 'eɪ', IH: 'ɪ', IY: 'iː', OW: 'oʊ', OY: 'ɔɪ',
  UH: 'ʊ', UW: 'uː',
};

const CONSONANTS = {
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ',
  K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p', R: 'r', S: 's',
  SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};

// กลุ่มพยัญชนะต้นพยางค์ที่ภาษาอังกฤษยอมให้อยู่ด้วยกัน
// ใช้ตัดสินว่าเครื่องหมายเน้นเสียง ˈ ควรไปวางก่อนพยัญชนะกี่ตัว
const LEGAL_ONSETS = new Set([
  'P R', 'P L', 'B R', 'B L', 'T R', 'D R', 'K R', 'K L', 'G R', 'G L',
  'F R', 'F L', 'TH R', 'SH R', 'S P', 'S T', 'S K', 'S M', 'S N', 'S L', 'S W',
  'T W', 'D W', 'K W', 'G W', 'TH W', 'P Y', 'B Y', 'K Y', 'F Y', 'M Y', 'V Y', 'HH Y',
  'S P R', 'S T R', 'S K R', 'S P L', 'S K W', 'S K Y', 'S P Y',
]);

function parsePhone(p) {
  const m = p.match(/^([A-Z]+)([012])?$/);
  if (!m) return null;
  return { base: m[1], stress: m[2] === undefined ? null : Number(m[2]) };
}

// AH และ ER เป็นสระด้วย แต่ไม่อยู่ใน VOWELS เพราะรูป IPA ขึ้นกับการเน้นเสียง
function isVowel(base) {
  return base === 'AH' || base === 'ER' || Object.prototype.hasOwnProperty.call(VOWELS, base);
}

function vowelToIpa(base, stress) {
  // AH/ER มีรูปต่างกันตามว่าเน้นหรือไม่เน้น
  if (base === 'AH') return stress === 0 ? 'ə' : 'ʌ';
  if (base === 'ER') return stress === 0 ? 'ər' : 'ɜːr';
  // สระยาวที่ไม่ถูกเน้นเสียงจะออกเสียงสั้นลง เช่น happy /ˈhæpi/
  if (base === 'IY' && stress === 0) return 'i';
  if (base === 'UW' && stress === 0) return 'u';
  return VOWELS[base];
}

// หาว่าพยัญชนะก่อนสระที่เน้นเสียง กี่ตัวเป็นต้นพยางค์ (ย้อนได้สูงสุด 3 ตัว)
function onsetLength(phones, vowelIdx) {
  let best = 0;
  for (let len = 1; len <= 3; len++) {
    const start = vowelIdx - len;
    if (start < 0) break;
    const slice = phones.slice(start, vowelIdx);
    if (slice.some((p) => isVowel(p.base))) break;
    if (len === 1) { best = 1; continue; }
    if (LEGAL_ONSETS.has(slice.map((p) => p.base).join(' '))) best = len;
    else break;
  }
  return best;
}

function arpabetToIpa(arpabet) {
  if (!arpabet || typeof arpabet !== 'string') return null;
  const phones = arpabet.trim().split(/\s+/).map(parsePhone);
  if (phones.some((p) => p === null)) return null;

  // ตำแหน่งที่ต้องแทรกเครื่องหมายเน้นเสียง: index -> 'ˈ' หรือ 'ˌ'
  const marks = {};
  const vowelCount = phones.filter((p) => isVowel(p.base)).length;
  phones.forEach((p, i) => {
    if (!isVowel(p.base)) return;
    // คำพยางค์เดียวไม่ต้องใส่เครื่องหมายเน้นเสียง (พจนานุกรมส่วนใหญ่ทำแบบนี้)
    if (vowelCount < 2) return;
    if (p.stress === 1 || p.stress === 2) {
      const at = i - onsetLength(phones, i);
      marks[at] = p.stress === 1 ? 'ˈ' : 'ˌ';
    }
  });

  let out = '';
  phones.forEach((p, i) => {
    if (marks[i]) out += marks[i];
    out += isVowel(p.base) ? vowelToIpa(p.base, p.stress) : CONSONANTS[p.base];
  });
  return out;
}

module.exports = { arpabetToIpa };
