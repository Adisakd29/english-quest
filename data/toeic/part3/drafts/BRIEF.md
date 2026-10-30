# Brief: original TOEIC-style Listening Part 3 (Conversations) and Part 4 (Talks)

Product: EnglishQuest, an English-learning web app for Thai learners. The conversation/talk is turned into AUDIO with
TTS voices; the 3 questions and their 4 options are shown on screen (as in the real test). Everything must be ORIGINAL
(do not copy/paraphrase ETS/TOEIC items or prep books). Invented names/companies only.

## Part 3 set (conversation)
- 2 speakers (man "M" + woman "W"), or 3 speakers ("M", "W", plus "M2" or "W2") — 3-speaker sets only when asked.
- 6–12 turns, speakers alternate (never the same speaker twice in a row), 90–190 words total, each turn ≤ 40 words.
- Natural spoken workplace English: contractions, short turns, realistic reactions.

## Part 4 set (talk)
- One speaker ("M" or "W"), talkType: announcement | voicemail | advertisement | news | tour | meeting | broadcast |
  introduction | instructions | speech. 100–190 words in 2–4 paragraphs (each paragraph = one "turn").
- Typical openings: "Hi, this is ... calling from ..." (voicemail), "Attention, shoppers ..." (announcement),
  "Welcome to ..." (tour), "And now for the local business news ..." (broadcast).

## Questions (exactly 3 per set, in the order the information appears)
Types: mainIdea ("What are the speakers mainly discussing?", "What is the purpose of the message?"), speaker
("Who most likely is the woman?"), location ("Where does the conversation most likely take place?"), detail, reason
("Why is the man ...?"), inference, suggestion ("What does the woman suggest the man do?"), nextAction ("What will the
speaker probably do next?"), intent ('Why does the man say, "That's a first"?' / 'What does the speaker mean when she
says, "..."?' — quote must be EXACTLY in the transcript), graphic ('Look at the graphic. Which ... ?').
- Options: 4 short options (≤ 12 words), answers are usually PARAPHRASES of what is said; distractors reuse words heard
  in the audio but don't answer the question (classic trap), or mention things said by the wrong speaker.
- For "the man"/"the woman" questions, the answer must come from that speaker.
- evidence: 1–2 exact quotes copied verbatim from the transcript (or the graphic table) that prove the answer.

## Graphic (only when asked)
"graphic": { "title": "Shuttle Schedule", "table": "| Departure | Destination |\n| 9:15 | Airport |\n| 9:45 | Convention Center |\n| 10:30 | Hotel District |" }
A pipe table (header + ≥ 2 rows). The graphic question needs BOTH the audio and the table (e.g. the speaker says "the
second-to-last session" and the learner reads the time from the table). Exactly one graphic question per graphic set.

## Spoken text rules (TTS)
No symbols (#, @, *, brackets). Write times like "nine thirty" or "9:30 A.M."; money like "$45" is fine; avoid
abbreviations other than Mr./Ms./Dr. Use full sentences; no stage directions.

## JSON format (one set)
{
  "id": "C<batch>-<nn>" (Part 3) or "T<batch>-<nn>" (Part 4), "part": 3 | 4,
  "talkType": "...",                                   // Part 4 only
  "topic": "office|hr|marketing|finance|sales|travel|manufacturing|events|customerService|technology|realEstate|health|dining|logistics",
  "difficulty": "easy|medium|hard",
  "speakers": [ { "id": "W", "gender": "female" }, { "id": "M", "gender": "male" } ],
  "turns": [ { "speaker": "W", "text": "..." }, { "speaker": "M", "text": "..." } ],
  "graphic": { ... },                                  // only if asked
  "questions": [ { "type": "...", "stem": "...?", "options": ["...","...","...","..."], "answer": 0-3,
                   "evidence": ["exact quote"], "explanationTH": "Thai 2–3 sentences (point to the clue)",
                   "optionNotesTH": ["why A right/wrong", "...", "...", "..."] } ],
  "translationTH": ["Thai translation of turn 1", "... one per turn"],
  "tipTH": "1–2 sentence Thai listening strategy tip",
  "vocabulary": [ { "word": "...", "pos": "noun|verb|adjective|adverb|preposition|conjunction|phrase|pronoun", "th": "..." } ]   // 3–5
}

## Quality rules (most important first)
1. Exactly ONE defensible answer per question, provable from the audio (and graphic). Try hard to defend each
   distractor; rewrite if it could be argued.
2. Spread correct positions evenly over A–D across your sets.
3. Natural speech; consistent facts; the 3 questions cover different parts of the audio.
4. Thai natural and correct.

## Output
Write a JSON array to the path in your task, run
  node /home/claude/eq/services/toeic/part34Validator.js <your file>
until ALL VALID, re-check every distractor, then reply with only: path, count, question-type counts, answer distribution,
and anything you were unsure about.
