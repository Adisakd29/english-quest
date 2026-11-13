"""
v1.18.3 ฝึกคำศัพท์ใน Unit = เล่นทีเดียวจบทั้ง Unit (E2E บนเบราว์เซอร์จริง 390 / 820 / 1280)
  python3 test/e2e/unit_session_e2e.py [โฟลเดอร์ภาพ]   (ใช้ psql อ่านเฉลยของรอบทดสอบจาก EQ_DB)
"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)

async def run(b, w, h):
  pg = await (await b.new_context(viewport={'width': w, 'height': h}, service_workers='block')).new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL)
  tok = (await pg.evaluate(REG, 'us%d' % random.randint(100000, 999999)))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(2000)
  await pg.evaluate("p=>EQApp.navigateTo(p)", 'learn'); await pg.wait_for_timeout(600)
  await pg.evaluate("p=>EQApp.navigateTo(p)", 'path'); await pg.wait_for_selector('.path-unit:not([disabled])', timeout=15000)
  btn = pg.locator('.path-unit:not([disabled])').first
  meta = await btn.locator('.path-unit-meta').inner_text()
  total = int(meta.split('/')[1].split()[0])
  await btn.click()
  await pg.wait_for_selector('#footprints .footprint', timeout=15000); await pg.wait_for_timeout(500)
  n = await pg.locator('#footprints .footprint').count()
  ok(n == total, f'[{w}] รอบเดียวครบทั้ง Unit: {n} ข้อ = {meta}')
  # ตอบครบทุกข้อ (อ่านเฉลยของรอบนี้จากฐานข้อมูลทดสอบ)
  sid = subprocess.check_output(['psql', DB, '-tAc', "SELECT id FROM vocab_lesson_sessions ORDER BY created_at DESC LIMIT 1"]).decode().strip()
  qs = json.loads(subprocess.check_output(['psql', DB, '-tAc', f"SELECT questions FROM vocab_lesson_sessions WHERE id = '{sid}'"]).decode())
  for i, q in enumerate(qs):
    await pg.wait_for_selector(f'#quiz-choices [data-key="{q["answerKey"]}"], #quiz-choices button', timeout=10000)
    sel = pg.locator(f'#quiz-choices [data-key="{q["answerKey"]}"]')
    if await sel.count(): await sel.first.click()
    else:
      ok(False, f'[{w}] หาปุ่มตัวเลือกไม่เจอ (ข้อ {i+1})'); break
    await pg.wait_for_selector('#btn-quiz-next:not(.hidden)', timeout=10000)
    if i == len(qs) // 2: await pg.screenshot(path=f'{OUT}/unit_session_{w}.png')
    for _ in range(3):   # ป๊อปอัประหว่างเล่น (เลเวลอัป/รางวัล) — ปิดแบบผู้ใช้ แล้วเล่นต่อ
      ov = pg.locator('.modal-overlay:visible')
      if not await ov.count(): break
      print(f'   [{w}] ป๊อปอัปข้อ {i+1}:', (await ov.first.inner_text())[:80].replace('\n', ' '))
      btns = ov.first.locator('button:visible')
      if await btns.count(): await btns.last.click()
      else: await pg.keyboard.press('Escape')
      await pg.wait_for_timeout(500)
    await pg.click('#btn-quiz-next'); await pg.wait_for_timeout(250)
  await pg.wait_for_timeout(1500)
  await pg.evaluate("p=>EQApp.navigateTo(p)", 'path'); await pg.wait_for_selector('.path-unit', timeout=15000); await pg.wait_for_timeout(800)
  meta2 = await pg.locator('.path-unit').first.locator('.path-unit-meta').inner_text()
  ok(meta2.startswith(f'{total}/{total}'), f'[{w}] หลังจบรอบเดียว: {meta2}')
  ok(not errs, f'[{w}] ไม่มี JS error {errs[:2]}')

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w, h in [(390, 844), (820, 1180), (1280, 860)]:
      await run(b, w, h)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL'); sys.exit(1 if FAILS else 0)

if __name__ == '__main__':
  asyncio.run(main())
