# Word Atlas — แหล่งข้อมูล ขั้นตอนนำเข้า และการขยายคลัง

## Pipeline
```
Wiktionary (kaikki.org JSONL, CC BY-SA)  ─┐
Thai Wiktionary entries (kaikki Thai)     ├─ scripts/word-atlas/filter_kaikki.py   (Normalize: เก็บเฉพาะฟิลด์ที่ใช้)
wordfreq (ความถี่)                         │
Oxford ในโปรเจกต์ (export vocab_senses)   ─┘
        ↓ scripts/word-atlas/build_dataset.py
   Validate → Deduplicate → Merge with Oxford → Verify Definitions/Examples → Thai candidates
        ↓ --emit-review   (รายการคำแปลไทยที่ต้องตรวจ)
   Verify Thai Translations: ผู้ตรวจเลือกเฉพาะจากตัวเลือกที่มีใน Wiktionary → data/word-atlas/review/*.jsonl
        ↓ --review-dir data/word-atlas/review   (Assign Metadata · Pilot cap)
   data/word-atlas/atlas-YYYY-MM.jsonl.gz
        ↓ services/wordAtlas/seed.js  (Publish: ตอนเปิดเซิร์ฟเวอร์ / node scripts/word-atlas/seed.js)
   atlas_lemmas · atlas_senses · atlas_units (Validator ซ้ำอีกชั้น — ไม่ผ่าน = ไม่ใช้ทำแบบฝึก)
```

## สร้างชุดข้อมูลใหม่
```bash
curl -s https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl | python3 -I scripts/word-atlas/filter_kaikki.py > en.jsonl
curl -s -o th.jsonl https://kaikki.org/dictionary/Thai/kaikki.org-dictionary-Thai.jsonl
psql "$DATABASE_URL" -Atc "select row_to_json(t) from (select s.public_id, e.headword, e.normalized, s.pos, s.cefr, s.thai_meaning, s.topic, s.display_form, s.kind from vocab_senses s join vocab_entries e on e.id=s.entry_id where s.public_id is not null and not s.is_supplemental and (s.cefr<>'C2' or s.verification_status in ('autoChecked','reviewed'))) t" > oxford.jsonl
pip install wordfreq pythainlp
python3 scripts/word-atlas/build_dataset.py --en en.jsonl --th th.jsonl --oxford oxford.jsonl --out /tmp/x.gz --emit-review review_items.jsonl
#   ตรวจ review_items.jsonl → เขียนผลเป็น data/word-atlas/review/<ชุด>.jsonl  ({"id","verdict":"ok|reject","thai":[...]} )
python3 scripts/word-atlas/build_dataset.py --en en.jsonl --th th.jsonl --oxford oxford.jsonl --review-dir data/word-atlas/review \
  --out data/word-atlas/atlas-YYYY-MM.jsonl.gz --lemmas 20000 --pilot 2000 --report data/word-atlas/build-report.json
```
- ใช้ชื่อไฟล์ใหม่ (เช่น `atlas-2027-01.jsonl.gz`) — ตัวนำเข้าเลือกไฟล์ล่าสุดตามชื่อ · ลบไฟล์เก่าออกจาก repo ได้
- รหัสความหมาย (`WA-…`) มาจาก hash ของ (lemma|ชนิดคำ|รหัสความหมายใน Wiktionary) → สร้างใหม่ได้รหัสเดิม · Unit เดิมไม่ถูกสลับ (ของใหม่ต่อท้าย)
- ความหมายที่หายจากชุดใหม่ → `learnable = FALSE` (ไม่ลบแถว · ความคืบหน้าผู้เรียนยังอยู่)

## Phase (PART 20)
| Phase | เป้าหมาย | สถานะ |
|---|---|---|
| Pilot | 1,000–2,000 ความหมายใหม่ที่ผ่านการตรวจ | ทำแล้ว: ความหมายใหม่ 1,993 + Oxford/C2 เดิม 6,738 = เรียนได้ 8,731 |
| 2 | ~10,000–20,000 | คำแปลที่ผ่านการตรวจแล้วรอเปิด (`phase2_pending`) · ต้องตรวจคำแปลเพิ่ม |
| 3–4 | 50,000+ ต่อเนื่อง | ขยาย `--lemmas`/รอบตรวจ |

คลังตอนนี้มี 24,431 คำ 79,069 ความหมาย — **ไม่ใช่คำศัพท์ภาษาอังกฤษทั้งหมด** · ความหมายที่ยังไม่ผ่านการตรวจแสดงเฉพาะนิยามอังกฤษ (ไม่แสดงคำแปลไทยที่ยังไม่ตรวจ) และไม่ใช้ทำแบบฝึกที่ให้คะแนน

## สถานะการตรวจ
- `autoChecked` = ผ่าน Validator อัตโนมัติ + การตรวจคำแปลไทยรอบคัดเลือก (ทำโดย AI ระหว่างสร้างชุดข้อมูล ไม่ใช่คน · เลือกได้เฉพาะคำแปลที่มีใน Wiktionary)
- `reviewed` = ผู้ดูแล/ครูตรวจแล้ว (ยังไม่มีในชุดแรก)
- `unverified` = ยังไม่ผ่าน → แสดงเฉพาะข้อมูลภาษาอังกฤษ
- สุ่มตรวจด้วยตา 60 รายการหลังรอบคัดเลือก: ผิดชัดเจน ~2–3 รายการ (ประมาณ 95% ถูก) — **ควรให้ครูทวนก่อนประกาศใหญ่**
