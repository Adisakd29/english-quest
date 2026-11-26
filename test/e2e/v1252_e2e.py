"""
v1.25.2 — E2E: เซสชัน httpOnly cookie · ปุ่มเพลงไม่บังแชท (มือถือ) · Photo booth บน iPhone
  1) สมัครผ่านฟอร์มจริง → ไม่มี token ใน localStorage · document.cookie อ่าน eq_session ไม่ได้ (httpOnly) · รีโหลดแล้วยังเข้าสู่ระบบ
     → ออกจากระบบ → รีโหลดเป็นหน้าเข้าสู่ระบบ (cookie ถูกลบจริง)
  2) ผู้ใช้เดิมที่มี token ใน localStorage (แอปรุ่นก่อน) → เปิดแอป → ย้ายเป็น cookie อัตโนมัติ · token ถูกลบออกจาก localStorage
  3) 390×844 (ช่วงคริสต์มาส): เลื่อนหน้าแรกให้แถบแชทโลกย่อมาอยู่ตำแหน่งปุ่มเพลง → ปุ่มเพลงยกขึ้น ไม่ทับกัน
  4) iPhone (User-Agent iOS · ไม่มีแผ่นแชร์ไฟล์): กดบันทึกรูป → แสดงรูปให้กดค้างบันทึก
  python3 test/e2e/v1252_e2e.py [โฟลเดอร์ภาพ]  (เซิร์ฟเวอร์ :3100 · ฐานข้อมูล eq_dev)
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'; os.makedirs(OUT, exist_ok=True)
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
async def close_modals(pg):
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)

async def session(b):
  ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(3000)
  name = 'ck%d' % random.randint(1000000, 9999999)
  await pg.locator('#screen-auth .tab-btn:not(.active)').first.click(); await pg.wait_for_timeout(300)
  form = pg.locator('#screen-auth form:visible').first
  for inp in await form.locator('input:visible').all():
    t = (await inp.get_attribute('type')) or 'text'; nm = ((await inp.get_attribute('name')) or (await inp.get_attribute('id')) or '').lower()
    if t == 'checkbox': await inp.check()
    elif t == 'password': await inp.fill('password123')
    elif t == 'email' or 'mail' in nm: await inp.fill(name + '@gmail.com')
    else: await inp.fill(name)
  await form.locator('button[type=submit]').click()
  for _ in range(40):
    if await pg.evaluate("()=>!!(window.EQApp&&EQApp.user)"): break
    await pg.wait_for_timeout(500)
  st = await pg.evaluate("()=>({ls:Object.keys(localStorage).filter(k=>/token/i.test(k)||/^ey/.test(localStorage.getItem(k)||'')),ck:document.cookie,flag:localStorage.getItem('eq_has_session')})")
  ok(st['ls'] == [] and st['flag'] == '1', f'สมัครแล้ว: ไม่มี token ใน localStorage {st["ls"]}')
  ok('eq_session' not in st['ck'], 'JavaScript อ่าน cookie เซสชันไม่ได้ (httpOnly)')
  cks = await ctx.cookies()
  c = next((x for x in cks if x['name'] == 'eq_session'), None)
  ok(c and c['httpOnly'] and c['sameSite'] == 'Strict' and c['path'] == '/api', f'cookie: httpOnly · SameSite=Strict · Path=/api ({c and {k: c[k] for k in ("httpOnly", "sameSite", "path")}})')
  await pg.reload(); await pg.wait_for_timeout(4500); await close_modals(pg)
  ok(await pg.evaluate("()=>!!(EQApp.user)") and await pg.locator('#screen-auth:not(.hidden)').count() == 0, 'รีโหลดแล้วยังเข้าสู่ระบบอยู่ (จาก cookie)')
  await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(2000)
  r = await pg.evaluate("()=>EQApp.api('/avatar/me').then(()=>'ok').catch(e=>e.message)")
  ok(r == 'ok', f'เรียก API ระหว่างใช้งานได้ปกติ ({r})')
  r = await pg.evaluate("()=>fetch('/api/auth/me',{credentials:'same-origin'}).then(x=>x.status)")
  ok(r == 403, f'คำขอที่ไม่มี header กัน CSRF ถูกปฏิเสธ ({r})')
  await pg.evaluate("()=>document.getElementById('btn-logout').click()"); await pg.wait_for_timeout(1500)
  await pg.reload(); await pg.wait_for_timeout(3500)
  ok(await pg.locator('#screen-auth:not(.hidden)').count() == 1, 'ออกจากระบบ → รีโหลดเป็นหน้าเข้าสู่ระบบ (cookie ถูกลบ)')
  ok(not any(x['name'] == 'eq_session' for x in await ctx.cookies()), 'ไม่มี cookie เซสชันเหลือ')
  # ผู้ใช้เดิม: token ใน localStorage → ย้ายเป็น cookie
  n2 = 'lg%d' % random.randint(100000, 999999); reg = await pg.evaluate(REG, n2)
  await ctx.clear_cookies()
  await pg.evaluate("(t)=>{localStorage.clear();localStorage.setItem('wq_token',t)}", reg['token'])
  await pg.reload(); await pg.wait_for_timeout(4500); await close_modals(pg)
  st = await pg.evaluate("()=>({u:EQApp.user&&EQApp.user.username,t:localStorage.getItem('wq_token')})")
  ok(st['u'] == n2 and st['t'] is None, f'ผู้ใช้แอปรุ่นก่อน: เข้าสู่ระบบต่อได้ + ลบ token ออกจาก localStorage {st}')
  ok(any(x['name'] == 'eq_session' for x in await ctx.cookies()), 'ผู้ใช้แอปรุ่นก่อน: ได้ cookie เซสชันแทน')
  ok(not errs, f'ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def mobile(b):
  ctx = await b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block', is_mobile=True, has_touch=True,
                            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1')
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(2500)
  r = await pg.evaluate(REG, 'mb%d' % random.randint(100000, 999999))
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(5000); await close_modals(pg)
  await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(3000)
  ok(await pg.locator('#xm-player').count() == 0, '[390] v1.27.1 ไม่มีปุ่มเพลงคริสต์มาสบนจอ (ควบคุมในเมนูลำโพง) → ไม่มีทางลอยทับแชท')
  worst = 0
  for y in range(0, 2600, 60):
    await pg.evaluate(f"()=>window.scrollTo(0,{y})"); await pg.wait_for_timeout(120)
    ov = await pg.evaluate("""()=>{const el=document.getElementById('xm-player');if(!el)return 0;if(getComputedStyle(el).visibility==='hidden')return 0;const p=el.getBoundingClientRect();const g=document.querySelector('.gcm');if(!g)return 0;const r=g.getBoundingClientRect();
      const ix=Math.max(0,Math.min(p.right,r.right)-Math.max(p.left,r.left)),iy=Math.max(0,Math.min(p.bottom,r.bottom)-Math.max(p.top,r.top));return ix*iy}""")
    worst = max(worst, ov)
  # v1.26.0 ปุ่มเพลงฝังในแถบบน + แชทย่อเป็นการ์ดในหน้า → ไม่มีองค์ประกอบลอยทับกัน (แชทเลื่อนผ่านใต้แถบบนตามปกติ)
  dock = await pg.evaluate("()=>({docked:!!document.querySelector('#hud #xm-player.is-docked'),gcm:getComputedStyle(document.querySelector('.gcm')).position})")
  ok(worst == 0, f'[390] ปุ่มเพลงไม่ลอยทับแชทโลก (ฝังแถบบน {dock} · ทับเชิงพื้นที่ขณะเลื่อน {worst}px²)')
  await pg.screenshot(path=f'{OUT}/player_avoid_390.png')
  # Photo booth (iPhone UA · Chromium ไม่มีแผ่นแชร์ไฟล์ → แสดงรูปให้กดค้าง)
  await pg.evaluate("()=>EQApp.navigateTo('christmas')"); await pg.wait_for_timeout(3500)
  await pg.locator('[data-xm-photo]').click()
  await pg.wait_for_selector('[data-xm-photo-save]:not([disabled])', timeout=60000)
  await pg.locator('[data-xm-photo-save]').click(); await pg.wait_for_timeout(1500)
  ok(await pg.locator('.xm-photo-ios img').count() == 1, '[iPhone] บันทึกรูป → แสดงรูปให้กดค้างบันทึก (Safari ไม่รองรับดาวน์โหลดไฟล์รูปตรง ๆ)')
  await pg.locator('.xm-photo-ios').scroll_into_view_if_needed()
  await pg.screenshot(path=f'{OUT}/photo_ios_390.png')
  ok(not errs, f'[390] ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    await session(b)
    sql("INSERT INTO season_settings (season_key, starts_at) VALUES ('christmas', NOW() - interval '1 day') ON CONFLICT (season_key) DO UPDATE SET starts_at = EXCLUDED.starts_at, enabled = TRUE, flags = '{}'::jsonb")
    await asyncio.sleep(31)
    try: await mobile(b)
    finally: sql("DELETE FROM season_settings WHERE season_key='christmas'")
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
