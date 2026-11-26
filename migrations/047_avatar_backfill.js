// v1.8.0: นำเข้าแคตตาล็อก Avatar + เตรียมผู้ใช้เดิมทุกคน (กระเป๋า Coin + Coin ต้อนรับ 150 · ของเริ่มต้น · ชุดเริ่มต้น)
// idempotent: รันซ้ำได้ — Coin ต้อนรับมี source_key 'welcome' (UNIQUE ต่อผู้ใช้) จึงไม่มีวันได้ซ้ำ · ของเริ่มต้น ON CONFLICT DO NOTHING
// ไม่แตะ users.exp / Rank / Progress / เพื่อน / Leaderboard ใด ๆ
const { syncCatalog } = require('../services/avatar/catalog');
const { ensureUser } = require('../services/avatar');

async function run(client) {
  await require('./048_avatar_optin_3d').ensureColumns(client);   // คอลัมน์ Avatar opt-in/3D (DB ใหม่: 047 รันก่อน 048)
  await syncCatalog(client, { log: (m) => console.log(m) });
  const { rows } = await client.query('SELECT id FROM users ORDER BY id');
  for (const r of rows) await ensureUser(r.id, client);
  console.log(`[avatar] เตรียมผู้ใช้เดิม ${rows.length} บัญชี`);
}

module.exports = { run };
