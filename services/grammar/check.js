/*
  ตรวจคำตอบแบบฝึกแกรมม่า (ฝั่งเซิร์ฟเวอร์เท่านั้น) — รองรับคำตอบที่ถูกได้หลายแบบ
  - ไม่สนตัวพิมพ์ใหญ่/เล็ก ช่องว่างซ้ำ เครื่องหมายวรรคตอนท้ายประโยค อัญประกาศโค้ง
  - การย่อคำเทียบเท่ารูปเต็ม: doesn't = does not · I'm = I am · won't = will not · can't = cannot …
    ('s ตีความได้ทั้ง is และ has -> ลองทั้งสองแบบ)
  - write = ตรวจด้วยกฎ (checks/forbid regex) + ตัวตรวจทั่วไป (services/grammar/writing.js)
*/
const CONTRACTIONS = [
  [/\bwon't\b/g, 'will not'], [/\bshan't\b/g, 'shall not'], [/\bcan't\b/g, 'cannot'], [/\bcan not\b/g, 'cannot'],
  [/\bain't\b/g, 'is not'], [/\b(\w+)n't\b/g, '$1 not'],
  [/\bi'm\b/g, 'i am'], [/\b(\w+)'re\b/g, '$1 are'], [/\b(\w+)'ve\b/g, '$1 have'], [/\b(\w+)'ll\b/g, '$1 will'],
];
// 'd = had หรือ would (I'd known = I had known · I'd go = I would go) -> ลองทั้งสองแบบ
const AMBIG_D = /\b(\w+)'d\b/g;
const AMBIG_S = /\b(he|she|it|that|there|what|who|where|how|here|this|everyone|somebody|someone|nobody|everything|nothing)'s\b/g;

/** ข้อความมาตรฐานสำหรับเทียบ (ยังไม่ขยายการย่อคำ) */
function base(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .replace(/[‘’ʼ`´]/g, "'").replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/["]/g, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/[.!?]+$/g, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}
/** ขยายการย่อคำ — คืนชุดรูปที่เป็นไปได้ทั้งหมด (เพราะ 's = is หรือ has) */
function expansions(s) {
  let t = base(s);
  CONTRACTIONS.forEach(([re, rep]) => { t = t.replace(re, rep); });
  let forms = [t];
  // แต่ละ 'd เลือก had/would แยกกัน (If I'd known, I'd have helped = If I had known, I would have helped) · จำกัด 4 ตำแหน่ง
  for (let k = 0; k < 4 && forms.some((x) => /\b\w+'d\b/.test(x)); k++) {
    forms = forms.flatMap((x) => (/\b\w+'d\b/.test(x) ? [x.replace(/\b(\w+)'d\b/, '$1 would'), x.replace(/\b(\w+)'d\b/, '$1 had')] : [x]));
  }
  AMBIG_S.lastIndex = 0;
  if (forms.some((x) => /\b(he|she|it|that|there|what|who|where|how|here|this|everyone|somebody|someone|nobody|everything|nothing)'s\b/.test(x))) {
    forms = forms.flatMap((x) => [x, x.replace(AMBIG_S, '$1 is'), x.replace(AMBIG_S, '$1 has')]);
  }
  return new Set(forms);
}
const noComma = (set) => new Set([...set].map((x) => x.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim()));
/** commaSensitive = เครื่องหมายจุลภาคเป็นประเด็นของข้อ (เช่น non-defining clause) -> ต้องตรงทั้งจุลภาค */
function sameAnswer(given, accepted, { commaSensitive = false } = {}) {
  const g = expansions(given);
  for (const a of accepted) for (const x of expansions(a)) if (g.has(x)) return true;
  if (commaSensitive) return false;
  // ผู้เรียนพิมพ์ขาด/เกินจุลภาค -> ไม่ถือว่าผิด (ยกเว้นข้อที่จุลภาคเป็นประเด็น)
  const g2 = noComma(g);
  for (const a of accepted) for (const x of noComma(expansions(a))) if (g2.has(x)) return true;
  return false;
}
/** ข้อแก้คำผิดที่ "ผิดแค่จุลภาค" -> จุลภาคเป็นประเด็น */
function isCommaSensitive(item) {
  if (item.commaSensitive) return true;
  if (item.type !== 'error') return false;
  const w = noComma(expansions(item.sentence));
  return (item.accepted || []).some((a) => [...noComma(expansions(a))].some((x) => w.has(x)));
}
/** ใกล้เคียงคำตอบ (ใช้บอกว่า "เกือบถูก" เช่น สะกดผิด 1 ตัว) — ไม่ให้คะแนน */
function editDistance(a, b) {
  const m = a.length; const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}
function nearMiss(given, accepted) {
  const g = base(given);
  if (!g) return false;
  return accepted.some((a) => { const d = editDistance(g, base(a)); return d > 0 && d <= Math.max(1, Math.floor(base(a).length / 12)); });
}

/**
 * ตรวจคำตอบหนึ่งข้อ
 * @returns {{ correct: boolean, partial?: number, near?: boolean, expected: string, yours: string, detail?: object }}
 */
function checkAnswer(item, answer) {
  switch (item.type) {
    case 'mc': case 'choose': case 'dialogue': case 'context': {
      const idx = Number.isInteger(answer) ? answer : (typeof answer === 'string' && /^\d+$/.test(answer) ? Number(answer) : -1);
      const ok = idx === item.answer;
      return { correct: ok, chosen: idx, expected: item.choices[item.answer], yours: idx >= 0 && idx < item.choices.length ? item.choices[idx] : '' };
    }
    case 'fill': case 'error': case 'transform': {
      const text = typeof answer === 'string' ? answer.slice(0, 400) : '';
      const ok = text.trim() !== '' && sameAnswer(text, item.accepted, { commaSensitive: isCommaSensitive(item) });
      // "เกือบถูก (สะกด)" ใช้กับข้อเติมคำเท่านั้น — ข้อแก้ผิด/เขียนใหม่ ต่างกันแค่ไม่กี่ตัวอักษรก็เป็นคนละไวยากรณ์ได้ (was/were)
      const unchanged = item.type === 'error' && !ok && base(text) === base(item.sentence);
      return { correct: ok, near: !ok && item.type === 'fill' && nearMiss(text, item.accepted), unchanged, expected: item.accepted[0], yours: text };
    }
    case 'order': {
      const text = Array.isArray(answer) ? answer.map(String).join(' ') : (typeof answer === 'string' ? answer : '');
      const ok = sameAnswer(text, item.accepted, { commaSensitive: Boolean(item.commaSensitive) });
      return { correct: ok, expected: item.accepted[0], yours: text };
    }
    case 'match': {
      // answer = [rightIndexForLeft0, …] โดย index อ้างถึงลำดับ pairs เดิม (ฝั่งขวา)
      const arr = Array.isArray(answer) ? answer : [];
      let right = 0;
      item.pairs.forEach((_, i) => { if (Number(arr[i]) === i) right += 1; });
      return { correct: right === item.pairs.length, partial: right / item.pairs.length,
        expected: item.pairs.map((p) => `${p[0]} → ${p[1]}`).join(' · '),
        yours: item.pairs.map((p, i) => `${p[0]} → ${(item.pairs[Number(arr[i])] || [])[1] || '—'}`).join(' · ') };
    }
    case 'write': {
      const { checkWriting } = require('./writing');
      const r = checkWriting(String(answer || '').slice(0, 1200), item);
      return { correct: r.passed, expected: item.sample, yours: String(answer || ''), detail: r };
    }
    default:
      return { correct: false, expected: '', yours: '' };
  }
}

module.exports = { base, expansions, sameAnswer, checkAnswer, nearMiss };
