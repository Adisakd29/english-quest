# Brief: original TOEIC-style Reading Part 7 sets (Reading Comprehension)

Product: EnglishQuest, an English-learning web app for Thai learners. Everything must be ORIGINAL (do not copy or
paraphrase real ETS/TOEIC items or prep books). Invented people/companies only.

A set = 1, 2 or 3 short business documents + multiple-choice questions (4 options each):
- format "single": 1 document (80–330 words), 2–4 questions
- format "double": 2 related documents (e.g. an ad + an email replying to it), 5 questions, ≥1 "crossReference" question
  that can only be answered by combining information from both documents
- format "triple": 3 related documents (e.g. a web page + a form + an email), 5 questions, ≥2 "crossReference" questions
Each document 40–330 words; double/triple total ≤ 650 words.

Document types (docType): email, memo, notice, letter, advertisement, article, instructions, announcement, webpage,
review, chat (text-message chain: lines like "Mina Cho [9:14 A.M.]: ..."), form, invoice, schedule, survey.
Plain text with \n line breaks; header lines (To:/From:/Date:/Subject:) allowed. For invoices/schedules/forms you may use
a simple table: consecutive lines that start and end with "|" and cells separated by " | " (first row = header).

Question types (type):
- mainIdea  — "What is the purpose of the e-mail?" / "What is the article mainly about?"
- detail    — a stated fact
- inference — "What is suggested/implied about ...?" (must still be clearly supported by the text)
- vocabulary — 'In the e-mail, the word "cover" in paragraph 2, line 3, is closest in meaning to' (quote the word in "double quotes"; it must appear in the document; options are single words/short phrases; context forces one meaning)
- notTrue   — "What is NOT mentioned/indicated as ...?" (three options are stated in the text, one is not)
- insertion — at most one per set: put markers [1] [2] [3] [4] (in order, once each) in ONE document; the question has
              field "sentence" with the sentence to insert; stem: 'In which of the positions marked [1], [2], [3], and [4] does the following sentence best belong?'; options exactly ["[1]","[2]","[3]","[4]"]
- intent    — chat only: 'At 9:16 A.M., what does Mr. Lee most likely mean when he writes, "..."?'
- crossReference — double/triple only (see above)

## JSON format (one set)
{
  "id": "R<batch>-<nn>", "format": "single|double|triple",
  "topic": "office|hr|marketing|finance|sales|travel|manufacturing|events|customerService|technology|realEstate|health|dining|logistics",
  "difficulty": "easy|medium|hard",
  "docs": [ { "docType": "...", "title": "E-mail", "text": "To: ...\nFrom: ...\n\nDear ..." } ],   // title = short label like the real test ("Notice", "E-mail", "Online Chat Discussion", "Invoice")
  "questions": [
    { "type": "...", "stem": "...?", "options": ["...","...","...","..."], "answer": 0-3,
      "evidence": ["exact phrase copied verbatim from a document (5–25 words) that proves the answer"],   // required for every type except insertion; may hold 2 quotes for crossReference (one from each doc)
      "sentence": "only for insertion",
      "explanationTH": "Thai explanation (2–4 sentences): where the evidence is and why the answer follows",
      "optionNotesTH": ["why A right/wrong", "...", "...", "..."] }
  ],
  "translationTH": ["natural Thai translation of document 1", "... one per document"],
  "tipTH": "1–2 sentence Thai strategy tip",
  "vocabulary": [ { "word": "...", "pos": "noun|verb|adjective|adverb|preposition|conjunction|phrase|pronoun", "th": "..." } ]   // 3–6 items
}

## Quality rules (most important first)
1. EXACTLY ONE option correct for each question, provable from the text (quote it in "evidence" verbatim — copy-paste,
   same punctuation). Inference answers must be strongly supported; distractors should be plausible but contradicted
   by, or absent from, the text. For notTrue, the three "mentioned" options must really be stated.
2. Options are paraphrases (not word-for-word copies of the text) for the correct answer where natural; distractors may
   reuse words from the text (classic trap).
3. Documents read like real business writing; consistent names, dates, numbers across documents.
4. Spread answer positions evenly (0–3) across your sets (insertion answers too).
5. Thai natural and correct; explanations point to the evidence.

## Output
Write a JSON array to the path in your task, then run
  node /home/claude/eq/services/toeic/part7Validator.js <your file>
and fix until ALL VALID. Re-read every question once more trying to defend each distractor; fix any doubt.
Reply with only: path, count of sets/questions, answer distribution, any question you were unsure about.
