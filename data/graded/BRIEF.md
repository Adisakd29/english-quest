# Brief: original graded readers (A1–B2) for EnglishQuest

EnglishQuest teaches English to Thai learners. You write short ORIGINAL stories/texts at one CEFR level. Each text is
used two ways: **Reading** (text on screen) and **Listening** (the same text read aloud by TTS, text hidden until the
end). Do not copy or retell published graded readers, textbooks, fairy tales or news; invent everything.

## Lengths (words in all paragraphs together)
A1 80–130 · A2 130–190 · B1 190–270 · B2 260–340. Paragraphs: A1 2–3, A2 3–4, B1 3–5, B2 4–6.

## Language level
- Use vocabulary mostly at or below the level (Oxford 3000 style). A few words above the level are fine if they are in
  the glossary. Grammar: A1 present simple/continuous, can, there is; A2 + past simple, going to, comparatives;
  B1 + present perfect, first/second conditional, passive (simple); B2 anything natural.
- Natural, modern, engaging: a small problem, a surprise, a decision, a funny or warm ending. Mix Thai settings
  (Chiang Mai, a market in Bangkok, a school in Khon Kaen) and international ones. Teen-safe: no violence, romance
  beyond friendship, politics, religion jokes, brands, or stereotypes.
- TTS-friendly: no emojis, no symbols like # & * / ; write times "seven thirty" or "7:30"; avoid brackets.

## JSON format (one text)
{
  "id": "A1-01",                       // <LEVEL>-<nn> as given in your task
  "level": "A1",
  "kind": "story" | "email" | "blog" | "article" | "dialogue",   // dialogue = speaker lines "Name: text" in paragraphs
  "title": "The Lost Umbrella",
  "titleTh": "ร่มที่หายไป",
  "topic": "daily life|school|food|travel|family|friends|work|health|nature|technology|sport|culture|shopping|city",
  "paragraphs": ["...", "..."],
  "translationTH": ["natural Thai translation of paragraph 1", "... one per paragraph"],
  "glossary": [ { "word": "umbrella", "pos": "noun|verb|adjective|adverb|phrase", "th": "ร่ม" } ],   // 5–8 useful words that APPEAR in the text
  "questions": [
    { "type": "gist|detail|vocab|inference|sequence",
      "stem": "Why is Nok late for school?",
      "options": ["...", "...", "...", "..."], "answer": 0-3,
      "evidence": "exact words copied from the text (5–25 words) that prove the answer",
      "explanationTH": "Thai 1–2 sentences pointing to the clue" }
  ],                                    // A1/A2: 4 questions · B1/B2: 5 questions · include exactly 1 gist question
  "tipTH": "one Thai sentence: a reading/listening tip for this text"
}

## Question rules
1. Exactly one defensible answer, provable from the text; `evidence` must be copied verbatim.
2. Options short (A1/A2 ≤ 8 words, B1/B2 ≤ 12 words); correct option usually paraphrases the text; distractors reuse
   words from the text but are wrong.
3. vocab questions: 'What does the word "..." mean in paragraph 2?' with English options; the word must be in the text.
4. Spread answers evenly over 0–3 across your texts. Questions must work for LISTENING too (no "look at line 3").

## Output
Write a JSON array to the path in your task and run
  node /home/claude/eq/services/graded/validator.js <your file>
until it prints ALL VALID. Then re-read everything once: level, naturalness, Thai quality, one answer per question.
Reply only with: path, count, word counts per text, answer distribution, anything you were unsure about.
