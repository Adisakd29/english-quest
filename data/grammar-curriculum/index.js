/*
  หลักสูตรแกรมม่า A1–C1 (Grammar Learning) — แยกจาก Rank (เกม) และ Account Level (EXP) โดยสิ้นเชิง
    CEFR = ระดับการเรียน · Rank = Gamification · Level = ปริมาณกิจกรรม
  โครงสร้าง: LEVELS[] -> TOPICS (ลำดับตามหลักสูตร) · เนื้อหาแต่ละหัวข้ออยู่ใน topics/<id>.json
  เนื้อหาหัวข้อ (ดู SCHEMA ด้านล่าง): concept · structure · examples · mistakes · compare · contexts · terms · practice[]
  ตรวจความถูกต้องของข้อมูลด้วย validateCurriculum() (เรียกจาก scripts/grammar-qa.js และชุดทดสอบ)
*/
const fs = require('fs');
const path = require('path');

const LEVELS = [
  { id: 'A1', title: 'Foundation Grammar', titleTh: 'พื้นฐาน', desc: 'โครงสร้างประโยคพื้นฐานที่ใช้ทุกวัน' },
  { id: 'A2', title: 'Elementary', titleTh: 'ระดับต้น', desc: 'เล่าเรื่องอดีต พูดถึงอนาคต เปรียบเทียบ' },
  { id: 'B1', title: 'Intermediate', titleTh: 'ระดับกลาง', desc: 'เชื่อมโยงเวลา เล่าต่อ สมมุติ แสดงความคิดเห็น' },
  { id: 'B2', title: 'Upper-Intermediate', titleTh: 'ระดับกลางค่อนสูง', desc: 'โครงสร้างซับซ้อน สมมุติอดีต สำนวนเขียน' },
  { id: 'C1', title: 'Advanced', titleTh: 'ระดับสูง', desc: 'เน้นย้ำ ภาษาเขียนเชิงวิชาการ ความแม่นยำสูง' },
];

/* group = กลุ่มหัวข้อ (ใช้กับ Badge/สรุปจุดแข็ง) · compareWith = หัวข้อที่ต้องมีส่วน Compare เทียบกัน */
const TOPICS = [
  // ---------------- A1 ----------------
  ['a1-subject-pronouns', 'A1', 'Subject Pronouns', 'สรรพนามประธาน', 'pronouns'],
  ['a1-object-pronouns', 'A1', 'Object Pronouns', 'สรรพนามกรรม', 'pronouns', ['a1-subject-pronouns']],
  ['a1-verb-to-be', 'A1', 'Verb to be', 'กริยา be (am / is / are)', 'be'],
  ['a1-articles', 'A1', 'Articles: a / an / the', 'คำนำหน้านาม a / an / the', 'articles'],
  ['a1-plural-nouns', 'A1', 'Singular & Plural Nouns', 'คำนามเอกพจน์และพหูพจน์', 'nouns'],
  ['a1-demonstratives', 'A1', 'This / That / These / Those', 'คำชี้เฉพาะ', 'determiners'],
  ['a1-possessive-adjectives', 'A1', 'Possessive Adjectives', 'คำแสดงความเป็นเจ้าของ (my, your …)', 'pronouns', ['a1-object-pronouns']],
  ['a1-possessive-s', 'A1', "Possessive 's", "การแสดงความเป็นเจ้าของด้วย 's", 'nouns', ['a1-possessive-adjectives']],
  ['a1-there-is-are', 'A1', 'There is / There are', 'มี … (there is / there are)', 'be'],
  ['a1-have-has', 'A1', 'Have / Has', 'มี (have / has)', 'verbs', ['a1-there-is-are']],
  ['a1-present-simple', 'A1', 'Present Simple', 'ปัจจุบันกาลธรรมดา', 'tenses'],
  ['a1-adverbs-frequency', 'A1', 'Adverbs of Frequency', 'คำบอกความถี่ (always, usually …)', 'adverbs'],
  ['a1-present-continuous', 'A1', 'Present Continuous', 'ปัจจุบันกาลกำลังกระทำ', 'tenses', ['a1-present-simple']],
  ['a1-can', 'A1', "Can / Can't", 'สามารถ (can / can\'t)', 'modals'],
  ['a1-imperatives', 'A1', 'Imperatives', 'ประโยคคำสั่ง ขอร้อง', 'sentences'],
  ['a1-prepositions', 'A1', 'Basic Prepositions (in / on / at …)', 'บุพบทพื้นฐาน (สถานที่ เวลา)', 'prepositions'],
  ['a1-question-words', 'A1', 'Question Words', 'คำถาม Wh- (what, where …)', 'questions'],
  ['a1-conjunctions', 'A1', 'Basic Conjunctions (and / but / or / because / so)', 'คำเชื่อมพื้นฐาน', 'linking'],
  ['a1-comparatives-basic', 'A1', 'Basic Comparatives (-er than)', 'การเปรียบเทียบขั้นพื้นฐาน', 'comparison'],
  // ---------------- A2 ----------------
  ['a2-past-simple', 'A2', 'Past Simple', 'อดีตกาลธรรมดา', 'tenses'],
  ['a2-past-continuous', 'A2', 'Past Continuous', 'อดีตกาลกำลังกระทำ', 'tenses', ['a2-past-simple']],
  ['a2-future-will', 'A2', 'Future with will', 'อนาคตด้วย will', 'future'],
  ['a2-going-to', 'A2', 'be going to', 'อนาคตด้วย be going to', 'future', ['a2-future-will']],
  ['a2-present-continuous-future', 'A2', 'Present Continuous for Future Arrangements', 'ปัจจุบันกาลกำลังกระทำ สำหรับนัดหมายในอนาคต', 'future', ['a2-future-will', 'a2-going-to']],
  ['a2-countable-uncountable', 'A2', 'Countable & Uncountable Nouns', 'คำนามนับได้และนับไม่ได้', 'nouns'],
  ['a2-quantifiers', 'A2', 'much / many / some / any / a lot of', 'คำบอกปริมาณ', 'determiners', ['a2-countable-uncountable']],
  ['a2-comparatives', 'A2', 'Comparatives', 'ขั้นกว่า', 'comparison'],
  ['a2-superlatives', 'A2', 'Superlatives', 'ขั้นสูงสุด', 'comparison', ['a2-comparatives']],
  ['a2-modals', 'A2', 'Modals: must / have to / should', 'กริยาช่วยแสดงหน้าที่ คำแนะนำ', 'modals'],
  ['a2-infinitive', 'A2', 'Verb + to-infinitive', 'กริยา + to + กริยาช่องที่ 1', 'verb-patterns'],
  ['a2-gerund', 'A2', 'Gerunds (-ing)', 'คำกริยารูป -ing ที่ทำหน้าที่คล้ายคำนาม', 'verb-patterns', ['a2-infinitive']],
  ['a2-present-perfect-intro', 'A2', 'Present Perfect (introduction)', 'ปัจจุบันสมบูรณ์ (เบื้องต้น)', 'tenses', ['a2-past-simple']],
  ['a2-relative-pronouns', 'A2', 'Relative Pronouns: who / which / that', 'คำเชื่อมขยายคำนาม who / which / that', 'relative'],
  ['a2-first-conditional', 'A2', 'First Conditional', 'ประโยคเงื่อนไขแบบที่ 1', 'conditionals'],
  // ---------------- B1 ----------------
  ['b1-pp-vs-past', 'B1', 'Present Perfect vs Past Simple', 'ปัจจุบันสมบูรณ์ เทียบกับ อดีตกาล', 'tenses', ['a2-past-simple', 'a2-present-perfect-intro']],
  ['b1-pp-continuous', 'B1', 'Present Perfect Continuous', 'ปัจจุบันสมบูรณ์กำลังกระทำ', 'tenses', ['b1-pp-vs-past']],
  ['b1-past-perfect', 'B1', 'Past Perfect', 'อดีตสมบูรณ์', 'tenses', ['a2-past-simple']],
  ['b1-passive', 'B1', 'Passive Voice', 'ประโยคถูกกระทำ', 'passive'],
  ['b1-second-conditional', 'B1', 'Second Conditional', 'ประโยคเงื่อนไขแบบที่ 2', 'conditionals', ['a2-first-conditional']],
  ['b1-reported-speech', 'B1', 'Reported Speech', 'การเล่าคำพูดของผู้อื่น', 'reported'],
  ['b1-relative-clauses', 'B1', 'Relative Clauses (defining & non-defining)', 'อนุประโยคขยายคำนาม', 'relative', ['a2-relative-pronouns']],
  ['b1-modal-deduction', 'B1', 'Modals of Deduction: must / might / can\'t', 'กริยาช่วยแสดงการคาดคะเน', 'modals'],
  ['b1-gerund-vs-infinitive', 'B1', 'Gerund vs Infinitive', 'Gerund กับ to-infinitive (ความหมายต่างกัน)', 'verb-patterns', ['a2-gerund', 'a2-infinitive']],
  ['b1-used-to', 'B1', 'used to', 'เคย … (นิสัย/สภาพในอดีต)', 'past-habits'],
  ['b1-would-past', 'B1', 'would for Past Habits', 'would สำหรับกิจวัตรในอดีต', 'past-habits', ['b1-used-to']],
  ['b1-question-tags', 'B1', 'Question Tags', 'คำถามท้ายประโยค', 'questions'],
  ['b1-phrasal-verbs', 'B1', 'Phrasal Verb Structures', 'โครงสร้างกริยาวลี', 'verbs'],
  // ---------------- B2 ----------------
  ['b2-narrative-tenses', 'B2', 'Mixed Tenses in Narratives', 'การใช้ tense ผสมในการเล่าเรื่อง', 'tenses'],
  ['b2-advanced-passive', 'B2', 'Advanced Passive', 'ประโยคถูกกระทำขั้นสูง', 'passive', ['b1-passive']],
  ['b2-causative', 'B2', 'Causative: have / get something done', 'ให้ผู้อื่นทำให้ (have/get sth done)', 'passive', ['b2-advanced-passive']],
  ['b2-third-conditional', 'B2', 'Third Conditional', 'ประโยคเงื่อนไขแบบที่ 3', 'conditionals', ['b1-second-conditional']],
  ['b2-mixed-conditionals', 'B2', 'Mixed Conditionals', 'ประโยคเงื่อนไขแบบผสม', 'conditionals', ['b2-third-conditional']],
  ['b2-reporting-verbs', 'B2', 'Advanced Reported Speech (reporting verbs)', 'กริยาที่ใช้เล่าคำพูด', 'reported', ['b1-reported-speech']],
  ['b2-reduced-relatives', 'B2', 'Reduced Relative Clauses', 'การลดรูปอนุประโยคขยายคำนาม', 'relative', ['b1-relative-clauses']],
  ['b2-participle-clauses', 'B2', 'Participle Clauses', 'อนุประโยค Participle', 'participles'],
  ['b2-inversion-intro', 'B2', 'Inversion (introduction)', 'การสลับประธานกับกริยาช่วย (เบื้องต้น)', 'emphasis'],
  ['b2-modal-perfect', 'B2', 'Modal Perfect (should have / must have …)', 'กริยาช่วย + have + V3', 'modals', ['b1-modal-deduction']],
  ['b2-wish', 'B2', 'Wish / If only', 'การแสดงความปรารถนา (wish / if only)', 'conditionals'],
  ['b2-linking', 'B2', 'Advanced Linking Structures', 'คำเชื่อมขั้นสูง', 'linking'],
  // ---------------- C1 ----------------
  ['c1-inversion', 'C1', 'Advanced Inversion', 'การสลับตำแหน่งขั้นสูง', 'emphasis', ['b2-inversion-intro']],
  ['c1-cleft', 'C1', 'Cleft Sentences', 'ประโยคเน้น (It is … that / What … is)', 'emphasis'],
  ['c1-emphasis', 'C1', 'Emphasis (do/does, fronting)', 'การเน้นย้ำ', 'emphasis', ['c1-cleft']],
  ['c1-advanced-conditionals', 'C1', 'Advanced Conditionals', 'ประโยคเงื่อนไขขั้นสูง', 'conditionals', ['b2-mixed-conditionals']],
  ['c1-ellipsis', 'C1', 'Ellipsis', 'การละคำ', 'cohesion'],
  ['c1-substitution', 'C1', 'Substitution (so / not / one / do so)', 'การใช้คำแทน', 'cohesion', ['c1-ellipsis']],
  ['c1-nominalisation', 'C1', 'Nominalisation', 'การเปลี่ยนกริยา/คุณศัพท์เป็นคำนาม', 'academic'],
  ['c1-advanced-modals', 'C1', 'Advanced Modal Meaning', 'ความหมายขั้นสูงของกริยาช่วย', 'modals', ['b2-modal-perfect']],
  ['c1-complex-passive', 'C1', 'Complex Passive Structures', 'Passive ซับซ้อน (is thought to have …)', 'passive', ['b2-advanced-passive']],
  ['c1-advanced-relatives', 'C1', 'Advanced Relative Structures', 'อนุประโยคขยายคำนามขั้นสูง', 'relative', ['b2-reduced-relatives']],
  ['c1-participle-clauses', 'C1', 'Advanced Participle Clauses', 'อนุประโยค Participle ขั้นสูง', 'participles', ['b2-participle-clauses']],
  ['c1-discourse', 'C1', 'Discourse Grammar', 'ไวยากรณ์ระดับข้อความ (ความต่อเนื่องของเนื้อหา)', 'cohesion'],
  ['c1-academic', 'C1', 'Formal & Academic Structures', 'โครงสร้างภาษาเขียนทางการ/วิชาการ', 'academic', ['c1-nominalisation']],
  ['c1-hedging', 'C1', 'Hedging', 'การพูดแบบระมัดระวัง ไม่ฟันธง', 'academic'],
  ['c1-transformation', 'C1', 'Complex Sentence Transformation', 'การแปลงประโยคซับซ้อน', 'academic'],
].map(([id, cefr, title, titleTh, group, compareWith = []]) => ({ id, cefr, title, titleTh, group, compareWith }));

const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t, i) => [t.id, { ...t, order: i }]));
const LEVEL_IDS = LEVELS.map((l) => l.id);
const QUESTION_TYPES = ['mc', 'fill', 'order', 'error', 'transform', 'match', 'choose', 'dialogue', 'context', 'write'];
const TYPE_TH = {
  mc: 'เลือกคำตอบ', fill: 'เติมคำ', order: 'เรียงประโยค', error: 'หาและแก้คำผิด', transform: 'เขียนประโยคใหม่',
  match: 'จับคู่', choose: 'เลือกประโยคที่ถูก', dialogue: 'เติมบทสนทนา', context: 'อ่านแล้วตอบ', write: 'เขียนสั้น ๆ',
};
const CONTEXT_KINDS = ['dialogue', 'story', 'email', 'message', 'announcement', 'conversation', 'school', 'travel', 'work', 'social'];

/* ---------------- โหลดเนื้อหา ---------------- */
const DIR = path.join(__dirname, 'topics');
let cache = null;
function loadAll() {
  if (cache) return cache;
  const content = {};
  for (const t of TOPICS) {
    const f = path.join(DIR, `${t.id}.json`);
    if (fs.existsSync(f)) content[t.id] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  cache = content;
  return content;
}
function reload() { cache = null; return loadAll(); }
/** หัวข้อพร้อมเนื้อหา (null = ยังไม่มีเนื้อหา) */
function getTopic(id) {
  const meta = TOPIC_BY_ID[id];
  if (!meta) return null;
  const c = loadAll()[id];
  return c ? { ...meta, ...c, id, cefr: meta.cefr } : null;
}
function allItems() {
  const out = [];
  for (const t of TOPICS) {
    const c = loadAll()[t.id];
    if (!c) continue;
    (c.practice || []).forEach((it) => out.push({ ...it, topic: t.id, cefr: t.cefr, group: t.group }));
  }
  return out;
}
let itemIndex = null;
function getItem(id) {
  if (!itemIndex) itemIndex = new Map(allItems().map((it) => [it.id, it]));
  return itemIndex.get(id) || null;
}

/* ---------------- ตรวจข้อมูล (QA) ---------------- */
const HL = /\[\[[^\]]+\]\]/;
function validateCurriculum(qa) {
  const { add, checkText, checkChoices, checkFilled, canon } = qa;
  const content = reload(); itemIndex = null;
  let items = 0;
  const ids = new Set();
  for (const t of TOPICS) {
    const c = content[t.id];
    const w = `topic:${t.id}`;
    if (!c) { add('warn', w, 'missing_topic', 'ยังไม่มีเนื้อหา'); continue; }
    if (c.id && c.id !== t.id) add('error', w, 'id_mismatch', `id ในไฟล์ (${c.id}) ไม่ตรงกับชื่อไฟล์`);
    // Concept / Structure / Examples / Mistakes / Contexts / Terms
    if (!c.concept || !c.concept.what || !c.concept.when || !c.concept.why) add('error', w, 'concept', 'concept ต้องมี what / when / why');
    else { checkText(w, 'concept.what', c.concept.what); checkText(w, 'concept.why', c.concept.why); (Array.isArray(c.concept.when) ? c.concept.when : [c.concept.when]).forEach((x) => checkText(w, 'concept.when', x)); }
    if (!c.structure || !c.structure.formula || !Array.isArray(c.structure.rows) || c.structure.rows.length < 2) add('error', w, 'structure', 'structure ต้องมี formula และ rows อย่างน้อย 2 แถว');
    else c.structure.rows.forEach((r, i) => { checkText(w, `structure.rows[${i}].label`, r.label); checkText(w, `structure.rows[${i}].example`, r.example); });
    if (!Array.isArray(c.examples) || c.examples.length < 5) add('error', w, 'examples', `ตัวอย่างต้องมีอย่างน้อย 5 (มี ${(c.examples || []).length})`);
    else c.examples.forEach((ex, i) => { checkText(w, `examples[${i}].en`, ex.en); checkText(w, `examples[${i}].th`, ex.th); if (!HL.test(ex.en)) add('warn', w, 'example_highlight', `examples[${i}] ไม่มี [[ส่วนแกรมม่า]]`); });
    if (!Array.isArray(c.mistakes) || c.mistakes.length < 3) add('error', w, 'mistakes', 'Common mistakes ต้องมีอย่างน้อย 3');
    else c.mistakes.forEach((m, i) => { checkText(w, `mistakes[${i}].wrong`, m.wrong); checkText(w, `mistakes[${i}].right`, m.right); checkText(w, `mistakes[${i}].whyTh`, m.whyTh); if (canon(m.wrong) === canon(m.right)) add('error', w, 'mistake_same', `mistakes[${i}] ผิด/ถูกเหมือนกัน`); });
    if (c.compare && c.compare.with !== undefined && (!Array.isArray(c.compare.with) || c.compare.with.some((x) => !TOPIC_BY_ID[x]))) add('error', w, 'compare_with', 'compare.with ต้องเป็นรายการ id หัวข้อที่มีอยู่จริง');
    if (t.compareWith.length && (!c.compare || !Array.isArray(c.compare.rows) || c.compare.rows.length < 2)) add('error', w, 'compare', 'หัวข้อนี้ต้องมีส่วน Compare (rows อย่างน้อย 2)');
    if (!Array.isArray(c.contexts) || !c.contexts.length) add('error', w, 'contexts', 'ต้องมีบริบทจริงอย่างน้อย 1 (บทสนทนา อีเมล ข้อความ …)');
    else c.contexts.forEach((cx, i) => { if (!CONTEXT_KINDS.includes(cx.kind)) add('error', w, 'context_kind', `contexts[${i}].kind ไม่รู้จัก: ${cx.kind}`); if (!Array.isArray(cx.lines) || !cx.lines.length) add('error', w, 'context_lines', `contexts[${i}] ไม่มี lines`); else cx.lines.forEach((l, j) => checkText(w, `contexts[${i}].lines[${j}]`, l.text)); });
    if (!Array.isArray(c.terms) || !c.terms.length) add('error', w, 'terms', 'ต้องมีศัพท์แกรมม่า EN + TH อย่างน้อย 1');
    else c.terms.forEach((x, i) => { checkText(w, `terms[${i}].en`, x.en); checkText(w, `terms[${i}].th`, x.th); });
    // Practice
    const pr = Array.isArray(c.practice) ? c.practice : [];
    if (pr.length < 12) add('error', w, 'practice_count', `แบบฝึกต้องมีอย่างน้อย 12 ข้อ (มี ${pr.length})`);
    const types = new Set(pr.map((p) => p.type));
    if (types.size < 6) add('error', w, 'practice_variety', `แบบฝึกต้องมีอย่างน้อย 6 รูปแบบ (มี ${[...types].join(', ')})`);
    if (!pr.some((p) => ['dialogue', 'context'].includes(p.type))) add('error', w, 'practice_context', 'ต้องมีข้อแบบบริบท (dialogue/context) อย่างน้อย 1');
    if (!pr.some((p) => ['fill', 'transform', 'error', 'order', 'write'].includes(p.type))) add('error', w, 'practice_production', 'ต้องมีข้อที่ผู้เรียน "สร้างภาษาเอง"');
    const seenQ = new Set();
    pr.forEach((p, i) => {
      items += 1;
      const wi = `item:${p.id || `${t.id}#${i}`}`;
      if (!p.id || !p.id.startsWith(`${t.id}-`)) add('error', wi, 'item_id', `id ต้องขึ้นต้นด้วย ${t.id}-`);
      if (ids.has(p.id)) add('error', wi, 'item_id_dup', 'id ซ้ำ'); ids.add(p.id);
      if (!QUESTION_TYPES.includes(p.type)) { add('error', wi, 'type', `type ไม่รู้จัก: ${p.type}`); return; }
      if (![1, 2, 3].includes(p.difficulty)) add('error', wi, 'difficulty', 'difficulty ต้องเป็น 1–3');
      checkText(wi, 'explainTh', p.explainTh);
      const key = canon(JSON.stringify([p.type, p.question || p.sentence || p.source || p.tokens || p.pairs || p.task]));
      if (seenQ.has(key)) add('error', wi, 'duplicate_item', 'ข้อซ้ำในหัวข้อเดียวกัน'); seenQ.add(key);
      const ctxLines = p.context && Array.isArray(p.context.lines) ? p.context.lines : [];
      ctxLines.forEach((l, j) => checkText(wi, `context.lines[${j}]`, l.text));
      switch (p.type) {
        case 'mc': case 'choose': case 'dialogue': case 'context': {
          const q = p.question || (ctxLines.find((l) => /_{2,}/.test(l.text)) || {}).text || '';
          if (p.type !== 'dialogue') checkText(wi, 'question', p.question);
          if ((p.type === 'dialogue' || p.type === 'context') && !ctxLines.length) add('error', wi, 'context_missing', `${p.type} ต้องมี context.lines`);
          checkChoices(wi, q, p.choices, p.answer);
          if (p.type === 'choose' && (p.choices || []).some((x) => String(x).trim().split(/\s+/).length < 3)) add('warn', wi, 'choose_short', 'choose ควรเป็นประโยคเต็ม');
          if (p.whyNot) Object.keys(p.whyNot).forEach((k) => { if (Number(k) === p.answer) add('error', wi, 'whynot_answer', 'whyNot อธิบายข้อที่เป็นคำตอบ'); });
          else add('warn', wi, 'whynot_missing', 'ควรมี whyNot อธิบายตัวลวง');
          break;
        }
        case 'fill': {
          checkText(wi, 'question', p.question);
          if (!/_{2,}/.test(p.question || '')) add('error', wi, 'fill_blank', 'fill ต้องมีช่องว่าง ___');
          if (!Array.isArray(p.accepted) || !p.accepted.length) add('error', wi, 'accepted', 'fill ต้องมี accepted');
          else p.accepted.forEach((a) => { checkText(wi, 'accepted', a); checkFilled(wi, p.question, a); });
          break;
        }
        case 'order':
          if (!Array.isArray(p.tokens) || p.tokens.length < 3) add('error', wi, 'tokens', 'order ต้องมี tokens อย่างน้อย 3');
          if (!Array.isArray(p.accepted) || !p.accepted.length) add('error', wi, 'accepted', 'order ต้องมี accepted');
          else {
            const bag = (s) => canon(s).replace(/[.!?,]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
            const tokBag = bag((p.tokens || []).join(' '));
            p.accepted.forEach((a) => { if (bag(a) !== tokBag) add('error', wi, 'order_tokens', `คำตอบ "${a}" ใช้คำไม่ตรงกับ tokens`); });
          }
          break;
        case 'error':
          checkText(wi, 'sentence', p.sentence);
          if (!p.errorPart || !String(p.sentence || '').includes(p.errorPart)) add('error', wi, 'error_part', 'error ต้องมี errorPart ที่อยู่ในประโยค');
          if (!Array.isArray(p.accepted) || !p.accepted.length) add('error', wi, 'accepted', 'error ต้องมี accepted (ประโยคที่แก้แล้ว)');
          else if (p.accepted.some((a) => canon(a) === canon(p.sentence))) add('error', wi, 'error_same', 'คำตอบเหมือนประโยคที่ผิด');
          break;
        case 'transform':
          checkText(wi, 'source', p.source); checkText(wi, 'instruction', p.instruction);
          if (!Array.isArray(p.accepted) || !p.accepted.length) add('error', wi, 'accepted', 'transform ต้องมี accepted');
          break;
        case 'match':
          if (!Array.isArray(p.pairs) || p.pairs.length < 3) add('error', wi, 'pairs', 'match ต้องมีอย่างน้อย 3 คู่');
          else {
            const rights = p.pairs.map((x) => canon(x[1]));
            if (new Set(rights).size !== rights.length) add('error', wi, 'pairs_dup', 'ฝั่งขวาซ้ำกัน (จับคู่ได้หลายแบบ)');
            p.pairs.forEach((x, k) => { checkText(wi, `pairs[${k}][0]`, x[0]); checkText(wi, `pairs[${k}][1]`, x[1]); });
          }
          break;
        case 'write':
          checkText(wi, 'task', p.task);
          if (!Array.isArray(p.checks) || !p.checks.length) add('error', wi, 'write_checks', 'write ต้องมี checks');
          else p.checks.forEach((ck, k) => { try { new RegExp(ck.re, ck.flags || 'i'); } catch (_) { add('error', wi, 'write_regex', `checks[${k}] regex ผิด`); } checkText(wi, `checks[${k}].msgTh`, ck.msgTh); });
          if (!p.sample) add('error', wi, 'write_sample', 'write ต้องมีตัวอย่างคำตอบ (sample)');
          else (p.checks || []).forEach((ck, k) => { try { if (!new RegExp(ck.re, ck.flags || 'i').test(p.sample)) add('error', wi, 'write_sample_fail', `ตัวอย่างคำตอบไม่ผ่าน checks[${k}]`); } catch (_) { /* แจ้งแล้ว */ } });
          break;
        default: break;
      }
      // คำตอบที่เป็นเฉลยต้องผ่านตัวตรวจคำตอบจริง (กันเฉลยพิมพ์ผิด / tokens ไม่ครบ / ตัวอย่างการเขียนไม่ผ่านกฎ)
      try {
        const { checkAnswer } = require('../../services/grammar/check');
        const key = ['mc', 'choose', 'dialogue', 'context'].includes(p.type) ? p.answer
          : p.type === 'match' ? (p.pairs || []).map((_, k) => k) : p.type === 'write' ? p.sample : (p.accepted || [])[0];
        const r = checkAnswer(p, key);
        if (!r.correct) add('error', wi, 'key_fails_checker', `เฉลยไม่ผ่านตัวตรวจ: ${JSON.stringify((r.detail && r.detail.issues) || r.yours).slice(0, 200)}`);
        if (p.type === 'fill' || p.type === 'transform' || p.type === 'error') {
          if (p.type === 'error' && checkAnswer(p, p.sentence).correct) add('error', wi, 'error_accepts_wrong', 'ประโยคที่ผิดกลับถูกนับว่าถูก');
        }
      } catch (err) { add('error', wi, 'checker_crash', String(err.message)); }
    });
  }
  return { items };
}

module.exports = { LEVELS, LEVEL_IDS, TOPICS, TOPIC_BY_ID, QUESTION_TYPES, TYPE_TH, CONTEXT_KINDS, getTopic, allItems, getItem, loadAll, reload, validateCurriculum };
