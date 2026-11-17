/*
  Grammar QA: คลังคำถามแกรมม่าต้องไม่มี error จากการตรวจอัตโนมัติ (สคริปต์เดียวกับ scripts/grammar-qa.js)
  + ตรวจว่ากฎของสคริปต์จับปัญหาที่เคยเจอจริงได้
*/
const test = require('node:test');
const assert = require('node:assert');
const qa = require('../scripts/grammar-qa');

test('คลังแกรมม่าทั้งหมดผ่าน QA (ไม่มี error)', () => {
  const r = qa.run();
  const errors = r.issues.filter((i) => i.severity === 'error');
  assert.ok(r.counts.legacy > 1000, 'อ่านคลังเดิมครบ');
  assert.deepStrictEqual(errors, [], errors.map((e) => `${e.where}: ${e.msg}`).join('\n'));
});

test('กฎ a/an ตามเสียง', () => {
  assert.ok(qa.articleFits('an', 'hour'));
  assert.ok(qa.articleFits('a', 'university'));
  assert.ok(qa.articleFits('an', 'apple'));
  assert.ok(!qa.articleFits('a', 'elephant'));
  assert.ok(!qa.articleFits('an', 'book'));
  assert.ok(qa.articleFits('a', 'European'));
});

test('ตัวตรวจจับปัญหาที่เคยเจอจริง: "___ is a good book" = A · Tomorrow I ___ (will/am meeting) · ตัวเลือกต่างแค่การย่อคำ', () => {
  // ใช้ฟังก์ชันภายในผ่านคลังจำลอง
  const path = require('path');
  const Module = require('module');
  const fake = { GRAMMAR_CHAPTERS: [{ id: 'x', title: 'X', sections: [], quiz: { basic: [
    { question: '"___ is a good book."', choices: ['A', 'This', 'An', 'Them'], correctIndex: 0, explain: 'ทดสอบ' },
    { question: '"Tomorrow I ___ my friend."', choices: ['meet', 'met', 'will meet', 'am meeting'], correctIndex: 2, explain: 'ทดสอบ' },
    { question: '"She ___ like coffee."', choices: ["doesn't", 'does not', 'not', "don't"], correctIndex: 0, explain: 'ทดสอบ' },
  ] } }] };
  const file = path.join(__dirname, '..', 'data', 'grammar.js');
  const saved = require.cache[require.resolve(file)];
  require.cache[require.resolve(file)] = { id: file, filename: file, loaded: true, exports: fake, children: [], paths: Module._nodeModulePaths(path.dirname(file)) };
  try {
    const codes = qa.run().issues.filter((i) => i.where.startsWith('legacy:x')).map((i) => i.code);
    assert.ok(codes.includes('article_before_verb'), codes.join(','));
    assert.ok(codes.includes('multiple_future'), codes.join(','));
    assert.ok(codes.includes('duplicate_choice'), codes.join(','));
  } finally { require.cache[require.resolve(file)] = saved; }
});
