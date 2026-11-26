"""
v1.24.0 PWA Smart Install Popup — E2E
  เครื่องทดสอบเป็น Chromium headless: จำลองแต่ละระบบด้วย User-Agent/ขนาดจอ/จอสัมผัสจริงของอุปกรณ์
  และจำลอง event ของเบราว์เซอร์ (beforeinstallprompt / appinstalled) ตามสเปก — ไม่ได้ติดตั้งลงเครื่องจริง
  กรณี:
   A Android Chrome: หน้าเข้าสู่ระบบไม่เด้ง (มีปุ่มเล็ก) · หลังเข้าสู่ระบบ+แตะ → ป๊อปอัป · กดติดตั้ง → เรียก prompt() 1 ครั้ง
     → ยังไม่บอกสำเร็จจนกว่าได้ appinstalled → บอกสำเร็จ · ตั้งค่าแสดง "ติดตั้งแล้ว" · โหลดใหม่ไม่ชวนอีก
   B Android: "ไว้ทีหลัง" → เลื่อน 7 วัน (โหลดใหม่ไม่เด้ง) · ครบ 7 วัน → เด้งอีก · ปิดด้วย Esc = ไว้ทีหลัง
   C Android: ผู้ใช้ปฏิเสธในหน้าต่างของเบราว์เซอร์ → ไม่บอกสำเร็จ · เลื่อน 7 วัน
   D Android ไม่มี beforeinstallprompt → ไม่เด้งเอง · ตั้งค่าบอกวิธีจากเมนู (ไม่มีปุ่มติดตั้งปลอม)
   E iPhone Safari (iOS 18) / Safari 26 / iPad / iOS Chrome → ปุ่มหลัก "ดูวิธี…" (ไม่มีปุ่มติดตั้ง) · ขั้นตอนตรงรุ่น
   F LINE (เบราว์เซอร์ในแอป) → ปุ่ม "เปิดในเบราว์เซอร์" เป็นลิงก์จริง ?openExternalBrowser=1
   G เปิดแบบแอปแล้ว (standalone) → ไม่เด้ง · ไม่มีปุ่มในหน้าเข้าสู่ระบบ · ตั้งค่าบอกว่ากำลังใช้แบบแอป
   H Desktop Chrome/Edge มี prompt → เด้งกลางจอ · ไม่มี prompt → ไม่เด้ง · Firefox (คอม) → ไม่มีเมนู/ป๊อปอัป
   I มีหน้าต่างอื่นเปิดอยู่ → รอ ไม่ซ้อน · การแจ้งเตือนบน iPhone เปิดขั้นตอนเดียวกัน
  python3 test/e2e/pwa_install_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, os, random, sys, time
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
UA = {
  'android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'ios18': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'ios26': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  'ipad': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'ioschrome': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  'line': 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Line/14.19.1',
  'desktop': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  'firefox': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
}
BIP = """(outcome)=>{const e=new Event('beforeinstallprompt',{cancelable:true});window.__prompted=0;
  e.prompt=()=>{window.__prompted++;return Promise.resolve()}; e.userChoice=Promise.resolve({outcome,platform:'web'}); window.dispatchEvent(e)}"""
POP = '.pwa-install .pi-card'

async def ctx_for(b, kind, w, h, touch, standalone=False):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, user_agent=UA[kind], has_touch=touch, is_mobile=touch and w < 900, service_workers='block')
  init = "try{localStorage.setItem('eq_fest_fx','off')}catch(e){}"   # ลดภาระเครื่องทดสอบ (ไม่เกี่ยวกับการติดตั้ง)
  if kind == 'ipad': init += ";Object.defineProperty(navigator,'platform',{get:()=>'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5})"
  if standalone: init += ";(()=>{const o=window.matchMedia.bind(window);window.matchMedia=(q)=>/display-mode: standalone/.test(q)?{matches:true,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}:o(q)})()"
  await ctx.add_init_script(init)
  return ctx

async def login(pg):
  r = await pg.evaluate(REG, 'pw%d' % random.randint(1000000, 9999999))
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", r['token'])
  await pg.evaluate("()=>fetch('/api/changelog/seen',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('wq_token'),'Content-Type':'application/json'},body:'{}'})")
  await pg.reload(); await pg.wait_for_timeout(3500)
  for _ in range(4):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(1200)

async def interact_and_wait(pg, ms=7500, click=True):
  await pg.keyboard.press('Shift')
  if click: await pg.mouse.click(2, 300)
  await pg.wait_for_timeout(ms)

async def settings(pg):
  await pg.evaluate("()=>{EQApp.navigateTo('profile');EQApp.profileTab('settings')}"); await pg.wait_for_timeout(1200)
  return await pg.locator('#pwa-settings-card').inner_text() if await pg.locator('#pwa-settings-card').is_visible() else None

async def case_android(p):
  b = await p.chromium.launch()
  # A: ติดตั้งสำเร็จ
  ctx = await ctx_for(b, 'android', 390, 844, True); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2500)
  await pg.evaluate(BIP, 'accepted'); await pg.wait_for_timeout(300)
  ok(await pg.locator('#pwa-login-entry').is_visible(), '[A] หน้าเข้าสู่ระบบ: มีปุ่มเล็ก "ติดตั้งแอป" ใต้ฟอร์ม')
  box = await pg.locator('#pwa-login-entry').bounding_box(); form = await pg.locator('#form-login').bounding_box()
  ok(box['y'] >= form['y'] + form['height'] - 1, '[A] ปุ่มติดตั้งอยู่ใต้ฟอร์ม ไม่บังช่องกรอก')
  await interact_and_wait(pg)
  ok(await pg.locator(POP).count() == 0, '[A] หน้าเข้าสู่ระบบ: ไม่เด้งป๊อปอัปเอง (ไม่บังการกรอกข้อมูล)')
  await login(pg); await pg.evaluate(BIP, 'accepted')
  await interact_and_wait(pg)
  ok(await pg.locator(POP).is_visible(), '[A] เข้าสู่ระบบแล้ว+เริ่มใช้งาน → ป๊อปอัปเชิญติดตั้ง')
  ok(await pg.locator(f'{POP} .pi-logo img').evaluate("i=>i.complete&&i.naturalWidth>0"), '[A] โลโก้จิ้งจอกโหลดได้')
  ok('English Quest' in await pg.locator('#pi-title').inner_text() and await pg.locator(f'{POP} .pi-benefits li').count() == 3, '[A] มีชื่อแอป + ประโยชน์ 3 ข้อ')
  ok(await pg.locator(f'{POP} [data-pi="install"]').inner_text() == 'ติดตั้งแอป' and 'ไว้ทีหลัง' in await pg.locator(f'{POP} [data-pi="later"]').inner_text(), '[A] ปุ่ม "ติดตั้งแอป" และ "ไว้ทีหลัง"')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), '[A] ไม่ล้นแนวนอน (390px)')
  await pg.screenshot(path=f'{OUT}/android_popup_390.png')
  await pg.locator(f'{POP} [data-pi="install"]').click(); await pg.wait_for_timeout(700)
  ok(await pg.evaluate("()=>window.__prompted") == 1, '[A] กดติดตั้ง → เรียกหน้าต่างติดตั้งของเบราว์เซอร์ (prompt) 1 ครั้ง')
  st = await pg.locator(f'{POP} .pi-status').inner_text()
  ok('กำลังติดตั้ง' in st and 'แล้ว' not in st.replace('ยืนยันการติดตั้งแล้ว', ''), f'[A] ก่อนมีหลักฐาน: ยังไม่บอกว่าติดตั้งสำเร็จ ("{st.strip()}")')
  await pg.evaluate("()=>window.dispatchEvent(new Event('appinstalled'))"); await pg.wait_for_timeout(500)
  st = await pg.locator(f'{POP} .pi-status').inner_text()
  ok('ติดตั้ง English Quest แล้ว' in st, f'[A] ได้ appinstalled → บอกติดตั้งสำเร็จ ("{st.strip()}")')
  await pg.screenshot(path=f'{OUT}/android_installed_390.png')
  await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
  t = await settings(pg)
  ok(t and 'ติดตั้งในเครื่องนี้แล้ว' in t, f'[A] ตั้งค่า: แสดงว่าติดตั้งแล้ว ({t and t.strip()[:60]})')
  await pg.reload(); await pg.wait_for_timeout(3000); await pg.evaluate("()=>EQApp.navigateTo('home')"); await interact_and_wait(pg)
  ok(await pg.locator(POP).count() == 0, '[A] ติดตั้งแล้ว โหลดใหม่ → ไม่ชวนอีก')
  ok(not errs, f'[A] ไม่มี JS error {errs[:2]}')
  await ctx.close()
  # B: ไว้ทีหลัง / Esc / ครบ 7 วัน
  ctx = await ctx_for(b, 'android', 390, 844, True); pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2000); await login(pg); await pg.evaluate(BIP, 'accepted'); await interact_and_wait(pg)
  await pg.locator(f'{POP} [data-pi="later"]').click(); await pg.wait_for_timeout(400)
  s = await pg.evaluate("()=>JSON.parse(localStorage.getItem('eq_pwa'))")
  days = (s['snoozeUntil'] / 1000 - time.time()) / 86400
  ok(await pg.locator(POP).count() == 0 and 6.9 < days < 7.1, f'[B] "ไว้ทีหลัง" → ปิด และเลื่อน 7 วัน ({days:.2f} วัน)')
  await pg.reload(); await pg.wait_for_timeout(3000); await pg.evaluate(BIP, 'accepted'); await pg.evaluate("()=>EQApp.navigateTo('home')"); await interact_and_wait(pg)
  ok(await pg.locator(POP).count() == 0, '[B] ภายใน 7 วัน → ไม่เด้ง')
  t = await settings(pg)
  ok(t and 'ติดตั้งแอป' in t, '[B] ยังติดตั้งเองได้จากตั้งค่า')
  await pg.evaluate("()=>{const s=JSON.parse(localStorage.getItem('eq_pwa'));s.snoozeUntil=Date.now()-1000;localStorage.setItem('eq_pwa',JSON.stringify(s))}")
  await pg.reload(); await pg.wait_for_timeout(3000); await pg.evaluate(BIP, 'accepted'); await pg.evaluate("()=>EQApp.navigateTo('home')"); await interact_and_wait(pg)
  ok(await pg.locator(POP).is_visible(), '[B] ครบ 7 วัน → ชวนอีกครั้ง')
  await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
  s = await pg.evaluate("()=>JSON.parse(localStorage.getItem('eq_pwa'))")
  ok(await pg.locator(POP).count() == 0 and s['snoozeUntil'] > time.time() * 1000 + 6.9 * 86400000, '[B] ปิดด้วย Esc = ไว้ทีหลัง 7 วัน')
  await ctx.close()
  # C: ปฏิเสธในหน้าต่างของเบราว์เซอร์
  ctx = await ctx_for(b, 'android', 390, 844, True); pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2000); await login(pg); await pg.evaluate(BIP, 'dismissed'); await interact_and_wait(pg)
  await pg.locator(f'{POP} [data-pi="install"]').click(); await pg.wait_for_timeout(700)
  st = await pg.locator(f'{POP} .pi-status').inner_text()
  s = await pg.evaluate("()=>JSON.parse(localStorage.getItem('eq_pwa'))")
  ok('ยังไม่ได้ติดตั้ง' in st and not s.get('installed') and s['snoozeUntil'] > time.time() * 1000, f'[C] ปฏิเสธการติดตั้ง → ไม่บอกสำเร็จ · เลื่อน 7 วัน ("{st.strip()[:40]}")')
  await ctx.close()
  # D: ไม่มี beforeinstallprompt
  ctx = await ctx_for(b, 'android', 390, 844, True); pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2000); await login(pg); await interact_and_wait(pg)
  ok(await pg.locator(POP).count() == 0, '[D] ไม่มี beforeinstallprompt → ไม่เด้งป๊อปอัปที่กดติดตั้งไม่ได้')
  t = await settings(pg)
  ok(t and 'เมนู' in t, '[D] ตั้งค่า: บอกวิธีติดตั้งจากเมนูของเบราว์เซอร์')
  await pg.locator('[data-pi-open="settings"]').click(); await pg.wait_for_timeout(500)
  ok(await pg.locator(f'{POP} [data-pi="install"]').count() == 0 and 'ติดตั้งแอป' in await pg.locator(f'{POP} .pi-steps').inner_text(), '[D] เปิดแล้วเห็นขั้นตอนจากเมนู ไม่มีปุ่มติดตั้งปลอม')
  await ctx.close(); await b.close()

async def case_ios(p):
  b = await p.chromium.launch()
  for kind, w, h, want, tag in [('ios18', 390, 844, ['แชร์', 'ด้านล่าง', 'เพิ่มไปยังหน้าจอโฮม', 'เพิ่ม'], 'iPhone Safari iOS 18'),
                                ('ios26', 390, 844, ['แชร์', 'เปิดเป็นเว็บแอป', 'เพิ่มไปยังหน้าจอโฮม'], 'iPhone Safari 26'),
                                ('ipad', 820, 1180, ['แชร์', 'ด้านบนขวา', 'เพิ่มไปยังหน้าจอโฮม'], 'iPad Safari (iPadOS)'),
                                ('ioschrome', 390, 844, ['Chrome', 'แชร์', 'เพิ่มไปยังหน้าจอโฮม'], 'iPhone Chrome')]:
    ctx = await ctx_for(b, kind, w, h, True); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2000)
    st = await pg.evaluate("()=>EQInstall.state()")
    ok(st['isIOS'] and st['mode'] == 'ios', f'[E] {tag}: ตรวจพบ iOS/iPadOS ({st["mode"]}, {st["iosBrowser"]}, Safari26={st["iosNewUi"]})')
    ok(await pg.locator('#pwa-login-entry').is_visible(), f'[E] {tag}: หน้าเข้าสู่ระบบมีปุ่มติดตั้งแอป')
    await login(pg); await interact_and_wait(pg)
    ok(await pg.locator(POP).is_visible(), f'[E] {tag}: เข้าสู่ระบบแล้ว → ป๊อปอัปเชิญ')
    ok(await pg.locator(f'{POP} [data-pi="install"]').count() == 0, f'[E] {tag}: ไม่มีปุ่ม "ติดตั้งแอป" ปลอม (iOS ติดตั้งผ่าน JS ไม่ได้)')
    await pg.locator(f'{POP} [data-pi="guide"]').click(); await pg.wait_for_timeout(500)
    steps = await pg.locator(f'{POP} .pi-steps').inner_text()
    ok(all(x in steps for x in want), f'[E] {tag}: ขั้นตอนตรงรุ่น {want}')
    ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'[E] {tag}: ไม่ล้นแนวนอน')
    bb = await pg.locator(f'{POP} [data-pi="done"]').bounding_box()
    ok(bb and bb['y'] + bb['height'] <= h, f'[E] {tag}: ขั้นตอนเปิดแล้ว ปุ่ม "เข้าใจแล้ว" อยู่ในจอโดยไม่ต้องเลื่อน')
    await pg.screenshot(path=f'{OUT}/{kind}_guide.png')
    await pg.locator(f'{POP} [data-pi="done"]').click(); await pg.wait_for_timeout(300)
    ok(await pg.locator(POP).count() == 0 and (await pg.evaluate("()=>EQInstall.state().snoozed")), f'[E] {tag}: "เข้าใจแล้ว" ปิด และเลื่อนการชวน 7 วัน')
    if kind == 'ios18':   # การแจ้งเตือนบน iPhone → ขั้นตอนเดียวกัน
      await pg.evaluate("()=>{EQApp.navigateTo('profile');EQApp.profileTab('settings')}"); await pg.wait_for_timeout(1500)
      hb = pg.locator('[data-nt="help"]')
      try: await hb.first.wait_for(state='visible', timeout=10000)
      except Exception: pass
      if await hb.count():
        await hb.first.click(); await pg.wait_for_timeout(500)
        ok(await pg.locator(f'{POP} .pi-steps').is_visible(), '[I] การแจ้งเตือนบน iPhone: "ดูวิธีเพิ่มลงหน้าจอโฮม" เปิดขั้นตอนเดียวกัน')
        await pg.keyboard.press('Escape')
      else: ok(False, '[I] ไม่พบปุ่มช่วยเหลือการแจ้งเตือน')
    ok(not errs, f'[E] {tag}: ไม่มี JS error {errs[:2]}')
    await ctx.close()
  await b.close()

async def case_other(p):
  b = await p.chromium.launch()
  # F LINE
  ctx = await ctx_for(b, 'line', 390, 844, True); pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2000); await login(pg); await interact_and_wait(pg)
  ok(await pg.locator(POP).is_visible(), '[F] LINE: ป๊อปอัปชวนเปิดในเบราว์เซอร์')
  href = await pg.locator(f'{POP} a[data-pi="external"]').get_attribute('href')
  ok(href and 'openExternalBrowser=1' in href and href.startswith(URL), f'[F] LINE: ปุ่ม "เปิดในเบราว์เซอร์" เป็นลิงก์จริง ({href})')
  await pg.screenshot(path=f'{OUT}/line_popup.png'); await ctx.close()
  # G standalone
  ctx = await ctx_for(b, 'android', 390, 844, True, standalone=True); pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2000)
  ok(not await pg.locator('#pwa-login-entry').is_visible(), '[G] เปิดแบบแอปแล้ว: หน้าเข้าสู่ระบบไม่มีปุ่มติดตั้ง')
  await login(pg); await pg.evaluate(BIP, 'accepted'); await interact_and_wait(pg)
  ok(await pg.locator(POP).count() == 0, '[G] เปิดแบบแอปแล้ว: ไม่เด้งป๊อปอัป')
  t = await settings(pg)
  ok(t and 'กำลังใช้งานแบบแอป' in t, '[G] ตั้งค่า: บอกว่ากำลังใช้งานแบบแอป')
  await ctx.close()
  # H desktop
  ctx = await ctx_for(b, 'desktop', 1280, 800, False); pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2000); await login(pg); await interact_and_wait(pg)
  ok(await pg.locator(POP).count() == 0, '[H] Desktop Edge ไม่มี prompt → ไม่เด้ง')
  await pg.evaluate(BIP, 'accepted'); await pg.evaluate("()=>EQApp.navigateTo('home')"); await interact_and_wait(pg)
  ok(await pg.locator(POP).is_visible(), '[H] Desktop Edge มี prompt → ป๊อปอัปกลางจอ')
  bb = await pg.locator(POP).bounding_box()
  ok(abs(bb['x'] + bb['width'] / 2 - 640) < 4, '[H] ป๊อปอัปอยู่กลางจอ')
  await pg.screenshot(path=f'{OUT}/desktop_popup.png')
  await pg.locator(f'{POP} [data-pi="install"]').click(); await pg.wait_for_timeout(500)
  ok(await pg.evaluate("()=>window.__prompted") == 1, '[H] Desktop: กดติดตั้ง → prompt()')
  await ctx.close()
  ctx = await ctx_for(b, 'firefox', 1280, 800, False); pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2000)
  ok(not await pg.locator('#pwa-login-entry').is_visible(), '[H] Firefox (คอม) ติดตั้งไม่ได้ → ไม่มีปุ่ม')
  await login(pg); await interact_and_wait(pg)
  ok(await pg.locator(POP).count() == 0 and await settings(pg) is None, '[H] Firefox (คอม): ไม่มีป๊อปอัป/การ์ดในตั้งค่า')
  await ctx.close()
  # I ไม่ซ้อนหน้าต่างอื่น
  ctx = await ctx_for(b, 'android', 390, 844, True); pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(2000); await login(pg); await pg.evaluate(BIP, 'accepted')
  await pg.evaluate("()=>{const ov=document.createElement('div');ov.className='modal-overlay';ov.id='other';ov.innerHTML='<div class=\"modal-card\">อื่น</div>';document.body.appendChild(ov);EQApp.makeDialog(ov,{})}")
  await interact_and_wait(pg, click=False)   # ใช้คีย์บอร์ด (คลิกพื้นหลังจะปิดหน้าต่างนั้นเอง)
  ok(await pg.locator(POP).count() == 0 and await pg.locator('#other').count() == 1, '[I] มีหน้าต่างอื่นเปิดอยู่ → ไม่เด้งซ้อน')
  await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
  await pg.evaluate("()=>EQApp.navigateTo('learn')"); await pg.wait_for_timeout(800); await pg.evaluate("()=>EQApp.navigateTo('home')")
  await interact_and_wait(pg)
  ok(await pg.locator(POP).is_visible(), '[I] ปิดหน้าต่างนั้นแล้วกลับหน้าแรก → ค่อยชวน')
  await ctx.close(); await b.close()

async def case_sw(p):
  # J Service Worker จริง: แคชเฉพาะไฟล์หน้าเว็บ · ไม่มี /api หรือข้อมูลผู้ใช้ในแคช · ออฟไลน์ยังเปิดแอปได้
  b = await p.chromium.launch()
  ctx = await b.new_context(viewport={'width': 390, 'height': 844}, user_agent=UA['android'], has_touch=True, is_mobile=True)
  await ctx.add_init_script("try{localStorage.setItem('eq_fest_fx','off')}catch(e){}")
  pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000)
  await pg.evaluate("()=>navigator.serviceWorker.ready"); await pg.wait_for_timeout(1500)
  await login(pg)
  for scr in ['learn', 'profile', 'home']: await pg.evaluate(f"()=>EQApp.navigateTo('{scr}')"); await pg.wait_for_timeout(1500)
  keys = await pg.evaluate("async()=>{const out=[];for(const n of await caches.keys()){const c=await caches.open(n);for(const r of await c.keys())out.push(new URL(r.url).pathname)}return out}")
  ok(len(keys) > 20 and '/js/install.js' in keys and '/manifest.webmanifest' in keys, f'[J] Service Worker แคชไฟล์แอป ({len(keys)} ไฟล์)')
  ok(not [k for k in keys if k.startswith('/api/')], '[J] ไม่มีข้อมูล /api (ข้อมูลผู้ใช้) ในแคช')
  me = await pg.evaluate("()=>EQApp.user.username")
  leaked = await pg.evaluate("async(n)=>{for(const c of await caches.keys()){const cc=await caches.open(c);for(const r of await cc.keys()){const t=await (await cc.match(r)).clone().text().catch(()=>'');if(t.includes(n))return r.url}}return null}", me)
  ok(leaked is None, f'[J] ชื่อผู้ใช้ไม่อยู่ในไฟล์ใดในแคช ({leaked})')
  await ctx.set_offline(True)
  await pg.reload(); await pg.wait_for_timeout(3000)
  ok(await pg.locator('#app, body').count() > 0 and await pg.evaluate("()=>!!document.getElementById('screen-home')"), '[J] ออฟไลน์: เปิดแอปจากแคชได้')
  await ctx.set_offline(False); await ctx.close(); await b.close()

async def main():
  async with async_playwright() as p:
    for fn in (case_android, case_ios, case_other, case_sw):
      try: await fn(p)
      except Exception as e: ok(False, f'{fn.__name__} exception {e}')
  print(f'\n{len(FAILS)} FAIL' if FAILS else '\nALL PASS', flush=True)
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
