"""
v1.26.3 หิมะตกในพื้นหลังแชทโลก + แชทย่อกลับเป็นแถบลอยเหนือเมนูล่าง (E2E เบราว์เซอร์จริง) ที่ 390 · 820 · 1280 · 1920
  เปิดแชท → มี canvas หิมะ 1 ชิ้น · พิกเซลเปลี่ยนจริง (เกล็ดตก) · ช่องพิมพ์ไม่ถูกบัง
  ปิดแชท → canvas ถูกลบ · เปิด/ปิด 10 ครั้งไม่สะสม · ปิดหิมะในตั้งค่า → ไม่มีหิมะในแชท
  python3 test/e2e/chat_snow_e2e.py [โฟลเดอร์ภาพ]  (EQ_URL)
"""
import asyncio, random, os, sys
from playwright.async_api import async_playwright
URL=os.environ.get('EQ_URL','http://localhost:3100'); OUT=sys.argv[1] if len(sys.argv)>1 else '/tmp/chatsnow'; os.makedirs(OUT,exist_ok=True)
FAILS=[]
def ok(c,m):
  print(('PASS ' if c else 'FAIL ')+m, flush=True)
  if not c: FAILS.append(m)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{credentials:'omit',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
async def run(b,w,h,extra=None):
  m=w<600; c=await b.new_context(viewport={'width':w,'height':h},service_workers='block',is_mobile=m,has_touch=m)
  await c.add_init_script(extra or "localStorage.setItem('eq_snow_power','full')")
  pg=await c.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(2000)
  r=await pg.evaluate(REG,'cs%d'%random.randint(100000,999999))
  await pg.evaluate("(t)=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_pwa',JSON.stringify({snoozeUntil:Date.now()+9e8}))}",r['token'])
  await pg.reload(); await pg.wait_for_timeout(5000)
  for _ in range(5):
    if await pg.locator('.modal-overlay').count()==0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
  await pg.locator('#gcm [data-gc-open]').first.click(); await pg.wait_for_timeout(2500)
  info=await pg.evaluate("()=>({info:EQChatSnow._info(),cv:document.querySelectorAll('.gcp-snow').length,hit:(()=>{const i=document.getElementById('gc-input');if(!i)return null;const r=i.getBoundingClientRect();return document.elementFromPoint(r.left+10,r.top+10)===i})()})")
  # ตรวจว่าเกล็ดขยับจริง (พิกเซลเปลี่ยน)
  mv=await pg.evaluate("async()=>{const c=document.querySelector('.gcp-snow');if(!c)return null;const g=c.getContext('2d');const a=g.getImageData(0,0,c.width,c.height).data;await new Promise(r=>setTimeout(r,500));const b=g.getImageData(0,0,c.width,c.height).data;let d=0,lit=0;for(let i=3;i<a.length;i+=4){if(a[i]!==b[i])d++;if(b[i]>0)lit++}return {changed:d,lit}}")
  await pg.screenshot(path=f'{OUT}/chatsnow_{w}{"_x" if extra else ""}.png')
  await pg.locator('[data-gcp-close]').click(); await pg.wait_for_timeout(600)
  left=await pg.evaluate("()=>document.querySelectorAll('.gcp-snow').length")
  tag=f'[{w}{" หิมะปิด" if extra else ""}]'
  if extra:
    ok(info['cv']==0, f'{tag} ปิดหิมะในตั้งค่า → แชทไม่มีหิมะ')
  else:
    ok(info['cv']==1 and info['info']['flakes']==24, f'{tag} เปิดแชท: มีหิมะ 1 ชั้น ({info["info"]})')
    ok(mv and mv['changed']>50 and mv['lit']>50, f'{tag} เกล็ดหิมะตกจริง (พิกเซลเปลี่ยน {mv})')
    if w < 1024:
      g=await pg.evaluate("()=>{const g=document.getElementById('gcm'),n=document.getElementById('bottom-nav').getBoundingClientRect();return [getComputedStyle(g).position,Math.round(g.getBoundingClientRect().bottom),Math.round(n.top)]}")
      ok(g[0]=='fixed' and g[1]<=g[2]+1, f'{tag} แชทย่อลอยอยู่เหนือเมนูล่าง {g}')
    for _ in range(10):
      await pg.locator('#gcm [data-gc-open]').first.click(); await pg.wait_for_timeout(350)
      await pg.locator('[data-gcp-close]').click(); await pg.wait_for_timeout(450)
    left=await pg.evaluate("()=>document.querySelectorAll('.gcp-snow').length")
    ok(left==0, f'{tag} เปิด/ปิดแชท 10 ครั้ง: ไม่มี canvas ค้าง ({left})')
  ok(info['hit'], f'{tag} ช่องพิมพ์ข้อความกดได้ ไม่ถูกหิมะบัง')
  ok(not errs, f'{tag} ไม่มี JS error {errs[:2]}')
  await c.close()
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for w,h in [(390,844),(820,1180),(1280,800),(1920,1080)]: await run(b,w,h)
    await run(b,390,844,"localStorage.setItem('eq_snow','off')")
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
