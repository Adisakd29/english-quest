"""
v1.18.4 จุดแดงคำขอเป็นเพื่อน — E2E บนเบราว์เซอร์จริง 390 / 820 / 1280
  - อยู่หน้าแรก มีคนแอดมา -> จุดแดงบนเมนู "เล่น" ขึ้นทันที (ผ่านการเชื่อมต่อสด) + toast บอกชื่อผู้ส่ง
  - แตะ toast -> หน้าเพื่อน · จุดแดงบนเมนูหาย · ตัวเลขคำขอค้างในหน้าเพื่อน/การ์ดเพื่อนยังอยู่
  - รีเฟรช: คำขอที่เห็นแล้วไม่ขึ้นจุดแดงซ้ำ · คำขอใหม่อีกคน -> ขึ้นใหม่ 1
  - ตอบรับ/ปฏิเสธครบ -> ตัวเลขทุกที่หาย
  python3 test/e2e/friend_badge_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
SEND = """async ([t,n])=>{const r=await fetch('/api/friends/request',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({username:n})});return r.status}"""
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)
rid = lambda p: '%s%d' % (p, random.randint(100000, 999999))

async def badge(pg, i):
  return await pg.evaluate("id=>{const e=document.getElementById(id);return e&&!e.classList.contains('hidden')&&e.getClientRects().length?e.textContent:null}", i)

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL)
  me, s1, s2 = rid('fm'), rid('fs'), rid('ft')
  mt = (await pg.evaluate(REG, me))['token']; t1 = (await pg.evaluate(REG, s1))['token']; t2 = (await pg.evaluate(REG, s2))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", mt); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(2500)
  await pg.evaluate("()=>document.querySelectorAll('#toast-container .toast').forEach(t=>t.remove())")
  ok(await badge(pg, 'nav-play-badge') is None, f'{tag} เริ่มต้นไม่มีจุดแดง')
  # มีคนแอดมาขณะอยู่หน้าแรก
  ok(await pg.evaluate(SEND, [t1, me]) == 200, f'{tag} ส่งคำขอ')
  try: await pg.wait_for_function("()=>{const e=document.getElementById('nav-play-badge');return e&&!e.classList.contains('hidden')}", timeout=8000)
  except Exception: pass
  ok(await badge(pg, 'nav-play-badge') == '1', f'{tag} จุดแดงบนเมนู "เล่น" ขึ้นทันที')
  box = await pg.evaluate("()=>{const b=document.getElementById('nav-play-badge').getBoundingClientRect();const n=document.querySelector('.nav-item[data-nav=play]').getBoundingClientRect();return {in:b.left>=n.left-2&&b.right<=n.right+2&&b.top>=n.top-6&&b.bottom<=n.bottom+2}}")
  ok(box['in'], f'{tag} จุดแดงอยู่ในปุ่มเมนู')
  sr = await pg.evaluate("()=>document.querySelector('.nav-item[data-nav=play]').textContent.replace(/\\s+/g,' ')")
  ok('คำขอเป็นเพื่อนใหม่ 1 รายการ' in sr, f'{tag} โปรแกรมอ่านหน้าจออ่านได้')
  toast = pg.locator('#toast-container .toast-action')
  ok(await toast.count() == 1 and s1 in await toast.inner_text(), f'{tag} toast บอกชื่อผู้ส่ง')
  await toast.click(timeout=5000); await pg.wait_for_timeout(1500)   # toast ปิดเองใน 7 วินาที — แตะทันที (ถ่ายภาพจุดแดงทีหลังตอนคำขอที่ 2)
  ok(await pg.evaluate("()=>!document.getElementById('screen-friends').classList.contains('hidden')"), f'{tag} แตะ toast -> หน้าเพื่อน')
  ok(await badge(pg, 'nav-play-badge') is None, f'{tag} เปิดหน้าเพื่อนแล้วจุดแดงบนเมนูหาย')
  ok(await pg.evaluate("()=>!document.getElementById('friend-requests-section').classList.contains('hidden')&&document.getElementById('requests-count').textContent") == '1', f'{tag} หน้าเพื่อนแสดงคำขอค้าง (1)')
  # รีเฟรช: เห็นแล้วไม่ขึ้นซ้ำ · การ์ดเพื่อนยังบอกว่ามีคำขอค้าง
  await pg.goto(URL + '/#/play'); await pg.reload(); await pg.wait_for_timeout(2500)
  ok(await badge(pg, 'nav-play-badge') is None, f'{tag} รีเฟรชแล้วคำขอที่เห็นแล้วไม่ขึ้นจุดแดงซ้ำ')
  ok(await badge(pg, 'nav-friend-badge') == '1', f'{tag} การ์ด "เพื่อน" ในหน้าเล่นยังบอกคำขอค้าง 1')
  # คำขอใหม่อีกคน -> ขึ้นใหม่ 1 (ไม่รวมอันที่เห็นแล้ว)
  await pg.evaluate(SEND, [t2, me])
  try: await pg.wait_for_function("()=>{const e=document.getElementById('nav-play-badge');return e&&!e.classList.contains('hidden')}", timeout=8000)
  except Exception: pass
  await pg.locator('.nav-item[data-nav=play]').screenshot(path=f'{OUT}/fr_badge_nav_{w}.png')
  ok(await badge(pg, 'nav-play-badge') == '1' and await badge(pg, 'nav-friend-badge') == '2', f'{tag} คำขอใหม่: เมนู 1 · การ์ดเพื่อน 2')
  # ตอบรับ/ปฏิเสธครบ -> หายทุกที่
  await pg.evaluate("p=>EQApp.navigateTo(p)", 'friends'); await pg.wait_for_timeout(1500)
  await pg.locator('[data-accept]').first.click(); await pg.wait_for_timeout(1200)
  await pg.locator('[data-decline]').first.click(); await pg.wait_for_timeout(1500)
  ok(all([await badge(pg, i) is None for i in ['nav-play-badge', 'nav-friend-badge']]) and await pg.evaluate("()=>document.getElementById('friend-requests-section').classList.contains('hidden')"), f'{tag} ตอบครบแล้วตัวเลขหายทุกที่')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} ไม่ล้นแนวนอน')
  ok(not errs, f'{tag} ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def main():
  os.makedirs(OUT, exist_ok=True)
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w, h in [(390, 844), (820, 1180), (1280, 860)]: await run(b, w, h)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  for f in FAILS: print(' -', f)
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
