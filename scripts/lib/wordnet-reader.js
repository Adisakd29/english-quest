/*
  อ่านฐานข้อมูล WordNet (Princeton) จากไฟล์ดิบใน package wordnet-db
  คืนค่า: ความหมายหลัก (definition), ตัวอย่างประโยค (example), คำพ้องความหมาย (synonyms)

  รูปแบบไฟล์ WordNet:
    index.<pos> : lemma pos synset_cnt p_cnt [ptr...] sense_cnt tagsense_cnt offset [offset...]
    data.<pos>  : (อยู่ที่ byte offset) offset lex_filenum ss_type w_cnt word lex_id ... | gloss
    gloss = ความหมาย ตามด้วย ; "ตัวอย่าง"

  ใช้ synset แรกใน index = ความหมายที่พบบ่อยที่สุดของคำนั้น
*/
const fs = require('fs');
const path = require('path');

const DICT_DIR = path.join(path.dirname(require.resolve('wordnet-db')), 'dict');

// หมวดความหมายของ WordNet (lexicographer files) — ตารางมาตรฐานลำดับคงที่ 00-44
// อ้างอิง: WordNet lexnames(5WN)
const LEXNAMES = ('adj.all adj.pert adv.all noun.Tops noun.act noun.animal noun.artifact '
  + 'noun.attribute noun.body noun.cognition noun.communication noun.event noun.feeling '
  + 'noun.food noun.group noun.location noun.motive noun.object noun.person noun.phenomenon '
  + 'noun.plant noun.possession noun.process noun.quantity noun.relation noun.shape noun.state '
  + 'noun.substance noun.time verb.body verb.change verb.cognition verb.communication '
  + 'verb.competition verb.consumption verb.contact verb.creation verb.emotion verb.motion '
  + 'verb.perception verb.possession verb.social verb.stative verb.weather adj.ppl').split(' ');

// category ของเรา -> ชื่อไฟล์ WordNet
const POS_FILE = { noun: 'noun', verb: 'verb', adj: 'adj', adv: 'adv' };

const indexCache = {};
const dataCache = {};

function loadIndex(pos) {
  if (indexCache[pos]) return indexCache[pos];
  const map = new Map();
  const text = fs.readFileSync(path.join(DICT_DIR, `index.${pos}`), 'utf8');
  for (const line of text.split('\n')) {
    if (!line || line.startsWith(' ')) continue; // บรรทัดว่าง/ส่วนหัวลิขสิทธิ์
    const parts = line.trim().split(' ');
    const lemma = parts[0];
    const synsetCnt = parseInt(parts[2], 10);
    const pCnt = parseInt(parts[3], 10);
    // ข้าม: lemma pos synset_cnt p_cnt [ptr x p_cnt] sense_cnt tagsense_cnt
    const offsetsStart = 4 + pCnt + 2;
    const offsets = parts.slice(offsetsStart, offsetsStart + synsetCnt);
    map.set(lemma, offsets);
  }
  indexCache[pos] = map;
  return map;
}

function loadData(pos) {
  if (dataCache[pos]) return dataCache[pos];
  dataCache[pos] = fs.readFileSync(path.join(DICT_DIR, `data.${pos}`));
  return dataCache[pos];
}

function readSynset(pos, offset) {
  const buf = loadData(pos);
  const start = parseInt(offset, 10);
  let end = buf.indexOf(0x0a, start); // หาจุดสิ้นบรรทัด
  if (end === -1) end = buf.length;
  const line = buf.slice(start, end).toString('utf8');

  const [head, glossRaw = ''] = line.split(' | ');
  const parts = head.split(' ');
  const lexname = LEXNAMES[parseInt(parts[1], 10)] || null; // หมวดความหมาย
  const wCnt = parseInt(parts[3], 16); // จำนวนคำใน synset เป็นเลขฐาน 16
  const words = [];
  for (let i = 0; i < wCnt; i++) {
    words.push(parts[4 + i * 2].replace(/_/g, ' ').replace(/\(.*\)$/, ''));
  }

  // แยกความหมายกับตัวอย่าง: ส่วนที่อยู่ใน "..." คือประโยคตัวอย่าง
  const gloss = glossRaw.trim();
  const examples = [...gloss.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
  const definition = gloss.split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('"'))[0] || null;

  return { words, definition, example: examples[0] || null, gloss, lexname };
}

/*
  หาข้อมูลของคำ
  lemma: คำที่ทำความสะอาดแล้ว (ตัวเล็ก) / category: noun|verb|adj|adv
*/
// คำที่ไม่มีความหมายในการจับคู่คำใบ้
const HINT_STOPWORDS = new Set([
  'sb', 'sth', 'the', 'a', 'an', 'to', 'of', 'from', 'into', 'for', 'or', 'and', 'in', 'on', 'me',
  'not', 'be', 'with', 'one', 'that', 'something', 'someone',
]);

// ตัดรูปคำแบบง่าย ๆ ให้จับคู่ได้กว้างขึ้น (competition/compete ยังไม่ครอบคลุม แต่ช่วยได้มาก)
function stem(t) {
  return t.replace(/(ing|ed|es|s)$/, '');
}

function tokens(text) {
  return String(text || '').toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem);
}

// ให้คะแนนแต่ละความหมายตามจำนวนคำใบ้ที่ปรากฏใน คำจำกัดความ/ตัวอย่าง/คำพ้อง
function scoreSense(sense, hintTokens) {
  // ใช้ gloss เต็ม (ไม่ใช่แค่ท่อนแรก) เพราะคำสำคัญมักอยู่ท่อนหลัง
  // เช่น "1/60 of a minute; the basic unit of time ..."
  const bag = [...new Set([...tokens(sense.gloss), ...sense.words.flatMap(tokens)])];
  return hintTokens.filter((t) => bag.some((b) => (
    b === t
    // จับคู่คำที่ขึ้นต้นเหมือนกัน (relax ~ relaxation) เฉพาะคำยาวพอ กันจับคู่มั่ว
    || (t.length >= 4 && b.length >= 4 && (b.startsWith(t) || t.startsWith(b)))
  ))).length;
}

/*
  hint: คำใบ้ในวงเล็บจากรายการ Oxford เช่น "money" ใน "bank (money)"
  ใช้เลือกความหมายที่ตรงกับคำใบ้ — สำคัญมากกับคำที่สะกดเหมือนกันแต่คนละความหมาย
*/
// รูปสะกดแบบอเมริกันของคำสะกดแบบอังกฤษ (WordNet เรียงความหมายของรูปอเมริกันได้ดีกว่า)
function usVariant(key) {
  if (/our$/.test(key)) return key.replace(/our$/, 'or');     // colour -> color
  if (/[^aeiou]re$/.test(key)) return key.replace(/re$/, 'er'); // centre -> center
  if (/ise$/.test(key)) return key.replace(/ise$/, 'ize');     // organise -> organize
  return null;
}

function lookup(lemma, category, hint, senseIndex) {
  const pos = POS_FILE[category];
  if (!pos) return null;
  const index = loadIndex(pos);
  let key = lemma.toLowerCase().replace(/ /g, '_');
  const us = usVariant(key);
  if (us && index.has(us)) key = us;
  const offsets = index.get(key);
  if (!offsets || offsets.length === 0) return null;

  const senses = offsets.map((o) => readSynset(pos, o));

  // 0) กำหนดความหมายด้วยมือ (คนเลือกแล้ว) — มาก่อนกฎอัตโนมัติทั้งหมด
  let chosen = (Number.isInteger(senseIndex) && senses[senseIndex]) ? senses[senseIndex] : null;

  // 1) ถ้ามีคำใบ้ เลือกความหมายที่ตรงกับคำใบ้มากที่สุด
  const hintTokens = tokens(hint).filter((t) => !HINT_STOPWORDS.has(t));
  if (!chosen && hintTokens.length > 0) {
    let best = 0;
    for (const s of senses) {
      const sc = scoreSense(s, hintTokens);
      if (sc > best) { best = sc; chosen = s; }
    }
  }

  // 2) ไม่มีคำใบ้หรือจับคู่ไม่ได้: เลือกความหมายแรกที่ "ใช้ทั่วไป"
  //    ข้ามความหมายเฉพาะทางที่ขึ้นต้นด้วยป้ายสาขา เช่น "(computer science) ..."
  if (!chosen) {
    chosen = senses.find((s) => s.definition && !s.definition.startsWith('(')) || senses[0];
    // ผู้เรียนรู้จัก banana/carrot ในฐานะ "อาหาร" ไม่ใช่ "พืชสกุล Musa"
    // สลับเฉพาะกรณีความหมายแรกเป็นพืช — ไม่กระทบสัตว์ (fish/lamb ยังเป็นสัตว์)
    if (chosen.lexname === 'noun.plant') {
      const food = senses.find((s) => s.lexname === 'noun.food');
      if (food) chosen = food;
    }
  }

  // คำพ้องความหมาย: คำอื่นใน synset เดียวกัน (ไม่รวมตัวเอง) สูงสุด 4 คำ
  const synonyms = chosen.words
    .filter((w) => w.toLowerCase() !== lemma.toLowerCase())
    .slice(0, 4);

  // ตัวอย่างต้องมาจากความหมายเดียวกันเท่านั้น — ไม่ดึงจากความหมายอื่น
  // เพราะจะทำให้ความหมายกับตัวอย่างไม่ตรงกัน (ไม่มีตัวอย่างดีกว่าตัวอย่างผิดความหมาย)
  // senseCount: จำนวนความหมายทั้งหมด — คำที่มีหลายความหมายเสี่ยงที่จะเลือกผิด
  // ใช้ช่วยแอดมินจัดลำดับว่าคำไหนควรตรวจก่อน
  return { definition: chosen.definition, example: chosen.example, synonyms, senseCount: senses.length, lexname: chosen.lexname };
}

module.exports = { lookup };
