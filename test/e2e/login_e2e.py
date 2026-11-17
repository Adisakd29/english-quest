"""E2E หน้าเข้าสู่ระบบ: Parallax (desktop/tablet/mobile/reduced/slow) · ไม่บังฟอร์ม/ปุ่ม Google · Email login · Register · Forgot · คีย์บอร์ด · responsive"""
import asyncio, random, sys, json
from playwright.async_api import async_playwright
BASE = 'http://localhost:3100'
OUT = '/tmp/eq_e2e_'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
TR = "()=>[...document.querySelectorAll('#auth-bg .ab-layer')].map(l=>{const m=new DOMMatrix(getComputedStyle(l).transform);return [Number(l.dataset.depth),+m.m41.toFixed(2),+m.m42.toFixed(2)]})"
COVER = """()=>{const ids=['login-identifier','login-password','login-submit','tab-register','btn-forgot','google-btn'];
  return ids.map(id=>{const el=document.getElementById(id);el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();if(!r.width)return [id,'hidden'];
   const hit=document.elementFromPoint(r.left+r.width/2,r.top+Math.min(r.height/2,10));return [id, hit===el||el.contains(hit)?'ok':(hit?hit.className||hit.tagName:'none')]})}"""

VIEWS = [('m320', 320, 640, True), ('m375', 375, 812, True), ('m390', 390, 844, True), ('m430', 430, 932, True),
         ('land', 844, 390, True), ('t768', 768, 1024, True), ('t1024', 1024, 768, True),
         ('d1366', 1366, 768, False), ('d1440', 1440, 900, False), ('d1920', 1920, 1080, False)]

async def view(p, name, w, h, touch):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch and w < 900)
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.goto(BASE); await page.wait_for_timeout(1800)
    # เปิดส่วนปุ่ม Google (dev ไม่มี client id) เพื่อตรวจว่าไม่ถูกพื้นหลังบัง
    await page.evaluate("()=>{const g=document.getElementById('google-auth');g.classList.remove('hidden');const b=document.getElementById('google-btn');b.style.minHeight='44px';b.innerHTML='<iframe title=\"Sign in with Google\" style=\"width:240px;height:44px;border:0\"></iframe>'}")
    hs = await page.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")
    q = await page.evaluate("()=>EQAuthBg.quality")
    cov = await page.evaluate(COVER)
    check(hs <= 0, f'{name}: ไม่มี scroll แนวนอน ({hs})')
    check(all(c[1] in ('ok', 'hidden') for c in cov), f'{name}: ฟอร์ม/ปุ่ม Google คลิกได้ ไม่ถูกบัง {cov}')
    card = await page.evaluate("()=>{const r=document.querySelector('.auth-card').getBoundingClientRect();return [r.left,r.right,innerWidth]}")
    check(card[0] >= 0 and card[1] <= card[2] + 0.5, f'{name}: การ์ดอยู่ในจอ {card}')
    exp_q = 'full' if not touch else 'touch'
    check(q == exp_q, f'{name}: quality {q} (คาด {exp_q})')
    await page.screenshot(path=f'{OUT}{name}.png')
    if not touch:
        before = await page.evaluate(TR)
        for i in range(12):
            await page.mouse.move(w * (0.5 + i * 0.04), h * (0.5 + i * 0.035)); await page.wait_for_timeout(16)
        await page.mouse.move(w - 2, h - 2); await page.wait_for_timeout(1200)
        tr = await page.evaluate(TR)
        mx = {d: abs(x) for d, x, y in tr}
        check(2 <= mx[3] <= 4.1 and 3 <= mx[4] <= 4.1 and 5 <= mx[7] <= 8.1 and 10 <= mx[14] <= 16.1, f'{name}: ระยะแต่ละชั้น (ไกล 2–4 · กลาง 5–8 · ใกล้ 10–16) {tr}')
        # การ์ดนิ่ง
        cardT = await page.evaluate("()=>getComputedStyle(document.querySelector('.auth-wrap')).transform")
        check(cardT in ('none', 'matrix(1, 0, 0, 1, 0, 0)'), f'{name}: การ์ดไม่ขยับ/ไม่หมุน ({cardT})')
        await page.screenshot(path=f'{OUT}{name}_moved.png')
    else:
        a = await page.evaluate(TR); await page.wait_for_timeout(1500); bb = await page.evaluate(TR)
        still = all(x == 0 and y == 0 for _, x, y in a + bb)
        live = await page.evaluate("()=>document.getElementById('auth-bg').classList.contains('is-live')")
        anim = await page.evaluate("()=>[getComputedStyle(document.querySelector('.ab-f1')).animationName, getComputedStyle(document.querySelector('.ab-orb-1')).animationName]")
        check(still and not live and anim == ['none', 'ab-bob'], f'{name}: จอสัมผัส ไม่มีลูป JS/ชั้นนิ่ง · ลูกแก้วลอยด้วย CSS {anim}')
    check(not errs, f'{name}: ไม่มี JS error {errs[:2]}')
    await b.close()

async def flows(p):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1366, 'height': 800})
    page = await ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    await page.goto(BASE); await page.wait_for_timeout(1500)
    # คีย์บอร์ด: Tab ไม่ไปตกที่พื้นหลัง
    seq = []
    for _ in range(8):
        await page.keyboard.press('Tab')
        seq.append(await page.evaluate("()=>{const a=document.activeElement;return (a.id||a.className||a.tagName)+'|'+!!a.closest('#auth-bg')+'|'+(a.matches(':focus-visible')&&getComputedStyle(a).boxShadow!=='none'||getComputedStyle(a).outlineStyle!=='none')}"))
    check(all('|false|' in s for s in seq), f'Tab ไม่เข้าไปในพื้นหลัง {seq}')
    check(all(s.endswith('true') for s in seq if not s.startswith('BODY')), 'โฟกัสมองเห็นได้')
    bg = await page.evaluate("()=>{const b=document.getElementById('auth-bg');return [b.getAttribute('aria-hidden'), getComputedStyle(b).pointerEvents]}")
    check(bg == ['true', 'none'], f'พื้นหลัง aria-hidden + pointer-events:none {bg}')
    # Register ผ่านฟอร์ม
    name = 'lg%d' % random.randint(1000, 99999)
    await page.click('#tab-register')
    check(await page.inner_text('#auth-welcome-title') == 'Create your account', 'หัวการ์ดเปลี่ยนตามแท็บ')
    await page.fill('#reg-username', name); await page.fill('#reg-email', name + '@gmail.com'); await page.fill('#reg-password', 'password123')
    await page.click('#register-submit')
    # รอสถานะจริงแทนเวลาตายตัว (เครื่องช้า/โหลดหนัก หน้าอาจกำลังเปลี่ยนอยู่ — เดิมเคยอ่านได้ null)
    try: await page.wait_for_function("()=>{const a=document.getElementById('app-shell'),v=document.getElementById('auth-verify-panel');return a&&v&&(!a.classList.contains('hidden')||!v.classList.contains('hidden'))}", timeout=15000)
    except Exception: pass
    shell = await page.evaluate("()=>!document.getElementById('app-shell').classList.contains('hidden')")
    verify = await page.evaluate("()=>!document.getElementById('auth-verify-panel').classList.contains('hidden')")
    check(shell or verify, f'สมัครผ่านฟอร์มได้ (เข้าแอป={shell} / รอยืนยันอีเมล={verify})')
    if shell:
        check(await page.evaluate("()=>EQAuthBg.active") is False, 'เข้าแอปแล้วหยุดลูปพื้นหลัง')
        await page.evaluate("()=>{localStorage.removeItem('wq_token')}"); await page.reload(); await page.wait_for_selector('#btn-forgot', state='visible', timeout=15000)
    # Forgot password
    await page.click('#btn-forgot')
    check(await page.inner_text('#auth-welcome-title') == 'Forgot Password', 'แผงลืมรหัสผ่าน')
    await page.fill('#forgot-email', name + '@gmail.com'); await page.click('#forgot-submit')
    try: await page.wait_for_function("()=>!document.getElementById('forgot-success').classList.contains('hidden') || document.getElementById('forgot-error').textContent", timeout=10000)
    except Exception: pass
    ok = await page.evaluate("()=>!document.getElementById('forgot-success').classList.contains('hidden') || document.getElementById('forgot-error').textContent")
    check(bool(ok), f'ส่งคำขอรีเซ็ตรหัสผ่านได้ ({ok})')
    await page.click('#btn-back-login')
    # Email login ผ่านฟอร์ม
    await page.fill('#login-identifier', name); await page.fill('#login-password', 'password123')
    await page.keyboard.press('Enter')
    try: await page.wait_for_function("()=>{const a=document.getElementById('app-shell');return a&&!a.classList.contains('hidden')}", timeout=15000)
    except Exception: pass
    shell = await page.evaluate("()=>!document.getElementById('app-shell').classList.contains('hidden')")
    check(shell, 'Email/username login ผ่านฟอร์ม (Enter) เข้าแอปได้')
    check(not errs, f'flows: ไม่มี JS error {errs[:2]}')
    await b.close()

async def reduced_and_slow(p):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1366, 'height': 800}, reduced_motion='reduce')
    page = await ctx.new_page()
    await page.goto(BASE); await page.wait_for_timeout(1500)
    await page.mouse.move(1300, 760); await page.wait_for_timeout(600)
    tr = await page.evaluate(TR); q = await page.evaluate("()=>EQAuthBg.quality")
    anim = await page.evaluate("()=>getComputedStyle(document.querySelector('.ab-f1')).animationName")
    check(q == 'static' and all(x == 0 and y == 0 for _, x, y in tr) and anim == 'none', f'Reduced motion: ภาพนิ่ง {q} {tr} anim={anim}')
    await page.screenshot(path=f'{OUT}reduced.png')
    await b.close()
    # เครื่องช้า: CPU ช้าลง 4 เท่า แล้วขยับเมาส์ วัดเฟรม
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={'width': 1366, 'height': 800})
    page = await ctx.new_page()
    cdp = await ctx.new_cdp_session(page)
    await page.goto(BASE); await page.wait_for_timeout(1500)
    await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    await page.evaluate("()=>{window.__f=[];let l=performance.now();const t=(n)=>{window.__f.push(n-l);l=n;if(window.__f.length<150)requestAnimationFrame(t)};requestAnimationFrame(t)}")
    for i in range(60):
        await page.mouse.move(200 + i * 15, 150 + i * 8); await page.wait_for_timeout(16)
    await page.wait_for_timeout(800)
    f = await page.evaluate("()=>window.__f.slice(5)")
    f.sort(); med = f[len(f) // 2]; p95 = f[int(len(f) * 0.95)]
    check(med < 20, f'เครื่องช้า (CPU x4): เฟรมกลาง {med:.1f}ms · p95 {p95:.1f}ms')
    lay = await page.evaluate("()=>performance.getEntriesByType('layout-shift').reduce((a,e)=>a+e.value,0)")
    print('layout-shift', lay)
    await b.close()

async def main():
    async with async_playwright() as p:
        for v in VIEWS: await view(p, *v)
        await flows(p)
        await reduced_and_slow(p)
    print('FAILS', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
