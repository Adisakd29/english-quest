"""
v1.27.1 ตีบอส Raid ได้ EXP (เจ้าของขอ 26 พ.ย.) — E2E เบราว์เซอร์จริง 390 · 820 · 1280 · 1920
  ตอบผิด = ไม่ได้ EXP · ตอบถูก (ตีโดน) = กล่องเฉลยแสดง +3 EXP · แถบ EXP บนหัวอัปเดตทันที · ฐานข้อมูล/exp_log ตรงกัน
"""
import asyncio, json, os, random, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-claude/1fd0a58d-9884-5422-8c4c-1c77fce86b91/scratchpad'; os.makedirs(OUT, exist_ok=True)
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
def register():
  n = 'hp%d' % random.randint(100000, 999999)
  r = urllib.request.urlopen(urllib.request.Request(URL + '/api/auth/register', data=json.dumps({'username': n, 'email': n + '@gmail.com', 'password': 'password123'}).encode(), headers={'Content-Type': 'application/json'}))
  return n, json.loads(r.read())['token']
def poll(tok):
  r = urllib.request.urlopen(urllib.request.Request(URL + '/api/raid/poll', headers={'Authorization': 'Bearer ' + tok}))
  return json.loads(r.read())

async def cur(pg):
  st = await pg.evaluate("()=>EQRaid._state().round")
  row = sql(f"SELECT questions->current->>'type', questions->current->>'correctIndex', questions->current->>'answer', jsonb_array_length(questions->current->'choices') FROM raid_attempts WHERE id = '{st['attemptId']}'")
  qtype, ci, ans, n = row.split('|')
  return st, qtype, int(ci) if ci not in ('', None) else -1, ans, int(n or 0)

async def answer(pg, right):
  st, qtype, ci, ans, n = await cur(pg)
  await pg.wait_for_timeout(1300)   # เวลาตอบขั้นต่ำ (กันบอท)
  if qtype == 'spell':
    hint = await pg.locator('.rd-slot.is-hint').count()
    keys = [ch if right else ('z' if ch != 'z' else 'y') for ch in ans[hint:]]
    # กดปุ่มบนจอทีละตัวด้วย DOM click (เครื่องทดสอบวาด WebGL ด้วย CPU ~5 fps → locator.click รอ "นิ่ง" นานจนหมดเวลาข้อ)
    await pg.evaluate("(ks)=>{for(const k of ks){const b=document.querySelector(`[data-rd-key=\"${k}\"]`);if(b)b.click()}}", keys)
    await pg.wait_for_selector('[data-rd-key="go"]:not([disabled])', timeout=8000)
    await pg.evaluate("()=>document.querySelector('[data-rd-key=go]').click()")
  else:
    await pg.locator(f'[data-rd-choice="{ci if right else (ci + 1) % n}"]').click()
  await pg.wait_for_selector('.rd-feedback, .rd-summary', timeout=8000)
  return st['index']

async def run(b, w, h):
  tag = f'[{w}]'
  name, tok = register()
  uid = int(sql(f"SELECT id FROM users WHERE username = '{name}'"))
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 900, has_touch=w < 900)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.add_init_script(f"localStorage.setItem('wq_token','{tok}');localStorage.setItem('eq_pwa',JSON.stringify({{snoozeUntil:Date.now()+9e8}}));localStorage.setItem('eq_raid_auto','off')")
  await pg.goto(URL); await pg.wait_for_timeout(4000)
  await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
  await pg.evaluate("()=>EQApp.navigateTo('raid')"); await pg.wait_for_timeout(4000)
  help_txt = await pg.evaluate("()=>document.body.textContent")
  await pg.locator('[data-rd="enter"]').click()
  await pg.wait_for_selector('.rd-q, .rd-kb, [data-rd-choice]', timeout=15000)
  e0 = int(sql(f"SELECT exp FROM users WHERE id = {uid}"))
  lab0 = await pg.evaluate("()=>document.getElementById('hud-exp-label').textContent")
  # ตอบผิด → ไม่มี EXP
  await answer(pg, False)
  fb = await pg.evaluate("()=>document.querySelector('.rd-feedback').textContent")
  ok('EXP' not in fb and int(sql(f"SELECT exp FROM users WHERE id = {uid}")) == e0, f'{tag} ตอบผิด: ไม่ได้ EXP')
  await pg.evaluate("()=>document.querySelector('[data-rd=next]').click()"); await pg.wait_for_timeout(1200)
  # ตอบถูก → +3 EXP บนกล่องเฉลย + แถบ EXP บนหัวอัปเดต + ฐานข้อมูลตรง
  await answer(pg, True)
  await pg.wait_for_timeout(500)
  fb = await pg.evaluate("()=>{const f=document.querySelector('.rd-feedback');const e=f&&f.querySelector('.rd-fb-exp');return {t:f?f.textContent.replace(/\\s+/g,' '):'',exp:e?e.textContent.trim():null}}")
  e1 = int(sql(f"SELECT exp FROM users WHERE id = {uid}"))
  lab1 = await pg.evaluate("()=>document.getElementById('hud-exp-label').textContent")
  ok(fb['exp'] and '+3 EXP' in fb['exp'] and e1 == e0 + 3, f"{tag} ตีโดน: แสดง '{fb['exp']}' · EXP ในฐานข้อมูล {e0} → {e1}")
  ok(lab1 != lab0, f'{tag} แถบ EXP บนหัวอัปเดตทันที ({lab0} → {lab1})')
  log = sql(f"SELECT COUNT(*) || '|' || COALESCE(SUM(amount),0) FROM exp_log WHERE user_id = {uid} AND reason = 'raid_hit'")
  ok(log == '1|3', f'{tag} บันทึก exp_log raid_hit ({log})')
  await pg.screenshot(path=f'{OUT}/raid_exp_{w}.png')
  ov = await pg.evaluate("()=>document.documentElement.scrollWidth - innerWidth"); ok(ov <= 1, f'{tag} ไม่ล้นแนวนอน ({ov})')
  ok(not errs, f'{tag} ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS)
    for w, h in ((390, 844), (820, 1180), (1280, 800), (1920, 1080)): await run(b, w, h)
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
