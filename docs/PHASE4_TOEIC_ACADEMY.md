# v1.10.0 · Phase 4 — TOEIC Academy

Date: 2026-10-29

## Summary
| Area | Before | After |
|---|---|---|
| Part 3 (Conversations) | 36 sets · 108 questions | **60 sets · 180 questions** (+24 sets: 18 two-speaker · 6 three-speaker · 6 with a graphic) · audio generated with Kokoro TTS (offline, free) |
| Part 7 (Reading) | 46 sets · 168 questions | **70 sets · 262 questions** (+24 sets: 16 single · 4 double · 4 triple) |
| Strategy lessons | None | **TOEIC Academy** — 7 lessons (`data/toeic/academy/lessons.json`): real exam format · question types · common traps · step-by-step method · timing · common phrases · 3 strategy-check questions (graded server-side) |
| Score prediction | Only after a full Full Mock (132 questions) | **Predicted score from all practice** (`/api/toeic/predict`), shown on the TOEIC page |

## Content quality (Part 3 / Part 7)
- Writers use the original briefs (`data/toeic/part{3,7}/drafts/BRIEF.md`) → validators (`part34Validator`, `part7Validator`) → **blind solvers who don't see the answer key** (3 solvers)
- Result: **166/166 questions matched the key** · 2 small items fixed (an unnatural line, a loose vocabulary option)
- Existing IDs unchanged (P3-0001…0036, P7-0001…0046) · new sets appended (P3-0037…0060, P7-0047…0070) → users' history isn't affected

## Prediction method (`services/toeic/predict.js`)
- Uses only **the first attempt at each question** from the last 120 days (not repeats or reviews of missed questions, which inflate the score) · latest 80 questions per Part
- Weighted by the number of questions in the real test: Listening P1 6 · P2 25 · P3 39 · P4 30 · Reading P5 30 · P6 16 · P7 54
- Parts not attempted yet use the average of the other Parts but widen the range · at least 20 questions per section before estimating
- Score = 5 + 490 × weighted accuracy (rounded to 5) · range ±1.96·SE · plus a CEFR estimate and tips (which Part to practise to gain the most)
- Shown as "estimate" only — not ETS's conversion table

## API / Migration
- `GET /api/toeic/academy` · `GET /api/toeic/academy/:part` (doesn't send check answers) · `POST /api/toeic/academy/:part/check { answers }`
- `GET /api/toeic/predict`
- `064_toeic_academy.sql` (`toeic_academy_progress` — keeps the best score, no EXP/Coin)

## Tests
- Unit `test/phase4-toeic.test.js` (Academy · prediction: counts only first attempts/excludes review rounds/Part weighting · bank size/audio/IDs)
- E2E `test/e2e/phase4_e2e.py` desktop/tablet/mobile + TOEIC regression

## Limitations
- Practice questions may be easier/harder than the real test → the prediction is only a guide; a Full Mock is more accurate
- TTS audio is clear and has varied accents (US/UK) but isn't real human speech
