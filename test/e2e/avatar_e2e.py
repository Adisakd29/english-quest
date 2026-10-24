"""E2E — 3D Avatar Viewer · Try-on · Shop · Public Profile · Privacy · รูปโปรไฟล์เดิม (v1.8.0)
   ใช้: python3 test/e2e/avatar_e2e.py [width] [light|dark] [dpr]   (เซิร์ฟเวอร์ :3100 + DB eq_dev)
   1 เปิด Editor → 2 3D โหลด → 3-4 ลากหมุนซ้าย/ขวา (เมาส์ หรือ touch pointer บนมือถือ) → 5-7 Zoom In/Out/Reset (+wheel, dblclick)
   → 8 ลองสวม → 9 ชุดเปลี่ยนทันที (slot ใน scene + ภาพเปลี่ยน) → 10-11 ยกเลิก = ชุดเดิม → 12 ซื้อ → 13 สวม → 14 บันทึก → 15-16 Logout/Login ชุดยังอยู่
   + ชิ้นที่ไม่มี 3D -> Preview 2D จริง · Coin ไม่พอ -> ปุ่มซื้อ disabled + ต้องการอีกกี่ Coin · เปลี่ยนชิ้นเร็ว ๆ ไม่มีชุดเก่าทับ
   + Public Profile จาก Leaderboard/เพื่อน · Privacy (Private / Friends / Public) · Block · รูปโปรไฟล์ของผู้ใช้อื่นไม่เปลี่ยน"""
import asyncio, base64, io, json, os, random, subprocess, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageChops, ImageStat
EQ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
LOGIN = """async (n)=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:n,password:'password123'})});return r.json()}"""
API = """async([t,m,p,b])=>{const r=await fetch('/api'+p,{method:m,headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:b?JSON.stringify(b):undefined});return {status:r.status,body:await r.json().catch(()=>null)}}"""
_b = io.BytesIO(); Image.new('RGB', (64, 64), (230, 80, 120)).save(_b, 'PNG')
PHOTO = 'data:image/png;base64,' + base64.b64encode(_b.getvalue()).decode()
OUT = os.environ.get('E2E_OUT', '/tmp/avatar_e2e_')
W = int(sys.argv[1]) if len(sys.argv) > 1 else 390
H = 844 if W < 700 else 900
THEME = sys.argv[2] if len(sys.argv) > 2 else 'light'
DPR = float(sys.argv[3]) if len(sys.argv) > 3 else (3 if W < 500 else 1)
MOBILE = W < 700
GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
async def overflow(page, tag):
    sw = await page.evaluate("()=>[document.documentElement.scrollWidth, innerWidth]")
    check(sw[0] <= sw[1] + 1, f'{tag}: ไม่มี scroll แนวนอน ({sw[0]} ≤ {sw[1]})')
async def small_targets(page, scope, tag):
    n = await page.evaluate("""(s)=>[...document.querySelectorAll(s+' button:not([disabled]), '+s+' select, '+s+' a')].filter(e=>e.offsetParent!==null)
        .map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height,e.textContent.trim().slice(0,20)]}).filter(([w,h])=>h<44&&w<44&&h>0)""", scope)
    check(not n, f'{tag}: ปุ่มแตะได้ ≥ 44px ({n[:3]})')
async def nav_not_covering(page, sel, tag):
    r = await page.evaluate("""(s)=>{const e=document.querySelector(s); const n=document.getElementById('bottom-nav'); if(!e||!n||n.classList.contains('hidden')) return 'na';
        e.scrollIntoView({block:'center'}); window.scrollBy(0, 0); const a=e.getBoundingClientRect(), b=n.getBoundingClientRect(); const hit=a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1; return hit?'covered:'+Math.round(a.bottom)+'>'+Math.round(b.top):'ok'}""", sel)
    check(r in ('ok', 'na'), f'{tag}: Bottom Navigation ไม่บัง ({r})')
async def go(page, path, wait=1500):
    await page.evaluate(f"()=>EQApp.navigateTo('{path}')"); await page.wait_for_timeout(wait)
async def api(page, token, method, path, body=None): return await page.evaluate(API, [token, method, path, body])
async def balance(uid): return int(psql(f"SELECT balance FROM coin_wallets WHERE user_id = {uid}"))
def photo_row(uid): return psql(f"SELECT md5(coalesce(avatar,'')||'|'||coalesce(avatar_image,'')) FROM users WHERE id = {uid}")
async def wait_state(page, sel, states=('ready', 'fallback'), ms=30000):
    for _ in range(ms // 200):
        s = await page.evaluate("(s)=>{const e=document.querySelector(s);return e&&e.dataset.a3State}", sel)
        if s in states: return s
        await page.wait_for_timeout(200)
    return None
async def shot(page, sel):
    return Image.open(io.BytesIO(await page.locator(sel).screenshot())).convert('RGB')
def diff(a, b):
    if a.size != b.size: b = b.resize(a.size)
    return ImageStat.Stat(ImageChops.difference(a, b).convert('L')).mean[0]
async def stage(page, i=0):
    return await page.evaluate(f"()=>{{const s=EQAvatar._stages().filter(x=>document.contains(x.box)&&x.box.offsetParent);const v=s[{i}]&&s[{i}].v;return v?{{view:v.view(),slots:v.slots(),stats:v.stats()}}:null}}")
async def drag(page, sel, dx):
    box = await page.locator(f'{sel} canvas').bounding_box()
    x0, y0 = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    if MOBILE:   # นิ้ว: Pointer Events แบบ touch (เหมือน iPhone/Android)
        await page.evaluate("""([s,x0,y0,dx])=>{const c=document.querySelector(s+' canvas');const ev=(t,x)=>c.dispatchEvent(new PointerEvent(t,{pointerId:7,pointerType:'touch',clientX:x,clientY:y0,bubbles:true,isPrimary:true}));
            ev('pointerdown',x0);for(let i=1;i<=8;i++)ev('pointermove',x0+dx*i/8);ev('pointerup',x0+dx)}""", [sel, x0, y0, dx])
    else:
        await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x0 + dx, y0, steps=8); await page.mouse.up()
    await page.wait_for_timeout(250)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=GL)
        errs = []; glb = []
        ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR, has_touch=MOBILE, color_scheme='dark' if THEME == 'dark' else 'light', service_workers='block')
        page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('request', lambda r: glb.append(r.url.split('/')[-1]) if '/assets/avatar3d/glb/' in r.url else None)
        await page.goto('http://localhost:3100'); await page.wait_for_timeout(1000)
        name = 'ave%d' % random.randint(1000, 999999)
        token = (await page.evaluate(REG, name))['token']
        await api(page, token, 'PATCH', '/auth/avatar-image', {'image': PHOTO})   # ผู้ใช้เดิมที่มีรูปโปรไฟล์
        await page.evaluate("t=>localStorage.setItem('wq_token',t)", token); await page.reload(); await page.wait_for_timeout(2500)
        uid = await page.evaluate("()=>EQApp.user.id")
        photo0 = photo_row(uid)
        check(await page.evaluate("(p)=>{const i=document.querySelector('#hud-avatar img.avatar-img');return Boolean(i&&i.getAttribute('src')===p)}", PHOTO), 'Login: รูปโปรไฟล์เดิมไม่เปลี่ยน')

        # ---------- 1-2 Editor + 3D ----------
        await go(page, 'avatar', 800)
        st = await wait_state(page, '#av-stage')
        check(st == 'ready', f'1-2 Editor: 3D โหลดสำเร็จ ({st})')
        await page.wait_for_timeout(800)
        s0 = await stage(page)
        stt = s0['stats']
        exp_pr = min(DPR, 2)
        check(abs(stt['pixelRatio'] - exp_pr) < 0.01 or stt['quality'] != 'full', f"ความคมชัด: pixelRatio {stt['pixelRatio']} (DPR {DPR}) · buffer {stt['buffer']} = CSS {stt['css']} × ratio")
        check(abs(stt['buffer'][0] - round(stt['css'][0] * stt['pixelRatio'])) <= 1, 'drawing buffer ตรงกับขนาดจอจริง (ไม่ขยายด้วย CSS)')
        img0 = await shot(page, '#av-stage .a3-stage')
        check(ImageStat.Stat(img0.convert('L')).stddev[0] > 10, '3D render ออกมาจริง (ภาพไม่ว่าง)')
        img0.save(OUT + f'{W}_editor.png')
        # ---------- 3-4 ลากหมุน ----------
        await drag(page, '#av-stage', -140)
        y1 = (await stage(page))['view']['yaw']
        check(y1 < s0['view']['yaw'] - 0.3, f"3 ลากหมุนซ้าย ({s0['view']['yaw']:.2f} → {y1:.2f})")
        await drag(page, '#av-stage', 280)
        y2 = (await stage(page))['view']['yaw']
        check(y2 > y1 + 0.6, f'4 ลากหมุนขวา ({y1:.2f} → {y2:.2f})')
        await page.wait_for_timeout(300)
        img_side = await shot(page, '#av-stage .a3-stage')
        check(diff(img0, img_side) > 2, f'หมุนแล้วภาพเปลี่ยน (มุมข้าง/หลัง) Δ={diff(img0, img_side):.1f}')
        img_side.save(OUT + f'{W}_editor_rot.png')
        # ---------- 5-7 Zoom / Reset ----------
        d0 = (await stage(page))['view']['dist']
        await page.click('#screen-avatar [data-a3="in"]'); d1 = (await stage(page))['view']['dist']
        check(d1 < d0, f'5 Zoom In ({d0:.2f} → {d1:.2f})')
        await page.click('#screen-avatar [data-a3="out"]'); await page.click('#screen-avatar [data-a3="out"]'); d2 = (await stage(page))['view']['dist']
        check(d2 > d1, f'6 Zoom Out ({d1:.2f} → {d2:.2f})')
        for _ in range(12): await page.click('#screen-avatar [data-a3="in"]')
        check((await stage(page))['view']['dist'] >= 1.45 - 1e-6, 'Zoom ถูกจำกัด (ไม่เข้าไปในโมเดล)')
        await page.click('#screen-avatar [data-a3="left"]'); await page.click('#screen-avatar [data-a3="right"]'); await page.click('#screen-avatar [data-a3="right"]')
        await page.click('#screen-avatar [data-a3="reset"]')
        v = (await stage(page))['view']
        check(abs(v['yaw'] - s0['view']['yaw']) < 1e-6 and abs(v['dist'] - s0['view']['dist']) < 1e-6, '7 Reset Camera กลับตำแหน่งเริ่มต้น')
        if not MOBILE:
            box = await page.locator('#av-stage canvas').bounding_box()
            await page.mouse.move(box['x'] + 50, box['y'] + 60); await page.mouse.wheel(0, -300); await page.wait_for_timeout(200)
            check((await stage(page))['view']['dist'] < v['dist'], 'Scroll บน Viewer = Zoom')
            await page.mouse.dblclick(box['x'] + 50, box['y'] + 60); await page.wait_for_timeout(200)
            check(abs((await stage(page))['view']['dist'] - v['dist']) < 1e-6, 'Double-click = Reset')
        else:
            ta = await page.evaluate("()=>getComputedStyle(document.querySelector('#av-stage canvas')).touchAction")
            check(ta == 'pan-y', f'มือถือ: ปัดขึ้นลงบน Viewer ยังเลื่อนหน้าได้ (touch-action {ta})')
        await overflow(page, 'editor'); await small_targets(page, '#screen-avatar', 'editor')
        await nav_not_covering(page, '#av-save', 'editor ปุ่มบันทึก')

        # ---------- Coin + เตรียมของ ----------
        bal0 = await balance(uid)
        # ---------- 8-11 Try-on (Shop) ----------
        glb.clear()
        await go(page, 'shop', 1500)
        await wait_state(page, '#sh-stage')
        await page.click('[data-section="hats"]'); await page.wait_for_timeout(700)
        before_slots = (await stage(page))['slots']
        imgA = await shot(page, '#sh-stage .a3-stage')
        check(not any(x.startswith('HAT_Cap_01') for x in glb), 'Lazy: ยังไม่โหลดโมเดลหมวกก่อนกดลองสวม')
        await page.click('[data-preview="hat_cap_red"]')
        await wait_state(page, '#sh-stage', states=('ready',)); await page.wait_for_timeout(600)
        sl = (await stage(page))['slots']
        check(sl.get('hat') == 'hat_cap_red', f'8-9 ลองสวม: หมวกอยู่บนตัวละครทันที (slots.hat={sl.get("hat")})')
        imgB = await shot(page, '#sh-stage .a3-stage')
        check(diff(imgA, imgB) > 1.0, f'9 ภาพตัวละครเปลี่ยนจริง Δ={diff(imgA, imgB):.1f}')
        imgB.save(OUT + f'{W}_tryon.png')
        check(psql(f"SELECT coalesce(hat_item_id,'') FROM user_avatar WHERE user_id = {uid}") == '', 'Preview ไม่บันทึกลง Equipped')
        await drag(page, '#sh-stage', 200)
        check(abs((await stage(page))['view']['yaw']) > 0.5, 'หมุนดูชุดที่ลองได้')
        # เปลี่ยนเร็ว ๆ (race): แว่นหัวใจ → แว่นกลม → แว่นกันแดด
        await page.click('[data-section="glasses"]'); await page.wait_for_timeout(600)
        for it in ('glasses_heart_shades', 'glasses_round', 'glasses_sunglasses'):
            await page.click(f'[data-preview="{it}"]')
        await page.wait_for_timeout(2500)
        sl = (await stage(page))['slots']
        check(sl.get('glasses') == 'glasses_sunglasses' and not sl.get('hat'), f'เลือกเร็ว ๆ: ชิ้นสุดท้ายชนะ ไม่มีชุดเก่าทับ ({sl.get("glasses")}, hat={sl.get("hat")})')
        await page.click('[data-cancel-preview]'); await page.wait_for_timeout(1200)
        sl = (await stage(page))['slots']
        check(not sl.get('glasses') and not sl.get('hat') and sl.get('top') == before_slots.get('top'), '10-11 ยกเลิก = กลับชุดที่สวมจริง')
        # Coin ไม่พอ
        await page.click('[data-section="back"]'); await page.wait_for_timeout(600)
        await page.click('[data-preview="back_jetpack"]'); await page.wait_for_timeout(800)
        txt = await page.inner_text('#sh-try')
        dis = await page.evaluate("()=>document.querySelector('#sh-try [data-buy]')?.disabled")
        check(dis is True and 'ต้องการอีก' in txt and str(1500 - bal0) in txt.replace(',', ''), f'Coin ไม่พอ: ปุ่มซื้อ disabled + บอกว่าต้องการอีก {1500 - bal0}')
        check('กำลังทดลอง' in txt and 'Coin ปัจจุบัน' in txt, 'แสดงราคา/Coin ปัจจุบัน ขณะทดลอง')
        await page.click('[data-cancel-preview]'); await page.wait_for_timeout(400)
        # ---------- ชิ้นที่ไม่มีแบบ 3D -> Preview 2D จริง ----------
        psql(f"UPDATE users SET role = 'admin' WHERE id = {uid}")
        png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        up = await api(page, token, 'POST', '/admin/avatar/upload', {'dataUrl': 'data:image/png;base64,' + png})
        iid = 'hat_e2e_%d' % random.randint(1000, 99999)
        await api(page, token, 'POST', '/admin/avatar', {'id': iid, 'slot': 'hat', 'name': 'E2E 2D Hat', 'price': 50, 'rarity': 'common', 'assetUrl': up['body']['url'], 'active': True})
        await page.evaluate("()=>EQAvatar.loadCatalog(true)")
        await go(page, 'shop', 1500); await wait_state(page, '#sh-stage')
        await page.click('[data-section="hats"]'); await page.wait_for_timeout(700)
        if await page.locator('[data-more]').count(): await page.click('[data-more]'); await page.wait_for_timeout(700)
        await page.click(f'[data-preview="{iid}"]'); await page.wait_for_timeout(900)
        note = await page.inner_text('#sh-3d-note')
        s2d = await page.evaluate(f"()=>{{const st=document.querySelector('#sh-stage');return [st.querySelector('canvas')?1:0, [...st.querySelectorAll('image')].some(i=>i.getAttribute('href').includes('/api/avatar/asset/'))]}}")
        check('2D เท่านั้น' in note and s2d[0] == 0 and s2d[1], f'ไม่มี 3D: แจ้ง "{note}" + เปิด Preview 2D ที่สวมชิ้นนั้นจริง')
        await page.click('[data-cancel-preview]'); await page.wait_for_timeout(1500)
        check(await page.locator('#sh-stage canvas').count() == 1, 'ยกเลิกแล้วกลับเป็น 3D')
        psql(f"DELETE FROM avatar_items WHERE id = '{iid}'"); psql(f"UPDATE users SET role = 'user' WHERE id = {uid}")
        # ---------- 12-14 Buy → Equip → Save ----------
        await go(page, 'shop', 1500); await wait_state(page, '#sh-stage')
        await page.click('[data-section="hats"]'); await page.wait_for_timeout(700)
        await page.click('.sh-card [data-buy="hat_cap_red"]'); await page.wait_for_timeout(400)
        await page.click('.sh-confirm [data-confirm]'); await page.wait_for_timeout(1200)
        check(await balance(uid) == bal0 - 90, '12 ซื้อ: หัก Coin ฝั่งเซิร์ฟเวอร์')
        await page.click('[data-equip-now]'); await page.wait_for_timeout(1500)
        check(psql(f"SELECT hat_item_id FROM user_avatar WHERE user_id = {uid}") == 'hat_cap_red', '13 สวม (Equip) + บันทึกชุด')
        await go(page, 'avatar', 800); await wait_state(page, '#av-stage', states=('ready',)); await page.wait_for_timeout(800)
        check((await stage(page))['slots'].get('hat') == 'hat_cap_red', 'Editor โหลดโมเดลที่สวมจริง')
        await page.click('.av-cat[data-slot="hair"]'); await page.locator('#av-items [data-equip][aria-pressed="false"]').first.click(); await page.wait_for_timeout(600)
        await page.click('#av-save'); await page.wait_for_timeout(3000)
        hair = psql(f"SELECT hair_item_id FROM user_avatar WHERE user_id = {uid}")
        check(photo_row(uid) == photo0, '14 Save: รูปโปรไฟล์ไม่เปลี่ยน')
        # ---------- 15-16 Logout/Login ----------
        await page.evaluate("()=>localStorage.removeItem('wq_token')"); await page.reload(); await page.wait_for_timeout(1000)
        r2 = await page.evaluate(LOGIN, name)
        await page.evaluate("t=>localStorage.setItem('wq_token',t)", r2['token']); await page.reload(); await page.wait_for_timeout(2200)
        await go(page, 'avatar', 800); await wait_state(page, '#av-stage', states=('ready',)); await page.wait_for_timeout(800)
        sl = (await stage(page))['slots']
        check(sl.get('hat') == 'hat_cap_red' and sl.get('hair') == hair, f'15-16 Login ใหม่: ชุดเดิมอยู่ครบ (hat, {hair})')

        # ---------- Reload (F5) -> ชุดยังอยู่ ----------
        await page.reload(); await page.wait_for_timeout(2200)
        await go(page, 'avatar', 800); await wait_state(page, '#av-stage', states=('ready',)); await page.wait_for_timeout(600)
        sl = (await stage(page))['slots']
        check(sl.get('hat') == 'hat_cap_red' and sl.get('hair') == hair, 'Reload หน้า: ชุดที่บันทึกยังอยู่')
        # ---------- Reset ชุด กับ Reset กล้อง แยกกัน ----------
        await page.click('.av-cat[data-slot="hair"]'); await page.locator('#av-items [data-equip][aria-pressed="false"]').first.click(force=True); await page.wait_for_timeout(1200)
        draft_hair = (await stage(page))['slots'].get('hair')
        await drag(page, '#av-stage', 160); yaw_r = (await stage(page))['view']['yaw']
        await page.click('#screen-avatar [data-a3="reset"]', force=True); await page.wait_for_timeout(300)
        st2 = await stage(page)
        check(st2['slots'].get('hair') == draft_hair and draft_hair != hair and abs(st2['view']['yaw'] - yaw_r) > 0.3, 'Reset กล้อง: มุมกลับที่เดิม แต่ชุดที่กำลังแต่งไม่เปลี่ยน')
        await drag(page, '#av-stage', 160); yaw_r = (await stage(page))['view']['yaw']
        await page.click('#av-reset', force=True); await page.wait_for_timeout(1500)
        st2 = await stage(page)
        check(st2['slots'].get('hair') == hair and abs(st2['view']['yaw'] - yaw_r) < 1e-6, 'Reset ชุด: กลับเป็นชุดที่บันทึกไว้ แต่มุมกล้องไม่เปลี่ยน')
        check(await page.get_attribute('#av-reset', 'aria-label') != await page.get_attribute('#screen-avatar [data-a3="reset"]', 'aria-label'), 'ปุ่ม Reset ชุด / Reset กล้อง มีชื่อต่างกันชัดเจน')
        # ---------- Preset 1–3: บันทึก + ภาพตัวอย่าง + คงอยู่หลัง reload ----------
        await page.click('[data-preset-save="2"]', force=True); await page.wait_for_selector('#av-preset-name')
        await page.fill('#av-preset-name', 'ชุดทดสอบ'); await page.click('.modal-card button[type="submit"]', force=True); await page.wait_for_timeout(2000)
        pic = await page.evaluate("()=>{const b=document.querySelector('[data-preset-use=\"2\"] img');return b?b.getAttribute('src').slice(0,22):null}")
        check(pic in ('data:image/webp;base64', 'data:image/png;base64,'), f'Preset 2 มีภาพตัวอย่างจาก 3D ({pic})')
        check(psql(f"SELECT name FROM outfit_presets WHERE user_id = {uid} AND slot = 2") == 'ชุดทดสอบ', 'Preset บันทึกที่เซิร์ฟเวอร์')
        await page.reload(); await page.wait_for_timeout(2200); await go(page, 'avatar', 1500)
        check(await page.locator('[data-preset-use="2"] img').count() == 1 and 'ชุดทดสอบ' in await page.inner_text('#av-presets'), 'Preset + ภาพตัวอย่าง คงอยู่หลัง reload')
        check(await page.locator('[data-preset-use="1"]').is_disabled() and await page.locator('[data-preset-use="3"]').is_disabled(), 'ช่องที่ยังว่าง (1, 3) กดใส่ไม่ได้')
        # ---------- Ranked Lobby -> โปรไฟล์ ----------
        await page.evaluate("()=>EQApp.navigateTo('ranked')"); await page.wait_for_timeout(3500)
        if await page.locator('#rk-tutorial-ov').count():   # ผู้เล่นใหม่: ปิดหน้าสอนเล่นก่อน (เหมือนผู้ใช้จริง)
            await page.evaluate("()=>document.getElementById('rk-tutorial-ov').remove()")
        lk = page.locator('#rk-lobby-players .profile-link').first
        check(await lk.count() == 1, 'Ranked Lobby: มีรายชื่อผู้เล่นที่กดดูโปรไฟล์ได้')
        if await lk.count():
            tgt = await lk.get_attribute('data-profile-uid'); await lk.click(force=True); await page.wait_for_timeout(2000)
            check(page.url.endswith(f'#/user/{tgt}'), 'กดจาก Ranked Lobby เปิดโปรไฟล์')

        # ---------- Public Profile + Privacy ----------  (force=True: SwiftShader บน CPU 2 คอร์ เรนเดอร์ 3D ช้า ทำให้ Playwright รอ rAF นาน)
        other_name = 'pvo%d' % random.randint(1000, 999999)
        other_tok = (await page.evaluate(REG, other_name))['token']
        oid = int(psql(f"SELECT id FROM users WHERE username = '{other_name}'"))
        await page.goto(f'http://localhost:3100/#/user/{oid}'); await page.wait_for_timeout(2500)
        check('ตั้งค่าโปรไฟล์เป็นส่วนตัว' in await page.inner_text('#screen-user-root'), 'Friends Only (ค่าเริ่มต้น) + ไม่ใช่เพื่อน: เห็นข้อความ "ส่วนตัว"')
        await api(page, other_tok, 'PUT', '/privacy', {'profile': 'public', 'avatar': 'public', 'rank': 'public', 'stats': 'friends', 'level': 'public'})
        await page.evaluate(f"()=>EQApp.navigateTo('home')"); await page.wait_for_timeout(500)
        await page.goto(f'http://localhost:3100/#/user/{oid}'); await page.wait_for_timeout(2500)
        t = await page.inner_text('#screen-user-root')
        check('Avatar Showcase' in t and 'สถิติการเรียน' in t and 'เจ้าของซ่อนไว้' in t, 'Public: เห็น Avatar · สถิติถูกซ่อน (Friends Only)')
        await page.screenshot(path=OUT + f'{W}_public_profile.png')
        await overflow(page, 'public profile')
        # เพิ่มเพื่อน → อีกฝ่ายตอบรับ → เห็นสถิติ
        await page.wait_for_timeout(1000)
        await page.click('[data-up="add"]', force=True); await page.wait_for_timeout(1200)
        fid = psql(f"SELECT id FROM friendships WHERE addressee_id = {oid} AND requester_id = {uid}")
        await api(page, other_tok, 'POST', f'/friends/{fid}/accept')
        await page.reload(); await page.wait_for_timeout(2500)
        t = await page.inner_text('#screen-user-root')
        check('ความแม่นยำ 30 วัน' in t, 'เป็นเพื่อนแล้ว: เห็น Learning Stats')
        # จาก Friends list → กดชื่อ
        await page.evaluate("()=>EQApp.navigateTo('friends')"); await page.wait_for_timeout(2000)
        link = page.locator(f'#screen-friends [data-profile-uid="{oid}"].profile-link').first
        check(await link.count() == 1, 'Friends: ชื่อเป็นลิงก์ไปโปรไฟล์')
        if await link.count(): await link.click(force=True); await page.wait_for_timeout(2000)
        check(page.url.endswith(f'#/user/{oid}'), f'กดจาก Friends เปิด /user/{oid}')
        # จาก Leaderboard
        await page.evaluate("()=>EQApp.navigateTo('leaderboard')"); await page.wait_for_timeout(2500)
        lk = page.locator('#screen-leaderboard .profile-link').first
        if await lk.count():
            tgt = await lk.get_attribute('data-profile-uid'); await lk.click(force=True); await page.wait_for_timeout(2000)
            check(page.url.endswith(f'#/user/{tgt}'), 'กดจาก Leaderboard เปิดโปรไฟล์')
        else:
            check(False, 'Leaderboard มีลิงก์โปรไฟล์')
        # Block / Unblock
        await page.goto(f'http://localhost:3100/#/user/{oid}'); await page.wait_for_timeout(2200)
        await page.click('[data-up="block"]', force=True); await page.wait_for_selector('.modal-card [data-ok]'); await page.click('.modal-card [data-ok]', force=True)
        await page.wait_for_selector('[data-up="unblock"]', timeout=15000)
        check('บล็อกผู้ใช้นี้อยู่' in await page.inner_text('#screen-user-root'), 'Block แล้วไม่เห็นข้อมูล')
        ov = await api(page, other_tok, 'GET', f'/profile/{uid}')
        check(ov['status'] == 404, 'ผู้ถูกบล็อกเปิด API โปรไฟล์ไม่ได้ (เปลี่ยน id ใน URL ก็ไม่ได้)')
        await page.click('[data-up="unblock"]', force=True); await page.wait_for_selector('[data-up="block"]', timeout=15000)
        check('Avatar Showcase' in await page.inner_text('#screen-user-root'), 'Unblock แล้วเห็นตามสิทธิ์อีกครั้ง')
        # Privacy screen
        await go(page, 'privacy', 1500)
        check(await page.locator('.pv-row').count() >= 13, 'หน้า Privacy: ตัวเลือกครบ')
        await page.click('.pv-opt input[name="pv-profile"][value="private"]', force=True); await page.wait_for_timeout(800)
        check(psql(f"SELECT profile_visibility FROM user_privacy_settings WHERE user_id = {uid}") == 'private', 'เปลี่ยน Privacy แล้วบันทึกที่เซิร์ฟเวอร์')
        ov = await api(page, other_tok, 'GET', f'/profile/{uid}')
        check(ov['body']['private'] is True and ov['body']['fields'] == {}, 'Private Profile: เพื่อนก็ได้ข้อมูลว่างจาก API')
        await overflow(page, 'privacy'); await small_targets(page, '#screen-privacy', 'privacy')
        # รูปโปรไฟล์ของ other ไม่เปลี่ยน (other ไม่ได้เปิด Avatar)
        check(psql(f"SELECT coalesce(avatar_enabled::text,'f') FROM user_avatar WHERE user_id = {oid}") in ('f', 'false', ''), 'รูปโปรไฟล์ของผู้ใช้อื่นไม่ถูกเปลี่ยนเป็น Avatar')
        check(not errs, f'ไม่มี JS error ({errs[:2]})')

        # ---------- WebGL context lost -> กู้คืน ----------
        await go(page, 'avatar', 800); await wait_state(page, '#av-stage', states=('ready',))
        await page.evaluate("()=>EQAvatar._stages().find(s=>s.box.id==='av-stage').v._loseContext()")
        await page.wait_for_timeout(600)
        st = await wait_state(page, '#av-stage', states=('ready',), ms=15000)
        check(st == 'ready' and await page.locator('#av-stage canvas').count() == 1, 'WebGL context lost -> กู้คืนเองได้')
        # ---------- 3D โหลดไม่ได้ / ไม่มี WebGL ----------
        ctx2 = await b.new_context(viewport={'width': W, 'height': H}, has_touch=MOBILE, service_workers='block')
        await ctx2.add_init_script(f"localStorage.setItem('wq_token', '{r2['token']}')")
        p2 = await ctx2.new_page()
        await p2.route('**/assets/avatar3d/glb/**', lambda r: r.abort())
        await p2.goto('http://localhost:3100'); await p2.wait_for_timeout(2000)
        await p2.evaluate("()=>EQApp.navigateTo('avatar')")
        check(await wait_state(p2, '#av-stage') == 'fallback' and await p2.locator('#av-stage .a3-retry').count() == 1, '3D โหลดไม่ได้ -> 2D + ลองใหม่')
        await p2.unroute('**/assets/avatar3d/glb/**'); await p2.click('#av-stage .a3-retry')
        check(await wait_state(p2, '#av-stage', states=('ready',)) == 'ready', 'กดลองใหม่ -> 3D สำเร็จ')
        p3 = await ctx2.new_page(); await p3.add_init_script("window.__EQ_FORCE_NO_WEBGL = true")
        await p3.goto('http://localhost:3100'); await p3.wait_for_timeout(2000)
        await p3.evaluate("()=>EQApp.navigateTo('avatar')"); await p3.wait_for_timeout(1500)
        t3 = await p3.inner_text('#av-stage')
        check(await p3.locator('#av-stage .eqav-svg').count() == 1 and 'แสดง 3D ไม่ได้' in t3, 'ไม่มี WebGL: Avatar 2D + ข้อความอธิบาย')
        await b.close()
    print(f'\n{"ALL PASS" if not fails else f"{len(fails)} FAIL"} @ {W}px {THEME} dpr{DPR}')
    sys.exit(1 if fails else 0)

asyncio.run(main())

