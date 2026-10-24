"""จำลอง Google Identity Services (โหลดจริงไม่ได้ในเครื่องทดสอบ) — โครงสร้างปุ่มเหมือน GIS: div ตัวยึด + iframe ข้ามโดเมน
ตรวจบนมือถือ (แตะ) ว่าแตะปุ่มแล้ว callback ทำงาน (หน้าเว็บส่ง /api/auth/google)"""
import asyncio, sys
from playwright.async_api import async_playwright
GSI = r"""
window.google = { accounts: { id: {
  initialize(o){ window.__gsiInit = o; },
  renderButton(el, opts){
    el.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className='S9gUrf-YoZ4jf'; wrap.style.position='relative';
    const ifr = document.createElement('iframe'); ifr.className='L5Fo6c-PQbLGe';
    ifr.src = 'https://accounts.google.com/gsi/button?w=' + opts.width;
    ifr.setAttribute('style','display:block;position:relative;top:0px;left:0px;height:44px;width:'+opts.width+'px;border:0px;margin:-2px -10px;');
    wrap.appendChild(ifr); el.appendChild(wrap);
    window.addEventListener('message', (e)=>{ if (e.data==='gsi-click') { window.__gsiClicks=(window.__gsiClicks||0)+1; window.__gsiInit.callback({credential:'fake'}); } });
  },
  prompt(){}, cancel(){}, disableAutoSelect(){}
}}};
"""
BTN = """<!doctype html><html><body style="margin:0"><button id=b style="width:100%;height:44px;border-radius:22px;border:1px solid #ccc;background:#fff;font:16px sans-serif">Sign in with Google</button>
<script>document.getElementById('b').addEventListener('click',()=>parent.postMessage('gsi-click','*'))</script></body></html>"""

async def run(p, name, vp, touch, ua=None):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport=vp, has_touch=touch, is_mobile=touch, user_agent=ua)
    page = await ctx.new_page(); errs = []; posts = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('request', lambda r: posts.append(r.url) if '/api/auth/google' in r.url else None)
    await ctx.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(status=200, content_type='application/javascript', body=GSI))
    await ctx.route('https://accounts.google.com/gsi/button*', lambda r: r.fulfill(status=200, content_type='text/html', body=BTN))
    await page.goto('http://localhost:3100'); await page.wait_for_timeout(2500)
    box = await page.evaluate("()=>{const r=document.querySelector('#google-btn iframe')?.getBoundingClientRect();return r?[r.left,r.top,r.width,r.height]:null}")
    hit = await page.evaluate("()=>{const f=document.querySelector('#google-btn iframe');f.scrollIntoView({block:'center'});const r=f.getBoundingClientRect();const h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return h===f?'iframe':(h?h.className||h.tagName:'none')}")
    frame = page.frame_locator('#google-btn iframe')
    if touch: await frame.locator('#b').tap()
    else: await frame.locator('#b').click()
    await page.wait_for_timeout(1500)
    clicks = await page.evaluate("()=>window.__gsiClicks||0")
    err = await page.evaluate("()=>document.getElementById('google-error').textContent")
    print(name, 'iframe', box, 'hit', hit, 'clicks', clicks, 'POST', len(posts), 'err', err, 'jsErr', errs[:2])
    await page.screenshot(path=f'/tmp/eq_e2e_gt_{name}.png')
    await b.close()
    return clicks > 0 and posts

async def main():
    async with async_playwright() as p:
        ok = []
        ok.append(await run(p, 'iphone', {'width': 390, 'height': 844}, True, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
        ok.append(await run(p, 'android', {'width': 360, 'height': 780}, True, 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'))
        ok.append(await run(p, 'desktop', {'width': 1366, 'height': 800}, False))
        print('ALL OK' if all(ok) else 'FAIL')
asyncio.run(main())
