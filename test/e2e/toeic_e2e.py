"""E2E — TOEIC-style Listening Part 1
   Practice: Login → TOEIC Practice → Listening → Part 1 → Practice → Audio Check → Question → Listen → Answer → Feedback
             → Transcript → Vocabulary → Next → Results → Progress Saved
   Mock:     Login → TOEIC → Part 1 → Mock Test → Audio Check → Start → 6 Questions → Audio plays once → No transcript
             → No replay (รีโหลดหน้าก็ฟังซ้ำไม่ได้) → เน็ตหลุดหยุดรอไม่หักคะแนน → Finish → Results → Review
   ใช้: python3 test/e2e/toeic_e2e.py [width] [light|dark]   (ต้องเปิดเซิร์ฟเวอร์ที่ :3100 ด้วย DB eq_dev)"""
import asyncio, json, os, random, subprocess, sys
from playwright.async_api import async_playwright
EQ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
OUT = os.environ.get('E2E_OUT', '/tmp/toeic_e2e_')
W = int(sys.argv[1]) if len(sys.argv) > 1 else 390
H = 844 if W < 700 else 900
THEME = sys.argv[2] if len(sys.argv) > 2 else 'light'
BANK = {q['id']: q for q in json.load(open(os.path.join(EQ, 'data/toeic/part1/bank.json')))['questions']}
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
def key_of(sid, qid):
    items = json.loads(psql(f"SELECT items FROM toeic_sessions WHERE id = {sid}"))
    v = [x for x in items if x['qid'] == qid][0]['variant']
    return [x for x in BANK[qid]['variants'] if x['v'] == v][0]['correctOption']
def wrong(l): return [x for x in 'ABCD' if x != l][0]

async def overflow(page, tag):
    sw = await page.evaluate("()=>[document.documentElement.scrollWidth, innerWidth]")
    check(sw[0] <= sw[1] + 1, f'{tag}: ไม่มี scroll แนวนอน ({sw[0]} ≤ {sw[1]})')
async def skip_audio(page):
    # ข้ามไปท้ายไฟล์เสียง (ชุดทดสอบเท่านั้น — เสียงจริงยาว ~18 วินาที/ข้อ)
    await page.evaluate("()=>{const a=EQToeic._audio(); if(a&&a.duration) a.currentTime=Math.max(0,a.duration-0.15)}")
    await page.wait_for_timeout(700)
async def cur(page):
    return await page.evaluate("()=>{const h=location.hash.split('/');return h[2]}")
async def cur_qid(page):
    sid = await cur(page)
    n = int((await page.inner_text('#tq-qno')).split()[1]) - 1
    return sid, json.loads(psql(f"SELECT items FROM toeic_sessions WHERE id = {sid}"))[n]['qid']
async def dismiss_levelup(page):
    if await page.locator('#levelup-ok').count() and await page.locator('#levelup-ok').is_visible():
        await page.click('#levelup-ok'); await page.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        errs = []
        # service_workers='block': ให้ page.route ดักไฟล์เสียงได้จริง (จำลองเน็ตหลุด)
        ctx = await b.new_context(viewport={'width': W, 'height': H}, has_touch=W < 500, color_scheme='dark' if THEME == 'dark' else 'light', service_workers='block')
        page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto('http://localhost:3100'); await page.wait_for_timeout(1500)
        name = 'tqe%d' % random.randint(1000, 999999)
        r = await page.evaluate(REG, name)
        await page.evaluate("t=>localStorage.setItem('wq_token',t)", r['token']); await page.reload(); await page.wait_for_timeout(2200)
        uid = await page.evaluate("()=>EQApp.user.id"); exp0 = await page.evaluate("()=>EQApp.user.exp")

        # ---------- เมนู: เรียน → TOEIC Practice → Listening → Part 1 ----------
        await page.evaluate("()=>EQApp.navigateTo('learn')"); await page.wait_for_timeout(1200)
        check(await page.locator('#screen-path [data-nav-to="toeic"]').count() == 1, 'หน้าเรียนมีเมนู TOEIC Practice')
        await page.click('#screen-path [data-nav-to="toeic"]'); await page.wait_for_timeout(1200)
        check(await page.locator('#screen-toeic .tq-part:not(.is-soon)').count() == 1 and await page.locator('#screen-toeic .tq-part.is-soon').count() == 6, 'Hub: Part 1 เปิด · Part 2–7 เร็ว ๆ นี้')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_1hub.png', full_page=True); await overflow(page, 'Hub')
        await page.click('[data-tq-nav="toeic-p1"]'); await page.wait_for_timeout(1200)
        check(await page.locator('[data-tq-act="practice"]').count() == 1 and await page.locator('[data-tq-act="mock"]').count() == 1, 'Landing: ปุ่ม Practice + Mock Test')
        check('Accuracy' in await page.inner_text('#screen-toeic') and 'Weak Skill' in await page.inner_text('#screen-toeic'), 'Landing: สถิติ Accuracy / Questions Practiced / Best / Weak Skill')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_2landing.png', full_page=True); await overflow(page, 'Landing')

        # ---------- Practice ----------
        await page.click('[data-tq-act="practice"]'); await page.wait_for_timeout(500)
        await page.click('.tq-setup [data-cfg="size"][data-v="5"]')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_3setup.png')
        await page.click('.tq-setup [data-go]'); await page.wait_for_timeout(500)
        check(await page.locator('.tq-check').count() == 1, 'Audio Check ก่อนฝึก')
        await page.click('.tq-check [data-play]'); await page.wait_for_timeout(800); await skip_audio(page); await page.wait_for_timeout(500)
        check(await page.locator('.tq-check [data-ok]').is_visible(), 'Audio Check: ถาม "ได้ยินเสียงชัดเจนหรือไม่?"')
        await page.click('.tq-check [data-ok]'); await page.wait_for_timeout(2000)
        check(await page.locator('#screen-toeic-play:not(.hidden) #tq-qno').count() == 1, 'เข้าข้อที่ 1')
        check(await page.locator('.tq-lines').count() == 0, 'ก่อนตอบไม่มี transcript')
        check(await page.locator('[data-tq-ans]:disabled').count() == 4, 'ปุ่ม A–D รอจนกว่าจะเริ่มฟัง')
        alt = await page.get_attribute('#tq-img', 'alt')
        check(alt.startswith('ภาพประกอบข้อที่'), 'alt ก่อนตอบไม่เปิดเผยคำตอบ')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_4question.png')
        # ภาพกับปุ่มคำตอบอยู่ในจอเดียว (จอสูงพอ)
        if H >= 800:
            box = await page.locator('[data-tq-ans="D"]').bounding_box()
            check(box['y'] + box['height'] <= H, f'ปุ่มคำตอบอยู่ในจอโดยไม่ต้องเลื่อน (D bottom {int(box["y"]+box["height"])} ≤ {H})')
            hit = await page.locator('[data-tq-ans="A"]').bounding_box()
            check(hit['height'] >= 44, f'ปุ่ม A–D สูง ≥ 44px ({int(hit["height"])})')
        await page.click('[data-tq-play]'); await page.wait_for_timeout(900)
        check(await page.locator('#tq-eq.is-on').count() == 1, 'แสดง Listening indicator ขณะเล่น')
        await skip_audio(page)
        check('Replay' in await page.inner_text('[data-tq-play]'), 'Practice: มีปุ่ม Replay หลังเสียงจบ')
        sid, qid = await cur_qid(page)
        k = key_of(sid, qid)
        await page.click(f'[data-tq-ans="{wrong(k)}"]'); await page.wait_for_timeout(1200); await dismiss_levelup(page)
        check(await page.locator('.tq-lines li').count() == 4, 'Feedback: Transcript A–D')
        txt = await page.inner_text('#tq-after')
        check(f'Correct Answer: {k}' in txt, f'Feedback: Correct Answer: {k}')
        check('Photo Analysis' in txt and 'Key Vocabulary' in txt and 'Listening Tip' in txt and f'Why {k}?' in txt, 'Feedback: Why / Photo Analysis / Key Vocabulary / Tip')
        check(await page.locator('.tq-tag.bad').count() == 3, 'วิเคราะห์ตัวลวง 3 ข้อ (ประเภทตัวลวง)')
        check((await page.get_attribute('#tq-img', 'alt')) == BANK[qid]['imageAlt'], 'หลังตอบ: alt เต็ม')
        await page.click('[data-tq-clues]'); await page.wait_for_timeout(300)
        check(await page.locator('#tq-clues:not([hidden]) .tq-clue').count() >= 2, 'Highlight photo clues หลังตอบ')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_5feedback.png', full_page=True); await overflow(page, 'Feedback')
        srs = page.locator('#tq-after [data-tq-srs]')
        if await srs.count():
            await srs.first.click(); await page.wait_for_timeout(700)
            check(await page.locator('#tq-after .tq-inreview').count() >= 1, 'เพิ่มคำศัพท์เข้ารายการทบทวน (SRS เดิม)')
        await page.click('[data-tq-next]'); await page.wait_for_timeout(1500)
        for i in range(4):
            await page.click('[data-tq-play]'); await page.wait_for_timeout(600); await skip_audio(page)
            sid, qid = await cur_qid(page)
            await page.click(f'[data-tq-ans="{key_of(sid, qid)}"]'); await page.wait_for_timeout(1000); await dismiss_levelup(page)
            await page.click('[data-tq-next]'); await page.wait_for_timeout(1500); await dismiss_levelup(page)
        check(await page.locator('#tq-res-title').count() == 1, 'Practice Results')
        res = await page.inner_text('#screen-toeic-play')
        check('4 / 5' in res and '80%' in res, 'ผล: 4 / 5 · 80%')
        check('Avg. Response Time' in res and 'Listening Skill Breakdown' in res, 'ผล: เวลาเฉลี่ย + ทักษะ')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_6result.png', full_page=True); await overflow(page, 'Result')
        n = psql(f"SELECT COUNT(*) FROM toeic_answers WHERE user_id = {uid}")
        check(n == '5', f'Progress saved (toeic_answers = {n})')
        exp1 = await page.evaluate("()=>EQApp.user.exp")
        check(exp1 > exp0, f'EXP บัญชีเดิมเพิ่ม ({exp0} → {exp1})')

        # ---------- Mock ----------
        await page.evaluate("()=>EQApp.navigateTo('toeic-p1')"); await page.wait_for_timeout(1200)
        await page.click('[data-tq-act="mock"]'); await page.wait_for_timeout(500)
        check(await page.locator('.tq-check').count() == 1, 'Mock: Audio Check ทุกครั้ง')
        await page.click('.tq-check [data-play]'); await page.wait_for_timeout(600); await skip_audio(page)
        await page.click('.tq-check [data-ok]'); await page.wait_for_timeout(500)
        await page.click('.modal-card [data-go]'); await page.wait_for_timeout(2000)
        check('Mock Test' in await page.inner_text('.tq-top'), 'เข้า Mock Test')
        check(await page.locator('[data-tq-expand]').count() == 0 and await page.locator('[data-tq-rate]').count() == 0, 'Mock: ไม่มีขยายภาพ/ปรับความเร็ว')
        check(await page.locator('[data-tq-vol]').count() == 1, 'Mock: ปรับระดับเสียงได้')
        await page.click('[data-tq-play]'); await page.wait_for_timeout(800)
        check(await page.locator('[data-tq-play]').is_hidden(), 'Mock: เริ่มแล้วไม่มีปุ่มเล่นซ้ำ')
        # รีโหลดกลางข้อ -> ฟังซ้ำไม่ได้
        await page.reload(); await page.wait_for_timeout(3000)
        check(await page.locator('[data-tq-play]').is_hidden() and 'เล่นไปแล้ว' in await page.inner_text('#tq-status'), 'Mock: รีโหลดหน้าแล้วก็ฟังซ้ำไม่ได้')
        sid, qid = await cur_qid(page)
        await page.click(f'[data-tq-ans="{key_of(sid, qid)}"]'); await page.wait_for_timeout(2500)
        check('Question 2 / 6' in await page.inner_text('#tq-qno'), 'Mock: ไปข้อ 2 อัตโนมัติ')
        check(await page.locator('.tq-lines, .tq-result').count() == 0, 'Mock: ไม่มี transcript/feedback ระหว่างข้อ')
        for q in range(2, 7):
            if q == 3:
                # เน็ตหลุด (ก่อนระบบ preload ข้อ 5): ข้อ 5 โหลดเสียงไม่ได้ -> หยุดรอ ไม่นับผิด แล้วลองใหม่ได้
                await page.route('**/assets/toeic/p1/audio/**', lambda r: r.abort())
            await page.wait_for_timeout(900)
            if q == 5:
                check(await page.locator('.tq-neterr').count() == 1 and 'ไม่สามารถโหลดไฟล์เสียง' in await page.inner_text('.tq-neterr'), 'เน็ตหลุด: แจ้ง "ไม่สามารถโหลดไฟล์เสียง กรุณาลองใหม่"')
                sid, _ = await cur_qid(page)
                answered = psql(f"SELECT COUNT(*) FROM toeic_answers WHERE session_id = {sid}")
                check(answered == '4', f'เน็ตหลุด: ไม่นับเป็นคำตอบ ({answered})')
                check(await page.locator('[data-tq-ans]:not([disabled])').count() == 0, 'เน็ตหลุด: ยังตอบไม่ได้จนกว่าเสียงจะพร้อม')
                await page.screenshot(path=f'{OUT}{W}_{THEME}_7neterr.png')
                await page.unroute('**/assets/toeic/p1/audio/**')
                await page.click('[data-tq-retry]'); await page.wait_for_timeout(1500)
            if await page.locator('[data-tq-play]:visible:not([disabled])').count():
                await page.click('[data-tq-play]'); await page.wait_for_timeout(500)
            if q == 5: check(await page.locator('#tq-eq.is-on').count() == 1, 'ลองใหม่แล้วเสียงเล่นต่อได้')
            await skip_audio(page)
            sid, qid = await cur_qid(page)
            k = key_of(sid, qid)
            await page.click(f'[data-tq-ans="{k if q < 6 else wrong(k)}"]'); await page.wait_for_timeout(1600)
        await page.wait_for_timeout(1500); await dismiss_levelup(page)
        check(await page.locator('#tq-res-title').count() == 1, 'Mock Result')
        res = await page.inner_text('#screen-toeic-play')
        check('5 / 6' in res and '83%' in res and 'Practice Score' in res, 'Mock: 5 / 6 · 83% · Practice Score')
        check('Official' not in res and 'ไม่ใช่คะแนน TOEIC อย่างเป็นทางการ' in res, 'ไม่อ้างคะแนนทางการ')
        check(await page.locator('.tq-rv').count() == 6, 'Review Answers 6 ข้อ')
        await page.check('#tq-only-wrong'); await page.wait_for_timeout(200)
        check(await page.locator('.tq-rv:not([hidden])').count() == 1, 'Review Mistakes: เฉพาะข้อที่ผิด')
        await page.locator('.tq-rv:not([hidden]) summary').click(); await page.wait_for_timeout(400)
        check(await page.locator('.tq-rv:not([hidden]) .tq-lines li').count() == 4 and await page.locator('.tq-rv:not([hidden]) [data-tq-rvplay]').count() == 1, 'Review: Transcript + ฟังซ้ำ')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_8mockresult.png', full_page=True); await overflow(page, 'Mock Result')

        # ---------- Error Notebook / Vocab ----------
        await page.evaluate("()=>EQApp.navigateTo('toeic-p1-review')"); await page.wait_for_timeout(1500)
        check(await page.locator('#screen-toeic .tq-rv').count() >= 1, 'Review Mistakes (Error Notebook)')
        await overflow(page, 'Review')
        await page.evaluate("()=>EQApp.navigateTo('toeic-p1-vocab')"); await page.wait_for_timeout(1500)
        check(await page.locator('#screen-toeic .tq-voc-group').count() >= 6, 'Part 1 Essential Vocabulary แยกหมวด')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_9vocab.png'); await overflow(page, 'Vocab')
        await page.evaluate("()=>EQApp.navigateTo('toeic-p1')"); await page.wait_for_timeout(1500)
        land = await page.inner_text('#screen-toeic')
        check('Listening Analytics' in land and 'Part 1 Accuracy' in land, 'Landing: Listening Analytics หลังทำแล้ว')
        await page.screenshot(path=f'{OUT}{W}_{THEME}_10landing2.png', full_page=True)
        check(not errs, f'ไม่มี JS error ({errs[:2]})')
        await b.close()
    print('\nFAILS:', len(fails))
    for f in fails: print(' -', f)
    sys.exit(1 if fails else 0)

asyncio.run(main())
