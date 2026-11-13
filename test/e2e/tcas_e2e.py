"""
v1.19.0 ติวสอบ TGAT / A-Level — E2E บนเบราว์เซอร์จริง 390 / 820 / 1280
  - เข้าจากปุ่มในหน้าเส้นทางการเรียน · แท็บ TGAT1 / A-Level
  - ฝึกทีละส่วน: ตอบแล้วเห็นถูก/ผิด + คำอธิบายภาษาไทยทันที · แจ้งข้อสอบผิดได้
  - สอบจำลอง: มีตัวจับเวลา · ข้อมูลที่ส่งมาไม่มีเฉลยก่อนส่ง · ตอบ/เปลี่ยนคำตอบ · ส่ง (กด 2 ครั้ง) -> คะแนนเต็ม 100 ตามสัดส่วน + ดูเฉลย
  - ไม่ล้นแนวนอน · ไม่มี JS error
  python3 test/e2e/tcas_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, json, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)
def key_of(exam, set_id):
  d = json.load(open(os.path.join(ROOT, 'data', 'tcas', exam, f'{set_id}.json')))
  return {it['id']: it['answer'] for s in d['sections'] for g in s['groups'] for it in g['items']}
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL)
  tok = (await pg.evaluate(REG, 'tc%d' % random.randint(100000, 999999)))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(2000)
  # เข้าจากหน้าเส้นทางการเรียน
  await pg.evaluate("()=>EQApp.navigateTo('path')"); await pg.wait_for_timeout(1200)
  entry = pg.locator('#screen-path .tc-entry')
  ok(await entry.count() == 1 and await entry.is_visible(), f'{tag} ปุ่ม "ติวสอบ TGAT / A-Level" ในหน้าเส้นทางการเรียน')
  await entry.click(); await pg.wait_for_selector('#tc-title', timeout=10000)
  ok('#/tcas' in pg.url, f'{tag} เปิดหน้าติวสอบ')
  ok(await pg.locator('.tc-tab').count() == 2, f'{tag} แท็บ TGAT1 / A-Level')
  await pg.locator('.tc-tab').first.click(); await pg.wait_for_selector('.tc-set', timeout=10000)
  ok(await pg.locator('.tc-set').count() >= 1, f'{tag} มีชุดข้อสอบ ({await pg.locator(".tc-set").count()} ชุด)')
  # v1.19.2 ระดับความยาก: 3 ชุด · ชุดสุดท้ายระดับ 2 ท้าทาย
  ok(await pg.locator('.tc-set').count() == 4 and await pg.locator('.tc-level.is-l1').count() == 2 and await pg.locator('.tc-set').nth(2).locator('.tc-level.is-l2').count() == 1 and await pg.locator('.tc-set').nth(3).locator('.tc-level.is-l3').count() == 1, f'{tag} ระดับ: ชุด 1–2 มาตรฐาน · ชุด 3 ท้าทาย · ชุด 4 เข้มข้น')
  ok('แนะนำหลังสอบจำลองระดับ 1' in await pg.locator('.tc-level.is-l2').inner_text() and 'ระดับ 2' in await pg.locator('.tc-level.is-l3').inner_text(), f'{tag} ระดับ 2/3 บอกลำดับแนะนำ (ไม่ล็อก)')
  ok('ข้อละ 10 EXP' in await pg.locator('.tc-set').first.locator('.tc-exp').inner_text() and 'ข้อละ 18 EXP' in await pg.locator('.tc-set').nth(3).locator('.tc-exp').inner_text(), f'{tag} การ์ดบอก EXP ตามระดับ (10 / 18)')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้ารวมไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/tcas_hub_{w}.png', full_page=True)

  # ฝึกทีละส่วน (Speaking ของชุดแรก)
  set_id = await pg.locator('[data-tc-practice]').first.get_attribute('data-tc-practice')
  key = key_of('tgat1', set_id)
  await pg.locator(f'[data-tc-practice="{set_id}"][data-section="speaking"]').click()
  await pg.wait_for_selector('.tc-item', timeout=10000)
  first = await pg.locator('.tc-item').first.get_attribute('id'); iid = first[4:]
  wrong = (key[iid] + 1) % 4
  await pg.wait_for_timeout(800)
  await pg.locator(f'#{first} [data-choice="{wrong}"]').click()
  await pg.wait_for_selector(f'#{first} .tc-expl', timeout=8000)
  expl = await pg.locator(f'#{first} .tc-expl').inner_text()
  ok('ยังไม่ถูก' in expl and 'เฉลย' in expl, f'{tag} ฝึก: ตอบผิดเห็นเฉลย+คำอธิบายทันที')
  ok(await pg.locator(f'#{first} .tc-opt.is-right').count() == 1 and await pg.locator(f'#{first} .tc-opt.is-wrong').count() == 1, f'{tag} ฝึก: ไฮไลต์ข้อถูก/ข้อที่เลือกผิด')
  # v1.19.2 Q-R: คำถาม + R: ____ + ตัวเลือกในการ์ดเดียว (ไม่มีกล่องบทสนทนาแยก)
  qtxt = await pg.locator(f'#{first} .tc-qr p').first.inner_text()
  dy = await pg.evaluate(f"()=>{{const p=document.querySelector('#{first} .tc-qr p');return Math.abs(p.querySelector('b').getBoundingClientRect().top-p.querySelector('.tc-qr-t').getBoundingClientRect().top)}}")
  ok(qtxt.startswith('Q:') and len(qtxt) > 8 and dy < 12, f'{tag} Q-R: "Q:" กับคำถามอยู่บรรทัดเดียวกันในการ์ดข้อ (ต่างกัน {dy:.1f}px)')
  ok(await pg.locator('#tc-passage').count() == 0, f'{tag} Q-R: ไม่มีกล่องบทสนทนาแยก')
  chosen = await pg.locator(f'#{first} [data-choice="{wrong}"] .tc-otext').inner_text()
  ok((await pg.locator(f'#{first} .tc-qr-blank').inner_text()).strip() == chosen.strip(), f'{tag} Q-R: ช่อง R แสดงคำตอบที่เลือก')
  await pg.screenshot(path=f'{OUT}/tcas_qr_{w}.png', full_page=False)
  # แจ้งข้อสอบผิด
  await pg.locator(f'#{first} [data-tc-report]').click(); await pg.wait_for_selector('.tc-report', timeout=3000)
  await pg.select_option('.tc-report select', 'typo'); await pg.fill('.tc-report textarea', 'ทดสอบ e2e')
  await pg.locator('.tc-report button[type=submit]').click(); await pg.wait_for_timeout(1000)
  ok(await pg.locator('.tc-report').count() == 0, f'{tag} แจ้งข้อสอบผิดส่งได้')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าฝึกไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/tcas_practice_{w}.png', full_page=True)

  # สอบจำลอง (ชุดเดียวกัน)
  await pg.locator('[data-tc-exit]').first.click(); await pg.wait_for_selector('.tc-set', timeout=10000)
  # v1.19.2: ค่าเริ่มต้น = เฉลยทันที · ขั้นนี้ทดสอบแบบ "เฉลยตอนส่ง" -> เอาเครื่องหมายออก
  ok(await pg.locator('[data-tc-instant]').first.is_checked(), f'{tag} สอบจำลอง: ค่าเริ่มต้นเฉลยทันที')
  await pg.locator('[data-tc-instant]').first.uncheck()
  await pg.locator(f'[data-tc-mock="{set_id}"]').click()
  await pg.wait_for_selector('#tc-timer', timeout=10000)
  await pg.wait_for_timeout(1500)
  t = await pg.locator('#tc-timer').inner_text()
  ok(t.startswith('59:') or t.startswith('60:'), f'{tag} สอบจำลองมีตัวจับเวลา ({t})')
  sid = (await pg.evaluate("()=>EQTcas._state().S.id"))
  raw = await pg.evaluate("id=>EQApp.api('/tcas/sessions/'+id).then(r=>JSON.stringify(r))", sid)
  ok('"answer"' not in raw and 'explanationTh' not in raw, f'{tag} ข้อมูลสอบจำลองไม่มีเฉลยก่อนส่ง')
  # ตอบกลุ่มแรกถูกทุกข้อ + เปลี่ยนคำตอบ 1 ครั้ง
  ids = await pg.evaluate("()=>[...document.querySelectorAll('.tc-item')].map(e=>e.id.slice(4))")
  for i in ids:
    await pg.locator(f'#tci-{i} [data-choice="{(key[i] + 2) % 4}"]').click(); await pg.wait_for_timeout(150)
    await pg.locator(f'#tci-{i} [data-choice="{key[i]}"]').click(); await pg.wait_for_timeout(250)
  ok(await pg.locator('.tc-expl').count() == 0, f'{tag} สอบจำลอง: ไม่เฉลยระหว่างสอบ')
  await pg.locator('[data-tc-go="1"]').first.click(); await pg.wait_for_timeout(600)
  ok(await pg.locator('.tc-pos').inner_text() == f'2/{await pg.evaluate("()=>EQTcas._state().S.groups.length")}', f'{tag} ไปกลุ่มถัดไปได้')
  await pg.locator('.tc-palette summary').click(); await pg.wait_for_timeout(300)
  ok(await pg.locator('.tc-pal-b.is-done').count() == len(ids), f'{tag} แผงข้อสอบแสดงข้อที่ตอบแล้ว {len(ids)} ข้อ')
  await pg.screenshot(path=f'{OUT}/tcas_mock_{w}.png', full_page=False)
  sb = pg.locator('.tc-submit-all')
  await sb.click(); await pg.wait_for_timeout(300)
  ok('กดอีกครั้ง' in await sb.inner_text(), f'{tag} ส่งข้อสอบต้องยืนยัน 2 ครั้ง (บอกข้อที่ยังไม่ตอบ)')
  await sb.click(); await pg.wait_for_selector('#tc-res-title', timeout=10000)
  score = await pg.locator('.tc-score').inner_text()
  expect = round(len(ids) / 30 * 50, 2)
  ok(abs(float(score) - expect) < 0.02, f'{tag} คะแนนสอบจำลองตามสัดส่วน ({score} = {expect})')
  ok(await pg.locator('.tc-res-sec').count() == 2, f'{tag} คะแนนแยก 2 ส่วน')
  await pg.screenshot(path=f'{OUT}/tcas_result_{w}.png', full_page=True)
  await pg.locator('[data-tc-review]').click(); await pg.wait_for_selector('.tc-expl', timeout=5000)
  ok(await pg.locator('.tc-item.is-correct').count() == len(ids), f'{tag} ดูเฉลย: ข้อที่ตอบถูกแสดงถูก')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าเฉลยไม่ล้นแนวนอน')
  # v1.19.2 สอบจำลองแบบเฉลยทันที (อีกชุด)
  await pg.evaluate("()=>EQApp.navigateTo('tcas')"); await pg.wait_for_selector('.tc-set', timeout=10000)
  other = 'TG1-S2' if set_id == 'TG1-S1' else 'TG1-S1'
  okey = key_of('tgat1', other)
  await pg.locator(f'[data-tc-mock="{other}"]').locator('xpath=..').locator('[data-tc-instant]').check()
  await pg.locator(f'[data-tc-mock="{other}"]').click(); await pg.wait_for_selector('#tc-timer', timeout=10000)
  ok('เฉลยทันที' in await pg.locator('.tc-progress').inner_text(), f'{tag} เฉลยทันที: แถบบนบอกโหมด')
  f2 = await pg.locator('.tc-item').first.get_attribute('id'); i2 = f2[4:]
  await pg.locator(f'#{f2} [data-choice="{(okey[i2] + 1) % 4}"]').click()
  await pg.wait_for_selector(f'#{f2} .tc-expl', timeout=8000)
  ok('ยังไม่ถูก' in await pg.locator(f'#{f2} .tc-expl').inner_text(), f'{tag} เฉลยทันที: ตอบผิดเห็นเฉลย+คำอธิบายทันที')
  ok(await pg.locator(f'#{f2} .tc-clear').count() == 0 and await pg.locator(f'#{f2} .tc-opt.is-right').count() == 1, f'{tag} เฉลยทันที: ไม่มีปุ่มล้างคำตอบ · ไฮไลต์ข้อถูก')
  await pg.locator(f'#{f2} [data-choice="{okey[i2]}"]').click(force=True); await pg.wait_for_timeout(500)
  ok(await pg.locator(f'#{f2} .tc-opt.is-wrong').count() == 1, f'{tag} เฉลยทันที: ตอบแล้วเปลี่ยนไม่ได้')
  await pg.locator('.tc-palette > summary').click(); await pg.wait_for_timeout(200)
  ok(await pg.locator('.tc-pal-b.is-wrong').count() == 1, f'{tag} เฉลยทันที: แผงข้อสอบแสดงข้อผิดเป็นสีแดง')
  await pg.screenshot(path=f'{OUT}/tcas_instant_{w}.png', full_page=False)
  ok(await pg.evaluate(NOOVER), f'{tag} เฉลยทันที: ไม่ล้นแนวนอน')
  # ผู้ดูแล: เห็นข้อที่ถูกแจ้ง (จากขั้นแจ้งข้อสอบผิดด้านบน) · ซ่อน/นำกลับได้
  uname = await pg.evaluate("()=>EQApp.api('/auth/me').then(r=>(r.user||r).username)")
  import subprocess
  subprocess.run(['psql', os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev'), '-qc', f"UPDATE users SET role='admin' WHERE username='{uname}'"], check=True)
  await pg.reload(); await pg.wait_for_timeout(2000)
  await pg.evaluate("()=>EQApp.navigateTo('admin')"); await pg.wait_for_timeout(1500)
  await pg.locator('#admin-tcas > summary').click()
  await pg.wait_for_selector(f'#admin-tcas-root [data-item="{iid}"]', timeout=8000)
  ok(await pg.locator('#admin-tcas-root .tc-adm-sets li').first.is_visible(), f'{tag} ผู้ดูแล: เห็นรายการชุดข้อสอบ')
  ok('ตรวจแล้ว' in await pg.locator('#admin-tcas-root .tc-adm-sets').first.inner_text(), f'{tag} ผู้ดูแล: ชุดข้อสอบสถานะตรวจแล้ว')
  await pg.locator(f'#admin-tcas-root [data-item="{iid}"] [data-tc-hide="1"]').click()
  await pg.wait_for_selector(f'#admin-tcas-root [data-tc-unhide="{iid}"]', timeout=8000)
  ok(True, f'{tag} ผู้ดูแล: ซ่อนข้อที่ถูกแจ้งได้')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าผู้ดูแลไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/tcas_admin_{w}.png', full_page=False)
  await pg.locator(f'#admin-tcas-root [data-tc-unhide="{iid}"]').click()
  await pg.wait_for_function(f"()=>!document.querySelector('#admin-tcas-root [data-tc-unhide=\"{iid}\"]')", timeout=8000)
  ok(True, f'{tag} ผู้ดูแล: นำข้อกลับมาใช้ได้')
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
