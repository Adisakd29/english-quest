/*
  Admin — C2 Content Audit  (/api/admin/c2 · ต้องเป็นผู้ดูแล: ผูกใต้ routes/admin.js)
    GET   /audit?issue=&status=&kind=&tier=&q=&page=   รายการพร้อมปัญหาจาก validator (กรอง/แบ่งหน้าฝั่งเซิร์ฟเวอร์)
    GET   /metrics                                      สรุปคลัง C2 + ข้อที่ผู้เรียนตอบผิดบ่อย (ข้อที่อาจกำกวม)
    PATCH /:id                                          แก้เนื้อหา → ตรวจซ้ำด้วย validator → ตั้งสถานะ (reviewed ได้เมื่อไม่มี error)
  ทุกการแก้บันทึกใน content_edits (ประวัติเดียวกับคำศัพท์ A1–C1)
*/
const express = require('express');
const pool = require('../config/db');
const V = require('../scripts/c2/validate');
const { escapeLike } = require('../utils/security');

const router = express.Router();
const PAGE_SIZE = 30;
const ID_RE = /^C2-S\d{4,6}$/;
// ประเภทปัญหา → รูปแบบข้อความใน verification_issues (ผลของ validator)
const ISSUE_RE = {
  ambiguous: 'หลายข้อ|synonym|ตัวเลือกซ้ำ|คำตอบถูกอยู่ในตัวลวง',
  duplicate: 'ซ้ำ',
  example: 'example|context',
  thai: 'ไทย|meaningTH|shortMeaningTH|exampleTH|U\\+FFFD|control',
  collocation: 'collocation',
  meta: 'pos |register|tier|cefr|realWorldPriority|frequencyBand|difficulty|source',
};
const EDITABLE = {
  shortMeaningTH: 'text', meaningTH: 'text', usageNoteTH: 'text', meaningEN: 'text', example: 'text', exampleTH: 'text',
  register: 'enum', connotation: 'enum', tier: 'enum', realWorldPriority: 'int', collocations: 'list',
};

/** แถว DB → รูปแบบต้นฉบับ (schema ของ batch-*.json) เพื่อตรวจซ้ำด้วย validator ตัวเดียวกัน */
function entryFromRow(r) {
  const c = r.c2 || {};
  return {
    key: r.c2_key, lemma: c.lemma, displayForm: r.display_form, pos: r.pos, kind: r.kind, senseTag: c.senseTag,
    baseLemma: c.baseLemma, baseMeaningTH: c.baseMeaningTH, meaningEN: c.meaningEN, meaningTH: c.meaningTH,
    shortMeaningTH: r.thai_meaning, usageNoteTH: c.usageNoteTH, register: r.register, connotation: r.connotation,
    frequencyBand: r.frequency_band, realWorldPriority: r.real_world_priority, tier: r.tier, difficulty: r.difficulty,
    ipaUK: c.ipaUK, ipaUS: c.ipaUS, variant: r.variant, example: r.example_sentence, exampleTH: r.example_translation,
    collocations: r.collocations || [], synonyms: r.synonyms || [], nearSynonyms: c.nearSynonyms || [], antonyms: r.antonyms || [],
    wordFamily: c.wordFamily || [], commonMistakes: c.commonMistakes || [], confusedWith: c.confusedWith || [],
    topics: c.topics || [], tags: (r.tags || []).filter((t) => ['rare', 'literary', 'archaic', 'specialist', 'figurative', 'business', 'academic', 'UK', 'US'].includes(t)),
    context: c.context, literalTH: c.literalTH, naturalTH: c.naturalTH, unnaturalTH: c.unnaturalTH, separable: c.separable,
    q: c.q || {}, sourceType: c.sourceType, sourceReference: c.sourceReference,
  };
}
const view = (r) => ({
  id: r.public_id, form: r.display_form, headword: r.headword, pos: r.pos, kind: r.kind, tier: r.tier, register: r.register,
  connotation: r.connotation, priority: r.real_world_priority, status: r.verification_status, short: r.thai_meaning,
  meaningTH: (r.c2 || {}).meaningTH, usageNoteTH: (r.c2 || {}).usageNoteTH, meaningEN: (r.c2 || {}).meaningEN,
  example: r.example_sentence, exampleTH: r.example_translation, collocations: r.collocations || [],
  issues: r.verification_issues || { errors: [], warnings: [] }, reviewedAt: r.reviewed_at, updatedAt: r.updated_at,
});
const COLS = `s.public_id, s.c2_key, e.headword, s.display_form, s.pos, s.kind, s.tier, s.register, s.connotation, s.real_world_priority,
  s.frequency_band, s.difficulty, s.variant, s.verification_status, s.verification_issues, s.thai_meaning, s.example_sentence,
  s.example_translation, s.collocations, s.synonyms, s.antonyms, s.tags, s.c2, s.reviewed_at, s.updated_at`;

router.get('/audit', async (req, res) => {
  try {
    const params = []; const where = ["s.cefr = 'C2'"];
    const status = String(req.query.status || '');
    if (V.STATUSES.includes(status)) { params.push(status); where.push(`s.verification_status = $${params.length}`); }
    const issue = String(req.query.issue || '');
    if (issue === 'errors') where.push("jsonb_array_length(COALESCE(s.verification_issues->'errors', '[]'::jsonb)) > 0");
    else if (issue === 'warnings') where.push("jsonb_array_length(COALESCE(s.verification_issues->'warnings', '[]'::jsonb)) > 0");
    else if (issue === 'thai-missing') where.push("(s.thai_meaning IS NULL OR s.thai_meaning = '' OR COALESCE(s.c2->>'meaningTH', '') = '')");
    else if (issue === 'colloc-missing') where.push('COALESCE(array_length(s.collocations, 1), 0) < 2');
    else if (ISSUE_RE[issue]) { params.push(ISSUE_RE[issue]); where.push(`s.verification_issues::text ~* $${params.length}`); }
    const kind = String(req.query.kind || '');
    if (V.KINDS.includes(kind)) { params.push(kind); where.push(`s.kind = $${params.length}`); }
    const tier = String(req.query.tier || '');
    if (V.TIERS.includes(tier)) { params.push(tier); where.push(`s.tier = $${params.length}`); }
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 40);
    if (q) { params.push(`%${escapeLike(q)}%`); where.push(`(lower(s.display_form) LIKE $${params.length} OR s.thai_meaning ILIKE $${params.length})`); }
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const from = 'FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id';
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await pool.query(`SELECT count(*)::int AS n ${from} ${whereSql}`, params)).rows[0].n;
    const rows = (await pool.query(
      `SELECT ${COLS} ${from} ${whereSql}
        ORDER BY (s.verification_status = 'unverified') DESC, jsonb_array_length(COALESCE(s.verification_issues->'warnings', '[]'::jsonb)) DESC, s.display_order
        LIMIT ${PAGE_SIZE} OFFSET $${params.length + 1}`, [...params, (page - 1) * PAGE_SIZE])).rows;
    res.json({ total, page, pageSize: PAGE_SIZE, items: rows.map(view) });
  } catch (err) {
    console.error('[admin/c2/audit]', err);
    res.status(500).json({ error: 'โหลดรายการ C2 ไม่สำเร็จ' });
  }
});

router.get('/metrics', async (_req, res) => {
  try {
    const by = async (col) => Object.fromEntries((await pool.query(
      `SELECT COALESCE(${col}::text, '-') AS k, count(*)::int AS n FROM vocab_senses WHERE cefr = 'C2' GROUP BY 1 ORDER BY 1`)).rows.map((r) => [r.k, r.n]));
    const [status, kind, tier, register] = [await by('verification_status'), await by('kind'), await by('tier'), await by('register')];
    const totals = (await pool.query(`SELECT count(*)::int AS senses, count(DISTINCT entry_id)::int AS entries,
        count(*) FILTER (WHERE jsonb_array_length(COALESCE(verification_issues->'warnings', '[]'::jsonb)) > 0)::int AS with_warnings,
        count(*) FILTER (WHERE base_sense_id IS NOT NULL)::int AS linked_to_lower_level
      FROM vocab_senses WHERE cefr = 'C2'`)).rows[0];
    // ข้อที่ผู้เรียนตอบผิดสูงผิดปกติ (≥ 5 ครั้ง) = อาจกำกวม → ส่งให้คนตรวจ
    const hard = (await pool.query(
      `SELECT a.item_id, s.display_form, count(*)::int AS n, round(100.0 * count(*) FILTER (WHERE NOT a.correct) / count(*))::int AS wrong_pct
         FROM answer_events a JOIN vocab_senses s ON s.public_id = a.item_id
        WHERE a.skill = 'vocab' AND a.level = 'C2' GROUP BY a.item_id, s.display_form HAVING count(*) >= 5
        ORDER BY wrong_pct DESC, n DESC LIMIT 15`)).rows;
    const learners = (await pool.query("SELECT count(DISTINCT user_id)::int AS n FROM word_progress WHERE level = 'C2'")).rows[0].n;
    res.json({ totals, status, kind, tier, register, hardItems: hard, learners, note: 'coverage-driven C2 vocabulary bank — ขยายเพิ่มได้ ไม่ได้ครอบคลุมทุกคำ' });
  } catch (err) {
    console.error('[admin/c2/metrics]', err);
    res.status(500).json({ error: 'โหลดสถิติ C2 ไม่สำเร็จ' });
  }
});

router.patch('/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'รหัสไม่ถูกต้อง' });
  const body = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(`SELECT ${COLS}, s.id FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id WHERE s.public_id = $1 AND s.cefr = 'C2' FOR UPDATE OF s`, [id])).rows[0];
    if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'ไม่พบรายการนี้' }); }
    const entry = entryFromRow(row);
    const before = view(row);
    for (const [k, type] of Object.entries(EDITABLE)) {
      if (!(k in body)) continue;
      let v = body[k];
      if (type === 'text') v = String(v == null ? '' : v).normalize('NFC').trim().slice(0, 600);
      if (type === 'int') v = Number(v);
      if (type === 'list') v = (Array.isArray(v) ? v : String(v || '').split(/[,\n]/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
      entry[k] = v;
    }
    const r = V.validateEntry(entry);
    const want = String(body.status || row.verification_status);
    if (!V.STATUSES.includes(want)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' }); }
    if (want !== 'unverified' && r.errors.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ยังมีปัญหาที่ต้องแก้ก่อนเปิดใช้งาน', code: 'HAS_ERRORS', errors: r.errors });
    }
    const status = want;
    const c2 = { ...(row.c2 || {}), meaningTH: entry.meaningTH, usageNoteTH: entry.usageNoteTH, meaningEN: entry.meaningEN };
    await client.query(
      `UPDATE vocab_senses SET thai_meaning = $2, example_sentence = $3, example_translation = $4, register = $5, connotation = $6,
          tier = $7, real_world_priority = $8, collocations = $9, simple_definition = $10, c2 = $11, verification_status = $12,
          verification_issues = $13, translation_status = CASE WHEN $12 = 'reviewed' THEN 'reviewed' ELSE translation_status END,
          translation_source = CASE WHEN $12 = 'reviewed' THEN 'HUMAN_REVIEWED' ELSE translation_source END,
          reviewed_by = CASE WHEN $12 = 'reviewed' THEN $14::int ELSE reviewed_by END,
          reviewed_at = CASE WHEN $12 = 'reviewed' THEN NOW() ELSE reviewed_at END, updated_at = NOW()
        WHERE public_id = $1`,
      [id, entry.shortMeaningTH, entry.example, entry.exampleTH, entry.register, entry.connotation, entry.tier, entry.realWorldPriority,
        entry.collocations, entry.meaningEN, JSON.stringify(c2), status, JSON.stringify({ errors: r.errors, warnings: r.warnings }), req.userId]);
    await client.query('INSERT INTO content_edits (word_id, editor_id, before_data, after_data) VALUES ($1, $2, $3, $4)',
      [id, req.userId, JSON.stringify(before), JSON.stringify({ ...entry, q: undefined, status })]);
    await client.query('COMMIT');
    // คลังในหน่วยความจำ: โหลดใหม่ให้ผู้เรียนเห็นทันที (สถานะ unverified = ถูกถอดออกจากแบบฝึก)
    await require('../utils/wordStore').reload();
    await require('../services/vocab/c2Store').reload();
    require('./path').invalidateUnits();
    const fresh = (await pool.query(`SELECT ${COLS} FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id WHERE s.public_id = $1`, [id])).rows[0];
    res.json({ ok: true, item: view(fresh) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[admin/c2/patch]', err);
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  } finally { client.release(); }
});

module.exports = router;
module.exports.entryFromRow = entryFromRow;
