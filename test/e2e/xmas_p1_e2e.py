"""
v1.25.1 Christmas P1 — E2E (390×844 · 1280×800) · ต้องรันเซิร์ฟเวอร์ด้วย XMAS_TEST_OFFSET_DAYS=16 (เวลากิจกรรม = ~10 ธ.ค.)
  - Advent: ประตูวันที่ผ่านมาเปิดได้ / อนาคตกดไม่ได้ → เล่นผ่านหน้าเว็บจริง (กดตัวเลือก) ตอบถูก 4 ข้อ → ประตูเปิด + Token
  - Boss: เริ่ม → แถบพลัง/หัวใจ/ตัวจับเวลา → ตอบจนชนะ → รางวัล · ปุ่มปิด / Esc กลับหน้า Hub
  - Story: ก่อนผู้ดูแลอนุมัติไม่แสดง → ผู้ดูแลอนุมัติในหน้าผู้ดูแล + เปิดสวิตช์ → ผู้เล่นอ่านตอน 1 ตอบ 3 ข้อ → ผ่าน + เฉลยพร้อมเหตุผล
  - Photo booth: เปิด → ภาพ 1080×1350 มีตัวละคร 3D · บันทึกรูป (ดาวน์โหลด PNG จริง) — รายละเอียดเต็มใน booth_e2e.py
  - ไม่ล้นแนวนอน · ไม่มี JS error
  (เฉลยในการทดสอบอ่านจากฐานข้อมูลพัฒนา — หน้าเว็บไม่มีเฉลย)
"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'; os.makedirs(OUT, exist_ok=True)
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"
def ans(uid, kind):
  return int(sql(f"SELECT q->>'answer' FROM xmas_runs WHERE user_id={uid} AND kind='{kind}' AND status='playing'") or -1)

async def login(b, w, h, admin=False):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', accept_downloads=True); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(2500)
  n = 'p1%d' % random.randint(100000, 999999); r = await pg.evaluate(REG, n)
  uid = int(sql(f"SELECT id FROM users WHERE username='{n}'"))
  if admin: sql(f"UPDATE users SET role='admin' WHERE id={uid}")
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(4500)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  return ctx, pg, uid, errs

async def play_quiz(pg, uid, kind, wrong=0, limit=24):
  for i in range(limit):
    if await pg.locator('.xm-g-end').count(): return True
    await pg.wait_for_selector('.xm-g-opt:not([disabled])', timeout=15000)
    await pg.wait_for_timeout(700)   # คนอ่านโจทย์ (กันบอท ≥ 0.6 วินาที)
    a = ans(uid, kind)
    pick = (a + 1) % 4 if i < wrong else a
    await pg.locator('.xm-g-opt').nth(pick).click()
    await pg.wait_for_timeout(2000)
  return await pg.locator('.xm-g-end').count() > 0

async def run(b, w, h):
  tag = f'[{w}]'
  ctx, pg, uid, errs = await login(b, w, h)
  await pg.evaluate("()=>EQApp.navigateTo('christmas')"); await pg.wait_for_timeout(3500)
  doors = await pg.locator('.xm-door').count()
  ok(doors == 25, f'{tag} Advent: ประตู 25 บาน ({doors})')
  ready = await pg.locator('.xm-door.is-ready').count(); future = await pg.locator('.xm-door:disabled').count()
  ok(ready >= 5 and future >= 10, f'{tag} Advent: ประตูถึงวันแล้วเปิดได้ {ready} บาน · ยังไม่ถึงวันกดไม่ได้ {future} บาน')
  ok(await pg.evaluate(NOOVER), f'{tag} Hub (มี Advent/Boss/Photo) ไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/p1_hub_{w}.png', full_page=True)
  await pg.locator('.xm-door.is-ready').first.click(); await pg.wait_for_timeout(1500)
  ok(await pg.locator('.xm-game[role=dialog] .xm-g-opt').count() == 4, f'{tag} Advent: หน้าต่างโจทย์ 4 ตัวเลือก')
  await pg.screenshot(path=f'{OUT}/p1_advent_q_{w}.png')
  html = await pg.evaluate("()=>document.querySelector('.xm-game').innerHTML")
  ok('"answer"' not in html and 'data-correct' not in html, f'{tag} หน้าเว็บไม่มีเฉลย')
  done = await play_quiz(pg, uid, 'advent')
  t = await pg.locator('.xm-g-end').inner_text() if done else ''
  ok(done and 'เปิดประตู' in t and 'Token' in t, f'{tag} Advent: ตอบครบ → เปิดประตู + ได้ Token ({t[:60]!r})')
  await pg.screenshot(path=f'{OUT}/p1_advent_win_{w}.png')
  await pg.locator('.xm-g-end [data-xm-close]').click(); await pg.wait_for_timeout(1500)
  ok(await pg.locator('.xm-door.is-open').count() == 1 and await pg.locator('.xm-game').count() == 0, f'{tag} ปิดหน้าต่าง → ประตูแสดงว่าเปิดแล้ว')
  # Boss
  await pg.locator('[data-xm-boss]').click(); await pg.wait_for_timeout(1500)
  ok(await pg.locator('.xm-hp').count() == 1 and await pg.locator('.xm-heart').count() == 3 and await pg.locator('.xm-timer').count() == 1, f'{tag} Boss: แถบพลัง · 3 หัวใจ · ตัวจับเวลา')
  await pg.screenshot(path=f'{OUT}/p1_boss_{w}.png')
  done = await play_quiz(pg, uid, 'boss', wrong=1)
  t = await pg.locator('.xm-g-end').inner_text() if done else ''
  ok(done and 'ชนะ' in t, f'{tag} Boss: ตอบผิด 1 ถูกที่เหลือ → ชนะยักษ์ ({t[:50]!r})')
  bal = int(sql(f"SELECT balance FROM event_token_balances WHERE user_id={uid}") or 0)
  ok(bal >= 45, f'{tag} Token รวมจาก Advent + Boss = {bal} (≥ 45)')
  await pg.keyboard.press('Escape'); await pg.wait_for_timeout(800)
  ok(await pg.locator('.xm-game').count() == 0, f'{tag} Esc ปิดหน้าต่างเกม')
  # Story ยังไม่อนุมัติ = ไม่แสดง
  ok(await pg.locator('.xm-story').count() == 0, f'{tag} Story: ยังไม่ผ่านการตรวจของผู้ดูแล → ไม่แสดง')
  # Photo booth
  await pg.locator('[data-xm-photo]').click()
  await pg.wait_for_selector('[data-xm-photo-save]:not([disabled])', timeout=60000)
  has3d = await pg.evaluate("()=>EQChristmas._play() && true")
  px = await pg.evaluate("""()=>{const c=document.getElementById('xm-photo-canvas');const g=c.getContext('2d');const d=g.getImageData(c.width/2-60,c.height*0.55,120,120).data;let skin=0;for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2];if(r>180&&gg>120&&b>80&&r>b+30)skin++}return {w:c.width,h:c.height,skin,wait:document.querySelector('.xm-photo-wait').textContent}}""")
  ok(px['w'] == 1080 and px['h'] == 1350, f'{tag} Photo booth: ภาพ 1080×1350')
  ok(await pg.evaluate("()=>EQChristmas._photoHas3D()") and not px['wait'], f'{tag} Photo booth: มีภาพตัวละคร 3D ของผู้ใช้ในรูป (ตรวจด้วยตาจากไฟล์ p1_photo_{w}.png)')
  async with pg.expect_download() as dl:
    await pg.locator('[data-xm-photo-save]').click()
  d = await dl.value; path = f'{OUT}/p1_photo_{w}.png'; await d.save_as(path)
  ok(os.path.getsize(path) > 50000 and open(path, 'rb').read(4) == b'\x89PNG', f'{tag} Photo booth: บันทึกรูป PNG จริง ({os.path.getsize(path) // 1024} KB)')
  await pg.screenshot(path=f'{OUT}/p1_photo_ui_{w}.png')
  await pg.keyboard.press('Escape')
  ok(not errs, f'{tag} ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def story(b):
  ctx, pg, aid, errs = await login(b, 1280, 800, admin=True)
  await pg.evaluate("()=>EQApp.navigateTo('admin')"); await pg.wait_for_timeout(3500)
  await pg.evaluate("()=>{document.getElementById('admin-xmas').open=true}"); await pg.wait_for_timeout(2000)
  ok(await pg.locator('#admin-xmas-form input[name="flag:christmas_story"]:disabled').count() == 1, '[admin] สวิตช์ Story ถูกล็อกจนกว่าจะอนุมัติครบ')
  for i in range(5):   # ผู้ดูแลเปิดอ่านเนื้อหา + คำถาม/เฉลยของแต่ละตอนก่อนกดอนุมัติ (ปุ่มอยู่ในส่วนที่ต้องเปิดอ่าน)
    await pg.evaluate("()=>{const d=[...document.querySelectorAll('.admin-xmas-ch')].find(x=>x.querySelector('[data-approve=\"1\"]'));if(d)d.open=true}")
    await pg.wait_for_timeout(300)
    await pg.locator('.admin-xmas-ch[open] [data-xm-review][data-approve="1"]').first.click(); await pg.wait_for_timeout(1500)
  ok(await pg.locator('[data-xm-review][data-approve="0"]').count() == 5, '[admin] อนุมัติเนื้อหาครบ 5 ตอน')
  await pg.locator('#admin-xmas-form input[name="flag:christmas_story"]').check()
  await pg.locator('#admin-xmas-form button[type=submit]').click(); await pg.wait_for_timeout(2000)
  await pg.locator('#admin-xmas').screenshot(path=f'{OUT}/p1_admin_story.png')
  sql(f"UPDATE users SET role='user' WHERE id={aid}")
  await ctx.close()
  sql("UPDATE season_settings SET updated_at = NOW() WHERE season_key='christmas'")
  await asyncio.sleep(31)   # cache ตั้งค่าฝั่งเซิร์ฟเวอร์
  ctx, pg, uid, errs = await login(b, 390, 844)
  await pg.evaluate("()=>EQApp.navigateTo('christmas')"); await pg.wait_for_timeout(3500)
  ok(await pg.locator('.xm-chap').count() == 5, '[390] Story: แสดง 5 ตอนหลังผู้ดูแลอนุมัติ')
  ok(await pg.locator('[data-xm-chap="c2"]:disabled').count() == 1, '[390] Story: ตอน 2 ต้องผ่านตอน 1 ก่อน')
  await pg.locator('[data-xm-chap="c1"]').click(); await pg.wait_for_timeout(1500)
  ok(await pg.locator('.xm-read-text').count() == 1 and await pg.locator('.xm-read-q fieldset').count() == 3, '[390] Story: อ่านเนื้อเรื่อง + 3 คำถาม')
  key = json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'christmas', 'story.json')))['chapters'][0]['questions']
  for i, q in enumerate(key):
    await pg.locator(f'input[name="q{i + 1}"]').nth(q['answer']).check()
  await pg.screenshot(path=f'{OUT}/p1_story_390.png', full_page=True)
  await pg.locator('.xm-read-q button[type=submit]').click(); await pg.wait_for_timeout(2000)
  t = await pg.locator('.xm-read-res').inner_text()
  ok('ผ่านแล้ว' in t and 'Token' in t, f'[390] Story: ตอบถูก 3/3 → ผ่าน + รางวัล ({t[:50]!r})')
  ok(await pg.locator('.xm-why').count() == 3, '[390] Story: แสดงเหตุผลของเฉลยทุกข้อ')
  await pg.screenshot(path=f'{OUT}/p1_story_done_390.png')
  ok(not errs, f'[390 story] ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  sql("INSERT INTO season_settings (season_key, starts_at) VALUES ('christmas', NOW() - interval '1 day') ON CONFLICT (season_key) DO UPDATE SET starts_at = EXCLUDED.starts_at, enabled = TRUE, flags = '{}'::jsonb")
  sql("DELETE FROM content_reviews")
  await asyncio.sleep(31)
  try:
    async with async_playwright() as p:
      b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
      for w, h in [(390, 844), (1280, 800)]: await run(b, w, h)
      await story(b)
      await b.close()
  finally:
    sql("DELETE FROM season_settings WHERE season_key='christmas'"); sql("DELETE FROM content_reviews")
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
