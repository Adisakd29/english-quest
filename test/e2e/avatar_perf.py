"""วัดประสิทธิภาพ 3D Avatar (เซิร์ฟเวอร์ :3100) — python3 test/e2e/avatar_perf.py
   วัด: เวลาโหลดครั้งแรก/ครั้งที่ 2 (cache) · FPS + frame time (avg/p95 จาก requestAnimationFrame จริงของ viewer) · draw calls · triangles
        · ขนาด GLB ที่ดาวน์โหลด · เปลี่ยนชุด 30 ครั้ง -> geometries/textures/heap ก่อน-หลัง (memory leak) · WebGL context lost -> กู้คืนกี่ ms
   หมายเหตุ: เครื่องทดสอบไม่มี GPU (SwiftShader = เรนเดอร์ด้วย CPU 2 คอร์) — FPS ที่ได้ต่ำกว่ามือถือ/คอมจริงมาก ใช้เทียบแนวโน้มเท่านั้น"""
import asyncio, json, random
from playwright.async_api import async_playwright
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc']
MEASURE = """async () => {
  const cat = (await EQApp.api('/avatar/catalog')).items; const byId = Object.fromEntries(cat.map((x) => [x.id, x]));
  const of = (slot) => cat.filter((x) => x.slot === slot && x.model && (x.model.kind || 'glb') === 'glb').map((x) => x.id);
  const pick = (slot, i) => { const l = of(slot); return l[i % l.length]; };
  const outfit = (i) => ({ body: 'body_warm', face: pick('face', i), hair: pick('hair', i), top: pick('top', i), bottom: pick('bottom', i), shoes: pick('shoes', i),
    ...(i % 2 ? { hat: pick('hat', i) } : { glasses: pick('glasses', i) }), ...(i % 3 === 0 ? { back: pick('back', i) } : {}) });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  const frames = async (ms) => {   // เวลาระหว่างเฟรมจริง (rAF ของหน้า) ระหว่างที่ viewer เล่น idle
    const t = []; let last = performance.now(); let go = true;
    const f = (now) => { t.push(now - last); last = now; if (go) requestAnimationFrame(f); }; requestAnimationFrame(f);
    await wait(ms); go = false; t.shift(); t.sort((a, b) => a - b);
    const avg = t.reduce((a, b) => a + b, 0) / Math.max(1, t.length);
    return { fps: +(1000 / avg).toFixed(1), avgMs: +avg.toFixed(1), p95Ms: +(t[Math.floor(t.length * 0.95)] || 0).toFixed(1), samples: t.length };
  };
  const heap = () => { if (window.gc) window.gc(); return performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null; };
  for (const run of ['cold', 'warm']) {
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:' + Math.min(innerWidth, 420) + 'px;z-index:99999'; document.body.appendChild(d);
    const t0 = performance.now();
    const v = EQAvatar3D.mount(d, { api: EQApp.api, byId, outfit: outfit(0), controls: false });
    while (!v.isReady() && performance.now() - t0 < 60000) await wait(30);
    const r = { loadMs: Math.round(performance.now() - t0) };
    await wait(1500);
    Object.assign(r, await frames(4000));
    const st = v.stats(); Object.assign(r, { calls: st.calls, triangles: st.triangles, pixelRatio: st.pixelRatio, buffer: st.buffer, quality: st.quality, fpsCap: st.fpsCap });
    if (run === 'warm') {
      const g0 = v.stats(); const h0 = heap(); const sw = [];
      for (let i = 1; i <= 30; i++) { const s0 = performance.now(); await v.setOutfit(outfit(i)); sw.push(performance.now() - s0); }
      await v.setOutfit(outfit(0)); await wait(800);
      const g1 = v.stats(); const h1 = heap();
      sw.sort((a, b) => a - b);
      r.swaps = { n: 30, medianMs: Math.round(sw[15]), maxMs: Math.round(sw[29]), geometries: [g0.geometries, g1.geometries], textures: [g0.textures, g1.textures], heapMB: [h0, h1] };
      // เวลากู้คืน = จาก event webglcontextlost (เบราว์เซอร์ส่งมาเอง ช้าเร็วต่างกัน) จนตัวละครกลับมาครบ
      const c0 = performance.now(); let lostAt = 0; v._loseContext();
      while (performance.now() - c0 < 30000) { await wait(20); if (!lostAt && d.dataset.a3State === 'context-lost') lostAt = performance.now(); if (lostAt && d.dataset.a3State === 'ready') break; }
      r.contextRestoreMs = lostAt && d.dataset.a3State === 'ready' ? Math.round(performance.now() - lostAt) : 'FAIL';
      r.contextLostEventDelayMs = lostAt ? Math.round(lostAt - c0) : null;
    }
    out[run] = r; v.dispose(); d.remove();
  }
  out.tier = EQAvatar3D.tier();
  return out;
}"""
async def run(b, W, dpr, cpu):
    ctx = await b.new_context(viewport={'width': W, 'height': 844 if W < 700 else 900}, device_scale_factor=dpr, has_touch=W < 700, service_workers='block')
    pg = await ctx.new_page(); glb = {}
    async def onresp(r):
        if '/assets/avatar3d/glb/' in r.url:
            try: glb[r.url] = len(await r.body())
            except Exception: pass
    pg.on('response', lambda r: asyncio.ensure_future(onresp(r)))
    cdp = await ctx.new_cdp_session(pg)
    if cpu > 1: await cdp.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
    await pg.goto('http://localhost:3100'); await pg.wait_for_timeout(800)
    r = await pg.evaluate(REG, 'pf%d' % random.randint(1, 999999))
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", r['token']); await pg.reload(); await pg.wait_for_timeout(2500)
    await pg.wait_for_function("()=>window.EQAvatar3D"); res = await pg.evaluate(MEASURE)
    res['glbDownloadedKB'] = round(sum(glb.values()) / 1024); res['glbFiles'] = len(glb)
    await ctx.close(); return res
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=GL)
        for W, dpr, cpu, tag in ((390, 3, 1, 'iPhone-size DPR3'), (412, 2.625, 1, 'Android-size DPR2.625'), (1366, 1, 1, 'Desktop DPR1')):
            print(tag, json.dumps(await run(b, W, dpr, cpu), ensure_ascii=False), flush=True)
        await b.close()
asyncio.run(main())
