# Brief: writing original TOEIC-style Reading Part 5 questions (Incomplete Sentences)

Product: EnglishQuest, an English-learning web app for Thai learners. The questions must be ORIGINAL (do not copy or
paraphrase real ETS/TOEIC test items or published prep books). Business/workplace contexts like the real test.

## Format of one question (JSON object)
{
  "id": "B<batch>-<nn>",                       // e.g. "B3-07" (final ids assigned later)
  "skill": "<one of the skills below>",
  "difficulty": "easy" | "medium" | "hard",
  "topic": "office|hr|marketing|finance|sales|travel|manufacturing|events|customerService|technology|realEstate|health|dining|logistics",
  "sentence": "The new software allows staff to submit expense reports more ------- than before.",   // exactly ONE blank written as 7 hyphens -------
  "options": ["quick", "quickly", "quicker", "quickness"],      // exactly 4, unique, each ≤ 4 words, no letters A-D in them
  "answer": 1,                                                 // index 0-3 of the ONLY correct option
  "translationTH": "ซอฟต์แวร์ใหม่ช่วยให้พนักงานส่งรายงานค่าใช้จ่ายได้รวดเร็วกว่าเดิม",   // natural Thai translation of the completed sentence
  "explanationTH": "ช่องว่างขยายกริยา submit จึงต้องใช้ adverb ... (2–4 sentences, Thai, English grammar terms allowed)",
  "optionNotesTH": ["quick (adj.) ... ใช้ไม่ได้เพราะ ...", "quickly (adv.) ถูก: ...", "...", "..."],   // 4 notes, same order as options, say why each is right/wrong
  "tipTH": "short exam strategy tip in Thai (1–2 sentences)",
  "vocabulary": [ { "word": "expense report", "pos": "noun|verb|adjective|adverb|preposition|conjunction|phrase|pronoun", "th": "รายงานค่าใช้จ่าย" } ]   // 1–3 useful words from the sentence
}

Skills: wordForm, verbTense, verbVoice, agreement, verbForm (gerund/infinitive/participle/base after modal),
pronoun, determiner (quantifiers/articles/each/every/few/little...), comparison, preposition, conjunction
(incl. preposition-vs-conjunction such as despite/although, correlatives either...or), transition (however, therefore,
consequently...), relative (who/which/whose/whom/that/where), vocabulary (meaning in context), collocation (fixed expressions, verb+noun, phrasal).

## Quality rules (most important first)
1. EXACTLY ONE option must be correct. The three distractors must be clearly wrong in standard written business
   English — grammatically wrong, or (for vocabulary items) clearly wrong in meaning/collocation. If two options
   could both be defended by a careful native editor, rewrite the item. Avoid British/American usage splits.
2. The sentence itself must be natural, grammatical, professional English (8–42 words, ends with . ? or !).
3. Distractors must be plausible to a learner (same word family for wordForm; other tenses for verbTense; etc.).
4. Vary the answer position: across your batch the correct option index should be spread roughly evenly over 0–3.
5. Difficulty: easy = clear signal word / one-step; medium = needs the whole clause; hard = subtle (long sentence,
   reduced clauses, less frequent vocabulary, near-synonym collocations) BUT still unambiguous.
6. Names: use invented people/company names only (e.g. "Ms. Patel", "Norvik Logistics"); no real brands.
7. Thai must be natural and correct; explanations should teach the rule, not just restate the answer.
8. Topics varied; no two sentences alike.

## Output
Write a JSON array to the file path given in your task. Then run:
  node /home/claude/eq/services/toeic/part5Validator.js <your file>
and fix until it prints ALL VALID. Then re-read every item one more time asking "could a second option be correct?"
and fix any doubt. Reply with only: the file path, the count, the answer-position distribution, and any item you
were unsure about.
