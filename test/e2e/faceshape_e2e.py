"""v1.13.0 e2e — Wardrobe: แท็บ "รูปหน้า" · เลือกทรง → ตัวละคร 2D/3D เปลี่ยน · บันทึกแล้วอยู่หลังรีโหลด · ไม่มีปุ่ม "ไม่สวม"
ใช้: python3 test/e2e/faceshape_e2e.py [out_dir]  (เซิร์ฟเวอร์ที่ http://localhost:3100)"""
import asyncio, random, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
VIEWS = [('mobile', 390, 844), ('tablet', 820, 1180), ('desktop', 1280, 860)]
async def run(b, name, w, h, fails):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page(); errs = []
  pg.on('pageerror', lambda e: errs.append(str(e)))
  def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + f'[{name}] ' + m)
    if not c: fails.append(f'{name}: {m}')
  await pg.goto(URL); await pg.wait_for_timeout(400)
  tok = (await pg.evaluate(REG, 'fe%d' % random.randint(100000, 999999)))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2000)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
  await pg.evaluate("()=>EQApp.navigateTo('avatar')"); await pg.wait_for_timeout(1200)
  ed = pg.locator('#av-cats')
  if not await ed.count():
    btn = pg.locator('[data-av-edit], #av-edit, button:has-text("แต่งตัว")').first
    if await btn.count(): await btn.click(); await pg.wait_for_timeout(800)
  tab = pg.locator('.av-cat[data-slot="faceshape"]')
  ok(await tab.count() == 1, 'มีแท็บรูปหน้า')
  await tab.scroll_into_view_if_needed(); await tab.click(); await pg.wait_for_timeout(500)
  tiles = pg.locator('.av-tile[data-equip^="faceshape_"]')
  ok(await tiles.count() == 5, f'มี 5 ทรง (ได้ {await tiles.count()})')
  ok(await pg.locator('.av-tile-none').count() == 0, 'ไม่มีปุ่ม "ไม่สวม" ในหมวดรูปหน้า')
  ok(await pg.locator('.av-tile[data-equip="faceshape_round"].is-on').count() == 1, 'ค่าเริ่มต้น = หน้ากลม')
  await pg.locator('.av-tile[data-equip="faceshape_heart"]').click(); await pg.wait_for_timeout(1500)
  ok(await pg.locator('.av-tile[data-equip="faceshape_heart"].is-on').count() == 1, 'เลือกหน้ารูปหัวใจแล้ว')
  imgs = await pg.evaluate("()=>[...document.querySelectorAll('#av-stage img, #av-stage image')].map(i=>i.getAttribute('src')||i.getAttribute('href')||'')")
  probe = await pg.evaluate("()=>{const s=EQAvatar._stages().find(x=>x.box.id==='av-stage');return s&&s.v&&s.v.faceProbe?s.v.faceProbe():null}")
  if probe: ok(probe.get('shape') == 'faceshape_heart', '3D: ตัวละครเปลี่ยนเป็นหน้ารูปหัวใจ')
  else: ok(any('--heart' in x for x in imgs), '2D: ใช้ภาพ body หน้ารูปหัวใจ')
  # ไม่มีล้นแนวนอน
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), 'ไม่มีเลื่อนแนวนอน')
  await pg.locator('.av-tile[data-equip="faceshape_heart"]').scroll_into_view_if_needed()
  await pg.screenshot(path=f'{OUT}/faceshape_{name}.png')
  save = pg.locator('#av-save')
  if await save.count() and await save.is_enabled(): await save.click(); await pg.wait_for_timeout(1200)
  me = await pg.evaluate("()=>EQApp.api('/avatar/me')")
  ok(me['outfit'].get('faceshape') == 'faceshape_heart', 'บันทึกลงเซิร์ฟเวอร์แล้ว')
  ok(not errs, 'ไม่มี JS error ' + str(errs[:2]))
  await ctx.close()
async def main():
  fails = []
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for v in VIEWS: await run(b, *v, fails)
    await b.close()
  print('RESULT', 'ALL PASS' if not fails else fails); sys.exit(1 if fails else 0)
asyncio.run(main())
