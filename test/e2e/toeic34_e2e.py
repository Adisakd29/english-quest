"""E2E: TOEIC Listening Part 3 (#/toeic-p3) + Part 4 (#/toeic-p4) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/toeic34_e2e.py [outdir]
   ตรวจ: Hub → Part 3/4 · Practice (คำถาม/ตัวเลือกบนจอ · ต้องเล่นเสียงก่อนตอบ · ไม่มีบทพูดก่อนตอบครบ · เฉลยรายข้อ · บทพูด+คำแปล+ไฮไลต์หลักฐาน ·
         กราฟิกเป็นตาราง) · สรุปผล · Review Mistakes · Mock Part 4 (Start → อ่านคำถาม 8 วิ → เล่นเสียงเอง → เวลาตอบ → ชุดถัดไป · ชุดที่ผ่านแล้วตอบไม่ได้) ·
         หน้าแรกแถว Listening รวม Part 1–4 · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/toeic34_e2e'
os.makedirs(OUT, exist_ok=True)
EQ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANK = {}
for n in (3, 4): BANK.update({p['id']: p for p in json.load(open(os.path.join(EQ, f'data/toeic/part{n}/bank.json')))['sets']})
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()

async def cur(pg):
    return await pg.evaluate("()=>{const S=EQToeic34._state();const it=S.s.items[S.i];return {sid:S.s.id,i:S.i,pid:it.pid,qs:it.questions.map(q=>({id:q.id,k:q.k,options:q.options}))}}")
def key(c, q):
    b = BANK[c['pid']]['questions'][q['k'] - 1]
    return 'ABCD'[q['options'].index(b['options'][b['answer']])]
async def skip_audio(pg):
    await pg.wait_for_function("()=>{const a=EQToeic34._audio();return a&&a.duration>0&&!a.paused}", timeout=20000)
    await pg.evaluate("()=>{const a=EQToeic34._audio(); a.currentTime=Math.max(0,a.duration-0.15)}")
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
    tok = (await pg.evaluate(REG, 't34e%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>{localStorage.setItem('wq_token',t);localStorage.removeItem('eq_t3_cfg');localStorage.removeItem('eq_t4_cfg')}", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")

    # ---------- Part 3 Practice (กราฟิก) ----------
    await pg.evaluate("()=>EQApp.navigateTo('toeic')"); await pg.wait_for_selector('#screen-toeic .tq-part', timeout=20000)
    await pg.click('[data-tq-nav="toeic-p3"]'); await pg.wait_for_selector('#t34-title', timeout=20000)
    check('#/toeic-p3' in pg.url and 'Conversations' in await pg.inner_text('#t34-title'), f'{tag}: Hub → Part 3 Landing')
    await layout(pg, tag, 'Part 3 Landing')
    await pg.click('[data-t34-act="practice"]'); await pg.wait_for_selector('.tq-setup')
    await pg.select_option('#t34-focus', 'graphic'); await pg.click('.tq-setup [data-cfg="size"][data-v="1"]'); await pg.click('.tq-setup [data-go]')
    await pg.wait_for_selector('.tq-check [data-ok]', timeout=10000); await pg.click('.tq-check [data-ok]')
    await pg.wait_for_selector('[data-t34-play]:not([disabled])', timeout=30000)
    c = await cur(pg); p = BANK[c['pid']]
    txt = await pg.inner_text('#screen-toeic34-play')
    check(all(t['text'] not in txt for t in p['turns']), f'{tag}: ก่อนตอบไม่มีบทพูด')
    check(await pg.locator('.t34-q').count() == 3 and await pg.locator('.t34-graphic table').count() == 1, f'{tag}: คำถาม 3 ข้อ + กราฟิกเป็นตาราง')
    check(await pg.locator('[data-t34-ans]:not([disabled])').count() == 0, f'{tag}: ต้องเล่นเสียงก่อนจึงตอบได้')
    await layout(pg, tag, 'Part 3 ข้อ')
    await pg.screenshot(path=f'{OUT}/{tag}_p3_question.png', full_page=True)
    await pg.click('[data-t34-play]'); await pg.wait_for_selector('[data-t34-ans]:not([disabled])', timeout=15000)
    await skip_audio(pg)
    q = c['qs'][0]; await pg.click(f'#t34-q-1 [data-t34-ans="{key(c, q)}"]'); await pg.wait_for_selector('#t34-q-1 .t6-bfb.ok', timeout=10000)
    check(await pg.locator('.t34-turn').count() == 0, f'{tag}: ยังไม่ครบ 3 ข้อ ยังไม่เปิดบทพูด')
    q = c['qs'][1]; k = key(c, q); await pg.click(f'#t34-q-2 [data-t34-ans="{next(l for l in "ABCD" if l != k)}"]'); await pg.wait_for_selector('#t34-q-2 .t6-bfb.bad', timeout=10000)
    q = c['qs'][2]; await pg.click(f'#t34-q-3 [data-t34-ans="{key(c, q)}"]'); await pg.wait_for_selector('.t34-turn', timeout=10000)
    check(await pg.locator('.t34-turn').count() == len(p['turns']) and await pg.locator('.t34-tr mark.t7-ev').count() >= 1, f'{tag}: ครบ 3 ข้อ → บทพูดทุกช่วง + คำแปล + ไฮไลต์หลักฐาน')
    await pg.click('[data-t34-play]'); await pg.wait_for_timeout(1200)
    check(await pg.locator('.t34-turn.is-now').count() == 1, f'{tag}: ฟังซ้ำ → ไฮไลต์ช่วงที่กำลังเล่น')
    await layout(pg, tag, 'Part 3 เฉลย')
    await pg.screenshot(path=f'{OUT}/{tag}_p3_feedback.png', full_page=True)
    await pg.click('[data-t34-next]'); await pg.wait_for_selector('#t34-res-title', timeout=15000)
    check((await pg.inner_text('.tq-score b')).replace(' ', '') == '2/3', f'{tag}: สรุปผล Part 3 2/3')
    await pg.click('[data-t34-nav="toeic-p3"]'); await pg.wait_for_selector('#t34-title')
    await pg.click('[data-t34-nav="toeic-p3-review"]'); await pg.wait_for_selector('#t34-rev-title')
    check(await pg.locator('#screen-toeic34 .tq-rv').count() == 1, f'{tag}: Review Mistakes Part 3 มี 1 ชุด')

    # ---------- Part 4 Mock ----------
    await pg.evaluate("()=>EQApp.navigateTo('toeic-p4')"); await pg.wait_for_selector('#t34-title', timeout=20000)
    check('Talks' in await pg.inner_text('#t34-title'), f'{tag}: Part 4 Landing')
    await pg.click('[data-t34-act="mock"]'); await pg.click('.modal-overlay [data-go]')
    await pg.wait_for_selector('[data-t34-play]:not([disabled])', timeout=30000)
    await pg.click('[data-t34-play]')
    await pg.wait_for_selector('#t34-gap:not([hidden])', timeout=5000)
    check('อ่านคำถาม' in await pg.inner_text('#t34-gap'), f'{tag}: Mock — อ่านคำถามก่อนเสียงเริ่ม')
    await pg.screenshot(path=f'{OUT}/{tag}_p4_mock_preview.png', full_page=False)
    await skip_audio(pg)
    c = await cur(pg)
    for q in c['qs']: await pg.click(f'#t34-q-{q["k"]} [data-t34-ans="{key(c, q)}"]'); await pg.wait_for_timeout(250)
    check(await pg.locator('.t6-bfb').count() == 0, f'{tag}: Mock ไม่มีเฉลยระหว่างทำ')
    await pg.wait_for_selector('#t34-skip:not([hidden])', timeout=10000)
    await layout(pg, tag, 'Part 4 Mock')
    await pg.click('[data-t34-skip]')
    await pg.wait_for_function("()=>EQToeic34._state()&&EQToeic34._state().i===1", timeout=10000)
    await pg.wait_for_selector('#t34-gap:not([hidden])', timeout=10000)
    check(True, f'{tag}: ตอบครบ → ชุดถัดไป และเริ่มอ่านคำถามเอง')
    sid = c['sid']
    await pg.wait_for_timeout(400)
    check(int(psql(f"SELECT COALESCE(config->>'passed','0') FROM toeic_sessions WHERE id = {sid}")) >= 1, f'{tag}: บันทึกชุดที่ผ่านแล้ว')
    r = await pg.evaluate(f"()=>EQApp.api('/toeic/p4/sessions/{sid}/answer',{{method:'POST',body:{{id:'{c['qs'][0]['id']}',selected:'A'}}}}).then(()=>'ok').catch(e=>e.code)")
    check(r == 'PASSED', f'{tag}: ชุดที่ผ่านแล้วตอบไม่ได้ ({r})')
    await pg.evaluate(f"()=>EQApp.api('/toeic/p4/sessions/{sid}/finish',{{method:'POST',body:{{}}}})")
    await pg.evaluate("()=>EQApp.navigateTo('toeic-p4')"); await pg.wait_for_selector('#t34-title')
    await pg.evaluate(f"()=>{{location.hash='#/toeic-p4-play/{sid}'}}"); await pg.wait_for_selector('#t34-res-title', timeout=15000)
    sc = (await pg.inner_text('.tq-score b')).replace(' ', '')
    check(sc == '3/15' and 'ไม่ได้ตอบ' in await pg.inner_text('.tq-resultpage'), f'{tag}: ผล Mock Part 4 {sc}')
    await pg.click('#screen-toeic34-play .tq-rv summary'); await pg.wait_for_timeout(200)
    await layout(pg, tag, 'ผล Mock')
    await pg.screenshot(path=f'{OUT}/{tag}_p4_result.png', full_page=False)

    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(1000)
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
