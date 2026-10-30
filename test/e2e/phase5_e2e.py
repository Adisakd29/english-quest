"""E2E: v1.10.0 Phase 5 — Graded Reading & Listening · กระดานอันดับ · การแจ้งเตือนไม่ค้างโหลด
   ใช้: python3 test/e2e/phase5_e2e.py [outdir]   (เซิร์ฟเวอร์ :3100 + DB eq_dev) · desktop 1280 · tablet 820 · mobile 390
   service_workers='block' = สถานการณ์ที่เดิมการ์ดแจ้งเตือนค้าง "กำลังโหลด" ตลอด (serviceWorker.ready ไม่ resolve)"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/phase5_e2e'
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
TEXTS = {t['id']: t for t in json.load(open(os.path.join(ROOT, 'data', 'graded', 'texts.json')))['texts']}
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
async def layout(pg, tag, where, scope):
    lay = await pg.evaluate("""(scope)=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll(scope+' button:not(.gr-gl), '+scope+' .ta-opt')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.classList.contains('tq-link')&&(r.width<44||r.height<44)}).map(x=>(x.className||x.tagName)+':'+(x.textContent||'').trim().slice(0,12))})""", scope)
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def answer_all(pg, tid, correct=True):
    for i, q in enumerate(TEXTS[tid]['questions']):
        k = q['answer'] if correct else (q['answer'] + 1) % 4
        await pg.locator(f'input[name="gr-q{i}"]').nth(k).check()
    await pg.click('#gr-quiz button[type=submit]')
    await pg.wait_for_selector('#gr-result:not(:empty)', timeout=15000)

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []; wsurls = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('websocket', lambda ws: wsurls.append(ws.url))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    tok = (await pg.evaluate(REG, 'p5e%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    # ---------- ทางเข้า + หน้ารวม ----------
    await pg.click('[data-nav-to="graded"]')
    await pg.wait_for_selector('#screen-graded:not(.hidden) .gr-card', timeout=20000)
    check(await pg.locator('.gr-card').count() == 6, f'{tag}: หน้ารวมแสดง 6 เรื่องของระดับ')
    await pg.click('[data-gr-level="A2"]'); await pg.wait_for_selector('[data-gr-level="A2"].active', timeout=10000)
    await layout(pg, tag, 'Graded (หน้ารวม)', '#screen-graded:not(.hidden)')
    await pg.screenshot(path=f'{OUT}/{tag}_graded_hub.png', full_page=False)
    tid = await pg.locator('.gr-card [data-gr-open]').first.get_attribute('data-gr-open')
    # ---------- อ่าน ----------
    await pg.locator('.gr-card [data-mode="reading"]').first.click()
    await pg.wait_for_selector('#gr-body .gr-p', timeout=20000)
    check(await pg.locator('.gr-p').count() == len(TEXTS[tid]['paragraphs']), f'{tag}: อ่าน — ย่อหน้าครบ')
    await pg.locator('.gr-gl').first.click()
    check(await pg.locator('.gr-gl-th').count() == 1, f'{tag}: แตะคำศัพท์ → เห็นคำแปล')
    await pg.click('[data-gr-th]')
    check(await pg.locator('.gr-th:not(.hidden)').count() == len(TEXTS[tid]['paragraphs']), f'{tag}: แสดงคำแปลไทยทุกย่อหน้า')
    await pg.click('[data-gr-play]')
    try:
        await pg.wait_for_function("()=>!document.getElementById('gr-time').textContent.startsWith('0:00 ')&&document.querySelector('.gr-p.is-reading')", timeout=8000); playing = True
    except Exception: playing = False
    check(playing, f'{tag}: กดฟัง → เสียงเล่นจริง (เวลาเดิน) + ไฮไลต์ย่อหน้าที่กำลังอ่าน ({await pg.inner_text("#gr-time")})')
    await pg.click('[data-gr-play]')
    await layout(pg, tag, 'Graded (อ่าน)', '#screen-graded:not(.hidden)')
    await answer_all(pg, tid, correct=True)
    res = await pg.inner_text('#gr-result')
    check('ถูก' in res and 'EXP' in res, f'{tag}: ส่งคำตอบ → คะแนน + EXP ({res.strip()[:40]})')
    check(await pg.locator('.gr-ev').count() >= 1, f'{tag}: ไฮไลต์หลักฐานในเนื้อเรื่อง')
    await pg.screenshot(path=f'{OUT}/{tag}_graded_reading.png', full_page=True)
    # ---------- ฟัง ----------
    await pg.click('#gr-after [data-mode="listening"]')
    await pg.wait_for_selector('#gr-quiz', timeout=20000)
    check(await pg.locator('#gr-body .gr-p').count() == 0, f'{tag}: ฟัง — ไม่เห็นเนื้อเรื่องก่อนตอบ')
    note = await pg.inner_text('.gr-listen-note')
    check(not any(p.split('.')[0][:25] in note for p in TEXTS[tid]['paragraphs']) and TEXTS[tid]['tipTH'][:20] not in note, f'{tag}: ฟัง — เคล็ดลับไม่เปิดเผยเนื้อเรื่อง')
    await layout(pg, tag, 'Graded (ฟัง)', '#screen-graded:not(.hidden)')
    await pg.screenshot(path=f'{OUT}/{tag}_graded_listening.png', full_page=False)
    await answer_all(pg, tid, correct=False)
    check(await pg.locator('#gr-body .gr-p').count() > 0 and 'บทถอดความ' in await pg.inner_text('#gr-body'), f'{tag}: ฟัง — ส่งแล้วเห็นบทถอดความ')
    # ---------- กระดานอันดับ ----------
    await pg.evaluate("()=>EQApp.navigateTo('leaderboard')")
    await pg.wait_for_selector('#screen-leaderboard:not(.hidden) .lb-rule', timeout=20000)
    await pg.click('[data-lb="all"]'); await pg.wait_for_timeout(1200)
    rule = (await pg.inner_text('#screen-leaderboard .lb-rule')).strip()
    check('เท่ากัน' in rule, f'{tag}: กระดานอันดับแสดงกติกาคะแนนเท่ากัน')
    lb = await pg.evaluate("()=>EQApp.api('/leaderboard?period=all')")
    rk = [e['rank'] for e in lb['top']]
    check(rk == list(range(1, len(rk) + 1)), f'{tag}: กระดานตลอดกาลอันดับไม่ซ้ำ เรียง 1..{len(rk)}')
    check(await pg.locator('#screen-leaderboard .leaderboard-row').count() >= 1, f'{tag}: แสดงแถวกระดานอันดับ')
    try: await pg.wait_for_selector('#screen-leaderboard .profile-link', timeout=10000); linked = True
    except Exception: linked = False
    check(linked, f'{tag}: รายชื่อบนกระดานเป็นลิงก์โปรไฟล์ + Avatar (ระบบ Avatar เริ่มทำงานแม้ /auth/me ตอบก่อนสคริปต์โหลดเสร็จ)')
    await layout(pg, tag, 'กระดานอันดับ', '#screen-leaderboard')
    await pg.screenshot(path=f'{OUT}/{tag}_leaderboard.png', full_page=False)
    # ---------- ปรับหน้าแรก / เส้นทาง / โปรไฟล์ ----------
    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_selector('#screen-home:not(.hidden) #goal-done', timeout=20000)
    await pg.wait_for_function("()=>!document.querySelector('#home-mastery .skeleton') && !document.querySelector('#dash-progress .skeleton')", timeout=15000)
    pos = await pg.evaluate("()=>{const y=(s)=>{const e=document.querySelector(s);return e?e.getBoundingClientRect().top+scrollY:null};return {cont:y('#dash-continue'),goal:y('.home-goal'),skill:y('.skill-card'),explore:y('.home-explore'),hero:y('.home-hero')}}")
    check(pos['cont'] < pos['goal'] < pos['skill'], f'{tag}: หน้าแรก — เรียนต่อ → เป้าหมายวันนี้ → ทักษะ ({pos})')
    if w < 1024: check(pos['explore'] < pos['skill'], f'{tag}: หน้าแรก (จอแคบ) — ทางลัดอยู่ก่อนการ์ดทักษะ')
    check(pos['cont'] - pos['hero'] < h * 0.6, f'{tag}: ปุ่มเรียนต่ออยู่ในจอแรก ({pos["cont"]:.0f}px)')
    ms = await pg.inner_text('#home-mastery')
    check(ms.count('ยังไม่พอประเมิน') <= 1, f'{tag}: ความแม่นยำ — ไม่แสดง "ยังไม่พอประเมิน" ซ้ำทุกแถว')
    vis = await pg.locator('#dash-progress .dash-level-row:visible').count()
    await pg.click('[data-dash-all]'); all_ = await pg.locator('#dash-progress .dash-level-row:visible').count()
    check(vis < all_ == 6, f'{tag}: คำศัพท์รายระดับ — แสดงเฉพาะที่เกี่ยวข้อง ({vis}) · กดดูทุกระดับ ({all_})')
    check('Learning Progress' not in await pg.inner_text('#screen-home'), f'{tag}: หัวข้อหน้าแรกเป็นภาษาไทย')
    await layout(pg, tag, 'หน้าแรก', '#screen-home')
    await pg.screenshot(path=f'{OUT}/{tag}_home.png', full_page=False)
    await pg.evaluate("()=>EQApp.navigateTo('path')"); await pg.wait_for_selector('#path-levels .path-unit-row', timeout=20000)
    nmore = await pg.locator('[data-path-more]').count(); rows0 = await pg.locator('#path-levels .path-unit-row').count()
    check(nmore >= 1, f'{tag}: เส้นทาง — ย่อ Unit ที่ล็อกติดกัน ({nmore} กลุ่ม · {rows0} แถว)')
    first = pg.locator('[data-path-more]').first; await first.click(); await pg.wait_for_timeout(300)
    rows1 = await pg.locator('#path-levels .path-unit-row').count()
    check(rows1 > rows0 and await pg.locator('[data-path-more][aria-expanded="true"]').count() == 1, f'{tag}: กดดูกลุ่มที่ย่อ → แสดงเพิ่ม ({rows0}→{rows1})')
    await pg.locator('[data-path-more][aria-expanded="true"]').click(); await pg.wait_for_timeout(300)
    check(await pg.locator('#path-levels .path-unit-row').count() == rows0, f'{tag}: กดย่อกลับได้')
    await pg.click('.path-view-btn[data-view="explore"]'); await pg.wait_for_timeout(800)
    check(await pg.locator('[data-path-more]').count() == 0, f'{tag}: โหมดสำรวจอิสระแสดงครบทุก Unit')
    await pg.click('.path-view-btn[data-view="recommended"]'); await pg.wait_for_timeout(800)
    await layout(pg, tag, 'เส้นทาง', '#screen-path')
    await pg.screenshot(path=f'{OUT}/{tag}_path.png', full_page=False)
    # ---------- Ranked / ร้านค้า / ตู้เสื้อผ้า ----------
    await pg.goto(URL + '/?c=%d#/ranked-leaderboard' % random.randint(1, 10**6)); await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.wait_for_selector('#rk-lb-list .rk-lb-row', timeout=20000)
    pos = await pg.evaluate("()=>[...document.querySelectorAll('#rk-lb-list .rk-lb-row .rk-lb-pos')].map(x=>x.textContent.trim()||x.querySelector('[aria-label]')?.getAttribute('aria-label')||'medal')")
    rows = await pg.locator('#rk-lb-list .rk-lb-row').count()
    check(rows <= 21, f'{tag}: Ranked — แสดง 20 อันดับแรกก่อน ({rows} แถว)')
    nums = [p for p in pos if p.startswith('#')]
    check(len(nums) == len(set(nums)), f'{tag}: Ranked — อันดับไม่ซ้ำ {nums[:6]}')
    if await pg.locator('[data-rk-lb-more]').count():
        await pg.click('[data-rk-lb-more]'); await pg.wait_for_timeout(1200)
        check(await pg.locator('#rk-lb-list .rk-lb-row').count() > rows, f'{tag}: Ranked — กดดูอันดับถัดไปได้')
    check('Leaderboard' not in await pg.inner_text('#rk-lb-title') and 'Season' not in await pg.inner_text('#rk-lb-tabs'), f'{tag}: Ranked — หัวข้อ/แท็บเป็นภาษาไทย')
    await layout(pg, tag, 'Ranked Leaderboard', '#screen-ranked-leaderboard')
    await pg.goto(URL + '/?c=%d#/ranked' % random.randint(1, 10**6)); await pg.wait_for_selector('#rk-lobby-players li', timeout=20000)
    ind = await pg.evaluate("()=>{const l=document.getElementById('rk-lobby-players'),h=l.closest('section').querySelector('h2');return Math.round(l.getBoundingClientRect().left-h.getBoundingClientRect().left)}")
    check(abs(ind) <= 2, f'{tag}: Ranked Lobby — รายชื่อผู้เล่นไม่เยื้อง ({ind}px)')
    await pg.goto(URL + '/?c=%d#/wardrobe' % random.randint(1, 10**6)); await pg.wait_for_selector('.wr-grid .av-tile', timeout=20000)
    cols = await pg.evaluate("()=>getComputedStyle(document.querySelector('.wr-grid')).gridTemplateColumns.split(' ').length")
    check(cols >= (5 if w >= 1024 else 3), f'{tag}: ตู้เสื้อผ้า — ตาราง {cols} คอลัมน์ (เดิมชนคลาสของ World เหลือ 2)')
    await layout(pg, tag, 'ตู้เสื้อผ้า', '#screen-wardrobe')
    await pg.goto(URL + '/?c=%d#/shop' % random.randint(1, 10**6)); await pg.wait_for_selector('.sh-grid .sh-card, .sh-grid > *', timeout=30000); await pg.wait_for_timeout(1500)
    if w < 900:
        top = await pg.evaluate("()=>document.querySelector('.sh-grid').getBoundingClientRect().top + scrollY")
        check(top < 1100, f'{tag}: ร้านค้า — เห็นสินค้าเร็วขึ้น (เริ่มที่ {top:.0f}px · เดิม ~1,000+)')
    await layout(pg, tag, 'ร้านค้า', '#screen-shop')
    # ---------- โปรไฟล์: แท็บ + การแจ้งเตือน (service worker ถูกบล็อก) ----------
    await pg.evaluate("()=>EQApp.navigateTo('profile')")
    await pg.wait_for_selector('#notif-body', state='attached', timeout=20000)
    if w < 1024:
        check(await pg.locator('#pf-panel-settings').is_hidden() and await pg.locator('#pf-panel-overview').is_visible(), f'{tag}: โปรไฟล์ — เปิดมาที่แท็บภาพรวม')
        await pg.click('#pf-tab-settings')
        check(await pg.locator('#pf-panel-settings').is_visible() and await pg.locator('#pf-panel-overview').is_hidden(), f'{tag}: กดแท็บตั้งค่า → เห็นการตั้งค่า')
        await pg.focus('#pf-tab-settings'); await pg.keyboard.press('ArrowLeft')
        check(await pg.evaluate("()=>document.activeElement.id") == 'pf-tab-overview' and await pg.locator('#pf-panel-overview').is_visible(), f'{tag}: แท็บใช้ลูกศรคีย์บอร์ดได้')
        await pg.goto(URL + '/?c=%d#/profile/settings' % random.randint(1, 10**6)); await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
        await pg.wait_for_selector('#pf-panel-settings:not(.is-off)', timeout=20000)
        check(True, f'{tag}: ลิงก์ #/profile/settings เปิดแท็บตั้งค่า')
    else:
        check(await pg.locator('#pf-panel-settings').is_visible() and await pg.locator('#pf-panel-overview').is_visible() and await pg.locator('.pf-tabs').is_hidden(), f'{tag}: โปรไฟล์จอกว้าง — แสดง 2 คอลัมน์ ไม่มีแท็บ')
    check(await pg.locator('#btn-logout').is_visible(), f'{tag}: ปุ่มออกจากระบบอยู่ในส่วนตั้งค่า')
    await layout(pg, tag, 'โปรไฟล์', '#screen-profile')
    await pg.wait_for_selector('#notif-body', timeout=20000)
    await pg.wait_for_function("()=>{const b=document.getElementById('notif-body');return b&&!b.querySelector('.skeleton, .gl-spin, .loading-spinner')&&b.textContent.trim().length>10}", timeout=10000)
    nt = (await pg.inner_text('#notif-body')).strip()
    check('กำลังโหลด' not in nt, f'{tag}: การ์ดแจ้งเตือนโหลดเสร็จ (ไม่ค้าง) แม้ service worker ใช้ไม่ได้ — "{nt[:50]}"')
    await pg.locator('#notif-body').scroll_into_view_if_needed()
    await pg.screenshot(path=f'{OUT}/{tag}_notif.png', full_page=False)
    if tag == 'desktop':
        uid = await pg.evaluate("()=>EQApp.user.id"); name = await pg.evaluate("()=>EQApp.user.username")
        ap = await ctx.new_page(); ap.on('pageerror', lambda e: errs.append(str(e)))
        await ap.goto(URL); atok = (await ap.evaluate(REG, 'p5a%d' % random.randint(100000, 999999)))['token']
        aid = await ap.evaluate("t=>fetch('/api/auth/me',{headers:{Authorization:'Bearer '+t}}).then(r=>r.json()).then(j=>j.user.id)", atok)
        psql(f"UPDATE users SET role = 'admin' WHERE id = {aid}")
        await ap.evaluate("t=>localStorage.setItem('wq_token',t)", atok)
        await ap.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
        await ap.wait_for_function("()=>window.EQApp&&EQApp.user&&EQApp.user.role==='admin'", timeout=60000)
        await ap.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
        await ap.evaluate("()=>EQApp.navigateTo('admin')"); await ap.wait_for_selector('#admin-membership-root .pma-tabs', state='attached', timeout=20000)
        await ap.click('#admin-membership summary'); await ap.click('[data-pma-tab="members"]')
        await ap.wait_for_selector('[data-pma-q]', timeout=10000)
        await ap.fill('[data-pma-q]', name); await ap.click('[data-pma-search] button[type=submit]')
        row = ap.locator(f'.pma-row[data-uid="{uid}"]'); await row.wait_for(timeout=10000)
        await row.locator('[data-pma-test]').click()
        await ap.wait_for_function(f"()=>{{const r=document.querySelector('.pma-row[data-uid=\"{uid}\"] .pma-test');return !!r}}", timeout=10000)
        check(psql(f"SELECT is_test FROM users WHERE id = {uid}") == 't', f'{tag}: ผู้ดูแลกด "บัญชีทดสอบ" → is_test=true + ป้ายในแถว')
        await ap.screenshot(path=f'{OUT}/{tag}_admin_testflag.png', full_page=False)
        lb2 = await ap.evaluate("()=>EQApp.api('/leaderboard?period=week')")
        check(not any((e.get('username') or e.get('name')) == name for e in lb2['top']), f'{tag}: บัญชีทดสอบไม่ขึ้นกระดานที่คนอื่นเห็น')
        await ap.locator(f'.pma-row[data-uid="{uid}"] [data-pma-test]').click()
        await ap.wait_for_function(f"()=>{{const r=document.querySelector('.pma-row[data-uid=\"{uid}\"]');return r&&!r.querySelector('.pma-test')}}", timeout=10000)
        check(psql(f"SELECT is_test FROM users WHERE id = {uid}") == 'f', f'{tag}: กดอีกครั้ง → ยกเลิกบัญชีทดสอบ')
    check(wsurls and all('ticket=' in u and 'token=' not in u for u in wsurls), f'{tag}: WebSocket ใช้ตั๋ว ไม่มี JWT ใน URL ({len(wsurls)} ครั้ง)')
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
