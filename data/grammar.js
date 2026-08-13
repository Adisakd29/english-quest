// เนื้อหาแกรมม่า 16 บท พร้อมข้อสอบท้ายเรื่องและแบบฝึกหัดในบทเรียน
// โครงสร้าง: chapters[] → { id, num, title, icon, color, intro, sections[], quiz[] }
// section: { heading, content (HTML), examples[], practice[] (optional) }
//   practice item: { prompt, choices[], correctIndex, explain }
//   ← แบบฝึกหัดในบทเรียน ทำเพื่อฝึกทำความเข้าใจ ไม่ให้ EXP
// quiz item: { question, choices[4], correctIndex, explain }
//   ← ข้อสอบท้ายบท ให้ EXP ตามคะแนน

const GRAMMAR_CHAPTERS = [
  {
    id: 'nouns', num: 1, title: 'คำนาม (Nouns)', icon: '📦', color: '#c14a4a',
    intro: 'คำนามคือคำที่ใช้เรียกชื่อคน สัตว์ สิ่งของ สถานที่ หรือความคิด — เป็นหัวใจของประโยคภาษาอังกฤษ',
    sections: [
      {
        heading: 'Part of Speech (ชนิดของคำ 8 ชนิด)',
        content: 'ภาษาอังกฤษแบ่งคำเป็น 8 ชนิด: <b>Noun</b> (คำนาม), <b>Pronoun</b> (สรรพนาม), <b>Verb</b> (กริยา), <b>Adjective</b> (คุณศัพท์), <b>Adverb</b> (กริยาวิเศษณ์), <b>Preposition</b> (บุพบท), <b>Conjunction</b> (สันธาน), <b>Interjection</b> (คำอุทาน)<br><br>คำนามเป็นชนิดที่ใช้บ่อยและสำคัญที่สุด เพราะเป็นทั้งประธานและกรรมของประโยค',
        examples: [
          { en: 'The <b>cat</b> is on the <b>table</b>.', th: 'cat, table เป็นคำนาม' },
          { en: '<b>Bangkok</b> is a big <b>city</b>.', th: 'Bangkok, city เป็นคำนาม' },
        ],
      },
      {
        heading: 'คำนาม 5 ประเภท',
        content: '<b>1) Common Noun</b> คำนามทั่วไป: boy, book, dog<br><b>2) Proper Noun</b> คำนามเฉพาะ (ขึ้นต้นตัวใหญ่): John, Bangkok, Toyota<br><b>3) Collective Noun</b> คำนามหมู่คณะ: team, family, class<br><b>4) Material Noun</b> คำนามเนื้อวัตถุ: gold, water, air<br><b>5) Abstract Noun</b> คำนามนามธรรม: love, happiness, freedom',
        examples: [
          { en: 'The <b>team</b> won the match.', th: 'team = Collective (หมู่คณะ)' },
          { en: 'I need some <b>water</b>.', th: 'water = Material (เนื้อวัตถุ)' },
          { en: '<b>Love</b> is important.', th: 'Love = Abstract (นามธรรม)' },
        ],
        practice: [
          { prompt: '"Toyota" เป็นคำนามประเภทใด', choices: ['Common', 'Proper', 'Material', 'Abstract'], correctIndex: 1, explain: 'Toyota เป็นชื่อยี่ห้อ = Proper Noun (ขึ้นต้นตัวใหญ่)' },
          { prompt: '"Happiness" เป็นคำนามประเภทใด', choices: ['Common', 'Collective', 'Material', 'Abstract'], correctIndex: 3, explain: 'Happiness (ความสุข) จับต้องไม่ได้ = Abstract Noun' },
        ],
      },
      {
        heading: 'Noun Suffix (คำลงท้ายที่บ่งบอกว่าเป็นคำนาม)',
        content: 'ถ้าเห็นคำลงท้ายเหล่านี้ มักเป็นคำนาม:<br>• <b>-tion, -sion</b>: education, decision, action<br>• <b>-ment</b>: movement, agreement, development<br>• <b>-ness</b>: happiness, kindness, sickness<br>• <b>-ity, -ty</b>: activity, safety, ability<br>• <b>-er, -or, -ist</b>: teacher, actor, artist (คนที่ทำอาชีพนั้น)<br>• <b>-ance, -ence</b>: importance, difference<br>• <b>-ship, -hood</b>: friendship, childhood',
        examples: [
          { en: '<b>education</b>, <b>movement</b>, <b>happiness</b>', th: 'ทั้งหมดเป็นคำนาม (ดูจากคำลงท้าย)' },
          { en: 'She is a <b>teacher</b>.', th: 'teacher = คน + er บ่งบอกอาชีพ' },
        ],
        practice: [
          { prompt: 'คำใดเป็นคำนาม', choices: ['careful', 'kindness', 'quickly', 'beautiful'], correctIndex: 1, explain: '-ness เป็น suffix ของคำนาม' },
          { prompt: 'คำใดไม่ใช่คำนาม', choices: ['action', 'friendship', 'important', 'ability'], correctIndex: 2, explain: 'important ลงท้าย -ant เป็น adjective ไม่ใช่คำนาม' },
        ],
      },
      {
        heading: 'การเติม -s / -es (พหูพจน์ปกติ)',
        content: 'กฎการเติม s เพื่อทำเป็นพหูพจน์:<br>• ปกติเติม <b>-s</b>: book → books, cat → cats<br>• ลงท้าย <b>s, ss, sh, ch, x, z</b> → เติม <b>-es</b>: bus → buses, box → boxes<br>• ลงท้าย <b>-y</b> นำหน้าด้วยพยัญชนะ → เปลี่ยน y เป็น i แล้วเติม es: baby → babies<br>• ลงท้าย <b>-y</b> นำหน้าด้วยสระ → เติม s ปกติ: boy → boys<br>• ลงท้าย <b>-f, -fe</b> → เปลี่ยนเป็น v แล้วเติม es: leaf → leaves, knife → knives<br>• ลงท้าย <b>-o</b> → มักเติม es: potato → potatoes',
        examples: [
          { en: 'church → churches, dish → dishes', th: 'ลงท้าย ch, sh → เติม -es' },
          { en: 'city → cities, story → stories', th: 'y นำหน้าด้วยพยัญชนะ → -ies' },
          { en: 'wolf → wolves, life → lives', th: 'f/fe → ves' },
        ],
        practice: [
          { prompt: 'รูปพหูพจน์ของ "box" คือ', choices: ['boxs', 'boxes', 'boxies', 'boxen'], correctIndex: 1, explain: 'ลงท้าย x ต้องเติม -es' },
          { prompt: 'รูปพหูพจน์ของ "story" คือ', choices: ['storys', 'storyes', 'stories', 'story'], correctIndex: 2, explain: 'y นำหน้าด้วยพยัญชนะ (r) → เปลี่ยน y เป็น i แล้ว +es' },
          { prompt: 'รูปพหูพจน์ของ "boy" คือ', choices: ['boys', 'boyes', 'boies', 'boy'], correctIndex: 0, explain: 'y นำหน้าด้วยสระ (o) → เติม s ปกติ' },
        ],
      },
      {
        heading: 'คำนามผันไม่ปกติ (Irregular Plural)',
        content: 'บางคำเปลี่ยนรูปเป็นพหูพจน์ไม่ตามกฎ ต้องจำ:<br>• man → <b>men</b>, woman → <b>women</b>, child → <b>children</b><br>• foot → <b>feet</b>, tooth → <b>teeth</b>, mouse → <b>mice</b><br>• goose → <b>geese</b>, ox → <b>oxen</b>, person → <b>people</b><br>• บางคำใช้รูปเดียวทั้งเอกและพหูพจน์: fish, sheep, deer, aircraft',
        examples: [
          { en: 'One <b>child</b>, two <b>children</b>.', th: 'child มีรูปพหูเป็น children' },
          { en: 'One <b>fish</b>, two <b>fish</b>.', th: 'fish ใช้รูปเดียวกัน' },
        ],
        practice: [
          { prompt: 'รูปพหูพจน์ของ "tooth" คือ', choices: ['tooths', 'toothes', 'teeth', 'teeths'], correctIndex: 2, explain: 'tooth ผันผิดปกติ → teeth' },
          { prompt: 'รูปพหูพจน์ของ "person" คือ', choices: ['persons', 'people', 'peoples', 'person'], correctIndex: 1, explain: 'person → people (people เป็นพหูพจน์แล้ว)' },
        ],
      },
      {
        heading: 'นามนับได้ vs นับไม่ได้ (Countable / Uncountable)',
        content: '<b>Countable Noun</b> นับได้ มีทั้งเอกพจน์และพหูพจน์ ใช้ a/an, many, few นำหน้าได้<br><b>Uncountable Noun</b> นับไม่ได้ ไม่มีรูปพหูพจน์ ใช้ much, little นำหน้า ห้ามใช้ a/an<br><br>Uncountable ที่พบบ่อย:<br>• ของเหลว: water, milk, oil, tea, coffee<br>• ผง/เม็ดเล็ก: sugar, salt, rice, flour<br>• แก๊ส: air, smoke<br>• นามธรรม: information, advice, news, homework, music<br>• วัสดุ: wood, paper, metal, glass',
        examples: [
          { en: 'I have <b>a book</b> / <b>three books</b>.', th: 'Countable' },
          { en: 'I need <b>some water</b>. (ห้าม: a water)', th: 'Uncountable' },
          { en: 'I need <b>some information</b>. (ห้าม: an information)', th: 'information ที่ฝรั่งใช้เป็น Uncountable แต่คนไทยมักผิด' },
        ],
        practice: [
          { prompt: 'คำใดเป็น Uncountable Noun', choices: ['book', 'car', 'water', 'boy'], correctIndex: 2, explain: 'water เป็นของเหลว = Uncountable' },
          { prompt: '"I need some ___." (เลือกคำที่ใช้ได้)', choices: ['a book', 'informations', 'information', 'an information'], correctIndex: 2, explain: 'information นับไม่ได้ ไม่มี s และห้ามใช้ a/an' },
          { prompt: '"How ___ money do you have?"', choices: ['many', 'much', 'few', 'a lot'], correctIndex: 1, explain: 'money = Uncountable → ใช้ much' },
        ],
      },
      {
        heading: 'Possessive (แสดงความเป็นเจ้าของด้วย \'s)',
        content: 'คำนามแสดงความเป็นเจ้าของด้วยการเติม <b>\'s</b> ท้ายคำ:<br>• เอกพจน์ → เติม <b>\'s</b>: John\'s book (หนังสือของจอห์น)<br>• พหูพจน์ลงท้ายด้วย s → เติม <b>\'</b> เฉย ๆ: students\' books (หนังสือของนักเรียนหลายคน)<br>• พหูพจน์ผิดปกติ → เติม <b>\'s</b>: children\'s toys',
        examples: [
          { en: 'This is <b>Mary\'s</b> car.', th: 'รถของแมรี่' },
          { en: 'The <b>boys\'</b> room is messy.', th: 'ห้องของเด็กผู้ชายหลายคน' },
          { en: 'The <b>children\'s</b> books are new.', th: 'หนังสือของเด็ก ๆ' },
        ],
        practice: [
          { prompt: '"หนังสือของ Tom" ในภาษาอังกฤษ', choices: ['Tom book', 'Toms book', 'Tom\'s book', 'Tomes book'], correctIndex: 2, explain: 'เอกพจน์ + \'s = Tom\'s book' },
          { prompt: '"ของเล่นของเด็ก ๆ" (children เป็นพหูพจน์ผิดปกติ)', choices: ['childrens toys', 'children\'s toys', 'childrens\' toys', 'children toys'], correctIndex: 1, explain: 'พหูพจน์ผิดปกติ + \'s = children\'s toys' },
        ],
      },
    ],
    quiz: [
      { question: 'คำใดเป็น Proper Noun', choices: ['city', 'Bangkok', 'love', 'water'], correctIndex: 1, explain: 'Proper Noun คือชื่อเฉพาะ ขึ้นต้นด้วยตัวใหญ่ Bangkok เป็นชื่อเมือง' },
      { question: 'รูปพหูพจน์ของ "baby" คือ', choices: ['babys', 'babyes', 'babies', 'baby'], correctIndex: 2, explain: 'y นำหน้าด้วยพยัญชนะ → เปลี่ยน y เป็น i แล้วเติม -es = babies' },
      { question: 'คำใดเป็น Uncountable Noun', choices: ['book', 'car', 'water', 'boy'], correctIndex: 2, explain: 'water เป็นของเหลว เป็น Uncountable Noun' },
      { question: 'คำลงท้ายด้วย -ness ทำให้เป็นคำชนิดใด', choices: ['กริยา', 'คำนาม', 'คุณศัพท์', 'บุพบท'], correctIndex: 1, explain: '-ness เป็น suffix บ่งบอกคำนาม เช่น happiness' },
      { question: 'คำใดเป็น Abstract Noun', choices: ['dog', 'chair', 'freedom', 'book'], correctIndex: 2, explain: 'freedom (อิสรภาพ) เป็นนามธรรม' },
      { question: 'รูปพหูพจน์ของ "child" คือ', choices: ['childs', 'childes', 'children', 'childrens'], correctIndex: 2, explain: 'child ผันผิดปกติเป็น children' },
      { question: 'รูปพหูพจน์ของ "leaf" คือ', choices: ['leafs', 'leaves', 'leafes', 'leave'], correctIndex: 1, explain: 'ลงท้าย -f → เปลี่ยนเป็น v + es = leaves' },
      { question: '"ของเล่นของ Mary" ในภาษาอังกฤษ', choices: ['Mary toy', 'Marys toy', 'Mary\'s toy', 'Mary toys'], correctIndex: 2, explain: 'แสดงความเป็นเจ้าของ: Mary + \'s + toy' },
    ],
  },
  {
    id: 'determiners', num: 2, title: 'Determiners คำนำหน้านาม', icon: '🔤', color: '#4a7cc1',
    intro: 'คำนำหน้านาม (Determiner) วางหน้าคำนามเพื่อบอกว่าเจาะจงไหน ปริมาณเท่าไร: a, an, the, some, many, this, that',
    sections: [
      {
        heading: 'Article: a vs an',
        content: '<b>a</b> ใช้กับคำนามเอกพจน์ที่ขึ้นต้นด้วยเสียง<b>พยัญชนะ</b><br><b>an</b> ใช้กับคำนามเอกพจน์ที่ขึ้นต้นด้วยเสียง<b>สระ</b> (a, e, i, o, u)<br><br>⚠️ สำคัญ: ดูที่<b>เสียง</b> ไม่ใช่ตัวอักษร<br>• hour, honor ขึ้นต้นด้วย h แต่ออกเสียงสระ → an hour, an honor<br>• university ขึ้นต้นด้วย u แต่ออกเสียง "ยู" (พยัญชนะ) → a university',
        examples: [
          { en: '<b>a</b> book, <b>a</b> cat, <b>a</b> car', th: 'ขึ้นต้นด้วยพยัญชนะ' },
          { en: '<b>an</b> apple, <b>an</b> egg, <b>an</b> orange', th: 'ขึ้นต้นด้วยสระ' },
          { en: '<b>an</b> hour, <b>a</b> university', th: 'ดูเสียง ไม่ใช่ตัวอักษร' },
        ],
        practice: [
          { prompt: 'เลือกคำที่ถูก: "___ elephant"', choices: ['a', 'an', 'the', 'no article'], correctIndex: 1, explain: 'elephant ขึ้นต้นด้วยเสียงสระ /e/ → an' },
          { prompt: '"___ hour" (ชั่วโมง)', choices: ['a', 'an', 'the', 'some'], correctIndex: 1, explain: 'hour ตัว h ไม่ออกเสียง → ออกเสียงสระ → an' },
          { prompt: '"___ university" (มหาวิทยาลัย)', choices: ['a', 'an', 'the', 'some'], correctIndex: 0, explain: 'university ออกเสียง "ยู" (พยัญชนะ) → a' },
        ],
      },
      {
        heading: 'The — เมื่อไหร่ต้องใส่',
        content: 'ใส่ <b>the</b> เมื่อ:<br>1) พูดถึงสิ่งที่มีอยู่หนึ่งเดียว: <b>the sun, the moon, the earth</b><br>2) พูดถึงสิ่งที่รู้กันแล้วในบทสนทนา: I bought a book. <b>The</b> book is good.<br>3) ชื่อแม่น้ำ ทะเล มหาสมุทร: the Chao Phraya, the Pacific Ocean<br>4) ชื่อภูเขาเป็นกลุ่ม: the Himalayas, the Alps<br>5) ชื่อประเทศพหูพจน์: the United States, the Philippines<br>6) ทิศ: the north, the south<br>7) เครื่องดนตรี: play the piano, the guitar<br>8) ชื่อหนังสือพิมพ์: the New York Times',
        examples: [
          { en: '<b>The</b> sun is bright.', th: 'ดวงอาทิตย์มีดวงเดียว' },
          { en: 'I play <b>the</b> guitar.', th: 'เครื่องดนตรี' },
          { en: 'She lives in <b>the</b> United States.', th: 'ประเทศพหูพจน์' },
        ],
        practice: [
          { prompt: '"I want to play ___ piano."', choices: ['a', 'an', 'the', 'no article'], correctIndex: 2, explain: 'เครื่องดนตรีใช้ the' },
          { prompt: '"___ moon is beautiful tonight."', choices: ['A', 'An', 'The', 'No article'], correctIndex: 2, explain: 'moon มีดวงเดียว → the' },
        ],
      },
      {
        heading: 'สำนวนที่ไม่ต้องใช้ Article',
        content: 'สำนวนพิเศษที่ไม่ต้องใส่ a/an/the:<br>• สถานที่ใช้ตามหน้าที่: go to <b>school</b>, at <b>work</b>, in <b>bed</b>, at <b>home</b><br>• ยานพาหนะ + by: by <b>car</b>, by <b>bus</b>, by <b>train</b><br>• มื้ออาหาร: have <b>breakfast</b>, eat <b>lunch</b><br>• กีฬา: play <b>football</b>, play <b>tennis</b> (ไม่มี the)<br>• ภาษา: speak <b>English</b>, learn <b>Thai</b>',
        examples: [
          { en: 'I go to <b>school</b> every day.', th: 'school ใช้ตามหน้าที่ ไม่ใส่ article' },
          { en: 'Let\'s have <b>lunch</b>.', th: 'มื้ออาหาร ไม่ใส่ article' },
          { en: 'She speaks <b>Thai</b>.', th: 'ภาษา ไม่ใส่ article' },
        ],
        practice: [
          { prompt: '"I travel ___ car."', choices: ['a', 'the', 'by', 'in'], correctIndex: 2, explain: 'by + ยานพาหนะ (ไม่มี article)' },
          { prompt: '"He plays ___ football."', choices: ['a', 'an', 'the', 'no article'], correctIndex: 3, explain: 'กีฬาไม่ใส่ article' },
        ],
      },
      {
        heading: 'Quantifiers: Many, Much, A lot of',
        content: '<b>Many</b> = มาก (ใช้กับนามพหูพจน์นับได้)<br><b>Much</b> = มาก (ใช้กับนามนับไม่ได้)<br><b>A lot of / Lots of</b> = มาก (ใช้ได้ทั้งคู่)<br><br>ในประโยคปฏิเสธและคำถาม นิยมใช้ many/much<br>ในประโยคบอกเล่า นิยมใช้ a lot of',
        examples: [
          { en: 'I have <b>many</b> friends.', th: 'friends นับได้พหูพจน์ → many' },
          { en: 'She drinks <b>much</b> water.', th: 'water นับไม่ได้ → much' },
          { en: 'He has <b>a lot of</b> money.', th: 'money นับไม่ได้ ใช้ a lot of ก็ได้' },
          { en: '<b>How many</b> books do you have?', th: 'ในคำถาม → many' },
          { en: '<b>How much</b> money do you need?', th: 'ในคำถาม → much' },
        ],
        practice: [
          { prompt: '"How ___ people are there?"', choices: ['many', 'much', 'a lot', 'little'], correctIndex: 0, explain: 'people = พหูพจน์นับได้ → many' },
          { prompt: '"There isn\'t ___ time left."', choices: ['many', 'much', 'few', 'several'], correctIndex: 1, explain: 'time = นับไม่ได้ → much (ในประโยคปฏิเสธ)' },
        ],
      },
      {
        heading: 'A number of vs The number of',
        content: '<b>A number of</b> + นามพหูพจน์ = "จำนวนหนึ่ง" (หลายคน/ชิ้น) → กริยาเป็นพหูพจน์<br><b>The number of</b> + นามพหูพจน์ = "จำนวน" (ตัวเลข) → กริยาเป็นเอกพจน์',
        examples: [
          { en: '<b>A number of</b> students <b>are</b> absent.', th: 'นักเรียนหลายคนขาด (กริยา are)' },
          { en: '<b>The number of</b> students <b>is</b> 30.', th: 'จำนวนนักเรียน = 30 คน (กริยา is)' },
        ],
        practice: [
          { prompt: '"A number of tourists ___ Thailand every year."', choices: ['visit', 'visits', 'is visiting', 'has visited'], correctIndex: 0, explain: 'A number of + N.พหู → กริยาพหูพจน์ = visit' },
          { prompt: '"The number of accidents ___ increasing."', choices: ['are', 'is', 'were', 'have'], correctIndex: 1, explain: 'The number of → กริยาเอกพจน์ = is' },
        ],
      },
      {
        heading: 'Both, All, Every, Each',
        content: '<b>Both</b> = ทั้งสอง (2 อย่าง) + นามพหูพจน์<br><b>All</b> = ทั้งหมด (3+ ขึ้นไป) + นามพหูพจน์/นับไม่ได้<br><b>Every</b> = ทุก ๆ + นามเอกพจน์ (ถือเป็นเอกพจน์)<br><b>Each</b> = แต่ละ + นามเอกพจน์ (ถือเป็นเอกพจน์)',
        examples: [
          { en: '<b>Both</b> boys <b>are</b> tall.', th: 'both + พหูพจน์' },
          { en: '<b>All</b> students <b>are</b> here.', th: 'all + พหูพจน์' },
          { en: '<b>Every</b> student <b>is</b> here.', th: 'every + เอกพจน์' },
          { en: '<b>Each</b> child <b>has</b> a book.', th: 'each + เอกพจน์' },
        ],
        practice: [
          { prompt: '"___ student in the class is smart."', choices: ['All', 'Every', 'Both', 'Many'], correctIndex: 1, explain: 'student เป็นเอกพจน์ → every หรือ each' },
          { prompt: '"___ my friends live in Bangkok." (3 คนขึ้นไป)', choices: ['Both', 'Every', 'Each', 'All'], correctIndex: 3, explain: '3+ คน + นามพหู → All' },
        ],
      },
      {
        heading: 'Little, Few / A little, A few',
        content: '<b>Few</b> / <b>A few</b> + นามนับได้พหูพจน์ (จำนวนน้อย)<br><b>Little</b> / <b>A little</b> + นามนับไม่ได้ (ปริมาณน้อย)<br><br>⚠️ ต่างกันตรงมี "a" หรือไม่:<br>• มี <b>a</b> = แง่บวก "มีอยู่บ้าง" (a few / a little)<br>• ไม่มี <b>a</b> = แง่ลบ "เกือบไม่มีเลย" (few / little)',
        examples: [
          { en: 'I have <b>a few</b> friends. (บวก)', th: 'มีเพื่อนอยู่บ้าง' },
          { en: 'I have <b>few</b> friends. (ลบ)', th: 'แทบไม่มีเพื่อนเลย' },
          { en: 'She has <b>a little</b> money. (บวก)', th: 'มีเงินอยู่บ้าง' },
          { en: 'She has <b>little</b> money. (ลบ)', th: 'แทบไม่มีเงิน' },
        ],
        practice: [
          { prompt: 'ต้องการพูดว่า "มีเวลาอยู่บ้าง" ใช้อะไร', choices: ['few time', 'a few time', 'little time', 'a little time'], correctIndex: 3, explain: 'time นับไม่ได้ + แง่บวก = a little' },
          { prompt: 'ต้องการพูดว่า "แทบไม่มีคนมา" ใช้อะไร', choices: ['few people came', 'a few people came', 'little people came', 'a little people came'], correctIndex: 0, explain: 'people นับได้ + แง่ลบ = few' },
        ],
      },
      {
        heading: 'This, That, These, Those',
        content: '<b>This</b> (นี้) + นามเอกพจน์ / ของใกล้<br><b>These</b> (เหล่านี้) + นามพหูพจน์ / ของใกล้<br><b>That</b> (นั้น) + นามเอกพจน์ / ของไกล<br><b>Those</b> (เหล่านั้น) + นามพหูพจน์ / ของไกล',
        examples: [
          { en: '<b>This</b> book is mine.', th: 'หนังสือเล่มนี้' },
          { en: '<b>These</b> books are mine.', th: 'หนังสือเหล่านี้' },
          { en: '<b>That</b> car is fast.', th: 'รถคันนั้น' },
          { en: '<b>Those</b> cars are new.', th: 'รถเหล่านั้น' },
        ],
        practice: [
          { prompt: '"___ students in my class are smart." (ชี้ไปกลุ่มไกล)', choices: ['This', 'That', 'These', 'Those'], correctIndex: 3, explain: 'students = พหูพจน์ + ไกล → Those' },
          { prompt: '"___ apple looks delicious." (ในมือ)', choices: ['This', 'That', 'These', 'Those'], correctIndex: 0, explain: 'apple = เอกพจน์ + ใกล้ → This' },
        ],
      },
    ],
    quiz: [
      { question: '"I saw ___ elephant at the zoo."', choices: ['a', 'an', 'the', 'no article'], correctIndex: 1, explain: 'elephant ขึ้นต้นด้วยเสียงสระ → an' },
      { question: '"How ___ water do you drink?"', choices: ['many', 'much', 'few', 'several'], correctIndex: 1, explain: 'water นับไม่ได้ → much' },
      { question: '"She has ___ friends." (แง่บวก - มีอยู่บ้าง)', choices: ['few', 'a few', 'little', 'a little'], correctIndex: 1, explain: 'friends นับได้ + แง่บวก → a few' },
      { question: '"___ students in my class are smart." (ชี้ไกล)', choices: ['This', 'That', 'These', 'Those'], correctIndex: 3, explain: 'students พหูพจน์ + ไกล → Those' },
      { question: '"I need ___ information."', choices: ['many', 'a', 'some', 'few'], correctIndex: 2, explain: 'information นับไม่ได้ ใช้ some ได้' },
      { question: '"___ student has a book." (แต่ละคน)', choices: ['Every', 'All', 'Both', 'Each'], correctIndex: 3, explain: 'แต่ละคน = Each + นามเอกพจน์' },
      { question: '"___ hour is 60 minutes."', choices: ['A', 'An', 'The', 'No article'], correctIndex: 1, explain: 'hour ตัว h เงียบ ออกเสียงสระ → an' },
      { question: '"I go to ___ school by bus."', choices: ['a', 'the', 'no article', 'an'], correctIndex: 2, explain: 'go to school ใช้ตามหน้าที่ ไม่ต้องมี article' },
    ],
  },
  {
    id: 'adjectives', num: 3, title: 'Adjectives คุณศัพท์', icon: '🎨', color: '#d97748',
    intro: 'Adjective ใช้ขยายคำนาม เพื่อบอกลักษณะ สี ขนาด รูปร่าง อารมณ์ หรือเป็นอย่างไร',
    sections: [
      {
        heading: 'Adjective คืออะไร ใช้ยังไง',
        content: 'Adjective ใช้ขยายคำนาม มี 2 ตำแหน่ง:<br>1) วางไว้<b>หน้าคำนาม</b>: a <b>beautiful</b> girl<br>2) วางไว้<b>หลัง Verb to be</b> (is/am/are/was/were): She is <b>beautiful</b>.<br><br>หรือหลังกริยาแสดงสภาพ (look, feel, seem, taste, smell): It looks <b>good</b>.',
        examples: [
          { en: 'a <b>tall</b> building', th: 'หน้านาม' },
          { en: 'The building is <b>tall</b>.', th: 'หลัง verb to be' },
          { en: 'The soup tastes <b>delicious</b>.', th: 'หลังกริยาแสดงสภาพ' },
        ],
      },
      {
        heading: 'Adjective Suffix (คำลงท้ายบ่งบอกว่าเป็น adj)',
        content: 'สังเกต adjective ได้จากคำลงท้าย:<br>• <b>-ful</b>: beautiful, careful, useful<br>• <b>-less</b>: useless, careless, hopeless<br>• <b>-ous</b>: dangerous, famous, nervous<br>• <b>-ive</b>: active, creative, expensive<br>• <b>-able / -ible</b>: comfortable, possible, terrible<br>• <b>-al</b>: national, natural, personal<br>• <b>-y</b>: happy, sunny, cloudy<br>• <b>-ish</b>: childish, selfish, foolish<br>• <b>-ic</b>: magic, basic, romantic',
        examples: [
          { en: 'She is <b>careful</b>.', th: '-ful' },
          { en: 'The road is <b>dangerous</b>.', th: '-ous' },
          { en: 'This chair is <b>comfortable</b>.', th: '-able' },
        ],
        practice: [
          { prompt: 'คำใดเป็น adjective', choices: ['run', 'quickly', 'careful', 'happiness'], correctIndex: 2, explain: 'careful ลงท้าย -ful เป็น adjective' },
          { prompt: 'คำใดเป็น adjective', choices: ['action', 'active', 'act', 'actor'], correctIndex: 1, explain: 'active ลงท้าย -ive เป็น adjective' },
        ],
      },
      {
        heading: 'Adjective ที่ไม่มี Suffix',
        content: 'บาง adjective ไม่มี suffix เฉพาะ ต้องจำ เช่น:<br>• ขนาด: big, small, tall, short, long, wide<br>• อายุ: young, old, new<br>• สี: red, blue, green, white, black<br>• อุณหภูมิ: hot, cold, warm, cool<br>• รสชาติ: sweet, sour, salty, bitter<br>• คุณภาพ: good, bad, nice, poor, rich',
        examples: [
          { en: 'a <b>big</b> house', th: 'ขนาด' },
          { en: '<b>red</b> apples', th: 'สี' },
          { en: '<b>hot</b> coffee', th: 'อุณหภูมิ' },
        ],
      },
      {
        heading: 'ลำดับของ Adjectives (Order of Adjectives)',
        content: 'ถ้ามี adjective หลายตัวขยายนามเดียว เรียงตามลำดับ: <b>ความคิดเห็น → ขนาด → อายุ → รูปร่าง → สี → ที่มา → วัสดุ → ประเภท → นาม</b><br>จำง่าย ๆ: <b>OSASCOMP</b> (Opinion, Size, Age, Shape, Color, Origin, Material, Purpose)',
        examples: [
          { en: 'a <b>beautiful small old round red</b> Japanese wooden table', th: 'ขยายเยอะแต่เรียงตามกฎ' },
          { en: 'a <b>lovely little</b> girl', th: 'Opinion + Size' },
          { en: 'an <b>old red</b> car', th: 'Age + Color' },
        ],
        practice: [
          { prompt: 'ลำดับที่ถูกต้อง', choices: ['a red big ball', 'a big red ball', 'a ball big red', 'a red ball big'], correctIndex: 1, explain: 'ขนาด (big) มาก่อนสี (red)' },
          { prompt: 'ลำดับที่ถูก: "___ dress"', choices: ['a silk beautiful long', 'a beautiful long silk', 'a long silk beautiful', 'a silk long beautiful'], correctIndex: 1, explain: 'Opinion (beautiful) → Size (long) → Material (silk)' },
        ],
      },
      {
        heading: 'Adjectives ที่ลงท้ายด้วย -ing vs -ed',
        content: '<b>-ing</b> = "น่า..." (สิ่งของทำให้เรารู้สึก) — ใช้ขยายสิ่งของ<br><b>-ed</b> = "รู้สึก..." (ความรู้สึกของคน) — ใช้กับคน<br><br>• interesting (น่าสนใจ) / interested (รู้สึกสนใจ)<br>• boring (น่าเบื่อ) / bored (รู้สึกเบื่อ)<br>• exciting (น่าตื่นเต้น) / excited (รู้สึกตื่นเต้น)<br>• tiring (น่าเหนื่อย) / tired (รู้สึกเหนื่อย)<br>• confusing (น่างง) / confused (รู้สึกงง)',
        examples: [
          { en: 'The movie is <b>boring</b>. I am <b>bored</b>.', th: 'หนังน่าเบื่อ ฉันรู้สึกเบื่อ' },
          { en: 'The lesson is <b>interesting</b>. Students are <b>interested</b>.', th: 'บทเรียนน่าสนใจ นักเรียนสนใจ' },
        ],
        practice: [
          { prompt: '"I am ___ in learning English."', choices: ['interest', 'interesting', 'interested', 'interests'], correctIndex: 2, explain: 'คนรู้สึก → -ed = interested' },
          { prompt: '"The game is very ___."', choices: ['excite', 'exciting', 'excited', 'excitement'], correctIndex: 1, explain: 'สิ่งของทำให้ตื่นเต้น → -ing = exciting' },
        ],
      },
      {
        heading: 'การใช้ adjective ในประโยคปฏิเสธและคำถาม',
        content: 'ใช้เหมือนประโยคบอกเล่า เพียงเปลี่ยนรูป verb to be:<br>• บอกเล่า: She <b>is</b> tall.<br>• ปฏิเสธ: She <b>is not (isn\'t)</b> tall.<br>• คำถาม: <b>Is</b> she tall?',
        examples: [
          { en: 'The soup <b>isn\'t</b> hot.', th: 'ปฏิเสธ' },
          { en: '<b>Are</b> you tired?', th: 'คำถาม' },
        ],
      },
    ],
    quiz: [
      { question: 'คำใดเป็น adjective', choices: ['run', 'quickly', 'careful', 'happiness'], correctIndex: 2, explain: 'careful ลงท้าย -ful เป็น adjective' },
      { question: 'ประโยคใดใช้ adjective ถูกต้อง', choices: ['She is beautifully.', 'She is a beautiful girl.', 'She beautiful the girl.', 'She beauty girl.'], correctIndex: 1, explain: 'Adjective (beautiful) วางหน้าคำนาม (girl)' },
      { question: 'คำใดไม่ใช่ adjective', choices: ['careful', 'happy', 'quickly', 'famous'], correctIndex: 2, explain: 'quickly ลงท้าย -ly เป็น adverb' },
      { question: 'เติมคำ: "The soup is ___."', choices: ['hotly', 'hot', 'heat', 'heating'], correctIndex: 1, explain: 'หลัง verb to be ใช้ adjective = hot' },
      { question: '"The lesson is ___." (น่าเบื่อ)', choices: ['bore', 'boring', 'bored', 'boredom'], correctIndex: 1, explain: 'สิ่งของทำให้เบื่อ → boring' },
      { question: '"She was ___ by the news." (รู้สึกช็อค)', choices: ['shock', 'shocking', 'shocked', 'shocks'], correctIndex: 2, explain: 'คนรู้สึก → shocked' },
      { question: 'ลำดับที่ถูก: "I want ___."', choices: ['a red small ball', 'a small red ball', 'a ball small red', 'a red ball'], correctIndex: 1, explain: 'ขนาด (small) → สี (red)' },
      { question: '"___ you tired?"', choices: ['Is', 'Are', 'Do', 'Have'], correctIndex: 1, explain: 'you + tired (adj) → ใช้ verb to be = Are' },
    ],
  },
  {
    id: 'adverbs', num: 4, title: 'Adverbs กริยาวิเศษณ์', icon: '⚡', color: '#c14a4a',
    intro: 'Adverb ใช้ขยายคำกริยา คุณศัพท์ หรือ adverb ด้วยกัน บอกวิธี เวลา สถานที่ ความถี่ ระดับ',
    sections: [
      {
        heading: 'Adverb คืออะไร',
        content: 'Adverb ส่วนใหญ่เกิดจาก <b>adjective + ly</b><br>• slow → slowly, quick → quickly, careful → carefully<br>• easy → easi<b>ly</b> (y นำหน้าด้วยพยัญชนะ → i + ly)<br><br>แต่บาง adverb ไม่มี -ly ให้จำ:<br>• fast, hard, well, late, early, high, low, near, far',
        examples: [
          { en: 'He runs <b>fast</b>.', th: 'ขยายกริยา runs (fast ไม่มี ly)' },
          { en: 'She sings <b>beautifully</b>.', th: 'beautiful + ly' },
          { en: 'He speaks English <b>well</b>.', th: 'well ไม่มี ly' },
        ],
        practice: [
          { prompt: 'Adverb ของ "easy" คือ', choices: ['easyly', 'easely', 'easily', 'easy'], correctIndex: 2, explain: 'y นำหน้าด้วยพยัญชนะ (s) → เปลี่ยนเป็น i + ly = easily' },
          { prompt: 'Adverb ของ "good" คือ', choices: ['goodly', 'good', 'well', 'better'], correctIndex: 2, explain: 'good → well (ผิดปกติ)' },
        ],
      },
      {
        heading: '5 ประเภทของ Adverb',
        content: '<b>1) Adverb of Manner</b> - บอกอาการ "อย่างไร": quickly, carefully, slowly<br><b>2) Adverb of Frequency</b> - บอกความถี่: always, often, usually, sometimes, seldom, never<br><b>3) Adverb of Degree</b> - บอกระดับ: very, quite, too, extremely, so<br><b>4) Adverb of Time</b> - บอกเวลา: now, today, yesterday, tomorrow, soon<br><b>5) Adverb of Place</b> - บอกสถานที่: here, there, everywhere, outside, upstairs',
        examples: [
          { en: 'She sings <b>beautifully</b>.', th: 'Manner (อย่างไร)' },
          { en: 'I <b>always</b> drink coffee.', th: 'Frequency (บ่อยแค่ไหน)' },
          { en: 'It is <b>very</b> hot.', th: 'Degree (ระดับ)' },
        ],
        practice: [
          { prompt: '"always" เป็น adverb ประเภทใด', choices: ['Manner', 'Frequency', 'Degree', 'Time'], correctIndex: 1, explain: 'always = เสมอ บอกความถี่' },
          { prompt: '"very" เป็น adverb ประเภทใด', choices: ['Manner', 'Frequency', 'Degree', 'Place'], correctIndex: 2, explain: 'very = มาก บอกระดับ' },
        ],
      },
      {
        heading: 'ตำแหน่งของ Adverb of Frequency',
        content: 'Adverb of Frequency (always, often, usually, sometimes, seldom, never, rarely) มีตำแหน่งเฉพาะ:<br>• วางหน้ากริยาทั่วไป: I <b>always</b> eat breakfast.<br>• วางหลัง verb to be: She <b>is always</b> late.<br>• วางหลัง auxiliary verb: I <b>have never</b> been to Japan.<br><br>ลำดับความถี่:<br>always (100%) > usually > often > sometimes > seldom > never (0%)',
        examples: [
          { en: 'He <b>often</b> plays football.', th: 'หน้ากริยาทั่วไป' },
          { en: 'She <b>is usually</b> happy.', th: 'หลัง verb to be' },
          { en: 'I <b>have never</b> tried sushi.', th: 'หลัง auxiliary (have)' },
        ],
        practice: [
          { prompt: 'ประโยคใดถูก', choices: ['She always is late.', 'She is always late.', 'Always she is late.', 'She is late always.'], correctIndex: 1, explain: 'always วางหลัง verb to be (is)' },
          { prompt: 'ประโยคใดถูก', choices: ['I never eat meat.', 'I eat never meat.', 'Never I eat meat.', 'I eat meat never.'], correctIndex: 0, explain: 'never วางหน้ากริยาทั่วไป (eat)' },
        ],
      },
      {
        heading: 'การเรียง Adverb หลายตัว (MPT)',
        content: 'ถ้ามี adverb หลายตัวในประโยค เรียงตามลำดับ: <b>Manner → Place → Time (MPT)</b>',
        examples: [
          { en: 'She sang <b>beautifully</b> <b>at the party</b> <b>last night</b>.', th: 'M → P → T' },
          { en: 'He plays <b>well</b> <b>at home</b> <b>every day</b>.', th: 'M → P → T' },
        ],
        practice: [
          { prompt: 'ประโยคใดเรียงลำดับถูก', choices: ['She works here every day quietly.', 'She works quietly here every day.', 'She works every day here quietly.', 'She works quietly every day here.'], correctIndex: 1, explain: 'M(quietly) → P(here) → T(every day)' },
        ],
      },
      {
        heading: 'ความแตกต่างระหว่าง Adj และ Adv',
        content: '<b>Adjective</b> ใช้ขยาย<b>คำนาม</b> หรือหลัง verb to be<br><b>Adverb</b> ใช้ขยาย<b>คำกริยา</b> (หรือ adj / adv ด้วยกัน)<br><br>• She is a <b>quick</b> runner. (quick = adj ขยาย runner)<br>• She runs <b>quickly</b>. (quickly = adv ขยาย runs)',
        examples: [
          { en: 'He is a <b>careful</b> driver.', th: 'careful (adj) ขยาย driver' },
          { en: 'He drives <b>carefully</b>.', th: 'carefully (adv) ขยาย drives' },
        ],
        practice: [
          { prompt: '"He speaks English ___."', choices: ['good', 'well', 'better', 'goodly'], correctIndex: 1, explain: 'ขยายกริยา speaks ต้องใช้ adv = well' },
          { prompt: '"She is a ___ dancer."', choices: ['beautiful', 'beautifully', 'beauty', 'beautify'], correctIndex: 0, explain: 'ขยายนาม dancer ใช้ adj = beautiful' },
        ],
      },
    ],
    quiz: [
      { question: 'คำใดเป็น adverb', choices: ['happy', 'quickly', 'beauty', 'careful'], correctIndex: 1, explain: 'quickly ลงท้าย -ly เป็น adverb' },
      { question: 'Adverb of Frequency คือคำใด', choices: ['quickly', 'always', 'here', 'very'], correctIndex: 1, explain: 'always = เสมอ บอกความถี่' },
      { question: 'ลำดับ adverb ที่ถูกต้อง', choices: ['She works here every day quietly.', 'She works quietly here every day.', 'She works every day here quietly.', 'She works quietly every day here.'], correctIndex: 1, explain: 'M → P → T' },
      { question: 'ประโยคใดใช้ adverb ผิด', choices: ['He runs fast.', 'He runs quickly.', 'He runs quick.', 'He runs carefully.'], correctIndex: 2, explain: 'quick เป็น adjective ต้องใช้ quickly (adv)' },
      { question: 'Adverb ของ "easy" คือ', choices: ['easily', 'easyly', 'easyly', 'ease'], correctIndex: 0, explain: 'y นำหน้าด้วยพยัญชนะ → easily' },
      { question: '"She is ___ late." (เสมอ)', choices: ['always', 'never', 'often', 'sometimes'], correctIndex: 0, explain: 'always = เสมอ' },
      { question: 'ตำแหน่งที่ถูกของ often: "___"', choices: ['Often he goes to the gym.', 'He often goes to the gym.', 'He goes often to the gym.', 'He goes to the gym often.'], correctIndex: 1, explain: 'often วางหน้ากริยาทั่วไป' },
      { question: '"She sings ___."', choices: ['beautiful', 'beautifully', 'beauty', 'beautify'], correctIndex: 1, explain: 'ขยายกริยา sings → adv = beautifully' },
    ],
  },
  {
    id: 'pronouns', num: 5, title: 'Pronouns สรรพนาม', icon: '👥', color: '#5aa76b',
    intro: 'Pronoun ใช้แทนคำนาม เพื่อไม่ให้พูดชื่อซ้ำ ๆ มี 5 รูปตามตำแหน่งในประโยค',
    sections: [
      {
        heading: 'ตาราง Pronoun 5 แถว',
        content: 'จำ 7 ประธานหลัก: I, You, He, She, It, We, They<br>แต่ละอันมี 5 รูป:<br><br><b>1) Subject</b> (ประธาน): I, you, he, she, it, we, they<br><b>2) Object</b> (กรรม): me, you, him, her, it, us, them<br><b>3) Possessive Adj</b> (ของ + นาม): my, your, his, her, its, our, their<br><b>4) Possessive Pronoun</b> (ของ - แทนสิ่งของ): mine, yours, his, hers, ours, theirs<br><b>5) Reflexive</b> (ตัวเอง): myself, yourself, himself, herself, itself, ourselves, themselves',
        examples: [
          { en: '<b>She</b> gave <b>him</b> <b>her</b> book. It\'s <b>hers</b>.', th: 'She=ประธาน, him=กรรม, her=แสดงเจ้าของ, hers=แทนสิ่งของ' },
        ],
      },
      {
        heading: 'Subject Pronoun (ประธาน)',
        content: 'Subject Pronoun ทำหน้าที่เป็นประธาน อยู่ต้นประโยค หน้ากริยา<br>I, You, He, She, It, We, They',
        examples: [
          { en: '<b>I</b> am a student.', th: 'I เป็นประธาน' },
          { en: '<b>They</b> live in Bangkok.', th: 'They เป็นประธาน' },
        ],
        practice: [
          { prompt: '"___ gave me a gift."', choices: ['Him', 'His', 'He', 'Himself'], correctIndex: 2, explain: 'ประธานของประโยค → He' },
          { prompt: '"___ are my friends."', choices: ['Them', 'Their', 'They', 'Theirs'], correctIndex: 2, explain: 'ประธาน + are → They' },
        ],
      },
      {
        heading: 'Object Pronoun (กรรม)',
        content: 'Object Pronoun ทำหน้าที่เป็นกรรม อยู่หลังกริยา หรือหลัง preposition<br>me, you, him, her, it, us, them',
        examples: [
          { en: 'I saw <b>him</b> yesterday.', th: 'หลังกริยา saw' },
          { en: 'Give the book to <b>me</b>.', th: 'หลัง preposition (to)' },
          { en: 'They invited <b>us</b> to dinner.', th: 'หลังกริยา invited' },
        ],
        practice: [
          { prompt: '"She saw ___ at the mall."', choices: ['we', 'us', 'our', 'ours'], correctIndex: 1, explain: 'หลัง saw → object = us' },
          { prompt: '"Please tell ___ the truth."', choices: ['I', 'my', 'me', 'mine'], correctIndex: 2, explain: 'หลัง tell → object = me' },
        ],
      },
      {
        heading: 'Possessive Adj vs Possessive Pronoun (my vs mine)',
        content: '<b>Possessive Adjective</b> ต้องมีคำนามตามหลัง<br>my, your, his, her, its, our, their + <b>N.</b><br><br><b>Possessive Pronoun</b> ใช้แทนสิ่งของ ไม่มีนามตาม<br>mine, yours, his, hers, ours, theirs<br><br>⚠️ ยกเว้น his ใช้ได้ทั้งคู่ (his book / this is his)',
        examples: [
          { en: 'This is <b>my</b> book.', th: 'my + book' },
          { en: 'This book is <b>mine</b>.', th: 'mine (ไม่มีนามตาม)' },
          { en: '<b>Her</b> car is new. <b>Mine</b> is old.', th: 'Her+N / Mine' },
        ],
        practice: [
          { prompt: '"This book is ___." (ของเธอ)', choices: ['her', 'hers', 'herself', 'she'], correctIndex: 1, explain: 'ไม่มีนามตาม → hers' },
          { prompt: '"That is ___ house." (ของเรา)', choices: ['us', 'our', 'ours', 'ourselves'], correctIndex: 1, explain: 'ตามด้วย house → our' },
          { prompt: '"This pen is not ___." (ของฉัน)', choices: ['I', 'my', 'me', 'mine'], correctIndex: 3, explain: 'ไม่มีนามตาม → mine' },
        ],
      },
      {
        heading: 'Reflexive Pronoun (-self / -selves)',
        content: 'Reflexive ใช้เมื่อ:<br>1) ประธานทำกริยากับตัวเอง: I hurt <b>myself</b>.<br>2) เน้นย้ำว่าทำเอง: I did it <b>myself</b>.<br><br>รูปพหูพจน์ใช้ -selves: ourselves, yourselves, themselves',
        examples: [
          { en: 'She cut <b>herself</b>.', th: 'ประธานทำกับตัวเอง' },
          { en: 'I made this cake <b>myself</b>.', th: 'เน้นย้ำ = ทำเอง' },
          { en: 'They enjoyed <b>themselves</b>.', th: 'พหูพจน์ = themselves' },
        ],
        practice: [
          { prompt: '"She cut ___ while cooking."', choices: ['her', 'hers', 'herself', 'she'], correctIndex: 2, explain: 'ทำกับตัวเอง → herself' },
          { prompt: '"We enjoyed ___ at the party."', choices: ['ourself', 'ourselves', 'us', 'our'], correctIndex: 1, explain: 'พหูพจน์ = ourselves (มี s)' },
        ],
      },
      {
        heading: 'ตัวย่อ (Contractions)',
        content: 'ในการเขียน/พูดแบบไม่เป็นทางการ นิยมใช้ตัวย่อ:<br>• I am = <b>I\'m</b>, you are = <b>you\'re</b>, he is = <b>he\'s</b>, she is = <b>she\'s</b><br>• we are = <b>we\'re</b>, they are = <b>they\'re</b>, it is = <b>it\'s</b><br>• I have = <b>I\'ve</b>, I will = <b>I\'ll</b>, I would = <b>I\'d</b><br>• do not = <b>don\'t</b>, does not = <b>doesn\'t</b>, is not = <b>isn\'t</b><br>• cannot = <b>can\'t</b>, will not = <b>won\'t</b>, would not = <b>wouldn\'t</b><br><br>⚠️ ระวังสับสน: <b>it\'s</b> (it is) ≠ <b>its</b> (ของมัน)',
        examples: [
          { en: '<b>I\'m</b> happy.', th: '= I am happy' },
          { en: '<b>They\'re</b> here.', th: '= They are here' },
          { en: '<b>It\'s</b> raining. (it is) vs <b>Its</b> color. (ของมัน)', th: 'ระวังสับสน' },
        ],
        practice: [
          { prompt: '"I\'m" ย่อมาจาก', choices: ['I will', 'I have', 'I am', 'I do'], correctIndex: 2, explain: 'I\'m = I am' },
          { prompt: '"won\'t" ย่อมาจาก', choices: ['will not', 'want not', 'would not', 'was not'], correctIndex: 0, explain: 'won\'t = will not (รูปพิเศษ)' },
          { prompt: 'ประโยคใดถูก', choices: ['Its raining outside.', 'It\'s raining outside.', 'Its\' raining outside.', 'It raining outside.'], correctIndex: 1, explain: '"มันกำลังฝนตก" = It is → It\'s' },
        ],
      },
    ],
    quiz: [
      { question: '"___ gave me a gift."', choices: ['Him', 'His', 'He', 'Himself'], correctIndex: 2, explain: 'ประธาน → He' },
      { question: '"This book is ___." (ของเธอ)', choices: ['her', 'hers', 'herself', 'she'], correctIndex: 1, explain: 'ไม่มีนามตาม → hers' },
      { question: '"She cut ___ while cooking."', choices: ['her', 'hers', 'herself', 'she'], correctIndex: 2, explain: 'ประธานทำกับตัวเอง → herself' },
      { question: '"I\'m" ย่อมาจากอะไร', choices: ['I will', 'I have', 'I am', 'I do'], correctIndex: 2, explain: 'I\'m = I am' },
      { question: '"They saw ___ at the mall."', choices: ['we', 'us', 'our', 'ours'], correctIndex: 1, explain: 'หลังกริยา saw → us' },
      { question: '"That is ___ house." (ของเรา)', choices: ['us', 'our', 'ours', 'ourselves'], correctIndex: 1, explain: 'ตามด้วย house → our' },
      { question: '"We enjoyed ___ at the party."', choices: ['ourself', 'ourselves', 'us', 'our'], correctIndex: 1, explain: 'พหูพจน์ → ourselves' },
      { question: 'ประโยคใดถูก', choices: ['Its color is red.', 'It\'s color is red.', 'Its\' color is red.', 'It color is red.'], correctIndex: 0, explain: '"สีของมัน" = ของมัน → its (ไม่มี \')' },
    ],
  },
  {
    id: 'wh-words', num: 6, title: 'Wh-words คำถาม', icon: '❓', color: '#4a7cc1',
    intro: 'คำที่ขึ้นต้นด้วย Wh- ใช้ตั้งคำถามในภาษาอังกฤษ ให้ได้คำตอบที่มากกว่า Yes/No',
    sections: [
      {
        heading: 'Wh-questions พื้นฐาน 9 ตัว',
        content: '<b>What</b> = อะไร (ถามสิ่งของ/ความคิด)<br><b>When</b> = เมื่อไหร่ (ถามเวลา)<br><b>Where</b> = ที่ไหน (ถามสถานที่)<br><b>Why</b> = ทำไม (ถามเหตุผล)<br><b>Who</b> = ใคร (ประธาน)<br><b>Whom</b> = ใคร (กรรม — ทางการ ปัจจุบันใช้ who แทนได้)<br><b>Whose</b> = ของใคร (แสดงความเป็นเจ้าของ)<br><b>Which</b> = อันไหน (เลือกจากตัวเลือกจำกัด)<br><b>How</b> = อย่างไร (ถามวิธี/ระดับ)',
        examples: [
          { en: '<b>What</b> is your name?', th: 'ถามชื่อ' },
          { en: '<b>Where</b> do you live?', th: 'ถามสถานที่' },
          { en: '<b>Why</b> are you late?', th: 'ถามเหตุผล' },
        ],
        practice: [
          { prompt: '"___ is your birthday?" (ถามวัน)', choices: ['What', 'When', 'Where', 'How'], correctIndex: 1, explain: 'ถามเวลา → When' },
          { prompt: '"___ do you go to school?" (ยังไง)', choices: ['Where', 'When', 'How', 'Why'], correctIndex: 2, explain: 'ถามวิธี → How' },
        ],
      },
      {
        heading: 'โครงสร้างคำถาม Wh-',
        content: 'โครงสร้างพื้นฐาน: <b>Wh- + auxiliary + subject + main verb ...?</b><br><br>• With verb to be: <b>Wh- + is/am/are + subject?</b><br>  What is your name?<br>• With modal verb: <b>Wh- + can/will + subject + verb?</b><br>  Where can I sit?<br>• With action verb: <b>Wh- + do/does/did + subject + verb?</b><br>  When did she leave?<br><br>⚠️ ถ้าถามที่ประธาน ไม่ต้องมี do/does:<br>  <b>Who called</b> me? (ไม่ใช่ Who did call me?)',
        examples: [
          { en: '<b>What</b> is your favorite color?', th: 'What + is + ประธาน' },
          { en: '<b>Where</b> do you work?', th: 'Where + do + you + work' },
          { en: '<b>Who</b> broke the window?', th: 'ถามประธาน ไม่มี do' },
        ],
        practice: [
          { prompt: 'เรียงคำ: "you / where / do / live"', choices: ['You where do live?', 'Where do you live?', 'Where you do live?', 'Do where you live?'], correctIndex: 1, explain: 'Where + do + you + live' },
        ],
      },
      {
        heading: 'What + คำนาม',
        content: 'What ตามด้วยคำนาม เพื่อถามให้เจาะจงมากขึ้น<br>• What time = กี่โมง<br>• What color = สีอะไร<br>• What kind of = ชนิดไหน<br>• What sort of = ประเภทไหน<br>• What size = ขนาดอะไร',
        examples: [
          { en: '<b>What time</b> is it?', th: 'ตอนนี้กี่โมง' },
          { en: '<b>What color</b> is your car?', th: 'รถสีอะไร' },
          { en: '<b>What kind of</b> music do you like?', th: 'ชอบเพลงประเภทไหน' },
        ],
        practice: [
          { prompt: 'ต้องการถาม "รองเท้าขนาดอะไร" ใช้อะไร', choices: ['What time', 'What color', 'What size', 'What kind'], correctIndex: 2, explain: 'What size = ขนาดอะไร' },
        ],
      },
      {
        heading: 'How + adjective/adverb',
        content: 'How ตามด้วย adj/adv ใช้ถามระดับ ปริมาณ ความถี่<br>• <b>How old</b> = อายุเท่าไหร่<br>• <b>How tall</b> = สูงเท่าไหร่<br>• <b>How much</b> = เท่าไหร่ (ราคา/ปริมาณนับไม่ได้)<br>• <b>How many</b> = กี่ (จำนวนนับได้)<br>• <b>How long</b> = นานเท่าไหร่<br>• <b>How often</b> = บ่อยแค่ไหน<br>• <b>How far</b> = ไกลแค่ไหน',
        examples: [
          { en: '<b>How old</b> are you?', th: 'อายุเท่าไหร่' },
          { en: '<b>How much</b> is this?', th: 'ราคาเท่าไหร่' },
          { en: '<b>How many</b> books do you have?', th: 'มีกี่เล่ม' },
          { en: '<b>How often</b> do you exercise?', th: 'ออกกำลังบ่อยแค่ไหน' },
        ],
        practice: [
          { prompt: '"___ old is your brother?"', choices: ['What', 'How', 'Which', 'Whose'], correctIndex: 1, explain: 'How + old = ถามอายุ' },
          { prompt: '"___ people are in the room?" (ถามจำนวน)', choices: ['How much', 'How many', 'How often', 'How long'], correctIndex: 1, explain: 'people นับได้ → How many' },
        ],
      },
      {
        heading: 'Which + คำนาม (เลือกจากตัวเลือก)',
        content: '<b>Which</b> ใช้ถามเมื่อมีตัวเลือกจำกัด ต่างจาก What ที่ตัวเลือกไม่จำกัด<br>• Which = อันไหน (จากที่มีให้เลือก)<br>• What = อะไร (ทั่วไป)',
        examples: [
          { en: '<b>Which shirt</b> do you prefer, red or blue?', th: 'มี 2 ตัวเลือกให้เลือก → Which' },
          { en: '<b>Which one</b> is yours?', th: 'ในกลุ่มที่เห็น' },
          { en: '<b>What</b> do you want? (ทั่วไป)', th: 'ตัวเลือกไม่จำกัด → What' },
        ],
        practice: [
          { prompt: '"___ book do you want — this one or that one?"', choices: ['What', 'Which', 'How', 'Whose'], correctIndex: 1, explain: 'มี 2 ตัวเลือก → Which' },
        ],
      },
      {
        heading: 'Whose = ของใคร',
        content: '<b>Whose</b> ใช้ถามความเป็นเจ้าของ ตามด้วยคำนามได้',
        examples: [
          { en: '<b>Whose</b> book is this?', th: 'หนังสือของใคร' },
          { en: '<b>Whose car</b> is parked outside?', th: 'รถของใครจอด' },
        ],
        practice: [
          { prompt: '"___ car is this?" (ของใคร)', choices: ['Who', 'Whom', 'Whose', 'Which'], correctIndex: 2, explain: 'Whose = ของใคร' },
        ],
      },
    ],
    quiz: [
      { question: '"___ is your birthday?" (ถามวัน)', choices: ['What', 'When', 'Where', 'How'], correctIndex: 1, explain: 'ถามเวลา → When' },
      { question: '"___ old is your brother?"', choices: ['What', 'How', 'Which', 'Whose'], correctIndex: 1, explain: 'How + old = อายุ' },
      { question: '"___ book is this?" (ของใคร)', choices: ['Who', 'Whom', 'Whose', 'Which'], correctIndex: 2, explain: 'Whose = ของใคร' },
      { question: '"___ do you go to school?"', choices: ['Where', 'When', 'How', 'Why'], correctIndex: 2, explain: 'ถามวิธี → How' },
      { question: '"___ one do you want, this or that?"', choices: ['What', 'Which', 'Who', 'Why'], correctIndex: 1, explain: 'มีตัวเลือกจำกัด → Which' },
      { question: '"___ people came to the party?"', choices: ['How much', 'How many', 'How often', 'How long'], correctIndex: 1, explain: 'people นับได้ → How many' },
      { question: '"___ is it? — It\'s 3 PM."', choices: ['What day', 'What color', 'What time', 'What size'], correctIndex: 2, explain: 'ตอบเป็นเวลา → What time' },
      { question: '"___ are you crying?"', choices: ['What', 'When', 'Why', 'Where'], correctIndex: 2, explain: 'ถามเหตุผล → Why' },
    ],
  },
  {
    id: 'relative-pronouns', num: 7, title: 'Relative Pronouns', icon: '🔗', color: '#e0a848',
    intro: 'Relative Pronoun ใช้เชื่อมประโยค ทำหน้าที่แทนคำนามในประโยคที่มาขยาย แปลว่า "ที่/ซึ่ง"',
    sections: [
      {
        heading: 'ห้ามแปลตรงตัว',
        content: 'Relative Pronoun หน้าตาเหมือน Wh-question แต่ทำหน้าที่ต่างกัน ในบริบทนี้แปลว่า "ที่/ซึ่ง" ไม่ใช่คำถาม<br><br>โครงสร้าง: <b>นาม + Relative Pronoun + ประโยคขยาย</b>',
        examples: [
          { en: 'The boy <b>who</b> is running is my brother.', th: 'เด็กผู้ชาย<b>ที่</b>กำลังวิ่งคือน้องชายฉัน' },
          { en: 'The book <b>which</b> I bought is new.', th: 'หนังสือ<b>ที่</b>ฉันซื้อเป็นเล่มใหม่' },
        ],
      },
      {
        heading: 'who, whom, that = คน',
        content: 'ใช้กับคำนามที่เป็น<b>คน</b><br>• <b>who</b> = ประธานของประโยคขยาย<br>• <b>whom</b> = กรรมของประโยคขยาย (ทางการ)<br>• <b>that</b> = แทน who/whom ได้',
        examples: [
          { en: 'The man <b>who</b> called is my uncle.', th: 'ผู้ชายที่โทรมา (who = ประธานของ called)' },
          { en: 'The girl <b>whom</b> I met is nice.', th: 'ผู้หญิงที่ฉันเจอ (whom = กรรมของ met)' },
          { en: 'The teacher <b>that</b> teaches us is kind.', th: 'that แทน who ได้' },
        ],
        practice: [
          { prompt: 'The man ___ lives next door is friendly.', choices: ['which', 'who', 'whose', 'where'], correctIndex: 1, explain: 'ขยายคน + เป็นประธานของ lives → who' },
          { prompt: 'The girl ___ I met yesterday is my cousin.', choices: ['which', 'whom/who', 'whose', 'where'], correctIndex: 1, explain: 'ขยายคน + เป็นกรรมของ met → whom (หรือ who)' },
        ],
      },
      {
        heading: 'which, that = สิ่งของ / สัตว์',
        content: 'ใช้กับคำนามที่เป็น<b>สิ่งของ</b>หรือ<b>สัตว์</b><br>• <b>which</b> ใช้ได้ทั้งประธานและกรรม<br>• <b>that</b> แทน which ได้ทุกกรณี',
        examples: [
          { en: 'The book <b>which</b> I bought is interesting.', th: 'หนังสือที่ฉันซื้อ' },
          { en: 'The dog <b>that</b> is barking is mine.', th: 'สุนัขที่กำลังเห่า (that แทน which)' },
          { en: 'The house <b>which</b> stands on the hill is old.', th: 'บ้านที่ตั้งอยู่บนเขา' },
        ],
        practice: [
          { prompt: 'The car ___ I bought last week is red.', choices: ['who', 'which', 'whose', 'when'], correctIndex: 1, explain: 'ขยายสิ่งของ (car) → which' },
        ],
      },
      {
        heading: 'whose = ของ (แสดงความเป็นเจ้าของ)',
        content: '<b>whose + นาม</b> แสดงความเป็นเจ้าของ ใช้ได้กับคนและสิ่งของ<br>"ที่ ___ ของเขา..." หรือ "ซึ่งมี ___"',
        examples: [
          { en: 'The boy <b>whose</b> mother is a doctor is smart.', th: 'เด็กผู้ชายที่แม่ (ของเขา) เป็นหมอ' },
          { en: 'I know a girl <b>whose</b> brother works here.', th: 'ฉันรู้จักผู้หญิงที่พี่ชาย (ของเธอ) ทำงานที่นี่' },
        ],
        practice: [
          { prompt: 'The girl ___ dress is red is my sister.', choices: ['who', 'whom', 'whose', 'which'], correctIndex: 2, explain: 'แสดงความเป็นเจ้าของ (dress ของ girl) → whose' },
        ],
      },
      {
        heading: 'where = สถานที่, when = เวลา, why = เหตุผล',
        content: 'ใช้ขยายคำนามที่เป็น:<br>• <b>where</b> ขยาย<b>สถานที่</b>: the place where...<br>• <b>when</b> ขยาย<b>เวลา</b>: the day when...<br>• <b>why</b> ขยาย<b>เหตุผล</b>: the reason why...',
        examples: [
          { en: 'The park <b>where</b> we played is big.', th: 'สวนที่เราเล่น (สถานที่)' },
          { en: 'The day <b>when</b> she left was sad.', th: 'วันที่เธอจากไป (เวลา)' },
          { en: 'The reason <b>why</b> he cried is unknown.', th: 'เหตุผลที่เขาร้องไห้' },
        ],
        practice: [
          { prompt: 'This is the house ___ I grew up.', choices: ['which', 'who', 'where', 'whose'], correctIndex: 2, explain: 'ขยายสถานที่ (house) → where' },
          { prompt: 'I remember the day ___ we first met.', choices: ['where', 'when', 'why', 'which'], correctIndex: 1, explain: 'ขยายเวลา (day) → when' },
        ],
      },
      {
        heading: 'การละ Relative Pronoun',
        content: 'ถ้า relative pronoun เป็น<b>กรรม</b>ของประโยคขยาย สามารถ<b>ละได้</b> (informal)<br>ถ้าเป็น<b>ประธาน</b> ห้ามละ',
        examples: [
          { en: 'The book (which) I bought is new.', th: 'ละ which ได้ (กรรม)' },
          { en: 'The man <b>who</b> called (ห้ามละ)', th: 'who เป็นประธาน ห้ามละ' },
        ],
      },
      {
        heading: 'Defining vs Non-defining Clause',
        content: '<b>Defining clause</b> (จำกัดความหมาย): จำเป็น ไม่มี comma<br>The man <b>who lives next door</b> is friendly.<br><br><b>Non-defining clause</b> (เสริมข้อมูล): เอาออกได้ มี comma<br>My father, <b>who is a doctor</b>, is 50.<br><br>⚠️ Non-defining ห้ามใช้ that',
        examples: [
          { en: 'The book that I bought is new. (Defining)', th: 'บ่งชี้ว่าเล่มไหน' },
          { en: 'My mother, who lives in Chiang Mai, is 60. (Non-defining)', th: 'เสริมข้อมูลเรื่องแม่' },
        ],
      },
    ],
    quiz: [
      { question: 'The man ___ lives next door is friendly.', choices: ['which', 'who', 'whose', 'where'], correctIndex: 1, explain: 'ขยายคน + ประธาน → who' },
      { question: 'This is the house ___ I grew up.', choices: ['which', 'who', 'where', 'whose'], correctIndex: 2, explain: 'ขยายสถานที่ → where' },
      { question: 'The girl ___ dress is red is my sister.', choices: ['who', 'whom', 'whose', 'which'], correctIndex: 2, explain: 'แสดงความเป็นเจ้าของ → whose' },
      { question: 'The book ___ I read was interesting.', choices: ['who', 'which', 'whose', 'when'], correctIndex: 1, explain: 'ขยายสิ่งของ → which หรือ that' },
      { question: 'I remember the day ___ we first met.', choices: ['where', 'when', 'why', 'which'], correctIndex: 1, explain: 'ขยายเวลา → when' },
      { question: 'The reason ___ he was late is traffic.', choices: ['where', 'when', 'why', 'who'], correctIndex: 2, explain: 'ขยายเหตุผล → why' },
      { question: 'The teacher ___ teaches us English is nice.', choices: ['which', 'who', 'whose', 'when'], correctIndex: 1, explain: 'ขยายคน + ประธานของ teaches → who' },
      { question: 'The car ___ I bought is red.', choices: ['who', 'whom', 'which', 'whose'], correctIndex: 2, explain: 'ขยายสิ่งของ → which' },
    ],
  },
  {
    id: 'helping-verbs', num: 8, title: 'Helping Verbs กริยาช่วย', icon: '🤝', color: '#c14a4a',
    intro: 'กริยาช่วย (Auxiliary/Modal Verbs) ใช้ร่วมกับกริยาหลัก เพื่อสร้างคำถาม ปฏิเสธ หรือบอกความหมายพิเศษ',
    sections: [
      {
        heading: 'Verb to Be (is, am, are, was, were)',
        content: 'ใช้บอกสภาพ อาชีพ สัญชาติ หรือช่วยสร้าง continuous/passive<br><br><b>ปัจจุบัน:</b><br>• <b>am</b> ใช้กับ I<br>• <b>is</b> ใช้กับ he, she, it, เอกพจน์<br>• <b>are</b> ใช้กับ you, we, they, พหูพจน์<br><br><b>อดีต:</b><br>• <b>was</b> ใช้กับ I, he, she, it<br>• <b>were</b> ใช้กับ you, we, they, พหูพจน์',
        examples: [
          { en: 'I <b>am</b> a student.', th: 'I + am' },
          { en: 'They <b>are</b> happy.', th: 'They + are' },
          { en: 'She <b>was</b> tired yesterday.', th: 'She + was (อดีต)' },
        ],
        practice: [
          { prompt: '"She ___ a doctor." (ปัจจุบัน)', choices: ['am', 'is', 'are', 'be'], correctIndex: 1, explain: 'She เอกพจน์ → is' },
          { prompt: '"They ___ at school yesterday."', choices: ['is', 'are', 'was', 'were'], correctIndex: 3, explain: 'They + อดีต → were' },
        ],
      },
      {
        heading: 'Verb to Do (do, does, did)',
        content: 'ใช้สร้าง<b>คำถามและปฏิเสธ</b>สำหรับกริยาทั่วไป<br>• <b>do</b> ใช้กับ I, you, we, they (ปัจจุบัน)<br>• <b>does</b> ใช้กับ he, she, it (ปัจจุบัน)<br>• <b>did</b> ใช้กับทุกคน (อดีต)<br><br>⚠️ ถ้ามี does/did แล้ว กริยาหลักไม่เติม s/es และไม่เปลี่ยนรูป',
        examples: [
          { en: '<b>Do</b> you like coffee?', th: 'คำถาม + you' },
          { en: 'She <b>does</b>n\'t know.', th: 'ปฏิเสธ + she' },
          { en: '<b>Did</b> he go? (ไม่ใช่ Did he went)', th: 'อดีต + go (V.1)' },
        ],
        practice: [
          { prompt: '"___ you speak English?"', choices: ['Are', 'Do', 'Does', 'Is'], correctIndex: 1, explain: 'you + กริยา speak → Do' },
          { prompt: '"He ___ not like fish."', choices: ['do', 'does', 'is', 'are'], correctIndex: 1, explain: 'He + not like → does not' },
        ],
      },
      {
        heading: 'Verb to Have (have, has, had)',
        content: 'ใช้บอกความเป็นเจ้าของ หรือช่วยสร้าง Perfect Tense<br>• <b>have</b> ใช้กับ I, you, we, they<br>• <b>has</b> ใช้กับ he, she, it<br>• <b>had</b> อดีต (ทุกคน)<br><br>Perfect Tense: have/has/had + V.3',
        examples: [
          { en: 'I <b>have</b> a car.', th: 'ความเป็นเจ้าของ' },
          { en: 'She <b>has</b> finished her work.', th: 'Present Perfect: has + V.3' },
          { en: 'They <b>had</b> already left.', th: 'Past Perfect: had + V.3' },
        ],
        practice: [
          { prompt: '"She ___ finished her homework already."', choices: ['have', 'has', 'had', 'having'], correctIndex: 1, explain: 'She + has + V.3 (Present Perfect)' },
        ],
      },
      {
        heading: 'Modal Verbs — Can, Could',
        content: '<b>can</b> = สามารถ (ปัจจุบัน)<br><b>could</b> = สามารถ (อดีต) หรือขออนุญาต/ขอร้องแบบสุภาพ<br><br>⚠️ Modal ตามด้วย <b>V.1</b> (infinitive without to) เสมอ',
        examples: [
          { en: 'I <b>can</b> swim.', th: 'สามารถทำได้ (ปัจจุบัน)' },
          { en: 'I <b>could</b> swim when I was 5.', th: 'สามารถทำได้ (อดีต)' },
          { en: '<b>Could</b> you help me?', th: 'ขอร้องแบบสุภาพ' },
        ],
        practice: [
          { prompt: '"I ___ swim when I was 5."', choices: ['can', 'could', 'will', 'must'], correctIndex: 1, explain: 'อดีตของ can = could' },
        ],
      },
      {
        heading: 'Will, Would, Shall, Should',
        content: '<b>will</b> = จะ (อนาคต), สัญญา<br><b>would</b> = อดีตของ will, แสดงความสุภาพ, สมมติ<br><b>shall</b> = จะ (formal), ใช้เสนอ<br><b>should</b> = ควรจะ, คำแนะนำ',
        examples: [
          { en: 'I <b>will</b> go tomorrow.', th: 'อนาคต' },
          { en: '<b>Would</b> you like some tea?', th: 'สุภาพ' },
          { en: 'You <b>should</b> study more.', th: 'ควรจะ (คำแนะนำ)' },
          { en: 'I <b>should</b> have called her.', th: 'should + have + V.3 = ควรจะ...แต่ไม่ได้ทำ' },
        ],
        practice: [
          { prompt: '"You ___ eat vegetables. They\'re healthy."', choices: ['must', 'should', 'can', 'will'], correctIndex: 1, explain: 'คำแนะนำ → should' },
        ],
      },
      {
        heading: 'May, Might',
        content: '<b>may</b> = อาจจะ (มั่นใจปานกลาง), ขออนุญาต (สุภาพ)<br><b>might</b> = อาจจะ (มั่นใจน้อยกว่า may)<br><br>ทั้งคู่บอกความน่าจะเป็น ความไม่แน่นอน',
        examples: [
          { en: 'It <b>may</b> rain today.', th: 'อาจจะฝนตก' },
          { en: 'She <b>might</b> come tomorrow.', th: 'อาจจะมา (ไม่แน่ใจ)' },
          { en: '<b>May</b> I come in?', th: 'ขออนุญาตแบบสุภาพ' },
        ],
      },
      {
        heading: 'Must, Have to',
        content: '<b>must</b> = ต้อง (บังคับจากผู้พูด/กฎเกณฑ์ที่เข้มงวด)<br><b>have to</b> = ต้อง (บังคับจากภายนอก/สถานการณ์)<br><br>ทั้งคู่แปลว่า "ต้อง" แต่ที่มาการบังคับต่างกัน',
        examples: [
          { en: 'You <b>must</b> wear a helmet. (กฎ)', th: 'บังคับตามกฎ' },
          { en: 'I <b>have to</b> work tomorrow.', th: 'ต้องทำเพราะสถานการณ์' },
        ],
        practice: [
          { prompt: '"You ___ wear a seatbelt. It\'s the law."', choices: ['may', 'might', 'must', 'should'], correctIndex: 2, explain: 'บังคับตามกฎ → must' },
        ],
      },
    ],
    quiz: [
      { question: '"She ___ a doctor."', choices: ['am', 'is', 'are', 'be'], correctIndex: 1, explain: 'She + is' },
      { question: '"___ you speak English?"', choices: ['Are', 'Do', 'Does', 'Is'], correctIndex: 1, explain: 'you + กริยาทั่วไป → Do' },
      { question: '"I ___ swim when I was 5."', choices: ['can', 'could', 'will', 'must'], correctIndex: 1, explain: 'อดีตของ can → could' },
      { question: '"You ___ wear a seatbelt. It\'s the law."', choices: ['may', 'might', 'must', 'should'], correctIndex: 2, explain: 'บังคับตามกฎ → must' },
      { question: '"She ___ finished her homework."', choices: ['have', 'has', 'had', 'having'], correctIndex: 1, explain: 'She + has + V.3' },
      { question: '"It ___ rain today. Bring an umbrella."', choices: ['must', 'may', 'will', 'should'], correctIndex: 1, explain: 'อาจจะเกิดขึ้น → may' },
      { question: '"They ___ at the beach yesterday."', choices: ['is', 'are', 'was', 'were'], correctIndex: 3, explain: 'They + อดีต → were' },
      { question: '"He ___ not like coffee."', choices: ['do', 'does', 'is', 'are'], correctIndex: 1, explain: 'He + not like → does not' },
    ],
  },
  {
    id: 'sv-agreement', num: 9, title: 'Subject + Verb Agreement', icon: '⚖️', color: '#4a7cc1',
    intro: 'ประธานและกริยาต้องสอดคล้องกัน — ประธานเอกพจน์ใช้กริยาเอกพจน์ ประธานพหูพจน์ใช้กริยาพหูพจน์',
    sections: [
      {
        heading: 'S. + V. Agreement คืออะไร',
        content: 'กฎทั่วไป:<br>• ประธานเอกพจน์ (he, she, it, ชื่อคนเดียว, สิ่งเดียว) → V. เติม s/es<br>• ประธานพหูพจน์ (they, we, ชื่อหลายคน, สิ่งหลายอย่าง) → V. ไม่เติม s<br>• I และ You ใช้ V. ไม่เติม s',
        examples: [
          { en: 'She <b>eats</b> breakfast.', th: 'She (เอกพจน์) → eats' },
          { en: 'They <b>eat</b> breakfast.', th: 'They (พหูพจน์) → eat' },
          { en: 'I <b>eat</b> breakfast.', th: 'I → eat (ไม่ใช่ eats)' },
        ],
        practice: [
          { prompt: '"He ___ to school every day."', choices: ['go', 'goes', 'going', 'went'], correctIndex: 1, explain: 'He เอกพจน์ → goes' },
          { prompt: '"They ___ pizza on Fridays."', choices: ['eat', 'eats', 'eating', 'to eat'], correctIndex: 0, explain: 'They พหูพจน์ → eat' },
        ],
      },
      {
        heading: 'กฎลวง 1: each, every, everyone → เอกพจน์',
        content: '<b>each, every, everyone, someone, anyone, no one, nobody, everybody, somebody, anybody</b> ทั้งหมดถือเป็น<b>เอกพจน์</b> ใช้กริยาเอกพจน์',
        examples: [
          { en: 'Everyone <b>is</b> welcome.', th: 'everyone → is' },
          { en: 'Every student <b>has</b> a book.', th: 'every + N. → has' },
          { en: 'Nobody <b>knows</b> the answer.', th: 'nobody → knows' },
        ],
        practice: [
          { prompt: '"Everyone ___ happy today."', choices: ['is', 'are', 'were', 'be'], correctIndex: 0, explain: 'Everyone = เอกพจน์ → is' },
          { prompt: '"Each student ___ a laptop."', choices: ['have', 'has', 'having', 'to have'], correctIndex: 1, explain: 'Each + N.เอกพจน์ → has' },
        ],
      },
      {
        heading: 'กฎลวง 2: either/or, neither/nor',
        content: '<b>either A or B</b> / <b>neither A nor B</b> ผันตามประธาน<b>ตัวหลัง (B)</b>',
        examples: [
          { en: 'Either John or his friends <b>are</b> coming.', th: 'friends (พหูพจน์) → are' },
          { en: 'Neither the students nor the teacher <b>is</b> here.', th: 'teacher (เอกพจน์) → is' },
        ],
        practice: [
          { prompt: '"Neither Tom nor his brothers ___ coming."', choices: ['is', 'are', 'was', 'has'], correctIndex: 1, explain: 'brothers (พหูพจน์) ตัวหลัง → are' },
        ],
      },
      {
        heading: 'กฎลวง 3: a number of vs the number of',
        content: '<b>A number of + N.พหู</b> = "จำนวนหนึ่ง" (หลาย ๆ) → กริยา<b>พหูพจน์</b><br><b>The number of + N.พหู</b> = "จำนวน" (ตัวเลข) → กริยา<b>เอกพจน์</b><br><br>อีกกลุ่มที่คล้ายกัน:<br>• a lot of / lots of + N. → ผันตามนาม<br>• some of / all of + N. → ผันตามนาม',
        examples: [
          { en: 'A number of students <b>are</b> absent.', th: 'a number of + พหู → are' },
          { en: 'The number of students <b>is</b> 30.', th: 'the number of → is' },
          { en: 'A lot of water <b>is</b> needed.', th: 'water นับไม่ได้ → is' },
          { en: 'A lot of people <b>are</b> here.', th: 'people พหูพจน์ → are' },
        ],
      },
      {
        heading: 'กฎลวง 4: คำที่ลงท้าย s แต่เป็นเอกพจน์',
        content: 'บางคำลงท้าย s แต่ถือเป็น<b>เอกพจน์</b> (ใช้กริยาเอกพจน์):<br>• วิชา: news, mathematics, physics, economics, politics<br>• โรค: measles, mumps, diabetes<br>• เกม: darts, billiards',
        examples: [
          { en: 'The news <b>is</b> shocking.', th: 'news → is' },
          { en: 'Mathematics <b>is</b> difficult.', th: 'mathematics → is' },
        ],
        practice: [
          { prompt: '"The news ___ good."', choices: ['is', 'are', 'were', 'have'], correctIndex: 0, explain: 'news = เอกพจน์ แม้ลงท้าย s → is' },
        ],
      },
      {
        heading: 'กฎลวง 5: นามรวม (Collective Noun)',
        content: 'คำเช่น family, team, class, group, staff, government มักถือเป็น<b>เอกพจน์</b> (มองเป็นก้อนเดียว)<br><br>แต่ถ้าเน้นความหลากหลายของสมาชิก อาจใช้พหูพจน์ได้ (British English)',
        examples: [
          { en: 'My family <b>is</b> big.', th: 'family = หน่วยเดียว → is' },
          { en: 'The team <b>has</b> won.', th: 'team = หน่วยเดียว → has' },
        ],
      },
      {
        heading: 'ประธานเชื่อมด้วย and → พหูพจน์',
        content: 'ประธาน 2 ตัวเชื่อมด้วย <b>and</b> ถือเป็น<b>พหูพจน์</b> (2 คน)',
        examples: [
          { en: 'She and her friend <b>are</b> singing.', th: '2 คน → are' },
          { en: 'Tom and I <b>are</b> friends.', th: '2 คน → are' },
        ],
        practice: [
          { prompt: '"She and her friend ___ singing."', choices: ['is', 'are', 'was', 'am'], correctIndex: 1, explain: '2 คน → are' },
        ],
      },
    ],
    quiz: [
      { question: '"Everyone ___ happy today."', choices: ['is', 'are', 'were', 'be'], correctIndex: 0, explain: 'Everyone = เอกพจน์ → is' },
      { question: '"A lot of people ___ here."', choices: ['is', 'are', 'was', 'has'], correctIndex: 1, explain: 'people พหูพจน์ → are' },
      { question: '"The news ___ good."', choices: ['is', 'are', 'were', 'have'], correctIndex: 0, explain: 'news = เอกพจน์ → is' },
      { question: '"My family ___ big."', choices: ['is', 'are', 'were', 'be'], correctIndex: 0, explain: 'family = หน่วยเดียว → is' },
      { question: '"She and her friend ___ singing."', choices: ['is', 'are', 'was', 'am'], correctIndex: 1, explain: '2 คน → are' },
      { question: '"Each student ___ a laptop."', choices: ['have', 'has', 'having', 'to have'], correctIndex: 1, explain: 'Each = เอกพจน์ → has' },
      { question: '"Neither Tom nor his brothers ___ here."', choices: ['is', 'are', 'was', 'has'], correctIndex: 1, explain: 'brothers ตัวหลัง (พหู) → are' },
      { question: '"Mathematics ___ my favorite subject."', choices: ['are', 'is', 'were', 'have'], correctIndex: 1, explain: 'วิชาลงท้าย s แต่เป็นเอกพจน์ → is' },
    ],
  },
  {
    id: 'tenses', num: 10, title: 'Tense (กาลเวลา)', icon: '⏰', color: '#e0a848',
    intro: 'Tense คือการผันกริยาให้ตรงกับเวลา — เรียนครบ 12 tenses แยกอย่างละเอียดในแต่ละตัว',
    sections: [
      {
        heading: 'ภาพรวม 12 Tense (กราฟความสัมพันธ์)',
        content: '12 Tense = <b>3 ช่วงเวลา (Past, Present, Future)</b> × <b>4 ลักษณะ (Simple, Continuous, Perfect, Perfect Continuous)</b><br><br>สูตรจำใจกลาง:<br>• <b>Simple</b> = V. ธรรมดา<br>• <b>Continuous</b> = <b>be + V.ing</b><br>• <b>Perfect</b> = <b>have + V.3</b><br>• <b>Perfect Continuous</b> = <b>have been + V.ing</b><br><br>เปลี่ยนช่วงเวลาแค่เปลี่ยนรูป be/have:<br>• Present: is/am/are, has/have<br>• Past: was/were, had<br>• Future: will be, will have',
        examples: [
          { en: 'I <b>work</b> (Present Simple)', th: 'ทำงาน (ทั่วไป)' },
          { en: 'I <b>am working</b> (Present Continuous)', th: 'กำลังทำงาน' },
          { en: 'I <b>have worked</b> (Present Perfect)', th: 'ทำงานมาแล้ว' },
          { en: 'I <b>have been working</b> (Present Perfect Continuous)', th: 'ทำงานมาต่อเนื่อง' },
          { en: 'I <b>worked</b> (Past Simple)', th: 'ทำงาน (อดีตจบแล้ว)' },
          { en: 'I <b>will work</b> (Future Simple)', th: 'จะทำงาน' },
        ],
      },
      {
        heading: 'พื้นฐาน: Verb 1, 2, 3 คืออะไร',
        content: 'ทุก tense อาศัยรูป verb 3 แบบ:<br>• <b>V.1 (Base form)</b>: รูปธรรมดา — go, eat, work, write<br>• <b>V.2 (Past Simple)</b>: รูปอดีต — went, ate, worked, wrote<br>• <b>V.3 (Past Participle)</b>: รูปสมบูรณ์ — gone, eaten, worked, written<br><br><b>Regular Verbs</b>: V.2 = V.3 = V.1 + ed (work→worked→worked)<br><b>Irregular Verbs</b>: ต้องจำ (go→went→gone)<br><br>V.ing = รูปที่เติม ing ท้าย V.1 (working, going, eating)',
        examples: [
          { en: 'work → worked → worked (Regular)', th: 'V.1 → V.2 → V.3' },
          { en: 'go → went → gone (Irregular)', th: 'ต้องจำ' },
          { en: 'eat → ate → eaten', th: 'ต้องจำ' },
          { en: 'write → wrote → written', th: 'ต้องจำ' },
          { en: 'be → was/were → been', th: 'be มี 2 รูปใน V.2' },
        ],
      },
      {
        heading: '1️⃣ Present Simple — ปัจจุบันธรรมดา',
        content: '<b>โครงสร้าง:</b><br>• บอกเล่า: <b>S + V.1(s/es)</b><br>• ปฏิเสธ: <b>S + do/does + not + V.1</b><br>• คำถาม: <b>Do/Does + S + V.1 ?</b><br><br><b>ใช้เมื่อ:</b><br>1) ความจริงเสมอ / กฎธรรมชาติ<br>2) นิสัย / กิจวัตรประจำวัน<br>3) ตารางเวลา / กำหนดการ<br>4) ความเห็น / ความรู้สึก / ความชอบ<br><br><b>Time markers (คำบอกเวลา):</b><br>always, usually, often, sometimes, never, every day/week/year, on Mondays',
        examples: [
          { en: 'The sun <b>rises</b> in the east.', th: 'ความจริงเสมอ' },
          { en: 'She <b>drinks</b> coffee every morning.', th: 'นิสัย (she + drinks — เติม s)' },
          { en: 'The train <b>leaves</b> at 8 PM.', th: 'ตารางเวลา' },
          { en: 'I <b>love</b> Thai food.', th: 'ความชอบ' },
          { en: 'He <b>doesn\'t like</b> coffee.', th: 'ปฏิเสธ (doesn\'t + V.1)' },
          { en: '<b>Do</b> you <b>speak</b> English?', th: 'คำถาม (Do + you + V.1)' },
        ],
        practice: [
          { prompt: '"My father ___ in a bank."', choices: ['work', 'works', 'working', 'is work'], correctIndex: 1, explain: 'father (เอกพจน์) + Present Simple → works' },
          { prompt: '"They ___ pizza on weekends." (นิสัย)', choices: ['eat', 'eats', 'is eating', 'ate'], correctIndex: 0, explain: 'they (พหูพจน์) → eat (ไม่เติม s)' },
          { prompt: '"___ she like reading?"', choices: ['Do', 'Does', 'Is', 'Are'], correctIndex: 1, explain: 'she + like → Does she like...' },
        ],
      },
      {
        heading: '2️⃣ Present Continuous — กำลัง...อยู่ตอนนี้',
        content: '<b>โครงสร้าง:</b> <b>S + is/am/are + V.ing</b><br>• I → am + V.ing<br>• He/She/It → is + V.ing<br>• You/We/They → are + V.ing<br><br><b>ใช้เมื่อ:</b><br>1) กำลังเกิดขึ้น<b>ในขณะพูด</b><br>2) กำลังเกิดขึ้นในช่วงนี้ (ไม่จำเป็นต้องขณะพูด)<br>3) แผนในอนาคตอันใกล้ที่จัดไว้แล้ว<br>4) เหตุการณ์เปลี่ยนแปลง (getting bigger, changing)<br><br><b>Time markers:</b> now, right now, at the moment, currently, today, this week/month, these days<br><br>⚠️ <b>Stative Verbs</b> ห้ามใช้กับ Continuous:<br>know, understand, love, hate, want, need, like, believe, remember, seem, own',
        examples: [
          { en: 'I <b>am eating</b> lunch now.', th: 'กำลังกินตอนนี้' },
          { en: 'She <b>is studying</b> for the exam this week.', th: 'ช่วงนี้' },
          { en: 'We <b>are meeting</b> him tomorrow.', th: 'แผนอนาคตอันใกล้' },
          { en: 'The weather <b>is getting</b> warmer.', th: 'การเปลี่ยนแปลง' },
          { en: '❌ I <b>am knowing</b> the answer. → ✅ I <b>know</b>', th: 'know = stative ห้ามใช้ ing' },
        ],
        practice: [
          { prompt: '"Look! It ___." (ตอนนี้)', choices: ['rains', 'is raining', 'rained', 'has rained'], correctIndex: 1, explain: 'ตอนนี้ ขณะพูด → Present Continuous' },
          { prompt: '"They ___ a new house next month." (แผนไว้แล้ว)', choices: ['build', 'are building', 'built', 'will building'], correctIndex: 1, explain: 'แผนอนาคตอันใกล้ที่จัดไว้ → Present Continuous' },
        ],
      },
      {
        heading: '3️⃣ Present Perfect — ทำแล้ว / เคย / มาแล้ว',
        content: '<b>โครงสร้าง:</b> <b>S + has/have + V.3</b><br>• He/She/It → has + V.3<br>• I/You/We/They → have + V.3<br><br><b>ใช้เมื่อ:</b><br>1) เพิ่งเสร็จ (มีผลถึงปัจจุบัน) — I <b>have finished</b> my work.<br>2) ประสบการณ์ (เคย/ไม่เคย) — I <b>have been</b> to Japan.<br>3) เกิดในอดีตแต่ยังเกี่ยวข้อง — She <b>has lost</b> her keys.<br>4) กระทำจากอดีตจนถึงตอนนี้ (ใช้กับ for/since)<br><br><b>Time markers:</b><br>• already, just, yet, recently, lately<br>• ever, never, before<br>• <b>for</b> + ระยะเวลา (for 5 years, for 2 hours)<br>• <b>since</b> + จุดเริ่มต้น (since 2020, since Monday)',
        examples: [
          { en: 'I <b>have already eaten</b>.', th: 'กินแล้ว (เพิ่งเสร็จ)' },
          { en: 'She <b>has never seen</b> snow.', th: 'ไม่เคย' },
          { en: 'They <b>have lived</b> here <b>for</b> 5 years.', th: 'อาศัยมา 5 ปี ยังอยู่' },
          { en: 'He <b>has worked</b> here <b>since</b> 2020.', th: 'ทำงานตั้งแต่ปี 2020' },
          { en: '<b>Have</b> you <b>ever tried</b> sushi?', th: 'คำถาม (เคยไหม)' },
        ],
        practice: [
          { prompt: '"I ___ this movie 3 times." (เคยดู)', choices: ['saw', 'have seen', 'am seeing', 'see'], correctIndex: 1, explain: 'ประสบการณ์ → Present Perfect' },
          { prompt: '"She ___ here since 2019."', choices: ['works', 'is working', 'has worked', 'worked'], correctIndex: 2, explain: 'since + จุดเริ่มต้น → Present Perfect' },
          { prompt: '"They ___ finished the project yet?"', choices: ['Do / have', 'Have / /', 'Has / /', 'Did / have'], correctIndex: 1, explain: 'yet ในคำถาม → Have + S + V.3' },
        ],
      },
      {
        heading: '4️⃣ Present Perfect Continuous — ทำต่อเนื่องมาถึงตอนนี้',
        content: '<b>โครงสร้าง:</b> <b>S + has/have + been + V.ing</b><br><br><b>ใช้เมื่อ:</b><br>1) เหตุการณ์เริ่มในอดีต ทำต่อเนื่อง<b>ยังไม่หยุด</b><br>2) เน้น<b>ระยะเวลา</b>ที่ทำต่อเนื่อง<br>3) เพิ่งหยุดไปหมาด ๆ แต่ผลยังชัดเจน (You look tired! Have you been running?)<br><br><b>ต่างจาก Present Perfect ยังไง?</b><br>• Perfect: เน้นผลลัพธ์ (I have written 3 chapters — ได้ 3 บทแล้ว)<br>• Perfect Continuous: เน้นระยะเวลา/กิจกรรม (I have been writing for 3 hours — เขียนมา 3 ชั่วโมง)<br><br><b>Time markers:</b> for, since, all day, all morning, lately, recently<br><br>⚠️ Stative verbs ห้ามใช้',
        examples: [
          { en: 'I <b>have been studying</b> for 3 hours.', th: 'เรียนมา 3 ชั่วโมง ยังเรียนอยู่' },
          { en: 'She <b>has been waiting</b> since 10 AM.', th: 'รอมาตั้งแต่ 10 โมง' },
          { en: 'It <b>has been raining</b> all day.', th: 'ฝนตกทั้งวัน' },
          { en: 'You look wet. <b>Have</b> you <b>been swimming</b>?', th: 'เพิ่งว่ายน้ำมา' },
        ],
        practice: [
          { prompt: '"He ___ English for 5 years." (เน้นระยะเวลา ยังเรียนอยู่)', choices: ['learns', 'is learning', 'has learned', 'has been learning'], correctIndex: 3, explain: 'เน้นระยะเวลาต่อเนื่อง → Present Perfect Continuous' },
        ],
      },
      {
        heading: '5️⃣ Past Simple — อดีตธรรมดา (เกิด+จบในอดีต)',
        content: '<b>โครงสร้าง:</b><br>• บอกเล่า: <b>S + V.2</b><br>• ปฏิเสธ: <b>S + did not (didn\'t) + V.1</b><br>• คำถาม: <b>Did + S + V.1 ?</b><br><br>⚠️ ในประโยคปฏิเสธ/คำถาม ใช้ <b>V.1</b> ไม่ใช่ V.2 (Did she went? ❌ → Did she go? ✅)<br><br><b>ใช้เมื่อ:</b><br>1) เหตุการณ์เกิดและ<b>จบ</b>ในอดีต<br>2) การกระทำต่อเนื่องเป็นลำดับในอดีต<br>3) นิสัยในอดีต (used to)<br><br><b>Time markers:</b><br>yesterday, last night/week/year, ago (2 days ago), in 1990, when I was young',
        examples: [
          { en: 'I <b>went</b> to school yesterday.', th: 'ไปเมื่อวาน (จบแล้ว)' },
          { en: 'She <b>ate</b> lunch at noon.', th: 'eat → ate (irregular)' },
          { en: 'They <b>played</b> football last week.', th: 'play → played (regular)' },
          { en: 'I <b>didn\'t know</b> the answer.', th: 'ปฏิเสธ (didn\'t + V.1)' },
          { en: '<b>Did</b> you <b>see</b> her yesterday?', th: 'คำถาม (Did + S + V.1)' },
        ],
        practice: [
          { prompt: '"They ___ to Paris last year."', choices: ['go', 'went', 'have gone', 'are going'], correctIndex: 1, explain: 'last year → Past Simple (V.2 = went)' },
          { prompt: '"I ___ know that." (ปฏิเสธ อดีต)', choices: ['don\'t', 'didn\'t', 'not', 'haven\'t'], correctIndex: 1, explain: 'Past ปฏิเสธ → didn\'t' },
          { prompt: '"___ he call you yesterday?"', choices: ['Do', 'Does', 'Did', 'Has'], correctIndex: 2, explain: 'yesterday + คำถาม → Did' },
        ],
      },
      {
        heading: '6️⃣ Past Continuous — กำลัง...อยู่ในอดีต',
        content: '<b>โครงสร้าง:</b> <b>S + was/were + V.ing</b><br>• I/He/She/It → was + V.ing<br>• You/We/They → were + V.ing<br><br><b>ใช้เมื่อ:</b><br>1) กำลังเกิดขึ้น<b>ในเวลาใดเวลาหนึ่ง</b>ในอดีต<br>2) เหตุการณ์<b>ยาว</b>ถูกขัดจังหวะด้วยเหตุการณ์<b>สั้น</b> (Past Continuous + when + Past Simple)<br>3) เหตุการณ์<b>ยาว 2 อัน</b>เกิดพร้อมกันในอดีต (while)<br><br><b>Time markers:</b> at 8 PM yesterday, this time last year, when, while, as',
        examples: [
          { en: 'I <b>was watching</b> TV at 8 PM.', th: 'กำลังดูอยู่ตอน 2 ทุ่ม' },
          { en: '<b>When</b> he called, I <b>was sleeping</b>.', th: 'สั้น (called) ขัดจังหวะยาว (sleeping)' },
          { en: '<b>While</b> I <b>was cooking</b>, she <b>was studying</b>.', th: 'ยาว 2 อันพร้อมกัน' },
        ],
        practice: [
          { prompt: '"When she arrived, we ___ dinner." (กำลังกินอยู่)', choices: ['eat', 'ate', 'were eating', 'have eaten'], correctIndex: 2, explain: 'ยาว (eating) ถูกขัดโดยสั้น (arrived) → Past Continuous' },
        ],
      },
      {
        heading: '7️⃣ Past Perfect — อดีตของอดีต (เกิดก่อน)',
        content: '<b>โครงสร้าง:</b> <b>S + had + V.3</b><br>(ใช้ had กับทุกประธาน)<br><br><b>ใช้เมื่อ:</b><br>เล่าเหตุการณ์ในอดีต 2 อัน และต้องการเน้นว่าอันไหน<b>เกิดก่อน</b><br>→ อันที่<b>เกิดก่อน</b>ใช้ <b>Past Perfect (had + V.3)</b><br>→ อันที่<b>เกิดหลัง</b>ใช้ <b>Past Simple (V.2)</b><br><br><b>Time markers:</b> already, just, never, by the time, before, after, when',
        examples: [
          { en: 'When I <b>arrived</b>, she <b>had already left</b>.', th: 'she left (ก่อน) แล้ว I arrived (ทีหลัง)' },
          { en: 'I <b>had never seen</b> snow before I <b>went</b> to Japan.', th: 'ไม่เคยเห็น (ก่อน) แล้วไปญี่ปุ่น (ทีหลัง)' },
          { en: 'By the time we got there, the movie <b>had started</b>.', th: 'หนังเริ่มก่อน เราถึงทีหลัง' },
        ],
        practice: [
          { prompt: '"When the police arrived, the thief ___." (หนีไปก่อน)', choices: ['escaped', 'has escaped', 'had escaped', 'was escaping'], correctIndex: 2, explain: 'thief หนีก่อน police มา → had escaped (Past Perfect)' },
        ],
      },
      {
        heading: '8️⃣ Past Perfect Continuous — ทำต่อเนื่องอยู่ก่อนอีกเหตุการณ์ในอดีต',
        content: '<b>โครงสร้าง:</b> <b>S + had + been + V.ing</b><br><br><b>ใช้เมื่อ:</b><br>เหตุการณ์กำลังทำต่อเนื่องอยู่ ก่อนที่อีกเหตุการณ์ในอดีตจะเกิดขึ้น<br>→ เน้น<b>ระยะเวลา</b>ที่ทำก่อน<br><br>เทียบกับ Past Perfect:<br>• Past Perfect: เน้นว่าเกิดก่อน (had done)<br>• Past Perfect Continuous: เน้นระยะเวลาที่ทำต่อเนื่องก่อน (had been doing)',
        examples: [
          { en: 'She <b>had been waiting</b> for 2 hours when I arrived.', th: 'เธอรอมา 2 ชั่วโมงก่อนที่ฉันจะมาถึง' },
          { en: 'He was tired because he <b>had been running</b>.', th: 'เหนื่อยเพราะวิ่งมาต่อเนื่อง' },
        ],
      },
      {
        heading: '9️⃣ Future Simple — จะ...ในอนาคต',
        content: '<b>โครงสร้าง 2 แบบ (ความหมายต่างกันเล็กน้อย):</b><br><br><b>1) will + V.1</b> — ใช้เมื่อ:<br>• ตัดสินใจตอนพูด (I <b>will</b> help you.)<br>• สัญญา (I <b>will</b> call you back.)<br>• คาดการณ์ (It <b>will</b> rain tomorrow.)<br>• ข้อเสนอ / คำเชิญ<br><br><b>2) be going to + V.1</b> — ใช้เมื่อ:<br>• แผนที่วางไว้แล้ว (I <b>am going to</b> travel next month.)<br>• คาดการณ์จากหลักฐาน (Look at the clouds! It <b>is going to</b> rain.)<br><br><b>Time markers:</b> tomorrow, tonight, next week/month/year, in 2030, soon, later',
        examples: [
          { en: 'I <b>will</b> help you carry that.', th: 'ตัดสินใจตอนพูด' },
          { en: 'She <b>is going to</b> study medicine.', th: 'วางแผนไว้แล้ว' },
          { en: 'Look at the sky! It <b>is going to</b> rain.', th: 'มีหลักฐาน' },
          { en: 'I promise I <b>will</b> call you.', th: 'สัญญา' },
        ],
        practice: [
          { prompt: '"The phone is ringing. I ___ it." (ตัดสินใจตอนพูด)', choices: ['answer', 'am answering', 'will answer', 'am going to answer'], correctIndex: 2, explain: 'ตัดสินใจตอนพูด → will' },
          { prompt: '"I ___ Tom tomorrow. We already have plans."', choices: ['will meet', 'am going to meet', 'meet', 'meeting'], correctIndex: 1, explain: 'มีแผนไว้แล้ว → be going to' },
        ],
      },
      {
        heading: '🔟 Future Continuous — จะกำลัง...อยู่ในอนาคต',
        content: '<b>โครงสร้าง:</b> <b>S + will be + V.ing</b><br><br><b>ใช้เมื่อ:</b><br>1) จะกำลังทำอยู่ในเวลาใดเวลาหนึ่งในอนาคต<br>2) ทำนาย/คาดการณ์อย่างสุภาพ<br><br><b>Time markers:</b> at 8 PM tomorrow, this time next week, in the future',
        examples: [
          { en: 'At 8 PM tomorrow, I <b>will be watching</b> the game.', th: 'จะกำลังดูอยู่ตอน 2 ทุ่มพรุ่งนี้' },
          { en: 'This time next year, we <b>will be living</b> in a new house.', th: 'เวลานี้ปีหน้า' },
        ],
      },
      {
        heading: '1️⃣1️⃣ Future Perfect — จะได้ทำเสร็จก่อนอนาคตหนึ่ง',
        content: '<b>โครงสร้าง:</b> <b>S + will have + V.3</b><br><br><b>ใช้เมื่อ:</b><br>บอกว่าเหตุการณ์<b>จะเสร็จก่อน</b>เวลา/เหตุการณ์อีกอันในอนาคต<br><br><b>Time markers:</b> by + เวลา/เหตุการณ์อนาคต (by 2030, by next Monday, by the time you arrive)',
        examples: [
          { en: 'By 2030, I <b>will have graduated</b>.', th: 'ถึงปี 2030 ฉันจะเรียนจบแล้ว' },
          { en: 'By the time you arrive, I <b>will have finished</b> cooking.', th: 'ก่อนคุณถึง อาหารจะเสร็จ' },
        ],
        practice: [
          { prompt: '"By next year, she ___ from university."', choices: ['graduates', 'will graduate', 'will have graduated', 'is graduating'], correctIndex: 2, explain: 'by + อนาคต → Future Perfect' },
        ],
      },
      {
        heading: '1️⃣2️⃣ Future Perfect Continuous — จะกำลังทำมาต่อเนื่องถึงอนาคตหนึ่ง',
        content: '<b>โครงสร้าง:</b> <b>S + will have been + V.ing</b><br><br><b>ใช้เมื่อ:</b><br>เน้นระยะเวลาที่<b>จะได้ทำต่อเนื่องมา</b>จนถึงเวลาใดในอนาคต<br><br><b>Time markers:</b> by + เวลา + for + ระยะเวลา',
        examples: [
          { en: 'By next month, I <b>will have been working</b> here <b>for</b> 10 years.', th: 'เดือนหน้าจะครบ 10 ปีที่ทำงานที่นี่' },
          { en: 'When she retires, she <b>will have been teaching</b> for 40 years.', th: 'ตอนเธอเกษียณ จะสอนมา 40 ปี' },
        ],
      },
      {
        heading: 'สรุป Time Markers ทุก Tense',
        content: '<b>Present Simple:</b> always, usually, often, sometimes, never, every day<br><b>Present Continuous:</b> now, right now, at the moment, today, this week<br><b>Present Perfect:</b> already, just, yet, ever, never, for, since, recently<br><b>Present Perfect Continuous:</b> for, since, all day, lately<br><br><b>Past Simple:</b> yesterday, last week, ago, in 1990<br><b>Past Continuous:</b> at 8 PM yesterday, when, while<br><b>Past Perfect:</b> already, by the time, before, after<br><b>Past Perfect Continuous:</b> for + ระยะเวลา + before...<br><br><b>Future Simple:</b> tomorrow, next week, soon, in 2030<br><b>Future Continuous:</b> at 8 PM tomorrow, this time next week<br><b>Future Perfect:</b> by 2030, by next Monday<br><b>Future Perfect Continuous:</b> by + เวลา + for + ระยะ',
        examples: [
          { en: 'สังเกตคำบอกเวลาช่วยเลือก tense ให้ถูก', th: 'ทุก tense มีคำเฉพาะของตัวเอง' },
        ],
      },
      {
        heading: 'Sequence of Tenses (การผัน tense ในประโยครายงาน)',
        content: 'เมื่อกริยาในประโยคหลักเป็น<b>อดีต</b> กริยาในประโยคย่อยต้องเลื่อนไปเป็นอดีตด้วย:<br><br>• Present Simple → Past Simple<br>• Present Continuous → Past Continuous<br>• Present Perfect → Past Perfect<br>• Past Simple → Past Perfect<br>• will → would<br>• can → could<br>• may → might',
        examples: [
          { en: 'She said, "I <b>am</b> tired." → She said (that) she <b>was</b> tired.', th: 'am → was' },
          { en: 'He said, "I <b>will</b> come." → He said (that) he <b>would</b> come.', th: 'will → would' },
          { en: 'She said, "I <b>have finished</b>." → She said she <b>had finished</b>.', th: 'have → had' },
        ],
      },
    ],
    quiz: {
      basic: [
        { question: '"She ___ to work every day." (นิสัย)', choices: ['go', 'goes', 'going', 'went'], correctIndex: 1, explain: 'Present Simple + She (เอกพจน์) → goes' },
        { question: '"I ___ TV now." (กำลัง)', choices: ['watch', 'watches', 'am watching', 'watched'], correctIndex: 2, explain: 'Present Continuous: am + V.ing' },
        { question: '"They ___ to Paris last year."', choices: ['go', 'went', 'have gone', 'are going'], correctIndex: 1, explain: 'last year → Past Simple → went' },
        { question: '"Tomorrow I ___ my friend."', choices: ['meet', 'met', 'will meet', 'am meeting'], correctIndex: 2, explain: 'tomorrow → Future Simple → will meet' },
        { question: '"He ___ to school yesterday."', choices: ['walk', 'walks', 'walked', 'is walking'], correctIndex: 2, explain: 'yesterday → Past Simple → walked' },
        { question: '"Water ___ at 100°C." (ความจริง)', choices: ['boil', 'boils', 'boiled', 'is boiling'], correctIndex: 1, explain: 'ความจริงเสมอ → Present Simple' },
        { question: '"Look! It ___." (ตอนนี้)', choices: ['rains', 'is raining', 'rained', 'has rained'], correctIndex: 1, explain: 'ตอนนี้ ขณะพูด → Present Continuous' },
        { question: '"My father ___ a doctor."', choices: ['is', 'are', 'am', 'be'], correctIndex: 0, explain: 'father (เอกพจน์) → is' },
        { question: '"I ___ pizza last night."', choices: ['eat', 'eats', 'ate', 'eating'], correctIndex: 2, explain: 'eat → ate (V.2)' },
        { question: '"She ___ English now." (กำลัง)', choices: ['study', 'studies', 'is studying', 'studied'], correctIndex: 2, explain: 'now → Present Continuous' },
        { question: '"They ___ football every Sunday."', choices: ['play', 'plays', 'playing', 'played'], correctIndex: 0, explain: 'they (พหูพจน์) → play (ไม่เติม s)' },
        { question: '"I ___ my homework yesterday."', choices: ['do', 'does', 'did', 'done'], correctIndex: 2, explain: 'yesterday + Past Simple → did' },
        { question: '"We ___ dinner at 7 PM every day."', choices: ['have', 'has', 'are having', 'had'], correctIndex: 0, explain: 'we + every day → Present Simple → have' },
        { question: '"He ___ soccer next week."', choices: ['plays', 'played', 'will play', 'is playing'], correctIndex: 2, explain: 'next week → Future → will play' },
        { question: '"The dog ___ in the garden now."', choices: ['run', 'runs', 'is running', 'ran'], correctIndex: 2, explain: 'now → Present Continuous → is running' },
      ],
      intermediate: [
        { question: '"I ___ already ___ my homework."', choices: ['have / finish', 'have / finished', 'has / finished', 'am / finishing'], correctIndex: 1, explain: 'already + Present Perfect → have + V.3' },
        { question: '"When she called, I ___ TV."', choices: ['watch', 'watched', 'am watching', 'was watching'], correctIndex: 3, explain: 'Past Continuous: was + V.ing' },
        { question: '"She ___ to Japan twice."', choices: ['goes', 'went', 'has been', 'is going'], correctIndex: 2, explain: 'ประสบการณ์ → Present Perfect' },
        { question: '"He ___ here since 2020."', choices: ['works', 'worked', 'is working', 'has worked'], correctIndex: 3, explain: 'since + จุดเริ่ม → Present Perfect' },
        { question: '"They ___ for 2 hours before I arrived."', choices: ['waited', 'were waiting', 'had waited', 'have waited'], correctIndex: 2, explain: 'ก่อนอีกอันในอดีต → Past Perfect' },
        { question: '"By next month, I ___ here for 5 years."', choices: ['work', 'have worked', 'will have worked', 'am working'], correctIndex: 2, explain: 'by + อนาคต → Future Perfect' },
        { question: '"She ___ to me when I entered." (กำลังคุยอยู่)', choices: ['talks', 'was talking', 'has talked', 'talked'], correctIndex: 1, explain: 'กำลังทำในอดีต → Past Continuous' },
        { question: '"We ___ to see the movie tomorrow." (มีแผน)', choices: ['go', 'will go', 'are going', 'have gone'], correctIndex: 2, explain: 'แผนอนาคตอันใกล้ → Present Continuous' },
        { question: '"I ___ my keys. I can\'t find them."', choices: ['lose', 'lost', 'have lost', 'am losing'], correctIndex: 2, explain: 'มีผลถึงปัจจุบัน → Present Perfect' },
        { question: '"When I ___ home, my mom ___ dinner."', choices: ['arrived / cooked', 'arrived / was cooking', 'was arriving / cooked', 'arrived / has cooked'], correctIndex: 1, explain: 'สั้น (arrived) ขัดจังหวะยาว (was cooking)' },
        { question: '"He ___ the news yet?" (ได้ยินหรือยัง)', choices: ['Does / hear', 'Did / hear', 'Has / heard', 'Is / hearing'], correctIndex: 2, explain: 'yet → Present Perfect' },
        { question: '"By the time you get there, the party ___."', choices: ['ends', 'will end', 'will have ended', 'is ending'], correctIndex: 2, explain: 'by the time + อนาคต → Future Perfect' },
        { question: '"It ___ for 3 days already." (ฝนตก ยังตกอยู่)', choices: ['rains', 'rained', 'has rained', 'has been raining'], correctIndex: 3, explain: 'เน้นระยะเวลาต่อเนื่อง → Present Perfect Continuous' },
        { question: '"I ___ never ___ sushi before."', choices: ['have / eaten', 'had / eaten', 'am / eating', 'do / eat'], correctIndex: 0, explain: 'never + ประสบการณ์ → Present Perfect' },
        { question: '"She ___ TV when the phone ___."', choices: ['watched / rang', 'was watching / rang', 'watched / was ringing', 'is watching / rings'], correctIndex: 1, explain: 'was watching (ยาว) + rang (สั้น ขัดจังหวะ)' },
      ],
      advanced: [
        { question: '"By the time we reach the airport, the plane ___."', choices: ['leaves', 'left', 'will leave', 'will have left'], correctIndex: 3, explain: 'by the time + อนาคต → เครื่องจะออกก่อน → Future Perfect' },
        { question: '"I ___ for the bus for 30 minutes when it finally ___."', choices: ['waited / arrived', 'was waiting / arrived', 'had been waiting / arrived', 'have been waiting / arrived'], correctIndex: 2, explain: 'ทำต่อเนื่องมาก่อน (Past Perfect Continuous) + จบด้วยเหตุการณ์สั้น' },
        { question: '"He said he ___ me later."', choices: ['will call', 'would call', 'calls', 'has called'], correctIndex: 1, explain: 'said (อดีต) → sequence of tenses: will → would' },
        { question: '"If she had studied harder, she ___ the exam."', choices: ['passes', 'passed', 'would pass', 'would have passed'], correctIndex: 3, explain: 'Conditional Type 3: had + V.3 / would have + V.3' },
        { question: '"They ___ married for 20 years next month."', choices: ['are', 'have been', 'will be', 'will have been'], correctIndex: 3, explain: 'next month + ครบระยะเวลา → Future Perfect' },
        { question: '"When I arrived, they ___ dinner already."', choices: ['had', 'have had', 'had had', 'were having'], correctIndex: 2, explain: 'already + ก่อนอีกอันในอดีต → Past Perfect (had + V.3 → had had)' },
        { question: '"She ___ (work) here since she ___ (graduate)."', choices: ['works / graduates', 'has worked / graduated', 'worked / graduated', 'is working / has graduated'], correctIndex: 1, explain: 'since + จุดเริ่ม → Present Perfect ในประโยคหลัก, Past Simple ในประโยคย่อย' },
        { question: '"By this time next year, I ___ (learn) English for 10 years."', choices: ['will learn', 'am learning', 'will have been learning', 'have learned'], correctIndex: 2, explain: 'by + อนาคต + for + ระยะเวลา → Future Perfect Continuous' },
        { question: '"He asked me if I ___ the movie."', choices: ['saw', 'have seen', 'had seen', 'was seeing'], correctIndex: 2, explain: 'asked (อดีต) + Present Perfect (have seen) → Past Perfect (had seen)' },
        { question: '"I wish I ___ more time yesterday."', choices: ['have', 'had', 'had had', 'have had'], correctIndex: 2, explain: 'wish + Past Perfect (สำหรับเรื่องอดีต)' },
        { question: '"No sooner ___ I ___ home than the rain started."', choices: ['did / arrive', 'had / arrived', 'have / arrived', 'was / arriving'], correctIndex: 1, explain: 'No sooner had + S + V.3 → Past Perfect inversion' },
        { question: '"The report ___ (finish) by Friday."', choices: ['must finish', 'must be finished', 'must have finished', 'must have been finished'], correctIndex: 1, explain: 'passive future — must + be + V.3' },
        { question: '"Look at those clouds! It ___."', choices: ['rains', 'will rain', 'is going to rain', 'has rained'], correctIndex: 2, explain: 'มีหลักฐาน (เห็นเมฆ) → be going to' },
      ],
      expert: [
        { question: '"Rarely ___ such dedication in a young student."', choices: ['I have seen', 'have I seen', 'I saw', 'did I saw'], correctIndex: 1, explain: 'Rarely (negative adverb) → inversion: have I seen' },
        { question: '"Had he known the truth, he ___ differently."', choices: ['acts', 'acted', 'would act', 'would have acted'], correctIndex: 3, explain: 'Had + S + V.3 (inversion Conditional 3) → would have + V.3' },
        { question: '"She ___ (live) in Bangkok for 5 years before she ___ (move) to Chiang Mai."', choices: ['lived / moved', 'had lived / moved', 'had been living / moved', 'has lived / has moved'], correctIndex: 2, explain: 'ทำต่อเนื่องก่อนอีกเหตุการณ์ในอดีต → Past Perfect Continuous' },
        { question: '"Not until she ___ home ___ she ___ the letter."', choices: ['arrived / did / read', 'had arrived / did / read', 'arrived / had / read', 'arrived / does / read'], correctIndex: 0, explain: 'Not until + clause → inversion: did S read' },
        { question: '"By the time you finish reading this sentence, I ___ (already write) another one."', choices: ['have already written', 'will already write', 'will have already written', 'am already writing'], correctIndex: 2, explain: 'By the time + present clause → Future Perfect main' },
        { question: '"Little ___ that she was being watched."', choices: ['she knew', 'did she know', 'she did know', 'knew she'], correctIndex: 1, explain: 'Little (negative adverb) → inversion: did she know' },
        { question: '"If only I ___ (know) then what I ___ (know) now!"', choices: ['knew / know', 'had known / know', 'have known / knew', 'know / have known'], correctIndex: 1, explain: 'If only + Past Perfect (สำหรับอดีตที่เสียใจ) + know (ปัจจุบัน)' },
        { question: '"Scarcely ___ she ___ the door when someone knocked."', choices: ['did / close', 'had / closed', 'has / closed', 'was / closing'], correctIndex: 1, explain: 'Scarcely had + S + V.3 → Past Perfect inversion' },
        { question: '"He denied ___ (steal) the money, claiming he ___ (be) at home all evening."', choices: ['stealing / was', 'to steal / was', 'stealing / had been', 'to have stolen / has been'], correctIndex: 2, explain: 'deny + V.ing / claim + past perfect (had been) เพราะเน้นก่อน "denied"' },
        { question: '"It is high time you ___ (start) taking your studies seriously."', choices: ['start', 'started', 'have started', 'will start'], correctIndex: 1, explain: 'It is high time + Past Simple (แม้กล่าวถึงปัจจุบัน) — subjunctive' },
      ],
      toeic: [
        {
          question: 'The new marketing manager ___ our team since last quarter.',
          choices: ['leads', 'led', 'has been leading', 'will lead'],
          correctIndex: 2, explain: 'since + จุดเริ่ม → Present Perfect Continuous (เน้นทำต่อเนื่อง)',
        },
        {
          question: 'By the time the shipment arrives, we ___ our inventory count.',
          choices: ['complete', 'will complete', 'will have completed', 'have completed'],
          correctIndex: 2, explain: 'by the time + อนาคต → Future Perfect (จะเสร็จก่อน)',
        },
        {
          question: 'Ms. Chen ___ the quarterly report when the CEO called her yesterday.',
          choices: ['prepared', 'was preparing', 'has prepared', 'had prepared'],
          correctIndex: 1, explain: 'กำลังทำในอดีต ถูกขัดจังหวะ → Past Continuous',
        },
        {
          passageTitle: 'ประกาศจากบริษัท',
          passage: 'ATTENTION ALL STAFF:\n\nThe main elevator __(1)__ maintenance next Monday from 8 AM to 5 PM. During this time, employees ___(2)___ the stairs or the smaller elevator on the west side. We __(3)__ this maintenance for over a year, and it is finally scheduled. Thank you for your cooperation.',
          groupId: 'toeic-notice-1',
          question: 'ข้อ 1 (elevator ___ maintenance)',
          choices: ['undergoes', 'is undergoing', 'will undergo', 'has undergone'],
          correctIndex: 2, explain: 'next Monday → อนาคต → will undergo',
        },
        {
          passageTitle: 'ประกาศจากบริษัท',
          passage: 'ATTENTION ALL STAFF:\n\nThe main elevator __(1)__ maintenance next Monday from 8 AM to 5 PM. During this time, employees ___(2)___ the stairs or the smaller elevator on the west side. We __(3)__ this maintenance for over a year, and it is finally scheduled. Thank you for your cooperation.',
          groupId: 'toeic-notice-1',
          question: 'ข้อ 2 (employees ___ the stairs)',
          choices: ['use', 'used', 'should use', 'have used'],
          correctIndex: 2, explain: 'บริบทเป็นคำแนะนำ ต้องใช้บันไดในช่วงนั้น → should use',
        },
        {
          passageTitle: 'ประกาศจากบริษัท',
          passage: 'ATTENTION ALL STAFF:\n\nThe main elevator __(1)__ maintenance next Monday from 8 AM to 5 PM. During this time, employees ___(2)___ the stairs or the smaller elevator on the west side. We __(3)__ this maintenance for over a year, and it is finally scheduled. Thank you for your cooperation.',
          groupId: 'toeic-notice-1',
          question: 'ข้อ 3 (We ___ this maintenance for over a year)',
          choices: ['plan', 'planned', 'have been planning', 'will plan'],
          correctIndex: 2, explain: 'for over a year (ต่อเนื่องมาถึงตอนนี้) → Present Perfect Continuous',
        },
        {
          question: 'Please note that the office ___ closed from December 24 to January 2.',
          choices: ['is', 'was', 'will be', 'has been'],
          correctIndex: 2, explain: 'ประกาศเรื่องอนาคต (December 24-Jan 2) → will be',
        },
        {
          question: 'Our sales figures ___ steadily since the new product launch last spring.',
          choices: ['increase', 'have increased', 'will increase', 'are increasing'],
          correctIndex: 1, explain: 'since + จุดเริ่ม → Present Perfect',
        },
        {
          question: 'The training session ___ at 9 AM sharp, so please arrive early.',
          choices: ['starts', 'is starting', 'has started', 'started'],
          correctIndex: 0, explain: 'ตารางเวลา (schedule) → Present Simple',
        },
        {
          question: 'If the client ___ the proposal by Friday, we can begin the project next week.',
          choices: ['approves', 'will approve', 'approved', 'has approved'],
          correctIndex: 0, explain: 'Conditional Type 1: if + Present Simple, will/can + V.1',
        },
      ],
      toefl: [
        {
          passageTitle: 'The Migration of Monarch Butterflies',
          passage: 'Every year, millions of monarch butterflies __(1)__ from Canada and the northern United States to the mountains of central Mexico. This journey, which covers up to 3,000 miles, __(2)__ scientists for decades. Recent research has revealed that the butterflies __(3)__ a complex combination of sun position and Earth\'s magnetic field to navigate. By the time they reach their winter grounds, individual butterflies __(4)__ across multiple generations, with no single insect making the full trip.',
          groupId: 'toefl-monarch',
          question: 'ข้อ 1 (millions of butterflies ___)',
          choices: ['migrated', 'migrate', 'are migrating', 'have migrated'],
          correctIndex: 1, explain: 'Every year → ทำเป็นประจำ → Present Simple',
        },
        {
          passageTitle: 'The Migration of Monarch Butterflies',
          passage: 'Every year, millions of monarch butterflies __(1)__ from Canada and the northern United States to the mountains of central Mexico. This journey, which covers up to 3,000 miles, __(2)__ scientists for decades. Recent research has revealed that the butterflies __(3)__ a complex combination of sun position and Earth\'s magnetic field to navigate. By the time they reach their winter grounds, individual butterflies __(4)__ across multiple generations, with no single insect making the full trip.',
          groupId: 'toefl-monarch',
          question: 'ข้อ 2 (This journey ___ scientists for decades)',
          choices: ['puzzles', 'has puzzled', 'is puzzling', 'puzzled'],
          correctIndex: 1, explain: 'for decades (ต่อเนื่องจากอดีตถึงปัจจุบัน) → Present Perfect',
        },
        {
          passageTitle: 'The Migration of Monarch Butterflies',
          passage: 'Every year, millions of monarch butterflies __(1)__ from Canada and the northern United States to the mountains of central Mexico. This journey, which covers up to 3,000 miles, __(2)__ scientists for decades. Recent research has revealed that the butterflies __(3)__ a complex combination of sun position and Earth\'s magnetic field to navigate. By the time they reach their winter grounds, individual butterflies __(4)__ across multiple generations, with no single insect making the full trip.',
          groupId: 'toefl-monarch',
          question: 'ข้อ 3 (butterflies ___ a complex combination)',
          choices: ['use', 'used', 'have used', 'are using'],
          correctIndex: 0, explain: 'ข้อเท็จจริงทางวิทยาศาสตร์ → Present Simple',
        },
        {
          passageTitle: 'The Migration of Monarch Butterflies',
          passage: 'Every year, millions of monarch butterflies __(1)__ from Canada and the northern United States to the mountains of central Mexico. This journey, which covers up to 3,000 miles, __(2)__ scientists for decades. Recent research has revealed that the butterflies __(3)__ a complex combination of sun position and Earth\'s magnetic field to navigate. By the time they reach their winter grounds, individual butterflies __(4)__ across multiple generations, with no single insect making the full trip.',
          groupId: 'toefl-monarch',
          question: 'ข้อ 4 (individual butterflies ___ across multiple generations)',
          choices: ['reproduce', 'reproduced', 'will reproduce', 'will have reproduced'],
          correctIndex: 3, explain: 'By the time they reach → Future Perfect (จะได้ทำหลายรุ่นก่อนถึง)',
        },
        {
          question: 'The professor emphasized that water ___ at 100 degrees Celsius at sea level.',
          choices: ['boils', 'boiled', 'has boiled', 'will boil'],
          correctIndex: 0, explain: 'ความจริงทางวิทยาศาสตร์ (แม้ใน reported speech) → Present Simple',
        },
        {
          question: 'By the end of this century, average global temperatures ___ significantly, according to climate models.',
          choices: ['rise', 'have risen', 'will have risen', 'are rising'],
          correctIndex: 2, explain: 'By the end of + อนาคต + การคาดการณ์ → Future Perfect',
        },
        {
          question: 'The archaeological team ___ the site for three months before they discovered the artifact.',
          choices: ['excavated', 'was excavating', 'had been excavating', 'has excavated'],
          correctIndex: 2, explain: 'for 3 months + ก่อนอีกเหตุการณ์ในอดีต → Past Perfect Continuous',
        },
        {
          question: 'Research indicates that early humans ___ tools as far back as 3.3 million years ago.',
          choices: ['create', 'created', 'have created', 'were creating'],
          correctIndex: 1, explain: 'เหตุการณ์เฉพาะในอดีต (3.3 ล้านปี) → Past Simple',
        },
        {
          question: 'It is estimated that the population of the region ___ by 20% over the next decade.',
          choices: ['grows', 'grew', 'will grow', 'has grown'],
          correctIndex: 2, explain: 'over the next decade → Future → will grow',
        },
        {
          question: 'Although scientists ___ this phenomenon for years, they still don\'t fully understand it.',
          choices: ['study', 'studied', 'have been studying', 'will study'],
          correctIndex: 2, explain: 'for years + ยังทำอยู่ → Present Perfect Continuous',
        },
      ],
    },
  },
  {
    id: 'active-passive', num: 11, title: 'Active - Passive Voice', icon: '🔄', color: '#c14a4a',
    intro: 'Active Voice = ประธานเป็นผู้กระทำ / Passive Voice = ประธานเป็นผู้ถูกกระทำ',
    sections: [
      {
        heading: 'Active - Passive คืออะไร',
        content: '<b>Active Voice</b>: ประธานเป็นคนทำกริยา<br>John writes a letter. (จอห์นเขียนจดหมาย)<br><br><b>Passive Voice</b>: ประธานถูกกระทำ (เน้นสิ่งที่โดนกระทำ)<br>A letter is written by John. (จดหมายถูกเขียนโดยจอห์น)<br><br>เมื่อไหร่ใช้ Passive?<br>• ไม่ต้องการเน้นคนทำ<br>• ไม่รู้ว่าใครทำ<br>• เน้นการกระทำหรือสิ่งของ',
        examples: [
          { en: 'Active: She <b>eats</b> the apple.', th: 'เธอกินแอปเปิ้ล' },
          { en: 'Passive: The apple <b>is eaten</b> by her.', th: 'แอปเปิ้ลถูกกินโดยเธอ' },
          { en: 'My car <b>was stolen</b> yesterday.', th: 'ไม่รู้ใครขโมย → Passive' },
        ],
      },
      {
        heading: 'สูตร Passive Voice',
        content: 'สูตรทั่วไป: <b>S + Verb to be + V.3 + (by + ผู้ทำ)</b><br><br>Verb to be เปลี่ยนตาม Tense:<br>• Present Simple: is/am/are + V.3<br>• Past Simple: was/were + V.3<br>• Future: will be + V.3<br>• Present Perfect: has/have been + V.3<br>• Present Continuous: is/am/are being + V.3<br>• Past Continuous: was/were being + V.3<br>• Modal: can/must/should be + V.3',
        examples: [
          { en: 'The book <b>is read</b> by many. (Present)', th: 'is + V.3' },
          { en: 'The letter <b>was sent</b> yesterday. (Past)', th: 'was + V.3' },
          { en: 'The house <b>will be built</b> next year.', th: 'will be + V.3' },
          { en: 'This song <b>has been sung</b> many times.', th: 'has been + V.3' },
          { en: 'The car <b>can be repaired</b>.', th: 'can be + V.3' },
        ],
        practice: [
          { prompt: 'เปลี่ยน "She writes a book." เป็น Passive', choices: ['A book is wrote by her.', 'A book is written by her.', 'A book writes by her.', 'A book was written by her.'], correctIndex: 1, explain: 'Present Passive = is + V.3 (written)' },
          { prompt: '"The window ___ by the wind." (อดีต)', choices: ['broke', 'is broken', 'was broken', 'has broke'], correctIndex: 2, explain: 'Past Passive = was + V.3' },
        ],
      },
      {
        heading: 'การเปลี่ยน Active เป็น Passive',
        content: 'ขั้นตอน:<br>1) เอา<b>กรรม</b>ของ Active มาเป็น<b>ประธาน</b>ของ Passive<br>2) เปลี่ยนกริยาเป็น <b>Verb to be + V.3</b> (ตาม tense เดิม)<br>3) เอา<b>ประธานเดิม</b>ไปต่อท้ายด้วย <b>by</b><br><br>ตัวอย่าง:<br>Active: <b>John</b> [wrote] <b>a letter</b>.<br>Passive: <b>A letter</b> [was written] by <b>John</b>.',
        examples: [
          { en: 'Active: The chef cooks the food.', th: 'chef → wrote → food' },
          { en: 'Passive: The food is cooked by the chef.', th: 'food (กรรมเดิม) เป็นประธาน' },
        ],
      },
      {
        heading: 'Be + ing / V.3 ต่างกันยังไง',
        content: '<b>Be + V.ing</b> (Continuous) = <b>กำลังทำ</b> (Active)<br>She <b>is cooking</b>. = เธอกำลังทำอาหาร<br><br><b>Be + V.3</b> (Passive) = <b>ถูกกระทำ</b><br>The food <b>is cooked</b>. = อาหารถูกทำเสร็จแล้ว<br><br>สับสนบ่อย! ให้ดูว่าคำที่ตามหลัง be ลงท้าย -ing (Active) หรือ V.3 (Passive)',
        examples: [
          { en: 'She <b>is teaching</b>. (Active - กำลังสอน)', th: 'be + ing' },
          { en: 'She <b>is taught</b> by a professor. (Passive - ถูกสอน)', th: 'be + V.3' },
        ],
        practice: [
          { prompt: 'ประโยคใดเป็น Passive Voice', choices: ['She is eating.', 'She is eaten.', 'She has eaten.', 'She was eating.'], correctIndex: 1, explain: 'is + V.3 (eaten) = Passive' },
        ],
      },
      {
        heading: 'Passive กับ Modal Verbs',
        content: 'Modal + Passive: <b>modal + be + V.3</b><br>• must be done<br>• should be finished<br>• can be seen<br>• will be built<br>• might be broken',
        examples: [
          { en: 'The homework <b>must be finished</b> by tomorrow.', th: 'ต้องเสร็จภายในพรุ่งนี้' },
          { en: 'The problem <b>can be solved</b>.', th: 'สามารถแก้ได้' },
        ],
        practice: [
          { prompt: '"The report ___ by Friday." (ต้องส่ง)', choices: ['must submit', 'must be submitted', 'must submitted', 'must submits'], correctIndex: 1, explain: 'modal + be + V.3 → must be submitted' },
        ],
      },
    ],
    quiz: [
      { question: 'เปลี่ยนเป็น Passive: "She writes a book."', choices: ['A book is wrote by her.', 'A book is written by her.', 'A book writes by her.', 'A book was written by her.'], correctIndex: 1, explain: 'Present Passive = is + V.3' },
      { question: '"The window ___ by the wind." (อดีต)', choices: ['broke', 'is broken', 'was broken', 'has broke'], correctIndex: 2, explain: 'Past Passive = was + V.3' },
      { question: 'ประโยคใดเป็น Passive Voice', choices: ['She is eating.', 'She is eaten.', 'She has eaten.', 'She was eating.'], correctIndex: 1, explain: 'is + V.3 = Passive' },
      { question: '"The homework ___ every day."', choices: ['does', 'is done', 'is doing', 'has done'], correctIndex: 1, explain: 'Present Passive = is + V.3' },
      { question: '"The house ___ next year." (จะสร้าง)', choices: ['will build', 'will be built', 'will building', 'is built'], correctIndex: 1, explain: 'Future Passive = will be + V.3' },
      { question: '"English ___ in many countries."', choices: ['speaks', 'is spoken', 'speaking', 'has speak'], correctIndex: 1, explain: 'Present Passive: is + V.3 (spoken)' },
      { question: '"The car ___ repaired." (ต้อง)', choices: ['must', 'must be', 'must been', 'must is'], correctIndex: 1, explain: 'Modal + be + V.3' },
      { question: '"The song ___ many times." (Present Perfect Passive)', choices: ['has sung', 'has been sung', 'is sung', 'was sung'], correctIndex: 1, explain: 'Perfect Passive = has been + V.3' },
    ],
  },
  {
    id: 'participles', num: 12, title: 'Participles', icon: '🔗', color: '#5aa76b',
    intro: 'Participle คือรูป -ing (Present) และ V.3 (Past) ของคำกริยา ใช้ทำหน้าที่เป็น adj หรือลดรูปประโยค',
    sections: [
      {
        heading: 'Present Participle (V.ing) vs Past Participle (V.3)',
        content: '<b>V.ing (Present Participle)</b> = สิ่ง<b>ที่ทำ</b> / น่า...<br>The <b>running</b> boy. (เด็กที่กำลังวิ่ง)<br><br><b>V.3 (Past Participle)</b> = สิ่ง<b>ที่ถูกทำ</b> / รู้สึก...<br>The <b>broken</b> vase. (แจกันที่ถูกทำแตก)',
        examples: [
          { en: 'The <b>crying</b> baby (เด็กที่ร้องไห้ - เด็กทำเอง)', th: '-ing' },
          { en: 'The <b>stolen</b> money (เงินที่ถูกขโมย)', th: '-ed / V.3' },
        ],
      },
      {
        heading: 'Participles ใช้เป็น Adjective',
        content: 'Participle ใช้ขยายคำนามได้เหมือน adjective<br>• -ing = "น่า..." (สิ่งของทำให้เรารู้สึก): interesting book<br>• -ed = "รู้สึก..." (คนรู้สึก): interested student<br><br>คู่ที่พบบ่อย:<br>• interesting / interested (น่าสนใจ / รู้สึกสนใจ)<br>• boring / bored (น่าเบื่อ / รู้สึกเบื่อ)<br>• exciting / excited (น่าตื่นเต้น / ตื่นเต้น)<br>• tiring / tired (น่าเหนื่อย / เหนื่อย)<br>• surprising / surprised (น่าประหลาดใจ / ประหลาดใจ)<br>• amazing / amazed (น่าอัศจรรย์ / อัศจรรย์ใจ)<br>• confusing / confused (น่างง / รู้สึกงง)<br>• disappointing / disappointed (น่าผิดหวัง / ผิดหวัง)',
        examples: [
          { en: 'The movie is <b>boring</b>. I am <b>bored</b>.', th: 'หนัง=น่าเบื่อ / ฉัน=รู้สึกเบื่อ' },
          { en: 'The news is <b>shocking</b>. She was <b>shocked</b>.', th: 'ข่าว=น่าตกใจ / เธอ=ตกใจ' },
        ],
        practice: [
          { prompt: '"I am ___ in learning English."', choices: ['interest', 'interesting', 'interested', 'interests'], correctIndex: 2, explain: 'คนรู้สึก → interested' },
          { prompt: '"The lesson is ___." (น่าเบื่อ)', choices: ['bore', 'boring', 'bored', 'boredom'], correctIndex: 1, explain: 'สิ่งของทำให้เบื่อ → boring' },
          { prompt: '"She was ___ by the news." (ช็อค)', choices: ['shock', 'shocking', 'shocked', 'shocks'], correctIndex: 2, explain: 'คนรู้สึก → shocked' },
        ],
      },
      {
        heading: 'การลดรูป Relative Clause ด้วย Participle',
        content: 'ลดรูปประโยคย่อย (Relative Clause) ให้สั้นลง<br>• Active (ใครทำ) → ใช้ <b>V.ing</b><br>• Passive (ถูกทำ) → ใช้ <b>V.3</b>',
        examples: [
          { en: 'The girl <b>who is singing</b> is my sister.', th: 'ก่อนลด' },
          { en: 'The girl <b>singing</b> is my sister.', th: 'ลดแล้ว (Active → -ing)' },
          { en: 'The book <b>which was written</b> by him is a bestseller.', th: 'ก่อนลด' },
          { en: 'The book <b>written</b> by him is a bestseller.', th: 'ลดแล้ว (Passive → V.3)' },
        ],
        practice: [
          { prompt: 'ลดรูป: "The man who is standing there is my father."', choices: ['The man stood there is my father.', 'The man standing there is my father.', 'The man stand there is my father.', 'The man to stand there is my father.'], correctIndex: 1, explain: 'Active → V.ing = standing' },
          { prompt: 'ลดรูป: "The house which was built in 1900 is old."', choices: ['The house build in 1900 is old.', 'The house building in 1900 is old.', 'The house built in 1900 is old.', 'The house builds in 1900 is old.'], correctIndex: 2, explain: 'Passive → V.3 = built' },
        ],
      },
      {
        heading: 'Participle Phrases ขึ้นต้นประโยค',
        content: 'Participle Phrase ใช้ขึ้นต้นประโยคเพื่อเชื่อม 2 เหตุการณ์<br><br>• V.ing = เหตุการณ์ Active<br><b>Feeling</b> tired, I went to bed. (รู้สึกเหนื่อย ฉันจึงเข้านอน)<br>• V.3 = เหตุการณ์ Passive<br><b>Written</b> in French, the book is hard to read. (เพราะเขียนเป็นฝรั่งเศส)',
        examples: [
          { en: '<b>Walking</b> in the park, I met an old friend.', th: 'ตอนเดินในสวน ฉันเจอเพื่อนเก่า' },
        ],
      },
    ],
    quiz: [
      { question: '"I am ___ in learning English."', choices: ['interest', 'interesting', 'interested', 'interests'], correctIndex: 2, explain: 'คนรู้สึก → interested' },
      { question: '"The lesson is ___."', choices: ['bore', 'boring', 'bored', 'boredom'], correctIndex: 1, explain: 'สิ่งของทำให้เบื่อ → boring' },
      { question: 'ลดรูป: "The man who is standing there is my father."', choices: ['The man stood there is my father.', 'The man standing there is my father.', 'The man stand there is my father.', 'The man to stand there is my father.'], correctIndex: 1, explain: 'Active → -ing = standing' },
      { question: '"She was ___ by the news."', choices: ['shock', 'shocking', 'shocked', 'shocks'], correctIndex: 2, explain: 'คนรู้สึก → shocked' },
      { question: '"The movie was so ___ that I fell asleep."', choices: ['bore', 'boring', 'bored', 'boredom'], correctIndex: 1, explain: 'หนัง = ทำให้เบื่อ → boring' },
      { question: 'ลดรูป: "The letter which was written by John..."', choices: ['The letter writing by John', 'The letter written by John', 'The letter write by John', 'The letter wrote by John'], correctIndex: 1, explain: 'Passive → V.3 = written' },
      { question: '"The children ___ in the park are noisy."', choices: ['play', 'played', 'playing', 'to play'], correctIndex: 2, explain: 'ลดรูป who are playing → playing' },
      { question: '"I am ___ by his performance."', choices: ['amaze', 'amazing', 'amazed', 'amazes'], correctIndex: 2, explain: 'คนรู้สึก → amazed' },
    ],
  },
  {
    id: 'gerund-infinitive', num: 13, title: 'Gerund and Infinitives', icon: '📝', color: '#5aa76b',
    intro: 'Gerund = V.ing ทำหน้าที่เป็นคำนาม / Infinitive = to + V.1 — ทั้งสองใช้ต่างกันตามกริยา',
    sections: [
      {
        heading: 'Gerund (V.ing) - รูปคำนาม',
        content: 'Gerund คือ <b>V.ing</b> ที่ทำหน้าที่เป็น<b>คำนาม</b> เป็นได้ทั้ง:<br>• ประธาน: <b>Swimming</b> is fun.<br>• กรรม: I love <b>reading</b>.<br>• หลัง preposition: She is good <b>at singing</b>.',
        examples: [
          { en: '<b>Swimming</b> is my hobby.', th: 'ประธาน' },
          { en: 'I enjoy <b>reading</b> books.', th: 'กรรม' },
          { en: 'She is interested in <b>learning</b>.', th: 'หลัง preposition (in)' },
        ],
      },
      {
        heading: 'Infinitive (to + V.1)',
        content: 'Infinitive คือ <b>to + V.1</b> ใช้:<br>• บอกจุดประสงค์: I went to the store <b>to buy</b> milk.<br>• หลังกริยาบางตัว: I want <b>to go</b>.<br>• หลัง adj: It is easy <b>to learn</b>.<br>• หลัง question word: I don\'t know what <b>to say</b>.',
        examples: [
          { en: 'I want <b>to eat</b>.', th: 'หลังกริยา want' },
          { en: 'She went <b>to buy</b> food.', th: 'บอกจุดประสงค์' },
          { en: 'It\'s hard <b>to understand</b>.', th: 'หลัง adj (hard)' },
        ],
      },
      {
        heading: 'กริยาที่ตามด้วย Gerund (V.ing)',
        content: 'จำกลุ่มกริยาที่ต้องตามด้วย V.ing:<br><b>enjoy, finish, mind, avoid, suggest, practice, keep, admit, deny, imagine, consider, miss, quit, postpone, delay, risk, appreciate</b>',
        examples: [
          { en: 'I <b>enjoy playing</b> games.', th: 'enjoy + V.ing' },
          { en: 'She <b>finished cooking</b>.', th: 'finish + V.ing' },
          { en: 'Do you <b>mind opening</b> the window?', th: 'mind + V.ing' },
          { en: 'Please <b>avoid making</b> noise.', th: 'avoid + V.ing' },
        ],
        practice: [
          { prompt: '"I enjoy ___ music."', choices: ['listen', 'to listen', 'listening', 'listened'], correctIndex: 2, explain: 'enjoy + V.ing = listening' },
          { prompt: '"She finished ___ dinner."', choices: ['cook', 'to cook', 'cooking', 'cooked'], correctIndex: 2, explain: 'finish + V.ing = cooking' },
        ],
      },
      {
        heading: 'กริยาที่ตามด้วย Infinitive (to + V.1)',
        content: 'จำกลุ่มกริยาที่ต้องตามด้วย to + V.1:<br><b>want, need, decide, hope, plan, promise, agree, learn, offer, refuse, expect, choose, manage, seem, fail, pretend, tend</b>',
        examples: [
          { en: 'I <b>want to go</b> home.', th: 'want + to + V.1' },
          { en: 'She <b>decided to leave</b>.', th: 'decide + to + V.1' },
          { en: 'They <b>promised to help</b>.', th: 'promise + to + V.1' },
        ],
        practice: [
          { prompt: '"She wants ___ a doctor."', choices: ['be', 'to be', 'being', 'is'], correctIndex: 1, explain: 'want + to + V.1 = to be' },
          { prompt: '"He decided ___ the country."', choices: ['leave', 'leaving', 'to leave', 'left'], correctIndex: 2, explain: 'decide + to + V.1' },
        ],
      },
      {
        heading: '5 กริยาที่ตามได้ทั้งคู่ (ความหมายใกล้เคียง)',
        content: '<b>like, love, hate, start, begin, prefer, continue</b> ตามได้ทั้ง V.ing และ to + V.1 ความหมายใกล้เคียงกัน<br><br>• I <b>like swimming</b>. = I <b>like to swim</b>.<br>• She <b>started reading</b>. = She <b>started to read</b>.',
        examples: [
          { en: 'I <b>love reading</b>. / I <b>love to read</b>.', th: 'ความหมายเหมือนกัน' },
        ],
      },
      {
        heading: 'กริยาที่ตามได้ทั้งคู่ (ความหมายต่างกัน!)',
        content: 'บางกริยาตามได้ทั้ง 2 แบบ แต่<b>ความหมายต่างกัน</b>:<br><br>• <b>remember</b> + V.ing = จำได้ว่าเคยทำ / + to V.1 = จำได้ว่าต้องทำ<br>  I remember <b>meeting</b> her. (จำได้ว่าเคยเจอ)<br>  Remember <b>to call</b> me. (อย่าลืมโทรมา)<br><br>• <b>forget</b> + V.ing = ลืมเรื่องที่เคยทำ / + to V.1 = ลืมทำ<br><br>• <b>stop</b> + V.ing = หยุดสิ่งที่ทำ / + to V.1 = หยุดเพื่อจะทำ<br>  I stopped <b>smoking</b>. (เลิกสูบ)<br>  I stopped <b>to smoke</b>. (หยุดเพื่อสูบ)<br><br>• <b>try</b> + V.ing = ลองทำ / + to V.1 = พยายาม',
        examples: [
          { en: 'I <b>remembered to lock</b> the door. (จำได้ว่าต้องทำ)', th: 'to + V.1 = ทำแล้ว' },
          { en: 'I <b>remember locking</b> the door. (จำได้ว่าเคยล็อค)', th: 'V.ing = จำอดีต' },
        ],
      },
      {
        heading: 'Gerund หลัง Preposition',
        content: 'หลัง preposition (in, on, at, for, of, about, without, before, after, by) ต้องใช้ <b>V.ing</b> เสมอ',
        examples: [
          { en: 'She is good <b>at swimming</b>.', th: 'at + V.ing' },
          { en: 'Thank you <b>for helping</b> me.', th: 'for + V.ing' },
          { en: 'I\'m tired <b>of waiting</b>.', th: 'of + V.ing' },
        ],
        practice: [
          { prompt: '"Thank you for ___ me."', choices: ['help', 'to help', 'helping', 'helped'], correctIndex: 2, explain: 'for + V.ing = helping' },
        ],
      },
    ],
    quiz: [
      { question: '"I enjoy ___ music."', choices: ['listen', 'to listen', 'listening', 'listened'], correctIndex: 2, explain: 'enjoy + V.ing' },
      { question: '"She wants ___ a doctor."', choices: ['be', 'to be', 'being', 'is'], correctIndex: 1, explain: 'want + to + V.1' },
      { question: '"___ is good for your health."', choices: ['Exercise', 'To exercising', 'Exercising', 'Exercised'], correctIndex: 2, explain: 'ประธาน = Gerund' },
      { question: '"He decided ___ the country."', choices: ['leave', 'leaving', 'to leave', 'left'], correctIndex: 2, explain: 'decide + to + V.1' },
      { question: '"Thank you for ___ me."', choices: ['help', 'to help', 'helping', 'helped'], correctIndex: 2, explain: 'for + V.ing' },
      { question: '"I finished ___ my homework."', choices: ['do', 'to do', 'doing', 'done'], correctIndex: 2, explain: 'finish + V.ing' },
      { question: '"She promised ___ me."', choices: ['call', 'to call', 'calling', 'called'], correctIndex: 1, explain: 'promise + to + V.1' },
      { question: '"Do you mind ___ the door?"', choices: ['open', 'to open', 'opening', 'opened'], correctIndex: 2, explain: 'mind + V.ing' },
    ],
  },
  {
    id: 'prepositions', num: 14, title: 'Prepositions บุพบท', icon: '📍', color: '#4a7cc1',
    intro: 'Preposition คือคำบุพบท ใช้เชื่อมความสัมพันธ์ของคำ บอกสถานที่ เวลา วิธี',
    sections: [
      {
        heading: 'in / on / at + เวลา',
        content: '<b>in</b> + ช่วงเวลากว้าง: เดือน, ปี, ฤดู, ส่วนของวัน<br>  in January, in 2024, in summer, in the morning<br><br><b>on</b> + วันเฉพาะ: วันในสัปดาห์, วันที่<br>  on Monday, on July 4, on Christmas Day<br><br><b>at</b> + เวลาเป็นจุด: ชั่วโมง, บางเวลาเฉพาะ<br>  at 5 PM, at noon, at night, at midnight',
        examples: [
          { en: 'I was born <b>in</b> 1995.', th: 'in + ปี' },
          { en: 'See you <b>on</b> Monday.', th: 'on + วัน' },
          { en: 'The meeting is <b>at</b> 3 PM.', th: 'at + เวลา' },
          { en: '<b>In</b> the morning I drink coffee.', th: 'in + ส่วนของวัน' },
        ],
        practice: [
          { prompt: '"I was born ___ July."', choices: ['in', 'on', 'at', 'by'], correctIndex: 0, explain: 'in + เดือน' },
          { prompt: '"See you ___ 3 o\'clock."', choices: ['in', 'on', 'at', 'by'], correctIndex: 2, explain: 'at + เวลาเป็นชั่วโมง' },
          { prompt: '"Christmas is ___ December 25."', choices: ['in', 'on', 'at', 'by'], correctIndex: 1, explain: 'on + วันที่' },
        ],
      },
      {
        heading: 'in / on / at + สถานที่',
        content: '<b>in</b> = อยู่ในบริเวณกว้าง (เมือง ประเทศ ห้อง)<br>  in Bangkok, in Thailand, in the room, in the car<br><br><b>on</b> = อยู่บนพื้นผิว (โต๊ะ ผนัง)<br>  on the table, on the wall, on the floor<br><br><b>at</b> = อยู่ที่จุดเฉพาะ (บ้าน สถานที่)<br>  at home, at school, at the door, at the airport',
        examples: [
          { en: 'She lives <b>in</b> Bangkok.', th: 'ในเมือง' },
          { en: 'The book is <b>on</b> the desk.', th: 'บนโต๊ะ' },
          { en: 'I am <b>at</b> the airport.', th: 'ที่จุดเฉพาะ' },
        ],
        practice: [
          { prompt: '"The book is ___ the table."', choices: ['in', 'on', 'at', 'to'], correctIndex: 1, explain: 'on + พื้นผิว' },
          { prompt: '"He lives ___ Chiang Mai."', choices: ['in', 'on', 'at', 'to'], correctIndex: 0, explain: 'in + เมือง' },
          { prompt: '"I\'ll meet you ___ the bus stop."', choices: ['in', 'on', 'at', 'to'], correctIndex: 2, explain: 'at + จุดเฉพาะ' },
        ],
      },
      {
        heading: 'in / on + ยานพาหนะ',
        content: '<b>in</b> + รถส่วนตัว (เพราะเข้าไปในรถ) → in a car, in a taxi<br><b>on</b> + ยานพาหนะสาธารณะ (เพราะขึ้นไปบน) → on a bus, on a train, on a plane, on a ship',
        examples: [
          { en: 'I go to work <b>in</b> a car.', th: 'ในรถส่วนตัว' },
          { en: 'She is <b>on</b> the bus.', th: 'บนรถประจำทาง' },
          { en: 'We flew <b>on</b> a plane to Japan.', th: 'บนเครื่องบิน' },
        ],
        practice: [
          { prompt: '"He is ___ the bus."', choices: ['in', 'on', 'at', 'to'], correctIndex: 1, explain: 'on + ยานพาหนะสาธารณะ' },
          { prompt: '"They came ___ a taxi."', choices: ['in', 'on', 'at', 'by'], correctIndex: 0, explain: 'in + รถส่วนตัว' },
        ],
      },
      {
        heading: 'in vs into (คงที่ vs เคลื่อนไหว)',
        content: '<b>in</b> = อยู่ข้างในแล้ว (สถานะ ไม่เคลื่อนที่)<br><b>into</b> = เข้าไปข้างใน (การเคลื่อนไหวเข้าไป)<br>  ตรงข้ามคือ <b>out of</b> = ออกจาก',
        examples: [
          { en: 'She is <b>in</b> the room.', th: 'อยู่ในห้องแล้ว' },
          { en: 'She walked <b>into</b> the room.', th: 'เดินเข้าไปในห้อง' },
          { en: 'The cat jumped <b>out of</b> the box.', th: 'กระโดดออกจากกล่อง' },
        ],
      },
      {
        heading: 'between vs among',
        content: '<b>between</b> = ระหว่าง (2 สิ่ง)<br><b>among</b> = ท่ามกลาง (3 สิ่งขึ้นไป)',
        examples: [
          { en: 'Sit <b>between</b> John and Mary.', th: 'ระหว่างสองคน' },
          { en: 'She sat <b>among</b> her friends.', th: 'ท่ามกลางเพื่อน ๆ (หลายคน)' },
          { en: 'The secret is <b>between</b> us two.', th: 'ระหว่างสองคน' },
        ],
        practice: [
          { prompt: '"There is a secret ___ us three."', choices: ['between', 'among', 'in', 'on'], correctIndex: 1, explain: '3 คน → among' },
          { prompt: '"The store is ___ the bank and the post office."', choices: ['between', 'among', 'in', 'on'], correctIndex: 0, explain: '2 สิ่ง → between' },
        ],
      },
      {
        heading: 'Preposition of Direction',
        content: '<b>to</b> = ไปยัง / <b>from</b> = จาก<br><b>up</b> = ขึ้น / <b>down</b> = ลง<br><b>through</b> = ผ่านทะลุ / <b>across</b> = ข้าม<br><b>along</b> = ไปตาม / <b>around</b> = รอบ<br><b>toward</b> = มุ่งไปทาง / <b>away from</b> = ห่างจาก',
        examples: [
          { en: 'I go <b>to</b> school.', th: 'ไปยังโรงเรียน' },
          { en: 'She came <b>from</b> Japan.', th: 'มาจากญี่ปุ่น' },
          { en: 'Walk <b>along</b> the river.', th: 'เดินไปตามแม่น้ำ' },
          { en: 'The dog ran <b>toward</b> me.', th: 'วิ่งมาทางฉัน' },
        ],
      },
      {
        heading: 'Common Preposition Phrases',
        content: 'สำนวนที่พบบ่อย:<br>• <b>on time</b> = ตรงเวลา / <b>in time</b> = ทันเวลา<br>• <b>at first</b> = ตอนแรก / <b>at last</b> = ในที่สุด<br>• <b>by the way</b> = อ้อ, พูดถึงเรื่องนี้<br>• <b>in fact</b> = ที่จริงแล้ว<br>• <b>on the other hand</b> = ในทางกลับกัน<br>• <b>at least</b> = อย่างน้อย',
        examples: [
          { en: 'The train arrived <b>on time</b>.', th: 'ตรงเวลาเป๊ะ' },
          { en: 'I got there just <b>in time</b>.', th: 'ทันเวลาพอดี' },
          { en: '<b>At last</b>, we finished the project.', th: 'ในที่สุด...' },
        ],
      },
    ],
    quiz: [
      { question: '"I was born ___ July."', choices: ['in', 'on', 'at', 'by'], correctIndex: 0, explain: 'in + เดือน' },
      { question: '"See you ___ 3 o\'clock."', choices: ['in', 'on', 'at', 'by'], correctIndex: 2, explain: 'at + เวลาเป็นชั่วโมง' },
      { question: '"The book is ___ the table."', choices: ['in', 'on', 'at', 'to'], correctIndex: 1, explain: 'on + พื้นผิว' },
      { question: '"He is ___ the bus."', choices: ['in', 'on', 'at', 'to'], correctIndex: 1, explain: 'on + ยานพาหนะสาธารณะ' },
      { question: '"There is a secret ___ us three."', choices: ['between', 'among', 'in', 'on'], correctIndex: 1, explain: '3 คนขึ้นไปใช้ among' },
      { question: '"She lives ___ Bangkok."', choices: ['in', 'on', 'at', 'to'], correctIndex: 0, explain: 'in + เมือง' },
      { question: '"The store is ___ the bank and the school."', choices: ['between', 'among', 'in', 'on'], correctIndex: 0, explain: '2 สิ่ง → between' },
      { question: '"I met her ___ the morning."', choices: ['in', 'on', 'at', 'by'], correctIndex: 0, explain: 'in + ส่วนของวัน' },
    ],
  },
  {
    id: 'conjunctions', num: 15, title: 'Conjunctions สันธาน', icon: '🔗', color: '#e0a848',
    intro: 'Conjunction คือคำเชื่อม ใช้เชื่อมคำ วลี หรือประโยคเข้าด้วยกัน',
    sections: [
      {
        heading: '3 ประเภทของ Conjunctions',
        content: '<b>1) Coordinating Conjunctions</b> (FANBOYS) - เชื่อมสิ่งที่มีระดับเท่ากัน<br>  <b>F</b>or, <b>A</b>nd, <b>N</b>or, <b>B</b>ut, <b>O</b>r, <b>Y</b>et, <b>S</b>o<br><br><b>2) Subordinating Conjunctions</b> - เชื่อมประโยคหลักกับประโยครอง<br>  because, if, when, while, although, since, unless, until, before, after<br><br><b>3) Correlative Conjunctions</b> - ใช้เป็นคู่<br>  both...and, either...or, neither...nor, not only...but also',
        examples: [
          { en: 'I like tea <b>and</b> coffee.', th: 'and เชื่อม 2 คำ' },
          { en: 'I stayed home <b>because</b> I was tired.', th: 'because เชื่อมประโยค' },
          { en: '<b>Both</b> Tom <b>and</b> Jane are here.', th: 'both...and เป็นคู่' },
        ],
      },
      {
        heading: 'FANBOYS - คำเชื่อมพื้นฐาน',
        content: 'ท่องจำ 7 ตัว "FANBOYS":<br>• <b>for</b> = เพราะว่า (คล้าย because แต่ formal)<br>• <b>and</b> = และ<br>• <b>nor</b> = และไม่ (คู่กับ neither)<br>• <b>but</b> = แต่<br>• <b>or</b> = หรือ<br>• <b>yet</b> = แต่กระนั้น (คล้าย but แต่ตรงข้ามที่คาดไม่ถึง)<br>• <b>so</b> = ดังนั้น',
        examples: [
          { en: 'I was tired, <b>so</b> I went to bed.', th: 'ดังนั้น' },
          { en: 'She is smart <b>but</b> lazy.', th: 'ขัดแย้งกัน' },
          { en: 'Do you want tea <b>or</b> coffee?', th: 'ให้เลือก' },
          { en: 'He tried hard, <b>yet</b> he failed.', th: 'yet = แต่กระนั้น' },
        ],
        practice: [
          { prompt: '"I was tired, ___ I went to bed."', choices: ['but', 'so', 'or', 'because'], correctIndex: 1, explain: 'so = ดังนั้น (เหตุ → ผล)' },
          { prompt: '"She is rich ___ unhappy."', choices: ['and', 'but', 'or', 'so'], correctIndex: 1, explain: 'ขัดแย้ง → but' },
        ],
      },
      {
        heading: 'Subordinating Conjunctions',
        content: 'ใช้เชื่อม<b>ประโยคหลัก</b>กับ<b>ประโยครอง</b>:<br><br>• <b>because, since, as</b> = เพราะ<br>• <b>if, unless</b> = ถ้า / ถ้าไม่<br>• <b>when, while, as</b> = เมื่อ / ในขณะที่<br>• <b>before, after</b> = ก่อน / หลัง<br>• <b>although, though, even though</b> = แม้ว่า<br>• <b>until, till</b> = จนกระทั่ง',
        examples: [
          { en: 'I studied <b>although</b> I was tired.', th: 'แม้ว่าเหนื่อยก็ยังอ่าน' },
          { en: 'Call me <b>when</b> you arrive.', th: 'เมื่อคุณถึง' },
          { en: 'She won\'t come <b>unless</b> you ask her.', th: 'ถ้าไม่ถามเธอจะไม่มา' },
        ],
        practice: [
          { prompt: '"She didn\'t come ___ she was sick."', choices: ['and', 'or', 'because', 'but'], correctIndex: 2, explain: 'because = เพราะ (บอกเหตุผล)' },
          { prompt: '"___ it was raining, we went out."', choices: ['Because', 'Although', 'If', 'When'], correctIndex: 1, explain: 'Although = แม้ว่า (ขัดแย้งกัน)' },
          { prompt: '"I will help you ___ you ask."', choices: ['if', 'because', 'although', 'so'], correctIndex: 0, explain: 'if = ถ้า (เงื่อนไข)' },
        ],
      },
      {
        heading: 'Correlative Conjunctions (ใช้เป็นคู่)',
        content: 'คำเชื่อมที่มา<b>เป็นคู่</b> ห้ามใช้แยก:<br>• <b>both A and B</b> = ทั้ง A และ B<br>• <b>either A or B</b> = A หรือ B<br>• <b>neither A nor B</b> = ไม่ A และไม่ B<br>• <b>not only A but also B</b> = ไม่เพียง A แต่ยัง B<br>• <b>whether A or B</b> = ไม่ว่า A หรือ B',
        examples: [
          { en: '<b>Both</b> Tom <b>and</b> Jane are here.', th: 'ทั้งสองคน' },
          { en: 'You can have <b>either</b> tea <b>or</b> coffee.', th: 'อย่างใดอย่างหนึ่ง' },
          { en: '<b>Neither</b> Tom <b>nor</b> Jane came.', th: 'ไม่มาสักคน' },
          { en: 'She is <b>not only</b> smart <b>but also</b> kind.', th: 'ไม่เพียง...แต่ยัง' },
        ],
        practice: [
          { prompt: 'เติมคำที่ขาด: "___ Tom ___ Jane are my friends."', choices: ['Both / and', 'Either / or', 'Neither / nor', 'Not only / but'], correctIndex: 0, explain: 'ทั้ง 2 คนเป็นเพื่อน → Both...and' },
        ],
      },
      {
        heading: 'Clause (ประโยคย่อย) vs Phrase (วลี)',
        content: '<b>Clause</b> = ส่วนของประโยคที่มี<b>ทั้งประธานและกริยา</b><br>  Main Clause = ประโยคหลัก ยืนเดี่ยวได้<br>  Subordinate Clause = ประโยครอง ต้องอาศัยประโยคหลัก<br><br><b>Phrase</b> = กลุ่มคำที่ไม่มีประธานหรือกริยาครบ ทำหน้าที่เป็นคำเดียว',
        examples: [
          { en: '<b>I stayed home</b> because <b>it was raining</b>.', th: 'Main Clause + Subordinate Clause' },
          { en: '<b>In the morning</b>, I drink coffee.', th: '"In the morning" = phrase (บอกเวลา)' },
          { en: 'The book <b>on the table</b> is mine.', th: '"on the table" = phrase (ขยาย book)' },
        ],
      },
    ],
    quiz: [
      { question: '"I was tired, ___ I went to bed."', choices: ['but', 'so', 'or', 'because'], correctIndex: 1, explain: 'so = ดังนั้น' },
      { question: '"She didn\'t come ___ she was sick."', choices: ['and', 'or', 'because', 'but'], correctIndex: 2, explain: 'because = เพราะ' },
      { question: '"___ it was raining, we went out."', choices: ['Because', 'Although', 'If', 'When'], correctIndex: 1, explain: 'Although = แม้ว่า' },
      { question: '"I will help you ___ you ask."', choices: ['if', 'because', 'although', 'so'], correctIndex: 0, explain: 'if = ถ้า' },
      { question: '"She is smart ___ lazy."', choices: ['and', 'but', 'or', 'so'], correctIndex: 1, explain: 'ขัดแย้ง → but' },
      { question: '"Do you want tea ___ coffee?"', choices: ['and', 'but', 'or', 'so'], correctIndex: 2, explain: 'ให้เลือก → or' },
      { question: '"___ Tom ___ Jane are here."', choices: ['Both / and', 'Neither / or', 'Either / and', 'Not / but'], correctIndex: 0, explain: 'ทั้งสอง → Both...and' },
      { question: '"Call me ___ you arrive."', choices: ['because', 'if', 'when', 'but'], correctIndex: 2, explain: 'when = เมื่อ' },
    ],
  },
  {
    id: 'comparisons', num: 16, title: 'Comparisons การเปรียบเทียบ', icon: '⚖️', color: '#c14a4a',
    intro: 'การเปรียบเทียบมี 3 ขั้น: ขั้นธรรมดา (Positive), ขั้นกว่า (Comparative), ขั้นสูงสุด (Superlative)',
    sections: [
      {
        heading: 'ภาพรวม 3 ขั้นการเปรียบเทียบ',
        content: 'ใช้เปรียบเทียบสองสิ่งขึ้นไป โดยผัน adjective/adverb:<br><br>• <b>ขั้นธรรมดา</b>: <b>as + adj + as</b> = "เท่ากับ"<br>• <b>ขั้นกว่า</b>: <b>adj + er / more + adj + than</b> = "มากกว่า"<br>• <b>ขั้นสูงสุด</b>: <b>the + adj + est / the most + adj</b> = "มากที่สุด"',
        examples: [
          { en: 'She is <b>as tall as</b> me.', th: 'เท่ากัน' },
          { en: 'She is <b>taller than</b> me.', th: 'สูงกว่า' },
          { en: 'She is <b>the tallest</b> in the class.', th: 'สูงที่สุด' },
        ],
      },
      {
        heading: 'กฎการผัน Adjective',
        content: '<b>1) คำสั้น 1 พยางค์</b> → เติม <b>-er / -est</b><br>  tall → taller → tallest<br>  big → bigger → biggest (ซ้ำพยัญชนะท้าย)<br><br><b>2) คำ 2 พยางค์ลงท้าย -y</b> → เปลี่ยน y เป็น i แล้วเติม<br>  happy → happier → happiest<br>  easy → easier → easiest<br><br><b>3) คำยาว 2+ พยางค์</b> → ใช้ <b>more / the most</b><br>  beautiful → more beautiful → the most beautiful<br>  expensive → more expensive → the most expensive<br><br><b>4) คำผิดปกติ (Irregular)</b> ต้องจำ:<br>  good → <b>better</b> → <b>best</b><br>  bad → <b>worse</b> → <b>worst</b><br>  far → <b>farther/further</b> → <b>farthest/furthest</b><br>  little → <b>less</b> → <b>least</b><br>  much/many → <b>more</b> → <b>most</b>',
        examples: [
          { en: 'big → bigger → biggest', th: 'คำสั้น + er/est (ซ้ำ g)' },
          { en: 'happy → happier → happiest', th: 'y → i + er/est' },
          { en: 'expensive → more expensive → the most', th: 'คำยาว + more/most' },
        ],
        practice: [
          { prompt: 'รูปขั้นกว่าของ "big"', choices: ['biger', 'bigger', 'more big', 'biggest'], correctIndex: 1, explain: 'คำสั้น + ซ้ำพยัญชนะ + er = bigger' },
          { prompt: 'รูปขั้นสูงสุดของ "expensive"', choices: ['expensiver', 'expensivest', 'most expensive', 'the most expensive'], correctIndex: 3, explain: 'คำยาว + the most' },
          { prompt: 'รูปขั้นกว่าของ "good"', choices: ['gooder', 'more good', 'better', 'best'], correctIndex: 2, explain: 'good ผันผิดปกติ → better' },
        ],
      },
      {
        heading: 'การผันขั้นธรรมดา (as...as)',
        content: 'ใช้ <b>as + adj/adv + as</b> = "เท่ากับ"<br>รูปปฏิเสธ: <b>not as/so ... as</b> = "ไม่เท่ากับ"<br><br>สำนวนอื่น ๆ:<br>• <b>the same as</b> = เหมือนกัน<br>• <b>similar to</b> = คล้ายกัน<br>• <b>different from</b> = ต่างจาก',
        examples: [
          { en: 'She is <b>as smart as</b> him.', th: 'ฉลาดเท่ากัน' },
          { en: 'This is <b>not as good as</b> that.', th: 'ไม่ดีเท่านั้น' },
          { en: 'My car is <b>the same as</b> yours.', th: 'รถเหมือนกัน' },
        ],
        practice: [
          { prompt: '"He is as tall ___ his brother."', choices: ['than', 'as', 'from', 'to'], correctIndex: 1, explain: 'as + adj + as' },
        ],
      },
      {
        heading: 'การผันขั้นกว่า (Comparative)',
        content: 'ใช้ <b>adj + er + than</b> (คำสั้น) หรือ <b>more + adj + than</b> (คำยาว)<br><br>ห้ามลืม <b>than</b> ตามหลัง!<br><br>สำนวนพิเศษ:<br>• <b>much / a lot</b> + comparative = ...กว่ามาก<br>  She is <b>much taller than</b> me.<br>• <b>a little</b> + comparative = ...กว่านิดหน่อย<br>• <b>the + comparative, the + comparative</b> = ยิ่ง...ยิ่ง<br>  The <b>more</b> you practice, the <b>better</b> you get.',
        examples: [
          { en: 'He is <b>taller than</b> her.', th: 'เขาสูงกว่าเธอ' },
          { en: 'This is <b>more difficult than</b> that.', th: 'ยากกว่า' },
          { en: 'The <b>more</b> you study, the <b>smarter</b> you become.', th: 'ยิ่ง...ยิ่ง' },
        ],
        practice: [
          { prompt: '"My house is ___ than yours."', choices: ['big', 'bigger', 'biggest', 'more big'], correctIndex: 1, explain: 'ขั้นกว่า → bigger' },
          { prompt: '"This book is ___ than that one."', choices: ['interesting', 'interestinger', 'more interesting', 'the most interesting'], correctIndex: 2, explain: 'ขั้นกว่า + คำยาว → more interesting' },
        ],
      },
      {
        heading: 'การผันขั้นสูงสุด (Superlative)',
        content: 'ใช้ <b>the + adj + est</b> (คำสั้น) หรือ <b>the most + adj</b> (คำยาว)<br><br>ห้ามลืม <b>the</b> นำหน้า!<br><br>มักตามด้วย <b>in</b> (สถานที่) หรือ <b>of</b> (กลุ่ม):<br>• the tallest <b>in</b> the class<br>• the best <b>of</b> all',
        examples: [
          { en: 'She is <b>the smartest</b> in the class.', th: 'ฉลาดที่สุด' },
          { en: 'This is <b>the most beautiful</b> place.', th: 'สวยที่สุด' },
          { en: 'He is <b>the best</b> player.', th: 'ดีที่สุด (good → best)' },
        ],
        practice: [
          { prompt: '"She is the ___ girl in school."', choices: ['pretty', 'prettier', 'prettiest', 'more pretty'], correctIndex: 2, explain: 'ขั้นสูงสุด + y → i + est = prettiest' },
        ],
      },
      {
        heading: 'ข้อควรระวัง',
        content: 'ผิดที่พบบ่อย:<br>• ห้าม<b>ซ้ำ</b> more + er: "more taller" ผิด<br>• ต้องมี <b>than</b> ในขั้นกว่า: "She is taller me" ผิด → "taller than me"<br>• ต้องมี <b>the</b> ในขั้นสูงสุด: "She is smartest" ผิด → "the smartest"<br>• ห้ามใช้ <b>the</b> ในขั้นกว่า: "She is the taller" ผิด → "taller"',
        examples: [
          { en: '❌ She is more taller than him.', th: 'ผิด: ซ้ำซ้อน' },
          { en: '✅ She is taller than him.', th: 'ถูก' },
          { en: '❌ He is smartest.', th: 'ผิด: ขาด the' },
          { en: '✅ He is the smartest.', th: 'ถูก' },
        ],
      },
    ],
    quiz: [
      { question: '"My house is ___ than yours."', choices: ['big', 'bigger', 'biggest', 'more big'], correctIndex: 1, explain: 'ขั้นกว่า → bigger' },
      { question: '"She is the ___ girl in school."', choices: ['pretty', 'prettier', 'prettiest', 'more pretty'], correctIndex: 2, explain: 'ขั้นสูงสุด + y → i + est' },
      { question: '"This book is ___ than that one."', choices: ['interesting', 'interestinger', 'more interesting', 'the most interesting'], correctIndex: 2, explain: 'ขั้นกว่า + คำยาว → more' },
      { question: '"He is as tall ___ his brother."', choices: ['than', 'as', 'from', 'to'], correctIndex: 1, explain: 'as + adj + as' },
      { question: 'รูปขั้นกว่าของ "good"', choices: ['gooder', 'more good', 'better', 'best'], correctIndex: 2, explain: 'good → better (ผิดปกติ)' },
      { question: 'รูปขั้นสูงสุดของ "bad"', choices: ['badder', 'baddest', 'worse', 'the worst'], correctIndex: 3, explain: 'bad → worse → the worst' },
      { question: '"She sings ___ than me."', choices: ['well', 'better', 'best', 'more well'], correctIndex: 1, explain: 'well → better (ผิดปกติ)' },
      { question: '"This is ___ movie I\'ve ever seen."', choices: ['good', 'better', 'best', 'the best'], correctIndex: 3, explain: 'ขั้นสูงสุด + the → the best' },
    ],
  },
];

module.exports = { GRAMMAR_CHAPTERS };
