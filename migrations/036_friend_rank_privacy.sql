-- 036: ซ่อนตำแหน่งแรงค์ของตัวเองจากเพื่อนบนแผนที่ "เส้นทางสู่แรงค์สูงสุด" (ค่าเริ่มต้น = เพื่อนเห็นได้)
ALTER TABLE users ADD COLUMN IF NOT EXISTS rank_hidden_from_friends BOOLEAN NOT NULL DEFAULT FALSE;
