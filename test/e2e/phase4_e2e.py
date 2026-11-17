"""E2E: v1.10.0 Phase 4 — TOEIC Academy + คะแนนคาดการณ์ · desktop 1280 · tablet 820 · mobile 390
   ใช้: python3 test/e2e/phase4_e2e.py [outdir]   (เซิร์ฟเวอร์ :3100 + DB eq_dev)"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/phase4_e2e'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
async def layout(pg, tag, where, scope):
    lay = await pg.evaluate("""(scope)=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll(scope+' button, '+scope+' .ta-opt')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.classList.contains('tq-link')&&(r.width<44||r.height<44)}).map(x=>(x.className||x.tagName)+':'+(x.textContent||'').trim().slice(0,12))})""", scope)
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    tok = (await pg.evaluate(REG, 'p4e%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    await pg.goto(URL + '/?c=%d#/toeic' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    await pg.wait_for_selector('#tq-predict .ta-predict', timeout=30000)
    txt = await pg.inner_text('#tq-predict')
    check('ทำข้อใหม่อีก 20 ข้อ' in txt, f'{tag}: ผู้ใช้ใหม่ — คะแนนคาดการณ์บอกจำนวนข้อที่ต้องทำ')
    await layout(pg, tag, 'หน้า TOEIC (คะแนนคาดการณ์)', '#screen-toeic:not(.hidden) #tq-predict')
    await pg.screenshot(path=f'{OUT}/{tag}_toeic_hub.png', full_page=False)
    await pg.click('#tq-predict [data-ta-nav="toeic-academy"]')
    await pg.wait_for_selector('#screen-toeicacademy:not(.hidden) [data-ta-part="3"]', timeout=20000)
    check(await pg.locator('#screen-toeicacademy [data-ta-part]').count() == 7, f'{tag}: Academy มี 7 บท')
    check('200 ข้อ' in await pg.inner_text('.ta-exam'), f'{tag}: บอกรูปแบบข้อสอบจริง (200 ข้อ)')
    await layout(pg, tag, 'Academy (รายการ)', '#screen-toeicacademy:not(.hidden)')
    await pg.click('[data-ta-part="3"]')
    await pg.wait_for_selector('#ta-check .ta-q', timeout=20000)
    check(await pg.locator('.ta-traps li').count() >= 3 and await pg.locator('.ta-steps li').count() >= 4, f'{tag}: บทเรียนมีกับดัก + ขั้นตอน')
    await pg.click('#ta-check button[type=submit]')
    await pg.wait_for_timeout(300)
    check(await pg.locator('.ta-why.is-right, .ta-why.is-wrong').count() == 0, f'{tag}: ยังตอบไม่ครบ = ไม่ส่ง')
    for i in range(3):
        await pg.locator(f'input[name="ta-q{i}"]').first.check()
    await pg.click('#ta-check button[type=submit]')
    await pg.wait_for_selector('#ta-result:not(:empty)', timeout=10000)
    check(await pg.locator('.ta-why.is-right, .ta-why.is-wrong').count() == 3 and await pg.locator('.ta-opt.is-right').count() == 3, f'{tag}: ตรวจคำตอบ + คำอธิบายทุกข้อ')
    await layout(pg, tag, 'Academy (บทเรียน)', '#screen-toeicacademy:not(.hidden)')
    await pg.screenshot(path=f'{OUT}/{tag}_academy_p3.png', full_page=True)
    await pg.click('.ta-next [data-ta-nav="toeic-p3"]')
    await pg.wait_for_function("()=>location.hash.startsWith('#/toeic-p3')", timeout=20000)
    check(True, f'{tag}: ปุ่มไปฝึก Part 3')
    await pg.evaluate("()=>EQApp.navigateTo('toeic-academy')")
    await pg.wait_for_selector('#screen-toeicacademy:not(.hidden) .ta-done', timeout=20000)
    check('เรียนแล้ว' in await pg.inner_text('[data-ta-part="3"]'), f'{tag}: รายการแสดงบทที่เรียนแล้ว')
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
