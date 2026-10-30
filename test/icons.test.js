/* v1.10.0 Phase 5 — รายชื่อไอคอนใน graphics.js ต้องตรงกับ sprite และทุกไอคอนที่โค้ดเรียกต้องมีอยู่จริง */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public');
const sprite = fs.readFileSync(path.join(root, 'assets/icons/icons.svg'), 'utf8');
const ids = new Set([...sprite.matchAll(/<symbol id="([a-z0-9-]+)"/g)].map((m) => m[1]));

test('ICON_NAMES ใน graphics.js = ทุก symbol ใน icons.svg', () => {
  const g = fs.readFileSync(path.join(root, 'js/graphics.js'), 'utf8');
  const block = g.match(/const ICON_NAMES = new Set\(\(([\s\S]*?)\)\.split/)[1];
  const names = new Set([...block.matchAll(/'([^']*)'/g)].map((m) => m[1]).join('').split(' ').filter(Boolean));
  assert.deepStrictEqual([...names].sort(), [...ids].sort());
});

test('ทุกไอคอนที่ HTML/JS อ้างถึงมีอยู่ใน sprite', () => {
  const missing = new Set();
  const files = ['index.html', ...fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)];
  for (const f of files) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of t.matchAll(/icons\.svg#([a-z0-9-]+)/g)) if (!ids.has(m[1])) missing.add(`${m[1]} (${f})`);
    for (const m of t.matchAll(/\b(?:ic|ICON|G\.icon)\(\s*'([a-z0-9-]+)'/g)) if (!ids.has(m[1])) missing.add(`${m[1]} (${f})`);
  }
  assert.deepStrictEqual([...missing], []);
});
