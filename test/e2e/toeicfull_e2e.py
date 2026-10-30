"""E2E: TOEIC Full Mock Test (#/toeic-full) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/toeicfull_e2e.py [outdir]
   ตรวจ: Hub → Full Mock Test · เริ่มชุด · เริ่ม Part 5 จากหน้านี้ (ผูก fullTestId) · หน้าผลของ Part มีปุ่มกลับ Full Mock · สถานะ Part อัปเดต ·
         ครบ 7 Part → ดูคะแนนประมาณการ (Listening/Reading/รวม + ช่วง + CEFR + ราย Part) · ประวัติ · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/toeicfull_e2e'
os.makedirs(OUT, exist_ok=True)
EQ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P1 = {q['id']: q for q in json.load(open(os.path.join(EQ, 'data/toeic/part1/bank.json')))['questions']}
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
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
    tok = (await pg.evaluate(REG, 'tfe%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")

    await pg.evaluate("()=>EQApp.navigateTo('toeic')"); await pg.wait_for_selector('.tq-full-card', timeout=20000)
    await pg.click('.tq-full-card'); await pg.wait_for_selector('#tqf-title', timeout=20000)
    check('#/toeic-full' in pg.url and await pg.locator('[data-tqf-new]').count() == 1, f'{tag}: Hub → Full Mock Test (ยังไม่เริ่ม)')
    await layout(pg, tag, 'Full Mock (ยังไม่เริ่ม)')
    await pg.click('[data-tqf-new]'); await pg.wait_for_selector('[data-tqf-start="1"]', timeout=15000)
    check(await pg.locator('.tqf-part').count() == 7 and await pg.locator('.tqf-part.is-next').count() == 1, f'{tag}: เริ่มชุด → 7 Part · แนะนำ Part 1')
    await layout(pg, tag, 'Full Mock (กำลังทำ)')
    await pg.screenshot(path=f'{OUT}/{tag}_hub.png', full_page=True)
    fid = await pg.evaluate("()=>EQApp.api('/toeic/full').then(d=>d.active.id)")

    # เริ่ม Part 5 จากหน้านี้ → Mock intro ของ Part 5 → ส่งคำตอบ → หน้าผลมีปุ่มกลับ
    await pg.click('[data-tqf-start="5"]'); await pg.wait_for_selector('.modal-overlay [data-go]', timeout=10000)
    await pg.click('.modal-overlay [data-go]'); await pg.wait_for_selector('#t5-timer', timeout=20000)
    sid = await pg.evaluate("()=>EQToeic5._state().s.id")
    check(psql(f"SELECT config->>'fullTestId' FROM toeic_sessions WHERE id = {sid}") == str(fid), f'{tag}: Mock Part 5 ผูกกับ Full Mock Test')
    await pg.click('[data-t5-ans="A"]'); await pg.wait_for_timeout(500)
    await pg.click('[data-t5-submit]'); await pg.click('.modal-overlay [data-go]')
    await pg.wait_for_selector('[data-tqf-back]', timeout=15000)
    check(True, f'{tag}: หน้าผล Part 5 มีปุ่ม "กลับไป Full Mock Test"')
    await pg.click('[data-tqf-back]'); await pg.wait_for_selector('[data-tqf-start="1"]', timeout=15000)
    check('/30' in await pg.inner_text('section[aria-labelledby="tqf-r"]'), f'{tag}: Part 5 แสดงสถานะเสร็จพร้อมคะแนน')

    # Part ที่เหลือ (ผ่าน API ให้ไว) — Part 1 ต้องตอบครบ
    s1 = await pg.evaluate(f"()=>EQApp.api('/toeic/p1/sessions',{{method:'POST',body:{{mode:'mock',fullTestId:{fid}}}}})")
    items = json.loads(psql(f"SELECT items FROM toeic_sessions WHERE id = {s1['id']}"))
    for it in items:
        k = next(v for v in P1[it['qid']]['variants'] if v['v'] == it['variant'])['correctOption']
        await pg.evaluate(f"()=>EQApp.api('/toeic/p1/sessions/{s1['id']}/answer',{{method:'POST',body:{{qid:'{it['qid']}',selected:'{k}'}}}})")
    await pg.evaluate(f"()=>EQApp.api('/toeic/p1/sessions/{s1['id']}/finish',{{method:'POST',body:{{}}}})")
    for part in (2, 3, 4, 6, 7):
        await pg.evaluate(f"async()=>{{const s=await EQApp.api('/toeic/p{part}/sessions',{{method:'POST',body:{{mode:'mock',fullTestId:{fid}}}}});await EQApp.api('/toeic/p{part}/sessions/'+s.id+'/finish',{{method:'POST',body:{{}}}})}}")
    await pg.evaluate("()=>EQApp.navigateTo('toeic-full')"); await pg.wait_for_selector('[data-tqf-finish]', timeout=15000)
    check('7/7' in await pg.inner_text('.tqf-progress'), f'{tag}: ครบ 7 Part → ปุ่มดูคะแนน')
    await pg.click('[data-tqf-finish]'); await pg.wait_for_selector('#tqf-res-title', timeout=15000)
    txt = await pg.inner_text('#screen-toeicfull')
    check(await pg.locator('.tqf-score').count() == 2 and 'CEFR' in txt and 'ช่วงประมาณ' in txt and 'EXP' in txt, f'{tag}: ผลคะแนนประมาณการ L/R + ช่วง + CEFR + EXP')
    total = int(await pg.inner_text('.tqf-total b'))
    check(5 <= total <= 990, f'{tag}: คะแนนรวม {total}')
    check(await pg.locator('#screen-toeicfull .tq-skill').count() == 7, f'{tag}: ความแม่นยำราย Part ครบ 7')
    await layout(pg, tag, 'ผล Full Mock')
    await pg.screenshot(path=f'{OUT}/{tag}_result.png', full_page=True)
    await pg.click('[data-tqf-nav="toeic-full"]'); await pg.wait_for_selector('.tqf-hrow', timeout=15000)
    check(str(total) in await pg.inner_text('.tqf-hist'), f'{tag}: ประวัติแสดงคะแนนชุดที่จบ')
    check(not errs, f'{tag}: ไม่มี JS error {errs[:2]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, 1280, 860, False, 'desktop')
        await run(b, 390, 844, True, 'mobile')
        await b.close()
    print('ALL PASS' if not fails else f'{len(fails)} FAIL')
    sys.exit(1 if fails else 0)

asyncio.run(main())
