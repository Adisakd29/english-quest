"""Responsive + PWA — Avatar Editor · Shop · Public Profile · Privacy · Ranked Lobby ที่ 320–1920px (มือถือ/แท็บเล็ตแบบสัมผัส · เดสก์ท็อป)
   python3 test/e2e/avatar_responsive.py      (เซิร์ฟเวอร์ :3100 + DB eq_dev · บัญชีทดสอบใหม่ทุกครั้ง · Coin ทดสอบเติมใน DB ทดสอบเท่านั้น)
   ต่อขนาดจอ: ไม่มี scroll แนวนอน · ปุ่มแตะได้ ≥ 44px · Bottom Navigation ไม่บังปุ่มบันทึก/ซื้อ · Viewer เห็นเต็มและปุ่มควบคุมอยู่ในจอ
             · ลาก (นิ้ว/เมาส์) หมุนได้ · ปัดขึ้นลงบน Viewer ยังเลื่อนหน้าได้ (touch-action) · แตะการ์ดสินค้า = ลองสวม
   PWA: Service Worker ติดตั้ง → โมเดล 3D ถูกแคช → ออฟไลน์แล้วเปิดหน้า Avatar ยังแสดง 3D ได้"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
API = """async([t,m,p,b])=>{const r=await fetch('/api'+p,{method:m,headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:b?JSON.stringify(b):undefined});return {status:r.status,body:await r.json().catch(()=>null)}}"""
GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
OUT = os.environ.get('E2E_OUT', '/tmp/avatar_resp_')
# (กว้าง, สูง, dpr, สัมผัส, ธีม, ชื่อ)
SIZES = [(320, 640, 2, True, 'light', 'phone-320'), (360, 780, 3, True, 'dark', 'android-360'), (390, 844, 3, True, 'light', 'iphone-390'),
         (412, 915, 2.625, True, 'dark', 'android-412'), (768, 1024, 2, True, 'light', 'tablet-768'), (1024, 768, 2, True, 'dark', 'tablet-1024'),
         (1366, 768, 1, False, 'light', 'laptop-1366'), (1920, 1080, 1, False, 'dark', 'desktop-1920')]
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
async def wait_state(page, sel, ms=30000):
    for _ in range(ms // 200):
        s = await page.evaluate("(s)=>{const e=document.querySelector(s);return e&&e.dataset.a3State}", sel)
        if s in ('ready', 'fallback'): return s
        await page.wait_for_timeout(200)
async def go(page, path, wait=1500):
    await page.evaluate(f"()=>EQApp.navigateTo('{path}')"); await page.wait_for_timeout(wait)
async def layout(page, scope, tag):
    sw = await page.evaluate("()=>[document.documentElement.scrollWidth, innerWidth]")
    check(sw[0] <= sw[1] + 1, f'{tag}: ไม่มี scroll แนวนอน ({sw[0]}/{sw[1]})')
    small = await page.evaluate("""(s)=>[...document.querySelectorAll(s+' button:not([disabled]), '+s+' a[href], '+s+' select, '+s+' input[type=radio]+span, '+s+' [role=button]')]
        .filter(e=>e.offsetParent!==null && !e.closest('.eqav, .sr-only')).map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),(e.getAttribute('aria-label')||e.textContent).trim().slice(0,18)]})
        .filter(([w,h])=>h>0&&(h<44&&w<44))""", scope)
    check(not small, f'{tag}: เป้าแตะ ≥ 44px ({small[:3]})')
    # ปุ่มทุกปุ่ม: เลื่อนให้อยู่กลางจอแล้วจุดกึ่งกลางต้องเป็นปุ่มนั้นเอง (ไม่ถูก viewer ที่ติดจอ/แถบหมวด/เมนูล่างทับ)
    covered = await page.evaluate("""(s)=>{const out=[];const nav=document.getElementById('bottom-nav');
        for(const e of document.querySelectorAll(s+' button:not([disabled]), '+s+' a[href]')){ if(e.offsetParent===null||e.closest('.eqav')) continue;
          window.scrollTo(0,0); e.scrollIntoView({block:'center', inline:'nearest'});
          const sc=e.parentElement&&e.parentElement.scrollWidth>e.parentElement.clientWidth+1?e.parentElement:null;   // แถบแท็บที่เลื่อนแนวนอน: เลื่อนให้แท็บอยู่กลางแถบ (เหมือนผู้ใช้ปัดแถบ)
          if(sc) sc.scrollLeft=e.offsetLeft-sc.offsetLeft-(sc.clientWidth-e.offsetWidth)/2;
          const r=e.getBoundingClientRect(); if(!r.width||!r.height) continue;
          const t=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
          if(!t||!(e===t||e.contains(t))) out.push((e.getAttribute('aria-label')||e.textContent).trim().slice(0,20)+' <- '+(t?(t.className||t.tagName).toString().slice(0,24):'none')); }
        window.scrollTo(0,0); return out}""", scope)
    check(not covered, f'{tag}: ไม่มีปุ่มถูกทับ ({covered[:3]})')
async def not_covered(page, sel, tag):
    r = await page.evaluate("""(s)=>{const e=document.querySelector(s); const n=document.getElementById('bottom-nav'); if(!e) return 'missing'; if(!n||n.classList.contains('hidden')||getComputedStyle(n).display==='none') return 'ok';
        e.scrollIntoView({block:'center'}); const a=e.getBoundingClientRect(), b=n.getBoundingClientRect();
        const hit=a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1; return hit?'covered':'ok'}""", sel)
    check(r == 'ok', f'{tag}: Bottom Navigation ไม่บัง {sel} ({r})')
async def viewer_ok(page, box, tag, touch):
    info = await page.evaluate("""(s)=>{const b=document.querySelector(s); b.scrollIntoView({block:'start'}); const st=b.querySelector('.a3-stage').getBoundingClientRect();
        const tools=[...b.querySelectorAll('.a3-btn')].map(x=>x.getBoundingClientRect()); const vh=innerHeight;
        return {h:Math.round(st.height), w:Math.round(st.width), vh, toolsIn: tools.length===5 && tools.every(r=>r.bottom<=vh && r.top>=0 && r.width>=44 && r.height>=44),
          ta:getComputedStyle(b.querySelector('canvas')).touchAction}}""", box)
    check(info['toolsIn'], f'{tag}: ปุ่ม หมุน/ซูม/รีเซ็ต ครบ 5 ปุ่ม อยู่ในจอ ขนาด ≥ 44px')
    check(220 <= info['h'] <= max(0.75 * info['vh'], 300), f"{tag}: Viewer สูง {info['h']}px (จอ {info['vh']}px) ไม่ล้น/ไม่เล็กเกิน")
    check(info['ta'] == 'pan-y', f"{tag}: ปัดขึ้นลงบน Viewer เลื่อนหน้าได้ (touch-action {info['ta']})")
    y0 = await page.evaluate(f"()=>EQAvatar._stages().find(s=>s.box===document.querySelector('{box}')).v.view().yaw")
    c = await page.locator(f'{box} canvas').bounding_box()
    x, y = c['x'] + c['width'] / 2, c['y'] + c['height'] / 2
    if touch:
        await page.evaluate("""([s,x,y])=>{const c=document.querySelector(s+' canvas');const ev=(t,xx)=>c.dispatchEvent(new PointerEvent(t,{pointerId:3,pointerType:'touch',clientX:xx,clientY:y,bubbles:true,isPrimary:true}));
            ev('pointerdown',x);for(let i=1;i<=6;i++)ev('pointermove',x+20*i);ev('pointerup',x+120)}""", [box, x, y])
    else:
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 120, y, steps=6); await page.mouse.up()
    await page.wait_for_timeout(200)
    y1 = await page.evaluate(f"()=>EQAvatar._stages().find(s=>s.box===document.querySelector('{box}')).v.view().yaw")
    check(y1 > y0 + 0.3, f'{tag}: {"ปัดนิ้ว" if touch else "ลากเมาส์"}หมุนตัวละครได้ ({y0:.2f}→{y1:.2f})')

async def run_size(b, W, H, dpr, touch, theme, name, other_id):
    ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=dpr, has_touch=touch, is_mobile=touch and W < 700,
                              color_scheme=theme, service_workers='block')
    page = await ctx.new_page(); errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    await page.goto('http://localhost:3100'); await page.wait_for_timeout(800)
    n = 'rs%d' % random.randint(1000, 999999); tok = (await page.evaluate(REG, n))['token']
    uid = int(psql(f"SELECT id FROM users WHERE username = '{n}'"))
    await page.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await page.reload(); await page.wait_for_timeout(2200)
    await page.evaluate(API, [tok, 'GET', '/coins/wallet', None])
    psql(f"UPDATE coin_wallets SET balance = 5000 WHERE user_id = {uid}")   # test wallet (บัญชีทดสอบใน DB ทดสอบเท่านั้น)
    tag = f'{name} {W}px'
    await go(page, 'avatar', 800); await wait_state(page, '#av-stage'); await page.wait_for_timeout(500)
    await viewer_ok(page, '#av-stage', f'{tag} Editor', touch)
    await page.click('.av-cat[data-slot="hat"]'); await page.locator('#av-items [data-equip]').first.click(); await page.wait_for_timeout(300)
    await layout(page, '#screen-avatar', f'{tag} Editor'); await not_covered(page, '#av-save', f'{tag} Editor')
    await page.screenshot(path=OUT + f'{name}_editor.png')
    await go(page, 'shop', 1500); await wait_state(page, '#sh-stage')
    await page.click('[data-section="hats"]'); await page.wait_for_timeout(600)
    await page.locator('.sh-card [data-preview="hat_wizard"]').click()
    for _ in range(20):   # รอโหลด GLB สูงสุด 6 วินาที (เครื่องทดสอบช้าเมื่อมีงานอื่นรันพร้อมกัน)
        await page.wait_for_timeout(300)
        sl = await page.evaluate("()=>{const s=EQAvatar._stages().find(x=>x.box.id==='sh-stage');return s&&s.v?s.v.slots():{}}")
        if sl.get('hat') == 'hat_wizard': break
    check(sl.get('hat') == 'hat_wizard', f'{tag} Shop: แตะ "ลองสวม" แล้วหมวกอยู่บนตัวละคร')
    await viewer_ok(page, '#sh-stage', f'{tag} Shop', touch)
    await layout(page, '#screen-shop', f'{tag} Shop'); await not_covered(page, '#sh-try [data-buy]', f'{tag} Shop ปุ่มซื้อ')
    await page.screenshot(path=OUT + f'{name}_shop.png', full_page=False)
    await page.goto(f'http://localhost:3100/#/user/{other_id}'); await page.wait_for_timeout(2500)
    await layout(page, '#screen-user', f'{tag} Public Profile')
    await page.screenshot(path=OUT + f'{name}_profile.png')
    await go(page, 'privacy', 1500); await layout(page, '#screen-privacy', f'{tag} Privacy')
    await go(page, 'ranked', 3000)
    links = await page.locator('#rk-lobby-players [data-profile-uid]').count()
    check(links > 0, f'{tag} Ranked Lobby: รายชื่อผู้เล่นเปิดโปรไฟล์ได้ ({links} ลิงก์)')
    sw = await page.evaluate("()=>[document.documentElement.scrollWidth, innerWidth]")
    check(sw[0] <= sw[1] + 1, f'{tag} Ranked Lobby: ไม่มี scroll แนวนอน')
    check(not errs, f'{tag}: ไม่มี JS error {errs[:2]}')
    await ctx.close()

async def pwa(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, service_workers='allow')
    page = await ctx.new_page()
    await page.goto('http://localhost:3100'); await page.wait_for_timeout(800)
    tok = (await page.evaluate(REG, 'pw%d' % random.randint(1000, 999999)))['token']
    await page.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await page.reload()
    ok = await page.evaluate("async()=>{const r=await Promise.race([navigator.serviceWorker.ready.then(()=>true), new Promise(r=>setTimeout(()=>r(false),15000))]);return r}")
    check(ok, 'PWA: Service Worker ติดตั้งและพร้อม')
    m = await page.evaluate("async()=>{const l=document.querySelector('link[rel=manifest]');if(!l)return null;const r=await fetch(l.href);return r.ok?(await r.json()).display:null}")
    check(m in ('standalone', 'fullscreen', 'minimal-ui'), f'PWA: manifest display = {m}')
    await page.reload(); await page.wait_for_timeout(2500)   # หน้าเว็บอยู่ใต้ SW แล้ว
    await go(page, 'avatar', 800); check(await wait_state(page, '#av-stage') == 'ready', 'PWA: 3D โหลดผ่าน Service Worker')
    await page.wait_for_timeout(1500)
    n = await page.evaluate("async()=>{const c=await caches.open('eq-avatar3d');return (await c.keys()).map(r=>r.url.split('/').pop())}")
    check(any(x.startswith('CHR_Base_01') for x in n) and any('eq-three' in x for x in n), f'PWA: แคชโมเดล 3D + three.js แล้ว ({len(n)} ไฟล์)')
    # ออฟไลน์: เปิดแอปได้ (app shell จากแคช) · ห้ามออกจากระบบเอง · บอกสถานะ · กลับมาออนไลน์แล้วโหลดต่อเอง
    await ctx.set_offline(True)
    await page.reload(); await page.wait_for_timeout(3000)
    vis = await page.evaluate("()=>{const o=document.getElementById('boot-offline');return Boolean(o&&o.getBoundingClientRect().height>0)}")
    tok_kept = await page.evaluate("()=>Boolean(localStorage.getItem('wq_token'))")
    check(vis and tok_kept, 'PWA ออฟไลน์: แอปเปิดได้ แจ้งว่าออฟไลน์ และยังอยู่ในระบบ (ไม่ถูก logout)')
    sw_glb = []
    page.on('response', lambda r: sw_glb.append(r.from_service_worker) if '/assets/avatar3d/glb/' in r.url else None)
    await ctx.set_offline(False); await page.evaluate("()=>dispatchEvent(new Event('online'))"); await page.wait_for_timeout(3000)
    check(await page.evaluate("()=>!document.getElementById('boot-offline') && Boolean(EQApp.user)"), 'กลับมาออนไลน์: แอปโหลดต่อเองโดยไม่ต้อง login ใหม่')
    await go(page, 'avatar', 800)
    check(await wait_state(page, '#av-stage') == 'ready', 'หลังออนไลน์: 3D แสดงได้')
    check(sw_glb and all(sw_glb), f'PWA: GLB มาจากแคชของ Service Worker ({len(sw_glb)} ไฟล์)')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=GL)
        # ผู้ใช้อื่นที่เปิดโปรไฟล์ Public (ไว้เปิดดูจากทุกขนาดจอ)
        ctx = await b.new_context(); pg = await ctx.new_page(); await pg.goto('http://localhost:3100')
        on = 'ro%d' % random.randint(1000, 999999); ot = (await pg.evaluate(REG, on))['token']
        await pg.evaluate(API, [ot, 'PUT', '/privacy', {'profile': 'public', 'avatar': 'public', 'level': 'public', 'rank': 'public', 'achievements': 'public', 'stats': 'public'}])
        await pg.evaluate(API, [ot, 'PUT', '/avatar/display', {'useAvatar': True}])
        oid = int(psql(f"SELECT id FROM users WHERE username = '{on}'")); await ctx.close()
        only = sys.argv[1:]
        for s in SIZES:
            if only and s[5] not in only and str(s[0]) not in only: continue
            await run_size(b, *s, oid)
        if not only or 'pwa' in only: await pwa(b)
        await b.close()
    print(f'\n{"ALL PASS" if not fails else f"{len(fails)} FAIL"}')
    sys.exit(1 if fails else 0)
asyncio.run(main())
