# Learner content for A1–B1 vocabulary senses — writer brief

EnglishQuest teaches English to **Thai learners**. Each vocabulary item is ONE sense of an Oxford 3000 headword
(e.g. `bank (money)` ≠ `bank (river)`). The current definitions/examples come from WordNet: too difficult for A1–B1
and often a **different sense** (e.g. `also` → "he has a Mercedes, too"; `autumn` → "in the fall of 1973").
You write fresh learner content that replaces them.

## Input
`data/vocab-learner/input/batch-NN.json` — array of
`{ id, cefr, headword, pos, senseLabel, currentThai, flagNote, displayForm }`
- `senseLabel` (may be null) tells you WHICH meaning this item is. Your content must match it.
- `currentThai` is an AI-generated Thai meaning (not yet human-checked). Keep it if correct and natural; fix it if wrong, unnatural, too narrow, or for a different sense.
- `flagNote` means a reviewer flagged the Thai (e.g. covers 2 meanings, grammar word). Resolve it: give the best Thai for THIS sense.

## Output
Write `data/vocab-learner/out/batch-NN.json` — a JSON array with **exactly the same items in the same order**:

```jsonc
{
  "id": "A1-S0067",               // copy
  "headword": "bank",              // copy
  "pos": "noun",                   // copy
  "meaningEN": "a business that keeps money safe and lends money",
  "thai": "ธนาคาร",
  "thaiChanged": false,            // true if thai ≠ currentThai (or currentThai was null)
  "thaiChangeReason": null,        // short Thai reason when thaiChanged, else null
  "shortTH": "ธนาคาร",              // ≤ 30 characters, used as an answer choice
  "example": "I need to go to the bank before it closes.",
  "form": "bank",                  // the EXACT surface form of the headword used in `example`
  "exampleTH": "ฉันต้องไปธนาคารก่อนที่ธนาคารจะปิด",
  "collocations": ["bank account", "go to the bank"],
  "functionWord": false,
  "gapOk": true,
  "noteTH": null
}
```

### Field rules
- **meaningEN** — a learner definition in YOUR OWN words. Simple vocabulary (mostly A1–A2 words).
  A1/A2 ≤ 12 words, B1 ≤ 16 words. Must NOT contain the headword or an obvious family form (no "to agree: to have the same opinion as someone who agrees").
  Function words (articles, determiners, pronouns, prepositions, conjunctions, auxiliaries, modals, exclamations, numbers) may use a short usage description, e.g. "used before a singular noun when you do not say which one".
- **thai** — natural modern Thai for THIS sense; 1–3 alternatives separated by `, ` are fine. For grammar words, a meaning + short note in parentheses is fine.
- **shortTH** — ≤ 30 characters. Usually the first/best Thai word. Must make sense alone as a multiple-choice option.
- **example** — ONE original sentence that clearly shows THIS sense. Everyday modern situations (school, home, work, travel, food, phones, friends, Thailand is welcome: names like Nok, Ploy, Somchai; places like Chiang Mai).
  Length: A1 5–10 words, A2 6–13, B1 7–16. Vocabulary at or below the item's level as far as possible. Start with a capital, end with `.` `?` or `!`.
  The context should make the meaning guessable (good for a gap-fill exercise).
- **form** — the headword as it appears in the example (may be inflected: `went`, `children`, `bigger`, `banks`). It must appear in `example` **exactly once as a whole word** (case-sensitive match). For multi-word headwords use the whole phrase as it appears.
  For headwords like `a, an` choose one (`an`). For `displayForm`/senseLabel items, use the plain word.
- **exampleTH** — natural Thai translation of the example (not word-for-word).
- **collocations** — 2–3 real, common combinations for THIS sense (`make a decision`, `heavy rain`). For function words, short common patterns (`at home`, `at 7 o'clock`).
- **functionWord** — true for articles, determiners, pronouns, prepositions, conjunctions, auxiliary/modal verbs, exclamations, numbers, infinitive marker; else false.
- **gapOk** — true only if, with `form` replaced by `___`, a learner at this level would find exactly ONE clearly correct answer among ordinary words of the same part of speech. If many words fit (`I ___ it.` → like/want/see) rewrite the example to make it clear; if still impossible, set false. Function words: usually false.
- **noteTH** — optional (≤ 100 characters) for a genuinely useful tip: countable/uncountable, irregular past, UK vs US, a common Thai learner mistake. Otherwise null.

## Hard rules
1. **No copying.** Never reproduce definitions or example sentences from Oxford, Cambridge, Longman, Collins, Merriam-Webster or any other dictionary/textbook. Write everything fresh.
2. Content must be appropriate for teenagers: no violence, sex, drugs, politics, religion jokes, brands as the point of the sentence, or stereotypes.
3. Every item in the input must be in the output, same order, same `id`.
4. Avoid repeating the same example pattern ("I like ___.") across items; vary subjects and situations.
5. Thai must use correct spelling and natural word order. Do not mix English into Thai except unavoidable names.

## Self-check (required)
Run: `node scripts/learner/validate.js data/vocab-learner/out/batch-NN.json`
Fix every error it reports and run it again until it prints `OK`. Then re-read your items once more for: wrong sense, unnatural English, Thai mistakes, examples too hard for the level.

---

## B2–C1 (batch 25–48) — what changes
Everything above still applies, with these level-specific rules (the validator enforces the numbers):

| | meaningEN | example length | vocabulary in example |
|---|---|---|---|
| **B2** (batch 25–37) | ≤ 18 words, mostly A2–B1 words | 8–20 words | at or below B2 |
| **C1** (batch 38–48) | ≤ 20 words, mostly B1 words | 8–22 words | at or below C1; the rest of the sentence should still be easy so the headword is the only hard word |

- **Learner, not dictionary.** These learners are Thai university students / working adults preparing for exams (IELTS, TOEIC, CU-TEP) and work.
  Explain the word the way a good teacher would; never use a harder word to define an easier one.
- **Situations:** study, work and meetings, emails, news-style facts (non-political), science and technology, health, environment, travel, money,
  relationships, culture. Thai settings are welcome but not required. Still no violence/sex/drugs/politics/religion jokes.
- **Example must prove the sense.** For B2/C1 many words are abstract (`acknowledge`, `allocate`, `coherent`). Build a sentence whose context
  makes the meaning clear (cause → result, contrast, or a concrete detail). Avoid empty frames like "This is very ___." or "He ___ it."
- **Register:** if the word is formal, academic, informal or mainly British/American, say so in `noteTH`
  (e.g. `ภาษาทางการ ใช้ในงานเขียน/รายงาน`, `ภาษาพูด`). Also use `noteTH` for important grammar patterns
  (`account for + สิ่งที่อธิบาย`, `insist on + V-ing`, uncountable nouns, prepositions that Thai learners get wrong).
- **Collocations matter more** at this level: give 2–3 natural, high-frequency combinations a learner can reuse in writing
  (`raise awareness`, `a significant increase`, `draw a conclusion`). No invented combinations.
- **Thai:** prefer the everyday Thai a Thai teacher would write on the board, not a literal dictionary gloss. For abstract words give
  1–3 options that cover how the word is really used (e.g. `allocate` → `จัดสรร, แบ่งให้`). Fix `currentThai` when it is a different sense,
  too narrow, or stiff/unnatural.
- **Phrasal and multi-word headwords** (e.g. `carry out`): `form` must be the whole phrase as it appears (`carried out`). If the phrase is
  split by an object (`carry the plan out`) choose a sentence where it is NOT split.
- **gapOk** at B2/C1: true only when a strong learner would choose this word over near-synonyms. Many near-synonyms exist at this level
  (`significant/important/major`), so be strict: if two common words fit, rewrite or set `false`.
- **Same headword, different levels:** some headwords also exist at A1–B1 with another sense (e.g. `account` noun at A2, `account` verb at B2).
  Write content for THIS sense only, and do not reuse an example from the lower level.
