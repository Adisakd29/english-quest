/*
  Event Carousel (v1.17.0) — ค่าตั้งของแบนเนอร์กิจกรรมบนหน้าแรก
  ข้อมูลกิจกรรมจริงอยู่ในตาราง events (กิจกรรมจาก config/events.js + Ranked Season + ภารกิจประจำวัน + กิจกรรมที่ผู้ดูแลสร้าง)
  ไฟล์นี้กำหนดแค่ "ประเภท" (ป้าย/ภาพเริ่มต้น/ปลายทาง) และขอบเขตที่ผู้ดูแลตั้งได้
  เวลาทั้งหมดตัดสินด้วยเวลาเซิร์ฟเวอร์ · ป้ายวันที่แสดงตามเขตเวลา Asia/Bangkok
*/
const TIMEZONE = 'Asia/Bangkok';

// art = ไฟล์ /assets/events/banners/<art>-{640,1280}.webp (สร้างด้วย scripts/event-banners/render.js)
const TYPES = {
  adventure:   { th: 'ผจญภัย', en: 'Adventure', art: 'adventure', route: 'event' },
  festival:    { th: 'เทศกาล', en: 'Festival', art: 'festival', route: 'festival' },
  seasonal:    { th: 'กิจกรรมตามฤดูกาล', en: 'Seasonal Event', art: 'festival', route: 'shop' },
  ranked:      { th: 'Ranked Season', en: 'Ranked Season', art: 'ranked', route: 'ranked' },
  daily:       { th: 'ภารกิจประจำวัน', en: 'Daily Quest', art: 'daily', route: 'learn' },
  vocab:       { th: 'Vocabulary Challenge', en: 'Vocabulary Challenge', art: 'vocab', route: 'learn' },
  grammar:     { th: 'Grammar Challenge', en: 'Grammar Challenge', art: 'grammar', route: 'grammar' },
  toeic:       { th: 'TOEIC Event', en: 'TOEIC Event', art: 'toeic', route: 'toeic' },
  streak:      { th: 'Learning Streak', en: 'Learning Streak', art: 'streak', route: 'learn' },
  achievement: { th: 'Achievement Challenge', en: 'Achievement Challenge', art: 'achievement', route: 'achievements' },
};
// ภาพที่มีให้เลือก (ผู้ดูแลเลือกแทนการอัปโหลดได้)
const ARTS = ['adventure', 'loykrathong', 'festival', 'ranked', 'daily', 'vocab', 'grammar', 'toeic', 'streak', 'achievement',
  'halloween', 'christmas', 'newyear', 'valentine', 'school'];
// ปลายทางที่ผู้ดูแลเลือกได้ (ต้องเป็นหน้าที่มีจริงใน public/js/app.js ROUTES)
const ROUTES = ['learn', 'vocab', 'grammar', 'toeic', 'atlas', 'flashcards', 'graded', 'ranked', 'leaderboard', 'friends',
  'shop', 'wardrobe', 'achievements', 'play', 'profile', 'event', 'festival'];
// เงื่อนไขรับรางวัลของกิจกรรมที่ผู้ดูแลสร้าง — นับจากข้อมูลจริงในช่วงเวลากิจกรรมเท่านั้น
const ELIGIBILITY = {
  none:            { th: 'ไม่มีรางวัล (แบนเนอร์ประชาสัมพันธ์)' },
  correct_answers: { th: 'ตอบถูกสะสม', unit: 'ข้อ', skills: ['any', 'vocab', 'grammar'] },
  ranked_matches:  { th: 'แข่ง Ranked จบ', unit: 'เกม' },
  daily_goals:     { th: 'ทำเป้าหมายรายวันสำเร็จ', unit: 'วัน' },
};
const LIMITS = { coins: 500, exp: 500, items: 3, target: 1000, title: 80, description: 280, priority: 1000 };

module.exports = { TIMEZONE, TYPES, ARTS, ROUTES, ELIGIBILITY, LIMITS };
