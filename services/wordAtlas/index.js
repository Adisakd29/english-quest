/*
  Word Atlas — บริการหลัก (v1.14.0)
  - อ่านคลังจาก atlas_lemmas / atlas_senses · ความหมายที่ชี้ Oxford ดึงเนื้อหาจาก vocab_senses (ไม่คัดลอกซ้ำ)
  - ความคืบหน้า = word_progress เดิม (คีย์ progress_id) → Oxford กับ Word Atlas ใช้สถานะ/SRS/EXP ชุดเดียวกัน
  - แบบฝึก: เซิร์ฟเวอร์สร้างโจทย์และเก็บเฉลยใน atlas_sessions · client ได้แค่รหัสตัวเลือกสุ่ม
  - EXP: ตอบข้อ = recordCardAnswer (กติกาเดียวกับการ์ดคำศัพท์ Oxford: ใหม่ 15 · ทวน 5 · cooldown 20 ชม./ความหมาย)
         จบ Unit ครั้งแรก +10 · Unit เต็ม +5 (uniqueEventId ใน atlas_reward_events — ได้ครั้งเดียวต่อ Unit)
  - ใช้เฉพาะความหมายที่ learnable (ผ่าน validator + คำแปลไทยผ่านการตรวจ) ทำแบบฝึกที่ให้คะแนน
*/
const crypto = require('crypto');
const pool = require('../../config/db');
const { escapeLike } = require('../../utils/security');
const { recordCardAnswer } = require('../vocab/record');
const { getLevelInfo } = require('../../utils/leveling');

const PAGE_SIZE = 30;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SORTS = ['alpha', 'common', 'recommended', 'easy', 'recent', 'notLearned', 'needReview'];
const KINDS = ['word', 'phrasal', 'idiom', 'phrase'];
const POS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'determiner', 'exclamation', 'number',
  'phrasal verb', 'idiom', 'phrase', 'fixed expression', 'collocation', 'modal verb', 'auxiliary verb'];
const TOPICS = [
  ['daily-life', 'ชีวิตประจำวัน', 'Daily Life'], ['family', 'ครอบครัว', 'Family'], ['food', 'อาหาร', 'Food'], ['travel', 'การเดินทาง', 'Travel'],
  ['technology', 'เทคโนโลยี', 'Technology'], ['computer', 'คอมพิวเตอร์', 'Computer'], ['programming', 'การเขียนโปรแกรม', 'Programming'],
  ['science', 'วิทยาศาสตร์', 'Science'], ['engineering', 'วิศวกรรม', 'Engineering'], ['electronics', 'อิเล็กทรอนิกส์', 'Electronics'],
  ['business', 'ธุรกิจ', 'Business'], ['finance', 'การเงิน', 'Finance'], ['education', 'การศึกษา', 'Education'], ['health', 'สุขภาพ', 'Health'],
  ['environment', 'สิ่งแวดล้อม', 'Environment'], ['nature', 'ธรรมชาติ', 'Nature'], ['society', 'สังคม', 'Society'], ['arts', 'ศิลปะ', 'Arts'],
  ['literature', 'วรรณกรรม', 'Literature'], ['psychology', 'จิตวิทยา', 'Psychology'], ['law', 'กฎหมาย', 'Law'], ['sports', 'กีฬา', 'Sports'],
  ['academic', 'ภาษาอังกฤษเชิงวิชาการ', 'Academic English'], ['professional', 'ภาษาอังกฤษในการทำงาน', 'Professional English'],
];
const TOPIC_IDS = new Set(TOPICS.map((t) => t[0]));
const UNIT_RE = /^[A-Z]-\d{3}$/;
const LEMMA_RE = /^L-[0-9a-f]{12}$/;
const SENSE_RE = /^WA-[0-9a-f]{12}$/;
const SESSION_TTL_H = 6;
const REWARD = { unitComplete: 10, unitPerfect: 5 };   // ค่าเริ่มต้นสำหรับปรับสมดุล (PART 10) — ข้อย่อยใช้กติกาการ์ดคำศัพท์เดิม
const MASTERED_DAYS = 21;
const KNOWN_DAYS = 7;

class AtlasError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const rnd = (n) => crypto.randomInt(0, n);
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i -= 1) { const j = rnd(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const key = () => crypto.randomBytes(6).toString('base64url');
const norm = (s) => String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------------------- สถานะผู้เรียน (PART 12)
   new · learning · familiar · known · mastered · needReview — คำนวณจาก word_progress แถวเดียวกับ Oxford */
const STATUS_SQL = (wp) => `CASE
  WHEN ${wp}.id IS NULL THEN 'new'
  WHEN ${wp}.ever_known AND ${wp}.srs_due_at IS NOT NULL AND ${wp}.srs_due_at <= NOW() THEN 'needReview'
  WHEN NOT ${wp}.ever_known THEN 'learning'
  WHEN ${wp}.status <> 'known' AND COALESCE(${wp}.srs_reps, 0) = 0 THEN 'needReview'
  WHEN COALESCE(${wp}.srs_interval, 0) >= ${MASTERED_DAYS} THEN 'mastered'
  WHEN COALESCE(${wp}.srs_interval, 0) >= ${KNOWN_DAYS} THEN 'known'
  ELSE 'familiar' END`;
const LEARNED = new Set(['familiar', 'known', 'mastered', 'needReview']);

/* ---------------------------------------------------------------- ข้อมูลความหมาย (รวม Oxford) */
const SENSE_COLS = `s.id, s.lemma_id, s.oxford_sense_id, s.progress_id, s.sense_no, s.pos, s.definition_en, s.thai, s.examples, s.synonyms, s.antonyms,
  s.collocations, s.phrases, s.phrasal_verbs, s.word_family, s.topics, s.labels, s.register, s.usage_note, s.cefr, s.difficulty,
  s.ipa_uk, s.ipa_us, s.audio_uk, s.audio_us, s.source, s.license, s.verification_status, s.learnable, s.quality_flags,
  l.lemma, l.display, l.kind, l.letter, l.freq_band, l.zipf,
  v.thai_meaning AS ox_thai, v.simple_definition AS ox_def, v.example_sentence AS ox_ex, v.example_translation AS ox_ex_th, v.ipa AS ox_ipa,
  v.synonyms AS ox_syn, v.antonyms AS ox_ant, v.collocations AS ox_col, v.word_family AS ox_fam, v.common_mistakes AS ox_mistakes,
  v.register AS ox_register, v.display_form AS ox_display, v.kind AS ox_kind, v.c2 AS ox_c2, v.source_list AS ox_list, v.sense_label AS ox_label`;
const SENSE_FROM = `FROM atlas_senses s JOIN atlas_lemmas l ON l.id = s.lemma_id LEFT JOIN vocab_senses v ON v.public_id = s.oxford_sense_id`;

const uniq = (a) => [...new Set((a || []).filter(Boolean))];
/** แปลงแถว → ข้อมูลความหมายพร้อมใช้ (Oxford เป็นหลักถ้ามี + ส่วนเสริมจาก Wiktionary) */
function senseOf(r) {
  const ox = Boolean(r.oxford_sense_id);
  const c2 = r.ox_c2 || {};
  const exs = [];
  if (ox && r.ox_ex) exs.push({ en: r.ox_ex, th: r.ox_ex_th || null, source: 'EnglishQuest' });
  (r.examples || []).forEach((e) => { if (e && e.en && !exs.some((x) => norm(x.en) === norm(e.en))) exs.push({ en: e.en, th: e.th || null, source: 'Wiktionary' }); });
  const thai = ox ? uniq([r.ox_thai]) : (r.learnable || r.verification_status !== 'unverified' ? r.thai || [] : []);
  return {
    id: r.id, lemmaId: r.lemma_id, progressId: r.progress_id, oxfordId: r.oxford_sense_id, senseNo: r.sense_no,
    head: (ox && r.ox_display) || r.display || r.lemma, lemma: r.lemma, kind: (ox && r.ox_kind) || r.kind,
    pos: r.pos, senseLabel: r.ox_label || null,
    definition: (ox && r.ox_def) || r.definition_en || null, definitionSource: (ox && r.ox_def) ? 'EnglishQuest' : (r.definition_en ? 'Wiktionary' : null),
    thai, examples: exs.slice(0, 4),
    synonyms: uniq([...(r.ox_syn || []), ...(c2.nearSynonyms || []), ...(r.synonyms || [])]).slice(0, 8),
    antonyms: uniq([...(r.ox_ant || []), ...(r.antonyms || [])]).slice(0, 6),
    collocations: uniq([...(r.ox_col || []), ...(r.collocations || [])]).slice(0, 8),
    phrasalVerbs: r.phrasal_verbs || [], wordFamily: uniq([...(r.ox_fam || []), ...(c2.wordFamily || []), ...(r.word_family || [])]).slice(0, 10),
    commonMistakes: uniq([r.ox_mistakes, ...((c2.commonMistakes || []).map((m) => (typeof m === 'string' ? m : m && (m.th || m.note || m.wrong))))]).slice(0, 4),
    usageNote: c2.usageNoteTH || r.usage_note || null,
    topics: r.topics || [], labels: r.labels || [], register: r.ox_register || r.register || null,
    cefr: r.cefr || null, cefrSource: r.cefr ? (r.ox_list === 'C2_BANK' ? 'EnglishQuest C2 bank' : 'Oxford 3000/5000') : null,
    difficulty: r.difficulty, frequencyBand: r.freq_band,
    ipaUK: r.ipa_uk || (ox ? r.ox_ipa : null) || null, ipaUS: r.ipa_us || null, audioUK: r.audio_uk || null, audioUS: r.audio_us || null,
    source: r.source, license: r.license, verification: r.verification_status, learnable: r.learnable,
    thaiPending: !ox && !thai.length && (r.quality_flags || []).includes('thai_pending_review'),
  };
}

/* ---------------------------------------------------------------- ระดับผู้เรียน (ใช้แนะนำคำ) */
async function userLevel(userId) {
  const { rows } = await pool.query(
    `SELECT v.cefr, count(*)::int AS total, count(wp.id) FILTER (WHERE wp.ever_known)::int AS known
       FROM vocab_senses v LEFT JOIN word_progress wp ON wp.user_id = $1 AND wp.word_id = v.public_id
      WHERE v.public_id IS NOT NULL AND NOT v.is_supplemental AND v.cefr IN ('A1','A2','B1','B2','C1') GROUP BY v.cefr`, [userId]);
  const by = Object.fromEntries(rows.map((r) => [r.cefr, r]));
  for (const c of ['A1', 'A2', 'B1', 'B2', 'C1']) { const r = by[c]; if (!r || r.known / Math.max(r.total, 1) < 0.6) return c; }
  return 'C2';
}

/* ---------------------------------------------------------------- Hub */
async function hub(userId) {
  const [meta, letters, learned, totals, cont, review, coll] = await Promise.all([
    pool.query("SELECT value FROM atlas_meta WHERE key = 'dataset'"),
    pool.query(`SELECT letter, count(*)::int AS lemmas, COALESCE(sum(learnable_total), 0)::int AS available,
                       (SELECT count(*)::int FROM atlas_units u WHERE u.letter = l.letter) AS units
                  FROM atlas_lemmas l GROUP BY letter ORDER BY letter`),
    pool.query(`SELECT l.letter, count(*)::int AS n FROM word_progress wp JOIN atlas_senses s ON s.progress_id = wp.word_id AND s.learnable
                  JOIN atlas_lemmas l ON l.id = s.lemma_id WHERE wp.user_id = $1 AND wp.ever_known GROUP BY l.letter`, [userId]),
    pool.query(`SELECT (SELECT count(*)::int FROM atlas_lemmas) AS lemmas, count(*)::int AS senses,
                       count(*) FILTER (WHERE learnable)::int AS learnable, count(*) FILTER (WHERE oxford_sense_id IS NOT NULL)::int AS oxford,
                       (SELECT count(*)::int FROM atlas_lemmas WHERE kind <> 'word') AS phrases FROM atlas_senses`),
    pool.query(`SELECT p.unit_id, p.step, p.steps_total, p.updated_at, u.letter FROM atlas_unit_progress p JOIN atlas_units u ON u.id = p.unit_id
                 WHERE p.user_id = $1 AND p.completed_at IS NULL ORDER BY p.updated_at DESC LIMIT 1`, [userId]),
    reviewCount(userId),
    pool.query('SELECT count(*)::int AS n FROM atlas_collection WHERE user_id = $1', [userId]),
  ]);
  const lmap = Object.fromEntries(learned.rows.map((r) => [r.letter, r.n]));
  const level = await userLevel(userId);
  const [daily, rec] = await Promise.all([dailyWords(userId, level), recommended(userId, level, 8)]);
  const m = meta.rows[0] ? meta.rows[0].value : null;
  return {
    dataset: m ? { id: m.dataset, importedAt: m.importedAt } : null,
    totals: totals.rows[0], level,
    letters: LETTERS.map((L) => { const r = letters.rows.find((x) => x.letter === L) || { lemmas: 0, available: 0, units: 0 }; return { letter: L, lemmas: r.lemmas, available: r.available, units: r.units, learned: Math.min(lmap[L] || 0, r.available) }; }),
    continue: cont.rows[0] ? { unitId: cont.rows[0].unit_id, letter: cont.rows[0].letter, step: cont.rows[0].step, stepsTotal: cont.rows[0].steps_total, updatedAt: cont.rows[0].updated_at } : null,
    review, collection: coll.rows[0].n, daily, recommended: rec,
    topics: TOPICS.map(([id, th, en]) => ({ id, th, en })), sorts: SORTS, pos: POS, cefr: CEFR,
  };
}

/* ---------------------------------------------------------------- Browse / Search (PART 2, 3, 21) */
const LEMMA_COLS = `l.id, l.lemma, l.display, l.sort_key, l.letter, l.kind, l.freq_band, l.zipf, l.freq_rank, l.pos_list, l.cefr_list, l.cefr_min, l.topics,
  l.labels, l.primary_thai, l.primary_pos, l.ipa_uk, l.ipa_us, l.sense_total, l.learnable_total, l.oxford, l.created_at`;
const LEMMA_PROGRESS = `LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE wp.ever_known)::int AS learned,
      count(*) FILTER (WHERE wp.ever_known AND wp.srs_due_at <= NOW())::int AS due, count(*)::int AS seen
    FROM word_progress wp WHERE wp.user_id = $1 AND wp.word_id = ANY(l.progress_ids)) pr ON TRUE`;
function lemmaOut(r) {
  return {
    id: r.id, lemma: r.lemma, display: r.display, letter: r.letter, kind: r.kind, pos: r.primary_pos, posList: r.pos_list,
    thai: r.primary_thai, cefr: r.cefr_min, cefrList: r.cefr_list, frequencyBand: r.freq_band, topics: r.topics, labels: r.labels,
    ipaUK: r.ipa_uk, ipaUS: r.ipa_us, senses: r.sense_total, learnable: r.learnable_total, oxford: r.oxford,
    progress: { learned: r.learned || 0, due: r.due || 0, seen: r.seen || 0 },
    status: !r.seen ? 'new' : r.due ? 'needReview' : r.learnable_total && r.learned >= r.learnable_total ? 'learned' : r.learned ? 'partial' : 'learning',
  };
}

async function browse(userId, q = {}) {
  const params = [userId]; const where = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  const letter = String(q.letter || '').toLowerCase();
  if (LETTERS.includes(letter)) where.push(`l.letter = ${add(letter)}`);
  const text = String(q.q || '').trim().slice(0, 60);
  let exactParam = null;
  if (text) {
    if (/[฀-๿]/.test(text)) {
      where.push(`l.search_th ILIKE ${add(`%${escapeLike(text)}%`)}`);               // ค้นคำไทย
    } else {
      const t = text.toLowerCase();
      const rel = String(q.rel || '');
      if (rel === 'synonym') {
        where.push(`EXISTS (SELECT 1 FROM atlas_senses s2 LEFT JOIN vocab_senses v2 ON v2.public_id = s2.oxford_sense_id
                      WHERE s2.lemma_id = l.id AND (${add(t)} = ANY(s2.synonyms) OR $${params.length} = ANY(v2.synonyms)))`);
      } else if (q.exact === '1' || q.exact === true) {
        where.push(`l.lemma = ${add(t)}`);
      } else {
        where.push(`l.lemma LIKE ${add(`${escapeLike(t)}%`)}`);                          // prefix (index text_pattern_ops)
      }
      exactParam = t;
    }
  }
  const cefr = String(q.cefr || '').toUpperCase();
  if (CEFR.includes(cefr)) where.push(`${add(cefr)} = ANY(l.cefr_list)`);
  else if (cefr === 'U') where.push("cardinality(l.cefr_list) = 0");
  const pos = String(q.pos || '');
  if (POS.includes(pos)) where.push(`${add(pos)} = ANY(l.pos_list)`);
  const topic = String(q.topic || '');
  if (TOPIC_IDS.has(topic)) where.push(`${add(topic)} = ANY(l.topics)`);
  const band = parseInt(q.band, 10);
  if (band >= 1 && band <= 6) where.push(`l.freq_band = ${add(band)}`);
  const kind = String(q.kind || '');
  if (KINDS.includes(kind)) where.push(`l.kind = ${add(kind)}`);
  if (q.learnable === '1') where.push('l.learnable_total > 0');
  const sort = SORTS.includes(q.sort) ? q.sort : 'alpha';
  if (sort === 'notLearned') where.push('l.learnable_total > 0 AND COALESCE(pr.learned, 0) = 0');
  if (sort === 'needReview') where.push('COALESCE(pr.due, 0) > 0');
  // (ย้ายลงไปหลังเงื่อนไขทั้งหมด — พารามิเตอร์ exact ใช้เฉพาะ ORDER BY)
  const ORDER = {
    alpha: 'l.sort_key, l.lemma',
    common: 'l.freq_rank NULLS LAST, l.lemma',
    recommended: `(l.learnable_total > 0) DESC, (COALESCE(pr.learned,0) = 0) DESC, l.freq_rank NULLS LAST, l.lemma`,
    easy: "COALESCE(array_position(ARRAY['A1','A2','B1','B2','C1','C2']::text[], l.cefr_min::text), 7), l.freq_rank NULLS LAST, l.lemma",
    recent: 'l.created_at DESC, l.freq_rank NULLS LAST, l.lemma',
    notLearned: 'l.freq_rank NULLS LAST, l.lemma',
    needReview: 'l.freq_rank NULLS LAST, l.lemma',
  }[sort];
  // Cursor pagination สำหรับ A–Z (คีย์ = sort_key + lemma ของแถวสุดท้าย) · แบบอื่นใช้หน้า (page)
  let cursor = null;
  if (sort === 'alpha' && !text && typeof q.cursor === 'string' && q.cursor.length <= 130) {
    const [ck, cl] = q.cursor.split('\u0001');
    if (ck && cl) { cursor = q.cursor; where.push(`(l.sort_key, l.lemma) > (${add(ck)}, ${add(cl)})`); }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countParams = [...params];
  // ลำดับ: exact match ขึ้นก่อนเสมอเมื่อค้นหา
  const exactFirst = exactParam ? `(l.lemma = ${add(exactParam)}) DESC, ` : '';
  const page = cursor ? 1 : Math.min(Math.max(parseInt(q.page, 10) || 1, 1), 2000);
  const [rows, total] = await Promise.all([
    pool.query(`SELECT ${LEMMA_COLS}, pr.learned, pr.due, pr.seen FROM atlas_lemmas l ${LEMMA_PROGRESS} ${whereSql}
                 ORDER BY ${exactFirst}${ORDER} LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`, params),
    cursor ? Promise.resolve(null)
      : pool.query(`SELECT count(*)::int AS n FROM atlas_lemmas l ${/pr\./.test(whereSql) ? LEMMA_PROGRESS : ''}
                    WHERE $1::int IS NOT NULL ${where.length ? `AND ${where.join(' AND ')}` : ''}`, countParams),
  ]);
  const list = rows.rows.slice(0, PAGE_SIZE).map(lemmaOut);
  const hasMore = rows.rows.length > PAGE_SIZE;
  return {
    words: list, page, pageSize: PAGE_SIZE, total: total ? total.rows[0].n : null, hasMore, sort,
    nextCursor: sort === 'alpha' && !text && hasMore ? `${rows.rows[PAGE_SIZE - 1].sort_key}\u0001${rows.rows[PAGE_SIZE - 1].lemma}` : null,
  };
}

/* ---------------------------------------------------------------- Word Detail (PART 8) */
async function detail(userId, lemmaId) {
  if (!LEMMA_RE.test(String(lemmaId))) throw new AtlasError(400, 'รหัสคำไม่ถูกต้อง');
  const l = (await pool.query(`SELECT ${LEMMA_COLS} FROM atlas_lemmas l WHERE l.id = $1`, [lemmaId])).rows[0];
  if (!l) throw new AtlasError(404, 'ไม่พบคำนี้');
  const [senses, coll, units] = await Promise.all([
    pool.query(`SELECT ${SENSE_COLS}, ${STATUS_SQL('wp')} AS user_status, wp.times_seen, wp.times_correct, wp.srs_due_at
                  ${SENSE_FROM} LEFT JOIN word_progress wp ON wp.user_id = $1 AND wp.word_id = s.progress_id
                 WHERE s.lemma_id = $2 ORDER BY (s.oxford_sense_id IS NULL), s.learnable DESC, s.sense_no`, [userId, lemmaId]),
    pool.query('SELECT 1 FROM atlas_collection WHERE user_id = $1 AND lemma_id = $2', [userId, lemmaId]),
    pool.query(`SELECT DISTINCT ui.unit_id FROM atlas_unit_items ui JOIN atlas_senses s ON s.id = ui.sense_id WHERE s.lemma_id = $1 ORDER BY 1`, [lemmaId]),
  ]);
  // คำที่เกี่ยวข้องที่มีในคลัง (กดไปดูต่อได้)
  const rel = uniq(senses.rows.flatMap((r) => [...(r.synonyms || []), ...(r.antonyms || []), ...(r.ox_syn || []), ...(r.ox_ant || [])]).map((x) => norm(x))).slice(0, 30);
  const links = rel.length ? (await pool.query('SELECT id, lemma FROM atlas_lemmas WHERE lemma = ANY($1)', [rel])).rows : [];
  return {
    ...lemmaOut(l), inCollection: coll.rowCount > 0, units: units.rows.map((r) => r.unit_id),
    related: Object.fromEntries(links.map((x) => [x.lemma, x.id])),
    senses: senses.rows.map((r) => ({ ...senseOf(r), status: r.user_status, timesSeen: r.times_seen || 0, timesCorrect: r.times_correct || 0, dueAt: r.srs_due_at })),
  };
}

/* ---------------------------------------------------------------- Units (PART 7) */
async function letterUnits(userId, letter) {
  if (!LETTERS.includes(String(letter))) throw new AtlasError(400, 'ตัวอักษรไม่ถูกต้อง');
  const { rows } = await pool.query(
    `SELECT u.id, u.seq, count(s.id)::int AS items, array_agg(l.display ORDER BY ui.ord) AS words,
            count(wp.id) FILTER (WHERE wp.ever_known)::int AS learned,
            min(COALESCE(array_position(ARRAY['A1','A2','B1','B2','C1','C2']::text[], s.cefr::text), 7)) AS cmin,
            max(COALESCE(array_position(ARRAY['A1','A2','B1','B2','C1','C2']::text[], s.cefr::text), 0)) AS cmax,
            p.step, p.steps_total, p.completed_at, p.best_pct
       FROM atlas_units u JOIN atlas_unit_items ui ON ui.unit_id = u.id JOIN atlas_senses s ON s.id = ui.sense_id AND s.learnable
       JOIN atlas_lemmas l ON l.id = s.lemma_id
       LEFT JOIN word_progress wp ON wp.user_id = $1 AND wp.word_id = s.progress_id
       LEFT JOIN atlas_unit_progress p ON p.user_id = $1 AND p.unit_id = u.id
      WHERE u.letter = $2 GROUP BY u.id, u.seq, p.step, p.steps_total, p.completed_at, p.best_pct ORDER BY u.seq`, [userId, letter]);
  return {
    letter,
    units: rows.map((r) => ({
      id: r.id, seq: r.seq, items: r.items, preview: uniq(r.words).slice(0, 6), learned: r.learned,
      cefrFrom: r.cmin <= 6 ? CEFR[r.cmin - 1] : null, cefrTo: r.cmax >= 1 ? CEFR[r.cmax - 1] : null,
      step: r.step, stepsTotal: r.steps_total, completed: Boolean(r.completed_at), bestPct: r.best_pct,
    })),
  };
}

async function unitItems(unitId, userId) {
  const { rows } = await pool.query(
    `SELECT ${SENSE_COLS}, ui.ord, ${STATUS_SQL('wp')} AS user_status ${SENSE_FROM}
       JOIN atlas_unit_items ui ON ui.sense_id = s.id LEFT JOIN word_progress wp ON wp.user_id = $2 AND wp.word_id = s.progress_id
      WHERE ui.unit_id = $1 AND s.learnable ORDER BY ui.ord`, [unitId, userId]);
  return rows.map((r) => ({ ...senseOf(r), status: r.user_status }));
}

/* แผนบทเรียน (ปรับตามคำขอ 4 พ.ย.): เลือกหมวดแล้วเข้าทายความหมาย 5 ตัวเลือกทันที — ไม่มีหน้าเนื้อหาก่อนทำ */
function lessonPlan() {
  return [
    { k: 'quiz', title: 'Guess the Meaning', th: 'ทายความหมาย', quiz: ['meaning'] },
    { k: 'complete', title: 'Lesson Complete', th: 'จบบทเรียน' },
  ];
}

async function unit(userId, unitId) {
  if (!UNIT_RE.test(String(unitId))) throw new AtlasError(400, 'รหัส Unit ไม่ถูกต้อง');
  const u = (await pool.query('SELECT id, letter, seq FROM atlas_units WHERE id = $1', [unitId])).rows[0];
  if (!u) throw new AtlasError(404, 'ไม่พบ Unit นี้');
  const items = await unitItems(unitId, userId);
  if (!items.length) throw new AtlasError(409, 'Unit นี้ยังไม่มีคำที่พร้อมเรียน', 'NO_WORDS');
  const steps = lessonPlan(items);
  const p = (await pool.query('SELECT step, steps_total, completed_at, best_pct FROM atlas_unit_progress WHERE user_id = $1 AND unit_id = $2', [userId, unitId])).rows[0];
  const next = (await pool.query('SELECT id FROM atlas_units WHERE letter = $1 AND seq > $2 ORDER BY seq LIMIT 1', [u.letter, u.seq])).rows[0];
  return {
    id: u.id, letter: u.letter, seq: u.seq, items, steps, nextUnit: next ? next.id : null,
    progress: p ? { step: Math.min(p.step, steps.length - 1), completed: Boolean(p.completed_at), bestPct: p.best_pct } : { step: 0, completed: false, bestPct: null },
    rewards: REWARD,
  };
}

async function saveStep(userId, unitId, step) {
  if (!UNIT_RE.test(String(unitId))) throw new AtlasError(400, 'รหัส Unit ไม่ถูกต้อง');
  const items = await unitItems(unitId, userId);
  if (!items.length) throw new AtlasError(404, 'ไม่พบ Unit นี้');
  const total = lessonPlan(items).length;
  const s = Math.max(0, Math.min(parseInt(step, 10) || 0, total - 1));
  await pool.query(
    `INSERT INTO atlas_unit_progress (user_id, unit_id, step, steps_total) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, unit_id) DO UPDATE SET step = EXCLUDED.step, steps_total = EXCLUDED.steps_total, updated_at = NOW()`,
    [userId, unitId, s, total]);
  return { step: s, stepsTotal: total };
}

/* ---------------------------------------------------------------- สร้างโจทย์ (PART 9) */
function fillSentence(it) {
  const head = norm(it.head);
  if (!/^[a-z][a-z'-]*$/.test(head)) return null;
  for (const ex of it.examples) {
    const re = new RegExp(`(^|[^A-Za-z'’-])(${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^A-Za-z'’-])`, 'i');
    if (re.test(ex.en)) return ex.en.replace(re, '$1_____');
  }
  return null;
}
function collocationPrompt(it) {
  const head = norm(it.head);
  if (!/^[a-z][a-z'-]*$/.test(head)) return null;
  for (const c of it.collocations) {
    const re = new RegExp(`(^|\\s)${head}(?=\\s|$)`, 'i');
    if (re.test(c) && c.split(/\s+/).length >= 2) return c.replace(re, '$1_____');
  }
  return null;
}
function thaiBigrams(s) { const t = String(s || '').replace(/[\s/(),.·;:-]/g, ''); const o = new Set(); for (let i = 0; i < t.length - 1; i += 1) o.add(t.slice(i, i + 2)); return o; }
function tooClose(a, b) {
  const x = String(a || '').trim(); const y = String(b || '').trim();
  if (!x || !y) return false;
  if (x === y || (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x)))) return true;
  const A = thaiBigrams(x); const B = thaiBigrams(y);
  if (!A.size || !B.size) return false;
  let n = 0; A.forEach((g) => { if (B.has(g)) n += 1; });
  return n / Math.min(A.size, B.size) >= 0.5;
}
function decoys(target, poolItems, n, { thai = false, avoid = [] } = {}) {
  const head = norm(target.head);
  const bad = new Set([head, ...avoid.map(norm), ...target.synonyms.map(norm)]);
  const ok = poolItems.filter((p) => p.id !== target.id && !bad.has(norm(p.head)) && (!thai || (p.thai[0] && !tooClose(p.thai[0], target.thai[0]))));
  const same = shuffle(ok.filter((p) => p.pos === target.pos)); const other = shuffle(ok.filter((p) => p.pos !== target.pos));
  const out = [];
  for (const d of [...same, ...other]) {
    if (out.length >= n) break;
    if (out.some((o) => norm(o.head) === norm(d.head) || (thai && tooClose(o.thai[0], d.thai[0])))) continue;
    out.push(d);
  }
  return out;
}
const opt = (text, correct) => ({ key: key(), text, correct });

/** โจทย์ 1 ข้อ (null = คำนี้ใช้แบบนี้ไม่ได้) */
function buildQuestion(it, type, poolItems) {
  const base = { senseId: it.id, progressId: it.progressId, level: it.oxfordId ? (it.cefr || 'A1') : 'WA', skill: it.oxfordId ? 'vocab' : 'atlas', type };
  const enChoices = (avoid = []) => { const d = decoys(it, poolItems, 3, { avoid }); return d.length < 3 ? null : shuffle([opt(it.head, true), ...d.map((x) => opt(x.head, false))]); };
  if (type === 'meaning' || type === 'idiom' || type === 'phrasal') {
    if (!it.thai[0]) return null;
    const d = decoys(it, poolItems, 4, { thai: true });
    if (d.length < 4) return null;   // ทายความหมาย = 5 ตัวเลือกเสมอ (เหมือนคำศัพท์ Oxford)
    const t = it.kind === 'idiom' ? 'idiom' : it.kind === 'phrasal' ? 'phrasal' : 'meaning';
    return { ...base, type: t, options: shuffle([opt(it.thai[0], true), ...d.map((x) => opt(x.thai[0], false))]),
      pub: { word: it.head, pos: it.pos, ipa: it.ipaUK || it.ipaUS, speak: it.head } };
  }
  if (type === 'reverse') { const o = it.thai[0] && enChoices(); return o ? { ...base, options: o, pub: { promptTH: it.thai.join(', '), pos: it.pos } } : null; }
  if (type === 'listen') { const o = enChoices(); return o ? { ...base, options: o, pub: { speak: it.head, audio: it.audioUS || it.audioUK } } : null; }
  if (type === 'definition') { const o = it.definition && enChoices(); return o ? { ...base, options: o, pub: { definition: it.definition, pos: it.pos } } : null; }
  if (type === 'fill') { const s = fillSentence(it); const o = s && enChoices(); return o ? { ...base, options: o, pub: { sentence: s, promptTH: it.thai[0] || null } } : null; }
  if (type === 'collocation') { const s = collocationPrompt(it); const o = s && enChoices(); return o ? { ...base, options: o, pub: { collocation: s, promptTH: it.thai[0] || null } } : null; }
  if (type === 'spell') {
    const h = norm(it.head);
    if (!/^[a-z][a-z'-]{1,24}$/.test(h) || !it.thai[0]) return null;
    return { ...base, answer: h, pub: { promptTH: it.thai.join(', '), pos: it.pos, hint: { first: h[0], length: h.length }, speak: it.head } };
  }
  if (type === 'synonym' || type === 'antonym') {
    const list = (type === 'synonym' ? it.synonyms : it.antonyms).filter((x) => /^[a-z][a-z' -]{1,30}$/i.test(x));
    if (!list.length) return null;
    const right = list[rnd(list.length)];
    const avoid = [...it.synonyms, ...it.antonyms, right];
    const d = decoys(it, poolItems, 3, { avoid }).map((x) => x.head).filter((h) => !avoid.map(norm).includes(norm(h)));
    if (d.length < 3) return null;
    return { ...base, options: shuffle([opt(right, true), ...d.slice(0, 3).map((h) => opt(h, false))]), pub: { word: it.head, thai: it.thai[0] || null } };
  }
  if (type === 'formation') {
    const fam = it.wordFamily.map((f) => /^([a-z][a-z-]+) \((noun|verb|adjective|adverb)\)$/i.exec(f)).filter(Boolean);
    if (!fam.length) return null;
    const [, form, pos] = fam[rnd(fam.length)];
    const others = poolItems.filter((p) => p.id !== it.id && norm(p.head) !== norm(form)).map((p) => p.head).filter((h) => /^[a-z-]+$/i.test(h));
    const d = shuffle(others).slice(0, 3);
    if (d.length < 3) return null;
    return { ...base, options: shuffle([opt(form, true), ...d.map((h) => opt(h, false))]), pub: { word: it.head, targetPos: pos } };
  }
  return null;
}

/** ข้อจับคู่ (Matching): 4 คู่ อังกฤษ ↔ ไทย · ตอบด้วย pairs {leftKey: rightKey} */
function buildMatch(items) {
  const pick = shuffle(items.filter((x) => x.thai[0])).reduce((acc, x) => {
    if (acc.length < 4 && !acc.some((a) => norm(a.head) === norm(x.head) || tooClose(a.thai[0], x.thai[0]))) acc.push(x); return acc;
  }, []);
  if (pick.length < 3) return null;
  const left = pick.map((x) => ({ key: key(), text: x.head, senseId: x.id }));
  const right = shuffle(pick.map((x) => ({ key: key(), text: x.thai[0], senseId: x.id })));
  return { type: 'match', senseIds: pick.map((x) => x.id), items: pick.map((x) => ({ senseId: x.id, progressId: x.progressId, level: x.oxfordId ? (x.cefr || 'A1') : 'WA', skill: x.oxfordId ? 'vocab' : 'atlas' })),
    left, right, pub: { left: left.map(({ key: k, text }) => ({ key: k, text })), right: right.map(({ key: k, text }) => ({ key: k, text })) } };
}

function publicQ(q, i) {
  const out = { i, type: q.type, ...q.pub };
  if (q.options) out.options = q.options.map((o) => ({ key: o.key, text: o.text }));
  return out;
}

/** ชุดตัวลวง: คำที่เรียนได้ใกล้ ๆ ระดับเดียวกัน (สุ่มจากคลัง ไม่โหลดทั้งคลัง) */
async function decoyPool(items) {
  const lemmaIds = uniq(items.map((x) => x.lemmaId));
  const list = (await pool.query(`SELECT ${SENSE_COLS} ${SENSE_FROM} WHERE s.learnable AND s.lemma_id <> ALL($1)
      ORDER BY md5(s.id || $2) LIMIT 150`, [lemmaIds, crypto.randomBytes(4).toString('hex')])).rows;
  return [...items, ...list.map(senseOf)];
}

async function itemsBySource(userId, source, opts = {}) {
  const lim = 10;
  const q = (sql, p) => pool.query(sql, p).then((r) => r.rows.map(senseOf));
  if (source === 'review') {
    return q(`SELECT ${SENSE_COLS} ${SENSE_FROM} JOIN word_progress wp ON wp.user_id = $1 AND wp.word_id = s.progress_id
               WHERE s.learnable AND ((wp.ever_known AND wp.srs_due_at <= NOW()) OR wp.times_seen > wp.times_correct)
               ORDER BY (wp.ever_known AND wp.srs_due_at <= NOW()) DESC, wp.srs_due_at NULLS LAST, random() LIMIT ${lim}`, [userId]);
  }
  if (source === 'collection') {
    return q(`SELECT DISTINCT ON (s.lemma_id) ${SENSE_COLS} ${SENSE_FROM} JOIN atlas_collection c ON c.lemma_id = s.lemma_id AND c.user_id = $1
               WHERE s.learnable ORDER BY s.lemma_id, s.sense_no LIMIT 40`, [userId]).then((r) => shuffle(r).slice(0, lim));
  }
  if (source === 'letter' && LETTERS.includes(opts.letter)) {
    return q(`SELECT * FROM (SELECT ${SENSE_COLS}, (wp.ever_known IS TRUE) AS done ${SENSE_FROM}
                 LEFT JOIN word_progress wp ON wp.user_id = $3 AND wp.word_id = s.progress_id
                WHERE s.learnable AND l.letter = $1 ORDER BY (wp.ever_known IS TRUE), l.freq_rank NULLS LAST LIMIT 40) x
               ORDER BY x.done, md5(x.id || $2) LIMIT ${lim}`, [opts.letter, crypto.randomBytes(4).toString('hex'), userId]);
  }
  if (source === 'topic' && TOPIC_IDS.has(opts.topic)) {
    return q(`SELECT * FROM (SELECT ${SENSE_COLS}, (wp.ever_known IS TRUE) AS done ${SENSE_FROM}
                 LEFT JOIN word_progress wp ON wp.user_id = $3 AND wp.word_id = s.progress_id
                WHERE s.learnable AND $1 = ANY(l.topics) ORDER BY (wp.ever_known IS TRUE), l.freq_rank NULLS LAST LIMIT 40) x
               ORDER BY x.done, md5(x.id || $2) LIMIT ${lim}`, [opts.topic, crypto.randomBytes(4).toString('hex'), userId]);
  }
  if (source === 'cefr' && CEFR.includes(opts.cefr)) {
    return q(`SELECT * FROM (SELECT ${SENSE_COLS}, (wp.ever_known IS TRUE) AS done ${SENSE_FROM}
                 LEFT JOIN word_progress wp ON wp.user_id = $1 AND wp.word_id = s.progress_id
                WHERE s.learnable AND s.cefr = $2 ORDER BY (wp.ever_known IS TRUE), l.freq_rank NULLS LAST LIMIT 40) x
               ORDER BY x.done, md5(x.id || $3) LIMIT ${lim}`, [userId, opts.cefr, crypto.randomBytes(4).toString('hex')]);
  }
  if (source === 'lemma' && LEMMA_RE.test(String(opts.lemmaId || ''))) {
    return q(`SELECT ${SENSE_COLS} ${SENSE_FROM} WHERE s.learnable AND s.lemma_id = $1 ORDER BY s.sense_no LIMIT ${lim}`, [opts.lemmaId]);
  }
  if (source === 'daily') {
    const d = await dailyWords(userId, await userLevel(userId));
    return q(`SELECT DISTINCT ON (s.lemma_id) ${SENSE_COLS} ${SENSE_FROM} WHERE s.learnable AND s.lemma_id = ANY($1) ORDER BY s.lemma_id, s.sense_no`, [d.map((x) => x.id)]);
  }
  // recommended (ค่าเริ่มต้น)
  const rec = await recommended(userId, await userLevel(userId), lim);
  return q(`SELECT DISTINCT ON (s.lemma_id) ${SENSE_COLS} ${SENSE_FROM} WHERE s.learnable AND s.lemma_id = ANY($1) ORDER BY s.lemma_id, s.sense_no`, [rec.map((x) => x.id)]);
}

const QUIZ_MIX = ['meaning', 'reverse', 'listen', 'fill', 'definition', 'synonym', 'antonym', 'collocation', 'formation', 'spell'];

/**
 * เริ่มรอบแบบฝึก
 * @param {{kind:'unit'|'quiz'|'review', unitId?, step?, source?, letter?, topic?, cefr?, types?:string[]}} o
 */
async function startSession(userId, o = {}) {
  let items; let types; let kind = ['unit', 'quiz', 'review'].includes(o.kind) ? o.kind : 'quiz'; let unitId = null; let step = null; let withMatch = false;
  if (kind === 'unit') {
    if (!UNIT_RE.test(String(o.unitId))) throw new AtlasError(400, 'รหัส Unit ไม่ถูกต้อง');
    unitId = o.unitId;
    items = await unitItems(unitId, userId);
    if (!items.length) throw new AtlasError(404, 'ไม่พบ Unit นี้');
    const plan = lessonPlan(items);
    step = parseInt(o.step, 10);
    const st = plan[step];
    if (!st || !st.quiz) throw new AtlasError(400, 'ขั้นนี้ไม่มีแบบฝึก');
    types = st.quiz.filter((t) => t !== 'match'); withMatch = st.quiz.includes('match');
    if (st.k === 'review') {
      // ทบทวน: เน้นคำที่ตอบผิดใน Unit นี้ (ถ้าไม่มี = ทุกคำ)
      const wrong = await pool.query(`SELECT DISTINCT q->>'senseId' AS id FROM atlas_sessions a, jsonb_array_elements(a.questions) WITH ORDINALITY AS t(q, n)
        WHERE a.user_id = $1 AND a.unit_id = $2 AND a.created_at > NOW() - INTERVAL '1 day' AND (a.answers -> ((n - 1)::text) ->> 'correct') = 'false'`, [userId, unitId]);
      const w = new Set(wrong.rows.map((r) => r.id));
      if (w.size) items = [...items.filter((x) => w.has(x.id)), ...shuffle(items.filter((x) => !w.has(x.id)))].slice(0, Math.max(w.size, 6));
    }
  } else {
    const source = kind === 'review' ? 'review' : String(o.source || 'recommended');
    items = await itemsBySource(userId, source, { letter: String(o.letter || ''), topic: String(o.topic || ''), cefr: String(o.cefr || '').toUpperCase(), lemmaId: String(o.lemmaId || '') });
    if (!items.length) throw new AtlasError(409, kind === 'review' ? 'ยังไม่มีคำที่ต้องทบทวน — เยี่ยมมาก!' : 'ยังไม่มีคำให้ฝึกในหมวดนี้', 'NO_WORDS');
    const want = Array.isArray(o.types) ? o.types.filter((t) => QUIZ_MIX.includes(t)) : [];
    types = want.length ? want : ['meaning'];
    withMatch = Array.isArray(o.types) && o.types.includes('match');
  }
  const poolItems = await decoyPool(items);
  const questions = [];
  const order = kind === 'unit' ? items : shuffle(items);
  order.forEach((it, idx) => {
    // แต่ละคำ: ลองชนิดตามลำดับ (หมุนเวียน) จนได้โจทย์ที่สร้างได้จริงจากข้อมูลที่ตรวจแล้ว
    const rot = types.map((_, k) => types[(idx + k) % types.length]);
    for (const t of rot) { const q = buildQuestion(it, t, poolItems); if (q) { questions.push(q); break; } }
  });
  if (withMatch) { const m = buildMatch(items); if (m) questions.push(m); }
  if (!questions.length) throw new AtlasError(503, 'ยังสร้างแบบฝึกจากคำชุดนี้ไม่ได้ ลองชุดอื่นได้เลย');
  const id = crypto.randomUUID();
  await pool.query("DELETE FROM atlas_sessions WHERE user_id = $1 AND created_at < NOW() - INTERVAL '3 days'", [userId]);
  await pool.query(`INSERT INTO atlas_sessions (id, user_id, kind, unit_id, step, questions, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(hours => $7::int))`, [id, userId, kind, unitId, step, JSON.stringify(questions), SESSION_TTL_H]);
  return { sessionId: id, kind, unitId, step, total: questions.length, questions: questions.map(publicQ) };
}

async function answer(userId, sessionId, body = {}) {
  if (!/^[0-9a-f-]{36}$/.test(String(sessionId))) throw new AtlasError(400, 'รหัสรอบฝึกไม่ถูกต้อง');
  const i = Number(body.i);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const s = (await client.query('SELECT * FROM atlas_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE', [sessionId, userId])).rows[0];
    if (!s) throw new AtlasError(404, 'ไม่พบรอบฝึกนี้');
    if (new Date(s.expires_at).getTime() < Date.now()) throw new AtlasError(410, 'รอบฝึกนี้หมดเวลาแล้ว เริ่มรอบใหม่ได้เลย', 'EXPIRED');
    const q = Number.isInteger(i) ? s.questions[i] : null;
    if (!q) throw new AtlasError(400, 'ไม่พบข้อนี้');
    if (s.answers[String(i)]) throw new AtlasError(409, 'ตอบข้อนี้ไปแล้ว', 'ANSWERED');
    let correct; let results = [];
    let gained = 0; let last = null;
    if (q.type === 'match') {
      const pairs = body.pairs && typeof body.pairs === 'object' ? body.pairs : null;
      if (!pairs) throw new AtlasError(400, 'คำตอบไม่ถูกต้อง');
      const rightBy = Object.fromEntries(q.right.map((r) => [r.key, r.senseId]));
      results = q.left.map((l) => ({ senseId: l.senseId, correct: rightBy[pairs[l.key]] === l.senseId }));
      correct = results.every((r) => r.correct);
      const pace = await require('../../utils/answerPace').stamp(userId, client);   // v1.18.3 ประทับครั้งเดียวต่อคำขอ
      for (const it of q.items) {
        const ok = results.find((r) => r.senseId === it.senseId).correct;
        last = await recordCardAnswer(client, { userId, wordId: it.progressId, level: it.level, known: ok, skill: it.skill, rating: ok ? 'good' : 'again', pace });
        gained += last.gainedExp;
      }
    } else {
      if (q.type === 'spell') {
        if (typeof body.text !== 'string' || body.text.length > 60) throw new AtlasError(400, 'คำตอบไม่ถูกต้อง');
        correct = norm(body.text) === norm(q.answer);
      } else {
        if (typeof body.key !== 'string' || !q.options.some((o) => o.key === body.key)) throw new AtlasError(400, 'ตัวเลือกไม่ถูกต้อง');
        correct = q.options.find((o) => o.key === body.key).correct;
      }
      last = await recordCardAnswer(client, { userId, wordId: q.progressId, level: q.level, known: correct, skill: q.skill, rating: correct ? 'good' : 'again' });
      gained = last.gainedExp;
    }
    await client.query(`UPDATE atlas_sessions SET answers = answers || jsonb_build_object($2::text, jsonb_build_object('correct', $3::boolean, 'at', NOW())) WHERE id = $1`,
      [sessionId, String(i), correct]);
    if (s.unit_id) {
      await client.query(`INSERT INTO atlas_unit_progress (user_id, unit_id, correct, answered) VALUES ($1, $2, $3, 1)
        ON CONFLICT (user_id, unit_id) DO UPDATE SET correct = atlas_unit_progress.correct + $3, answered = atlas_unit_progress.answered + 1, updated_at = NOW()`,
      [userId, s.unit_id, correct ? 1 : 0]);
    }
    await client.query('COMMIT');
    const ids = q.type === 'match' ? q.senseIds : [q.senseId];
    const words = (await pool.query(`SELECT ${SENSE_COLS} ${SENSE_FROM} WHERE s.id = ANY($1)`, [ids])).rows.map(senseOf);
    return {
      correct, gainedExp: gained, noExpReason: last ? last.noExpReason : null, expKind: last ? last.expKind : null,
      status: last ? last.status : null, leveledUp: last ? last.leveledUp : false, levelInfo: last ? last.levelInfo : null,
      correctKey: q.options ? q.options.find((o) => o.correct).key : null,
      correctText: q.type === 'spell' ? q.answer : q.options ? q.options.find((o) => o.correct).text : null,
      pairs: q.type === 'match' ? Object.fromEntries(q.left.map((l) => [l.key, q.right.find((r) => r.senseId === l.senseId).key])) : null,
      results: results.length ? results : null,
      words: words.map((w) => ({ id: w.id, lemmaId: w.lemmaId, head: w.head, pos: w.pos, thai: w.thai, definition: w.definition, example: w.examples[0] || null, ipa: w.ipaUK || w.ipaUS })),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

/** จบ Unit — ตรวจฝั่งเซิร์ฟเวอร์ว่าทำแบบฝึกครบทุกขั้นจริง แล้วจ่ายรางวัลครั้งเดียว (uniqueEventId) */
async function completeUnit(userId, unitId) {
  if (!UNIT_RE.test(String(unitId))) throw new AtlasError(400, 'รหัส Unit ไม่ถูกต้อง');
  const items = await unitItems(unitId, userId);
  if (!items.length) throw new AtlasError(404, 'ไม่พบ Unit นี้');
  const plan = lessonPlan(items);
  const quizSteps = plan.map((st, k) => (st.quiz ? k : null)).filter((k) => k != null);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (step) step, jsonb_array_length(questions) AS total,
            (SELECT count(*) FROM jsonb_each(answers))::int AS answered,
            (SELECT count(*) FROM jsonb_each(answers) e WHERE (e.value->>'correct')::boolean)::int AS correct
       FROM atlas_sessions WHERE user_id = $1 AND unit_id = $2 AND kind = 'unit' AND created_at > NOW() - INTERVAL '2 days'
       ORDER BY step, ((SELECT count(*) FROM jsonb_each(answers)) >= jsonb_array_length(questions)) DESC, created_at DESC`, [userId, unitId]);
  const byStep = new Map(rows.map((r) => [r.step, r]));
  const missing = quizSteps.filter((k) => { const r = byStep.get(k); return !r || r.answered < r.total; });
  if (missing.length) throw new AtlasError(409, 'ยังทำแบบฝึกในบทเรียนนี้ไม่ครบ', 'INCOMPLETE');
  const total = quizSteps.reduce((a, k) => a + byStep.get(k).total, 0);
  const correct = quizSteps.reduce((a, k) => a + byStep.get(k).correct, 0);
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const client = await pool.connect();
  let gained = 0; const rewards = [];
  try {
    await client.query('BEGIN');
    const beforeExp = (await client.query('SELECT exp FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0].exp;
    const give = async (eventId, amount, reason) => {
      const r = await client.query('INSERT INTO atlas_reward_events (user_id, event_id, amount) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, eventId, amount]);
      if (r.rowCount) {
        gained += amount; rewards.push({ eventId, amount });
        await client.query('INSERT INTO exp_log (user_id, amount, reason) VALUES ($1, $2, $3)', [userId, amount, reason]);
      }
    };
    await give(`unit:${unitId}:complete`, REWARD.unitComplete, 'atlas_unit');
    if (pct === 100) await give(`unit:${unitId}:perfect`, REWARD.unitPerfect, 'atlas_perfect');
    if (gained) await client.query('UPDATE users SET exp = exp + $1 WHERE id = $2', [gained, userId]);
    await client.query(`INSERT INTO atlas_unit_progress (user_id, unit_id, step, steps_total, completed_at, best_pct) VALUES ($1, $2, $3, $3, NOW(), $4)
      ON CONFLICT (user_id, unit_id) DO UPDATE SET step = EXCLUDED.step, steps_total = EXCLUDED.steps_total,
        completed_at = COALESCE(atlas_unit_progress.completed_at, NOW()), best_pct = GREATEST(COALESCE(atlas_unit_progress.best_pct, 0), EXCLUDED.best_pct), updated_at = NOW()`,
    [userId, unitId, plan.length - 1, pct]);
    await client.query('COMMIT');
    const before = getLevelInfo(beforeExp); const after = getLevelInfo(beforeExp + gained);
    const learned = (await unitItems(unitId, userId)).filter((x) => LEARNED.has(x.status)).length;
    return { unitId, pct, correct, total, gainedExp: gained, rewards, alreadyRewarded: !rewards.length, leveledUp: after.level > before.level, levelInfo: after, learned, items: items.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}

/* ---------------------------------------------------------------- แนะนำ / Daily / Review (PART 24) */
async function recommended(userId, level, n = 8) {
  const idx = CEFR.indexOf(level);
  const levels = CEFR.slice(Math.max(0, idx), idx + 2);
  // หัวข้อที่สนใจ = หัวข้อของคำที่บันทึกไว้
  const topics = (await pool.query(`SELECT unnest(l.topics) AS t, count(*) AS n FROM atlas_collection c JOIN atlas_lemmas l ON l.id = c.lemma_id
     WHERE c.user_id = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 3`, [userId])).rows.map((r) => r.t);
  const { rows } = await pool.query(
    `SELECT ${LEMMA_COLS}, pr.learned, pr.due, pr.seen FROM atlas_lemmas l ${LEMMA_PROGRESS}
      WHERE l.learnable_total > 0 AND COALESCE(pr.seen, 0) = 0
        AND (l.cefr_list && $2::text[] OR (cardinality(l.cefr_list) = 0 AND l.freq_band <= $3))
      ORDER BY (l.topics && $4::text[]) DESC, (l.primary_pos IN ('noun','verb','adjective','adverb','phrasal verb','idiom')) DESC, l.freq_rank NULLS LAST LIMIT $5`,
    [userId, levels, idx <= 1 ? 2 : idx <= 3 ? 3 : 4, topics, n]);
  return rows.map(lemmaOut);
}

async function dailyWords(userId, level) {
  const idx = CEFR.indexOf(level);
  const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);   // วันตามเวลาไทย
  const { rows } = await pool.query(
    `SELECT * FROM (SELECT ${LEMMA_COLS}, pr.learned, pr.due, pr.seen FROM atlas_lemmas l ${LEMMA_PROGRESS}
       WHERE l.learnable_total > 0 AND COALESCE(pr.learned, 0) = 0 AND l.freq_rank IS NOT NULL
         AND l.primary_pos IN ('noun','verb','adjective','adverb','phrasal verb','idiom')
         AND (l.cefr_list && $2::text[] OR (cardinality(l.cefr_list) = 0 AND l.freq_band <= $3))
       ORDER BY l.freq_rank LIMIT 400) x ORDER BY md5(x.id || $4) LIMIT 5`,
    [userId, CEFR.slice(Math.max(0, idx), idx + 2), idx <= 1 ? 3 : 4, `${day}:${userId}`]);
  return rows.map(lemmaOut);
}

async function reviewCount(userId) {
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE wp.ever_known AND wp.srs_due_at <= NOW())::int AS due,
            count(*) FILTER (WHERE wp.times_seen > wp.times_correct AND NOT (wp.ever_known AND wp.srs_due_at <= NOW()))::int AS mistakes
       FROM word_progress wp JOIN atlas_senses s ON s.progress_id = wp.word_id AND s.learnable WHERE wp.user_id = $1`, [userId]);
  return { due: rows[0].due, mistakes: rows[0].mistakes, total: rows[0].due + rows[0].mistakes };
}

async function reviewList(userId) {
  const { rows } = await pool.query(
    `SELECT ${SENSE_COLS}, ${STATUS_SQL('wp')} AS user_status, wp.times_seen, wp.times_correct, wp.srs_due_at ${SENSE_FROM}
       JOIN word_progress wp ON wp.user_id = $1 AND wp.word_id = s.progress_id
      WHERE s.learnable AND ((wp.ever_known AND wp.srs_due_at <= NOW()) OR wp.times_seen > wp.times_correct)
      ORDER BY (wp.ever_known AND wp.srs_due_at <= NOW()) DESC, (wp.times_seen - wp.times_correct) DESC LIMIT 60`, [userId]);
  return rows.map((r) => ({ ...senseOf(r), status: r.user_status, timesSeen: r.times_seen, timesCorrect: r.times_correct, dueAt: r.srs_due_at }));
}

/** เพิ่มเข้าทบทวน (Add to Review) — ไม่ให้ EXP · ใช้ตารางทบทวน (SRS) เดิม */
async function addToReview(userId, senseId) {
  if (!SENSE_RE.test(String(senseId))) throw new AtlasError(400, 'รหัสความหมายไม่ถูกต้อง');
  const s = (await pool.query('SELECT progress_id, oxford_sense_id, cefr, learnable FROM atlas_senses WHERE id = $1', [senseId])).rows[0];
  if (!s) throw new AtlasError(404, 'ไม่พบความหมายนี้');
  if (!s.learnable) throw new AtlasError(409, 'ความหมายนี้ยังไม่ผ่านการตรวจ จึงยังเพิ่มเข้าทบทวนไม่ได้', 'NOT_LEARNABLE');
  await pool.query(
    `INSERT INTO word_progress (user_id, word_id, level, status, srs_due_at) VALUES ($1, $2, $3, 'learning', NOW())
     ON CONFLICT (user_id, word_id) DO UPDATE SET srs_due_at = NOW()`,
    [userId, s.progress_id, s.oxford_sense_id ? (s.cefr || 'A1') : 'WA']);
  return { ok: true, gainedExp: 0 };
}

/* ---------------------------------------------------------------- My Word Collection */
async function collection(userId) {
  const { rows } = await pool.query(`SELECT ${LEMMA_COLS}, pr.learned, pr.due, pr.seen, c.created_at AS saved_at
     FROM atlas_collection c JOIN atlas_lemmas l ON l.id = c.lemma_id ${LEMMA_PROGRESS} WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 500`, [userId]);
  return { words: rows.map(lemmaOut) };
}
async function setCollection(userId, lemmaId, on) {
  if (!LEMMA_RE.test(String(lemmaId))) throw new AtlasError(400, 'รหัสคำไม่ถูกต้อง');
  if (on) {
    const r = await pool.query('INSERT INTO atlas_collection (user_id, lemma_id) SELECT $1, id FROM atlas_lemmas WHERE id = $2 ON CONFLICT DO NOTHING', [userId, lemmaId]);
    if (!r.rowCount) { const ex = await pool.query('SELECT 1 FROM atlas_lemmas WHERE id = $1', [lemmaId]); if (!ex.rowCount) throw new AtlasError(404, 'ไม่พบคำนี้'); }
  } else await pool.query('DELETE FROM atlas_collection WHERE user_id = $1 AND lemma_id = $2', [userId, lemmaId]);
  return { ok: true, saved: Boolean(on) };
}

async function topics() {
  const { rows } = await pool.query(`SELECT t, count(*)::int AS lemmas, count(*) FILTER (WHERE learnable_total > 0)::int AS learnable
     FROM atlas_lemmas, unnest(topics) AS t GROUP BY t`);
  const by = Object.fromEntries(rows.map((r) => [r.t, r]));
  return TOPICS.map(([id, th, en]) => ({ id, th, en, lemmas: (by[id] || {}).lemmas || 0, learnable: (by[id] || {}).learnable || 0 }));
}

async function stats() {
  const meta = (await pool.query("SELECT value FROM atlas_meta WHERE key = 'dataset'")).rows[0];
  const s = (await pool.query(`SELECT count(*)::int AS senses, count(*) FILTER (WHERE learnable)::int AS learnable,
      count(*) FILTER (WHERE oxford_sense_id IS NOT NULL)::int AS oxford, count(*) FILTER (WHERE verification_status IN ('reviewed','autoChecked'))::int AS verified,
      count(*) FILTER (WHERE cardinality(thai) > 0 OR oxford_sense_id IS NOT NULL)::int AS with_thai,
      count(*) FILTER (WHERE jsonb_array_length(examples) > 0)::int AS with_example_extra,
      count(DISTINCT lemma_id) FILTER (WHERE audio_uk IS NOT NULL OR audio_us IS NOT NULL)::int AS lemmas_with_audio
     FROM atlas_senses`)).rows[0];
  const l = (await pool.query("SELECT count(*)::int AS lemmas, count(*) FILTER (WHERE kind <> 'word')::int AS phrases, count(*) FILTER (WHERE oxford)::int AS oxford FROM atlas_lemmas")).rows[0];
  return { dataset: meta ? meta.value : null, lemmas: l, senses: s };
}

module.exports = {
  hub, browse, detail, letterUnits, unit, saveStep, startSession, answer, completeUnit, recommended, dailyWords, reviewCount, reviewList,
  addToReview, collection, setCollection, topics, stats, userLevel, AtlasError,
  _internal: { lessonPlan, buildQuestion, buildMatch, fillSentence, collocationPrompt, senseOf, tooClose, STATUS_SQL, REWARD, SORTS, TOPICS },
};
