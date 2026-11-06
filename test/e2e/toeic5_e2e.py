"""E2E: TOEIC Reading Part 5 (#/toeic-p5) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/toeic5_e2e.py [outdir]
   ตรวจ: Hub → Part 5 · Practice (เลือกด้วยคีย์บอร์ด/แตะ · เฉลยทันที · EXP · ข้อผิดไฮไลต์คำตอบถูก) · สรุปผล · Review Mistakes ·
         Mock (จับเวลา · ตารางข้อ · เปลี่ยนคำตอบ · ยืนยันส่งเมื่อยังตอบไม่ครบ · ผลมี "ไม่ได้ตอบ") · ออกกลางคันแล้วทำต่อ (คำตอบเดิมอยู่) ·
         หน้าแรกแถว Reading · ไม่มีเฉลยใน DOM ก่อนตอบ · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, json, os, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/toeic5_e2e'
os.makedirs(OUT, exist_ok=True)
EQ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANK = {q['id']: q for q in json.load(open(os.path.join(EQ, 'data/toeic/part5/bank.json')))['questions']}
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

async def layout(pg, tag, where):
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('.t5-screen:not(.hidden) button, .modal-overlay button')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.closest('summary')&&!x.classList.contains('tq-icon-btn')&&!x.classList.contains('mini-btn')&&(r.width<44||r.height<44)}).map(x=>x.className+':'+x.textContent.trim().slice(0,14))})""")
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def state(pg):
    return await pg.evaluate("()=>{const P=EQToeic5._state();if(!P)return null;const it=P.s.items[P.i];return {i:P.i,qid:it.qid,options:it.options,total:P.s.total}}")

def key_letter(st):
    q = BANK[st['qid']]
    return 'ABCD'[st['options'].index(q['options'][q['answer']])]

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    name = 't5e%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>{localStorage.setItem('wq_token',t);localStorage.removeItem('eq_t5_cfg')}", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    await pg.wait_for_function("()=>document.getElementById('skill-rd-sub').textContent.includes('Part 5')", timeout=20000)
    check(True, f'{tag}: หน้าแรกมีแถว Reading')

    # Hub → Part 5
    await pg.evaluate("()=>EQApp.navigateTo('toeic')")
    await pg.wait_for_selector('#screen-toeic .tq-part', timeout=20000)
    await pg.click('[data-tq-nav="toeic-p5"]'); await pg.wait_for_selector('#t5-title', timeout=20000)
    check('#/toeic-p5' in pg.url, f'{tag}: Hub → Part 5 Landing')
    await layout(pg, tag, 'Landing')
    await pg.screenshot(path=f'{OUT}/{tag}_landing.png', full_page=True)

    # Practice 10 ข้อ
    await pg.click('[data-t5-act="practice"]'); await pg.wait_for_selector('.tq-setup')
    await layout(pg, tag, 'ตั้งค่า Practice')
    await pg.click('.tq-setup [data-cfg="size"][data-v="10"]'); await pg.click('.tq-setup [data-go]')
    await pg.wait_for_selector('.t5-opt', timeout=20000)
    html = await pg.inner_html('#screen-toeic5-play')
    st = await state(pg)
    q = BANK[st['qid']]
    check(q['translationTH'][:20] not in html and q['explanationTH'][:20] not in html and '.tq-result' not in html, f'{tag}: ก่อนตอบไม่มีคำแปล/คำอธิบายใน DOM')
    await layout(pg, tag, 'ข้อ Practice')
    await pg.screenshot(path=f'{OUT}/{tag}_practice_q.png', full_page=True)
    k = key_letter(st)
    if mobile: await pg.click(f'[data-t5-ans="{k}"]')
    else: await pg.keyboard.press(str('ABCD'.index(k) + 1))
    await pg.wait_for_selector('.tq-result.ok', timeout=10000)
    check(await pg.locator('.tq-exp').count() == 1, f'{tag}: ตอบถูก → เฉลย + EXP ({"แตะ" if mobile else "กดปุ่ม 1–4"})')
    check(await pg.locator('.tq-fb-sec').count() >= 4 and q['translationTH'][:15] in await pg.inner_text('#t5-after'), f'{tag}: แสดงประโยคเต็ม คำแปล Why วิเคราะห์ตัวเลือก Tip')
    await layout(pg, tag, 'เฉลย Practice')
    await pg.screenshot(path=f'{OUT}/{tag}_practice_fb.png', full_page=True)
    await pg.click('[data-t5-next]'); await pg.wait_for_function("()=>EQToeic5._state().i===1")
    st = await state(pg); k = key_letter(st); wrong = next(l for l in 'ABCD' if l != k)
    await pg.click(f'[data-t5-ans="{wrong}"]'); await pg.wait_for_selector('.tq-result.bad', timeout=10000)
    check(await pg.locator(f'.t5-opt.is-right[data-t5-ans="{k}"]').count() == 1 and await pg.locator(f'.t5-opt.is-wrongpick[data-t5-ans="{wrong}"]').count() == 1,
          f'{tag}: ตอบผิด → ไฮไลต์คำตอบที่ถูกและที่เลือก')
    for i in range(2, 10):
        await pg.click('[data-t5-next]'); await pg.wait_for_function(f"()=>EQToeic5._state().i==={i}")
        st = await state(pg); await pg.click(f'[data-t5-ans="{key_letter(st)}"]'); await pg.wait_for_selector('.tq-result', timeout=10000)
    await pg.click('[data-t5-next]'); await pg.wait_for_selector('#t5-res-title', timeout=15000)
    score = await pg.inner_text('.tq-score b')
    check(score.replace(' ', '') == '9/10', f'{tag}: สรุปผล Practice {score}')
    check('EXP' in await pg.inner_text('.tq-res-hero'), f'{tag}: ผลมี EXP จบชุด')
    await layout(pg, tag, 'ผล Practice')
    await pg.screenshot(path=f'{OUT}/{tag}_practice_result.png', full_page=True)

    # Review Mistakes
    await pg.click('[data-t5-nav="toeic-p5"]'); await pg.wait_for_selector('#t5-title')
    check('90%' in await pg.inner_text('.tq-stats'), f'{tag}: Landing อัปเดต Accuracy 90%')
    await pg.click('[data-t5-nav="toeic-p5-review"]'); await pg.wait_for_selector('#t5-rev-title')
    n_rv = await pg.locator('#screen-toeic5 .tq-rv').count()
    check(n_rv == 1, f'{tag}: Review Mistakes มี 1 ข้อ ({n_rv})')
    await pg.click('#screen-toeic5 .tq-rv summary'); await pg.wait_for_timeout(200)
    await pg.screenshot(path=f'{OUT}/{tag}_review.png', full_page=True)

    # Mock
    await pg.click('[data-t5-nav="toeic-p5"]'); await pg.wait_for_selector('#t5-title')
    await pg.click('[data-t5-act="mock"]'); await pg.click('.modal-overlay [data-go]')
    await pg.wait_for_selector('#t5-timer', timeout=20000)
    await pg.wait_for_timeout(700)
    t = await pg.inner_text('#t5-timer b')
    check(t.startswith('11:') or t.startswith('12:'), f'{tag}: Mock จับเวลา ({t})')
    check(await pg.locator('.t5-cell').count() == 30, f'{tag}: ตารางข้อ 30 ช่อง')
    st = await state(pg); first_qid = st['qid']; k0 = key_letter(st)
    await pg.click(f'[data-t5-ans="{next(l for l in "ABCD" if l != k0)}"]')
    await pg.wait_for_function("()=>EQToeic5._state().i===1", timeout=5000)
    check(await pg.locator('.tq-result').count() == 0, f'{tag}: Mock ไม่บอกถูก/ผิด · เลื่อนไปข้อถัดไปเอง')
    st = await state(pg); await pg.click(f'[data-t5-ans="{key_letter(st)}"]')
    await pg.wait_for_function("()=>EQToeic5._state().i===2", timeout=5000)
    await pg.click('[data-t5-jump="0"]'); await pg.wait_for_function("()=>EQToeic5._state().i===0")
    await pg.click(f'[data-t5-ans="{k0}"]'); await pg.wait_for_timeout(600)
    check(await pg.locator(f'[data-t5-ans="{k0}"].is-chosen').count() == 1, f'{tag}: ย้อนกลับไปเปลี่ยนคำตอบได้')
    await layout(pg, tag, 'Mock')
    await pg.screenshot(path=f'{OUT}/{tag}_mock.png', full_page=True)
    # ออกกลางคัน → ทำต่อ
    await pg.evaluate("()=>EQApp.navigateTo('toeic-p5')"); await pg.wait_for_selector('[data-t5-resume]', timeout=15000)
    check('2/30' in await pg.inner_text('[data-t5-resume]'), f'{tag}: ออกกลางคัน → ปุ่มทำ Mock ต่อ (2/30)')
    await pg.click('[data-t5-resume]'); await pg.wait_for_selector('#t5-timer', timeout=15000)
    sel = await pg.evaluate("q=>EQToeic5._state().sel[q]", first_qid)
    check(sel == k0, f'{tag}: กลับมาทำต่อ คำตอบเดิมยังอยู่ ({sel})')
    await pg.click('[data-t5-submit]'); await pg.wait_for_selector('.modal-overlay [data-go]')
    check('28' in await pg.inner_text('.modal-overlay'), f'{tag}: ส่งเมื่อยังตอบไม่ครบ → ยืนยันก่อน (เหลือ 28 ข้อ)')
    await pg.click('.modal-overlay [data-go]'); await pg.wait_for_selector('#t5-res-title', timeout=15000)
    txt = await pg.inner_text('.tq-resultpage')
    check('2 / 30' in await pg.inner_text('.tq-score b') and 'ไม่ได้ตอบ' in txt, f'{tag}: ผล Mock 2/30 + จำนวนไม่ได้ตอบ + เวลาที่ใช้')
    check(await pg.locator('#screen-toeic5-play .tq-rv').count() == 30, f'{tag}: Review ครบ 30 ข้อหลังส่ง')
    await pg.screenshot(path=f'{OUT}/{tag}_mock_result.png', full_page=False)

    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(900)
    sub = await pg.inner_text('#skill-rd-sub')
    check('แม่นยำ' in sub, f'{tag}: หน้าแรกแถว Reading อัปเดต ({sub})')
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
