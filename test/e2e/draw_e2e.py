"""
v1.20.0 วาดทายศัพท์ — E2E ผู้เล่น 3 คน (3 เบราว์เซอร์แยกกัน) ที่ 390 / 820 / 1280
  - การ์ด "วาดทายศัพท์" ในหน้าเล่น → สร้างห้อง
  - A ชวนในแชทโลก → B เห็นการ์ดคำเชิญในแชทโลก กด "เข้าร่วม" → เข้าห้อง · C เข้าด้วยรหัส
  - คำเชิญไม่มีข้อมูลส่วนตัว (อีเมล) ในข้อมูลที่ส่ง
  - เริ่มเกม → คนวาดเลือกคำ (คนอื่นไม่เห็นคำ ไม่มีคำในข้อมูลที่ส่งมา) → วาดด้วยเมาส์/นิ้ว → อีกฝั่งเห็นเส้น
  - ทายผิด = แสดงในแชท · ทายถูก = ไม่แสดงคำให้คนอื่น · ได้คะแนน · ทุกคนทายถูก = เฉลยพร้อมคำแปล/ตัวอย่าง
  - รายงานผู้เล่น (เก็บหลักฐานภาพ) · เจ้าของห้องเตะได้ · จบเกม → สรุปผล + เก็บคำเข้าคิวทบทวน
  - ไม่ล้นแนวนอน · ไม่มี JS error
"""
import asyncio, json, os, random, subprocess, sys
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
def sql(q):
  return subprocess.run(['psql', DB, '-tAc', q], check=True, capture_output=True, text=True).stdout.strip()

async def player(b, w, h, tag):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', has_touch=(w < 1000))
  pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  frames = []
  pg.on('websocket', lambda ws: ws.on('framereceived', lambda f: frames.append(f if isinstance(f, str) else '')))
  await pg.goto(URL)
  name = f'{tag}{random.randint(100000, 999999)}'
  tok = (await pg.evaluate(REG, name))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(timeout=90000); await pg.wait_for_timeout(1200)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(timeout=90000)
  await pg.wait_for_function("()=>window.EQApp && EQApp.rtConnected", timeout=60000)   # เครื่องทดสอบไม่มี GPU: หน้าแรก (3D) โหลดช้าเมื่อเปิดหลายหน้าพร้อมกัน
  uid = int(sql(f"SELECT id FROM users WHERE username='{name}'"))
  return {'ctx': ctx, 'pg': pg, 'errs': errs, 'name': name, 'id': uid, 'frames': frames}

async def draw_line(pg, fx=0.2, fy=0.3, tx=0.8, ty=0.7, steps=12):
  box = await pg.locator('#dg-board').bounding_box()
  x0, y0 = box['x'] + box['width'] * fx, box['y'] + box['height'] * fy
  await pg.mouse.move(x0, y0); await pg.mouse.down()
  for i in range(1, steps + 1):
    await pg.mouse.move(x0 + (box['width'] * (tx - fx)) * i / steps, y0 + (box['height'] * (ty - fy)) * i / steps); await pg.wait_for_timeout(15)
  await pg.mouse.up(); await pg.wait_for_timeout(300)

async def ink(pg):
  return await pg.evaluate("""()=>{const c=document.getElementById('dg-board');if(!c)return -1;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=16){if(d[i]<200||d[i+1]<200||d[i+2]<200)n++}return n}""")

async def run(b, w, h):
  tag = f'[{w}]'
  A = await player(b, w, h, 'da'); B = await player(b, w, h, 'db'); C = await player(b, w, h, 'dc')
  a, bp, c = A['pg'], B['pg'], C['pg']
  # A: หน้าเล่น → การ์ด → สร้างห้อง
  await a.evaluate("()=>EQApp.navigateTo('play')"); await a.wait_for_timeout(800)
  ok(await a.locator('.dg-entry').is_visible(), f'{tag} การ์ด "วาดทายศัพท์" ในหน้าเล่น')
  await a.locator('.dg-entry').click(); await a.wait_for_selector('#dg-create', timeout=10000)
  ok(await a.evaluate(NOOVER), f'{tag} หน้ารวมไม่ล้นแนวนอน')
  await a.screenshot(path=f'{OUT}/draw_hub_{w}.png', full_page=True)
  await a.locator('#dg-create input[value="A1"]').check(force=True)
  await a.select_option('#dg-create select[name=rounds]', '1')
  await a.locator('#dg-create button[type=submit]').click(); await a.wait_for_selector('.dg-lobby', timeout=10000)
  code = await a.evaluate("()=>EQDraw._state().R.code")
  ok(len(code) == 5 and f'#/draw-room/{code}' in a.url, f'{tag} สร้างห้อง {code}')
  ok(await a.locator('[data-dg-start]').is_disabled(), f'{tag} คนเดียวเริ่มเกมไม่ได้')
  # ชวนในแชทโลก
  await a.locator('[data-dg-invite-world]').click(); await a.wait_for_timeout(1200)
  inv = sql(f"SELECT body || '|' || invite_kind || '|' || invite_ref FROM world_chat_messages WHERE user_id={A['id']} ORDER BY id DESC LIMIT 1")
  ok(inv.endswith(f'|draw|{code}') and '@' not in inv, f'{tag} คำเชิญในแชทโลก ({inv.split("|")[0][:50]}…) ไม่มีอีเมล')
  # B เปิดแชทโลกเห็นการ์ด → เข้าร่วม
  await bp.evaluate("()=>EQWorldChat.open()"); await bp.wait_for_selector(f'[data-dg-inv="{code}"]', timeout=10000)
  await bp.wait_for_selector(f'[data-dg-inv="{code}"] [data-dg-join-invite]', timeout=8000)
  try: await bp.wait_for_function(f"()=>{{const c=document.querySelector('[data-dg-inv=\"{code}\"]');return c&&c.innerText.includes('1/8')}}", timeout=10000)   # รอโหลดสถานะห้องสด (เครื่องช้า)
  except Exception: pass
  card = await bp.locator(f'[data-dg-inv="{code}"]').first.inner_text()
  ok('วาดทายศัพท์' in card and '1/8' in card, f'{tag} การ์ดคำเชิญบอกสถานะห้อง ({" ".join(card.split())[:60]})')
  ok(not any(A['name'] + '@' in f for f in B['frames']), f'{tag} ข้อมูล WebSocket ที่ B ได้รับไม่มีอีเมลของ A')
  await bp.screenshot(path=f'{OUT}/draw_invite_{w}.png', full_page=False)
  await bp.locator(f'[data-dg-inv="{code}"] [data-dg-join-invite]').first.click()
  await bp.wait_for_selector('.dg-lobby', timeout=10000)
  ok(await bp.evaluate("()=>EQDraw._state().R.code") == code, f'{tag} B เข้าห้องจากการ์ดคำเชิญ')
  # C เข้าด้วยรหัส
  await c.evaluate("()=>EQApp.navigateTo('draw')"); await c.wait_for_selector('#dg-join', timeout=10000)
  await c.fill('#dg-code', code.lower()); await c.locator('#dg-join button').click(); await c.wait_for_selector('.dg-lobby', timeout=10000)
  await a.wait_for_function("()=>EQDraw._state().R.players.length===3", timeout=8000)
  ok(await a.locator('.dg-player').count() == 3, f'{tag} A เห็นผู้เล่น 3 คน')
  ok(not await a.locator('[data-dg-start]').is_disabled(), f'{tag} 3 คน เริ่มเกมได้')
  await a.screenshot(path=f'{OUT}/draw_lobby_{w}.png', full_page=False)
  # เริ่มเกม
  await a.locator('[data-dg-start]').click()
  pages = {A['id']: A, B['id']: B, C['id']: C}
  await a.wait_for_function("()=>EQDraw._state().R.phase==='choosing'", timeout=8000)
  drawer_id = await a.evaluate("()=>EQDraw._state().R.turn.drawerId")
  D = pages[drawer_id]; others = [p for p in (A, B, C) if p['id'] != drawer_id]
  dp = D['pg']
  await dp.wait_for_selector('.dg-choice', timeout=8000)
  ok(await dp.locator('.dg-choice').count() == 3, f'{tag} คนวาดได้ 3 คำให้เลือก')
  ok(await others[0]['pg'].locator('.dg-choice').count() == 0, f'{tag} คนอื่นไม่เห็นคำให้เลือก')
  await dp.locator('.dg-choice').first.click()
  await dp.wait_for_function("()=>EQDraw._state().R.phase==='drawing'", timeout=8000)
  word = await dp.evaluate("()=>EQDraw._state().R.turn.word")
  g1 = others[0]['pg']; g2 = others[1]['pg']
  await g1.wait_for_function("()=>EQDraw._state().R.phase==='drawing'", timeout=8000)
  st1 = await g1.evaluate("()=>JSON.stringify(EQDraw._state().R)")
  ok(word and f'"{word}"' not in st1 and 'choices' not in st1, f'{tag} คนทายไม่ได้รับคำ ("{word}") ในข้อมูล')
  ok(await g1.locator('#dg-mask span').count() == len(word), f'{tag} คนทายเห็นช่องว่าง {len(word)} ตัว')
  # วาด
  await draw_line(dp)
  await draw_line(dp, 0.2, 0.7, 0.8, 0.3)
  await g1.wait_for_timeout(700)
  ok(await ink(g1) > 50, f'{tag} คนทายเห็นเส้นที่วาด (พิกเซล {await ink(g1)})')
  ok(await dp.locator('.dg-tools').is_visible(), f'{tag} คนวาดมีเครื่องมือ (สี/ขนาด/ยางลบ/ย้อน/ล้าง)')
  await dp.locator('[data-dg-undo]').click(); await g1.wait_for_timeout(600)
  ink_after_undo = await ink(g1)
  ok(ink_after_undo > 0, f'{tag} ย้อนกลับ 1 เส้น อีกฝั่งยังเห็นเส้นแรก')
  if w == 390:
    await dp.screenshot(path=f'{OUT}/draw_drawer_{w}.png', full_page=False)
  # ทายผิด + ทายถูก
  await g1.fill('#dg-guess-in', 'zzzwrong'); await g1.locator('#dg-guess button').click(); await g2.wait_for_timeout(800)
  ok('zzzwrong' in await g2.locator('#dg-log').inner_text(), f'{tag} คำทายผิดแสดงในแชทของคนอื่น')
  await g1.wait_for_timeout(700)
  await g1.fill('#dg-guess-in', word.upper()); await g1.locator('#dg-guess button').click()
  await g2.wait_for_function("()=>/ทายถูกแล้ว/.test(document.getElementById('dg-log').textContent)", timeout=8000)
  log2 = await g2.locator('#dg-log').inner_text()
  ok(word not in log2.lower(), f'{tag} คำตอบที่ถูกไม่แสดงในแชทของคนที่ยังไม่ทาย')
  await g1.wait_for_function(f"()=>(document.getElementById('dg-mask')||{{}}).textContent==='{word}'", timeout=5000)
  ok(True, f'{tag} คนทายถูกเห็นคำเต็ม')
  sc = await g1.evaluate(f"()=>EQDraw._state().R.players.find(p=>p.id==={others[0]['id']}).score")
  ok(sc > 100, f'{tag} ทายถูกได้คะแนน ({sc})')
  await g1.screenshot(path=f'{OUT}/draw_guess_{w}.png', full_page=False)
  # รายงานคนวาด (เก็บหลักฐานภาพ)
  await g2.locator(f'[data-dg-player="{drawer_id}"]').first.click(); await g2.wait_for_selector('#dg-report', timeout=3000)
  await g2.locator('#dg-report input[value="letters"]').check()
  await g2.locator('#dg-report button[type=submit]').click(); await g2.wait_for_timeout(1000)
  ev = sql(f"SELECT jsonb_array_length(e.strokes) FROM draw_report_evidence e JOIN user_reports r ON r.id=e.report_id WHERE r.reporter_id={others[1]['id']} AND r.reported_id={drawer_id}")
  ok(ev and int(ev) >= 1, f'{tag} รายงานคนวาด เก็บเส้นที่วาดเป็นหลักฐาน ({ev} ชิ้น)')
  # คนสุดท้ายทายถูก → เฉลย
  await g2.fill('#dg-guess-in', word); await g2.locator('#dg-guess button').click()
  await a.wait_for_selector('.dg-overlay.is-reveal', timeout=8000)
  rv = await a.locator('.dg-overlay.is-reveal').inner_text()
  ok(word in rv and any('฀' <= ch <= '๿' for ch in rv), f'{tag} เฉลยคำ + คำแปลไทย')
  await a.screenshot(path=f'{OUT}/draw_reveal_{w}.png', full_page=False)
  # เจ้าของห้องเตะ C (ถ้า C ไม่ใช่เจ้าของ) — ทำระหว่างเกม
  await a.wait_for_function("()=>EQDraw._state().R.phase==='choosing'||EQDraw._state().R.phase==='ended'", timeout=15000)
  await a.locator(f'[data-dg-player="{C["id"]}"]').first.click(); await a.wait_for_selector('[data-dg-kick]', timeout=3000)
  await a.locator('[data-dg-kick]').click()
  await c.wait_for_selector('#dg-create', timeout=8000)
  ok(await c.evaluate("()=>EQDraw._state().R")is None, f'{tag} C ถูกเชิญออก กลับหน้ารวม')
  r = await c.evaluate(f"()=>EQApp.api('/draw/rooms/{code}/join',{{method:'POST',body:{{}}}}).then(()=>'ok',e=>e.message)")
  ok(r != 'ok', f'{tag} C เข้าห้องเดิมซ้ำไม่ได้ ({r})')
  # เกม 1 รอบ: เหลือ A, B → จบเมื่อครบทุกคนวาด (คนวาดที่เหลือเลือกคำแล้วทุกคนทายถูก)
  for _ in range(4):
    ph = await a.evaluate("()=>EQDraw._state().R.phase")
    if ph == 'ended': break
    if ph in ('choosing', 'drawing'):
      d2 = await a.evaluate("()=>EQDraw._state().R.turn.drawerId")
      P = A if d2 == A['id'] else B; Q = B if P is A else A
      if ph == 'choosing':
        await P['pg'].wait_for_selector('.dg-choice', timeout=8000); await P['pg'].locator('.dg-choice').first.click()
        await P['pg'].wait_for_function("()=>EQDraw._state().R.phase==='drawing'", timeout=8000)
      wd = await P['pg'].evaluate("()=>EQDraw._state().R.turn.word")
      await Q['pg'].wait_for_function("()=>EQDraw._state().R.phase==='drawing'", timeout=8000)
      await Q['pg'].wait_for_timeout(700)
      await Q['pg'].fill('#dg-guess-in', wd); await Q['pg'].locator('#dg-guess button').click()
    await a.wait_for_timeout(7000)
  await a.wait_for_function("()=>EQDraw._state().R.phase==='ended'", timeout=20000)
  ok(await a.locator('.dg-rank-row').count() == 2, f'{tag} สรุปผล 2 คน (C ออกไปแล้ว)')
  ok(await a.locator('.dg-words li').count() >= 2, f'{tag} สรุปคำที่เจอในเกม')
  await a.locator('[data-dg-save]').click(); await a.wait_for_timeout(1000)
  saved = await a.locator('[data-dg-save]').inner_text()
  ok('เก็บแล้ว' in saved, f'{tag} เก็บคำเข้าคิวทบทวน ({saved.strip()})')
  exp = int(sql(f"SELECT COALESCE(SUM(amount),0) FROM exp_log WHERE user_id={others[0]['id']} AND reason='draw'"))
  ok(0 < exp <= 200, f'{tag} ได้ EXP จากโหมดนี้ ({exp}) และไม่เกินเพดาน 200')
  ok(await a.evaluate(NOOVER), f'{tag} หน้าสรุปไม่ล้นแนวนอน')
  await a.screenshot(path=f'{OUT}/draw_result_{w}.png', full_page=True)
  if w == 1280:
    # ผู้ดูแล: เห็นรายงานจากเกม + ดูภาพวาดที่เป็นหลักฐาน
    sql(f"UPDATE users SET role='admin' WHERE id={A['id']}")
    await a.reload(); await a.wait_for_timeout(2000)
    await a.evaluate("()=>EQApp.navigateTo('admin')"); await a.wait_for_timeout(1500)
    sm = a.locator('#admin-reports > summary, details:has(#admin-reports-list) > summary').first
    if await sm.count(): await sm.click(); await a.wait_for_timeout(800)
    btn = a.locator('[data-dg-evidence]').first
    await btn.wait_for(timeout=8000); await btn.click()
    await a.wait_for_selector('.dg-ev-canvas', timeout=8000)
    px = await a.evaluate("""()=>{const c=document.querySelector('.dg-ev-canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=16){if(d[i]<200||d[i+1]<200||d[i+2]<200)n++}return n}""")
    ok(px > 50, f'{tag} ผู้ดูแลดูภาพวาดที่ถูกรายงานได้ ({px} พิกเซล)')
    await a.screenshot(path=f'{OUT}/draw_admin_{w}.png', full_page=False)
    await a.evaluate("()=>EQApp.navigateTo('draw')"); await a.wait_for_timeout(800)
  # การ์ดคำเชิญอัปเดตสถานะ (B ยังเห็นการ์ดในแชทโลก)
  for P in (A, B, C):
    ok(not P['errs'], f'{tag} {P["name"][:2]} ไม่มี JS error {P["errs"][:2]}')
  await a.evaluate("()=>EQApp.api('/draw/leave',{method:'POST',body:{}})"); await bp.evaluate("()=>EQApp.api('/draw/leave',{method:'POST',body:{}})")
  await a.wait_for_timeout(300)
  for P in (A, B, C): await P['ctx'].close()

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
