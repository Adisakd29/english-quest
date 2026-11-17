# Brief: original TOEIC-style Reading Part 6 sets (Text Completion)

Product: EnglishQuest, an English-learning web app for Thai learners. Everything must be ORIGINAL (do not copy or
paraphrase real ETS/TOEIC items or prep books). Invented people/companies only (e.g. "Ms. Okafor", "Lindqvist Freight").

A Part 6 set = one short business text (email, memo, notice, letter, advertisement, article, instructions,
announcement, webpage, review) of 90–200 words with FOUR blanks written [[1]] [[2]] [[3]] [[4]] in order.
- Three blanks are word/phrase blanks (kind "word"): grammar or vocabulary, like Part 5, BUT at least one of the three
  must need context from OTHER sentences of the text to answer (e.g. tense depends on a date stated earlier, a pronoun
  refers back, a connector links two sentences, a noun refers to something mentioned before). Use skill "context" for
  such items when the deciding clue is outside the blank's sentence; otherwise use a specific skill.
- Exactly ONE blank is a sentence-insertion blank (kind "sentence", skill "sentenceInsertion"): the blank stands alone
  as a whole sentence; the 4 options are complete sentences (6–25 words); only one fits the logic/flow of the text
  (refers correctly to what comes before/after). Distractors: on-topic but contradict the text, refer to the wrong
  thing, wrong time frame, or break the flow.

## JSON format (one set)
{
  "id": "S<batch>-<nn>",
  "docType": "email|memo|notice|letter|advertisement|article|instructions|announcement|webpage|review",
  "topic": "office|hr|marketing|finance|sales|travel|manufacturing|events|customerService|technology|realEstate|health|dining|logistics",
  "difficulty": "easy|medium|hard",
  "title": "Email: Change to delivery schedule",          // short heading shown above the text (≤ 80 chars)
  "text": "To: All warehouse staff\nFrom: ...\nSubject: ...\n\nStarting next Monday, our trucks will [[1]] ...",   // \n for line breaks; header lines allowed for email/memo
  "questions": [
    { "kind": "word", "skill": "<skill>", "options": ["...","...","...","..."], "answer": 0-3,
      "explanationTH": "Thai explanation (2–4 sentences) — say which clue in the text decides it",
      "optionNotesTH": ["why A right/wrong", "...", "...", "..."] },
    ... 4 items, in blank order ...
  ],
  "translationTH": "natural Thai translation of the WHOLE completed text",
  "tipTH": "1–2 sentence Thai strategy tip for this set",
  "vocabulary": [ { "word": "...", "pos": "noun|verb|adjective|adverb|preposition|conjunction|phrase|pronoun", "th": "..." } ]   // 2–5 items
}
Skills for word blanks: wordForm, verbTense, verbVoice, agreement, verbForm, pronoun, determiner, comparison,
preposition, conjunction, transition, relative, vocabulary, collocation, context.

## Quality rules (most important first)
1. EXACTLY ONE option correct for every blank, judged with the WHOLE text. Be adversarial with yourself: for each
   distractor, try to make it fit; if a careful native editor could accept it, rewrite.
2. The text must be natural, professional, coherent English as a whole, with the correct answers filled in.
3. Spread answer positions evenly (0–3) across your sets; sentence-insertion blank position varies (1, 2, 3 or 4).
4. Difficulty: easy = short text, direct clues; hard = clue far from the blank, subtle connectors/tense, longer text.
5. Thai natural and correct; explanations teach the clue.

## Output
Write a JSON array of sets to the file path given in your task, then run
  node /home/claude/eq/services/toeic/part6Validator.js <your file>
and fix until it prints ALL VALID. Re-read each set once more checking every blank for a second possible answer.
Reply with only: path, count, answer distribution, and any blank you were unsure about.
