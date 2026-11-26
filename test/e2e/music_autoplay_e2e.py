"""
v1.27.0 เพลงคริสต์มาสเล่นอัตโนมัติ (เจ้าของสั่ง 25 พ.ย. "ไม่ต้องกดเล่นก่อนถึงจะดัง") — ต้องอยู่ในช่วงคริสต์มาส (EQ_URL)
  - กดหยุดในเครื่องเล่น = หยุดเฉพาะครั้งนี้ (ค่าบัญชี/เครื่องไม่เป็น 'off') · รีเฟรชแท็บเดิม = ยังหยุด
  - เปิดแท็บใหม่/แอปใหม่ = เพลงคริสต์มาสกลับมาเล่นเอง
  - ค่า 'off' ที่บันทึกจากรุ่นก่อน ถูกล้างครั้งเดียว → เล่นอัตโนมัติ
  - หน้าแรก: แตะหน้าจอครั้งแรกที่ใดก็ได้ = เริ่มเสียง (ไม่ต้องกดปุ่มเล่น)
"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""

async def boot(ctx, token=None):
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(1500)
  if token: await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}", token); await pg.reload()
  await pg.wait_for_timeout(4500)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
  return pg, errs

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--autoplay-policy=user-gesture-required'])
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    pg0 = await ctx.new_page(); await pg0.goto(URL); await pg0.wait_for_timeout(1000)
    r = await pg0.evaluate(REG, 'mu%d' % random.randint(100000, 999999)); await pg0.close()
    pg, errs = await boot(ctx, r['token'])
    st = await pg.evaluate("()=>EQAudio._state()")
    ok(st['settings']['xmasMusic'] != 'off', 'ค่าเริ่มต้น: เพลงคริสต์มาสเปิด')
    await pg.tap('body', position={'x': 200, 'y': 420}); await pg.wait_for_timeout(1500)
    st = await pg.evaluate("()=>EQAudio._state()")
    ok(st['unlocked'] and st['current'] and st['current'].startswith('xmas'), f'แตะหน้าจอครั้งแรกที่ใดก็ได้ → เพลงคริสต์มาสเล่น ({st["current"]})')
    ok(await pg.locator('#xm-player').count() == 0, 'v1.27.1 มือถือ: ไม่มีปุ่มเพลงในแถบบน (เพลงยังเล่นอยู่)')
    await pg.locator('#hud [data-audio-menu]').click(); await pg.wait_for_timeout(400)   # ควบคุมเพลงคริสต์มาสในเมนูลำโพง
    await pg.locator('#xm-pl-menu [data-xp="toggle"]').click(); await pg.wait_for_timeout(1500)
    st = await pg.evaluate("()=>EQAudio._state()")
    ok(not (st['current'] or '').startswith('xmas') and st['settings']['xmasMusic'] != 'off', f'กดหยุด → หยุดเฉพาะครั้งนี้ (ค่าที่บันทึกยังไม่ใช่ off: {st["settings"]["xmasMusic"]})')
    await pg.reload(); await pg.wait_for_timeout(5000)
    ok(await pg.evaluate("()=>EQAudio._appMusicFor('screen-home')") is None, 'รีเฟรชแท็บเดิม → ยังหยุดอยู่ (ตามที่ผู้ใช้กด)')
    pg2, errs2 = await boot(ctx)
    ok((await pg2.evaluate("()=>EQAudio._appMusicFor('screen-home')") or '').startswith('xmas'), 'เปิดแท็บใหม่/แอปใหม่ → เพลงคริสต์มาสกลับมาเล่นเอง')
    # ค่า off จากรุ่นก่อน → ล้างครั้งเดียว
    ctx2 = await b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    await ctx2.add_init_script("try{if(!sessionStorage.getItem('__s')){sessionStorage.setItem('__s','1');localStorage.setItem('eq_audio',JSON.stringify({xmasMusic:'off',appMusic:true}));localStorage.removeItem('eq_xm_auto_v127')}}catch(e){}")
    pg3, errs3 = await boot(ctx2)
    ok(await pg3.evaluate("()=>EQAudio._state().settings.xmasMusic") == 'on', 'ค่า "ปิด" ที่บันทึกจากรุ่นก่อน ถูกล้างครั้งเดียว → เล่นอัตโนมัติ')
    ok(not (errs + errs2 + errs3), f'ไม่มี JS error {(errs + errs2 + errs3)[:2]}')
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
