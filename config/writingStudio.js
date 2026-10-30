/*
  Writing Studio (v1.10.0 Phase 3) — ข้อมูลประกอบการตรวจงานเขียนแบบไม่ใช้ AI (เขียนขึ้นเองสำหรับ EnglishQuest)
  - คำเชื่อมตามระดับ · คำพื้นฐานที่ใช้บ่อยเกิน + คำทางเลือก · โจทย์ตัวอย่างตามระดับ
*/
const LINKERS = {
  A1: ['and', 'but', 'or', 'because', 'so', 'then'],
  A2: ['also', 'after that', 'first', 'finally', 'when', 'before', 'after', 'later'],
  B1: ['however', 'although', 'while', 'for example', 'in addition', 'as a result', 'instead', 'for instance', 'even though'],
  B2: ['therefore', 'moreover', 'despite', 'whereas', 'on the other hand', 'in contrast', 'furthermore', 'in spite of', 'unless', 'as long as'],
  C1: ['nevertheless', 'consequently', 'nonetheless', 'hence', 'thereby', 'albeit', 'conversely', 'notwithstanding', 'in light of'],
};

/* คำพื้นฐานที่มักใช้ซ้ำในงานเขียนของผู้เรียน → คำที่ให้ความหมายชัดขึ้น (เลือกให้เข้ากับบริบทเอง) */
const RICHER = {
  good: { alts: ['great', 'excellent', 'helpful', 'enjoyable'], tipTh: 'บอกให้ชัดว่า "ดี" แบบไหน เช่น อร่อย (delicious) สนุก (enjoyable) มีประโยชน์ (helpful)' },
  bad: { alts: ['terrible', 'awful', 'poor', 'unpleasant'], tipTh: 'บอกให้ชัดว่า "แย่" แบบไหน เช่น บริการแย่ (poor service) อากาศแย่ (awful weather)' },
  big: { alts: ['large', 'huge', 'enormous', 'wide'], tipTh: 'huge / enormous = ใหญ่มาก · large ใช้ในงานเขียนทางการกว่า' },
  small: { alts: ['little', 'tiny', 'narrow', 'short'], tipTh: 'tiny = เล็กมาก · narrow = แคบ (ถนน/ทาง)' },
  nice: { alts: ['pleasant', 'lovely', 'friendly', 'kind'], tipTh: 'nice กว้างมาก — คนนิสัยดีใช้ friendly / kind · บรรยากาศดีใช้ pleasant' },
  happy: { alts: ['glad', 'pleased', 'delighted', 'excited'], tipTh: 'delighted = ดีใจมาก · excited = ตื่นเต้นดีใจ (กับสิ่งที่จะเกิด)' },
  sad: { alts: ['upset', 'unhappy', 'disappointed', 'lonely'], tipTh: 'disappointed = ผิดหวัง · upset = เสียใจ/ไม่สบายใจ' },
  very: { alts: ['really', 'extremely', 'quite', 'so'], tipTh: 'ลองใช้คำที่แรงในตัว แทน very + คำ เช่น very big → huge, very tired → exhausted' },
  thing: { alts: ['item', 'idea', 'problem', 'reason'], tipTh: 'thing ไม่บอกอะไรชัด — ระบุว่าคืออะไร เช่น ปัญหา (problem) เหตุผล (reason)' },
  things: { alts: ['items', 'ideas', 'problems', 'details'], tipTh: 'ระบุให้ชัดว่า "สิ่งต่าง ๆ" คืออะไร' },
  get: { alts: ['receive', 'buy', 'become', 'reach'], tipTh: 'get มีหลายความหมาย — เลือกคำที่ตรง เช่น ได้รับ (receive) ซื้อ (buy) ไปถึง (reach)' },
  like: { alts: ['enjoy', 'love', 'prefer', 'be interested in'], tipTh: 'ชอบมากใช้ love · ชอบมากกว่าใช้ prefer · ทำแล้วสนุกใช้ enjoy + V-ing' },
  interesting: { alts: ['fascinating', 'exciting', 'surprising', 'useful'], tipTh: 'บอกเหตุผลว่าน่าสนใจเพราะอะไร จะชัดกว่าใช้ interesting ซ้ำ' },
  important: { alts: ['essential', 'necessary', 'serious', 'key'], tipTh: 'essential / necessary = จำเป็น · key = สำคัญหลัก (a key reason)' },
  'a lot of': { alts: ['many', 'much', 'plenty of', 'a large number of'], tipTh: 'งานเขียนทางการใช้ many (นับได้) / much (นับไม่ได้) / a large number of' },
};

/* โจทย์ตัวอย่าง (เลือกได้ — เขียนอิสระก็ได้) */
const PROMPTS = {
  A1: [
    { id: 'a1-family', th: 'แนะนำครอบครัวของคุณ', en: 'Write about your family. Who are they? What do they do?', min: 40 },
    { id: 'a1-day', th: 'กิจวัตรประจำวันของคุณ', en: 'Describe a normal day. What do you do in the morning, afternoon and evening?', min: 40 },
    { id: 'a1-food', th: 'อาหารที่คุณชอบ', en: 'What is your favourite food? Why do you like it?', min: 30 },
  ],
  A2: [
    { id: 'a2-weekend', th: 'สุดสัปดาห์ที่ผ่านมา', en: 'What did you do last weekend? Write about the places and people.', min: 60 },
    { id: 'a2-friend', th: 'เพื่อนสนิท', en: 'Describe your best friend. How did you meet? What do you do together?', min: 60 },
    { id: 'a2-plan', th: 'แผนวันหยุดครั้งหน้า', en: 'Write about your next holiday. Where will you go and what are you going to do?', min: 60 },
  ],
  B1: [
    { id: 'b1-email', th: 'อีเมลถึงเพื่อนเล่าเรื่องสำคัญ', en: 'Write an email to a friend about something important that happened to you recently.', min: 100 },
    { id: 'b1-opinion', th: 'ความเห็น: เรียนออนไลน์ดีไหม', en: 'Is online learning better than learning in a classroom? Give reasons and examples.', min: 100 },
    { id: 'b1-problem', th: 'ปัญหาที่เคยแก้ได้', en: 'Describe a problem you had and how you solved it.', min: 100 },
  ],
  B2: [
    { id: 'b2-essay', th: 'เรียงความ: โซเชียลมีเดียกับวัยรุ่น', en: 'Social media does more harm than good to teenagers. Do you agree or disagree?', min: 150 },
    { id: 'b2-review', th: 'รีวิวร้านอาหาร/สถานที่', en: 'Write a review of a restaurant or place you visited. Recommend it or not, with reasons.', min: 150 },
    { id: 'b2-complaint', th: 'จดหมายร้องเรียน', en: 'Write a formal complaint about a product or service that disappointed you.', min: 150 },
  ],
  C1: [
    { id: 'c1-proposal', th: 'ข้อเสนอโครงการ', en: 'Write a proposal to improve public transport in your city. Explain the problem, your solution and its benefits.', min: 200 },
    { id: 'c1-discuss', th: 'อภิปรายสองมุมมอง', en: 'Discuss both sides: should governments limit the use of AI in schools? Reach a balanced conclusion.', min: 200 },
  ],
};

module.exports = { LINKERS, RICHER, PROMPTS };
