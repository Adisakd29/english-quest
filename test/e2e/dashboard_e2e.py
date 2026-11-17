"""E2E: v1.11.0 ยกเลิกสมาชิก Premium — แดชบอร์ดการเรียน (ทุกคน) + ผู้ดูแลผู้ใช้ (เซิร์ฟเวอร์ :3100 + DB eq_dev)
   ใช้: python3 test/e2e/dashboard_e2e.py [โฟลเดอร์ภาพหน้าจอ] [390,820,1280]
   ขั้นตอน: โปรไฟล์ → "แดชบอร์ดการเรียน" (ครบทุกส่วนโดยไม่เป็นสมาชิก) → ลิงก์เก่า #/premium พามาที่แดชบอร์ด
   → ไม่มีคำว่า Premium/ทดลองใช้/แพ็กเกจ/สลิป ในหน้าแรก · โปรไฟล์ · เรียน · แดชบอร์ด · กระดานอันดับ
   → แผนฝึก TOEIC: ตัวช่วยรักษา Streak (ไม่มีคำว่า Premium) → ผู้ดูแล: ผู้ใช้ — บัญชีทดสอบ (ตั้ง/ยกเลิก) + ประวัติ
   → ทุกขนาดจอ: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error · ไม่ถูก CSP บล็อก"""
import asyncio, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
ONLY = sys.argv[2].split(',') if len(sys.argv) > 2 else None
BANNED = ['Premium', 'ทดลองใช้', 'แพ็กเกจ', 'สลิป', 'พร้อมเพย์', '฿39', '฿299']
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()

async def layout(pg, tag, where, scope):
    hs = await pg.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")
    check(hs <= 0, f'{tag} {where}: ไม่มี scroll แนวนอน ({hs})')
    small = await pg.evaluate("""(sc)=>[...document.querySelectorAll(sc+' button')].filter(b=>b.offsetParent&&b.getBoundingClientRect().height<44).map(b=>b.textContent.trim().slice(0,24)||b.className)""", scope)
    check(not small, f'{tag} {where}: ปุ่ม ≥ 44px ({small})')

async def text_of(pg, sel):
    return await pg.evaluate("(s)=>{const e=document.querySelector(s);return e?e.innerText:''}", sel)

async def run(b, w, h, mobile):
    tag = f'{w}px'
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1 if w > 900 else 2, has_touch=mobile, is_mobile=mobile, service_workers='block')
    await ctx.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI))")
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(500)
    name = 'db%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    uid = psql(f"SELECT id FROM users WHERE username = '{name}'")
    # ข้อมูลการเรียนจริงพอให้แดชบอร์ดมีคะแนน/คิวทบทวน
    psql(f"INSERT INTO answer_events (user_id, skill, item_id, level, correct) SELECT {uid}, 'vocab', 'e2e', 'A1', g % 4 <> 0 FROM generate_series(1, 24) g")
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2600)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    # หน้าแรก / เรียน / โปรไฟล์: ไม่มีคำว่า Premium
    for route, sel in (('home', '#screen-home'), ('learn', '#screen-learn'), ('profile', '#screen-profile')):
        await pg.evaluate(f"()=>EQApp.navigateTo('{route}')"); await pg.wait_for_timeout(1200)
        t = await text_of(pg, sel)
        bad = [x for x in BANNED if x in t]
        check(not bad, f'{tag}: หน้า {route} ไม่มีคำเกี่ยวกับสมาชิก ({bad})')
    # โปรไฟล์ → แดชบอร์ด
    link = pg.locator('#screen-profile [data-nav-to="dashboard"]')
    check(await link.count() == 1 and 'แดชบอร์ดการเรียน' in await link.inner_text(), f'{tag}: โปรไฟล์มีลิงก์ "แดชบอร์ดการเรียน"')
    await link.scroll_into_view_if_needed(); await link.click()
    await pg.wait_for_selector('#pm-title', timeout=20000); await pg.wait_for_timeout(600)
    d = await pg.evaluate("""()=>{const s=document.getElementById('screen-dashboard');return {hash:location.hash,open:!s.classList.contains('hidden'),title:s.querySelector('#pm-title').textContent,
      skills:s.querySelectorAll('.pmd-skill').length,tiles:s.querySelectorAll('.pmd-tile').length,week:s.querySelectorAll('.pmd-bars li').length,
      cefr:Boolean(s.querySelector('.pmd-cefr')),queue:Boolean(s.querySelector('.pmd-queue')),locked:s.querySelectorAll('.pmd-locked, .pm-plan, .pm-trial, .pmc-table').length,text:s.innerText}}""")
    check(d['open'] and d['hash'] == '#/dashboard' and d['title'] == 'แดชบอร์ดการเรียน', f'{tag}: เปิดแดชบอร์ด ({d["hash"]})')
    check(d['skills'] == 6 and d['tiles'] == 3 and d['week'] == 14 and d['cefr'] and d['queue'], f'{tag}: ครบทุกส่วนโดยไม่เป็นสมาชิก (ทักษะ {d["skills"]} · 14 วัน {d["week"]})')
    check(d['locked'] == 0 and not [x for x in BANNED if x in d['text']], f'{tag}: ไม่มีส่วนล็อก/แพ็กเกจ/ทดลองใช้')
    if SHOTS: await pg.screenshot(path=f'{SHOTS}/dashboard-{w}.png', full_page=True)
    await layout(pg, tag, 'แดชบอร์ด', '#screen-dashboard')
    # ลิงก์เก่า #/premium → แดชบอร์ด
    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(600)
    await pg.evaluate("()=>{location.hash='#/premium'}"); await pg.wait_for_timeout(1800)
    vis = await pg.evaluate("()=>[...document.querySelectorAll('.screen')].filter(s=>!s.classList.contains('hidden')).map(s=>s.id)")
    check('screen-dashboard' in vis and await pg.evaluate("()=>location.hash") == '#/dashboard', f'{tag}: ลิงก์เก่า #/premium → แดชบอร์ด ({vis})')
    # ปุ่ม "ภาษาอังกฤษเพื่อการทำงาน" จากแดชบอร์ด → ครบ 12 วลี
    await pg.click('#screen-dashboard [data-pm-nav="work"]'); await pg.wait_for_selector('#wk-title', timeout=15000)
    await pg.click('[data-wk-topic="emails"]'); await pg.wait_for_selector('#wk-ttitle', timeout=15000)
    check(await pg.locator('.wk-item').count() == 12 and await pg.locator('[data-wk-quiz]').count() >= 1, f'{tag}: ภาษาอังกฤษเพื่อการทำงาน ครบ 12 วลี + แบบฝึก')
    # แผนฝึก TOEIC: ตัวช่วยรักษา Streak ไม่มีคำว่า Premium
    st = await pg.evaluate("async()=>(await EQApp.api('/toeic/daily')).streak")
    check(st.get('freeze') and st['freeze']['perMonth'] == 2, f'{tag}: ตัวช่วยรักษา Streak ทุกคน ({st.get("freeze")})')
    # กระดานอันดับ: ไม่มีป้าย
    await pg.evaluate("()=>EQApp.navigateTo('leaderboard')"); await pg.wait_for_timeout(1800)
    check(await pg.locator('.pm-badge').count() == 0, f'{tag}: กระดานอันดับไม่มีป้าย Premium')
    # ผู้ดูแล (จอใหญ่)
    if w == 1280:
        psql(f"UPDATE users SET role = 'admin' WHERE id = {uid}")
        await pg.reload(); await pg.wait_for_timeout(2500)
        await pg.evaluate("()=>EQApp.navigateTo('admin')"); await pg.wait_for_timeout(2000)
        await pg.evaluate("()=>{const d=document.getElementById('admin-users');if(d)d.open=true}"); await pg.wait_for_timeout(300)
        await pg.evaluate("()=>EQDashboard.mountAdmin()"); await pg.wait_for_timeout(1500)
        summ = await text_of(pg, '#admin-users summary')
        check('บัญชีทดสอบ' in summ and 'สลิป' not in summ and 'Premium' not in summ, f'{tag}: ผู้ดูแล: ส่วน "ผู้ใช้ — บัญชีทดสอบ" ({summ.strip()})')
        await pg.fill('#admin-users-root [data-pma-q]', name); await pg.click('#admin-users-root .pma-search button'); await pg.wait_for_timeout(1500)
        btn = pg.locator(f'#admin-users-root [data-pma-test="{uid}"]')
        check(await btn.count() == 1 and await pg.locator('#admin-users-root [data-pma-grant], #admin-users-root [data-pma-approve]').count() == 0, f'{tag}: ผู้ดูแล: พบผู้ใช้ · ไม่มีปุ่มให้สิทธิ์/อนุมัติสลิป')
        await btn.click(); await pg.wait_for_timeout(1500)
        check(psql(f"SELECT is_test FROM users WHERE id = {uid}") == 't', f'{tag}: ผู้ดูแล: ตั้งเป็นบัญชีทดสอบได้')
        await pg.click('#admin-users-root [data-pma-tab="audit"]'); await pg.wait_for_timeout(1500)
        check('ตั้งเป็นบัญชีทดสอบ' in await text_of(pg, '#admin-users-root'), f'{tag}: ผู้ดูแล: ประวัติการกระทำ')
        if SHOTS: await pg.screenshot(path=f'{SHOTS}/admin-users-{w}.png', full_page=False)
        psql(f"UPDATE users SET role = 'user', is_test = FALSE WHERE id = {uid}")
    csp = await pg.evaluate("()=>window.__csp")
    check(not csp, f'{tag}: ไม่มีการละเมิด CSP ({csp[:2]})')
    check(not errs, f'{tag}: ไม่มี JS error ({errs[:2]})')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h, m in [v for v in ((390, 844, True), (820, 1180, True), (1280, 860, False)) if not ONLY or str(v[0]) in ONLY]:
            await run(b, w, h, m)
        await b.close()
    print('\nRESULT:', 'ALL PASS' if not fails else f'{len(fails)} FAIL')
    sys.exit(1 if fails else 0)

asyncio.run(main())
