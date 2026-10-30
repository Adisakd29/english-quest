"""E2E: Halloween Costume Festival 2026 (เบราว์เซอร์จริง · เซิร์ฟเวอร์ :3100 + DB eq_dev)
   ใช้: python3 test/e2e/festival_e2e.py
   ขั้นตอน (สเปกข้อ 20): ล็อกอินช่วงกิจกรรม → รับ Day 1 → หน้าต่างรางวัล + Preview 3D บนตัวละคร → สวมเลย
   → ตัวละคร 3D ใส่ Pumpkin Hat จริง (slot ใน viewer) → ตู้เสื้อผ้ามีของ → Logout/Login ของยังอยู่ + ยังสวมอยู่
   → รับซ้ำวันเดียวกันไม่ได้ (ปุ่มหาย + API 409) → เปิดด่านเควสต์จากหน้าเทศกาล (โจทย์ 10 ข้อ ไม่มีเฉลยในหน้าเว็บ)
   → ทุกขนาดจอ: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error
   (วันถัดไป / ขาดวัน / หลังจบกิจกรรม ทดสอบด้วยนาฬิกาเซิร์ฟเวอร์จำลองใน test/event-festival.test.js)"""
import asyncio, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
LOGIN = """async (n)=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:n,password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)

async def layout(pg, tag):
    hs = await pg.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")
    check(hs <= 0, f'{tag}: ไม่มี scroll แนวนอน ({hs})')
    small = await pg.evaluate("""()=>[...document.querySelectorAll('#screen-festival button, .hf-dialog button')].filter(b=>b.offsetParent&&!b.closest('.sheet-close')&&b.id!=='hf-back'&&b.getBoundingClientRect().height<44).map(b=>b.textContent.trim().slice(0,24))""")
    check(not small, f'{tag}: ปุ่ม ≥ 44px ({small})')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, service_workers='block')
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(600)
        name = 'fe%d' % random.randint(10000, 999999)
        tok = (await pg.evaluate(REG, name))['token']
        await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2500)
        # 1) ช่วงกิจกรรม: แบนเนอร์หน้าแรก
        vis = await pg.evaluate("()=>{const b=document.getElementById('festival-banner');return Boolean(b&&!b.classList.contains('hidden'))}")
        check(vis, 'หน้าแรกมีแบนเนอร์ Halloween Costume Festival')
        await pg.click('#festival-banner'); await pg.wait_for_timeout(2500)
        check(await pg.evaluate("()=>!document.getElementById('screen-festival').classList.contains('hidden')"), 'แตะแบนเนอร์ → หน้าเทศกาล')
        days = await pg.evaluate("()=>[...document.querySelectorAll('.hf-day')].length")
        check(days == 7, f'ปฏิทิน 7 วัน ({days})')
        await layout(pg, 'หน้าเทศกาล 390px')
        # 2) รับ Day 1
        await pg.click('[data-hf-claim]'); await pg.wait_for_timeout(4500)
        check(await pg.locator('.hf-dialog.is-reward').count() == 1, 'รับรางวัลแล้วมีหน้าต่างรางวัล (Reward Animation)')
        sl = await pg.evaluate("()=>{const s=EQAvatar._stages().find(x=>x.box.closest('.hf-dialog'));return s&&s.v?s.v.slots():{}}")
        check(sl.get('hat') == 'hat_hw26_pumpkin', f'Preview 3D บนตัวละครใส่ Pumpkin Hat ({sl.get("hat")})')
        await layout(pg, 'หน้าต่างรางวัล')
        # 3–5) สวมเลย
        await pg.click('[data-hf-equip]'); await pg.wait_for_timeout(1500)
        me = await pg.evaluate("async()=>EQApp.api('/avatar/me')")
        check(me['outfit']['hat'] == 'hat_hw26_pumpkin', 'สวมเลย → บันทึกชุดใส่ Pumpkin Hat')
        check(any(i['itemId'] == 'hat_hw26_pumpkin' and i['acquisition'] == 'event_login' for i in me['inventory']), 'ของเข้า Inventory (event_login)')
        st = await pg.evaluate("async()=>EQApp.api('/events/halloween-costume-2026')")
        check(st['login']['claimedDays'] == 1 and st['login']['claimedToday'], 'สถานะ: รับแล้ว 1/7 วัน · วันนี้รับแล้ว')
        check(await pg.locator('[data-hf-claim]').count() == 0, 'ปุ่มรับรางวัลหายหลังรับ (วันนี้)')
        again = await pg.evaluate("async()=>{try{await EQApp.api('/events/halloween-costume-2026/login-claim',{method:'POST'});return 'ok'}catch(e){return e.code||e.message}}")
        check(again == 'ALREADY_CLAIMED_TODAY', f'รับซ้ำวันเดียวกันไม่ได้ ({again})')
        # 6) ตัวละคร 3D (หน้าแต่งตัว) ใส่หมวกจริง
        await pg.evaluate("()=>EQApp.navigateTo('avatar')"); await pg.wait_for_timeout(3500)
        sl2 = await pg.evaluate("()=>{const s=EQAvatar._stages().find(x=>x.box.id==='av-stage');return s&&s.v?s.v.slots():{}}")
        check(sl2.get('hat') == 'hat_hw26_pumpkin', f'Avatar 3D ในหน้าแต่งตัวใส่ Pumpkin Hat ({sl2.get("hat")})')
        # 4) ตู้เสื้อผ้า
        await pg.evaluate("()=>EQApp.navigateTo('wardrobe')"); await pg.wait_for_timeout(2500)
        txt = await pg.evaluate("()=>document.getElementById('screen-wardrobe').innerText")
        check('หมวกฟักทองฮาโลวีน' in txt or 'Pumpkin Hat' in txt, 'ตู้เสื้อผ้าแสดงหมวกฟักทองฮาโลวีน')
        # 7–8) Logout / Login
        await pg.evaluate("()=>{localStorage.removeItem('wq_token')}"); await pg.reload(); await pg.wait_for_timeout(1200)
        tok2 = (await pg.evaluate(LOGIN, name))['token']
        await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok2); await pg.reload(); await pg.wait_for_timeout(2500)
        me2 = await pg.evaluate("async()=>EQApp.api('/avatar/me')")
        check(me2['outfit']['hat'] == 'hat_hw26_pumpkin' and any(i['itemId'] == 'hat_hw26_pumpkin' for i in me2['inventory']), 'Logout/Login แล้วของยังอยู่ + ยังสวมอยู่')
        # เควสต์: เปิดด่านจากหน้าเทศกาล
        await pg.evaluate("()=>EQApp.navigateTo('festival')"); await pg.wait_for_timeout(2500)
        await pg.click('[data-hf-stage="hv"]'); await pg.wait_for_timeout(2000)
        q = await pg.evaluate("()=>[...document.querySelectorAll('.ev-ch-dots span')].length")
        check(q == 10, f'ด่านเควสต์คำศัพท์เปิดได้ (10 ข้อ: {q})')
        leak = await pg.evaluate("()=>document.querySelector('.ev-play').innerHTML.includes('correctIndex')")
        check(not leak, 'หน้าด่านไม่มีเฉลย')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(800)
        # ทุกขนาดจอ
        for W, H in ((360, 780), (412, 915), (768, 1024), (1280, 900)):
            await pg.set_viewport_size({'width': W, 'height': H}); await pg.wait_for_timeout(500)
            await layout(pg, f'หน้าเทศกาล {W}px')
        check(not errs, f'ไม่มี JS error ({errs[:3]})')
        await b.close()
    print('\n' + ('ALL PASS' if not fails else f'{len(fails)} FAIL'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
