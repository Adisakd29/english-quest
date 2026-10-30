"""E2E: CSP แบบ enforce (ค่าเริ่มต้นตั้งแต่ v1.10.0 Phase 5) — ไล่ทุกหน้า + การกระทำหลัก ต้องไม่มีการละเมิด/JS error
   ใช้: python3 test/e2e/csp_e2e.py [outdir]   (เซิร์ฟเวอร์ :3100 ที่ไม่ได้ตั้ง CSP_MODE + DB eq_dev)
   ตรวจ: header เป็น Content-Security-Policy (ไม่ใช่ Report-Only) · securitypolicyviolation = 0 · pageerror = 0 ·
         หน้าออฟไลน์ไม่มี inline handler · เสียง/ภาพ/QR/3D/WebSocket ทำงานภายใต้ CSP"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/csp_e2e'
os.makedirs(OUT, exist_ok=True)
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
def psql(sql): return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
INIT = "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+(e.blockedURI||'')+' '+(e.sourceFile||'')+':'+e.lineNumber))"
# ทุก route ที่เปิดตรงจาก hash ได้ (หน้าที่ต้องมีห้อง/คู่แข่ง เช่น battle/ranked-match ใช้หน้ารวมแทน)
ROUTES = ['home', 'learn', 'vocab', 'path', 'words', 'grammar', 'grammar-placement', 'grammar-mistakes', 'grammar-progress', 'grammar-writing',
          'grammar-classic', 'c2', 'speak', 'toeic', 'toeic-p1', 'toeic-p2', 'toeic-p3', 'toeic-p4', 'toeic-p5', 'toeic-p6', 'toeic-p7',
          'toeic-full', 'toeic-weak', 'toeic-academy', 'premium', 'work', 'write', 'help', 'graded', 'graded/A1-01/reading', 'graded/B2-02/listening',
          'placement', 'play', 'friends', 'leaderboard', 'chat', 'ranked', 'ranked-journey', 'ranked-leaderboard', 'ranked-history', 'event', 'festival',
          'profile', 'avatar', 'wardrobe', 'shop', 'coins', 'achievements', 'stats', 'privacy', 'world']
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

async def collect(pg, where, seen):
    v = await pg.evaluate('window.__csp||[]')
    new = [x for x in v if x not in seen]
    for x in new: seen.add(x); print('  CSP', where, '->', x)
    return new

async def run(b, w, h, mobile, tag):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=mobile, is_mobile=mobile, service_workers='block')
    await ctx.add_init_script(INIT)
    pg = await ctx.new_page(); errs = []; seen = set()
    pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
    resp = await pg.goto(URL); await pg.wait_for_timeout(800)
    hd = resp.headers
    check('content-security-policy' in hd and 'content-security-policy-report-only' not in hd, f'{tag}: header เป็น CSP แบบบังคับ (enforce)')
    await collect(pg, 'login', seen)
    tok = (await pg.evaluate(REG, 'csp%d' % random.randint(100000, 999999)))['token']
    await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok)
    for r in ROUTES:
        await pg.goto(URL + '/?c=%d#/%s' % (random.randint(1, 10**6), r))
        try: await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=30000)
        except Exception: pass
        await pg.wait_for_timeout(4000 if r == 'world' else 1500)
        await collect(pg, r, seen)
    # ---- การกระทำที่โหลดสื่อ/สคริปต์เพิ่ม ----
    await pg.goto(URL + '/?c=%d#/graded/A2-01/reading' % random.randint(1, 10**6))
    await pg.wait_for_selector('[data-gr-play]', timeout=20000); await pg.click('[data-gr-play]'); await pg.wait_for_timeout(2500)
    played = not (await pg.inner_text('#gr-time')).startswith('0:00 ')
    check(played, f'{tag}: เสียง (media-src) เล่นได้ภายใต้ CSP')
    await collect(pg, 'graded-audio', seen)
    await pg.goto(URL + '/?c=%d#/toeic-p1' % random.randint(1, 10**6)); await pg.wait_for_timeout(1500)
    try:
        await pg.click('[data-tq-act="practice"]', timeout=8000); await pg.wait_for_timeout(500)
        await pg.click('.tq-setup [data-go]'); await pg.wait_for_timeout(500)
        await pg.click('.tq-check [data-play]'); await pg.wait_for_timeout(1500)
        await pg.click('.tq-check [data-ok]'); await pg.wait_for_selector('#tq-img', timeout=10000)
        await pg.wait_for_function("()=>{const i=document.getElementById('tq-img');return i&&i.complete&&i.naturalWidth>0}", timeout=10000)
        check(True, f'{tag}: ภาพ + เสียง TOEIC Part 1 โหลดได้ภายใต้ CSP')
    except Exception as e: check(False, f'{tag}: เปิดชุดฝึก Part 1 ({str(e)[:60]})')
    await collect(pg, 'toeic-p1-play', seen)
    # แสดงออนไลน์ = WebSocket ต่อได้ (connect-src 'self')
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    try:
        await pg.wait_for_function("()=>{const t=document.getElementById('online-count-text');return t&&!/กำลังเชื่อมต่อ|ไม่สามารถ/.test(t.textContent)}", timeout=15000); ws = True
    except Exception: ws = False
    check(ws, f'{tag}: WebSocket ต่อได้ภายใต้ CSP')
    await collect(pg, 'ws', seen)
    # Premium: QR พร้อมเพย์ (img data:) — เปิดหน้าชำระเงินถ้ามี
    await pg.goto(URL + '/?c=%d#/premium' % random.randint(1, 10**6)); await pg.wait_for_timeout(1500)
    try:
        await pg.locator('#screen-premium [data-pm-plan], #screen-premium [data-plan]').first.click(timeout=4000); await pg.wait_for_timeout(2000)
    except Exception: pass
    await collect(pg, 'premium-pay', seen)
    # ผู้ดูแล
    if tag == 'desktop':
        uid = await pg.evaluate("()=>EQApp.user.id"); psql(f"UPDATE users SET role = 'admin' WHERE id = {uid}")
        await pg.goto(URL + '/?c=%d#/admin' % random.randint(1, 10**6)); await pg.wait_for_timeout(3000)
        await collect(pg, 'admin', seen)
        psql(f"UPDATE users SET role = 'user' WHERE id = {uid}")
        # หน้าออฟไลน์ (ไฟล์ที่ service worker ใช้ตอนเน็ตหลุด)
        await pg.goto(URL + '/offline.html'); await pg.wait_for_timeout(800)
        check(await pg.evaluate("()=>!document.querySelector('[onclick],[onload],[onerror]')"), f'{tag}: หน้าออฟไลน์ไม่มี inline handler')
        await pg.click('a.retry'); await pg.wait_for_timeout(1500)
        check(pg.url.startswith(URL + '/') and 'offline' not in pg.url, f'{tag}: ปุ่ม "ลองอีกครั้ง" ในหน้าออฟไลน์ใช้ได้ ({pg.url})')
        await collect(pg, 'offline', seen)
    check(not seen, f'{tag}: ไม่มีการละเมิด CSP ({len(seen)}) {sorted(seen)[:4]}')
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
