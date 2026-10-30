"""E2E: ภาษาอังกฤษเพื่อการทำงาน (#/work · เฉพาะสมาชิก Premium) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/work_e2e.py [outdir]
   ตรวจ: หน้าเรียน → ปุ่ม Premium · ยังไม่เป็นสมาชิก: เห็นตัวอย่าง 2 วลี + กล่องชวนสมัคร ไม่มีปุ่มฝึก ·
         สมาชิก: 12 วลี + ปุ่มฟังเสียง · ฝึก 10 ข้อ (เลือกตอบ → เฉลย+คำอธิบาย → ข้อต่อไป) → ผลคะแนน · ความคืบหน้าในหน้ารวม ·
         หน้า Premium มีปุ่มไปหมวดนี้ · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/work_e2e'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
async def layout(pg, tag, where):
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('#screen-work:not(.hidden) button')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&(r.width<44||r.height<44)}).map(x=>x.className+':'+x.textContent.trim().slice(0,14))})""")
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e) + ' @ ' + (e.stack or '')[:300]))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    tok = (await pg.evaluate(REG, 'wke%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    uid = await pg.evaluate("()=>EQApp.user.id")

    # 1) ยังไม่เป็นสมาชิก
    await pg.evaluate("()=>EQApp.navigateTo('learn')"); await pg.wait_for_selector('.wk-open', timeout=20000)
    await pg.click('.wk-open'); await pg.wait_for_selector('#wk-title', timeout=20000)
    check('#/work' in pg.url and await pg.locator('.wk-topic.is-locked').count() == 6 and await pg.locator('.wk-lock').count() == 1, f'{tag}: ยังไม่เป็นสมาชิก → 6 หัวข้อล็อก + กล่องชวนสมัคร')
    await layout(pg, tag, 'หน้ารวม (ล็อก)')
    await pg.screenshot(path=f'{OUT}/{tag}_hub_locked.png', full_page=True)
    await pg.click('[data-wk-topic="emails"]'); await pg.wait_for_selector('#wk-ttitle', timeout=15000)
    check(await pg.locator('.wk-item').count() == 2 and await pg.locator('[data-wk-quiz]').count() == 0 and await pg.locator('.wk-lock').count() == 1, f'{tag}: หัวข้อ (ล็อก) → ตัวอย่าง 2 วลี ไม่มีปุ่มฝึก')
    await pg.screenshot(path=f'{OUT}/{tag}_topic_locked.png', full_page=True)
    await pg.click('.wk-lock [data-wk-nav="premium"]'); await pg.wait_for_selector('#pm-title', timeout=15000)
    check('ภาษาอังกฤษเพื่อการทำงาน' in await pg.inner_text('.pmc-table'), f'{tag}: ปุ่มชวนสมัคร → หน้า Premium (มีสิทธิ์หมวดนี้ในรายการ)')

    # 2) เป็นสมาชิก
    psql(f"INSERT INTO memberships (user_id, plan, expires_at) VALUES ({uid}, 'monthly', NOW() + INTERVAL '30 days') ON CONFLICT (user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at")
    await pg.goto(URL + '/?c=%d#/premium' % random.randint(1, 10**6)); await pg.wait_for_selector('.pm-go-work', timeout=30000)
    await pg.click('.pm-go-work'); await pg.wait_for_selector('#wk-title', timeout=15000)
    check(await pg.locator('.wk-topic.is-locked').count() == 0 and await pg.locator('.wk-lock').count() == 0, f'{tag}: หน้า Premium → หมวดนี้ (ปลดล็อกแล้ว)')
    await pg.click('[data-wk-topic="interview"]'); await pg.wait_for_selector('#wk-ttitle', timeout=15000)
    check(await pg.locator('.wk-item').count() == 12, f'{tag}: สมาชิกเห็นครบ 12 วลี')
    check(await pg.locator('.wk-item [data-wk-say]').count() >= 12, f'{tag}: มีปุ่มฟังเสียง')
    await layout(pg, tag, 'หน้าหัวข้อ')
    await pg.screenshot(path=f'{OUT}/{tag}_topic.png', full_page=True)
    await pg.click('[data-wk-quiz] >> nth=0'); await pg.wait_for_selector('.wk-q', timeout=15000)
    await layout(pg, tag, 'แบบฝึก')
    await pg.screenshot(path=f'{OUT}/{tag}_quiz.png', full_page=True)
    for i in range(10):
        await pg.click('[data-wk-opt="0"]'); await pg.wait_for_selector('.wk-fb', timeout=10000)
        if i == 0:
            check(await pg.locator('.wk-opt.is-right').count() == 1 and len((await pg.inner_text('.wk-fb')).strip()) > 20, f'{tag}: ตอบแล้วเห็นเฉลย + คำอธิบาย')
            await pg.screenshot(path=f'{OUT}/{tag}_feedback.png', full_page=True)
        await pg.click('[data-wk-next]')
        if i < 9: await pg.wait_for_function(f"()=>document.getElementById('wk-qtitle')&&document.getElementById('wk-qtitle').textContent.includes('ข้อ {i + 2}')", timeout=10000)
    await pg.wait_for_selector('#wk-rtitle', timeout=15000)
    score = int(await pg.inner_text('.tq-score b'))
    check(0 <= score <= 10 and 'ชำนาญแล้ว' in await pg.inner_text('#screen-work'), f'{tag}: ผลคะแนน {score}/10 + ความชำนาญ')
    await pg.screenshot(path=f'{OUT}/{tag}_result.png', full_page=True)
    await pg.click('[data-wk-back-topic] >> nth=0'); await pg.wait_for_selector('#wk-ttitle', timeout=15000)
    await pg.click('[data-wk-hub]'); await pg.wait_for_selector('#wk-title', timeout=15000)
    check('แม่นยำ' in await pg.inner_text('[data-wk-topic="interview"]'), f'{tag}: หน้ารวมแสดงความคืบหน้าหัวข้อที่ฝึก')
    await layout(pg, tag, 'หน้ารวม (สมาชิก)')
    await pg.screenshot(path=f'{OUT}/{tag}_hub.png', full_page=True)
    check(not errs, f'{tag}: ไม่มี JS error {errs[:3]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, 1280, 900, False, 'desktop')
        await run(b, 390, 844, True, 'mobile')
        await b.close()
    print('\nFAILS:', len(fails)); [print(' -', f) for f in fails]
    print('ALL PASS' if not fails else '')
asyncio.run(main())
