"""v1.14.0 e2e — Vocabulary Quiz (Word Atlas): หน้าเลือกหมวด A–Z อย่างเดียว → ทายความหมาย 5 ตัวเลือกทันที
ใช้: python3 test/e2e/wordatlas_e2e.py [out_dir]  (เซิร์ฟเวอร์ที่ http://localhost:3100)"""
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
  nowide = lambda: pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1")
  await pg.goto(URL); await pg.wait_for_timeout(400)
  tok = (await pg.evaluate(REG, 'we%d' % random.randint(100000, 999999)))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2000)
  # ทางเข้าจากเส้นทางการเรียน
  await pg.evaluate("()=>EQApp.navigateTo('learn')"); await pg.wait_for_timeout(800)
  entry = pg.locator('.wa-entry')
  ok(await entry.count() == 1, 'มีทางเข้า Word Atlas ในเส้นทางการเรียน')
  await entry.click(); await pg.wait_for_selector('.wa-letter', timeout=15000)
  ok(await pg.locator('.wa-letter').count() == 26, 'A–Z ครบ 26 ตัว')
  ok(await pg.locator('.wa-menu-btn, .wa-search, .wa-wchips, .wa-continue').count() == 0, 'มีแค่หน้าเลือกหมวด A–Z (ไม่มีเมนู/ค้นหา/รายการอื่น)')
  ok('Vocabulary Quiz' in await pg.inner_text('#wa-title'), 'หัวข้อ Vocabulary Quiz')
  ok(await nowide(), 'หน้าหลักไม่ล้นแนวนอน')
  box = await pg.locator('.wa-letter').first.bounding_box()
  ok(box['width'] >= 44 and box['height'] >= 44, f'ปุ่มตัวอักษรกดง่าย ({int(box["width"])}x{int(box["height"])})')
  await pg.screenshot(path=f'{OUT}/atlas_{name}_hub.png')
  # เลือกตัวอักษร → ทายความหมายทันที
  await pg.locator('.wa-letter').nth(2).click(); await pg.wait_for_selector('.wk-opt', timeout=15000)
  ok(await pg.locator('.wk-opt').count() == 5, 'ตัวอักษร C → ทายความหมาย 5 ตัวเลือกทันที')
  ok('ตัวอักษร C' in await pg.inner_text('#screen-atlas'), 'บอกหมวดที่เลือก')
  exp0 = await pg.evaluate("()=>EQApp.api('/auth/me').then(r=>r.user.exp)")
  await pg.locator('.wk-opt').first.click(); await pg.wait_for_selector('[data-wa-next]')
  ok(await pg.locator('.wk-fb').count() == 1, 'มีผลตรวจหลังตอบ')
  exp1 = await pg.evaluate("()=>EQApp.api('/auth/me').then(r=>r.user.exp)")
  ok(exp1 > exp0, f'ได้ EXP บัญชีเดียวกัน ({exp0}→{exp1})')
  await pg.screenshot(path=f'{OUT}/atlas_{name}_quiz.png')
  await pg.click('[data-wa-next]'); await pg.wait_for_timeout(400)
  ok('ข้อ 2' in await pg.inner_text('#wa-qtitle'), 'ไปข้อถัดไปได้')
  ok(await nowide(), 'หน้าทายความหมายไม่ล้นแนวนอน')
  # ออก → กลับหน้าเลือกหมวด แล้วเลือกหมวดอื่น
  await pg.click('[data-wa-go="#/atlas"]'); await pg.wait_for_selector('.wa-letter')
  await pg.locator('.wa-letter', has_text='Z').first.click(); await pg.wait_for_selector('.wk-opt', timeout=15000)
  ok(await pg.locator('.wk-opt').count() == 5 and 'ตัวอักษร Z' in await pg.inner_text('#screen-atlas'), 'กลับมาเลือกหมวด Z ได้')
  ok(not errs, 'ไม่มี JS error ' + str(errs[:2]))
  await ctx.close()
async def main():
  fails = []
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for v in VIEWS: await run(b, *v, fails)
    await b.close()
  print('RESULT', 'ALL PASS' if not fails else fails); sys.exit(1 if fails else 0)
asyncio.run(main())
