"""
v1.27.1 แบนเนอร์คริสต์มาสบนหน้าแรก (เจ้าของขอ 25 พ.ย.)
  - API /lobby/events มีสไลด์ christmas-2026 ช่วงเวลาตรงกับ season_settings ของกิจกรรมคริสต์มาสจริง · ปุ่มไปหน้า christmas
  - หน้าแรกแสดงภาพ christmas-640/1280 · กดปุ่มแล้วไปหน้า Christmas Hub จริง
  - ผู้ดูแลปิดกิจกรรมคริสต์มาส → แบนเนอร์หาย · เปิดกลับ → กลับมา (คืนค่าเดิมเสมอ)
  - 390 · 820 · 1280 · 1920 · ไม่ล้นแนวนอน · ไม่มี JS error
"""
import asyncio, json, os, random, subprocess, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3101'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = os.environ.get('SHOT_DIR', '/tmp/claude-0/-home-claude/1fd0a58d-9884-5422-8c4c-1c77fce86b91/scratchpad')
FAILS = []
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
def user(prefix):
  n = '%s%d' % (prefix, random.randint(100000, 999999))
  st, r = call('POST', '/auth/register', body={'username': n, 'email': n + '@gmail.com', 'password': 'password123'})
  return n, r['token']
def xslide(tok):
  st, d = call('GET', '/lobby/events', tok)
  return next((e for e in (d or {}).get('events', []) if e['id'] == 'christmas-2026'), None)

async def main():
  nu, tok = user('xb')
  s = xslide(tok)
  ok(s is not None and s['status'] == 'ongoing', f"API มีสไลด์คริสต์มาส ({s and s['status']})")
  xs = sql("SELECT COALESCE(to_char(starts_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI'),'') FROM season_settings WHERE season_key='christmas'")
  exp_start = (xs + ':00.000Z') if xs else '2026-11-24T17:00:00.000Z'
  ok(s and s['startsAt'] == exp_start and s['cta']['nav'] == 'christmas' and s['banner']['art'] == 'christmas', f"ช่วงเวลา/ปุ่ม/ภาพตรงกับกิจกรรมจริง ({s and s['startsAt']} ↔ {exp_start})")
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w, h in ((390, 844), (820, 1180), (1280, 800), (1920, 1080)):
      tag = f'[{w}]'
      ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 600, has_touch=w < 600)
      pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
      await pg.add_init_script(f"localStorage.setItem('wq_token','{tok}');localStorage.setItem('eq_pwa',JSON.stringify({{snoozeUntil:Date.now()+9e8}}))")
      await pg.goto(URL); await pg.wait_for_timeout(4000)
      await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
      info = await pg.evaluate("""()=>{const sl=[...document.querySelectorAll('.evc-slide')].find(e=>(e.getAttribute('aria-label')||'').includes('คริสต์มาสมหัศจรรย์'));
        const imgs=[...document.querySelectorAll('img,source')].map(i=>i.currentSrc||i.src||i.srcset||'').filter(u=>/christmas-(640|1280)/.test(u));
        return {slide:!!sl, img:imgs.length, text:sl?sl.textContent.replace(/\\s+/g,' ').slice(0,120):''}}""")
      ok(info['slide'] and info['img'] > 0, f"{tag} หน้าแรกมีแบนเนอร์คริสต์มาส + ภาพ ({info['text'][:80]})")
      # เลื่อนไปสไลด์คริสต์มาสแล้วจับภาพ
      await pg.evaluate("""()=>{const sl=[...document.querySelectorAll('.evc-slide')].find(e=>(e.getAttribute('aria-label')||'').includes('คริสต์มาสมหัศจรรย์'));if(sl)sl.scrollIntoView({block:'center'})}""")
      await pg.wait_for_timeout(800); await pg.screenshot(path=f'{OUT}/xbanner_{w}.png')
      ov = await pg.evaluate("()=>document.documentElement.scrollWidth-innerWidth"); ok(ov <= 1, f'{tag} ไม่ล้นแนวนอน ({ov})')
      ok(not errs, f'{tag} ไม่มี JS error {errs[:2]}')
      await ctx.close()
    # กดปุ่มแล้วไปหน้าคริสต์มาส (390)
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block', is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    await pg.add_init_script(f"localStorage.setItem('wq_token','{tok}');localStorage.setItem('eq_pwa',JSON.stringify({{snoozeUntil:Date.now()+9e8}}))")
    await pg.goto(URL); await pg.wait_for_timeout(4000)
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
    clicked = await pg.evaluate("""()=>{const sl=[...document.querySelectorAll('.evc-slide')].find(e=>(e.getAttribute('aria-label')||'').includes('คริสต์มาสมหัศจรรย์'));
      const bt=sl&&sl.querySelector('[data-evc-cta]');if(!bt)return false;bt.click();return true}""")
    await pg.wait_for_timeout(2500)
    vis = await pg.evaluate("()=>{const s=document.getElementById('screen-christmas');return !!s&&!s.hidden&&getComputedStyle(s).display!=='none'&&s.offsetHeight>0}")
    ok(clicked and vis, f'กดปุ่มบนแบนเนอร์ → ไปหน้า Christmas Hub ({clicked} {vis})')
    await ctx.close(); await b.close()
  # ปิด/เปิดกิจกรรม → แบนเนอร์ตาม (คืนค่าเดิม)
  prev = sql("SELECT enabled FROM season_settings WHERE season_key='christmas'")
  if prev:
    sql("UPDATE season_settings SET enabled=false WHERE season_key='christmas'")
  else:
    sql("INSERT INTO season_settings (season_key, enabled) VALUES ('christmas', false)")
  try:
    await asyncio.sleep(31)   # cache ค่าตั้ง 30 วิ
    ok(xslide(tok) is None, 'ปิดกิจกรรมคริสต์มาส → แบนเนอร์ไม่แสดง')
  finally:
    if prev: sql(f"UPDATE season_settings SET enabled={prev} WHERE season_key='christmas'")
    else: sql("DELETE FROM season_settings WHERE season_key='christmas'")
  await asyncio.sleep(31)
  ok(xslide(tok) is not None, 'เปิดกลับ → แบนเนอร์กลับมา (คืนค่าเดิม)')
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
