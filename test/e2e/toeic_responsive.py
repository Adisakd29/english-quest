"""ตรวจหน้าทำข้อ TOEIC Part 1 หลายขนาดจอ: 320/375/390/430 (มือถือ) · 768×1024 (แท็บเล็ตแนวตั้ง) · 1024×768 (แท็บเล็ตแนวนอน)
   · 1366×768 / 1440×900 (เดสก์ท็อป) — ไม่มี scroll แนวนอน · ภาพไม่ถูกตัด · ปุ่มไม่หลุดจอ · ปุ่ม A–D ≥ 44px · ภาพ+คำตอบในจอเดียว (จอสูงพอ)"""
import asyncio, os, random, sys
from playwright.async_api import async_playwright
OUT = os.environ.get('E2E_OUT', '/tmp/toeic_resp_')
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
SIZES = [(320, 568), (375, 667), (390, 844), (430, 932), (768, 1024), (1024, 768), (1366, 768), (1440, 900)]
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        for (w, h) in SIZES:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=w < 800, is_mobile=w < 800, service_workers='block')
            page = await ctx.new_page()
            await page.goto('http://localhost:3100'); await page.wait_for_timeout(1200)
            r = await page.evaluate(REG, 'tqr%d' % random.randint(1000, 999999))
            await page.evaluate("t=>{localStorage.setItem('wq_token',t);sessionStorage.setItem('eq_tq_checked','1')}", r['token'])
            await page.reload(); await page.wait_for_timeout(2000)
            sid = await page.evaluate("async()=>{const s=await EQApp.api('/toeic/p1/sessions',{method:'POST',body:{mode:'practice',size:5}});return s.id}")
            await page.evaluate(f"()=>{{location.hash='#/toeic-p1-play/{sid}'}}"); await page.wait_for_timeout(2500)
            tag = f'{w}x{h}'
            sw = await page.evaluate("()=>[document.documentElement.scrollWidth, innerWidth]")
            check(sw[0] <= sw[1] + 1, f'{tag}: ไม่มี scroll แนวนอน')
            img = await page.locator('#tq-img').bounding_box()
            check(img and img['x'] >= -1 and img['x'] + img['width'] <= w + 1 and img['width'] >= min(w - 40, 560), f'{tag}: ภาพเต็มกว้าง ไม่ถูกตัด ({int(img["width"])}px)')
            nat = await page.evaluate("()=>{const i=document.getElementById('tq-img');return [i.naturalWidth,i.naturalHeight,i.clientWidth,i.clientHeight]}")
            check(abs(nat[0] / nat[1] - nat[2] / nat[3]) < 0.02, f'{tag}: สัดส่วนภาพถูกต้อง (ไม่ถูก crop/ยืด)')
            d = await page.locator('[data-tq-ans="D"]').bounding_box(); a = await page.locator('[data-tq-ans="A"]').bounding_box()
            check(a['height'] >= 44 and a['width'] >= 44, f'{tag}: ปุ่ม A–D ≥ 44px ({int(a["width"])}×{int(a["height"])})')
            check(d['x'] + d['width'] <= w + 1, f'{tag}: ปุ่มไม่หลุดจอด้านข้าง')
            fits = d['y'] + d['height'] <= h
            if h >= 667: check(fits, f'{tag}: ภาพ + ปุ่มคำตอบอยู่ในจอเดียว (D bottom {int(d["y"] + d["height"])} ≤ {h})')
            else: print(f'INFO {tag}: จอเตี้ยมาก ต้องเลื่อนเล็กน้อย (D bottom {int(d["y"] + d["height"])})')
            play = await page.locator('[data-tq-play]').bounding_box()
            check(play and play['y'] >= 0 and play['x'] + play['width'] <= w + 1, f'{tag}: ปุ่มเล่นเสียงไม่ถูกบัง/ไม่หลุดจอ')
            await page.screenshot(path=f'{OUT}{tag}.png')
            await ctx.close()
        await b.close()
    print('\nFAILS:', len(fails)); [print(' -', f) for f in fails]
    sys.exit(1 if fails else 0)
asyncio.run(main())
