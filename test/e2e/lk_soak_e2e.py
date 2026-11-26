"""
v1.23.0 ทดสอบเปิดค้าง 30 นาที (เงื่อนไขบังคับของธีมลอยกระทง)
  - เปิดหน้า SOAK_SCREEN (ค่าเริ่ม festival — ระดับเอฟเฟกต์ full เท่าหน้าแรก) ค้างไว้ SOAK_MIN นาที (ค่าเริ่ม 30) · วัดทุก 1 นาที
    หมายเหตุ: เครื่องทดสอบไม่มี GPU — หน้าแรกมีตัวละคร 3D ที่เรนเดอร์ด้วย CPU เหลือ ~2 fps ทั้งมี/ไม่มีโคม จึงวัดที่หน้าเทศกาล
  - ตรวจ: โคมยังเคลื่อนไหว (เฟรมเพิ่มทุกนาที) · มีโคมเกิดใหม่ต่อเนื่อง · โคมบนจอไม่เป็นศูนย์
          หน่วยความจำ JS (หลัง GC) ไม่โตเรื่อย ๆ · จำนวน DOM/Listener/Canvas คงที่
  - นาทีที่ 10 และ 20: สลับหน้า 20 ครั้งติดกัน (รวมหน้าทำข้อสอบที่ปิดเอฟเฟกต์) → ต้องยังมี canvas เดียว
  python3 test/e2e/lk_soak_e2e.py [โฟลเดอร์ผล] [วิดท์] [สูง]
"""
import asyncio, json, os, random, sys, time
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1920
H = int(sys.argv[3]) if len(sys.argv) > 3 else 1080
MIN = int(os.environ.get('SOAK_MIN', '30'))
SCREEN = os.environ.get('SOAK_SCREEN', 'festival')
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--enable-precise-memory-info'])
    ctx = await b.new_context(viewport={'width': W, 'height': H}, service_workers='block'); pg = await ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL, timeout=90000)
    r = await pg.evaluate(REG, 'sk%d' % random.randint(1000000, 9999999))
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", r['token']); await pg.reload(); await pg.wait_for_timeout(2500)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(4000)
    await pg.evaluate(f"()=>EQApp.navigateTo('{SCREEN}')"); await pg.wait_for_timeout(3000)
    cdp = await ctx.new_cdp_session(pg); await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable')
    async def sample(i):
      await cdp.send('HeapProfiler.collectGarbage')
      m = {x['name']: x['value'] for x in (await cdp.send('Performance.getMetrics'))['metrics']}
      st = await pg.evaluate("()=>EQLanternFx.stats()")
      return {'min': i, 't': round(time.time()), 'heapMB': round(m['JSHeapUsedSize'] / 1048576, 2), 'nodes': int(m['Nodes']), 'listeners': int(m['JSEventListeners']),
              'frames': st['frames'], 'spawned': st['spawned'], 'lanterns': st['lanterns'], 'active': st['active'], 'running': st['running'], 'level': st['level'],
              'canvases': st['canvases'], 'quality': st['quality']}
    rows = [await sample(0)]; print(json.dumps(rows[-1]), flush=True)
    screens = ['learn', 'play', 'profile', 'home', 'leaderboard', 'tcas', 'event']
    for i in range(1, MIN + 1):
      if i in (10, 20):
        for k in range(20):
          await pg.evaluate(f"()=>EQApp.navigateTo('{screens[k % len(screens)]}')"); await pg.wait_for_timeout(350)
        await pg.evaluate(f"()=>EQApp.navigateTo('{SCREEN}')"); await pg.wait_for_timeout(2000)
        # ระหว่างนาทีจะสลับหน้าแล้วต้องกลับหน้าแรก
      await pg.wait_for_timeout(60000 - (22000 if i in (10, 20) else 0))
      rows.append(await sample(i)); print(json.dumps(rows[-1]), flush=True)
      if i % 10 == 0: await pg.screenshot(path=f'{OUT}/soak_{W}_{i:02d}min.png')
    json.dump(rows, open(f'{OUT}/soak_{W}.json', 'w'), indent=1)
    check(rows)
    ok(not errs, f'ไม่มี JS error {errs[:2]}')
    await b.close()
  print(f'\n{len(FAILS)} FAIL' if FAILS else '\nALL PASS', flush=True)
  sys.exit(1 if FAILS else 0)

def check(rows):
    # ---- ตรวจผล ----
    for a, c in zip(rows, rows[1:]):
      ok(c['frames'] - a['frames'] > 300, f"นาทีที่ {c['min']}: ยังเคลื่อนไหว (+{c['frames'] - a['frames']} เฟรม/นาที)")
    ok(all(r['lanterns'] >= 3 for r in rows[1:]), f"ทุกนาทีมีโคมบนจอ ≥ 3 ดวง ({[r['lanterns'] for r in rows]})")
    sp = [r['spawned'] for r in rows]
    ok(all(b2 > a2 for a2, b2 in zip(sp[::5], sp[5::5])), f'มีโคมเกิดใหม่ต่อเนื่องทุกช่วง 5 นาที ({sp[::5]})')
    ok(all(r['canvases'] == 1 for r in rows), 'มี canvas เอฟเฟกต์เพียง 1 อันตลอดเวลา (ไม่ซ้อนเมื่อสลับหน้า)')
    # นาทีที่ 10: เปิดหน้าอื่นครั้งแรก → แอปวาดเนื้อหาหน้านั้น (DOM/heap เพิ่มครั้งเดียว ไม่ใช่ของเอฟเฟกต์)
    # จึงวัด "การโตต่อเนื่อง" ช่วงหลังจากนั้น: นาที 11–15 เทียบ 26–30 (ผ่านการสลับหน้ารอบสองที่นาที 20 แล้ว)
    after = [r for r in rows if r['min'] >= 11]
    if len(after) >= 10:
      base = sorted(r['heapMB'] for r in after[:5])[2]; last = sorted(r['heapMB'] for r in after[-5:])[2]
      ok(last - base < 2, f'หน่วยความจำ JS หลัง GC ไม่โตต่อเนื่อง (มัธยฐานนาที 11–15 {base}MB → 5 นาทีสุดท้าย {last}MB)')
      nb = after[0]['nodes']; nl = rows[-1]['nodes']
      ok(nl - nb < 200, f'จำนวน DOM node ไม่สะสมแม้สลับหน้าซ้ำ ({nb} → {nl})')
      lb = after[0]['listeners']; ll = rows[-1]['listeners']
      ok(ll - lb < 50, f'จำนวน event listener ไม่สะสม ({lb} → {ll})')
    idle = [r for r in rows if 1 <= r['min'] <= 9]
    if len(idle) >= 5:
      ok(idle[-1]['heapMB'] - idle[0]['heapMB'] < 1 and idle[-1]['nodes'] == idle[0]['nodes'], f"ช่วงเปิดค้างเฉย ๆ (นาที 1–9): heap {idle[0]['heapMB']}→{idle[-1]['heapMB']}MB · DOM {idle[0]['nodes']}→{idle[-1]['nodes']}")

if os.environ.get('SOAK_ANALYZE'):   # ตรวจผลจากไฟล์ที่บันทึกไว้
  check(json.load(open(os.environ['SOAK_ANALYZE'])))
  print(f'\n{len(FAILS)} FAIL' if FAILS else '\nALL PASS'); sys.exit(1 if FAILS else 0)
asyncio.run(main())
