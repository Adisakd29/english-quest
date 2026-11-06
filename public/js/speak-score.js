/*
  EnglishQuest Speaking — ตัวให้คะแนน "ความชัดเจน" (ใช้ร่วมกันทั้งหน้าเว็บและเซิร์ฟเวอร์ · UMD)
  ข้อความที่ระบบรู้จำเสียง (speech-to-text ของเบราว์เซอร์) ได้ยิน เทียบกับประโยคต้นแบบ "รายคำ":
    ok    = ตรงคำ (รวมคำพ้องเสียง เช่น two/too/to · ตัวเลข 6 = six · I'm = I am)
    close = ใกล้เคียง (สะกดต่างเล็กน้อย ≥ 75% — มักเป็นเสียงท้ายคำหาย/เพี้ยน เช่น walk → walks)
    miss  = ตกหล่นหรือเครื่องได้ยินเป็นคำอื่น
  คะแนน = (ok + 0.6·close) / จำนวนคำต้นแบบ × 100 − หักคำเกินเล็กน้อย · เลือกผลที่ดีที่สุดจากหลายตัวเลือก (alternatives)
  หมายเหตุ: วัดว่า "เครื่องฟังออกไหม" ไม่ใช่การวิเคราะห์หน่วยเสียง (phoneme) แบบครูตรวจ
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQSpeakScore = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const CONTRACTIONS = [
    [/\bcan't\b/g, 'can not'], [/\bcannot\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\bshan't\b/g, 'shall not'],
    [/\blet's\b/g, 'let us'], [/\bi'm\b/g, 'i am'], [/\b(\w+)n't\b/g, '$1 not'], [/\b(\w+)'re\b/g, '$1 are'],
    [/\b(\w+)'ve\b/g, '$1 have'], [/\b(\w+)'ll\b/g, '$1 will'], [/\b(\w+)'d\b/g, '$1 would'],
    [/\b(it|that|there|here|what|where|who|how|he|she)'s\b/g, '$1 is'],
  ];
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
    'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function numWords(n) {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
    if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numWords(n % 100)}` : ''}`;
    if (n >= 1900 && n < 2100) {   // ปี: 1995 = nineteen ninety five · 2026 = twenty twenty six
      const a = Math.floor(n / 100); const b = n % 100;
      if (n >= 2000 && n < 2010) return `two thousand${b ? ` ${ONES[b]}` : ''}`;
      return `${numWords(a)} ${b ? (b < 10 ? `oh ${ONES[b]}` : numWords(b)) : 'hundred'}`;
    }
    if (n < 10000) return `${ONES[Math.floor(n / 1000)]} thousand${n % 1000 ? ` ${numWords(n % 1000)}` : ''}`;
    return String(n);
  }
  // คำพ้องเสียงที่เครื่องรู้จำเสียงมักสลับกัน — นับว่าตรง
  const HOMO = [['to', 'too', 'two'], ['for', 'four'], ['there', 'their'], ['right', 'write'], ['no', 'know'], ['hear', 'here'],
    ['see', 'sea'], ['eight', 'ate'], ['one', 'won'], ['by', 'buy', 'bye'], ['son', 'sun'], ['new', 'knew'], ['week', 'weak'],
    ['meat', 'meet'], ['flower', 'flour'], ['hour', 'our'], ['wear', 'where'], ['whole', 'hole'], ['its', 'it is'], ['ok', 'okay'],
    ['mr', 'mister'], ['mrs', 'missus'], ['ms', 'miss'], ['tv', 'television'], ['grey', 'gray'], ['colour', 'color'], ['favourite', 'favorite'],
    ['centre', 'center'], ['theatre', 'theater'], ['travelling', 'traveling'], ['cancelled', 'canceled'], ['organise', 'organize']];
  const HOMO_KEY = new Map();
  HOMO.forEach((g, i) => g.forEach((w) => { if (!w.includes(' ')) HOMO_KEY.set(w, i); }));

  /** ข้อความ → รายการคำมาตรฐาน (ตัวเล็ก · ขยายคำย่อ · ตัวเลขเป็นคำ · ตัดเครื่องหมาย) */
  function normalize(text) {
    let s = String(text == null ? '' : text).toLowerCase()
      .replace(/\[\[|\]\]/g, '')
      .replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"')
      .replace(/(\d),(\d{3})/g, '$1$2');
    CONTRACTIONS.forEach(([re, rep]) => { s = s.replace(re, rep); });
    s = s.replace(/(\d+)\s*%/g, '$1 percent').replace(/(\d+)(st|nd|rd|th)\b/g, '$1')
      .replace(/\d+/g, (m) => ` ${numWords(Number(m))} `)
      .replace(/&/g, ' and ')
      .replace(/'s\b/g, 's').replace(/'/g, '')
      .replace(/[^a-z\s]/g, ' ');
    return s.split(/\s+/).filter(Boolean);
  }
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length; const n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i += 1) {
      const cur = [i];
      for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  /** ความเหมือนของคำ: 1 = ตรง (รวมคำพ้องเสียง) · 0–1 ตามระยะสะกด */
  function sim(a, b) {
    if (a === b) return 1;
    if (HOMO_KEY.has(a) && HOMO_KEY.get(a) === HOMO_KEY.get(b)) return 1;
    return 1 - lev(a, b) / Math.max(a.length, b.length);
  }
  const CLOSE = 0.75;

  /** จับคู่คำต้นแบบกับคำที่ได้ยิน (edit distance ระดับคำ) → ป้ายต่อคำต้นแบบ + จำนวนคำเกิน */
  function align(target, heard) {
    const n = target.length; const m = heard.length;
    const cost = (i, j) => { const s = sim(target[i], heard[j]); return s === 1 ? 0 : s >= CLOSE ? 0.4 : 1; };
    const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i += 1) D[i][0] = i;
    for (let j = 1; j <= m; j += 1) D[0][j] = j * 0.7;   // คำเกิน (เช่น "um") หักน้อยกว่าคำหาย
    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) D[i][j] = Math.min(D[i - 1][j - 1] + cost(i - 1, j - 1), D[i - 1][j] + 1, D[i][j - 1] + 0.7);
    }
    const marks = new Array(n).fill('miss'); const heardAs = new Array(n).fill(null);
    let i = n; let j = m; let extras = 0;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && Math.abs(D[i][j] - (D[i - 1][j - 1] + cost(i - 1, j - 1))) < 1e-9) {
        const s = sim(target[i - 1], heard[j - 1]);
        marks[i - 1] = s === 1 ? 'ok' : s >= CLOSE ? 'close' : 'miss';
        heardAs[i - 1] = heard[j - 1];
        i -= 1; j -= 1;
      } else if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) { marks[i - 1] = 'miss'; i -= 1; } else { extras += 1; j -= 1; }
    }
    return { marks, heardAs, extras };
  }

  /**
   * ให้คะแนน
   * @param {string} target ประโยค/คำต้นแบบ
   * @param {string|string[]} heardAlts สิ่งที่ได้ยิน (หลายตัวเลือกได้)
   * @returns {{score:number, words:{text:string, norm:string, mark:string, heard:string|null}[], heard:string, extras:number}}
   */
  function score(target, heardAlts) {
    const tWords = normalize(target);
    const shown = displayWords(target);
    const alts = [].concat(heardAlts || []).map((x) => String(x || '')).slice(0, 8);
    if (!alts.length) alts.push('');
    let best = null;
    for (const h of alts) {
      const hw = normalize(h).slice(0, 200);
      const { marks, heardAs, extras } = align(tWords, hw);
      const ok = marks.filter((x) => x === 'ok').length; const close = marks.filter((x) => x === 'close').length;
      const raw = tWords.length ? (ok + 0.6 * close) / tWords.length : 0;
      const sc = Math.max(0, Math.min(100, Math.round(raw * 100 - Math.min(15, extras * 3))));
      if (!best || sc > best.score) best = { score: sc, marks, heardAs, extras, heard: h };
    }
    // ป้ายรายคำ → คำที่แสดง (คำแสดง 1 คำอาจกลายเป็นหลายคำมาตรฐาน เช่น I'm → i am · ใช้ป้ายที่แย่สุด)
    const words = []; let k = 0;
    const rank = { ok: 0, close: 1, miss: 2 };
    for (const w of shown) {
      const n = normalize(w).length;
      let mark = 'ok'; let heard = null;
      for (let q = 0; q < n; q += 1, k += 1) {
        if (rank[best.marks[k]] > rank[mark]) mark = best.marks[k];
        if (best.heardAs[k]) heard = heard ? `${heard} ${best.heardAs[k]}` : best.heardAs[k];
      }
      words.push({ text: w, norm: normalize(w).join(' '), mark: n ? mark : 'ok', heard });
    }
    return { score: best.score, words, heard: best.heard, extras: best.extras };
  }
  /** คำที่แสดงบนจอ (คงเครื่องหมายวรรคตอนไว้กับคำ) */
  function displayWords(text) {
    return String(text || '').replace(/\[\[|\]\]/g, '').split(/\s+/).filter(Boolean);
  }
  /** ระดับคำชม */
  function band(sc) {
    if (sc >= 90) return { id: 'excellent', th: 'ยอดเยี่ยม! ชัดมาก' };
    if (sc >= 70) return { id: 'good', th: 'ผ่าน! ฟังเข้าใจ' };
    if (sc >= 40) return { id: 'fair', th: 'ใกล้แล้ว — ลองอีกครั้ง' };
    return { id: 'retry', th: 'ยังไม่ชัด — ฟังต้นแบบแล้วลองใหม่' };
  }
  const PASS = 70;
  return { normalize, score, align, sim, band, displayWords, numWords, PASS };
}));
