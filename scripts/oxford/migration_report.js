/*
  สร้าง reports/migration_report.md จากฐานข้อมูลจริง
    node scripts/oxford/migration_report.js
*/
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');

const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const TYPE_TH = {
  exact: 'ตรงตัว (คำ + คำใบ้ + ระดับ + ชนิดคำ)',
  homograph_by_pos: 'คำพ้องรูป แยกด้วยชนิดคำ',
  homograph_by_order: 'คำพ้องรูป แยกด้วยลำดับเอกสาร',
  cefr_corrected: 'ระดับในชุดเดิมผิด — แก้ตามต้นฉบับ',
  pos_unspecified: 'ต้นฉบับไม่ระบุชนิดคำ',
  unmatched: 'จับคู่ไม่ได้ (ไม่เดา)',
};

async function main() {
  const q = async (sql, p) => (await pool.query(sql, p)).rows;
  const byType = await q(`SELECT match_type, count(DISTINCT legacy_word_id)::int AS entries,
                                 count(sense_id)::int AS senses
                            FROM vocab_legacy_map GROUP BY 1 ORDER BY 2 DESC`);
  const [tot] = await q(`SELECT (SELECT count(*) FROM words)::int AS legacy,
                                count(DISTINCT legacy_word_id)::int AS mapped_entries,
                                count(DISTINCT sense_id)::int AS mapped_senses,
                                (SELECT count(*) FROM vocab_senses)::int AS senses
                           FROM vocab_legacy_map WHERE sense_id IS NOT NULL`);
  const special = await q(`SELECT m.legacy_word_id, w.word, w.pos, w.cefr, m.match_type, m.note,
                                  string_agg(m.public_id || ' (' || m.sense_id || ')', ', ') AS targets
                             FROM vocab_legacy_map m JOIN words w ON w.id = m.legacy_word_id
                            WHERE m.match_type <> 'exact'
                            GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY 5, 1`);
  const unmapped = await q(`SELECT s.public_id, e.headword, s.pos, s.cefr, s.source_raw_entry
                              FROM vocab_senses s JOIN vocab_entries e ON e.id = s.entry_id
                             WHERE NOT EXISTS (SELECT 1 FROM vocab_legacy_map m WHERE m.sense_id = s.id)`);
  const [content] = await q(`SELECT count(topic)::int AS topic, count(ipa)::int AS ipa,
                                    count(simple_definition)::int AS def, count(*)::int AS n FROM vocab_senses`);
  const progress = await q(`SELECT COALESCE(m.match_type, 'ไม่อยู่ในแผนที่') AS t, count(DISTINCT wp.id)::int AS n
                              FROM word_progress wp LEFT JOIN vocab_legacy_map m ON m.legacy_word_id = wp.word_id
                             WHERE wp.word_id !~ '-S'
                             GROUP BY 1`);
  const legacyProgressTable = await q(`SELECT to_regclass('word_progress_legacy') IS NOT NULL AS exists`);

  const md = ['# Migration Report — ฐานคำศัพท์เดิม → Oxford', '', `สร้างเมื่อ: ${new Date().toISOString()}`, ''];
  md.push('## 1. แผนที่ ID เดิม → sense ใหม่', '');
  md.push(`รายการในชุดเดิม ${tot.legacy} · จับคู่ได้ ${tot.mapped_entries} · ครอบคลุม sense ใหม่ ${tot.mapped_senses} จาก ${tot.senses}`, '');
  md.push(table(['ประเภทการจับคู่', 'รายการเดิม', 'sense ปลายทาง'],
    byType.map((r) => [TYPE_TH[r.match_type] || r.match_type, r.entries, r.senses])));
  md.push('', '> รายการเดิม 1 รายการอาจกลายเป็นหลาย sense เมื่อมีหลายชนิดคำ (เช่น `about prep., adv.` → 2 sense)', '');
  md.push('## 2. กรณีพิเศษ (ทุกรายการที่ไม่ใช่การจับคู่ตรงตัว)', '');
  md.push(special.length ? table(['ID เดิม', 'ชุดเดิม', 'ประเภท', 'ปลายทาง', 'หมายเหตุ'],
    special.map((r) => [r.legacy_word_id, `${r.word} ${r.pos} ${r.cefr}`, r.match_type, r.targets || '—', r.note || ''])) : '_ไม่มี_');
  md.push('', '## 3. sense ใหม่ที่ไม่มีรายการเดิม (ชุดเดิมขาดหาย)', '');
  md.push(unmapped.length ? table(['ID ใหม่', 'คำ', 'ชนิดคำ', 'ระดับ', 'ต้นฉบับ'],
    unmapped.map((r) => [r.public_id, r.headword, r.pos || '—', r.cefr, `\`${r.source_raw_entry}\``])) : '_ไม่มี_');
  md.push('', '## 4. เนื้อหาเสริมที่ย้ายจากชุดเดิม', '');
  md.push(table(['ข้อมูล', 'sense ที่มีข้อมูล', 'หมายเหตุ'], [
    ['หัวข้อ (Learning Path)', `${content.topic}/${content.n}`, 'จากหมวดความหมาย WordNet'],
    ['IPA', `${content.ipa}/${content.n}`, 'ไม่ใส่ให้คำพ้องรูป (ออกเสียงต่างตามความหมาย)'],
    ['ความหมายภาษาอังกฤษ', `${content.def}/${content.n}`, 'เฉพาะ sense ที่ชนิดคำตรงกับที่ใช้เลือกความหมายเดิม (WordNet)'],
  ]));
  md.push('', '## 5. ความก้าวหน้าผู้ใช้ที่ผูกกับ ID เดิม', '');
  md.push(progress.length ? table(['การจับคู่', 'แถว'], progress.map((r) => [TYPE_TH[r.t] || r.t, r.n])) : '_ย้ายครบแล้ว — ไม่มีแถวที่ใช้ ID เดิม_');
  if (legacyProgressTable[0].exists) {
    const perUser = await q(`SELECT u.username,
        (SELECT count(*) FROM word_progress_legacy b WHERE b.user_id = u.id)::int AS b_rows,
        (SELECT count(*) FROM word_progress_legacy b WHERE b.user_id = u.id AND b.status = 'known')::int AS b_known,
        (SELECT count(*) FROM word_progress w WHERE w.user_id = u.id)::int AS a_rows,
        (SELECT count(*) FROM word_progress w WHERE w.user_id = u.id AND w.status = 'known')::int AS a_known,
        u.exp
      FROM users u WHERE EXISTS (SELECT 1 FROM word_progress_legacy b WHERE b.user_id = u.id) ORDER BY u.id`);
    md.push('', '### ต่อผู้ใช้: ก่อนย้าย (สำรอง) เทียบหลังย้าย', '');
    md.push(table(['ผู้ใช้', 'แถวเดิม', 'รู้แล้ว (เดิม)', 'แถวใหม่', 'รู้แล้ว (ใหม่)', 'EXP'],
      perUser.map((r) => [r.username, r.b_rows, r.b_known, r.a_rows, r.a_known, r.exp])));
    md.push('', '> แถวใหม่มากกว่าเดิมเพราะรายการเดิม 1 รายการที่มีหลายชนิดคำ (เช่น `black adj., n.`) กลายเป็นหลาย sense'
      + ' และความก้าวหน้าถูกคัดลอกไปทุก sense · EXP ไม่เปลี่ยน');
  }
  md.push('', legacyProgressTable[0].exists
    ? '_สำรองข้อมูลเดิมไว้ที่ตาราง `word_progress_legacy` (ย้อนกลับได้)_'
    : '_ยังไม่ได้ย้ายความก้าวหน้า (ขั้น V4b)_');

  const out = path.join(__dirname, '..', '..', 'reports', 'migration_report.md');
  fs.writeFileSync(out, md.join('\n'));
  console.log(`สร้าง reports/migration_report.md · จับคู่ ${tot.mapped_entries}/${tot.legacy} · กรณีพิเศษ ${special.length} · sense ไม่มีรายการเดิม ${unmapped.length}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
