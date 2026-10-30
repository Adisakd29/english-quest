# v1.10.0 · Phase 1 — Audit & Premium Foundation

This document covers the codebase audit, what was fixed, the Premium foundation, and the plan for Phases 2–5.
Date: 2026-10-28.

---

## 1. Audit results (status before Phase 1)

### 1.1 Overview table

| Status | Area | Details |
|---|---|---|
| ✅ Works well | TOEIC Part 1–7, Full Mock, weakness analysis, daily plan | ~900 questions, with explanations, timing and weakness analysis. Unit tests and E2E tests pass |
| ✅ Works well | C2 vocab | Has the full lesson structure: learn → practice → guess from context → review |
| ✅ Works well | Payments (PromptPay + SlipOK + admin review) | Checks amount to the satang, transaction time, receiver account and slip reuse |
| ✅ Works well | English for Work | 72 phrases, blind review scored 144/144 |
| 🔧 Fixed in this phase | Vocab grading | **The server trusted the `known` value sent by the client** → it now grades from the answer only (the old payload returns 400) |
| 🔧 Fixed in this phase | "Known" word status | A single correct answer used to make a word "known" → now split into **passed** (passed the lesson) and **mastered** (reviewed successfully on schedule). Words already known are never demoted |
| 🔧 Fixed in this phase | Review | The review menu had been removed, leaving no way to do SRS reviews → `#/review` and the dashboard now open words due for review |
| 🔧 Fixed in this phase | Security | Client IP was read from `X-Forwarded-For` directly (spoofable) → now uses `req.ip` (trust proxy) · no CSP/HSTS · `register`/`progress`/`grammar` etc. had no rate limit · EXP was updated read-then-write (lost updates under race) · mailer built links from the Host header in production · migrations had no lock (could run concurrently when scaled) |
| 🔧 Fixed in this phase | Premium | No status (trial/canceled), no revoke, no admin audit log, no clear Free/Premium comparison |
| 🔧 Fixed in this phase (found during testing) | Deep links | When the page first loaded, `#/premium`, `#/work`, `#/toeic-*` sometimes showed a **blank page** because app.js routed before the other modules had loaded |
| ⚠️ Needs fixing (not yet done) | Speaking score | Pronunciation scores are sent by the client (self-reported) → the dashboard labels them "self-assessed" and they are not used for ranking |
| ⚠️ Needs fixing | WebSocket | The token is sent in the query string (can end up in logs) |
| ⚠️ Needs fixing | CORS | Open to every origin (but authentication uses a Bearer token, not a cookie, so the risk is low) |
| ⚠️ Needs fixing | Vocab questions | No server-issued opaque question token yet → planned together with the Phase 2 lesson redesign |
| ⚠️ Needs fixing | UX | The learning path looks like a spreadsheet · page styles are inconsistent · the home page is cluttered · the leaderboard shows 22 users tied at #1 and includes test accounts · the profile page has too many things packed in · notifications sometimes keep loading |
| 📉 Content insufficient | Vocab A1–C1 | Grouped by WordNet topic rather than CEFR can-do statements · one exercise type · Thai translations are AI_GENERATED · ~15–20% of definition/example pairs don't match the sense · example sentences have no Thai translation · no collocations |
| 📉 Content insufficient | Placement test | Only 31 questions → CEFR estimates have wide error |
| 📉 Content insufficient | Grammar | Two systems side by side (16 old chapters + 74 CEFR topics) |
| 📉 Content insufficient | TOEIC | ~900 questions · Part 3 and Part 7 still thin |
| 📉 Content insufficient | English for Work | 72 phrases (6 situations × 12) |
| ❌ Missing | Graded Reading / Listening | Nothing outside TOEIC |
| ❌ Missing | AI Speaking / Writing / Tutor | No provider yet (foundation prepared: quota + config) |
| ❌ Missing | Full curriculum (A1–C2 units) | Target of ~270 lessons not started |

### 1.2 Fix priority

1. **Data correctness / security** (done in Phase 1): server-side vocab grading, atomic EXP, real IP, rate limits, CSP/HSTS, migration lock
2. **Premium foundation** (done in Phase 1): status, trial, admin grant/revoke, audit log, AI quota, dashboard
3. **Core curriculum** (Phase 2): restructure vocab/grammar by CEFR + several exercise types + check content accuracy
4. **AI** (Phase 3, once a provider is chosen)
5. **TOEIC Academy / full curriculum / UX redesign** (Phases 4–5)

---

## 2. Premium foundation

### 2.1 Membership states (computed on the server only)

| state | Meaning | Access |
|---|---|---|
| `free` | Never been a member | Free |
| `trial` | Trial (7 days, once per account) | Premium (except the Premium badge on the leaderboard) |
| `active` | Paid / granted by admin | Premium |
| `past_due` | Expired within the last 3 days (grace) | **Free** (shows a renew prompt) |
| `expired` | Expired more than 3 days ago | Free |
| `canceled` | Revoked by admin | Free |

- Every access check (`isPremium`) runs on the backend from the token; it does not trust a client userId
- Subscribing during the trial: the new period **continues from the trial end date** (remaining days are kept)
- Trial: no card required, no charge; when it ends the account returns to Free automatically. Starting it again → 409

### 2.2 Admin (Admin page → Premium membership)
- **Members** tab: search by username/email · grant N days (stacks) · revoke (reason required) · every action records the actor
- **History** tab: audit log (start trial / approve / reject / grant / revoke / automatic slip approval)

### 2.3 Learning dashboard (`GET /api/membership/dashboard`)
- **6 skills**: vocab · grammar · listening · reading · speaking · writing
  - Scores come from real answers (answer_events + grammar_attempts) over 30 days, smoothed with prior 0.6 × weight 10 so a few questions don't swing them too far
  - Under 8 questions → "not enough data" (no misleading score)
  - Speaking = self-assessed (marked)
- **EXP / score / CEFR are kept separate**: EXP = activity volume · score = accuracy · CEFR = from the placement test / TOEIC Full Mock only
- 14-day chart · review queue (due words + weak skills) with a button to start immediately · recommendations
- Free users see only skill names with a "locked" banner (no scores) → **Guest Preview**

### 2.4 Free vs Premium comparison (no pay-to-win)
- Premium **does not** get extra ranked points/EXP, coins, or items that give a competitive edge
- The streak freeze (2/month) only affects the TOEIC streak count, not the leaderboard
- The "Coming soon" section is a separate collapsible box marked "not included in the plan yet"

### 2.5 AI (foundation only — no AI feature is live yet)
- `config/ai.js`: `AI_PROVIDER` (anthropic | openai | google) + `AI_API_KEY` — if not set = all AI features off
- Daily quota (Thai time): Free 0 · Trial speaking 3 / writing 3 / tutor 5 · Premium 20 / 10 / 30
- `services/aiQuota.js`: `consume()` is an atomic upsert `WHERE used < limit` → can't go over quota even with parallel requests

### 2.6 Personal data protection for AI (rules to follow when AI is implemented in Phase 3)
1. Send **only what's needed for checking**: the user's text/audio + the exercise. **Never send** email, phone, real name, location or user ID
2. Audio: process and discard immediately — **don't store audio files** on the server unless the user explicitly consents; keep only the score/feedback text
3. Tell the user before first use that their content is sent to an outside provider (name the provider), with an option to decline
4. Choose an API plan where the provider does not use the data for training
5. AI-generated content (example sentences/lessons) **must be checked by a person or validator before publishing**, the same as the English for Work pipeline
6. Logs: record only usage counts (ai_usage), not the content

---

## 3. Security changes

| Item | Before | After |
|---|---|---|
| Client IP | read `X-Forwarded-For` directly | `req.ip` (Express trust proxy) |
| CSP | none | `Content-Security-Policy-Report-Only` (default) · `CSP_MODE=enforce` to enforce · inline theme script allowed via hash |
| HSTS | none | in production |
| Registration | no limit | 20/hour/IP (`REGISTER_LIMIT_PER_HOUR`) · loopback exempt |
| progress/grammar/leaderboard/vocab/assessments | no limit | 240/minute/IP |
| Vocab card EXP | no cap | 600/day (`CARD_EXP_DAILY_CAP`) → `noExpReason: 'daily_cap'` |
| EXP update | read → compute → write | `exp = exp + $1` + `FOR UPDATE` |
| Migration | no lock | `pg_advisory_lock` |
| Email links | could fall back to the Host header | production uses `APP_URL` or `RAILWAY_PUBLIC_DOMAIN` |

**Tested:** the browser recorded no CSP violations on the login page or 14 main pages (Report-Only mode). Once Production has been checked for 1–2 days → set `CSP_MODE=enforce`.

---

## 4. Migration

`060_premium_foundation.sql` (+ `060_premium_foundation_down.sql`)
- Only adds columns/tables: `memberships.status/canceled_at/cancel_reason`, `membership_trials`, `audit_logs`, `ai_usage`
- All existing members = `active` (expiry dates unchanged) · **no deletion of any user data**

## 5. New env vars (all optional — defaults work)

| Variable | Default | Purpose |
|---|---|---|
| `PREMIUM_TRIAL_DAYS` | 7 | Trial length (0 = turn trial off) |
| `CSP_MODE` | enforce (since Phase 5; was report) | report / enforce / off |
| `CARD_EXP_DAILY_CAP` | 600 | Daily vocab card EXP cap |
| `REGISTER_LIMIT_PER_HOUR` | 20 | Registrations/hour/IP |
| `AI_PROVIDER`, `AI_API_KEY` | (none) | Turn on AI in Phase 3 |

## 6. Tests
- Unit: `test/premium-phase1.test.js` (states/trial/stacking, grant/revoke/audit, AI quota atomic, dashboard Free vs Premium, audit fixes) — whole suite 405/405
- E2E: `test/e2e/premium_phase1_e2e.py` — desktop 1280 · tablet 820 · mobile 390: comparison table → start trial → dashboard → start review of due words → admin search/grant/audit log · no horizontal scroll · buttons ≥ 44px · no JS errors
- Regression E2E: premium (payment), work, lesson (390/1280), c2, login, toeic, toeicdaily, toeicweak, toeicfull, speak, festival — all pass

## 7. Next Phases
- **Phase 2 — Core curriculum**: restructure vocab A1–C1 by CEFR can-do + 4–5 exercise types (meaning, usage in context, listening, spelling, collocation) · fix definition/example pairs that don't match the sense · add Thai translations for example sentences · merge the two grammar systems · expand the placement test (31 → 60+ questions, adaptive) · server-issued vocab question tokens
- **Phase 3 — AI** (once a provider is chosen): Speaking Arena (pronunciation scored on the server instead of self-reported) · Writing Studio · Tutor — following the privacy rules in 2.6
- **Phase 4 — TOEIC Academy**: add Part 3/7 · strategy lessons per Part · score prediction
- **Phase 5 — Full curriculum + UX**: Graded Reading/Listening · redesign path/home/profile/leaderboard (filter test accounts, handle ties) · enable CSP enforce · move the WS token out of the query string
