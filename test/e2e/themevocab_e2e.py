"""E2E: v1.12.0 หมวดคำศัพท์ตามเทศกาล (วันฮาโลวีน · วันลอยกระทง) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/themevocab_e2e.py [โฟลเดอร์ภาพหน้าจอ] [390,820,1280]
   ขั้นตอน: เส้นทางการเรียน → การ์ด "วันลอยกระทง" → 40 คำ (คำแปล · ประโยคตัวอย่าง · ปุ่มฟังเสียง)
   → ฝึก 10 ข้อ (ตอบ · เฉลย · ข้อต่อไป) → ผลคะแนนตรงกับฐานข้อมูล · EXP ไม่เปลี่ยน
   → หน้ารวม 2 หมวด + ความคืบหน้า → การ์ด "วันฮาโลวีน" 40 คำ → เปิดลิงก์ตรง #/themes/halloween หลังรีโหลด
   → ทุกขนาดจอ: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error · ไม่ถูก CSP บล็อก · โหมดมืด (1280)"""
import asyncio, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
ONLY = sys.argv[2].split(',') if len(sys.argv) > 2 else None
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()

async def layout(pg, tag, where, scope):
    hs = await pg.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")
    check(hs <= 0, f'{tag} {where}: ไม่มี scroll แนวนอน ({hs})')
    small = await pg.evaluate("""(sc)=>[...document.querySelectorAll(sc+' button')].filter(b=>b.offsetParent&&b.getBoundingClientRect().height<44).map(b=>b.textContent.trim().slice(0,24)||b.className)""", scope)
    check(not small, f'{tag} {where}: ปุ่ม ≥ 44px ({small})')

async def run(b, w, h, mobile, dark=False):
    tag = f'{w}px' + (' มืด' if dark else '')
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1 if w > 900 else 2, has_touch=mobile, is_mobile=mobile,
                              service_workers='block', color_scheme='dark' if dark else 'light')
    await ctx.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI))")
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(500)
    name = 'tv%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    uid = psql(f"SELECT id FROM users WHERE username = '{name}'")
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2600)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    exp0 = psql(f"SELECT exp FROM users WHERE id = {uid}")
    # เส้นทางการเรียน: การ์ด 2 หมวด
    await pg.evaluate("()=>EQApp.navigateTo('learn')"); await pg.wait_for_timeout(1500)
    cards = await pg.evaluate("()=>[...document.querySelectorAll('#screen-path .tv-card')].map(c=>({id:c.dataset.tvOpen,t:c.innerText.replace(/\\s+/g,' '),h:c.getBoundingClientRect().height,vis:Boolean(c.offsetParent)}))")
    check([c['id'] for c in cards] == ['halloween', 'loykrathong'] and all(c['vis'] for c in cards), f'{tag}: เส้นทางการเรียนมีการ์ด วันฮาโลวีน · วันลอยกระทง')
    check('วันลอยกระทง' in cards[1]['t'] and 'ยาก' in cards[1]['t'], f'{tag}: การ์ดบอกชื่อหมวด + มีระดับยาก ({cards[1]["t"]})')
    if SHOTS and not dark: await pg.locator('#screen-path .tv-strip').screenshot(path=f'{SHOTS}/tv-strip-{w}.png')
    await layout(pg, tag, 'เส้นทางการเรียน', '#screen-path .tv-strip')
    # → วันลอยกระทง
    await pg.click('#screen-path [data-tv-open="loykrathong"]'); await pg.wait_for_selector('#tv-ctitle', timeout=15000); await pg.wait_for_timeout(400)
    d = await pg.evaluate("""()=>({hash:location.hash,title:document.getElementById('tv-ctitle').textContent,n:document.querySelectorAll('#screen-themes .tv-item').length,
      first:document.querySelector('#screen-themes .tv-item').innerText,say:document.querySelectorAll('#screen-themes [data-tv-say]').length,
      quiz:document.querySelectorAll('#screen-themes [data-tv-quiz]').length})""")
    check(d['hash'] == '#/themes/loykrathong' and 'ลอยกระทง' in d['title'], f'{tag}: เปิดหมวดลอยกระทง ({d["hash"]})')
    check(d['n'] == 40 and 'krathong' in d['first'] and 'กระทง' in d['first'] and 'banana leaves' in d['first'], f'{tag}: 40 คำ · คำแปล · ประโยคตัวอย่าง')
    check(d['quiz'] == 2, f'{tag}: ปุ่ม "ฝึก 10 ข้อ"')
    check(d['say'] in (0, 80), f'{tag}: ปุ่มฟังเสียง คำ+ประโยค ({d["say"]})')
    if SHOTS: await pg.screenshot(path=f'{SHOTS}/tv-lk-{w}{"-dark" if dark else ""}.png', full_page=False)
    await layout(pg, tag, 'หน้าหมวด', '#screen-themes')
    # ฝึก 10 ข้อ
    await pg.click('#screen-themes [data-tv-quiz]'); await pg.wait_for_selector('#tv-qtitle', timeout=15000)
    types, right, nopt = set(), 0, set()
    for i in range(10):
        await pg.wait_for_selector('#screen-themes [data-tv-opt]', timeout=10000)
        q = await pg.evaluate("()=>{const s=EQThemeVocab._state().quiz;return s.s.questions[s.i]}")
        types.add(q['type'])
        nopt.add(await pg.locator('#screen-themes [data-tv-opt]').count())
        if i == 0: await layout(pg, tag, 'แบบฝึก', '#screen-themes')
        await pg.click(f'#screen-themes [data-tv-opt="{random.randint(0, 4)}"]')
        await pg.wait_for_selector('#screen-themes .wk-fb', timeout=10000)
        fb = await pg.evaluate("()=>{const f=document.querySelector('#screen-themes .wk-fb');return {right:f.classList.contains('is-right'),t:f.innerText,dis:[...document.querySelectorAll('#screen-themes [data-tv-opt]')].every(b=>b.disabled),mark:document.querySelectorAll('#screen-themes .wk-opt.is-right').length}}")
        if i == 0: check(fb['dis'] and fb['mark'] == 1 and '=' in fb['t'], f'{tag}: ตอบแล้วล็อกตัวเลือก · ไฮไลต์คำตอบที่ถูก · เฉลยคำแปล+ประโยค')
        right += fb['right']
        await pg.click('#screen-themes [data-tv-next]'); await pg.wait_for_timeout(250)
    await pg.wait_for_selector('#tv-rtitle', timeout=10000)
    shown = await pg.evaluate("()=>document.querySelector('#screen-themes .tq-score b').textContent")
    db = psql(f"SELECT score FROM theme_vocab_sessions WHERE user_id = {uid} ORDER BY id DESC LIMIT 1")
    check(types == {'meaning'}, f'{tag}: ทายความหมายทุกข้อ ({sorted(types)})')
    check(nopt == {5}, f'{tag}: 5 ตัวเลือกทุกข้อ ({nopt})')
    check(shown == db == str(right), f'{tag}: คะแนนที่แสดง = ฐานข้อมูล = ที่ตอบถูก ({shown}/{db}/{right})')
    check(psql(f"SELECT exp FROM users WHERE id = {uid}") == exp0, f'{tag}: ไม่ให้ EXP')
    if SHOTS and not dark: await pg.screenshot(path=f'{SHOTS}/tv-result-{w}.png', full_page=False)
    await layout(pg, tag, 'ผลคะแนน', '#screen-themes')
    # หน้ารวม
    await pg.click('#screen-themes [data-tv-back-cat]'); await pg.wait_for_selector('#tv-ctitle', timeout=10000)
    await pg.click('#screen-themes [data-tv-hub]'); await pg.wait_for_selector('#tv-title', timeout=10000)
    hub = await pg.evaluate("()=>[...document.querySelectorAll('#screen-themes [data-tv-cat]')].map(c=>c.dataset.tvCat+'|'+c.innerText.replace(/\\s+/g,' '))")
    check(len(hub) == 4 and hub[0].startswith('halloween|') and hub[1].startswith('halloween-hard|') and 'ยาก' in hub[1] and 'แม่นยำ' in hub[2], f'{tag}: หน้ารวม 4 หมวด (พื้นฐาน/ยาก) + ความคืบหน้า ({hub[2][:70]})')
    await layout(pg, tag, 'หน้ารวม', '#screen-themes')
    await pg.click('#screen-themes [data-tv-cat="halloween"]'); await pg.wait_for_selector('#tv-ctitle', timeout=10000)
    hw = await pg.evaluate("()=>({t:document.getElementById('tv-ctitle').textContent,n:document.querySelectorAll('#screen-themes .tv-item').length,txt:document.getElementById('screen-themes').innerText})")
    check('ฮาโลวีน' in hw['t'] and hw['n'] == 40 and 'pumpkin' in hw['txt'] and "jack-o'-lantern" in hw['txt'], f'{tag}: หมวดฮาโลวีน 40 คำ')
    if SHOTS and not dark: await pg.screenshot(path=f'{SHOTS}/tv-hw-{w}.png', full_page=False)
    # สลับไประดับยาก
    await pg.click('#screen-themes .tv-lvbtn[data-tv-cat="halloween-hard"]'); await pg.wait_for_function("()=>((document.getElementById('tv-ctitle')||{}).textContent||'').includes('ระดับยาก')", timeout=10000)
    hh = await pg.evaluate("()=>({h:location.hash,n:document.querySelectorAll('#screen-themes .tv-item').length,cefr:document.querySelectorAll('#screen-themes .tv-item .tv-cefr').length,on:(document.querySelector('.tv-lvbtn.is-on')||{}).textContent||'',txt:document.getElementById('screen-themes').innerText})")
    check(hh['h'] == '#/themes/halloween-hard' and hh['n'] == 40 and hh['cefr'] == 40 and 'ยาก' in hh['on'] and 'eerie' in hh['txt'], f'{tag}: สลับระดับยาก — 40 คำ มี CEFR ทุกคำ ({hh["h"]})')
    await layout(pg, tag, 'ระดับยาก', '#screen-themes')
    if SHOTS and not dark: await pg.screenshot(path=f'{SHOTS}/tv-hard-{w}.png', full_page=False)
    await pg.click('#screen-themes [data-tv-quiz]'); await pg.wait_for_selector('#screen-themes [data-tv-opt]', timeout=10000)
    hq = await pg.evaluate("()=>({n:document.querySelectorAll('#screen-themes [data-tv-opt]').length,c:Boolean(document.querySelector('#screen-themes .wk-q .tv-cefr'))})")
    check(hq['n'] == 5 and hq['c'], f'{tag}: ฝึกระดับยาก 5 ตัวเลือก + ป้าย CEFR ({hq})')
    if SHOTS and not dark: await pg.screenshot(path=f'{SHOTS}/tv-hardq-{w}.png', full_page=False)
    await pg.click('#screen-themes [data-tv-leave]'); await pg.wait_for_selector('#tv-ctitle', timeout=10000)
    await pg.click('#screen-themes .tv-lvbtn[data-tv-cat="halloween"]'); await pg.wait_for_function("()=>!((document.getElementById('tv-ctitle')||{}).textContent||'').includes('ระดับยาก')", timeout=10000)
    # ลิงก์ตรงหลังรีโหลด
    await pg.reload(); await pg.wait_for_timeout(2800)
    vis = await pg.evaluate("()=>({s:[...document.querySelectorAll('.screen')].filter(s=>!s.classList.contains('hidden')).map(s=>s.id),t:(document.getElementById('tv-ctitle')||{}).textContent||''})")
    check(vis['s'] == ['screen-themes'] and 'ฮาโลวีน' in vis['t'], f'{tag}: ลิงก์ตรง #/themes/halloween หลังรีโหลด ({vis})')
    # ปุ่มกลับ → เส้นทางการเรียน
    await pg.click('#screen-themes [data-tv-hub]'); await pg.wait_for_selector('#tv-title', timeout=10000)
    await pg.click('#screen-themes [data-tv-nav="learn"]'); await pg.wait_for_timeout(1500)
    check(await pg.evaluate("()=>!document.getElementById('screen-path').classList.contains('hidden')"), f'{tag}: ปุ่มกลับไปเส้นทางการเรียน')
    csp = await pg.evaluate("()=>window.__csp")
    check(not csp, f'{tag}: ไม่มีการละเมิด CSP ({csp[:2]})')
    check(not errs, f'{tag}: ไม่มี JS error ({errs[:2]})')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h, m in [v for v in ((390, 844, True), (820, 1180, True), (1280, 860, False)) if not ONLY or str(v[0]) in ONLY]:
            await run(b, w, h, m)
        if not ONLY or '1280' in ONLY: await run(b, 1280, 860, False, dark=True)
        await b.close()
    print('\nRESULT:', 'ALL PASS' if not fails else f'{len(fails)} FAIL')
    sys.exit(1 if fails else 0)

asyncio.run(main())
