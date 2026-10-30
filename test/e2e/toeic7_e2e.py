"""E2E: TOEIC Reading Part 7 (#/toeic-p7) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/toeic6_e2e.py [outdir]
   ตรวจ: Hub → Part 7 · Practice (เอกสาร + คำถาม · เฉลยรายข้อ · ไฮไลต์หลักฐานในเอกสาร · ครบชุดเห็นคำแปล) · แชท/ตาราง render ·
         สรุปผล · Review Mistakes · Mock (แท็บชุด · ตารางข้อ · จับเวลา · เปลี่ยนคำตอบ · ยืนยันส่ง) · ไม่มีเฉลยก่อนตอบ ·
         มือถือ 390: ไม่มี scroll แนวนอน (ยกเว้นในกล่องตาราง) · ปุ่ม ≥ 44px · ไม่มี JS error"""
import re, asyncio, json, os, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/toeic7_e2e'
os.makedirs(OUT, exist_ok=True)
EQ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANK = {p['id']: p for p in json.load(open(os.path.join(EQ, 'data/toeic/part7/bank.json')))['sets']}
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

async def layout(pg, tag, where):
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('.t7-screen:not(.hidden) button, .modal-overlay button')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.closest('summary')&&!x.classList.contains('tq-icon-btn')&&!x.classList.contains('mini-btn')&&!x.classList.contains('t6-gap')&&(r.width<44||r.height<44)}).map(x=>x.className+':'+x.textContent.trim().slice(0,14))})""")
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def cur(pg):
    return await pg.evaluate("()=>{const P=EQToeic7._state();const it=P.s.items[P.i];return {i:P.i,pid:it.pid,qs:it.questions.map(q=>({id:q.id,k:q.k,options:q.options,type:q.type}))}}")
def key(pid, q):
    b = BANK[pid]['questions'][q['k'] - 1]
    return 'ABCD'[q['options'].index(b['options'][b['answer']])]

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    name = 't7e%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>{localStorage.setItem('wq_token',t);localStorage.removeItem('eq_t7_cfg')}", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")

    await pg.evaluate("()=>EQApp.navigateTo('toeic')"); await pg.wait_for_selector('#screen-toeic .tq-part', timeout=20000)
    await pg.click('[data-tq-nav="toeic-p7"]'); await pg.wait_for_selector('#t7-title', timeout=20000)
    check('#/toeic-p7' in pg.url, f'{tag}: Hub → Part 7 Landing')
    await layout(pg, tag, 'Landing')
    await pg.screenshot(path=f'{OUT}/{tag}_landing.png', full_page=True)

    # Practice: เอกสารหลายฉบับ 1 ชุด (5 ข้อ) แล้วเอกสารเดี่ยว 3 ชุด
    await pg.click('[data-t7-act="practice"]'); await pg.wait_for_selector('.tq-setup')
    await pg.click('.tq-setup [data-cfg="format"][data-v="multi"]'); await pg.click('.tq-setup [data-cfg="size"][data-v="1"]'); await pg.click('.tq-setup [data-go]')
    await pg.wait_for_selector('.t7-qcard', timeout=20000)
    c = await cur(pg); p = BANK[c['pid']]
    html = await pg.inner_html('#screen-toeic7-play')
    # ส่วนภาษาไทยของคำแปล (คำแปลบางชุดขึ้นต้นด้วยชื่อบริษัท/URL ภาษาอังกฤษเหมือนต้นฉบับ — ไม่ใช่การรั่ว)
    th_part = (re.search(r'[\u0E00-\u0E7F][^\n]{0,24}', p['translationTH'][0]) or re.search('.{1,25}', p['translationTH'][0])).group(0)
    check(th_part not in html and p['questions'][0]['explanationTH'][:20] not in html and 'mark class' not in html, f'{tag}: ก่อนตอบไม่มีคำแปล/คำอธิบาย/หลักฐานใน DOM')
    check(await pg.locator('.t7-doc').count() == len(p['docs']) and await pg.locator('.t7-qcard').count() == len(p['questions']), f'{tag}: เอกสาร {len(p["docs"])} ฉบับ + {len(p["questions"])} คำถาม')
    await layout(pg, tag, 'ชุดเอกสาร Practice')
    await pg.screenshot(path=f'{OUT}/{tag}_practice.png', full_page=False)
    q1 = c['qs'][0]
    await pg.click(f'#t7-q-1 [data-t7-ans="{key(c["pid"], q1)}"]'); await pg.wait_for_selector('#t7-q-1 .t6-bfb.ok', timeout=10000)
    if p['questions'][0]['type'] != 'insertion':
        check(await pg.locator('#t7-docs mark.t7-ev, #t7-docs .t7-ev-row').count() >= 1, f'{tag}: ตอบแล้วไฮไลต์หลักฐานในเอกสาร')
    q2 = c['qs'][1]; k2 = key(c['pid'], q2)
    await pg.click(f'#t7-q-2 [data-t7-ans="{next(l for l in "ABCD" if l != k2)}"]'); await pg.wait_for_selector('#t7-q-2 .t6-bfb.bad', timeout=10000)
    check(await pg.locator(f'#t7-q-2 .t5-opt.is-right[data-t7-ans="{k2}"]').count() == 1, f'{tag}: ตอบผิด → ไฮไลต์คำตอบที่ถูก')
    for q in c['qs'][2:]:
        await pg.click(f'#t7-q-{q["k"]} [data-t7-ans="{key(c["pid"], q)}"]'); await pg.wait_for_selector(f'#t7-q-{q["k"]} .t6-bfb', timeout=10000)
    await pg.wait_for_selector('#t7-sfb .t6-trans', state='attached', timeout=10000)
    check(p['tipTH'][:15] in await pg.inner_text('#t7-sfb'), f'{tag}: ครบชุด → คำแปลเอกสาร + Tip + คำศัพท์')
    await layout(pg, tag, 'เฉลย Practice')
    await pg.screenshot(path=f'{OUT}/{tag}_practice_fb.png', full_page=True)
    await pg.click('[data-t7-next]'); await pg.wait_for_selector('#t7-res-title', timeout=15000)
    sc = (await pg.inner_text('.tq-score b')).replace(' ', '')
    n = len(p['questions'])
    check(sc == f'{n-1}/{n}', f'{tag}: สรุปผล Practice {sc}')

    # เอกสารเดี่ยว: หาชุดแชทผ่าน API ไม่ได้ (สุ่ม) — ทำ 3 ชุด และตรวจการ render แชท/ตารางเมื่อเจอ
    await pg.click('[data-t7-nav="toeic-p7"]'); await pg.wait_for_selector('#t7-title')
    await pg.click('[data-t7-act="practice"]'); await pg.wait_for_selector('.tq-setup')
    await pg.click('.tq-setup [data-cfg="format"][data-v="single"]'); await pg.click('.tq-setup [data-cfg="size"][data-v="3"]'); await pg.click('.tq-setup [data-go]')
    await pg.wait_for_selector('.t7-qcard', timeout=20000)
    for si in range(3):
        c = await cur(pg)
        dt = BANK[c['pid']]['docs'][0]['docType']
        if dt == 'chat': check(await pg.locator('.t7-msg').count() >= 3, f'{tag}: แชทแสดงเป็นข้อความรายคน')
        if any(l.strip().startswith('|') for l in BANK[c['pid']]['docs'][0]['text'].split('\n')): check(await pg.locator('.t7-table').count() >= 1, f'{tag}: ตารางแสดงเป็น table')
        for q in c['qs']:
            await pg.click(f'#t7-q-{q["k"]} [data-t7-ans="{key(c["pid"], q)}"]'); await pg.wait_for_selector(f'#t7-q-{q["k"]} .t6-bfb', timeout=10000)
        await pg.wait_for_selector('[data-t7-next]'); await pg.click('[data-t7-next]')
        if si < 2: await pg.wait_for_function(f"()=>EQToeic7._state()&&EQToeic7._state().i==={si+1}")
    await pg.wait_for_selector('#t7-res-title', timeout=15000)
    check('100%' in await pg.inner_text('.tq-score'), f'{tag}: เอกสารเดี่ยว 3 ชุด ถูกหมด 100%')

    await pg.click('[data-t7-nav="toeic-p7"]'); await pg.wait_for_selector('#t7-title')
    await pg.click('[data-t7-nav="toeic-p7-review"]'); await pg.wait_for_selector('#t7-rev-title')
    check(await pg.locator('#screen-toeic7 .tq-rv').count() == 1, f'{tag}: Review Mistakes มี 1 ชุด')
    await pg.click('#screen-toeic7 .tq-rv summary'); await pg.wait_for_timeout(200)
    check(await pg.locator('#screen-toeic7 mark.t7-ev, #screen-toeic7 .t7-ev-row').count() >= 1, f'{tag}: Review ไฮไลต์หลักฐาน')
    await layout(pg, tag, 'Review Mistakes')

    # Mock
    await pg.click('[data-t7-nav="toeic-p7"]'); await pg.wait_for_selector('#t7-title')
    await pg.click('[data-t7-act="mock"]'); await pg.click('.modal-overlay [data-go]')
    await pg.wait_for_selector('#t7-timer', timeout=20000); await pg.wait_for_timeout(600)
    total = await pg.evaluate("()=>EQToeic7._state().s.total")
    t = await pg.inner_text('#t7-timer b')
    check(int(t.split(':')[0]) in (total - 1, total), f'{tag}: Mock {total} ข้อ จับเวลา {t}')
    check(await pg.locator('.t6-tab').count() == 6 and await pg.locator('.t5-cell').count() == total, f'{tag}: แท็บ 6 ชุด + ตาราง {total} ข้อ')
    c = await cur(pg); q = c['qs'][0]; k = key(c['pid'], q)
    await pg.click(f'#t7-q-1 [data-t7-ans="{next(l for l in "ABCD" if l != k)}"]'); await pg.wait_for_timeout(400)
    check(await pg.locator('.t6-bfb').count() == 0 and await pg.locator('mark.t7-ev').count() == 0, f'{tag}: Mock ไม่มีเฉลย/หลักฐานระหว่างทำ')
    await pg.click(f'#t7-q-1 [data-t7-ans="{k}"]'); await pg.wait_for_timeout(500)
    check(await pg.locator(f'#t7-q-1 [data-t7-ans="{k}"].is-chosen').count() == 1, f'{tag}: เปลี่ยนคำตอบได้')
    await pg.click('.t6-tab[data-t7-tab="5"]'); await pg.wait_for_function("()=>EQToeic7._state().i===5")
    c = await cur(pg); await pg.click(f'#t7-q-2 [data-t7-ans="{key(c["pid"], c["qs"][1])}"]'); await pg.wait_for_timeout(500)
    await layout(pg, tag, 'Mock')
    await pg.screenshot(path=f'{OUT}/{tag}_mock.png', full_page=False)
    await pg.click('[data-t7-submit]'); await pg.wait_for_selector('.modal-overlay [data-go]')
    check(str(total - 2) in await pg.inner_text('.modal-overlay'), f'{tag}: ส่งตอนยังไม่ครบ → ยืนยัน (เหลือ {total-2})')
    await pg.click('.modal-overlay [data-go]'); await pg.wait_for_selector('#t7-res-title', timeout=15000)
    check((await pg.inner_text('.tq-score b')).replace(' ', '') == f'2/{total}' and 'ไม่ได้ตอบ' in await pg.inner_text('.tq-resultpage'), f'{tag}: ผล Mock 2/{total}')
    check(await pg.locator('#screen-toeic7-play .tq-rv').count() == 6, f'{tag}: Review 6 ชุดหลังส่ง')

    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(900)
    sub = await pg.inner_text('#skill-rd-sub')
    check('Part 5–7' in sub and 'แม่นยำ' in sub, f'{tag}: หน้าแรกแถว Reading รวม Part 5–7 ({sub})')
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
