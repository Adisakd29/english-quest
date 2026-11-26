"""
v1.22.0 ติวสอบ ก.พ. ภาค ก ภาษาอังกฤษ — E2E บนเบราว์เซอร์จริง 390 / 820 / 1280
  - ปุ่ม "ติวสอบ ก.พ." ในหน้าเส้นทางการเรียน -> เปิดแท็บ ก.พ. ทันที · ปุ่ม TCAS เดิมยังเปิด TGAT
  - หน้ารวม: 25 ข้อ · 50 นาที · 50 คะแนน · เกณฑ์ผ่าน 25 · 4 ชุด (ระดับ 1,1,2,2)
  - ฝึก Structure: ประโยคมีช่องว่าง · ตอบผิดเห็นเฉลยภาษาไทยทันที
  - สอบจำลอง (เฉลยตอนส่ง): ตัวจับเวลา 50 นาที · ตอบถูกทุกข้อ -> 50/50 "ผ่านเกณฑ์" · ตอบถูกเฉพาะ Reading -> 20/50 "ยังไม่ผ่าน"
  - ไม่ล้นแนวนอน · ไม่มี JS error
  python3 test/e2e/kp_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, json, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)
def load(set_id):
  return json.load(open(os.path.join(ROOT, 'data', 'tcas', 'kp', f'{set_id}.json')))
def key_of(set_id):
  d = load(set_id)
  return {it['id']: it['answer'] for s in d['sections'] for g in s['groups'] for it in g['items']}
def sec_of(set_id):
  d = load(set_id)
  return {it['id']: s['id'] for s in d['sections'] for g in s['groups'] for it in g['items']}
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"

async def dismiss(pg):
  await pg.wait_for_timeout(2200)   # หน้าต่างเลเวลอัปขึ้นหลังผลสอบ 1.6 วินาที
  for _ in range(4):
    await pg.wait_for_timeout(700)
    if await pg.locator('.modal-overlay').count() == 0: break
    for sel in ['#levelup-ok', '.modal-overlay [data-close]', '.modal-overlay .btn-primary']:
      if await pg.locator(sel).count(): await pg.locator(sel).first.click(); break
    await pg.wait_for_timeout(500)

async def mock(pg, tag, set_id, pick, shot=None):
  key = key_of(set_id); sec = sec_of(set_id)
  await dismiss(pg)
  await pg.evaluate("()=>EQApp.navigateTo('tcas')"); await pg.wait_for_selector('.tc-set', timeout=15000)
  box = pg.locator(f'[data-tc-mock="{set_id}"]').locator('xpath=..')
  if await box.locator('[data-tc-instant]').count(): await box.locator('[data-tc-instant]').uncheck()
  await pg.locator(f'[data-tc-mock="{set_id}"]').click(); await pg.wait_for_selector('#tc-timer', timeout=15000)
  await pg.wait_for_timeout(1200)
  t = await pg.locator('#tc-timer').inner_text()
  ngroups = await pg.evaluate("()=>EQTcas._state().S.groups.length")
  for gi in range(ngroups):
    ids = await pg.evaluate("()=>[...document.querySelectorAll('.tc-item')].map(e=>e.id.slice(4))")
    for i in ids:
      c = key[i] if pick(sec[i]) else (key[i] + 1) % 4
      await pg.locator(f'#tci-{i} [data-choice="{c}"]').click(); await pg.wait_for_timeout(120)
    if gi < ngroups - 1:
      await pg.locator(f'.btn-primary[data-tc-go="{gi + 1}"]').click(); await pg.wait_for_timeout(350)
  if shot: await pg.screenshot(path=shot, full_page=False)
  ok(await pg.locator('.tc-expl').count() == 0, f'{tag} {set_id}: ไม่เฉลยระหว่างสอบ (โหมดเฉลยตอนส่ง)')
  sb = pg.locator('.tc-nav [data-tc-submit]'); await sb.click(); await pg.wait_for_timeout(300)
  if await pg.locator('#tc-res-title').count() == 0: await sb.click()
  await pg.wait_for_selector('#tc-res-title', timeout=15000)
  return t

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL, timeout=90000)
  tok = (await pg.evaluate(REG, 'kp%d' % random.randint(100000, 999999)))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(2000)
  await pg.evaluate("()=>EQApp.navigateTo('path')"); await pg.wait_for_timeout(1200)
  # v1.28.0 รวมเป็นปุ่มเดียว "ติวสอบภาษาอังกฤษ" แล้วเลือก ก.พ. จาก Dropdown (ไม่มีปุ่ม ก.พ. แยกซ้ำซ้อน)
  ok(await pg.locator('#screen-path .kp-entry').count() == 0, f'{tag} ไม่มีปุ่ม ก.พ. แยก (ซ้ำซ้อน)')
  entry = pg.locator('#screen-path .tc-entry')
  ok(await entry.count() == 1 and await entry.is_visible() and 'ก.พ.' in await entry.inner_text(), f'{tag} ปุ่ม "ติวสอบภาษาอังกฤษ" บอกว่ามี ก.พ.')
  await entry.click(); await pg.wait_for_selector('#tc-exam-sel', timeout=15000)
  await pg.select_option('#tc-exam-sel', 'kp')
  await pg.wait_for_function("()=>/ก\\.พ\\./.test((document.getElementById('tc-title')||{}).textContent||'') && document.querySelector('.tc-set')", timeout=15000)
  # กลับหน้าเรียนแล้วกดปุ่มเดิม → จำสนามที่เลือกไว้ (ก.พ.)
  await pg.evaluate("()=>EQApp.navigateTo('path')"); await pg.wait_for_timeout(800)
  await entry.click(); await pg.wait_for_selector('.tc-set', timeout=15000); await pg.wait_for_timeout(500)
  ok('ก.พ.' in await pg.locator('#tc-title').inner_text(), f'{tag} เปิดใหม่จำสนาม ก.พ. ที่เลือกไว้')
  ok(await pg.locator('#tc-exam-sel').input_value() == 'kp', f'{tag} Dropdown เลือก ก.พ. อยู่')
  fmt = await pg.locator('.tc-format').inner_text()
  ok(all(x in fmt for x in ['25', '50', 'เกณฑ์ผ่าน', 'Conversation', 'Reading (การอ่าน) 20 คะแนน']), f'{tag} รูปแบบ: 25 ข้อ · 50 นาที · 50 คะแนน · เกณฑ์ผ่าน 25 · ส่วนละคะแนน')
  ok(await pg.locator('.tc-set').count() == 8 and await pg.locator('.tc-level.is-l1').count() == 4 and await pg.locator('.tc-level.is-l2').count() == 3 and await pg.locator('.tc-level.is-l3').count() == 1, f'{tag} v1.28.0 8 ชุด ระดับ 1×4 · 2×3 · 3×1')
  ok('คะแนนเต็ม 50' in await pg.locator('.tc-mock-text').first.inner_text(), f'{tag} การ์ดชุดบอกคะแนนเต็ม 50')
  ok('ไม่ใช่ข้อสอบจริงของสำนักงาน ก.พ.' in await pg.locator('.tc-note').inner_text(), f'{tag} หมายเหตุบอกชัดว่าไม่ใช่ข้อสอบจริง')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้ารวม ก.พ. ไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/kp_hub_{w}.png', full_page=True)

  # ฝึก Structure ชุดที่ 1
  key = key_of('KP-S1')
  await pg.locator('[data-tc-practice="KP-S1"][data-section="structure"]').click(); await pg.wait_for_selector('.tc-item', timeout=15000)
  ok(await pg.locator('.tc-item').count() == 5, f'{tag} ฝึก Structure: 5 ข้อในหน้าเดียว')
  ok(await pg.locator('#tc-passage').count() == 0 and await pg.locator('[data-tc-topassage]').count() == 0, f'{tag} ฝึก Structure: ไม่มีกล่องบทความว่าง/ปุ่มกลับไปอ่าน')
  ok('เติมคำในประโยค' in await pg.locator('#tc-gtitle').inner_text() and (await pg.locator('#tc-gtitle').inner_text()).count('โครงสร้างประโยค') == 1, f'{tag} หัวข้อไม่ซ้ำคำ')
  first = await pg.locator('.tc-item').first.get_attribute('id'); iid = first[4:]
  ok('____' in await pg.locator(f'#{first} legend').inner_text(), f'{tag} ฝึก Structure: ประโยคโจทย์มีช่องว่าง')
  await pg.wait_for_timeout(800)
  await pg.locator(f'#{first} [data-choice="{(key[iid] + 1) % 4}"]').click()
  await pg.wait_for_selector(f'#{first} .tc-expl', timeout=8000)
  ex = await pg.locator(f'#{first} .tc-expl').inner_text()
  ok('ยังไม่ถูก' in ex and any('฀' <= ch <= '๿' for ch in ex), f'{tag} ฝึก: ตอบผิดเห็นเฉลย+คำอธิบายภาษาไทย')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าฝึกไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/kp_practice_{w}.png', full_page=True)

  # สอบจำลอง: ถูกทุกข้อ -> 50/50 ผ่าน
  t = await mock(pg, tag, 'KP-S2', lambda s: True, shot=f'{OUT}/kp_mock_{w}.png')
  ok(t.startswith('49:') or t.startswith('50:'), f'{tag} สอบจำลองจับเวลา 50 นาที ({t})')
  ok(await pg.locator('.tc-score').inner_text() == '50' and '/50' in await pg.locator('#tc-res-title').inner_text(), f'{tag} ถูกทุกข้อ = 50/50')
  ok('ผ่านเกณฑ์' in await pg.locator('.tc-pass').inner_text() and await pg.locator('.tc-pass.is-pass').count() == 1, f'{tag} แสดง "ผ่านเกณฑ์"')
  ok(await pg.locator('.tc-res-sec').count() == 4, f'{tag} คะแนนแยก 4 ส่วน')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าผลไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/kp_result_pass_{w}.png', full_page=True)
  # ถูกเฉพาะ Reading -> 20/50 ไม่ผ่าน
  await mock(pg, tag, 'KP-S3', lambda s: s == 'reading')
  ok(await pg.locator('.tc-score').inner_text() == '20', f'{tag} ถูกเฉพาะ Reading = 20/50')
  ok(await pg.locator('.tc-pass.is-fail').count() == 1 and 'ยังไม่ผ่าน' in await pg.locator('.tc-pass').inner_text(), f'{tag} แสดง "ยังไม่ผ่านเกณฑ์"')
  await pg.screenshot(path=f'{OUT}/kp_result_fail_{w}.png', full_page=False)
  # ประวัติล่าสุดแสดง /50
  await dismiss(pg)
  await pg.evaluate("()=>EQApp.navigateTo('tcas')"); await pg.wait_for_selector('.tc-hist-row', timeout=15000)
  ok('/50' in await pg.locator('.tc-hist').inner_text(), f'{tag} ประวัติล่าสุดแสดงคะแนนเต็ม 50')
  # v1.28.0 ปุ่มเดียว: เปิดสนามที่เลือกไว้ล่าสุด (ก.พ.) · เปลี่ยนสนามได้จาก Dropdown
  await pg.evaluate("()=>EQApp.navigateTo('path')"); await pg.wait_for_timeout(1000)
  await pg.locator('#screen-path .tc-entry').click(); await pg.wait_for_selector('.tc-set', timeout=15000); await pg.wait_for_timeout(500)
  ok('ก.พ.' in await pg.locator('#tc-title').inner_text(), f'{tag} ปุ่มติวสอบเปิดสนามที่เลือกไว้ล่าสุด (ก.พ.)')
  await pg.select_option('#tc-exam-sel', 'tgat1'); await pg.wait_for_selector('[data-tc-practice^="TG1-"]', timeout=10000)
  ok('TGAT' in await pg.locator('#tc-title').inner_text(), f'{tag} เปลี่ยนกลับเป็น TGAT จาก Dropdown ได้')
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
