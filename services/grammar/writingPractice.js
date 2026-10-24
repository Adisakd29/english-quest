/*
  Writing Practice — เขียนเองแล้วได้ "คำอธิบาย" ไม่ใช่แค่แก้ให้
  โจทย์มาจากข้อแบบ write ของหลักสูตร (1 ข้อต่อหัวข้อ, ครบ A1–C1)
  ผลตรวจ: ข้อผิดตามกฎ + เหตุผลภาษาไทย + โครงสร้างของหัวข้อ + ตัวอย่างคำตอบ · บันทึกลง grammar_writings
  นับเป็นการฝึก (grammar_attempts source='writing') เพื่อให้ mastery / ทบทวน ใช้ข้อมูลเดียวกัน
*/
const pool = require('../../config/db');
const GC = require('../../data/grammar-curriculum');
const E = require('./engine');
const { checkWriting } = require('./writing');
const { grantOnce } = require('../../utils/exp');

const EXP_PER_PASS = 15; const MAX_LEN = 1500;

function promptView(it, stat) {
  const t = GC.TOPIC_BY_ID[it.topic];
  return {
    id: it.id, cefr: it.cefr, topicId: it.topic, topicTitle: t.title, topicTitleTh: t.titleTh,
    task: it.task, minSentences: it.minSentences || 1, expectTense: it.expectTense || null, difficulty: it.difficulty || 2,
    done: Boolean(stat && stat.done), passed: Boolean(stat && stat.passed),
  };
}

async function prompts(userId) {
  const items = GC.allItems().filter((it) => it.type === 'write');
  const rows = (await pool.query(
    'SELECT prompt_id, BOOL_OR(passed) AS passed, COUNT(*)::int AS n FROM grammar_writings WHERE user_id = $1 GROUP BY prompt_id', [userId])).rows;
  const stat = new Map(rows.map((r) => [r.prompt_id, { done: r.n > 0, passed: r.passed }]));
  const lvl = await E.grammarLevel(userId);
  return {
    level: lvl.cefr,
    prompts: items.map((it) => promptView(it, stat.get(it.id))),
    written: rows.reduce((a, r) => a + r.n, 0),
    passed: rows.filter((r) => r.passed).length,
  };
}

async function check(userId, promptId, text) {
  const it = GC.getItem(promptId);
  if (!it || it.type !== 'write') throw new E.GrammarError('NOT_FOUND', 'ไม่พบโจทย์นี้', 404);
  text = String(text == null ? '' : text).replace(/\r/g, '').trim();
  if (!text) throw new E.GrammarError('EMPTY', 'เขียนคำตอบก่อนส่งตรวจ');
  if (text.length > MAX_LEN) throw new E.GrammarError('TOO_LONG', `ยาวเกินไป (ไม่เกิน ${MAX_LEN} ตัวอักษร)`);
  const r = checkWriting(text, it);
  const t = GC.getTopic(it.topic) || {};
  const feedback = {
    passed: r.passed, sentences: r.sentences, words: r.words, issues: r.issues, strengths: r.strengths, note: r.note,
    sample: it.sample || null, explainTh: it.explainTh || null,
    structure: it.structure || (t.structure && t.structure.formula) || null,
    topic: { id: it.topic, title: GC.TOPIC_BY_ID[it.topic].title, titleTh: GC.TOPIC_BY_ID[it.topic].titleTh, cefr: it.cefr },
    // จุดที่มักผิดของหัวข้อนี้ — ช่วยให้เข้าใจ "ทำไม" ไม่ใช่แค่แก้
    mistakes: (t.mistakes || []).slice(0, 3),
  };
  const first = (await pool.query('SELECT 1 FROM grammar_writings WHERE user_id = $1 AND prompt_id = $2 AND passed LIMIT 1', [userId, it.id])).rowCount === 0;
  await pool.query('INSERT INTO grammar_writings (user_id, prompt_id, text, feedback, passed) VALUES ($1, $2, $3, $4, $5)',
    [userId, it.id, text, JSON.stringify(feedback), r.passed]);
  await E.recordAttempt(userId, it, r.passed, text, 'writing');
  // EXP บัญชีเดียวกัน: ครั้งแรกที่ผ่านโจทย์นี้เท่านั้น (exp_awards กันส่งซ้ำพร้อมกัน) · เพดานต่อวัน
  const g = r.passed && first ? await grantOnce(userId, `glw:${it.id}`, EXP_PER_PASS, { reason: 'grammar_writing' })
    : { gained: 0, levelInfo: null, leveledUp: false };
  return { ...feedback, exp: g.gained, levelInfo: g.levelInfo, leveledUp: g.leveledUp };
}

async function history(userId, limit = 20) {
  const rows = (await pool.query(
    'SELECT id, prompt_id, text, passed, feedback, created_at FROM grammar_writings WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])).rows;
  return {
    items: rows.map((r) => {
      const it = GC.getItem(r.prompt_id);
      return {
        id: Number(r.id), promptId: r.prompt_id, text: r.text, passed: r.passed, at: r.created_at,
        cefr: it ? it.cefr : null, topicTitle: it ? GC.TOPIC_BY_ID[it.topic].title : r.prompt_id,
        errors: ((r.feedback && r.feedback.issues) || []).filter((i) => i.severity === 'error').length,
      };
    }),
  };
}

module.exports = { prompts, check, history, MAX_LEN };
