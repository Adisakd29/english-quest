"""
v1.27.1 World Raid — Listening E2E (เบราว์เซอร์จริง · นโยบายเล่นเสียงแบบเบราว์เซอร์จริง: ต้องมีการแตะก่อน)
  - ข้อฟังจากคลัง TOEIC Part 2 (ใส่ลงรอบจริงในฐานข้อมูลด้วยตัวสร้างคำถามของเซิร์ฟเวอร์)
  - รีโหลดโดยไม่แตะจอ → เบราว์เซอร์บล็อกเสียง → ไม่เสียสิทธิ์ฟัง · ปุ่มบอก "แตะเพื่อฟังคำถาม"
  - แตะปุ่ม → เล่นเฉพาะช่วงคำถาม แล้วหยุดเอง · เพลงหรี่ระหว่างเล่น
  - กด "ข้อถัดไป" → ข้อฟังเล่นเองทันที · ฟังได้สูงสุด 2 ครั้ง แล้วปุ่มปิด
  - ตอบถูก → ดาเมจ + คำอธิบายแสดงประโยคที่ได้ยิน · หน้าเว็บไม่เคยได้รับประโยค/เฉลยก่อนตอบ
  - 390 · 820 · 1280 · 1920 · ปุ่มสูง ≥ 44px · ไม่ล้นแนวนอน · ไม่มี JS error
  SIZES=390x844,1280x800 python3 test/e2e/raid_listen_e2e.py   (EQ_URL · EQ_DB)
"""
import asyncio, json, os, random, subprocess, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FAILS = []

# Chromium แบบ headless ไม่บังคับนโยบายเล่นเสียงอัตโนมัติ (ทดสอบแล้ว: เล่นได้เสมอแม้ใส่ --autoplay-policy)
# → จำลองนโยบายจริงของเบราว์เซอร์: เล่นเสียง (ไม่ปิดเสียง) ได้เมื่อหน้าเคยถูกแตะจริงแล้วเท่านั้น
#   (นับจากเหตุการณ์ isTrusted · navigator.userActivation ใช้ไม่ได้เพราะ Playwright evaluate นับเป็น user gesture)
AUTOPLAY = """(()=>{const o=HTMLMediaElement.prototype.play;window.__blocked=0;window.__act=false;
const on=(e)=>{if(e.isTrusted&&!(e.type==='keydown'&&e.key==='Escape'))window.__act=true};
['pointerdown','mousedown','touchend','click','keydown'].forEach(t=>addEventListener(t,on,true));
HTMLMediaElement.prototype.play=function(){if(!window.__act&&!this.muted){window.__blocked++;return Promise.reject(new DOMException('blocked','NotAllowedError'))}return o.call(this)}})()"""
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()

def call(method, path, token=None, body=None):
  req = urllib.request.Request(URL + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
  try:
    with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b'null')
  except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')

def listen_qs(n, seed):
  js = ("const Q=require('./services/raid/questions');const {mulberry32}=require('./services/ranked/rng');"
        f"const qs=Q.listeningQuestions('B1',{n},mulberry32({seed}),new Set());"
        "console.log(JSON.stringify(qs.map(q=>({id:q.id,type:q.type,cefr:q.cefr,prompt:q.prompt,instruction:q.instruction,passage:null,passageTitle:null,choices:q.choices,correctIndex:q.correctIndex,explain:q.explain,ref:q.ref,audio:q.audio,difficulty:q.difficulty,transcript:q.transcript}))))")
  out = subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True).stdout.strip().splitlines()[-1]
  return json.loads(out)

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 900, has_touch=w < 900)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.add_init_script(AUTOPLAY)
  await pg.goto(URL); await pg.wait_for_timeout(1200)
  n = 'ls%d' % random.randint(100000, 999999)
  st, r = call('POST', '/auth/register', body={'username': n, 'email': n + '@gmail.com', 'password': 'password123'})
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}));localStorage.setItem('eq_raid_auto','off')}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(3500)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
  await pg.evaluate("()=>EQApp.navigateTo('raid')"); await pg.wait_for_timeout(4000)
  await pg.locator('[data-rd="enter"]').first.click()
  await pg.wait_for_function("()=>EQRaid._state().round", timeout=10000)
  att = (await pg.evaluate("()=>EQRaid._state().round"))['attemptId']
  qs = listen_qs(2, random.randint(1, 10 ** 6))
  sql(f"UPDATE raid_attempts SET questions = jsonb_set(jsonb_set(questions, '{{0}}', '{json.dumps(qs[0]).replace(chr(39), chr(39) * 2)}'::jsonb), '{{1}}', '{json.dumps(qs[1]).replace(chr(39), chr(39) * 2)}'::jsonb) WHERE id = '{att}'")
  # ---- เปิดใหม่ในโปรไฟล์ใหม่ที่ยังไม่เคยแตะเว็บนี้ (แบบ iOS/เปิดแอปครั้งแรก) → เบราว์เซอร์บล็อกเสียงอัตโนมัติ
  await ctx.close()
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 900, has_touch=w < 900)
  pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.add_init_script(AUTOPLAY)
  await pg.add_init_script(f"localStorage.setItem('wq_token','{r['token']}');localStorage.setItem('eq_pwa',JSON.stringify({{snoozeUntil:Date.now()+9e8}}));localStorage.setItem('eq_raid_auto','off')")
  await pg.goto(URL); await pg.wait_for_timeout(3500)
  # ปิดหน้าต่างต้อนรับโดยไม่กดปุ่ม/แป้น (การกดแป้นนับเป็นการแตะของผู้ใช้)
  await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
  ok(not await pg.evaluate('window.__act'), f'{tag} (เงื่อนไขทดสอบ) หน้ายังไม่เคยถูกแตะ')
  await pg.evaluate("()=>EQApp.navigateTo('raid')"); await pg.wait_for_timeout(3500)
  ok(await pg.locator('.rd-listen-btn').count() == 1, f'{tag} ข้อ Listening แสดงปุ่มฟัง')
  st0 = await pg.evaluate("()=>EQRaid._state().clip")
  lab = await pg.locator('#rd-listen-label').text_content()
  blocked = await pg.evaluate('window.__blocked')
  ok(blocked >= 1 and st0['plays'] == 0 and not st0['playing'] and 'แตะ' in lab, f'{tag} เบราว์เซอร์บล็อกเสียงก่อนแตะ → ไม่เสียสิทธิ์ฟัง ({st0["plays"]}) · ปุ่ม "{lab}"')
  html = await pg.content()
  ok(qs[0]['transcript'] not in html and qs[1]['transcript'] not in html, f'{tag} หน้าเว็บไม่มีประโยคที่จะได้ยิน (ไม่รั่วเฉลย)')
  # ---- แตะปุ่ม → เล่นเฉพาะช่วงคำถาม
  await pg.locator('.rd-listen-btn').click(); await pg.wait_for_timeout(500)
  s1 = await pg.evaluate("()=>({c:EQRaid._state().clip,d:window.EQAudio?EQAudio._state().ducked:null})")
  ok(s1['c']['playing'] and s1['c']['plays'] == 1 and s1['c']['url'] == qs[0]['audio']['url'], f'{tag} แตะแล้วเล่นคลิปจริง ({s1["c"]["url"].split("/")[-1]})')
  ok(s1['d'] is not False, f'{tag} เพลงหรี่ระหว่างเล่นคลิป ({s1["d"]})')
  seg = qs[0]['audio']['end'] - qs[0]['audio']['start']
  await pg.wait_for_timeout(int(seg * 1000) + 1500)
  s2 = await pg.evaluate("()=>EQRaid._state().clip")
  ok(not s2['playing'] and s2['t'] <= qs[0]['audio']['end'] + 0.6, f'{tag} หยุดเองหลังจบคำถาม (หยุดที่ {s2["t"]:.2f}s · คำถามจบ {qs[0]["audio"]["end"]:.2f}s · ไม่เล่นตัวเลือก A/B/C ต่อ)')
  hs = await pg.evaluate("()=>[...document.querySelectorAll('.rd-choice, .rd-listen-btn')].map(b=>b.getBoundingClientRect().height)")
  ok(hs and min(hs) >= 44, f'{tag} ปุ่มฟัง/ตัวเลือกสูง ≥ 44px (ต่ำสุด {min(hs):.0f})')
  await pg.screenshot(path=f'/tmp/claude-0/-home-claude/1fd0a58d-9884-5422-8c4c-1c77fce86b91/scratchpad/listen_{w}.png')
  # ---- ตอบถูก
  await pg.locator(f'[data-rd-choice="{qs[0]["correctIndex"]}"]').click()
  await pg.wait_for_selector('.rd-feedback', timeout=8000)
  fb = await pg.locator('.rd-feedback').text_content()
  ok('is-ok' in (await pg.locator('.rd-feedback').get_attribute('class')) and qs[0]['transcript'] in fb, f'{tag} ตอบถูก → ดาเมจ + เฉลยแสดงประโยคที่ได้ยิน')
  dmg = sql(f"SELECT COALESCE(SUM(amount),0) FROM raid_damage_events WHERE attempt_id = '{att}'")
  ok(int(dmg or 0) > 0 or 'ไม่อยู่ในสถานะต่อสู้' in fb, f'{tag} ดาเมจบันทึกที่เซิร์ฟเวอร์ ({dmg})')
  # ---- ข้อถัดไป → เล่นเองทันที (มีการแตะแล้ว)
  await pg.locator('[data-rd="next"]').click()
  try: await pg.wait_for_function("u=>{const c=EQRaid._state().clip;return c&&c.url===u&&c.plays>=1}", arg=qs[1]['audio']['url'], timeout=6000)
  except Exception: pass
  s3 = await pg.evaluate("()=>EQRaid._state().clip")
  ok(s3['plays'] == 1 and s3['url'] == qs[1]['audio']['url'], f'{tag} กดข้อถัดไป → ข้อฟังเล่นเองทันที ({s3})')
  await pg.wait_for_timeout(int((qs[1]['audio']['end'] - qs[1]['audio']['start']) * 1000) + 1200)
  await pg.locator('.rd-listen-btn').click(); await pg.wait_for_timeout(int((qs[1]['audio']['end'] - qs[1]['audio']['start']) * 1000) + 1500)
  s4 = await pg.evaluate("()=>({c:EQRaid._state().clip,dis:document.querySelector('.rd-listen-btn').disabled,left:document.getElementById('rd-listen-left').textContent})")
  await pg.locator('.rd-listen-btn').click(force=True); await pg.wait_for_timeout(400)
  s5 = await pg.evaluate("()=>EQRaid._state().clip")
  ok(s4['c']['plays'] == 2 and s4['dis'] and s5['plays'] == 2 and not s5['playing'], f'{tag} ฟังได้สูงสุด 2 ครั้ง แล้วปุ่มปิด ({s4["left"]})')
  ov = await pg.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")
  ok(ov <= 1, f'{tag} ไม่ล้นแนวนอน ({ov})')
  ok(not errs, f'{tag} ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  sql("UPDATE raid_settings SET data = data || '{\"roundsPerDay\": 500}'::jsonb WHERE id = 1")
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--autoplay-policy=user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for w, h in [tuple(map(int, x.split('x'))) for x in os.environ.get('SIZES', '390x844,820x1180,1280x800,1920x1080').split(',')]:
      await run(b, w, h)
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
