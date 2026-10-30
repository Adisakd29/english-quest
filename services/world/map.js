/*
  แผนที่ของ EnglishQuest World — data/world/campus.json (สร้างพร้อมฉากใน Blender: scripts/world/build_campus.py → optimize-map.mjs)
  ข้อมูลชุดเดียวใช้ทั้ง: วาดฉาก (client) · collision ฝั่ง client · ตรวจตำแหน่งฝั่งเซิร์ฟเวอร์ → ผลตรงกันเสมอ
*/
const fs = require('fs');
const path = require('path');
const physicsLib = require('../../public/js/world-physics');

const FILE = path.join(__dirname, '..', '..', 'data', 'world', 'campus.json');
const state = { map: null, phys: null };
function load() {
  state.map = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  state.phys = physicsLib.create(state.map);
  return state.map;
}
/** ข้อมูลที่ส่งให้ client (ไม่มีอะไรลับ — เป็นข้อมูลฉาก) */
function publicMap() {
  if (!state.map) load();
  const m = state.map;
  return { id: m.id, name: m.name, version: m.version, glbUrl: m.glbUrl, bounds: m.bounds, playerRadius: m.playerRadius,
    colliders: m.colliders, zones: m.zones, interact: m.interact, seats: m.seats, spawns: m.spawns, triangles: m.triangles };
}
module.exports = {
  load, publicMap,
  get map() { if (!state.map) load(); return state.map; },
  get phys() { if (!state.phys) load(); return state.phys; },
};
