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

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
  'determiner', 'exclamation', 'number', 'modal verb', 'auxiliary verb',
  'phrasal verb', 'idiom', 'collocation', 'fixed expression', 'discourse marker']);
const SOURCES = new Set(['OXFORD_3000', 'OXFORD_5000_ADDITIONAL', 'C2_BANK']);
// ตัวกรองเฉพาะ C2
const KINDS = new Set(['word', 'sense', 'collocation', 'phrasal', 'idiom', 'fixed', 'colloquial']);
const TIERS = new Set(['core', 'extended']);
const REGISTERS = new Set(['formal', 'neutral', 'informal', 'academic', 'professional', 'literary']);
// C2 ที่ยังไม่ผ่านการตรวจอัตโนมัติ/คนตรวจ ไม่แสดงต่อผู้เรียน
const C2_VISIBLE = "(s.cefr <> 'C2' OR s.verification_status IN ('autoChecked', 'reviewed'))";
const STATUSES = new Set(['new', 'learning', 'reviewing', 'mastered']);
const MASTERED_DAYS = 21;
const PAGE_SIZE = 30;

const STATUS_SQL = `CASE
    WHEN wp.id IS NULL THEN 'new'
    WHEN wp.status <> 'known' AND (NOT wp.ever_known OR COALESCE(wp.srs_reps, 0) = 0) THEN 'learning'
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
    // C2 (null สำหรับ A1–C1)
    displayForm: r.display_form || null,
    kind: r.kind || null,
    tier: r.tier || null,
    register: r.register || null,
  };
}

const BASE_FROM = `FROM vocab_senses s
  JOIN vocab_entries e ON e.id = s.entry_id
  LEFT JOIN word_progress wp ON wp.user_id = $1 AND wp.word_id = s.public_id`;
const BASE_COLS = `s.public_id, e.headword, e.homograph_no, s.sense_label, s.pos, s.cefr, s.source_list,
  s.thai_meaning, s.translation_status, s.translation_note, s.ipa, s.simple_definition,
  s.example_sentence, s.display_order, s.source_raw_entry, s.display_form, s.kind, s.tier, s.register,
  ${STATUS_SQL} AS user_status`;

// รายละเอียด C2 สำหรับหน้าเรียน/ค้นหา — ไม่ส่งเฉลยคำถาม (q) ออกไป
function c2Detail(r) {
  const c = r.c2 || {};
  return {
    meaningTH: c.meaningTH, meaningEN: c.meaningEN, usageNoteTH: c.usageNoteTH,
    register: r.register, connotation: r.connotation, variant: r.variant, tier: r.tier, priority: r.real_world_priority,
    ipaUK: c.ipaUK, ipaUS: c.ipaUS, collocations: r.collocations || [], antonyms: r.antonyms || [],
    nearSynonyms: c.nearSynonyms || [], wordFamily: c.wordFamily || [], commonMistakes: c.commonMistakes || [],
    confusedWith: c.confusedWith || [], topics: c.topics || [],
    literalTH: c.literalTH, naturalTH: c.naturalTH, unnaturalTH: c.unnaturalTH, separable: c.separable,
    baseLemma: c.baseLemma, baseMeaningTH: c.baseMeaningTH, baseSenseId: r.base_sense_id,
  };
}

/* ==========================================================
   GET /vocab/search?q=&level=&pos=&status=&source=&page=
   ========================================================== */
router.get('/search', async (req, res) => {
  try {
    const params = [req.userId];
    const where = ['NOT s.is_supplemental', 's.public_id IS NOT NULL', C2_VISIBLE];

    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 40);
    if (q) {
      // ค้นได้ทั้งคำอังกฤษ (ขึ้นต้นด้วย) และคำแปลไทย (มีคำนี้อยู่)
      params.push(`${escapeLike(q)}%`, `%${escapeLike(q)}%`);
      // C2: ค้นในวลี (display form) · ความหมายไทยเต็ม · collocation · synonym ได้ด้วย
      where.push(`(e.normalized LIKE $${params.length - 1} OR s.thai_meaning ILIKE $${params.length}
        OR (s.cefr = 'C2' AND (s.display_form ILIKE $${params.length} OR s.c2->>'meaningTH' ILIKE $${params.length}
          OR array_to_string(s.collocations, '|') ILIKE $${params.length}
          OR array_to_string(s.synonyms, '|') ILIKE $${params.length})))`);
    }
    const kind = String(req.query.kind || '');
    if (KINDS.has(kind)) { params.push(kind); where.push(`s.kind = $${params.length}`); }
    const tier = String(req.query.tier || '');
    if (TIERS.has(tier)) { params.push(tier); where.push(`s.tier = $${params.length}`); }
    const register = String(req.query.register || '');
    if (REGISTERS.has(register)) { params.push(register); where.push(`s.register = $${params.length}`); }
    const topic = String(req.query.topic || '').toLowerCase();
    if (/^[a-z-]{2,24}$/.test(topic)) { params.push(topic); where.push(`(s.topic = $${params.length} OR $${params.length} = ANY(s.tags))`); }
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
    // (แทนเงื่อนไขระดับด้วยเงื่อนไขที่จริงเสมอ แต่ยังอ้างพารามิเตอร์ไว้ — เลขพารามิเตอร์จึงไม่เลื่อน)
    const whereNoLevel = where.map((w) => (/^s\.cefr = \$\d+$/.test(w) ? `(${w.slice(9)}::text IS NULL OR TRUE)` : w));
    const paramsNoLevel = params;
    const countSql = `SELECT s.cefr, count(*)::int AS n ${BASE_FROM} WHERE ${whereNoLevel.join(' AND ')} GROUP BY s.cefr`;
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
    const { rows } = await pool.query(
      `SELECT ${BASE_COLS}, s.entry_id, s.synonyms, s.antonyms, s.collocations, s.connotation, s.variant,
              s.real_world_priority, s.c2, s.base_sense_id
         ${BASE_FROM} WHERE s.public_id = $2 AND ${C2_VISIBLE}`, [req.userId, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบคำนี้' });
    const r = rows[0];
    // ความหมายอื่น: sense อื่นของคำที่สะกดเหมือนกัน (รวมคำพ้องรูปต่างเลข เช่น close1 / close2)
    const others = await pool.query(
      `SELECT ${BASE_COLS} ${BASE_FROM}
        WHERE e.normalized = (SELECT normalized FROM vocab_entries WHERE id = $2)
          AND e.headword = (SELECT headword FROM vocab_entries WHERE id = $2)
          AND s.public_id <> $3 AND NOT s.is_supplemental AND ${C2_VISIBLE}
        ORDER BY e.homograph_no NULLS FIRST, s.cefr, s.display_order`,
      [req.userId, r.entry_id, id]
    );
    res.json({
      ...shape(r), synonyms: r.synonyms || [], sourceRawEntry: r.source_raw_entry,
      otherSenses: others.rows.map(shape),
      c2: r.cefr === 'C2' ? c2Detail(r) : null,
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
