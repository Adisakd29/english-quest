"""
v1.21.1 คนที่กด "ชวนในแชทโลก" (วาดทายศัพท์) ต้องเห็นคำเชิญของตัวเองในแชทโลกทันที โดยไม่ต้องออกแล้วเข้าใหม่ — 390 / 820 / 1280
(เดิมเซิร์ฟเวอร์ส่งข้อความให้ทุกคนยกเว้นผู้ส่ง และคำเชิญถูกส่งจากหน้าวาดทายศัพท์ แชทโลกของผู้ส่งจึงไม่ได้เพิ่มเอง)
"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
async def m():
  os.makedirs(OUT, exist_ok=True)
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for w in [390,820,1280]:
      ctx=await b.new_context(viewport={'width':w,'height':860},service_workers='block'); pg=await ctx.new_page()
      errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
      await pg.goto(os.environ.get('EQ_URL', 'http://localhost:3100')); n='iv%d'%random.randint(10000,99999); t=(await pg.evaluate(REG,n))['token']
      await pg.evaluate("t=>localStorage.setItem('wq_token',t)",t); await pg.reload(); await pg.wait_for_timeout(1200)
      await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})"); await pg.reload(timeout=90000)
      await pg.wait_for_function("()=>window.EQApp && EQApp.rtConnected", timeout=60000); await pg.wait_for_timeout(1500)
      await pg.evaluate("()=>EQApp.navigateTo('draw')"); await pg.wait_for_selector('#dg-create',timeout=15000)
      await pg.click('#dg-create button[type=submit]'); await pg.wait_for_selector('.dg-lobby',timeout=15000)
      code=await pg.evaluate("()=>EQDraw._state().R.code")
      await pg.click('[data-dg-invite-world]'); await pg.wait_for_timeout(2500)
      # ไม่รีโหลด: กลับหน้าแรก ดูแชทโลก (มินิ) แล้วเปิดเต็ม
      await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(1500)
      mini=await pg.evaluate("()=>{const m=document.getElementById('gcm');return m?m.innerText:''}")
      await pg.evaluate("()=>window.EQWorldChat && EQWorldChat.open && EQWorldChat.open()"); await pg.wait_for_timeout(1500)
      card=await pg.evaluate(f"()=>!!document.querySelector('[data-dg-inv=\"{code}\"]')")
      await pg.screenshot(path=f'{OUT}/invite_self_{w}.png')
      ok(code in mini, f'[{w}] แชทโลกย่อ (หน้าแรก) แสดงคำเชิญของตัวเองทันที')
      ok(card, f'[{w}] แชทโลกแบบเต็มมีการ์ดคำเชิญของตัวเอง (ไม่ต้องรีโหลด)')
      ok(not errs, f'[{w}] ไม่มี JS error {errs[:2]}')
      await ctx.close()
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  sys.exit(1 if FAILS else 0)
asyncio.run(m())
