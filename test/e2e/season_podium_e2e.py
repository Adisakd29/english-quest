"""
v1.18.0 ธีมลอยกระทงอัตโนมัติ (โลโก้ + เพลงหน้าแรก) และแท่นรางวัลกระดานอันดับ — E2E ที่ 390 / 820 / 1280
  python3 test/e2e/season_podium_e2e.py [โฟลเดอร์ภาพ]
  ต้องรันในช่วงเทศกาลลอยกระทง (2–25 พ.ย. 2569) หรือเซิร์ฟเวอร์ที่ตั้งเวลาให้อยู่ในช่วงนั้น · ต้องมีผู้ใช้อย่างน้อย 3 คนในกระดาน "ตลอดกาล"
"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright

URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAILS = []

async def run(b, w, h):
  tag = f'{w}px'
  def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + f'[{tag}] ' + m)
    if not c: FAILS.append(f'{tag}: {m}')
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(1500)
  season = await pg.evaluate("()=>fetch('/api/season').then(r=>r.json())")
  ok(season['season'] and season['season']['key'] == 'loykrathong', 'เซิร์ฟเวอร์บอกว่าอยู่ช่วงลอยกระทง')
  ok(await pg.evaluate("()=>document.documentElement.dataset.season") == 'loykrathong', '<html data-season="loykrathong"> อัตโนมัติ')
  srcs = await pg.evaluate("()=>[...document.querySelectorAll('img.brand-mark')].map(i=>i.currentSrc)")
  ok(srcs and all('/brand/' in s and 's=loykrathong-2026' in s for s in srcs), 'โลโก้ในแอปมาจาก /brand ของฤดูกาล')
  nat = await pg.evaluate("()=>{const i=document.querySelector('img.brand-mark');return i.complete&&i.naturalWidth}")
  ok(nat and nat > 0, 'โหลดโลโก้ได้จริง')
  fav = await pg.evaluate("()=>[...document.querySelectorAll('link[rel=icon]')].map(l=>l.href)")
  ok(all('s=loykrathong-2026' in f for f in fav), 'favicon ของฤดูกาล')
  # เข้าแอป
  tok = (await pg.evaluate(REG, 'sp%d' % random.randint(100000, 999999)))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(2500)
  await pg.mouse.click(4, h - 140); await pg.wait_for_timeout(1500)
  ok(await pg.evaluate("()=>EQAudio._track()") == 'loykrathong_night', 'หน้าแรกเล่นเพลงลอยกระทง')
  # v1.21.0 เพลงลอยกระทงทุกเมนู (ค่าเริ่มต้น) · เลือก "เพลงเดิม" ในตั้งค่าเสียงได้
  for path in ['learn', 'play', 'profile']:
    await pg.evaluate("p=>EQApp.navigateTo(p)", path); await pg.wait_for_timeout(1200)
    ok(await pg.evaluate("()=>EQAudio._track()") == 'loykrathong_night', f'v1.21.0 หน้า {path} เล่นเพลงลอยกระทงด้วย')
  await pg.evaluate("p=>EQApp.navigateTo(p)", 'learn'); await pg.wait_for_timeout(800)
  await pg.locator('[data-audio-menu]:visible').first.click(); await pg.wait_for_timeout(400)   # ปุ่มลำโพง → เมนูเสียง
  sel = pg.locator('select[data-au="appTrack"]:visible').first
  ok(await sel.count() == 1 and await sel.input_value() == 'loykrathong', 'เมนูเสียงมีตัวเลือก "เพลงพื้นหลัง" (ค่าเริ่มต้น = ลอยกระทง)')
  await sel.select_option('classic'); await pg.wait_for_timeout(1200); await pg.keyboard.press('Escape')
  ok(await pg.evaluate("()=>EQAudio._track()") in ('app_home', 'app_study'), f'เลือก "เพลงเดิม" → หน้าเรียนกลับเป็นเพลงเดิม ({await pg.evaluate("()=>EQAudio._track()")})')
  await pg.reload(); await pg.wait_for_timeout(2500); await pg.mouse.click(4, h - 140); await pg.wait_for_timeout(1200)
  ok(await pg.evaluate("()=>EQAudio.getSettings().appTrack") == 'classic', 'จำการเลือก "เพลงเดิม" หลังรีเฟรช')
  srv = await pg.evaluate("()=>EQApp.api('/ranked/audio-settings')")
  ok(srv['settings'] and srv['settings'].get('appTrack') == 'classic', 'บันทึกการเลือกเพลงในบัญชี')
  await pg.evaluate("()=>EQAudio.update({appTrack:'loykrathong'})"); await pg.wait_for_timeout(1000)
  ok(await pg.evaluate("()=>EQAudio._track()") == 'loykrathong_night', 'เลือกกลับเป็นลอยกระทงได้')
  # กระดานอันดับ
  await pg.evaluate("p=>EQApp.navigateTo(p)", 'play'); await pg.wait_for_timeout(800)
  await pg.click('#btn-leaderboard'); await pg.wait_for_timeout(400)
  await pg.click('[data-lb="all"]')
  await pg.wait_for_selector('#leaderboard-list .lbp-place', timeout=10000)
  ok(await pg.locator('#leaderboard-list .lbp-place').count() == 3, 'แท่นรางวัล 3 อันดับ')
  xs = await pg.evaluate("()=>[1,2,3].map(n=>document.querySelector('#leaderboard-list .lbp-'+n).getBoundingClientRect().left)")
  ok(xs[1] < xs[0] < xs[2], 'จัดเรียง 2 | 1 | 3')
  hs = await pg.evaluate("()=>[1,2,3].map(n=>document.querySelector('#leaderboard-list .lbp-'+n+' .lbp-block').getBoundingClientRect().height)")
  ok(hs[0] > hs[1] > hs[2], 'แท่นที่ 1 สูงสุด')
  try: await pg.wait_for_function("()=>[...document.querySelectorAll('#leaderboard-list .lbp-fig')].every(f=>/is-(3d|2d|photo)/.test(f.className))", timeout=30000)
  except Exception: pass
  kinds = await pg.evaluate("()=>[...document.querySelectorAll('#leaderboard-list .lbp-fig')].map(f=>(f.className.match(/is-(3d|2d|photo)/)||[])[1]||'pending')")
  ok('pending' not in kinds, f'ตัวละครบนแท่นแสดงครบ {kinds}')
  if '3d' in kinds:
    gap = await pg.evaluate("()=>{const p=document.querySelector('#leaderboard-list .lbp-fig.is-3d');const m=p.querySelector('img').getBoundingClientRect();const k=p.closest('.lbp-place').querySelector('.lbp-block').getBoundingClientRect();return m.bottom-k.top}")
    ok(0 <= gap <= 16, f'เท้าตัวละครอยู่บนหน้าแท่น ({gap:.0f}px)')
  ok(await pg.locator('#leaderboard-list .leaderboard-row.rank-1, #leaderboard-list .leaderboard-row.rank-2, #leaderboard-list .leaderboard-row.rank-3').count() == 0, 'อันดับ 1–3 ไม่ซ้ำในรายการ')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), 'ไม่ล้นแนวนอน')
  await pg.locator('.lbp').screenshot(path=f'{OUT}/podium_{w}.png')
  # Ranked
  await pg.click('#screen-leaderboard [data-lb-mode="ranked"]'); await pg.wait_for_timeout(2500)
  n = await pg.locator('#rk-lb-list .lbp-place').count()
  rows = await pg.locator('#rk-lb-list .rk-lb-row').count()
  ok(n >= 1 or rows == 0, f'Ranked: แท่นรางวัล ({n} คน)')
  ok(not errs, f'ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def main():
  os.makedirs(OUT, exist_ok=True)
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    for w, h in [(390, 844), (820, 1180), (1280, 860)]:
      await run(b, w, h)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  for f in FAILS: print(' -', f)
  sys.exit(1 if FAILS else 0)

if __name__ == '__main__':
  asyncio.run(main())
