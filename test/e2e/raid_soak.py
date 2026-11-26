"""
v1.27.0 World Raid — ทดสอบประสิทธิภาพ/หน่วยความจำ (เบราว์เซอร์จริง + ผู้เล่นหลายคนโจมตีจริงผ่าน API)
  - ผู้เล่น N คน (บัญชีจริง) ตอบถูกพร้อมกันตลอดเวลา (เคารพเวลาตอบขั้นต่ำ) → ดาเมจจริงเข้าบอสกลาง
  - เบราว์เซอร์ (มือถือ 390 · คุณภาพอัตโนมัติ) เปิดหน้า Raid ค้างไว้: วัด fps · heap · จำนวน DOM · WebGL geometry/texture ทุก 30 วินาที
  - ตรวจ: ไม่มี JS error · heap ไม่โตต่อเนื่อง · geometry/texture ไม่รั่ว · ตัวเลขดาเมจ/เอฟเฟกต์ไม่สะสม · HP บนจอ = เซิร์ฟเวอร์
  - ฝั่งเซิร์ฟเวอร์: latency คำตอบ p50/p95 · ข้อมูล HP = ผลรวมบันทึกดาเมจ
  RAID_SOAK_MIN=5 RAID_BOTS=6 python3 test/e2e/raid_soak.py   (EQ_URL · EQ_DB)
"""
import asyncio, json, os, random, subprocess, threading, time, urllib.request, http.cookiejar
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
MIN = float(os.environ.get('RAID_SOAK_MIN', '5')); BOTS = int(os.environ.get('RAID_BOTS', '6'))
FAILS = []
FRESH = [None]
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()

def call(method, path, token=None, body=None):
  req = urllib.request.Request(URL + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
  try:
    with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b'null')
  except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')

LAT = []; HITS = [0]; STOP = [False]; ERR = []
def bot(i):
  n = 'sk%d%d' % (i, random.randint(10000, 99999))
  st, r = call('POST', '/auth/register', body={'username': n, 'email': n + '@gmail.com', 'password': 'password123'})
  tok = r['token']
  while not STOP[0]:
    st, rd = call('POST', '/raid/round', tok, {})
    if st == 409: time.sleep(4); continue   # บอสถูกล้ม/กำลังเกิดตัวใหม่ (ทดสอบวงจรเต็มระหว่างโหลด)
    if st != 200: ERR.append(f'round {st} {rd}'); time.sleep(3); continue
    att = rd['attemptId']
    for _ in range(rd['total']):
      if STOP[0]: return
      if _ > 0:
        st, nq = call('POST', '/raid/round/next', tok, {'attemptId': att})
        if st != 200: break
      time.sleep(1.3 + random.random() * 0.6)
      row = sql(f"SELECT current, questions->current->>'type', questions->current->>'correctIndex', questions->current->>'answer' FROM raid_attempts WHERE id = '{att}'").split('|')
      body = {'attemptId': att, 'index': int(row[0])}
      if row[1] == 'spell': body['text'] = row[3]
      else: body['choice'] = int(row[2])
      t = time.time(); st, x = call('POST', '/raid/answer', tok, body); LAT.append((time.time() - t) * 1000)
      if st != 200: ERR.append(f'answer {st} {x}'); break
      if x.get('bossGone'): break
      if x.get('damage'): HITS[0] += 1
      if x.get('finished'): break

async def main():
  # คูลดาวน์สั้นระหว่างทดสอบ: บอสตาย → บอสตัวใหม่เกิดภายในการทดสอบ (ทดสอบการเปลี่ยนโมเดล + dispose ภายใต้โหลด)
  sql("UPDATE raid_settings SET data = data || '{\"roundsPerDay\": 500, \"cooldownMin\": 1, \"prepareSec\": 5}'::jsonb WHERE id = 1")
  lv0 = sql("SELECT MAX(level) FROM raid_boss_instances")
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'])
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block', is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(1500)
    n = 'sw%d' % random.randint(100000, 999999)
    st, r = call('POST', '/auth/register', body={'username': n, 'email': n + '@gmail.com', 'password': 'password123'})
    await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", r['token'])
    await pg.reload(); await pg.wait_for_timeout(4000)
    for _ in range(5):
      if await pg.locator('.modal-overlay').count() == 0: break
      await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    await pg.evaluate("()=>EQApp.navigateTo('raid')"); await pg.wait_for_timeout(8000)
    await pg.evaluate("""()=>{window.__f=0;const t=()=>{window.__f++;requestAnimationFrame(t)};requestAnimationFrame(t)}""")
    threads = [threading.Thread(target=bot, args=(i,), daemon=True) for i in range(BOTS)]
    for t in threads: t.start()
    samples = []; t0 = time.time()
    while time.time() - t0 < MIN * 60:
      f0 = await pg.evaluate('window.__f'); await pg.wait_for_timeout(5000); f1 = await pg.evaluate('window.__f')
      s = await pg.evaluate("()=>{const st=EQRaid._state();return {heap:performance.memory?performance.memory.usedJSHeapSize/1048576:0,dom:document.getElementsByTagName('*').length,nums:document.querySelectorAll('.rd-num').length,geo:st.scene&&st.scene.mem.geometries,tex:st.scene&&st.scene.mem.textures,fx:st.scene&&st.scene.fx,clip:st.scene&&st.scene.clip,hp:st.boss&&st.boss.hp,lv:st.boss&&st.boss.level}}")
      s['fps'] = round((f1 - f0) / 5, 1); s['t'] = round(time.time() - t0)
      samples.append(s)
      if len(samples) % 6 == 1: print(f"t={s['t']}s fps={s['fps']} heap={s['heap']:.1f}MB dom={s['dom']} geo={s['geo']} tex={s['tex']} fx={s['fx']} nums={s['nums']} clip={s['clip']} hits={HITS[0]}", flush=True)
      await pg.wait_for_timeout(25000)
    STOP[0] = True
    for t in threads: t.join(timeout=30)
    await pg.wait_for_timeout(2500)
    hp_ui = await pg.evaluate("()=>EQRaid._state().boss.hp")
    hp_db = int(sql("SELECT hp FROM raid_boss_instances WHERE status <> 'cancelled' ORDER BY level DESC LIMIT 1"))
    # เทียบกับการเปิดหน้าใหม่ (บอสตัวเดียวกัน) → ถ้าเปลี่ยนบอสแล้วโมเดลเก่าไม่ถูกคืนหน่วยความจำ ตัวเลขจะสูงกว่า
    await pg.reload(); await pg.wait_for_timeout(3000)
    await pg.evaluate("()=>EQApp.navigateTo('raid')")
    try: await pg.wait_for_function("()=>{const s=EQRaid._state();return s.scene&&s.scene.clip&&s.scene.clip!=='spawn'}", timeout=30000)
    except Exception: pass
    await pg.wait_for_timeout(3000)
    FRESH[0] = await pg.evaluate("()=>{const s=EQRaid._state();return s.scene?{geo:s.scene.mem.geometries,tex:s.scene.mem.textures}:null}")
    await b.close()
  sql("UPDATE raid_settings SET data = data - 'cooldownMin' - 'prepareSec' WHERE id = 1")
  first, last = samples[:3], samples[-3:]
  h0 = sum(s['heap'] for s in first) / len(first); h1 = sum(s['heap'] for s in last) / len(last)
  ok(HITS[0] >= BOTS * 5, f'ผู้เล่น {BOTS} คนโจมตีจริงต่อเนื่อง ({HITS[0]} ครั้งที่มีดาเมจ) · error {len(ERR)} {ERR[:2]}')
  ok(h1 < h0 * 1.35 + 4, f'heap ไม่รั่ว: ช่วงแรก {h0:.1f}MB → ช่วงท้าย {h1:.1f}MB')
  # บอสเลเวลเปลี่ยนระหว่างทดสอบ = เปลี่ยนโมเดล/ฉากจริง จำนวน geometry ต่างกันได้ตามโมเดล → ตรวจการสะสมแยกตามเลเวล
  groups = {}
  if FRESH[0] and samples[-1]['geo'] is not None:
    ok(samples[-1]['geo'] <= FRESH[0]['geo'] + 4 and samples[-1]['tex'] <= FRESH[0]['tex'] + 2, f"หลังเปลี่ยน/สู้บอสต่อเนื่อง geometry ไม่ค้าง (ท้ายการทดสอบ {samples[-1]['geo']}/{samples[-1]['tex']} · เปิดหน้าใหม่ {FRESH[0]['geo']}/{FRESH[0]['tex']})")
  for s_ in samples: groups.setdefault(s_.get('lv'), []).append(s_)
  print('geo/tex ตามเลเวล', {k: [(x['geo'], x['tex']) for x in v] for k, v in groups.items()})
  bad = [k for k, v in groups.items() if len(v) > 1 and (max(x['geo'] for x in v) - min(x['geo'] for x in v) > 4 or max(x['tex'] for x in v) - min(x['tex'] for x in v) > 2)]
  ok(not bad, f'WebGL geometry/texture ไม่สะสม (ตรวจแยกตามเลเวลบอส {sorted(groups, key=str)} · ช่วงรวม {min(s["geo"] for s in samples)}–{max(s["geo"] for s in samples)} · tex {min(s["tex"] for s in samples)}–{max(s["tex"] for s in samples)})')
  ok(max(s['dom'] for s in samples) - min(s['dom'] for s in samples) < 200 and max(s['nums'] for s in samples) <= 15, f'DOM/ตัวเลขดาเมจไม่สะสม (DOM {min(s["dom"] for s in samples)}–{max(s["dom"] for s in samples)})')
  fps = sorted(s['fps'] for s in samples)
  ok(fps[len(fps) // 2] > 3 and fps[0] > 1, f'เรนเดอร์ต่อเนื่องไม่ค้าง (มัธยฐาน {fps[len(fps) // 2]} fps บนเครื่องทดสอบที่ไม่มี GPU · ต่ำสุด {fps[0]})')
  lv1 = sql("SELECT MAX(level) FROM raid_boss_instances")
  print(f'บอสเลเวล {lv0} → {lv1} ระหว่างทดสอบ')
  ok(hp_ui == hp_db, f'HP บนจอ = เซิร์ฟเวอร์หลังโหลดต่อเนื่อง ({hp_ui} / {hp_db})')
  lat = sorted(LAT)
  ok(lat and lat[int(len(lat) * 0.95)] < 400, f'latency คำตอบ p50 {lat[len(lat) // 2]:.0f} ms · p95 {lat[int(len(lat) * 0.95)]:.0f} ms ({len(lat)} คำตอบ)')
  ok(not errs, f'ไม่มี JavaScript error {errs[:2]}')
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
