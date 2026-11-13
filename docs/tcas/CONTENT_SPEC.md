# EnglishQuest — TCAS English (TGAT1 / A-Level) content spec · v1.19.0

Original practice sets in the **format** of the Thai TCAS70 exams (blueprints published at mytcas.com).
**Never copy** real exam items, past papers, prep-book or website questions. Every passage, dialogue, name, brand,
company, product and statistic is invented. News items are clearly fictional (invented towns/organisations, no real
living people, no real current events). No alcohol, gambling, violence, politics, religion-specific rituals,
dating/romance, medical claims, or content unsuitable for 16–18-year-old Thai students.

## File layout
`data/tcas/<exam>/<SETID>.json` — one set per file. `exam` = `tgat1` | `alevel`. Set ids: `TG1-S1`, `TG1-S2`, `TG1-S3`, `AL-S1`, `AL-S2`, `AL-S3`. Level 1 = S1, S2 · level 2 (challenge) = S3 · level 3 (intensive, near C1) = S4.

```jsonc
{
  "exam": "tgat1",                       // tgat1 | alevel
  "setId": "TG1-S1",
  "title": "TGAT1 ชุดฝึกที่ 1",
  "version": 1,
  "original": true,                       // always true
  "level": 1,                             // v1.19.2: 1 = มาตรฐาน (exam-like) · 2 = ท้าทาย (harder) · 3 = เข้มข้น (near C1)
  "sections": [
    {
      "id": "speaking",                   // see blueprint below
      "groups": [
        {
          "id": "TG1-S1-G01",             // <SETID>-G<2 digits>, unique, sequential in the file
          "type": "short_conv",           // see blueprint below
          "instructionTh": "อ่านบทสนทนา แล้วเลือกคำตอบที่เหมาะสมที่สุดเติมในช่องว่าง",
          "title": "At the school library",   // optional short English title
          "dialogue": [                       // for *_conv types (and qr)
            { "speaker": "Mint", "text": "Hi, I'd like to borrow this book. ___1___" },
            { "speaker": "Librarian", "text": "Sure. Can I see your student card?" }
          ],
          "text": "…",                        // for passage types (text_completion, reading, ad, review, news, article)
          "table": { "caption": "…", "columns": ["…"], "rows": [["…"]] },  // for visual only (plus optional "text")
          "items": [
            {
              "id": "TG1-S1-001",         // <SETID>-<3 digits>, unique, sequential through the whole set
              "blank": 1,                 // when the item fills ___1___ in the dialogue/text (omit otherwise)
              "stem": "",                 // question text; "" allowed for pure blank-filling items
              "options": ["…", "…", "…", "…"],
              "answer": 2,                // 0-based index of the ONE correct option
              "skill": "functional_language",
              "explanationTh": "คำอธิบายภาษาไทย 1–3 ประโยค ว่าทำไมข้อนี้ถูก และตัวลวงผิดเพราะอะไร"
            }
          ]
        }
      ]
    }
  ]
}
```

Blanks: write `___N___` (three underscores, the blank number, three underscores) inside `dialogue[].text` or `text`.
Blank numbers are global within a group, start at 1, and each appears exactly once. Every blank has exactly one item.

## Blueprint (counts are exact — the validator enforces them)

### TGAT1 การสื่อสารภาษาอังกฤษ — 60 items, 60 min, 100 pts (CEFR ~B1–B2)
| section `id` | group `type` | groups × items |
|---|---|---|
| `speaking` | `qr` (Q-R, v1.19.2 format: each group is exactly `dialogue: [{"speaker":"Q","text":"<3–18 words>"},{"speaker":"R","text":"___1___"}]`, one item, options ≤ 12 words) | 10 groups × 1 = 10 |
| `speaking` | `short_conv` (4–8 lines) | 3 groups: 3 + 3 + 4 = 10 |
| `speaking` | `long_conv` (10–16 lines) | 2 groups × 5 = 10 |
| `reading` | `text_completion` (passage 120–220 words, blanks test vocabulary/grammar/connectors) | 2 groups: 8 + 7 = 15 |
| `reading` | `reading` (passage 100–200 words + comprehension stems) | 3 groups × 5 = 15 |

Order: all `speaking` groups (qr, then short_conv, then long_conv), then `reading` (text_completion, then reading).

### A-Level ภาษาอังกฤษ — 80 items, 90 min, 100 pts (CEFR ~B2–C1)
| section `id` | group `type` | groups × items |
|---|---|---|
| `listening_speaking` | `short_conv` (6–10 lines, blanks) | 3 groups × 4 = 12 |
| `listening_speaking` | `long_conv` (16–24 lines, blanks) | 1 group × 8 = 8 |
| `reading` | `ad` (advertisement / notice, 80–180 words) | 2 groups × 4 = 8 |
| `reading` | `review` (product/service review, 150–280 words) | 1 group × 5 = 5 |
| `reading` | `news` (fictional news report, 200–320 words) | 1 group × 5 = 5 |
| `reading` | `visual` (a `table` + short `text`, items need reading the numbers) | 2 groups × 4 = 8 |
| `reading` | `article` (general article **500–600 words**) | 2 groups × 7 = 14 |
| `writing` | `text_completion` (passage 150–260 words, blanks) | 3 groups × 5 = 15 |
| `writing` | `paragraph_org` (each item is ONE group: 4–5 sentences labelled A–E in `text`, options are orders like "B – D – A – C") | 5 groups × 1 = 5 |

## Item quality rules
- Exactly one defensible correct answer. Distractors are plausible for a Thai learner but clearly wrong for a careful one.
- No "all of the above / none of the above". Options of similar length/form. No options that are duplicates or near-duplicates.
- Answer positions balanced across the set (each of A–D roughly 20–30%; never 4+ identical answers in a row).
- Reading stems mix: main idea, detail, inference, vocabulary-in-context, reference ("What does 'it' refer to…"), purpose/tone. Visual items require reading the table (compare, compute simple difference, find max/min).
- `skill` one of: `functional_language`, `social_response`, `vocabulary`, `grammar`, `connector`, `main_idea`, `detail`, `inference`, `vocab_in_context`, `reference`, `purpose_tone`, `data_reading`, `coherence`.
- `explanationTh`: natural Thai, 1–3 sentences, explains the key clue; may quote the English evidence briefly.
- Thai student context is welcome (school, Bangkok/Chiang Mai, festivals except fireworks/lanterns/alcohol, food, part-time jobs, university applications) mixed with international settings.

Run `node scripts/tcas/validate.js data/tcas/<exam>/<SETID>.json` — it must print `OK`.
