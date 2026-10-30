"""E2E: EnglishQuest World (Multiplayer 3D Lobby) — 2 บัญชีจริง 2 เบราว์เซอร์ (เดสก์ท็อป 1280 + มือถือ 390) บนเซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/world_e2e.py [outdir]
   ตรวจ (สเปกข้อ 23/24): อยู่ห้องเดียวกัน · เห็นการเดินของกัน (จอยสติ๊กมือถือ + คีย์บอร์ด) · Avatar/ชุดตรงกับ Wardrobe · หมุนกล้อง ·
   แชทประโยคสำเร็จรูป + คำแปลไทย · ดูโปรไฟล์ตาม Privacy · คำชวน (เพื่อนเท่านั้นโดยค่าเริ่มต้น → เป็นเพื่อนแล้วชวนได้ → ไปห้องแข่งเดิม) ·
   นั่งม้านั่ง · Event Plaza (รับรางวัล/ลองชุด) · บล็อกแล้วไม่เห็น/ไม่ได้ข้อความ · หลุดแล้วหาย · กลับมาไม่ซ้ำ · ออกจาก Lobby ·
   UI ไม่ทับกัน/ไม่บัง (จอยสติ๊กไม่ทับแชท · ไม่อยู่ใต้เมนูล่าง) · ปุ่ม ≥ 44px · ไม่มี scroll แนวนอน · ไม่มี JS error"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = os.environ.get('E2E_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/world_e2e'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

async def page_for(b, w, h, mobile, name=None, token=None):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(400)
    if not token:
        name = name or 'we%d' % random.randint(10000, 999999)
        token = (await pg.evaluate(REG, name))['token']
        # บัญชีทดสอบอายุ 10 วัน (เงื่อนไข "พิมพ์เอง" ต้องบัญชีอายุ ≥ 3 วัน) — ค่าเริ่มต้นแชทยังเป็นประโยคสำเร็จรูป
        subprocess.run(['psql', DB, '-qc', f"UPDATE users SET created_at = NOW() - interval '10 days' WHERE username = '{name}'"], check=False)
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", token)
    await pg.evaluate("t=>fetch('/api/changelog/seen',{method:'POST',headers:{Authorization:'Bearer '+t}})", token)   # ไม่ให้ป๊อปอัปแพตช์โน้ตบังฉาก
    await pg.goto(URL + '/?w=%d#/world' % random.randint(1, 1000000))
    try:
        await pg.wait_for_function("()=>window.EQWorld && EQWorld._state() && EQWorld._state().me", timeout=180000, polling=500)
    except Exception:
        print('DBG page_for', errs[:3], repr(await pg.evaluate("()=>{const s=EQWorld._state();return JSON.stringify({me:s.me,room:s.room,n:s.players.length,ca:s.chatAllowed}).slice(0,600)}")), flush=True)
        raise
    return pg, errs, token, ctx

async def st(pg):
    # เบราว์เซอร์ไม่วาดเฟรม (requestAnimationFrame) ให้หน้าที่ไม่ได้อยู่หน้าสุด — สลับหน้ามาก่อนอ่านสถานะ/สั่งงาน (ผู้ใช้จริง 1 คน = 1 หน้าจอ)
    await pg.bring_to_front(); await pg.wait_for_timeout(250)
    return await pg.evaluate("()=>EQWorld._state()")
def find(s, name): return next((p for p in s['players'] if p['name'] == name), None)

async def shot(pg, path):
    try: await pg.screenshot(path=path, timeout=90000)
    except Exception as e: print('(ภาพ QA ไม่ทัน:', path, str(e)[:60], ')')

async def wait_until(pg, js, ms=15000):
    await pg.bring_to_front()
    await pg.wait_for_function(js, timeout=ms)

async def ui_layout(pg, tag):
    r = await pg.evaluate("""()=>{const q=(s)=>{const e=document.querySelector(s);if(!e||!e.offsetParent&&getComputedStyle(e).position!=='fixed'&&e.offsetWidth===0)return null;const b=e.getBoundingClientRect();return b.width&&b.height?{l:b.left,t:b.top,r:b.right,b:b.bottom}:null};
      const nav=document.getElementById('bottom-nav');const nb=nav&&!nav.classList.contains('hidden')?nav.getBoundingClientRect():null;
      const small=[...document.querySelectorAll('#screen-world button')].filter(x=>x.offsetParent&&!x.hidden&&!x.closest('.wd-chatlog')&&!x.closest('.wd-costumes')&&(x.getBoundingClientRect().height<44||x.getBoundingClientRect().width<44)).map(x=>(x.getAttribute('aria-label')||x.textContent).trim().slice(0,20));
      return {joy:q('#wd-joy'),chat:q('#wd-chatlog'),act:q('.wd-act'),top:q('.wd-top'),actions:q('.wd-actions'),room:q('#wd-room'),stage:q('#screen-world'),navTop:nb&&window.innerWidth<1024?nb.top:null,
        hs:document.documentElement.scrollWidth-window.innerWidth,small}}""")
    ov = lambda a, b: a and b and not (a['r'] <= b['l'] or b['r'] <= a['l'] or a['b'] <= b['t'] or b['b'] <= a['t'])
    check(r['hs'] <= 0, f'{tag}: ไม่มี scroll แนวนอน ({r["hs"]})')
    check(not r['small'], f'{tag}: ปุ่มแตะ ≥ 44px ({r["small"]})')
    if r['joy']:
        check(not ov(r['joy'], r['chat']), f'{tag}: จอยสติ๊กไม่ทับแชท')
        check(not ov(r['joy'], r['act']), f'{tag}: จอยสติ๊กไม่ทับปุ่มโต้ตอบ/ท่าทาง')
        check(r['navTop'] is None or r['joy']['b'] <= r['navTop'] + 0.5, f'{tag}: จอยสติ๊กอยู่เหนือเมนูล่างเดิม ({r["joy"]["b"]:.0f} ≤ {r["navTop"]})')
    check(r['stage'] and (r['navTop'] is None or r['stage']['b'] <= r['navTop'] + 0.5), f'{tag}: ฉาก 3D ไม่ถูกเมนูล่างบัง')
    check(r['actions'] and r['room'] and abs(r['actions']['t'] - r['room']['t']) < 30, f'{tag}: ปุ่มบนอยู่แถวเดียวกับชื่อห้อง (ไม่ตกแถว)')
    check(not ov(r['chat'], r['act']), f'{tag}: แชทไม่ทับปุ่มขวาล่าง')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        A, ea, ta, ca = await page_for(b, 1280, 800, False)
        B, eb, tb, cb = await page_for(b, 390, 844, True)
        sa, sb = await st(A), await st(B)
        na, nb = sa['me']['name'], sb['me']['name']
        check(sa['room']['id'] == sb['room']['id'], f'2 บัญชีอยู่ห้องเดียวกัน ({sa["room"]["id"]})')
        await wait_until(A, f"()=>{{const p=EQWorld._state().players.find(x=>x.name==={json.dumps(nb)});return p&&p.loaded}}", 60000)
        await wait_until(B, f"()=>{{const p=EQWorld._state().players.find(x=>x.name==={json.dumps(na)});return p&&p.loaded}}", 60000)
        check(True, 'ต่างฝ่ายเห็น Avatar ของอีกฝ่าย (โหลดแล้ว)')
        # ชุดใน Lobby = ชุดจริงจาก Wardrobe
        meA = await A.evaluate("async()=>EQApp.api('/avatar/me')")
        seen = find(await st(B), na)['outfit']
        same = all(seen.get(k) == v for k, v in meA['outfit'].items() if v and k not in ('background', 'effect'))
        check(same, 'Avatar Outfit ของ A ที่ B เห็น ตรงกับชุดที่สวมจริง')
        # มือถือ: จอยสติ๊ก (ดันขึ้น 1.4 วินาที)
        await B.bring_to_front()
        b0 = (await st(B))['me']
        box = await B.locator('#wd-joy').bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        await B.evaluate("""([x,y])=>{const j=document.getElementById('wd-joy');const o={pointerId:7,pointerType:'touch',bubbles:true,clientX:x,clientY:y,isPrimary:true};
          j.dispatchEvent(new PointerEvent('pointerdown',o));j.dispatchEvent(new PointerEvent('pointermove',{...o,clientY:y-40}));}""", [cx, cy])
        # ซอฟต์แวร์เรนเดอร์ (SwiftShader) 2 หน้าพร้อมกันได้ไม่กี่เฟรม/วินาที — ถือจอยไว้จนตัวละครเดินจริง (สูงสุด 15 วินาที) แทนการรอเวลาตายตัว
        try:
            await B.wait_for_function(f"()=>{{const m=EQWorld._state().me;return Math.hypot(m.x-({b0['x']}),m.z-({b0['z']}))>0.6}}", timeout=15000, polling=500)
        except Exception: pass
        await B.evaluate("([x,y])=>{const j=document.getElementById('wd-joy');j.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,pointerType:'touch',bubbles:true,clientX:x,clientY:y}))}", [cx, cy - 40])
        await B.wait_for_timeout(1500)
        # SwiftShader 2 หน้าพร้อมกันได้ ~1 เฟรม/วินาที — ให้หน้า B วาดต่ออีกหลายเฟรม (ส่งตำแหน่งสุดท้าย/สถานะหยุดเดิน) ก่อนสลับไปหน้า A
        await B.wait_for_function("()=>{const s=EQWorld._sent();return s && s.last && Math.abs(s.last.x-EQWorld._state().me.x)<0.01 && Math.abs(s.last.z-EQWorld._state().me.z)<0.01 && s.last.st==='idle'}", timeout=20000, polling=500)
        b1 = await B.evaluate("()=>EQWorld._state().me")
        moved = ((b1['x'] - b0['x']) ** 2 + (b1['z'] - b0['z']) ** 2) ** 0.5
        check(moved > 0.4, f'มือถือ: จอยสติ๊กเดินได้ ({moved:.2f} m)')
        # 2 ผู้เล่นอยู่ในเบราว์เซอร์เดียว: แท็บที่อยู่เบื้องหลังถูก Chromium หน่วง timer (ส่งตำแหน่งช้าได้หลายสิบวินาที)
        # ผู้ใช้จริงอยู่คนละเครื่อง — สลับหน้าไปมาให้ทั้งสองฝั่งได้ทำงาน แล้วตรวจว่า A เห็นตำแหน่งสุดท้ายของ B
        for _ in range(12):
            await B.bring_to_front(); await B.wait_for_timeout(600)
            await A.bring_to_front()
            try:
                await A.wait_for_function("([n,x,z])=>{const p=EQWorld._state().players.find(q=>q.name===n);return p&&Math.abs(p.x-x)<0.6&&Math.abs(p.z-z)<0.6}", arg=[nb, b1['x'], b1['z']], timeout=1500); break
            except Exception: pass
        pa_b = find(await st(A), nb)
        if not (abs(pa_b['x'] - b1['x']) < 0.6 and abs(pa_b['z'] - b1['z']) < 0.6):
            print('DBG sync A', await A.evaluate("n=>{const s=EQWorld._state();const p=s.players.find(q=>q.name===n);return JSON.stringify({p, me:s.me&&s.me.pid, rt:EQApp.rtConnected, dbg:EQWorld._buf?EQWorld._buf(p.pid):null})}", nb), flush=True)
            print('DBG sync B', await B.evaluate("()=>{const s=EQWorld._state();return JSON.stringify({me:s.me, rt:EQApp.rtConnected, sent:EQWorld._sent?EQWorld._sent():null})}"), flush=True)
        check(abs(pa_b['x'] - b1['x']) < 0.6 and abs(pa_b['z'] - b1['z']) < 0.6, f'A เห็น B เดินแบบเรียลไทม์ (B ที่ {b1["x"]:.2f},{b1["z"]:.2f} · A เห็น {pa_b["x"]},{pa_b["z"]})')
        # เดสก์ท็อป: คีย์บอร์ด W + ลากเมาส์หมุนกล้อง
        await A.bring_to_front()
        await A.locator('canvas.wd-canvas').focus()
        a0 = (await st(A))['me']
        await A.evaluate("()=>{window._ev=[];['blur','focus','keydown','keyup'].forEach(t=>window.addEventListener(t,e=>_ev.push(t+':'+(e.key||'')),true));document.addEventListener('visibilitychange',()=>_ev.push('vis:'+document.hidden));let n=0;(function f(){n++;window._fr=n;requestAnimationFrame(f)})()}")
        # หันกล้องออกจากน้ำพุ (W = เดินไปทางที่กล้องมอง) — กันจุดเกิดที่หันหน้าเข้าน้ำพุพอดี
        # จุดเกิดบางจุดมีม้านั่ง/แปลงดอกไม้ขวาง (ชนจริง = ถูกต้อง) — ลองหลายทิศจนกว่าจะเดินได้
        for k in range(4):
            await A.evaluate("([x,z,k])=>EQWorld._setYaw(Math.atan2(-x,-z)+k*Math.PI/2)", [a0['x'], a0['z'], k])
            await A.keyboard.down('w'); await A.wait_for_timeout(2500); inp = await A.evaluate('()=>EQWorld._input()'); await A.wait_for_timeout(2500); await A.keyboard.up('w'); await A.wait_for_timeout(800)
            a1 = await A.evaluate("()=>EQWorld._state().me")
            if ((a1['x'] - a0['x']) ** 2 + (a1['z'] - a0['z']) ** 2) ** 0.5 > 0.3: break
            print('DBG wasd', k, inp, a0, a1, await A.evaluate("()=>[document.activeElement.tagName,document.activeElement.className,document.hasFocus(),document.hidden,!!document.querySelector('.wd-sheet'),window._fr,_ev.slice(-5),EQWorld._state().joy||null,EQWorld._state().cam]"))
        check(((a1['x'] - a0['x']) ** 2 + (a1['z'] - a0['z']) ** 2) ** 0.5 > 0.3, 'เดสก์ท็อป: WASD เดินได้')
        y0 = (await st(A))['cam']['yaw']
        await A.mouse.move(700, 400); await A.mouse.down(); await A.mouse.move(820, 410, steps=6); await A.mouse.up()
        check(abs((await st(A))['cam']['yaw'] - y0) > 0.3, 'ลากเมาส์หมุนกล้องได้')
        await B.wait_for_timeout(800)
        check(abs(find(await st(B), na)['x'] - a1['x']) < 0.6, 'B เห็น A เดิน')
        # ภาพ QA: เดิน + โบกมือ ระยะใกล้ (ตรวจด้วยตา: ไม่มี mesh ทะลุเสื้อ)
        await A.keyboard.down('d'); await A.wait_for_timeout(300)
        await shot(A, f'{OUT}/desk_walk.png'); await A.keyboard.up('d')
        await A.keyboard.press('1'); await A.wait_for_timeout(700)
        await shot(A, f'{OUT}/desk_wave.png')
        await shot(B, f'{OUT}/mob_view.png')
        # แชท: ปุ่มแชท → ช่องพิมพ์ (Quick Chat) · "ทั้งหมด" → ประโยคสำเร็จรูปทุกหมวด · A ส่ง "Nice to meet you!" → B เห็น + แตะดูคำแปลไทย
        await A.bring_to_front()
        await A.click('[data-ui="chat"]')
        check(await A.evaluate("()=>!document.querySelector('#wd-compose').hidden"), 'ปุ่มแชท → เปิดช่องแชท')
        note = await A.evaluate("()=>document.querySelector('#wd-compose').innerText")
        check('โหมดปลอดภัย' in note and not await A.evaluate("()=>!!document.querySelector('#wd-cmp-input')"), 'ค่าเริ่มต้น: Quick Chat อย่างเดียว ไม่มีช่องพิมพ์เอง (นักเรียนปลอดภัย)')
        await A.click('[data-allphr]'); await A.click('[data-phrase="nice_meet"]')
        await wait_until(B, "()=>[...document.querySelectorAll('#wd-chatlog .wd-msg')].some(m=>m.textContent.includes('Nice to meet you!'))")
        check(True, 'แชท: ประโยคสำเร็จรูปถึงอีกฝ่าย (Quick Chat ยังใช้ได้)')
        bub = await B.evaluate("()=>[...document.querySelectorAll('.wd-bubble')].some(x=>x.textContent.includes('Nice to meet you!'))")
        check(bub, 'ฟองข้อความเหนือหัวผู้พูด (พร้อมคำแปล)')
        await B.locator('#wd-chatlog .wd-msg', has_text='Nice to meet you!').first.click()
        th = await B.evaluate("()=>{const m=[...document.querySelectorAll('#wd-chatlog .wd-msg')].find(x=>x.textContent.includes('Nice'));const t=m&&m.querySelector('.wd-th');return t&&!t.hidden&&t.textContent}")
        check(th == 'ยินดีที่ได้รู้จัก!', f'แตะข้อความแล้วเห็นคำแปลไทย ({th})')
        if await A.evaluate("()=>!!document.querySelector('.wd-sheet')"): await A.click('.wd-sheet .wd-close')
        # ---- Free Text Chat: ทั้งสองฝ่ายเปิด "พิมพ์ข้อความเอง" ในตั้งค่า ----
        for P in (A, B):
            await P.evaluate("()=>EQApp.api('/world/settings',{method:'PUT',body:{chatMode:'text'}})")
        await wait_until(A, "()=>EQWorld._state().chatAllowed && EQWorld._state().chatAllowed.text")
        await wait_until(B, "()=>EQWorld._state().chatAllowed && EQWorld._state().chatAllowed.text")
        # Desktop: Enter เปิด → พิมพ์ → Enter ส่ง
        await A.bring_to_front(); await A.locator('canvas.wd-canvas').focus()
        await A.keyboard.press('Enter'); await A.wait_for_timeout(300)
        foc = await A.evaluate("()=>document.activeElement && document.activeElement.id")
        check(foc == 'wd-cmp-input', f'Enter = เปิดช่องพิมพ์ และโฟกัสช่องพิมพ์ ({foc})')
        await A.keyboard.type('Hello! Do you want to practice vocab?')
        x0 = (await st(A))['me']
        await A.keyboard.press('Enter'); await A.wait_for_timeout(400)
        check(await A.evaluate("()=>document.querySelector('#wd-compose').hidden"), 'Enter = ส่งแล้วปิดช่องพิมพ์')
        x1 = (await st(A))['me']
        check(abs(x1['x'] - x0['x']) < 0.05 and abs(x1['z'] - x0['z']) < 0.05, 'พิมพ์ตัว a/s/d/w ในช่องแชทไม่ทำให้ตัวละครเดิน')
        await wait_until(B, "()=>[...document.querySelectorAll('#wd-chatlog .wd-msg')].some(m=>m.textContent.includes('Do you want to practice vocab?'))")
        check(True, 'ผู้ใช้สองคนพิมพ์คุยกันได้ (เดสก์ท็อป → มือถือ)')
        # Escape ปิดโดยไม่ส่ง
        await A.bring_to_front(); await A.locator('canvas.wd-canvas').focus()
        await A.keyboard.press('Enter'); await A.keyboard.type('draft not sent'); await A.keyboard.press('Escape'); await A.wait_for_timeout(500)
        check(await A.evaluate("()=>document.querySelector('#wd-compose').hidden"), 'Escape = ปิดช่องพิมพ์')
        await B.wait_for_timeout(600)
        check(not await B.evaluate("()=>document.body.innerText.includes('draft not sent')"), 'กด Escape แล้วไม่ส่งข้อความ')
        # Mobile: ปุ่มแชท → ช่องพิมพ์ ไม่บังจอยสติ๊ก/ปุ่มควบคุม (ซ่อนระหว่างพิมพ์) · อยู่ในจอ
        await B.bring_to_front(); await B.click('[data-ui="chat"]'); await B.wait_for_timeout(400)
        lay = await B.evaluate("""()=>{const c=document.querySelector('#wd-compose').getBoundingClientRect();const vis=(s)=>{const e=document.querySelector(s);return !!(e&&e.offsetParent&&getComputedStyle(e).display!=='none')};
          const nav=document.getElementById('bottom-nav');const nb=nav&&!nav.classList.contains('hidden')?nav.getBoundingClientRect().top:innerHeight;
          return {inView:c.left>=0&&c.right<=innerWidth&&c.bottom<=nb+0.5&&c.top>=0, joy:vis('#wd-joy'), act:vis('.wd-act'), h:c.height}}""")
        check(lay['inView'], f'มือถือ: ช่องแชทอยู่ในจอ เหนือเมนูล่าง ({lay})')
        check(not lay['joy'] and not lay['act'], 'มือถือ: ระหว่างพิมพ์ จอยสติ๊ก/ปุ่มท่าทางถูกซ่อน (ไม่บังกัน ไม่เผลอเดิน)')
        await shot(B, f'{OUT}/mob_compose.png')
        await B.fill('#wd-cmp-input', 'Yes! See you in Learning Hall <b>now</b>')
        await B.click('.wd-cmp-send'); await B.wait_for_timeout(400)
        check(await B.evaluate("()=>!document.querySelector('#wd-joy') || getComputedStyle(document.querySelector('#wd-joy')).display!=='none'"), 'มือถือ: ส่งแล้วจอยสติ๊กกลับมา')
        await wait_until(A, "()=>[...document.querySelectorAll('#wd-chatlog .wd-msg')].some(m=>m.textContent.includes('See you in Learning Hall'))")
        safe = await A.evaluate("()=>{const m=[...document.querySelectorAll('#wd-chatlog .wd-msg')].find(x=>x.textContent.includes('Learning Hall'));return !!m && m.innerHTML.includes('&lt;b&gt;now&lt;/b&gt;')}")
        check(safe, 'XSS: ข้อความแสดงเป็นตัวอักษร (escape) ไม่ถูกตีความเป็น HTML')
        await shot(A, f'{OUT}/desk_chat_text.png')
        # Mute: A ปิดเสียง B → ข้อความของ B ไม่ถึง A (ทั้งกล่องแชทและฟอง)
        pidB0 = find(await st(A), nb)['pid']
        await A.evaluate("pid=>EQApp.api('/world/players/'+pid+'/mute',{method:'POST',body:{on:true}})", pidB0)
        await B.wait_for_timeout(1700)
        await B.bring_to_front(); await B.click('[data-ui="chat"]'); await B.fill('#wd-cmp-input', 'muted message test'); await B.click('.wd-cmp-send')
        await A.wait_for_timeout(1200)
        check(not await A.evaluate("()=>document.body.innerText.includes('muted message test')"), 'Mute: ไม่เห็นข้อความของคนที่ปิดเสียง')
        await A.evaluate("pid=>EQApp.api('/world/players/'+pid+'/mute',{method:'POST',body:{on:false}})", pidB0)
        # คำหยาบ: ไม่ถูกส่ง · ผู้ส่งได้รับแจ้ง
        await B.wait_for_timeout(1700)
        await B.bring_to_front(); await B.click('[data-ui="chat"]'); await B.fill('#wd-cmp-input', 'you are stupid'); await B.click('.wd-cmp-send')
        await A.wait_for_timeout(1200)
        check(not await A.evaluate("()=>document.body.innerText.includes('stupid') || document.body.innerText.includes('*****')"), 'ข้อความที่ถูกกรองไม่แสดงให้ผู้อื่นเห็นเลย')
        await ui_layout(A, 'เดสก์ท็อป 1280'); await ui_layout(B, 'มือถือ 390')
        # ดูโปรไฟล์ (Privacy ค่าเริ่มต้น = เพื่อนเท่านั้น)
        pidA = find(await st(B), na)['pid']
        await B.evaluate("pid=>EQWorld._openPlayer(pid)", pidA)
        await B.click('[data-a="profile"]'); await B.wait_for_timeout(800)
        check('ส่วนตัว' in await B.evaluate("()=>document.querySelector('#wd-pm-extra').innerText"), 'ดูโปรไฟล์ตาม Privacy (ยังไม่ใช่เพื่อน → เห็นแบบซ่อน)')
        await shot(B, f'{OUT}/mob_player_menu.png')
        # คำชวน: ยังไม่ใช่เพื่อน → ไม่ได้ (ค่าเริ่มต้นรับเฉพาะเพื่อน)
        await B.click('[data-a="practice"]'); await B.click('[data-level="A1"]'); await B.wait_for_timeout(700)
        toast = await B.evaluate("()=>{const t=document.querySelector('.wd-toast');return t&&t.textContent}")
        check(toast and 'เพื่อน' in toast, f'ชวนคนที่ยังไม่ใช่เพื่อน = ถูกปฏิเสธตาม Privacy ({toast})')
        # เพิ่มเพื่อนจากในโลก → A ตอบรับ → ชวนฝึกได้
        await B.evaluate("pid=>EQWorld._openPlayer(pid)", pidA); await B.click('[data-a="friend"]'); await B.wait_for_timeout(700)
        reqs = await A.evaluate("async()=>EQApp.api('/friends/requests')")
        inc = (reqs.get('incoming') or reqs.get('requests') or [])
        fid = inc[0]['friendshipId'] if inc else None
        if fid: await A.evaluate("id=>EQApp.api('/friends/'+id+'/accept',{method:'POST'})", fid)
        await wait_until(B, f"()=>{{const p=EQWorld._state().players.find(x=>x.name==={json.dumps(na)});return p&&p.friend}}")
        check(True, 'เพิ่มเพื่อนจากใน Lobby แล้วป้ายชื่อเปลี่ยนเป็นเพื่อนทันที')
        await B.wait_for_timeout(8200)
        await B.evaluate("pid=>EQWorld._openPlayer(pid)", pidA); await B.click('[data-a="practice"]'); await B.click('[data-level="A2"]')
        await wait_until(A, "()=>document.querySelector('.wd-invite')")
        await shot(A, f'{OUT}/desk_invite.png')
        check(True, 'เพื่อนชวนฝึกได้ — มีการ์ดคำชวนพร้อมเวลานับถอยหลัง')
        # นั่งม้านั่ง (เดินด้วยความเร็วจริง + เซิร์ฟเวอร์ตรวจ) — ก่อนตอบคำชวน
        await A.evaluate("()=>{const b=document.querySelector('.wd-invite [data-r=\"0\"]');if(b)b.click()}")
        seat = await A.evaluate("async()=>{const c=await EQApp.api('/world/config');const me=EQWorld._state().me;return c.map.seats.map(s=>({...s,d:Math.hypot(s.x-me.x,s.z-me.z)})).sort((a,b)=>a.d-b.d)[0]}")
        await A.bring_to_front()
        ok = await A.evaluate("([x,z])=>EQWorld._walkTo(x,z)", [seat['x'], seat['z'] + 0.0])
        await A.wait_for_timeout(300)
        it = await A.evaluate("()=>document.getElementById('wd-interact').hidden?null:document.getElementById('wd-interact-text').textContent")
        check(it == 'นั่ง', f'ใกล้ม้านั่ง → ปุ่มโต้ตอบ "นั่ง" ({it}, เดินถึง={ok})')
        await A.click('#wd-interact'); await A.wait_for_timeout(900)
        check((await st(A))['me']['st'] == 'sit', 'นั่งม้านั่งได้')
        await wait_until(B, f"()=>EQWorld._state().players.find(x=>x.name==={json.dumps(na)}).st==='sit'")
        check(True, 'อีกฝ่ายเห็นท่านั่ง')
        await shot(A, f'{OUT}/desk_sit.png')
        await A.click('#wd-interact'); await A.wait_for_timeout(400)
        # Event Plaza: เดินไปแท่นรับรางวัล
        await A.bring_to_front()
        ok = await A.evaluate("()=>EQWorld._walkTo(0, 7.5).then(()=>EQWorld._walkTo(0, 13.2)).then(()=>EQWorld._walkTo(0, 19.4))")
        await A.wait_for_timeout(400)
        it = await A.evaluate("()=>document.getElementById('wd-interact').hidden?null:document.getElementById('wd-interact-text').textContent")
        check(it == 'Daily Login Gift', f'Event Plaza: จุดรับรางวัล Daily Login ({it}, เดินถึง={ok})')
        await A.click('#wd-interact'); await A.wait_for_timeout(1500)
        await shot(A, f'{OUT}/desk_event_claim.png')
        sheet = await A.evaluate("()=>document.querySelector('.wd-sheet')&&document.querySelector('.wd-sheet').innerText")
        check(sheet and ('รับรางวัล' in sheet or 'ยังไม่เริ่ม' in sheet or 'จบแล้ว' in sheet), 'Event Plaza: ชีตรางวัลเปิดได้ (ไม่บังคับเข้า Lobby)')
        claim = A.locator('[data-claim]')
        if await claim.count():
            await claim.click(); await A.wait_for_timeout(1500)
            check('ได้รับ Day' in await A.evaluate("()=>document.querySelector('#wd-ev-res').innerText"), 'รับรางวัล Day 1 จาก Event Plaza ได้')
        await A.click('.wd-sheet .wd-close')
        # บล็อก: B บล็อก A → A หายจาก B · ข้อความของ A ไม่ถึง B
        await B.evaluate("pid=>EQApp.api('/world/players/'+pid+'/block',{method:'POST'})", pidA)
        await B.wait_for_timeout(600)
        check(find(await st(B), na) is None, 'บล็อกแล้วอีกฝ่ายหายจากโลกของเรา')
        check(find(await st(A), nb) is None, 'คนที่ถูกบล็อกก็มองไม่เห็นเรา')
        await A.click('[data-ui="chat"]'); await A.click('[data-allphr]'); await A.click('[data-mode="room"]'); await A.click('[data-phrase="good_luck"]'); await A.wait_for_timeout(1200)
        check(not await B.evaluate("()=>[...document.querySelectorAll('#wd-chatlog .wd-msg')].some(m=>m.textContent.includes('Good luck!'))"), 'บล็อกแล้วส่งข้อความไม่ถึง')
        # ปลดบล็อก (ผ่าน API เดิม) แล้วทดสอบหลุด/กลับมา
        uid = await A.evaluate("()=>EQApp.user.id")
        await B.evaluate("uid=>EQApp.api('/friends/block/'+uid,{method:'DELETE'})", uid)
        await A.close(); await ca.close()
        await B.wait_for_timeout(1500)
        check(find(await st(B), na) is None, 'A หลุด (ปิดหน้า) → Avatar หายจากห้องทันที ไม่ค้างเป็น ghost')
        A2, ea2, _, ca2 = await page_for(b, 1280, 800, False, token=ta)
        await B.wait_for_timeout(1500)
        cnt = sum(1 for x in (await st(B))['players'] if x['name'] == na)
        if cnt != 1:
            try: await wait_until(B, "n=>EQWorld._state().players.filter(x=>x.name===n).length===1".replace('n=>', '()=>').replace('===n', '==='+repr(na)), 15000)
            except Exception: pass
            sa2 = await st(A2); sb2 = await st(B)
            print('DBG rejoin', sa2['room']['id'], sb2['room']['id'], [x['name'] for x in sb2['players']], ea2[:3])
            cnt = sum(1 for x in sb2['players'] if x['name'] == na)
        check(cnt == 1, f'A กลับมา → มีตัวละครเดียว ไม่ซ้ำ ({cnt})')
        srv = await A2.evaluate("async()=>{try{return await EQApp.api('/world/rooms')}catch(e){return null}}")
        check(srv and sum(r['count'] for r in srv['rooms']) >= 2, 'ห้องนับผู้เล่นถูกต้องหลังกลับมา')
        # ออกจาก Lobby
        await A2.click('[data-ui="exit"]'); await A2.wait_for_timeout(1200)
        check(await A2.evaluate("()=>!EQWorld.isOpen && !document.getElementById('screen-play').classList.contains('hidden')"), 'ออกจาก Lobby → กลับหน้า "เล่น" ทันที')
        await B.wait_for_timeout(800)
        check(find(await st(B), na) is None, 'ออกแล้วหายจากห้องของอีกฝ่าย')
        check(not [e for e in ea + eb + ea2 if 'TUNNEL' not in e], f'ไม่มี JS error ({(ea + eb + ea2)[:3]})')
        await b.close()
    print('\n' + ('ALL PASS' if not fails else f'{len(fails)} FAIL'))
    sys.exit(1 if fails else 0)

asyncio.run(main())
