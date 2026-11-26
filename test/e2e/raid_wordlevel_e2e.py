"""
v1.27.1 ศัพท์ยากขึ้นตามเลเวลบอส (เจ้าของขอ 26 พ.ย.) — E2E เบราว์เซอร์จริง 390 · 820 · 1280 · 1920
  หน้า Raid บอกระดับศัพท์ของบอส (ตรงกับเซิร์ฟเวอร์) · ข้อในรอบเป็นระดับบอส/ต่ำกว่า 1 ระดับเท่านั้น · หัวข้อบอกระดับของข้อ · ไม่ล้น · ไม่มี JS error
"""
import asyncio, json, os, random, subprocess, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = '/tmp/claude-0/-home-claude/1fd0a58d-9884-5422-8c4c-1c77fce86b91/scratchpad'
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
L = ['A1', 'A2', 'B1', 'B2', 'C1']
def register():
  n = 'wl%d' % random.randint(100000, 999999)
  r = urllib.request.urlopen(urllib.request.Request(URL + '/api/auth/register', data=json.dumps({'username': n, 'email': n + '@gmail.com', 'password': 'password123'}).encode(), headers={'Content-Type': 'application/json'}))
  return n, json.loads(r.read())['token']
def state(tok):
  return json.loads(urllib.request.urlopen(urllib.request.Request(URL + '/api/raid/state', headers={'Authorization': 'Bearer ' + tok})).read())

async def run(b, w, h):
  tag = f'[{w}]'
  name, tok = register()
  st = state(tok); lvl = st['boss']['level']; wl = st['config']['wordLevel']
  exp = L[min(4, (lvl - 1) // (st['config'].get('wordLevelEvery') or 2))]
  ok(wl == exp, f'{tag} บอส Lv.{lvl} → ศัพท์ระดับ {wl} (สูตร: {exp})')
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 900, has_touch=w < 900)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.add_init_script(f"localStorage.setItem('wq_token','{tok}');localStorage.setItem('eq_pwa',JSON.stringify({{snoozeUntil:Date.now()+9e8}}));localStorage.setItem('eq_raid_auto','off')")
  await pg.goto(URL); await pg.wait_for_timeout(4000)
  await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
  await pg.evaluate("()=>EQApp.navigateTo('raid')"); await pg.wait_for_timeout(4000)
  t = await pg.evaluate("()=>{const e=document.querySelector('.rd-wordlv');return e?e.textContent.replace(/\\s+/g,' ').trim():null}")
  ok(t and f'Lv.{lvl}' in t and wl in t, f'{tag} หน้า Raid บอกระดับศัพท์: "{t}"')
  await pg.screenshot(path=f'{OUT}/wordlv_lobby_{w}.png')
  await pg.locator('[data-rd="enter"]').click()
  await pg.wait_for_selector('.rd-qtype', timeout=15000); await pg.wait_for_timeout(600)
  head = await pg.evaluate("()=>document.querySelector('.rd-qtype').textContent")
  att = await pg.evaluate("()=>EQRaid._state().round.attemptId")
  lv = sql(f"SELECT string_agg(q->>'cefr', ',') FROM raid_attempts a, jsonb_array_elements(a.questions) q WHERE a.id = '{att}'").split(',')
  allowed = {wl, L[max(0, L.index(wl) - 1)]}
  ok(set(lv) <= allowed and lv.count(wl) >= round(len(lv) * 0.7) - 1, f'{tag} ข้อในรอบ: {lv.count(wl)}/{len(lv)} ระดับ {wl} · ที่เหลือ {sorted(set(lv) - {wl})}')
  ok(any(c in head for c in allowed), f'{tag} หัวข้อบอกระดับของข้อ ({head.strip()})')
  await pg.screenshot(path=f'{OUT}/wordlv_q_{w}.png')
  ov = await pg.evaluate("()=>document.documentElement.scrollWidth - innerWidth"); ok(ov <= 1, f'{tag} ไม่ล้นแนวนอน ({ov})')
  ok(not errs, f'{tag} ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for w, h in ((390, 844), (820, 1180), (1280, 800), (1920, 1080)): await run(b, w, h)
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
