"""
v1.27.1 หน้าแรก + World Raid เล่นต่อเนื่อง + พลังชีวิตผู้เล่น — E2E เบราว์เซอร์จริง ที่ 390 · 820 · 1280 · 1920
  หน้าแรก: แบนเนอร์กิจกรรมอยู่บนสุด (เหนือฉากตัวละคร) และเตี้ยลง · การ์ด World Raid อยู่ใต้แบนเนอร์ HP ตรงกับเซิร์ฟเวอร์ · กดแล้วเข้า Raid
  Raid: หลอดพลังชีวิต 100/100 · ตอบถูก → ไปข้อถัดไปเอง · ตอบผิด → บอสตีกลับ (−HP · จอสั่น) ค้างให้เห็นเฉลยก่อนแล้วไปต่อเอง
        "หยุดอ่านเฉลย" = ไม่ข้ามเอง · พลังหมด = "หมดแรง!" ขึ้นสรุป (ไม่เริ่มรอบใหม่เอง) · ปิดโหมดอัตโนมัติได้และจำไว้
  ไม่ล้นแนวนอน · ไม่มี JS error · ปุ่มสูง ≥ 44px
  python3 test/e2e/raid_hp_auto_e2e.py [โฟลเดอร์ภาพ]  (EQ_URL · EQ_DB)
"""
import asyncio, json, os, random, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/raid_hp'; os.makedirs(OUT, exist_ok=True)
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
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 900, has_touch=w < 900)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.add_init_script(f"localStorage.setItem('wq_token','{tok}');localStorage.setItem('eq_pwa',JSON.stringify({{snoozeUntil:Date.now()+9e8}}))")
  await pg.add_init_script("""(()=>{window.__struck=0;new MutationObserver(m=>{for(const x of m){if(x.target.classList&&x.target.classList.contains('is-struck'))window.__struck++}}).observe(document,{subtree:true,attributes:true,attributeFilter:['class']})})()""")
  await pg.goto(URL); await pg.wait_for_timeout(4500)
  await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
  try: await pg.wait_for_selector('#home-raid-slot .rd-playcard', timeout=10000)
  except Exception: pass
  # ---------- หน้าแรก ----------
  g = await pg.evaluate("""()=>{const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {t:Math.round(b.top+scrollY),h:Math.round(b.height),b:Math.round(b.bottom+scrollY)}};
     return {ev:r('.hl-events-wrap'),evc:r('#evc .evc-viewport')||r('#evc'),raid:r('#home-raid-slot .rd-playcard'),center:r('.hl-center'),left:r('.hl-left'),right:r('.hl-right'),go:r('#home-raid-slot .rd-playcard-go'),
       txt:(document.querySelector('#home-raid-slot')||{}).textContent||''}}""")
  ok(g['ev'] and g['center'] and g['ev']['t'] < g['center']['t'] and g['ev']['t'] <= g['left']['t'] and g['ev']['t'] <= g['right']['t'], f"{tag} แบนเนอร์กิจกรรมอยู่บนสุดของหน้าแรก (แบนเนอร์ {g['ev']['t'] if g['ev'] else None} · ฉากตัวละคร {g['center']['t'] if g['center'] else None})")
  lim = 360 if w < 700 else 300
  ok(g['evc'] and g['evc']['h'] <= lim, f"{tag} แบนเนอร์เตี้ยลง ({g['evc']['h'] if g['evc'] else None}px ≤ {lim} · เดิม 492–508px)")
  p = poll(tok)['boss']
  ok(g['raid'] and g['raid']['t'] >= g['evc']['b'] - 2 and g['raid']['b'] <= g['center']['t'] + 2, f"{tag} การ์ด World Raid อยู่ใต้แบนเนอร์ เหนือฉากตัวละคร")
  hp_txt = f"{p['hp']:,} / {p['maxHp']:,} HP"
  ok(p['nameEn'] in g['txt'] and hp_txt in g['txt'], f"{tag} การ์ดแสดงบอส/HP ตรงกับเซิร์ฟเวอร์ ({p['nameEn']} · {hp_txt})")
  ok(g['go'] and g['go']['h'] >= 44, f"{tag} ปุ่มเข้าโจมตีสูง ≥ 44px ({g['go']['h'] if g['go'] else None})")
  ov = await pg.evaluate("()=>document.documentElement.scrollWidth - innerWidth"); ok(ov <= 1, f'{tag} หน้าแรกไม่ล้นแนวนอน ({ov})')
  await pg.screenshot(path=f'{OUT}/home_{w}.png')
  await pg.locator('#home-raid-slot .rd-playcard').click()
  await pg.wait_for_function("()=>EQRaid._state().open && location.hash.includes('raid')", timeout=10000)
  ok(True, f'{tag} กดการ์ดบนหน้าแรก → เข้าหน้า Raid')
  await pg.wait_for_timeout(3500)
  # ---------- Raid: พลังชีวิต + เล่นต่อเนื่อง ----------
  ok(await pg.locator('[data-rd="autotoggle"][aria-pressed="true"]').count() == 1, f'{tag} โหมดเล่นต่อเนื่องเปิดเป็นค่าเริ่มต้น (มีสวิตช์ปิดได้)')
  await pg.locator('[data-rd="enter"]').click()
  await pg.wait_for_selector('#rd-php', timeout=10000)
  t0 = await pg.locator('.rd-php-n').text_content()
  ok(t0.replace(' ', '') == '100/100', f'{tag} เริ่มรอบมีพลังชีวิต 100/100 ({t0})')
  # ตอบถูก → ไปข้อถัดไปเอง
  i0 = await answer(pg, True)
  au_ok = await pg.evaluate("()=>EQRaid._state().auto")
  t = time.time()
  try: await pg.wait_for_function(f"()=>{{const r=EQRaid._state().round;return r&&r.index>{i0}&&!r.last}}", timeout=6000); dt = time.time() - t
  except Exception: dt = None
  ok(dt is not None and dt < 4.5, f'{tag} ตอบถูก → ไปข้อถัดไปเองโดยไม่ต้องกด ({dt and round(dt, 1)} วินาที)')
  # ตอบผิด → บอสตีกลับ · ค้างให้เห็นเฉลย แล้วไปต่อเอง
  s0 = await pg.evaluate('window.__struck')
  i1 = await answer(pg, False)
  au = await pg.evaluate("()=>EQRaid._state().auto")
  fb = await pg.locator('.rd-feedback').text_content()
  php = (await pg.locator('.rd-php-n').text_content()).replace(' ', '')
  hit = int(sql(f"SELECT player_hit FROM raid_question_responses WHERE attempt_id = (SELECT id FROM raid_attempts WHERE user_id = (SELECT id FROM users WHERE username = '{name}') ORDER BY started_at DESC LIMIT 1) AND qidx = {i1}") or 0)
  lvl = int(sql(f"SELECT b.level FROM raid_attempts a JOIN raid_boss_instances b ON b.id = a.instance_id WHERE a.user_id = (SELECT id FROM users WHERE username = '{name}') ORDER BY a.started_at DESC LIMIT 1") or 1)
  hits = [round(x * min(2, 1 + 0.05 * (lvl - 1))) for x in (20, 25, 30)]   # v1.27.1 บอสเลเวลสูงตีแรงขึ้น +5%/เลเวล
  ok(hit in hits and 'บอสตีกลับ' in fb and php == f'{100 - hit}/100', f'{tag} ตอบผิด → บอสตีกลับ −{hit} (หลอด {php}) · ข้อความบอกในเฉลย')
  reduce = await pg.evaluate("()=>matchMedia('(prefers-reduced-motion: reduce)').matches")
  ok(reduce or (await pg.evaluate('window.__struck')) > s0, f'{tag} จอสั่น/แฟลชแดงตอนโดนตี')
  await pg.screenshot(path=f'{OUT}/hit_{w}.png')
  # ตรวจเวลาที่ตั้งไว้ (ms) ไม่ใช่เวลาที่เหลือ — เครื่องทดสอบไม่มี GPU อ่านค่าช้าไม่แน่นอน
  # ใช้ค่าที่ตั้งล่าสุด (last) เพราะเครื่องช้าอาจอ่านหลังตัวจับเวลา 1.4 วิ ทำงานไปแล้ว
  lo = au_ok.get('last') or {}; lw = au.get('last') or {}
  ok(lw.get('kind') == 'q' and lw.get('ms') == 3200 and lo.get('kind') == 'q' and lo.get('ms') == 1400, f"{tag} ตอบผิด: ค้างเฉลยนานกว่า (ตั้งเวลา {lw.get('ms')} ms · ตอบถูก {lo.get('ms')} ms)")
  try: await pg.wait_for_function(f"()=>{{const r=EQRaid._state().round;return r&&r.index>{i1}}}", timeout=5000); moved = True
  except Exception: moved = False
  ok(moved, f'{tag} ตอบผิด: แล้วไปข้อถัดไปเอง')
  # หยุดอ่านเฉลย
  i2 = await answer(pg, False)
  if await pg.locator('.rd-summary').count() == 0:
    held = await pg.evaluate("()=>{const b=document.querySelector('[data-rd=\"hold\"]');if(b)b.click();return !!b}")
    ok(held, f'{tag} มีปุ่ม "หยุดอ่านเฉลย" ระหว่างนับถอยหลัง')
    hb = await pg.evaluate("()=>{const b=document.querySelector('.rd-next');return b?b.offsetHeight:0}")   # ความสูงจริงของ layout (ไม่นับ scale ระหว่างแอนิเมชันเด้งเข้า)
    await pg.wait_for_timeout(5000)
    ok((await pg.evaluate("()=>EQRaid._state().round.index")) == i2 and await pg.locator('.rd-feedback').count() == 1 and hb >= 44, f'{tag} กด "หยุดอ่านเฉลย" → ไม่ข้ามเอง (รอ 5 วินาที) · ปุ่มข้อถัดไปสูง {hb:.0f}px')
    await pg.locator('[data-rd="next"]').click()
  # ตีจนหมดแรง
  ko = False
  for _ in range(12):
    if await pg.locator('.rd-summary').count(): ko = True; break
    try: await pg.wait_for_selector('.rd-choice:not([disabled]), .rd-key:not([disabled]), .rd-summary', timeout=8000)
    except Exception: pass
    if await pg.locator('.rd-summary').count(): ko = True; break
    await answer(pg, False)
    if await pg.locator('.rd-feedback').count() and await pg.locator('.rd-summary').count() == 0:
      await pg.locator('[data-rd="next"]').click()
      try: await pg.wait_for_selector('.rd-summary, .rd-choice:not([disabled]), .rd-key:not([disabled])', timeout=8000)
      except Exception: pass
  att = sql(f"SELECT knocked_out, player_hp, status FROM raid_attempts WHERE user_id = (SELECT id FROM users WHERE username = '{name}') ORDER BY started_at DESC LIMIT 1")
  ok(ko and await pg.locator('.rd-ko').count() == 1 and att == 't|0|finished', f'{tag} พลังหมด → "หมดแรง!" ขึ้นสรุปรอบ (เซิร์ฟเวอร์: {att})')
  ok('สู้ต่อ' in (await pg.locator('[data-rd="again"]').text_content()), f'{tag} ปุ่ม "สู้ต่อ"')
  await pg.screenshot(path=f'{OUT}/ko_{w}.png')
  await pg.wait_for_timeout(6000)
  ok(await pg.locator('.rd-summary').count() == 1, f'{tag} หมดแรงแล้วไม่เริ่มรอบใหม่เอง (ให้พักก่อน)')
  # ปิดโหมดอัตโนมัติ → จำไว้ · ตอบถูกแล้วไม่ข้ามเอง
  await pg.locator('.rd-summary [data-rd="autotoggle"]').click()
  ok(await pg.evaluate("()=>localStorage.getItem('eq_raid_auto')") == 'off' and await pg.locator('[data-rd="autotoggle"][aria-pressed="false"]').count() >= 1, f'{tag} ปิดโหมดเล่นต่อเนื่องได้ และจำไว้ในเครื่อง')
  await pg.locator('[data-rd="again"]').click()
  await pg.wait_for_selector('#rd-php', timeout=10000)
  ok((await pg.locator('.rd-php-n').text_content()).replace(' ', '') == '100/100', f'{tag} สู้ต่อ → รอบใหม่พลังเต็ม')
  i3 = await answer(pg, True)
  await pg.wait_for_timeout(3500)
  ok((await pg.evaluate("()=>EQRaid._state().round.index")) == i3 and await pg.locator('.rd-auto').count() == 0, f'{tag} ปิดโหมดแล้ว: ตอบถูกไม่ข้ามเอง')
  ov = await pg.evaluate("()=>document.documentElement.scrollWidth - innerWidth"); ok(ov <= 1, f'{tag} หน้า Raid ไม่ล้นแนวนอน ({ov})')
  ok(not errs, f'{tag} ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  sql("UPDATE raid_settings SET data = data || '{\"roundsPerDay\": 500}'::jsonb WHERE id = 1")
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS)
    for w, h in [tuple(map(int, x.split('x'))) for x in os.environ.get('SIZES', '390x844,820x1180,1280x800,1920x1080').split(',')]: await run(b, w, h)
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
