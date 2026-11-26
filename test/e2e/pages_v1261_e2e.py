"""
v1.26.1 Game UI ระดับหน้า — Learning Path · Profile (E2E เบราว์เซอร์จริง) ที่ 390 · 820 · 1280 · 1920
  Learning Path: หัวหน้าแบบฉากเกม (ภาพหมู่บ้าน) · แถบ "คุณอยู่ที่" จากข้อมูลจริง /path (Unit ที่แนะนำ) · กด "เรียนต่อ" เข้าบทเรียนจริง
                 ปุ่มลัด 6 ปุ่ม (ไอคอนอัญมณี ≥ 44px) · โลกแต่ละระดับมีแถบสี + Progress · Unit ปัจจุบันขอบทอง
  Profile: หัวโปรไฟล์ฉากเกม · วงรูปทองกลม · เมนู 7 ปุ่มแตะง่าย
  v1.26.2 Login: แผงหัวเป็นฉากหมู่บ้าน · Ranked: เวทีประลองพื้นมืด + ปุ่มเริ่มแข่ง ≥ 44px · Avatar: หมวดที่เลือกเป็นทอง
  ทุกขนาด: ไม่ล้นแนวนอน · ปุ่มทั้งหมดในหน้าสูง ≥ 44px · ไม่มี JS error
  python3 test/e2e/pages_v1261_e2e.py [โฟลเดอร์ภาพ]  (EQ_URL)
"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pages1261'; os.makedirs(OUT, exist_ok=True)
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
SMALL = """(root)=>[...document.querySelectorAll(root+' button')].filter(b=>b.offsetParent&&b.getBoundingClientRect().height<44&&b.getBoundingClientRect().width>0).map(b=>(b.className||'')+':'+b.textContent.trim().slice(0,16))"""

def document_skin_christmas(bg): return 'login-fox' in bg

async def run(b, w, h):
  tag = f'[{w}]'; mobile = w < 600
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=mobile, has_touch=mobile)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(2500)
  # ช่วงคริสต์มาส (ฤดูกาลจริง) ภาพจิ้งจอกคริสต์มาสอยู่ใน .auth-hero-art
  lg = await pg.evaluate("()=>getComputedStyle(document.querySelector('#screen-auth .auth-hero')).backgroundImage + getComputedStyle(document.querySelector('#screen-auth .auth-hero-art')).backgroundImage")
  ok('village.webp' in lg or document_skin_christmas(lg), f'{tag} Login: แผงหัวเป็นฉากเกม')
  await pg.screenshot(path=f'{OUT}/login_{w}.png')
  r = await pg.evaluate(REG, 'pg%d' % random.randint(100000, 999999))
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(5000)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  # ---- Learning Path
  await pg.evaluate("()=>EQApp.navigateTo('learn')"); await pg.wait_for_timeout(3000)
  api = await pg.evaluate("()=>EQApp.api('/path').then(d=>d.next)")
  now = await pg.evaluate("()=>{const n=document.getElementById('path-now');return n&&!n.hidden?{t:n.querySelector('b').textContent,unit:n.querySelector('.path-now-go').dataset.unit}:null}")
  ok(now and api and now['unit'] == api['id'], f'{tag} Path: แถบ "คุณอยู่ที่" ตรงกับ Unit ที่แนะนำจริง ({now and now["t"]})')
  bg = await pg.evaluate("()=>getComputedStyle(document.querySelector('.path-hero')).backgroundImage")
  ok('village.webp' in bg, f'{tag} Path: หัวหน้าเป็นฉากเกม (ภาพหมู่บ้าน 3D)')
  q = await pg.evaluate("()=>[...document.querySelectorAll('#screen-path .path-quick .vb-open')].map(b=>{const r=b.getBoundingClientRect(),i=b.querySelector('.icon').getBoundingClientRect();return [Math.round(r.height),Math.round(i.width)]})")
  ok(len(q) == 6 and all(hh >= 44 and iw >= 30 for hh, iw in q), f'{tag} Path: ปุ่มลัด 6 ปุ่ม ไอคอนอัญมณี · สูง ≥ 44px {q}')
  lv = await pg.evaluate("()=>({prog:document.querySelectorAll('.path-level-prog').length,lv:getComputedStyle(document.querySelector('.path-level')).getPropertyValue('--lv').trim(),cur:!!document.querySelector('.path-unit-row.is-current .path-unit')})")
  ok(lv['prog'] >= 1 and lv['lv'] and lv['cur'], f'{tag} Path: โลกระดับมีแถบสี ({lv["lv"]}) + Progress · Unit ปัจจุบันเด่น')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} Path: ไม่ล้นแนวนอน')
  sm = await pg.evaluate(SMALL, '#screen-path .path-head, #path-now')
  ok(not sm, f'{tag} Path: ปุ่มส่วนหัวสูง ≥ 44px {sm[:4]}')
  await pg.screenshot(path=f'{OUT}/path_{w}.png'); await pg.screenshot(path=f'{OUT}/path_full_{w}.png', full_page=True)
  await pg.locator('.path-now-go').click(); await pg.wait_for_timeout(3000)
  scr = await pg.evaluate("()=>[...document.querySelectorAll('.screen')].find(s=>!s.classList.contains('hidden')).id")
  ok(scr not in ('screen-path', 'screen-home'), f'{tag} Path: กด "เรียนต่อ" เข้าบทเรียนจริง ({scr})')
  # ---- Profile
  await pg.evaluate("()=>EQApp.navigateTo('profile')"); await pg.wait_for_timeout(3000)
  pf = await pg.evaluate("""()=>{const s=document.querySelector('#screen-profile .pf-stage').getBoundingClientRect();const m=[...document.querySelectorAll('#screen-profile .pf-menu button')].map(b=>Math.round(b.getBoundingClientRect().height));
    return {ratio:s.width/s.height,menu:m,bg:getComputedStyle(document.querySelector('#screen-profile .pf-hero')).backgroundImage.includes('village')}}""")
  ok(abs(pf['ratio'] - 1) < 0.03 and pf['bg'], f'{tag} Profile: หัวโปรไฟล์ฉากเกม · รูปโปรไฟล์วงกลม ({pf["ratio"]:.2f})')
  ok(len(pf['menu']) == 7 and min(pf['menu']) >= 44, f'{tag} Profile: เมนู 7 ปุ่ม แตะง่าย {pf["menu"]}')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} Profile: ไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/profile_{w}.png')
  # ---- Ranked
  await pg.evaluate("()=>EQApp.navigateTo('ranked')"); await pg.wait_for_timeout(3500)
  for _ in range(3): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
  rk = await pg.evaluate("""()=>{const h=document.querySelector('#screen-ranked .rk-hero-v2');const c=document.querySelector('#screen-ranked .rk-cta');const lg=h.querySelector('.rk-league');
    return {bg:getComputedStyle(h).backgroundImage.includes('linear-gradient'),ink:getComputedStyle(lg).color,cta:c?Math.round(c.getBoundingClientRect().height):0}}""")
  ok(rk['bg'] and rk['ink'] == 'rgb(255, 255, 255)' and rk['cta'] >= 44, f'{tag} Ranked: เวทีประลองพื้นมืด ชื่อแรงค์สีขาว · ปุ่มเริ่มแข่ง {rk["cta"]}px')
  sm = await pg.evaluate(SMALL, '#rk-lobby .rk-quick, #rk-lobby .rk-cta-wrap')
  ok(not sm, f'{tag} Ranked: ปุ่มแตะง่าย ≥ 44px {sm[:3]}')
  await pg.screenshot(path=f'{OUT}/ranked_{w}.png')
  # ---- Avatar
  await pg.evaluate("()=>EQApp.navigateTo('avatar')"); await pg.wait_for_timeout(3500)
  act = await pg.evaluate("()=>{const a=document.querySelector('#screen-avatar .av-cat.active');return a?getComputedStyle(a).backgroundImage:''}")
  ok('linear-gradient' in act, f'{tag} Avatar: หมวดที่เลือกเป็นปุ่มทอง')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} Ranked/Avatar: ไม่ล้นแนวนอน')
  ok(not errs, f'{tag} ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for w, h in [(390, 844), (820, 1180), (1280, 800), (1920, 1080)]: await run(b, w, h)
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
