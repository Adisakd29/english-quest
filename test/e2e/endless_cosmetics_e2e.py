"""
v1.21.0 ทายศัพท์ไม่รู้จบ · กรอบโปรไฟล์/กรอบแชท · รางวัลทุก 10 เลเวล — E2E ที่ 390 / 820 / 1280
  - หน้าเล่น: การ์ด "ทายศัพท์ไม่รู้จบ" + ภาพ il-endless
  - เข้าแอปตอนมีรางวัลค้าง → แจ้งพร้อมปุ่ม "รับรางวัล"
  - Endless: เริ่ม · ตอบถูก (+EXP) · กดเลข 1–4 ได้ · ผิดครบ 3 = หน้าสรุป · คำที่พลาด · เก็บเข้าคิวทบทวน · เล่นอีกครั้ง · ออกกลางเกม
  - เลเวลอัปถึงขั้นใหม่ระหว่างเล่น → หน้าต่างเลเวลอัปมีปุ่มรับรางวัล
  - กรอบ: แท็บ · ซื้อ (Coin ลดตามราคา) · ใส่ → HUD มีกรอบ · รับรางวัลเลเวลทั้งหมด → หน้าต่างรางวัล → ใส่กรอบรางวัล
  - กรอบแชท: ซื้อ + ใส่ → ฟองข้อความของเราในแชทเพื่อนมีกรอบ · เพื่อนเห็นกรอบแชทของเรา + กรอบโปรไฟล์ในรายชื่อเพื่อนและหน้าโปรไฟล์
  - ไม่ล้นแนวนอน · ไม่มี JS error
"""
import asyncio, os, random, subprocess, sys
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
NOOVER = "()=>document.documentElement.scrollWidth<=innerWidth+1"
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
def sql(q): return subprocess.run(['psql', DB, '-tAc', q], check=True, capture_output=True, text=True).stdout.strip()
def answer_of(uid): return int(sql(f"SELECT (q->>'answer')::int FROM endless_runs WHERE user_id={uid} AND status='active'"))
def age(uid, ms): sql(f"UPDATE endless_runs SET q = jsonb_set(q,'{{issuedAt}}', to_jsonb(((q->>'issuedAt')::bigint - {ms})::bigint)) WHERE user_id={uid} AND status='active'")

async def login(b, w, h, name, exp=None):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page()
  errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL)
  tok = (await pg.evaluate(REG, name))['token']
  uid = int(sql(f"SELECT id FROM users WHERE username='{name}'"))
  if exp is not None: sql(f"UPDATE users SET exp={exp} WHERE id={uid}")
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(1200)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
  return ctx, pg, uid, tok, errs

async def run(b, w, h):
  tag = f'[{w}]'
  na = 'ec%d' % random.randint(100000, 999999); nb = 'ed%d' % random.randint(100000, 999999)
  ca, A, ua, ta, ea = await login(b, w, h, na, exp=34000)   # เลเวล 30 → รางวัลค้าง 3 ขั้น
  await A.reload()
  try:
    await A.wait_for_selector('.toast .toast-action', timeout=15000)
    t = await A.locator('.toast', has=A.locator('.toast-action')).first.inner_text()
    ok('รางวัลเลเวล' in t and 'รับรางวัล' in t, f'{tag} เข้าแอปแล้วแจ้งรางวัลเลเวลค้างรับ ("{t.strip()[:40]}")')
  except Exception as e: ok(False, f'{tag} แจ้งรางวัลเลเวลค้างรับ ({e})')
  # หน้าเล่น
  await A.evaluate("()=>EQApp.navigateTo('play')"); await A.wait_for_timeout(800)
  card = A.locator('#screen-play .en-entry')
  ok(await card.count() == 1 and await card.locator('use').first.get_attribute('href') and await A.evaluate("()=>!!document.querySelector('#screen-play .en-entry .play-card-art use[href$=\"#il-endless\"]')"), f'{tag} การ์ดทายศัพท์ไม่รู้จบ + ภาพของตัวเอง')
  await card.click(); await A.wait_for_selector('#screen-endless [data-en="start"]', timeout=8000)
  ok(await A.evaluate("()=>location.hash") == '#/endless', f'{tag} เปิด #/endless')
  ok(await A.evaluate(NOOVER), f'{tag} หน้า Endless ไม่ล้นแนวนอน')
  await A.screenshot(path=f'{OUT}/en_hub_{w}.png', full_page=True)
  # เริ่ม · ตอบถูก
  await A.click('[data-en="start"]'); await A.wait_for_selector('.en-opt', timeout=8000)
  ok(await A.locator('.en-opt').count() == 4 and await A.locator('.en-heart:not(.is-lost)').count() == 3, f'{tag} ข้อแรก: 4 ตัวเลือก · 3 หัวใจ')
  age(ua, 1500)
  await A.click(f'.en-opt[data-en-choice="{answer_of(ua)}"]'); await A.wait_for_selector('.en-ok', timeout=6000)
  ok('+3 EXP' in await A.locator('.en-ok').inner_text(), f'{tag} ตอบถูก +3 EXP')
  await A.screenshot(path=f'{OUT}/en_ok_{w}.png')
  await A.wait_for_function("()=>{const b=document.querySelector('.en-opt');return b&&!b.disabled}", timeout=6000)
  # กดเลขบนคีย์บอร์ด (ตอบถูก) + ทำให้เลเวลอัปถึง 40 ระหว่างเล่น
  sql(f"UPDATE users SET exp=75658 WHERE id={ua}")
  age(ua, 1500); await A.keyboard.press(str(answer_of(ua) + 1)); await A.wait_for_selector('.en-ok', timeout=6000)
  ok(await A.locator('.en-ok').count() == 1, f'{tag} กดเลข 1–4 บนคีย์บอร์ดตอบได้')
  try:
    await A.wait_for_selector('#levelup-reward', timeout=9000)
    ok(True, f'{tag} เลเวลอัปถึง 40 → หน้าต่างเลเวลอัปมีปุ่มรับรางวัล')
    await A.screenshot(path=f'{OUT}/en_lvup_{w}.png')
    await A.locator('#levelup-ok').click()
  except Exception as e: ok(False, f'{tag} ปุ่มรับรางวัลในหน้าต่างเลเวลอัป ({e})')
  # v1.21.0 ยิ่งไกลตัวเลือกยิ่งเยอะ: ถูกครบ 18 ข้อ → 5 ตัวเลือก + ป้ายแจ้ง
  await A.wait_for_function("()=>{const b=document.querySelector('.en-opt');return b&&!b.disabled}", timeout=8000)
  ok(await A.locator('.en-opt').count() == 4, f'{tag} ช่วงแรก 4 ตัวเลือก')
  sql(f"UPDATE endless_runs SET score = 17 WHERE user_id = {ua} AND status = 'active'")
  age(ua, 1500); await A.click(f'.en-opt[data-en-choice="{answer_of(ua)}"]'); await A.wait_for_selector('.en-ok', timeout=6000)
  await A.wait_for_function("()=>{const b=document.querySelector('.en-opt');return b&&!b.disabled}", timeout=8000)
  ok(await A.locator('.en-opt').count() == 5 and await A.locator('.en-more').is_visible(), f'{tag} ถูกครบ 18 ข้อ → 5 ตัวเลือก + ป้าย "ตอนนี้มี 5 ตัวเลือก"')
  ok(await A.evaluate(NOOVER), f'{tag} 5 ตัวเลือกไม่ล้นแนวนอน')
  await A.screenshot(path=f'{OUT}/en_five_{w}.png')
  # ผิด 3 ครั้ง → จบ
  for i in range(3):
    await A.wait_for_function("()=>{const b=document.querySelector('.en-opt');return b&&!b.disabled}", timeout=8000)
    await A.click(f'.en-opt[data-en-choice="{(answer_of(ua) + 1) % 5}"]')
    await A.wait_for_selector('.en-bad', timeout=6000)
    if i == 0: await A.screenshot(path=f'{OUT}/en_bad_{w}.png')
    if i < 2:
      ok(await A.locator('.en-heart.is-lost').count() == i + 1, f'{tag} ผิดครั้งที่ {i + 1}: เสียหัวใจ')
      await A.click('#en-fb [data-en="next"]')
  await A.wait_for_selector('.en-over', timeout=8000)
  big = (await A.locator('.en-big').inner_text()).strip()
  ok(big.startswith('18'), f'{tag} หน้าสรุป: {big}')
  ok(await A.locator('.en-missed li').count() == 3, f'{tag} แสดงคำที่พลาด 3 คำ')
  ok(await A.evaluate(NOOVER), f'{tag} หน้าสรุปไม่ล้นแนวนอน')
  await A.screenshot(path=f'{OUT}/en_over_{w}.png', full_page=True)
  await A.click('[data-en="save"]'); await A.wait_for_timeout(1200)
  ok('เก็บแล้ว' in await A.locator('[data-en="save"]').inner_text(), f'{tag} เก็บคำที่พลาดเข้าคิวทบทวน')
  await A.click('.en-over [data-en="start"]'); await A.wait_for_selector('.en-opt', timeout=8000)
  ok(await A.locator('.en-heart:not(.is-lost)').count() == 3, f'{tag} เล่นอีกครั้ง: เริ่มใหม่ 3 หัวใจ')
  await A.click('[data-en="quit"]'); await A.click('.modal-overlay [data-q="go"]'); await A.wait_for_timeout(1500)
  ok(await A.locator('#screen-endless [data-en="start"]').count() >= 1, f'{tag} ออกกลางเกม → กลับหน้า Endless')
  st = await A.evaluate("()=>EQApp.api('/endless')")
  ok(st['best'] == 18, f'{tag} สถิติสูงสุดบันทึกแล้ว ({st["best"]})')

  # ---- กรอบ ----
  await A.evaluate("()=>EQApp.navigateTo('frames')"); await A.wait_for_selector('#screen-frames .cos-card', timeout=8000)
  ok(await A.evaluate("()=>{const s=document.getElementById('eq-frames-sprite');return s&&getComputedStyle(s).display!=='none'&&!!s.querySelector('#pf_cute_cat')}"), f'{tag} โหลดภาพกรอบแล้ว (ไม่ซ่อนแบบ display:none)')
  ok(await A.evaluate(NOOVER), f'{tag} หน้ากรอบไม่ล้นแนวนอน')
  bal0 = (await A.evaluate("()=>EQApp.api('/cosmetics')"))['balance']
  await A.click('[data-cos-pick="pf_cute_cat"]'); await A.wait_for_selector('[data-cos-buy="pf_cute_cat"]')
  ok(await A.locator('.cos-prev-pic .cos-ov use').get_attribute('href') == '#pf_cute_cat', f'{tag} แตะกรอบ → ตัวอย่างบนรูปของเรา')
  await A.screenshot(path=f'{OUT}/cos_prev_{w}.png', full_page=True)
  await A.click('[data-cos-buy="pf_cute_cat"]'); await A.wait_for_timeout(1500)
  d = await A.evaluate("()=>EQApp.api('/cosmetics')")
  ok(d['balance'] == bal0 - 120 and d['equipped']['pframe'] == 'pf_cute_cat', f'{tag} ซื้อแล้ว Coin {bal0} → {d["balance"]} · ใส่ทันที')
  try:
    await A.wait_for_function("()=>{const u=document.querySelector('#hud .pf-ov use');return u&&u.getAttribute('href')==='#pf_cute_cat'}", timeout=6000)
    ok(True, f'{tag} HUD แสดงกรอบที่ใส่')
  except Exception: ok(False, f'{tag} HUD แสดงกรอบที่ใส่')
  # รางวัลเลเวล
  await A.click('[data-cos-tab="levels"]'); await A.wait_for_selector('.cos-lv')
  ok(await A.locator('.cos-lv.is-claimable').count() == 4, f'{tag} รางวัลรอรับ 4 ขั้น (เลเวล 40)')
  await A.screenshot(path=f'{OUT}/cos_levels_{w}.png', full_page=True)
  await A.click('[data-cos-claim-all]'); await A.wait_for_selector('.cos-reward', timeout=8000)
  ok('+700' in await A.locator('.cos-reward-coins').inner_text(), f'{tag} รับทั้งหมด: +700 Coin (เลเวล 10–40)')
  await A.screenshot(path=f'{OUT}/cos_reward_{w}.png')
  await A.click('[data-rw-wear]'); await A.wait_for_timeout(1500)
  d = await A.evaluate("()=>EQApp.api('/cosmetics')")
  ok(d['equipped']['pframe'] == 'pf_lv10', f'{tag} ใส่กรอบรางวัลจากหน้าต่างรางวัล ({d["equipped"]["pframe"]})')
  ok(await A.locator('.cos-lv.is-claimed').count() == 4 and await A.locator('[data-cos-badge]:not(.hidden)').count() == 0, f'{tag} รับแล้วครบ · ป้ายหายไป')
  # กรอบแชท
  await A.click('[data-cos-tab="cframe"]'); await A.click('[data-cos-pick="cf_cute_cloud"]'); await A.click('[data-cos-buy="cf_cute_cloud"]'); await A.wait_for_timeout(1500)
  ok((await A.evaluate("()=>EQApp.api('/cosmetics')"))['equipped']['cframe'] == 'cf_cute_cloud', f'{tag} ซื้อ + ใส่กรอบแชท')
  await A.screenshot(path=f'{OUT}/cos_chat_{w}.png', full_page=True)

  # ---- เพื่อนเห็นกรอบ ----
  cb, B, ub, tb, eb = await login(b, w, h, nb)
  sql(f"INSERT INTO friendships (requester_id, addressee_id, status) VALUES ({ua}, {ub}, 'accepted')")
  await A.evaluate("([id])=>EQApp.api('/chat/'+id+'/messages',{method:'POST',body:{body:'hello from frames'}})", [ub])
  await B.reload(); await B.wait_for_timeout(2000)
  await B.evaluate("()=>EQApp.navigateTo('friends')"); await B.wait_for_timeout(2500)
  ok(await B.evaluate(f"()=>{{const u=document.querySelector('#screen-friends .friend-avatar.has-pf use, #screen-friends [data-pf=\"pf_lv10\"] use');return !!u}}"), f'{tag} รายชื่อเพื่อน: เห็นกรอบโปรไฟล์ของเพื่อน')
  await B.evaluate(f"()=>EQApp.openChat({ua})"); await B.wait_for_timeout(2500)
  ok(await B.evaluate("()=>{const x=[...document.querySelectorAll('#chat-messages .chat-bubble.theirs')].pop();return !!x&&x.dataset.cf==='cf_cute_cloud'&&x.classList.contains('has-cf')}"), f'{tag} แชทเพื่อน: ฟองข้อความของเพื่อนมีกรอบแชท')
  await B.screenshot(path=f'{OUT}/cos_dm_{w}.png')
  await B.evaluate(f"()=>{{location.hash='#/user/{ua}'}}"); await B.wait_for_selector('#screen-user .up-pic', timeout=8000); await B.wait_for_timeout(1200)
  ok(await B.evaluate("()=>{const u=document.querySelector('#screen-user .up-pic .pf-ov use');return u&&u.getAttribute('href')==='#pf_lv10'}"), f'{tag} หน้าโปรไฟล์: เห็นกรอบโปรไฟล์')
  await B.screenshot(path=f'{OUT}/cos_profile_{w}.png')
  ok(not ea and not eb, f'{tag} ไม่มี JS error {(ea + eb)[:2]}')
  await ca.close(); await cb.close()

async def main():
  os.makedirs(OUT, exist_ok=True)
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for w, h in [(390, 844), (820, 1180), (1280, 860)]: await run(b, w, h)
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not FAILS else f'{len(FAILS)} FAIL')
  for f in FAILS: print(' -', f)
  sys.exit(1 if FAILS else 0)
asyncio.run(main())
