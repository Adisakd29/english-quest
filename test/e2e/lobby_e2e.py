"""v1.16.0 e2e — Game Lobby หน้าหลัก + นำ EnglishQuest World ออก (390/820/1280)
ตรวจ: Lobby แสดง · Avatar 3D ใส่ชุดที่สวมจริง · ลากหมุนได้ · ซื้อ/สวมชุดแล้วกลับมาเห็นชุดใหม่ · Coin ตรง ·
      เรียนต่อ/Ranked/เพื่อน/ร้านค้า/โปรไฟล์ ทำงาน · แถบเมนู 6 ปุ่ม · ลิงก์ #/world พากลับหน้าหลัก · ไม่มี request World ·
      แชทโลกล่าสุดขึ้นในแผง (escape) · ไม่มีการเลื่อนแนวนอน · EXP/Coin ไม่หายหลังเดินทั่วแอป
ใช้: python3 test/e2e/lobby_e2e.py [out_dir]  (เซิร์ฟเวอร์ที่ http://localhost:3100)"""
import asyncio, random, sys, os
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
VIEWS = [('mobile', 390, 844), ('tablet', 820, 1180), ('desktop', 1280, 860)]
ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']

async def login(b, w, h, prefix):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page(); errs = []; reqs = []
  pg.on('pageerror', lambda e: errs.append(str(e)))
  pg.on('request', lambda r: reqs.append(r.url))
  await pg.goto(URL); await pg.wait_for_timeout(300)
  name = '%s%d' % (prefix, random.randint(100000, 999999))
  tok = (await pg.evaluate(REG, name))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2200)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
  await pg.reload(); await pg.wait_for_timeout(1500)
  return ctx, pg, errs, reqs, name, tok

async def visible(pg, sel):
  return await pg.evaluate("s=>{const e=document.querySelector(s);return !!e&&!e.classList.contains('hidden')&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'}", sel)

async def go(pg, path, screen):
  await pg.evaluate("p=>EQApp.navigateTo(p)", path); await pg.wait_for_timeout(900)
  return await visible(pg, '#' + screen)

async def run(b, name, w, h, fails):
  def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + f'[{name}] ' + m)
    if not c: fails.append(f'{name}: {m}')
  ctx, pg, errs, reqs, uname, tok = await login(b, w, h, 'hl')
  await pg.wait_for_selector('#home-lobby'); await pg.wait_for_timeout(800)
  ok(await visible(pg, '#screen-home') and await visible(pg, '#home-lobby'), 'หน้าแรกเป็น Game Lobby')
  ok((await pg.text_content('#hl-name')).strip() == uname, 'ชื่อผู้ใช้บนแถบสถานะ')
  ok((await pg.text_content('#hl-lv')).strip() == '1', 'Account Level')
  ok('EXP' in (await pg.text_content('#hl-exp-text')), 'EXP แสดง')
  ok(len((await pg.text_content('#hl-rank-label')).strip()) > 1 and await pg.evaluate("()=>{const i=document.getElementById('hl-rank-img');return !i.hidden&&i.complete&&i.naturalWidth>0}"), 'Rank Badge โหลดรูปจริง')
  me = await pg.evaluate("()=>EQApp.api('/avatar/me')")
  ok((await pg.text_content('#hl-coins')).strip().replace(',', '') == str(me['wallet']['balance']), 'Coin ตรงกับกระเป๋าจริง')
  ok(await pg.locator('#hl-quests .hl-quest').count() == 3, 'เควสต์ประจำวัน 3 รายการ')
  # v1.17.0 Event Carousel (ทดสอบละเอียดใน eventcarousel_e2e.py)
  lb = await pg.evaluate("()=>EQApp.api('/lobby')")
  ok(await pg.locator('#evc .evc-slide').count() == len(lb['carousel']) and len(lb['carousel']) >= 1, f'แบนเนอร์กิจกรรมตรงกับข้อมูลจริง ({len(lb["carousel"])})')
  ok(await visible(pg, '#dash-continue'), 'ปุ่มเรียนต่อ'); ok(await visible(pg, '.hl-ranked'), 'ปุ่ม Ranked Battle')
  ok(await visible(pg, '.hl-tile-shop') and await visible(pg, '.hl-tile-fr'), 'Avatar Shop + เพื่อน'); ok(await visible(pg, '#gcm'), 'แชทโลกย่อ')
  # แถบเมนู 6 ปุ่ม · ไม่มี World
  navs = await pg.evaluate("()=>[...document.querySelectorAll('#bottom-nav .nav-item')].map(b=>b.dataset.nav)")
  ok(navs == ['home', 'learn', 'grammar', 'ranked', 'play', 'profile'], f'แถบเมนู 6 ปุ่ม {navs}')
  ok(await pg.evaluate("()=>!document.querySelector('[data-nav-to=\"world\"],[data-nav=\"world\"],#screen-world,#play-world-entry')") , 'ไม่มีลิงก์/หน้า World ใน DOM')
  ok(await pg.evaluate("()=>!/EnglishQuest World/.test(document.body.innerText)"), 'ไม่มีข้อความ EnglishQuest World บนหน้า')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=window.innerWidth+1"), 'ไม่เลื่อนแนวนอน')
  # Avatar 3D: ชุดที่สวมจริง + Idle + หมุนได้
  try:
    await pg.wait_for_selector('#hl-stage[data-a3-state="ready"]', timeout=25000); ready = True
  except Exception: ready = False
  ok(ready, 'Avatar 3D โหลดเสร็จกลางล็อบบี้')
  same = await pg.evaluate("""async()=>{const me=await EQApp.api('/avatar/me');const s=EQAvatar._stages().find(x=>x.box.id==='hl-stage');return !!s&&JSON.stringify(s.outfit)===JSON.stringify(me.outfit)}""")
  ok(same, 'Avatar ใส่ชุดที่สวมจริง (ตรงกับ /avatar/me)')
  await pg.screenshot(path=f'{OUT}/lobby_{name}.png')
  if ready:
    box = await pg.locator('#hl-stage canvas').bounding_box()
    before = await pg.locator('#hl-stage canvas').screenshot()
    await pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); await pg.mouse.down()
    await pg.mouse.move(box['x'] + box['width'] / 2 + 140, box['y'] + box['height'] / 2, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(500)
    after = await pg.locator('#hl-stage canvas').screenshot()
    ok(before != after, 'ลากแล้วตัวละครหมุน (ภาพเปลี่ยน)')
    ok(await pg.locator('#hl-stage .a3-tools').count() == 0, 'ไม่มีแถบปุ่มควบคุมรก ๆ บน Lobby')
  # ซื้อชุดในร้าน → สวม → กลับหน้าแรกเห็นชุดใหม่ · Coin ลดตามราคา
  shop = await pg.evaluate("()=>EQApp.api('/avatar/shop?section=hats&size=48')")
  bal0 = shop['balance']
  item = next((i for i in shop['items'] if not i.get('owned') and i.get('price') and i['price'] <= bal0), None)
  if item:
    r = await pg.evaluate("id=>EQApp.api('/avatar/purchase',{method:'POST',body:{itemId:id}})", item['id'])
    await pg.evaluate("id=>EQApp.api('/avatar/equip',{method:'POST',body:{slot:%r,itemId:id}})" % item['slot'], item['id'])
    ok(r.get('ok') and r.get('balance', bal0 - item['price']) == bal0 - item['price'], f'ซื้อ {item["id"]} ได้ · Coin ลด {item["price"]}')
    ok(await go(pg, 'shop', 'screen-shop'), 'เปิดร้านค้าได้')
    ok(await go(pg, 'home', 'screen-home'), 'กลับหน้าแรก')
    try: await pg.wait_for_selector('#hl-stage[data-a3-state="ready"]', timeout=25000)
    except Exception: pass
    has = await pg.evaluate("id=>{const s=EQAvatar._stages().find(x=>x.box.id==='hl-stage');return !!s&&Object.values(s.outfit).includes(id)}", item['id'])
    ok(has, 'Lobby แสดงชุดที่เพิ่งสวม')
    await pg.wait_for_timeout(600)
    ok((await pg.text_content('#hl-coins')).strip().replace(',', '') == str(bal0 - item['price']), 'Coin บน Lobby อัปเดต')
  else: ok(False, 'ไม่มีของในร้านที่ซื้อได้สำหรับทดสอบ')
  # ปุ่มต่าง ๆ
  await pg.click('#dash-continue'); await pg.wait_for_timeout(1500)
  ok(not await visible(pg, '#screen-home'), f'เรียนต่อพาเข้าบทเรียน ({await pg.evaluate("location.hash")})')
  await go(pg, 'home', 'screen-home')
  await pg.click('.hl-ranked'); await pg.wait_for_timeout(1200); ok(await visible(pg, '#screen-ranked'), 'Ranked Battle เปิดหน้า Ranked')
  await go(pg, 'home', 'screen-home')
  await pg.click('.hl-tile-fr'); await pg.wait_for_timeout(900); ok(await visible(pg, '#screen-friends'), 'ปุ่มเพื่อนเปิดหน้าเพื่อน')
  await go(pg, 'home', 'screen-home')
  await pg.click('.hl-coin'); await pg.wait_for_timeout(900); ok(await visible(pg, '#screen-shop'), 'ชิป Coin เปิดร้านค้า')
  await go(pg, 'home', 'screen-home')
  await pg.click('.hl-stage-actions [data-nav-to="wardrobe"]'); await pg.wait_for_timeout(900); ok(await visible(pg, '#screen-wardrobe'), 'ปุ่มเปลี่ยนชุดเปิดตู้เสื้อผ้า')
  ok(await go(pg, 'profile', 'screen-profile'), 'หน้าโปรไฟล์ทำงาน')
  ok(await go(pg, 'learn', 'screen-path') and await pg.locator('#screen-path [data-nav-to="grammar"]').count() >= 1 and await pg.locator('#screen-path [data-nav-to="toeic"]').count() >= 1 and await pg.locator('#screen-path [data-nav-to="atlas"]').count() >= 1, 'Learn เข้าถึง Vocabulary/Grammar/TOEIC/Word Atlas')
  ok(await go(pg, 'leaderboard', 'screen-leaderboard'), 'กระดานอันดับทำงาน')
  # ลิงก์เดิม #/world
  await pg.evaluate("()=>{location.hash='#/world'}"); await pg.wait_for_timeout(1200)
  toast = await pg.evaluate("()=>document.getElementById('toast-container').innerText")
  ok(await visible(pg, '#screen-home') and 'ปิดให้บริการ' in toast and (await pg.evaluate('location.hash')) == '#/home', 'ลิงก์ #/world พากลับหน้าหลัก + แจ้งข้อความ')
  # แชทโลก: ข้อความใหม่ขึ้นในแผง Lobby แบบเรียลไทม์ (escape)
  ctx2, pg2, _, _, _, _ = await login(b, 1280, 860, 'hm')
  txt = '<img src=x onerror=alert(1)> hi %d' % random.randint(1000, 9999)
  await pg2.evaluate("t=>EQApp.api('/world-chat',{method:'POST',body:{body:t}})", txt); await pg.wait_for_timeout(1500)
  await pg.wait_for_function("t=>document.getElementById('gcm').innerText.includes(t)", arg=txt, timeout=8000)
  ok(await pg.locator('#gcm img[src="x"]').count() == 0, 'ข้อความแชทโลกใหม่ขึ้นในแชทย่อ (escape แล้ว)')
  await ctx2.close()
  await pg.locator('#gcm [data-gc-open]').first.click(); await pg.wait_for_timeout(900); ok(await pg.locator('#gcp #gc-log').count() == 1, 'แตะแชทย่อเปิดแผงแชทโลก')
  await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  # ไม่มี request World
  bad = [u for u in reqs if '/api/world/' in u or '/assets/world' in u or u.endswith('/js/world.js') or 'world-physics' in u or '/css/world.css' in u]
  ok(not bad, f'ไม่มี request World ({bad[:2]})')
  # EXP/Coin ไม่หาย
  me2 = await pg.evaluate("()=>EQApp.api('/avatar/me')"); u2 = await pg.evaluate("()=>EQApp.api('/auth/me')")
  ok(me2['wallet']['balance'] == (bal0 - item['price'] if item else bal0) and u2['user'].get('exp', 0) >= 0, 'Coin/EXP ไม่หายหลังเดินทั่วแอป')
  ok(not errs, f'ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def main():
  fails = []
  async with async_playwright() as p:
    b = await p.chromium.launch(args=ARGS)
    for name, w, h in VIEWS: await run(b, name, w, h, fails)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not fails else f'{len(fails)} FAIL'); [print(' -', f) for f in fails]
  sys.exit(1 if fails else 0)
asyncio.run(main())
