"""
v1.28.0 บอร์ดผู้สนับสนุน — E2E เบราว์เซอร์จริง 390 / 820 / 1280 / 1920
  - ผู้ดูแลนำเข้ารายการผ่านหน้าผู้ดูแลจริง (ตรวจก่อน → นำเข้า · ต้องใส่เหตุผล)
  - ผู้ใช้ทั่วไปเห็นบอร์ดบนหน้าแรก: เรียงยอดมาก→น้อย · มงกุฎอันดับ 1 · ดูทั้งหมด/ย่อ · ชื่อที่มี HTML แสดงเป็นข้อความ
  - ผู้ใช้ทั่วไปเรียก API ผู้ดูแลไม่ได้
  - ไม่ล้นแนวนอน · ไม่มี JS error · ภาพหน้าจอเก็บไว้ตรวจด้วยตา
  - ใช้ชื่อทดสอบ (E2E-…) และลบรายการทดสอบออกหลังจบ (ฐานข้อมูลทดสอบ)
"""
import asyncio, json, os, random, subprocess, sys, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
def call(method, path, token=None, body=None):
  req = urllib.request.Request(URL + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
  try:
    with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b'null')
  except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')
def user(prefix):
  n = '%s%d' % (prefix, random.randint(100000, 999999))
  st, r = call('POST', '/auth/register', body={'username': n, 'email': n + '@gmail.com', 'password': 'password123'})
  return n, r['token']
TEXT = '\n'.join([
  'E2E-Alpha | 120 | 2026-11-20 10:00 | พร้อมเพย์', 'E2E-Bravo | 80 | 2026-11-19 09:00', 'E2E-Charlie | 60.5 | 2026-11-18 08:00',
  'E2E-Delta 40', 'E2E-Echo | 30 | 2026-11-16 06:00', 'E2E-Foxtrot | 20 | 2026-11-15 05:00',
  'E2E-<b>Golf</b> | 10 | 2026-11-14 04:00', 'e2e-alpha | 500 | 2026-11-21 10:00'])
PRE = "()=>{document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())}"

async def ctx_for(b, w, h, tok):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 900, has_touch=w < 900)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.add_init_script(f"localStorage.setItem('wq_token','{tok}');localStorage.setItem('eq_pwa',JSON.stringify({{snoozeUntil:Date.now()+9e8}}))")
  return ctx, pg, errs

async def main():
  na, admin = user('spa'); sql(f"UPDATE users SET role = 'admin' WHERE username = '{na}'")
  nu, tok = user('spu')
  st, _ = call('GET', '/admin/supporters', tok); ok(st == 403, f'ผู้ใช้ทั่วไปเปิด API ผู้ดูแลไม่ได้ ({st})')
  sql("DELETE FROM supporter_donations WHERE display_name ILIKE 'E2E-%'")
  try:
    async with async_playwright() as p:
      b = await p.chromium.launch()
      # ผู้ดูแลนำเข้าผ่านหน้าเว็บจริง
      ctx, pg, errs = await ctx_for(b, 1280, 900, admin)
      await pg.goto(URL); await pg.wait_for_timeout(2500); await pg.evaluate(PRE)
      await pg.evaluate("()=>EQApp.navigateTo('admin')"); await pg.wait_for_selector('#admin-sp-root textarea', state='attached', timeout=15000)
      await pg.evaluate("()=>{const d=document.getElementById('admin-sp');d.open=true;d.scrollIntoView()}")
      await pg.fill('#sp-adm-text', TEXT); await pg.fill('#sp-adm-reason', 'E2E ทดสอบบอร์ดผู้สนับสนุน')
      await pg.click('[data-sp-import="dry"]'); await pg.wait_for_function("()=>/อ่านได้ 8 รายการ/.test(document.getElementById('sp-adm-out').textContent)", timeout=8000)
      ok(sql("SELECT COUNT(*) FROM supporter_donations WHERE display_name ILIKE 'E2E-%'") == '0', 'ตรวจก่อนนำเข้า: ยังไม่บันทึก')
      await pg.click('[data-sp-import="go"]'); await pg.wait_for_timeout(1500)
      ok(sql("SELECT COUNT(*) FROM supporter_donations WHERE display_name ILIKE 'E2E-%'") == '8', 'นำเข้าผ่านหน้าผู้ดูแล 8 รายการ')
      ok(sql("SELECT COUNT(*) FROM supporter_admin_logs WHERE reason = 'E2E ทดสอบบอร์ดผู้สนับสนุน'") != '0', 'บันทึก Audit Log')
      await pg.screenshot(path=f'{OUT}/sp_admin_1280.png', full_page=False)
      ok(not errs, f'หน้าผู้ดูแลไม่มี JS error {errs[:2]}'); await ctx.close()
      for w, h in ((390, 844), (820, 1180), (1280, 900), (1920, 1080)):
        tag = f'[{w}]'
        ctx, pg, errs = await ctx_for(b, w, h, tok)
        await pg.goto(URL); await pg.wait_for_timeout(2500); await pg.evaluate(PRE)
        await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_selector('#sp-board .sp-row', timeout=10000)
        names = await pg.locator('#sp-board .sp-name').all_inner_texts()
        e2e = [x for x in names if x.lower().startswith('e2e-')]
        ok(e2e[:2] == ['e2e-alpha', 'E2E-Bravo'] or e2e[:2] == ['E2E-Alpha', 'E2E-Bravo'], f'{tag} เรียงยอดรวม (Alpha 620 ก่อน Bravo 80) {e2e[:3]}')
        ok(await pg.locator('#sp-board .sp-row').first.locator('.sp-rank.is-1').count() == 1, f'{tag} อันดับ 1 มีมงกุฎ')
        ok(await pg.locator('#sp-board img').count() == 0, f'{tag} ชื่อที่มี HTML ไม่ถูกแปลงเป็นแท็ก')
        rows0 = await pg.locator('#sp-board .sp-row').count()
        more = pg.locator('[data-sp-more]')
        if await more.count():
          await pg.locator('#sp-board').scroll_into_view_if_needed(); await more.click(); await pg.wait_for_timeout(200)
          ok(await pg.locator('#sp-board .sp-row').count() > rows0, f'{tag} ดูทั้งหมด ({rows0} → {await pg.locator("#sp-board .sp-row").count()})')
        ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} ไม่ล้นแนวนอน')
        ov = await pg.evaluate("()=>[...document.querySelectorAll('#sp-board .sp-row')].filter(r=>r.scrollWidth>r.clientWidth+1).length")
        ok(ov == 0, f'{tag} แถวไม่ล้น ({ov})')
        ok(await pg.locator('#admin-sp-root').evaluate("e=>!e.offsetParent") , f'{tag} ผู้ใช้ทั่วไปไม่เห็นส่วนผู้ดูแล')
        await pg.locator('#sp-board').scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
        await pg.locator('#sp-board').screenshot(path=f'{OUT}/sp_board_{w}.png')
        ok(not errs, f'{tag} ไม่มี JS error {errs[:2]}'); await ctx.close()
      await b.close()
  finally:
    sql("DELETE FROM supporter_donations WHERE display_name ILIKE 'E2E-%'")
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  for f in FAILS: print(' -', f)
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
