"""v1.17.0 e2e — แชทโลกบน Game Lobby (Mini Chat + Full Chat Drawer/Bottom Sheet) · A ใช้ 390/820/1280 · B ใช้ 1280
ลำดับตามสเปก: A/B ล็อกอิน → หน้าแรก → A เปิดแชทเต็ม → A ส่ง → B เห็นในแชทย่อทันที (+ตัวเลขข้อความใหม่) → B เปิด/ตอบ → A เห็น
→ ไม่ซ้ำ → รีเฟรชแล้วประวัติยังอยู่ → หลุด/ต่อใหม่ได้ข้อความที่พลาดครั้งเดียว → Quick Chat → อ่านข้อความเก่าอยู่ไม่ถูกดึงลง (ข้อความใหม่)
→ ส่งถี่ถูกจำกัด → รายงาน → บล็อกแล้วไม่เห็น → ตั้งค่าซ่อนแชทย่อ (คงอยู่หลังรีเฟรช) → ไม่บังเมนูล่าง/ช่องพิมพ์อยู่ในจอ
→ ไม่แสดงในหน้า TOEIC/Ranked → ไม่มีการ์ดแชทโลกในหน้าเล่น · ลิงก์ #/world-chat เดิมเปิดแผงแชท
ใช้: python3 test/e2e/worldchat_e2e.py [out_dir]  (เซิร์ฟเวอร์ที่ http://localhost:3100)"""
import asyncio, json, random, re, sys, os, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
VIEWS = [('mobile', 390, 844), ('tablet', 820, 1180), ('desktop', 1280, 860)]
if os.environ.get('EQ_VIEWS'): VIEWS = [v for v in VIEWS if v[0] in os.environ['EQ_VIEWS'].split(',')]

async def login(b, w, h, prefix, wsctl=None):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', has_touch=w < 1024); pg = await ctx.new_page(); errs = []
  if wsctl is not None:
    # ควบคุม WebSocket ของ A: ตัดการเชื่อมต่อจริง + ไม่ให้ต่อใหม่ชั่วคราว (ทดสอบ Reconnect)
    async def handler(ws):
      if wsctl['block']: await ws.close(); return
      ws.connect_to_server(); wsctl['socks'].append(ws)
    await pg.route_web_socket(re.compile(r'/ws'), handler)
  pg.on('pageerror', lambda e: errs.append(str(e)))
  # บันทึก toast ทุกอันที่ขึ้นจริงบนจอ (ติดตั้งใหม่ทุกครั้งที่โหลดหน้า)
  await pg.add_init_script("window.__toasts=[];document.addEventListener('DOMContentLoaded',()=>{const c=document.getElementById('toast-container');if(c)new MutationObserver((ms)=>ms.forEach((m)=>m.addedNodes.forEach((n)=>window.__toasts.push(n.textContent||'')))).observe(c,{childList:true})})")
  await pg.goto(URL); await pg.wait_for_timeout(300)
  name = '%s%d' % (prefix, random.randint(100000, 999999))
  tok = (await pg.evaluate(REG, name))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2200)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
  await pg.reload(); await pg.wait_for_timeout(2500)
  return ctx, pg, errs, name
TOASTS = "()=>(window.__toasts||[]).join(' | ')"

def http(method, path, token=None, body=None):
  r = urllib.request.Request(URL + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
  try:
    with urllib.request.urlopen(r) as res: return json.loads(res.read() or b'{}')
  except urllib.error.HTTPError as e: return json.loads(e.read() or b'{}')
async def filler(n=9):
  # ผู้ใช้ช่วย 3 คน ส่งสลับกัน (ไม่ชนการจำกัดอัตราต่อคน) — ให้ประวัติยาวพอเลื่อนได้
  toks = []
  for i in range(3):
    u = 'fl%d' % random.randint(100000, 999999)
    toks.append(http('POST', '/api/auth/register', body={'username': u, 'email': u + '@gmail.com', 'password': 'password123'})['token'])
  for i in range(n):
    http('POST', '/api/world-chat', toks[i % 3], {'body': 'filler message %d for scrolling test' % i}); await asyncio.sleep(0.75)

async def say(pg, text, wait=2300):
  await pg.fill('#gc-input', text); await pg.press('#gc-input', 'Enter'); await pg.wait_for_timeout(wait)

async def run(b, name, w, h, fails):
  def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + f'[{name}] ' + m)
    if not c: fails.append(f'{name}: {m}')
  wsctl = {'block': False, 'socks': []}
  ca, A, ea, na = await login(b, w, h, 'ga', wsctl); cb, B, eb, nb = await login(b, 1280, 860, 'gb')
  ok(await A.locator('#gcm').is_visible() and await B.locator('#gcm').is_visible(), '1–2 ทั้งคู่อยู่หน้าแรก เห็นแชทย่อ')
  ok('เชื่อมต่อแล้ว' in await B.inner_text('#gcm') or w < 381, 'แชทย่อแสดงสถานะเชื่อมต่อ')
  # ไม่บังเมนูล่าง (มือถือ/แท็บเล็ต)
  if w < 1024:
    g = await A.locator('#gcm').bounding_box(); nav = await A.locator('#bottom-nav').bounding_box()
    ok(g['y'] + g['height'] <= nav['y'] + 1, 'แชทย่ออยู่เหนือเมนูล่าง ไม่บัง')
    # ปุ่มเรียนต่อ/Ranked/แบนเนอร์ เลื่อนขึ้นมาเหนือแถบแชทได้ (ไม่ถูกบัง)
    for sel in ['#dash-continue', '.hl-ranked', '#evc .evc-slide.is-active .evc-cta']:
      el = A.locator(sel).first
      await el.scroll_into_view_if_needed(); await A.wait_for_timeout(200)
      bb = await el.bounding_box()
      covered = await A.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y);return !!(e&&e.closest('#gcm'))}", [bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2])
      ok(not covered, f'{sel} ไม่ถูกแชทย่อบัง')
  # 3) A เปิดแชทเต็ม
  await A.locator('#gcm [data-gc-open]').first.click(); await A.wait_for_selector('#gc-input')
  ok(await A.locator('#gcp .gcp').get_attribute('role') == 'dialog', '3 กดแชทย่อแล้วเปิด Full Chat')
  panel = await A.locator('#gcp .gcp').bounding_box()
  ok(panel['width'] <= 421 if w >= 1024 else panel['width'] >= w - 1, 'Desktop = Drawer ขวา · มือถือ = เต็มความกว้าง')
  await A.wait_for_timeout(500)   # รอแอนิเมชันเปิดแผงจบ
  inp = await A.locator('#gc-input').bounding_box()
  ok(inp['y'] + inp['height'] <= h, 'ช่องพิมพ์อยู่ในจอ')
  if w < 1024:
    nav = await A.locator('#bottom-nav').bounding_box()
    top = await A.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y);return !!(e&&e.closest('#gcp'))}", [nav['x'] + 20, nav['y'] + nav['height'] / 2])
    ok(top, 'แผงแชทอยู่เหนือเมนูล่าง (ไม่ถูกบัง)')
  ok(await A.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), 'ไม่ล้นแนวนอน')
  # 4–5) A ส่ง → B เห็นในแชทย่อทันที + ตัวเลขข้อความใหม่
  t1 = 'Hello from %s!' % na
  await say(A, t1)
  ok(t1 in await B.inner_text('#gcm'), '5 B เห็นข้อความในแชทย่อทันที (เรียลไทม์)')
  ok(await B.locator('#gcm .gcm-unread-badge').count() == 1, 'B มีตัวเลขข้อความใหม่')
  ok(await A.locator('#gcm .gcm-unread-badge').count() == 0, 'ข้อความของตัวเองไม่นับเป็นข้อความใหม่')
  # 6–8) B เปิด ตอบ → A เห็น
  await B.locator('#gcm [data-gc-open]').first.click(); await B.wait_for_selector('#gc-input')
  ok(await B.locator('#gcm .gcm-unread-badge').count() == 0, '6 เปิดแชทแล้วล้างตัวเลขข้อความใหม่')
  t2 = 'Hi %s, nice to meet you' % na
  await say(B, t2)
  ok(t2 in await A.inner_text('#gc-log'), '8 A เห็นข้อความตอบกลับ')
  ok((await A.inner_text('#gc-log')).count(t1) == 1 and (await B.inner_text('#gc-log')).count(t1) == 1, '9 ข้อความไม่ซ้ำ')
  # Quick Chat (ระบบส่งเดียวกัน)
  await A.locator('[data-gc-quick="learn"]').click(); await A.wait_for_timeout(1800)
  ok("Let's learn English!" in await B.inner_text('#gc-log'), 'Quick Chat ถึงอีกคน')
  # ส่งถี่ → ถูกจำกัด
  await A.evaluate("()=>{const i=document.getElementById('gc-input');const f=document.getElementById('gc-form');i.value='fast one';f.requestSubmit();i.value='fast two';f.requestSubmit();}")
  try: await A.wait_for_function("()=>(window.__toasts||[]).some(t=>/เร็วเกินไป|ถี่/.test(t))", timeout=6000)
  except Exception: pass
  toast = await A.evaluate(TOASTS)
  ok('เร็วเกินไป' in toast or 'ถี่' in toast, f'13 ส่งถี่ถูกจำกัด ({toast[-80:]!r})')
  await A.wait_for_timeout(2200)
  # อ่านข้อความเก่าอยู่ → ไม่ถูกดึงลง + มีปุ่ม "ข้อความใหม่"
  await filler(9); await A.wait_for_timeout(800)
  await A.evaluate("()=>{const l=document.getElementById('gc-log');l.scrollTop=0}"); await A.wait_for_timeout(300)
  await B.evaluate("()=>EQApp.api('/world-chat',{method:'POST',body:{body:'scroll test message '+Date.now()%1000}})"); await A.wait_for_timeout(1200)
  st0 = await A.evaluate("()=>document.getElementById('gc-log').scrollTop")
  ok(st0 < 50 and await A.locator('#gc-new:not(.hidden)').count() == 1, 'อ่านข้อความเก่าอยู่: ไม่บังคับเลื่อนลง แสดง "ข้อความใหม่"')
  await A.click('#gc-new'); await A.wait_for_timeout(300)
  ok(await A.evaluate("()=>{const l=document.getElementById('gc-log');return l.scrollHeight-l.scrollTop-l.clientHeight<5}"), 'กด "ข้อความใหม่" แล้วเลื่อนลงล่าง')
  # 10) รีเฟรชแล้วประวัติยังอยู่
  await A.reload(); await A.wait_for_timeout(3500)
  ok(t2 in await A.inner_text('#gcm') or 'scroll test' in await A.inner_text('#gcm'), '10 รีเฟรชแล้วแชทย่อยังมีประวัติ')
  await A.locator('#gcm [data-gc-open]').first.click(); await A.wait_for_selector('#gc-input')
  ok(t1 in await A.inner_text('#gc-log'), '10 ประวัติข้อความยังอยู่หลังรีเฟรช')
  # 11) หลุด/ต่อใหม่: ได้ข้อความที่พลาดครั้งเดียว
  wsctl['block'] = True
  for sck in wsctl['socks']: await sck.close()
  wsctl['socks'] = []; await A.wait_for_timeout(1500)
  ok('เชื่อมต่อใหม่' in await A.inner_text('#gcp-conn') or 'เชื่อมต่อใหม่' in await A.inner_text('#gcm'), '11 แสดง Reconnecting')
  t3 = 'while you were offline %d' % random.randint(1000, 9999)
  await B.evaluate("t=>EQApp.api('/world-chat',{method:'POST',body:{body:t}})", t3); await B.wait_for_timeout(500)
  wsctl['block'] = False
  try:
    await A.wait_for_function("t=>document.getElementById('gc-log').innerText.includes(t)", arg=t3, timeout=25000); got = True
  except Exception: got = False
  ok(got, '11 กลับมาเชื่อมต่อแล้วได้ข้อความที่พลาด')
  await A.wait_for_timeout(1500)
  ok((await A.inner_text('#gc-log')).count(t3) == 1, '11 ข้อความที่พลาดไม่ซ้ำ')
  try:
    await A.wait_for_function("()=>document.getElementById('gcp-conn').innerText.includes('เชื่อมต่อแล้ว')", timeout=15000); back = True
  except Exception: back = False
  ok(back, f"11 สถานะกลับเป็นเชื่อมต่อแล้ว ({await A.inner_text('#gcp-conn')!r})")
  # 14) รายงาน (B รายงานข้อความของ A)
  await B.locator('.gc-msg:not(.is-mine)', has=B.locator('.gc-name', has_text=na)).last.locator('[data-gc-menu]').click(); await B.wait_for_selector('.gc-sheet')
  ok(await B.locator('[data-gc-act="profile"]').count() == 1 and await B.locator('[data-gc-act="friend"]').count() == 1, 'เมนูมี ดูโปรไฟล์ / เพิ่มเพื่อน / บล็อก / รายงาน')
  await B.click('[data-gc-act="report"]'); await B.click('[data-gc-reason="spam"]')
  try: await B.wait_for_function("()=>(window.__toasts||[]).some(t=>/ขอบคุณ|รายงาน/.test(t))", timeout=6000)
  except Exception: pass
  tt = await B.evaluate(TOASTS)
  ok('ขอบคุณ' in tt, f'14 รายงานข้อความสำเร็จ ({tt[:80]!r})')
  # กดชื่อผู้ส่ง → โปรไฟล์ (ตามสิทธิ์)
  await B.locator('.gc-msg:not(.is-mine) .gc-name', has_text=na).last.click(); await B.wait_for_timeout(1500)
  ok(await B.evaluate("()=>!!document.querySelector('.modal-overlay, .player-modal, [role=dialog][aria-label*=\"โปรไฟล์\"]')") or '#/user/' in B.url, 'กดชื่อเปิดโปรไฟล์')
  ok(na + '@gmail.com' not in await B.content(), '19 ไม่มีอีเมลของผู้ใช้อื่นในหน้า')
  await B.keyboard.press('Escape'); await B.wait_for_timeout(400)
  # 12) B บล็อก A → ไม่เห็นข้อความของ A
  if not await B.locator('#gcp').count():
    await B.evaluate("()=>EQApp.navigateTo('home')"); await B.wait_for_timeout(800)
    await B.locator('#gcm [data-gc-open]').first.click(); await B.wait_for_selector('#gc-log')
  await B.locator('.gc-msg:not(.is-mine)', has=B.locator('.gc-name', has_text=na)).last.locator('[data-gc-menu]').click(); await B.wait_for_selector('.gc-sheet')
  await B.click('[data-gc-act="block"]'); await B.wait_for_timeout(900)
  t4 = 'after block %s' % na
  await say(A, t4)
  ok(t4 not in await B.inner_text('#gc-log') and t4 not in await B.inner_text('#gcm'), '12 บล็อกแล้วไม่เห็นข้อความ')
  # Esc ปิดแผง · โฟกัสกลับ
  await A.keyboard.press('Escape')
  try: await A.wait_for_function("()=>!document.getElementById('gcp')", timeout=3000)
  except Exception: pass
  if await A.locator('#gcp').count():
    print('  debug esc:', await A.evaluate("()=>[document.querySelectorAll('#gcp').length, document.getElementById('gcp').className, EQWorldChat._state && EQWorldChat._state.open, location.hash, document.activeElement&&document.activeElement.outerHTML.slice(0,90), [...document.querySelectorAll('.gc-sheet-wrap, .modal-overlay')].filter(x=>x.getClientRects().length).map(x=>x.outerHTML.slice(0,160))]"))
  ok(await A.locator('#gcp').count() == 0, 'กด Esc ปิดแชทเต็ม กลับไปแชทย่อ')
  # ตั้งค่า: ซ่อนแชทย่อ → เหลือปุ่ม "แชท" → คงอยู่หลังรีเฟรช → เปิดกลับได้
  await A.click('#gcm [data-gcm-hide]'); await A.wait_for_timeout(1000)
  ok(await A.locator('#gcm .gcm-pill').count() == 1, 'ซ่อนแชทย่อแล้วเหลือปุ่ม "แชท"')
  await A.reload(); await A.wait_for_timeout(3500)
  ok(await A.locator('#gcm .gcm-pill').count() == 1, 'การตั้งค่าคงอยู่หลังรีเฟรช')
  await A.click('#gcm .gcm-pill'); await A.wait_for_selector('[data-gcp-settings]')
  await A.click('[data-gcp-settings]'); await A.wait_for_selector('[data-gc-pref="mini"]')
  ok(await A.locator('[data-gc-pref]').count() == 5, 'ตั้งค่า 5 ข้อ: รับแชท/แชทย่อ/แจ้งเตือน/เสียง/Quick Chat เท่านั้น')
  await A.click('[data-gc-pref="mini"]'); await A.wait_for_timeout(800)
  await A.click('[data-gc-pref="quickOnly"]'); await A.wait_for_timeout(800)
  await A.click('[data-gcp-back]'); await A.wait_for_timeout(400)
  ok(await A.locator('#gc-input').count() == 0 and await A.locator('[data-gc-quick]').count() >= 6, 'Quick Chat เท่านั้น: ไม่มีช่องพิมพ์ เหลือข้อความสำเร็จรูป')
  await A.click('[data-gcp-settings]'); await A.wait_for_selector('[data-gc-pref="quickOnly"]'); await A.click('[data-gc-pref="quickOnly"]'); await A.wait_for_timeout(800)
  await A.click('[data-gcp-close]'); await A.wait_for_timeout(500)
  ok(await A.locator('#gcm .gcm-body').count() == 1, 'เปิดแชทย่อกลับได้')
  # 17) ไม่แสดงในหน้า TOEIC / Ranked
  for path, scr in [('toeic', 'screen-toeic'), ('ranked', 'screen-ranked')]:
    await A.evaluate("p=>EQApp.navigateTo(p)", path); await A.wait_for_timeout(1500)
    ok(not await A.locator('#gcm').is_visible() and await A.locator('#gcp').count() == 0, f'17 ไม่มีแชทในหน้า {path}')
  # ไม่มีการ์ดแชทโลกในหน้าเล่น · ลิงก์เดิม #/world-chat → หน้าแรก + แผงแชท
  await A.evaluate("()=>EQApp.navigateTo('play')"); await A.wait_for_timeout(700)
  ok(await A.locator('#play-gchat-entry, #screen-play [data-gc-open]').count() == 0, 'หน้าเล่นไม่มีเมนูแชทโลกแล้ว')
  await A.evaluate("()=>{location.hash='#/world-chat'}"); await A.wait_for_timeout(1500)
  ok(await A.locator('#gcp').count() == 1 and (await A.evaluate('location.hash')) == '#/home', 'ลิงก์ #/world-chat เดิมเปิดแผงแชทบนหน้าแรก')
  await A.screenshot(path=f'{OUT}/gchat_{name}.png')
  ok(not ea and not eb, 'ไม่มี JS error ' + str((ea + eb)[:2]))
  await ca.close(); await cb.close()

async def main():
  fails = []
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for v in VIEWS: await run(b, *v, fails)
    await b.close()
  print('RESULT', 'ALL PASS' if not fails else fails); sys.exit(1 if fails else 0)
asyncio.run(main())
