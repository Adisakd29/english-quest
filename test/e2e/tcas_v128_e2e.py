"""
v1.28.0 คลังข้อสอบเพิ่ม + Dropdown เลือกสนามสอบ — E2E เบราว์เซอร์จริง 390 / 820 / 1280 / 1920
  - Dropdown มี 6 สนาม (แบ่งกลุ่ม optgroup) + TOEIC · เลือกแล้วเปลี่ยนหน้ารวม · เลือก TOEIC = ไปหน้า TOEIC
  - TGAT1 / A-Level / ก.พ. ชุดละ 8 · O-NET / CU-TEP / TU-GET ชุดละ 4
  - O-NET ข้อละ 5 ตัวเลือก (A–E)
  - CU-TEP Listening: ซ่อนบทฟังก่อนตอบ (ฟังด้วยเสียงอย่างเดียวเหมือนสอบจริง) → ตอบครบกลุ่มแล้วเห็นบท
  - CU-TEP Error identification: ขีดเส้นใต้ A–D ในประโยค
  - TU-GET สอบจำลอง: ส่งแล้วเห็นคะแนนเต็ม 1000
  - ไม่ล้นแนวนอน · ไม่มี JS error · ภาพหน้าจอเก็บไว้ตรวจด้วยตา
"""
import asyncio, json, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'tcas')
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
STUB = """()=>{window.__said=[];const ss=window.speechSynthesis;if(!ss)return;
  ss.speak=function(u){window.__said.push(u.text);setTimeout(()=>u.onend&&u.onend(),20)};ss.cancel=function(){};}"""
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
def key_of(exam, sid):
  d = json.load(open(os.path.join(ROOT, exam, sid + '.json')))
  return {it['id']: it['answer'] for s in d['sections'] for g in s['groups'] for it in g['items']}

async def hub(pg, exam):
  await pg.evaluate("()=>EQApp.navigateTo('tcas')"); await pg.wait_for_selector('#tc-exam-sel', timeout=15000)
  await pg.select_option('#tc-exam-sel', exam)
  await pg.wait_for_function(f"()=>(document.querySelector('#tc-exam-sel')||{{}}).value==='{exam}' && document.querySelector('.tc-set')", timeout=10000)
  await pg.wait_for_timeout(300)

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 900, has_touch=w < 900)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL, timeout=90000)
  tok = (await pg.evaluate(REG, 'tv%d' % random.randint(100000, 999999)))['token']
  await pg.evaluate("t=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", tok); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(1800)
  await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
  await pg.evaluate(STUB)

  # Dropdown
  await pg.evaluate("()=>EQApp.navigateTo('tcas')"); await pg.wait_for_selector('#tc-exam-sel', timeout=15000)
  info = await pg.evaluate("""()=>{const s=document.querySelector('#tc-exam-sel');return {groups:[...s.querySelectorAll('optgroup')].map(g=>g.label),
     opts:[...s.options].map(o=>o.value),label:!!(s.labels&&s.labels.length)||!!s.getAttribute('aria-label'),w:s.getBoundingClientRect().width,vw:innerWidth}}""")
  ok(set(['tgat1', 'alevel', 'onet6', 'cutep', 'tuget', 'kp', '__toeic']) == set(info['opts']), f"{tag} Dropdown มี 6 สนาม + TOEIC {info['opts']}")
  ok(len(info['groups']) >= 4, f"{tag} แบ่งกลุ่มสนามสอบ {info['groups']}")
  ok(info['label'], f'{tag} Dropdown มีป้ายกำกับ (เข้าถึงได้)')
  ok(info['w'] <= info['vw'] - 16, f"{tag} Dropdown ไม่ล้นจอ ({round(info['w'])}px)")
  counts = {}
  for ex in ['tgat1', 'alevel', 'kp', 'onet6', 'cutep', 'tuget']:
    await hub(pg, ex); counts[ex] = await pg.locator('.tc-set').count()
    ok(await pg.evaluate(NOOVER), f'{tag} หน้ารวม {ex} ไม่ล้นแนวนอน')
    if ex in ('cutep', 'onet6'): await pg.screenshot(path=f'{OUT}/v128_hub_{ex}_{w}.png', full_page=True)
  ok(counts == {'tgat1': 8, 'alevel': 8, 'kp': 8, 'onet6': 4, 'cutep': 4, 'tuget': 4}, f'{tag} จำนวนชุดต่อสนาม {counts}')

  # O-NET 5 ตัวเลือก
  await hub(pg, 'onet6')
  await pg.locator('[data-tc-practice="ON6-S1"]').first.click(); await pg.wait_for_selector('.tc-item', timeout=10000)
  n_opt = await pg.locator('.tc-item').first.locator('[data-choice]').count()
  letters = await pg.locator('.tc-item').first.locator('[data-choice]').evaluate_all("els=>els.map(e=>e.getAttribute('data-choice'))")
  ok(n_opt == 5 and letters == ['0', '1', '2', '3', '4'], f'{tag} O-NET 5 ตัวเลือก ({n_opt})')
  ok(await pg.evaluate(NOOVER), f'{tag} ข้อ O-NET ไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/v128_onet_{w}.png')

  # CU-TEP Listening: ซ่อนบทก่อนตอบ
  await hub(pg, 'cutep')
  await pg.locator('[data-tc-practice="CU-S1"][data-section="listening"]').click(); await pg.wait_for_selector('.tc-item', timeout=10000)
  ok(await pg.locator('.tc-listen').count() == 1, f'{tag} CU-TEP มีแผงฟัง')
  ok(not await pg.locator('#tc-passage .tc-transcript').is_visible(), f'{tag} CU-TEP ซ่อนบทฟังก่อนตอบ')
  await pg.screenshot(path=f'{OUT}/v128_cu_listen_{w}.png')
  key = key_of('cutep', 'CU-S1')
  ids = await pg.locator('.tc-item').evaluate_all("els=>els.map(e=>e.id)")
  for i, el in enumerate(ids):
    await pg.wait_for_timeout(700)
    await pg.locator(f'#{el} [data-choice="{key[el[4:]]}"]').click()
    await pg.wait_for_selector(f'#{el} .tc-expl', timeout=8000)
    if i < len(ids) - 1:
      ok(not await pg.locator('#tc-passage .tc-transcript').is_visible(), f'{tag} ยังตอบไม่ครบกลุ่ม บทยังซ่อน ({i + 1}/{len(ids)})')
  await pg.wait_for_timeout(300)
  ok(await pg.locator('#tc-passage .tc-transcript').is_visible(), f'{tag} ตอบครบกลุ่มแล้วเห็นบทฟัง')

  # CU-TEP Error identification
  await hub(pg, 'cutep')
  await pg.locator('[data-tc-practice="CU-S1"][data-section="writing"]').click(); await pg.wait_for_selector('.tc-item', timeout=10000)
  first = pg.locator('.tc-item').first
  ks = await first.locator('.tc-err-k').evaluate_all("els=>els.map(e=>e.textContent)")
  ok(ks == ['A', 'B', 'C', 'D'] and await first.locator('u.tc-err').count() == 4, f'{tag} หาจุดผิด: ขีดเส้นใต้ A–D {ks}')
  ok(not await first.evaluate("e=>/\\[\\[/.test(e.textContent)"), f'{tag} ไม่มีเครื่องหมาย [[ ]] หลุดออกมา')
  ok(await pg.evaluate(NOOVER), f'{tag} ข้อหาจุดผิดไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/v128_cu_err_{w}.png')

  # TU-GET สอบจำลอง → คะแนนเต็ม 1000
  if w in (390, 1280):
    await hub(pg, 'tuget')
    await pg.locator('[data-tc-mock="TU-S1"]').click()
    try: await pg.wait_for_selector('#tc-timer', timeout=10000)
    except Exception: pass
    if await pg.locator('#tc-timer').count() == 0:  # มีหน้ายืนยันก่อนเริ่ม
      await pg.locator('[data-tc-start], .tc-start').first.click(); await pg.wait_for_selector('#tc-timer', timeout=10000)
    key = key_of('tuget', 'TU-S1')
    el = await pg.locator('.tc-item').first.get_attribute('id')
    await pg.locator(f'#{el} [data-choice="{key[el[4:]]}"]').click(); await pg.wait_for_timeout(400)
    pal = pg.locator('.tc-palette > summary')
    if await pal.count(): await pal.click()
    sb = pg.locator('.tc-submit-all'); await sb.click(); await pg.wait_for_timeout(300)
    if await pg.locator('#tc-res-title').count() == 0: await sb.click()
    await pg.wait_for_selector('#tc-res-title', timeout=10000)
    t = await pg.locator('#tc-res-title').inner_text()
    ok('/1000' in t.replace(' ', ''), f'{tag} TU-GET ผลสอบจำลองเต็ม 1000 ({t.strip()})')
    ok(await pg.locator('.tc-res-sec').count() == 3, f'{tag} TU-GET คะแนนแยก 3 ส่วน')
    ok(await pg.locator('.tc-pass').count() == 0, f'{tag} TU-GET ไม่แสดงผ่าน/ไม่ผ่าน (ไม่มีเกณฑ์กลาง)')
    await pg.screenshot(path=f'{OUT}/v128_tu_result_{w}.png', full_page=True)

  # TOEIC
  await pg.evaluate("()=>EQApp.navigateTo('tcas')"); await pg.wait_for_selector('#tc-exam-sel', timeout=15000)
  await pg.select_option('#tc-exam-sel', '__toeic'); await pg.wait_for_timeout(1500)
  ok('toeic' in pg.url, f'{tag} เลือก TOEIC แล้วไปหน้า TOEIC ({pg.url.split("#")[-1]})')
  ok(not errs, f'{tag} ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def main():
  os.makedirs(OUT, exist_ok=True)
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w, h in [(390, 844), (820, 1180), (1280, 860), (1920, 1080)]: await run(b, w, h)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  for f in FAILS: print(' -', f)
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
