"""
v1.21.0 วาดทายศัพท์: รายการห้องที่เปิดอยู่ — E2E ที่ 390 / 820 / 1280
  - A สร้างห้อง (ค่าเริ่มต้น = แสดงในรายการ) · B เปิดหน้าวาดทายศัพท์ → เห็นห้องของ A (1/8 คน) → กด "เข้าร่วม" → อยู่ในห้องเดียวกัน (ไม่ต้องใส่รหัส)
  - C เห็นจำนวนคนอัปเดตเอง (2/8) ภายในไม่กี่วินาที · ห้องที่ไม่เลือก "แสดงในรายการห้อง" ไม่แสดง
  - เจ้าของห้องปิด "แสดงในรายการห้อง" ในห้อง → หายจากรายการ
  - ไม่ล้นแนวนอน · ไม่มี JS error
"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)

async def player(b, w, h, pre):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL)
  name = f'{pre}{random.randint(100000, 999999)}'
  tok = (await pg.evaluate(REG, name))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(timeout=90000); await pg.wait_for_timeout(1200)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(timeout=90000)
  await pg.wait_for_function("()=>window.EQApp && EQApp.rtConnected", timeout=60000)   # เครื่องทดสอบไม่มี GPU: หน้าแรก (3D) โหลดช้าเมื่อเปิดหลายหน้าพร้อมกัน
  return ctx, pg, name, errs

async def run(b, w, h):
  tag = f'[{w}]'
  ca, A, na, ea = await player(b, w, h, 'ra')
  cb, B, nb, eb = await player(b, w, h, 'rb')
  cc, C, nc, ec = await player(b, w, h, 'rc')
  # A สร้างห้อง (ค่าเริ่มต้นแสดงในรายการ)
  await A.evaluate("()=>EQApp.navigateTo('draw')"); await A.wait_for_selector('#dg-create', timeout=10000)
  ok(await A.locator('#dg-create input[name="public"]').is_checked(), f'{tag} สร้างห้อง: "แสดงในรายการห้อง" เลือกไว้แล้ว')
  await A.click('#dg-create button[type=submit]'); await A.wait_for_selector('.dg-lobby', timeout=10000)
  code = await A.evaluate("()=>EQDraw._state().R.code")
  # C สร้างห้องส่วนตัว
  await C.evaluate("()=>EQApp.navigateTo('draw')"); await C.wait_for_selector('#dg-create', timeout=10000)
  await C.locator('#dg-create input[name="public"]').uncheck(); await C.click('#dg-create button[type=submit]'); await C.wait_for_selector('.dg-lobby', timeout=10000)
  pcode = await C.evaluate("()=>EQDraw._state().R.code")
  await C.click('[data-dg-leave]') if await C.locator('[data-dg-leave]').count() else None
  await C.wait_for_timeout(600)
  # B เห็นห้องของ A
  await B.evaluate("()=>EQApp.navigateTo('draw')")
  row = B.locator(f'.dg-room:has([data-dg-room-join="{code}"])')
  await row.wait_for(timeout=10000)
  t = await row.inner_text()
  ok(na in t and '1/8' in t and 'รอผู้เล่น' in t, f'{tag} B เห็นห้องของ A (1/8 คน · รอผู้เล่น)')
  ok(await B.locator(f'[data-dg-room-join="{pcode}"]').count() == 0, f'{tag} ห้องส่วนตัวไม่แสดงในรายการ')
  ok(await B.evaluate(NOOVER), f'{tag} หน้ารายการห้องไม่ล้นแนวนอน')
  await B.screenshot(path=f'{OUT}/rooms_{w}.png', full_page=False)
  await row.locator('[data-dg-room-join]').click(); await B.wait_for_selector('.dg-lobby', timeout=10000)
  ok(await B.evaluate("()=>EQDraw._state().R && EQDraw._state().R.code") == code, f'{tag} กด "เข้าร่วม" → เข้าห้อง {code} โดยไม่ต้องใส่รหัส')
  try:
    await A.wait_for_function(f"()=>document.querySelector('.dg-lobby') && document.querySelector('.dg-lobby').innerText.includes('{nb}')", timeout=8000)
    ok(True, f'{tag} A เห็น B เข้าห้อง')
  except Exception: ok(False, f'{tag} A เห็น B เข้าห้อง')
  # C (ไม่ได้อยู่ห้องไหน) เห็นจำนวนอัปเดต
  await C.evaluate("()=>EQApp.navigateTo('draw')")
  try:
    await C.wait_for_function(f"()=>{{const b=document.querySelector('[data-dg-room-join=\"{code}\"]');return b&&b.closest('.dg-room').innerText.includes('2/8')}}", timeout=12000)
    ok(True, f'{tag} C เห็นห้องของ A มี 2/8 คน')
  except Exception: ok(False, f'{tag} C เห็นห้องของ A มี 2/8 คน')
  # A ปิด "แสดงในรายการห้อง" → หายจากรายการของ C ภายในรอบโหลดถัดไป
  await A.locator('#dg-settings input[name="public"]').uncheck(); await A.wait_for_timeout(500)
  try:
    await C.wait_for_function(f"()=>!document.querySelector('[data-dg-room-join=\"{code}\"]')", timeout=12000)
    ok(True, f'{tag} เจ้าของห้องปิดการแสดงในรายการ → ห้องหายจากรายการ')
  except Exception: ok(False, f'{tag} เจ้าของห้องปิดการแสดงในรายการ → ห้องหายจากรายการ')
  ok(not ea and not eb and not ec, f'{tag} ไม่มี JS error {(ea + eb + ec)[:2]}')
  for x in (ca, cb, cc): await x.close()

async def main():
  os.makedirs(OUT, exist_ok=True)
  async with async_playwright() as p:
    # เปิดเบราว์เซอร์ใหม่ทุกความกว้าง — เครื่องทดสอบเรนเดอร์ 3D ด้วย CPU (ไม่มี GPU) ภาระสะสมจนหน้าโหลดช้าเกินเวลา
    for w, h in [(390, 844), (820, 1180), (1280, 860)]:
      b = await p.chromium.launch()
      await run(b, w, h)
      await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  for f in FAILS: print(' -', f)
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
