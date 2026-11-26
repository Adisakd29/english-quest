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

### ก.พ. ภาค ก วิชาภาษาอังกฤษ (`exam: "kp"`, v1.22.0) — 25 items, 50 min (practice), 50 pts (2 per item), pass ≥ 25
Files: `data/tcas/kp/KP-S<n>.json` · setId `KP-S<n>`. Structure follows public descriptions of the ก.พ. English paper (Conversation 5 · Structure 5 · Vocabulary 5 · Reading 10 in 2 passages; English pass mark 50%). Always re-check the latest ก.พ. announcement before claiming the format is current.
| section `id` | group `type` | groups × items |
|---|---|---|
| `conversation` | `kp_conv` (2–6 lines, one `___1___` blank, item `blank: 1`) | 5 groups × 1 = 5 |
| `structure` | `kp_structure` (**no** text/dialogue; each stem is a sentence ≥ 5 words containing a `____` blank — 4+ underscores, not the numbered `___1___`) | 1 group × 5 = 5 |
| `vocabulary` | `kp_vocab` (no text/dialogue; stem ≥ 5 words — sentence with `____` or "closest in meaning") | 1 group × 5 = 5 |
| `reading` | `kp_reading` (notice / letter / job ad / news / short article, 140–300 words) | 2 groups × 5 = 10 |

Contexts: government offices, public services, job applications, official notices — all agencies, places and people fictional. Section points: 10 / 10 / 10 / 20. Server stores `score` as a percentage like TCAS and adds `result.scaled = { scale: 50, points, passScore: 25, pass }`.

### v1.28.0 — new exams (validator enforces counts; run it until `OK`)
General: `"original": true`, invented names/organisations/brands/statistics, never copy past papers or prep books. `level`: S1–S2 = 1 (exam-like), S3 = 2 (challenge), S4 = 3 (intensive). Extra skills allowed: `listening_gist`, `listening_detail`, `listening_inference`, `error_identification`, `culture`.

#### O-NET ม.6 English (`exam: "onet6"`, setId `ON6-S<n>`, files `data/tcas/onet6/`) — 80 items, **5 options (A–E)**, 90 min, 100 pts
Structure follows the 4 strands NIETS publishes for O-NET M.6 English (communication 43 · language & culture 15 · cross-curricular 11 · community & world 11). CEFR ~A2–B1+ (Thai Grade 12 core curriculum — easier than A-Level). Answers 0–4 spread 13–27% each.
| section `id` | group `type` | groups × items |
|---|---|---|
| `communication` | `on_conv` (dialogue 4–9 lines, every item fills a numbered blank `___N___` in the dialogue) | 5 groups × 3 = 15 |
| `communication` | `on_notice` (sign / notice / short message / label, 50–160 words; items ask meaning, purpose, detail) | 2 groups × 4 = 8 |
| `communication` | `on_reading` (email, blog, story, short article 150–320 words) | 4 groups × 5 = 20 |
| `culture` | `on_structure` (no text; each stem a sentence with `____` OR an "Which is correct / closest in meaning / most appropriate response" item, ≥ 5 words) | 1 group × 8 = 8 |
| `culture` | `on_culture` (passage about customs, festivals, etiquette, idioms of English-speaking and ASEAN/Thai cultures; 180–350 words) | 1 group × 7 = 7 |
| `cross_curricular` | `on_academic` (science / health / social-studies / technology passage 180–350 words) | 2 groups, 6 + 5 = 11 |
| `community_world` | `on_visual` (a `table` — timetable, survey, price list, weather — plus optional short `text`; items need the numbers) | 1 group × 5 = 5 |
| `community_world` | `on_world` (community / environment / global issue passage 180–350 words) | 1 group × 6 = 6 |

#### CU-TEP (`exam: "cutep"`, setId `CU-S<n>`, files `data/tcas/cutep/`) — 120 items, 4 options, 120 pts (3-skill paper: Listening 30 · Reading 60 · Writing/Error Identification 30)
Academic/university-life register, CEFR B1–C1, idioms and phrasal verbs common in the listening. Listening is played by text-to-speech; the student sees only the stems/options until submission, so stems must be answerable from audio alone. Put the question in `stem` (no blanks in listening scripts).
| section `id` | group `type` | groups × items |
|---|---|---|
| `listening` | `cu_short` (dialogue 2–5 lines between two speakers, e.g. `"speaker":"Man"`/`"Woman"`; 1 question such as "What does the woman mean?" — often idiomatic) | 10 groups × 1 = 10 |
| `listening` | `cu_long` (dialogue 10–20 lines; 5 questions) | 2 groups × 5 = 10 |
| `listening` | `cu_talk` (monologue: lecture / announcement / radio talk in `text`, 220–420 words; 5 questions) | 2 groups × 5 = 10 |
| `reading` | `cu_cloze` (academic passage 220–420 words with 10 numbered blanks `___1___`…`___10___`; vocabulary, grammar, connectors) | 2 groups × 10 = 20 |
| `reading` | `cu_passage` (academic passage 380–680 words; main idea, detail, inference, vocab in context, reference, tone, organisation) | 5 groups × 8 = 40 |
| `writing` | `cu_error` (no text; each stem is one sentence with exactly **4 underlined parts written `[[...]]`**; `options` = those 4 parts in order; `answer` = the part that is grammatically wrong; exactly one error) | 3 groups × 10 = 30 |

#### TU-GET paper-based (`exam: "tuget"`, setId `TU-S<n>`, files `data/tcas/tuget/`) — 100 items, 4 options, 1,000 pts (10 per item), 180 min
| section `id` | group `type` | groups × items |
|---|---|---|
| `structure` | `tu_sentence` (sentence completion: stem with `____`) | 1 group × 13 |
| `structure` | `tu_error` (error identification, same `[[...]]` format as `cu_error`) | 1 group × 12 |
| `vocabulary` | `tu_vocab` (no text; word in context — "The word X is closest in meaning to" or sentence with `____`; B2–C1 academic words) | 1 group × 25 |
| `reading` | `tu_reading` (6 passages 330–650 words: science, social science, humanities, business; 8 or 9 questions each, total 50) | 6 groups |

## Item quality rules
- Exactly one defensible correct answer. Distractors are plausible for a Thai learner but clearly wrong for a careful one.
- No "all of the above / none of the above". Options of similar length/form. No options that are duplicates or near-duplicates.
- Answer positions balanced across the set (each of A–D roughly 20–30%; never 4+ identical answers in a row).
- Reading stems mix: main idea, detail, inference, vocabulary-in-context, reference ("What does 'it' refer to…"), purpose/tone. Visual items require reading the table (compare, compute simple difference, find max/min).
- `skill` one of: `functional_language`, `social_response`, `vocabulary`, `grammar`, `connector`, `main_idea`, `detail`, `inference`, `vocab_in_context`, `reference`, `purpose_tone`, `data_reading`, `coherence`.
- `explanationTh`: natural Thai, 1–3 sentences, explains the key clue; may quote the English evidence briefly.
- Thai student context is welcome (school, Bangkok/Chiang Mai, festivals except fireworks/lanterns/alcohol, food, part-time jobs, university applications) mixed with international settings.

Run `node scripts/tcas/validate.js data/tcas/<exam>/<SETID>.json` — it must print `OK`.
