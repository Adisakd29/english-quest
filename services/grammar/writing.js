/*
  ตรวจการเขียนสั้น ๆ ด้วยกฎภาษา (ไม่ใช้ AI ภายนอก) — ให้คำอธิบายว่าผิดเพราะอะไร ไม่ใช่แค่แก้ให้
  ขอบเขต: จับข้อผิดที่พบบ่อยของผู้เรียนไทย (กริยาไม่ตรงประธาน, did + V2, a/an, tense ไม่ตรงคำบอกเวลา,
  modal + to, more + -er …) + เงื่อนไขของโจทย์ (checks/forbid/expectTense/minSentences)
  ข้อจำกัด: ไม่ใช่ตัวตรวจไวยากรณ์ครบทุกกรณี — ประโยคที่ไม่มีข้อผิดตามกฎอาจยังมีจุดที่ควรปรับ (บอกผู้เรียนตรง ๆ)
*/
const IRREGULAR = {
  be: ['was', 'were', 'been'], begin: ['began', 'begun'], break: ['broke', 'broken'], bring: ['brought', 'brought'], build: ['built', 'built'],
  buy: ['bought', 'bought'], catch: ['caught', 'caught'], choose: ['chose', 'chosen'], come: ['came', 'come'], cost: ['cost', 'cost'],
  cut: ['cut', 'cut'], do: ['did', 'done'], draw: ['drew', 'drawn'], drink: ['drank', 'drunk'], drive: ['drove', 'driven'], eat: ['ate', 'eaten'],
  fall: ['fell', 'fallen'], feel: ['felt', 'felt'], find: ['found', 'found'], fly: ['flew', 'flown'], forget: ['forgot', 'forgotten'],
  get: ['got', 'got'], give: ['gave', 'given'], go: ['went', 'gone'], grow: ['grew', 'grown'], have: ['had', 'had'], hear: ['heard', 'heard'],
  hit: ['hit', 'hit'], hold: ['held', 'held'], keep: ['kept', 'kept'], know: ['knew', 'known'], leave: ['left', 'left'], lend: ['lent', 'lent'],
  let: ['let', 'let'], lose: ['lost', 'lost'], make: ['made', 'made'], meet: ['met', 'met'], pay: ['paid', 'paid'], put: ['put', 'put'],
  read: ['read', 'read'], ride: ['rode', 'ridden'], ring: ['rang', 'rung'], run: ['ran', 'run'], say: ['said', 'said'], see: ['saw', 'seen'],
  sell: ['sold', 'sold'], send: ['sent', 'sent'], set: ['set', 'set'], sing: ['sang', 'sung'], sit: ['sat', 'sat'], sleep: ['slept', 'slept'],
  speak: ['spoke', 'spoken'], spend: ['spent', 'spent'], stand: ['stood', 'stood'], swim: ['swam', 'swum'], take: ['took', 'taken'],
  teach: ['taught', 'taught'], tell: ['told', 'told'], think: ['thought', 'thought'], throw: ['threw', 'thrown'], understand: ['understood', 'understood'],
  wake: ['woke', 'woken'], wear: ['wore', 'worn'], win: ['won', 'won'], write: ['wrote', 'written'], feed: ['fed', 'fed'], fight: ['fought', 'fought'],
  hide: ['hid', 'hidden'], light: ['lit', 'lit'], mean: ['meant', 'meant'], shut: ['shut', 'shut'], steal: ['stole', 'stolen'], sweep: ['swept', 'swept'],
};
const PAST_FORMS = new Set(Object.values(IRREGULAR).map((x) => x[0]).concat(['was', 'were', 'did', 'had']));
const PAST_TO_BASE = Object.fromEntries(Object.entries(IRREGULAR).filter(([b, f]) => f[0] !== b).map(([b, f]) => [f[0], b]));
const COMMON_BASE = new Set(['go', 'like', 'want', 'play', 'watch', 'eat', 'work', 'live', 'study', 'need', 'love', 'have', 'drink', 'read', 'walk', 'speak', 'make', 'take', 'come', 'know', 'think', 'get', 'see', 'look', 'help', 'try', 'use', 'teach', 'cook', 'swim', 'run', 'sleep', 'write']);
const SUBJ3 = '(he|she|it|my (?:mother|father|friend|brother|sister|teacher|dog|cat)|the (?:boy|girl|man|woman|teacher|dog|cat))';
const isPastWord = (w) => PAST_FORMS.has(w) || (/ed$/.test(w) && w.length > 3);

const RULES = [
  { re: new RegExp(`\\b${SUBJ3}\\s+(don'?t|do not)\\b`, 'i'), type: 'agreement', msgTh: 'ประธานเอกพจน์บุรุษที่ 3 (he / she / it) ใช้ does not / doesn\'t ไม่ใช่ don\'t', fix: (m) => m[0].replace(/don'?t|do not/i, "doesn't") },
  { re: /\b(dont|doesnt|didnt|cant|wont|isnt|arent|wasnt|werent|havent|hasnt|couldnt|shouldnt|wouldnt)\b/i, type: 'apostrophe', severity: 'tip', msgTh: 'คำย่อต้องมีอะพอสทรอฟี (\') เช่น don\'t, can\'t, didn\'t', fix: (m) => m[1].replace(/nt$/i, "n't").replace(/^cann't$/i, "can't").replace(/^wonn't$/i, "won't") },
  { re: /(?:^|\s)(i)(?=\s|'|$)/, type: 'capital_i', severity: 'tip', msgTh: 'สรรพนาม I (ฉัน) เขียนตัวพิมพ์ใหญ่เสมอ', fix: () => 'I' },
  { re: /\b(i)\s+(is|are)\b/i, type: 'agreement', msgTh: 'ประธาน I ใช้กับ am (I am) ไม่ใช่ is/are', fix: (m) => `${m[1]} am` },
  { re: /\b(you|we|they)\s+(is|am)\b/i, type: 'agreement', msgTh: 'ประธาน you / we / they ใช้กับ are', fix: (m) => `${m[1]} are` },
  { re: /\b(he|she|it)\s+(are|am)\b/i, type: 'agreement', msgTh: 'ประธาน he / she / it ใช้กับ is', fix: (m) => `${m[1]} is` },
  { re: /\b(you|we|they)\s+was\b/i, type: 'agreement', msgTh: 'ประธานพหูพจน์ / you ใช้ were ในอดีต ไม่ใช่ was', fix: (m) => `${m[1]} were` },
  { re: /\b(i|you|we|they)\s+has\b/i, type: 'agreement', msgTh: 'I / you / we / they ใช้ have (has ใช้กับ he / she / it)', fix: (m) => `${m[1]} have` },
  { re: new RegExp(`\\b${SUBJ3}\\s+have\\b(?!\\s+(to|been|got)\\b)`, 'i'), type: 'agreement', msgTh: 'he / she / it ใช้ has (ปัจจุบัน) — หรือถ้าเล่าอดีตใช้ had', fix: (m) => m[0].replace(/have$/i, 'has') },
  { re: new RegExp(`\\b(he|she|it)\\s+(${[...COMMON_BASE].join('|')})\\b(?!\\s*\\?)`, 'i'), type: 'agreement', when: (s) => !/\b(can|could|will|would|should|must|might|may|did|does|do|to|let|make|help)\s+(he|she|it)?\s*$/i.test(s.slice(0, s.search(/\b(he|she|it)\s/i))), msgTh: 'ปัจจุบันกาล ประธาน he / she / it กริยาต้องเติม -s/-es (เช่น she likes, he goes) — ถ้าเล่าเรื่องอดีตให้ใช้ช่องที่ 2', fix: null },
  { re: /\b(did|didn't|did not)\s+(\w+)/i, type: 'did_past', when: (s, m) => isPastWord(m[2].toLowerCase()) && m[2].toLowerCase() !== 'need', msgTh: 'หลัง did / didn\'t ใช้กริยาช่องที่ 1 เสมอ (เพราะ did บอกอดีตไปแล้ว)', fix: (m) => `${m[1]} ${PAST_TO_BASE[m[2].toLowerCase()] || m[2].toLowerCase().replace(/ied$/, 'y').replace(/ed$/, '')}` },
  { re: /\b(can|could|must|should|will|would|might|may)\s+to\s+\w+/i, type: 'modal_to', msgTh: 'หลังกริยาช่วย (can, must, should, will …) ใช้กริยาช่องที่ 1 ทันที ไม่มี to', fix: (m) => m[0].replace(/\s+to\s+/i, ' ') },
  { re: /\b(can|could|must|should|will|would|might|may)\s+(\w+s)\b/i, type: 'modal_s', when: (s, m) => COMMON_BASE.has(m[2].toLowerCase().replace(/e?s$/, '')) || /^(goes|likes|wants|plays|works|lives|studies|needs|has)$/i.test(m[2]), msgTh: 'หลังกริยาช่วยใช้กริยารูปฐาน ไม่เติม -s', fix: null },
  { re: /\bmore\s+(\w+er)\b/i, type: 'comparative', when: (s, m) => !/^(never|other|over|under|either|neither|whether|water|paper|number|teacher|order|power|corner|weather|computer|answer|after|ever|later|matter|winter|summer|letter|dinner|finger|father|mother|brother|sister|daughter|danger|player|singer|worker|member|reader|writer|user|customer|partner|manager|leader|career)$/i.test(m[1]), msgTh: 'ขั้นกว่าใช้ -er หรือ more อย่างใดอย่างหนึ่ง ไม่ใช้ทั้งสอง (เช่น bigger ไม่ใช่ more bigger)', fix: (m) => m[1] },
  { re: /\b(most)\s+(\w+est)\b/i, type: 'superlative', msgTh: 'ขั้นสูงสุดใช้ -est หรือ most อย่างใดอย่างหนึ่ง', fix: (m) => m[2] },
  { re: /\b(have|has)\s+(\w+)\b[^.!?]*\b(yesterday|ago|last (week|month|year|night)|in (19|20)\d\d)\b/i, type: 'perfect_time', msgTh: 'Present Perfect (have/has + V3) ไม่ใช้กับเวลาในอดีตที่ระบุชัด (yesterday, ago, last …) — ใช้ Past Simple แทน', fix: null,
    // ไม่ใช่ Present Perfect: have to / have got / กริยาช่วย + have + V3 (should have left yesterday = ถูก) / had
    when: (s, m) => !/^(to|got|a|an|the|my|your|his|her|our|their|some|no|been)$/i.test(m[2]) && !/\b(should|could|would|might|must|may|can't|cannot|couldn't|shouldn't|wouldn't|mustn't|will|to)\s+(have|has)\s*$/i.test(s.slice(0, s.toLowerCase().indexOf(m[0].toLowerCase()) + m[1].length)) },
  { re: /\b(enjoy|enjoys|enjoyed|finish|finished|avoid|avoided|mind|suggest|suggested)\s+to\s+\w+/i, type: 'gerund', msgTh: 'enjoy / finish / avoid / mind / suggest ตามด้วยกริยารูป -ing (เช่น enjoy swimming)', fix: null },
  { re: /\b(want|wants|wanted|need|needs|needed|decide|decided|hope|hoped|plan|planned)\s+(go|eat|play|buy|see|study|visit|watch|learn|travel|meet)\b/i, type: 'infinitive', msgTh: 'want / need / decide / hope / plan ตามด้วย to + กริยา (เช่น want to go)', fix: (m) => `${m[1]} to ${m[2]}` },
];
const ARTICLE = /\b(a|an)\s+([a-z][\w-]*)/gi;
function articleOk(a, w) {
  const VS = /^(hour|honest|honou?r|heir)/i; const CS = /^(uni|use|usu|euro|eu|one|once)/i;
  const vowel = (/^[aeiou]/i.test(w) && !CS.test(w)) || VS.test(w);
  return a.toLowerCase() === 'an' ? vowel : !vowel;
}

function splitSentences(text) {
  return String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => /[a-z]/i.test(s));
}

/**
 * @param {string} text  คำตอบของผู้เรียน
 * @param {object} task  { checks?:[{re,flags,msgTh}], forbid?:[{re,flags,msgTh}], expectTense?:'past'|'present'|'future'|'perfect', minSentences?, minWords? }
 */
function checkWriting(text, task = {}) {
  text = String(text == null ? '' : text).replace(/[‘’ʼ`´]/g, "'").replace(/[“”]/g, '"');   // อัญประกาศโค้งจากคีย์บอร์ดมือถือ
  const issues = []; const good = [];
  const sentences = splitSentences(text);
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (task.minSentences && sentences.length < task.minSentences) issues.push({ type: 'length', severity: 'error', msgTh: `ต้องเขียนอย่างน้อย ${task.minSentences} ประโยค (ตอนนี้มี ${sentences.length})` });
  if (task.minWords && words.length < task.minWords) issues.push({ type: 'length', severity: 'error', msgTh: `เขียนสั้นไป — อย่างน้อย ${task.minWords} คำ` });
  if (/[฀-๿]/.test(text)) issues.push({ type: 'language', severity: 'error', msgTh: 'คำตอบมีภาษาไทยปน — เขียนเป็นภาษาอังกฤษทั้งประโยค' });
  sentences.forEach((s, si) => {
    const tag = sentences.length > 1 ? `ประโยคที่ ${si + 1}: ` : '';
    if (/^[a-z]/.test(s)) issues.push({ type: 'capital', severity: 'tip', excerpt: s.slice(0, 30), msgTh: `${tag}ขึ้นต้นประโยคด้วยตัวพิมพ์ใหญ่` });
    for (const r of RULES) {
      const m = s.match(r.re);
      if (!m) continue;
      if (r.when && !r.when(s, m)) continue;
      issues.push({ type: r.type, severity: r.severity || 'error', excerpt: m[0], msgTh: `${tag}"${m[0]}" — ${r.msgTh}`, suggestion: r.fix ? r.fix(m) : null });
    }
    let am;
    ARTICLE.lastIndex = 0;
    while ((am = ARTICLE.exec(s))) {
      if (!articleOk(am[1], am[2])) issues.push({ type: 'article', severity: 'error', excerpt: am[0], msgTh: `${tag}"${am[0]}" — ใช้ ${am[1].toLowerCase() === 'a' ? 'an' : 'a'} ตามเสียงของคำถัดไป (an ก่อนเสียงสระ เช่น an apple, an hour · a ก่อนเสียงพยัญชนะ เช่น a book, a university)`, suggestion: `${am[1].toLowerCase() === 'a' ? 'an' : 'a'} ${am[2]}` });
    }
    // tense ตามโจทย์
    const lw = s.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
    if (task.expectTense === 'past' && !lw.some(isPastWord) && !/\b\w+'d\s+(?:not\s+|never\s+|already\s+|just\s+)?\w+(ed|en|t|wn|ne|un|ung|ought|aught)\b/i.test(s)) {
      issues.push({ type: 'tense', severity: 'error', excerpt: s.slice(0, 40), msgTh: `${tag}โจทย์ให้เล่าเรื่องที่ผ่านมาแล้ว — ประโยคนี้ยังไม่มีกริยาอดีต (V2 เช่น went, played หรือ was/were)` });
    }
    if (task.expectTense === 'future' && !/(\bwill\b|'ll\b|\bwon't\b|\bshall\b|\bgoing to\b|\b(am|is|are|'m|'s|'re)\s+\w+ing\b)/i.test(s)) {
      issues.push({ type: 'tense', severity: 'error', excerpt: s.slice(0, 40), msgTh: `${tag}โจทย์ให้พูดถึงอนาคต — ใช้ will / be going to / present continuous` });
    }
    if (task.expectTense === 'perfect' && !/\b(have|has|haven't|hasn't|'ve|'s)\s+(?:(?:never|ever|just|already|recently|not|always|finally|nearly|almost|also|still)\s+)?(\w+ed|\w+en|been|done|gone|seen|made|had|met|read|written|taken|eaten|bought|found|lost|won|left|heard|known|flown|swum|run|come|become|begun|drunk|sung|thought|taught|told|said|got|sent|spent|built|kept|slept|felt|forgotten|given|grown|ridden|spoken|stolen|worn|driven|chosen|broken|fallen)\b/i.test(s)) {
      issues.push({ type: 'tense', severity: 'error', excerpt: s.slice(0, 40), msgTh: `${tag}โจทย์ให้ใช้ Present Perfect — have/has + V3 (เช่น I have visited …)` });
    }
    if (!/[.!?]$/.test(s)) issues.push({ type: 'punct', severity: 'tip', excerpt: s.slice(-20), msgTh: `${tag}จบประโยคด้วยจุด (.) หรือเครื่องหมายคำถาม (?)` });
  });
  (task.checks || []).forEach((ck) => {
    if (new RegExp(ck.re, ck.flags || 'i').test(text)) good.push(ck.okTh || null); else issues.push({ type: 'task', severity: 'error', msgTh: ck.msgTh });
  });
  (task.forbid || []).forEach((ck) => { const m = text.match(new RegExp(ck.re, ck.flags || 'i')); if (m) issues.push({ type: 'task', severity: 'error', excerpt: m[0], msgTh: ck.msgTh }); });
  const errors = issues.filter((i) => i.severity === 'error');
  return {
    passed: errors.length === 0 && sentences.length > 0,
    sentences: sentences.length, words: words.length,
    issues, strengths: good.filter(Boolean),
    note: 'ตรวจด้วยกฎภาษาที่พบบ่อย — ถ้าไม่พบข้อผิด ประโยคก็ยังอาจมีจุดที่ปรับให้เป็นธรรมชาติขึ้นได้',
  };
}

module.exports = { checkWriting, splitSentences, isPastWord };
