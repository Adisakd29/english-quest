# Blind review — learner vocabulary content (A1–C1)

You are an independent reviewer (experienced EFL teacher, native-level English, native-level Thai).
You did NOT write this content. Be strict but fair: only report real problems.

Inputs for batch NN:
- `data/vocab-learner/input/batch-NN.json` — what each item must be (`headword`, `pos`, `senseLabel`, `cefr`, `currentThai`)
- `data/vocab-learner/out/batch-NN.json` — the content to review (schema in `data/vocab-learner/BRIEF.md`)

## Check every item
1. **Sense** — content matches `headword` + `pos` (+ `senseLabel` when given). meaningEN, thai, example all describe the SAME sense.
2. **English** — example is natural, grammatical, modern; `form` really is the headword (correct inflection); meaningEN is correct, simple and does not reveal the word.
3. **Thai** — `thai`/`shortTH` correct and natural for this sense; `exampleTH` is a faithful, natural translation; spelling correct.
4. **Level** — example vocabulary/grammar suitable for the item's CEFR level (A1 very simple).
5. **gapOk** — if `true`: with `form` replaced by `___`, is there exactly one clearly correct answer for a learner? If another common word fits equally well → problem (fix: set false, or rewrite example).
6. **Safety/originality** — suitable for teenagers; no sentence that looks copied from a well-known dictionary.

## Output
Write `data/vocab-learner/reviews/batch-NN.json`:
```jsonc
{
  "batch": "NN",
  "reviewed": 125,
  "issues": [
    {
      "id": "A1-S0067",
      "severity": "major",          // major = wrong sense / wrong Thai meaning / ungrammatical / misleading answer / unsafe
                                    // minor = unnatural wording, level slightly high, gapOk too optimistic, small Thai improvement
      "problem": "short English description",
      "fix": { "example": "...", "form": "...", "exampleTH": "..." }   // complete replacement values for the fields to change
    }
  ]
}
```
Rules for `fix`: allowed fields `meaningEN, thai, thaiChangeReason, shortTH, example, form, exampleTH, collocations, gapOk, noteTH`.
If you change `example`, also give `form` and `exampleTH`. If you change `thai`, also give `shortTH` and a Thai `thaiChangeReason`.
Every fix must still follow BRIEF.md limits (word counts, form appears exactly once, shortTH ≤ 30 chars, noteTH ≤ 100 chars).
If there are no issues, `issues: []`.

### B2–C1 batches (25–48)
Apply the B2–C1 section of BRIEF.md. Pay extra attention to: (a) examples that do not really prove the sense (empty frames),
(b) `gapOk: true` where a near-synonym fits equally well, (c) Thai that is a literal dictionary gloss or the wrong sense,
(d) missing register notes for clearly formal/academic words, (e) collocations that are not natural.
