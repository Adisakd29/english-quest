"""E2E: v1.10.0 Phase 2 — แบบวัดระดับ v2 (50 ข้อ · ไวยากรณ์ CEFR) + คลังข้อสอบแกรมม่าเสริม (รวมระบบไวยากรณ์)
   ใช้: python3 test/e2e/phase2_e2e.py [outdir]   (เซิร์ฟเวอร์ :3100 + DB eq_dev) · desktop 1280 · tablet 820 · mobile 390"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/phase2_e2e'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
async def layout(pg, tag, where, scope):
    lay = await pg.evaluate("""(scope)=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll(scope+' button')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&(r.width<44||r.height<44)}).map(x=>x.id||x.className)})""", scope)
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    tok = (await pg.evaluate(REG, 'p2e%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    await pg.goto(URL + '/?c=%d#/placement' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    await pg.wait_for_selector('#pl-start:not([disabled])', timeout=20000)
    check('50 ข้อ' in await pg.inner_text('#screen-placement'), f'{tag}: หน้าแรกบอก 50 ข้อ')
    await pg.click('#pl-start'); await pg.wait_for_selector('#pl-choices .quiz-choice', timeout=20000)
    counter = await pg.inner_text('#pl-counter')
    check('50' in counter, f'{tag}: แบบทดสอบ 50 ข้อ ({counter.strip()})')
    await layout(pg, tag, 'แบบวัดระดับ', '#screen-placement:not(.hidden)')
    await pg.screenshot(path=f'{OUT}/{tag}_placement.png', full_page=False)
    for i in range(50):
        await pg.locator('#pl-choices .quiz-choice').first.click()
        await pg.wait_for_timeout(60)
        if await pg.locator('#pl-result:not(.hidden)').count(): break
        if await pg.locator('.modal-overlay button').count():   # ยืนยันส่งคำตอบ
            await pg.locator('.modal-overlay button').last.click()
    await pg.wait_for_selector('#pl-result:not(.hidden)', timeout=20000)
    txt = await pg.inner_text('#pl-result')
    check('/50' in txt or '50' in await pg.inner_text('#pl-result-score'), f'{tag}: ผลคะแนนจาก 50 ข้อ')
    check(await pg.locator('#pl-result-grammar').count() == 1, f'{tag}: แสดงระดับไวยากรณ์')
    await layout(pg, tag, 'ผลแบบวัดระดับ', '#screen-placement:not(.hidden)')
    await pg.screenshot(path=f'{OUT}/{tag}_placement_result.png', full_page=True)
    # คลังข้อสอบแกรมม่าเสริม (ชุดเดิม) → ปุ่มไปหลักสูตรหลัก
    await pg.evaluate("()=>EQApp.navigateTo('grammar-classic')")
    await pg.wait_for_selector('#screen-grammar-list:not(.hidden) .gp-merged', timeout=20000)
    check('หลักสูตรแกรมม่า CEFR' in await pg.inner_text('.gp-merged'), f'{tag}: คลังข้อสอบเสริมบอกว่าเส้นทางหลักคือ CEFR')
    await layout(pg, tag, 'คลังข้อสอบเสริม', '#screen-grammar-list:not(.hidden) .gp-merged')
    await pg.screenshot(path=f'{OUT}/{tag}_grammar_classic.png', full_page=False)
    await pg.click('.gp-merged [data-nav-to="grammar"]')
    await pg.wait_for_selector('#screen-gl:not(.hidden) [data-nav-to="grammar-classic"]', timeout=20000)
    check('ไม่ใช่เส้นทางหลัก' in await pg.inner_text('#screen-gl'), f'{tag}: หน้าหลักสูตร CEFR ระบุว่าชุดเดิมเป็นคลังเสริม')
    check(not errs, f'{tag}: ไม่มี JS error {errs[:3]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, 1280, 900, False, 'desktop')
        await run(b, 820, 1180, True, 'tablet')
        await run(b, 390, 844, True, 'mobile')
        await b.close()
    print('\nFAILS:', len(fails)); [print(' -', f) for f in fails]
    print('ALL PASS' if not fails else '')
asyncio.run(main())
