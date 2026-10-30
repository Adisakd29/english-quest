"""E2E: Login → Grammar Map → Open Lesson → Learn Step 1 → Practice → Get EXP → Continue → Complete → Progress saved → Logout → Login → still there"""
import asyncio, random, sys
from playwright.async_api import async_playwright
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
LOGIN = """async (n)=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:n+"@gmail.com",password:"password123"})});return r.json()}"""
OUT = '/tmp/eq_e2e_'
W = int(sys.argv[1]) if len(sys.argv) > 1 else 390
TOPIC = sys.argv[2] if len(sys.argv) > 2 else 'a1-subject-pronouns'
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

async def answer(page):
    sel = '.screen:not(.hidden) .gl-item-body'
    kind = await page.evaluate(f"""()=>{{const b=document.querySelector('{sel}');if(!b)return null;
      if(b.querySelector('[data-chips]'))return 'drag';if(b.querySelector('.lk-tok'))return 'detect';if(b.querySelector('.gl-choice'))return 'choice';
      if(b.querySelector('[data-bank]'))return 'order';if(b.querySelector('[data-m]'))return 'match';if(b.querySelector('input[data-ans]'))return 'fill';return 'text'}}""")
    if kind == 'drag':
        chip = page.locator(f'{sel} .lk-chip').first; drop = page.locator(f'{sel} [data-drop]')
        cb = await chip.bounding_box(); db = await drop.bounding_box()
        await page.mouse.move(cb['x'] + cb['width'] / 2, cb['y'] + cb['height'] / 2); await page.mouse.down()
        await page.mouse.move(cb['x'] + 30, cb['y'] - 10, steps=4)
        await page.mouse.move(db['x'] + db['width'] / 2, db['y'] + db['height'] / 2, steps=8); await page.mouse.up()
        await page.wait_for_timeout(200)
        if not await page.locator(f'{sel} [data-drop] .lk-chip').count(): await chip.click()
    elif kind == 'detect': await page.locator(f'{sel} .lk-tok').nth(1).click()
    elif kind == 'choice': await page.locator(f'{sel} .gl-choice').first.click()
    elif kind == 'order':
        n = await page.locator(f'{sel} [data-bank] .gl-token').count()
        for _ in range(n): await page.locator(f'{sel} [data-bank] .gl-token').first.click()
    elif kind == 'match':
        for _ in range(await page.locator(f'{sel} [data-m]').count()): await page.locator(f'{sel} [data-mk]:visible').first.click()
    elif kind == 'fill': await page.fill(f'{sel} input[data-ans]', 'he')
    else:
        v = await page.input_value(f'{sel} textarea[data-ans]')
        await page.fill(f'{sel} textarea[data-ans]', (v or 'They are my friends') + ' ')
    return kind

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        ctx = await b.new_context(viewport={'width': W, 'height': 844}, has_touch=W < 500)
        page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto('http://localhost:3100'); await page.wait_for_timeout(2000)
        name = 'ls%d' % random.randint(1000, 999999)
        r = await page.evaluate(REG, name)
        await page.evaluate("t=>localStorage.setItem('wq_token',t)", r['token']); await page.reload(); await page.wait_for_timeout(2500)
        exp0 = await page.evaluate("()=>EQApp.user.exp")
        await page.evaluate("()=>EQApp.navigateTo('grammar')"); await page.wait_for_timeout(1800)
        await page.screenshot(path=f'{OUT}{W}_0map.png')
        states = await page.evaluate("()=>[...document.querySelectorAll('#gl-lvt-A1 .gl-topic')].slice(0,3).map(b=>b.className)")
        check('is-available' in states[0] and 'is-locked' in states[1], f'แผนที่: บทแรกเปิด บทถัดไปล็อก {states}')
        await page.click(f'[data-gl-topic="{TOPIC}"]'); await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}{W}_1overview.png', full_page=True)
        await page.click('.screen:not(.hidden) [data-gl-act="lesson"]'); await page.wait_for_timeout(1500)
        kinds = []
        for k in range(12):
            await page.wait_for_timeout(300)
            step = await page.evaluate("()=>document.querySelector('.screen:not(.hidden) .gl-play-count')?.textContent")
            prog = await page.evaluate("()=>document.querySelector('.screen:not(.hidden) .lk-progress-pct')?.textContent")
            kind = await page.evaluate("()=>{const c=document.querySelector('.screen:not(.hidden) .lk-card');return c?c.className.split(' ').find(x=>x.startsWith('lk-')&&x!=='lk-card'):'check'}")
            kinds.append(kind)
            await page.screenshot(path=f'{OUT}{W}_2step{k+1}_{kind}.png', full_page=True)
            check(step == f'Step {k+1}/12', f'แสดง {step} ({prog})')
            if kind == 'lk-discover':
                check(await page.locator('[data-lk-next]').is_disabled(), 'Discover: ต้องเลือกก่อนไปต่อ')
                await page.locator('[data-pat]').first.click(); await page.wait_for_timeout(300)
            if kind == 'lk-mistakes':
                for bt in await page.locator('[data-tf-ans="false"]').all(): await bt.click()
                await page.wait_for_timeout(300)
                await page.screenshot(path=f'{OUT}{W}_2step{k+1}_mistakes_done.png', full_page=True)
            if kind == 'check':
                for i in range(6):
                    if not await page.locator('.screen:not(.hidden) .gl-item-body').count(): break
                    t = await answer(page)
                    await page.click('.screen:not(.hidden) [data-submit]'); await page.wait_for_timeout(700)
                    if i == 0: await page.screenshot(path=f'{OUT}{W}_3check{k+1}_{t}.png', full_page=True)
                    exp_now = await page.evaluate("()=>EQApp.user.exp")
                    go = page.locator('[data-lk-go]'); txt = await go.inner_text()
                    if await page.locator('#levelup-ok').is_visible(): await page.click('#levelup-ok'); await page.wait_for_timeout(300)   # เลเวลอัประหว่างบท (ขึ้นกับจำนวนข้อที่ตอบถูก)
                    await go.click(); await page.wait_for_timeout(900)
                    if 'ข้อต่อไป' not in txt: break
            else:
                if k == 0:
                    e1 = await page.evaluate("()=>EQApp.user.exp")
                await page.click('[data-lk-next]'); await page.wait_for_timeout(900)
                if k == 0:
                    e2 = await page.evaluate("()=>EQApp.user.exp")
                    check(e2 == e1 + 5, f'จบ Step 1 ได้ +5 EXP เข้า EXP บัญชี ({e1}->{e2}) HUD อัปเดตทันที')
            if await page.locator('.lk-result').count(): break
        await page.screenshot(path=f'{OUT}{W}_4result.png', full_page=True)
        res = await page.evaluate("()=>document.querySelector('.lk-result h1')?.textContent")
        check(res is not None, f'หน้าผลบทเรียน: {res}')
        exp1 = await page.evaluate("()=>EQApp.user.exp")
        check(exp1 > exp0, f'EXP บัญชีเพิ่ม {exp0}->{exp1}')
        hud = await page.evaluate("()=>document.getElementById('hud-exp-label').textContent")
        print('HUD', hud, 'kinds', kinds)
        # Logout -> Login -> ความคืบหน้ายังอยู่
        await page.evaluate("()=>localStorage.removeItem('wq_token')"); await page.reload(); await page.wait_for_timeout(2000)
        lg = await page.evaluate(LOGIN, name)
        await page.evaluate("t=>localStorage.setItem('wq_token',t)", lg['token']); await page.reload(); await page.wait_for_timeout(2500)
        check(await page.evaluate("()=>EQApp.user.exp") == exp1, 'EXP หลัง login ใหม่ตรงกัน (เก็บที่เซิร์ฟเวอร์)')
        await page.evaluate(f"()=>EQGrammar.openTopic('{TOPIC}')"); await page.wait_for_timeout(1500)
        done = await page.locator('.gl-stepitem.is-done').count()
        check(done == 12, f'หลัง login ใหม่: ผ่าน {done}/12 ขั้น')
        # เริ่มรอบใหม่ แล้วทำ 2 ขั้น ออก -> การ์ดเรียนต่อ
        await page.click('[data-gl-act="lesson-restart"]'); await page.wait_for_timeout(1500)
        await page.click('[data-lk-next]'); await page.wait_for_timeout(900)
        await page.click('[data-lk-exit]'); await page.wait_for_timeout(800)
        await page.evaluate("()=>EQApp.navigateTo('grammar')"); await page.wait_for_timeout(1500)
        cont = await page.evaluate("()=>document.querySelector('.gl-continue')?.textContent.replace(/\\s+/g,' ')")
        check(cont is not None and 'Step 2 of 12' in cont, f'Continue Learning: {cont}')
        await page.screenshot(path=f'{OUT}{W}_5continue.png')
        await page.evaluate("()=>EQApp.navigateTo('home')"); await page.wait_for_timeout(1800)
        await page.screenshot(path=f'{OUT}{W}_6home.png', full_page=True)
        check(not errs, f'ไม่มี JS error {errs[:3]}')
        await b.close()
    print('FAILS', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
