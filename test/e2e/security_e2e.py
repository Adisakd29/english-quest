"""
v1.18.4 ความปลอดภัย — E2E บนเบราว์เซอร์จริง 390 / 820 / 1280
  - ผู้ดูแลระงับบัญชีจากหน้าผู้ดูแล (กดยืนยัน 2 ครั้ง) -> หน้าเว็บของผู้ถูกระงับออกจากระบบพร้อมแจ้งเหตุผล · เข้าสู่ระบบใหม่ไม่ได้
  - ยกเลิกการระงับ -> เข้าได้ · ประวัติการกระทำแสดง "ระงับบัญชีชั่วคราว"
  - ข้อความส่วนตัวที่มีไอดีโซเชียลถูกปฏิเสธ · World Chat ตัวเลขเต็มความกว้างถูกปฏิเสธ
  - ไม่ล้นแนวนอน · ไม่มี JS error
  python3 test/e2e/security_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
API = """async ([p, m, b]) => { const r = await fetch('/api' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('wq_token') }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; }"""
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)
def sql(q): return subprocess.check_output(['psql', DB, '-tAc', q]).decode().strip()

async def login_page(b, w, h, token):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.evaluate("t=>localStorage.setItem('wq_token',t)", token)
  await pg.reload(); await pg.wait_for_timeout(1500)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(); await pg.wait_for_timeout(2000)
  return ctx, pg, errs

async def run(b, w, h):
  tag = f'[{w}]'
  boot = await (await b.new_context()).new_page(); await boot.goto(URL)
  an = 'sa%d' % random.randint(100000, 999999); vn = 'sv%d' % random.randint(100000, 999999); fn = 'sf%d' % random.randint(100000, 999999)
  at = (await boot.evaluate(REG, an))['token']; vt = (await boot.evaluate(REG, vn))['token']; ft = (await boot.evaluate(REG, fn))['token']
  aid = int(sql(f"SELECT id FROM users WHERE username='{an}'")); vid = int(sql(f"SELECT id FROM users WHERE username='{vn}'")); fid = int(sql(f"SELECT id FROM users WHERE username='{fn}'"))
  sql(f"UPDATE users SET role='admin' WHERE id={aid}")
  sql(f"INSERT INTO friendships (requester_id, addressee_id, status) VALUES ({vid},{fid},'accepted')")
  await boot.context.close()

  vctx, vpg, verrs = await login_page(b, w, h, vt)
  # แชทส่วนตัว: ไอดีโซเชียลถูกปฏิเสธ · ข้อความปกติผ่าน
  r = await vpg.evaluate(API, [f'/chat/{fid}/messages', 'POST', {'body': 'สวัสดีครับ'}])
  ok(r['s'] == 200, f'{tag} DM ปกติส่งได้')
  r = await vpg.evaluate(API, [f'/chat/{fid}/messages', 'POST', {'body': 'แอด l i n e : kid_99 นะ'}])
  ok(r['s'] == 400 and r['j']['code'] == 'CONTACT_BLOCKED', f'{tag} DM ที่มีไอดีโซเชียลถูกปฏิเสธ')
  r = await vpg.evaluate(API, ['/world-chat', 'POST', {'text': '０８１２３４５６７８'}])
  ok(r['s'] >= 400, f'{tag} World Chat เบอร์โทรตัวเต็มความกว้างถูกปฏิเสธ ({r["s"]})')

  # ผู้ดูแลระงับบัญชีผ่านหน้าเว็บ
  actx, apg, aerrs = await login_page(b, w, h, at)
  await apg.evaluate("p=>EQApp.navigateTo(p)", 'admin'); await apg.wait_for_timeout(1500)
  await apg.locator('#admin-users summary').click(); await apg.wait_for_timeout(1200)
  await apg.fill('[data-pma-q]', vn); await apg.locator('[data-pma-search] button[type=submit]').click(); await apg.wait_for_timeout(1500)
  row = apg.locator(f'.pma-row[data-uid="{vid}"]')
  ok(await row.count() == 1, f'{tag} หน้าผู้ดูแลพบผู้ใช้')
  await row.locator('[data-pma-dur]').select_option('72')
  await row.locator('[data-pma-reason]').fill('สแปมแชท (ทดสอบ)')
  btn = row.locator('[data-pma-suspend]')
  await btn.click(); await apg.wait_for_timeout(200)
  ok('ยืนยัน' in await btn.inner_text(), f'{tag} ปุ่มระงับต้องกดยืนยันครั้งที่ 2')
  await btn.click(); await apg.wait_for_timeout(1500)
  ok(await apg.locator(f'.pma-row[data-uid="{vid}"] .pma-suspended').count() == 1, f'{tag} แสดงป้าย "ถูกระงับ"')
  ok(await apg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} หน้าผู้ดูแลไม่ล้นแนวนอน')
  await apg.locator(f'.pma-row[data-uid="{vid}"]').screenshot(path=f'{OUT}/suspend_row_{w}.png')

  # หน้าเว็บของผู้ถูกระงับ: เรียก API ครั้งถัดไป -> ออกจากระบบ + แจ้งเหตุผล
  await vpg.evaluate("()=>EQApp.navigateTo('profile')"); await vpg.wait_for_timeout(300)
  await vpg.evaluate("()=>EQApp.api('/auth/me').catch(()=>{})"); await vpg.wait_for_timeout(800)
  tok = await vpg.evaluate("()=>localStorage.getItem('wq_token')")
  ok(tok is None, f'{tag} ผู้ถูกระงับถูกออกจากระบบในหน้าเว็บ')
  toasts = await vpg.evaluate("()=>[...document.querySelectorAll('#toast-container .toast')].map(t=>t.textContent).join(' | ')")
  ok('ระงับ' in toasts and 'สแปมแชท' in toasts, f'{tag} แจ้งเหตุผลการระงับ: {toasts[:80]}')
  r = await vpg.evaluate("""async (n)=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:n,password:'password123'})});return {s:r.status,j:await r.json()}}""", vn)
  ok(r['s'] == 403 and r['j']['code'] == 'ACCOUNT_SUSPENDED', f'{tag} เข้าสู่ระบบใหม่ไม่ได้ระหว่างถูกระงับ')
  ok(sql(f"SELECT exp FROM users WHERE id={vid}") != '', f'{tag} ข้อมูลผู้ใช้ยังอยู่')

  # ยกเลิกการระงับ + ประวัติ
  await apg.locator(f'.pma-row[data-uid="{vid}"] [data-pma-unsuspend]').click(); await apg.wait_for_timeout(1500)
  r = await vpg.evaluate("""async (n)=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:n,password:'password123'})});return r.status}""", vn)
  ok(r == 200, f'{tag} ยกเลิกการระงับแล้วเข้าสู่ระบบได้')
  await apg.locator('[data-pma-tab="audit"]').click(); await apg.wait_for_timeout(1500)
  audit = await apg.locator('#admin-users-root').inner_text()
  ok('ระงับบัญชีชั่วคราว' in audit and 'ยกเลิกการระงับบัญชี' in audit, f'{tag} ประวัติการกระทำบันทึกการระงับ/ยกเลิก')
  ok(not verrs and not aerrs, f'{tag} ไม่มี JS error {(verrs + aerrs)[:2]}')
  await vctx.close(); await actx.close()

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
