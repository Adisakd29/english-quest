"""
v1.22.2 หน้ากิจกรรมลอยกระทง — ปุ่มกลับ + เลย์เอาต์ tablet/desktop
  รายงาน: "หน้ากิจกรรมเนื้อเรื่องวันลอยกระทงบัค กดย้อนกลับแล้วย้อนไม่ได้กลับมาหน้าเดิม และ หน้า UI ฝั่ง tablet desktop เมนูซ้อนกัน"
  ปุ่มกลับ (390 / 820 / 1280):
  - หน้าแรก → เทศกาล → เริ่มอ่านเรื่อง → ปุ่ม "กลับหน้าเทศกาล" → หน้าเทศกาล → ปุ่มกลับ → หน้าแรก (ไม่วนกลับไปหน้าเรื่อง)
  - เล่น → เทศกาล → เริ่มฟังเรื่อง → ปุ่มย้อนกลับของเบราว์เซอร์ → หน้าเทศกาล → ปุ่มกลับ → หน้าเล่น
  - ส่งคำตอบเรื่องแล้วมีปุ่ม "กลับหน้าเทศกาล" · เปิดเรื่องจากรายการเรื่องปกติยังเป็น "เรื่องทั้งหมด"
  - เล่น → ตะลุยด่าน → เปิด/ปิดหน้าต่างด่าน → ปุ่มกลับ → หน้าเล่น
  เลย์เอาต์หน้าตะลุยด่าน (820 / 990 / 1024 / 1100 / 1180 / 1280 / 1440):
  - แผงภารกิจข้างแผนที่แสดงเฉพาะตอนกว้างพอ (≥ 300px) · ไม่มีตัวหนังสือตกบรรทัดทีละคำ · ป้ายไม่ทับหัวข้อ · ไม่ล้นแนวนอน
  python3 test/e2e/lk_back_layout_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)
async def visible_screen(pg):
  return await pg.evaluate("()=>{const s=[...document.querySelectorAll('.screen')].find(e=>!e.classList.contains('hidden'));return s?s.id:null}")
async def login(b, w, h, theme=None):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL, timeout=90000)
  r = await pg.evaluate(REG, 'lb%d' % random.randint(1000000, 9999999))
  await pg.evaluate("([t,th])=>{localStorage.setItem('wq_token',t); if(th) localStorage.setItem('eq_theme',th)}", [r['token'], theme])
  await pg.reload(); await pg.wait_for_timeout(2500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(3000)
  return ctx, pg, errs
async def go(pg, scr):
  await pg.evaluate(f"()=>EQApp.navigateTo('{scr}')"); await pg.wait_for_timeout(1800)

async def back_flows(b, w, h):
  tag = f'[{w}]'
  ctx, pg, errs = await login(b, w, h)
  # 1) หน้าแรก → เทศกาล → อ่านเรื่อง → กลับหน้าเทศกาล → กลับ → หน้าแรก
  await go(pg, 'home'); await go(pg, 'festival'); await pg.wait_for_selector('[data-hf-graded][data-mode="reading"]', timeout=20000)
  await pg.locator('[data-hf-graded][data-mode="reading"]').click(); await pg.wait_for_selector('#gr-ttitle', timeout=20000); await pg.wait_for_timeout(500)
  bk = pg.locator('#screen-graded .gl-back')
  ok('กลับหน้าเทศกาล' in await bk.inner_text(), f'{tag} เรื่องที่เปิดจากเทศกาล: ปุ่มกลับเป็น "กลับหน้าเทศกาล"')
  await pg.screenshot(path=f'{OUT}/story_from_festival_{w}.png')
  await bk.click(); await pg.wait_for_timeout(2000)
  ok(await visible_screen(pg) == 'screen-festival' and pg.url.endswith('#/festival'), f'{tag} กดกลับจากเรื่อง → หน้าเทศกาล ({await visible_screen(pg)})')
  await pg.locator('#hf-back').click(); await pg.wait_for_timeout(2000)
  ok(await visible_screen(pg) == 'screen-home', f'{tag} ปุ่มกลับของหน้าเทศกาล → หน้าแรก ไม่วนกลับไปหน้าเรื่อง ({await visible_screen(pg)})')
  # 2) เล่น → เทศกาล → ฟังเรื่อง → ปุ่ม Back ของเบราว์เซอร์ → เทศกาล → กลับ → หน้าเล่น
  await go(pg, 'play'); await go(pg, 'festival'); await pg.wait_for_selector('[data-hf-graded][data-mode="listening"]', timeout=20000)
  await pg.locator('[data-hf-graded][data-mode="listening"]').click(); await pg.wait_for_selector('#gr-ttitle', timeout=20000); await pg.wait_for_timeout(500)
  await pg.go_back(); await pg.wait_for_timeout(2200)
  ok(await visible_screen(pg) == 'screen-festival', f'{tag} ปุ่ม Back ของเบราว์เซอร์จากเรื่อง → หน้าเทศกาล ({await visible_screen(pg)})')
  await pg.locator('#hf-back').click(); await pg.wait_for_timeout(2000)
  ok(await visible_screen(pg) == 'screen-play', f'{tag} เข้าเทศกาลจากหน้าเล่น → ปุ่มกลับกลับหน้าเล่น ({await visible_screen(pg)})')
  # 3) ส่งคำตอบแล้วมีปุ่ม "กลับหน้าเทศกาล"
  await go(pg, 'festival'); await pg.wait_for_selector('[data-hf-graded][data-mode="reading"]', timeout=20000)
  await pg.locator('[data-hf-graded][data-mode="reading"]').click(); await pg.wait_for_selector('#gr-ttitle', timeout=20000); await pg.wait_for_timeout(600)
  qs = await pg.evaluate("()=>[...new Set([...document.querySelectorAll('#screen-graded input[type=radio]')].map(e=>e.name))]")
  for q in qs: await pg.locator(f'#screen-graded input[name="{q}"]').first.check()
  await pg.locator('#screen-graded button[type=submit]').click(); await pg.wait_for_timeout(2500)
  after = pg.locator('#gr-after [data-gr-nav="festival"]')
  ok(await after.count() == 1 and await after.is_visible(), f'{tag} หลังส่งคำตอบ: มีปุ่ม "กลับหน้าเทศกาล"')
  await after.click(); await pg.wait_for_timeout(2000)
  ok(await visible_screen(pg) == 'screen-festival', f'{tag} ปุ่มหลังส่งคำตอบ → หน้าเทศกาล')
  # 4) เปิดเรื่องจากรายการเรื่องปกติ → ยังเป็น "เรื่องทั้งหมด"
  await pg.evaluate("()=>{location.hash='#/graded'}"); await pg.wait_for_timeout(2500)
  await pg.evaluate("()=>{location.hash='#/graded/A2-07/reading'}"); await pg.wait_for_selector('#gr-ttitle', timeout=20000); await pg.wait_for_timeout(500)
  ok('เรื่องทั้งหมด' in await pg.locator('#screen-graded .gl-back').inner_text(), f'{tag} เปิดจากรายการเรื่อง: ปุ่มกลับยังเป็น "เรื่องทั้งหมด"')
  # 5) เล่น → ตะลุยด่าน → เปิด/ปิดหน้าต่างด่าน → กลับ → หน้าเล่น
  await go(pg, 'play'); await go(pg, 'event'); await pg.wait_for_selector('#ev-root .ev-node', timeout=20000); await pg.wait_for_timeout(800)
  await pg.locator('#ev-root .ev-node').first.click(); await pg.wait_for_timeout(800)
  await pg.keyboard.press('Escape'); await pg.wait_for_timeout(600)
  await pg.locator('#ev-back').click(); await pg.wait_for_timeout(2000)
  ok(await visible_screen(pg) == 'screen-play', f'{tag} หน้าตะลุยด่าน: ปุ่มกลับ → หน้าเล่นที่เข้ามา ({await visible_screen(pg)})')
  # 6) เปิดลิงก์ตรง #/event (ไม่รู้หน้าที่มา) → กลับ = หน้าแรก
  ctx2_pg = await ctx.new_page(); await ctx2_pg.goto(URL + '/#/event', timeout=90000); await ctx2_pg.wait_for_timeout(4000)
  await ctx2_pg.evaluate("()=>sessionStorage.clear()")
  await ctx2_pg.locator('#ev-back').click(); await ctx2_pg.wait_for_timeout(2000)
  ok(await visible_screen(ctx2_pg) == 'screen-home', f'{tag} เปิดลิงก์ตรง → ปุ่มกลับไปหน้าแรก')
  ok(not errs, f'{tag} ไม่มี JS error {errs[:2]}')
  await ctx.close()

LAYOUT_JS = """()=>{const p=document.querySelector('#ev-root .ev-panel');const vis=p&&getComputedStyle(p).display!=='none';
  const pr=p&&p.getBoundingClientRect();
  const bad=[];document.querySelectorAll('#ev-root .ev-panel .ev-ch-head, #ev-root .ev-panel .ev-m').forEach(e=>{const t=e.querySelector('h2,h3,b,strong');if(t){const lh=parseFloat(getComputedStyle(t).lineHeight)||20;if(t.getBoundingClientRect().height>lh*3.2)bad.push(t.textContent.trim().slice(0,20))}});
  let overlap=false;const chip=document.querySelector('#ev-root .ev-panel .ev-ch-head .ev-chip');const ttl=document.querySelector('#ev-root .ev-panel .ev-ch-head > div, #ev-root .ev-panel .ev-ch-head h2');
  if(vis&&chip&&ttl){const a=chip.getBoundingClientRect(),c=ttl.getBoundingClientRect();overlap=!(a.right<=c.left||a.left>=c.right||a.bottom<=c.top||a.top>=c.bottom)}
  return {vis,w:pr?Math.round(pr.width):0,bad,overlap,over:document.documentElement.scrollWidth>innerWidth+1}}"""

async def layout(b):
  ctx, pg, errs = await login(b, 1280, 900, theme='loykrathong-2026')
  for w in [820, 990, 1024, 1100, 1180, 1280, 1440]:
    await pg.set_viewport_size({'width': w, 'height': 900}); await go(pg, 'event')
    await pg.wait_for_selector('#ev-root .ev-node', timeout=20000); await pg.wait_for_timeout(1200)
    r = await pg.evaluate(LAYOUT_JS)
    if r['vis']:
      ok(r['w'] >= 300, f'[{w}] แผงภารกิจกว้างพอ ({r["w"]}px)')
      ok(not r['bad'], f'[{w}] ไม่มีหัวข้อตกบรรทัดทีละคำ {r["bad"][:3]}')
      ok(not r['overlap'], f'[{w}] ป้าย "กำลังผจญภัย" ไม่ทับหัวข้อบท')
    else:
      ok(w < 1200, f'[{w}] ซ่อนแผงข้าง (พื้นที่ไม่พอ) ใช้แบบแตะจุดบนแผนที่แทน')
      # ยังเลือกบทได้: แตะจุดบทแล้วมีรายละเอียดขึ้น
      await pg.locator('#ev-root .ev-node').first.click(); await pg.wait_for_timeout(900)
      ok(await pg.locator('.modal-overlay, .ev-sheet, #ev-root .ev-ch-detail').count() > 0, f'[{w}] แตะจุดบทแล้วเห็นรายละเอียดบท')
      await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
    ok(not r['over'], f'[{w}] ไม่ล้นแนวนอน')
    await pg.evaluate("()=>window.scrollTo(0,0)"); await pg.screenshot(path=f'{OUT}/event_{w}.png')
  ok(not errs, f'[layout] ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def main():
  async with async_playwright() as p:
    for w, h in [(390, 844), (820, 1180), (1280, 900)]:
      b = await p.chromium.launch()
      try: await back_flows(b, w, h)
      except Exception as e: ok(False, f'[{w}] exception {e}')
      await b.close()
    b = await p.chromium.launch()
    try: await layout(b)
    except Exception as e: ok(False, f'[layout] exception {e}')
    await b.close()
  print(f'\n{len(FAILS)} FAIL' if FAILS else '\nALL PASS')
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
