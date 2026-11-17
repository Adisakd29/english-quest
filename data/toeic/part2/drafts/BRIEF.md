# Brief: original TOEIC-style Listening Part 2 items (Question–Response)

Product: EnglishQuest, an English-learning web app for Thai learners. Items are turned into AUDIO with a TTS voice —
nothing is printed while the learner answers. Everything must be ORIGINAL (do not copy/paraphrase real ETS/TOEIC items
or prep books). Invented names only.

One item = one spoken prompt (a question or statement by speaker 1) + THREE spoken responses (speaker 2).
Exactly ONE response is an appropriate reply. Business/workplace/daily contexts.

## JSON format (one item)
{
  "id": "Q<batch>-<nn>",
  "category": "wh|yesNo|choice|tag|negative|statement|request",
  "whWord": "who|what|when|where|why|how|which|whose",        // only when category = "wh"
  "difficulty": "easy|medium|hard",
  "topic": "office|hr|marketing|finance|sales|travel|manufacturing|events|customerService|technology|realEstate|health|dining|logistics",
  "prompt": "Where should I leave these invoices?",            // 3–22 words, natural spoken English, ends with ? . or !
  "promptTH": "ควรวางใบแจ้งหนี้พวกนี้ไว้ที่ไหน",
  "responses": [                                               // exactly 3, in A/B/C order; correct position varies
    { "text": "In the tray on my desk.", "isCorrect": true,  "translationTH": "...", "explanationTH": "ตอบคำถาม Where ด้วยสถานที่" },
    { "text": "Yes, I left early.",       "isCorrect": false, "distractorType": "yesNoToWh", "translationTH": "...", "explanationTH": "คำถาม Where ตอบ Yes/No ไม่ได้ และ left เป็นคำซ้ำทำให้สับสน" },
    { "text": "About forty dollars.",     "isCorrect": false, "distractorType": "wrongWh",   "translationTH": "...", "explanationTH": "ตอบเรื่องราคา (How much) ไม่ใช่สถานที่" }
  ],
  "explanationTH": "2–3 Thai sentences: what the prompt asks and why the correct reply works",
  "tipTH": "1 Thai sentence listening tip",
  "vocabulary": [ { "word": "invoice", "pos": "noun|verb|adjective|adverb|preposition|conjunction|phrase|pronoun", "th": "ใบแจ้งหนี้" } ]   // 1–3
}
distractorType: similarSound (word that sounds like a word in the prompt: copy/coffee, review/view), repeatedWord
(repeats a prompt word but doesn't answer), wrongWh (answers a different wh-question), yesNoToWh (yes/no to a
wh-question), wrongTense, wrongPerson (wrong pronoun/person), relatedWordTrap (word associated with the topic), offTopic,
illogical.

## Real-test style (important)
- Mix of categories across your batch: many wh-questions, plus yes/no, choice (A or B?), tag ("..., isn't it?"),
  negative ("Didn't you ...?"), statements ("The printer is out of paper again."), requests/offers/suggestions
  ("Could you ...?", "Why don't we ...?").
- Correct answers are often INDIRECT for medium/hard items: "I haven't seen the schedule yet.", "Ask Ms. Lee in
  accounting.", "Actually, it's been postponed." — but they must still be the ONLY sensible reply.
- Distractors use classic traps: similar sounds, repeated words, answering the wrong wh-word, yes/no to wh-questions.

## Quality rules (most important first)
1. EXACTLY ONE appropriate reply. For every distractor, try hard to imagine a context where it could be a natural reply
   (e.g. "Yes, ..." to a yes/no question is usually fine — so a yes/no distractor needs a clear mismatch in content).
   If a distractor could work, rewrite it. Indirect correct answers must clearly relate to the prompt.
2. Natural, short spoken English (responses 1–14 words). No letters A/B/C, no abbreviations TTS may misread (write
   "Ms. Lee" fine; avoid "e.g.", "#", "approx."; write times as "three o'clock" or "3 P.M."; avoid symbols).
3. Spread correct positions evenly over A/B/C. Difficulty: easy = direct answer; hard = indirect answer + strong traps.
4. Thai natural and correct.

## Output
Write a JSON array to the path in your task, run
  node /home/claude/eq/services/toeic/part2Validator.js <your file>
until ALL VALID, re-check every distractor once more, and reply with only: path, count, category counts, correct
position distribution, and any item you were unsure about.
