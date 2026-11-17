"""
v1.18.2 รูปโปรไฟล์ที่ถ่ายด้วยโมเดลรุ่นเก่า → เปิดแอปแล้วถ่ายใหม่ด้วยโมเดลปัจจุบันอัตโนมัติ (E2E บนเบราว์เซอร์จริง)
  python3 test/e2e/stale_thumb_e2e.py [โฟลเดอร์ภาพ]   (ต้องมี psql ต่อ EQ_DB)
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
WEBP = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAADwAQCdASoCAAIAAUAmJaACdLoB+AAEyAAA/q4X/zYEDND6YP/SbPE2eJs+OYAA'
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m)
  if not c: FAILS.append(m)
def q(sql): return subprocess.check_output(['psql', DB, '-tAc', sql]).decode().strip()

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w, h in [(390, 844), (1280, 860)]:
      pg = await (await b.new_context(viewport={'width': w, 'height': h}, service_workers='block')).new_page()
      errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
      await pg.goto(URL)
      tok = (await pg.evaluate(REG, 'th%d' % random.randint(100000, 999999)))['token']
      api = "async ([t,m,p,b])=>{const r=await fetch('/api'+p,{method:m,headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:b?JSON.stringify(b):undefined});return r.json()}"
      me = await pg.evaluate(api, [tok, 'GET', '/avatar/me', None])
      uid = int((await pg.evaluate(api, [tok, 'GET', '/auth/me', None]))['user']['id'])
      await pg.evaluate(api, [tok, 'PUT', '/avatar/display', {'useAvatar': True}])
      await pg.evaluate(api, [tok, 'POST', '/avatar/thumbnail', {'image': WEBP, 'outfitHash': me['outfitHash']}])
      # จำลองรูปที่ถ่ายด้วยโมเดลรุ่นเก่า (ก่อน v1.18.2 เก็บแค่แฮชชุด)
      q(f"UPDATE user_avatar SET thumb_outfit_hash = '{me['outfitHash']}' WHERE user_id = {uid}")
      v0 = int(q(f"SELECT thumb_version FROM user_avatar WHERE user_id = {uid}"))
      await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload()
      for _ in range(40):
        await pg.wait_for_timeout(1000)
        if int(q(f"SELECT thumb_version FROM user_avatar WHERE user_id = {uid}")) > v0: break
      ver, hlen, size = q(f"SELECT thumb_version, length(thumb_outfit_hash), length(thumb) FROM user_avatar WHERE user_id = {uid}").split('|')
      ok(int(ver) > v0, f'[{w}] ถ่ายรูปโปรไฟล์ใหม่อัตโนมัติหลังเปิดแอป (version {v0} → {ver})')
      ok(int(hlen) == 16, f'[{w}] รูปใหม่ผูกกับรุ่นโมเดลปัจจุบัน')
      ok(int(size) > 3000, f'[{w}] เป็นภาพจริงจากโมเดล 3D ({size} ไบต์)')
      me2 = await pg.evaluate(api, [tok, 'GET', '/avatar/me', None])
      ok(me2['avatarThumbnailStale'] is False, f'[{w}] ไม่ค้างสถานะรูปเก่า')
      if int(ver) > v0:
        img = await pg.evaluate("async ([t,u])=>{const r=await fetch(u,{headers:{Authorization:'Bearer '+t}});const b=await r.blob();return await new Promise(res=>{const f=new FileReader();f.onload=()=>res(f.result);f.readAsDataURL(b)})}", [tok, me2['avatarThumbnail']])
        import base64; open(f'{OUT}/stale_thumb_{w}.png', 'wb').write(base64.b64decode(img.split(',')[1]))
      # รีเฟรชอีกครั้ง: ไม่ถ่ายซ้ำ
      await pg.reload(); await pg.wait_for_timeout(9000)
      ok(q(f"SELECT thumb_version FROM user_avatar WHERE user_id = {uid}") == ver, f'[{w}] รูปเป็นรุ่นปัจจุบันแล้ว ไม่ถ่ายซ้ำ')
      ok(not errs, f'[{w}] ไม่มี JS error {errs[:2]}')
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL'); sys.exit(1 if FAILS else 0)

if __name__ == '__main__':
  asyncio.run(main())
