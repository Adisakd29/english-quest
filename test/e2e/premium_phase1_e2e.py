"""E2E: v1.10.0 Phase 1 — หน้า Premium (เปรียบเทียบ Free/Premium · ทดลองใช้ · แดชบอร์ด) + ทบทวนคำถึงกำหนด + ผู้ดูแล (สมาชิก/ประวัติ)
   ใช้: python3 test/e2e/premium_phase1_e2e.py [outdir]   (เซิร์ฟเวอร์ :3100 + DB eq_dev)
   ขนาดจอ: desktop 1280 · tablet 820 · mobile 390 — ตรวจ: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/premium_phase1_e2e'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
async def layout(pg, tag, where, scope='#screen-premium:not(.hidden)'):
    lay = await pg.evaluate("""(scope)=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll(scope+' button, '+scope+' input:not([type=hidden]), '+scope+' summary')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.classList.contains('tq-link')&&(r.width<44||r.height<44)}).map(x=>x.tagName+'.'+x.className+':'+(x.textContent||x.placeholder||'').trim().slice(0,14))})""", scope)
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def login(b, w, h, mobile, prefix):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e) + ' @ ' + (e.stack or '')[:300]))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    name = '%s%d' % (prefix, random.randint(100000, 999999))
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    return ctx, pg, errs, name, await pg.evaluate("()=>EQApp.user.id")

async def run(b, w, h, mobile, tag):
    ctx, pg, errs, name, uid = await login(b, w, h, mobile, 'pqe')
    # 1) ผู้ใช้ Free: เปรียบเทียบ + ทดลองใช้ + ตัวอย่างทักษะ + กำลังพัฒนา
    await pg.evaluate("()=>EQApp.navigateTo('premium')"); await pg.wait_for_selector('#pm-title', timeout=20000)
    check(await pg.locator('.pmc-table tbody tr').count() >= 8, f'{tag}: ตารางเปรียบเทียบ Free/Premium')
    check(await pg.locator('[data-pm-trial]').count() == 1, f'{tag}: มีปุ่มทดลองใช้ฟรี')
    check(await pg.locator('.pmd-skills .pmd-skill').count() == 6 and await pg.locator('.pmd-locked').count() == 1, f'{tag}: ตัวอย่างทักษะ 6 ด้าน + ส่วนที่ล็อก')
    check('ยังไม่รวมในสิทธิ์ตอนนี้' in await pg.inner_text('.pmr summary'), f'{tag}: ฟีเจอร์กำลังพัฒนาแยกชัดเจนว่ายังไม่รวม')
    await layout(pg, tag, 'Premium (Free)')
    await pg.screenshot(path=f'{OUT}/{tag}_free.png', full_page=True)
    # 2) ทดลองใช้ → แดชบอร์ด
    await pg.click('[data-pm-trial]'); await pg.wait_for_function("()=>document.getElementById('pm-title')&&document.getElementById('pm-title').textContent.includes('แดชบอร์ด')", timeout=20000)
    st = await pg.inner_text('.pm-status')
    check('ทดลองใช้' in st, f'{tag}: ทดลองใช้ → แดชบอร์ด + สถานะทดลองใช้')
    check(await pg.locator('.pmd-tile').count() == 3 and await pg.locator('.pmd-skill').count() == 6 and await pg.locator('.pmd-week .pmd-bars li').count() == 14, f'{tag}: แดชบอร์ด: ภาพรวม 3 · ทักษะ 6 · กราฟ 14 วัน')
    check('EXP' in await pg.inner_text('.pmd-note') and 'CEFR' in await pg.inner_text('#screen-premium'), f'{tag}: แยก EXP / คะแนน / CEFR ชัดเจน')
    await layout(pg, tag, 'แดชบอร์ด')
    await pg.screenshot(path=f'{OUT}/{tag}_dashboard.png', full_page=True)
    # 3) คำถึงกำหนดทบทวน → เริ่มรอบทบทวน
    words = await pg.evaluate("()=>EQApp.api('/words/A1').then(d=>d.words.filter(w=>['noun','verb','adj','adv'].includes(w.category)).slice(0,1).map(w=>w.id))")
    if words:
        psql(f"INSERT INTO word_progress (user_id, word_id, level, status, ever_known, srs_reps, srs_due_at, times_seen, times_correct) VALUES ({uid}, '{words[0]}', 'A1', 'learning', TRUE, 1, NOW() - INTERVAL '1 hour', 1, 1)")
    await pg.evaluate("()=>EQPremium.open()"); await pg.wait_for_selector('[data-pm-due]', timeout=20000)
    check(await pg.locator('.pmd-queue [data-pm-due]').count() == 1, f'{tag}: คิวทบทวนมีคำที่ถึงกำหนด')
    await pg.click('.pmd-queue [data-pm-due]')
    await pg.wait_for_selector('#screen-game:not(.hidden)', timeout=20000)
    await pg.wait_for_function("()=>document.querySelectorAll('#quiz-choices button').length>=2", timeout=20000)
    check(True, f'{tag}: กด "เริ่มทบทวน" → เข้ารอบทบทวนคำศัพท์')
    await pg.screenshot(path=f'{OUT}/{tag}_due_review.png', full_page=False)
    check(not errs, f'{tag}: ไม่มี JS error {errs[:3]}')
    await ctx.close()

    # 4) ผู้ดูแล: สมาชิก + ประวัติ
    actx, apg, aerrs, aname, aid = await login(b, w, h, mobile, 'pqa')
    psql(f"UPDATE users SET role = 'admin' WHERE id = {aid}")
    await apg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6)); await apg.wait_for_function("()=>window.EQApp&&EQApp.user&&EQApp.user.role==='admin'", timeout=60000)
    await apg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    await apg.evaluate("()=>EQApp.navigateTo('admin')"); await apg.wait_for_selector('#admin-membership-root .pma-tabs', state='attached', timeout=20000)
    await apg.click('#admin-membership summary')
    await apg.click('[data-pma-tab="members"]'); await apg.wait_for_selector('[data-pma-q]', timeout=10000)
    await apg.fill('[data-pma-q]', name); await apg.click('[data-pma-search] button[type=submit]')
    await apg.wait_for_selector(f'.pma-row[data-uid="{uid}"]', timeout=10000)
    row = apg.locator(f'.pma-row[data-uid="{uid}"]')
    check('ทดลองใช้' in await row.inner_text(), f'{tag}: ผู้ดูแลค้นเจอสมาชิก (สถานะทดลองใช้)')
    await row.locator('[data-pma-note]').fill('ทดสอบให้สิทธิ์'); await row.locator('[data-pma-grant]').click()
    await apg.wait_for_function(f"()=>{{const r=document.querySelector('.pma-row[data-uid=\"{uid}\"]');return r&&r.textContent.includes('Premium')&&!r.textContent.includes('ทดลองใช้ Premium')}}", timeout=10000)
    check(psql(f"SELECT status FROM memberships WHERE user_id = {uid}") == 'active', f'{tag}: ให้สิทธิ์ → active')
    await apg.click('[data-pma-tab="audit"]'); await apg.wait_for_selector('#admin-membership-root .pma-list', timeout=10000)
    txt = await apg.inner_text('#admin-membership-root')
    check('ให้สิทธิ์ Premium' in txt and 'เริ่มทดลองใช้' in txt, f'{tag}: ประวัติ (Audit Log) แสดงการกระทำ')
    await layout(apg, tag, 'ผู้ดูแล: ประวัติ', '#admin-membership')
    await apg.screenshot(path=f'{OUT}/{tag}_admin_audit.png', full_page=False)
    check(not aerrs, f'{tag}: ผู้ดูแล ไม่มี JS error {aerrs[:2]}')
    await actx.close()

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
