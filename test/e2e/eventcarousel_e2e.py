"""v1.17.0 e2e — Event Carousel บนหน้าแรก
ความกว้าง 320/375/390/430/768/1024/1280/1440: ไม่ล้นแนวนอน · ภาพไม่ถูกครอป (มือถือ 16:9) · ปุ่มแตะได้ ≥ 44px · เมนูล่างไม่บัง
390 และ 1280: ก่อนหน้า/ถัดไป · จุด · ปัด · คีย์บอร์ด · เลื่อนเอง 6 วิ · หยุดเมื่อชี้เมาส์/โฟกัส · ปุ่มหยุด/เล่น · Reduced motion
              ปุ่มของแต่ละกิจกรรมไปหน้าที่ถูกต้อง · ดูรายละเอียด · ภาพเสียใช้ภาพสำรอง · ไม่มีกิจกรรม = Empty State · โหลดภาพแค่สไลด์ใกล้ ๆ
ใช้: python3 test/e2e/eventcarousel_e2e.py [out_dir]"""
import asyncio, json, random, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def ok(tag, c, m):
  print(('PASS ' if c else 'FAIL ') + f'[{tag}] ' + m)
  if not c: fails.append(f'{tag}: {m}')

async def open_home(b, w, h, **kw):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', **kw); pg = await ctx.new_page(); errs = []
  pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(300)
  tok = (await pg.evaluate(REG, 'ev%d' % random.randint(100000, 999999)))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2200)
  await pg.evaluate("()=>{EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{});try{localStorage.removeItem('eq:evc:paused')}catch(e){}}")
  await pg.reload(); await pg.wait_for_selector('#evc .evc-slide, #evc .evc-empty', timeout=15000); await pg.wait_for_timeout(800)
  return ctx, pg, errs
S = lambda pg: pg.evaluate("()=>EQEventCarousel._state()")

async def layout(b, w):
  tag = f'{w}px'; h = 860 if w >= 1024 else 844
  ctx, pg, errs = await open_home(b, w, h)
  ok(tag, await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), 'ไม่ล้นแนวนอน')
  sl = pg.locator('#evc .evc-slide.is-active')
  media = await sl.locator('.evc-media').bounding_box()
  if w < 700: ok(tag, abs(media['width'] / media['height'] - 2) < 0.03, f'v1.18.0 มือถือ: ภาพ 2:1 กะทัดรัด ({media["width"]:.0f}×{media["height"]:.0f})')
  else: ok(tag, media['height'] >= 200, 'ภาพแบนเนอร์ขนาดใหญ่')
  cta = await sl.locator('.evc-cta').bounding_box()
  ok(tag, cta['height'] >= 44 and cta['width'] >= 44, 'ปุ่มหลักแตะง่าย (≥ 44px)')
  if await pg.locator('#evc .evc-pdot').count():
    d = await pg.locator('#evc .evc-pdot').first.bounding_box(); ok(tag, d['height'] >= 44, 'จุดเลือกสไลด์แตะง่าย')
  # ตรวจในจังหวะเดียว (สไลด์อาจเลื่อนอัตโนมัติระหว่างรอ) — เลื่อนปุ่มของสไลด์ที่แสดงอยู่เข้าจอแล้วดูว่ามีอะไรทับ
  covered = await pg.evaluate("()=>{const b=document.querySelector('#evc .evc-slide.is-active .evc-cta');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e&&!e.closest('.evc-cta')?e.className||e.tagName:false}")
  if covered: print('   covered by', covered)
  ok(tag, not covered, 'ปุ่มหลักไม่ถูกเมนูล่าง/แชทบัง')
  ok(tag, await sl.locator('.evc-title').evaluate("e=>getComputedStyle(e).color") == 'rgb(255, 255, 255)', 'ชื่อกิจกรรมเป็นข้อความ HTML สีอ่านง่าย')
  await pg.locator('.hl-events-wrap').screenshot(path=f'{OUT}/evc_{w}.png')
  ok(tag, not errs, f'ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def interact(b, w):
  tag = f'{w}px'; h = 860 if w >= 1024 else 844
  ctx, pg, errs = await open_home(b, w, h, has_touch=w < 1024)
  api = await pg.evaluate("()=>EQApp.api('/lobby/events')")
  n = await pg.locator('#evc .evc-slide').count()
  ok(tag, n == len(api['events']) and n >= 2, f'1 แสดงกิจกรรมจริงจากเซิร์ฟเวอร์ ({n})')
  titles = await pg.locator('#evc .evc-title').all_inner_texts()
  ok(tag, titles == [e['title'] for e in api['events']], 'ลำดับตรงกับเซิร์ฟเวอร์')
  st = [await pg.locator(f'#evc-s-{k} .evc-status').inner_text() for k in range(n)]
  ok(tag, all({'ongoing': 'กำลังจัด', 'upcoming': 'เร็ว ๆ นี้', 'completed': 'สำเร็จแล้ว'}[e['status']] in s for e, s in zip(api['events'], st)), '8 ป้ายสถานะตรงกับสถานะจริง')
  i0 = (await S(pg))['i']
  # สไลด์เลื่อนเองไปแล้ว i0 ครั้งตั้งแต่เปิดหน้า → ภาพที่ควรโหลดแล้ว = ช่วง ±1 ของทุกสไลด์ที่ผ่านมา (0..i0)
  far = [k for k in range(n) if all(min(abs(k - j), n - abs(k - j)) > 1 for j in range(i0 + 1))]
  ok(tag, not any([await pg.locator(f'#evc-s-{k} .evc-media img').get_attribute('src') for k in far]), 'โหลดภาพเฉพาะสไลด์ปัจจุบัน ± 1 (ไม่โหลดทุกภาพพร้อมกัน)')
  # หยุดเลื่อนเองก่อน เพื่อทดสอบการควบคุมแบบกำหนดผลได้
  await pg.click('#evc-play'); await pg.mouse.move(2, 2)
  await pg.click('#evc [data-evc-dot="0"]'); await pg.wait_for_timeout(700)
  # 2 ก่อนหน้า/ถัดไป
  await pg.click('#evc .evc-next'); await pg.wait_for_timeout(700)
  ok(tag, (await S(pg))['i'] == 1, '2 ปุ่มถัดไป')
  await pg.click('#evc .evc-prev'); await pg.wait_for_timeout(700)
  ok(tag, (await S(pg))['i'] == 0, '2 ปุ่มก่อนหน้า')
  await pg.click('#evc .evc-prev'); await pg.wait_for_timeout(700)
  ok(tag, (await S(pg))['i'] == n - 1, 'ก่อนหน้าจากสไลด์แรก = วนไปสไลด์สุดท้าย')
  # 4 จุด
  await pg.click('#evc [data-evc-dot="1"]'); await pg.wait_for_timeout(700)
  ok(tag, (await S(pg))['i'] == 1 and await pg.locator('#evc [data-evc-dot="1"]').get_attribute('aria-current') == 'true', '4 จุดเลือกสไลด์')
  ok(tag, 'กิจกรรม 2' in await pg.inner_text('#evc-live'), 'ประกาศสไลด์ให้โปรแกรมอ่านหน้าจอ')
  # คีย์บอร์ด
  await pg.focus('#evc [data-evc-dot="1"]'); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(600)
  ok(tag, (await S(pg))['i'] == 2 % n, 'คีย์บอร์ด ลูกศรขวา')
  ok(tag, await pg.evaluate("()=>document.querySelectorAll('#evc .evc-slide[inert]').length") == n - 1, 'สไลด์ที่ไม่แสดงกด Tab เข้าไม่ได้ (inert)')
  await pg.evaluate("()=>document.activeElement.blur()")
  # 3 ปัด
  await pg.click('#evc [data-evc-dot="0"]'); await pg.wait_for_timeout(700)
  await pg.locator('#evc-viewport').evaluate("e=>e.scrollIntoView({block:'center'})"); await pg.wait_for_timeout(300)
  vp = await pg.locator('#evc-viewport').bounding_box(); y = max(vp['y'], 0) + 40
  await pg.mouse.move(vp['x'] + vp['width'] * 0.8, y); await pg.mouse.down(); await pg.mouse.move(vp['x'] + vp['width'] * 0.2, y, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(700)
  ok(tag, (await S(pg))['i'] == 1, '3 ปัดซ้ายไปสไลด์ถัดไป')
  await pg.mouse.move(vp['x'] + vp['width'] * 0.2, y); await pg.mouse.down(); await pg.mouse.move(vp['x'] + vp['width'] * 0.8, y, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(700)
  ok(tag, (await S(pg))['i'] == 0, '3 ปัดขวากลับ')
  await pg.mouse.move(vp['x'] + vp['width'] * 0.5, y); await pg.mouse.down(); await pg.mouse.move(vp['x'] + vp['width'] * 0.5, y + 120, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(500)
  ok(tag, (await S(pg))['i'] == 0, 'ลากแนวตั้ง (เลื่อนหน้า) ไม่เปลี่ยนสไลด์')
  # 5 เลื่อนเอง + หยุดเมื่อชี้เมาส์ (เปิดเล่นต่อ)
  await pg.click('#evc-play'); await pg.evaluate("()=>document.activeElement.blur()")
  await pg.mouse.move(2, 2); i0 = (await S(pg))['i']
  await pg.wait_for_timeout(16500)   # ถูกแตะ/กดเมื่อครู่ → พัก 10 วิ แล้วนับใหม่ 6 วิ
  ok(tag, (await S(pg))['i'] != i0, '5 เลื่อนเองอัตโนมัติ (~6 วินาที)')
  if w >= 1024:
    await pg.hover('#evc .evc-slide.is-active .evc-title'); i1 = (await S(pg))['i']; await pg.wait_for_timeout(7500)
    ok(tag, (await S(pg))['i'] == i1, '5 ชี้เมาส์แล้วหยุดเลื่อน'); await pg.mouse.move(2, 2)
  i1 = await pg.evaluate("()=>{document.querySelector('#evc .evc-slide.is-active .evc-cta').focus();return EQEventCarousel._state().i}"); await pg.wait_for_timeout(7500)
  ok(tag, (await S(pg))['i'] == i1, '5 โฟกัสในแบนเนอร์แล้วหยุดเลื่อน'); await pg.evaluate("()=>document.activeElement.blur()")
  # 6 หยุด/เล่น
  await pg.click('#evc-play'); await pg.mouse.move(2, 2); await pg.evaluate("()=>document.activeElement.blur()")
  ok(tag, await pg.get_attribute('#evc-play', 'aria-pressed') == 'true', '6 กดหยุด')
  i1 = (await S(pg))['i']; await pg.wait_for_timeout(17000)
  ok(tag, (await S(pg))['i'] == i1, '6 หยุดแล้วไม่เลื่อน')
  await pg.reload(); await pg.wait_for_selector('#evc .evc-slide'); await pg.wait_for_timeout(500)
  ok(tag, (await S(pg))['userPaused'] is True, 'จำการกดหยุดไว้ (เบราว์เซอร์นี้)')
  await pg.click('#evc-play'); ok(tag, await pg.get_attribute('#evc-play', 'aria-pressed') == 'false', '6 กดเล่นต่อ')
  # 10 ปุ่มของแต่ละกิจกรรม
  evs = api['events']
  for k, e in enumerate(evs):
    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(900)
    await pg.evaluate("k=>EQEventCarousel.go(k)", k); await pg.wait_for_timeout(600)
    await pg.locator(f'#evc-s-{k} .evc-cta').click(); await pg.wait_for_timeout(1500)
    if e['cta']['kind'] == 'details':
      ok(tag, await pg.locator('.evc-dialog').count() == 1, f'10 {e["id"]}: {e["status"]} → ดูรายละเอียด (เปิดหน้าต่าง)')
      ok(tag, 'Asia/Bangkok' in await pg.inner_text('.evc-dialog'), 'รายละเอียดบอกเขตเวลา')
      await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    elif e['cta']['kind'] == 'nav':
      scr = {'event': 'screen-event', 'festival': 'screen-festival', 'ranked': 'screen-ranked', 'learn': 'screen-path', 'grammar': 'screen-grammar'}.get(e['cta']['nav'], f'screen-{e["cta"]["nav"]}')
      ok(tag, await pg.evaluate("s=>{const e=document.getElementById(s);return !!e&&!e.classList.contains('hidden')}", scr), f'10 {e["id"]} → {e["cta"]["nav"]}')
  ok(tag, len({e['cta'].get('nav') or e['cta']['kind'] for e in evs}) > 1, 'ปุ่มแต่ละกิจกรรมไปคนละที่ตามประเภท')
  ok(tag, not errs, f'ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def special(b):
  # 7 Reduced motion
  ctx, pg, errs = await open_home(b, 390, 844, reduced_motion='reduce')
  ok('reduce', await pg.is_disabled('#evc-play'), '7 Reduced motion: ปิดการเลื่อนเอง (ปุ่มหยุด/เล่นปิดใช้)')
  i0 = (await S(pg))['i']; await pg.wait_for_timeout(8000)
  ok('reduce', (await S(pg))['i'] == i0, '7 Reduced motion: ไม่เลื่อนเอง')
  await pg.click('#evc .evc-next'); await pg.wait_for_timeout(300)
  ok('reduce', (await S(pg))['i'] == (i0 + 1) % (await S(pg))['n'], 'ยังกดเลื่อนเองได้')
  await ctx.close()
  # 12 ภาพเสีย → ภาพสำรอง
  ctx, pg, errs = await open_home(b, 390, 844)
  await pg.route('**/api/lobby', lambda r: asyncio.ensure_future(_patch(r, 'broken')))
  await pg.route('**/broken-banner.webp', lambda r: r.fulfill(status=404, body=''))
  await pg.evaluate("()=>EQLobby.refresh()"); await pg.wait_for_timeout(2500)
  src = await pg.evaluate("()=>document.querySelector('#evc-s-0 .evc-media img').getAttribute('src')")
  ok('fallback', src and '/assets/events/banners/' in src, f'12 แบนเนอร์โหลดไม่ได้ → ใช้ภาพสำรอง ({src})')
  await pg.route('**/assets/events/banners/**', lambda r: r.fulfill(status=404, body=''))
  await pg.evaluate("()=>{EQEventCarousel.render([]);}")
  await pg.unroute('**/api/lobby')
  await pg.route('**/api/lobby', lambda r: asyncio.ensure_future(_patch(r, 'broken')))
  await pg.evaluate("()=>EQLobby.refresh()"); await pg.wait_for_timeout(2500)
  ok('fallback', await pg.locator('#evc-s-0.evc-noimg').count() == 1 and await pg.locator('#evc-s-0 .evc-title').is_visible(), 'ภาพสำรองก็เสีย → พื้นสี + ข้อความยังอ่านได้')
  # 13 ไม่มีกิจกรรม
  await pg.unroute('**/api/lobby')
  await pg.route('**/api/lobby', lambda r: asyncio.ensure_future(_patch(r, 'empty')))
  await pg.evaluate("()=>EQLobby.refresh()"); await pg.wait_for_timeout(2000)
  ok('empty', await pg.locator('#evc .evc-empty').count() == 1 and await pg.locator('#evc .evc-slide').count() == 0, '13 ไม่มีกิจกรรม → Empty State (ไม่สร้างข้อมูลปลอม)')
  await pg.locator('.hl-events-wrap').screenshot(path=f'{OUT}/evc_empty.png')
  ok('special', not errs, f'ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def _patch(route, mode):
  resp = await route.fetch(); data = await resp.json()
  if mode == 'empty': data['carousel'] = []
  if mode == 'broken':
    for e in data['carousel']: e['banner']['desktop'] = e['banner']['mobile'] = '/broken-banner.webp'
  await route.fulfill(response=resp, body=json.dumps(data), headers={**resp.headers, 'content-type': 'application/json'})

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w in [320, 375, 390, 430, 768, 1024, 1280, 1440]: await layout(b, w)
    for w in [390, 1280]: await interact(b, w)
    await special(b)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not fails else f'{len(fails)} FAIL'); [print(' -', f) for f in fails]
  sys.exit(1 if fails else 0)
if __name__ == "__main__": asyncio.run(main())
