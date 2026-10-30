"""E2E: TOEIC Reading Part 6 (#/toeic-p6) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/toeic6_e2e.py [outdir]
   ตรวจ: Hub → Part 6 · Practice (บทความ + 4 ช่อง · เลือกแล้วช่องในบทความเติมคำ · เฉลยรายช่อง · ครบ 4 ช่องเห็นคำแปลทั้งเรื่อง) ·
         สรุปผล · Review Mistakes · Mock (แท็บบทความ · ตาราง 16 ข้อ · จับเวลา · เปลี่ยนคำตอบ · ยืนยันส่ง) · แตะช่องในบทความ → ไปที่ข้อ ·
         ไม่มีเฉลยใน DOM ก่อนตอบ · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, json, os, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/toeic6_e2e'
os.makedirs(OUT, exist_ok=True)
EQ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANK = {p['id']: p for p in json.load(open(os.path.join(EQ, 'data/toeic/part6/bank.json')))['passages']}
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

async def layout(pg, tag, where):
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('.t6-screen:not(.hidden) button, .modal-overlay button')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.closest('summary')&&!x.classList.contains('tq-icon-btn')&&!x.classList.contains('mini-btn')&&!x.classList.contains('t6-gap')&&(r.width<44||r.height<44)}).map(x=>x.className+':'+x.textContent.trim().slice(0,14))})""")
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def cur(pg):
    return await pg.evaluate("()=>{const P=EQToeic6._state();const it=P.s.items[P.i];return {i:P.i,pid:it.pid,blanks:it.blanks.map(b=>({id:b.id,k:b.k,options:b.options}))}}")
def key(pid, b):
    q = BANK[pid]['questions'][b['k'] - 1]
    return 'ABCD'[b['options'].index(q['options'][q['answer']])]

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    name = 't6e%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>{localStorage.setItem('wq_token',t);localStorage.removeItem('eq_t6_cfg')}", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")

    await pg.evaluate("()=>EQApp.navigateTo('toeic')"); await pg.wait_for_selector('#screen-toeic .tq-part', timeout=20000)
    await pg.click('[data-tq-nav="toeic-p6"]'); await pg.wait_for_selector('#t6-title', timeout=20000)
    check('#/toeic-p6' in pg.url, f'{tag}: Hub → Part 6 Landing')
    await layout(pg, tag, 'Landing')
    await pg.screenshot(path=f'{OUT}/{tag}_landing.png', full_page=True)

    # Practice 2 บทความ
    await pg.click('[data-t6-act="practice"]'); await pg.wait_for_selector('.tq-setup')
    await pg.click('.tq-setup [data-cfg="size"][data-v="2"]'); await pg.click('.tq-setup [data-go]')
    await pg.wait_for_selector('.t6-qcard', timeout=20000)
    c = await cur(pg); p = BANK[c['pid']]
    html = await pg.inner_html('#screen-toeic6-play')
    check(p['translationTH'][:25] not in html and p['questions'][0]['explanationTH'][:20] not in html, f'{tag}: ก่อนตอบไม่มีคำแปล/คำอธิบายใน DOM')
    check(await pg.locator('#t6-text .t6-gap').count() == 4 and await pg.locator('.t6-qcard').count() == 4, f'{tag}: บทความมี 4 ช่อง + 4 ข้อ')
    await layout(pg, tag, 'บทความ Practice')
    await pg.screenshot(path=f'{OUT}/{tag}_practice.png', full_page=True)
    b1 = c['blanks'][0]; k1 = key(c['pid'], b1)
    await pg.click(f'#t6-q-1 [data-t6-ans="{k1}"]'); await pg.wait_for_selector('#t6-q-1 .t6-bfb.ok', timeout=10000)
    gap = await pg.inner_text('#t6-text [data-t6-gap="1"]')
    check(p['questions'][0]['options'][p['questions'][0]['answer']] in gap, f'{tag}: เลือกแล้วช่องในบทความเติมคำตอบ ({gap.strip()[:30]})')
    b2 = c['blanks'][1]; k2 = key(c['pid'], b2); w2 = next(l for l in 'ABCD' if l != k2)
    await pg.click(f'#t6-q-2 [data-t6-ans="{w2}"]'); await pg.wait_for_selector('#t6-q-2 .t6-bfb.bad', timeout=10000)
    check(await pg.locator(f'#t6-q-2 .t5-opt.is-right[data-t6-ans="{k2}"]').count() == 1 and await pg.locator('#t6-text [data-t6-gap="2"].is-fixed').count() == 1, f'{tag}: ตอบผิด → ไฮไลต์คำตอบถูก + ช่องในบทความแสดงคำที่ถูก')
    for bl in c['blanks'][2:]:
        await pg.click(f'#t6-q-{bl["k"]} [data-t6-ans="{key(c["pid"], bl)}"]'); await pg.wait_for_selector(f'#t6-q-{bl["k"]} .t6-bfb', timeout=10000)
    await pg.wait_for_selector('#t6-pfb .t6-trans', timeout=10000)
    check(p['translationTH'][:20] in await pg.inner_text('#t6-pfb'), f'{tag}: ครบ 4 ช่อง → คำแปลทั้งเรื่อง + Tip + คำศัพท์')
    await layout(pg, tag, 'เฉลย Practice')
    await pg.screenshot(path=f'{OUT}/{tag}_practice_fb.png', full_page=True)
    await pg.click('[data-t6-next]'); await pg.wait_for_function("()=>EQToeic6._state().i===1")
    c = await cur(pg)
    if mobile:
        await pg.click('#t6-text [data-t6-gap="3"]'); await pg.wait_for_timeout(700)
        top = await pg.evaluate("()=>document.getElementById('t6-q-3').getBoundingClientRect().top")
        check(top < 300, f'{tag}: แตะช่องในบทความ → เลื่อนไปที่ข้อ ({int(top)})')
    for bl in c['blanks']:
        await pg.click(f'#t6-q-{bl["k"]} [data-t6-ans="{key(c["pid"], bl)}"]'); await pg.wait_for_selector(f'#t6-q-{bl["k"]} .t6-bfb', timeout=10000)
    await pg.wait_for_selector('[data-t6-next]'); await pg.click('[data-t6-next]'); await pg.wait_for_selector('#t6-res-title', timeout=15000)
    sc = (await pg.inner_text('.tq-score b')).replace(' ', '')
    check(sc == '7/8', f'{tag}: สรุปผล Practice {sc}')
    await pg.screenshot(path=f'{OUT}/{tag}_result.png', full_page=False)

    await pg.click('[data-t6-nav="toeic-p6"]'); await pg.wait_for_selector('#t6-title')
    await pg.click('[data-t6-nav="toeic-p6-review"]'); await pg.wait_for_selector('#t6-rev-title')
    check(await pg.locator('#screen-toeic6 .tq-rv').count() == 1, f'{tag}: Review Mistakes มี 1 บทความ')
    await pg.click('#screen-toeic6 .tq-rv summary'); await pg.wait_for_timeout(200)
    await layout(pg, tag, 'Review Mistakes')
    await pg.screenshot(path=f'{OUT}/{tag}_review.png', full_page=True)

    # Mock
    await pg.click('[data-t6-nav="toeic-p6"]'); await pg.wait_for_selector('#t6-title')
    await pg.click('[data-t6-act="mock"]'); await pg.click('.modal-overlay [data-go]')
    await pg.wait_for_selector('#t6-timer', timeout=20000); await pg.wait_for_timeout(600)
    t = await pg.inner_text('#t6-timer b')
    check(t.startswith('9:') or t.startswith('10:'), f'{tag}: Mock จับเวลา ({t})')
    check(await pg.locator('.t6-tab').count() == 4 and await pg.locator('.t5-cell').count() == 16, f'{tag}: แท็บ 4 บทความ + ตาราง 16 ข้อ')
    c = await cur(pg); b1 = c['blanks'][0]; k1 = key(c['pid'], b1)
    await pg.click(f'#t6-q-1 [data-t6-ans="{next(l for l in "ABCD" if l != k1)}"]'); await pg.wait_for_timeout(400)
    check(await pg.locator('.t6-bfb').count() == 0, f'{tag}: Mock ไม่มีเฉลยระหว่างทำ')
    await pg.click(f'#t6-q-1 [data-t6-ans="{k1}"]'); await pg.wait_for_timeout(500)
    check(await pg.locator(f'#t6-q-1 [data-t6-ans="{k1}"].is-chosen').count() == 1, f'{tag}: เปลี่ยนคำตอบได้')
    await pg.click('[data-t6-tab="2"].t6-tab'); await pg.wait_for_function("()=>EQToeic6._state().i===2")
    c = await cur(pg); await pg.click(f'#t6-q-2 [data-t6-ans="{key(c["pid"], c["blanks"][1])}"]'); await pg.wait_for_timeout(500)
    await layout(pg, tag, 'Mock')
    await pg.screenshot(path=f'{OUT}/{tag}_mock.png', full_page=True)
    await pg.click('[data-t6-submit]'); await pg.wait_for_selector('.modal-overlay [data-go]')
    check('14' in await pg.inner_text('.modal-overlay'), f'{tag}: ส่งตอนยังไม่ครบ → ยืนยัน (เหลือ 14)')
    await pg.click('.modal-overlay [data-go]'); await pg.wait_for_selector('#t6-res-title', timeout=15000)
    check((await pg.inner_text('.tq-score b')).replace(' ', '') == '2/16' and 'ไม่ได้ตอบ' in await pg.inner_text('.tq-resultpage'), f'{tag}: ผล Mock 2/16 + ไม่ได้ตอบ')
    check(await pg.locator('#screen-toeic6-play .tq-rv').count() == 4, f'{tag}: Review 4 บทความหลังส่ง')

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
