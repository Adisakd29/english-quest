"""
v1.19.1 โหมดฟัง A-Level (Listening & Speaking) — E2E 390 / 820 / 1280
  - ส่วน Listening & Speaking ของ A-Level: ข้อสอบจริงเป็นบทสนทนาตัวอักษร → แสดงบทสนทนาเป็นค่าเริ่มต้น · ปุ่มฟังเป็นตัวเสริม
  - เลือก "ซ่อนบทสนทนา (ฝึกฟังอย่างเดียว)" ได้ และจำค่าไว้
  - กดฟัง: อ่านทุกบรรทัดตามลำดับ · ช่องว่างไม่ถูกอ่านเป็นตัวอักษร (ใช้เสียงบี๊บ) · ผู้พูดต่างกันได้เสียง/ระดับเสียงต่างกัน
  - หยุดได้ · เปลี่ยนกลุ่ม/ออกจากหน้า = หยุดเสียง · ความเร็วช้า · แสดง/ซ่อนบทสนทนา
  - Reading/Writing และ TGAT ไม่มีแผงฟัง · หลังส่งสอบจำลอง ดูเฉลยเห็นบทสนทนาเสมอ
  - v1.19.2 ตัวเลือกเสียง: อัตโนมัติ · ลองฟัง · เครื่องไม่มีเสียงอังกฤษ = แจ้งวิธีติดตั้ง · เลือกแล้วจำค่า
  - ไม่ล้นแนวนอน · ไม่มี JS error
  (แทน speechSynthesis.speak ด้วยตัวบันทึก — เบราว์เซอร์ทดสอบไม่มีเสียงจริง)
"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
STUB = """()=>{window.__said=[];const ss=window.speechSynthesis;
  ss.speak=function(u){window.__said.push({text:u.text,pitch:u.pitch,rate:u.rate,voice:u.voice?u.voice.name:null});setTimeout(()=>u.onend&&u.onend(),30)};
  ss.cancel=function(){window.__cancel=(window.__cancel||0)+1};}"""
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL)
  tok = (await pg.evaluate(REG, 'tl%d' % random.randint(100000, 999999)))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(1800)
  await pg.evaluate(STUB)
  await pg.evaluate("()=>EQApp.navigateTo('tcas')"); await pg.wait_for_selector('.tc-set', timeout=10000)
  await pg.locator('[data-tc-exam="alevel"]').click(); await pg.wait_for_selector('[data-tc-practice="AL-S1"]', timeout=10000)
  await pg.locator('[data-tc-practice="AL-S1"][data-section="listening_speaking"]').click()
  await pg.wait_for_selector('.tc-item', timeout=10000)
  ok(await pg.locator('.tc-listen').count() == 1, f'{tag} ส่วน Listening มีแผงฟัง')
  ok(await pg.locator('#tc-passage .tc-transcript').is_visible(), f'{tag} บทสนทนาแสดงเป็นค่าเริ่มต้น (เหมือนข้อสอบจริง)')
  ok('ไม่มีเสียง' in await pg.locator('.tc-listen-fine').inner_text(), f'{tag} บอกว่าข้อสอบจริงส่วนนี้ไม่มีเสียง')
  lines = await pg.evaluate("()=>EQTcas._state().S.groups[0].dialogue")
  await pg.locator('[data-tc-play]').click(); await pg.wait_for_timeout(300)
  ok('หยุด' in await pg.locator('[data-tc-play]').inner_text(), f'{tag} กดฟังแล้วปุ่มเป็น "หยุด"')
  ok('กำลังเล่น' in await pg.locator('#tc-listen-st').inner_text(), f'{tag} แสดงสถานะกำลังเล่น')
  await pg.wait_for_function("()=>/เล่นจบ/.test(document.getElementById('tc-listen-st').textContent)", timeout=60000)
  said = await pg.evaluate("()=>window.__said")
  joined = ' '.join(x['text'] for x in said)
  ok(len(said) >= len(lines), f'{tag} อ่านครบทุกบรรทัด ({len(said)} ท่อน / {len(lines)} บรรทัด)')
  ok('___' not in joined and 'blank' not in joined.lower(), f'{tag} ช่องว่างไม่ถูกอ่านออกมา')
  first_words = lines[0]['text'].split('___')[0].strip()[:20]
  ok(said[0]['text'].startswith(first_words), f'{tag} เริ่มจากบรรทัดแรก')
  ok(not any(x['text'].startswith(l['speaker'] + ':') for x in said for l in lines), f'{tag} ไม่อ่านชื่อผู้พูด')
  sp = {}
  for l in lines: sp.setdefault(l['speaker'], l['text'].split('___')[0].strip()[:15])
  sigs = set()
  for spk, start in sp.items():
    m = next((x for x in said if start and x['text'].startswith(start)), None)
    if m: sigs.add((m['pitch'], m['voice']))
  ok(len(sigs) >= 2, f'{tag} ผู้พูดต่างคนเสียงต่างกัน ({len(sigs)} แบบ)')
  ok('หยุด' not in await pg.locator('[data-tc-play]').inner_text(), f'{tag} เล่นจบปุ่มกลับเป็น "ฟังบทสนทนา"')
  # หยุดกลางทาง
  await pg.evaluate("()=>{window.__said=[];const ss=window.speechSynthesis;ss.speak=function(u){window.__said.push({text:u.text});setTimeout(()=>u.onend&&u.onend(),400)}}")
  await pg.locator('[data-tc-play]').click(); await pg.wait_for_timeout(500)
  await pg.locator('[data-tc-play]').click(); await pg.wait_for_timeout(1500)
  n_after = await pg.evaluate("()=>window.__said.length")
  ok(n_after <= 3, f'{tag} กดหยุดแล้วไม่อ่านต่อ ({n_after} ท่อน)')
  # ความเร็ว
  await pg.evaluate(STUB)
  await pg.locator('[data-tc-rate]').click()
  ok('ช้า' in await pg.locator('[data-tc-rate]').inner_text(), f'{tag} ปรับความเร็วช้าได้')
  await pg.locator('[data-tc-play]').click(); await pg.wait_for_timeout(300)
  r = await pg.evaluate("()=>window.__said[0]&&window.__said[0].rate")
  ok(r is not None and r < 0.9, f'{tag} ความเร็วช้าใช้จริง (rate {r})')
  await pg.locator('[data-tc-play]').click()
  await pg.locator('[data-tc-rate]').click()
  # ซ่อน/แสดงบทสนทนา (ฝึกฟังอย่างเดียว)
  ok(await pg.locator('.tc-dialogue .tc-blank').count() >= 1, f'{tag} บทสนทนามีช่องว่างครบ')
  await pg.screenshot(path=f'{OUT}/tcas_listen_{w}.png', full_page=False)
  await pg.locator('[data-tc-text]').click()
  ok(await pg.locator('#tc-passage .tc-transcript').is_hidden(), f'{tag} เลือกฝึกฟังอย่างเดียว: ซ่อนบทสนทนา')
  ok(await pg.locator('.tc-listen-note').is_visible() and 'บี๊บ' in await pg.locator('.tc-listen-note').inner_text(), f'{tag} โหมดฝึกฟังบอกวิธีฟัง/ช่องว่าง')
  await pg.screenshot(path=f'{OUT}/tcas_listen_hidden_{w}.png', full_page=False)
  # v1.19.2 ตัวเลือกเสียง
  opts = await pg.locator('[data-tc-voice] option').all_inner_texts()
  ok(len(opts) >= 1 and 'อัตโนมัติ' in opts[0], f'{tag} ตัวเลือกเสียง: อัตโนมัติ + เสียงในเครื่อง {len(opts) - 1} เสียง')
  await pg.evaluate(STUB)
  await pg.locator('[data-tc-trysay]').click(); await pg.wait_for_timeout(400)
  said = await pg.evaluate("()=>window.__said")
  ok(len(said) == 1 and 'Hello' in said[0]['text'], f'{tag} ลองฟังเสียงได้')
  await pg.evaluate("()=>{speechSynthesis.getVoices=()=>[{name:'Kanya',lang:'th-TH',localService:true}];speechSynthesis.dispatchEvent(new Event('voiceschanged'))}")
  await pg.wait_for_timeout(200)
  ok(await pg.locator('#tc-voice-warn').is_visible() and await pg.locator('[data-tc-voice] option').count() == 1, f'{tag} เครื่องมีแต่เสียงไทย: แจ้งวิธีติดตั้งเสียงอังกฤษ')
  await pg.screenshot(path=f'{OUT}/tcas_voice_warn_{w}.png', full_page=False)
  await pg.evaluate("()=>{speechSynthesis.getVoices=()=>[{name:'Kanya',lang:'th-TH',localService:true},{name:'Samantha',lang:'en-US',localService:true},{name:'Daniel',lang:'en-GB',localService:true}];speechSynthesis.dispatchEvent(new Event('voiceschanged'))}")
  await pg.wait_for_timeout(200)
  opts2 = await pg.locator('[data-tc-voice] option').all_inner_texts()
  ok(len(opts2) == 3 and not any('Kanya' in o for o in opts2) and await pg.locator('#tc-voice-warn').is_hidden(), f'{tag} มีเสียงอังกฤษ: แสดงเฉพาะเสียงอังกฤษ {opts2[1:]} · ไม่เตือน')
  await pg.select_option('[data-tc-voice]', 'Daniel')
  ok(await pg.evaluate("()=>JSON.parse(localStorage.getItem('eq_tcas_listen')||'{}').voice") == 'Daniel', f'{tag} จำเสียงที่เลือก (Daniel)')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าฟังไม่ล้นแนวนอน')
  # คืนรายการเสียงจริงของเบราว์เซอร์ (ขั้นต่อไปใช้ตัวบันทึกเสียง)
  await pg.evaluate("()=>{delete speechSynthesis.getVoices;speechSynthesis.dispatchEvent(new Event('voiceschanged'))}")
  await pg.select_option('[data-tc-voice]', '')
  # เปลี่ยนกลุ่มระหว่างเล่น = หยุด
  await pg.evaluate("()=>{window.__said=[];const ss=window.speechSynthesis;ss.speak=function(u){window.__said.push({text:u.text});setTimeout(()=>u.onend&&u.onend(),400)}}")
  await pg.locator('[data-tc-play]').click(); await pg.wait_for_timeout(500)
  await pg.locator('[data-tc-go="1"]').first.click(); await pg.wait_for_timeout(1500)
  n2 = await pg.evaluate("()=>window.__said.length")
  ok(n2 <= 3, f'{tag} ไปกลุ่มถัดไปแล้วเสียงหยุด ({n2} ท่อน)')
  ok(await pg.locator('#tc-passage .tc-transcript').is_hidden(), f'{tag} กลุ่มถัดไปยังฝึกฟังอย่างเดียว (จำค่าที่เลือก)')
  await pg.locator('[data-tc-text]').click()
  ok(await pg.locator('#tc-passage .tc-transcript').is_visible() and await pg.locator('.tc-listen-note').is_hidden(), f'{tag} กด "แสดงบทสนทนา" กลับมาแบบปกติ')
  # ออกจากหน้า = หยุด
  await pg.evaluate("()=>{window.__said=[];const ss=window.speechSynthesis;ss.speak=function(u){window.__said.push({text:u.text});setTimeout(()=>u.onend&&u.onend(),400)}}")
  await pg.locator('[data-tc-play]').click(); await pg.wait_for_timeout(500)
  await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(1500)
  ok(await pg.evaluate("()=>window.__said.length") <= 3, f'{tag} ออกจากหน้าแล้วเสียงหยุด')
  # ส่วนอื่นไม่มีแผงฟัง
  await pg.evaluate("()=>EQApp.navigateTo('tcas')"); await pg.wait_for_selector('.tc-set', timeout=10000)
  await pg.locator('[data-tc-practice="AL-S1"][data-section="reading"]').click(); await pg.wait_for_selector('.tc-item', timeout=10000)
  ok(await pg.locator('.tc-listen').count() == 0 and await pg.locator('#tc-passage .tc-transcript').is_visible(), f'{tag} Reading ไม่มีแผงฟัง')
  await pg.locator('[data-tc-exit]').first.click(); await pg.wait_for_selector('.tc-set', timeout=10000)
  await pg.locator('[data-tc-exam="tgat1"]').click(); await pg.wait_for_selector('[data-tc-practice="TG1-S1"]', timeout=10000)
  await pg.locator('[data-tc-practice="TG1-S1"][data-section="speaking"]').click(); await pg.wait_for_selector('.tc-item', timeout=10000)
  ok(await pg.locator('.tc-listen').count() == 0, f'{tag} TGAT Speaking (สอบจริงเป็นแบบอ่าน) ไม่มีแผงฟัง')
  if w == 1280:
    # สอบจำลอง A-Level: ส่งแล้วดูเฉลย เห็นบทสนทนาเสมอ
    await pg.locator('[data-tc-exit]').first.click(); await pg.wait_for_selector('.tc-set', timeout=10000)
    await pg.locator('[data-tc-exam="alevel"]').click(); await pg.wait_for_selector('[data-tc-mock="AL-S2"]', timeout=10000)
    await pg.locator('[data-tc-mock="AL-S2"]').click(); await pg.wait_for_selector('#tc-timer', timeout=10000)
    ok(await pg.locator('.tc-listen').count() == 1 and await pg.locator('#tc-passage .tc-transcript').is_visible(), f'{tag} สอบจำลอง: ส่วน Listening & Speaking แสดงบทสนทนาเหมือนจริง')
    await pg.locator('[data-tc-text]').click()  # เลือกฝึกฟัง -> หลังส่งต้องยังเห็นบทสนทนา
    await pg.locator('.tc-palette > summary').click()
    sb = pg.locator('.tc-submit-all'); await sb.click(); await pg.wait_for_timeout(300); await sb.click()
    await pg.wait_for_selector('#tc-res-title', timeout=10000)
    await pg.locator('[data-tc-review]').click(); await pg.wait_for_selector('.tc-expl', timeout=5000)
    ok(await pg.locator('#tc-passage .tc-transcript').is_visible() and await pg.locator('[data-tc-text]').count() == 0, f'{tag} ดูเฉลย: เห็นบทสนทนาเสมอ')
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
