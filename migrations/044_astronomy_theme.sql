-- v1.7.0: ของขวัญ "ธีมดาราศาสตร์" สำหรับผู้ที่ถึงแรงค์สูงสุด (ราชสีห์แสงเหนือ)
-- แจกย้อนหลังให้ทุกคนที่เคยไปถึง (ทุกฤดูกาล ทุกโหมด) — ไม่แตะธีมที่ใช้อยู่ ผู้เล่นเลือกใช้เองในหน้าโปรไฟล์
INSERT INTO user_themes (user_id, theme_id, source)
SELECT DISTINCT user_id, 'astronomy', 'ranked:aurora-lion:backfill'
  FROM (
    SELECT user_id FROM ranked_profiles WHERE league = 'aurora-lion' OR season_highest_league = 'aurora-lion'
    UNION
    SELECT user_id FROM user_ranked_rewards WHERE reward_id = 'title:aurora-lion'
  ) t
ON CONFLICT DO NOTHING;
