/*
  Achievements (v1.8.0) — ปลดล็อกจากข้อมูลการเรียนจริงในฐานข้อมูล (ตรวจฝั่งเซิร์ฟเวอร์ทั้งหมด) · ได้ครั้งเดียว
  รางวัล: Coin, ของตกแต่ง (ซื้อไม่ได้ ป้าย "Achievement Reward") หรือทั้งสองอย่าง — ไม่มีผลต่อ EXP / Rank / คะแนน
  metric -> services/avatar/achievements.js (ค่าที่นับได้ = progress, target = เป้า)
*/
module.exports = [
  { id: 'first_steps', name: 'First Steps', nameTh: 'ก้าวแรก', desc: 'ทำเป้าหมายรายวันสำเร็จครั้งแรก', icon: 'flag',
    metric: 'goal_days', target: 1, coins: 30 },
  { id: 'stylist', name: 'Stylist', nameTh: 'นักแต่งตัว', desc: 'บันทึกชุดลงช่อง Outfit ครั้งแรก', icon: 'shirt',
    metric: 'presets', target: 1, coins: 20 },
  { id: 'level_10', name: 'Level 10', nameTh: 'เลเวล 10', desc: 'Account Level ถึง 10', icon: 'star',
    metric: 'level', target: 10, coins: 80 },
  { id: 'vocab_300', name: 'Word Collector', nameTh: 'นักสะสมคำศัพท์', desc: 'รู้คำศัพท์ (Known) 300 คำ', icon: 'book',
    metric: 'known_words', target: 300, coins: 100, item: 'hat_crown_vocab' },
  { id: 'grammar_master', name: 'Grammar Master', nameTh: 'เซียนแกรมม่า', desc: 'เชี่ยวชาญ (Mastered) บทเรียนแกรมม่า 5 บท', icon: 'pen',
    metric: 'grammar_mastered', target: 5, coins: 100, item: 'glasses_grammar' },
  { id: 'toeic_listener', name: 'TOEIC Listener', nameTh: 'นักฟัง TOEIC', desc: 'ตอบ TOEIC Part 1 ถูก 40 ข้อ', icon: 'headphones',
    metric: 'toeic_correct', target: 40, coins: 80, item: 'phones_toeic' },
  { id: 'c2_scholar', name: 'C2 Scholar', nameTh: 'นักปราชญ์ C2', desc: 'จบบทเรียนคำศัพท์ C2 ครบ 3 Unit', icon: 'crown',
    metric: 'c2_units', target: 3, coins: 150, item: 'back_cape_c2' },
  // ป้ายกิจกรรม: มอบตอนรับรางวัลเควสต์ "Festival Champion" (services/eventFestival.js) — metric 'event_badge' ไม่ถูกนับอัตโนมัติ
  { id: 'halloween_festival_2026', name: 'Halloween Festival Champion 2026', nameTh: 'แชมป์เทศกาลฮาโลวีน 2026', desc: 'ทำเควสต์การเรียนครบใน Halloween Costume Festival 2026', icon: 'award',
    metric: 'event_badge', target: 1, coins: 0, event: 'halloween-costume-2026' },
  { id: 'loykrathong_festival_2026', name: 'Loy Krathong Festival Champion 2026', nameTh: 'แชมป์เทศกาลลอยกระทง 2569', desc: 'ทำเควสต์การเรียนครบในเทศกาลลอยกระทง 2569', icon: 'award',
    metric: 'event_badge', target: 1, coins: 0, event: 'loykrathong-2026' },
  { id: 'rank_climber', name: 'Rank Climber', nameTh: 'นักไต่แรงค์', desc: 'ขึ้นถึง League ที่ 3 ในโหมด Ranked (โหมดใดก็ได้)', icon: 'trophy',
    metric: 'league_order', target: 3, coins: 100, item: 'outer_rank_jacket' },
];
