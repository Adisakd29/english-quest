// ตัวช่วย E2E: พิมพ์เฉลยของทุกข้อในบทเรียน C2 (สร้างข้อซ้ำแบบ deterministic ฝั่งเซิร์ฟเวอร์) — ใช้ในเทสต์เท่านั้น
// node test/e2e/c2_answers.js <userId> <unitId> [run]
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/eq_dev';
const S = require('../../services/vocab/c2Store');
const I = require('../../services/vocab/c2Items');
const L = require('../../services/vocab/c2Lesson');
const wordStore = require('../../utils/wordStore');
const curriculum = require('../../utils/curriculum');
(async () => {
  const [uid, unitId, run = '1'] = process.argv.slice(2);
  await wordStore.ready(); await S.ready();
  const words = wordStore.getLevelWords('C2').filter((w) => wordStore.isPlayable(w.id)).map((w) => ({ id: w.id, level: 'C2', category: w.category, topic: curriculum.c2TopicFor(w) }));
  const unit = curriculum.buildUnits(words).C2.find((u) => u.id === unitId);
  const seed = L._seedOf(Number(uid), unitId, Number(run));
  const plan = L.buildPlan(unit.wordIds.map(S.get), seed);
  const out = {};
  for (const s of plan.filter((x) => x.check)) for (const id of s.items) { const p = I.parseItemId(id); const it = I.build(p.senseId, p.type, seed); out[id] = it.input ? { text: it.accepted[0] } : { index: it.answer }; }
  console.log(JSON.stringify(out));
  process.exit(0);
})();
