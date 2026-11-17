"""E2E: v1.10.0 Phase 3 — Writing Studio + ผู้ช่วยค้นคำตอบ (ไม่ใช้ AI) · desktop 1280 · tablet 820 · mobile 390
   ใช้: python3 test/e2e/phase3_e2e.py [outdir]   (เซิร์ฟเวอร์ :3100 + DB eq_dev)"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/phase3_e2e'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
TEXT = ('Last weekend i go to Chiang Mai with my family. The food was very good and the hotel was very good too. '
        'We visited a old temple and bought a lot of souvenirs. However, the journey was long, although the scenery was remarkable.')
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
async def layout(pg, tag, where, scope):
    lay = await pg.evaluate("""(scope)=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll(scope+' button, '+scope+' input, '+scope+' summary')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.classList.contains('tq-link')&&(r.width<44||r.height<44)}).map(x=>(x.className||x.tagName)+':'+(x.textContent||'').trim().slice(0,12))})""", scope)
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []; posts = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: posts.append(r.url) if r.method == 'POST' else None)
    await pg.goto(URL); await pg.wait_for_timeout(300)
    tok = (await pg.evaluate(REG, 'p3e%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    await pg.goto(URL + '/?c=%d#/grammar' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    await pg.wait_for_selector('#screen-gl:not(.hidden) [data-nav-to="write"]', timeout=30000)
    check(await pg.locator('#screen-gl [data-nav-to="help"]').count() == 1, f'{tag}: หน้าแกรมม่ามีทางเข้า Writing Studio + ผู้ช่วย')
    # ---------- Writing Studio ----------
    await pg.click('#screen-gl [data-nav-to="write"]')
    await pg.wait_for_selector('#st-text', timeout=20000)
    await pg.click('[data-st-prompt="a2-weekend"]')
    check('สุดสัปดาห์ที่ผ่านมา' in await pg.inner_text('.st-cur'), f'{tag}: เลือกโจทย์แล้วแสดงโจทย์')
    await pg.fill('#st-text', TEXT); await pg.fill('#st-targets', 'journey, delicious')
    await layout(pg, tag, 'Writing Studio (ก่อนตรวจ)', '#screen-write:not(.hidden)')
    await pg.click('#st-form button[type=submit]')
    await pg.wait_for_selector('#st-result .st-tiles', timeout=20000)
    res = await pg.inner_text('#st-result')
    check('Last weekend' in res and 'an' in res, f'{tag}: ผลตรวจบอกข้อผิด (กริยาอดีต / a-an)')
    check(await pg.locator('.st-bar span').count() >= 2, f'{tag}: แถบระดับคำศัพท์ CEFR')
    check(await pg.locator('.st-chip.is-miss').count() == 1, f'{tag}: คำเป้าหมายที่ยังไม่ได้ใช้')
    check(not any('openai' in p or 'anthropic' in p or 'googleapis' in p for p in posts), f'{tag}: ไม่เรียกบริการ AI ภายนอก')
    await layout(pg, tag, 'Writing Studio (ผลตรวจ)', '#screen-write:not(.hidden)')
    await pg.screenshot(path=f'{OUT}/{tag}_write.png', full_page=True)
    # ---------- ผู้ช่วยค้นคำตอบ ----------
    await pg.evaluate("()=>EQApp.navigateTo('help')")
    await pg.wait_for_selector('#st-answers .st-ask', timeout=20000)
    await pg.locator('#st-answers .st-ask').first.click()
    await pg.wait_for_selector('#st-answers .st-faq', timeout=20000)
    check('for' in await pg.inner_text('#st-answers .st-faq'), f'{tag}: คำถามตัวอย่าง → คำตอบ FAQ')
    await pg.fill('#st-q', 'delicious'); await pg.click('#st-search button[type=submit]')
    await pg.wait_for_selector('#st-answers .st-words li', timeout=20000)
    check('อร่อย' in await pg.inner_text('#st-answers'), f'{tag}: ค้นคำศัพท์ → คำแปล + ตัวอย่าง')
    await pg.fill('#st-q', 'present perfect'); await pg.click('#st-search button[type=submit]')
    await pg.wait_for_selector('#st-answers .st-topic', timeout=20000)
    await layout(pg, tag, 'ผู้ช่วยค้นคำตอบ', '#screen-help:not(.hidden)')
    await pg.screenshot(path=f'{OUT}/{tag}_help.png', full_page=True)
    await pg.locator('#st-answers .st-topic').first.click()
    await pg.wait_for_selector('#screen-gl-topic:not(.hidden)', timeout=20000)
    check(True, f'{tag}: กดหัวข้อ → เปิดบทเรียนไวยากรณ์')
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
