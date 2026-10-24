/*
  Privacy-by-Default (v1.8.0) — EnglishQuest เป็นแพลตฟอร์มการศึกษา (ผู้เรียนจำนวนมากเป็นนักเรียน)
  ระดับ: 'private' = ฉันเท่านั้น · 'friends' = เพื่อนที่ยอมรับแล้ว · 'public' = ผู้ใช้ที่เข้าสู่ระบบ
  ค่าเริ่มต้นใช้กับทุกบัญชี (เดิม/ใหม่) จนกว่าเจ้าของจะเปลี่ยนเอง — ไม่มีแถว = ใช้ค่านี้
  ข้อมูลที่ไม่เปิดเผยเลยไม่ว่าตั้งค่าอะไร: email · ชื่อจริง · รูปจาก Google (นอกจากเจ้าของเลือกเป็นรูปโปรไฟล์) · วันเกิด · ที่อยู่ ·
  รายการ Coin · รายละเอียดคำตอบ/ประวัติการเรียนรายข้อ · เวลาออนไลน์ (เพื่อนเท่านั้นตามระบบเดิม)
*/
const LEVELS = ['private', 'friends', 'public'];
const FIELDS = {
  profile:      { col: 'profile_visibility',      def: 'friends', th: 'หน้าโปรไฟล์', hint: 'ใครเปิดดูหน้าโปรไฟล์ของฉันได้' },
  avatar:       { col: 'avatar_visibility',       def: 'friends', th: 'Avatar และชุดที่สวม', hint: 'Avatar Showcase ในหน้าโปรไฟล์' },
  level:        { col: 'level_visibility',        def: 'friends', th: 'Account Level' },
  rank:         { col: 'rank_visibility',         def: 'friends', th: 'Rank ในโปรไฟล์', hint: 'ไม่กระทบตารางอันดับและการจับคู่ Ranked' },
  achievements: { col: 'achievements_visibility', def: 'friends', th: 'Achievements' },
  stats:        { col: 'stats_visibility',        def: 'private', th: 'สถิติการเรียน' },
  vocab:        { col: 'vocab_visibility',        def: 'private', th: 'ความคืบหน้าคำศัพท์' },
  grammar:      { col: 'grammar_visibility',      def: 'private', th: 'ความคืบหน้าแกรมม่า' },
  toeic:        { col: 'toeic_visibility',        def: 'private', th: 'ความคืบหน้า TOEIC' },
  coins:        { col: 'coins_visibility',        def: 'private', th: 'ยอด Coin' },
  inventory:    { col: 'inventory_visibility',    def: 'private', th: 'ตู้เสื้อผ้า / ของที่มี' },
  friends:      { col: 'friends_list_visibility', def: 'private', th: 'รายชื่อเพื่อน' },
};
const FLAGS = {
  allowFriendRequests: { col: 'allow_friend_requests', def: true, th: 'ให้คนอื่นส่งคำขอเป็นเพื่อนได้' },
  discoverable:        { col: 'discoverable',          def: true, th: 'ให้ค้นหาเจอจากชื่อผู้ใช้ (ค้นหาเพื่อน)' },
};
module.exports = { LEVELS, FIELDS, FLAGS };
