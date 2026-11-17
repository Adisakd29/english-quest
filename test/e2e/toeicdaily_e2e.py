"""E2E: TOEIC แผนฝึกรายวัน (การ์ดบน #/toeic) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/toeicdaily_e2e.py [outdir]
   ตรวจ: Hub แสดงการ์ด 3 งาน + streak + 7 วัน · กดเริ่มงาน → Practice ของ Part นั้นผูก dailyTask · หน้าผลมีปุ่ม "ไปงานถัดไป" + "กลับแผนวันนี้" ·
         ทำต่อ (ทำค้าง) · ครบ 3 งาน → การ์ดครบ + toast EXP + streak 1 · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/toeicdaily_e2e'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
# ตอบทุกข้อของ session (A) แล้วส่ง — ผ่าน API
COMPLETE = """async ([part, sid])=>{const s=await EQApp.api(`/toeic/p${part}/sessions/${sid}`);
  for(const it of s.items){
    if(it.questions){for(const q of it.questions){if(!q.selected)await EQApp.api(`/toeic/p${part}/sessions/${sid}/answer`,{method:'POST',body:{id:q.id,selected:'A'}}).catch(()=>{})}}
    else if(it.blanks){for(const b of it.blanks){if(!b.selected)await EQApp.api(`/toeic/p${part}/sessions/${sid}/answer`,{method:'POST',body:{id:b.id,selected:'A'}}).catch(()=>{})}}
    else if(!it.answered){await EQApp.api(`/toeic/p${part}/sessions/${sid}/answer`,{method:'POST',body:{qid:it.qid,selected:'A'}}).catch(()=>{})}}
  await EQApp.api(`/toeic/p${part}/sessions/${sid}/finish`,{method:'POST',body:{}}).catch(()=>{});}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
async def layout(pg, tag, where):
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('.tq-screen:not(.hidden) button, .t5-screen:not(.hidden) button, .modal-overlay button')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.closest('summary')&&!x.classList.contains('tq-icon-btn')&&!x.classList.contains('mini-btn')&&!x.classList.contains('tq-link')&&(r.width<44||r.height<44)}).map(x=>x.className+':'+x.textContent.trim().slice(0,14))})""")
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')
async def ok_audio(pg):
    try:
        await pg.wait_for_selector('.modal-overlay [data-ok]', timeout=2500); await pg.click('.modal-overlay [data-ok]')
    except Exception:
        pass
    try:   # Audio Check ของ Part 1 (ต้องเล่นเสียงก่อนจึงตอบได้)
        await pg.wait_for_selector('.modal-overlay [data-play]', timeout=1000)
        await pg.evaluate("()=>{const o=document.querySelector('.modal-overlay [data-answers]');if(o)o.hidden=false}")
        await pg.click('.modal-overlay [data-answers] .btn-primary')
    except Exception:
        pass

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e) + ' @ ' + (e.stack or '')[:400]))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    tok = (await pg.evaluate(REG, 'tde%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>{localStorage.setItem('wq_token',t);sessionStorage.setItem('eq_tq_checked','1')}", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")

    # 1) การ์ดบน Hub
    await pg.evaluate("()=>EQApp.navigateTo('toeic')"); await pg.wait_for_selector('.tqd', timeout=20000)
    check(await pg.locator('.tqd-task').count() == 3, f'{tag}: การ์ดแผนวันนี้ 3 งาน')
    check(await pg.locator('.tqd-day').count() == 7 and await pg.locator('.tqd-day.is-today').count() == 1, f'{tag}: แสดง 7 วันล่าสุด + วันนี้')
    check((await pg.inner_text('.tqd-streak b')).strip() == '0', f'{tag}: streak เริ่ม 0')
    check(await pg.locator('.tqd-task.is-next').count() == 1, f'{tag}: ไฮไลต์งานถัดไป')
    await layout(pg, tag, 'Hub + แผนวันนี้')
    await pg.screenshot(path=f'{OUT}/{tag}_hub.png', full_page=True)
    plan = await pg.evaluate("()=>EQToeicDaily._last()")
    parts = [t['part'] for t in plan['tasks']]

    # 2) เริ่มงานแรกจากการ์ด → Practice ของ Part นั้น (ผูก dailyTask)
    t0 = plan['tasks'][0]
    await pg.click('[data-tqd-start="0"]'); await ok_audio(pg)
    await pg.wait_for_function(f"()=>location.hash.startsWith('#/toeic-p{t0['part']}-play/')", timeout=20000)
    sid = int((await pg.evaluate("()=>location.hash")).split('/')[-1])
    cfg = json.loads(subprocess.run(['psql', DB, '-qAtc', f"SELECT config FROM toeic_sessions WHERE id = {sid}"], capture_output=True, text=True).stdout)
    check(cfg.get('dailyTask', '').endswith(':0'), f'{tag}: เริ่มงานที่ 1 → Practice Part {t0["part"]} ผูกแผนวันนี้')
    # กลับ Hub กลางทาง → ทำต่อ
    await pg.evaluate("()=>{const a=window.EQToeic&&EQToeic._audio&&EQToeic._audio();if(a&&a.pause)a.pause()}")
    await pg.evaluate("()=>{EQApp.setLeaveGuard&&EQApp.setLeaveGuard(null);EQApp.navigateTo('toeic')}"); await pg.wait_for_selector('.tqd', timeout=20000)
    check(await pg.locator('[data-tqd-resume="0"]').count() == 1, f'{tag}: งานที่ทำค้างแสดงปุ่ม "ทำต่อ"')
    await pg.evaluate(COMPLETE, [t0['part'], sid])
    await pg.click('[data-tqd-resume="0"]') if await pg.locator('[data-tqd-resume="0"]').count() else None
    await pg.wait_for_selector('[data-tqd-next]:visible', timeout=20000)
    check(await pg.locator('[data-tqd-back]:visible').count() == 1, f'{tag}: หน้าผลมี "ไปงานถัดไป" + "กลับแผนวันนี้"')
    await layout(pg, tag, 'หน้าผลงานในแผน')
    await pg.screenshot(path=f'{OUT}/{tag}_task_result.png', full_page=True)

    # 3) "ไปงานถัดไป" จากหน้าผล → งานที่ 2 → ครบ → หน้าผล → งานที่ 3 → ครบ → หน้าผล → "ไปงานถัดไป" (ครบแล้ว) → Hub
    for k in (1, 2):
        await pg.click('[data-tqd-next]:visible'); await ok_audio(pg)
        p = parts[k]
        await pg.wait_for_function(f"()=>location.hash.startsWith('#/toeic-p{p}-play/')", timeout=20000)
        sid = int((await pg.evaluate("()=>location.hash")).split('/')[-1])
        await pg.evaluate(COMPLETE, [p, sid])
        await pg.evaluate("()=>{for(const m of [window.EQToeic,window.EQToeic2,window.EQToeic34]){const a=m&&m._audio&&m._audio();if(a&&a.pause)a.pause()}EQApp.setLeaveGuard&&EQApp.setLeaveGuard(null)}")
        await pg.evaluate("()=>{location.hash='#/toeic'}"); await pg.wait_for_selector('.tqd', timeout=20000)
        if k == 1: check('2/3' in await pg.inner_text('.tqd-progress'), f'{tag}: ความคืบหน้า 2/3')
        await pg.evaluate(f"()=>{{location.hash='#/toeic-p{p}-play/{sid}'}}"); await pg.wait_for_selector('[data-tqd-next]:visible', timeout=20000)
    await pg.click('[data-tqd-next]:visible')

    # 4) ครบ 3 งาน
    await pg.wait_for_selector('.tqd.is-complete', timeout=20000)
    toast = await pg.evaluate("()=>[...document.querySelectorAll('.toast, [class*=toast]')].map(x=>x.textContent).join(' ')")
    check('ครบแผนฝึกวันนี้' in toast and 'EXP' in toast, f'{tag}: ครบ 3 งาน → toast โบนัส EXP')
    check((await pg.inner_text('.tqd-streak b')).strip() == '1' and await pg.locator('.tqd-day.is-today.is-done').count() == 1, f'{tag}: streak 1 วัน · วันนี้ติ๊กแล้ว')
    check(await pg.locator('.tqd-task.is-done').count() == 3, f'{tag}: ทั้ง 3 งานเสร็จ')
    await layout(pg, tag, 'แผนวันนี้ครบ')
    await pg.screenshot(path=f'{OUT}/{tag}_complete.png', full_page=True)

    check(not errs, f'{tag}: ไม่มี JS error {errs[:3]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        await run(b, 1280, 900, False, 'desktop')
        await run(b, 390, 844, True, 'mobile')
        await b.close()
    print('\nFAILS:', len(fails)); [print(' -', f) for f in fails]
    print('ALL PASS' if not fails else '')
asyncio.run(main())
