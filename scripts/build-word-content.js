/*
  สร้างไฟล์ data/word_content.json จากพจนานุกรมเปิด (รันครั้งเดียวตอนพัฒนา)

    node scripts/build-word-content.js

  แหล่งข้อมูล (ดู THIRD_PARTY_NOTICES.md):
    - IPA          : CMU Pronouncing Dictionary (public domain) แปลงเป็น IPA
    - ความหมาย/ตัวอย่าง/คำพ้อง : WordNet 3.1 (Princeton, อนุญาตพร้อมประกาศลิขสิทธิ์)

  ไฟล์ผลลัพธ์ถูก commit เข้า repo → production ไม่ต้องติดตั้ง package ทั้งสอง
  (เป็นแค่ devDependencies ใช้ตอนสร้างข้อมูล)
*/
const fs = require('fs');
const path = require('path');
const cmu = require('cmu-pronouncing-dictionary').dictionary;
const { arpabetToIpa } = require('./lib/arpabet-to-ipa');
const { lookup } = require('./lib/wordnet-reader');
const wordsJson = require('../data/words.json');
const { topicFor } = require('../utils/curriculum');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

/*
  กำหนดความหมายด้วยมือสำหรับคำพ้องรูปที่กฎอัตโนมัติเลือกผิด
  (ตรวจโดยดูความหมายทั้งหมดใน WordNet แล้วเลือกให้ตรงกับคำใบ้ของ Oxford)
    sense    : ลำดับความหมายใน WordNet (เริ่มที่ 0)
    suppress : WordNet ไม่มีความหมายที่ตรง → ไม่แสดงความหมายเลย (ดีกว่าแสดงผิด)
*/
const SENSE_OVERRIDES = {
  'B2-0060': { sense: 2 },       // bear (deal with) → put up with something unpleasant
  'C1-0481': { sense: 1 },       // grave (for dead person) → a place for the burial of a corpse
  'A1-0436': { sense: 5 },       // light (from the sun/a lamp) adj → characterized by or emitting light
  'B1-0405': { suppress: true }, // like (find sb/sth pleasant) noun → WordNet ไม่มีความหมายนี้
};

/*
  ตัวย่อ: WordNet ค้นแบบไม่สนตัวพิมพ์ "CD" จึงไปชน "Cd" (ธาตุแคดเมียม), "ID" ชน Idaho
  ให้คำใบ้เพื่อเลือกความหมายที่ถูก (ใช้ตามคำ ไม่ผูกกับ id เพราะบางคำมีหลายระดับ)
*/
const ACRONYM_HINTS = {
  cd: 'compact disc music',
  id: 'identification card',
  tv: 'television receiver set',
  it: 'information technology computer',
};
const CONTENT = new Set(['noun', 'verb', 'adj', 'adv']);

// ทำความสะอาดคำ: ตัดวงเล็บอธิบาย และเอาเฉพาะรูปแรกก่อนจุลภาค
// เช่น "second (next after the first)" -> "second", "a, an" -> "a"
function clean(word) {
  return String(word).replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
}

function ipaFor(lemma) {
  const key = lemma.toLowerCase();
  // คำหลายคำ (เช่น "ice cream") แปลงทีละคำแล้วต่อด้วยเว้นวรรค
  const parts = key.split(/\s+/);
  const out = [];
  for (const p of parts) {
    const ipa = arpabetToIpa(cmu[p]);
    if (!ipa) return null; // ถ้าคำใดไม่มีในพจนานุกรม ไม่ใส่ IPA เลย ดีกว่าใส่ไม่ครบ
    out.push(ipa);
  }
  return out.join(' ');
}

const result = {};
const stats = { total: 0, ipa: 0, definition: 0, example: 0, synonyms: 0 };

for (const level of LEVELS) {
  for (const w of wordsJson.levels[level]) {
    stats.total += 1;
    const lemma = clean(w.word);
    const entry = {};

    const ipa = ipaFor(lemma);
    if (ipa) { entry.ipa = ipa; stats.ipa += 1; }

    // ความหมายเฉพาะคำเนื้อหา (คำไวยากรณ์อย่าง the/of ไม่มีใน WordNet อยู่แล้ว)
    const override = SENSE_OVERRIDES[w.id] || {};
    if (CONTENT.has(w.category) && !override.suppress) {
      const hintMatch = String(w.word).match(/\(([^)]*)\)/);
      const acronymHint = /^[A-Z]{2,}$/.test(lemma) ? ACRONYM_HINTS[lemma.toLowerCase()] : null;
      const hint = hintMatch ? hintMatch[1] : acronymHint;
      const wn = lookup(lemma, w.category, hint, override.sense);
      if (wn && wn.definition) {
        entry.definition = wn.definition;
        stats.definition += 1;
        if (wn.example) { entry.example = wn.example; stats.example += 1; }
        if (wn.synonyms.length) { entry.synonyms = wn.synonyms; stats.synonyms += 1; }
        entry.senses = wn.senseCount;
      }
      // หัวข้อจากหมวดความหมายของ WordNet (ใช้จัด Unit ใน Learning Path)
      const topic = topicFor(w.category, wn && wn.lexname);
      if (topic) { entry.topic = topic; stats.topic = (stats.topic || 0) + 1; }
    }

    if (Object.keys(entry).length > 0) result[w.id] = entry;
  }
}

const outPath = path.join(__dirname, '..', 'data', 'word_content.json');
fs.writeFileSync(outPath, JSON.stringify(result));

const pct = (n) => `${((n / stats.total) * 100).toFixed(1)}%`;
console.log(`คำทั้งหมด     : ${stats.total}`);
console.log(`มี IPA        : ${stats.ipa} (${pct(stats.ipa)})`);
console.log(`มีความหมาย    : ${stats.definition} (${pct(stats.definition)})`);
console.log(`มีตัวอย่าง     : ${stats.example} (${pct(stats.example)})`);
console.log(`มีคำพ้อง       : ${stats.synonyms} (${pct(stats.synonyms)})`);
console.log(`มีหัวข้อ       : ${stats.topic} (${pct(stats.topic)})`);
console.log(`ขนาดไฟล์      : ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
