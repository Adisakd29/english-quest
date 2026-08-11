// เนื้อหาแกรมม่า 16 บท พร้อมข้อสอบท้ายเรื่อง
// โครงสร้าง: chapters[] → { id, num, title, icon, color, intro, sections[], quiz[] }
// section: { heading, content (HTML string), examples[] }
// quiz item: { question, choices[4], correctIndex, explain }

const GRAMMAR_CHAPTERS = [
  {
    id: 'nouns', num: 1, title: 'คำนาม (Nouns)', icon: '📦', color: '#c14a4a',
    intro: 'คำนามคือคำที่ใช้เรียกชื่อคน สัตว์ สิ่งของ สถานที่ หรือความคิด',
    sections: [
      {
        heading: 'Part of Speech (ชนิดของคำ)',
        content: 'ในภาษาอังกฤษมีชนิดของคำ 8 ชนิดหลัก ๆ ได้แก่ Noun (คำนาม), Pronoun (สรรพนาม), Verb (กริยา), Adjective (คุณศัพท์), Adverb (กริยาวิเศษณ์), Preposition (บุพบท), Conjunction (สันธาน), Interjection (คำอุทาน)',
        examples: [
          { en: 'The <b>cat</b> is on the <b>table</b>.', th: 'แมวอยู่บนโต๊ะ (cat, table = noun)' },
        ],
      },
      {
        heading: 'คำนาม 5 ประเภท',
        content: 'คำนามแบ่งเป็น 5 ประเภท: (1) Common Noun คำนามทั่วไป (2) Proper Noun คำนามเฉพาะ ขึ้นต้นตัวใหญ่ (3) Collective Noun คำนามหมู่คณะ (4) Material Noun คำนามเนื้อวัตถุ (5) Abstract Noun คำนามนามธรรม',
        examples: [
          { en: 'boy, city, book', th: 'Common Noun' },
          { en: 'Bangkok, John, Toyota', th: 'Proper Noun (ขึ้นต้นตัวใหญ่)' },
          { en: 'team, family, class', th: 'Collective Noun' },
          { en: 'gold, water, air', th: 'Material Noun' },
          { en: 'love, happiness, freedom', th: 'Abstract Noun' },
        ],
      },
      {
        heading: 'Noun Suffix (คำลงท้ายที่บ่งบอกว่าเป็นคำนาม)',
        content: 'คำลงท้าย -tion, -sion, -ment, -ness, -ity, -er, -or, -ist, -ance, -ence มักจะเป็นคำนาม',
        examples: [
          { en: 'education, decision, movement', th: 'การศึกษา, การตัดสินใจ, การเคลื่อนไหว' },
          { en: 'happiness, activity, teacher', th: 'ความสุข, กิจกรรม, ครู' },
        ],
      },
      {
        heading: 'การเติม -s / -es (พหูพจน์)',
        content: 'คำนามพหูพจน์ปกติเติม -s ท้ายคำ แต่ถ้าลงท้ายด้วย s, ss, sh, ch, x, z ให้เติม -es<br>ถ้าลงท้ายด้วย -y นำหน้าด้วยพยัญชนะ ให้เปลี่ยน y เป็น i แล้วเติม -es',
        examples: [
          { en: 'book → books, car → cars', th: 'เติม s ตามปกติ' },
          { en: 'bus → buses, box → boxes', th: 'ลงท้าย s, x เติม -es' },
          { en: 'baby → babies, city → cities', th: 'y นำหน้าด้วยพยัญชนะ → เปลี่ยนเป็น -ies' },
        ],
      },
      {
        heading: 'นามนับได้ / นับไม่ได้ (Countable / Uncountable)',
        content: 'Countable Noun นับได้ มีทั้งเอกพจน์และพหูพจน์ ใช้ a/an นำหน้าได้<br>Uncountable Noun นับไม่ได้ ไม่มีรูปพหูพจน์ ใช้ a/an ไม่ได้ เช่น ของเหลว ผง แก๊ส นามธรรม',
        examples: [
          { en: 'a book, three books', th: 'Countable (นับได้)' },
          { en: 'water, sugar, information', th: 'Uncountable (นับไม่ได้)' },
        ],
      },
    ],
    quiz: [
      { question: 'คำใดต่อไปนี้เป็น Proper Noun', choices: ['city', 'Bangkok', 'love', 'water'], correctIndex: 1, explain: 'Proper Noun คือชื่อเฉพาะ ขึ้นต้นด้วยตัวใหญ่เสมอ Bangkok เป็นชื่อเมือง' },
      { question: 'รูปพหูพจน์ของ "baby" คือ', choices: ['babys', 'babyes', 'babies', 'baby'], correctIndex: 2, explain: 'y นำหน้าด้วยพยัญชนะ (b) → เปลี่ยน y เป็น i แล้วเติม -es = babies' },
      { question: 'คำใดเป็น Uncountable Noun (นับไม่ได้)', choices: ['book', 'car', 'water', 'boy'], correctIndex: 2, explain: 'water เป็นของเหลว เป็น Uncountable Noun นับไม่ได้ ไม่มีรูปพหูพจน์' },
      { question: 'คำลงท้ายด้วย -ness ทำให้เป็นคำชนิดใด', choices: ['กริยา', 'คำนาม', 'คุณศัพท์', 'บุพบท'], correctIndex: 1, explain: 'Suffix -ness เป็นคำลงท้ายที่บ่งบอกว่าเป็นคำนาม เช่น happiness, kindness' },
      { question: 'คำใดเป็น Abstract Noun (นามธรรม)', choices: ['dog', 'chair', 'freedom', 'book'], correctIndex: 2, explain: 'Abstract Noun คือคำนามที่จับต้องไม่ได้ freedom (อิสรภาพ) เป็นนามธรรม' },
    ],
  },

  {
    id: 'determiners', num: 2, title: 'Determiners คำนำหน้านาม', icon: '🔤', color: '#4a7cc1',
    intro: 'คำนำหน้านาม (Determiner) ใช้วางหน้าคำนามเพื่อบอกความหมาย เช่น a, an, the, some, many, this, that',
    sections: [
      {
        heading: 'Article: a, an, the',
        content: '<b>a</b> ใช้กับคำนามเอกพจน์ที่ขึ้นต้นด้วยเสียงพยัญชนะ<br><b>an</b> ใช้กับคำนามเอกพจน์ที่ขึ้นต้นด้วยเสียงสระ (a, e, i, o, u)<br><b>the</b> ใช้เมื่อพูดถึงสิ่งที่รู้กันแล้ว หรือสิ่งที่มีอยู่หนึ่งเดียว',
        examples: [
          { en: 'I have <b>a</b> book.', th: 'ฉันมีหนังสือ 1 เล่ม' },
          { en: 'She ate <b>an</b> apple.', th: 'เธอกินแอปเปิ้ล 1 ลูก' },
          { en: '<b>The</b> sun is bright.', th: 'ดวงอาทิตย์ (มีดวงเดียว)' },
        ],
      },
      {
        heading: 'The + 8 อย่าง (เมื่อไหร่ต้องใส่ the)',
        content: 'ใส่ the เมื่อ (1) สิ่งที่มีหนึ่งเดียวในโลก (2) ชื่อแม่น้ำ ทะเล มหาสมุทร (3) ชื่อประเทศพหูพจน์ (4) ชื่อภูเขาเป็นกลุ่ม (5) ทิศ (6) สิ่งของที่พูดถึงมาก่อน (7) เครื่องดนตรี (8) ชื่อหนังสือพิมพ์',
        examples: [
          { en: 'the sun, the moon, the earth', th: 'มีหนึ่งเดียว' },
          { en: 'the Chao Phraya, the Pacific Ocean', th: 'แม่น้ำ มหาสมุทร' },
          { en: 'the piano, the guitar', th: 'เครื่องดนตรี' },
        ],
      },
      {
        heading: 'Quantifiers - Many, Much, A lot of',
        content: '<b>Many</b> ใช้กับคำนามพหูพจน์นับได้<br><b>Much</b> ใช้กับคำนามนับไม่ได้<br><b>A lot of / Lots of</b> ใช้ได้ทั้งสองแบบ',
        examples: [
          { en: 'I have <b>many</b> friends.', th: 'ฉันมีเพื่อนมากมาย (friends นับได้)' },
          { en: 'She drinks <b>much</b> water.', th: 'เธอดื่มน้ำเยอะ (water นับไม่ได้)' },
          { en: 'He has <b>a lot of</b> money.', th: 'เขามีเงินมาก (ใช้ได้ทั้งนับได้-ไม่ได้)' },
        ],
      },
      {
        heading: 'Little, Few / A little, A few',
        content: '<b>Few / A few</b> ใช้กับนามนับได้พหูพจน์ ("จำนวนน้อย")<br><b>Little / A little</b> ใช้กับนามนับไม่ได้ ("ปริมาณน้อย")<br>ใส่ a = ยังมีบ้าง (บวก), ไม่ใส่ a = เกือบไม่มีเลย (ลบ)',
        examples: [
          { en: 'I have <b>a few</b> friends.', th: 'ฉันมีเพื่อนอยู่บ้าง (แง่บวก)' },
          { en: 'I have <b>few</b> friends.', th: 'ฉันแทบไม่มีเพื่อนเลย (แง่ลบ)' },
        ],
      },
      {
        heading: 'This, That, These, Those',
        content: '<b>This</b> (เอกพจน์ ใกล้) / <b>These</b> (พหูพจน์ ใกล้)<br><b>That</b> (เอกพจน์ ไกล) / <b>Those</b> (พหูพจน์ ไกล)',
        examples: [
          { en: '<b>This</b> book is mine.', th: 'หนังสือเล่มนี้เป็นของฉัน' },
          { en: '<b>Those</b> cars are fast.', th: 'รถพวกนั้นเร็ว' },
        ],
      },
    ],
    quiz: [
      { question: 'เลือกคำที่ถูกต้อง: "I saw ___ elephant at the zoo."', choices: ['a', 'an', 'the', 'no article'], correctIndex: 1, explain: 'elephant ขึ้นต้นด้วยเสียงสระ (e) ใช้ an' },
      { question: 'How ___ water do you drink?', choices: ['many', 'much', 'few', 'several'], correctIndex: 1, explain: 'water เป็นนามนับไม่ได้ ต้องใช้ much' },
      { question: 'She has ___ friends. (พูดในแง่บวก - มีอยู่บ้าง)', choices: ['few', 'a few', 'little', 'a little'], correctIndex: 1, explain: 'friends นับได้ + แง่บวก = a few' },
      { question: '"___ students in my class are smart." (ชี้ไปที่กลุ่มไกล ๆ)', choices: ['This', 'That', 'These', 'Those'], correctIndex: 3, explain: 'students พหูพจน์ + ไกล = Those' },
      { question: 'เลือก determiner ที่ถูก: "I need ___ information."', choices: ['many', 'a', 'some', 'few'], correctIndex: 2, explain: 'information นับไม่ได้ ใช้ some ได้' },
    ],
  },

  {
    id: 'adjectives', num: 3, title: 'Adjectives คุณศัพท์', icon: '🎨', color: '#d97748',
    intro: 'คำคุณศัพท์ (Adjective) ใช้ขยายคำนาม เพื่อบอกลักษณะ สี ขนาด รูปร่าง อารมณ์',
    sections: [
      {
        heading: 'Adjective คืออะไร ใช้ยังไง',
        content: 'Adjective ใช้ขยายคำนาม วางไว้หน้าคำนาม หรือหลังกริยา verb to be',
        examples: [
          { en: 'a <b>beautiful</b> garden', th: 'สวนที่สวยงาม (วางหน้านาม)' },
          { en: 'The garden is <b>beautiful</b>.', th: 'สวนสวย (หลัง verb to be)' },
        ],
      },
      {
        heading: 'Adjective Suffix (คำลงท้ายบ่งบอก adj)',
        content: 'คำลงท้าย -ful, -less, -ous, -ive, -able, -al, -y, -ish, -ic มักเป็น adjective',
        examples: [
          { en: 'beautiful, careful, useless', th: 'สวย, ระวัง, ไร้ประโยชน์' },
          { en: 'dangerous, active, comfortable', th: 'อันตราย, กระตือรือร้น, สะดวก' },
          { en: 'cloudy, foolish, magic', th: 'มีเมฆ, โง่, มหัศจรรย์' },
        ],
      },
      {
        heading: 'Adjective ที่ไม่มี Suffix',
        content: 'บาง adjective ไม่มี suffix เฉพาะ เช่น good, bad, tall, short, big, small, hot, cold, new, old ต้องจำ',
        examples: [
          { en: 'a <b>big</b> house', th: 'บ้านหลังใหญ่' },
          { en: '<b>hot</b> coffee', th: 'กาแฟร้อน' },
        ],
      },
    ],
    quiz: [
      { question: 'คำใดเป็น adjective', choices: ['run', 'quickly', 'careful', 'happiness'], correctIndex: 2, explain: 'careful ลงท้าย -ful เป็น adjective' },
      { question: 'ประโยคใดใช้ adjective ถูกต้อง', choices: ['She is beautifully.', 'She is a beautiful girl.', 'She beautiful the girl.', 'She beauty girl.'], correctIndex: 1, explain: 'Adjective (beautiful) วางหน้าคำนาม (girl)' },
      { question: 'คำใดไม่ใช่ adjective', choices: ['careful', 'happy', 'quickly', 'famous'], correctIndex: 2, explain: 'quickly ลงท้าย -ly เป็น adverb ไม่ใช่ adjective' },
      { question: 'เติมคำที่ถูกต้อง: "The soup is ___."', choices: ['hotly', 'hot', 'heat', 'heating'], correctIndex: 1, explain: 'หลัง verb to be (is) ใช้ adjective = hot' },
    ],
  },

  {
    id: 'adverbs', num: 4, title: 'Adverbs กริยาวิเศษณ์', icon: '⚡', color: '#c14a4a',
    intro: 'Adverb ใช้ขยายคำกริยา คุณศัพท์ หรือ adverb ด้วยกัน บอกวิธี เวลา สถานที่ ความถี่ ระดับ',
    sections: [
      {
        heading: 'Adverb คืออะไร',
        content: 'Adverb ส่วนใหญ่เกิดจาก adjective + ly เช่น slow → slowly, quick → quickly<br>แต่บาง adverb ไม่มี -ly เช่น fast, hard, well, late, early',
        examples: [
          { en: 'He runs <b>fast</b>.', th: 'เขาวิ่งเร็ว (ขยายกริยา runs)' },
          { en: 'She sings <b>beautifully</b>.', th: 'เธอร้องเพลงเพราะ (adj beautiful + ly)' },
        ],
      },
      {
        heading: '5 ประเภท Adverb',
        content: '(1) Adverb of Manner บอกอาการ (2) Adverb of Frequency บอกความถี่ (3) Adverb of Degree บอกระดับ (4) Adverb of Time บอกเวลา (5) Adverb of Place บอกสถานที่',
        examples: [
          { en: 'quickly, carefully', th: 'อาการ (Manner)' },
          { en: 'always, often, never', th: 'ความถี่ (Frequency)' },
          { en: 'very, quite, too', th: 'ระดับ (Degree)' },
          { en: 'now, today, yesterday', th: 'เวลา (Time)' },
          { en: 'here, there, everywhere', th: 'สถานที่ (Place)' },
        ],
      },
      {
        heading: 'การเรียง Adverbs',
        content: 'ถ้ามี adverb หลายตัวในประโยค เรียงตามลำดับ: Manner → Place → Time (MPT)',
        examples: [
          { en: 'She sang <b>beautifully</b> <b>at the party</b> <b>last night</b>.', th: 'M → P → T' },
        ],
      },
    ],
    quiz: [
      { question: 'คำใดเป็น adverb', choices: ['happy', 'quickly', 'beauty', 'careful'], correctIndex: 1, explain: 'quickly ลงท้าย -ly เป็น adverb ขยายคำกริยา' },
      { question: 'Adverb of Frequency คือคำใด', choices: ['quickly', 'always', 'here', 'very'], correctIndex: 1, explain: 'always = เสมอ เป็น adverb บอกความถี่' },
      { question: 'เลือกลำดับ adverb ที่ถูกต้อง', choices: ['She works here every day quietly.', 'She works quietly here every day.', 'She works every day here quietly.', 'She works quietly every day here.'], correctIndex: 1, explain: 'ลำดับที่ถูก M(quietly) → P(here) → T(every day)' },
      { question: 'ประโยคใดใช้ adverb ผิด', choices: ['He runs fast.', 'He runs quickly.', 'He runs quick.', 'He runs carefully.'], correctIndex: 2, explain: 'quick เป็น adjective ต้องใช้ quickly (adverb) ขยาย runs' },
    ],
  },

  {
    id: 'pronouns', num: 5, title: 'Pronouns สรรพนาม', icon: '👥', color: '#5aa76b',
    intro: 'Pronoun ใช้แทนคำนาม เพื่อไม่ให้พูดชื่อซ้ำ ๆ',
    sections: [
      {
        heading: 'ตาราง Pronoun 5 แถว',
        content: 'Pronoun มี 5 รูป: Subject (ประธาน), Object (กรรม), Possessive Adj (แสดงความเป็นเจ้าของ+นาม), Possessive Pronoun (แทนสิ่งของ), Reflexive (ตัวเอง)',
        examples: [
          { en: 'I, you, he, she, it, we, they', th: 'ประธาน (Subject)' },
          { en: 'me, you, him, her, it, us, them', th: 'กรรม (Object)' },
          { en: 'my, your, his, her, its, our, their + N.', th: 'แสดงความเป็นเจ้าของ (+นาม)' },
          { en: 'mine, yours, his, hers, ours, theirs', th: 'แทนสิ่งของ' },
          { en: 'myself, yourself, himself, herself, itself, ourselves, themselves', th: 'ตัวเอง (-self)' },
        ],
      },
      {
        heading: 'Pronoun ประธาน vs กรรม',
        content: 'ประธาน (Subject) ทำหน้าที่เป็นประธานของประโยค อยู่หน้ากริยา<br>กรรม (Object) ทำหน้าที่เป็นกรรม อยู่หลังกริยาหรือหลัง preposition',
        examples: [
          { en: '<b>She</b> gave <b>him</b> a book.', th: 'She = ประธาน, him = กรรม' },
          { en: '<b>We</b> saw <b>them</b> yesterday.', th: 'We = ประธาน, them = กรรม' },
        ],
      },
      {
        heading: 'Possessive Adj (my) vs Possessive Pronoun (mine)',
        content: 'Possessive Adjective ต้องมีคำนามตามหลัง (my book)<br>Possessive Pronoun ใช้แทนสิ่งของ ไม่มีนามตาม (mine)',
        examples: [
          { en: 'This is <b>my</b> book.', th: 'my + นาม' },
          { en: 'This book is <b>mine</b>.', th: 'mine แทน "หนังสือของฉัน"' },
        ],
      },
      {
        heading: 'Reflexive Pronoun (-self)',
        content: 'ใช้เมื่อประธานทำกริยากับตัวเอง หรือเน้นย้ำ',
        examples: [
          { en: 'She hurt <b>herself</b>.', th: 'เธอทำเธอเจ็บเอง' },
          { en: 'I did it <b>myself</b>.', th: 'ฉันทำเอง' },
        ],
      },
      {
        heading: 'ตัวย่อ (Contractions)',
        content: 'I am = I\'m, you are = you\'re, he is = he\'s, we will = we\'ll, do not = don\'t',
        examples: [
          { en: 'I\'m happy. = I am happy.', th: 'ตัวย่อของ I am' },
          { en: 'They\'re here. = They are here.', th: 'ตัวย่อของ They are' },
        ],
      },
    ],
    quiz: [
      { question: 'เลือก pronoun ที่ถูก: "___ gave me a gift."', choices: ['Him', 'His', 'He', 'Himself'], correctIndex: 2, explain: 'ประธานของประโยค ใช้ Subject Pronoun = He' },
      { question: '"This book is ___." (ของเธอ)', choices: ['her', 'hers', 'herself', 'she'], correctIndex: 1, explain: 'ไม่มีนามตาม ใช้ Possessive Pronoun = hers' },
      { question: '"She cut ___ while cooking."', choices: ['her', 'hers', 'herself', 'she'], correctIndex: 2, explain: 'ประธานทำกริยากับตัวเอง ใช้ Reflexive = herself' },
      { question: '"I\'m" ย่อมาจากอะไร', choices: ['I will', 'I have', 'I am', 'I do'], correctIndex: 2, explain: 'I\'m = I am' },
      { question: '"They saw ___ at the mall."', choices: ['we', 'us', 'our', 'ours'], correctIndex: 1, explain: 'หลังกริยา saw ใช้ Object Pronoun = us' },
    ],
  },

  {
    id: 'wh-words', num: 6, title: 'Wh-words คำถาม', icon: '❓', color: '#4a7cc1',
    intro: 'คำที่ขึ้นต้นด้วย Wh- ใช้ตั้งคำถาม: what, when, where, why, who, whom, whose, which, how',
    sections: [
      {
        heading: 'Wh-questions พื้นฐาน',
        content: '<b>What</b> = อะไร | <b>When</b> = เมื่อไหร่ | <b>Where</b> = ที่ไหน | <b>Why</b> = ทำไม<br><b>Who</b> = ใคร (ประธาน) | <b>Whom</b> = ใคร (กรรม) | <b>Whose</b> = ของใคร<br><b>Which</b> = อันไหน | <b>How</b> = อย่างไร',
        examples: [
          { en: '<b>What</b> is your name?', th: 'คุณชื่ออะไร' },
          { en: '<b>Where</b> do you live?', th: 'คุณอาศัยอยู่ที่ไหน' },
          { en: '<b>Why</b> are you sad?', th: 'ทำไมคุณเศร้า' },
        ],
      },
      {
        heading: 'What + คำนาม',
        content: 'What ตามด้วยคำนามได้ เพื่อถามเจาะจง เช่น What time, What color',
        examples: [
          { en: '<b>What time</b> is it?', th: 'ตอนนี้กี่โมง' },
          { en: '<b>What color</b> do you like?', th: 'คุณชอบสีอะไร' },
        ],
      },
      {
        heading: 'How + adjective/adverb',
        content: 'How + adj/adv ใช้ถามระดับ ปริมาณ ความถี่',
        examples: [
          { en: '<b>How old</b> are you?', th: 'คุณอายุเท่าไหร่' },
          { en: '<b>How often</b> do you exercise?', th: 'คุณออกกำลังกายบ่อยแค่ไหน' },
          { en: '<b>How much</b> is this?', th: 'อันนี้ราคาเท่าไหร่' },
        ],
      },
      {
        heading: 'Which + คำนาม',
        content: 'Which ใช้ถามเพื่อเลือกในกลุ่มที่จำกัด "อันไหน"',
        examples: [
          { en: '<b>Which shirt</b> do you prefer, red or blue?', th: 'เสื้อสีไหน แดงหรือน้ำเงิน' },
        ],
      },
    ],
    quiz: [
      { question: '"___ is your birthday?" (ถามวัน)', choices: ['What', 'When', 'Where', 'How'], correctIndex: 1, explain: 'ถามเวลา/วัน ใช้ When' },
      { question: '"___ old is your brother?"', choices: ['What', 'How', 'Which', 'Whose'], correctIndex: 1, explain: 'How + adjective (old) ถามอายุ' },
      { question: '"___ book is this?" (ของใคร)', choices: ['Who', 'Whom', 'Whose', 'Which'], correctIndex: 2, explain: 'Whose = ของใคร ตามด้วยคำนามได้' },
      { question: '"___ do you go to school?" (ยังไง วิธี)', choices: ['Where', 'When', 'How', 'Why'], correctIndex: 2, explain: 'How = อย่างไร ถามวิธีการ' },
      { question: '"___ one do you want, this or that?"', choices: ['What', 'Which', 'Who', 'Why'], correctIndex: 1, explain: 'Which = อันไหน ใช้เมื่อเลือกจากตัวเลือกจำกัด' },
    ],
  },

  {
    id: 'relative-pronouns', num: 7, title: 'Relative Pronouns', icon: '🔗', color: '#e0a848',
    intro: 'Relative Pronoun ใช้เชื่อมประโยค ทำหน้าที่แทนคำนามในประโยคที่มาขยาย: who, whom, whose, which, that, where, when, why',
    sections: [
      {
        heading: 'ห้ามแปลตรงตัว',
        content: 'Relative Pronoun ทั้งหมด แม้จะเหมือน Wh-question แต่ในบริบทนี้ ทำหน้าที่เชื่อมประโยค ไม่ใช่ถามคำถาม แปลว่า "ที่/ซึ่ง"',
        examples: [
          { en: 'The boy <b>who</b> is running is my brother.', th: 'เด็กผู้ชาย<b>ที่</b>กำลังวิ่งคือน้องชายฉัน' },
        ],
      },
      {
        heading: 'who, whom, that = คน',
        content: 'ใช้กับคำนามที่เป็นคน<br><b>who</b> = ประธาน / <b>whom</b> = กรรม / <b>that</b> = ใช้แทนได้ทั้งคู่',
        examples: [
          { en: 'The man <b>who</b> called is my uncle.', th: 'ผู้ชายที่โทรมาคือลุงฉัน' },
          { en: 'The girl <b>whom</b> I met is nice.', th: 'ผู้หญิงที่ฉันเจอเป็นคนดี' },
        ],
      },
      {
        heading: 'which, that = สิ่งของ/สัตว์',
        content: 'ใช้กับคำนามที่เป็นสิ่งของหรือสัตว์',
        examples: [
          { en: 'The book <b>which</b> I bought is new.', th: 'หนังสือที่ฉันซื้อเป็นเล่มใหม่' },
          { en: 'The dog <b>that</b> barks is mine.', th: 'สุนัขที่กำลังเห่าเป็นของฉัน' },
        ],
      },
      {
        heading: 'whose + N. = ของ',
        content: 'whose + คำนาม แสดงความเป็นเจ้าของ',
        examples: [
          { en: 'The boy <b>whose</b> mother is a doctor is smart.', th: 'เด็กผู้ชายซึ่งแม่เป็นหมอเป็นคนฉลาด' },
        ],
      },
      {
        heading: 'where = สถานที่, when = เวลา, why = เหตุผล',
        content: 'ใช้กับสถานที่ เวลา และเหตุผล ตามลำดับ',
        examples: [
          { en: 'The park <b>where</b> we played is big.', th: 'สวนที่เราเล่นใหญ่' },
          { en: 'The day <b>when</b> she left was sad.', th: 'วันที่เธอจากไปเศร้ามาก' },
          { en: 'The reason <b>why</b> he cried is unknown.', th: 'เหตุผลที่เขาร้องไห้ยังไม่มีใครรู้' },
        ],
      },
    ],
    quiz: [
      { question: 'The man ___ lives next door is friendly.', choices: ['which', 'who', 'whose', 'where'], correctIndex: 1, explain: 'ขยายคน (man) + เป็นประธานของ lives → ใช้ who' },
      { question: 'This is the house ___ I grew up.', choices: ['which', 'who', 'where', 'whose'], correctIndex: 2, explain: 'ขยายสถานที่ (house) ใช้ where' },
      { question: 'The girl ___ dress is red is my sister.', choices: ['who', 'whom', 'whose', 'which'], correctIndex: 2, explain: 'แสดงความเป็นเจ้าของ (dress ของ girl) ใช้ whose' },
      { question: 'The book ___ I read was interesting.', choices: ['who', 'which', 'whose', 'when'], correctIndex: 1, explain: 'ขยายสิ่งของ (book) ใช้ which หรือ that' },
      { question: 'I remember the day ___ we first met.', choices: ['where', 'when', 'why', 'which'], correctIndex: 1, explain: 'ขยายเวลา (day) ใช้ when' },
    ],
  },

  {
    id: 'helping-verbs', num: 8, title: 'Helping Verbs กริยาช่วย', icon: '🤝', color: '#c14a4a',
    intro: 'กริยาช่วย (Auxiliary/Modal Verbs) ใช้ร่วมกับกริยาหลัก เพื่อสร้างประโยคคำถาม ปฏิเสธ หรือบอกความหมายพิเศษ',
    sections: [
      {
        heading: 'Verb to Be (is, am, are, was, were)',
        content: '<b>am</b> ใช้กับ I | <b>is</b> ใช้กับ he, she, it, เอกพจน์ | <b>are</b> ใช้กับ you, we, they, พหูพจน์<br>อดีต: <b>was</b> (I, he, she, it) / <b>were</b> (you, we, they, พหูพจน์)',
        examples: [
          { en: 'I <b>am</b> a student.', th: 'ฉันเป็นนักเรียน' },
          { en: 'They <b>are</b> happy.', th: 'พวกเขามีความสุข' },
          { en: 'She <b>was</b> tired.', th: 'เธอเหนื่อย (อดีต)' },
        ],
      },
      {
        heading: 'Verb to Do (do, does, did)',
        content: 'ใช้สร้างคำถามและปฏิเสธในประโยคปัจจุบันและอดีต<br><b>do</b> ใช้กับ I, you, we, they | <b>does</b> ใช้กับ he, she, it | <b>did</b> อดีต',
        examples: [
          { en: '<b>Do</b> you like coffee?', th: 'คุณชอบกาแฟไหม' },
          { en: 'She <b>does</b>n\'t know.', th: 'เธอไม่รู้' },
          { en: 'I <b>did</b>n\'t see him.', th: 'ฉันไม่ได้เห็นเขา' },
        ],
      },
      {
        heading: 'Verb to Have (have, has, had)',
        content: 'ใช้บอกความเป็นเจ้าของ หรือช่วยสร้าง Perfect Tense<br><b>have</b> ใช้กับ I, you, we, they | <b>has</b> ใช้กับ he, she, it | <b>had</b> อดีต',
        examples: [
          { en: 'I <b>have</b> a car.', th: 'ฉันมีรถ' },
          { en: 'She <b>has</b> finished her work.', th: 'เธอทำงานเสร็จแล้ว' },
        ],
      },
      {
        heading: 'Modal Verbs — Can, Could',
        content: '<b>can</b> = สามารถ (ปัจจุบัน) | <b>could</b> = สามารถ (อดีต) หรือขออนุญาต/ขอร้องแบบสุภาพ<br>หลัง modal ตามด้วย V.1 (infinitive without to)',
        examples: [
          { en: 'I <b>can</b> swim.', th: 'ฉันว่ายน้ำได้' },
          { en: '<b>Could</b> you help me?', th: 'คุณช่วยฉันได้ไหม (สุภาพ)' },
        ],
      },
      {
        heading: 'Will, Would',
        content: '<b>will</b> = จะ (อนาคต) | <b>would</b> = อดีตของ will หรือแสดงความสุภาพ',
        examples: [
          { en: 'I <b>will</b> go tomorrow.', th: 'ฉันจะไปพรุ่งนี้' },
          { en: '<b>Would</b> you like some tea?', th: 'คุณอยากดื่มชาไหม (สุภาพ)' },
        ],
      },
      {
        heading: 'Should, Must, May, Might',
        content: '<b>should</b> = ควรจะ | <b>must</b> = ต้อง (บังคับ) | <b>may</b> = อาจจะ, ขออนุญาต | <b>might</b> = อาจจะ (มั่นใจน้อยกว่า may)',
        examples: [
          { en: 'You <b>should</b> study more.', th: 'คุณควรอ่านหนังสือเพิ่ม' },
          { en: 'You <b>must</b> wear a helmet.', th: 'คุณต้องใส่หมวกกันน็อค' },
          { en: 'It <b>may</b> rain today.', th: 'วันนี้ฝนอาจจะตก' },
        ],
      },
    ],
    quiz: [
      { question: '"She ___ a doctor." (present)', choices: ['am', 'is', 'are', 'be'], correctIndex: 1, explain: 'She เป็นเอกพจน์ ใช้ is' },
      { question: '"___ you speak English?" (ถามในปัจจุบัน)', choices: ['Are', 'Do', 'Does', 'Is'], correctIndex: 1, explain: 'you ใช้ Do ในการถาม' },
      { question: '"I ___ swim when I was 5."', choices: ['can', 'could', 'will', 'must'], correctIndex: 1, explain: 'อดีตของ can = could' },
      { question: '"You ___ wear a seatbelt. It\'s the law."', choices: ['may', 'might', 'must', 'should'], correctIndex: 2, explain: 'การบังคับตามกฎหมาย ใช้ must' },
      { question: '"She ___ finished her homework already."', choices: ['have', 'has', 'had', 'having'], correctIndex: 1, explain: 'She + has + V.3 = Present Perfect' },
    ],
  },

  {
    id: 'sv-agreement', num: 9, title: 'Subject + Verb Agreement', icon: '⚖️', color: '#4a7cc1',
    intro: 'ประธานต้องผันกริยาให้ตรงกัน: ประธานเอกพจน์ → กริยาเติม s, ประธานพหูพจน์ → กริยาไม่เติม s',
    sections: [
      {
        heading: 'S. + V. Agreement คืออะไร',
        content: 'ในภาษาอังกฤษ ประธานและกริยาต้องสอดคล้องกัน<br>ประธานเอกพจน์ (he, she, it, ชื่อคนเดียว) → V. เติม s/es<br>ประธานพหูพจน์ (they, we, ชื่อหลายคน) → V. ไม่เติม s',
        examples: [
          { en: 'She <b>eats</b> breakfast.', th: 'ประธานเอกพจน์ → eats (เติม s)' },
          { en: 'They <b>eat</b> breakfast.', th: 'ประธานพหูพจน์ → eat (ไม่เติม s)' },
        ],
      },
      {
        heading: '5 กฎลวง (ที่ต้องระวัง)',
        content: '(1) each, every, everyone, someone → เอกพจน์ ใช้ V. เติม s<br>(2) neither...nor / either...or ผันตามประธานตัวหลัง<br>(3) a number of + N.พหู → พหูพจน์ / the number of → เอกพจน์<br>(4) news, mathematics, physics → เอกพจน์ (ลงท้าย s แต่นับไม่ได้)<br>(5) นามรวม (family, team) → เอกพจน์',
        examples: [
          { en: 'Everyone <b>is</b> welcome.', th: 'everyone = เอกพจน์' },
          { en: 'A number of students <b>are</b> here.', th: 'จำนวนมาก → พหูพจน์' },
          { en: 'The news <b>is</b> shocking.', th: 'news = เอกพจน์' },
        ],
      },
    ],
    quiz: [
      { question: '"Everyone ___ happy today."', choices: ['is', 'are', 'were', 'be'], correctIndex: 0, explain: 'Everyone = เอกพจน์ ใช้ is' },
      { question: '"A lot of people ___ here."', choices: ['is', 'are', 'was', 'has'], correctIndex: 1, explain: 'people เป็นพหูพจน์ ใช้ are' },
      { question: '"The news ___ good."', choices: ['is', 'are', 'were', 'have'], correctIndex: 0, explain: 'news เอกพจน์แม้ลงท้าย s ใช้ is' },
      { question: '"My family ___ big."', choices: ['is', 'are', 'were', 'be'], correctIndex: 0, explain: 'นามรวมมักเป็นเอกพจน์ ใช้ is' },
      { question: '"She and her friend ___ singing."', choices: ['is', 'are', 'was', 'am'], correctIndex: 1, explain: 'She and her friend = 2 คน (พหูพจน์) ใช้ are' },
    ],
  },

  {
    id: 'tenses', num: 10, title: 'Tense (กาลเวลา)', icon: '⏰', color: '#e0a848',
    intro: 'Tense คือการผันกริยาให้ตรงกับเวลาในการเล่าเรื่อง มี 12 tenses แต่ที่ใช้บ่อยคือ Present, Past, Future',
    sections: [
      {
        heading: 'โครงสร้าง 12 Tense',
        content: '12 Tense แบ่งเป็น 3 กลุ่มเวลา (Past, Present, Future) × 4 ลักษณะ (Simple, Continuous, Perfect, Perfect Continuous)',
        examples: [
          { en: 'Present Simple: I <b>go</b>', th: 'ปัจจุบันธรรมดา' },
          { en: 'Present Continuous: I <b>am going</b>', th: 'กำลัง...' },
          { en: 'Present Perfect: I <b>have gone</b>', th: '...แล้ว' },
        ],
      },
      {
        heading: 'Present Simple (ปัจจุบันธรรมดา)',
        content: 'ใช้กับเหตุการณ์ที่เป็นความจริงเสมอ นิสัย ทำเป็นประจำ<br>โครงสร้าง: <b>S + V.1(s/es)</b><br>คำที่บอก: always, often, usually, sometimes, every day',
        examples: [
          { en: 'I <b>drink</b> water every day.', th: 'ฉันดื่มน้ำทุกวัน' },
          { en: 'She <b>works</b> in a bank.', th: 'เธอทำงานที่ธนาคาร (V. เติม s)' },
        ],
      },
      {
        heading: 'Present Continuous (กำลัง...)',
        content: 'ใช้กับเหตุการณ์ที่กำลังเกิดขึ้นในขณะพูด<br>โครงสร้าง: <b>S + is/am/are + V.ing</b><br>คำที่บอก: now, right now, at the moment',
        examples: [
          { en: 'I <b>am eating</b> now.', th: 'ฉันกำลังกินอยู่ตอนนี้' },
          { en: 'They <b>are playing</b> football.', th: 'พวกเขากำลังเล่นฟุตบอล' },
        ],
      },
      {
        heading: 'Present Perfect (...แล้ว/เคย)',
        content: 'ใช้กับเหตุการณ์ที่เกิดในอดีตแต่มีผลถึงปัจจุบัน หรือประสบการณ์<br>โครงสร้าง: <b>S + has/have + V.3</b><br>คำที่บอก: already, just, yet, ever, never, since, for',
        examples: [
          { en: 'I <b>have finished</b> my work.', th: 'ฉันทำงานเสร็จแล้ว' },
          { en: 'She <b>has been</b> to Japan.', th: 'เธอเคยไปญี่ปุ่น' },
        ],
      },
      {
        heading: 'Past Simple (อดีตธรรมดา)',
        content: 'ใช้กับเหตุการณ์ที่เกิดขึ้นและจบไปแล้วในอดีต<br>โครงสร้าง: <b>S + V.2</b><br>คำที่บอก: yesterday, last week, ago, in 2020',
        examples: [
          { en: 'I <b>went</b> to school yesterday.', th: 'ฉันไปโรงเรียนเมื่อวาน' },
          { en: 'She <b>ate</b> lunch at noon.', th: 'เธอกินข้าวเที่ยงตอนเที่ยง' },
        ],
      },
      {
        heading: 'Future Simple (จะ...)',
        content: 'ใช้กับเหตุการณ์ในอนาคต<br>โครงสร้าง: <b>S + will + V.1</b> หรือ <b>S + is/am/are + going to + V.1</b><br>คำที่บอก: tomorrow, next week, in 2025',
        examples: [
          { en: 'I <b>will go</b> tomorrow.', th: 'ฉันจะไปพรุ่งนี้' },
          { en: 'She <b>is going to</b> travel.', th: 'เธอจะไปเที่ยว (มีแผน)' },
        ],
      },
    ],
    quiz: [
      { question: '"She ___ to work every day." (นิสัย)', choices: ['go', 'goes', 'going', 'went'], correctIndex: 1, explain: 'Present Simple + She (เอกพจน์) → goes' },
      { question: '"I ___ TV now." (กำลัง...)', choices: ['watch', 'watches', 'am watching', 'watched'], correctIndex: 2, explain: 'Present Continuous: am + V.ing' },
      { question: '"They ___ to Paris last year."', choices: ['go', 'went', 'have gone', 'are going'], correctIndex: 1, explain: 'last year = อดีต → Past Simple → went' },
      { question: '"I ___ already ___ my homework."', choices: ['have / finish', 'have / finished', 'has / finished', 'am / finishing'], correctIndex: 1, explain: 'already + Present Perfect → have + V.3 (finished)' },
      { question: '"Tomorrow I ___ my friend."', choices: ['meet', 'met', 'will meet', 'am meeting'], correctIndex: 2, explain: 'tomorrow = อนาคต → will + V.1' },
    ],
  },

  {
    id: 'active-passive', num: 11, title: 'Active - Passive Voice', icon: '🔄', color: '#c14a4a',
    intro: 'Active Voice = ประธานเป็นผู้กระทำ / Passive Voice = ประธานเป็นผู้ถูกกระทำ',
    sections: [
      {
        heading: 'Active - Passive คืออะไร',
        content: '<b>Active:</b> John writes a letter. (จอห์นเขียนจดหมาย - จอห์นเป็นผู้ทำ)<br><b>Passive:</b> A letter is written by John. (จดหมายถูกเขียนโดยจอห์น - จดหมายถูกกระทำ)',
        examples: [
          { en: 'Active: She <b>eats</b> the apple.', th: 'เธอกินแอปเปิ้ล' },
          { en: 'Passive: The apple <b>is eaten</b> by her.', th: 'แอปเปิ้ลถูกกินโดยเธอ' },
        ],
      },
      {
        heading: 'Active - Passive สังเกตยังไง',
        content: 'สูตร Passive: <b>S + is/am/are/was/were + V.3 + (by + ผู้ทำ)</b><br>Present: is/am/are + V.3<br>Past: was/were + V.3<br>Future: will be + V.3<br>Perfect: has/have + been + V.3',
        examples: [
          { en: 'The book <b>is read</b> by many.', th: 'Present Passive' },
          { en: 'The letter <b>was sent</b> yesterday.', th: 'Past Passive' },
          { en: 'The house <b>will be built</b> next year.', th: 'Future Passive' },
        ],
      },
      {
        heading: 'Be + ing / V.3 ต่างกันยังไง',
        content: '<b>Be + V.ing</b> (Continuous) = กำลังทำ (Active)<br><b>Be + V.3</b> (Passive) = ถูกกระทำ',
        examples: [
          { en: 'She <b>is cooking</b>.', th: 'เธอกำลังทำอาหาร (Active Continuous)' },
          { en: 'The food <b>is cooked</b>.', th: 'อาหารถูกทำแล้ว (Passive)' },
        ],
      },
    ],
    quiz: [
      { question: 'เปลี่ยนเป็น Passive: "She writes a book."', choices: ['A book is wrote by her.', 'A book is written by her.', 'A book writes by her.', 'A book was written by her.'], correctIndex: 1, explain: 'Present Passive = is + V.3 (written)' },
      { question: '"The window ___ by the wind." (อดีต)', choices: ['broke', 'is broken', 'was broken', 'has broke'], correctIndex: 2, explain: 'Past Passive = was + V.3 (broken)' },
      { question: 'ประโยคใดเป็น Passive Voice', choices: ['She is eating.', 'She is eaten.', 'She has eaten.', 'She was eating.'], correctIndex: 1, explain: 'is + V.3 (eaten) = Passive' },
      { question: '"The homework ___ every day." (Present Passive)', choices: ['does', 'is done', 'is doing', 'has done'], correctIndex: 1, explain: 'Present Passive = is + V.3 (done)' },
    ],
  },

  {
    id: 'participles', num: 12, title: 'Participles', icon: '🔗', color: '#5aa76b',
    intro: 'Participle คือรูป -ing (Present) และ V.3/-ed (Past) ของคำกริยา ใช้ทำหน้าที่เป็น adj. หรือลดรูปประโยค',
    sections: [
      {
        heading: 'Participles ทำเองหรือถูกทำ',
        content: '<b>V.ing (Present Participle)</b> = คำที่ให้ความรู้สึก "ทำเอง" (มักใช้กับสิ่งของ)<br><b>V.3 / V-ed (Past Participle)</b> = คำที่บอกความรู้สึกของ "ถูกทำ" (มักใช้กับคน)',
        examples: [
          { en: 'The movie is <b>boring</b>.', th: 'หนังน่าเบื่อ (หนังทำให้เบื่อ)' },
          { en: 'I am <b>bored</b>.', th: 'ฉันเบื่อ (ฉันถูกทำให้เบื่อ)' },
        ],
      },
      {
        heading: 'การลดรูป Participles',
        content: 'ใช้ Participle ลดรูปประโยคย่อย (Relative Clause) ให้สั้นลง<br>ถ้าเป็น Active → ใช้ V.ing<br>ถ้าเป็น Passive → ใช้ V.3',
        examples: [
          { en: 'The girl <b>who is singing</b> is my sister. → The girl <b>singing</b> is my sister.', th: 'ลดรูป who is → -ing' },
          { en: 'The book <b>which was written</b> by him. → The book <b>written</b> by him.', th: 'ลดรูป which was → V.3' },
        ],
      },
      {
        heading: '-ing น่า... / -ed รู้สึก...',
        content: 'กลุ่มคำที่จำง่าย: -ing = "น่า..." (ทำให้รู้สึก), -ed = "รู้สึก..."<br>interesting น่าสนใจ / interested รู้สึกสนใจ<br>exciting น่าตื่นเต้น / excited รู้สึกตื่นเต้น<br>tiring น่าเหนื่อย / tired รู้สึกเหนื่อย',
        examples: [
          { en: 'The book is <b>interesting</b>.', th: 'หนังสือน่าสนใจ' },
          { en: 'I am <b>interested</b> in the book.', th: 'ฉันสนใจในหนังสือ' },
        ],
      },
    ],
    quiz: [
      { question: '"I am ___ in learning English." (รู้สึกสนใจ)', choices: ['interest', 'interesting', 'interested', 'interests'], correctIndex: 2, explain: 'คนรู้สึก → V.3 = interested' },
      { question: '"The lesson is ___." (น่าเบื่อ)', choices: ['bore', 'boring', 'bored', 'boredom'], correctIndex: 1, explain: 'สิ่งของทำให้เบื่อ → V.ing = boring' },
      { question: 'ลดรูป: "The man who is standing there is my father."', choices: ['The man stood there is my father.', 'The man standing there is my father.', 'The man stand there is my father.', 'The man to stand there is my father.'], correctIndex: 1, explain: 'ลดรูป Active → V.ing = standing' },
      { question: '"She was ___ by the news." (รู้สึกช็อค)', choices: ['shock', 'shocking', 'shocked', 'shocks'], correctIndex: 2, explain: 'คนรู้สึก → V.3 = shocked' },
    ],
  },

  {
    id: 'gerund-infinitive', num: 13, title: 'Gerund and Infinitives', icon: '📝', color: '#5aa76b',
    intro: 'Gerund = V.ing ทำหน้าที่เป็นคำนาม / Infinitive = to + V.1',
    sections: [
      {
        heading: 'Gerund (V.ing)',
        content: 'Gerund คือ V.ing ที่ทำหน้าที่เป็นคำนาม เป็นประธาน กรรม หรือหลัง preposition',
        examples: [
          { en: '<b>Swimming</b> is fun.', th: 'การว่ายน้ำสนุก (ประธาน)' },
          { en: 'I love <b>reading</b>.', th: 'ฉันรักการอ่าน (กรรม)' },
          { en: 'She is good at <b>singing</b>.', th: 'เธอเก่งการร้องเพลง (หลัง prep)' },
        ],
      },
      {
        heading: 'Infinitive (to + V.1)',
        content: 'Infinitive คือ to + V.1 ใช้บอกจุดประสงค์ หรือหลังกริยาบางตัว',
        examples: [
          { en: 'I want <b>to eat</b>.', th: 'ฉันอยากกิน' },
          { en: 'She went <b>to buy</b> food.', th: 'เธอไปซื้อของ (บอกจุดประสงค์)' },
        ],
      },
      {
        heading: 'กริยาที่ตามด้วย Gerund',
        content: 'enjoy, finish, mind, avoid, suggest, practice, keep, admit, deny, imagine + V.ing',
        examples: [
          { en: 'I <b>enjoy playing</b> games.', th: 'ฉันชอบเล่นเกม' },
          { en: 'She <b>finished cooking</b>.', th: 'เธอทำอาหารเสร็จ' },
        ],
      },
      {
        heading: 'กริยาที่ตามด้วย Infinitive',
        content: 'want, need, decide, hope, plan, promise, agree, learn, offer, refuse + to + V.1',
        examples: [
          { en: 'I <b>want to go</b> home.', th: 'ฉันอยากกลับบ้าน' },
          { en: 'She <b>decided to leave</b>.', th: 'เธอตัดสินใจจะจากไป' },
        ],
      },
      {
        heading: '5 กริยาพิเศษ (ตามได้ทั้ง Gerund และ Infinitive)',
        content: 'like, love, hate, start, begin, prefer, continue → ตามด้วยทั้ง V.ing และ to + V.1 ได้ ความหมายใกล้เคียงกัน',
        examples: [
          { en: 'I <b>like swimming</b>. = I <b>like to swim</b>.', th: 'ฉันชอบว่ายน้ำ (ใช้ได้ทั้งคู่)' },
        ],
      },
    ],
    quiz: [
      { question: '"I enjoy ___ music."', choices: ['listen', 'to listen', 'listening', 'listened'], correctIndex: 2, explain: 'enjoy + V.ing = listening' },
      { question: '"She wants ___ a doctor."', choices: ['be', 'to be', 'being', 'is'], correctIndex: 1, explain: 'want + to + V.1 = to be' },
      { question: '"___ is good for your health."', choices: ['Exercise', 'To exercising', 'Exercising', 'Exercised'], correctIndex: 2, explain: 'ประธานเป็นกิจกรรม ใช้ Gerund = Exercising' },
      { question: '"He decided ___ the country."', choices: ['leave', 'leaving', 'to leave', 'left'], correctIndex: 2, explain: 'decide + to + V.1 = to leave' },
      { question: '"I love ___" (ทั้งสองคำตอบถูก แต่ถ้าเลือกได้ 1 ข้อ)', choices: ['read', 'reads', 'reading', 'to reading'], correctIndex: 2, explain: 'love + V.ing หรือ to + V.1 ก็ได้ (reading ถูกที่สุด)' },
    ],
  },

  {
    id: 'prepositions', num: 14, title: 'Prepositions บุพบท', icon: '📍', color: '#4a7cc1',
    intro: 'Preposition คือคำบุพบท ใช้เชื่อมความสัมพันธ์ของคำ บอกสถานที่ เวลา วิธี',
    sections: [
      {
        heading: 'in / on / at + เวลา',
        content: '<b>in</b> + เดือน, ปี, ฤดู, ช่วงเวลา (in January, in 2024, in the morning)<br><b>on</b> + วัน, วันที่ (on Monday, on July 4)<br><b>at</b> + เวลาเป็นชั่วโมง (at 5 PM, at noon, at night)',
        examples: [
          { en: 'I was born <b>in</b> 1995.', th: 'in + ปี' },
          { en: 'See you <b>on</b> Monday.', th: 'on + วัน' },
          { en: 'The meeting is <b>at</b> 3 PM.', th: 'at + เวลา' },
        ],
      },
      {
        heading: 'in / on / at + สถานที่',
        content: '<b>in</b> = ในบริเวณกว้าง ๆ (in Bangkok, in Thailand)<br><b>on</b> = อยู่บนพื้นผิว (on the table, on the wall)<br><b>at</b> = อยู่ที่จุดเฉพาะ (at home, at the door)',
        examples: [
          { en: 'She lives <b>in</b> Bangkok.', th: 'ในเมือง' },
          { en: 'The book is <b>on</b> the desk.', th: 'บนโต๊ะ' },
          { en: 'I am <b>at</b> the airport.', th: 'ที่จุดเฉพาะ' },
        ],
      },
      {
        heading: 'in / on + ยานพาหนะ',
        content: '<b>in</b> + รถส่วนตัว (in a car, in a taxi)<br><b>on</b> + ยานพาหนะสาธารณะ (on a bus, on a train, on a plane)',
        examples: [
          { en: 'I go to work <b>in</b> a car.', th: 'ในรถส่วนตัว' },
          { en: 'She is <b>on</b> the bus.', th: 'บนรถประจำทาง' },
        ],
      },
      {
        heading: 'in / into / inside',
        content: '<b>in</b> = อยู่ข้างใน (สถานะ)<br><b>into</b> = เข้าไปข้างใน (การเคลื่อนไหว)<br><b>inside</b> = ภายในของ',
        examples: [
          { en: 'She is <b>in</b> the room.', th: 'อยู่ในห้อง' },
          { en: 'She walked <b>into</b> the room.', th: 'เดินเข้าไปในห้อง' },
        ],
      },
      {
        heading: 'between vs among',
        content: '<b>between</b> = ระหว่างสองสิ่ง<br><b>among</b> = ท่ามกลาง (3 อย่างขึ้นไป)',
        examples: [
          { en: 'Sit <b>between</b> John and Mary.', th: 'ระหว่างสองคน' },
          { en: 'She sat <b>among</b> her friends.', th: 'ท่ามกลางเพื่อน ๆ' },
        ],
      },
    ],
    quiz: [
      { question: '"I was born ___ July."', choices: ['in', 'on', 'at', 'by'], correctIndex: 0, explain: 'in + เดือน' },
      { question: '"See you ___ 3 o\'clock."', choices: ['in', 'on', 'at', 'by'], correctIndex: 2, explain: 'at + เวลาเป็นชั่วโมง' },
      { question: '"The book is ___ the table."', choices: ['in', 'on', 'at', 'to'], correctIndex: 1, explain: 'on + พื้นผิว' },
      { question: '"He is ___ the bus."', choices: ['in', 'on', 'at', 'to'], correctIndex: 1, explain: 'on + ยานพาหนะสาธารณะ' },
      { question: '"There is a secret ___ us three."', choices: ['between', 'among', 'in', 'on'], correctIndex: 1, explain: '3 คนขึ้นไปใช้ among' },
    ],
  },

  {
    id: 'conjunctions', num: 15, title: 'Conjunctions สันธาน', icon: '🔗', color: '#e0a848',
    intro: 'Conjunction คือคำเชื่อม ใช้เชื่อมคำ วลี หรือประโยคเข้าด้วยกัน',
    sections: [
      {
        heading: 'Conjunctions คืออะไร',
        content: 'Conjunction แบ่งเป็น 3 ประเภท:<br>(1) Coordinating (and, but, or, so, for, nor, yet) - เชื่อมสิ่งที่เท่ากัน<br>(2) Subordinating (because, if, when, although) - เชื่อมประโยคหลักกับประโยครอง<br>(3) Correlative (both...and, either...or, neither...nor)',
        examples: [
          { en: 'I like tea <b>and</b> coffee.', th: 'and เชื่อมสองสิ่ง' },
          { en: 'I stayed <b>because</b> I was tired.', th: 'because = เพราะ' },
        ],
      },
      {
        heading: 'Clause (ประโยคย่อย)',
        content: 'Clause คือส่วนของประโยคที่มีทั้งประธานและกริยา<br>Main Clause = ประโยคหลัก ใช้ยืนเดี่ยวได้<br>Subordinate Clause = ประโยครอง ต้องอาศัยประโยคหลัก',
        examples: [
          { en: '<b>I stayed home</b> because <b>it was raining</b>.', th: 'Main + Subordinate' },
        ],
      },
      {
        heading: 'Phrase (กลุ่มคำ)',
        content: 'Phrase คือกลุ่มคำที่ไม่มีทั้งประธานและกริยาครบ ทำหน้าที่เป็นคำเดียว',
        examples: [
          { en: '<b>In the morning</b>, I drink coffee.', th: 'phrase บอกเวลา' },
          { en: 'The book <b>on the table</b> is mine.', th: 'phrase ขยายนาม' },
        ],
      },
      {
        heading: 'Conjunctions ที่ต้องรู้',
        content: '<b>and</b> = และ | <b>but</b> = แต่ | <b>or</b> = หรือ | <b>so</b> = ดังนั้น<br><b>because</b> = เพราะ | <b>if</b> = ถ้า | <b>when</b> = เมื่อ | <b>although</b> = แม้ว่า<br><b>while</b> = ในขณะที่ | <b>before</b> = ก่อน | <b>after</b> = หลัง',
        examples: [
          { en: 'I studied <b>although</b> I was tired.', th: 'ฉันอ่านหนังสือแม้จะเหนื่อย' },
          { en: 'Call me <b>when</b> you arrive.', th: 'โทรมาเมื่อคุณถึง' },
        ],
      },
    ],
    quiz: [
      { question: '"I was tired, ___ I went to bed."', choices: ['but', 'so', 'or', 'because'], correctIndex: 1, explain: 'so = ดังนั้น (เหตุ → ผล)' },
      { question: '"She didn\'t come ___ she was sick."', choices: ['and', 'or', 'because', 'but'], correctIndex: 2, explain: 'because = เพราะ (บอกเหตุผล)' },
      { question: '"___ it was raining, we went out."', choices: ['Because', 'Although', 'If', 'When'], correctIndex: 1, explain: 'Although = แม้ว่า (ขัดแย้งกัน)' },
      { question: '"I will help you ___ you ask."', choices: ['if', 'because', 'although', 'so'], correctIndex: 0, explain: 'if = ถ้า (เงื่อนไข)' },
    ],
  },

  {
    id: 'comparisons', num: 16, title: 'Comparisons การเปรียบเทียบ', icon: '⚖️', color: '#c14a4a',
    intro: 'การเปรียบเทียบมี 3 ขั้น: ขั้นธรรมดา (Positive), ขั้นกว่า (Comparative), ขั้นสูงสุด (Superlative)',
    sections: [
      {
        heading: 'การเปรียบเทียบคืออะไร',
        content: 'ใช้เปรียบเทียบสองสิ่งขึ้นไป โดยผัน adjective/adverb ตามระดับการเปรียบเทียบ<br>ขั้นธรรมดา: as + adj + as (เท่ากับ)<br>ขั้นกว่า: adj + er / more + adj + than (มากกว่า)<br>ขั้นสูงสุด: the + adj + est / the most + adj (มากที่สุด)',
        examples: [
          { en: 'She is <b>as tall as</b> me.', th: 'เท่ากัน' },
          { en: 'She is <b>taller than</b> me.', th: 'สูงกว่า' },
          { en: 'She is <b>the tallest</b> in the class.', th: 'สูงที่สุด' },
        ],
      },
      {
        heading: 'กฎการผัน Adjective',
        content: '(1) คำสั้น 1 พยางค์ → เติม -er / -est (tall → taller → tallest)<br>(2) คำ 2 พยางค์ลงท้าย -y → เปลี่ยน y เป็น i แล้วเติม (happy → happier → happiest)<br>(3) คำยาว 2+ พยางค์ → ใช้ more / the most (beautiful → more beautiful → the most beautiful)<br>(4) คำผิดปกติ: good → better → best, bad → worse → worst, far → farther → farthest',
        examples: [
          { en: 'big → bigger → biggest', th: 'คำสั้น + er/est' },
          { en: 'easy → easier → easiest', th: 'y → i + er/est' },
          { en: 'expensive → more expensive → the most expensive', th: 'คำยาว + more/most' },
        ],
      },
      {
        heading: 'การผันขั้นธรรมดา (as...as)',
        content: 'ใช้ <b>as + adj + as</b> = เท่ากับ / <b>not as...as</b> = ไม่เท่ากับ',
        examples: [
          { en: 'She is <b>as smart as</b> him.', th: 'เธอฉลาดเท่าเขา' },
          { en: 'This is <b>not as good as</b> that.', th: 'อันนี้ไม่ดีเท่าอันนั้น' },
        ],
      },
      {
        heading: 'การผันขั้นกว่า (Comparative)',
        content: 'ใช้ <b>adj + er + than</b> หรือ <b>more + adj + than</b>',
        examples: [
          { en: 'He is <b>taller than</b> her.', th: 'เขาสูงกว่าเธอ' },
          { en: 'This is <b>more difficult than</b> that.', th: 'อันนี้ยากกว่าอันนั้น' },
        ],
      },
      {
        heading: 'การผันขั้นสูงสุด (Superlative)',
        content: 'ใช้ <b>the + adj + est</b> หรือ <b>the most + adj</b>',
        examples: [
          { en: 'She is <b>the smartest</b> in the class.', th: 'เธอฉลาดที่สุดในห้อง' },
          { en: 'This is <b>the most beautiful</b> place.', th: 'ที่นี่สวยที่สุด' },
        ],
      },
    ],
    quiz: [
      { question: '"My house is ___ than yours."', choices: ['big', 'bigger', 'biggest', 'more big'], correctIndex: 1, explain: 'ขั้นกว่า + คำสั้น = bigger' },
      { question: '"She is the ___ girl in school."', choices: ['pretty', 'prettier', 'prettiest', 'more pretty'], correctIndex: 2, explain: 'ขั้นสูงสุด + y → i + est = prettiest' },
      { question: '"This book is ___ than that one."', choices: ['interesting', 'interestinger', 'more interesting', 'the most interesting'], correctIndex: 2, explain: 'ขั้นกว่า + คำยาว = more + adj + than' },
      { question: '"He is as tall ___ his brother."', choices: ['than', 'as', 'from', 'to'], correctIndex: 1, explain: 'ขั้นเท่ากับ: as + adj + as' },
      { question: 'รูปที่ถูกต้องของ "good" ขั้นกว่า', choices: ['gooder', 'more good', 'better', 'best'], correctIndex: 2, explain: 'good ผันผิดปกติ: good → better → best' },
    ],
  },
];

module.exports = { GRAMMAR_CHAPTERS };
