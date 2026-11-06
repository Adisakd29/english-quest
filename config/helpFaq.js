/*
  ผู้ช่วยค้นคำตอบ (v1.10.0 Phase 3) — คำถามที่ผู้เรียนไทยถามบ่อย (เขียนขึ้นเองสำหรับ EnglishQuest · ไม่ใช้ AI ตอนใช้งาน)
  match: รายการชุดคำ — ถ้าคำถามมี "ทุกคำ" ในชุดใดชุดหนึ่ง ถือว่าตรง (อังกฤษ = ทั้งคำ · ไทย = มีข้อความนั้นอยู่)
  topic: หัวข้อในหลักสูตร CEFR ที่อธิบายละเอียด
*/
const FAQ = [
  { id: 'since-for', q: 'since กับ for ต่างกันยังไง', match: [['since', 'for']], topic: 'b1-pp-continuous',
    a: 'for + ระยะเวลา (นานเท่าไร) เช่น for two years · since + จุดเริ่มต้น (ตั้งแต่เมื่อไร) เช่น since 2020, since Monday · ทั้งสองคำมักใช้กับ Present Perfect',
    ex: ['I have lived here for five years.', 'I have lived here since 2020.'] },
  { id: 'a-an', q: 'ใช้ a หรือ an', match: [['a', 'an'], ['article'], ['คำนำหน้านาม']], topic: 'a1-articles',
    a: 'ดูที่ "เสียง" ของคำถัดไป ไม่ใช่ตัวสะกด: an ก่อนเสียงสระ (an apple, an hour) · a ก่อนเสียงพยัญชนะ (a book, a university เพราะออกเสียง ยู)',
    ex: ['an hour', 'a uniform', 'an umbrella'] },
  { id: 'much-many', q: 'much กับ many ใช้ต่างกันยังไง', match: [['much', 'many'], ['นับได้', 'นับไม่ได้']], topic: 'a2-countable-uncountable',
    a: 'many + คำนามนับได้พหูพจน์ (many books) · much + คำนามนับไม่ได้ (much water) · a lot of ใช้ได้ทั้งสองแบบ และพบบ่อยในประโยคบอกเล่า',
    ex: ['How many apples do you want?', 'We don\'t have much time.'] },
  { id: 'in-on-at', q: 'in on at ใช้ยังไง', match: [['in', 'on', 'at'], ['บุพบท']], topic: 'a1-prepositions',
    a: 'เวลา: at + เวลาเจาะจง (at 7 o\'clock) · on + วัน/วันที่ (on Monday) · in + เดือน/ปี/ช่วงยาว (in May) · สถานที่: at จุด, on พื้นผิว, in ข้างใน',
    ex: ['at 8 a.m.', 'on Friday', 'in 2025'] },
  { id: 'pp-past', q: 'Present Perfect กับ Past Simple ต่างกันยังไง', match: [['present perfect', 'past'], ['have', 'v3'], ['เคย']], topic: 'b1-pp-vs-past',
    a: 'Past Simple = เรื่องจบแล้วและบอกเวลาชัด (yesterday, last week) · Present Perfect = เกิดแล้วแต่ไม่บอกเวลา สนใจประสบการณ์หรือผลตอนนี้ (ever, never, just, already)',
    ex: ['I saw that film last week.', 'I have seen that film twice.'] },
  { id: 'v2-v3', q: 'กริยาช่องที่ 2 และ 3 ใช้เมื่อไร', match: [['ช่อง'], ['v2'], ['v3'], ['irregular']], topic: 'a2-past-simple',
    a: 'ช่อง 2 (V2) ใช้เล่าอดีต: I went · ช่อง 3 (V3) ใช้หลัง have/has/had (Perfect) และ be (Passive): I have gone, It was made · หลัง did/didn\'t ใช้ช่อง 1 เสมอ',
    ex: ['She went home.', 'She has gone home.', 'Did she go home?'] },
  { id: 'make-do', q: 'make กับ do ต่างกันยังไง', match: [['make', 'do']], topic: null,
    a: 'do ใช้กับงาน/กิจกรรม/หน้าที่ (do homework, do the dishes, do exercise) · make ใช้กับการสร้าง/ทำให้เกิดสิ่งใหม่ (make a cake, make a mistake, make a decision) — ส่วนใหญ่ต้องจำเป็นคู่คำ',
    ex: ['do my homework', 'make a decision'] },
  { id: 'say-tell', q: 'say tell speak talk ต่างกันยังไง', match: [['say', 'tell'], ['speak', 'talk']], topic: 'b1-reported-speech',
    a: 'say + สิ่งที่พูด (say hello) · tell + คน + เรื่อง (tell me a story) · speak + ภาษา หรือพูดแบบทางการ (speak Thai) · talk = คุยกัน (talk to a friend)',
    ex: ['She said that she was tired.', 'She told me that she was tired.'] },
  { id: 'gerund-inf', q: 'ตามด้วย -ing หรือ to + กริยา', match: [['ing', 'to'], ['gerund'], ['infinitive']], topic: 'b1-gerund-vs-infinitive',
    a: 'บางกริยาตามด้วย -ing (enjoy, finish, avoid, mind) · บางกริยาตามด้วย to + V1 (want, need, decide, hope) · บางคำได้ทั้งสองแต่ความหมายต่าง (stop, remember, try)',
    ex: ['I enjoy swimming.', 'I want to swim.'] },
  { id: 'will-going', q: 'will กับ be going to ต่างกันยังไง', match: [['will', 'going to'], ['อนาคต']], topic: 'a2-going-to',
    a: 'be going to = แผนที่ตั้งใจไว้แล้ว หรือเห็นหลักฐานตอนนี้ · will = ตัดสินใจตอนพูด สัญญา หรือคาดเดา',
    ex: ['I\'m going to visit my aunt this weekend.', 'It\'s cold. I\'ll close the window.'] },
  { id: 'conditionals', q: 'ประโยค if มีกี่แบบ', match: [['if'], ['conditional'], ['เงื่อนไข'], ['สมมติ']], topic: 'b1-second-conditional',
    a: 'แบบ 1 (เป็นไปได้จริง): If + ปัจจุบัน, will · แบบ 2 (สมมติตอนนี้): If + อดีต, would · แบบ 3 (สมมติอดีต): If + had V3, would have V3',
    ex: ['If it rains, I will stay home.', 'If I had more time, I would travel.', 'If I had studied, I would have passed.'] },
  { id: 'passive', q: 'ประโยค passive (ถูกกระทำ) ทำยังไง', match: [['passive'], ['ถูกกระทำ']], topic: 'b1-passive',
    a: 'be + V3 (+ by ผู้ทำ) — ใช้เมื่อสนใจสิ่งที่ถูกกระทำมากกว่าผู้ทำ · กาลดูจาก be: is made, was made, has been made',
    ex: ['English is spoken here.', 'The bridge was built in 1990.'] },
  { id: 'used-to', q: 'used to ใช้ยังไง', match: [['used to']], topic: 'b1-used-to',
    a: 'used to + V1 = เคยทำเป็นประจำในอดีต แต่ตอนนี้ไม่ทำแล้ว · ต่างจาก be used to + V-ing = คุ้นเคยกับ',
    ex: ['I used to play football every day.', 'I\'m used to waking up early.'] },
  { id: 'comparative', q: 'เปรียบเทียบขั้นกว่า ขั้นสุด', match: [['comparative'], ['superlative'], ['ขั้นกว่า'], ['ขั้นสุด'], ['er', 'than']], topic: 'a2-comparatives',
    a: 'คำสั้น: -er / the -est (bigger, the biggest) · คำยาว: more / the most (more expensive) · ห้ามใช้ทั้งสองพร้อมกัน (more bigger ผิด) · คำพิเศษ: good-better-best, bad-worse-worst',
    ex: ['This bag is cheaper than that one.', 'It is the most beautiful place I know.'] },
  { id: 'relative', q: 'who which that ใช้ต่างกันยังไง', match: [['who', 'which'], ['which', 'that'], ['relative']], topic: 'b1-relative-clauses',
    a: 'who ใช้กับคน · which ใช้กับสิ่งของ/สัตว์ · that ใช้แทนได้ทั้งสองในประโยคที่ไม่มีลูกน้ำ · whose = ของ (เจ้าของ)',
    ex: ['The man who lives next door is a doctor.', 'The phone which I bought is broken.'] },
  { id: 'reported', q: 'เล่าคำพูดคนอื่น (reported speech)', match: [['reported'], ['indirect'], ['เล่าคำพูด']], topic: 'b1-reported-speech',
    a: 'มักถอยกาลหนึ่งขั้น: is → was, will → would, went → had gone · เปลี่ยนสรรพนามและคำบอกเวลาให้ตรง (tomorrow → the next day)',
    ex: ['"I am tired." → She said (that) she was tired.'] },
];

const EXAMPLE_QUESTIONS = ['since กับ for ต่างกันยังไง', 'ใช้ a หรือ an', 'Present Perfect กับ Past Simple', 'make กับ do', 'ตามด้วย -ing หรือ to', 'ประโยค if มีกี่แบบ', 'delicious', 'ขอบคุณ'];

module.exports = { FAQ, EXAMPLE_QUESTIONS };
