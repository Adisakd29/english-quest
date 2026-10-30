# v1.10.0 · Phase 3 — Learning tools without paid AI

Date: 2026-10-28. **Decision: the app does not use any AI that charges per token.** Phase 3 (originally AI Speaking, AI Writing and AI Tutor) is built from language rules, the app's own content, and capabilities the browser already provides. No external services are called, so there are no token costs.

## What was built

| Feature | How it works (no AI) | Privacy | Access |
|---|---|---|---|
| **Speaking** (improved) | The browser converts speech to text (Web Speech API) → sends **only the text** to the server → the server scores word by word itself, using the same scorer the web page uses (`public/js/speak-score.js`). Previously the server accepted the score sent by the web page | EnglishQuest never receives audio · text is used to compute the score, then discarded (not stored, not logged) · the consent screen discloses that the browser may send audio to Google/Apple | Everyone |
| **Writing Studio** `#/write` | Free writing or a chosen prompt (14 prompts A1–C1) → checks: grammar rules for common Thai learner mistakes (~20 rules + new rule: past-time word but present-tense verb) · CEFR vocab level from the app's 5,900-word bank · linking words by level · repeated words · overused basic words with alternatives (15 words) · target words to practise · advice in Thai | **Text is not stored** — only stats (word count, errors, level) in `writing_studio_logs` · drafts are kept in the user's browser | Everyone |
| **Answer helper** `#/help` | Searches 16 frequently asked questions (written for Thai learners), 74 CEFR grammar topics (summary, usage, terms, common mistakes, comparison tables), and the vocab bank English→Thai / Thai→English | Questions are not stored or logged | Everyone |

## API
- `POST /api/speak/attempt { itemId, heard: [1–8 texts, ≤ 300 characters] }` → score from the server (`score` alone is rejected with `SEND_HEARD` — tells old pages to refresh)
- `GET /api/studio/writing` · `POST /api/studio/writing/check { text ≤ 3000, promptId?, targets? }` (20/minute)
- `GET /api/studio/help?q=` (60/minute)

## Migration
`063_writing_studio.sql` (+ `_down`) — stats table only, no text column

## Honest limitations
- Writing Studio catches only patterns covered by its rules; it is not a teacher-level check. "Vocab level" is the level of the words used, not the level of the writing overall. Words outside the bank (very advanced words / proper nouns / misspellings) are shown separately
- The helper answers only from content in the app. A question that matches no keyword gets suggested questions to try instead
- Speaking scores "how many words the browser understood", not phoneme analysis. The text still comes from the user's device (much harder to fake than sending a raw score, but not impossible), so rewards stay low with a daily cap as before
- Speech recognition works well in Chrome/Edge; it may not work in some browsers → falls back to listen-and-type

## Tests
- Unit: `test/phase3-studio.test.js` (3) + updated `test/speaking.test.js` — full suite passing
- E2E: `test/e2e/phase3_e2e.py` (desktop 1280 · tablet 820 · mobile 390) + updated `test/e2e/speak_e2e.py` — pass · also checked that no AI services are called
