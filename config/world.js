/*
  EnglishQuest World (Multiplayer 3D Lobby) — ค่าตั้งทั้งหมดที่เดียว
  ความจุห้องตั้งจากผล Load Test จริง (docs/WORLD.md §Load Test) — ไม่อ้างตัวเลขที่ไม่ได้ทดสอบ
*/
const WORLD = {
  // ---------- ห้อง ----------
  capacity: Number(process.env.WORLD_ROOM_CAPACITY) || 20,   // ผู้เล่นต่อห้อง (ทดสอบแล้วที่ 10/20/25 — ดู docs)
  maxRooms: Number(process.env.WORLD_MAX_ROOMS) || 30,       // ห้องสาธารณะสูงสุดต่อเซิร์ฟเวอร์ (campus-1 … campus-N)
  emptyRoomTtlMs: 5 * 60 * 1000,                             // ห้องว่างเกินนี้ = ลบ (ยกเว้น campus-1)
  reconnectGraceMs: 30 * 1000,                               // หลุดแล้วกลับมาในเวลานี้ = ได้ที่เดิม (ห้อง/ตำแหน่ง) · Avatar หายจากห้องทันทีระหว่างนั้น
  afkWarnMs: 5 * 60 * 1000,                                  // ไม่ขยับ/ไม่ทำอะไร 5 นาที = แสดงสถานะ AFK
  afkKickMs: 15 * 60 * 1000,                                 // 15 นาที = ออกจากห้องอัตโนมัติ (คืนที่ให้คนอื่น)

  // ---------- การซิงก์ ----------
  tickHz: 10,                     // เซิร์ฟเวอร์ส่ง snapshot 10 ครั้ง/วินาที (ไม่ส่งทุกเฟรม)
  clientSendHz: 10,               // client ส่งตำแหน่งไม่เกิน 10 ครั้ง/วินาที (และเฉพาะตอนเปลี่ยน)
  nearRadius: 18,                 // ผู้เล่นในระยะนี้ได้อัปเดตทุก tick
  farEveryTicks: 4,               // ไกลกว่านั้น = อัปเดตทุก 4 tick (Distance-based Updates)
  walkSpeed: 2.3,                 // m/s (ตัวละครสูง ~1 m)
  runSpeed: 4.2,
  speedSlack: 1.35,               // เผื่อ jitter เครือข่าย
  correctAfter: 0.6,              // เมตร — ตำแหน่งที่ client ส่งมาเพี้ยนเกินนี้ = ส่งตำแหน่งที่ถูกกลับไป

  // ---------- การโต้ตอบ ----------
  interactRange: 4.0,             // m — โบกมือ / ชวนทำกิจกรรม / เพิ่มเพื่อนจากในโลก (เพื่อนชวนได้ทั้งห้อง)
  seatRange: 1.8,
  localChatRange: 12,             // m — แชทใกล้ตัว
  inviteTtlMs: 45 * 1000,

  // ---------- แชท ----------
  chatMaxLen: 120,
  chatMinIntervalMs: 1500,        // ห่างกันอย่างน้อย 1.5 วินาที
  chatBurst: { limit: 5, windowMs: 15 * 1000 },
  duplicateWindowMs: 30 * 1000,   // ข้อความซ้ำเดิมภายใน 30 วินาที = สแปม
  textMinAccountAgeH: 72,         // พิมพ์ข้อความเองได้เมื่อบัญชีอายุ ≥ 3 วัน (กันบัญชีสแปมใหม่)
  chatLogDays: 30,                // เก็บบันทึกแชท 30 วันแล้วลบ
  autoMuteFlags: 3,               // ถูกตัวกรองจับ 3 ครั้งใน 10 นาที = ปิดแชทชั่วคราว 10 นาที (ระหว่างนั้นผู้ดูแลตรวจได้)
  autoMuteMs: 10 * 60 * 1000,
};

// ค่าเริ่มต้นความเป็นส่วนตัว (คำนึงถึงผู้เรียนที่เป็นนักเรียน): แชทได้เฉพาะประโยคสำเร็จรูป · ชวนทำกิจกรรมได้เฉพาะเพื่อน
const SETTINGS = {
  showInLobby:        { col: 'show_in_lobby',        def: true,      type: 'bool', th: 'ให้คนอื่นเห็นฉันใน Lobby', hint: 'ปิด = เข้า Lobby แบบห้องส่วนตัว (เห็นแค่ตัวเอง)' },
  allowFriendInvites: { col: 'allow_friend_invites', def: true,      type: 'bool', th: 'ให้เพื่อนชวนฉันได้', hint: 'คำชวนจากเพื่อนใน Lobby' },
  practiceInvites:    { col: 'practice_invites',     def: 'friends', type: ['nobody', 'friends', 'everyone'], th: 'ใครชวนฉันฝึก/แข่งได้' },
  chatMode:           { col: 'chat_mode',            def: 'phrases', type: ['off', 'phrases', 'text'], th: 'แชทใน Lobby', hint: 'ประโยคสำเร็จรูป = ปลอดภัยที่สุด (ค่าเริ่มต้น)' },
  joinMyRoom:         { col: 'join_my_room',         def: 'friends', type: ['nobody', 'friends'], th: 'ใครตามมาห้องเดียวกับฉันได้' },
};

// ประโยคภาษาอังกฤษสำเร็จรูป (ส่งเป็นรหัส — เซิร์ฟเวอร์แปลงเป็นข้อความเอง จึงปลอมข้อความผ่านช่องนี้ไม่ได้)
const PHRASES = [
  { id: 'hello', en: 'Hello!', th: 'สวัสดี!', cat: 'greet' },
  { id: 'hi_there', en: 'Hi there! How are you?', th: 'สวัสดี! สบายดีไหม', cat: 'greet' },
  { id: 'nice_meet', en: 'Nice to meet you!', th: 'ยินดีที่ได้รู้จัก!', cat: 'greet' },
  { id: 'im_fine', en: "I'm fine, thank you!", th: 'สบายดี ขอบคุณนะ!', cat: 'greet' },
  { id: 'studying', en: 'What are you studying?', th: 'คุณกำลังเรียนอะไรอยู่', cat: 'learn' },
  { id: 'studying_vocab', en: "I'm learning new words.", th: 'ฉันกำลังเรียนคำศัพท์ใหม่', cat: 'learn' },
  { id: 'studying_grammar', en: "I'm practicing grammar.", th: 'ฉันกำลังฝึกแกรมม่า', cat: 'learn' },
  { id: 'practice', en: 'Would you like to practice English?', th: 'อยากฝึกภาษาอังกฤษด้วยกันไหม', cat: 'learn' },
  { id: 'grammar_challenge', en: "Let's try a grammar challenge!", th: 'มาลองท้าแกรมม่ากัน!', cat: 'learn' },
  { id: 'vocab_battle', en: 'Want to play a word battle?', th: 'มาแข่งคำศัพท์กันไหม', cat: 'play' },
  { id: 'good_luck', en: 'Good luck!', th: 'ขอให้โชคดี!', cat: 'play' },
  { id: 'good_game', en: 'Good game!', th: 'เกมดีมาก!', cat: 'play' },
  { id: 'well_done', en: 'Well done!', th: 'เก่งมาก!', cat: 'play' },
  { id: 'thank_you', en: 'Thank you!', th: 'ขอบคุณ!', cat: 'polite' },
  { id: 'youre_welcome', en: "You're welcome!", th: 'ยินดีครับ/ค่ะ!', cat: 'polite' },
  { id: 'sorry', en: 'Sorry!', th: 'ขอโทษนะ!', cat: 'polite' },
  { id: 'nice_outfit', en: 'I like your outfit!', th: 'ชอบชุดของคุณจัง!', cat: 'polite' },
  { id: 'happy_halloween', en: 'Happy Halloween!', th: 'สุขสันต์วันฮาโลวีน!', cat: 'event' },
  { id: 'see_you', en: 'See you later!', th: 'แล้วเจอกันนะ!', cat: 'greet' },
  { id: 'bye', en: 'Goodbye!', th: 'ลาก่อน!', cat: 'greet' },
];
const PHRASE_BY_ID = Object.fromEntries(PHRASES.map((p) => [p.id, p]));

// ท่าทาง (ชื่อคลิปใน CHR_Base_01 — Shared Skeleton เดียวกับ Wardrobe · ผ่านด่านตรวจเสื้อผ้าทุกชิ้นใน Blender)
const EMOTES = { wave: 'wave', celebrate: 'celebrate', cheer: 'victory', shrug: 'defeat' };
const STATES = ['idle', 'walk', 'run', 'sit'];

module.exports = { WORLD, SETTINGS, PHRASES, PHRASE_BY_ID, EMOTES, STATES };
