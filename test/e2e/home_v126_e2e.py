"""
v1.26.0 หน้าแรกแบบเกม — E2E (เบราว์เซอร์จริง) ที่ 390×844 · 820×1180 · 1280×800 · 1920×1080
  - Hero Scene: ภาพฉากหมู่บ้าน 3D โหลดจริง · มาสคอตจิ้งจอก · (ช่วงคริสต์มาส) ต้นสน/ของขวัญ/พวงมาลัย มองเห็น
  - QuestCard: ไอคอน · ชื่อ · คำอธิบาย · Progress · รางวัล EXP/Coin · สถานะ กำลังทำ → สำเร็จ (รับรางวัล) → รับแล้ว
  - กดรับรางวัล: EXP/Coin เพิ่มจริงจากเซิร์ฟเวอร์ · มีแอนิเมชัน (เหรียญลอย + ประกาย) · กดซ้ำไม่ได้
  - มือถือ: ลำดับ ฉาก Hero → เควสต์ (ไม่ใช่ย่อจากเดสก์ท็อป) · แชทย่อเป็นการ์ดในหน้า · ไม่ล้นแนวนอน
  - (ช่วงคริสต์มาส) แท็บ "คริสต์มาส" ในแผงเควสต์ · ปุ่มเพลงอยู่ในแถบบนบนมือถือ
  python3 test/e2e/home_v126_e2e.py [โฟลเดอร์ภาพ]   (EQ_URL · XMAS=1 เพื่อเปิดช่วงคริสต์มาสผ่าน season_settings)
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/home126'; os.makedirs(OUT, exist_ok=True)
XMAS = os.environ.get('XMAS') == '1'
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""

async def run(b, w, h):
  tag = f'[{w}{" xmas" if XMAS else ""}]'; mobile = w < 600
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=mobile, has_touch=mobile)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(2500)
  n = 'hv%d' % random.randint(100000, 999999); r = await pg.evaluate(REG, n)
  uid = int(sql(f"SELECT id FROM users WHERE username='{n}'"))
  sql(f"INSERT INTO answer_events (user_id, skill, item_id, level, correct) SELECT {uid}, 'grammar', 'hv'||g, 'A1', true FROM generate_series(1,6) g")
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", r['token'])
  await pg.reload(); await pg.wait_for_timeout(5500)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(3500)
  skin = await pg.evaluate("()=>document.documentElement.dataset.skin||null")
  hero = await pg.evaluate("""()=>{const s=document.querySelector('.hl-hero-scene');const cs=getComputedStyle(s);return {bg:cs.backgroundImage,disp:cs.display,
    fox:!!document.querySelector('.hl-hero-fox svg.mascot'),trees:[...document.querySelectorAll('.hl-hero-tree')].map(i=>i.complete&&i.naturalWidth>0&&getComputedStyle(i).display!=='none'),
    garland:getComputedStyle(document.querySelector('.hl-hero-garland')).display}}""")
  if skin in (None, 'christmas'):
    ok(hero['disp'] == 'block' and 'village.webp' in hero['bg'], f'{tag} Hero: ฉากหมู่บ้านหิมะ 3D (skin={skin})')
  ok(hero['fox'], f'{tag} Hero: มาสคอตจิ้งจอก')
  if skin == 'christmas':
    await pg.locator('.hl-hero-tree').first.scroll_into_view_if_needed(); await pg.wait_for_timeout(1500)
    hero['trees'] = await pg.evaluate("()=>[...document.querySelectorAll('.hl-hero-tree')].map(i=>i.complete&&i.naturalWidth>0&&getComputedStyle(i).display!=='none')")
    ok(all(hero['trees']) and hero['garland'] == 'block', f'{tag} Hero คริสต์มาส: ต้นสน 3D 2 ต้น + พวงมาลัย {hero["trees"]}')
  # ลำดับบนมือถือ: Hero ก่อนเควสต์
  if mobile:
    y = await pg.evaluate("()=>[document.querySelector('.hl-center').getBoundingClientRect().top, document.getElementById('hl-quests').getBoundingClientRect().top, document.querySelector('.hl-events-wrap').getBoundingClientRect().top]")
    # v1.27.1 ผู้ใช้ขอให้แบนเนอร์กิจกรรมกลับไปอยู่บนสุด (แบบสั้นลง) → กิจกรรม → Hero → เควสต์
    ok(y[2] < y[0] < y[1], f'{tag} มือถือ: แบนเนอร์กิจกรรม (บนสุด) → ฉาก Hero → เควสต์ {[round(v) for v in y]}')
    gc = await pg.evaluate("()=>{const g=document.getElementById('gcm'),n=document.getElementById('bottom-nav').getBoundingClientRect();return [getComputedStyle(g).position,g.getBoundingClientRect().bottom<=n.top+1]}")
    ok(gc == ['fixed', True], f'{tag} แชทโลกย่อลอยอยู่เหนือเมนูล่าง (v1.26.3 กลับเป็นแบบเดิม) {gc}')
  # QuestCard
  if XMAS and await pg.locator('[data-gq-tab="daily"]').count(): await pg.locator('[data-gq-tab="daily"]').click(); await pg.wait_for_timeout(300)
  q = await pg.evaluate("""()=>[...document.querySelectorAll('#hl-quests .gq')].map(c=>({k:c.dataset.gq,state:[...c.classList].find(x=>x.startsWith('is-')),
    title:c.querySelector('.gq-title').textContent,desc:!!c.querySelector('.gq-desc'),bar:!!c.querySelector('.gq-bar[role=progressbar]'),
    exp:!!c.querySelector('.gq-rw-exp'),coin:!!c.querySelector('.gq-rw-coin'),gem:!!c.querySelector('.gq-gem svg'),claim:!!c.querySelector('[data-gq-claim]')}))""")
  ok(len(q) == 3 and all(x['desc'] and x['bar'] and x['exp'] and x['coin'] and x['gem'] for x in q), f'{tag} QuestCard 3 ใบ: ไอคอน · คำอธิบาย · Progress · รางวัล EXP/Coin')
  g = next((x for x in q if x['k'] == 'dq:grammar'), {})
  ok(g.get('state') == 'is-ready' and g.get('claim'), f'{tag} เควสต์ Grammar ทำครบ → สถานะ "สำเร็จแล้ว" + ปุ่มรับรางวัล ({g.get("state")})')
  ok(next((x for x in q if x['k'] == 'dq:ranked'), {}).get('state') == 'is-progress', f'{tag} เควสต์ที่ยังไม่ครบ = "กำลังทำ" (กดรับไม่ได้)')
  await pg.locator('[data-gq-claim="dq:grammar"]').scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
  await pg.screenshot(path=f'{OUT}/quests_ready_{w}.png')
  exp0 = int(sql(f"SELECT exp FROM users WHERE id={uid}")); c0 = int(sql(f"SELECT COALESCE((SELECT balance FROM coin_wallets WHERE user_id={uid}),0)"))
  await pg.locator('[data-gq-claim="dq:grammar"]').click()
  await pg.wait_for_timeout(350)
  fly = await pg.evaluate("()=>document.querySelectorAll('.gq-fly').length")
  celebrate = await pg.evaluate("()=>!!document.querySelector('.gq.is-celebrate')")
  await pg.wait_for_timeout(2200)
  exp1 = int(sql(f"SELECT exp FROM users WHERE id={uid}")); c1 = int(sql(f"SELECT COALESCE((SELECT balance FROM coin_wallets WHERE user_id={uid}),0)"))
  ok(exp1 - exp0 == 15 and c1 - c0 in (5, 155), f'{tag} รับรางวัลจริง: EXP +{exp1 - exp0} · Coin +{c1 - c0} (รวม Coin ต้อนรับถ้าเพิ่งสร้างกระเป๋า)')
  ok(fly > 0 and celebrate, f'{tag} แอนิเมชันรับรางวัล (เหรียญ/EXP ลอย {fly} · ประกายบนการ์ด)')
  st = await pg.evaluate("()=>{const c=document.querySelector('[data-gq=\"dq:grammar\"]');return c&&[...c.classList].find(x=>x.startsWith('is-')&&x!=='is-celebrate')}")
  ok(st == 'is-claimed', f'{tag} หลังรับ: สถานะ "รับแล้ว" ({st})')
  r2 = await pg.evaluate("()=>EQApp.api('/lobby/quests/grammar/claim',{method:'POST'})")
  ok(r2.get('already') is True, f'{tag} กดซ้ำ (เรียก API ตรง) → ได้ครั้งเดียว')
  if XMAS:
    tabs = await pg.locator('[data-gq-tab="xmas"]').count()
    ok(tabs == 1, f'{tag} แท็บเควสต์คริสต์มาสในแผงเดียวกัน (ไม่มีเมนูซ้ำ)')
    if tabs:
      await pg.locator('[data-gq-tab="xmas"]').click(); await pg.wait_for_timeout(400)
      ok(await pg.locator('#hl-quests .gq').count() >= 1 and await pg.locator('#hl-quests .gq-rw-tok').count() >= 1, f'{tag} แท็บคริสต์มาส: เควสต์ + รางวัล Snowflake Token')
      await pg.screenshot(path=f'{OUT}/quests_xmas_{w}.png')
    if w < 1024:
      ok(await pg.evaluate("()=>!document.querySelector('#xm-player')"), f'{tag} v1.27.1 ไม่มีปุ่มเพลงคริสต์มาสในแถบบน/ลอยทับเนื้อหา (ย้ายไปเมนูลำโพง)')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} ไม่ล้นแนวนอน')
  await pg.evaluate("()=>window.scrollTo(0,0)"); await pg.wait_for_timeout(400)
  await pg.screenshot(path=f'{OUT}/home_{w}.png'); await pg.screenshot(path=f'{OUT}/home_full_{w}.png', full_page=True)
  ok(not errs, f'{tag} ไม่มี JavaScript error {errs[:2]}')
  await ctx.close()

async def main():
  if XMAS:
    sql("INSERT INTO season_settings (season_key, starts_at, ends_at, claim_until) VALUES ('christmas', NOW() - interval '1 day', '2027-01-01T00:00:00+07:00', '2027-01-08T00:00:00+07:00') ON CONFLICT (season_key) DO UPDATE SET starts_at = EXCLUDED.starts_at, enabled = TRUE, flags = '{}'::jsonb")
    await asyncio.sleep(31)
    import urllib.request
    try: urllib.request.urlopen(URL + '/api/season', timeout=5).read()
    except Exception: pass
    await asyncio.sleep(2)
  try:
    async with async_playwright() as p:
      b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
      for w, h in [(390, 844), (820, 1180), (1280, 800), (1920, 1080)]: await run(b, w, h)
      await b.close()
  finally:
    if XMAS: sql("DELETE FROM season_settings WHERE season_key='christmas'")
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
