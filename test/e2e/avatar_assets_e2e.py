"""Runtime Asset Audit — โหลดสินค้า "ทุกชิ้น" ในร้าน (จาก API = ข้อมูลใน DB จริง) ลงบน viewer 3D ทีละชิ้น
   python3 test/e2e/avatar_assets_e2e.py      (เซิร์ฟเวอร์ :3100)
   ต่อชิ้น: GLB โหลดได้ · อยู่ใน scene ที่ slot ถูกต้อง · mesh ผูกกับ rig แล้วอยู่ตำแหน่งที่ถูกของร่างกาย (กล่องขอบเขตหลัง skinning)
            · จำนวน triangle ที่เรนเดอร์เพิ่มขึ้นตรงกับโมเดล · ภาพเปลี่ยนจริง · ภาพย่อ 3D/2D โหลดได้ (HTTP 200) · Preview 2D วาดชิ้นนั้นจริง
   สีผิว: material ผิวเปลี่ยนสีตาม · พื้นหลัง: ฉากหลังของ viewer เปลี่ยน
   ผลเขียนที่ E2E_OUT/asset_runtime.json"""
import asyncio, json, os, random, sys
from playwright.async_api import async_playwright
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
OUT = os.environ.get('E2E_OUT', '/tmp/avatar_assets_')
# ช่วงความสูง (เมตร, ตัวละครสูง ~1.0) ที่ "จุดกึ่งกลาง" ของแต่ละหมวดต้องอยู่ — ใช้จับชิ้นที่ผูก bone ผิด/ลอยหลุดตัว
# style v3 (หัวโตตัวเล็ก): ลำตัวย่อ ×0.84 · หัวขยาย ×1.17 รอบคอ (z 0.50) · เสื้อกาวน์ยาวถึงเข่า: กึ่งกลาง ~0.31
Y_RANGE = {'face': (0.62, 1.0), 'hair': (0.52, 1.08), 'hat': (0.72, 1.22), 'glasses': (0.64, 0.95), 'headphones': (0.62, 1.0),
           'top': (0.3, 0.68), 'outerwear': (0.26, 0.68), 'bottom': (0.08, 0.46), 'shoes': (-0.02, 0.12), 'back': (0.22, 0.75),
           'accessory': (0.2, 0.9), 'effect': (0.0, 1.4)}
JS = """async () => {
  const all = (await EQApp.api('/avatar/catalog')).items;
  const cat = all.filter((x) => x.active);   // สินค้าที่ขาย/แสดงในร้านจริง (ของที่ปิดขายแล้วยังอยู่ในแคตตาล็อกเพื่อวาดให้คนที่มีอยู่)
  const byId = Object.fromEntries(all.map((x) => [x.id, x]));
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:300px;z-index:99999'; document.body.appendChild(d);
  const bare = { body: 'body_warm' };
  const v = EQAvatar3D.mount(d, { api: EQApp.api, byId, outfit: bare, controls: false });
  const t0 = performance.now(); while (!v.isReady() && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 30));
  const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await settle(); await wait(300);
  const tris0 = v.stats().triangles;
  // ภาพจริงจาก renderer (snapshot เต็มตัว มุมคงที่) -> พิกเซล
  const pix = async () => { const u = v.snapshot(96, 'full'); const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = 96; c.height = 96; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, 96, 96).data; };
  const px0 = await pix();
  const head = async (u) => { try { const r = await fetch(u, { method: 'HEAD' }); return r.status; } catch (_) { return 0; } };
  const rows = [];
  for (const it of cat) {
    const row = { id: it.id, slot: it.slot, kind: it.model ? (it.model.kind || 'glb') : 'none', errs: [] };
    row.thumb2D = it.thumbnailUrl ? await head(it.thumbnailUrl) : 0;
    if ((it.parts || []).length) row.layer2D = await head(it.parts[0].url); else row.layer2D = 0;
    if (row.thumb2D !== 200) row.errs.push('ภาพย่อ 2D โหลดไม่ได้ ' + row.thumb2D);
    if (row.layer2D !== 200) row.errs.push('layer 2D โหลดไม่ได้ ' + row.layer2D);
    // Preview 2D วาดชิ้นนี้จริง (renderer 2D เดียวกับที่ร้านใช้)
    const svg = EQAvatar.render({ ...bare, [it.slot]: it.id }, 'full');
    if (!(it.parts || []).every((p) => svg.includes(p.url.split('?')[0]))) row.errs.push('Preview 2D ไม่มี layer ของชิ้นนี้');
    if (row.kind === 'none') { rows.push(row); continue; }
    row.thumb3D = await head(it.model.thumbnailUrl);
    if (row.kind === 'glb' && row.thumb3D !== 200) row.errs.push('ภาพย่อ 3D โหลดไม่ได้ ' + row.thumb3D);
    const outfit = { ...bare, [it.slot]: it.id };
    const s0 = performance.now();
    try { const r = await v.setOutfit(outfit); if (r.missing.length) row.errs.push('viewer บอกว่าไม่มี 3D'); } catch (e) { row.errs.push('โหลดไม่ได้: ' + e.message); }
    row.loadMs = Math.round(performance.now() - s0);
    await settle(); await wait(120);
    if (row.kind === 'glb') {
      const sl = v.slots();
      if (sl[it.slot] !== it.id) row.errs.push('ไม่อยู่ใน slot ' + it.slot + ' (' + sl[it.slot] + ')');
      const box = v._slotBoxes()[it.slot];
      row.box = box;
      if (!box || !box.visible) row.errs.push('ไม่มี mesh ที่มองเห็นใน scene');
      const added = v.stats().triangles - tris0;
      row.trisAdded = added;
      if (Math.abs(added - it.model.triangles) > 4) row.errs.push('triangle ที่เรนเดอร์เพิ่ม ' + added + ' ≠ โมเดล ' + it.model.triangles);
    }
    if (row.kind === 'backdrop') { const st = d.querySelector('.a3-stage'); if (!st.classList.contains('has-bg') || !st.style.backgroundImage.includes(it.parts[0].url.split('?')[0])) row.errs.push('ฉากหลังไม่เปลี่ยน'); }
    if (row.kind !== 'backdrop') {
      const px = await pix(); let diff = 0; for (let i = 0; i < px.length; i += 4) diff += Math.abs(px[i] - px0[i]) + Math.abs(px[i + 1] - px0[i + 1]) + Math.abs(px[i + 2] - px0[i + 2]);
      row.pixelDiff = +(diff / (px.length / 4)).toFixed(2);
      if (it.id !== 'body_warm' && row.pixelDiff < 0.3) row.errs.push('ภาพตัวละครไม่เปลี่ยน (Δ ' + row.pixelDiff + ')');
    }
    rows.push(row);
  }
  await v.setOutfit(bare); await settle();
  const end = v.stats(); v.dispose(); d.remove();
  return { rows, end: { geometries: end.geometries, textures: end.textures } };
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=GL)
        ctx = await b.new_context(viewport={'width': 1000, 'height': 900}, service_workers='block')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:3100'); await pg.wait_for_timeout(800)
        t = (await pg.evaluate(REG, 'as%d' % random.randint(1, 999999)))['token']
        await pg.evaluate("t=>localStorage.setItem('wq_token',t)", t); await pg.reload(); await pg.wait_for_timeout(2500)
        await pg.wait_for_function("()=>window.EQAvatar3D && window.EQAvatar && EQAvatar.render")
        res = await pg.evaluate(JS)
        await b.close()
    rows = res['rows']; fails = []
    for r in rows:
        if r.get('box') and r['slot'] in Y_RANGE:
            cy = (r['box']['min'][1] + r['box']['max'][1]) / 2; lo, hi = Y_RANGE[r['slot']]
            r['centerY'] = round(cy, 3)
            if not (lo <= cy <= hi): r['errs'].append(f'ตำแหน่งบนร่างกายผิด (กึ่งกลางสูง {cy:.2f} m, ควรอยู่ {lo}-{hi})')
            if max(abs(r['box']['min'][0]), abs(r['box']['max'][0])) > 1.2: r['errs'].append('ชิ้นลอยออกนอกตัว (แกน X)')
        if r['errs']: fails.append(r)
    kinds = {}
    for r in rows: kinds[r['kind']] = kinds.get(r['kind'], 0) + 1
    ok3d = sum(1 for r in rows if r['kind'] != 'none' and not r['errs'])
    print(json.dumps({'items': len(rows), 'kinds': kinds, 'ready3D_runtime': ok3d, 'only2D': kinds.get('none', 0), 'broken': len(fails),
                      'memoryAfter': res['end'], 'maxLoadMs': max((r.get('loadMs', 0) for r in rows), default=0)}, ensure_ascii=False))
    for r in fails: print('FAIL', r['id'], ' · '.join(r['errs']))
    if errs: print('FAIL JS error', errs[:3]); fails.append('js')
    json.dump(rows, open(OUT + 'asset_runtime.json', 'w'), ensure_ascii=False, indent=1)
    print('ALL PASS' if not fails else f'{len(fails)} FAIL')
    sys.exit(1 if fails else 0)
asyncio.run(main())
