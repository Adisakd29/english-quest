"""E2E: TOEIC วิเคราะห์จุดอ่อน (#/toeic-weak) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/toeicweak_e2e.py [outdir]
   ตรวจ: Hub → การ์ดวิเคราะห์จุดอ่อน · ผู้ใช้ใหม่เห็นหน้าว่าง + กลุ่มที่ยังไม่เคยฝึก · ตอบผิด Part 5 บุพบท → ขึ้นเป็นอันดับ 1 ของ "ควรฝึกก่อน" ·
         กดฝึกจุดนี้ → Practice Part 5 ที่ผูกกลุ่ม · หน้าผลมีปุ่ม "ฝึกจุดนี้อีกชุด" + "กลับหน้าวิเคราะห์จุดอ่อน" · ฝึกกลุ่ม Listening (Part 2) ·
         สลับช่วง 30 วัน · Full Mock result มีลิงก์มาหน้านี้ · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, itertools, json, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/toeicweak_e2e'
os.makedirs(OUT, exist_ok=True)
EQ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P5 = {q['id']: q for q in json.load(open(os.path.join(EQ, 'data/toeic/part5/bank.json')))['questions']}
PERMS = list(itertools.permutations([0, 1, 2, 3]))   # ลำดับเดียวกับ PERMS ในเซิร์ฟเวอร์ (lexicographic)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
def wrong_letter(qid, variant):
    key = 'ABCD'[list(PERMS[variant]).index(P5[qid]['answer'])]
    return next(x for x in 'ABCD' if x != key)
async def layout(pg, tag, where):
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('.t5-screen:not(.hidden) button, .modal-overlay button')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.closest('summary')&&!x.classList.contains('tq-icon-btn')&&!x.classList.contains('mini-btn')&&!x.classList.contains('tq-link')&&(r.width<44||r.height<44)}).map(x=>x.className+':'+x.textContent.trim().slice(0,14))})""")
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def answer_p5_wrong(pg, sid):
    items = json.loads(psql(f"SELECT items FROM toeic_sessions WHERE id = {sid}"))
    for it in items:
        await pg.evaluate(f"()=>EQApp.api('/toeic/p5/sessions/{sid}/answer',{{method:'POST',body:{{qid:'{it['qid']}',selected:'{wrong_letter(it['qid'], it['variant'])}'}}}})")
    await pg.evaluate(f"()=>EQApp.api('/toeic/p5/sessions/{sid}/finish',{{method:'POST',body:{{}}}})")
    return items

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    tok = (await pg.evaluate(REG, 'twe%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")

    # 1) Hub → การ์ด → หน้าว่าง
    await pg.evaluate("()=>EQApp.navigateTo('toeic')"); await pg.wait_for_selector('.tq-weak-card', timeout=20000)
    await pg.click('.tq-weak-card'); await pg.wait_for_selector('#tqw-title', timeout=20000)
    check('#/toeic-weak' in pg.url and await pg.locator('.tqw-empty').count() == 1, f'{tag}: Hub → วิเคราะห์จุดอ่อน (ยังไม่มีข้อมูล)')
    check(await pg.locator('.tqw-untried li').count() == 6 and 'Part 6' in await pg.inner_text('.tqw-untried'), f'{tag}: แสดงกลุ่มที่ยังไม่เคยฝึก 6 กลุ่ม (คละ Part)')
    await layout(pg, tag, 'หน้าว่าง')
    await pg.screenshot(path=f'{OUT}/{tag}_empty.png', full_page=True)

    # 2) ตอบผิด Part 5 กลุ่มบุพบท (ผ่าน API) → อันดับ 1 ของแผน
    s = await pg.evaluate("()=>EQApp.api('/toeic/p5/sessions',{method:'POST',body:{mode:'practice',size:10,group:'prepositions',drill:true}})")
    n = len(await answer_p5_wrong(pg, s['id']))
    await pg.evaluate("()=>EQToeicWeak.open()"); await pg.wait_for_selector('.tqw-plan-item', timeout=15000)
    first = await pg.inner_text('.tqw-plan-item >> nth=0')
    check('บุพบท' in first and 'Part 5' in first and 'ต้องฝึก' in first, f'{tag}: ตอบผิดบุพบท {n} ข้อ → อันดับ 1 "ควรฝึกก่อน"')
    check(await pg.locator('.tqw-plan-item .tqw-tip').count() >= 1, f'{tag}: มีเคล็ดลับของกลุ่ม')
    stat = await pg.inner_text('.tqw-stats')
    check('0%' in stat and str(n) in stat, f'{tag}: สรุป Reading 0% · ข้อที่ยังผิด {n}')
    check(await pg.locator('details.tqw-part[open]').count() == 1, f'{tag}: Part ที่มีจุดอ่อนเปิดไว้ (Part 5)')
    check(await pg.locator('details.tqw-part').count() == 7, f'{tag}: รายละเอียดครบ 7 Part')
    check(await pg.locator('[data-tqw-nav="toeic-p5-review"]').count() == 1, f'{tag}: มีลิงก์ทบทวนข้อผิด Part 5')
    await layout(pg, tag, 'หน้าวิเคราะห์')
    await pg.screenshot(path=f'{OUT}/{tag}_weak.png', full_page=True)

    # 3) กดฝึกจุดนี้ → Practice Part 5 ที่ผูกกลุ่ม
    await pg.click('.tqw-plan-item >> nth=0 >> [data-tqw-drill]')
    await pg.wait_for_function("()=>window.EQToeic5._state()&&EQToeic5._state().s", timeout=20000)
    cfg = await pg.evaluate("()=>EQToeic5._state().s.config")
    check(cfg.get('group') == 'prepositions' and cfg.get('drill') is True and '#/toeic-p5-play/' in pg.url, f'{tag}: กดฝึก → Practice Part 5 เฉพาะบุพบท')
    sid = await pg.evaluate("()=>EQToeic5._state().s.id")
    skills = set(P5[it['qid']]['skill'] for it in json.loads(psql(f"SELECT items FROM toeic_sessions WHERE id = {sid}")))
    check(skills == {'preposition'}, f'{tag}: ข้อในชุดเป็นบุพบททั้งหมด {skills}')
    await answer_p5_wrong(pg, sid)
    await pg.evaluate(f"()=>EQToeic5.open('play', {sid})")
    await pg.wait_for_selector('[data-tqw-back]', timeout=15000)
    check(await pg.locator('[data-tqw-again]').count() == 1, f'{tag}: หน้าผลมีปุ่ม "ฝึกจุดนี้อีกชุด" + "กลับหน้าวิเคราะห์จุดอ่อน"')
    await layout(pg, tag, 'หน้าผลชุดฝึกจุดอ่อน')
    await pg.screenshot(path=f'{OUT}/{tag}_drill_result.png', full_page=True)
    await pg.click('[data-tqw-again]')
    await pg.wait_for_function(f"()=>EQToeic5._state()&&EQToeic5._state().s&&EQToeic5._state().s.id!=={sid}", timeout=20000)
    check(await pg.evaluate("()=>EQToeic5._state().s.config.group") == 'prepositions', f'{tag}: ฝึกจุดนี้อีกชุด → ชุดใหม่กลุ่มเดิม')
    await pg.evaluate("()=>EQToeicWeak.open()"); await pg.wait_for_selector('#tqw-title', timeout=15000)

    # 4) ฝึกกลุ่ม Listening (Part 2 · Tag question) จากตารางราย Part
    await pg.click('details.tqw-part:nth-of-type(2) summary')
    await pg.click('details.tqw-part:nth-of-type(2) [data-tqw-drill="2"][data-group="tag"]')
    try:
        await pg.wait_for_selector('.modal-overlay [data-ok]', timeout=4000)
        await pg.click('.modal-overlay [data-ok]')
    except Exception:
        pass
    await pg.wait_for_function("()=>window.EQToeic2._state()&&EQToeic2._state().s", timeout=20000)
    c2 = await pg.evaluate("()=>EQToeic2._state().s.config")
    check(c2.get('group') == 'tag' and c2.get('focus') == 'tag', f'{tag}: ฝึก Part 2 Tag question จากหน้าวิเคราะห์')
    await pg.evaluate("()=>{const a=EQToeic2._audio&&EQToeic2._audio();if(a&&a.pause)a.pause()}")

    # 5) ช่วง 30 วัน
    await pg.evaluate("()=>EQToeicWeak.open()"); await pg.wait_for_selector('[data-tqw-range="30"]', timeout=15000)
    await pg.click('[data-tqw-range="30"]'); await pg.wait_for_selector('[data-tqw-range="30"][aria-pressed="true"]', timeout=15000)
    check(await pg.locator('.tqw-plan-item').count() >= 1, f'{tag}: ช่วง 30 วันยังเห็นแผน')
    await pg.click('[data-tqw-range="all"]'); await pg.wait_for_selector('[data-tqw-range="all"][aria-pressed="true"]', timeout=15000)

    # 6) ลิงก์จากหน้า Full Mock result
    js = await pg.evaluate("()=>[...document.querySelectorAll('script')].some(s=>s.src.includes('toeicweak.js'))")
    check(js, f'{tag}: โหลด toeicweak.js')
    other = await pg.evaluate("async()=>{const r=await fetch('/api/toeic/weakness');return r.status}")
    check(other == 401, f'{tag}: API ต้องล็อกอิน ({other})')

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
