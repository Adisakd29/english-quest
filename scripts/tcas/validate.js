#!/usr/bin/env node
/*
  v1.19.0 ตรวจโครงสร้างชุดข้อสอบ TCAS (TGAT1 / A-Level) ตาม docs/tcas/CONTENT_SPEC.md
  node scripts/tcas/validate.js <file.json> [...]   -> "OK" หรือรายการปัญหา (exit 1)
  ใช้ทั้งตอนแต่ง (ผู้เขียนตรวจเอง) และในชุดทดสอบ / ตอนเซิร์ฟเวอร์โหลด
*/
const fs = require('node:fs');

const BLUEPRINT = {
  tgat1: {
    total: 60,
    order: [['speaking', 'qr'], ['speaking', 'short_conv'], ['speaking', 'long_conv'], ['reading', 'text_completion'], ['reading', 'reading']],
    types: {
      qr: { section: 'speaking', groups: 10, items: [1], lines: [1, 3] },
      short_conv: { section: 'speaking', groups: 3, itemsTotal: 10, items: [3, 4], lines: [4, 8] },
      long_conv: { section: 'speaking', groups: 2, items: [5], lines: [10, 16] },
      text_completion: { section: 'reading', groups: 2, itemsTotal: 15, items: [7, 8], words: [110, 240] },
      reading: { section: 'reading', groups: 3, items: [5], words: [90, 215] },
    },
  },
  alevel: {
    total: 80,
    order: [['listening_speaking', 'short_conv'], ['listening_speaking', 'long_conv'], ['reading', 'ad'], ['reading', 'review'], ['reading', 'news'],
      ['reading', 'visual'], ['reading', 'article'], ['writing', 'text_completion'], ['writing', 'paragraph_org']],
    types: {
      short_conv: { section: 'listening_speaking', groups: 3, items: [4], lines: [6, 10] },
      long_conv: { section: 'listening_speaking', groups: 1, items: [8], lines: [16, 24] },
      ad: { section: 'reading', groups: 2, items: [4], words: [70, 200] },
      review: { section: 'reading', groups: 1, items: [5], words: [140, 300] },
      news: { section: 'reading', groups: 1, items: [5], words: [190, 340] },
      visual: { section: 'reading', groups: 2, items: [4], table: true },
      article: { section: 'reading', groups: 2, items: [7], words: [480, 630] },
      text_completion: { section: 'writing', groups: 3, items: [5], words: [140, 280] },
      paragraph_org: { section: 'writing', groups: 5, items: [1] },
    },
  },
  // v1.22.0 ก.พ. ภาค ก ภาษาอังกฤษ: 25 ข้อ 50 คะแนน — Conversation 5 · Structure 5 · Vocabulary 5 · Reading 10 (2 บทความ)
  kp: {
    total: 25,
    order: [['conversation', 'kp_conv'], ['structure', 'kp_structure'], ['vocabulary', 'kp_vocab'], ['reading', 'kp_reading']],
    types: {
      kp_conv: { section: 'conversation', groups: 5, items: [1], lines: [2, 6] },
      kp_structure: { section: 'structure', groups: 1, items: [5], noText: true, sentenceBlank: true },
      kp_vocab: { section: 'vocabulary', groups: 1, items: [5], noText: true },
      kp_reading: { section: 'reading', groups: 2, items: [5], words: [140, 300] },
    },
  },
  // v1.28.0 O-NET ม.6 ภาษาอังกฤษ (ข้อสอบฝึกต้นฉบับ): 80 ข้อ 5 ตัวเลือก · 4 สาระ (ภาษาเพื่อการสื่อสาร 43 · ภาษาและวัฒนธรรม 15 ·
  //   ภาษากับกลุ่มสาระอื่น 11 · ภาษากับชุมชนและโลก 11) ตามผังที่ สทศ. เปิดเผย (ปีการศึกษา 2563) · เวลา 90 นาที ตามตารางสอบ 2568 (Digital Testing)
  onet6: {
    total: 80, options: 5,
    order: [['communication', 'on_conv'], ['communication', 'on_notice'], ['communication', 'on_reading'],
      ['culture', 'on_structure'], ['culture', 'on_culture'], ['cross_curricular', 'on_academic'], ['community_world', 'on_visual'], ['community_world', 'on_world']],
    types: {
      on_conv: { section: 'communication', groups: 5, items: [3], lines: [4, 9] },
      on_notice: { section: 'communication', groups: 2, items: [4], words: [50, 160] },
      on_reading: { section: 'communication', groups: 4, itemsTotal: 20, items: [5], words: [150, 320] },
      on_structure: { section: 'culture', groups: 1, items: [8], noText: true },
      on_culture: { section: 'culture', groups: 1, items: [7], words: [180, 350] },
      on_academic: { section: 'cross_curricular', groups: 2, itemsTotal: 11, items: [5, 6], words: [180, 350] },
      on_visual: { section: 'community_world', groups: 1, items: [5], table: true },
      on_world: { section: 'community_world', groups: 1, items: [6], words: [180, 350] },
    },
  },
  // v1.28.0 CU-TEP (3 ทักษะ, ข้อสอบฝึกต้นฉบับ): 120 ข้อ 120 คะแนน — Listening 30 · Reading 60 · Writing (Error Identification) 30
  cutep: {
    total: 120,
    order: [['listening', 'cu_short'], ['listening', 'cu_long'], ['listening', 'cu_talk'], ['reading', 'cu_cloze'], ['reading', 'cu_passage'], ['writing', 'cu_error']],
    types: {
      cu_short: { section: 'listening', groups: 10, items: [1], lines: [2, 5], audio: true, blanks: false },
      cu_long: { section: 'listening', groups: 2, items: [5], lines: [10, 20], audio: true, blanks: false },
      cu_talk: { section: 'listening', groups: 2, items: [5], words: [220, 420], audio: true },
      cu_cloze: { section: 'reading', groups: 2, items: [10], words: [220, 420] },
      cu_passage: { section: 'reading', groups: 5, items: [8], words: [380, 680] },
      cu_error: { section: 'writing', groups: 3, items: [10], noText: true, errorId: true },
    },
  },
  // v1.28.0 TU-GET แบบกระดาษ (PBT, ข้อสอบฝึกต้นฉบับ): 100 ข้อ 1,000 คะแนน — Structure 25 (เติมประโยค ~13 + หาจุดผิด ~12) · Vocabulary 25 · Reading 50 (6 บทความ)
  tuget: {
    total: 100,
    order: [['structure', 'tu_sentence'], ['structure', 'tu_error'], ['vocabulary', 'tu_vocab'], ['reading', 'tu_reading']],
    types: {
      tu_sentence: { section: 'structure', groups: 1, items: [13], noText: true, sentenceBlank: true },
      tu_error: { section: 'structure', groups: 1, items: [12], noText: true, errorId: true },
      tu_vocab: { section: 'vocabulary', groups: 1, items: [25], noText: true },
      tu_reading: { section: 'reading', groups: 6, itemsTotal: 50, items: [8, 9], words: [330, 650] },
    },
  },
};
const SKILLS = new Set(['functional_language', 'social_response', 'vocabulary', 'grammar', 'connector', 'main_idea', 'detail', 'inference',
  'vocab_in_context', 'reference', 'purpose_tone', 'data_reading', 'coherence',
  'listening_gist', 'listening_detail', 'listening_inference', 'error_identification', 'culture']);   // v1.28.0
const SECTIONS = { tgat1: ['speaking', 'reading'], alevel: ['listening_speaking', 'reading', 'writing'], kp: ['conversation', 'structure', 'vocabulary', 'reading'],
  onet6: ['communication', 'culture', 'cross_curricular', 'community_world'], cutep: ['listening', 'reading', 'writing'], tuget: ['structure', 'vocabulary', 'reading'] };
const SET_PREFIX = { tgat1: 'TG1', alevel: 'AL', kp: 'KP', onet6: 'ON6', cutep: 'CU', tuget: 'TU' };
// v1.28.0 หาจุดผิด (Error Identification): stem มีส่วนขีดเส้นใต้ 4 ส่วน [[...]] เรียง A–D · options = ข้อความ 4 ส่วนนั้นตามลำดับ · answer = ส่วนที่ผิด
const ERR_SEG = /\[\[([^\]]+)\]\]/g;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const BLANK_RE = /___(\d+)___/g;
const THAI = /[฀-๿]/;
const BANNED = /\b(beer|wine|whisky|alcohol|casino|gambl|firework|sky lantern|lottery|cigarette|vape|dating|boyfriend|girlfriend)\b/i;

function validateSet(set) {
  const errs = [];
  const err = (m) => errs.push(m);
  const bp = BLUEPRINT[set.exam];
  if (!bp) return [`exam ต้องเป็น ${Object.keys(BLUEPRINT).join(' · ')} (ได้ ${set.exam})`];
  const NOPT = bp.options || 4;
  if (!/^(TG1|AL|KP|ON6|CU|TU)-S\d+$/.test(set.setId || '')) err(`setId ไม่ถูกรูปแบบ: ${set.setId}`);
  if (!String(set.setId).startsWith(`${SET_PREFIX[set.exam]}-`)) err('setId ไม่ตรงกับ exam');
  // v1.19.2 ระดับความยาก: 1 = มาตรฐาน (ใกล้เคียงข้อสอบจริง) · 2 = ท้าทาย (ยากกว่าข้อสอบจริง) · 3 = เข้มข้น (ใกล้ C1)
  if (![1, 2, 3].includes(set.level)) err('level ต้องเป็น 1 (มาตรฐาน) 2 (ท้าทาย) หรือ 3 (เข้มข้น)');
  if (set.original !== true) err('original ต้องเป็น true');
  if (!set.title || !THAI.test(set.title)) err('title ต้องเป็นภาษาไทย');
  const secIds = (set.sections || []).map((s) => s.id);
  if (JSON.stringify(secIds) !== JSON.stringify(SECTIONS[set.exam])) err(`ลำดับ section ต้องเป็น ${SECTIONS[set.exam].join(', ')} (ได้ ${secIds.join(', ')})`);

  const groups = (set.sections || []).flatMap((s) => (s.groups || []).map((g) => ({ ...g, _section: s.id })));
  // ลำดับชนิดกลุ่ม
  const seq = groups.map((g) => `${g._section}/${g.type}`);
  const wantSeq = []; bp.order.forEach(([s, t]) => { for (let i = 0; i < bp.types[t].groups; i += 1) wantSeq.push(`${s}/${t}`); });
  if (JSON.stringify(seq) !== JSON.stringify(wantSeq)) err(`ลำดับ/จำนวนกลุ่มไม่ตรง blueprint\n    ได้:   ${seq.join(' ')}\n    ต้อง: ${wantSeq.join(' ')}`);

  const itemIds = new Set(); const groupIds = new Set(); const answers = []; let total = 0; let expectItemNo = 1; let expectGroupNo = 1;
  const stems = new Set();
  for (const g of groups) {
    const spec = bp.types[g.type];
    const where = `กลุ่ม ${g.id || '?'} (${g.type})`;
    if (!spec) { err(`${where}: type ไม่รู้จัก`); continue; }
    if (g.id !== `${set.setId}-G${String(expectGroupNo).padStart(2, '0')}`) err(`${where}: id ควรเป็น ${set.setId}-G${String(expectGroupNo).padStart(2, '0')}`);
    expectGroupNo += 1;
    if (groupIds.has(g.id)) err(`${where}: id ซ้ำ`); groupIds.add(g.id);
    if (!g.instructionTh || !THAI.test(g.instructionTh)) err(`${where}: instructionTh ต้องเป็นภาษาไทย`);
    const items = g.items || [];
    if (!spec.items.includes(items.length)) err(`${where}: จำนวนข้อ ${items.length} (ต้อง ${spec.items.join(' หรือ ')})`);
    // เนื้อหา
    let body = '';
    if (/_conv$|^qr$|^cu_(short|long)$/.test(g.type)) {
      const d = g.dialogue || [];
      if (!Array.isArray(d) || !d.length) err(`${where}: ต้องมี dialogue`);
      if (spec.lines && (d.length < spec.lines[0] || d.length > spec.lines[1])) err(`${where}: บทสนทนา ${d.length} บรรทัด (ต้อง ${spec.lines[0]}–${spec.lines[1]})`);
      d.forEach((l, i) => { if (!l || !l.speaker || !l.text) err(`${where}: dialogue[${i}] ต้องมี speaker และ text`); });
      body = d.map((l) => l.text).join('\n');
    } else if (spec.noText) {
      // v1.22.0 ข้อเดี่ยว (Structure/Vocabulary ก.พ.): ไม่มีบทความ — โจทย์อยู่ใน stem ของแต่ละข้อ
      if (g.text || g.dialogue) err(`${where}: ชนิดนี้ไม่มี text/dialogue (โจทย์อยู่ใน stem)`);
      body = items.map((it) => it.stem).join('\n');
      items.forEach((it) => {
        if (!it.stem || it.stem.trim().split(/\s+/).length < 5) err(`${where} ข้อ ${it.id}: stem ต้องเป็นประโยคโจทย์ (≥ 5 คำ)`);
        if (spec.sentenceBlank && !/_{4,}/.test(it.stem || '')) err(`${where} ข้อ ${it.id}: Structure ต้องมีช่องว่าง ____ ในประโยค`);
        if (spec.errorId) {
          const segs = [...String(it.stem || '').matchAll(ERR_SEG)].map((m) => m[1].trim());
          if (segs.length !== 4) err(`${where} ข้อ ${it.id}: หาจุดผิดต้องมีส่วนขีดเส้นใต้ [[...]] 4 ส่วน (พบ ${segs.length})`);
          else if (JSON.stringify(segs) !== JSON.stringify((it.options || []).map((o) => String(o).trim()))) err(`${where} ข้อ ${it.id}: options ต้องเป็นข้อความ 4 ส่วนที่ขีดเส้นใต้ เรียงตามลำดับในประโยค`);
        }
      });
    } else {
      body = String(g.text || '');
      if (!body.trim()) err(`${where}: ต้องมี text`);
      if (spec.words) { const n = words(body.replace(BLANK_RE, 'x')); if (n < spec.words[0] || n > spec.words[1]) err(`${where}: ความยาว ${n} คำ (ต้อง ${spec.words[0]}–${spec.words[1]})`); }
    }
    if (spec.table) {
      const t = g.table;
      if (!t || !Array.isArray(t.columns) || t.columns.length < 2 || !Array.isArray(t.rows) || t.rows.length < 3) err(`${where}: ต้องมี table (columns ≥ 2, rows ≥ 3)`);
      else t.rows.forEach((r, i) => { if (!Array.isArray(r) || r.length !== t.columns.length) err(`${where}: table.rows[${i}] จำนวนช่องไม่ตรง columns`); });
    }
    if (BANNED.test(body) || items.some((it) => BANNED.test(`${it.stem} ${(it.options || []).join(' ')}`))) err(`${where}: มีหัวข้อต้องห้าม (แอลกอฮอล์/การพนัน/พลุ/โคมลอย/คู่รัก ฯลฯ)`);
    // ช่องว่าง
    const blanks = [...body.matchAll(BLANK_RE)].map((m) => Number(m[1]));
    const blankItems = items.filter((it) => it.blank !== undefined).map((it) => Number(it.blank));
    if (new Set(blanks).size !== blanks.length) err(`${where}: เลขช่องว่างซ้ำในเนื้อหา`);
    const sortedB = [...blanks].sort((a, b) => a - b); const sortedI = [...blankItems].sort((a, b) => a - b);
    if (JSON.stringify(sortedB) !== JSON.stringify(sortedI)) err(`${where}: ช่องว่างในเนื้อหา [${sortedB}] ไม่ตรงกับข้อที่อ้าง blank [${sortedI}]`);
    if (spec.audio && blanks.length) err(`${where}: ข้อฟังไม่มีช่องว่างในบท (คำถามอยู่ใน stem)`);
    if (spec.audio) items.forEach((it) => { if (!it.stem || it.stem.trim().split(/\s+/).length < 3) err(`${where} ข้อ ${it.id}: ข้อฟังต้องมีคำถามใน stem`); });
    if (/^(cu_cloze)$/.test(g.type) && blankItems.length !== items.length) err(`${where}: cloze ทุกข้อต้องเติมช่องว่าง (blank)`);
    if (/^on_conv$/.test(g.type) && blankItems.length !== items.length) err(`${where}: on_conv ทุกข้อต้องเติมช่องว่างในบทสนทนา (blank)`);
    if (/_conv$|^qr$|^text_completion$/.test(g.type) && !/^(on_conv)$/.test(g.type) && blankItems.length !== items.length) err(`${where}: ทุกข้อในชนิดนี้ต้องเติมช่องว่าง (blank)`);
    if (g.type === 'qr' && blanks.length !== 1) err(`${where}: qr ต้องมีช่องว่าง 1 ช่อง`);
    // v1.19.2 รูปแบบ Q-R แบบข้อสอบจริง: Q = คำถาม/ประโยคสั้น 1 บรรทัด · R = ช่องว่างล้วน · ตัวเลือกสั้น
    if (g.type === 'qr') {
      const dl = g.dialogue || [];
      if (dl.length !== 2 || dl[0].speaker !== 'Q' || dl[1].speaker !== 'R') err(`${where}: qr ต้องเป็น 2 บรรทัด Q: … / R: ___1___`);
      else {
        if (!/^___\d+___$/.test(String(dl[1].text).trim())) err(`${where}: บรรทัด R ต้องเป็นช่องว่างอย่างเดียว`);
        const qw = String(dl[0].text).trim().split(/\s+/).length;
        if (qw < 3 || qw > 18) err(`${where}: Q ควรยาว 3–18 คำ (ได้ ${qw})`);
        if (BLANK_RE.test(dl[0].text)) err(`${where}: บรรทัด Q ห้ามมีช่องว่าง`);
        BLANK_RE.lastIndex = 0;
      }
      (items[0] && items[0].options || []).forEach((o) => { const w = String(o).trim().split(/\s+/).length; if (w > 12) err(`${where}: ตัวเลือก Q-R ควรสั้น ≤ 12 คำ (ได้ ${w}: "${o}")`); });
    }
    if (g.type === 'paragraph_org') {
      const labels = [...body.matchAll(/(^|\n)\s*\(?([A-E])[).]\s+\S/g)].map((m) => m[2]);
      if (labels.length < 4 || labels.length > 5) err(`${where}: ต้องมีประโยค A–D หรือ A–E ใน text (พบ ${labels.length})`);
      (items[0] && items[0].options || []).forEach((o) => { if (!/^[A-E](\s*[–-]\s*[A-E]){3,4}$/.test(String(o).trim())) err(`${where}: ตัวเลือกต้องเป็นลำดับ เช่น "B – D – A – C" (ได้ "${o}")`); });
    }
    for (const it of items) {
      const w = `${where} ข้อ ${it.id || '?'}`;
      total += 1;
      if (it.id !== `${set.setId}-${String(expectItemNo).padStart(3, '0')}`) err(`${w}: id ควรเป็น ${set.setId}-${String(expectItemNo).padStart(3, '0')}`);
      expectItemNo += 1;
      if (itemIds.has(it.id)) err(`${w}: id ซ้ำ`); itemIds.add(it.id);
      if (typeof it.stem !== 'string') err(`${w}: stem ต้องเป็นข้อความ (ว่างได้)`);
      if (!it.stem && it.blank === undefined) err(`${w}: ไม่มีทั้ง stem และ blank`);
      if (it.stem && it.stem.length > 12) { const k = it.stem.toLowerCase().replace(/\W+/g, ' ').trim(); if (stems.has(k) && !/^(what|which) (is|does|can)/.test(k)) err(`${w}: stem ซ้ำกับข้ออื่น`); stems.add(k); }
      const o = it.options;
      if (!Array.isArray(o) || o.length !== NOPT || o.some((x) => typeof x !== 'string' || !x.trim())) err(`${w}: ต้องมีตัวเลือก ${NOPT} ข้อที่ไม่ว่าง`);
      else {
        const norm = o.map((x) => x.trim().toLowerCase().replace(/[.!?]+$/, ''));
        if (new Set(norm).size !== NOPT && !spec.errorId) err(`${w}: ตัวเลือกซ้ำกัน`);
        if (o.some((x) => /all of the above|none of the above|both a and b/i.test(x))) err(`${w}: ห้ามใช้ all/none of the above`);
      }
      if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer > NOPT - 1) err(`${w}: answer ต้องเป็น 0–${NOPT - 1}`);
      else answers.push(it.answer);
      if (!SKILLS.has(it.skill)) err(`${w}: skill ไม่รู้จัก (${it.skill})`);
      if (!it.explanationTh || !THAI.test(it.explanationTh) || it.explanationTh.length < 15) err(`${w}: explanationTh ต้องเป็นภาษาไทยที่อธิบายจริง`);
    }
  }
  if (spectotal(bp) !== bp.total) err('BLUEPRINT ภายในไม่สอดคล้อง');
  if (total !== bp.total) err(`จำนวนข้อทั้งหมด ${total} (ต้อง ${bp.total})`);
  // ผลรวมของชนิดที่กำหนด itemsTotal
  for (const [t, spec] of Object.entries(bp.types)) {
    if (!spec.itemsTotal) continue;
    const n = groups.filter((g) => g.type === t).reduce((a, g) => a + (g.items || []).length, 0);
    if (n !== spec.itemsTotal) err(`${t}: รวม ${n} ข้อ (ต้อง ${spec.itemsTotal})`);
  }
  // คำตอบที่ถูกเป็นตัวเลือกที่ยาวที่สุดอย่างชัดเจน (ยาวกว่าอันดับสอง ≥ 15%) เกิน 35% ของข้อในส่วนนั้น = เดาจากความยาวได้
  //   ไม่นับข้อเติมคำศัพท์/ไวยากรณ์ (text_completion) และเรียงประโยค (ตัวเลือกเป็นลำดับ ความยาวเท่ากัน)
  for (const sec of (set.sections || [])) {
    const its = (sec.groups || []).filter((g) => !['text_completion', 'paragraph_org', 'cu_cloze', 'cu_error', 'tu_error', 'tu_sentence', 'tu_vocab', 'on_structure'].includes(g.type)).flatMap((g) => g.items || []);
    if (its.length < 6) continue;
    const longest = its.filter((it) => {
      if (!Array.isArray(it.options) || it.options.length !== NOPT || !Number.isInteger(it.answer)) return false;
      const lens = it.options.map((o) => String(o).length);
      const k = lens[it.answer]; const rest = Math.max(...lens.filter((_, i) => i !== it.answer));
      return k > rest * 1.15;
    });
    if (longest.length / its.length > 0.35) err(`${sec.id}: คำตอบที่ถูกยาวที่สุดชัดเจน ${longest.length}/${its.length} ข้อ (เกิน 35% — เดาจากความยาวได้): ${longest.map((x) => x.id).join(', ')}`);
  }
  // การกระจายตัวเลือกที่ถูก
  if (answers.length) {
    const c = new Array(NOPT).fill(0); answers.forEach((a) => { c[a] += 1; });
    const lo = NOPT === 5 ? 0.13 : 0.17; const hi = NOPT === 5 ? 0.27 : 0.33;
    c.forEach((n, i) => { const p = n / answers.length; if (p < lo || p > hi) err(`ตัวเลือกที่ถูกไม่กระจาย: ${'ABCDE'[i]} = ${(p * 100).toFixed(0)}% (ต้อง ${Math.round(lo * 100)}–${Math.round(hi * 100)}%)`); });
    let run = 1; for (let i = 1; i < answers.length; i += 1) { run = answers[i] === answers[i - 1] ? run + 1 : 1; if (run >= 4) { err(`คำตอบ ${'ABCDE'[answers[i]]} ติดกัน ${run} ข้อ (ข้อที่ ${i + 1})`); break; } }
  }
  return errs;
}
function spectotal(bp) {
  return Object.values(bp.types).reduce((a, s) => a + (s.itemsTotal || s.groups * s.items[0]), 0);
}

/** ตรวจข้ามชุด: บรรทัดบทสนทนา/คำถามซ้ำกันระหว่างชุด (นักเรียนที่ทำหลายชุดจะได้คำตอบฟรี) */
function crossCheck(sets) {
  const seen = new Map(); const errs = [];
  for (const set of sets) {
    for (const s of set.sections || []) for (const g of s.groups || []) {
      const lines = [...(g.dialogue || []).map((l) => l.text), ...(g.items || []).map((it) => it.stem)];
      for (const t of lines) {
        const k = String(t || '').toLowerCase().replace(/___\d+___/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (k.length < 24 || /^(which|what|according to|the word|in the passage|it can be inferred)/.test(k)) continue;
        const prev = seen.get(k);
        if (prev && prev !== set.setId) errs.push(`${g.id}: ข้อความซ้ำกับชุด ${prev} — "${String(t).slice(0, 60)}"`);
        else seen.set(k, set.setId);
      }
    }
  }
  return errs;
}

module.exports = { validateSet, crossCheck, BLUEPRINT, SECTIONS };

if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('ใช้: node scripts/tcas/validate.js <file.json> [...]'); process.exit(2); }
  let bad = 0;
  for (const f of files) {
    let set;
    try { set = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log(`${f}: JSON เสีย — ${e.message}`); bad += 1; continue; }
    const errs = validateSet(set);
    if (errs.length) { bad += 1; console.log(`${f}: ${errs.length} ปัญหา`); errs.forEach((e) => console.log(`  - ${e}`)); } else console.log(`${f}: OK`);
  }
  if (files.length > 1) {
    const all = files.map((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } }).filter(Boolean);
    const x = crossCheck(all);
    if (x.length) { bad += 1; console.log(`ข้ามชุด: ${x.length} ปัญหา`); x.forEach((e) => console.log(`  - ${e}`)); } else console.log('ข้ามชุด: OK');
  }
  process.exit(bad ? 1 : 0);
}
