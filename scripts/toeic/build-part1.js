#!/usr/bin/env node
/*
  สร้างคลังข้อ TOEIC-style Part 1 (data/toeic/part1/bank.json) จากไฟล์เนื้อหา + ภาพ + เสียง แล้วตรวจด้วย Part1QuestionValidator

  ขั้นตอนเต็ม (Content Generation Pipeline):
    1) เขียน/แก้เนื้อหา: scripts/toeic/content/part1-*.js   (ภาพจริงถูกวิเคราะห์ก่อนเขียนประโยค)
    2) ภาพ:  python3 scripts/toeic/prepare-images.py <โฟลเดอร์ภาพต้นฉบับ>
    3) node scripts/toeic/build-part1.js           -> เขียน bank.json + audio-jobs.json (งานเสียงที่ยังไม่มี/ข้อความเปลี่ยน)
    4) python3 scripts/toeic/gen-audio.py           -> สร้างเฉพาะเสียงที่ยังไม่มี (cache ด้วย contentHash) + audio-manifest.json
    5) node scripts/toeic/build-part1.js           -> ผูกเสียงเข้ากับข้อ + ตรวจ validator อีกรอบ (สถานะสุดท้าย)
    6) ข้อมูลเข้า DB อัตโนมัติตอนเปิดเซิร์ฟเวอร์ (services/toeic/bank.js · idempotent ตาม version/contentHash)
  ห้าม generate -> publish ทันที: ข้อที่ไม่ผ่าน validator = draft (ไม่เข้าชุดฝึก) · มีคำเตือน = reviewNeeded (ไม่เข้าชุดฝึก)
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { VOICES, VOICE_POOL, AUDIO } = require('../../config/toeic');
const { validateBank, audioContentHash, LETTERS } = require('../../services/toeic/part1Validator');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'toeic', 'part1');
const PUBLIC = path.join(ROOT, 'public');
const CONTENT = require('./content/part1-pilot');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (_) { return d; } };
const imageQa = read('image-qa.json', {});
const manifest = read('audio-manifest.json', {});
const sources = read('image-sources.json', {});

// ผลการตรวจด้วยตา (Image-to-Statement review): ทุกข้อในชุดนี้ถูกเปรียบเทียบประโยค A–D กับภาพจริงทีละข้อ
// ใส่ passed:false + note เพื่อกันข้อออกจากชุดฝึกจนกว่าจะแก้
const REVIEW = { by: 'visual review (Claude) · image vs. each statement', at: '2026-10-19' };
const REVIEW_HOLD = {};   // key -> note (ข้อที่ยังไม่ผ่าน)
// คำเตือน "คล้ายคำตอบ" ที่ตั้งใจให้เป็นคู่เทียบ (minimal pair) และตรวจกับภาพแล้วว่าไม่กำกวม
const REVIEW_ACK = {
  p12: ['mopping'],         // ภาพเห็นไม้กวาดชัด ไม่มีไม้ม็อบ/ถังน้ำ -> sweep ไม่ใช่ mop
  p18: ['opening a box'],   // กล่องปิดสนิท ทั้งสองคนยกกล่อง
};

const ROTATE = [2, 3, 0, 1];   // ลำดับ variant 1 (ตำแหน่งคำตอบเปลี่ยน + ใช้เสียงอีกสำเนียง)

function build() {
  const jobs = [];
  const bank = CONTENT.map((c, idx) => {
    const n = Number(c.key.slice(1));
    const id = `P1-${String(n).padStart(4, '0')}`;
    const statements = c.S.map(([text, translationTH, kind, explanationTH]) => ({
      text, translationTH, isCorrect: kind === 'correct', distractorType: kind === 'correct' ? null : kind, explanationTH,
    }));
    const orders = [[0, 1, 2, 3], ROTATE];
    const variants = orders.map((order, vi) => {
      const pool = vi === 0 ? VOICE_POOL.us : VOICE_POOL.uk;
      const voice = pool[(idx + vi) % pool.length];
      const texts = order.map((i) => statements[i].text);
      const contentHash = audioContentHash({ texts, voice, speed: AUDIO.speed, generationVersion: AUDIO.generationVersion, leadIn: AUDIO.leadIn });
      const file = `${id}-v${vi}-${contentHash.slice(0, 8)}.mp3`;
      const m = manifest[contentHash];
      const url = `${AUDIO.dir}/${file}`;
      const haveFile = fs.existsSync(path.join(PUBLIC, url));
      if (!m || !haveFile) {
        jobs.push({ id, variant: vi, contentHash, voice, lang: VOICES[voice].lang, speed: AUDIO.speed, leadIn: AUDIO.leadIn,
          texts, out: path.join(PUBLIC, url) });
      }
      return {
        v: vi, order, correctOption: LETTERS[order.indexOf(statements.findIndex((s) => s.isCorrect))],
        speakerId: voice, speakerAccent: VOICES[voice].accent,
        audio: m && haveFile ? { url, duration: m.duration, segments: m.segments, voice, accent: VOICES[voice].accent, speed: AUDIO.speed,
          generationVersion: AUDIO.generationVersion, leadIn: AUDIO.leadIn, contentHash, bytes: m.bytes } : null,
      };
    });
    const held = REVIEW_HOLD[c.key];
    const q = {
      id, part: 1, type: 'photograph', key: c.key,
      category: c.cat, difficulty: c.diff, topic: c.topic, scene: c.scene, sceneType: c.io, setting: c.setting,
      imageAsset: {
        url: `/assets/toeic/p1/${id}.webp`, urlSmall: `/assets/toeic/p1/${id}-640.webp`, width: 1248, height: 832,
        source: { kind: 'ai-generated', provider: 'Pixa', model: 'Flux 2 Klein 9B', assetId: sources[c.key] || null,
          license: 'สร้างขึ้นเพื่อ EnglishQuest (ไม่ใช่ภาพจากข้อสอบจริง/ไม่มีลิขสิทธิ์บุคคลที่สาม)' },
        qa: imageQa[id] || null,
      },
      imageAlt: c.alt,
      statements, skills: c.skills,
      explanationTH: c.why, tipTH: c.tip,
      photoAnalysis: c.photo,
      vocabulary: c.vocab.map(([word, pos, ipa, th, example, group]) => ({ word, pos, ipa, th, example, group })),
      imageClues: c.clues.map(([label, kind, box]) => ({ label, kind, box })),
      variants,
      review: held ? { ...REVIEW, passed: false, note: held } : { ...REVIEW, passed: true, acknowledged: REVIEW_ACK[c.key] || [] },
    };
    q.version = crypto.createHash('sha1').update(JSON.stringify({ ...q, review: undefined, variants: variants.map((v) => v.audio && v.audio.contentHash) })).digest('hex').slice(0, 12);
    return q;
  });

  const results = validateBank(bank, { publicDir: PUBLIC, checkFiles: true });
  bank.forEach((q, i) => { q.qualityStatus = results[i].status; q.qualityReport = { errors: results[i].errors, warnings: results[i].warnings, acknowledged: results[i].acknowledged }; });
  fs.writeFileSync(path.join(DATA, 'bank.json'), JSON.stringify({ part: 1, generatedAt: new Date().toISOString(), questions: bank }, null, 1));
  fs.writeFileSync(path.join(DATA, 'audio-jobs.json'), JSON.stringify(jobs, null, 1));
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(`questions ${bank.length} · verified ${count('verified')} · reviewNeeded ${count('reviewNeeded')} · autoChecked ${count('autoChecked')} · draft ${count('draft')} · audio jobs ${jobs.length}`);
  const noisy = results.filter((r) => r.errors.length || r.warnings.length);
  const strict = process.argv.includes('--verbose');
  noisy.slice(0, strict ? 999 : 8).forEach((r) => {
    const errs = r.errors.filter((e) => strict || !/เสียง|segments|variant/.test(e));
    if (errs.length || r.warnings.length) console.log(` ${r.id} [${r.status}]`, [...errs, ...r.warnings.map((w) => `⚠ ${w}`)].join(' | '));
  });
  return { bank, results, jobs };
}

if (require.main === module) build();
module.exports = { build };
