"""
ภาพหน้าจอจริงทุกหน้าหลัก (ใช้ทำ Visual Audit / ภาพก่อน-หลัง)
  python3 test/e2e/ui_shots.py <โฟลเดอร์> [default|christmas] [กว้างxสูง,...]
หน้า: login · home · path · profile · avatar · event hub · ranked · world chat · christmas · quiz
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1]; THEME = sys.argv[2] if len(sys.argv) > 2 else 'default'
SIZES = [tuple(map(int, s.split('x'))) for s in (sys.argv[3] if len(sys.argv) > 3 else '390x844,1280x800').split(',')]
os.makedirs(OUT, exist_ok=True)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
PAGES = [(p, p) for p in (os.environ.get('UI_PAGES') or 'home,path,profile,avatar,event,ranked,christmas,leaderboard').split(',')]

async def shoot(b, w, h):
  mobile = w < 600
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=mobile, has_touch=mobile, device_scale_factor=1)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(3500)
  await pg.screenshot(path=f'{OUT}/{THEME}_login_{w}.png')
  n = 'ui%d' % random.randint(100000, 999999); r = await pg.evaluate(REG, n)
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(5000)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  for name, route in PAGES:
    try:
      await pg.evaluate(f"()=>EQApp.navigateTo('{route}')"); await pg.wait_for_timeout(3000)
      await pg.screenshot(path=f'{OUT}/{THEME}_{name}_{w}.png')
      if name == 'home' or os.environ.get('UI_FULL'):
        await pg.screenshot(path=f'{OUT}/{THEME}_{name}_full_{w}.png', full_page=True)
    except Exception as e:
      print('skip', name, e)
  # แชทโลก (เปิดแผง)
  try:
    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(2000)
    btn = pg.locator('.gcm, #gcm, [data-gcm-open]').first
    if await btn.count(): await btn.click(); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=f'{OUT}/{THEME}_chat_{w}.png')
  except Exception as e: print('chat', e)
  print(w, 'errors', errs[:3])
  await ctx.close()

async def main():
  if THEME == 'christmas':
    sql("INSERT INTO season_settings (season_key, starts_at) VALUES ('christmas', NOW() - interval '1 day') ON CONFLICT (season_key) DO UPDATE SET starts_at = EXCLUDED.starts_at, enabled = TRUE, flags = '{}'::jsonb")
    await asyncio.sleep(31)
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    try:
      for w, h in SIZES: await shoot(b, w, h)
    finally:
      if THEME == 'christmas': sql("DELETE FROM season_settings WHERE season_key='christmas'")
      await b.close()
asyncio.run(main())
