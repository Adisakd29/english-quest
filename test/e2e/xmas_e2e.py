"""
v1.25.0 Christmas 2026 — E2E (390×844 · 820×1180 · 1280×800 · 1920×1080 + 1366×768 / iPad แนวนอน 1180×820)
  ตั้งช่วงกิจกรรมให้ครอบ "ตอนนี้" ผ่านตาราง season_settings ของฐานข้อมูลพัฒนา (เหมือนผู้ดูแลแก้วันเวลา) แล้วคืนค่าเมื่อจบ
  - หน้าเข้าสู่ระบบ: ธีมคริสต์มาส · "Welcome to a Magical Christmas!" · หิมะ canvas (full) ไม่บังการแตะ · contrast · ไม่ล้นจอ
  - หิมะ: 3 ระยะ + ชั้นหน้าเฉพาะ full · ระดับตามหน้า (หน้าแรก full · เรียน light · ติวสอบ/Ranked off) · สลับหน้า 20 ครั้ง canvas ไม่ซ้อน
  - หิมะเกาะแถบบน/เมนูล่าง (pseudo-element มีจริง) · เกล็ดเคลื่อนที่ไม่เป็นเส้นตรง (x เปลี่ยนระหว่างตก)
  - เพลง: เล่นอัตโนมัติ (ไม่มีปุ่มแตะเพื่อเปิด) → เล่น xmas_eve มีเสียงจริง · เปลี่ยนเพลง · หน้าแบบฝึก = xmas_study · TOEIC = เงียบ · รีโหลดจำค่า
  - Event Hub: เช็กอินถูกล็อกจนกว่าจะเรียน → เรียน (ตอบถูก 5 ข้อ) → เปิดกล่องได้ Token · รับของขวัญต้อนรับ · ร้าน: แลกหมวกซานต้า → ใส่เลย → รีโหลดแล้วยังใส่อยู่
  - ผู้ดูแลเห็นแผงตั้งค่า · ผู้ใช้ทั่วไปเปิด #/admin ไม่ได้
  python3 test/e2e/xmas_e2e.py [โฟลเดอร์ภาพ]
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
os.makedirs(OUT, exist_ok=True)
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
def sql(q):
  return subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
ST = "()=>EQSnowFx.stats()"
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"
CONTRAST = """(sel)=>{const el=document.querySelector(sel); if(!el) return null;
  const rgb=(s)=>s.match(/[\\d.]+/g).map(Number);
  const lum=([r,g,b])=>{const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
  let fg=rgb(getComputedStyle(el).color); let e=el, bg=null;
  while(e){const cs=getComputedStyle(e);const b=rgb(cs.backgroundColor);if(b.length<4||b[3]>0.5){bg=b;break}
    const im=cs.backgroundImage; if(im&&im.includes('gradient')){const m=im.match(/rgba?\\([^)]*\\)|#[0-9a-f]{6}/gi); if(m){const c=m[m.length-1]; bg=c.startsWith('#')?[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)):rgb(c); if(bg.length<4||bg[3]>0.5) break; bg=null;}}
    e=e.parentElement}
  if(!bg) bg=[11,24,48]; const a=lum(fg),b=lum(bg); return Math.round((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)*10)/10}"""
async def go(pg, scr, ms=1500):
  await pg.evaluate(f"()=>EQApp.navigateTo('{scr}')"); await pg.wait_for_timeout(ms)
async def close_modals(pg):
  for _ in range(5):
    if await pg.locator('.modal-overlay').count() == 0: break
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)

async def register(pg, tag):
  name = 'xe%d' % random.randint(1000000, 9999999)
  await pg.locator('#screen-auth .tab-btn:not(.active)').first.click(); await pg.wait_for_timeout(400)
  form = pg.locator('#screen-auth form:visible').first
  for inp in await form.locator('input:visible').all():
    t = (await inp.get_attribute('type')) or 'text'; nm = ((await inp.get_attribute('name')) or (await inp.get_attribute('id')) or '').lower()
    if t == 'checkbox': await inp.check()
    elif t == 'password': await inp.fill('password123')
    elif t == 'email' or 'mail' in nm: await inp.fill(name + '@gmail.com')
    else: await inp.fill(name)
  await form.locator('button[type=submit]').click()
  for _ in range(40):
    if await pg.evaluate("()=>!!(window.EQApp&&EQApp.user)"): break
    await pg.wait_for_timeout(500)
  ok(await pg.evaluate("()=>!!(EQApp.user)"), f'{tag} สมัคร/เข้าสู่ระบบผ่านฟอร์มได้ตามปกติ (ธีมคริสต์มาส)')
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
  return name, int(await pg.evaluate("()=>EQApp.user.id"))

async def run(b, w, h, full=True):
  tag = f'[{w}x{h}]'
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL, timeout=90000); await pg.wait_for_timeout(4500)
  d = await pg.evaluate("()=>({skin:document.documentElement.dataset.skin,season:document.documentElement.dataset.season,msg:document.querySelector('#screen-auth .auth-message').textContent})")
  ok(d['skin'] == 'christmas' and d['season'] == 'christmas', f'{tag} หน้าเข้าสู่ระบบ: ธีมคริสต์มาสทันที {d["skin"]}/{d["season"]}')
  ok(d['msg'].strip() == 'Welcome to a Magical Christmas!', f'{tag} ข้อความต้อนรับ "{d["msg"].strip()}"')
  st = await pg.evaluate(ST)
  # v1.26.3 เครื่องที่วาดด้วย CPU (เช่นเครื่องทดสอบนี้: SwiftShader) เริ่มที่โหมดประหยัด = canvas เดียว ไม่มีชั้นหน้า
  ok(st['canvases'] == (1 if st.get('lowPower') else 2) and st['level'] == 'full' and st['running'], f'{tag} หิมะ: ระดับ full · canvas {st["canvases"]} (โหมดประหยัด {bool(st.get("lowPower"))}) · กำลังเคลื่อนไหว')
  ok(st['active'][0] >= 20 and st['active'][2] >= 4, f'{tag} หิมะมีหลายระยะ: ไกล {st["active"][0]} · กลาง {st["active"][1]} · ผลึกใกล้ {st["active"][2]} · หน้าสุด {st["active"][3]}')
  cs = await pg.evaluate("()=>{const f=document.getElementById('xm-snow-fg');return [getComputedStyle(document.getElementById('xm-snow')).pointerEvents,getComputedStyle(document.getElementById('xm-snow')).zIndex,f?getComputedStyle(f).pointerEvents:'none']}")
  ok(cs == ['none', '-1', 'none'], f'{tag} canvas หิมะไม่รับการแตะ / อยู่ใต้เนื้อหา {cs}')
  hit = await pg.evaluate("()=>{const r=document.querySelector('#screen-auth .auth-card').getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+60);return e&&!/xm-snow/.test(e.id)}")
  ok(hit, f'{tag} แตะการ์ดเข้าสู่ระบบได้ (หิมะไม่บัง)')
  f0 = (await pg.evaluate(ST))['frames']; await pg.wait_for_timeout(2000); f1 = (await pg.evaluate(ST))['frames']
  ok(f1 - f0 > 8, f'{tag} หิมะเคลื่อนไหวต่อเนื่อง (+{f1 - f0} เฟรม/2 วินาที ในเครื่องทดสอบที่ไม่มี GPU)')
  for sel in ['#screen-auth .form-group label', '#screen-auth .auth-welcome h2', '#screen-auth .auth-message']:
    c = await pg.evaluate(CONTRAST, sel)
    ok(c is not None and c >= 4.5, f'{tag} อ่านง่าย: {sel} contrast {c}:1')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าเข้าสู่ระบบไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/login_{w}.png')
  if not full:
    await ctx.close(); return
  name, uid = await register(pg, tag)
  await pg.reload(); await pg.wait_for_timeout(4500); await close_modals(pg)
  await go(pg, 'home', 3000)
  hud = await pg.evaluate("()=>{const a=getComputedStyle(document.getElementById('hud'),'::after');const n=getComputedStyle(document.getElementById('bottom-nav'),'::before');return [a.backgroundImage.includes('svg'),n.backgroundImage.includes('svg')]}")
  ok(hud == [True, True], f'{tag} หิมะเกาะแถบบน + เมนูล่าง/แถบข้าง {hud}')
  st = await pg.evaluate(ST); ok(st['level'] == 'full', f'{tag} หน้าแรก: หิมะระดับ full')
  ok(await pg.locator('#xm-lobby-card').count() == 1, f'{tag} หน้าแรก: การ์ดคริสต์มาส (นับถอยหลัง · Token · สถานะเช็กอิน)')
  ok(await pg.evaluate(NOOVER), f'{tag} หน้าแรกไม่ล้นแนวนอน')
  # เพลง (v1.25.3): เล่นอัตโนมัติเมื่อเปิดแอป · ไม่มีปุ่ม "แตะเพื่อเปิด" · เบราว์เซอร์ปล่อยเสียงหลังการแตะครั้งแรกที่ใดก็ได้
  au = await pg.evaluate("()=>EQAudio._state()")
  ok(au['settings']['xmasMusic'] != 'off' and await pg.evaluate("()=>EQAudio._appMusicFor('screen-home')") == 'xmas_eve', f'{tag} ค่าเริ่มต้น: เพลงคริสต์มาสเปิดอัตโนมัติ (ไม่ต้องกดเปิด)')
  ok(await pg.locator('#xm-player.is-first').count() == 0 and 'แตะเพื่อเปิด' not in (await pg.evaluate("()=>{const x=document.getElementById('xm-player');return x?x.innerText:''}")), f'{tag} ไม่มีปุ่ม "แตะเพื่อเปิดเพลงคริสต์มาส" แล้ว')
  if w < 1024:   # v1.27.1 มือถือ/แท็บเล็ต: ไม่มีปุ่มเพลงในแถบบนแล้ว (ชื่อไม่โดนเบียด) → ควบคุมในเมนูปุ่มลำโพง
    ok(await pg.locator('#hud #xm-player').count() == 0, f'{tag} แถบบนไม่มีปุ่มเพลงคริสต์มาส (ย้ายไปเมนูลำโพง)')
  await pg.screenshot(path=f'{OUT}/home_{w}.png')
  await pg.keyboard.press('ArrowDown'); await pg.wait_for_timeout(2500)   # การโต้ตอบครั้งแรกใด ๆ (ไม่ใช่ปุ่มเพลง)
  au = await pg.evaluate("()=>EQAudio._state()"); await pg.evaluate("()=>EQAudio._level()")   # ต่อ analyser ครั้งแรก
  lv = 0
  for _ in range(8):
    await pg.wait_for_timeout(400); lv = max(lv, await pg.evaluate("()=>EQAudio._level()"))
  ok(au['current'] == 'xmas_eve', f'{tag} เพลง Christmas Eve Memories เล่นเองโดยไม่ต้องกดปุ่มเพลง ({au["current"]})')
  ok(lv > 0.0005, f'{tag} มีเสียงจริง (RMS สูงสุด {lv:.4f} · AudioContext {au["ctxState"]})')
  if w < 1024:
    await pg.locator('#hud [data-audio-menu]').click(); await pg.wait_for_timeout(400)
    ok(await pg.locator('#xm-pl-menu [data-xp="toggle"]').count() == 1 and await pg.locator('#xm-pl-menu [data-xp-track]').count() >= 3, f'{tag} เมนูลำโพง: มีปุ่มหยุด/เล่น + รายการเพลงคริสต์มาส')
    await pg.locator('#xm-pl-menu [data-xp-track="xmas_wish"]').click(); await pg.wait_for_timeout(1800)
  else:
    await pg.locator('#xm-player .xm-pl-main').click(); await pg.wait_for_timeout(400)
    await pg.locator('[data-xp-track="xmas_wish"]').click(); await pg.wait_for_timeout(1800)
  ok(await pg.evaluate("()=>EQAudio._track()") == 'xmas_wish', f'{tag} เลือกเพลง A Little Christmas Wish ได้')
  await pg.screenshot(path=f'{OUT}/player_{w}.png')
  await pg.keyboard.press('Escape')
  ok(await pg.evaluate("()=>EQAudio._appMusicFor('screen-game')") == 'xmas_study', f'{tag} หน้าแบบฝึก: เพลงเวอร์ชันเบา')
  # v1.26.3 (เจ้าของสั่ง 25 พ.ย.) เพลงคริสต์มาสทุกหน้า: TOEIC ใช้เวอร์ชันเบา · ระหว่างคลิปข้อสอบหรี่เหลือ 4%
  ok(await pg.evaluate("()=>EQAudio._appMusicFor('screen-toeic34-play')") == 'xmas_study', f'{tag} หน้า TOEIC: เพลงคริสต์มาสเวอร์ชันเบา')
  await pg.evaluate("()=>{const a=document.createElement('audio');a.id='xm-test-audio';document.body.appendChild(a);a.dispatchEvent(new Event('play'))}")
  ok((await pg.evaluate("()=>EQAudio._state()"))['ducked'], f'{tag} มีเสียงโจทย์การฟังเล่น → หรี่เพลง (ducking)')
  await pg.evaluate("()=>{const a=document.getElementById('xm-test-audio');a.dispatchEvent(new Event('pause'));a.remove()}")
  # ระดับหิมะตามหน้า + สลับหน้า
  await go(pg, 'learn', 2000); st = await pg.evaluate(ST)
  ok(st['level'] == 'light' and st['canvases'] == 1, f'{tag} เส้นทางการเรียน: หิมะเบา (light) ไม่มีชั้นหน้า')
  await pg.evaluate("()=>{location.hash='#/tcas'}"); await pg.wait_for_timeout(2500); st = await pg.evaluate(ST)
  # v1.26.0 Global Snow: หน้าที่ต้องใช้สมาธิ = ระดับ low (บางมาก อยู่หลังเนื้อหา) แทนการปิด ตามสเปกเจ้าของ 24 พ.ย.
  ok(st['level'] == 'low' and sum(st['active']) < 40, f'{tag} หน้าติวสอบ: หิมะระดับ low (บางมาก {sum(st["active"])} เกล็ด)')
  await go(pg, 'ranked', 2500); st = await pg.evaluate(ST)
  ok(st['level'] == 'low', f'{tag} Ranked: หิมะระดับ low')
  await pg.wait_for_timeout(1500); au = await pg.evaluate("()=>EQAudio._state()")
  ok(au['current'] == 'xmas_wish', f'{tag} Ranked: เล่นเพลงคริสต์มาสที่เลือกไว้ ({au["current"]})')
  ok(await pg.locator('#xm-player').count() == (1 if w >= 1024 else 0), f'{tag} Ranked ล็อบบี้: เครื่องเล่นเพลงคริสต์มาส (จอกว้าง = มุมแถบข้าง · มือถือ = ในเมนูลำโพง)')
  await pg.evaluate("()=>EQAudio.update({xmasMusic:'off'})"); await pg.wait_for_timeout(1200)
  ok((await pg.evaluate("()=>EQAudio._state()"))['current'] == 'lobby', f'{tag} Ranked: ปิดเพลงคริสต์มาส → กลับเป็นเพลง Ranked เดิมทันที')
  await pg.evaluate("()=>EQAudio.update({xmasMusic:'on'})"); await pg.wait_for_timeout(1200)
  ok((await pg.evaluate("()=>EQAudio._state()"))['current'] == 'xmas_wish', f'{tag} Ranked: เปิดเพลงคริสต์มาสกลับ → เพลงคริสต์มาส')
  await pg.evaluate("()=>EQAudio.music('battle',{league:'gold'})"); await pg.wait_for_timeout(1200)
  ok((await pg.evaluate("()=>EQAudio._state()"))['current'] == 'xmas_wish', f'{tag} Ranked ระหว่างแข่ง: เพลงคริสต์มาส')
  await pg.evaluate("()=>EQAudio.music('lobby')"); await pg.wait_for_timeout(600)
  await go(pg, 'toeic', 2500)
  ok((await pg.evaluate("()=>EQAudio._state()"))['current'] == 'xmas_study' and await pg.locator('#xm-player').count() == (1 if w >= 1024 else 0), f'{tag} TOEIC: เพลงคริสต์มาสเวอร์ชันเบา + เครื่องเล่น (มือถืออยู่ในเมนูลำโพง)')
  await pg.evaluate("()=>{const a=document.createElement('audio');a.id='xm-t2';document.body.appendChild(a);a.dispatchEvent(new Event('play'))}")
  ok(await pg.evaluate("()=>EQAudio._duckLevel()") == 0.04, f'{tag} TOEIC: คลิปข้อสอบเล่น → เพลงหรี่เหลือ 4%')
  await pg.evaluate("()=>{const a=document.getElementById('xm-t2');a.dispatchEvent(new Event('pause'));a.remove()}")
  for k in range(20): await go(pg, ['home', 'learn', 'christmas', 'profile', 'play'][k % 5], 150)
  await go(pg, 'home', 1500)
  st = await pg.evaluate(ST)   # v1.26.2 โหมดประหยัด (เครื่องช้า/โหลดหนัก) ใช้ canvas เดียว ไม่มีชั้นหน้า
  ok(st['canvases'] == (1 if st.get('lowPower') else 2), f'{tag} สลับหน้า 20 ครั้ง: canvas หิมะไม่ซ้อน ({st["canvases"]} · โหมดประหยัด {bool(st.get("lowPower"))})')
  # Event Hub
  await go(pg, 'christmas', 3000)
  ok(await pg.locator('#xm-root .xm-hero').count() == 1, f'{tag} เปิด Christmas Hub ได้')
  for sel in ['#xm-root .xm-hero h1', '#xm-root .xm-card h2', '#xm-root .xm-q-body b', '#xm-root .xm-card-sub']:
    c = await pg.evaluate(CONTRAST, sel)
    ok(c is not None and c >= 4.5, f'{tag} Hub อ่านง่าย: {sel} contrast {c}:1')
  ok(await pg.locator('[data-xm-checkin]').count() == 0 and await pg.locator('.xm-checkin [data-xm-go]').count() == 1, f'{tag} ยังไม่เรียน → ปุ่ม "ไปเรียนก่อน" (เปิดกล่องไม่ได้)')
  # v1.25.1 Advent/Boss/Photo booth ใช้งานได้แล้ว (test/e2e/xmas_p1_e2e.py) · Story ยังไม่ผ่านการตรวจของผู้ดูแล → ต้องไม่แสดง
  ok(await pg.locator('.xm-advent').count() == 1 and await pg.locator('.xm-boss').count() == 1 and await pg.locator('.xm-story').count() == 0,
     f'{tag} Hub: มี Advent + Boss · ไม่มี Story (เนื้อหายังไม่อนุมัติ)')
  ok(await pg.evaluate(NOOVER), f'{tag} Hub ไม่ล้นแนวนอน')
  await pg.screenshot(path=f'{OUT}/hub_{w}.png', full_page=True)
  # เรียนจริง 5 ข้อ (บันทึกแบบเดียวกับที่ระบบคำตอบบันทึก) → เปิดกล่อง
  sql(f"INSERT INTO answer_events (user_id, skill, item_id, level, correct) SELECT {uid}, 'vocab', 'xe'||g, 'A1', true FROM generate_series(1,5) g")
  await pg.evaluate("()=>EQChristmas.refresh()"); await pg.wait_for_timeout(1200)
  await pg.locator('[data-xm-checkin]').click(); await pg.wait_for_timeout(2500)
  bal = await pg.evaluate("()=>EQChristmas._state().balance")
  ok(bal == 10, f'{tag} เปิดของขวัญประจำวัน: ได้ 10 Snowflake Token (ยอด {bal})')
  ok(await pg.locator('.xm-gift.is-open').count() == 1, f'{tag} กล่องของขวัญเปิดแล้ว (แอนิเมชัน/สถานะ)')
  await pg.locator('[data-xm-starter]').click(); await pg.wait_for_timeout(2000)
  bal = await pg.evaluate("()=>EQChristmas._state().balance")
  ok(bal == 40, f'{tag} รับของขวัญต้อนรับ: +30 Token (ยอด {bal})')
  # แลก (เติม Token แทนการเรียนหลายวันในการทดสอบ — ผ่านบัญชีแยกประเภท ไม่แก้ยอดตรง)
  sql(f"WITH b AS (UPDATE event_token_balances SET balance = balance + 200, earned_total = earned_total + 200 WHERE user_id = {uid} AND event_id = 'christmas-2026' RETURNING balance) INSERT INTO event_token_ledger (user_id, event_id, delta, reason, idem_key, balance_after) SELECT {uid}, 'christmas-2026', 200, 'test', 'e2e:seed', balance FROM b")
  await pg.evaluate("()=>EQChristmas.refresh()"); await pg.wait_for_timeout(1200)
  await pg.locator('[data-xm-buy="hat_xm26_santa"]').click(); await pg.wait_for_timeout(2500)
  ok(await pg.locator('[data-xm-wear="hat_xm26_santa"]').count() == 1, f'{tag} แลกหมวกซานต้าสำเร็จ (150 Token)')
  await pg.locator('[data-xm-wear="hat_xm26_santa"]').click(); await pg.wait_for_timeout(2500)
  await pg.screenshot(path=f'{OUT}/shop_{w}.png', full_page=True)
  await pg.reload(); await pg.wait_for_timeout(4500); await close_modals(pg)
  outfit = await pg.evaluate("()=>EQApp.api('/avatar/me').then(r=>r.outfit||{})")
  ok(outfit.get('hat') == 'hat_xm26_santa', f'{tag} รีโหลดแล้วยังใส่หมวกซานต้าอยู่ (บันทึกในบัญชี)')
  au = await pg.evaluate("()=>EQAudio._state()")
  ok(au['settings']['xmasMusic'] == 'on' and au['settings']['xmasTrack'] == 'xmas_wish', f'{tag} รีโหลดแล้วจำค่าเพลง (เปิด · เพลงที่เลือก)')
  await go(pg, 'home', 4000)
  await pg.screenshot(path=f'{OUT}/home_santa_{w}.png')
  # ผู้ใช้ทั่วไปเข้า #/admin ไม่ได้ · ผู้ดูแลเห็นแผง
  await pg.evaluate("()=>{location.hash='#/admin'}"); await pg.wait_for_timeout(2000)
  vis = await pg.evaluate("()=>!document.getElementById('screen-admin').classList.contains('hidden')")
  ok(not vis, f'{tag} ผู้ใช้ทั่วไปเปิดหน้าผู้ดูแลไม่ได้')
  r = await pg.evaluate("()=>EQApp.api('/admin/christmas').then(()=>200).catch(e=>e.status||403)")
  ok(r == 403, f'{tag} API ผู้ดูแลคริสต์มาส: ผู้ใช้ทั่วไปได้ 403 ({r})')
  if w == 1280:
    sql(f"UPDATE users SET role = 'admin' WHERE id = {uid}")
    await pg.reload(); await pg.wait_for_timeout(4500); await close_modals(pg)
    await go(pg, 'admin', 3500)
    await pg.evaluate("()=>{document.getElementById('admin-xmas').open=true}"); await pg.wait_for_timeout(1500)
    ok(await pg.locator('#admin-xmas-form').count() == 1, f'{tag} ผู้ดูแล: แผงตั้งค่าคริสต์มาส (วันเวลา · สวิตช์ · Token)')
    ok(await pg.locator('#admin-xmas-form input[name="flag:christmas_story"]:disabled').count() == 1, f'{tag} ผู้ดูแล: สวิตช์ Story ถูกล็อกจนกว่าจะอนุมัติเนื้อหาครบ')
    await pg.locator('#admin-xmas').screenshot(path=f'{OUT}/admin_{w}.png')
    sql(f"UPDATE users SET role = 'user' WHERE id = {uid}")
  ok(not errs, f'{tag} ไม่มี JavaScript error ({errs[:2]})')
  await ctx.close()

async def main():
  sql("INSERT INTO season_settings (season_key, starts_at, ends_at, claim_until) VALUES ('christmas', NOW() - interval '1 day', '2027-01-01T00:00:00+07:00', '2027-01-08T00:00:00+07:00') ON CONFLICT (season_key) DO UPDATE SET starts_at = EXCLUDED.starts_at, enabled = TRUE, flags = '{}'::jsonb")
  await asyncio.sleep(31)   # cache ฝั่งเซิร์ฟเวอร์ 30 วินาที
  # cache หมดอายุแล้วคำขอแรกยังได้ค่าเดิม (โหลดใหม่เบื้องหลัง) → อุ่นก่อน 1 ครั้ง
  import urllib.request
  try: urllib.request.urlopen(os.environ.get('EQ_URL', 'http://localhost:3100') + '/api/season', timeout=5).read()
  except Exception: pass
  await asyncio.sleep(2)
  try:
    async with async_playwright() as p:
      b = await p.chromium.launch()
      for w, h in [(390, 844), (820, 1180), (1280, 800), (1920, 1080)]:
        await run(b, w, h)
      for w, h in [(1366, 768), (1180, 820)]:
        await run(b, w, h, full=False)
      await b.close()
  finally:
    sql("DELETE FROM season_settings WHERE season_key = 'christmas'")
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)

asyncio.run(main())
