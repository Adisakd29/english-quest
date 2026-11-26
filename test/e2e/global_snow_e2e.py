"""
v1.26.0 Global Snow + Snow-covered Navigation + Overlay ไม่ทับกัน (E2E เบราว์เซอร์จริง)
  เซิร์ฟเวอร์: python3 ... (ต้องรันด้วย SEASON_DISABLE=loykrathong,christmas เพื่อทดสอบ "ธีมปกติ" ได้จริง — สคริปต์ตรวจเองและแจ้ง)
  1) ธีมปกติ (ระบบ/สว่าง/มืด/พาสเทล) + ธีมพิเศษ (ฮาโลวีน/ดาราศาสตร์ ถ้ามีในเครื่อง) → หิมะตก (ลูปเดิน) · canvas เดียว (ไม่สร้างซ้ำเมื่อเปลี่ยนธีม)
  2) เปลี่ยนหน้า home → path → game(แบบฝึก) → profile → home: ลูปเดิมเดินต่อ ไม่ซ้อน (อัตราเฟรมไม่เพิ่มเป็นเท่าตัว) · หน้าแบบฝึก = ระดับ low
  3) ตั้งค่า: ปิด → ไม่มี canvas/สันหิมะ · ความหนาแน่น ต่ำ/สูง เปลี่ยนจำนวนเกล็ด · จำค่าหลังรีโหลด
  4) prefers-reduced-motion → ภาพนิ่ง (ลูปหยุด)
  5) หิมะไม่รับการแตะ: elementFromPoint บนปุ่ม = ปุ่ม · canvas อยู่หลังเนื้อหา (z-index -1)
  6) สันหิมะเกาะแถบบน/เมนูล่าง (ภาพ SVG) · ไม่บังข้อความ/ไอคอนในแถบ
  7) มือถือ 390: แถบแชทไม่ลอยทับเนื้อหา/เมนูล่าง · องค์ประกอบลอย (เมนูล่าง/ปุ่มเพลง/Popup) ไม่ทับกัน
  python3 test/e2e/global_snow_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/gsnow'; os.makedirs(OUT, exist_ok=True)
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
ST = "()=>EQSnowFx.stats()"

async def login(b, w, h, power='full', **kw):
  mobile = w < 600
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=mobile, has_touch=mobile, **kw)
  # เครื่องทดสอบวาดภาพด้วย CPU (SwiftShader) → หิมะเข้าโหมดประหยัดอัตโนมัติ · ทดสอบโหมดปกติด้วยการบังคับ 'full' (ทดสอบโหมดประหยัดแยกใน low_power())
  if power: await ctx.add_init_script(f"try{{localStorage.setItem('eq_snow_power','{power}')}}catch(e){{}}")
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(2500)
  r = await pg.evaluate(REG, 'gs%d' % random.randint(100000, 999999))
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(4500)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  return ctx, pg, errs

async def frames_per_sec(pg, ms=2000):
  a = (await pg.evaluate(ST))['frames']; await pg.wait_for_timeout(ms); b = (await pg.evaluate(ST))['frames']
  return (b - a) * 1000 / ms

async def desktop(b):
  ctx, pg, errs = await login(b, 1280, 800)
  skin = await pg.evaluate("()=>document.documentElement.dataset.skin||null")
  if skin: print(f'NOTE ธีมเทศกาลทำงานอยู่ ({skin}) — รันเซิร์ฟเวอร์ด้วย SEASON_DISABLE=loykrathong,christmas เพื่อทดสอบธีมปกติ')
  await pg.evaluate("()=>{document.querySelector('#xm-snow').dataset.probe='1'}")
  for th in ('system', 'light', 'dark', 'cute'):
    await pg.evaluate(f"()=>{{const b=document.querySelector('[data-theme-choice=\"{th}\"]'); if(b) b.click(); else localStorage.setItem('eq_theme','{th}')}}")
    await pg.wait_for_timeout(900)
    s = await pg.evaluate(ST)
    tone = await pg.evaluate("()=>document.documentElement.dataset.snowTone")
    same = await pg.evaluate("()=>document.querySelector('#xm-snow')&&document.querySelector('#xm-snow').dataset.probe==='1'")
    ok(s['running'] and s['canvases'] >= 1 and same, f'ธีม {th} (skin={skin}): หิมะตก · ลูปเดิน · canvas เดิม (ไม่สร้างซ้ำ) · โทน {tone} · {s["mode"]}')
    if th in ('light', 'cute') and not skin: ok(tone == 'light', f'ธีม {th}: เกล็ดโทนสว่าง (มองเห็นบนพื้นขาว)')
    if th == 'dark' and not skin: ok(tone == 'dark', 'ธีมมืด: เกล็ดขาว')
    await pg.screenshot(path=f'{OUT}/theme_{th}_1280.png')
  # หิมะไม่รับการแตะ / อยู่หลังเนื้อหา
  cs = await pg.evaluate("()=>{const c=document.getElementById('xm-snow');const s=getComputedStyle(c);return [s.pointerEvents,s.zIndex,s.position]}")
  ok(cs == ['none', '-1', 'fixed'], f'canvas หิมะ: ไม่รับการแตะ · อยู่หลังเนื้อหา {cs}')
  await pg.locator('.hl-act').first.scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
  hit = await pg.evaluate("()=>{const b=document.querySelector('.hl-act')||document.querySelector('button');const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!(e&&(e===b||b.contains(e)))}")
  ok(hit, 'คลิกปุ่มได้ตามปกติ (หิมะไม่บัง)')
  # สันหิมะ
  cap = await pg.evaluate("()=>[getComputedStyle(document.getElementById('hud'),'::after').backgroundImage,getComputedStyle(document.getElementById('bottom-nav'),'::before').backgroundImage]")
  ok(all('/img/snow/' in c for c in cap), f'สันหิมะเกาะแถบบน + แถบข้าง (SVG) {[c[-30:] for c in cap]}')
  # สันหิมะไม่บังข้อความ/ไอคอนในแถบบน
  cov = await pg.evaluate("""()=>{const out=[];document.querySelectorAll('#hud button, #hud .hud-username, #hud .hud-exp-label').forEach(el=>{const r=el.getBoundingClientRect();if(!r.width)return;
    const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(!(e&&(e===el||el.contains(e))))out.push(el.className||el.id)});return out}""")
  ok(cov == [], f'ข้อความ/ปุ่มในแถบบนไม่ถูกสันหิมะบัง {cov}')
  # เปลี่ยนหน้า: ลูปเดียว
  f0 = await frames_per_sec(pg)
  levels = {}
  for route in ('path', 'game', 'profile', 'home'):
    await pg.evaluate(f"()=>EQApp.navigateTo('{route}')"); await pg.wait_for_timeout(1500)
    levels[route] = (await pg.evaluate(ST))['level']
  f1 = await frames_per_sec(pg)
  s = await pg.evaluate(ST)
  ok(s['running'] and f1 < f0 * 1.5 + 3 and s['canvases'] <= 2, f'เปลี่ยนหน้า 4 ครั้ง: ลูปเดิมเดินต่อ ไม่ซ้อน (เฟรม/วิ {f0:.0f} → {f1:.0f}) · canvas {s["canvases"]}')
  lv = await pg.evaluate("()=>['screen-game','screen-grammar-quiz','screen-toeic-play','screen-ranked-match','screen-gl-lesson','screen-home','screen-path'].map(i=>EQSnowFx._levelFor(i))")
  ok(lv[:5] == ['low'] * 5 and lv[5] == 'full', f'หน้าแบบฝึก/Quiz/บทเรียน = ระดับ low (ไม่ปิด) · หน้าแรก full {lv} · เส้นทางที่เปิดจริง {levels}')
  # ตั้งค่า
  await pg.evaluate("()=>EQApp.navigateTo('profile')"); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>{const t=document.getElementById('pf-tab-settings'); if(t) t.click()}"); await pg.wait_for_timeout(600)
  ok(await pg.locator('#snow-settings').count() == 1, 'มีการ์ดตั้งค่า "หิมะตก" ในหน้าโปรไฟล์ → ตั้งค่า')
  await pg.screenshot(path=f'{OUT}/settings_1280.png')
  await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(1200)
  n_med = sum((await pg.evaluate(ST))['active'])
  await pg.evaluate("()=>EQSnowFx.setPrefs({density:'high'})"); await pg.wait_for_timeout(400)
  n_hi = sum((await pg.evaluate(ST))['active'])
  await pg.evaluate("()=>EQSnowFx.setPrefs({density:'low'})"); await pg.wait_for_timeout(400)
  n_lo = sum((await pg.evaluate(ST))['active'])
  ok(n_lo < n_med < n_hi, f'ความหนาแน่น ต่ำ/กลาง/สูง = {n_lo}/{n_med}/{n_hi} เกล็ด')
  await pg.reload(); await pg.wait_for_timeout(4000)
  ok((await pg.evaluate("()=>EQSnowFx.prefs()"))['density'] == 'low', 'รีโหลดแล้วจำความหนาแน่น')
  await pg.evaluate("()=>EQSnowFx.setPrefs({on:false})"); await pg.wait_for_timeout(500)
  off = await pg.evaluate("()=>({c:document.querySelectorAll('#xm-snow,#xm-snow-fg').length,snow:document.documentElement.dataset.snow,cap:getComputedStyle(document.getElementById('hud'),'::after').backgroundImage})")
  ok(off['c'] == 0 and off['snow'] == 'off' and off['cap'] == 'none', f'ปิดหิมะ → ไม่มี canvas และไม่มีสันหิมะ {off}')
  await pg.reload(); await pg.wait_for_timeout(4000)
  ok(await pg.evaluate("()=>document.querySelectorAll('#xm-snow').length") == 0, 'รีโหลดแล้วยังปิดอยู่ (จำค่า)')
  await pg.evaluate("()=>EQSnowFx.setPrefs({on:true, density:'medium'})"); await pg.wait_for_timeout(600)
  ok((await pg.evaluate(ST))['running'], 'เปิดกลับ → หิมะตกต่อทันที (ไม่ต้องรีโหลด)')
  ok(not errs, f'ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()
  # ลดการเคลื่อนไหว
  ctx, pg, errs = await login(b, 1280, 800, reduced_motion='reduce')
  s = await pg.evaluate(ST)
  ok(not s['running'] and s['canvases'] >= 1 and 'still' in s['mode'], f'prefers-reduced-motion → หิมะเป็นภาพนิ่ง (ไม่เคลื่อนไหว) {s["mode"]}')
  await ctx.close()

async def premium(b):
  # ธีมพิเศษ (ถ้าเปิดใช้ในเครื่องได้) — ตรวจว่าหิมะยังทำงาน
  ctx, pg, errs = await login(b, 1280, 800)
  uname = await pg.evaluate("()=>EQApp.user.username")
  for tid in ('halloween-2026', 'astronomy', 'loykrathong-2026'):   # ปลดล็อกธีมให้ผู้ใช้ทดสอบ (ฐานข้อมูลพัฒนา)
    sql(f"INSERT INTO user_themes (user_id, theme_id, source) SELECT id, '{tid}', 'e2e' FROM users WHERE username = '{uname}' ON CONFLICT DO NOTHING")
  for tid, sk in (('halloween-2026', 'halloween'), ('astronomy', 'astronomy'), ('loykrathong-2026', 'loykrathong')):
    await pg.evaluate(f"()=>{{localStorage.setItem('eq_theme','{tid}')}}"); await pg.reload(); await pg.wait_for_timeout(5000)
    got = await pg.evaluate("()=>document.documentElement.dataset.skin||null")
    s = await pg.evaluate(ST)
    if got == sk: ok(s['running'], f'ธีม {sk}: หิมะตก (ร่วมกับเอฟเฟกต์ของธีม)'); await pg.screenshot(path=f'{OUT}/theme_{sk}_1280.png')
    else: print(f'NOTE ธีม {sk} ต้องปลดล็อกก่อน (ผู้ใช้ทดสอบไม่มี) — ข้าม (ได้ {got})')
  await ctx.close()

async def low_power(b):
  # v1.26.3 เครื่องที่ไม่มี GPU (ตรวจจาก WebGL renderer) → โหมดประหยัดทันที: canvas ครึ่งความละเอียด · ไม่มีชั้นหน้า · ยังตก (20 fps)
  ctx, pg, errs = await login(b, 1280, 800, power=None)
  await pg.evaluate("()=>EQApp.navigateTo('learn')"); await pg.wait_for_timeout(2500)   # หน้าที่ไม่มีตัวละคร 3D (WebGL บน CPU กินเวลาเฟรมทั้งหน้า)
  s0 = await pg.evaluate(ST); await pg.wait_for_timeout(2000); s1 = await pg.evaluate(ST)
  fps = (s1['frames'] - s0['frames']) / 2
  ok(s1['lowPower'] and s1['dpr'] <= 0.5 and s1['canvases'] == 1 and s1['running'] and 20 <= fps <= 34, f'เครื่องไม่มี GPU ({s1.get("renderer")}): โหมดประหยัด · dpr {s1["dpr"]} · canvas {s1["canvases"]} · หิมะยังตก {fps:.0f} fps')
  ok(not errs, f'โหมดประหยัด: ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def mobile(b):
  ctx, pg, errs = await login(b, 390, 844)
  await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(2500)
  pos = await pg.evaluate("()=>getComputedStyle(document.getElementById('gcm')).position")
  ok(pos == 'fixed', f'[390] แชทโลกย่อลอยเหนือเมนูล่าง (v1.26.3 แบบเดิม) ({pos})')
  # สแกนทั้งหน้า: องค์ประกอบ fixed ที่มองเห็นต้องไม่ทับกัน
  worst = []
  for y in range(0, 4000, 200):
    await pg.evaluate(f"()=>window.scrollTo(0,{y})"); await pg.wait_for_timeout(80)
    ov = await pg.evaluate("""()=>{const els=[...document.querySelectorAll('#bottom-nav, #xm-player, .gcm, .pwa-banner, .install-banner, .ev-popup, #toast-container > *')].filter(e=>{const s=getComputedStyle(e);return (s.position==='fixed'||e.closest('#hud'))&&s.visibility!=='hidden'&&s.display!=='none'&&e.getBoundingClientRect().width>0});
      const out=[];for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){if(els[i].contains(els[j])||els[j].contains(els[i]))continue;const a=els[i].getBoundingClientRect(),c=els[j].getBoundingClientRect();
      const ix=Math.max(0,Math.min(a.right,c.right)-Math.max(a.left,c.left)),iy=Math.max(0,Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top));if(ix*iy>4)out.push((els[i].id||els[i].className)+' × '+(els[j].id||els[j].className))}return out}""")
    worst += ov
  ok(not worst, f'[390] เลื่อนทั้งหน้า: องค์ประกอบลอยไม่ทับกัน {sorted(set(worst))[:4]}')
  cap = await pg.evaluate("()=>getComputedStyle(document.getElementById('bottom-nav'),'::before').backgroundImage")
  ok('/img/snow/cap-pile' in cap, '[390] หิมะกองบนขอบเมนูล่าง')
  # ไอคอน/ข้อความในเมนูล่างไม่ถูกหิมะบัง
  cov = await pg.evaluate("""()=>[...document.querySelectorAll('#bottom-nav .nav-item')].filter(el=>{const r=el.getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !(e&&(e===el||el.contains(e)))}).length""")
  ok(cov == 0, f'[390] ปุ่มเมนูล่างกดได้ ไม่ถูกหิมะบัง ({cov})')
  await pg.evaluate("()=>window.scrollTo(0,0)"); await pg.wait_for_timeout(300)
  await pg.screenshot(path=f'{OUT}/home_390.png', full_page=True)
  ok(not errs, f'[390] ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    await desktop(b); await premium(b); await low_power(b); await mobile(b)
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
