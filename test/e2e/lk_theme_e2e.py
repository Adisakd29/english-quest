"""
v1.23.0 Loy Krathong Enchanted Moonlight Festival — E2E (1920×1080 · 820×1180 · 390×844)
  - เปิดเว็บ (ยังไม่ล็อกอิน) ช่วงเทศกาล → ธีมลอยกระทงทันที · canvas โคม 1 อัน · มีโคมบนจอ · สมัครสมาชิกผ่านฟอร์มจริงได้
  - ชั้นเอฟเฟกต์ไม่รับการแตะ (จุดที่มีโคม → ได้ element ของหน้า) · อยู่ใต้หน้าต่าง Modal
  - สีอ่านได้: ป้ายฟอร์ม/ช่องกรอก/ปุ่มหลัก contrast ≥ 4.5 · ไม่ล้นแนวนอนทุกหน้า
  - ระดับตามหน้า: หน้าแรก full · เส้นทางการเรียน light · ทำข้อสอบ (TCAS) off (หยุดลูป)
  - สลับหน้า 30 ครั้ง → canvas ยังมีอันเดียว · แท็บถูกซ่อน → หยุดลูป · กลับมา → เดินต่อ
  - ตั้งค่า: ปิดเอฟเฟกต์ → หยุดลูปแต่ฉากยังวาด (ภาพนิ่ง) · กดเลือกธีม พาสเทล/สว่าง/มืด ช่วงเทศกาล → เปลี่ยนทันที (v1.23.1) · เปิดธีมเทศกาลกลับได้
  - prefers-reduced-motion → ไม่มีแอนิเมชัน (ภาพนิ่ง) · หมดช่วงเทศกาล → ดีไซน์ปกติ ไม่มี canvas
  python3 test/e2e/lk_theme_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
os.makedirs(OUT, exist_ok=True)
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
ST = "()=>EQLanternFx.stats()"
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"
CONTRAST = """(sel)=>{const el=document.querySelector(sel); if(!el) return null;
  const rgb=(s)=>{const m=s.match(/[\\d.]+/g).map(Number);return m};
  const lum=([r,g,b])=>{const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
  let fg=rgb(getComputedStyle(el).color); let e=el, bg=null;
  while(e){const cs=getComputedStyle(e);const b=rgb(cs.backgroundColor);if(b.length<4||b[3]>0.5){bg=b;break} e=e.parentElement}
  if(!bg) bg=[11,16,40]; const a=lum(fg),b=lum(bg); return Math.round((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)*10)/10}"""
def _lum(c):
  f = lambda v: (v / 255) / 12.92 if v / 255 <= 0.03928 else (((v / 255) + 0.055) / 1.055) ** 2.4
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
async def pixel_contrast(pg, sel):
  import io
  from PIL import Image
  el = pg.locator(sel).first
  img = Image.open(io.BytesIO(await el.screenshot())).convert('RGB')
  w, h = img.size
  # พื้นปุ่ม: เฉลี่ยพิกเซลแถบซ้าย/ขวา (ไม่มีตัวอักษร) แนวกลางปุ่ม · พื้นเป็น gradient จึงใช้ค่าที่สว่างน้อยสุด (กรณีแย่สุด)
  cols = [img.getpixel((x, y)) for x in (int(w * 0.06), int(w * 0.1), int(w * 0.9), int(w * 0.94)) for y in range(int(h * 0.3), int(h * 0.7))]
  bg = min(cols, key=_lum)
  fg = [int(x) for x in (await el.evaluate("e=>getComputedStyle(e).color")).replace('rgb(', '').replace('rgba(', '').replace(')', '').split(',')[:3]]
  a, b = _lum(fg), _lum(bg)
  return round((max(a, b) + 0.05) / (min(a, b) + 0.05), 1)
async def wait_lanterns(pg, n=1, ms=12000):
  for _ in range(ms // 500):
    if (await pg.evaluate(ST))['lanterns'] >= n: return True
    await pg.wait_for_timeout(500)
  return False
async def go(pg, scr, ms=1500):
  await pg.evaluate(f"()=>EQApp.navigateTo('{scr}')"); await pg.wait_for_timeout(ms)

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(4000)
  d = await pg.evaluate("()=>({skin:document.documentElement.dataset.skin,fest:document.documentElement.dataset.fest,season:document.documentElement.dataset.season})")
  ok(d['skin'] == 'loykrathong' and d['fest'] == 'season' and d['season'] == 'loykrathong', f'{tag} หน้าเข้าสู่ระบบ: ธีมลอยกระทงทันที {d}')
  st = await pg.evaluate(ST)
  ok(st['canvases'] == 1 and st['level'] == 'full' and st['running'], f'{tag} หน้าเข้าสู่ระบบ: canvas โคม 1 อัน ระดับ full กำลังเคลื่อนไหว')
  ok(await wait_lanterns(pg, 3), f'{tag} หน้าเข้าสู่ระบบ: มีโคมลอยบนจอ ≥ 3 ดวง ({(await pg.evaluate(ST))["lanterns"]})')
  f0 = (await pg.evaluate(ST))['frames']; await pg.wait_for_timeout(2000); f1 = (await pg.evaluate(ST))['frames']
  ok(f1 - f0 > 20, f'{tag} โคมเคลื่อนไหวต่อเนื่อง (+{f1 - f0} เฟรม/2 วินาที)')
  cs = await pg.evaluate("()=>{const c=getComputedStyle(document.getElementById('lk-fx'));return [c.pointerEvents,c.zIndex,c.position]}")
  ok(cs == ['none', '-1', 'fixed'], f'{tag} canvas: pointer-events none · z-index -1 · fixed {cs}')
  hit = await pg.evaluate("()=>{const r=document.querySelector('#screen-auth .auth-card').getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+40);return e&&e.id!=='lk-fx'}")
  ok(hit, f'{tag} แตะการ์ดเข้าสู่ระบบได้ (เอฟเฟกต์ไม่บัง)')
  for sel in ['#screen-auth .form-group label', '#screen-auth .auth-welcome h2, #screen-auth .auth-welcome h1', '#screen-auth .tab-btn:not(.active)']:
    c = await pg.evaluate(CONTRAST, sel)
    ok(c is not None and c >= 4.5, f'{tag} อ่านง่าย: {sel} contrast {c}:1')
  # ปุ่มทอง (พื้นเป็น gradient): วัดจากพิกเซลจริงของภาพปุ่ม — สีพื้นที่พบมากสุด เทียบกับสีตัวอักษร
  c = await pixel_contrast(pg, '#screen-auth form:visible .btn-primary')
  ok(c >= 4.5, f'{tag} อ่านง่าย: ปุ่มเข้าสู่ระบบ (วัดจากพิกเซลจริง) contrast {c}:1')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าเข้าสู่ระบบไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/login_{w}.png')
  # สมัครสมาชิกผ่านฟอร์มจริง
  name = 'lt%d' % random.randint(1000000, 9999999)
  await pg.locator('#screen-auth .tab-btn:not(.active)').first.click(); await pg.wait_for_timeout(400)
  form = pg.locator('#screen-auth form:visible').first
  for inp in await form.locator('input:visible').all():
    t = (await inp.get_attribute('type')) or 'text'; nm = ((await inp.get_attribute('name')) or (await inp.get_attribute('id')) or '').lower()
    if t == 'checkbox': await inp.check()
    elif t == 'password': await inp.fill('password123')
    elif t == 'email' or 'mail' in nm: await inp.fill(name + '@gmail.com')
    else: await inp.fill(name)
  await form.locator('button[type=submit]').click()
  for _ in range(40):
    if await pg.evaluate("()=>!!(window.EQApp&&EQApp.user)"): break
    await pg.wait_for_timeout(500)
  ok(await pg.evaluate("()=>!!(EQApp.user)"), f'{tag} สมัครสมาชิก/เข้าสู่ระบบผ่านฟอร์มได้ตามปกติ')
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
  await pg.reload(); await pg.wait_for_timeout(4000)
  for _ in range(4):   # ปิดหน้าต่างต้อนรับ/วัดระดับที่อาจเปิดหลังสมัคร
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
  await go(pg, 'home', 2500)
  st = await pg.evaluate(ST); ok(st['level'] == 'full' and st['canvases'] == 1, f'{tag} หน้าแรก: ระดับ full ({st["level"]})')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าแรกไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/home_{w}.png')
  await go(pg, 'learn', 2500)
  st = await pg.evaluate(ST); ok(st['level'] == 'light', f'{tag} เส้นทางการเรียน: ระดับ light (ลดเอฟเฟกต์)')
  ok(await pg.evaluate(NOOVER), f'{tag} เส้นทางการเรียนไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/learn_{w}.png')
  # หน้าทำข้อสอบ → ปิด
  await pg.evaluate("()=>{location.hash='#/tcas'}"); await pg.wait_for_timeout(2500)
  sid = await pg.evaluate("()=>{const s=[...document.querySelectorAll('.screen')].find(e=>!e.classList.contains('hidden'));return s&&s.id}")
  st = await pg.evaluate(ST)
  ok(st['level'] == 'off' and not st['running'], f'{tag} หน้าติวสอบ ({sid}): ปิดแอนิเมชัน (สมาธิมาก่อน)')
  # สลับหน้า 30 ครั้ง
  for k in range(30): await go(pg, ['home', 'learn', 'play', 'profile', 'festival', 'leaderboard'][k % 6], 200)
  await go(pg, 'home', 1500)
  st = await pg.evaluate(ST); ok(st['canvases'] == 1 and st['running'], f'{tag} สลับหน้า 30 ครั้ง: canvas ยังมีอันเดียว และยังเคลื่อนไหว')
  # Modal อยู่เหนือเอฟเฟกต์
  await pg.evaluate("()=>{const ov=document.createElement('div');ov.className='modal-overlay ui-overlay is-center';ov.id='t-modal';ov.innerHTML='<div class=\"modal-card\" style=\"padding:40px\">ทดสอบ</div>';document.body.appendChild(ov);EQApp.makeDialog(ov,{})}")
  await pg.wait_for_timeout(400)
  top = await pg.evaluate("()=>{const e=document.elementFromPoint(innerWidth/2,innerHeight/2);return !!(e&&e.closest('#t-modal'))}")
  ok(top, f'{tag} หน้าต่าง Modal อยู่เหนือเอฟเฟกต์')
  await pg.keyboard.press('Escape'); await pg.evaluate("()=>{const m=document.getElementById('t-modal');if(m)m.remove()}")
  # แท็บถูกซ่อน → หยุด
  await pg.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))}")
  await pg.wait_for_timeout(300)
  f0 = (await pg.evaluate(ST))['frames']; await pg.wait_for_timeout(1500); f1 = (await pg.evaluate(ST))['frames']
  ok(not (await pg.evaluate(ST))['running'] and f1 == f0, f'{tag} แท็บถูกซ่อน: หยุดวาด (+{f1 - f0} เฟรม)')
  await pg.evaluate("()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))}")
  await pg.wait_for_timeout(1500)
  ok((await pg.evaluate(ST))['running'], f'{tag} กลับมาที่แท็บ: เคลื่อนไหวต่อ')
  # ตั้งค่า
  await go(pg, 'profile', 1500); await pg.evaluate("()=>EQApp.profileTab('settings')"); await pg.wait_for_timeout(800)
  ok(await pg.locator('#fest-settings').is_visible(), f'{tag} ตั้งค่า: มีสวิตช์ธีมเทศกาล')
  await pg.locator('label:has(#fest-fx-toggle)').click(); await pg.wait_for_timeout(600)
  st = await pg.evaluate(ST)
  painted = await pg.evaluate("()=>{const c=document.getElementById('lk-fx');const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<x.length;i+=64)if(x[i]>0)n++;return n}")
  ok(not st['running'] and st['mode'].endswith('-still'), f'{tag} ปิดเอฟเฟกต์: หยุดแอนิเมชัน ({st["mode"]})')
  await go(pg, 'home', 1500)
  painted = await pg.evaluate("()=>{const c=document.getElementById('lk-fx');const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<x.length;i+=64)if(x[i]>0)n++;return n}")
  ok(painted > 50 and not (await pg.evaluate(ST))['running'], f'{tag} ปิดเอฟเฟกต์: ฉากยังสวย (ภาพนิ่ง {painted} จุด) ไม่เคลื่อนไหว')
  await pg.screenshot(path=f'{OUT}/home_still_{w}.png')
  await go(pg, 'profile', 1200); await pg.evaluate("()=>EQApp.profileTab('settings')"); await pg.wait_for_timeout(500)
  await pg.locator('label:has(#fest-fx-toggle)').click(); await pg.wait_for_timeout(500)
  # v1.23.1 ช่วงเทศกาล: กดเลือกธีมเอง → เปลี่ยนเป็นธีมนั้นทันที (ธีมเทศกาลปิดให้) — รายงาน "ทำไมเปลี่ยนกลับไปเป็นธีมอื่นไม่ได้"
  SK = "()=>({skin:document.documentElement.dataset.skin||null,theme:document.documentElement.dataset.theme||null,c:document.querySelectorAll('#lk-fx').length})"
  for choice, theme in [('cute', 'cute'), ('light', 'light'), ('dark', 'dark')]:
    await pg.locator('label:has(#fest-theme-toggle)').click() if not await pg.locator('#fest-theme-toggle').is_checked() else None
    await pg.wait_for_timeout(500)
    ok(await pg.evaluate("()=>document.documentElement.dataset.skin") == 'loykrathong', f'{tag} ก่อนเลือก {choice}: กำลังแสดงธีมเทศกาล')
    ok(await pg.locator('.theme-seg .vd-seg-btn.active').count() == 0, f'{tag} ระหว่างธีมเทศกาล: ไม่มีปุ่มธีมอื่นถูกไฮไลต์หลอก')
    await pg.locator(f'[data-theme-choice="{choice}"]').click(); await pg.wait_for_timeout(600)
    d = await pg.evaluate(SK)
    ok(d == {'skin': None, 'theme': theme, 'c': 0}, f'{tag} กด "{choice}" ช่วงเทศกาล → เปลี่ยนเป็นธีมนั้นทันที {d}')
    ok(not await pg.locator('#fest-theme-toggle').is_checked() and await pg.locator(f'[data-theme-choice="{choice}"].active').count() == 1, f'{tag} สวิตช์ธีมเทศกาลปิดตาม · ปุ่ม {choice} ไฮไลต์')
  await pg.reload(); await pg.wait_for_timeout(3500)
  d = await pg.evaluate(SK)
  ok(d['skin'] is None and d['theme'] == 'dark', f'{tag} โหลดใหม่: ยังเป็นธีมที่เลือก (มืด) ไม่เด้งกลับเป็นลอยกระทง {d}')
  await go(pg, 'profile', 1200); await pg.evaluate("()=>EQApp.profileTab('settings')"); await pg.wait_for_timeout(500)
  await pg.locator('label:has(#fest-theme-toggle)').click(); await pg.wait_for_timeout(700)
  ok(await pg.evaluate("()=>document.documentElement.dataset.skin") == 'loykrathong', f'{tag} เปิดธีมเทศกาลกลับได้จากสวิตช์')
  # หมดช่วงเทศกาล (จำลอง) → ดีไซน์ปกติ
  await pg.evaluate("()=>{delete document.documentElement.dataset.season;Object.assign(EQSeason,{key:null,id:null});window.dispatchEvent(new CustomEvent('eq:season',{detail:{}}))}")
  await pg.wait_for_timeout(600)
  d = await pg.evaluate("()=>({skin:document.documentElement.dataset.skin||null,c:document.querySelectorAll('#lk-fx').length,fest:!document.getElementById('fest-settings').classList.contains('hidden')})")
  ok(d == {'skin': None, 'c': 0, 'fest': False}, f'{tag} หมดช่วงเทศกาล: กลับดีไซน์ปกติ ไม่มีเอฟเฟกต์/สวิตช์ {d}')
  ok(not errs, f'{tag} ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def reduced(b):
  ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, reduced_motion='reduce', service_workers='block'); pg = await ctx.new_page()
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(4000)
  st = await pg.evaluate(ST)
  f0 = st['frames']; await pg.wait_for_timeout(1500); f1 = (await pg.evaluate(ST))['frames']
  ok(not st['running'] and st['mode'].endswith('-still') and f1 == f0, f'[reduced-motion] ไม่มีแอนิเมชัน ({st["mode"]}, +{f1 - f0} เฟรม)')
  painted = await pg.evaluate("()=>{const c=document.getElementById('lk-fx');const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<x.length;i+=64)if(x[i]>0)n++;return n}")
  ok(painted > 50, f'[reduced-motion] ฉากยังมีโคม/แม่น้ำแบบภาพนิ่ง ({painted})')
  await pg.screenshot(path=f'{OUT}/login_reduced.png')
  await ctx.close()

async def main():
  async with async_playwright() as p:
    for w, h in [(1920, 1080), (820, 1180), (390, 844)]:
      b = await p.chromium.launch()
      try: await run(b, w, h)
      except Exception as e: ok(False, f'[{w}] exception {e}')
      await b.close()
    b = await p.chromium.launch()
    try: await reduced(b)
    except Exception as e: ok(False, f'[reduced] exception {e}')
    await b.close()
  print(f'\n{len(FAILS)} FAIL' if FAILS else '\nALL PASS', flush=True)
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
