/*
  v1.18.3 ตัวช่วย E2E: สมัครผู้ใช้ใหม่บนเซิร์ฟเวอร์ dev → ปลดล็อก C2 ตามกฎเดิม (เคลียร์ Boss C1) →
  เรียนบทเรียน C2 ของ Unit ที่ใหญ่ที่สุดครบ 12 ขั้นผ่าน API เดียวกับหน้าเว็บ (ตอบถูกทุกข้อ) → พิมพ์ JSON {token, unitId, known, total}
  ใช้เฉพาะทดสอบ: อ่านเฉลยจากตัวสร้างข้อฝั่งเซิร์ฟเวอร์ (seed เดียวกัน)
*/
process.env.DATABASE_URL = process.env.EQ_DB || 'postgresql://postgres:postgres@localhost:5432/eq_dev';
const URL = process.env.EQ_URL || 'http://localhost:3100';
const pool = require('../../config/db');
const S = require('../../services/vocab/c2Store');
const I = require('../../services/vocab/c2Items');
const L = require('../../services/vocab/c2Lesson');
const api = async (p, { token, method = 'GET', body } = {}) => {
  const r = await fetch(URL + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
(async () => {
  await S.ready();
  const name = `c2e${Date.now() % 1e8}`;
  const { token } = await api('/auth/register', { method: 'POST', body: { username: name, email: `${name}@gmail.com`, password: 'password123' } });
  const me = await api('/auth/me', { token });
  const uid = me.user.id;
  await pool.query(`INSERT INTO assessments (user_id, kind, ref, questions, status, passed, completed_at) VALUES ($1, 'boss', 'C1', '[]'::jsonb, 'completed', TRUE, NOW())`, [uid]);
  const { units } = await require('../../routes/path').getUserPathState(uid);
  const unit = [...units.C2].sort((a, b) => b.wordIds.length - a.wordIds.length)[0].id;
  const ov = await api(`/c2/lessons/${unit}`, { token });
  for (let k = ov.current; k < ov.total; k += 1) {
    const st = await api(`/c2/lessons/${unit}/steps/${k}`, { token });
    for (const it of st.content.items || []) {
      const p = I.parseItemId(it.id); const q = I.build(p.senseId, p.type, L._seedOf(uid, unit, ov.runNo));
      await api(`/c2/lessons/${unit}/steps/${k}/answer`, { token, method: 'POST', body: { itemId: it.id, answer: q.input ? q.accepted[0] : q.answer } });
    }
    await api(`/c2/lessons/${unit}/steps/${k}/complete`, { token, method: 'POST' });
  }
  const end = await api(`/c2/lessons/${unit}`, { token });
  console.log(JSON.stringify({ token, unitId: unit, known: end.known, total: end.totalSenses, steps: end.total }));
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
