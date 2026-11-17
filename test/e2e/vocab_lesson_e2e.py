"""E2E: v1.10.0 Phase 2 — บทเรียนคำศัพท์ v2 (เซิร์ฟเวอร์เก็บเฉลย · แบบฝึกหลายแบบ · ตัวอย่าง/คำแปลใหม่)
   ใช้: [LEVEL=B2] python3 test/e2e/vocab_lesson_e2e.py [outdir]   (เซิร์ฟเวอร์ :3100 + DB eq_dev · ค่าเริ่มต้น LEVEL=A1)
   desktop 1280 · tablet 820 · mobile 390: เรียน Unit แรกครบรอบ → สรุปผล · ทบทวนคำถึงกำหนด (เติมคำ/สะกด/ทายคำ)
   ตรวจ: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error · หน้าเว็บไม่ได้รับ wordId/เฉลยก่อนตอบ"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/vocab_lesson_e2e'
LV = os.environ.get('LEVEL', 'A1')
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
modals = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()

async def layout(pg, tag, where):
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('#screen-game:not(.hidden) button, #screen-game:not(.hidden) input')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&(r.width<44||r.height<44)}).map(x=>x.id||x.className)})""")
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def answer_current(pg, mode='first'):
    """ตอบข้อปัจจุบัน: เลือกตัวเลือกแรก หรือพิมพ์คำ — คืนชนิดข้อ"""
    t = await pg.evaluate("()=>document.getElementById('card-word-front').className")
    if await pg.locator('.spell-input').count():
        await pg.fill('.spell-input', 'zzzz'); await pg.click('.spell-form button[type=submit]')
        kind = 'spell'
    else:
        await pg.locator('#quiz-choices .quiz-choice').first.click()
        kind = t.replace('card-word is-', '')
    await pg.wait_for_selector('#btn-quiz-next:not(.hidden)', timeout=15000)
    await pg.wait_for_timeout(150)
    # ป๊อปอัปเลื่อนเลเวล (EXP ถึงเกณฑ์) — ปิดด้วยปุ่มในป๊อปอัป
    if await pg.locator('.modal-overlay').count():
        txt = await pg.inner_text('.modal-overlay')
        btn = pg.locator('.modal-overlay button').last
        await btn.click()
        await pg.wait_for_function("()=>!document.querySelector('.modal-overlay')", timeout=5000)
        modals.append(txt[:40].replace('\n', ' '))
    return kind

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    pg = await ctx.new_page(); errs = []; payloads = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    async def on_resp(r):
        if '/api/lesson/start' in r.url:
            try: payloads.append(await r.json())
            except Exception: pass
    pg.on('response', lambda r: asyncio.ensure_future(on_resp(r)))
    await pg.goto(URL); await pg.wait_for_timeout(300)
    name = 'vle%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    await pg.goto(URL + '/?c=%d#/learn' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    uid = await pg.evaluate("()=>EQApp.user.id")
    await pg.wait_for_selector('#path-levels [data-level]', timeout=30000)
    if LV != 'A1':   # ระดับสูงยังล็อกในเส้นทางแนะนำ — ใช้โหมดสำรวจอิสระ
        await pg.click('.path-view-btn[data-view="explore"]'); await pg.wait_for_timeout(600)
    if not await pg.locator(f'button.path-unit[data-unit^="{LV}-"]').count():
        await pg.click(f'#path-levels [data-level="{LV}"]')
    await pg.locator(f'button.path-unit[data-unit^="{LV}-"]:not([disabled])').first.click()
    await pg.wait_for_selector('#screen-game:not(.hidden) #quiz-choices .quiz-choice', timeout=30000)
    p0 = payloads[-1] if payloads else {}
    raw = json.dumps(p0)
    sid = p0.get('sessionId', '')
    first_wid = psql(f"SELECT questions->0->>'wordId' FROM vocab_lesson_sessions WHERE id = '{sid}'") if sid else ''
    check(bool(first_wid) and first_wid not in raw and 'answerKey' not in raw, f'{tag}: payload ไม่มี wordId/เฉลย')
    check(await pg.locator('#quiz-choices .quiz-choice').count() == 5 and 'ความหมาย' in await pg.inner_text('#card-pos-chip-front'), f'{tag}: คำใหม่ = แบบความหมาย 5 ตัวเลือก')
    await layout(pg, tag, 'บทเรียน (ก่อนตอบ)')
    await pg.screenshot(path=f'{OUT}/{LV}_{tag}_meaning.png', full_page=False)
    total = len(p0.get('questions', []))
    saw_ex_th = False
    for i in range(total):
        await answer_current(pg)
        fb = await pg.inner_text('#quiz-feedback')
        if i == 0:
            check(('ถูกต้อง' in fb or 'ยังไม่ถูก' in fb) and 'EXP' in fb, f'{tag}: ตอบแล้วเห็นผล + EXP')
            await layout(pg, tag, 'บทเรียน (หลังตอบ)')
            await pg.screenshot(path=f'{OUT}/{LV}_{tag}_answered.png', full_page=True)
        if await pg.locator('#word-dict-ex-th:not(.hidden)').count(): saw_ex_th = True
        await pg.click('#btn-quiz-next')
    check(saw_ex_th, f'{tag}: แผงคำศัพท์มีประโยคตัวอย่าง + คำแปลไทย')
    await pg.wait_for_selector('#screen-summary:not(.hidden)', timeout=15000)
    check(int(await pg.inner_text('#summary-known')) + int(await pg.inner_text('#summary-learning')) == total, f'{tag}: สรุปผลครบ {total} ข้อ')

    # ทบทวนคำถึงกำหนด: ตั้งคำที่ "ผ่านแล้ว" ให้ถึงกำหนด → ต้องเจอแบบเติมคำ/สะกด/ทายคำ
    ids = json.loads(subprocess.run(['node', '-e', """
      process.env.DATABASE_URL='%s';const ws=require('./utils/wordStore');
      ws.ready().then(()=>{const out=ws.getLevelWords('%s').filter(w=>w.thai&&w.learner&&w.learner.gapOk&&ws.CONTENT_CATEGORIES.has(w.category)
        &&w.learner.form.toLowerCase()===String(w.word).replace(/\\s*\\([^)]*\\)/g,'').toLowerCase()).slice(20,32).map(w=>w.id);
        console.log(JSON.stringify(out));process.exit(0)})""" % (DB, LV)], capture_output=True, text=True, cwd=os.path.join(os.path.dirname(__file__), '..', '..')).stdout.strip().splitlines()[-1])
    for wid in ids:
        psql(f"INSERT INTO word_progress (user_id, word_id, level, status, ever_known, srs_reps, srs_interval, srs_ease, srs_due_at, times_seen, times_correct) VALUES ({uid}, '{wid}', '{LV}', 'learning', TRUE, 1, 1, 2.5, NOW() - INTERVAL '1 hour', 1, 1) ON CONFLICT (user_id, word_id) DO UPDATE SET ever_known = TRUE, srs_due_at = NOW() - INTERVAL '1 hour', times_seen = 1")
    await pg.evaluate("()=>EQApp.openDueReview()")
    await pg.wait_for_selector('#screen-game:not(.hidden) #card-word-front', timeout=30000)
    await pg.wait_for_function("()=>document.querySelector('#quiz-choices .quiz-choice, #quiz-choices .spell-input')", timeout=20000)
    seen = {}
    for i in range(12):
        kind = (await pg.evaluate("()=>document.getElementById('card-word-front').className")).replace('card-word is-', '')
        if kind not in seen:
            seen[kind] = True
            await layout(pg, tag, f'ทบทวน ({kind})')
            await pg.screenshot(path=f'{OUT}/{LV}_{tag}_review_{kind}.png', full_page=False)
        if kind in ('context', 'spell'):
            check('_____' in await pg.inner_text('#card-word-front'), f'{tag}: {kind} มีประโยคเว้นช่อง')
        await answer_current(pg)
        if kind in ('context', 'spell') and f'{kind}_after' not in seen:
            seen[f'{kind}_after'] = True
            check(await pg.locator('#card-word-front .gap-fill').count() == 1, f'{tag}: {kind} หลังตอบเติมคำที่ถูกในประโยค')
            await pg.screenshot(path=f'{OUT}/{LV}_{tag}_review_{kind}_answered.png', full_page=True)
        await pg.click('#btn-quiz-next')
        if await pg.locator('#screen-summary:not(.hidden)').count(): break
        await pg.wait_for_function("()=>document.querySelector('#quiz-choices .quiz-choice:not(:disabled), #quiz-choices .spell-input:not(:disabled)')", timeout=15000)
    check({'context', 'spell', 'reverse'} <= set(seen), f'{tag}: รอบทบทวนมีแบบเติมคำ/สะกด/ทายคำ {sorted(k for k in seen if "_" not in k)}')
    check(not errs, f'{tag}: ไม่มี JS error {errs[:3]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, 1280, 900, False, 'desktop')
        await run(b, 820, 1180, True, 'tablet')
        await run(b, 390, 844, True, 'mobile')
        await b.close()
    print('modals:', modals)
    print('\nFAILS:', len(fails)); [print(' -', f) for f in fails]
    print('ALL PASS' if not fails else '')
asyncio.run(main())
