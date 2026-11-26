"""
v1.25.3 — Christmas Photo Booth / Profile Card (E2E ด้วยเบราว์เซอร์จริง · WebGL ผ่าน SwiftShader)
  ทุกขนาดจอ 390×844 · 820×1180 · 1280×800 · 1920×1080:
  1) เปิด Photo booth → โหลดฉาก 3D (หมู่บ้าน/ต้นสน/ของขวัญ) + ตัวละคร 3D ของผู้ใช้ (PNG ไม่มีวงเงาเดิม)
  2) ภาพตัวอย่างเคลื่อนไหวจริง (หิมะ/ไฟกะพริบ: พิกเซลต่างกันระหว่างเวลา)
  3) จัดองค์ประกอบ: ต้นไม้และของขวัญไม่ทับกรอบตัวละคร (ตรวจจากพิกัดจริงของชั้นภาพ) ทั้ง 1080×1350 และ 1080×1920
  4) ภาพที่บันทึก (PNG ที่ดาวน์โหลดจริง) = พิกเซลเดียวกับภาพตัวอย่างในขณะกดบันทึก · ขนาดตรงรูปแบบ
  5) ตัวเลือกชุด: แสดงเฉพาะไอเทมที่ผู้ใช้มีจริง · ใส่ชุดคริสต์มาส → ตัวละครเปลี่ยนจริง (ภาพตัวละครใหม่) · ชุดในบัญชีไม่เปลี่ยน
  6) ปิดชั้นภาพทีละชั้น (ต้นไม้/หิมะ/ของขวัญ/กรอบ) → ภาพเปลี่ยนตาม
  7) ไม่ล้นแนวนอน · ไม่มี JS error · ปิดหน้าต่างแล้วหยุดภาพเคลื่อนไหว
  python3 test/e2e/booth_e2e.py [โฟลเดอร์ภาพ]  (เซิร์ฟเวอร์ :3100 · ฐานข้อมูล eq_dev)
"""
import asyncio, base64, io, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/booth'; os.makedirs(OUT, exist_ok=True)
SIZES = [(390, 844), (820, 1180), (1280, 800), (1920, 1080)]
if os.environ.get('BOOTH_SIZES'): SIZES = [tuple(map(int, s.split('x'))) for s in os.environ['BOOTH_SIZES'].split(',')]
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"
XM = ['outer_xm26_santa', 'hat_xm26_santa', 'acc_xm26_scarf', 'shoes_xm26_boots', 'bottom_xm26_tartan']
# พิกเซลของ canvas (ลดขนาดเป็นลายเซ็นเพื่อเทียบ)
SIG = """()=>{const c=document.getElementById('xm-photo-canvas');const s=document.createElement('canvas');s.width=108;s.height=Math.round(108*c.height/c.width);const g=s.getContext('2d');g.drawImage(c,0,0,s.width,s.height);return Array.from(g.getImageData(0,0,s.width,s.height).data)}"""
def diff(a, b): return sum(abs(x - y) for x, y in zip(a, b)) / max(1, len(a))

async def wait_ready(pg):
  await pg.wait_for_selector('[data-xm-photo-save]:not([disabled])', timeout=90000)
  await pg.wait_for_timeout(800)

async def run(b, w, h):
  tag = f'[{w}]'
  mobile = w < 500
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', accept_downloads=True, is_mobile=mobile, has_touch=mobile)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(2500)
  n = 'bo%d' % random.randint(100000, 999999); r = await pg.evaluate(REG, n)
  uid = int(sql(f"SELECT id FROM users WHERE username='{n}'"))
  for it in XM: sql(f"INSERT INTO user_inventory (user_id, item_id, acquisition_type) VALUES ({uid}, '{it}', 'event') ON CONFLICT DO NOTHING")
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(4500)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  before = await pg.evaluate("()=>EQApp.api('/avatar/me').then(r=>r.outfit)")
  await pg.evaluate("()=>EQApp.navigateTo('christmas')"); await pg.wait_for_timeout(3500)
  await pg.locator('[data-xm-photo]').click()
  await wait_ready(pg)
  st = await pg.evaluate("()=>{const B=EQChristmas._booth();return {has:!!B.avatar,box:B.avatarBox,aw:B.avatar&&B.avatar.width,fmt:B.fmt,assets:!!EQXmasBooth._assets(),wait:document.querySelector('.xm-photo-wait').textContent}}")
  ok(st['assets'] and st['has'] and st['aw'] == 1200 and not st['wait'], f'{tag} โหลดฉาก 3D + ตัวละคร 3D (PNG 1200px) สำเร็จ {st["box"]}')
  # ภาพเคลื่อนไหว
  s1 = await pg.evaluate(SIG); await pg.wait_for_timeout(700); s2 = await pg.evaluate(SIG)
  ok(diff(s1, s2) > 0.05, f'{tag} ภาพตัวอย่างเคลื่อนไหว (หิมะ/ไฟกะพริบ) ค่าต่าง {diff(s1, s2):.3f}')
  for fmt, (FW, FH) in (('post', (1080, 1350)), ('story', (1080, 1920))):
    await pg.locator(f'[data-xm-fmt="{fmt}"]').click(); await pg.wait_for_timeout(900)
    lay = await pg.evaluate("""()=>{const B=EQChristmas._booth();const L=EQXmasBooth.layout(B.fmt,B);const a=L.avatar;
      const tr=L.trees.map(t=>{const hw=t.m.halfWidth*t.w;const cx=t.x+t.m.base[0]*t.w;return {l:cx-hw,r:cx+hw,top:t.y+t.m.top[1]*t.h,base:t.baseY}});
      const gf=L.gifts.map(g=>({l:g.x,r:g.x+g.w,top:g.y}));
      const c=document.getElementById('xm-photo-canvas');return {W:c.width,H:c.height,a:{l:a.left,r:a.right,t:a.top,b:a.bottom},tr,gf}}""")
    a = lay['a']
    ok(lay['W'] == FW and lay['H'] == FH, f'{tag} {fmt}: canvas {lay["W"]}×{lay["H"]}')
    ok(lay['tr'][0]['r'] <= a['l'] + 1 and lay['tr'][1]['l'] >= a['r'] - 1, f'{tag} {fmt}: ต้นไม้ (รัศมีกิ่งล่าง) ไม่ทับตัวละคร L{lay["tr"][0]["r"]:.0f}≤{a["l"]:.0f} R{lay["tr"][1]["l"]:.0f}≥{a["r"]:.0f}')
    ok(lay['gf'][0]['r'] <= a['l'] and lay['gf'][1]['l'] >= a['r'], f'{tag} {fmt}: ของขวัญไม่ทับตัวละคร')
    ok(a['t'] > FH * 0.18 and a['b'] < FH * 0.9, f'{tag} {fmt}: ตัวละครอยู่ใต้หัวเรื่อง/เหนือขอบล่าง (บน {a["t"]:.0f} · เท้า {a["b"]:.0f})')
    # บันทึก: PNG ที่ดาวน์โหลด = canvas ในขณะนั้น
    if mobile:
      # มือถือ (ไม่ใช่ iOS) ดาวน์โหลดเหมือนเดสก์ท็อป
      pass
    async with pg.expect_download() as dl:
      await pg.locator('[data-xm-photo-save]').click()
    d = await dl.value; path = f'{OUT}/booth_{fmt}_{w}.png'; await d.save_as(path)
    live = await pg.evaluate("()=>document.getElementById('xm-photo-canvas').toDataURL('image/png')")
    from PIL import Image, ImageChops
    im = Image.open(path).convert('RGBA'); lv = Image.open(io.BytesIO(base64.b64decode(live.split(',')[1]))).convert('RGBA')
    bbox = ImageChops.difference(im, lv).getbbox()
    ok(im.size == (FW, FH) and bbox is None, f'{tag} {fmt}: ไฟล์ที่บันทึก {im.size} ตรงกับภาพตัวอย่างทุกพิกเซล (ต่าง: {bbox})')
    ok(d.suggested_filename.endswith(f'{FW}x{FH}.png'), f'{tag} {fmt}: ชื่อไฟล์ {d.suggested_filename}')
    await pg.wait_for_timeout(2600)   # ปล่อยภาพนิ่งหลังบันทึก → กลับมาเคลื่อนไหว
  await pg.locator('[data-xm-fmt="post"]').click(); await pg.wait_for_timeout(600)
  # ตัวเลือกชุด
  ids = await pg.evaluate("()=>[...document.querySelectorAll('[data-xm-bo-slot]')].map(b=>b.dataset.xmBoSlot)")
  owned = await pg.evaluate("()=>Object.values(EQChristmas._booth().owned).flat().map(x=>x.id)")
  inv = set(sql(f"SELECT item_id FROM user_inventory WHERE user_id={uid}").split())
  ok(set(owned) <= inv and 'outer_xm26_santa' in owned and 'outer_xm26_prince' not in owned, f'{tag} ตัวเลือกชุดแสดงเฉพาะไอเทมที่มีจริง ({len(owned)} ชิ้น · แท็บ {ids})')
  a0 = await pg.evaluate("()=>EQChristmas._booth().avatar.src.length")
  await pg.locator('[data-xm-bo-preset="xmas"]').click()
  for _ in range(60):
    await pg.wait_for_timeout(500)
    if not await pg.evaluate("()=>EQChristmas._booth().busy"): break
  ofit = await pg.evaluate("()=>EQChristmas._booth().outfit")
  a1 = await pg.evaluate("()=>EQChristmas._booth().avatar.src.length")
  ok(ofit.get('outerwear') == 'outer_xm26_santa' and ofit.get('hat') == 'hat_xm26_santa' and a1 != a0, f'{tag} ใส่ชุดคริสต์มาสที่มี → ตัวละครในรูปเปลี่ยนจริง')
  await pg.wait_for_timeout(600)
  await pg.screenshot(path=f'{OUT}/booth_ui_{w}.png')
  async with pg.expect_download() as dl:
    await pg.locator('[data-xm-photo-save]').click()
  d = await dl.value; await d.save_as(f'{OUT}/booth_post_xmas_{w}.png')
  # ถอดหมวก (ไม่สวม)
  await pg.locator('[data-xm-bo-slot="hat"]').click(); await pg.wait_for_timeout(300)
  await pg.locator('[data-xm-bo-item=""][data-slot="hat"]').click()
  for _ in range(60):
    await pg.wait_for_timeout(400)
    if not await pg.evaluate("()=>EQChristmas._booth().busy"): break
  ok(not (await pg.evaluate("()=>EQChristmas._booth().outfit")).get('hat'), f'{tag} เลือก "ไม่สวม" หมวกได้')
  after = await pg.evaluate("()=>EQApp.api('/avatar/me').then(r=>r.outfit)")
  ok(after == before, f'{tag} ชุดที่บันทึกในบัญชีไม่เปลี่ยน')
  # ชั้นภาพ
  await pg.locator('.xm-booth-layers summary').click(); await pg.wait_for_timeout(300)
  await pg.evaluate("()=>{EQChristmas._booth().frozen=3}"); await pg.wait_for_timeout(200)
  base = await pg.evaluate(SIG)
  for k in ('trees', 'gifts', 'frame', 'snow'):
    await pg.locator(f'[data-xm-layer="{k}"]').click(); await pg.wait_for_timeout(250)
    s = await pg.evaluate(SIG)
    ok(diff(base, s) > (0.08 if k == 'snow' else 0.3), f'{tag} ปิดชั้น "{k}" → ภาพเปลี่ยน ({diff(base, s):.2f})')
    await pg.locator(f'[data-xm-layer="{k}"]').click(); await pg.wait_for_timeout(250)
  back = await pg.evaluate(SIG)
  ok(diff(base, back) < 0.01, f'{tag} เปิดชั้นกลับ → ภาพเหมือนเดิม ({diff(base, back):.3f})')
  await pg.evaluate("()=>{EQChristmas._booth().frozen=null}")
  ok(await pg.evaluate(NOOVER), f'{tag} ไม่ล้นแนวนอน')
  await pg.locator('#xm-photo-canvas').scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
  cv = await pg.evaluate("()=>{const r=document.getElementById('xm-photo-canvas').getBoundingClientRect();return {w:r.width,h:r.height,ratio:r.height/r.width,vis:r.top<innerHeight&&r.bottom>0}}")
  ok(abs(cv['ratio'] - 1.25) < 0.02 and cv['vis'], f'{tag} ภาพตัวอย่างสัดส่วนถูกต้อง ไม่บิดเบี้ยว ({cv["w"]:.0f}×{cv["h"]:.0f})')
  await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
  ok(await pg.evaluate("()=>!EQChristmas._booth() && !document.getElementById('xm-photo-canvas')"), f'{tag} ปิดหน้าต่าง → หยุดภาพเคลื่อนไหว/คืนหน่วยความจำ')
  ok(not errs, f'{tag} ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    sql("INSERT INTO season_settings (season_key, starts_at) VALUES ('christmas', NOW() - interval '1 day') ON CONFLICT (season_key) DO UPDATE SET starts_at = EXCLUDED.starts_at, enabled = TRUE, flags = '{}'::jsonb")
    await asyncio.sleep(31)   # แคชการตั้งค่าฤดูกาล 30 วินาที
    try:
      for w, h in SIZES: await run(b, w, h)
    finally: sql("DELETE FROM season_settings WHERE season_key='christmas'")
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
