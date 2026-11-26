"""
v1.25.0 หิมะคริสต์มาส — Soak test (ค่าเริ่ม 10 นาที · SOAK_MIN=30 สำหรับรอบเต็ม) ที่ 1280×800 หน้าแรก (ระดับ full)
  ตั้งช่วงกิจกรรมผ่าน season_settings ของฐานข้อมูลพัฒนาแล้วคืนค่าเมื่อจบ
  วัดทุก 30 วินาที: เฟรมที่วาด (ลูปยังเดิน) · JS heap · จำนวน canvas · จำนวนเกล็ดที่วาด
  ผ่าน = ลูปเดินตลอด · canvas คงที่ 2 · heap ช่วงท้าย ไม่โตเกิน 10% จากช่วงแรก (หลังอุ่นเครื่อง) · ไม่มี error
  python3 test/e2e/xmas_snow_soak.py
  v1.26.0: SOAK_SEASON=none → ทดสอบ Global Snow บนธีมปกติ (ไม่ตั้งช่วงคริสต์มาส) · EQ_URL เลือกเซิร์ฟเวอร์ · SOAK_ROUTES=1 สลับหน้าไปมาทุก 30 วินาที
"""
import asyncio, os, random, subprocess, statistics
from playwright.async_api import async_playwright
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
MIN = float(os.environ.get('SOAK_MIN', '10'))
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); NOSEASON = os.environ.get('SOAK_SEASON') == 'none'; ROUTES = os.environ.get('SOAK_ROUTES') == '1'
async def main():
  if not NOSEASON: sql("INSERT INTO season_settings (season_key, starts_at) VALUES ('christmas', NOW() - interval '1 day') ON CONFLICT (season_key) DO UPDATE SET starts_at = EXCLUDED.starts_at, enabled = TRUE")
  if not NOSEASON: await asyncio.sleep(31)
  fails = []
  try:
    async with async_playwright() as p:
      b = await p.chromium.launch(args=['--enable-precise-memory-info', '--js-flags=--expose-gc'])
      ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, service_workers='block'); pg = await ctx.new_page()
      errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
      await pg.goto(URL); await pg.wait_for_timeout(2500)
      r = await pg.evaluate(REG, 'sk%d' % random.randint(100000, 999999))
      await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t)}", r['token']); await pg.reload(); await pg.wait_for_timeout(5000)
      for _ in range(5):
        if await pg.locator('.modal-overlay').count() == 0: break
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
      await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(5000)
      rows = []; n = int(MIN * 2)
      for i in range(n):
        f0 = (await pg.evaluate("()=>EQSnowFx.stats()"))['frames']
        if ROUTES:   # เปลี่ยนหน้าไปมา (ตรวจว่าไม่เกิดลูป/แอนิเมชันซ้อน และไม่รั่ว)
          for rt in ('path', 'profile', 'grammar', 'home'):
            await pg.evaluate(f"()=>EQApp.navigateTo('{rt}')"); await pg.wait_for_timeout(7000)
          await pg.wait_for_timeout(2000)
        else: await pg.wait_for_timeout(30000)
        await pg.evaluate("()=>window.gc&&window.gc()")
        st = await pg.evaluate("()=>({s:EQSnowFx.stats(),heap:performance.memory?performance.memory.usedJSHeapSize:0,dom:document.getElementsByTagName('*').length})")
        rows.append((i, st['s']['frames'] - f0, st['heap'] / 1e6, st['s']['canvases'], st['s']['drawn'], st['dom'], st['s']['quality']))
        print('t=%4.1fmin frames/30s=%4d heap=%.1fMB canvases=%d drawn=%d dom=%d q=%.2f' % ((i + 1) / 2, *rows[-1][1:]), flush=True)
      await b.close()
    first = statistics.mean(r[2] for r in rows[2:5]) if len(rows) > 6 else rows[0][2]
    last = statistics.mean(r[2] for r in rows[-3:])
    ok = lambda c, m: (print(('PASS ' if c else 'FAIL ') + m), None if c else fails.append(m))
    ok(all(r[1] > 30 for r in rows), 'ลูปหิมะเดินตลอด ไม่หยุดเอง (เฟรม/30 วินาที > 30 ทุกช่วง — เครื่องทดสอบไม่มี GPU และหน้าแรกเรนเดอร์ตัวละคร 3D ด้วย จึงวัด fps จริงไม่ได้)')
    ok(all(r[3] in (1, 2) for r in rows) and len(set(r[3] for r in rows[2:])) == 1, f'canvas หิมะคงที่ ไม่เพิ่มขึ้น ({sorted(set(r[3] for r in rows))} · 2 = หลัง+หน้า · 1 = โหมดประหยัด)')
    ok(last <= first * 1.10, f'heap ไม่รั่ว: ช่วงแรก {first:.1f}MB → ช่วงท้าย {last:.1f}MB')
    ok(max(r[5] for r in rows) - min(r[5] for r in rows) < 200, 'จำนวน DOM คงที่ (หิมะไม่สร้าง DOM)')
    ok(not errs, f'ไม่มี JavaScript error {errs[:2]}')
  finally:
    if not NOSEASON: sql("DELETE FROM season_settings WHERE season_key='christmas'")
  print('FAILS', len(fails))
asyncio.run(main())
