"""v1.17.0 e2e — Flashcard ดาวน์โหลด (390/820/1280)
ตรวจ: เปิดจากหน้าเรียน · เลือกระดับ/หัวข้อ/จำนวน · ตัวอย่างการ์ดพลิกได้ · ดาวน์โหลด PDF (สองหน้า/พับ) และ ZIP รูปมือถือ
      ไฟล์ถูกต้อง (จำนวนหน้า/รูป · ขนาด A4 · PNG 1080×1350 · ชื่อไฟล์เรียงหน้า→หลัง) · ข้อความจากข้อมูลถูก escape · ไม่เลื่อนแนวนอน
ใช้: python3 test/e2e/flashcards_e2e.py [out_dir]"""
import asyncio, io, os, random, re, struct, sys, zipfile
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
REG = """async (n)=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:n,email:n+'@gmail.com',password:'password123'})});return r.json()}"""
VIEWS = [('mobile', 390, 844), ('tablet', 820, 1180), ('desktop', 1280, 860)]

def pdf_pages(b):
  return len(re.findall(rb'/Type /Page\b(?!s)', b))

async def run(b, name, w, h, fails, full):
  def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + f'[{name}] ' + m)
    if not c: fails.append(f'{name}: {m}')
  ctx = await b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True, service_workers='block'); pg = await ctx.new_page(); errs = []
  pg.on('pageerror', lambda e: errs.append(str(e)))
  await pg.goto(URL); await pg.wait_for_timeout(300)
  n = 'fc%d' % random.randint(100000, 999999)
  tok = (await pg.evaluate(REG, n))['token']
  await pg.evaluate("t=>localStorage.setItem('wq_token',t)", tok); await pg.reload(); await pg.wait_for_timeout(2000)
  await pg.evaluate("()=>EQApp.api('/changelog/seen',{method:'POST',body:{}}).catch(()=>{})")
  await pg.evaluate("()=>EQApp.navigateTo('learn')"); await pg.wait_for_timeout(800)
  ok(await pg.locator('#path-open-flashcards').count() == 1, 'หน้าเรียนมีปุ่ม Flashcard')
  await pg.click('#path-open-flashcards'); await pg.wait_for_selector('#fc-title')
  ok((await pg.evaluate('location.hash')) == '#/flashcards', 'เปิด #/flashcards')
  ok(await pg.evaluate("()=>document.querySelector('#bottom-nav [data-nav=\"learn\"]').classList.contains('active')"), 'ไฮไลต์เมนูเรียน')
  ok(await pg.locator('.fc-lv').count() == 6, 'มีระดับ A1–C2')
  # เลือก A1 · อาหาร · 20 ใบ
  await pg.click('[data-fc-topic="food"]'); await pg.wait_for_timeout(300)
  await pg.click('[data-fc-set="count"][data-v="20"]')
  await pg.wait_for_function("()=>document.querySelectorAll('#fc-preview img[src^=\"data:image/jpeg\"]').length>=12", timeout=20000)
  ok(await pg.locator('#fc-preview .fc-card').count() == 6, 'ตัวอย่าง 6 ใบ')
  deck = await pg.evaluate("()=>EQFlashcards._state().deck")
  ok(deck['level'] == 'A1' and deck['topic'] == 'food' and len(deck['cards']) == 20 and all(c['topic'] == 'food' for c in deck['cards']), 'ชุดการ์ดตรงกับที่เลือก (A1 อาหาร 20 ใบ)')
  await pg.click('#fc-preview .fc-card >> nth=0'); await pg.wait_for_timeout(600)
  ok(await pg.locator('#fc-preview .fc-card.is-flipped').count() == 1, 'แตะการ์ดแล้วพลิก')
  ok(await pg.evaluate("()=>document.documentElement.scrollWidth<=window.innerWidth+1"), 'ไม่เลื่อนแนวนอน')
  await pg.screenshot(path=f'{OUT}/fc_{name}.png', full_page=False)
  # PDF สองหน้า: 20 ใบ = 3 แผ่น × 2 = 6 หน้า
  async with pg.expect_download(timeout=120000) as dl:
    await pg.click('#fc-pdf')
  d = await dl.value; p = f'{OUT}/fc_{name}_duplex.pdf'; await d.save_as(p); data = open(p, 'rb').read()
  ok(d.suggested_filename == 'EnglishQuest-Flashcards-A1-food-20-duplex.pdf', f'ชื่อไฟล์ PDF ({d.suggested_filename})')
  ok(data[:8] == b'%PDF-1.4' and data.rstrip().endswith(b'%%EOF'), 'เป็นไฟล์ PDF สมบูรณ์')
  ok(pdf_pages(data) == 6 and data.count(b'/Subtype /Image') == 40, f'PDF สองหน้า: 6 หน้า 40 ภาพ ({pdf_pages(data)} หน้า)')
  ok(b'/MediaBox [0 0 595.28 841.89]' in data, 'ขนาดหน้า A4')
  try:
    import pypdf
    r = pypdf.PdfReader(io.BytesIO(data)); ok(len(r.pages) == 6, 'pypdf อ่านได้ 6 หน้า')
  except Exception as e: ok(False, f'pypdf อ่านไม่ได้: {e}')
  # PDF พับครึ่ง + ประหยัดหมึก: 20 ใบ = 5 หน้า
  if full:
    await pg.click('[data-fc-set="mode"][data-v="fold"]'); await pg.click('[data-fc-set="style"][data-v="ink"]')
    await pg.wait_for_function("()=>!document.getElementById('fc-pdf').disabled", timeout=20000)
    async with pg.expect_download(timeout=120000) as dl:
      await pg.click('#fc-pdf')
    d = await dl.value; p2 = f'{OUT}/fc_{name}_fold.pdf'; await d.save_as(p2); data2 = open(p2, 'rb').read()
    ok(pdf_pages(data2) == 5 and data2.count(b'/Subtype /Image') == 40 and d.suggested_filename.endswith('-fold.pdf'), f'PDF พับครึ่ง: 5 หน้า ({pdf_pages(data2)})')
    # ZIP รูปมือถือ
    async with pg.expect_download(timeout=180000) as dl:
      await pg.click('#fc-zip')
    d = await dl.value; pz = f'{OUT}/fc_{name}.zip'; await d.save_as(pz)
    z = zipfile.ZipFile(pz); names = z.namelist()
    ok(z.testzip() is None and len(names) == 40, f'ZIP ถูกต้อง 40 รูป ({len(names)})')
    ok(names[0].startswith('01-') and names[0].endswith('-1-front.png') and names[1].endswith('-2-back.png'), f'ชื่อไฟล์เรียงหน้า→หลัง ({names[:2]})')
    png = z.read(names[0]); wpx, hpx = struct.unpack('>II', png[16:24])
    ok(png[:8] == b'\x89PNG\r\n\x1a\n' and (wpx, hpx) == (1080, 1350), f'PNG 1080×1350 ({wpx}×{hpx})')
    z.extract(names[0], f'{OUT}/fc_png'); z.extract(names[1], f'{OUT}/fc_png')
    ok(os.path.getsize(pz) < 20 * 1024 * 1024, f'ZIP ขนาด {os.path.getsize(pz) / 1048576:.1f} MB')
  # ข้อความใน DOM ถูก escape (ชื่อคำ/คำแปลมาจากข้อมูล)
  ok(await pg.locator('#fc-preview script, #fc-preview img[onerror]').count() == 0, 'ไม่มี HTML แทรกในตัวอย่าง')
  # เปลี่ยนระดับ → หัวข้อรีเซ็ตเป็นทุกหัวข้อ
  await pg.click('[data-fc-level="C2"]'); await pg.wait_for_timeout(1500)
  ok(await pg.evaluate("()=>EQFlashcards._state().topic") == 'all' and await pg.locator('[data-fc-topic="business"]').count() == 1, 'เปลี่ยนเป็น C2 แล้วเห็นหัวข้อของ C2')
  ok(not errs, f'ไม่มี JS error {errs[:2]}')
  await ctx.close()

async def main():
  fails = []
  async with async_playwright() as p:
    b = await p.chromium.launch()
    for i, (name, w, h) in enumerate(VIEWS): await run(b, name, w, h, fails, full=(i != 1))
    await b.close()
  print('\nRESULT:', 'ALL PASS' if not fails else f'{len(fails)} FAIL'); [print(' -', f) for f in fails]
  sys.exit(1 if fails else 0)
asyncio.run(main())
