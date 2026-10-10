const express = require('express');
const pool = require('../config/db');
const { authRequired, requireAdmin } = require('../middleware/auth');
const wordStore = require('../utils/wordStore');
const { escapeLike } = require('../utils/security');
const { TOPIC_IDS, TOPICS } = require('../utils/curriculum');
const { invalidateUnits } = require('./path');
const { WORD_ID_RE } = require('../utils/vocabContent');

/*
  หน้าผู้ดูแล: ตรวจ/แก้เนื้อหาคำศัพท์ในฐาน Oxford (vocab_senses)
  - คำแปลที่ AI สร้างและ "ไม่มั่นใจ" (flag) อยู่ในตัวกรอง "ต้องตรวจ"
  - แก้ไข/ยืนยันแล้ว -> HUMAN_REVIEWED + ล้าง flag -> ใช้ในแบบทดสอบได้ทันที
  - ทุกการแก้ไขบันทึกใน content_edits (ใคร/เมื่อไหร่/ก่อน/หลัง)
*/
const router = express.Router();

// ป้องกันทั้ง router ในจุดเดียว — ไม่มี endpoint ไหนหลุดสิทธิ์ได้แม้ลืมใส่ทีหลัง
router.use(authRequired, requireAdmin);

/* ==========================================================
   รายงานผู้ใช้ (Social Safety) — ทำงานได้ทุกโหมดคำศัพท์ จึงวางก่อนตัวกรองโหมด Oxford
   GET  /admin/reports?status=open|reviewed|dismissed
   POST /admin/reports/:id { status: 'reviewed' | 'dismissed' }
   ========================================================== */
router.get('/reports', async (req, res) => {
  try {
    const status = ['open', 'reviewed', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
    const { rows } = await pool.query(
      `SELECT r.id, r.reason, r.details, r.status, r.created_at,
              rp.username AS reporter, rd.username AS reported, rd.id AS reported_id,
              (SELECT count(*)::int FROM user_reports x WHERE x.reported_id = r.reported_id) AS total_reports
         FROM user_reports r JOIN users rp ON rp.id = r.reporter_id JOIN users rd ON rd.id = r.reported_id
        WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT 100`, [status]
    );
    const open = await pool.query("SELECT count(*)::int AS n FROM user_reports WHERE status = 'open'");
    res.json({ reports: rows, openCount: open.rows[0].n });
  } catch (err) {
    console.error('[admin/reports]', err);
    res.status(500).json({ error: 'โหลดรายงานไม่สำเร็จ' });
  }
});
router.post('/reports/:id', async (req, res) => {
  try {
    const status = (req.body || {}).status;
    if (!['reviewed', 'dismissed'].includes(status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
    const r = await pool.query(
      'UPDATE user_reports SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3 RETURNING id',
      [status, req.userId, Number(req.params.id) || 0]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'ไม่พบรายงาน' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/reports/update]', err);
    res.status(500).json({ error: 'อัปเดตรายงานไม่สำเร็จ' });
  }
});

// หน้า Admin แก้ได้เฉพาะฐาน Oxford (โหมด legacy เป็นโหมดย้อนกลับฉุกเฉิน แสดงผลอย่างเดียว)
router.use(async (_req, res, next) => {
  await wordStore.ready();
  if (wordStore.getVocabSource() !== 'oxford') {
    return res.status(503).json({ error: 'หน้าผู้ดูแลใช้ได้เมื่อระบบใช้คำศัพท์ Oxford เท่านั้น' });
  }
  next();
});

const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);
const PAGE_SIZE = 30;
const LIMITS = { thai: 255, ipa: 128, definition: 500, example: 500 };
const POS_ABBR = {
  noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.', preposition: 'prep.',
  conjunction: 'conj.', determiner: 'det.', exclamation: 'exclam.', number: 'number',
  'modal verb': 'modal v.', 'auxiliary verb': 'aux. v.',
};

// สถานะสำหรับหน้าเว็บ: auto = ยังไม่ตรวจ (AI) · reviewed = คนตรวจแล้ว
const uiStatus = (s) => (s === 'reviewed' ? 'reviewed' : 'auto');

/* ==========================================================
   GET /admin/stats
   ========================================================== */
router.get('/stats', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE translation_status <> 'reviewed')::int AS auto,
             COUNT(*) FILTER (WHERE translation_status = 'reviewed')::int AS reviewed,
             COUNT(*) FILTER (WHERE translation_status = 'reviewed' AND thai_meaning IS NOT NULL)::int AS with_thai,
             COUNT(*) FILTER (WHERE translation_note IS NOT NULL AND translation_status <> 'reviewed')::int AS risky
        FROM vocab_senses WHERE NOT is_supplemental`);
    const edits = await pool.query('SELECT COUNT(*)::int AS n FROM content_edits');
    res.json({ ...rows[0], edits: edits.rows[0].n, topics: TOPICS.map((t) => ({ id: t.id, th: t.th })) });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ error: 'โหลดสถิติไม่สำเร็จ' });
  }
});

/* ==========================================================
   GET /admin/words?status=auto|reviewed|flagged&level=A1&q=bank&sort=risky&page=1
   sort=risky: คำที่ flag ก่อน แล้วเรียงระดับต้นก่อน (ใช้บ่อย + ไม่มั่นใจ = ตรวจก่อน)
   ========================================================== */
router.get('/words', async (req, res) => {
  try {
    const params = [];
    const where = ['NOT s.is_supplemental'];
    const status = String(req.query.status || '');
    if (status === 'reviewed') where.push("s.translation_status = 'reviewed'");
    else if (status === 'auto') where.push("s.translation_status <> 'reviewed'");
    else if (status === 'flagged') where.push("s.translation_note IS NOT NULL AND s.translation_status <> 'reviewed'");

    const level = String(req.query.level || '').toUpperCase();
    if (VALID_LEVELS.has(level)) { params.push(level); where.push(`s.cefr = $${params.length}`); }
    const q = String(req.query.q || '').trim().slice(0, 40);
    if (q) { params.push(`%${escapeLike(q.toLowerCase())}%`); where.push(`e.normalized LIKE $${params.length}`); }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const order = req.query.sort === 'risky'
      ? '(s.translation_note IS NULL), s.cefr, s.display_order'
      : 's.cefr, s.display_order';
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const from = 'FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id';
    const countRes = await pool.query(`SELECT COUNT(*)::int AS n ${from} ${whereSql}`, params);
    params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const { rows } = await pool.query(
      `SELECT s.public_id, e.headword, e.homograph_no, s.sense_label, s.pos, s.cefr, s.source_list,
              s.source_raw_entry, s.thai_meaning, s.translation_status, s.translation_source, s.translation_note,
              s.ipa, s.simple_definition, s.example_sentence, s.synonyms, s.sense_count, s.topic, s.updated_at
         ${from} ${whereSql} ORDER BY ${order}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      total: countRes.rows[0].n, page, pageSize: PAGE_SIZE,
      words: rows.map((r) => ({
        id: r.public_id,
        word: `${r.headword}${r.homograph_no ? `(${r.homograph_no})` : ''}${r.sense_label ? ` (${r.sense_label})` : ''}`,
        pos: POS_ABBR[r.pos] || r.pos || '—', category: r.pos || '—', level: r.cefr,
        sourceList: r.source_list, sourceRawEntry: r.source_raw_entry,
        thai: r.thai_meaning, ipa: r.ipa, definition: r.simple_definition, example: r.example_sentence,
        synonyms: r.synonyms || [], status: uiStatus(r.translation_status),
        translationSource: r.translation_source, flagNote: r.translation_note,
        senseCount: r.sense_count, topic: r.topic, updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('[admin/words]', err);
    res.status(500).json({ error: 'โหลดรายการคำไม่สำเร็จ' });
  }
});

// บันทึกประวัติ + โหลดคำศัพท์ใหม่ให้ flashcard ใช้ทันที
async function afterWrite(client, id, editorId, before, after, topicChanged) {
  await client.query(
    'INSERT INTO content_edits (word_id, editor_id, before_data, after_data) VALUES ($1, $2, $3, $4)',
    [id, editorId, before, after]
  );
  return async () => {
    await wordStore.reload();
    if (topicChanged) invalidateUnits();
  };
}

/* ==========================================================
   PATCH /admin/words/:id — แก้เนื้อหา -> ตรวจแล้ว (HUMAN_REVIEWED) + ล้าง flag
   ส่งเฉพาะช่องที่ต้องการแก้: { thai, ipa, definition, example, topic }  ("" = ลบค่า)
   ========================================================== */
router.patch('/words/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!WORD_ID_RE.test(id)) return res.status(400).json({ error: 'รหัสคำไม่ถูกต้อง' });

  const body = req.body || {};
  const colMap = { thai: 'thai_meaning', ipa: 'ipa', definition: 'simple_definition', example: 'example_sentence' };
  const fields = {};
  for (const key of Object.keys(colMap)) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== 'string') {
      return res.status(400).json({ error: `ข้อมูลช่อง ${key} ไม่ถูกต้อง` });
    }
    const value = (body[key] || '').trim();
    if (value.length > LIMITS[key]) return res.status(400).json({ error: `ช่อง ${key} ยาวเกิน ${LIMITS[key]} ตัวอักษร` });
    fields[key] = value === '' ? null : value;
  }
  let topic;
  if (body.topic !== undefined) {
    if (typeof body.topic !== 'string' || !TOPIC_IDS.has(body.topic)) {
      return res.status(400).json({ error: 'หัวข้อไม่ถูกต้อง' });
    }
    topic = body.topic;
  }
  if (Object.keys(fields).length === 0 && topic === undefined) {
    return res.status(400).json({ error: 'ไม่มีข้อมูลที่จะแก้ไข' });
  }

  const client = await pool.connect();
  let refresh = null;
  try {
    await client.query('BEGIN');
    const before = await client.query(
      `SELECT thai_meaning, ipa, simple_definition, example_sentence, translation_status,
              translation_source, translation_note, topic
         FROM vocab_senses WHERE public_id = $1 FOR UPDATE`, [id]
    );
    if (before.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ไม่พบคำนี้' }); }

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(fields)) { params.push(v); sets.push(`${colMap[k]} = $${params.length}`); }
    if (topic !== undefined) { params.push(topic); sets.push(`topic = $${params.length}`); }
    // แก้เนื้อหา = คนตรวจแล้ว · แก้แค่หัวข้อ ไม่ถือว่าตรวจคำแปล
    if (Object.keys(fields).length > 0) {
      sets.push("translation_status = 'reviewed'", "translation_source = 'HUMAN_REVIEWED'", 'translation_note = NULL');
      if (fields.definition !== undefined) sets.push("definition_source = 'ORIGINAL'");
    }
    params.push(id);
    const after = await client.query(
      `UPDATE vocab_senses SET ${sets.join(', ')}, updated_at = NOW() WHERE public_id = $${params.length}
       RETURNING thai_meaning, ipa, simple_definition, example_sentence, translation_status, translation_source, topic`,
      params
    );
    refresh = await afterWrite(client, id, req.userId, before.rows[0], after.rows[0], topic !== undefined);
    await client.query('COMMIT');
    await refresh();
    const r = after.rows[0];
    res.json({ ok: true, content: { ...r, thai: r.thai_meaning, status: uiStatus(r.translation_status), definition_en: r.simple_definition } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[admin/patch]', err);
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

/* ==========================================================
   POST /admin/words/:id/approve — ยืนยันว่าคำแปล AI ถูกแล้ว (ไม่ต้องแก้)
   ========================================================== */
router.post('/words/:id/approve', async (req, res) => {
  const id = String(req.params.id || '');
  if (!WORD_ID_RE.test(id)) return res.status(400).json({ error: 'รหัสคำไม่ถูกต้อง' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      `SELECT translation_status, translation_source, translation_note FROM vocab_senses
        WHERE public_id = $1 AND translation_status <> 'reviewed' AND thai_meaning IS NOT NULL FOR UPDATE`, [id]
    );
    if (before.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'ไม่พบคำนี้ ยังไม่มีคำแปล หรือยืนยันไปแล้ว' });
    }
    await client.query(
      `UPDATE vocab_senses SET translation_status = 'reviewed', translation_source = 'HUMAN_REVIEWED',
              translation_note = NULL, updated_at = NOW() WHERE public_id = $1`, [id]
    );
    const refresh = await afterWrite(client, id, req.userId, before.rows[0],
      { translation_status: 'reviewed', translation_source: 'HUMAN_REVIEWED' }, false);
    await client.query('COMMIT');
    await refresh();
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[admin/approve]', err);
    res.status(500).json({ error: 'ยืนยันไม่สำเร็จ' });
  } finally {
    client.release();
  }
});

/* ==========================================================
   GET /admin/words/:id/history
   ========================================================== */
router.get('/words/:id/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ce.created_at, ce.before_data, ce.after_data, u.username AS editor
         FROM content_edits ce LEFT JOIN users u ON u.id = ce.editor_id
        WHERE ce.word_id = $1 ORDER BY ce.created_at DESC LIMIT 20`,
      [String(req.params.id || '')]
    );
    res.json({ history: rows });
  } catch (err) {
    console.error('[admin/history]', err);
    res.status(500).json({ error: 'โหลดประวัติไม่สำเร็จ' });
  }
});

module.exports = router;
