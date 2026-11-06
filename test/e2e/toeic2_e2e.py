"""E2E: TOEIC Listening Part 2 (#/toeic-p2) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/toeic2_e2e.py [outdir]
   ตรวจ: Hub → Part 2 · Audio Check · Practice (ก่อนตอบไม่มีตัวหนังสือ · ต้องเล่นเสียงก่อนตอบ · เฉลย + transcript 4 บรรทัด · EXP) ·
         สรุปผล · Review Mistakes (ฟังซ้ำ) · Mock (เล่นต่อเนื่อง · เสียงจบแล้วรอ 5 วิไปข้อถัดไปเอง · ออกแล้วกลับมาเริ่มข้อถัดไป · ข้อที่ผ่านแล้วตอบไม่ได้) ·
         หน้าแรกแถว Listening รวม Part 1–2 · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/toeic2_e2e'
os.makedirs(OUT, exist_ok=True)
EQ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANK = {q['id']: q for q in json.load(open(os.path.join(EQ, 'data/toeic/part2/bank.json')))['questions']}
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()

async def key_now(pg):
    st = await pg.evaluate("()=>{const P=EQToeic2._state();return {sid:P.s.id,i:P.i}}")
    it = json.loads(psql(f"SELECT items FROM toeic_sessions WHERE id = {st['sid']}"))[st['i']]
    q = BANK[it['qid']]
    return next(v for v in q['variants'] if v['v'] == it['variant'])['correctOption'], q
async def skip_audio(pg):
    await pg.wait_for_function("()=>{const a=EQToeic2._audio();return a&&a.duration>0&&!a.paused}", timeout=15000)
    await pg.evaluate("()=>{const a=EQToeic2._audio(); a.currentTime=Math.max(0,a.duration-0.15)}")

async def layout(pg, tag, where):
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('.t5-screen:not(.hidden) button, .modal-overlay button')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.closest('summary')&&!x.classList.contains('tq-icon-btn')&&!x.classList.contains('mini-btn')&&(r.width<44||r.height<44)}).map(x=>x.className+':'+x.textContent.trim().slice(0,14))})""")
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    name = 't2e%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>{localStorage.setItem('wq_token',t);localStorage.removeItem('eq_t2_cfg')}", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")

    await pg.evaluate("()=>EQApp.navigateTo('toeic')"); await pg.wait_for_selector('#screen-toeic .tq-part', timeout=20000)
    await pg.click('[data-tq-nav="toeic-p2"]'); await pg.wait_for_selector('#t2-title', timeout=20000)
    check('#/toeic-p2' in pg.url, f'{tag}: Hub → Part 2 Landing')
    await layout(pg, tag, 'Landing')
    await pg.screenshot(path=f'{OUT}/{tag}_landing.png', full_page=True)

    # Practice 10 ข้อ (+ Audio Check)
    await pg.click('[data-t2-act="practice"]'); await pg.wait_for_selector('.tq-setup')
    await pg.click('.tq-setup [data-cfg="size"][data-v="10"]'); await pg.click('.tq-setup [data-go]')
    await pg.wait_for_selector('.tq-check [data-ok]', timeout=10000)
    await pg.click('.tq-check [data-play]'); await pg.wait_for_timeout(500); await pg.click('.tq-check [data-ok]')
    await pg.wait_for_selector('[data-t2-play]:not([disabled])', timeout=30000)
    k, q = await key_now(pg)
    txt = await pg.inner_text('#screen-toeic2-play')
    check(q['prompt'] not in txt and all(r['text'] not in txt for r in q['responses']), f'{tag}: ก่อนตอบไม่มีตัวหนังสือของคำถาม/คำตอบ')
    check(await pg.locator('[data-t2-ans]:not([disabled])').count() == 0, f'{tag}: ต้องเล่นเสียงก่อนจึงตอบได้')
    await layout(pg, tag, 'ข้อ Practice')
    await pg.screenshot(path=f'{OUT}/{tag}_practice_q.png', full_page=True)
    await pg.click('[data-t2-play]'); await pg.wait_for_selector('[data-t2-ans]:not([disabled])', timeout=15000)
    await skip_audio(pg)
    if mobile: await pg.click(f'[data-t2-ans="{k}"]')
    else: await pg.keyboard.press(str('ABC'.index(k) + 1))
    await pg.wait_for_selector('.tq-result.ok', timeout=10000)
    check(await pg.locator('.t2-line').count() == 4 and q['prompt'] in await pg.inner_text('#t2-after'), f'{tag}: เฉลย + transcript (คำถาม + A–C) + คำแปล')
    check(await pg.locator('.tq-exp').count() == 1, f'{tag}: ได้ EXP')
    await layout(pg, tag, 'เฉลย Practice')
    await pg.screenshot(path=f'{OUT}/{tag}_practice_fb.png', full_page=True)
    for i in range(1, 10):
        await pg.click('[data-t2-next]'); await pg.wait_for_function(f"()=>EQToeic2._state().i==={i}")
        await pg.wait_for_selector('[data-t2-play]:not([disabled])', timeout=30000)
        k, q = await key_now(pg)
        await pg.click('[data-t2-play]'); await pg.wait_for_selector('[data-t2-ans]:not([disabled])', timeout=15000)
        pick = k if i != 1 else next(l for l in 'ABC' if l != k)
        await pg.click(f'[data-t2-ans="{pick}"]'); await pg.wait_for_selector('.tq-result', timeout=10000)
        if i == 1: check(await pg.locator(f'.tq-ans.is-right[data-t2-ans="{k}"]').count() == 1, f'{tag}: ตอบผิด → ไฮไลต์คำตอบที่ถูก')
    await pg.click('[data-t2-next]'); await pg.wait_for_selector('#t2-res-title', timeout=15000)
    sc = (await pg.inner_text('.tq-score b')).replace(' ', '')
    check(sc == '9/10', f'{tag}: สรุปผล Practice {sc}')
    await pg.screenshot(path=f'{OUT}/{tag}_result.png', full_page=False)

    await pg.click('[data-t2-nav="toeic-p2"]'); await pg.wait_for_selector('#t2-title')
    await pg.click('[data-t2-nav="toeic-p2-review"]'); await pg.wait_for_selector('#t2-rev-title')
    check(await pg.locator('#screen-toeic2 .tq-rv').count() == 1, f'{tag}: Review Mistakes มี 1 ข้อ')
    await pg.click('#screen-toeic2 .tq-rv summary'); await pg.click('#screen-toeic2 [data-t2-rvplay]')
    await pg.wait_for_function("()=>{const a=EQToeic2._audio();return a&&!a.paused}", timeout=10000)
    check(True, f'{tag}: Review ฟังเสียงซ้ำได้')
    await layout(pg, tag, 'Review')

    # Mock
    await pg.click('[data-t2-nav="toeic-p2"]'); await pg.wait_for_selector('#t2-title')
    await pg.click('[data-t2-act="mock"]'); await pg.click('.modal-overlay [data-go]')
    await pg.wait_for_selector('[data-t2-play]:not([disabled])', timeout=30000)
    sid = await pg.evaluate("()=>EQToeic2._state().s.id")
    k, q = await key_now(pg)
    await pg.click('[data-t2-play]'); await pg.wait_for_selector('[data-t2-ans]:not([disabled])', timeout=15000)
    await pg.click(f'[data-t2-ans="{k}"]'); await pg.wait_for_timeout(300)
    check(await pg.locator('.tq-result').count() == 0, f'{tag}: Mock ไม่บอกถูก/ผิด')
    await skip_audio(pg)
    await pg.wait_for_function("()=>EQToeic2._state()&&EQToeic2._state().i===1", timeout=15000)
    await pg.wait_for_function("()=>{const a=EQToeic2._audio();return a&&!a.paused}", timeout=15000)
    check(True, f'{tag}: ตอบแล้ว + เสียงจบ → ไปข้อ 2 และเล่นเสียงเอง')
    await skip_audio(pg)
    await pg.wait_for_selector('#t2-gap:not([hidden])', timeout=10000)
    await layout(pg, tag, 'Mock รอเลือกคำตอบ')
    await pg.screenshot(path=f'{OUT}/{tag}_mock_gap.png', full_page=False)
    await pg.wait_for_function("()=>EQToeic2._state()&&EQToeic2._state().i===2", timeout=12000)
    check(True, f'{tag}: ไม่ตอบ → ครบ 5 วินาทีไปข้อ 3 เอง')
    await pg.wait_for_timeout(500)
    passed = int(psql(f"SELECT COALESCE(config->>'passed','0') FROM toeic_sessions WHERE id = {sid}"))
    check(passed >= 2, f'{tag}: บันทึกข้อที่ผ่านแล้ว ({passed})')
    # ออกแล้วกลับมา → เริ่มข้อถัดไป
    await pg.evaluate("()=>EQApp.navigateTo('toeic-p2')"); await pg.wait_for_selector('#t2-title', timeout=15000)
    await pg.evaluate(f"()=>EQApp.navigateTo('toeic-p2-play')"); await pg.evaluate(f"()=>{{location.hash='#/toeic-p2-play/{sid}'}}")
    await pg.wait_for_function("()=>EQToeic2._state()&&EQToeic2._state().i>=3", timeout=15000)
    check(True, f'{tag}: ออกกลางคันแล้วกลับมา → เริ่มข้อถัดไป (ข้อ 4)')
    first_q = json.loads(psql(f"SELECT items FROM toeic_sessions WHERE id = {sid}"))[1]['qid']
    r = await pg.evaluate(f"()=>EQApp.api('/toeic/p2/sessions/{sid}/answer',{{method:'POST',body:{{qid:'{first_q}',selected:'A'}}}}).then(()=>'ok').catch(e=>e.code)")
    check(r == 'PASSED', f'{tag}: ข้อที่ผ่านไปแล้วย้อนกลับมาตอบไม่ได้ ({r})')
    await pg.evaluate(f"()=>EQApp.api('/toeic/p2/sessions/{sid}/finish',{{method:'POST',body:{{}}}})")
    await pg.evaluate("()=>EQApp.navigateTo('toeic-p2')"); await pg.wait_for_selector('#t2-title')
    await pg.evaluate(f"()=>{{location.hash='#/toeic-p2-play/{sid}'}}"); await pg.wait_for_selector('#t2-res-title', timeout=15000)
    sc = (await pg.inner_text('.tq-score b')).replace(' ', '')
    check(sc == '1/25' and 'ไม่ได้ตอบ' in await pg.inner_text('.tq-resultpage'), f'{tag}: ผล Mock {sc} + ไม่ได้ตอบ')

    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(900)
    sub = await pg.inner_text('#skill-tq-sub')
    check('Part 1–4' in sub and 'แม่นยำ' in sub, f'{tag}: หน้าแรกแถว Listening รวม Part 1–4 ({sub})')
    check(not errs, f'{tag}: ไม่มี JS error {errs[:2]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        await run(b, 1280, 860, False, 'desktop')
        await run(b, 390, 844, True, 'mobile')
        await b.close()
    print('ALL PASS' if not fails else f'{len(fails)} FAIL')
    sys.exit(1 if fails else 0)

asyncio.run(main())
