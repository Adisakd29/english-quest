/*
  เทสต์ข้อมูลต้นฉบับ Oxford (ไม่ต้องใช้ฐานข้อมูล)
  ค่าที่ตรวจทั้งหมดยืนยันกับเอกสาร PDF แล้ว — ถ้าแก้ parser แล้วค่าเปลี่ยน เทสต์จะจับได้
*/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const source = require(path.join(__dirname, '..', 'data', 'oxford', 'source_entries.json'));
const senses = require(path.join(__dirname, '..', 'data', 'oxford', 'senses.json'));

const byEntry = {};
senses.forEach((s) => { (byEntry[s.entryId] = byEntry[s.entryId] || []).push(s); });
const find = (entryId, pos, label = null) => (byEntry[entryId] || [])
  .find((s) => s.pos === pos && (label === null || s.senseLabel === label));

test('oxford: จำนวนบรรทัดตรงกับเอกสาร', () => {
  const lv = {};
  source.oxford3000.forEach((e) => { lv[e.headingLevel] = (lv[e.headingLevel] || 0) + 1; });
  assert.deepStrictEqual(lv, { A1: 900, A2: 872, B1: 809, B2: 727 });
  assert.strictEqual(source.oxford5000.length, 1999);
});

test('oxford: ไม่มีบรรทัดต่อที่หาเจ้าของไม่ได้', () => {
  const orphans = [...source.oxford3000, ...source.oxford5000].filter((e) => e.orphan);
  assert.deepStrictEqual(orphans, []);
});

test('oxford: senseId ไม่ซ้ำ และทุก sense อ้างอิงต้นฉบับได้', () => {
  assert.strictEqual(new Set(senses.map((s) => s.senseId)).size, senses.length);
  assert.ok(senses.every((s) => s.sourceRawEntry && s.sourceRef && s.source === 'OXFORD'));
});

test('oxford: จำนวนรวมประมาณ 5,000 headwords (ไม่ใช่ 8,000)', () => {
  const headwords = new Set(senses.map((s) => s.entryId)).size;
  assert.strictEqual(headwords, 4965);
  assert.strictEqual(senses.length, 5947);
});

test('oxford: คำเดียวกันแยก sense ตามคำใบ้ (bank money A1 / river B1)', () => {
  assert.strictEqual(find('bank', 'noun', 'money').cefr, 'A1');
  assert.strictEqual(find('bank', 'noun', 'river').cefr, 'B1');
});

test('oxford: ระดับต่างกันตามชนิดคำในรายการ 5000 (acid n. B2, adj. C1)', () => {
  assert.strictEqual(find('acid', 'noun').cefr, 'B2');
  assert.strictEqual(find('acid', 'adjective').cefr, 'C1');
  assert.strictEqual(find('spare', 'verb').cefr, 'C1');
  assert.strictEqual(find('trigger', 'noun').cefr, 'C1');
});

test('oxford: เลขคำพ้องรูปถูกแยกออกจากตัวคำ (close1 / close2)', () => {
  assert.strictEqual(find('close#1', 'verb').cefr, 'A1');
  assert.strictEqual(find('close#2', 'adjective').cefr, 'A2');
  assert.ok(senses.every((s) => !/\d$/.test(s.headword)), 'ตัวคำต้องไม่มีเลขติดท้าย');
});

test('oxford: ตัวพิมพ์ต่างกัน = คนละคำ (March ≠ march)', () => {
  assert.strictEqual(find('March', 'noun').cefr, 'A1');
  assert.strictEqual(find('march', 'noun').cefr, 'C1');
  assert.strictEqual(find('march', 'noun').sourceList, 'OXFORD_5000_ADDITIONAL');
});

test('oxford: บรรทัดที่ขึ้นบรรทัดใหม่ในเอกสารต่อกันถูกต้อง', () => {
  assert.strictEqual(find('light', 'adjective', 'from the sun/a lamp').cefr, 'A1');
  assert.strictEqual(find('second#1', 'number', 'next after the first').cefr, 'A1');
});

test('oxford: ชนิดคำหลายคำ (modal v., indefinite article) ไม่ถูกตัดผิด', () => {
  assert.ok(find('can#1', 'modal verb'));
  assert.ok(find('a,_an', 'indefinite article'), 'entryId ใช้ _ แทนช่องว่าง');
  assert.ok(find('be', 'auxiliary verb'));
});

test('oxford: จุดผิดปกติในต้นฉบับถูก flag ไม่ถูกเดา', () => {
  const seldom = byEntry.seldom[0];
  assert.strictEqual(seldom.pos, null, 'ต้นฉบับไม่ระบุชนิดคำ ห้ามเดาว่า adverb');
  assert.strictEqual(seldom.needsReview, true);
  const spec = find('specialize', 'verb');
  assert.strictEqual(spec.cefr, 'B1', 'ต้นฉบับพิมพ์ B1 — คงตามต้นฉบับ');
  assert.strictEqual(spec.needsReview, true);
  assert.strictEqual(senses.filter((s) => s.needsReview).length, 5);
});

test('oxford: ค่าชนิดคำและ CEFR อยู่ในชุดที่อนุญาตเท่านั้น', () => {
  const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
    'determiner', 'exclamation', 'number', 'modal verb', 'auxiliary verb', 'indefinite article',
    'definite article', 'infinitive marker', null]);
  assert.ok(senses.every((s) => POS.has(s.pos)));
  assert.ok(senses.every((s) => ['A1', 'A2', 'B1', 'B2', 'C1'].includes(s.cefr)));
});

/* ---------------- คำแปลไทย (V3) ---------------- */
const thai = require(path.join(__dirname, '..', 'data', 'oxford', 'thai_meanings.json'));

test('thai: ทุก key ตรงกับ sense ในต้นฉบับ', () => {
  const ids = new Set(senses.map((s) => s.senseId));
  const bad = Object.keys(thai).filter((k) => !ids.has(k));
  assert.deepStrictEqual(bad, []);
});

test('thai: แปลครบทุก sense ทั้ง 5,947 (A1–C1)', () => {
  const missing = senses.filter((s) => !thai[s.senseId]).map((s) => s.senseId);
  assert.deepStrictEqual(missing, []);
});

test('thai: คำพ้องรูปและคำใบ้ระดับ A2 แปลตาม sense', () => {
  assert.strictEqual(thai['can#2|noun|-'].thai, 'กระป๋อง');
  assert.ok(thai['close#2|adjective|-'].thai.startsWith('ใกล้'));
  assert.strictEqual(thai['rest|noun|remaining_part'].thai, 'ส่วนที่เหลือ');
  assert.strictEqual(thai['rest|verb|sleep/relax'].thai, 'พักผ่อน');
  assert.strictEqual(thai['light|adjective|not_heavy'].thai, 'เบา');
  assert.strictEqual(thai['rock|noun|music'].thai, 'ดนตรีร็อก');
});

test('thai: B2 ทั้งระดับแปลครบ และแยกคำพ้องรูป tear1/tear2, wind1/wind2', () => {
  const missing = senses.filter((s) => s.cefr === 'B2' && !thai[s.senseId]);
  assert.deepStrictEqual(missing.map((s) => s.senseId), []);
  assert.strictEqual(thai['tear#1|verb|-'].thai, 'ฉีก');
  assert.strictEqual(thai['tear#2|noun|-'].thai, 'น้ำตา');
  assert.strictEqual(thai['wind#1|noun|-'].thai, 'ลม');
  assert.ok(thai['wind#2|verb|-'].thai.startsWith('พัน'), 'wind2 (/waɪnd/) ต้องไม่ใช่ "ลม"');
  assert.strictEqual(thai['bear|verb|deal_with'].thai, 'ทน');
  assert.strictEqual(thai['bear|noun|animal'].thai, 'หมี');
  // คำที่ระดับต่างกันตามชนิดคำในรายการ 5000 — แปลตามชนิดคำของแต่ละ sense
  assert.strictEqual(thai['acid|noun|-'].thai, 'กรด');
  assert.strictEqual(thai['counter|noun|long_flat_surface'].thai, 'เคาน์เตอร์');
  assert.strictEqual(thai['ID|noun|-'].thai, 'บัตรประจำตัว', 'ตัวย่อ ID ต้องไม่ใช่ชื่อรัฐ');
});

test('thai: C1 (M–Z) แยก sense ถูกต้อง (march ≠ March, minute2, strip, seldom)', () => {
  assert.strictEqual(thai['march|noun|-'].thai, 'การเดินขบวน');
  assert.strictEqual(thai['March|noun|-'].thai, 'เดือนมีนาคม', 'ตัวพิมพ์ต่างกัน = คนละคำ');
  assert.strictEqual(thai['minute#2|adjective|-'].thai, 'เล็กมาก');
  assert.ok(thai['strip|noun|long_narrow_piece'].thai.includes('แถบ'));
  assert.ok(thai['strip|verb|remove_clothes/a_layer'].thai.includes('ถอด'));
  assert.strictEqual(thai['well|noun|-'].thai, 'บ่อน้ำ');
  assert.strictEqual(thai['seldom|unknown|-'].flagged, true, 'ต้นฉบับไม่มีชนิดคำ ต้อง flag');
});

test('thai: C1 (A–L) แปลครบ และแยก sense ถูกต้อง', () => {
  const missing = senses.filter((s) => s.cefr === 'C1' && /^[a-l]/i.test(s.headword) && !thai[s.senseId]);
  assert.deepStrictEqual(missing.map((s) => s.senseId), []);
  assert.strictEqual(thai['grave|noun|for_dead_person'].thai, 'หลุมศพ');
  assert.strictEqual(thai['grave|adjective|serious'].thai, 'ร้ายแรง');
  assert.strictEqual(thai['content#2|adjective|-'].thai, 'พอใจ');
  assert.strictEqual(thai['content#1|noun|-'].thai, 'เนื้อหา', 'content1 (B1) ต้องต่างจาก content2');
  assert.ok(thai['bow#1|verb|-'].thai.includes('โค้งคำนับ'), 'bow1 /baʊ/ ไม่ใช่คันธนู');
  // คำที่ระดับต่างกันตามชนิดคำ: acid n. B2 / adj. C1
  assert.notStrictEqual(thai['acid|adjective|-'].thai, thai['acid|noun|-'].thai);
  // ต้นฉบับพิมพ์ diplomatic n. — คงตามต้นฉบับแต่ต้อง flag
  assert.strictEqual(thai['diplomatic|noun|-'].flagged, true);
});

test('thai: B1 แยกคำพ้องรูปถูกต้อง (bank river, lie2, used1/used2, race people)', () => {
  assert.ok(thai['bank|noun|river'].thai.includes('ตลิ่ง'));
  assert.notStrictEqual(thai['bank|noun|river'].thai, thai['bank|noun|money'].thai);
  assert.strictEqual(thai['lie#2|verb|tell_a_lie'].thai, 'โกหก');
  assert.ok(thai['lie#1|verb|-'].thai.startsWith('นอน'), 'lie1 (A1) ต้องเป็นคนละความหมายกับ lie2');
  assert.ok(thai['used#1|adjective|-'].thai.includes('มือสอง'));
  assert.ok(thai['used#2|adjective|-'].thai.includes('เคยชิน'));
  assert.strictEqual(thai['race|noun|people'].thai, 'เชื้อชาติ');
  assert.strictEqual(thai['mine|noun|hole_in_the_ground'].thai, 'เหมือง');
});

test('thai: แปลตาม sense ไม่รวมความหมายอื่น (bank money = ธนาคาร เท่านั้น)', () => {
  assert.strictEqual(thai['bank|noun|money'].thai, 'ธนาคาร');
  assert.ok(!/ตลิ่ง|ฝั่ง/.test(thai['bank|noun|money'].thai), 'ห้ามปนความหมาย river');
  assert.strictEqual(thai['like|preposition|similar'].thai.includes('เหมือน'), true);
  assert.strictEqual(thai['like|verb|find_sb/sth_pleasant'].thai, 'ชอบ');
  assert.strictEqual(thai['second#1|noun|unit_of_time'].thai, 'วินาที');
});

test('thai: รูปแบบคำแปลถูกต้อง (มีภาษาไทย ไม่มีอังกฤษนอกวงเล็บ ไม่ยาวเกิน)', () => {
  for (const [id, m] of Object.entries(thai)) {
    assert.ok(/[\u0E00-\u0E7F]/.test(m.thai), `${id} ไม่มีภาษาไทย`);
    assert.ok(!/[A-Za-z]/.test(m.thai.replace(/\([^)]*\)/g, '')), `${id} มีอังกฤษนอกวงเล็บ`);
    assert.ok(m.thai.length <= 60, `${id} ยาวเกิน`);
    assert.strictEqual(m.flagged, Boolean(m.note), `${id} flag ต้องมีเหตุผลกำกับ`);
  }
});

test('thai: คำไวยากรณ์ที่ไม่มีคำแปลตรงตัวถูก flag', () => {
  for (const id of ['the|definite_article|-', 'a,_an|indefinite_article|-', 'to|infinitive_marker|-', 'be|auxiliary_verb|-']) {
    const key = id.replace('definite_article', 'definite article').replace('indefinite_article', 'indefinite article')
      .replace('infinitive_marker', 'infinitive marker').replace('auxiliary_verb', 'auxiliary verb');
    assert.ok(thai[key] && thai[key].flagged, `${key} ต้องถูก flag`);
  }
});
