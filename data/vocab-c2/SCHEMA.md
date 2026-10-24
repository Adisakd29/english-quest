# C2 Vocabulary Bank — authoring schema (sense-based)

Each file `batch-*.json` is a JSON **array** of sense objects. One object = ONE meaning (sense) of ONE lemma/expression.
The same lemma may appear more than once only if the senses are genuinely different.

C2 here means **lexical precision, nuance and real-world advanced usage** — NOT rare/archaic words.
Every item must be something an educated English user really meets (news, books, essays, university, workplace,
podcasts, interviews, conversation). If it is rare, literary or specialist → `tier: "extended"` and `realWorldPriority` ≤ 2.

## Fields (all required unless marked optional)

```jsonc
{
  "key": "ubiquitous|adjective|everywhere",   // lemma|pos|senseTag  — unique, lowercase
  "lemma": "ubiquitous",                       // dictionary form (for idioms/phrases: the whole expression)
  "displayForm": "ubiquitous",                 // how it is shown (e.g. "foot the bill", "cut someone some slack")
  "pos": "adjective",                          // noun | verb | adjective | adverb | phrasal verb | idiom | collocation | fixed expression | discourse marker
  "kind": "word",                              // word (advanced word) | sense (advanced meaning of a familiar word) | collocation | phrasal | idiom | fixed | colloquial
  "senseTag": "everywhere",                    // 1–3 English words naming this sense
  "baseLemma": null,                           // for kind="sense": the familiar headword (e.g. "table"); else null
  "baseMeaningTH": null,                       // for kind="sense": Thai of the BASIC everyday meaning (used as a tricky distractor), else null
  "meaningEN": "seeming to be everywhere at the same time",   // clear learner definition in your own words
  "meaningTH": "มีอยู่ทั่วไปทุกหนแห่ง / พบเห็นได้ทุกที่",            // natural Thai, not word-for-word; explain if no single Thai word fits
  "shortMeaningTH": "มีอยู่ทุกที่",                               // ≤ 30 characters — used in answer choices
  "usageNoteTH": "ใช้กับสิ่งที่แพร่หลายมากจนแทบเป็นเรื่องปกติ เช่น smartphones; ภาษาค่อนข้างทางการ/งานเขียน",
  "register": "formal",                        // formal | neutral | informal | academic | professional | literary
  "connotation": "neutral",                    // positive | neutral | negative | approving | disapproving | humorous | critical
  "frequencyBand": 4,                          // 1 (rare) .. 5 (very frequent in advanced English)
  "realWorldPriority": 5,                      // 5 very common/useful · 4 frequently useful · 3 useful in some contexts · 2 uncommon · 1 rare/specialist/literary
  "tier": "core",                              // core (priority 3–5) | extended (priority 1–2, or rare/literary/archaic tags)
  "difficulty": 3,                             // 1..5 within C2
  "ipaUK": "/juːˈbɪkwɪtəs/", "ipaUS": "/juːˈbɪkwətəs/",   // standard IPA; for multi-word expressions give the key word or the whole phrase
  "variant": "both",                           // both | UK | US   (spelling/usage differences go in usageNoteTH)
  "example": "Smartphones have become ubiquitous in modern classrooms.",  // natural, modern, shows THIS sense
  "exampleTH": "สมาร์ตโฟนกลายเป็นสิ่งที่พบได้ทั่วไปในห้องเรียนยุคใหม่",
  "collocations": ["become ubiquitous", "almost ubiquitous", "the ubiquitous smartphone"],   // ≥ 2, real collocations
  "synonyms": ["omnipresent", "pervasive"],
  "nearSynonyms": [ { "word": "common", "differenceTH": "common แค่ 'พบบ่อย' ส่วน ubiquitous เน้นว่ามีอยู่ทุกที่จนเลี่ยงไม่ได้" } ],  // ≥ 1
  "antonyms": ["rare", "scarce"],              // [] if none
  "wordFamily": [ { "form": "ubiquity", "pos": "noun" }, { "form": "ubiquitously", "pos": "adverb" } ],   // [] if none
  "commonMistakes": [ { "wrong": "Smartphones are ubiquitous everywhere.", "right": "Smartphones are ubiquitous.", "whyTH": "ubiquitous มีความหมายว่า 'ทุกที่' อยู่แล้ว ใส่ everywhere ซ้ำซ้อน" } ],   // ≥ 1
  "confusedWith": ["iniquitous"],             // [] if none
  "topics": ["technology", "society"],        // 1–3 from the topic list below
  "tags": [],                                  // optional extra: rare | literary | archaic | specialist | figurative | business | academic | UK | US
  "context": {                                 // Guess-from-Context paragraph: 2–3 natural sentences, target wrapped in [[ ]] exactly once
    "text": "Twenty years ago, few people owned a mobile phone. Today they are [[ubiquitous]]: you see them on every bus, in every café and in every classroom.",
    "cluesTH": "ประโยคหลังบอกว่า 'เห็นได้บนรถทุกคัน ทุกร้าน ทุกห้องเรียน' = มีอยู่ทุกที่"
  },
  // idioms / fixed / colloquial only (optional otherwise):
  "literalTH": null,                           // literal meaning (idioms)
  "naturalTH": null,                           // a situation where it sounds natural
  "unnaturalTH": null,                         // a situation where it sounds unnatural/wrong
  "separable": null,                           // phrasal verbs: true | false ; else null

  "q": {
    "collocation": {                           // Choose the natural collocation. ONE answer only.
      "sentence": "Electric scooters have become almost ___ in big cities.",
      "answer": "ubiquitous",
      "distractors": ["omnivorous", "unanimous", "ambiguous"],   // 3, plausible-looking but clearly wrong here
      "whyTH": "almost ubiquitous = แทบจะมีอยู่ทุกที่ ส่วน unanimous ใช้กับความเห็นที่ตรงกัน ..."
    },
    "nearSyn": {                               // Which word fits BEST in this context? Distractors must be clearly worse because of collocation, register, connotation or strength
      "sentence": "Advertising is so ___ online that most people no longer notice it.",
      "answer": "pervasive",                   // may be the target or (if better) a form of it; must be the single best answer
      "distractors": [
        { "word": "frequent", "whyNotTH": "frequent ใช้กับสิ่งที่เกิดบ่อย (frequent visits) ไม่ใช้บรรยายสิ่งที่แทรกซึมอยู่ทั่ว" },
        { "word": "abundant", "whyNotTH": "abundant = มีมาก (ทรัพยากร) ไม่ได้สื่อว่าแทรกอยู่ทุกที่จนไม่สังเกต" },
        { "word": "popular", "whyNotTH": "popular = เป็นที่นิยม ความหมายต่างจากบริบท" }
      ]
    },
    "formation": null,                         // optional Word Formation: { "sentence": "The ___ of smartphones has changed how we read.", "root": "ubiquitous", "answer": "ubiquity", "accepted": ["ubiquity"], "options": ["ubiquity","ubiquitous","ubiquitously","ubiquitize"] }
    "register": null                           // optional Register: { "situationTH": "อีเมลถึงหัวหน้า", "question": "Which sentence is most appropriate?", "answer": "...", "distractors": [ { "text": "...", "whyNotTH": "..." } x3 ] }
  },
  "sourceType": "editorial",                   // editorial (original content written for EnglishQuest)
  "sourceReference": "CEFR C2 descriptors; not in Oxford 3000/5000 A1–C1 list",   // why it is C2
  "verificationStatus": "unverified"           // authors ALWAYS write "unverified"; the validator promotes to autoChecked
}
```

## Topics (use only these ids)
society, education, technology, science, environment, economics, business, culture, psychology, media,
communication, law, workplace, academic, relationships, arts, literature, current-affairs, argumentation,
analysis, opinion, cause-effect, evaluation, everyday

## Quality rules (read carefully)
1. Real-world usage first. No archaic/obsolete words, no showing off. If in doubt → lower priority / extended.
2. Every question must have EXACTLY ONE correct answer for a competent native speaker. Add context until the
   alternatives are clearly worse. Never use a distractor that is also correct.
3. Distractors must be plausible (near synonyms, common confusions, wrong collocations, wrong register) —
   never random words that can be eliminated instantly.
4. Thai: natural, explanatory; if no single Thai word fits, explain. No literal word-for-word translation.
5. Examples: natural, modern, grammatical, clearly showing THIS sense (not a different sense of the same word).
6. Context paragraph: the meaning must be guessable from clues in the text; `cluesTH` points to them.
7. For kind="sense": the question material must test the ADVANCED meaning, not the basic one.
8. Collocations must be genuine and common. Phrasal verbs: state `separable`.
9. Idioms: only ones still in common use; fill literalTH / naturalTH / unnaturalTH.
10. Do not copy text from copyrighted dictionaries; write definitions and examples yourself.
