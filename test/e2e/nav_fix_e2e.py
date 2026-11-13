"""
v1.20.0 (แก้เพิ่ม) เมนูเพื่อน/แชทซ้ำ + ปุ่มย้อนกลับในโปรไฟล์ผู้เล่น — E2E 390 / 820 / 1280
  - หน้าเล่น: ไม่มีการ์ด "แชท" แยกแล้ว · การ์ด "เพื่อนและแชท" · การ์ดวาดทายศัพท์ใช้ภาพของตัวเอง (ไม่ซ้ำห้องแข่งคำศัพท์)
  - หน้าเพื่อน/แชท มีแท็บสลับกัน · ป้ายข้อความยังไม่อ่านบนแท็บแชท · ป้ายคำขอเป็นเพื่อนบนแท็บเพื่อน
  - ดูโปรไฟล์จากกระดานอันดับ → ปุ่มย้อนกลับ "อันดับ" → กลับกระดานอันดับ (เดิมเด้งไปหน้าเพื่อน)
  - ดูโปรไฟล์จากหน้าเพื่อน → "เพื่อน" · เปิดลิงก์โปรไฟล์ตรง ๆ → "เพื่อน" (ค่าเริ่มต้น)
  - ไม่ล้นแนวนอน · ไม่มี JS error
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)
def sql(q): return subprocess.run(['psql', DB, '-tAc', q], check=True, capture_output=True, text=True).stdout.strip()

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL)
  me = 'nf%d' % random.randint(100000, 999999); fr = 'nf%d' % random.randint(100000, 999999)
  tok = (await pg.evaluate(REG, me))['token']; tok2 = (await pg.evaluate(REG, fr))['token']
  uid = int(sql(f"SELECT id FROM users WHERE username='{me}'")); fid = int(sql(f"SELECT id FROM users WHERE username='{fr}'"))
  sql(f"INSERT INTO friendships (requester_id, addressee_id, status) VALUES ({fid}, {uid}, 'accepted')")
  sql(f"UPDATE users SET exp = 999999 WHERE id = {fid}")   # ให้ติดกระดานอันดับ
  # เพื่อนส่งข้อความมา 1 ข้อความ (ยังไม่อ่าน)
  r = await pg.evaluate("""async ([t,id])=>{const r=await fetch('/api/chat/'+id+'/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({body:'hello'})});return r.status}""", [tok2, uid])
  ok(r in (200, 201), f'{tag} เตรียมข้อความยังไม่อ่าน ({r})')
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(2000)
  # หน้าเล่น
  await pg.evaluate("()=>EQApp.navigateTo('play')"); await pg.wait_for_timeout(800)
  cards = await pg.locator('#screen-play .play-card .play-card-title').all_inner_texts() if await pg.locator('#screen-play').count() else []
  if not cards: cards = await pg.locator('.play-grid .play-card-title').all_inner_texts()
  titles = [c.split('\n')[0].strip() for c in cards]
  ok(not any(t.startswith('แชท') for t in titles), f'{tag} ไม่มีการ์ด "แชท" ซ้ำ ({", ".join(titles)})')
  ok(any(t.startswith('เพื่อนและแชท') for t in titles), f'{tag} มีการ์ด "เพื่อนและแชท"')
  ill = await pg.evaluate("()=>[...document.querySelectorAll('.play-grid .play-card')].map(c=>{const u=c.querySelector('.play-card-art use');return u?u.getAttribute('href').split('#')[1]:''})")
  ok('il-draw' in ill and ill.count('il-battle') == 1, f'{tag} การ์ดวาดทายศัพท์ใช้ภาพของตัวเอง ({ill})')
  await pg.screenshot(path=f'{OUT}/nav_play_{w}.png', full_page=True)
  # แท็บ เพื่อน | แชท
  await pg.locator('#home-btn-friends').click(); await pg.wait_for_timeout(1200)
  tabs = pg.locator('#screen-friends .fc-tabs button')
  ok(await tabs.count() == 2 and await tabs.nth(0).get_attribute('aria-current') == 'page', f'{tag} หน้าเพื่อนมีแท็บ เพื่อน | แชท (อยู่แท็บเพื่อน)')
  ok((await pg.locator('#screen-friends .fc-badge-chat').inner_text()).strip() == '1' and await pg.locator('#screen-friends .fc-badge-chat').is_visible(), f'{tag} แท็บแชทมีป้ายข้อความยังไม่อ่าน 1')
  await pg.screenshot(path=f'{OUT}/nav_friends_{w}.png', full_page=False)
  await tabs.nth(1).click(); await pg.wait_for_timeout(1200)
  ok(await pg.evaluate("()=>!document.getElementById('screen-chat').classList.contains('hidden')"), f'{tag} แตะแท็บแชท → หน้าแชท')
  ok(await pg.locator('#screen-chat .fc-tabs button').nth(1).get_attribute('aria-current') == 'page', f'{tag} หน้าแชทไฮไลต์แท็บแชท')
  await pg.locator('#screen-chat .fc-tabs button').nth(0).click(); await pg.wait_for_timeout(1000)
  ok(await pg.evaluate("()=>!document.getElementById('screen-friends').classList.contains('hidden')"), f'{tag} แตะแท็บเพื่อน → กลับหน้าเพื่อน')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าเพื่อนไม่ล้นแนวนอน')
  # โปรไฟล์จากกระดานอันดับ → ย้อนกลับ = อันดับ
  await pg.evaluate("()=>EQApp.navigateTo('leaderboard')"); await pg.wait_for_timeout(1800)
  lb_hash = await pg.evaluate("()=>location.hash")
  row = pg.locator(f'#screen-leaderboard [data-profile-uid]:not([data-profile-uid="{uid}"])').first
  await row.wait_for(timeout=8000); await row.click()
  await pg.wait_for_selector('#screen-user [data-av-userback]', timeout=8000)
  lab = (await pg.locator('#screen-user [data-av-userback]').inner_text()).strip()
  ok(lab == 'อันดับ', f'{tag} โปรไฟล์จากกระดานอันดับ: ปุ่มย้อนกลับ "{lab}"')
  await pg.screenshot(path=f'{OUT}/nav_userback_{w}.png', full_page=False)
  await pg.locator('#screen-user [data-av-userback]').click(); await pg.wait_for_timeout(1500)
  vis = await pg.evaluate("()=>[...document.querySelectorAll('.screen')].filter(s=>!s.classList.contains('hidden')).map(s=>s.id)")
  ok(await pg.evaluate("()=>location.hash") == lb_hash and 'screen-friends' not in vis, f'{tag} กดย้อนกลับ → กระดานอันดับ ({lb_hash} · {vis})')
  # ปุ่มย้อนกลับของเบราว์เซอร์/มือถือก็กลับกระดานอันดับ
  await pg.locator(f'#screen-leaderboard [data-profile-uid]:not([data-profile-uid="{uid}"])').first.click(); await pg.wait_for_selector('#screen-user [data-av-userback]', timeout=8000)
  await pg.go_back(); await pg.wait_for_timeout(1500)
  ok(await pg.evaluate("()=>location.hash") == lb_hash, f'{tag} ปุ่ม Back ของเบราว์เซอร์ → กระดานอันดับ')
  # โปรไฟล์จากหน้าเพื่อน → ย้อนกลับ = เพื่อน
  await pg.evaluate("()=>EQApp.navigateTo('friends')"); await pg.wait_for_timeout(1500)
  fp = pg.locator(f'#screen-friends [data-profile-uid="{fid}"]').first
  if await fp.count():
    await fp.click(); await pg.wait_for_selector('#screen-user [data-av-userback]', timeout=8000)
    ok((await pg.locator('#screen-user [data-av-userback]').inner_text()).strip() == 'เพื่อน', f'{tag} โปรไฟล์จากหน้าเพื่อน: ย้อนกลับ "เพื่อน"')
    await pg.locator('#screen-user [data-av-userback]').click(); await pg.wait_for_timeout(1200)
    ok(await pg.evaluate("()=>!document.getElementById('screen-friends').classList.contains('hidden')"), f'{tag} กลับหน้าเพื่อน')
  # เปิดลิงก์โปรไฟล์ตรง ๆ (ไม่มีหน้าก่อนหน้า) → ค่าเริ่มต้น "เพื่อน"
  await pg.goto(f'{URL}/#/user/{fid}'); await pg.wait_for_selector('#screen-user [data-av-userback]', timeout=10000)
  ok((await pg.locator('#screen-user [data-av-userback]').inner_text()).strip() == 'เพื่อน', f'{tag} เปิดลิงก์ตรง: ย้อนกลับ "เพื่อน" (ค่าเริ่มต้น)')
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
