"""
v1.22.1 กรอบโปรไฟล์ไม่หาย + อยู่ตรงรูป — E2E 390 / 820 / 1280
  รายงาน: "พอกดไปเมนูอื่น แล้วกลับมาหน้าแรก กรอบรูปโปรไฟล์หาย" (+ ภาพแท่นอันดับ: กรอบเยื้องจากรูปสัตว์)
  - แถบบน: มีกรอบตั้งแต่เปิดหน้าแรก · ไปเล่น/เรียน/อันดับ/โปรไฟล์ แล้วกลับหน้าแรก กรอบยังอยู่ (ทำ 2 รอบ)
  - เปลี่ยนกรอบ (ผ่าน API ใส่กรอบ) แล้วกลับหน้าแรก -> แสดงกรอบใหม่ ไม่เด้งกลับเป็นกรอบเก่า · ถอดกรอบ -> ไม่มีกรอบ
  - แท่นอันดับ 1–3: กรอบกับรูปอยู่กึ่งกลางเดียวกัน ขนาดกรอบ = กล่องรูป (ไม่เยื้อง)
  python3 test/e2e/frames_persist_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
HUD = "()=>{const h=document.getElementById('hud-avatar');const u=h.querySelector(':scope>.pf-ov use');return u?u.getAttribute('href'):null}"
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)
def sql(q): subprocess.run(['psql', DB, '-qc', q], check=True)
def give(uid, *ids):
  for i in ids: sql(f"INSERT INTO user_cosmetics (user_id, item_id, via) VALUES ({uid}, '{i}', 'level') ON CONFLICT DO NOTHING")

async def nav(pg, scr):
  btn = pg.locator(f'#bottom-nav [data-nav="{scr}"]')
  if await btn.count() and await btn.is_visible(): await btn.click()
  else: await pg.evaluate(f"()=>EQApp.navigateTo('{scr}')")
  await pg.wait_for_timeout(1800)

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL, timeout=90000)
  us = [await pg.evaluate(REG, 'fp%d' % random.randint(1000000, 9999999)) for _ in range(3)]
  me = us[0]['user']['id']
  give(me, 'pf_lv10', 'pf_lv20')
  sql(f"UPDATE users SET profile_frame='pf_lv10' WHERE id={me}")
  for u, f in zip(us[1:], ['pf_cute_bunny', 'pf_lv30']): sql(f"UPDATE users SET profile_frame='{f}' WHERE id={u['user']['id']}")
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", us[0]['token']); await pg.reload(); await pg.wait_for_timeout(2500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
  await pg.reload(); await pg.wait_for_timeout(3000)
  ok(await pg.evaluate(HUD) == '#pf_lv10', f'{tag} แถบบน: มีกรอบตั้งแต่เปิดหน้าแรก')
  for rnd in (1, 2):
    for scr in ['play', 'learn', 'profile', 'home']:
      await nav(pg, scr)
    ok(await pg.evaluate(HUD) == '#pf_lv10', f'{tag} ไปเมนูอื่นแล้วกลับหน้าแรก (รอบ {rnd}): กรอบยังอยู่')
  await pg.screenshot(path=f'{OUT}/hud_home_{w}.png', clip={'x': 0, 'y': 0, 'width': w, 'height': 90})
  # เปลี่ยนกรอบ -> กลับหน้าแรกต้องเป็นกรอบใหม่ (ไม่ใช่ค่าเก่าที่ cache ไว้)
  await nav(pg, 'play')
  r = await pg.evaluate("async()=>{const r=await EQApp.api('/cosmetics/equip',{method:'POST',body:{kind:'pframe',itemId:'pf_lv20'}});EQAvatar.refreshLook(EQApp.user.id);return r}")
  await pg.wait_for_timeout(1200)
  await nav(pg, 'home'); await pg.wait_for_timeout(800)
  ok(await pg.evaluate(HUD) == '#pf_lv20', f'{tag} เปลี่ยนกรอบแล้วกลับหน้าแรก: แสดงกรอบใหม่ ({await pg.evaluate(HUD)})')
  await pg.evaluate("async()=>{await EQApp.api('/cosmetics/equip',{method:'POST',body:{kind:'pframe',itemId:null}});EQAvatar.refreshLook(EQApp.user.id)}")
  await pg.wait_for_timeout(1200); await nav(pg, 'learn'); await nav(pg, 'home')
  ok(await pg.evaluate(HUD) is None, f'{tag} ถอดกรอบแล้วกลับหน้าแรก: ไม่มีกรอบค้าง')
  # แท่นอันดับ 1–3: กรอบตรงกับรูป
  await pg.evaluate("async()=>{await EQApp.api('/cosmetics/equip',{method:'POST',body:{kind:'pframe',itemId:'pf_lv10'}});EQAvatar.refreshLook(EQApp.user.id)}")
  await pg.wait_for_timeout(1000)
  data = [{'rank': i + 1, 'userId': u['user']['id'], 'name': u['user']['username'], 'avatar': u['user'].get('avatar') or 'fox', 'scoreHtml': '1 EXP'} for i, u in enumerate(us)]
  await pg.evaluate("d=>{const box=document.createElement('div');box.id='podtest';box.style.cssText='padding:16px';box.innerHTML=EQPodium.html(d);document.querySelector('#screen-home').prepend(box);}", data)
  await pg.wait_for_timeout(2500)
  geo = await pg.evaluate("""()=>[...document.querySelectorAll('#podtest .lbp-photo')].map(e=>{const R=(x)=>{const r=x.getBoundingClientRect();return {cx:r.x+r.width/2,cy:r.y+r.height/2,w:r.width,h:r.height}};
      const ov=e.querySelector(':scope>.pf-ov');const pic=e.querySelector(':scope>.eqav');return {pf:e.classList.contains('has-pf'),box:R(e),ov:ov&&R(ov),pic:pic&&R(pic)}})""")
  ok(len(geo) == 3 and all(g['pf'] and g['ov'] for g in geo), f'{tag} แท่นอันดับ: ทั้ง 3 คนมีกรอบ')
  for i, g in enumerate(geo):
    if not g['ov'] or not g['pic']: continue
    d = max(abs(g['ov']['cx'] - g['pic']['cx']), abs(g['ov']['cy'] - g['pic']['cy']))
    ok(d <= 1.5 and abs(g['ov']['w'] - g['box']['w']) <= 1 and abs(g['pic']['w'] - g['box']['w']) <= 1 and g['box']['w'] in (72, 88),
       f'{tag} แท่นอันดับ {i + 1}: กรอบกับรูปตรงกลางเดียวกัน (เยื้อง {d:.1f}px · กล่อง {g["box"]["w"]:.0f}px)')
  await pg.locator('#podtest').screenshot(path=f'{OUT}/podium_{w}.png')
  ok(not errs, f'{tag} ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def main():
  async with async_playwright() as p:
    for w, h in [(390, 844), (820, 1180), (1280, 900)]:
      b = await p.chromium.launch()
      try: await run(b, w, h)
      except Exception as e: ok(False, f'[{w}] exception {e}')
      await b.close()
  print(f'\n{len(FAILS)} FAIL' if FAILS else '\nALL PASS')
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
