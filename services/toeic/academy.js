/*
  TOEIC Academy (v1.10.0 Phase 4) — บทเรียนกลยุทธ์ 7 Part (data/toeic/academy/lessons.json · เขียนขึ้นเองสำหรับ EnglishQuest)
  รูปแบบข้อสอบจริง · ชนิดคำถาม · กับดัก · ขั้นตอนทำ · การคุมเวลา · วลีที่พบบ่อย · คำถามเช็กความเข้าใจกลยุทธ์ 3 ข้อ
  ความคืบหน้า: อ่านจบ + ตอบคำถามเช็ก (ตรวจที่เซิร์ฟเวอร์) · ไม่ให้ EXP/Coin
*/
const path = require('path');
const pool = require('../../config/db');
const { ToeicError } = require('./part1');

const LESSONS = require(path.join(__dirname, '../../data/toeic/academy/lessons.json'));
const NAV = { 1: 'toeic-p1', 2: 'toeic-p2', 3: 'toeic-p3', 4: 'toeic-p4', 5: 'toeic-p5', 6: 'toeic-p6', 7: 'toeic-p7' };

async function doneMap(userId) {
  const { rows } = await pool.query('SELECT part, check_score, completed_at FROM toeic_academy_progress WHERE user_id = $1', [userId]);
  return new Map(rows.map((r) => [r.part, r]));
}
async function list(userId) {
  const done = await doneMap(userId);
  return {
    lessons: LESSONS.map((l) => ({ part: l.part, section: l.section, title: l.title, titleTh: l.titleTh, summaryTh: l.summaryTh, format: l.format,
      done: done.has(l.part), checkScore: done.has(l.part) ? done.get(l.part).check_score : null })),
    doneCount: done.size, total: LESSONS.length,
    exam: { questions: 200, minutes: 120, listeningMinutes: 45, readingMinutes: 75 },
  };
}
function lessonOf(part) {
  const l = LESSONS.find((x) => x.part === Number(part));
  if (!l) throw new ToeicError('NOT_FOUND', 'ไม่พบบทเรียนนี้', 404);
  return l;
}
async function get(userId, part) {
  const l = lessonOf(part);
  const done = (await doneMap(userId)).get(l.part);
  // คำถามเช็ก: ไม่ส่งเฉลย/คำอธิบายก่อนตอบ
  return { ...l, check: l.check.map((c) => ({ q: c.q, options: c.options })), nav: NAV[l.part], done: Boolean(done),
    checkScore: done ? done.check_score : null, next: LESSONS.find((x) => x.part === l.part + 1) ? l.part + 1 : null };
}
/** ส่งคำตอบคำถามเช็ก { answers: [i,i,i] } → ผล + คำอธิบาย · บันทึกว่าเรียนจบ (เก็บคะแนนดีที่สุด) */
async function check(userId, part, body = {}) {
  const l = lessonOf(part);
  const answers = Array.isArray(body.answers) ? body.answers : null;
  if (!answers || answers.length !== l.check.length) throw new ToeicError('BAD_ANSWERS', `ต้องตอบให้ครบ ${l.check.length} ข้อ`, 400);
  const results = l.check.map((c, i) => ({ chosen: Number.isInteger(answers[i]) ? answers[i] : null, answer: c.answer, correct: answers[i] === c.answer, whyTh: c.whyTh }));
  const score = results.filter((r) => r.correct).length;
  await pool.query(
    `INSERT INTO toeic_academy_progress (user_id, part, check_score) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, part) DO UPDATE SET check_score = GREATEST(toeic_academy_progress.check_score, EXCLUDED.check_score)`, [userId, l.part, score]);
  return { part: l.part, score, total: l.check.length, results };
}

module.exports = { list, get, check, LESSONS };
