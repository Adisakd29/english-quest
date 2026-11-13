"""
v1.18.3 ความยุติธรรมของ Ranked — E2E บนเบราว์เซอร์จริง 390 / 820 / 1280
  จำลองผู้โกงแบบ F12: สคริปต์ในหน้าเว็บตอบทันทีผ่าน API (เฉลยอ่านจากฐานข้อมูลทดสอบ = กรณีบอทที่รู้คำตอบ)
  ตรวจ: ระหว่างแข่งค้นคำศัพท์ไม่ได้ · หน้าผลแจ้งว่าไม่นับแต้ม · แต้ม/EXP ไม่เพิ่ม · แผงแอดมินแสดงส่วน "ความยุติธรรม"
  python3 test/e2e/ranked_integrity_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)
def sql(q): return subprocess.check_output(['psql', DB, '-tAc', q]).decode().strip()

BOT = """async ({id, keys, upto}) => {
  const tok = localStorage.getItem('wq_token');
  const h = {'Content-Type':'application/json', Authorization:'Bearer '+tok};
  const call = (p, b) => fetch('/api'+p, {method: b ? 'POST' : 'GET', headers: h, body: b ? JSON.stringify(b) : undefined}).then(r => r.json().then(j => ({s: r.status, j})));
  const search = await call('/vocab/search?q=a');
  let s = (await call('/ranked/matches/'+id)).j; const ms = [];
  while (s.status === 'active' && s.index < upto) {
    const t0 = performance.now();
    await call('/ranked/matches/'+id+'/answer', {questionIndex: s.index, choiceIndex: keys[s.index]});
    ms.push(Math.round(performance.now() - t0));
    s = (await call('/ranked/matches/'+id+'/next', {})).j;
  }
  return {searchStatus: search.s, index: s.index, ms};
}"""

async def run(b, w, h):
  tag = f'[{w}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL)
  name = 'ig%d' % random.randint(100000, 999999)
  tok = (await pg.evaluate(REG, name))['token']
  uid = int(sql(f"SELECT id FROM users WHERE username = '{name}'"))
  sql(f"UPDATE users SET role = 'admin' WHERE id = {uid}")
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>Promise.all([EQApp.api('/changelog/seen',{method:'POST',body:{}}),EQApp.api('/ranked/tutorial-done',{method:'POST',body:{}})]).catch(()=>{})")
  exp0 = int(sql(f"SELECT exp FROM users WHERE id = {uid}"))
  await pg.goto(URL + '/#/ranked'); await pg.wait_for_timeout(2500)
  await pg.locator('[data-rk="ranked"]').first.click()
  await pg.wait_for_selector('.rk-choice', timeout=20000)
  mid = int(sql(f"SELECT id FROM ranked_matches WHERE user_id = {uid} ORDER BY id DESC LIMIT 1"))
  keys = [q['correctIndex'] for q in json.loads(sql(f"SELECT questions FROM ranked_matches WHERE id = {mid}"))]
  r = await pg.evaluate(BOT, {'id': mid, 'keys': keys, 'upto': len(keys) - 1})
  ok(r['searchStatus'] == 423, f'{tag} ระหว่างแข่งค้นคำศัพท์ในแอปไม่ได้ (HTTP {r["searchStatus"]})')
  ok(r['index'] == len(keys) - 1, f'{tag} สคริปต์ F12 ตอบ {len(r["ms"])} ข้อ ({min(r["ms"])}–{max(r["ms"])} ms ต่อคำขอ)')
  # กลับเข้าเกมผ่านหน้าเว็บ แล้วตอบข้อสุดท้าย
  await pg.reload(); await pg.wait_for_timeout(2500)
  await pg.locator('[data-rk="resume"], [data-rk="ranked"]').first.click()
  await pg.wait_for_selector('.rk-choice:not([disabled])', timeout=20000)
  await pg.locator(f'.rk-choice[data-i="{keys[-1]}"]').click()
  await pg.wait_for_selector('#rk-next:not(.hidden)', timeout=10000); await pg.click('#rk-next')
  await pg.wait_for_selector('.rk-integrity-note', timeout=20000)
  note = await pg.locator('.rk-integrity-note').inner_text()
  ok('ไม่นับแต้มแรงค์' in note, f'{tag} หน้าผลแจ้งเหตุ: {note.strip()[:70]}…')
  delta = await pg.locator('.rk-qr-delta').inner_text()
  ok(int(sql(f"SELECT quest_rating FROM ranked_profiles WHERE user_id = {uid} AND mode = 'vocab'")) == 0, f'{tag} แต้มแรงค์ไม่เพิ่ม ({delta.strip()})')
  ok(int(sql(f"SELECT exp FROM users WHERE id = {uid}")) == exp0, f'{tag} EXP ไม่เพิ่ม')
  ok(sql(f"SELECT action FROM ranked_integrity_flags WHERE match_id = {mid}") == 'voided', f'{tag} บันทึกการตรวจพบ')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} หน้าผลไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/integrity_result_{w}.png')
  # แผงแอดมิน
  await pg.goto(URL + '/#/ranked'); await pg.reload(); await pg.wait_for_timeout(2500)
  await pg.locator('[data-rk="analytics"]:visible').first.click()
  await pg.wait_for_selector('#rk-an-integrity h3', timeout=20000)
  txt = await pg.locator('#rk-an-integrity').inner_text()
  ok('ความยุติธรรม' in txt and name in txt, f'{tag} แผงแอดมินแสดงแมตช์ที่ตรวจพบ (มี {name})')
  btn = pg.locator('#rk-an-reclaim')
  if await btn.count():
    before = await btn.inner_text(); await btn.click()
    ok('ยืนยัน' in await btn.inner_text(), f'{tag} ปุ่มริบแต้มต้องกดยืนยันครั้งที่ 2 ({before.strip()})')
  ok(await pg.evaluate("()=>{const c=document.querySelector('.rk-analytics');return c.scrollWidth<=c.clientWidth+1}"), f'{tag} แผงแอดมินไม่ล้นแนวนอน')
  await pg.locator('#rk-an-integrity').screenshot(path=f'{OUT}/integrity_admin_{w}.png')
  ok(not errs, f'{tag} ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def main():
  os.makedirs(OUT, exist_ok=True)
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w, h in [(390, 844), (820, 1180), (1280, 860)]: await run(b, w, h)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  for f in FAILS: print(' -', f)
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
