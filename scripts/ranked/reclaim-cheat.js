#!/usr/bin/env node
/*
  v1.18.3 ริบแต้มแรงค์ที่ได้จากการโกง (บอท/สคริปต์ตอบเร็วเกินมนุษย์) — ฤดูกาลปัจจุบัน

  เกณฑ์เดียวกับระบบตอนจบเกม (config/leagues.js INTEGRITY):
    ในแมตช์เดียว ตอบถูกเร็วกว่า minHumanMs (600 ms) ตั้งแต่ flagFastCorrect (3) ข้อ
  สิ่งที่ทำ:
    - ผู้โกง: ริบแต้ม (QR) ที่ "ได้" จากแมตช์เหล่านั้น -> ตำแหน่งแรงค์คิดใหม่จาก QR (ไม่สูงกว่าเดิม) · ยกเลิกสถานะรอเลื่อนขั้น ·
              จุดสูงสุดของฤดูกาลคิดใหม่จากแมตช์ปกติ · ตัดจำนวนชนะของแมตช์ที่ถูกริบ
    - คู่แข่งผู้เล่นจริง (PvP/ทีม) ที่แพ้ผู้โกงในแมตช์เหล่านั้น: คืนแต้มที่เสียไป (ภายใน League เดิม)
    - EXP (เจ้าของแอปอนุญาต 9 พ.ย. 2569): ริบเฉพาะ EXP ที่ได้จาก
        · แมตช์ Ranked ที่ตอบเร็วผิดปกติ (ทุกฤดูกาล)
        · ข้อในหมวดเรียนที่ตอบห่างจากข้อก่อนหน้า < minHumanMs (เฉพาะผู้ใช้ที่มีข้อแบบนี้ตั้งแต่ EXP_FLAG_MIN = 10 ข้อ)
      บันทึกเป็นแถวติดลบใน exp_log ลงวันที่เดิมของ EXP ก้อนนั้น (กระดานรายสัปดาห์ย้อนหลังถูกต้อง)
  ไม่แตะ: Coin / ของในคลัง / ของตกแต่งที่ได้แล้ว / ประวัติแมตช์
  ทุกการปรับเก็บค่าก่อน-หลังใน ranked_qr_reclaims -> คืนค่าได้ด้วย --revert <batchId>

  ใช้:
    node scripts/ranked/reclaim-cheat.js                 # ดูรายงานอย่างเดียว (ไม่แก้อะไร)
    node scripts/ranked/reclaim-cheat.js --apply         # ทำจริง
    node scripts/ranked/reclaim-cheat.js --revert rc-xxxx
    ตัวเลือก: --season <id> (ค่าเริ่มต้น = ฤดูกาลที่เปิดอยู่) · --json (พิมพ์ผลเป็น JSON)
*/
const pool = require('../../config/db');
const I = require('../../services/ranked/integrity');
const { labelOf } = require('../../config/leagues');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

async function names(ids) {
  if (!ids.length) return new Map();
  const { rows } = await pool.query('SELECT id, username FROM users WHERE id = ANY($1::int[])', [ids]);
  return new Map(rows.map((r) => [r.id, r.username]));
}
const pos = (s) => `${labelOf(s.league, s.divisionIndex)} (${s.qr} QR)`;

async function main() {
  const { runMigrations } = require('../../db/migrate');
  await runMigrations(pool);
  if (has('--revert')) {
    const id = val('--revert');
    if (!id) throw new Error('ระบุ batchId: --revert rc-xxxx');
    const r = await I.revertReclaim(pool, id);
    console.log(has('--json') ? JSON.stringify(r) : `คืนค่า batch ${r.batchId} แล้ว: แรงค์ ${r.reverted} โปรไฟล์ · EXP ${r.expReverted} คน`);
    return;
  }
  const plan = await I.planReclaim(pool, { seasonId: val('--season') ? Number(val('--season')) : null });
  const expPlan = await I.planExpReclaim(pool);
  const nm = await names([...new Set([...plan.cheaters.map((c) => c.userId), ...plan.refunds.map((r) => r.userId), ...expPlan.users.map((u) => u.userId)])]);
  if (has('--json') && !has('--apply')) { console.log(JSON.stringify({ plan, expPlan })); return; }
  if (!plan.seasonId) console.log('ไม่มีฤดูกาลที่เปิดอยู่ (ตรวจเฉพาะ EXP)');

  console.log(`ฤดูกาล #${plan.seasonId} · เกณฑ์: ตอบถูกเร็วกว่า ${I.INTEGRITY.minHumanMs} ms ตั้งแต่ ${I.INTEGRITY.flagFastCorrect} ข้อในเกมเดียว`);
  console.log(`พบ ${plan.flagged.length} แมตช์ผิดปกติ · ผู้เล่นที่จะถูกริบแต้ม ${plan.cheaters.length} โปรไฟล์ · คู่แข่งที่จะได้แต้มคืน ${plan.refunds.length} โปรไฟล์\n`);
  for (const c of plan.cheaters) {
    console.log(`- ${nm.get(c.userId) || c.userId} (id ${c.userId}) [${c.mode}] ริบ ${c.gain} QR จาก ${c.matches.length} แมตช์`);
    for (const d of c.details) console.log(`    แมตช์ #${d.matchId} ${d.outcome || '-'} +${d.gain} · ถูกเร็ว ${d.fastCorrect}/${d.answered} ข้อ · เร็วสุด ${d.minMs} ms · เฉลี่ย ${d.avgMs} ms`);
  }
  for (const r of plan.refunds) console.log(`+ คืน ${r.amount} QR ให้ ${nm.get(r.userId) || r.userId} (id ${r.userId}) [${r.mode}] — แพ้ผู้โกงใน ${r.matches.length} แมตช์`);
  console.log(`\nEXP: ผู้ใช้ที่จะถูกริบ ${expPlan.users.length} คน (หมวดเรียนนับเมื่อมีข้อเร็วเกินมนุษย์ตั้งแต่ ${expPlan.expFlagMin} ข้อ)`);
  for (const u of expPlan.users) {
    console.log(`- ${nm.get(u.userId) || u.userId} (id ${u.userId}) ริบ ${u.total} EXP · Ranked ${u.ranked.amount} (${u.ranked.items.length} แมตช์) · หมวดเรียน ${u.learning.amount}`
      + (u.learning.fastAnswers ? ` (${u.learning.fastAnswers} ข้อ · ห่างกันน้อยสุด ${u.learning.minGapMs} ms)` : ''));
  }
  if (!plan.cheaters.length && !plan.refunds.length && !expPlan.users.length) { console.log('ไม่มีอะไรต้องปรับ'); return; }
  if (!has('--apply')) { console.log('\n(ยังไม่ได้แก้อะไร — เพิ่ม --apply เพื่อทำจริง)'); return; }

  const out = await I.applyReclaim(pool, plan, expPlan);
  if (has('--json')) { console.log(JSON.stringify(out)); return; }
  console.log(`\nทำแล้ว · batchId = ${out.batchId} (คืนค่าได้ด้วย --revert ${out.batchId})`);
  for (const c of out.cheaters) console.log(`  ${nm.get(c.userId) || c.userId}: ${pos(c.from)} -> ${pos(c.to)}`);
  for (const r of out.refunds) console.log(`  ${nm.get(r.userId) || r.userId}: ${pos(r.from)} -> ${pos(r.to)}`);
  for (const e of out.exp) console.log(`  ${nm.get(e.userId) || e.userId}: EXP ${e.expBefore} -> ${e.expAfter} (−${e.amount})`);
}

main().catch((e) => { console.error('ผิดพลาด:', e.message); process.exitCode = 1; }).finally(() => pool.end());
