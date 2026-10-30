# Grammar QA — การตรวจคลังคำถามแกรมม่า

## เครื่องมือ
- `node scripts/grammar-qa.js` — ตรวจอัตโนมัติทั้งคลังเดิม (`data/grammar.js`) และหลักสูตรใหม่ (`data/grammar-curriculum/`) · `--json` = รายงานเต็ม
- รันอัตโนมัติในชุดทดสอบ `test/grammar-qa.test.js` (ต้องไม่มี error ก่อน deploy)
- ตรวจ: field หาย · ตัวเลือกซ้ำ/ต่างแค่การย่อคำ · เฉลยนอกช่วง · ข้อซ้ำ · อักขระเสีย/สระไทยลอย/วรรณยุกต์ซ้อน · a/an ไม่ตรงเสียง ·
  article ตามด้วยกริยา (เช่น "___ is a good book." เฉลย A) · คำบอกอนาคตที่มีทั้ง will และ present continuous/going to ในตัวเลือก
- ข้อที่กฎเตือนแต่คนตรวจแล้วว่าถูก ใส่ใน `REVIEWED_OK` พร้อมเหตุผล
- ข้อจำกัด: กฎอัตโนมัติจับได้เฉพาะรูปแบบที่รู้จัก ความถูกต้องเชิงความหมายยังต้องมีคนตรวจ (ด้านล่าง)

## ผลตรวจคลังเดิม (ตุลาคม 2569)
อ่านครบทุกข้อ 1,145 ข้อ (ข้อสอบท้ายบท 632 + แบบฝึกในบทเรียน 513) โดยผู้ตรวจ 4 ชุดแยกกัน · แก้ 137 ข้อ ในตำแหน่งเดิม
(ไม่ลบ/ไม่เลื่อนลำดับ — ประวัติข้อผิดเดิมที่อ้างตำแหน่งข้อยังชี้ถูกข้อ)

| ปัญหา | จำนวน |
|---|---|
| ambiguous | 101 |
| ungrammatical | 15 |
| bad_explanation | 10 |
| wrong_answer | 8 |
| thai_error | 2 |
| duplicate_choice | 1 |

นอกจากนี้: Ranked ไม่สลับลำดับตัวเลือกของข้อที่อ้างตัวอักษร (เช่น "ถูกทั้ง A และ C") · โจทย์เติมคำอัตโนมัติจากประโยคตัวอย่างคำศัพท์
ไม่ใช้คำไวยากรณ์ (a/an/the/is/…) และต้องมีบริบทอย่างน้อย 5 คำ

## รายการที่แก้
| ตำแหน่ง | ปัญหา | หมายเหตุ |
|---|---|---|
| `nouns.quiz.toeic[0]` | ambiguous | 'our manager has approved' is also correct |
| `nouns.quiz.toeic[2]` | ambiguous | 'any question' is also grammatical |
| `nouns.quiz.toeic[3]` | ambiguous | 'three new staff' is acceptable (esp. BrE); explanation wrongly calls staff uncountable |
| `nouns.quiz.toefl[0]` | ambiguous | 'Words such as...' also fits; explanation reasoning wrong |
| `determiners.sections[1].practice[0]` | ambiguous | 'play piano' (no article) is common in American English |
| `determiners.sections[8].practice[1]` | ambiguous | 'in the hospital' is standard American English |
| `determiners.quiz.intermediate[5]` | ungrammatical | 'He has much patience' is unnatural in affirmative sentences |
| `determiners.quiz.advanced[1]` | bad_explanation | 'Those of us who' is a fixed pattern, not about distance |
| `determiners.quiz.advanced[3]` | ungrammatical | 'gave me much useful advice' is unnatural in affirmative |
| `determiners.quiz.expert[1]` | bad_explanation | '(formal writing)' hint contradicts 'both' answer; explanation unclear |
| `adjectives.quiz.basic[6]` | ambiguous | 'I want a red ball.' is also a correct sentence |
| `adjectives.quiz.intermediate[3]` | ambiguous | 'I feel well today' is also correct (healthy) |
| `adjectives.quiz.advanced[0]` | ambiguous | 'silver' can be color or material so order is debatable; explanation omits Shape |
| `adverbs.sections[5].practice[1]` | duplicate_choice | 'tragicly' appears twice |
| `adverbs.sections[9].practice[1]` | ambiguous | 'He runs fastest of all' (no the) is acceptable for adverbs |
| `adverbs.sections[10].practice[1]` | wrong_answer | marked answer yields 'He just has finished', which the explanation itself says is wrong |
| `adverbs.sections[10].practice[2]` | ambiguous | 'I very much enjoyed the film.' is also correct |
| `adverbs.quiz.basic[6]` | ambiguous | 'He goes to the gym often.' (and front 'Often...') are also acceptable |
| `adverbs.quiz.intermediate[1]` | ambiguous | 'He speaks English fine' is acceptable informal English |
| `adverbs.quiz.advanced[3]` | wrong_answer | option 'both A and D' refers to itself and option C 'I went yesterday to school' is wrong; correct end position missing |
| `adverbs.quiz.expert[0]` | ungrammatical | choices are verb pairs but the sentence has only one blank and already contains 'arrived' |
| `adverbs.quiz.toeic[1]` | ambiguous | 'Please arrive earlier' is also grammatical and natural |
| `pronouns.sections[9].practice[0]` | ambiguous | 'This is a beautiful day today' is also acceptable; replace distractor 'This' with 'Its' |
| `pronouns.sections[10].practice[1]` | ambiguous | 'that one' with coffee (a cup/brand) is natural, and 'those ones' is itself nonstandard; use clearly uncountable case |
| `pronouns.quiz.intermediate[0]` | thai_error | Thai hint '(แก่เขา)' means 'to him' but the answer is possessive 'his' |
| `pronouns.quiz.intermediate[4]` | ambiguous | 'The team celebrated their victory' is standard (esp. BrE, common in AmE); replace 'their' |
| `pronouns.quiz.expert[1]` | ungrammatical | Question has no blank, shows both answers in the stem |
| `pronouns.quiz.expert[3]` | wrong_answer | 'He always speaks of whatever it is' is unnatural and does not mean 'everything'; rewrite |
| `pronouns.quiz.expert[4]` | bad_explanation | Hint '(formal)' contradicts answer 'both correct'; remove hint |
| `pronouns.quiz.toefl[3]` | ambiguous | 'gave them credit' (to other people) is equally grammatical; add context forcing reflexive |
| `wh-words.sections[6].practice[1]` | ambiguous | 'Who did you invite?' is correct and more common than 'Whom'; replace distractor |
| `wh-words.sections[10].practice[2]` | ambiguous | 'Who are you waiting on?' is common AmE for 'waiting for'; replace 'on' |
| `wh-words.sections[12].practice[0]` | ambiguous | 'Whenever you go, I will support you' is also grammatical; add Thai hint |
| `wh-words.quiz.basic[3]` | ambiguous | Without the hint, Where/When/How/Why all fit; add answer context |
| `wh-words.quiz.intermediate[4]` | ambiguous | 'Which kind of music do you like?' is also acceptable; replace 'Which' |
| `wh-words.quiz.advanced[2]` | ungrammatical | Answer 'where he' doubles the subject: 'where he he lives' |
| `wh-words.quiz.toefl[0]` | ambiguous | 'consider what methodology best suits' is equally correct; replace 'what' |
| `wh-words.quiz.toefl[2]` | ambiguous | 'ask how their findings can be generalized' is also natural; replace 'how' and fix unclear Thai |
| `wh-words.quiz.toefl[3]` | ambiguous | 'examines why cultural background affects...' is also correct; replace 'why' |
| `relative-pronouns.quiz.advanced[2]` | ambiguous | 'Can you tell me who this belongs to?' is standard; mark as formal |
| `relative-pronouns.quiz.expert[4]` | wrong_answer | 'Whoever study hard' is ungrammatical (whoever takes singular verb: whoever studies); only 'Those who' fits |
| `relative-pronouns.quiz.toefl[1]` | ambiguous | 'a laboratory where conditions were far from ideal' is fully correct; replace 'where' |
| `helping-verbs.sections[2].practice[0]` | ambiguous | 'She had finished her homework already' is also grammatical; add present context |
| `helping-verbs.sections[4].practice[0]` | ambiguous | 'You must eat vegetables' (strong advice) is also natural; add hint |
| `helping-verbs.sections[5].practice[0]` | ambiguous | may and might are both acceptable for low possibility; replace 'may' |
| `helping-verbs.sections[5].practice[1]` | ambiguous | 'Might I ask you a question?' is a correct, very polite request; replace 'Might' |
| `helping-verbs.sections[7].practice[1]` | ambiguous | 'Have you a bike?' is grammatical (old-fashioned British); replace distractor |
| `helping-verbs.quiz.basic[4]` | ambiguous | 'She had finished her homework' is also grammatical; add present context |
| `helping-verbs.quiz.basic[5]` | ambiguous | 'It will rain today' and 'It should rain' are also natural; add hint |
| `helping-verbs.quiz.intermediate[0]` | ambiguous | 'You have to be quiet in the library' is correct; replace 'have' |
| `helping-verbs.quiz.intermediate[1]` | ambiguous | Hint '(สุภาพ)' points to May only, while key says both; remove hint |
| `helping-verbs.quiz.advanced[0]` | ambiguous | 'He may have been sleeping' is equally valid; add certainty hint |
| `helping-verbs.quiz.advanced[2]` | ambiguous | 'She must not have gone' is standard negative deduction in AmE; replace distractor |
| `helping-verbs.quiz.advanced[4]` | ambiguous | 'He must not be at work' is valid negative deduction in AmE; replace distractor |
| `helping-verbs.quiz.advanced[5]` | ambiguous | 'she should have graduated' (expectation) is also correct; replace 'should' |
| `helping-verbs.quiz.expert[1]` | thai_error | Hint 'ไม่น่าจะ' (unlikely) does not match can't (impossible) and would make 'may not' fit |
| `helping-verbs.quiz.expert[3]` | ambiguous | 'He must have known the truth, but he chose to lie' is more natural than 'could'; rewrite stem |
| `helping-verbs.quiz.toeic[1]` | ambiguous | 'you may contact' and 'you must contact' are also correct in this letter; use form-based distractors |
| `helping-verbs.quiz.toeic[4]` | bad_explanation | Explanation says all three mean 'should have'; must have = deduction |
| `helping-verbs.quiz.toefl[0]` | ambiguous | 'must be used' / 'can be used' also fit; make it a passive-form item |
| `helping-verbs.quiz.toefl[1]` | ambiguous | 'must avoid' (and arguably can/may) also fit; use form-based distractors |
| `helping-verbs.quiz.toefl[4]` | ungrammatical | Third conditional needs 'had had'; 'may have' is not used for unreal past |
| `sv-agreement.sections[10].practice[0]` | ungrammatical | 'Three-quarters of the pizza is eaten' is unnatural; use 'gone' |
| `sv-agreement.quiz.intermediate[7]` | ungrammatical | 'Some of the water is spilled' is unnatural; rewrite |
| `sv-agreement.quiz.advanced[0]` | bad_explanation | Hint stressing members points to 'are' while key says both; remove hint, clarify |
| `sv-agreement.quiz.advanced[3]` | ungrammatical | 'Half of the pizza is eaten' is unnatural; also hint 'uncountable' is inaccurate |
| `sv-agreement.quiz.expert[0]` | bad_explanation | Hint '(formal)' contradicts answer 'both correct'; remove hint |
| `tenses.sections[4].practice[0]` | ambiguous | 'I saw this movie 3 times' is natural (esp. AmE) without a 'so far' marker |
| `tenses.sections[4].practice[2]` | ungrammatical | Single-blank question but choices are garbled two-part strings ('Have / /') |
| `tenses.sections[13].practice[0]` | bad_explanation | Item sits in Future Perfect Continuous section but tests Future Perfect with stative 'be married' |
| `tenses.quiz.basic[3]` | ambiguous | 'am meeting' is equally valid (future arrangement) with 'tomorrow' |
| `tenses.quiz.basic[13]` | ambiguous | 'is playing' is valid for a future arrangement with 'next week' |
| `tenses.quiz.intermediate[2]` | ambiguous | 'She went to Japan twice' is acceptable without a time marker |
| `tenses.quiz.intermediate[4]` | ambiguous | 'They waited for 2 hours before I arrived' is also correct ('before' already shows order) |
| `tenses.quiz.intermediate[6]` | ungrammatical | 'She was talking to me when I entered' is illogical (she can't talk to me before I enter) |
| `tenses.quiz.intermediate[7]` | ambiguous | 'will go' is also acceptable; explanation mislabels 'are going (to see)' as Present Continuous |
| `tenses.quiz.intermediate[8]` | ambiguous | 'I lost my keys. I can't find them.' is natural, especially in AmE |
| `tenses.quiz.intermediate[10]` | ambiguous | 'Did he hear the news yet?' is accepted in American English |
| `tenses.quiz.advanced[8]` | ambiguous | 'He asked me if I saw the movie' is also acceptable (backshift of 'Did you see') |
| `tenses.quiz.advanced[11]` | ambiguous | 'must have been finished by Friday' is also grammatical (deduction about the past) |
| `tenses.quiz.expert[2]` | ambiguous | 'had lived / moved' and even 'lived / moved' are both correct here |
| `tenses.quiz.expert[3]` | ambiguous | 'Not until she had arrived home did she read' is also correct |
| `tenses.quiz.expert[8]` | ambiguous | 'claiming he was at home all evening' is fully acceptable |
| `tenses.quiz.toeic[2]` | ambiguous | 'had prepared' is a valid reading (report already done when the CEO called) |
| `tenses.quiz.toeic[3]` | ambiguous | 'is undergoing' (future arrangement) is equally valid in a notice |
| `tenses.quiz.toeic[6]` | ambiguous | 'the office is closed from Dec 24 to Jan 2' is standard in notices |
| `tenses.quiz.toeic[8]` | ambiguous | 'is starting at 9 AM' is also natural for a scheduled event |
| `tenses.quiz.toefl[6]` | ambiguous | 'excavated the site for three months before they discovered' is correct ('before' shows order) |
| `active-passive.sections[3].practice[0]` | ungrammatical | 'She is eaten.' is grammatical but semantically bizarre for learners |
| `active-passive.sections[6].practice[1]` | ambiguous | 'A gift was given her.' is acceptable (formal BrE) |
| `active-passive.quiz.basic[2]` | ungrammatical | 'She is eaten.' is grammatical but semantically bizarre for learners |
| `active-passive.quiz.basic[7]` | ambiguous | 'The song was sung many times' is equally valid without a time marker |
| `active-passive.quiz.intermediate[4]` | ambiguous | 'Rice grows in Thailand' is correct (intransitive grow) |
| `active-passive.quiz.intermediate[5]` | ambiguous | 'is being sent tomorrow' is valid (future arrangement) |
| `active-passive.quiz.intermediate[7]` | ambiguous | 'This dish was served with rice' is valid; no general-truth signal in the question |
| `active-passive.quiz.advanced[3]` | wrong_answer | 'A gift was given me.' is acceptable (BrE); explanation is garbled |
| `active-passive.quiz.expert[2]` | ambiguous | Hint '(informal)' points to 'painting' only, contradicting the 'both' key |
| `participles.sections[4].practice[0]` | ambiguous | 'falling leaves' is equally valid for the hint 'ใบไม้ที่ร่วง — ร่วงเอง' |
| `participles.sections[6].practice[1]` | wrong_answer | 'an essay written well' is unnatural; key 'both B and C' is doubtful |
| `participles.quiz.expert[2]` | ungrammatical | Question already contains 'all', so key gives 'All all things considered' |
| `gerund-infinitive.sections[9].practice[1]` | ambiguous | "told us to not talk" (split infinitive) is accepted by many native speakers; replace distractor |
| `gerund-infinitive.sections[13].practice[1]` | ambiguous | "left quietly not to disturb" / "to not disturb" are used by natives; replace distractors with clearly wrong forms |
| `gerund-infinitive.quiz.basic[2]` | ambiguous | "Exercise is good for your health" (noun) is fully correct; replace distractor |
| `prepositions.sections[2].practice[0]` | ambiguous | "in the bus" is also used by natives; replace distractor so only "on" fits |
| `prepositions.quiz.basic[3]` | ambiguous | "in the bus" is also used by natives; replace distractor so only "on" fits |
| `prepositions.sections[2].practice[1]` | bad_explanation | taxi is not a private car; explanation misleading |
| `prepositions.sections[4].practice[0]` | ambiguous | "a secret between us three / between the three of us" is fully idiomatic; use a group context where only among fits |
| `prepositions.quiz.basic[4]` | ambiguous | "a secret between us three / between the three of us" is fully idiomatic; use a group context where only among fits |
| `prepositions.sections[12].practice[1]` | ungrammatical | "Let me explain to you." without an object is incomplete/unnatural; "explain for you" also grammatical |
| `prepositions.quiz.intermediate[1]` | bad_explanation | "in an hour" means one hour from now, not "within"; hint/explanation misleading |
| `prepositions.quiz.advanced[1]` | ambiguous | "good in maths" is also heard from natives; replace distractor |
| `prepositions.quiz.toeic[3]` | ambiguous | "arrive at the end of the week" is fully correct; replace distractor |
| `conjunctions.sections[1].practice[1]` | ambiguous | "rich/smart and unhappy/lazy" is grammatical with no contrast cue; replace "and" distractor |
| `conjunctions.quiz.basic[4]` | ambiguous | "rich/smart and unhappy/lazy" is grammatical with no contrast cue; replace "and" distractor |
| `conjunctions.sections[2].practice[1]` | ambiguous | "When it was raining, we went out" is grammatical; add "still" and replace When/If distractors |
| `conjunctions.quiz.basic[2]` | ambiguous | "When it was raining, we went out" is grammatical; add "still" and replace When/If distractors |
| `conjunctions.sections[3].practice[0]` | ambiguous | "Neither Tom nor Jane are my friends" is also grammatical; meaning must be given |
| `conjunctions.sections[5].practice[0]` | ambiguous | omitting the comma before "so" with short clauses is widely accepted; replace that option with a clear error |
| `conjunctions.sections[8].practice[2]` | ambiguous | "When I was walking home, it started to rain" is fully correct; replace distractor |
| `conjunctions.sections[9].practice[1]` | ambiguous | "If I was you" is widely accepted informally; replace distractor |
| `conjunctions.sections[9].practice[2]` | ambiguous | "You won't succeed until you work hard" is natural English; replace distractor |
| `conjunctions.sections[10].practice[1]` | ambiguous | "He whispered not to wake the baby" / "to not wake" are used by natives (and can read as reported speech); replace distractors |
| `conjunctions.sections[13].practice[2]` | bad_explanation | sentence has two verbs (sang, danced); explanation "กริยาชุดเดียว" is misleading |
| `conjunctions.quiz.basic[5]` | ambiguous | "Do you want tea and coffee?" is grammatical (asking for both); add context |
| `conjunctions.quiz.basic[7]` | ambiguous | "Call me if you arrive" is also grammatical; replace distractor |
| `conjunctions.quiz.intermediate[7]` | wrong_answer | "so that catch the train" is ungrammatical (so that needs a clause); only "in order to" fits |
| `conjunctions.quiz.expert[0]` | ambiguous | "I am demanding that he apologize" is also grammatical; replace distractor |
| `conjunctions.quiz.expert[2]` | wrong_answer | the concessive idiom is "Much as I admire him"; "Much though" is not standard |
| `conjunctions.quiz.expert[3]` | ambiguous | "acts like he owns the place" is very common and accepted; replace distractor |
| `comparisons.sections[1].practice[1]` | ambiguous | "most expensive" is also the superlative form; replace distractor |
| `comparisons.sections[8].practice[2]` | ambiguous | "much the best" is grammatical (esp. BrE); replace distractor |
| `comparisons.sections[10].practice[1]` | ambiguous | "Of the two options, this is better" is also natural; replace distractor |
| `comparisons.quiz.intermediate[0]` | ambiguous | "more happy" is acceptable in some contexts; replace distractor |
| `comparisons.quiz.toefl[0]` | ambiguous | passage updated (shared with toefl[2]) to add "than solar" for blank 3 |
| `comparisons.quiz.toefl[1]` | ambiguous | passage updated (shared with toefl[2]) to add "than solar" for blank 3 |
| `comparisons.quiz.toefl[2]` | ambiguous | "remains most efficient in coastal areas" is natural (predicative superlative); add "than solar" so only "more" fits |
| `comparisons.quiz.toefl[4]` | ambiguous | "is best supported by evidence" (adverb superlative, no "the") is at least as natural as "the best"; remove ambiguity |
