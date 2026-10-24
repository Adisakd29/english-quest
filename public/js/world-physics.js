/* =====================================================================
   EnglishQuest World — Collision (ใช้ร่วมกันทั้ง browser และเซิร์ฟเวอร์ → ผลเหมือนกันทุกจุด)
   collider จาก data/world/campus.json (สร้างพร้อมฉากใน Blender):
     c   = วงกลม {x, z, r}           (น้ำพุ ต้นไม้ เสาไฟ หอคอย)
     b   = กล่องหมุน {x, z, hw, hd, ry} (อาคาร ม้านั่ง ราวเสื้อ)
     arc = แปลงดอกไม้โค้งรอบลาน {r0, r1, a0, a1}
   ผู้เล่น = วงกลมรัศมี playerRadius · ชนแล้ว "ไถล" ตามผนัง (ไม่ติดค้าง)
   ===================================================================== */
(function (root) {
  function create(map) {
    const R = map.playerRadius || 0.24;
    const [minX, minZ, maxX, maxZ] = map.bounds;
    const cols = map.colliders || [];
    /** ดันจุดออกจาก collider ทั้งหมด (ทำซ้ำ 3 รอบ เผื่อ collider ติดกัน) · คืน [x, z] */
    function resolve(x, z) {
      for (let it = 0; it < 3; it += 1) {
        let moved = false;
        for (const c of cols) {
          if (c.t === 'c') {
            const dx = x - c.x; const dz = z - c.z; const rr = c.r + R;
            const d2 = dx * dx + dz * dz;
            if (d2 < rr * rr) {
              const d = Math.sqrt(d2);
              if (d < 1e-6) { x = c.x + rr; z = c.z; } else { x = c.x + (dx / d) * rr; z = c.z + (dz / d) * rr; }   // ตรงศูนย์กลางพอดี → ดันออกทาง +x
              moved = true;
            }
          } else if (c.t === 'b') {
            // พิกัดในกล่อง (หมุนกลับ ry) — ry ทิศเดียวกับ three.js rotation.y
            const cs = Math.cos(c.ry || 0); const sn = Math.sin(c.ry || 0);
            const dx = x - c.x; const dz = z - c.z;
            const lx = dx * cs - dz * sn; const lz = dx * sn + dz * cs;
            const qx = Math.max(-c.hw, Math.min(c.hw, lx)); const qz = Math.max(-c.hd, Math.min(c.hd, lz));
            let ex = lx - qx; let ez = lz - qz;
            const d2 = ex * ex + ez * ez;
            let nlx; let nlz;
            if (d2 > 1e-12) {
              if (d2 >= R * R) continue;
              const d = Math.sqrt(d2);
              nlx = qx + (ex / d) * R; nlz = qz + (ez / d) * R;
            } else {
              // อยู่ในกล่อง: ดันออกทางด้านที่ใกล้ที่สุด
              const px = c.hw - Math.abs(lx); const pz = c.hd - Math.abs(lz);
              if (px < pz) { nlx = Math.sign(lx || 1) * (c.hw + R); nlz = lz; } else { nlx = lx; nlz = Math.sign(lz || 1) * (c.hd + R); }
            }
            x = c.x + nlx * cs + nlz * sn; z = c.z - nlx * sn + nlz * cs; moved = true;
          } else if (c.t === 'arc') {
            const r = Math.hypot(x, z);
            let a = Math.atan2(z, x);
            const mid = (c.a0 + c.a1) / 2;
            while (a - mid > Math.PI) a -= 2 * Math.PI;
            while (a - mid < -Math.PI) a += 2 * Math.PI;
            const r0 = c.r0 - R; const r1 = c.r1 + R;
            const pad = R / Math.max(r, 1);
            if (r > r0 && r < r1 && a > c.a0 - pad && a < c.a1 + pad) {
              // ดันออกด้านที่ใกล้ที่สุด (ใน/นอก/ปลายโค้ง)
              const opts = [[r0 - r, 'in'], [r1 - r, 'out'], [(c.a0 - pad - a) * r, 'a0'], [(c.a1 + pad - a) * r, 'a1']];
              opts.sort((p, q) => Math.abs(p[0]) - Math.abs(q[0]));
              const [, side] = opts[0];
              if (side === 'in' || side === 'out') { const nr = side === 'in' ? r0 : r1; x = Math.cos(a) * nr; z = Math.sin(a) * nr; } else {
                const na = side === 'a0' ? c.a0 - pad : c.a1 + pad; x = Math.cos(na) * r; z = Math.sin(na) * r;
              }
              moved = true;
            }
          }
        }
        x = Math.max(minX, Math.min(maxX, x)); z = Math.max(minZ, Math.min(maxZ, z));
        if (!moved) break;
      }
      return [x, z];
    }
    function blocked(x, z) {
      const [rx, rz] = resolve(x, z);
      return Math.hypot(rx - x, rz - z) > 1e-4;
    }
    /** เดินจาก (x,z) ด้วย (dx,dz) — ชนแล้วไถลตามผนัง (resolve ดันออกตามแนวตั้งฉาก) · ก้าวย่อยกันทะลุ collider บาง */
    function step(x, z, dx, dz) {
      const L = Math.hypot(dx, dz);
      const n = Math.max(1, Math.ceil(L / (R * 0.8)));
      for (let i = 0; i < n; i += 1) [x, z] = resolve(x + dx / n, z + dz / n);
      return [x, z];
    }
    /** ทางระหว่างสองจุดผ่านได้ไหม (ไม่วาร์ปทะลุกำแพง) — ไล่ step แล้วดูว่าถึงปลายทางไหม */
    function reachable(x0, z0, x1, z1, tol = 0.35) {
      const [ex, ez] = step(x0, z0, x1 - x0, z1 - z0);
      return Math.hypot(ex - x1, ez - z1) <= tol;
    }
    return { resolve, blocked, step, reachable, R };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EQWorldPhysics = api;
}(typeof self !== 'undefined' ? self : this));
