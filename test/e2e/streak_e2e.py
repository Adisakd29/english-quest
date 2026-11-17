"""
v1.18.0 Learning Streak + เหรียญใหม่ (E2E บนเบราว์เซอร์จริง ที่ 390 / 820 / 1280)
  python3 test/e2e/streak_e2e.py [โฟลเดอร์ภาพ]
  ต้องมีเซิร์ฟเวอร์ที่ EQ_URL (ค่าเริ่มต้น http://localhost:3100) ต่อฐานข้อมูล EQ_DB (ค่าเริ่มต้น eq_dev) — สคริปต์ใส่คำตอบย้อนหลังของผู้ใช้ทดสอบเองผ่าน psql
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = os.environ.get('EQ_URL', 'http://localhost:3100')
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAILS = []

def sql(q):
  subprocess.run(['psql', DB, '-qc', q], check=True, stdout=subprocess.DEVNULL)

async def run(b, w, h):
  tag = f'{w}px'
  def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + f'[{tag}] ' + m)
    if not c: FAILS.append(f'{tag}: {m}')
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', has_touch=w < 1024); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.add_init_script("window.__toasts=[];document.addEventListener('DOMContentLoaded',()=>{const c=document.getElementById('toast-container');if(c)new MutationObserver((ms)=>ms.forEach((m)=>m.addedNodes.forEach((n)=>window.__toasts.push(n.textContent||'')))).observe(c,{childList:true})})")
  await pg.goto(URL); await pg.wait_for_timeout(300)
  name = 'sk%d' % random.randint(100000, 999999)
  tok = (await pg.evaluate(REG, name))['token']
  me = await pg.evaluate("t=>fetch('/api/auth/me',{headers:{Authorization:'Bearer '+t}}).then(r=>r.json())", tok); uid = int(me['user']['id'])
  # คำตอบจริงย้อนหลัง 4 วัน (เมื่อวาน−4 วันก่อน · วันละ 20 ข้อ) + วันนี้ 5 ข้อ
  for d in range(1, 5):
    sql(f"INSERT INTO answer_events (user_id, skill, item_id, level, correct, created_at) SELECT {uid}, 'vocab', 'w'||g, 'A1', TRUE, ((NOW() AT TIME ZONE 'Asia/Bangkok')::date - {d} + TIME '12:00') AT TIME ZONE 'Asia/Bangkok' FROM generate_series(1,20) g")
  sql(f"INSERT INTO answer_events (user_id, skill, item_id, level, correct) SELECT {uid}, 'vocab', 'w'||g, 'A1', TRUE FROM generate_series(1,5) g")
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
  await pg.reload(); await pg.wait_for_selector('#hl-streak .stk-chip-t b'); await pg.wait_for_timeout(2000)
  api = await pg.evaluate("()=>EQApp.api('/streak')")
  ok(api['current'] == 4 and api['atRisk'] and not api['doneToday'], f"API: streak 4 วัน · วันนี้ยังไม่ครบ ({api['current']})")
  # ฉลอง Milestone 3 วัน (ครั้งเดียว)
  try: await pg.wait_for_selector('.stk-cele', timeout=4000)
  except Exception: pass
  ok(await pg.locator('.stk-cele').count() == 1, 'ฉลองตรา 3 วัน')
  if await pg.locator('.stk-cele').count():
    t = await pg.inner_text('.stk-cele')
    ok('+15' in t and '+30 EXP' in t, 'แสดงรางวัล +15 Coins +30 EXP')
    await pg.screenshot(path=f'{OUT}/stk_cele_{w}.png')
    await pg.click('[data-stk-cele-ok]'); await pg.wait_for_timeout(600)
  ok(await pg.locator('#hl-streak .stk-chip-t b').inner_text() == '4', 'ชิปแสดง 4 วัน')
  ok(await pg.locator('#hl-streak-card .stk-wd').count() == 7, 'การ์ดแสดง 7 วันล่าสุด')
  ok('อีก 15 ข้อ' in await pg.inner_text('#hl-streak-card'), 'บอกจำนวนข้อที่ต้องทำวันนี้')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), 'ไม่ล้นแนวนอน')
  # เหรียญใหม่ทั้งหน้า
  ok(await pg.locator('img.coin-ico[src*="/assets/coin/"]').count() >= 1 and await pg.locator('svg.coin-ico').count() == 0, 'เหรียญใหม่ (ไม่มีเหรียญแบบเดิม)')
  if w < 700:
    hgt = await pg.evaluate("()=>document.querySelector('#evc .evc-viewport').getBoundingClientRect().height")
    ok(hgt <= 480, f'แบนเนอร์กิจกรรมบนมือถือกะทัดรัด ({hgt:.0f}px)')
  await pg.screenshot(path=f'{OUT}/stk_home_{w}.png')
  # หน้ารายละเอียด
  await pg.click('#hl-streak'); await pg.wait_for_selector('.stk-hero'); await pg.wait_for_timeout(400)
  ok(await pg.locator('.stk-cal-d').count() == 28, 'ปฏิทิน 28 วัน')
  ok(await pg.locator('.stk-cal-d.is-goal').count() == 4, 'ปฏิทินทำเครื่องหมาย 4 วันที่ทำครบ')
  ok(await pg.locator('.stk-m.is-got').count() == 1 and await pg.locator('.stk-m').count() == 7, 'ตรา 7 ระดับ (ได้แล้ว 1)')
  ok(await pg.evaluate("()=>{const c=document.querySelector('.stk-modal').getBoundingClientRect();return c.left>=0&&c.right<=innerWidth+1}"), 'หน้ารายละเอียดอยู่ในจอ')
  await pg.screenshot(path=f'{OUT}/stk_sheet_{w}.png')
  # ซื้อ Freeze (ราคา/ยอดจากเซิร์ฟเวอร์)
  sql(f"UPDATE coin_wallets SET balance = 120 WHERE user_id = {uid}")
  await pg.evaluate("()=>EQAvatar.checkCoins(10)"); await pg.wait_for_timeout(800)
  await pg.click('[data-stk-buy]')
  try: await pg.wait_for_function("()=>document.querySelectorAll('.stk-fz-slot.is-on').length===1", timeout=6000)
  except Exception: pass
  ok(any('Freeze' in x for x in await pg.evaluate("()=>window.__toasts")), 'ซื้อ Freeze สำเร็จ (แจ้งเตือน)')
  ok(await pg.locator('.stk-fz-slot.is-on').count() == 1, 'มี Freeze 1/2')
  await pg.click('[data-stk-buy]')
  try: await pg.wait_for_function("()=>document.querySelectorAll('.stk-fz-slot.is-on').length===2", timeout=6000)
  except Exception: pass
  ok(await pg.locator('.stk-fz-slot.is-on').count() == 2 and await pg.locator('[data-stk-buy]').is_disabled(), 'ครบ 2 อันแล้วปุ่มซื้อปิด')
  bal = await pg.evaluate("()=>EQApp.api('/coins/wallet')")
  ok(bal['balance'] == 20, f"หัก Coin 2 × 50 ({bal['balance']})")
  await pg.locator('.stk-modal').evaluate("e=>e.scrollTop=e.scrollHeight"); await pg.wait_for_timeout(200)
  await pg.screenshot(path=f'{OUT}/stk_sheet_end_{w}.png')
  await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  ok(await pg.locator('.stk-sheet').count() == 0, 'Esc ปิดหน้ารายละเอียด')
  # รีเฟรช → ไม่ฉลองซ้ำ
  await pg.reload(); await pg.wait_for_selector('#hl-streak .stk-chip-t b'); await pg.wait_for_timeout(2500)
  ok(await pg.locator('.stk-cele').count() == 0, 'ไม่ฉลองซ้ำหลังรีเฟรช')
  c = await pg.evaluate("()=>EQApp.api('/coins/history')")
  ok(sum(1 for x in c['items'] if x['type'] == 'STREAK_MILESTONE') == 1, 'รางวัล Milestone ได้ครั้งเดียว')
  # โปรไฟล์ของตัวเอง → ตรา Streak
  await pg.evaluate("p=>EQApp.navigateTo(p)", 'profile')
  try: await pg.wait_for_selector('.pf-streak .stk-pbadge', timeout=8000)
  except Exception: print('   debug profile:', (await pg.evaluate("()=>(document.getElementById('profile-progress')||{}).innerHTML||''"))[:200])
  ok(await pg.locator('.pf-streak .stk-pbadge').count() == 1 and 'Streak 4 วัน' in await pg.inner_text('.pf-streak'), 'ตรา Streak บนโปรไฟล์')
  await pg.evaluate("p=>EQApp.navigateTo(p)", 'home'); await pg.wait_for_timeout(800)
  ok(not errs, f'ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def main():
  os.makedirs(OUT, exist_ok=True)
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w, h in [(390, 844), (820, 1180), (1280, 860)]:
      await run(b, w, h)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  for f in FAILS: print(' -', f)
  sys.exit(1 if FAILS else 0)

if __name__ == '__main__':
  asyncio.run(main())
