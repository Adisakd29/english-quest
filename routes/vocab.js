const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { escapeLike } = require('../utils/security');
const { WORD_ID_RE } = require('../utils/vocabContent');

/*
  Vocabulary Browser — ค้นหา/กรองคำศัพท์ Oxford และดูรายละเอียดแต่ละ sense

  สถานะของผู้เรียนต่อคำ:
    new        ยังไม่เคยเจอ
    learning   เคยเจอ แต่ยังตอบถูกติดกันไม่ถึงเกณฑ์
    reviewing  รู้แล้ว แต่ช่วงทบทวน < 21 วัน (ความจำยังไม่ถาวร)
    mastered   รู้แล้ว และช่วงทบทวน >= 21 วัน
*/
const router = express.Router();
router.use(authRequired);

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
  'determiner', 'exclamation', 'number', 'modal verb', 'auxiliary verb']);
const SOURCES = new Set(['OXFORD_3000', 'OXFORD_5000_ADDITIONAL']);
const STATUSES = new Set(['new', 'learning', 'reviewing', 'mastered']);
const MASTERED_DAYS = 21;
const PAGE_SIZE = 30;

const STATUS_SQL = `CASE
    WHEN wp.id IS NULL THEN 'new'
    WHEN wp.status <> 'known' THEN 'learning'
    WHEN COALESCE(wp.srs_interval, 0) >= ${MASTERED_DAYS} THEN 'mastered'
    ELSE 'reviewing' END`;

// คำแปลที่ยังไม่ผ่านการตรวจและถูก flag — แสดงได้ แต่บอกผู้เรียนตรง ๆ ว่ารอตรวจ
function shape(r) {
  return {
    id: r.public_id,
    headword: r.headword,
    homograph: r.homograph_no,
    senseLabel: r.sense_label,
    pos: r.pos,
    cefr: r.cefr,
    sourceList: r.source_list,
    thai: r.thai_meaning,
    thaiPending: Boolean(r.translation_note) && r.translation_status !== 'reviewed',
    thaiReviewed: r.translation_status === 'reviewed',
    ipa: r.ipa,
    definition: r.simple_definition,
    example: r.example_sentence,
    status: r.user_status,
    order: r.display_order,
    sourceRawEntry: r.source_raw_entry,
  };
}

const BASE_FROM = `FROM vocab_senses s
  JOIN vocab_entries e ON e.id = s.entry_id
  LEFT JOIN word_progress wp ON wp.user_id = $1 AND wp.word_id = s.public_id`;
const BASE_COLS = `s.public_id, e.headword, e.homograph_no, s.sense_label, s.pos, s.cefr, s.source_list,
  s.thai_meaning, s.translation_status, s.translation_note, s.ipa, s.simple_definition,
  s.example_sentence, s.display_order, s.source_raw_entry, ${STATUS_SQL} AS user_status`;

/* ==========================================================
   GET /vocab/search?q=&level=&pos=&status=&source=&page=
   ========================================================== */
router.get('/search', async (req, res) => {
  try {
    const params = [req.userId];
    const where = ['NOT s.is_supplemental', 's.public_id IS NOT NULL'];

    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 40);
    if (q) {
      // ค้นได้ทั้งคำอังกฤษ (ขึ้นต้นด้วย) และคำแปลไทย (มีคำนี้อยู่)
      params.push(`${escapeLike(q)}%`, `%${escapeLike(q)}%`);
      where.push(`(e.normalized LIKE $${params.length - 1} OR s.thai_meaning ILIKE $${params.length})`);
    }
    const level = String(req.query.level || '').toUpperCase();
    if (LEVELS.includes(level)) { params.push(level); where.push(`s.cefr = $${params.length}`); }
    const pos = String(req.query.pos || '');
    if (POS.has(pos)) { params.push(pos); where.push(`s.pos = $${params.length}`); }
    const source = String(req.query.source || '');
    if (SOURCES.has(source)) { params.push(source); where.push(`s.source_list = $${params.length}`); }
    const status = String(req.query.status || '');
    if (STATUSES.has(status)) { params.push(status); where.push(`${STATUS_SQL} = $${params.length}`); }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    // จำนวนต่อระดับตามตัวกรองอื่น (ยกเว้นระดับ) — ใช้แสดงบนชิประดับ
    const levelIdx = where.findIndex((w) => w.startsWith('s.cefr ='));
    const whereNoLevel = where.filter((_, i) => i !== levelIdx);
    const paramsNoLevel = levelIdx === -1 ? params : params.filter((p) => p !== level);
    const renumber = (sql) => { let n = 0; return sql.replace(/\$\d+/g, () => `$${++n}`); };
    const countSql = renumber(`SELECT s.cefr, count(*)::int AS n ${BASE_FROM} WHERE ${whereNoLevel.join(' AND ')} GROUP BY s.cefr`);
    const [counts, total, rows] = await Promise.all([
      pool.query(countSql, paramsNoLevel),
      pool.query(`SELECT count(*)::int AS n ${BASE_FROM} ${whereSql}`, params),
      pool.query(
        `SELECT ${BASE_COLS} ${BASE_FROM} ${whereSql}
          ORDER BY (e.normalized = $${params.length + 1}) DESC, s.cefr, s.display_order
          LIMIT ${PAGE_SIZE} OFFSET $${params.length + 2}`,
        [...params, q, (page - 1) * PAGE_SIZE]
      ),
    ]);
    const byLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
    counts.rows.forEach((r) => { byLevel[r.cefr] = r.n; });
    res.json({ total: total.rows[0].n, page, pageSize: PAGE_SIZE, countsByLevel: byLevel, words: rows.rows.map(shape) });
  } catch (err) {
    console.error('[vocab/search]', err);
    res.status(500).json({ error: 'ค้นหาคำศัพท์ไม่สำเร็จ' });
  }
});

/* ==========================================================
   GET /vocab/:id — รายละเอียด sense + ความหมายอื่นของคำเดียวกัน
   ========================================================== */
router.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!WORD_ID_RE.test(id)) return res.status(400).json({ error: 'รหัสคำไม่ถูกต้อง' });
    const { rows } = await pool.query(`SELECT ${BASE_COLS}, s.entry_id, s.synonyms ${BASE_FROM} WHERE s.public_id = $2`, [req.userId, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบคำนี้' });
    const r = rows[0];
    // ความหมายอื่น: sense อื่นของคำที่สะกดเหมือนกัน (รวมคำพ้องรูปต่างเลข เช่น close1 / close2)
    const others = await pool.query(
      `SELECT ${BASE_COLS} ${BASE_FROM}
        WHERE e.normalized = (SELECT normalized FROM vocab_entries WHERE id = $2)
          AND e.headword = (SELECT headword FROM vocab_entries WHERE id = $2)
          AND s.public_id <> $3 AND NOT s.is_supplemental
        ORDER BY e.homograph_no NULLS FIRST, s.cefr, s.display_order`,
      [req.userId, r.entry_id, id]
    );
    res.json({
      ...shape(r), synonyms: r.synonyms || [], sourceRawEntry: r.source_raw_entry,
      otherSenses: others.rows.map(shape),
    });
  } catch (err) {
    console.error('[vocab/detail]', err);
    res.status(500).json({ error: 'โหลดรายละเอียดคำไม่สำเร็จ' });
  }
});

/* ==========================================================
   POST /vocab/:id/rate { rating: 'know' | 'unsure' | 'dont_know' }
   การประเมินตัวเอง — ไม่ให้ EXP และ "ไม่" เปลี่ยนสถานะเป็นรู้แล้ว
   (เซิร์ฟเวอร์ตรวจไม่ได้ว่ารู้จริง ถ้าให้ผลตอบแทนจะเปิดช่องปั๊ม EXP/ปลดล็อก Unit)
   ใช้ปรับตารางทบทวนเท่านั้น
   ========================================================== */
const RATING_DAYS = { dont_know: 0, unsure: 1, know: 3 };
router.post('/:id/rate', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!WORD_ID_RE.test(id)) return res.status(400).json({ error: 'รหัสคำไม่ถูกต้อง' });
    const rating = String((req.body || {}).rating || '');
    if (!(rating in RATING_DAYS)) return res.status(400).json({ error: 'การประเมินไม่ถูกต้อง' });
    const { rows } = await pool.query('SELECT cefr FROM vocab_senses WHERE public_id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบคำนี้' });

    const days = RATING_DAYS[rating];
    // ไม่รู้ = กลับไปเรียน (ลดเป็น learning ได้ — ผู้เรียนบอกเองว่าลืม) · รู้/ไม่แน่ใจ = ไม่แตะสถานะ
    await pool.query(
      `INSERT INTO word_progress (user_id, word_id, level, status, srs_due_at)
       VALUES ($1, $2, $3, 'learning', NOW() + make_interval(days => $4::int))
       ON CONFLICT (user_id, word_id) DO UPDATE SET
         srs_due_at = NOW() + make_interval(days => $4::int),
         status = CASE WHEN $5 THEN 'learning' ELSE word_progress.status END,
         srs_reps = CASE WHEN $5 THEN 0 ELSE word_progress.srs_reps END`,
      [req.userId, id, rows[0].cefr, days, rating === 'dont_know']
    );
    res.json({ ok: true, rating, reviewInDays: days, gainedExp: 0 });
  } catch (err) {
    console.error('[vocab/rate]', err);
    res.status(500).json({ error: 'บันทึกการประเมินไม่สำเร็จ' });
  }
});

module.exports = router;
