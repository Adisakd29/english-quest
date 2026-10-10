/*
  หลักสูตร Learning Path (A1–C1)
  ใช้ร่วมกันโดย build script (จัดหัวข้อคำ) และเซิร์ฟเวอร์ (สร้าง Units + สถานะล็อก)

  แนวคิด:
    - คำศัพท์แต่ละคำมี "หัวข้อ" (topic) ที่จัดอัตโนมัติจากหมวดความหมายของ WordNet
      แล้วแอดมินแก้ได้ผ่านหน้า Admin
    - Unit = กลุ่มคำของ (ระดับ, หัวข้อ) แบ่งเป็นชุดละไม่เกิน UNIT_SIZE คำ
    - Unit "คำนวณใหม่ทุกครั้ง" ไม่เก็บในฐานข้อมูล — ความก้าวหน้ามาจาก word_progress
      ย้ายคำข้ามหัวข้อได้โดยความก้าวหน้าของผู้เรียนไม่หาย
    - ใช้เฉพาะคำเนื้อหา (noun/verb/adj/adv) เพราะคำไวยากรณ์ (the, of, can) ฝึกในโหมด
      เลือกความหมายไม่ได้อยู่แล้ว และสอนผ่านบทแกรมม่าแทน
*/

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

const LEVEL_WORLDS = {
  A1: { name: 'Beginner World', th: 'โลกเริ่มต้น' },
  A2: { name: 'Explorer World', th: 'โลกนักสำรวจ' },
  B1: { name: 'Adventure World', th: 'โลกผจญภัย' },
  B2: { name: 'Advanced World', th: 'โลกขั้นสูง' },
  C1: { name: 'Master World', th: 'โลกปรมาจารย์' },
};

// ลำดับในอาร์เรย์ = ลำดับการเรียนในแต่ละระดับ (เริ่มจากเรื่องใกล้ตัว)
const TOPICS = [
  { id: 'people', th: 'ผู้คนและครอบครัว', en: 'People & Family', icon: 'users-round' },
  { id: 'time', th: 'เวลาและตัวเลข', en: 'Time & Numbers', icon: 'clock' },
  { id: 'food', th: 'อาหารและเครื่องดื่ม', en: 'Food & Drink', icon: 'utensils' },
  { id: 'things', th: 'สิ่งของและอาคาร', en: 'Things & Buildings', icon: 'building-2' },
  { id: 'places', th: 'สถานที่และการเดินทาง', en: 'Places & Travel', icon: 'map' },
  { id: 'body', th: 'ร่างกายและสุขภาพ', en: 'Body & Health', icon: 'heart-pulse' },
  { id: 'actions', th: 'การกระทำและเหตุการณ์', en: 'Actions & Events', icon: 'zap' },
  { id: 'describing', th: 'คำบรรยายลักษณะ', en: 'Describing Things', icon: 'palette' },
  { id: 'feelings', th: 'ความรู้สึกและสภาวะ', en: 'Feelings & States', icon: 'smile' },
  { id: 'nature', th: 'ธรรมชาติและสัตว์', en: 'Nature & Animals', icon: 'leaf' },
  { id: 'communication', th: 'การสื่อสาร', en: 'Communication', icon: 'message-circle' },
  { id: 'work', th: 'งาน เงิน และสังคม', en: 'Work, Money & Society', icon: 'briefcase' },
  { id: 'thinking', th: 'ความคิดและการเรียนรู้', en: 'Thinking & Learning', icon: 'brain' },
];
const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

// หมวดความหมายของ WordNet -> หัวข้อของเรา
const LEXNAME_TO_TOPIC = {
  'noun.person': 'people', 'verb.social': 'people',
  'noun.time': 'time', 'noun.quantity': 'time',
  'noun.food': 'food', 'verb.consumption': 'food',
  'noun.artifact': 'things',
  'noun.location': 'places', 'verb.motion': 'places',
  'noun.body': 'body', 'verb.body': 'body',
  'noun.act': 'actions', 'noun.event': 'actions', 'noun.process': 'actions',
  'verb.change': 'actions', 'verb.contact': 'actions', 'verb.creation': 'actions',
  'verb.competition': 'actions', 'verb.stative': 'actions',
  'adj.all': 'describing', 'adj.pert': 'describing', 'adj.ppl': 'describing', 'adv.all': 'describing',
  'noun.attribute': 'describing', 'noun.shape': 'describing', 'noun.relation': 'describing',
  'noun.Tops': 'describing',
  'noun.feeling': 'feelings', 'verb.emotion': 'feelings', 'noun.motive': 'feelings', 'noun.state': 'feelings',
  'noun.animal': 'nature', 'noun.plant': 'nature', 'noun.phenomenon': 'nature',
  'noun.object': 'nature', 'noun.substance': 'nature', 'verb.weather': 'nature',
  'noun.communication': 'communication', 'verb.communication': 'communication',
  'noun.possession': 'work', 'verb.possession': 'work', 'noun.group': 'work',
  'noun.cognition': 'thinking', 'verb.cognition': 'thinking', 'verb.perception': 'thinking',
};

const CONTENT_CATEGORIES = new Set(['noun', 'verb', 'adj', 'adv']);

// จัดหัวข้อให้คำ 1 คำ (ใช้ตอน build) — คืน null ถ้าไม่ใช่คำเนื้อหา
function topicFor(category, lexname) {
  if (!CONTENT_CATEGORIES.has(category)) return null;
  if (lexname && LEXNAME_TO_TOPIC[lexname]) return LEXNAME_TO_TOPIC[lexname];
  // ไม่มีข้อมูลใน WordNet: ใช้ชนิดคำแทน
  if (category === 'adj' || category === 'adv') return 'describing';
  if (category === 'verb') return 'actions';
  return 'things';
}

const UNIT_SIZE = 20;      // คำต่อ Unit สูงสุด
const MIN_UNIT_SIZE = 8;   // ต่ำกว่านี้สร้างโจทย์ 4 ตัวเลือกได้ไม่ดี → รวมกับ Unit อื่น
const UNIT_COMPLETE = 0.8; // รู้ 80% ของคำใน Unit = ผ่าน
const LEVEL_UNLOCK = 0.6;  // ผ่าน 60% ของ Unit ในระดับก่อน = ปลดล็อกระดับถัดไป

/*
  สร้าง Units ของทุกระดับ
  words: [{ id, level, category, topic }] เฉพาะคำเนื้อหา
  คืน: { A1: [{ id, level, topic, part, wordIds }], ... } — ผลลัพธ์คงที่ (deterministic)
*/
function buildUnits(words) {
  const result = {};
  for (const level of LEVELS) {
    const units = [];
    const leftovers = [];
    for (const topic of TOPICS) {
      const ids = words
        .filter((w) => w.level === level && w.topic === topic.id)
        .map((w) => w.id)
        .sort();
      if (ids.length < MIN_UNIT_SIZE) {
        leftovers.push(...ids);
        continue;
      }
      // แบ่งเป็นชุด ถ้าชุดสุดท้ายเล็กเกินไป รวมเข้ากับชุดก่อนหน้า
      const chunks = [];
      for (let i = 0; i < ids.length; i += UNIT_SIZE) chunks.push(ids.slice(i, i + UNIT_SIZE));
      if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN_UNIT_SIZE) {
        const last = chunks.pop();
        chunks[chunks.length - 1].push(...last);
      }
      chunks.forEach((wordIds, idx) => {
        units.push({
          id: `${level}-${topic.id}-${idx + 1}`,
          level,
          topic: topic.id,
          part: idx + 1,
          parts: chunks.length,
          wordIds,
        });
      });
    }
    // หัวข้อที่คำน้อยเกินไป รวมเป็น Unit "คำศัพท์เพิ่มเติม" ท้ายระดับ
    if (leftovers.length >= MIN_UNIT_SIZE) {
      units.push({ id: `${level}-mixed-1`, level, topic: 'mixed', part: 1, parts: 1, wordIds: leftovers.sort() });
    } else if (leftovers.length > 0 && units.length > 0) {
      units[units.length - 1].wordIds.push(...leftovers);
    }
    result[level] = units;
  }
  return result;
}

/*
  กำหนดสถานะ Unit: locked | available | completed
  knownSet: Set ของ word_id ที่ผู้เรียน "รู้แล้ว"
  placementStart: ระดับที่แบบทดสอบวัดระดับแนะนำ (ระดับที่ต่ำกว่านั้นถือว่าข้ามได้)
*/
function computePathState(unitsByLevel, knownSet, placementStart, passed = {}) {
  // passed: { units: Set(รหัส Unit ที่สอบผ่าน), bosses: Set(ระดับที่เคลียร์ Boss แล้ว) }
  const passedUnits = passed.units || new Set();
  const clearedBosses = passed.bosses || new Set();
  const startIdx = placementStart ? LEVELS.indexOf(placementStart) : 0;
  const levels = [];
  let prevLevelRatio = 1;

  LEVELS.forEach((level, li) => {
    const units = unitsByLevel[level] || [];
    const withProgress = units.map((u) => {
      const known = u.wordIds.filter((id) => knownSet.has(id)).length;
      const testPassed = passedUnits.has(u.id);
      // ผ่าน Unit ได้ 2 ทาง: รู้คำครบ 80% หรือ สอบ Unit Test ผ่าน (รู้อยู่แล้วสอบข้ามได้)
      return {
        ...u, known, total: u.wordIds.length, testPassed,
        // Unit ที่ไม่มีคำให้ฝึกเลย (ทุกคำรอตรวจคำแปล) ถือว่าผ่าน — ไม่ขวางการเรียนต่อ
        completed: testPassed || u.wordIds.length === 0 || known / u.wordIds.length >= UNIT_COMPLETE,
      };
    });
    const completedCount = withProgress.filter((u) => u.completed).length;

    // ระดับปลดล็อกเมื่อ: เป็นระดับแรก / แบบทดสอบแนะนำให้เริ่มที่นี่หรือสูงกว่า / ผ่านระดับก่อนพอ
    const levelUnlocked = li === 0 || li <= startIdx || prevLevelRatio >= LEVEL_UNLOCK;
    // ระดับที่ต่ำกว่าจุดเริ่มที่แนะนำ: เปิดทุก Unit (ผู้เรียนข้ามมาได้)
    const openAll = li < startIdx;

    // ลำดับบังคับเฉพาะ "ภายในหัวข้อเดียวกัน" (อาหาร 1 → อาหาร 2)
    // Unit แรกของทุกหัวข้อเปิดให้เลือกได้เลย — ผู้เรียนเลือกเรื่องที่สนใจเองได้
    // ไม่ต้องผ่าน 40 Unit ตามลำดับตายตัว (ไม่กดดันเกินไป)
    const lastCompletedByTopic = {};
    const finalUnits = withProgress.map((u) => {
      const prevPartDone = u.part === 1 || lastCompletedByTopic[u.topic] === true;
      let status;
      if (!levelUnlocked) status = 'locked';
      else if (u.completed) status = 'completed';
      else if (openAll || prevPartDone) status = 'available';
      else status = 'locked';
      lastCompletedByTopic[u.topic] = u.completed;
      return { ...u, status };
    });

    const ratio = units.length ? completedCount / units.length : 0;
    // Boss เปิดเมื่อผ่าน Unit ถึงเกณฑ์ปลดล็อกระดับ
    let boss = 'locked';
    if (clearedBosses.has(level)) boss = 'cleared';
    else if (levelUnlocked && ratio >= LEVEL_UNLOCK) boss = 'available';

    levels.push({
      level,
      world: LEVEL_WORLDS[level],
      unlocked: levelUnlocked,
      completedUnits: completedCount,
      totalUnits: units.length,
      units: finalUnits,
      boss,
    });
    // เคลียร์ Boss ก็ปลดล็อกระดับถัดไปได้เช่นกัน
    prevLevelRatio = clearedBosses.has(level) ? 1 : ratio;
  });

  return levels;
}

// Unit ถัดไปที่ควรเรียน (ใช้กับปุ่ม "เรียนต่อ")
function nextUnit(levels) {
  for (const lv of levels) {
    const u = lv.units.find((x) => x.status === 'available');
    if (u) return u;
  }
  return null;
}

module.exports = {
  LEVELS, LEVEL_WORLDS, TOPICS, TOPIC_IDS, LEXNAME_TO_TOPIC, CONTENT_CATEGORIES,
  UNIT_SIZE, MIN_UNIT_SIZE, UNIT_COMPLETE, LEVEL_UNLOCK,
  topicFor, buildUnits, computePathState, nextUnit,
};
