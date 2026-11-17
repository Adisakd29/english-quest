"""E2E: ปุ่ม ซ่อนหัวข้อ / แสดงหัวข้อ — Desktop · Mobile (touch) · Keyboard (Enter/Space) · จำสถานะหลังเปลี่ยนหน้า"""
import asyncio, random, sys
from playwright.async_api import async_playwright
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
STATE = """(id)=>{const b=document.querySelector(`[data-cx-toggle="${id}"]`);const p=document.getElementById(id);const r=p.getBoundingClientRect();
  return {expanded:b.getAttribute('aria-expanded'),controls:b.getAttribute('aria-controls'),label:b.querySelector('.lk-cx-label').textContent,
  height:Math.round(r.height),visibility:getComputedStyle(p).visibility,inert:p.hasAttribute('inert'),tag:b.tagName}}"""
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

async def run(p, name, viewport, touch):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport=viewport, has_touch=touch, is_mobile=touch)
    page = await ctx.new_page()
    await page.goto('http://localhost:3100'); await page.wait_for_timeout(2000)
    r = await page.evaluate(REG, 'cx%d' % random.randint(1000, 999999))
    await page.evaluate("t=>localStorage.setItem('wq_token',t)", r['token']); await page.reload(); await page.wait_for_timeout(2500)
    await page.evaluate("()=>EQApp.navigateTo('grammar')"); await page.wait_for_timeout(1800)
    pid = 'gl-lvt-A1'
    s0 = await page.evaluate(STATE, pid)
    check(s0['expanded'] == 'true' and s0['height'] > 200 and s0['label'] == 'ซ่อนหัวข้อ', f'{name}: เปิดอยู่ตอนเริ่ม {s0}')
    check(s0['tag'] == 'BUTTON' and s0['controls'] == pid, f'{name}: semantic button + aria-controls')
    btn = page.locator(f'[data-cx-toggle="{pid}"]')
    await btn.scroll_into_view_if_needed(); await page.wait_for_timeout(200)
    y0 = await page.evaluate("()=>window.scrollY")
    if touch: await btn.tap()
    else: await btn.click()
    await page.wait_for_timeout(500)
    s1 = await page.evaluate(STATE, pid)
    check(s1['expanded'] == 'false' and s1['height'] == 0 and s1['visibility'] == 'hidden' and s1['inert'] and s1['label'] == 'แสดงหัวข้อ', f'{name}: กดแล้วซ่อนจริง {s1}')
    check(abs(await page.evaluate("()=>window.scrollY") - y0) < 2, f'{name}: หน้าไม่กระโดด/ไม่ re-render')
    if touch: await btn.tap()
    else: await btn.click()
    await page.wait_for_timeout(500)
    s2 = await page.evaluate(STATE, pid)
    check(s2['expanded'] == 'true' and s2['height'] > 200 and not s2['inert'], f'{name}: กดอีกครั้งแสดง {s2}')
    if name == 'desktop':
        await btn.focus(); await page.keyboard.press('Enter'); await page.wait_for_timeout(450)
        s3 = await page.evaluate(STATE, pid)
        check(s3['expanded'] == 'false' and s3['height'] == 0, f'keyboard Enter ซ่อน {s3}')
        await page.keyboard.press('Space'); await page.wait_for_timeout(450)
        s4 = await page.evaluate(STATE, pid)
        check(s4['expanded'] == 'true' and s4['height'] > 200, f'keyboard Space แสดง {s4}')
        fv = await page.evaluate("()=>{const b=document.activeElement;return b.matches(':focus-visible') && getComputedStyle(b).boxShadow!=='none'}")
        check(fv, 'focus-visible มองเห็นได้')
        # ซ่อน B1 ไว้ -> ไปหน้าอื่น -> กลับมา ต้องจำสถานะ
        b1 = page.locator('[data-cx-toggle="gl-lvt-A2"]')
        if (await page.evaluate(STATE, 'gl-lvt-A2'))['expanded'] == 'false': await b1.click(); await page.wait_for_timeout(400)
        await page.locator('[data-cx-toggle="gl-lvt-A1"]').click(); await page.wait_for_timeout(400)
        await page.evaluate("()=>EQApp.navigateTo('home')"); await page.wait_for_timeout(800)
        await page.evaluate("()=>EQApp.navigateTo('grammar')"); await page.wait_for_timeout(1500)
        sa = await page.evaluate(STATE, 'gl-lvt-A1'); sb = await page.evaluate(STATE, 'gl-lvt-A2')
        check(sa['expanded'] == 'false' and sa['height'] == 0 and sb['expanded'] == 'true', f'จำสถานะหลังเปลี่ยนหน้า A1={sa["expanded"]} A2={sb["expanded"]}')
        # เนื้อหาฉบับเต็มในหน้าบทเรียน
        await page.evaluate("()=>EQGrammar.openTopic('a1-subject-pronouns')"); await page.wait_for_timeout(1500)
        r0 = await page.evaluate(STATE, 'gl-ref')
        await page.locator('[data-cx-toggle="gl-ref"]').click(); await page.wait_for_timeout(450)
        r1 = await page.evaluate(STATE, 'gl-ref')
        check(r0['expanded'] == 'false' and r0['height'] == 0 and r1['expanded'] == 'true' and r1['height'] > 300 and r1['label'] == 'ซ่อนเนื้อหาฉบับเต็ม', f'เนื้อหาฉบับเต็มพับ/กางได้ {r0["height"]}->{r1["height"]}')
    await b.close()

async def main():
    async with async_playwright() as p:
        await run(p, 'desktop', {'width': 1366, 'height': 900}, False)
        await run(p, 'mobile', {'width': 390, 'height': 844}, True)
    print('FAILS', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
