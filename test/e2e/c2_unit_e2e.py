"""
v1.18.3 หมวด C2: บทเรียนเดียว (12 ขั้น) จบทั้ง Unit — E2E ที่ 390 / 820 / 1280
  python3 test/e2e/c2_unit_e2e.py [โฟลเดอร์ภาพ]
  ใช้ test/e2e/c2_run_lesson.js เรียนบท C2 ของ Unit ใหญ่สุดผ่าน API เดียวกับหน้าเว็บ แล้วตรวจหน้าเส้นทางการเรียนบนเบราว์เซอร์จริง
"""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
HERE = os.path.dirname(os.path.abspath(__file__))
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)

async def run(b, w, h):
  out = subprocess.check_output(['node', os.path.join(HERE, 'c2_run_lesson.js')], stderr=subprocess.DEVNULL).decode().strip().splitlines()[-1]
  d = json.loads(out)
  ok(d['steps'] == 12 and d['known'] == d['total'], f"[{w}] API: บทเดียว 12 ขั้น → รู้ {d['known']}/{d['total']} ({d['unitId']})")
  pg = await (await b.new_context(viewport={'width': w, 'height': h}, service_workers='block')).new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.evaluate("t=>localStorage.setItem('wq_token',t)", d['token'])
  await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(2000)
  await pg.evaluate("p=>EQApp.navigateTo(p)", 'path'); await pg.wait_for_timeout(1500)
  head = pg.locator('.path-level-head[data-level="C2"]')
  await head.wait_for(timeout=15000)
  if await head.get_attribute('aria-expanded') != 'true': await head.click(); await pg.wait_for_timeout(1200)
  btn = pg.locator(f'.path-unit[data-unit="{d["unitId"]}"]')
  await btn.first.wait_for(timeout=15000)
  meta = await btn.first.locator('.path-unit-meta').inner_text()
  ok(meta.startswith(f"{d['total']}/{d['total']}"), f'[{w}] เส้นทางแสดง {meta}')
  await btn.first.scroll_into_view_if_needed()
  await btn.first.screenshot(path=f'{OUT}/c2unit_{w}.png')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'[{w}] ไม่ล้นแนวนอน')
  ok(not errs, f'[{w}] ไม่มี JS error {errs[:2]}')

async def main():
  os.makedirs(OUT, exist_ok=True)
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w, h in [(390, 844), (820, 1180), (1280, 860)]: await run(b, w, h)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
