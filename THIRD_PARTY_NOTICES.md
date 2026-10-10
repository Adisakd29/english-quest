# Third-Party Notices

EnglishQuest ใช้ข้อมูลจากแหล่งภายนอกต่อไปนี้ในไฟล์ `data/word_content.json`

---

## WordNet 3.1 — ความหมาย ตัวอย่างประโยค และคำพ้องความหมาย

ใช้สำหรับ: ความหมายภาษาอังกฤษ (definition), ประโยคตัวอย่าง (example), คำพ้องความหมาย (synonyms)

```
WordNet Release 3.0

This software and database is being provided to you, the LICENSEE, by
Princeton University under the following license. By obtaining, using
and/or copying this software and database, you agree that you have
read, understood, and will comply with these terms and conditions.:

Permission to use, copy, modify and distribute this software and
database and its documentation for any purpose and without fee or
royalty is hereby granted, provided that you agree to comply with
the following copyright notice and statements, including the disclaimer,
and that the same appear on ALL copies of the software, database and
documentation, including modifications that you make for internal
use or for distribution.

WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.

THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON
UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR
IMPLIED. BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON
UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANT-
ABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE
OF THE LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT
INFRINGE ANY THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR
OTHER RIGHTS.

The name of Princeton University or Princeton may not be used in
advertising or publicity pertaining to distribution of the software
and/or database. Title to copyright in this software, database and
any associated documentation shall at all times remain with
Princeton University and LICENSEE agrees to preserve same.
```

ข้อมูลได้จาก package `wordnet-db` (MIT) ซึ่งบรรจุไฟล์ฐานข้อมูล WordNet

> ⚠️ ห้ามใช้ชื่อ "Princeton" หรือ "Princeton University" ในการโฆษณาหรือประชาสัมพันธ์

---

## CMU Pronouncing Dictionary — การออกเสียง (IPA)

ใช้สำหรับ: สัญลักษณ์การออกเสียง (IPA) สำเนียงอเมริกัน

CMU Pronouncing Dictionary สร้างโดย Carnegie Mellon University
เผยแพร่เป็นสาธารณสมบัติ (public domain)
ได้จาก package `cmu-pronouncing-dictionary` (ISC)

ข้อมูลต้นทางอยู่ในรหัส ARPAbet และถูกแปลงเป็น IPA โดย
`scripts/lib/arpabet-to-ipa.js`

---

## ข้อจำกัดของเนื้อหาที่สร้างอัตโนมัติ

เนื้อหาในตาราง `word_content` ที่มี `status = 'auto'` ถูกประกอบจากพจนานุกรมข้างต้น
**โดยอัตโนมัติ และยังไม่ผ่านการตรวจโดยมนุษย์**

- คำที่มีหลายความหมาย (เช่น bank, fry) ระบบเลือกความหมายตามลำดับความถี่ของ WordNet
  ซึ่งอาจไม่ใช่ความหมายที่ผู้เรียนควรรู้ก่อน
- ไม่มีคำแปลภาษาไทยจากแหล่งเหล่านี้ (คำแปลไทยมาจากระบบเดิม)
- เมื่อมีคนตรวจแก้แล้วควรเปลี่ยน `status` เป็น `reviewed` — การ seed ใหม่จะไม่เขียนทับ

## Lucide Icons

ไอคอนในหน้าเว็บ (`public/img/icons.svg`) มาจาก Lucide — ISC License
Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022. https://lucide.dev/license

## เสียงและเพลง (Ranked Quest)

ไม่มีเสียงหรือเพลงของบุคคลที่สาม — เพลง/เสียงทั้งหมดแต่งและสังเคราะห์ขึ้นใหม่ด้วย Web Audio API (`public/js/audio.js`)
รายการและข้อมูลลิขสิทธิ์ของแต่ละเสียงอยู่ที่ `public/assets/audio/manifest.json` และ `public/assets/audio/LICENSES.md`
