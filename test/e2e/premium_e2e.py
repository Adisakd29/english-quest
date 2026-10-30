"""E2E: สมาชิก Premium (#/premium + ส่วนผู้ดูแล) — เซิร์ฟเวอร์ :3100 + DB eq_dev (ต้องตั้ง PROMPTPAY_ID)
   ใช้: python3 test/e2e/premium_e2e.py <slip.jpg> [outdir] [expected_promptpay_target]
   ตรวจ: โปรไฟล์ → สมาชิก Premium · 2 แพ็กเกจ · เลือกรายปี → QR (ถอดรหัสได้: บัญชีพร้อมเพย์ + ยอดเฉพาะ + CRC ถูก) · แนบสลิป → รอตรวจ ·
         ผู้ดูแลเห็นรายการ + ดูสลิป + อนุมัติ → ผู้ใช้เห็น Premium ใช้งานอยู่ + ป้ายในโปรไฟล์ · มือถือ 390: ไม่มี scroll แนวนอน · ปุ่ม ≥ 44px · ไม่มี JS error"""
import asyncio, os, random, subprocess, sys
import cv2, numpy as np
from playwright.async_api import async_playwright

URL = 'http://localhost:3100'
DB = 'postgresql://postgres:postgres@localhost:5432/eq_dev'
SLIP = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/premium_e2e'
TARGET = sys.argv[3] if len(sys.argv) > 3 else None   # เช่น 0066xxxxxxxxx (ค่าใน tag 29-01)
os.makedirs(OUT, exist_ok=True)
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg, flush=True)
    if not ok: fails.append(msg)
def psql(sql):
    return subprocess.run(['psql', DB, '-qAtc', sql], check=True, capture_output=True, text=True).stdout.strip()
def crc16(s):
    crc = 0xFFFF
    for ch in s.encode():
        crc ^= ch << 8
        for _ in range(8): crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return '%04X' % crc
async def layout(pg, tag, where, scope='#screen-premium:not(.hidden)'):
    lay = await pg.evaluate("""(scope)=>({hs:document.documentElement.scrollWidth-innerWidth,
      small:[...document.querySelectorAll(scope+' button, '+scope+' input[type=text]')].filter(x=>{const r=x.getBoundingClientRect();return x.offsetParent&&r.width>0&&!x.closest('summary')&&!x.classList.contains('tq-link')&&(r.width<44||r.height<44)}).map(x=>x.className+':'+(x.textContent||x.placeholder).trim().slice(0,14))})""", scope)
    check(lay['hs'] <= 0, f'{tag}: {where} ไม่มี scroll แนวนอน ({lay["hs"]})')
    check(not lay['small'], f'{tag}: {where} ปุ่ม ≥ 44px {lay["small"][:4]}')

async def login(b, w, h, mobile, prefix):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile, service_workers='block', accept_downloads=True)
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
    uid = await pg.evaluate("()=>EQApp.user.id")
    return ctx, pg, errs, name, uid

async def run(b, w, h, mobile, tag):
    ctx, pg, errs, name, uid = await login(b, w, h, mobile, 'pme')
    # 1) โปรไฟล์ → Premium
    await pg.evaluate("()=>EQApp.navigateTo('profile')"); await pg.wait_for_selector('.pm-link', timeout=20000)
    await pg.click('.pm-link'); await pg.wait_for_selector('#pm-title', timeout=20000)
    check('#/premium' in pg.url and await pg.locator('.pm-plan').count() == 2, f'{tag}: โปรไฟล์ → หน้า Premium 2 แพ็กเกจ')
    txt = await pg.inner_text('#screen-premium')
    check('฿39' in txt and '฿299' in txt and 'ไม่มี EXP / Coin เพิ่ม' in txt, f'{tag}: ราคา + บอกชัดว่าไม่ใช่ pay-to-win')
    await layout(pg, tag, 'หน้า Premium')
    await pg.screenshot(path=f'{OUT}/{tag}_plans.png', full_page=True)

    # 2) เลือกรายปี → QR
    await pg.click('[data-pm-buy="yearly"]'); await pg.wait_for_selector('.pm-qr svg', timeout=20000)
    amount = (await pg.inner_text('.pm-amount b')).replace('฿', '').strip()
    check(amount.startswith('299.') and amount != '299.00', f'{tag}: ยอดเฉพาะ {amount}')
    shot = await pg.locator('.pm-qr').screenshot()
    img = cv2.imdecode(np.frombuffer(shot, np.uint8), cv2.IMREAD_COLOR)
    img = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
    val, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    check(bool(val) and f'54{len(amount):02d}{amount}' in val and val[-4:] == crc16(val[:-4]) and 'A000000677010111' in val,
          f'{tag}: ถอดรหัส QR ได้ — พร้อมเพย์ + ยอด {amount} + CRC ถูก')
    if TARGET: check(f'01{len(TARGET):02d}{TARGET}' in val, f'{tag}: QR ชี้ไปบัญชีพร้อมเพย์ที่ตั้งไว้')
    check('ชื่อบัญชีผู้รับ' in await pg.inner_text('.pm-checkout'), f'{tag}: แสดงชื่อบัญชีผู้รับ')
    await layout(pg, tag, 'หน้าชำระเงิน')
    await pg.screenshot(path=f'{OUT}/{tag}_checkout.png', full_page=True)
    async with pg.expect_download() as dl:
        await pg.click('[data-pm-saveqr]')
    d = await dl.value
    check(d.suggested_filename.endswith('.png'), f'{tag}: บันทึกรูป QR เป็น PNG ({d.suggested_filename})')

    # 3) แนบสลิป
    # สลิปเดียวใช้ซ้ำไม่ได้ (sha256) → แต่ละรอบใช้ไฟล์ที่ต่างกันเล็กน้อย
    src = cv2.imread(SLIP); src[5, 5] = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
    cv2.putText(src, str(random.random()), (60, 1400), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2)
    one = f'{OUT}/{tag}_slip.jpg'; cv2.imwrite(one, src)
    await pg.set_input_files('[data-pm-file]', one)
    await pg.wait_for_selector('[data-pm-preview] img', timeout=10000)
    check(await pg.is_enabled('[data-pm-send]'), f'{tag}: เลือกสลิป → แสดงตัวอย่าง + ปุ่มส่ง')
    await pg.fill('[data-pm-paidat]', '28 ต.ค. 14:05')
    await pg.click('[data-pm-send]'); await pg.wait_for_selector('.pm-wait', timeout=20000)
    check('รอผู้ดูแลตรวจ' in await pg.inner_text('.pm-wait'), f'{tag}: ส่งสลิป → รอตรวจ')
    oid = psql(f"SELECT id FROM membership_orders WHERE user_id = {uid} AND status = 'submitted'")
    check(bool(oid) and psql(f"SELECT slip_mime FROM membership_orders WHERE id = {oid}") == 'image/jpeg', f'{tag}: สลิปถูกย่อเป็น JPEG และเก็บใน DB')
    await pg.screenshot(path=f'{OUT}/{tag}_waiting.png', full_page=True)

    # 4) ผู้ดูแลอนุมัติ
    actx, apg, aerrs, aname, aid = await login(b, w, h, mobile, 'pma')
    psql(f"UPDATE users SET role = 'admin' WHERE id = {aid}")
    await apg.goto(URL + '/?c=%d#/home' % random.randint(1, 10**6)); await apg.wait_for_function("()=>window.EQApp&&EQApp.user&&EQApp.user.role==='admin'", timeout=60000)
    await apg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(o=>o.remove())")
    await apg.evaluate("()=>EQApp.navigateTo('admin')"); await apg.wait_for_selector(f'.pma-row[data-id="{oid}"]', state='attached', timeout=20000)
    await apg.click('#admin-membership summary')
    row = apg.locator(f'.pma-row[data-id="{oid}"]')
    check(amount in await row.inner_text() and name in await row.inner_text(), f'{tag}: ผู้ดูแลเห็นรายการ (ชื่อ + ยอด)')
    check((await apg.inner_text('#admin-membership-count')).strip() != '0', f'{tag}: ตัวเลขรอตรวจบนหัวข้อ')
    await row.locator('[data-pma-slip]').click(); await apg.wait_for_selector(f'.pma-row[data-id="{oid}"] [data-slip-box] img', timeout=10000)
    nat = await apg.evaluate(f"()=>new Promise(r=>{{const i=document.querySelector('.pma-row[data-id=\"{oid}\"] [data-slip-box] img');if(i.complete)r(i.naturalWidth);else i.onload=()=>r(i.naturalWidth)}})")
    check(nat > 100, f'{tag}: เปิดดูสลิปได้ (กว้าง {nat}px)')
    await layout(apg, tag, 'ผู้ดูแล: ตรวจสลิป', '#admin-membership')
    await apg.screenshot(path=f'{OUT}/{tag}_admin.png', full_page=False)
    await row.locator('[data-pma-approve]').click()
    await apg.wait_for_function(f"()=>!document.querySelector('.pma-row[data-id=\"{oid}\"]')", timeout=15000)
    check(psql(f"SELECT status FROM membership_orders WHERE id = {oid}") == 'approved', f'{tag}: อนุมัติแล้ว')
    check(not aerrs, f'{tag}: ผู้ดูแล ไม่มี JS error {aerrs[:2]}')
    await actx.close()

    # 5) ผู้ใช้เห็น Premium
    await pg.evaluate("()=>EQApp.navigateTo('home')"); await pg.wait_for_timeout(300)
    await pg.goto(URL + '/?c=%d#/premium' % random.randint(1, 10**6)); await pg.wait_for_selector('.pm-status.is-active', timeout=30000)
    st = await pg.inner_text('.pm-status')
    check('Premium ใช้งานอยู่' in st and 'รายปี' in st, f'{tag}: ผู้ใช้เห็น Premium ใช้งานอยู่ (รายปี)')
    check(await pg.locator('.pm-hist .pm-chip.is-approved').count() == 1, f'{tag}: ประวัติ: อนุมัติแล้ว')
    await pg.screenshot(path=f'{OUT}/{tag}_active.png', full_page=True)
    await pg.evaluate("()=>EQApp.navigateTo('profile')"); await pg.wait_for_selector('#profile-name .pm-badge', timeout=15000)
    check(True, f'{tag}: ป้าย Premium ข้างชื่อในโปรไฟล์')
    await layout(pg, tag, 'โปรไฟล์ (มีป้าย)', '#screen-profile:not(.hidden) .pf-hero')
    check(not errs, f'{tag}: ไม่มี JS error {errs[:3]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, 1280, 900, False, 'desktop')
        await run(b, 390, 844, True, 'mobile')
        await b.close()
    print('\nFAILS:', len(fails)); [print(' -', f) for f in fails]
    print('ALL PASS' if not fails else '')
asyncio.run(main())
