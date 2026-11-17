"""E2E: ตะลุยด่านลอยกระทง 2569 (เบราว์เซอร์จริง · เซิร์ฟเวอร์ :3100 + DB eq_dev · ช่วงกิจกรรมต้องครอบเวลาปัจจุบัน — ค่าเริ่มต้น 2–24 พ.ย. 2569)
   ใช้: python3 test/e2e/lkadventure_e2e.py [โฟลเดอร์ภาพหน้าจอ] [390,820,1280]
   ขั้นตอน: หน้าแรกมีแบนเนอร์ตะลุยด่าน (สกินลอยกระทง) → แผนที่ 5 พื้นที่ (ฉากลอยกระทง ไม่มีฟักทอง) → บท 1 กำลังผจญภัย
   → ดูตัวอย่างรางวัล (3D ใส่งอบ) → ทำภารกิจบท 1 ครบ (ใส่ข้อมูลแบบที่ระบบจริงบันทึก) → ปุ่ม "รับรางวัล" → ได้งอบ + 30 Coin → สวมเลย
   → บท 2 ปลดล็อก · เปิดด่านแรก (8 ข้อ · ไม่มีเฉลยในหน้าเว็บ · มีคำศัพท์ลอยกระทง)
   → ทุกขนาดจอ: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error · ไม่ถูก CSP บล็อก"""
import asyncio, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
EID = 'loykrathong-adventure-2026'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
ONLY = sys.argv[2].split(',') if len(sys.argv) > 2 else None
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def sql(q):
    subprocess.run(['psql', DB, '-qc', q], check=True, capture_output=True)

async def layout(pg, tag, sel):
    hs = await pg.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")
    check(hs <= 0, f'{tag}: ไม่มี scroll แนวนอน ({hs})')
    small = await pg.evaluate("""(sel)=>[...document.querySelectorAll(sel)].filter(b=>b.offsetParent&&!b.closest('.sheet-close')&&!b.classList.contains('game-exit')&&b.id!=='ev-back'&&b.getBoundingClientRect().height<44).map(b=>b.textContent.trim().slice(0,24)||b.className)""", sel)
    check(not small, f'{tag}: ปุ่ม ≥ 44px ({small})')

async def shot(pg, name, full=False):
    if SHOTS: await pg.screenshot(path=f'{SHOTS}/{name}.png', full_page=full)

async def run(b, w, h, mobile):
    tag = f'{w}px'
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1 if w > 900 else 2, has_touch=mobile, is_mobile=mobile, service_workers='block')
    await ctx.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI))")
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(500)
    name = 'la%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2800)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(1200)
    bn = await pg.evaluate("()=>{const b=document.getElementById('event-banner');return b&&!b.classList.contains('hidden')?[b.className,b.innerText.replace(/\\s+/g,' ')]:null}")
    check(bn and 'ev-banner-lk' in bn[0] and 'ตะลุยด่านลอยกระทง' in bn[1], f'{tag}: หน้าแรกมีแบนเนอร์ตะลุยด่านลอยกระทง ({bn})')
    await pg.locator('#event-banner').scroll_into_view_if_needed(); await shot(pg, f'home-{w}')
    await pg.click('#event-banner'); await pg.wait_for_timeout(2600)
    info = await pg.evaluate("""()=>{const s=document.getElementById('screen-event');return {open:!s.classList.contains('hidden'),skin:s.classList.contains('ev-skin-lk'),
      regions:s.querySelectorAll('.ev-region').length,locked:s.querySelectorAll('.ev-region.is-locked').length,kt:s.querySelectorAll('.ev-map .lk-kt').length,
      pumpkin:s.innerHTML.includes('hw-pkface'),title:(s.querySelector('#ev-title')||{}).textContent,cur:[...s.querySelectorAll('.ev-med.is-current')].map(g=>g.dataset.ch),
      rewards:s.querySelectorAll('.ev-reward-list .ev-ch-reward').length}}""")
    check(info['open'] and info['skin'], f'{tag}: แตะแบนเนอร์ → หน้าตะลุยด่าน (สกินลอยกระทง)')
    check(info['regions'] == 5 and info['locked'] == 4 and info['cur'] == ['l1'], f'{tag}: แผนที่ 5 พื้นที่ · บท 1 กำลังผจญภัย ({info})')
    check(info['kt'] >= 5 and not info['pumpkin'], f'{tag}: ฉากลอยกระทง (กระทง {info["kt"]} ใบ · ไม่มีฟักทอง)')
    check(info['rewards'] == 5, f'{tag}: รางวัลทุกบท 5 รายการ')
    await shot(pg, f'map-{w}', True)
    await layout(pg, f'{tag} หน้าแผนที่', '#screen-event button')
    # ดูตัวอย่างรางวัลบท 1 (3D ใส่งอบ)
    await pg.locator('.ev-reward-list [data-ev-rw-preview="l1"]').click(); await pg.wait_for_timeout(4000)
    sl = {}
    for _ in range(16):
        sl = await pg.evaluate("()=>{const s=EQAvatar._stages().find(x=>x.box.closest('.hf-dialog'));return s&&s.v?s.v.slots():{}}")
        if sl.get('hat'): break
        await pg.wait_for_timeout(500)
    check(sl.get('hat') == 'hat_lk26_ngob', f'{tag}: ตัวอย่าง 3D ใส่งอบ ({sl.get("hat")})')
    check(await pg.locator('.hf-dialog [data-hf-equip]').count() == 0, f'{tag}: ยังไม่ได้รับ → ไม่มีปุ่มสวม')
    await shot(pg, f'preview-{w}')
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
    await pg.evaluate("()=>document.querySelectorAll('.hf-modal').forEach(o=>o.remove())")
    # ทำภารกิจบท 1 ให้ครบ (ข้อมูลแบบที่ระบบจริงบันทึกตอนจบเกม/ตอบถูก)
    sql(f"""INSERT INTO event_activity (event_id, user_id, kind, ref, correct, total) SELECT '{EID}', id, 'round', 'e2e:' || gen_random_uuid(), 9, 10 FROM users, generate_series(1,5) WHERE username = '{name}'""")
    sql(f"""INSERT INTO answer_events (user_id, skill, item_id, level, correct) SELECT id, 'grammar', 'e2e', NULL, TRUE FROM users, generate_series(1,30) WHERE username = '{name}'""")
    c0 = (await pg.evaluate("async()=>EQApp.api('/coins/wallet')"))['balance']
    await pg.evaluate("()=>EQEvent.open()"); await pg.wait_for_timeout(2500)
    btn = pg.locator('.ev-reward-list [data-ev-ch-claim="l1"]')
    check(await btn.count() == 1, f'{tag}: บท 1 ครบ → ปุ่ม "รับรางวัล"')
    await shot(pg, f'claimable-{w}', True)
    await btn.scroll_into_view_if_needed(); await btn.click(); await pg.wait_for_timeout(4500)
    check(await pg.locator('.hf-dialog.is-reward').count() == 1, f'{tag}: หน้าต่างรางวัล')
    await shot(pg, f'reward-{w}')
    await layout(pg, f'{tag} หน้าต่างรางวัล', '.hf-dialog button')
    await pg.click('.hf-dialog [data-hf-equip]'); await pg.wait_for_timeout(1500)
    me = await pg.evaluate("async()=>EQApp.api('/avatar/me')")
    check(me['outfit'].get('hat') == 'hat_lk26_ngob', f'{tag}: สวมเลย → ใส่งอบ')
    check(any(i['itemId'] == 'hat_lk26_ngob' for i in me['inventory']), f'{tag}: งอบเข้า Inventory')
    # ตรวจรายการรางวัลบทในสมุดบัญชี Coin (ข้อมูลจำลองข้างบนอาจทำให้ได้ Coin จากเป้าหมายรายวัน/Achievement ด้วยตามปกติ)
    led = subprocess.run(['psql', DB, '-tAc', f"SELECT amount FROM coin_transactions WHERE source_key = 'evc:{EID}:l1' AND user_id = (SELECT id FROM users WHERE username = '{name}')"], capture_output=True, text=True).stdout.split()
    c1 = (await pg.evaluate("async()=>EQApp.api('/coins/wallet')"))['balance']
    check(led == ['30'] and c1 >= c0 + 30, f'{tag}: ได้ 30 Coin จากรางวัลบท 1 (ครั้งเดียว · {led} · ยอด {c0}→{c1})')
    again = await pg.evaluate(f"async()=>{{try{{await EQApp.api('/events/{EID}/chapters/l1/claim',{{method:'POST'}});return 'ok'}}catch(e){{return e.code||e.message}}}}")
    check(again == 'ALREADY_CLAIMED', f'{tag}: รับซ้ำไม่ได้ ({again})')
    # บท 2: ด่านแรก
    await pg.evaluate("()=>EQEvent.open()"); await pg.wait_for_timeout(2500)
    cur = await pg.evaluate("()=>[...document.querySelectorAll('#screen-event .ev-med.is-current')].map(g=>g.dataset.ch)")
    check(cur == ['l2'], f'{tag}: บท 2 ปลดล็อก ({cur})')
    await pg.evaluate("()=>EQEvent.startStage('l2-1')"); await pg.wait_for_timeout(2500)
    q = await pg.evaluate("()=>[...document.querySelectorAll('.ev-ch-dots span')].length")
    leak = await pg.evaluate("()=>{const p=document.querySelector('.ev-play');return p?p.innerHTML.includes('correctIndex'):true}")
    skin = await pg.evaluate("()=>Boolean(document.querySelector('.ev-play-ov.ev-skin-lk'))")
    check(q == 8 and not leak and skin, f'{tag}: ด่าน "แผงดอกบัวริมคลอง" เปิดได้ (8 ข้อ · ไม่มีเฉลย · สกินลอยกระทง)')
    await shot(pg, f'stage-{w}')
    await layout(pg, f'{tag} หน้าด่าน', '.ev-play button')
    csp = await pg.evaluate("()=>window.__csp")
    check(not csp, f'{tag}: ไม่มีการละเมิด CSP ({csp[:2]})')
    check(not errs, f'{tag}: ไม่มี JS error ({errs[:2]})')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for w, h, m in [v for v in ((390, 844, True), (820, 1180, True), (1280, 860, False)) if not ONLY or str(v[0]) in ONLY]:
            await run(b, w, h, m)
        await b.close()
    print('\nRESULT:', 'ALL PASS' if not fails else f'{len(fails)} FAIL')
    sys.exit(1 if fails else 0)

asyncio.run(main())
