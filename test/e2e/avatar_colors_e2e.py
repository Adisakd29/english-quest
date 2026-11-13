"""E2E: เปลี่ยนสีเครื่องแต่งกาย (หน้าแต่งตัว #/avatar) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/avatar_colors_e2e.py [outdir]
   ตรวจ: เปลี่ยนสีได้ · Preview ทันทีใน 3D · สีไม่เปลี่ยนส่วนที่ไม่เกี่ยวข้อง (ขอบริบ/เชือก/ตาไก่โลหะ) · เลือกเนื้อผ้า ·
         Save แล้วสีอยู่ · Reload แล้วชุดและสียังอยู่ · Preset เก็บสี · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่มสี ≥ 44px · ไม่มี JS error"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/avatar_colors_e2e'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

MATS = "()=>{const s=EQAvatar._stages().find(x=>x.v&&x.v._materials);return s?s.v._materials():[]}"

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(400)
    name = 'col%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    # สวมฮู้ดดี้ (ของเริ่มต้น) ผ่าน API เดิม แล้วเปิดหน้าแต่งตัว
    await pg.goto(URL + '/?c=%d#/avatar' % random.randint(1, 1000000))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    me = await pg.evaluate("()=>EQApp.api('/avatar/me')")
    outfit = dict(me['outfit']); outfit['top'] = 'top_hoodie_gray'
    await pg.evaluate("o=>EQApp.api('/avatar/outfit',{method:'PUT',body:{outfit:o}})", outfit)
    await pg.goto(URL + '/?c=%d#/avatar' % random.randint(1, 1000000))
    await pg.wait_for_selector('#av-cats .av-cat', timeout=60000)
    await pg.click('.av-cat[data-slot="top"]')
    await pg.wait_for_selector('#av-colors .av-colors-box', timeout=20000)
    check(True, f'{tag}: หมวดเสื้อ → แผงสีและเนื้อผ้า')
    await pg.wait_for_function(MATS.replace('return s?s.v._materials():[]', "return s&&s.v.isReady()&&s.v._materials().some(m=>m.name==='MAT_Hoodie')"), timeout=90000)
    before = {m['name']: m['color'] for m in await pg.evaluate(MATS)}
    # เปลี่ยนสีหลักเป็นแดง (#d94848) → Preview ทันที
    await pg.click('[data-col-role="primary"][data-col="#d94848"]')
    await pg.wait_for_timeout(300)
    after = {m['name']: m['color'] for m in await pg.evaluate(MATS)}
    check(after.get('MAT_Hoodie') == '#d94848', f'{tag}: Preview ทันที — ตัวเสื้อเป็นสีที่เลือก ({after.get("MAT_Hoodie")})')
    same = [n for n in before if n != 'MAT_Hoodie' and not n.startswith('MAT_Skin') and before[n] != after.get(n)]
    check(not same, f'{tag}: ส่วนอื่นไม่เปลี่ยนสีตาม (ขอบริบ/เชือก/ตาไก่โลหะ) {same}')
    check(any('Metal' in n for n in before), f'{tag}: มีชิ้นส่วนโลหะ (ตาไก่) ที่ต้องคงสีเดิม')
    # สีรอง (ขอบริบ) + เนื้อผ้า
    await pg.click('[data-col-role="secondary"][data-col="#23252d"]')
    await pg.click('.av-variants [data-variant="cotton"]')
    await pg.wait_for_timeout(300)
    mm = {m['name']: m for m in await pg.evaluate(MATS)}
    check(mm['MAT_Hoodie_Rib']['color'] == '#23252d', f'{tag}: เปลี่ยนสีรอง (ขอบริบ)')
    check(mm['MAT_Hoodie']['fabric'] == 'weave', f'{tag}: เปลี่ยนเนื้อผ้า → ลายผ้าฝ้าย ({mm["MAT_Hoodie"]["fabric"]})')
    check('ยังไม่ได้บันทึก' in await pg.evaluate("()=>document.querySelector('#av-dirty').innerText"), f'{tag}: แจ้งว่ายังไม่ได้บันทึก')
    await pg.locator('#av-colors').scroll_into_view_if_needed()
    await pg.screenshot(path=f'{OUT}/{tag}_colors.png')
    # ขนาดปุ่ม + scroll แนวนอน
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('#av-colors button, #av-colors .av-pick')].filter(x=>x.offsetParent&&(x.getBoundingClientRect().width<44||x.getBoundingClientRect().height<44)).length})""")
    check(lay['hs'] <= 0, f'{tag}: ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(lay['small'] == 0, f'{tag}: ปุ่มสี/เนื้อผ้า ≥ 44px ({lay["small"]} ปุ่มเล็กกว่า)')
    # Save
    await pg.click('#av-save'); await pg.wait_for_timeout(1500)
    me2 = await pg.evaluate("()=>EQApp.api('/avatar/me')")
    c = me2['colors'].get('top_hoodie_gray') or {}
    check(c.get('primary') == '#d94848' and c.get('secondary') == '#23252d' and c.get('variant') == 'cotton', f'{tag}: Save Outfit แล้วสีถูกบันทึก ({c})')
    # Preset ช่อง 1
    await pg.click('[data-preset-save="1"]'); await pg.click('.av-dialog button[type="submit"]'); await pg.wait_for_timeout(1200)
    pr = await pg.evaluate("()=>EQApp.api('/avatar/presets')")
    p1 = next((p for p in pr['presets'] if p['slot'] == 1), {})
    check((p1.get('colors') or {}).get('top_hoodie_gray', {}).get('primary') == '#d94848', f'{tag}: Outfit Preset เก็บสี')
    # Reload
    await pg.goto(URL + '/?c=%d#/avatar' % random.randint(1, 1000000))
    await pg.wait_for_function(MATS.replace('return s?s.v._materials():[]', "return s&&s.v.isReady()&&s.v._materials().some(m=>m.name==='MAT_Hoodie')"), timeout=90000)
    await pg.wait_for_timeout(400)
    mm = {m['name']: m for m in await pg.evaluate(MATS)}
    check(mm['MAT_Hoodie']['color'] == '#d94848' and mm['MAT_Hoodie_Rib']['color'] == '#23252d', f'{tag}: Reload แล้วชุดและสียังอยู่ ({mm["MAT_Hoodie"]["color"]})')
    await pg.screenshot(path=f'{OUT}/{tag}_reload.png')
    check(not errs, f'{tag}: ไม่มี JS error {errs[:2]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        await run(b, 1280, 860, False, 'desktop')
        await run(b, 390, 844, True, 'mobile')
        await b.close()
    print('ALL PASS' if not fails else f'{len(fails)} FAIL')
    sys.exit(1 if fails else 0)

asyncio.run(main())
