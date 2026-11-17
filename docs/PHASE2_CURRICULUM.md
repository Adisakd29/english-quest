# v1.10.0 · Phase 2 — Core curriculum

Date: 2026-10-28. This continues from `docs/PREMIUM_PHASE1.md`.

## Summary

| Area | Before | After |
|---|---|---|
| Vocab A1–B1 content | Definitions/examples from WordNet, too hard and often for **the wrong sense** (e.g. also → "he has a Mercedes, too", autumn → "in the fall of 1973"). No Thai translations of examples | Rewritten for all 2,975 senses: simple English definition · original example that shows the right sense · Thai translation of the example · 2–3 collocations · 1,020 tips |
| Thai meanings A1–B1 | AI-generated, 267 words flagged as pending review (not used in lessons) | Reviewed/fixed 654 words · flagged words resolved to one sense → **all 267 words are usable in lessons again** · short Thai (≤ 30 characters) used as answer choices |
| Vocab lesson | 1 exercise type (word → meaning) · **client knew the answer and sent `chosenWordId` itself** (could be faked) | Server builds questions and keeps the answers (`/api/lesson`) · client only gets random choice keys · **5 types**: meaning · reverse (meaning → word) · context (fill the blank in a sentence) · spell (type the word) · listen |
| Placement test | 31 questions (vocab 15 + grammar 16 from the old chapters, which aren't split by CEFR) | **50 questions**: vocab 25 + grammar 25 from the **CEFR curriculum** (5 per level A1–C1, no repeated topic) · allows one near-miss level if the level above passes |
| Grammar | 2 systems side by side (16 old chapters + 74 CEFR topics) | CEFR curriculum is the only main path · old chapters become a "supplementary exam bank" (old progress kept) · placement test and Boss use CEFR |
| **Choice order (bug found during testing)** | **The CEFR grammar bank puts the correct answer first in ~80% of items (B1–C1 ~88%) and choices weren't shuffled** → picking the first choice got almost everything right | Shuffled per session seed (stable within a session) in lessons/reviews/daily/grammar placement/main placement test/Boss · checked against the original index server-side |

## Content pipeline (2,975 senses)

1. **Writers** (24 batches × ≤ 125) follow `data/vocab-learner/BRIEF.md`: write fresh content (no copying from any dictionary), match the sense (`senseLabel`), length by level, form appears in the example exactly once
2. **Validator** `services/learner/validator.js` / `scripts/learner/validate.js`: schema · length · word appears exactly once · definition doesn't give the answer away · Thai present · no duplicate examples across files → **all files pass with 0 errors**
3. **Blind reviewers** (12, `data/vocab-learner/REVIEW.md`): found **7 major** (e.g. definition didn't match the example, a royal/political colour example that's sensitive in Thailand, wrong past tense ring–rang) + **380 minor** issues (mostly fill-the-blank items where more than one answer fits) → applied with `scripts/learner/apply-reviews.js` (history in `reviews/applied.json`)
4. **Final checker** reviewed all 387 changed items → fixed 15 more
5. **Migration 061** (`scripts/learner/apply.js`): checks id + headword + pos before every update · backs up old values to `vocab_senses_prelearner_backup` · **never overwrites Thai meanings an admin has reviewed** · `apply_thai` (re-importing Thai) skips rows that have learner content

> All content was generated and checked by AI (3 independent passes); it has **not yet been checked by a human**. `translation_source` stays `AI_GENERATED`, `verification_status = autoChecked`. Admins can review and edit from the existing admin page.

## Vocab lesson v2 (`services/vocab/lesson.js`, `routes/lesson.js`)
- `POST /api/lesson/start { level, unitId?, explore?, mode: learn|review|due|listen }` → `{ sessionId, questions[] }` (no wordId or answers)
- `POST /api/lesson/:sid/answer { i, key }` or `{ i, text }` → server grades · SRS/EXP rules identical (`services/vocab/record.js`, shared) · each question can be answered once (409) · session expires in 3 hours (410) · other users' sessions = 404
- Choosing the type: new word → meaning · seen but not passed → reverse/context · review → context/spell/reverse (context/spell only for sentences checked to have one correct answer, `gapOk` + form = the word itself)
- Distractors: same part of speech first · different word · Thai meaning not too close to the answer or each other
- Old channel `/api/progress/review` (client knew the answer): **returns 410 in production** · can be re-enabled temporarily with `LEGACY_CARD_REVIEW=on` while users still have the old page open · the test suite still uses it to check the SRS rules

## Migrations
- `061_learner_vocab.js` (+ `_down.sql` restores from the backup table)
- `062_vocab_lesson_sessions.sql` (+ `_down.sql`)

## Tests
- Unit: `test/vocab-lesson.test.js` (9 tests: content/validator/backup · start/answer/409/410/404 · due review types · listen · unit lock · legacy 410 · choice shuffling + first-choice strategy doesn't reach a high level) — full suite **415/415**
- E2E: `test/e2e/vocab_lesson_e2e.py` (learn a full unit + review with fill-in/spell/reverse) and `test/e2e/phase2_e2e.py` (50-question placement test + supplementary grammar bank) at desktop 1280 · tablet 820 · mobile 390 — all pass
- Regression E2E: premium_phase1, work, lesson (390/1280), c2, login, toeicdaily, toeicweak, speak, festival — pass · CSP: 0 violations

## Limitations / remaining work
- B2–C1 (2,972 senses) still use WordNet content — do in the next phase with the same pipeline
- The dictionary page (`/vocab`) still shows WordNet synonyms (hidden in lessons for words with new content)
- Content hasn't been human-checked — recommend admins spot-check
- The ranked question bank still uses the old grammar chapters (competition, deliberately left alone)
- The spelling exercise accepts only the exact form in the example (case-insensitive); typos aren't forgiven
