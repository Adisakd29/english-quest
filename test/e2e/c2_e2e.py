"""E2E (Part 52): Login → Vocabulary → C2 → Open Unit → Learn Step → Quick Practice → Earn EXP → Continue → Guess from Context
   → Answer Wrong → Explanation → Review Queue → Complete Lesson → Logout → Login → Progress remains  (+ ไม่มี scroll แนวนอนบนมือถือ)"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright
EQ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
LOGIN = """async (n)=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:n+"@gmail.com",password:"password123"})});return r.json()}"""
OUT = os.environ.get('E2E_OUT', '/tmp/c2_e2e_')
W = int(sys.argv[1]) if len(sys.argv) > 1 else 390
THEME = sys.argv[2] if len(sys.argv) > 2 else 'light'
UNIT = 'C2-senses-1'
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def psql(sql): subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True)
def answers(uid):
    r = subprocess.run(['node', 'test/e2e/c2_answers.js', str(uid), UNIT], cwd=EQ, capture_output=True, text=True, check=True)
    return json.loads(r.stdout.strip().splitlines()[-1])

async def overflow(page, tag):
    sw = await page.evaluate("()=>[document.documentElement.scrollWidth, innerWidth]")
    check(sw[0] <= sw[1] + 1, f'{tag}: ไม่มี scroll แนวนอน ({sw[0]} ≤ {sw[1]})')

async def dismiss(page):
    for sel in ['#levelup-ok', '.modal-overlay [data-close]', '.modal-overlay .btn-primary']:
        if await page.locator(sel).count() and await page.locator(sel).first.is_visible():
            await page.locator(sel).first.click(); await page.wait_for_timeout(300); return True
    return False

async def answer_current(page, ans, wrong=False):
    await page.wait_for_timeout(300); await dismiss(page)
    sel = '.screen:not(.hidden) .gl-item-body'
    if await page.locator(f'{sel} input[data-ans]').count():
        await page.fill(f'{sel} input[data-ans]', 'zzzz' if wrong else ans['text'])
    else:
        n = await page.locator(f'{sel} .gl-choice').count()
        k = ans['index'] if not wrong else (ans['index'] + 1) % n
        await page.locator(f'{sel} .gl-choice').nth(k).click()
    await dismiss(page)
    await page.click('.screen:not(.hidden) [data-submit]')
    await page.wait_for_selector('.screen:not(.hidden) .gl-fb', timeout=5000)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        ctx = await b.new_context(viewport={'width': W, 'height': 844}, has_touch=W < 500, color_scheme='dark' if THEME == 'dark' else 'light')
        page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto('http://localhost:3100'); await page.wait_for_timeout(1500)
        name = 'c2e%d' % random.randint(1000, 999999)
        r = await page.evaluate(REG, name)
        await page.evaluate("t=>localStorage.setItem('wq_token',t)", r['token']); await page.reload(); await page.wait_for_timeout(2200)
        uid = await page.evaluate("()=>EQApp.user.id")
        psql(f"INSERT INTO assessments (user_id, kind, ref, questions, status, passed, completed_at) VALUES ({uid}, 'boss', 'C1', '[]', 'completed', TRUE, NOW())")
        ANS = answers(uid)
        exp0 = await page.evaluate("()=>EQApp.user.exp")

        # Vocabulary → C2
        await page.evaluate("()=>EQApp.navigateTo('learn')"); await page.wait_for_timeout(1500)
        await page.click('#path-levels [data-level="C2"]'); await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}{W}_{THEME}_1path.png')
        n_units = await page.locator('.path-unit[data-unit^="C2-"]').count()
        check(n_units >= 10, f'Learning Path แสดง Unit ของ C2 ({n_units})')
        await overflow(page, 'Path C2')
        await page.click(f'.path-unit[data-unit="{UNIT}"]'); await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}{W}_{THEME}_2overview.png', full_page=True)
        check(await page.locator('#screen-c2-lesson:not(.hidden) [data-start]').count() == 1, 'เปิด Unit C2 → หน้าภาพรวมบทเรียน')
        await page.click('#screen-c2-lesson [data-start]'); await page.wait_for_timeout(1200)

        # Learn steps 1–3
        for k in range(3):
            cnt = await page.text_content('#screen-c2-lesson .gl-play-count')
            check(cnt.strip() == f'Step {k+1}/12', f'ขั้นเรียน {k+1}: {cnt.strip()}')
            await page.screenshot(path=f'{OUT}{W}_{THEME}_3learn{k+1}.png', full_page=True)
            await overflow(page, f'Learn step {k+1}')
            await page.click('#screen-c2-lesson [data-next]'); await page.wait_for_timeout(900)

        # Quick Check: ตอบถูก → ได้ EXP
        ids = await page.evaluate("()=>[...document.querySelectorAll('#screen-c2-lesson [data-box]')].length")
        first_q = True; got_exp = False
        while await page.locator('#screen-c2-lesson [data-box]').count():
            item_id = await page.evaluate("""async()=>{const r=await EQApp.api('/c2/lessons/C2-senses-1/steps/3');return r.content.items.find(x=>r.answered[x.id]===undefined)?.id}""")
            await answer_current(page, ANS[item_id])
            if first_q:
                await page.screenshot(path=f'{OUT}{W}_{THEME}_4quick_fb.png', full_page=True); first_q = False
                got_exp = await page.locator('#screen-c2-lesson .lk-fb-exp').count() > 0
            await dismiss(page); await page.click('#screen-c2-lesson [data-go]'); await page.wait_for_timeout(700)
        check(got_exp, 'ตอบถูกใน Quick Check → เห็น +EXP')
        exp1 = await page.evaluate("()=>EQApp.user.exp")
        check(exp1 > exp0, f'EXP บัญชีเพิ่ม ({exp0} → {exp1})')

        # Continue: ออกกลางบท แล้วกลับมาเรียนต่อจากศูนย์ C2
        await dismiss(page); await page.click('#screen-c2-lesson [data-exit]'); await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}{W}_{THEME}_5hub.png', full_page=True)
        await overflow(page, 'ศูนย์ C2')
        check(await page.locator('#screen-c2 [data-c2-unit].c2-mode-main').count() == 1, 'ศูนย์ C2 มีปุ่ม "เรียนต่อ"')
        await dismiss(page); await page.click('#screen-c2 .c2-mode-main'); await page.wait_for_timeout(1500)
        cnt = (await page.text_content('#screen-c2-lesson .gl-play-count')).strip()
        check(cnt in ('Step 4/12', 'Step 5/12'), f'เรียนต่อจากขั้นที่ค้าง ({cnt})')

        # เดินขั้นที่เหลือ: Context Challenge (ขั้น 10) ตอบผิด 1 ข้อแล้วดูคำอธิบาย
        wrong_done = False
        for _ in range(40):
            cnt = (await page.text_content('#screen-c2-lesson .gl-play-count') or '').strip() if await page.locator('#screen-c2-lesson .gl-play-count').count() else ''
            if not cnt: break
            k = int(cnt.split()[1].split('/')[0]) - 1
            if await page.locator('#screen-c2-lesson [data-box]').count():
                item_id = await page.evaluate(f"""async()=>{{const r=await EQApp.api('/c2/lessons/C2-senses-1/steps/{k}');return r.content.items.find(x=>r.answered[x.id]===undefined)?.id}}""")
                make_wrong = (k == 9 and not wrong_done)
                await answer_current(page, ANS[item_id], wrong=make_wrong)
                if make_wrong:
                    wrong_done = True
                    await page.screenshot(path=f'{OUT}{W}_{THEME}_6context_wrong.png', full_page=True)
                    passage = await page.locator('#screen-c2-lesson .gl-ctx mark.gl-hl').count()
                    check(passage >= 1, 'Guess from Context: มีข้อความพร้อมไฮไลต์คำเป้าหมาย')
                    expl = (await page.text_content('#screen-c2-lesson .gl-fb-explain') or '').strip()
                    check(len(expl) > 10, f'ตอบผิด → มีคำอธิบาย/เบาะแส ({expl[:40]}…)')
                    check(await page.locator('#screen-c2-lesson .gl-fb-mine').count() == 1, 'บอกว่าทำไมตัวเลือกที่เลือกจึงผิด')
                    await overflow(page, 'Context feedback')
                await dismiss(page); await page.click('#screen-c2-lesson [data-go]'); await page.wait_for_timeout(600)
            elif await page.locator('#screen-c2-lesson .lk-tf').count() and await page.locator('#screen-c2-lesson [data-next][disabled]').count():
                await dismiss(page)
                for card in await page.locator('#screen-c2-lesson .lk-tf').all():
                    await card.locator('[data-tf-ans="true"]').click()
                await page.screenshot(path=f'{OUT}{W}_{THEME}_7review.png', full_page=True)
                await dismiss(page); await page.click('#screen-c2-lesson [data-next]'); await page.wait_for_timeout(900)
            else:
                if k in (4, 6, 8): await page.screenshot(path=f'{OUT}{W}_{THEME}_3learn{k+1}.png', full_page=True)
                await dismiss(page); await page.click('#screen-c2-lesson [data-next]'); await page.wait_for_timeout(900)
            if await page.locator('#screen-c2-lesson .lk-result').count(): break
        await page.wait_for_timeout(800)
        await page.screenshot(path=f'{OUT}{W}_{THEME}_8result.png', full_page=True)
        check(wrong_done, 'ผ่านขั้น Context Challenge แล้วตอบผิดได้')
        res_text = await page.text_content('#screen-c2-lesson .lk-result') or ''
        check('เข้าคิวทบทวนแล้ว' in res_text, 'จบบท: ข้อที่ผิดเข้าคิวทบทวน (Review Queue)')
        check('ผ่านบทเรียน C2 แล้ว' in res_text, 'จบบทเรียน (ผ่าน ≥ 80%)')
        await overflow(page, 'Result')

        # ฝึกจุดอ่อนจากคิวทบทวน (Challenge)
        await dismiss(page); await page.click('#screen-c2-lesson [data-practice]'); await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}{W}_{THEME}_9practice.png', full_page=True)
        picks = await page.evaluate("()=>[...document.querySelectorAll('#screen-c2-practice .c2-tag')].map(x=>x.textContent)")
        check(any('จุดอ่อน' in x or 'ใหม่' in x or 'กำลังเรียน' in x for x in picks), f'Challenge ติดป้ายที่มาของข้อ {picks[:2]}')
        await overflow(page, 'Practice')

        # Logout → Login → progress remains
        await page.evaluate("()=>localStorage.removeItem('wq_token')"); await page.reload(); await page.wait_for_timeout(1200)
        r2 = await page.evaluate(LOGIN, name)
        await page.evaluate("t=>localStorage.setItem('wq_token',t)", r2['token']); await page.reload(); await page.wait_for_timeout(2200)
        await page.evaluate("()=>EQC2.openHub()"); await page.wait_for_timeout(1500)
        core = await page.text_content('#screen-c2 .c2-stat b')
        check(core and not core.startswith('0/'), f'ล็อกอินใหม่: ความคืบหน้า C2 ยังอยู่ ({core})')
        unit_meta = await page.text_content(f'#screen-c2 [data-c2-unit="{UNIT}"] .c2-unit-meta')
        check('ผ่าน' in unit_meta or not unit_meta.startswith('0/'), f'Unit ยังแสดงความคืบหน้า ({unit_meta})')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_10hub_after.png', full_page=True)

        # Vocabulary search: C2
        await page.evaluate("()=>EQApp.navigateTo('words')"); await page.wait_for_timeout(1200)
        await dismiss(page); await page.click('[data-vb-level="C2"]'); await page.wait_for_timeout(1000)
        rows = await page.locator('.vb-row').count()
        check(rows > 0, f'ค้นหาคำศัพท์: กรอง C2 ได้ ({rows} แถว)')
        await page.fill('#vb-q', 'slack'); await page.wait_for_timeout(1200)
        txt = await page.text_content('#vb-list')
        check('cut someone some slack' in txt, 'ค้นวลี C2 ด้วยคำกลางวลี')
        await page.locator('.vb-row').first.click(); await page.wait_for_timeout(1200)
        await page.screenshot(path=f'{OUT}{W}_{THEME}_11card.png', full_page=True)
        check(await page.locator('.vd-c2').count() == 1, 'การ์ดคำศัพท์แสดงรายละเอียด C2')
        await overflow(page, 'Vocab card C2')
        check(not errs, f'ไม่มี JS error {errs[:2]}')
        await b.close()
    print('FAILS:', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
