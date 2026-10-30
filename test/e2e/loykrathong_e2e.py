"""E2E: เทศกาลลอยกระทง 2569 (เบราว์เซอร์จริง · เซิร์ฟเวอร์ :3100 + DB eq_dev)
   ต้องเปิดเซิร์ฟเวอร์ด้วยช่วงกิจกรรมที่ครอบเวลาปัจจุบัน เช่น
     EVENT_LK_2026_START=<เมื่อวาน>T00:00:00+07:00 EVENT_LK_2026_END=<+8 วัน> (และให้ฮาโลวีนจบแล้ว: EVENT_HCF_2026_END=<อดีต>)
   ใช้: python3 test/e2e/loykrathong_e2e.py
   ขั้นตอน: แบนเนอร์หน้าแรก (สกินลอยกระทง) → หน้าเทศกาล (ฉากคืนเพ็ญ + ข้อความรักษ์น้ำ) → รับ Day 1 → Preview 3D ใส่ดอกลีลาวดี
   → สวมเลย → ปุ่มเควสต์ "อ่านเรื่อง" เปิดเรื่อง A2-07 → ตอบผ่าน → รับรางวัลพื้นหลัง → ฟังผ่าน → ปลดล็อกธีม → ใช้ธีมในโปรไฟล์
   → ทุกขนาดจอ (390 / 820 / 1280): ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, json, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
KEY = [q['answer'] for q in next(t for t in json.load(open('data/graded/texts.json'))['texts'] if t['id'] == 'A2-07')['questions']]
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
ONLY = sys.argv[2].split(',') if len(sys.argv) > 2 else None
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)

async def layout(pg, tag, sel='#screen-festival button, .hf-dialog button'):
    hs = await pg.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")
    check(hs <= 0, f'{tag}: ไม่มี scroll แนวนอน ({hs})')
    small = await pg.evaluate("""(sel)=>[...document.querySelectorAll(sel)].filter(b=>b.offsetParent&&!b.closest('.sheet-close')&&b.id!=='hf-back'&&b.getBoundingClientRect().height<44).map(b=>b.textContent.trim().slice(0,24))""", sel)
    check(not small, f'{tag}: ปุ่ม ≥ 44px ({small})')

async def shot(pg, name):
    if SHOTS: await pg.screenshot(path=f'{SHOTS}/{name}.png')

async def run(b, w, h, mobile):
    tag = f'{w}px'
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1 if w > 900 else 2, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await ctx.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI))")
    await pg.goto(URL); await pg.wait_for_timeout(600)
    name = 'lk%d' % random.randint(10000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2500)
    cls = await pg.evaluate("()=>{const b=document.getElementById('festival-banner');return b&&!b.classList.contains('hidden')?b.className:''}")
    check('hf-skin-lk' in cls, f'{tag}: หน้าแรกมีแบนเนอร์ลอยกระทง ({cls})')
    await shot(pg, f'home-{w}')
    await pg.click('#festival-banner'); await pg.wait_for_timeout(2500)
    info = await pg.evaluate("""()=>{const s=document.getElementById('screen-festival');const r=s.querySelector('.hf-skin-lk');return {open:!s.classList.contains('hidden'),skin:Boolean(r),moon:Boolean(s.querySelector('.lk-hero-art')),eco:(s.querySelector('.hf-eco')||{}).textContent||'',days:s.querySelectorAll('.hf-day').length,h1:(s.querySelector('.hf-hero h1')||{}).textContent||''}}""")
    check(info['open'] and info['skin'] and info['moon'], f'{tag}: หน้าเทศกาลใช้สกินลอยกระทง + ฉากคืนเพ็ญ')
    check(info['days'] == 7, f'{tag}: ปฏิทิน 7 วัน ({info["days"]})')
    check('โฟม' in info['eco'] or 'ใบตอง' in info['eco'], f'{tag}: ข้อความลอยกระทงรักษ์น้ำ')
    await shot(pg, f'festival-{w}')
    await layout(pg, f'{tag} หน้าเทศกาล')
    # รับ Day 1
    await pg.click('[data-hf-claim]'); await pg.wait_for_timeout(4500)
    check(await pg.locator('.hf-dialog.is-reward').count() == 1, f'{tag}: หน้าต่างรางวัล')
    sl = {}
    for _ in range(16):   # โมเดล 3D โหลดช้าบนจอใหญ่ (SwiftShader) → รอสูงสุด ~8 วิ
        sl = await pg.evaluate("()=>{const s=EQAvatar._stages().find(x=>x.box.closest('.hf-dialog'));return s&&s.v?s.v.slots():{}}")
        if sl.get('hat'): break
        await pg.wait_for_timeout(500)
    check(sl.get('hat') == 'hat_lk26_frangipani', f'{tag}: Preview 3D ใส่ดอกลีลาวดี ({sl.get("hat")})')
    await shot(pg, f'reward-{w}')
    await layout(pg, f'{tag} หน้าต่างรางวัล')
    await pg.click('[data-hf-equip]'); await pg.wait_for_timeout(1500)
    me = await pg.evaluate("async()=>EQApp.api('/avatar/me')")
    check(me['outfit'].get('hat') == 'hat_lk26_frangipani', f'{tag}: สวมเลย → ชุดใส่ดอกลีลาวดี')
    # เควสต์อ่าน: ปุ่มเปิดเรื่อง A2-07
    await pg.evaluate("()=>EQApp.navigateTo('festival')"); await pg.wait_for_timeout(2000)
    await pg.click('[data-hf-graded="A2-07"][data-mode="reading"]'); await pg.wait_for_timeout(2500)
    h = await pg.evaluate("()=>location.hash")
    title = await pg.evaluate("()=>{const s=document.getElementById('screen-graded');return s&&!s.classList.contains('hidden')?s.innerText.slice(0,400):''}")
    check(h.startswith('#/graded/A2-07') and 'Krathong' in title, f'{tag}: ปุ่มเควสต์เปิดเรื่อง "A Krathong for the River" ({h})')
    await shot(pg, f'graded-{w}')
    # ส่งคำตอบผ่านโหมดอ่าน/ฟัง (API เดียวกับหน้าเรื่อง) → รับรางวัล
    for mode in ('reading', 'listening'):
        r = await pg.evaluate("async([m,a])=>EQApp.api('/graded/A2-07/submit',{method:'POST',body:{mode:m,answers:a}})", [mode, KEY])
        check(r['passed'], f'{tag}: ส่งคำตอบ {mode} ผ่าน')
    await pg.evaluate("()=>EQApp.navigateTo('festival')"); await pg.wait_for_timeout(2500)
    for q in ('reading', 'listening'):
        btn = pg.locator(f'[data-hf-quest-claim="{q}"]')
        if await btn.count() == 0: btn = pg.locator(f'[data-hf-qclaim="{q}"]')
        check(await btn.count() == 1, f'{tag}: ปุ่มรับรางวัลเควสต์ {q}')
        if await btn.count(): await btn.click(); await pg.wait_for_timeout(2200)
        await pg.evaluate("()=>document.querySelectorAll('.hf-dialog [data-hf-close], .hf-dialog .sheet-close').forEach(b=>b.click())"); await pg.wait_for_timeout(400)
    inv = await pg.evaluate("async()=>(await EQApp.api('/avatar/me')).inventory.map(i=>i.itemId)")
    check('bg_lk26_river' in inv, f'{tag}: ได้พื้นหลังโปรไฟล์สายน้ำคืนเพ็ญ')
    th = await pg.evaluate("async()=>EQApp.api('/themes')")
    check(any(t['id'] == 'loykrathong-2026' and t['owned'] for t in th['premium']), f'{tag}: ปลดล็อกธีมลอยกระทง')
    # ใช้ธีมในโปรไฟล์
    await pg.evaluate("()=>EQApp.navigateTo('profile')"); await pg.wait_for_timeout(2000)
    if await pg.locator('#pf-tab-settings').is_visible(): await pg.click('#pf-tab-settings'); await pg.wait_for_timeout(600)   # จอใหญ่แสดงทุกแผงพร้อมกัน
    use = pg.locator('[data-theme-use="loykrathong-2026"]')
    check(await use.count() == 1, f'{tag}: ธีมลอยกระทงอยู่ในคลังธีมโปรไฟล์')
    if await use.count():
        await use.scroll_into_view_if_needed(); await use.click(); await pg.wait_for_timeout(1200)
    sk = await pg.evaluate("()=>[document.documentElement.dataset.theme,document.documentElement.dataset.skin,getComputedStyle(document.body).backgroundColor,getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()]")
    check(sk[0] == 'dark' and sk[1] == 'loykrathong' and sk[3].upper() == '#FFD27A', f'{tag}: ใช้ธีมแล้ว ({sk})')
    srv = await pg.evaluate("async()=>(await EQApp.api('/themes')).current")
    check(srv == 'loykrathong-2026', f'{tag}: บันทึกธีมที่เซิร์ฟเวอร์ ({srv})')
    await shot(pg, f'profile-theme-{w}')
    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(1500)
    await shot(pg, f'home-theme-{w}')
    await layout(pg, f'{tag} หน้าแรก (ธีมลอยกระทง)', '#screen-home button')
    # รีโหลด: ธีมยังอยู่ (pre-paint)
    await pg.reload(); await pg.wait_for_timeout(2000)
    sk2 = await pg.evaluate("()=>document.documentElement.dataset.skin")
    check(sk2 == 'loykrathong', f'{tag}: รีโหลดแล้วธีมยังอยู่')
    csp = await pg.evaluate("()=>window.__csp")
    check(not csp, f'{tag}: ไม่มีการละเมิด CSP (สคริปต์ตั้งธีมก่อนวาดหน้า) ({csp})')
    check(not errs, f'{tag}: ไม่มี JS error ({errs[:2]})')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for w, h, m in [v for v in ((390, 844, True), (820, 1180, True), (1280, 860, False)) if not ONLY or str(v[0]) in ONLY]:
            await run(b, w, h, m)
        await b.close()
    print('\nRESULT:', 'ALL PASS' if not fails else f'{len(fails)} FAIL')
    sys.exit(1 if fails else 0)

asyncio.run(main())
