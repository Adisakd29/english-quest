-- ย้อน 044: ถอนธีมดาราศาสตร์ (ผู้ที่กำลังใช้อยู่จะกลับเป็นธีมตามระบบ)
UPDATE users SET theme = 'system' WHERE theme = 'astronomy';
DELETE FROM user_themes WHERE theme_id = 'astronomy';
