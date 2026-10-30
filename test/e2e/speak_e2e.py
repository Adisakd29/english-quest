"""E2E: ฝึกพูด (#/speak) — เซิร์ฟเวอร์ :3100 + DB eq_dev
   ใช้: python3 test/e2e/speak_e2e.py [outdir]
   ไมโครโฟนจำลอง: ฉีดคลาส SpeechRecognition ปลอมก่อนโหลดหน้า (window.__fakeSay = ข้อความที่ "ได้ยิน" / window.__fakeErr = รหัสข้อผิดพลาด)
   ตรวจ: Hub (ระดับ/ประเภท/ชุด) · แจ้งความเป็นส่วนตัวก่อนใช้ไมค์ · คะแนนรายคำ · บันทึก best + EXP · ข้อความที่ได้ยินไม่ถูกส่งไปเซิร์ฟเวอร์ ·
         ไม่อนุญาตไมค์ → แนะนำฟังแล้วพิมพ์ · ฟังแล้วพิมพ์ (ตรวจที่เซิร์ฟเวอร์) · บทสนทนา role-play · เบราว์เซอร์ไม่รองรับ → banner + โหมดพิมพ์ ·
         หน้าแรกมีแถว Speaking · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, json, os, random, sys
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/speak_e2e'
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
FAKE_SR = """
window.__fakeSay = ''; window.__fakeErr = null; window.__srStarts = 0;
class FakeSR {
  constructor(){ this.lang=''; this.interimResults=false; this.maxAlternatives=1; }
  start(){ window.__srStarts++; const say=window.__fakeSay, err=window.__fakeErr;
    setTimeout(()=>{
      if (err) { this.onerror && this.onerror({error: err}); this.onend && this.onend(); return; }
      const mk=(t,fin)=>{const alt=[{transcript:t,confidence:0.9}]; alt.isFinal=fin; return alt;};
      this.onresult && this.onresult({resultIndex:0, results:[mk(say.split(' ').slice(0,2).join(' '),false)]});
      setTimeout(()=>{ this.onresult && this.onresult({resultIndex:0, results:[mk(say,true)]}); this.onend && this.onend(); }, 120);
    }, 150); }
  stop(){} abort(){ this.onerror && this.onerror({error:'aborted'}); this.onend && this.onend(); }
}
window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
"""
NO_SR = "delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined});"
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)

async def layout(pg, tag, where):
    lay = await pg.evaluate("""()=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll('.sp-screen:not(.hidden) button, .sp-screen:not(.hidden) input')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&!x.classList.contains('sp-w')&&r.width>0&&(r.width<44||r.height<44)}).map(x=>x.className+':'+x.textContent.trim().slice(0,12))})""")
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def new_page(b, w, h, mobile, init):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block')
    await ctx.add_init_script(init)
    pg = await ctx.new_page(); errs = []; posts = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: posts.append((r.url, r.post_data or '')) if r.method == 'POST' and '/api/speak/' in r.url else None)
    await pg.goto(URL); await pg.wait_for_timeout(300)
    name = 'spk%d' % random.randint(100000, 999999)
    tok = (await pg.evaluate(REG, name))['token']
    await pg.evaluate("t=>{localStorage.setItem('wq_token',t);localStorage.setItem('eq_speak_level','A1');localStorage.setItem('eq_speak_kind','sentences');localStorage.removeItem('eq_speak_mode')}", tok)
    await pg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6))
    await pg.wait_for_function("()=>window.EQApp&&EQApp.user", timeout=60000)
    await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
    await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    return ctx, pg, errs, posts

async def run(b, w, h, mobile, tag):
    ctx, pg, errs, posts = await new_page(b, w, h, mobile, FAKE_SR)
    # หน้าแรก: แถว Speaking
    await pg.wait_for_function("()=>document.getElementById('skill-sp-sub')&&document.getElementById('skill-sp-sub').textContent.length>0", timeout=20000)
    check(await pg.locator('#skill-sp-wrap').count() == 1, f'{tag}: หน้าแรกมีแถว Speaking')
    # Hub ผ่านปุ่มในหน้าเรียน
    await pg.evaluate("()=>EQApp.navigateTo('learn')")
    await pg.click('.sp-open'); await pg.wait_for_selector('#sp-sets .sp-card', timeout=30000)
    check('#/speak' in pg.url, f'{tag}: ปุ่มฝึกพูดในหน้าเรียน → #/speak')
    n = await pg.locator('#sp-sets .sp-card').count()
    check(n > 10, f'{tag}: ชุดประโยค A1 ({n} ชุด)')
    check(await pg.locator('.sp-banner').count() == 0, f'{tag}: เบราว์เซอร์รองรับ → ไม่มี banner')
    await layout(pg, tag, 'Hub')
    await pg.screenshot(path=f'{OUT}/{tag}_hub.png', full_page=False)
    await pg.click('[data-sp-kind="words"]'); await pg.wait_for_selector('.sp-grid .sp-tile', timeout=20000)
    check(await pg.locator('.sp-tile').count() > 50, f'{tag}: คำศัพท์ A1 เป็นตารางชุด + ปุ่มทำต่อ')
    await pg.click('[data-sp-level="B1"]'); await pg.wait_for_selector('.sp-grid .sp-tile', timeout=20000)
    check(await pg.evaluate("()=>localStorage.getItem('eq_speak_level')") == 'B1', f'{tag}: จำระดับที่เลือก')
    await pg.click('[data-sp-level="A1"]'); await pg.wait_for_selector('.sp-grid .sp-tile', timeout=20000)
    await pg.click('[data-sp-kind="sentences"]'); await pg.wait_for_selector('#sp-sets .sp-card', timeout=20000)

    # เปิดชุดแรก → consent → พูดถูก
    await pg.click('#sp-sets .sp-card >> nth=0'); await pg.wait_for_selector('#sp-mic', timeout=20000)
    text = await pg.evaluate("()=>EQSpeak._state().set.items[EQSpeak._state().idx].text")
    item_id = await pg.evaluate("()=>EQSpeak._state().set.items[EQSpeak._state().idx].id")
    clean = text.replace('[[', '').replace(']]', '')
    await pg.evaluate("t=>{window.__fakeSay=t}", clean)
    await pg.click('#sp-mic')
    await pg.wait_for_selector('.sp-consent', timeout=5000)
    check(await pg.evaluate("()=>window.__srStarts") == 0, f'{tag}: แจ้งความเป็นส่วนตัวก่อนเปิดไมค์ครั้งแรก')
    await pg.screenshot(path=f'{OUT}/{tag}_consent.png')
    await pg.click('.sp-consent [data-ok]')
    await pg.wait_for_selector('.sp-score', timeout=10000)
    sc = int(await pg.inner_text('.sp-score b'))
    check(sc >= 90, f'{tag}: พูดตรงประโยค → คะแนน {sc}')
    ok_words = await pg.locator('.sp-text .sp-w.is-ok').count()
    check(ok_words >= 2, f'{tag}: คะแนนรายคำ (ชัด {ok_words} คำ)')
    await pg.wait_for_timeout(500)
    saved = await pg.evaluate("id=>EQApp.api('/speak/sets/'+encodeURIComponent(EQSpeak._state().set.id)).then(s=>s.items.find(i=>i.id===id))", item_id)
    check(saved and saved['best'] == sc and saved['passed'], f'{tag}: บันทึกคะแนนดีที่สุด ({saved and saved["best"]})')
    att = [p for p in posts if p[0].endswith('/attempt')]
    body = json.loads(att[-1][1]) if att else {}
    check(set(body.keys()) == {'itemId', 'heard'} and all(isinstance(h, str) for h in body['heard']), f'{tag}: ส่งเฉพาะ itemId + ข้อความที่ได้ยิน (ไม่ส่งเสียง/คะแนน — เซิร์ฟเวอร์ให้คะแนนเอง)')
    me = await pg.evaluate("()=>EQApp.api('/auth/me')")
    check(me['user']['exp'] >= 2, f'{tag}: ได้ EXP ({me["user"]["exp"]})')
    await layout(pg, tag, 'ผลการพูด')
    await pg.screenshot(path=f'{OUT}/{tag}_result_good.png', full_page=True)

    # ข้อถัดไป: พูดผิดบางคำ → มีคำไม่ชัด
    await pg.click('[data-sp-go="1"]'); await pg.wait_for_selector('#sp-mic')
    t2 = await pg.evaluate("()=>EQSpeak._state().set.items[EQSpeak._state().idx].text.replace(/\\[\\[|\\]\\]/g,'')")
    words = t2.split()
    bad = ' '.join(words[:max(1, len(words) // 2)]) + ' banana'
    await pg.evaluate("t=>{window.__fakeSay=t}", bad)
    await pg.click('#sp-mic'); await pg.wait_for_selector('.sp-score', timeout=10000)
    sc2 = int(await pg.inner_text('.sp-score b'))
    miss = await pg.locator('.sp-text .sp-w.is-miss').count()
    check(sc2 < sc and miss >= 1, f'{tag}: พูดไม่ครบ → คะแนนต่ำลง ({sc2}) + เห็นคำที่ยังไม่ชัด ({miss})')
    check(await pg.locator('.sp-consent').count() == 0, f'{tag}: ไม่ถามความยินยอมซ้ำ')
    await pg.screenshot(path=f'{OUT}/{tag}_result_partial.png', full_page=True)

    # ไมค์ถูกปฏิเสธ
    await pg.click('[data-sp-go="1"]'); await pg.wait_for_selector('#sp-mic')
    await pg.evaluate("()=>{window.__fakeErr='not-allowed'}")
    await pg.click('#sp-mic'); await pg.wait_for_selector('.sp-err', timeout=8000)
    check('ไม่ได้รับอนุญาต' in await pg.inner_text('.sp-err'), f'{tag}: ไม่อนุญาตไมค์ → แจ้งชัดเจน')
    await pg.click('#sp-status [data-sp-mode="type"]'); await pg.wait_for_selector('#sp-input')
    check(True, f'{tag}: ปุ่ม "ใช้ฟังแล้วพิมพ์" เปลี่ยนโหมด')
    await pg.evaluate("()=>{window.__fakeErr=null}")
    # ฟังแล้วพิมพ์ (ตรวจที่เซิร์ฟเวอร์)
    t3 = await pg.evaluate("()=>EQSpeak._state().set.items[EQSpeak._state().idx].text.replace(/\\[\\[|\\]\\]/g,'')")
    check(await pg.locator('.sp-text').count() == 0, f'{tag}: โหมดพิมพ์ซ่อนประโยคก่อนตอบ')
    await pg.fill('#sp-input', t3.lower().replace(',', ''))
    await pg.click('.sp-type button[type="submit"]'); await pg.wait_for_selector('.sp-answer', timeout=10000)
    sc3 = int(await pg.inner_text('.sp-score b'))
    check(sc3 >= 90, f'{tag}: ฟังแล้วพิมพ์ถูก → {sc3} + แสดงเฉลย')
    if mobile:
        await layout(pg, tag, 'ฟังแล้วพิมพ์')
        await pg.screenshot(path=f'{OUT}/{tag}_dictation.png', full_page=True)
    await pg.click('[data-sp-mode="speak"]'); await pg.wait_for_selector('#sp-mic')

    # บทสนทนา role-play
    await pg.evaluate("()=>EQApp.navigateTo('speak')")
    await pg.wait_for_selector('#sp-sets .sp-card'); await pg.click('[data-sp-kind="dialogues"]')
    await pg.wait_for_selector('#sp-sets .sp-card'); await pg.click('#sp-sets .sp-card >> nth=0')
    await pg.wait_for_selector('[data-sp-role]')
    roles = await pg.evaluate("()=>EQSpeak._state().set.speakers")
    await pg.screenshot(path=f'{OUT}/{tag}_roles.png', full_page=True)
    await pg.click(f'[data-sp-role="{roles[1]}"]')
    steps = 0
    while steps < 30:
        steps += 1
        st = await pg.evaluate("()=>{const P=EQSpeak._state();if(P.ended)return {end:true};const it=P.set.items[P.idx];return {me:it.speaker===P.role,text:it.text,id:it.id}}")
        if st.get('end'): break
        if st['me']:
            await pg.evaluate("t=>{window.__fakeSay=t}", st['text'])
            await pg.click('#sp-mic'); await pg.wait_for_selector('[data-sp-dnext]:not([disabled])', timeout=10000)
            if steps == 2: await pg.screenshot(path=f'{OUT}/{tag}_dialogue.png', full_page=True)
            await pg.click('[data-sp-dnext]')
        else:
            await pg.click('[data-sp-dnext]')   # TTS ใน headless อาจไม่มีเสียง → กดต่อไปเอง
        await pg.wait_for_timeout(150)
    await pg.wait_for_selector('.sp-summary', timeout=8000)
    s_txt = await pg.inner_text('.sp-summary .sp-stats')
    own = await pg.evaluate("()=>{const P=EQSpeak._state();return P.set.items.filter(i=>i.speaker===P.role).length}")
    check(f'{own}/{own}' in s_txt, f'{tag}: บทสนทนา — พูดเฉพาะบทตัวเอง ({own} บรรทัด) แล้วสรุปผล')
    await layout(pg, tag, 'สรุปบทสนทนา')
    await pg.screenshot(path=f'{OUT}/{tag}_summary.png', full_page=True)

    # ออกจากหน้า → หยุดไมค์
    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(800)
    sub = await pg.inner_text('#skill-sp-sub')
    check('พูดผ่าน' in sub, f'{tag}: หน้าแรกอัปเดตแถว Speaking ({sub})')
    check(not errs, f'{tag}: ไม่มี JS error {errs[:2]}')
    await ctx.close()

    # เบราว์เซอร์ไม่รองรับ
    ctx, pg, errs, posts = await new_page(b, w, h, mobile, NO_SR)
    await pg.evaluate("()=>EQApp.navigateTo('speak')"); await pg.wait_for_selector('#sp-sets .sp-card', timeout=30000)
    check(await pg.locator('.sp-banner').count() == 1, f'{tag}: ไม่รองรับ → banner แนะนำฟังแล้วพิมพ์')
    await pg.click('#sp-sets .sp-card >> nth=0'); await pg.wait_for_selector('#sp-input', timeout=20000)
    check(await pg.locator('[data-sp-mode="speak"][disabled]').count() == 1 and await pg.locator('#sp-mic').count() == 0, f'{tag}: ไม่รองรับ → เปิดโหมดพิมพ์ ปุ่มพูดปิด')
    await pg.screenshot(path=f'{OUT}/{tag}_unsupported.png', full_page=True)
    check(not errs, f'{tag}: (ไม่รองรับ) ไม่มี JS error {errs[:2]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, 1280, 860, False, 'desktop')
        await run(b, 390, 844, True, 'mobile')
        await b.close()
    print('ALL PASS' if not fails else f'{len(fails)} FAIL')
    sys.exit(1 if fails else 0)

asyncio.run(main())
