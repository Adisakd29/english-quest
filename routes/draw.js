/*
  v1.27.0 โหมด "วาดทายศัพท์" ถูกนำออก (ผู้เล่นใช้งานน้อย — แทนด้วย World Raid Boss)
  - ทุก endpoint ของเกมตอบ 410 MODE_REMOVED (หน้าเว็บเดิมที่ค้างในแคชจะได้ข้อความชัดเจน ไม่ค้าง)
  - ข้อมูลเดิมไม่ถูกลบ: draw_games / draw_game_players (สถิติ) · EXP ที่ได้ไปแล้ว · คำที่บันทึกเข้าคิวทบทวน
  - ผู้ดูแลยังเปิดหลักฐานภาพวาดของรายงานเก่าได้ (draw_report_evidence ผูกกับ user_reports)
*/
const express = require('express');
const pool = require('../config/db');
const { authRequired, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// ชุดสี/ขนาดเดิมของกระดาน (ใช้วาดหลักฐานเก่าให้ผู้ดูแลดูเท่านั้น)
const COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#a16207'];
const SIZES = [4, 9, 18];

router.get('/admin/evidence/:reportId', requireAdmin, async (req, res) => {
  try {
    const r = (await pool.query('SELECT report_id, room_code, word, strokes, created_at FROM draw_report_evidence WHERE report_id = $1', [Number(req.params.reportId) || 0])).rows[0];
    if (!r) return res.status(404).json({ error: 'ไม่มีหลักฐานภาพวาดของรายงานนี้', code: 'NOT_FOUND' });
    res.json({ reportId: r.report_id, room: r.room_code, word: r.word, strokes: r.strokes, at: r.created_at, palette: { colors: COLORS, sizes: SIZES } });
  } catch (err) {
    console.error('[draw/evidence]', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
  }
});

router.all('*', (_req, res) => res.status(410).json({ error: 'โหมดวาดทายศัพท์ปิดแล้ว — ลองเล่น World Raid Boss ในหน้าเล่น', code: 'MODE_REMOVED', redirect: '#/raid' }));

module.exports = router;
