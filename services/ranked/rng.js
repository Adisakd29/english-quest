/*
  สุ่มแบบกำหนด seed ได้ (mulberry32) — ทุกการสุ่มของ Ranked ใช้ตัวนี้
  บันทึก seed ไว้ในเกม -> ย้อนตรวจผลได้ และทดสอบซ้ำได้ผลเดิม
*/
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const newSeed = () => Math.floor(Math.random() * 2147483647);

module.exports = { mulberry32, shuffle, pick, newSeed };
