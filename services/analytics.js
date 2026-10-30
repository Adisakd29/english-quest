/*
  Learning Analytics (Premium Dashboard) — วิเคราะห์ 6 ทักษะจากข้อมูลการเรียนจริงของผู้ใช้
    Vocabulary · Grammar · Listening · Reading · Speaking · Writing
  หลักการ:
  - แยก 3 อย่างออกจากกันเสมอ: EXP (ปริมาณกิจกรรม) · Mastery Score (ความแม่นยำ 30 วัน) · CEFR Estimate (จากแบบวัดระดับ/Mock เท่านั้น)
    ห้ามแปลง EXP เป็นระดับ CEFR
  - คะแนนทักษะ = ความแม่นยำ 30 วันแบบปรับด้วยค่าตั้งต้น (กันตอบน้อยข้อแล้วได้ 100%) · ตอบน้อยกว่า MIN_N ข้อ = "ข้อมูลยังน้อย"
  - Speaking มาจากการรู้จำเสียงของเบราว์เซอร์ (หน้าเว็บส่งคะแนนมา) → บอกตรง ๆ ว่าเป็นคะแนนฝึก ไม่ใช่ผลประเมินการออกเสียง
  - userId จาก token เท่านั้น
*/
const pool = require('../config/db');

const MIN_N = 8;
const PRIOR = 0.6; const PRIOR_N = 10;
const smooth = (ok, n) => (ok + PRIOR * PRIOR_N) / (n + PRIOR_N);
const pct = (x) => (x == null ? null : Math.round(x * 100));
const band = (score) => (score == null ? 'few' : score < 60 ? 'weak' : score < 80 ? 'ok' : 'strong');
const SKILL = {
  vocab: { th: 'คำศัพท์', en: 'Vocabulary', icon: 'book-open', go: 'learn' },
  grammar: { th: 'ไวยากรณ์', en: 'Grammar', icon: 'languages', go: 'grammar' },
  listening: { th: 'การฟัง', en: 'Listening', icon: 'headphones', go: 'toeic' },
  reading: { th: 'การอ่าน', en: 'Reading', icon: 'library', go: 'toeic-p7' },
  speaking: { th: 'การพูด', en: 'Speaking', icon: 'mic', go: 'speak' },
  writing: { th: 'การเขียน', en: 'Writing', icon: 'pencil-line', go: 'grammar-writing' },
};

/** ความแม่นยำจาก answer_events (+ grammar_attempts สำหรับไวยากรณ์) แยก 30 วัน / 7 วันล่าสุด / 7 วันก่อนหน้า */
async function accuracyRows(userId) {
  const { rows } = await pool.query(
    `WITH ev AS (
       SELECT skill, correct, created_at FROM answer_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       UNION ALL
       SELECT 'grammar', correct, created_at FROM grammar_attempts WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days' AND correct IS NOT NULL
     )
     SELECT skill,
            COUNT(*)::int AS n, COUNT(*) FILTER (WHERE correct)::int AS ok,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS n7,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days' AND correct)::int AS ok7,
            COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '7 days' AND created_at > NOW() - INTERVAL '14 days')::int AS np,
            COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '7 days' AND created_at > NOW() - INTERVAL '14 days' AND correct)::int AS okp
       FROM ev GROUP BY skill`, [userId]);
  return Object.fromEntries(rows.map((r) => [r.skill, r]));
}
function fromAcc(r) {
  if (!r || r.n < MIN_N) return { score: null, answered: r ? r.n : 0, accuracy: r && r.n ? pct(r.ok / r.n) : null, trend: null };
  let trend = null;
  if (r.n7 >= 5 && r.np >= 5) { const d = r.ok7 / r.n7 - r.okp / r.np; trend = d >= 0.08 ? 'up' : d <= -0.08 ? 'down' : 'flat'; }
  return { score: pct(smooth(r.ok, r.n)), answered: r.n, accuracy: pct(r.ok / r.n), trend };
}

async function skills(userId) {
  const acc = await accuracyRows(userId);
  const q = (sql, p = [userId]) => pool.query(sql, p).then((r) => r.rows[0]).catch(() => ({}));
  const [wp, gl, sp, wr] = await Promise.all([
    q(`SELECT COUNT(*) FILTER (WHERE status = 'known' OR ever_known)::int AS passed, COUNT(*) FILTER (WHERE status = 'known')::int AS mastered,
              COUNT(*) FILTER (WHERE (status = 'known' OR ever_known) AND (srs_due_at IS NULL OR srs_due_at <= NOW()))::int AS due
         FROM word_progress WHERE user_id = $1`),
    q(`SELECT COUNT(*) FILTER (WHERE lesson_completed_at IS NOT NULL OR completed_at IS NOT NULL)::int AS done,
              COUNT(*) FILTER (WHERE mastered_at IS NOT NULL)::int AS mastered,
              (SELECT COUNT(*)::int FROM grammar_reviews r WHERE r.user_id = $1 AND r.due_at <= NOW() AND r.mastered_at IS NULL) AS due
         FROM grammar_lessons WHERE user_id = $1`),
    q(`SELECT COUNT(*)::int AS n, ROUND(AVG(GREATEST(COALESCE(best_speak, 0), COALESCE(best_type, 0))))::int AS avg,
              COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '30 days')::int AS n30
         FROM speaking_progress WHERE user_id = $1`),
    q(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE passed)::int AS ok FROM grammar_writings WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'`),
  ]);
  const out = {};
  out.vocab = { ...fromAcc(acc.vocab), detail: { passed: wp.passed || 0, mastered: wp.mastered || 0, due: wp.due || 0 } };
  out.grammar = { ...fromAcc(acc.grammar), detail: { lessonsDone: gl.done || 0, mastered: gl.mastered || 0, due: gl.due || 0 } };
  out.listening = { ...fromAcc(acc.listening) };
  out.reading = { ...fromAcc(acc.reading) };
  out.speaking = { score: (sp.n || 0) >= 5 ? sp.avg : null, answered: sp.n || 0, accuracy: null, trend: null, selfReported: true };
  out.writing = { score: (wr.n || 0) >= 3 ? pct(smooth(wr.ok, wr.n)) : null, answered: wr.n || 0, accuracy: wr.n ? pct(wr.ok / wr.n) : null, trend: null };
  return Object.entries(SKILL).map(([id, meta]) => ({ id, ...meta, ...out[id], status: band(out[id].score) }));
}

/** ระดับ CEFR โดยประมาณ — จากแบบวัดระดับ และ TOEIC Full Mock เท่านั้น (ไม่ใช้ EXP) */
async function cefrEstimates(userId) {
  const [pl, fm] = await Promise.all([
    pool.query(`SELECT result, completed_at FROM placement_attempts WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`, [userId]).catch(() => ({ rows: [] })),
    pool.query(`SELECT result, finished_at FROM toeic_full_tests WHERE user_id = $1 AND status = 'finished' ORDER BY finished_at DESC LIMIT 1`, [userId]).catch(() => ({ rows: [] })),
  ]);
  const out = [];
  const p = pl.rows[0];
  if (p && p.result) out.push({ source: 'placement', th: 'แบบวัดระดับ (คำศัพท์ + ไวยากรณ์)', at: p.completed_at, overall: p.result.overall, parts: { vocab: p.result.vocab, grammar: p.result.grammar } });
  const f = fm.rows[0];
  if (f && f.result) out.push({ source: 'toeic-full', th: 'TOEIC Full Mock (ประมาณการ)', at: f.finished_at, parts: { listening: f.result.listening && f.result.listening.cefr, reading: f.result.reading && f.result.reading.cefr } });
  return out;
}

/** กิจกรรมรายวัน 14 วัน (คำตอบ · ความแม่นยำ · EXP แยกกัน) */
async function weekly(userId) {
  const { rows } = await pool.query(
    `WITH d AS (SELECT generate_series((NOW() AT TIME ZONE 'Asia/Bangkok')::date - 13, (NOW() AT TIME ZONE 'Asia/Bangkok')::date, '1 day')::date AS day),
          a AS (SELECT (created_at AT TIME ZONE 'Asia/Bangkok')::date AS day, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE correct)::int AS ok
                  FROM answer_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '15 days' GROUP BY 1),
          e AS (SELECT (created_at AT TIME ZONE 'Asia/Bangkok')::date AS day, SUM(amount)::int AS exp
                  FROM exp_log WHERE user_id = $1 AND created_at > NOW() - INTERVAL '15 days' GROUP BY 1)
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(a.n, 0) AS answered, COALESCE(a.ok, 0) AS correct, COALESCE(e.exp, 0) AS exp
       FROM d LEFT JOIN a ON a.day = d.day LEFT JOIN e ON e.day = d.day ORDER BY d.day`, [userId]);
  const sum = (xs, k) => xs.reduce((s, r) => s + r[k], 0);
  const thisW = rows.slice(7); const lastW = rows.slice(0, 7);
  return { days: rows, thisWeek: { answered: sum(thisW, 'answered'), exp: sum(thisW, 'exp'), activeDays: thisW.filter((r) => r.answered > 0).length },
    lastWeek: { answered: sum(lastW, 'answered'), exp: sum(lastW, 'exp'), activeDays: lastW.filter((r) => r.answered > 0).length } };
}

/** คิวทบทวน — สิ่งที่ถึงเวลาทบทวนจริงตอนนี้ */
async function revisionQueue(userId, sk) {
  const v = sk.find((s) => s.id === 'vocab').detail; const g = sk.find((s) => s.id === 'grammar').detail;
  const q = [];
  if (v.due) q.push({ id: 'vocab-due', th: `ทบทวนคำศัพท์ที่ถึงกำหนด ${v.due} คำ`, why: 'ตอบถูกอีกครั้งตามกำหนด = ขยับสู่ "ชำนาญ"', action: 'due-review' });
  if (g.due) q.push({ id: 'grammar-due', th: `ทบทวนไวยากรณ์ที่ถึงกำหนด ${g.due} ข้อ`, why: 'ข้อที่เคยพลาด/ใกล้ลืม', go: 'grammar-practice' });
  const tm = await pool.query(
    `SELECT COUNT(*)::int AS n FROM (SELECT DISTINCT ON (a.question_id) a.is_correct FROM toeic_answers a JOIN toeic_sessions s ON s.id = a.session_id
       WHERE a.user_id = $1 AND (a.mode = 'practice' OR s.status = 'finished') ORDER BY a.question_id, a.created_at DESC, a.id DESC) t WHERE NOT is_correct`, [userId]).catch(() => ({ rows: [{ n: 0 }] }));
  if (tm.rows[0].n) q.push({ id: 'toeic-mistakes', th: `ข้อ TOEIC ที่ยังตอบผิดอยู่ ${tm.rows[0].n} ข้อ`, why: 'ดูจุดอ่อนรายทักษะแล้วฝึกเฉพาะจุด', go: 'toeic-weak' });
  const wk = await pool.query(`SELECT COUNT(*) FILTER (WHERE streak < 2)::int AS n FROM work_progress WHERE user_id = $1`, [userId]).catch(() => ({ rows: [{ n: 0 }] }));
  if (wk.rows[0].n) q.push({ id: 'work', th: `วลีภาษาอังกฤษเพื่อการทำงานที่ยังไม่ชำนาญ ${wk.rows[0].n} วลี`, why: 'ฝึกให้ถูกติดกัน 2 ครั้ง', go: 'work' });
  return q;
}

/** คำแนะนำ 3 อย่าง (กฎตรงไปตรงมา อธิบายได้) */
function recommend(sk, queue, cefr) {
  const recs = [];
  const due = queue.find((x) => x.id === 'vocab-due');
  if (due) recs.push({ th: due.th, why: due.why, action: 'due-review' });
  const measured = sk.filter((s) => s.score != null && !s.selfReported).sort((a, b) => a.score - b.score);
  if (measured[0] && measured[0].score < 80) recs.push({ th: `ฝึก${measured[0].th}เพิ่ม (${measured[0].score}/100 — ต่ำสุดในทักษะที่มีข้อมูล)`, why: 'ทักษะที่อ่อนที่สุดได้ประโยชน์จากการฝึกมากที่สุด', go: measured[0].go });
  const untried = sk.filter((s) => !s.answered);
  if (untried[0]) recs.push({ th: `เริ่มฝึก${untried[0].th}`, why: 'ยังไม่มีข้อมูลทักษะนี้ — ลองสักชุดเพื่อให้วิเคราะห์ได้ครบ', go: untried[0].go });
  if (!cefr.some((c) => c.source === 'placement')) recs.push({ th: 'ทำแบบวัดระดับ', why: 'ใช้ประมาณระดับ CEFR (EXP ไม่ได้บอกระดับภาษา)', go: 'placement' });
  return recs.slice(0, 3);
}

/** ข้อมูลแดชบอร์ด — สมาชิกได้ครบ · ผู้ใช้ทั่วไปได้คะแนน 6 ทักษะ (ส่วนวิเคราะห์ละเอียดล็อก) */
async function dashboard(userId, access) {
  const sk = await skills(userId);
  const u = (await pool.query('SELECT exp FROM users WHERE id = $1', [userId])).rows[0] || { exp: 0 };
  const base = { skills: sk.map((s) => ({ id: s.id, th: s.th, en: s.en, icon: s.icon, score: s.score, status: s.status, answered: s.answered, selfReported: Boolean(s.selfReported) })),
    exp: { total: u.exp }, minAnswers: MIN_N, locked: !access };
  if (!access) return base;
  const [cefr, wk] = await Promise.all([cefrEstimates(userId), weekly(userId)]);
  const queue = await revisionQueue(userId, sk);
  return { ...base, skills: sk, cefr, weekly: wk, exp: { total: u.exp, thisWeek: wk.thisWeek.exp }, queue, recommendations: recommend(sk, queue, cefr) };
}

module.exports = { dashboard, skills, _internal: { smooth, band, MIN_N } };
