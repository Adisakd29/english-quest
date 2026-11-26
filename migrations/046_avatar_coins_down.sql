-- ย้อน v1.8.0 (ลบเฉพาะตารางของระบบ Avatar/Coin · ข้อมูลเดิมทั้งหมดไม่ถูกแตะ)
DROP TABLE IF EXISTS user_achievements;
DROP TABLE IF EXISTS outfit_presets;
DROP TABLE IF EXISTS user_avatar;
DROP TABLE IF EXISTS user_inventory;
DROP TABLE IF EXISTS coin_transactions;
DROP TABLE IF EXISTS coin_wallets;
DROP TABLE IF EXISTS avatar_assets;
DROP TABLE IF EXISTS avatar_items;
DELETE FROM schema_migrations WHERE id IN ('046_avatar_coins.sql', '047_avatar_backfill.js', '048_avatar_optin_3d.js');
