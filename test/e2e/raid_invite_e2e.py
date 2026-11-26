"""
v1.27.1 ชวนเพื่อนในแชทโลกมาตีบอส + HP บอสสด (เบราว์เซอร์จริง 2 คน) ที่ 390 · 820 · 1280 · 1920
  A (หน้า Raid) กด "ชวนเพื่อนในแชทโลก" → B (อยู่หน้าแรก) เปิดแชทโลกเห็นการ์ดบอส + HP
  A ตอบถูก → HP บนการ์ดในแชทของ B และการ์ดหน้าแรกของ B ลดเองโดยไม่รีโหลด (WebSocket raid:hp)
  B กด "เข้าร่วม" → เข้าหน้า Raid + แผงแชทปิด · ข้อความชวนไม่มีอีเมล · ไม่ล้นแนวนอน · ไม่มี JS error
"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/raid_inv'; os.makedirs(OUT, exist_ok=True)
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""

async def login(b, w, h, prefix):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 900, has_touch=w < 900)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(1200)
  name = '%s%d' % (prefix, random.randint(100000, 999999))
  r = await pg.evaluate(REG, name)
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}));localStorage.setItem('eq_raid_auto','off')}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(4000)
  await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
  return ctx, pg, errs, name

async def correct(pg):
  st = await pg.evaluate("()=>EQRaid._state().round")
  row = sql(f"SELECT questions->current->>'type', questions->current->>'correctIndex', questions->current->>'answer' FROM raid_attempts WHERE id = '{st['attemptId']}'")
  qtype, ci, ans = row.split('|')
  await pg.wait_for_timeout(1300)
  if qtype == 'spell':
    hint = await pg.locator('.rd-slot.is-hint').count()
    # DOM click (เครื่องทดสอบไม่มี GPU → locator.click รอ "นิ่ง" นานจนหมดเวลาข้อ)
    await pg.evaluate("(ks)=>{for(const k of ks){const b=document.querySelector(`[data-rd-key=\"${k}\"]`);if(b)b.click()}}", list(ans[hint:]))
    await pg.wait_for_selector('[data-rd-key="go"]:not([disabled])', timeout=8000)
    await pg.evaluate("()=>document.querySelector('[data-rd-key=go]').click()")
  else: await pg.locator(f'[data-rd-choice="{ci}"]').click()
  await pg.wait_for_selector('.rd-feedback', timeout=8000)

async def run(b, w, h):
  tag = f'[{w}]'
  ca, A, ea, na = await login(b, 1280, 800, 'ia')
  cb, B, eb, nb = await login(b, w, h, 'ib')
  await A.evaluate("()=>EQApp.navigateTo('raid')"); await A.wait_for_timeout(3500)
  await A.locator('.rd-lobby [data-rd="invite"]').click()
  await A.wait_for_timeout(1200)
  mid = sql(f"SELECT id FROM world_chat_messages WHERE invite_kind = 'raid' AND user_id = (SELECT id FROM users WHERE username = '{na}') ORDER BY id DESC LIMIT 1")
  ok(mid != '', f'{tag} A กด "ชวนเพื่อนในแชทโลก" → มีข้อความชวนในแชทโลก (#{mid})')
  await B.evaluate("()=>EQWorldChat.open()")
  try: await B.wait_for_selector(f'[data-gc-id="{mid}"] .gc-raid .gc-raid-go', timeout=10000)
  except Exception: pass
  card = B.locator(f'[data-gc-id="{mid}"] .gc-raid')
  ok(await card.count() == 1, f'{tag} B เห็นการ์ดชวนตีบอสในแชทโลก')
  hp_srv = int(sql("SELECT hp FROM raid_boss_instances WHERE status <> 'cancelled' ORDER BY level DESC LIMIT 1"))
  txt = (await card.text_content()) or ''
  ok(f'{hp_srv:,} /' in txt, f'{tag} การ์ดแสดง HP ตรงกับเซิร์ฟเวอร์ ({hp_srv:,})')
  ok('@' not in ((await B.locator(f'[data-gc-id="{mid}"]').text_content()) or ''), f'{tag} ข้อความชวนไม่มีอีเมล')
  gb = await B.evaluate("()=>{const e=document.querySelector('.gc-raid-go');return e?e.getBoundingClientRect().height:0}")
  ok(gb >= 44, f'{tag} ปุ่ม "เข้าร่วม" สูง ≥ 44px ({gb:.0f})')
  await B.screenshot(path=f'{OUT}/invite_{w}.png')
  # A ตีบอส → การ์ดของ B อัปเดตเอง
  await A.locator('[data-rd="enter"]').click(); await A.wait_for_selector('.rd-choice, .rd-key', timeout=10000)
  await correct(A)
  hp2 = int(sql("SELECT hp FROM raid_boss_instances WHERE status <> 'cancelled' ORDER BY level DESC LIMIT 1"))
  try: await B.wait_for_function(f"(s)=>{{const c=document.querySelector('[data-gc-id=\"{mid}\"] .gc-raid');return c&&c.textContent.includes(s)}}", arg=f'{hp2:,} /', timeout=8000); live = True
  except Exception: live = False
  ok(hp2 < hp_srv and live, f'{tag} A ตอบถูก → HP บนการ์ดในแชทของ B ลดเองแบบ real time ({hp_srv:,} → {hp2:,})')
  # ปิดแชท → การ์ดหน้าแรกของ B ก็สด
  await B.evaluate("()=>EQWorldChat.close()"); await B.wait_for_timeout(500)
  await A.locator('[data-rd="next"]').click(); await A.wait_for_selector('.rd-choice:not([disabled]), .rd-key:not([disabled])', timeout=8000)
  await correct(A)
  hp3 = int(sql("SELECT hp FROM raid_boss_instances WHERE status <> 'cancelled' ORDER BY level DESC LIMIT 1"))
  try: await B.wait_for_function("(s)=>{const c=document.querySelector('#home-raid-slot');return c&&c.textContent.includes(s)}", arg=f'{hp3:,} /', timeout=8000); live2 = True
  except Exception: live2 = False
  ok(live2, f'{tag} การ์ด World Raid หน้าแรกของ B อัปเดต HP เอง ({hp3:,})')
  # B กดเข้าร่วม
  await B.evaluate("()=>EQWorldChat.open()")
  await B.wait_for_selector(f'[data-gc-id="{mid}"] .gc-raid-go', timeout=8000)
  await B.locator(f'[data-gc-id="{mid}"] .gc-raid-go').click()
  try: await B.wait_for_function("()=>EQRaid._state().open && !document.querySelector('#gcp.is-in')", timeout=8000); joined = True
  except Exception: joined = False
  ok(joined, f'{tag} B กด "เข้าร่วม" → เข้าหน้า Raid และแผงแชทปิด')
  ov = await B.evaluate("()=>document.documentElement.scrollWidth - innerWidth"); ok(ov <= 1, f'{tag} ไม่ล้นแนวนอน ({ov})')
  ok(not ea and not eb, f'{tag} ไม่มี JavaScript error {(ea + eb)[:2]}')
  # จำนวน "อยู่ในศึก" ด้านบนของ A เพิ่มเมื่อ B เข้ามา (คนที่อยู่ในหน้า Raid ตอนนี้ ไม่ใช่ผู้ร่วมสู้สะสม)
  try: await A.wait_for_function("()=>{const b=EQRaid._state().boss;const t=document.querySelector('#rd-players');return b&&b.online>=2&&t&&t.textContent.includes(String(b.online))}", timeout=8000); pres = True
  except Exception: pres = False
  a_on = await A.evaluate("()=>[EQRaid._state().boss.online, EQRaid._state().boss.participants, document.querySelector('#rd-players').textContent.trim()]")
  ok(pres, f'{tag} ด้านบนของ A แสดงจำนวนคนที่อยู่ในศึกตอนนี้ (อยู่ในศึก {a_on[0]} · ร่วมสู้สะสม {a_on[1]} · "{a_on[2]}")')
  await cb.close(); cb = None
  try: await A.wait_for_function(f"()=>EQRaid._state().boss.online<{a_on[0]}", timeout=8000); left = True
  except Exception: left = False
  ok(left, f'{tag} B ปิดหน้าไป → จำนวนคนในศึกของ A ลดลงเอง')
  await ca.close()
  if cb: await cb.close()

async def main():
  sql("UPDATE raid_settings SET data = data || '{\"roundsPerDay\": 500}'::jsonb WHERE id = 1")
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS)
    for w, h in [tuple(map(int, x.split('x'))) for x in os.environ.get('SIZES', '390x844,820x1180,1280x800,1920x1080').split(',')]: await run(b, w, h)
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
