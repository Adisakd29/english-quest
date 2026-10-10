/*
  ระบบทบทวนแบบเว้นช่วง (Spaced Repetition System)
  อิงอัลกอริทึม SM-2 แบบย่อ ให้เข้าใจง่ายและปรับได้

  แนวคิด:
    - ตอบถูกติดกัน → ช่วงเวลาทบทวนห่างขึ้นเรื่อย ๆ (1 → 3 → 7 → ... วัน)
    - ตอบผิด → รีเซ็ตกลับไปเริ่มใหม่ (ต้องทบทวนพรุ่งนี้) + ลดค่าความง่าย
    - ค่า ease (ความง่าย) ปรับตามผลตอบ ทำให้คำยากกลับมาถี่กว่าคำง่าย

  สถานะคำ (ใช้ร่วมกับ word_progress.status เดิม):
    - new      : ยังไม่เคยเจอ (ไม่มีแถวใน word_progress)
    - learning : กำลังเรียน (ตอบถูกยังไม่ถึงเกณฑ์ หรือเพิ่งตอบผิด)
    - known    : จำได้ (reps ถึงเกณฑ์)
*/

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;          // กันค่า ease โตไม่สิ้นสุดเมื่อตอบถูกติดกันนาน ๆ
const DEFAULT_EASE = 2.5;
// เพดานช่วงทบทวน — บั๊กจริงที่พบ: ไม่มีเพดานแล้วตอบถูกคำเดิมติดกันครั้งที่ 17
// ช่วงยาว ~242 ล้านวัน เกินขอบเขตวันที่ (Invalid Date) -> ระบบตอบ error 500
const MAX_INTERVAL_DAYS = 365;
const KNOWN_REPS_THRESHOLD = 2; // ตอบถูกติดกันกี่ครั้งถึงนับว่า "known"

// ลำดับช่วงวันสำหรับช่วงต้น (วัน) หลังจากนั้นคูณด้วย ease
const LEARNING_STEPS_DAYS = [1, 3];

function clampEase(ease) {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(ease * 100) / 100));
}

/*
  คำนวณสถานะ SRS ใหม่จากผลการตอบ
  รับ: สถานะเดิม { reps, ease, interval, lapses } (ถ้าไม่มี = คำใหม่) + correct (boolean)
  คืน: สถานะใหม่ + วันครบกำหนดถัดไป (dueAt เป็น Date)
*/
// แปลงเป็นตัวเลขที่ใช้ได้จริง (ป้องกันไว้ก่อน) — srs_ease เป็น REAL ซึ่ง pg ส่งกลับเป็นตัวเลขอยู่แล้ว
// แต่ถ้าวันหนึ่งคอลัมน์เปลี่ยนเป็น NUMERIC ค่าจะมาเป็นข้อความ และ "2.6" + 0.1 = "2.60.1" -> NaN
// หมายเหตุ: บั๊กที่เกิดขึ้นจริงคือ "ช่วงทบทวนไม่มีเพดาน" (ดู MAX_INTERVAL_DAYS) ไม่ใช่เรื่องชนิดข้อมูล
function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ระดับการประเมินหลังตอบ (Again / Hard / Good / Easy)
const RATINGS = ['again', 'hard', 'good', 'easy'];
const AGAIN_MINUTES = 10;       // ตอบผิด/ลืม -> กลับมาเร็ว
const HARD_FACTOR = 1.2;
const EASY_BONUS = 1.3;
const EASY_GRADUATE_DAYS = 4;   // คำใหม่ที่กด Easy -> ข้ามขั้นเรียนไปเป็นรู้แล้ว

/*
  คำนวณสถานะ SRS ใหม่จากผลการตอบ
  รับ: สถานะเดิม { reps, ease, interval, lapses } (ถ้าไม่มี = คำใหม่), correct (เซิร์ฟเวอร์ตรวจแล้ว),
       opts.rating = 'again' | 'hard' | 'good' | 'easy' (ใช้ได้เมื่อตอบถูกเท่านั้น — ตอบผิด = again เสมอ)
  คืน: สถานะใหม่ + วันครบกำหนดถัดไป (dueAt เป็น Date) + rating ที่ใช้จริง
  หมายเหตุ: 'good' (ค่าเริ่มต้น) ให้ผลเหมือนระบบเดิมทุกค่า — ความก้าวหน้าเดิมไม่เปลี่ยน
*/
function schedule(prev, correct, now = new Date(), opts = {}) {
  let reps = toNumber(prev && prev.reps, 0);
  let ease = toNumber(prev && prev.ease, DEFAULT_EASE) || DEFAULT_EASE;
  let interval = toNumber(prev && prev.interval, 0);
  let lapses = toNumber(prev && prev.lapses, 0);
  const asked = RATINGS.includes(opts.rating) ? opts.rating : 'good';
  const rating = correct ? asked : 'again';
  const learning = reps < LEARNING_STEPS_DAYS.length;
  let dueMs;

  if (rating === 'again') {
    // ตอบผิด หรือ ตอบถูกแต่บอกว่าลืม/เดา: เริ่มใหม่ และกลับมาภายในไม่กี่นาที
    reps = 0;
    interval = 0;
    lapses += 1;
    ease = clampEase(ease - 0.2);
    dueMs = AGAIN_MINUTES * 60 * 1000;
  } else {
    if (rating === 'easy' && learning) {
      // คำใหม่ที่ง่ายมาก: ข้ามขั้นเรียน
      reps = Math.max(reps, KNOWN_REPS_THRESHOLD);
      interval = EASY_GRADUATE_DAYS;
      ease = clampEase(ease + 0.15);
    } else if (rating === 'hard' && learning) {
      // ยังไม่มั่นใจ: อยู่ขั้นเดิม ทบทวนพรุ่งนี้
      interval = 1;
      ease = clampEase(ease - 0.15);
    } else if (learning) {
      interval = LEARNING_STEPS_DAYS[reps];          // good: ขั้นเรียนตามปกติ
      reps += 1;
      ease = clampEase(ease + 0.1);
    } else {
      const base = Math.max(1, interval);
      if (rating === 'hard') {
        interval = Math.max(base + 1, Math.round(base * HARD_FACTOR));
        ease = clampEase(ease - 0.15);
      } else if (rating === 'easy') {
        interval = Math.round(base * ease * EASY_BONUS);
        ease = clampEase(ease + 0.15);
      } else {
        interval = Math.round(base * ease);          // good: เหมือนระบบเดิม
        ease = clampEase(ease + 0.1);
      }
      reps += 1;
    }
    interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, interval));
    dueMs = interval * 24 * 60 * 60 * 1000;
  }

  const dueAt = new Date(now.getTime() + dueMs);
  const status = reps >= KNOWN_REPS_THRESHOLD ? 'known' : 'learning';
  return { reps, ease, interval, lapses, dueAt, status, rating };
}

// คำถึงกำหนดทบทวนหรือยัง (คำที่ไม่มี dueAt = คำเก่าก่อนมี SRS → ถือว่าถึงกำหนด)
function isDue(dueAt, now = new Date()) {
  if (!dueAt) return true;
  return new Date(dueAt).getTime() <= now.getTime();
}

module.exports = {
  schedule,
  RATINGS,
  AGAIN_MINUTES,
  isDue,
  DEFAULT_EASE,
  KNOWN_REPS_THRESHOLD,
  LEARNING_STEPS_DAYS,
};
