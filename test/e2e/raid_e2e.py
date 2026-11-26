"""
v1.27.0 World Raid Boss — E2E เบราว์เซอร์จริง (ผู้เล่น 2 คนพร้อมกัน) ที่ 390 · 820 · 1280 · 1920
  - หน้าเล่น: การ์ด World Raid มี HP สด · ไม่มีการ์ดวาดทายศัพท์ · ลิงก์เก่า #/draw → หน้า Raid
  - ฉาก 3D จริง (WebGL canvas · ท่า idle) · HUD HP ตรงกับเซิร์ฟเวอร์
  - ผู้เล่น A ตอบถูก → HP ลด → หน้าจอผู้เล่น B (เปิดอยู่) เห็น HP ใหม่ทาง WebSocket โดยไม่รีโหลด
  - รีโหลดกลางรอบ → HP ไม่รีเซ็ต + ทำต่อจากข้อเดิม
  - WebSocket หลุด → Polling ทำงาน → ยังเห็น HP ใหม่
  - Spelling Strike: คีย์บอร์ดบนจอ (ไม่มี input = ไม่เปิดคีย์บอร์ดเครื่อง) · ปุ่มสูง ≥ 44px
  - ตัวเลือกคำตอบสูง ≥ 44px · ไม่มีแถบแชทโลกลอยในหน้า Raid · ไม่ล้นแนวนอน · ไม่มี JS error
  - ผู้ดูแล: แผง World Raid โหลดได้ · ผู้ใช้ทั่วไปเรียก API ผู้ดูแลไม่ได้
  python3 test/e2e/raid_e2e.py [โฟลเดอร์ภาพ]  (EQ_URL · EQ_DB)
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/raid_e2e'; os.makedirs(OUT, exist_ok=True)
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

async def login(b, w, h, prefix='re'):
  m = w < 600
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=m, has_touch=m)
  pg = await ctx.new_page(); errs = []
  pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(1500)
  name = '%s%d' % (prefix, random.randint(100000, 999999))
  r = await pg.evaluate(REG, name)
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}));localStorage.setItem('eq_raid_auto','off')}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(4000)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
  return ctx, pg, errs, name

async def correct_answer(pg):
  return await _correct_answer(pg)

async def _correct_answer(pg):
  """ตอบข้อปัจจุบันให้ถูก (อ่านเฉลยจากฐานข้อมูลทดสอบ — หน้าเว็บไม่ได้รับเฉลย)"""
  st = await pg.evaluate("()=>EQRaid._state().round")
  row = sql(f"SELECT questions->current->>'type', questions->current->>'correctIndex', questions->current->>'answer' FROM raid_attempts WHERE id = '{st['attemptId']}'")
  qtype, ci, ans = row.split('|')
  shown = await pg.evaluate("()=>{const p=document.querySelector('.rd-prompt');return p?p.textContent:''}")
  dbp = sql(f"SELECT questions->current->>'prompt' FROM raid_attempts WHERE id = '{st['attemptId']}'")
  if shown.strip() != dbp.strip(): print('  [debug] prompt mismatch', repr(shown[:40]), repr(dbp[:40]), st)
  await pg.wait_for_timeout(1300)   # เวลาตอบขั้นต่ำ (กันบอท)
  if qtype == 'spell':
    hint = await pg.locator('.rd-slot.is-hint').count()
    # DOM click ทีละปุ่ม (เครื่องทดสอบไม่มี GPU ~5 fps → locator.click รอ "นิ่ง" นานจนหมดเวลาข้อ แล้วระบบส่งคำตอบว่างให้)
    await pg.evaluate("(ks)=>{for(const k of ks){const b=document.querySelector(`[data-rd-key=\"${k}\"]`);if(b)b.click()}}", list(ans[hint:]))
    await pg.wait_for_selector('[data-rd-key="go"]:not([disabled])', timeout=8000)
    await pg.evaluate("()=>document.querySelector('[data-rd-key=go]').click()")
  else:
    await pg.locator(f'[data-rd-choice="{ci}"]').click()
  try: await pg.wait_for_selector('.rd-feedback, .rd-summary', timeout=10000)   # รอเซิร์ฟเวอร์ตอบ (เครื่องทดสอบช้า)
  except Exception: pass
  await pg.wait_for_timeout(300)
  return qtype

async def run(b, w, h):
  tag = f'[{w}]'
  A, pa, ea, na = await login(b, w, h, 'ra')
  B, pb, eb, nb = await login(b, w, h, 'rb')
  # ---- หน้าเล่น
  await pa.evaluate("()=>EQApp.navigateTo('play')"); await pa.wait_for_timeout(2500)
  card = await pa.evaluate("()=>{const c=document.querySelector('#play-raid-slot .rd-playcard');return c?c.textContent:''}")
  ok('HP' in card, f'{tag} หน้าเล่น: การ์ด World Raid แสดง HP สด')
  ok(await pa.locator('[data-nav-to="draw"]').count() == 0, f'{tag} หน้าเล่น: ไม่มีวาดทายศัพท์แล้ว')
  await pa.screenshot(path=f'{OUT}/play_{w}.png')
  await pa.evaluate("()=>{location.hash='#/draw'}"); await pa.wait_for_timeout(2500)
  ok(await pa.evaluate("()=>!document.getElementById('screen-raid').classList.contains('hidden')") and '#/raid' in pa.url, f'{tag} ลิงก์เก่า #/draw → หน้า Raid ({pa.url.split("#")[-1]})')
  await pa.wait_for_timeout(5000)
  await pb.evaluate("()=>EQApp.navigateTo('raid')"); await pb.wait_for_timeout(7000)
  sa = await pa.evaluate("()=>EQRaid._state()")
  ok(sa['mode3d'] is True and sa['scene'] and sa['scene']['clip'] in ('idle', 'enrage', 'spawn', 'stun', 'phase', 'attack', 'special', 'prepare', 'hit'), f'{tag} ฉาก 3D จริง (WebGL) · ท่า {sa["scene"] and sa["scene"]["clip"]} · คุณภาพ {sa["scene"] and sa["scene"]["quality"]}')
  ok(await pa.locator('canvas.rd-canvas').count() == 1, f'{tag} canvas เดียว (ไม่สร้าง WebGL ซ้ำ)')
  ok(sa['wsSub'], f'{tag} สมัครรับสถานะทาง WebSocket')
  ok(await pa.evaluate("()=>getComputedStyle(document.getElementById('gcm')||document.body).display") == 'none' or await pa.locator('#gcm').count() == 0, f'{tag} ไม่มีแถบแชทโลกลอยในหน้า Raid')
  await pa.screenshot(path=f'{OUT}/lobby_{w}.png')
  # ---- A โจมตี → B เห็น HP ใหม่
  hp_b0 = (await pb.evaluate("()=>EQRaid._state().boss"))['hp']
  await pa.locator('[data-rd="enter"]').click(); await pa.wait_for_timeout(1500)
  hs = await pa.evaluate("()=>[...document.querySelectorAll('.rd-choice, .rd-key')].map(b=>Math.round(b.getBoundingClientRect().height))")
  ok(hs and min(hs) >= 44, f'{tag} ปุ่มตอบสูง ≥ 44px (ต่ำสุด {min(hs) if hs else None})')
  await pa.screenshot(path=f'{OUT}/question_{w}.png')
  q1 = await correct_answer(pa)
  fb = await pa.evaluate("()=>{const f=document.querySelector('.rd-feedback');return f?f.className+'|'+f.textContent:''}")
  ok('is-ok' in fb, f'{tag} ตอบถูก ({q1}) → แสดงผล + คำอธิบาย ({fb[:120]})')
  hp_srv = int(sql("SELECT hp FROM raid_boss_instances WHERE status <> 'cancelled' ORDER BY level DESC LIMIT 1"))
  await pb.wait_for_timeout(1500)
  hp_b1 = (await pb.evaluate("()=>EQRaid._state().boss"))['hp']
  ok(hp_b1 < hp_b0 and hp_b1 == hp_srv, f'{tag} ผู้เล่นอีกคนเห็น HP ใหม่ทันที (WebSocket) {hp_b0} → {hp_b1} = เซิร์ฟเวอร์ {hp_srv}')
  txt = await pb.evaluate("()=>document.getElementById('rd-hp-text').textContent")
  ok(f'{hp_srv:,}' in txt, f'{tag} แถบ HP บนจอผู้เล่นอีกคนตรงกับเซิร์ฟเวอร์ ({txt})')
  await pa.screenshot(path=f'{OUT}/feedback_{w}.png')
  # ---- รีโหลดกลางรอบ
  idx0 = (await pa.evaluate("()=>EQRaid._state().round"))['index']
  await pa.locator('[data-rd="next"]').click()
  await pa.wait_for_function(f"()=>{{const r=EQRaid._state().round;return r&&r.index>{idx0}}}", timeout=8000)
  idx = (await pa.evaluate("()=>EQRaid._state().round"))['index']
  await pa.reload(); await pa.wait_for_timeout(7000)
  st = await pa.evaluate("()=>EQRaid._state()")
  ok(st['boss']['hp'] == int(sql("SELECT hp FROM raid_boss_instances WHERE status <> 'cancelled' ORDER BY level DESC LIMIT 1")), f'{tag} รีโหลดแล้ว HP ไม่รีเซ็ต ({st["boss"]["hp"]})')
  ok(st['round'] and st['round']['index'] == idx, f'{tag} รีโหลดแล้วทำต่อจากข้อเดิม (ข้อ {idx + 1})')
  # ---- WebSocket หลุด → Polling
  await pb.evaluate("()=>{window.__rtOrig=Object.getOwnPropertyDescriptor(EQApp,'rtConnected');Object.defineProperty(EQApp,'rtConnected',{get:()=>false,configurable:true})}")
  await pb.wait_for_timeout(1500)
  ok((await pb.evaluate("()=>EQRaid._state()"))['polling'], f'{tag} WebSocket หลุด → เปลี่ยนเป็น Polling')
  q2 = await correct_answer(pa)
  await pb.wait_for_timeout(5500)
  hp_srv2 = int(sql("SELECT hp FROM raid_boss_instances WHERE status <> 'cancelled' ORDER BY level DESC LIMIT 1"))
  ok((await pb.evaluate("()=>EQRaid._state().boss"))['hp'] == hp_srv2, f'{tag} Polling ได้ HP ใหม่ ({hp_srv2}) หลังผู้เล่นอีกคนโจมตี ({q2})')
  await pb.evaluate("()=>{Object.defineProperty(EQApp,'rtConnected',window.__rtOrig)}")
  # เครื่องทดสอบวาด WebGL ด้วย CPU (~5 fps ที่ 1920) ตัวตรวจการเชื่อมต่อทำงานช้ากว่าเครื่องจริง → รอได้ถึง 8 วิ แทนการรอตายตัว 1.5 วิ
  try: await pb.wait_for_function("()=>!EQRaid._state().polling", timeout=8000)
  except Exception: pass
  ok(not (await pb.evaluate("()=>EQRaid._state()"))['polling'], f'{tag} เชื่อมต่อกลับ → เลิก Polling + ขอสถานะใหม่')
  # ---- Spelling Strike (หาข้อสะกดในรอบ)
  seen_spell = False
  for _ in range(24):
    r = await pa.evaluate("()=>EQRaid._state().round")
    if await pa.locator('.rd-summary [data-rd="again"]:not([disabled])').count():   # ครบชุดแล้วยังไม่เจอข้อสะกด (เช่น q2 เป็นข้อสะกดไปแล้ว) → เริ่มชุดใหม่
      await pa.locator('.rd-summary [data-rd="again"]').click(); await pa.wait_for_timeout(1500); continue
    if not r: break
    if await pa.locator('.rd-feedback').count():   # ข้อปัจจุบันตอบไปแล้ว → ไปข้อถัดไปก่อน
      await pa.locator('[data-rd="next"]').click(); await pa.wait_for_timeout(900); continue
    if await pa.locator('.rd-spell .rd-key').count():
      seen_spell = True
      ok(await pa.locator('.rd-spell input, .rd-spell textarea').count() == 0, f'{tag} Spelling: คีย์บอร์ดบนจอ ไม่มีช่อง input (ไม่เปิดคีย์บอร์ดเครื่อง)')
      kh = await pa.evaluate("()=>[...document.querySelectorAll('.rd-key')].map(k=>Math.round(Math.min(k.getBoundingClientRect().height,k.getBoundingClientRect().width)))")
      ok(min(kh) >= 28 and await pa.evaluate("()=>[...document.querySelectorAll('.rd-key')].every(k=>k.getBoundingClientRect().height>=44)"), f'{tag} Spelling: ปุ่มตัวอักษรสูง ≥ 44px · กว้าง ≥ 28px (ต่ำสุด {min(kh)})')
      await pa.screenshot(path=f'{OUT}/spell_{w}.png')
      await correct_answer(pa)
      fbx = await pa.evaluate("()=>{const f=document.querySelector('.rd-feedback');return f?f.className+' | '+f.textContent.replace(/\\s+/g,' ').trim():'(no feedback) '+[...document.querySelectorAll('.rd-slot')].map(s=>s.textContent).join('')}")
      ok('is-ok' in fbx, f'{tag} Spelling: สะกดถูกด้วยคีย์บอร์ดบนจอ → โจมตีได้ ({fbx[:90]})')
      break
    await correct_answer(pa); await pa.locator('[data-rd="next"]').click(); await pa.wait_for_timeout(900)
  ok(seen_spell, f'{tag} รอบนี้มีข้อ Spelling Strike')
  ok(await pa.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} ไม่ล้นแนวนอน')
  # ---- แท็บข้อมูล
  for t in ('board', 'feed', 'rewards', 'help'):
    await pa.locator(f'[data-rd-tab="{t}"]').click(); await pa.wait_for_timeout(900)
  ok(await pa.locator('.rd-help li').count() >= 5, f'{tag} แท็บอันดับ/ฟีด/รางวัล/วิธีเล่นเปิดได้')
  await pa.locator('[data-rd-tab="board"]').click()
  try: await pa.wait_for_function("()=>document.getElementById('rd-tabbody').textContent.includes('อันดับของฉัน')", timeout=10000)
  except Exception: pass
  ok('อันดับของฉัน' in await pa.evaluate("()=>document.getElementById('rd-tabbody').textContent"), f'{tag} กระดานอันดับแสดงอันดับของฉัน')
  ok(not ea and not eb, f'{tag} ไม่มี JavaScript error {(ea + eb)[:2]}')
  await A.close(); await B.close()

async def admin_check(b):
  C, pc, ec, nc = await login(b, 1280, 800, 'rad')
  r = await pc.evaluate("()=>fetch('/api/admin/raid',{credentials:'include'}).then(r=>r.status)")
  ok(r in (401, 403), f'ผู้ใช้ทั่วไปเรียก API ผู้ดูแล Raid ไม่ได้ ({r})')
  sql(f"UPDATE users SET role = 'admin' WHERE username = '{nc}'")
  await pc.reload(); await pc.wait_for_timeout(4000)
  await pc.evaluate("()=>EQApp.navigateTo('admin')"); await pc.wait_for_timeout(2500)
  await pc.evaluate("()=>{document.getElementById('admin-raid').open=true}")
  try: await pc.wait_for_function("()=>/latency/.test(document.getElementById('admin-raid-root').textContent)", timeout=15000)
  except Exception: pass
  txt = await pc.evaluate("()=>document.getElementById('admin-raid-root').textContent")
  ok('บอสปัจจุบัน' in txt and 'latency' in txt, 'ผู้ดูแล: แผง World Raid แสดงสถานะ/สถิติ/เซิร์ฟเวอร์')
  await pc.locator('[data-ra-view="damage-log"]').click(); await pc.wait_for_timeout(1500)
  ok(await pc.locator('#admin-raid-table tbody tr').count() >= 1, 'ผู้ดูแล: Damage Log โหลดได้')
  await pc.screenshot(path=f'{OUT}/admin_1280.png', full_page=False)
  ok(not ec, f'ผู้ดูแล: ไม่มี JS error {ec[:2]}')
  await C.close()

async def main():
  sql("UPDATE raid_settings SET data = data || '{\"roundsPerDay\": 200}'::jsonb WHERE id = 1")
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS)
    for w, h in [tuple(map(int, x.split('x'))) for x in os.environ.get('SIZES', '390x844,820x1180,1280x800,1920x1080').split(',')]: await run(b, w, h)
    await admin_check(b)
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
