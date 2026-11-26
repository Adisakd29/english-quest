"""
v1.27.1 บอสชุดที่ 2 (6 ตัว: celestial · titan · leviathan · phoenix · void · mythic) — E2E เบราว์เซอร์จริง (ดัดแปลงจาก raid_shadow_e2e.py)
  - ผู้ดูแลเปลี่ยนตระกูลบอสปัจจุบันเป็นแต่ละตัว ผ่าน API ผู้ดูแลจริง (ต้องใส่เหตุผล · บันทึก Audit Log) → จบแล้วเปลี่ยนกลับ
  - ผู้ใช้ทั่วไปเปลี่ยนไม่ได้ (403)
  - หน้า Raid โหลดโมเดล boss-<ตัว> + ฉากของตัวเอง จริง (WebGL) · ชื่อบอส · Animation ครบ 10 คลิป
  - โหมด 2D สำรองใช้ภาพ <ตัว>.webp ที่มีอยู่จริง
  - 390 · 820 · 1280 · 1920 · ไม่ล้นแนวนอน · ไม่มี JS error · ภาพหน้าจอเก็บไว้ตรวจด้วยตา
"""
import asyncio, json, os, random, subprocess, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = os.environ.get('SHOT_DIR', '/tmp/claude-0/-home-claude/1fd0a58d-9884-5422-8c4c-1c77fce86b91/scratchpad')
FAILS = []
def ok(c, m):
  print(('PASS ' if c else 'FAIL ') + m, flush=True)
  if not c: FAILS.append(m)
sql = lambda q: subprocess.run(['psql', DB, '-tAc', q], capture_output=True, text=True).stdout.strip()
def call(method, path, token=None, body=None):
  req = urllib.request.Request(URL + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
  try:
    with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b'null')
  except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')
def user(prefix):
  n = '%s%d' % (prefix, random.randint(100000, 999999))
  st, r = call('POST', '/auth/register', body={'username': n, 'email': n + '@gmail.com', 'password': 'password123'})
  return n, r['token']

FAMS = [x for x in os.environ.get('FAMS', 'celestial:Celestial:celestial,titan:Titan:ruins,leviathan:Leviathan:abyss,phoenix:Phoenix:flame-palace,void:Void:void-throne,mythic:Mythic:ascension').split(',')]

async def main():
  na, admin = user('sa'); sql(f"UPDATE users SET role = 'admin' WHERE username = '{na}'")
  nu, tok = user('su')
  st, b0 = call('GET', '/raid/state', tok); fam0 = b0['boss']['family']; lv = b0['boss']['level']
  for spec in FAMS:
    fk, word, ar = spec.split(':')
    st, x = call('POST', '/admin/raid/boss', tok, {'action': 'set_family', 'value': fk, 'reason': 'test'})
    ok(st in (401, 403), f'[{fk}] ผู้ใช้ทั่วไปเปลี่ยนตระกูลบอสไม่ได้ ({st})')
    st, x = call('POST', '/admin/raid/boss', admin, {'action': 'set_family', 'value': fk})
    ok(st == 400, f'ผู้ดูแลต้องใส่เหตุผล ({st})')
    st, x = call('POST', '/admin/raid/boss', admin, {'action': 'set_family', 'value': fk, 'reason': f'E2E ตรวจโมเดล {fk} (เปลี่ยนกลับหลังทดสอบ)'})
    ok(st == 200, f'ผู้ดูแลเปลี่ยนตระกูลบอสเป็น {fk} ({st} {str(x)[:80]})')
    ok(sql("SELECT COUNT(*) FROM raid_admin_audit_logs WHERE action = 'set_family' AND reason LIKE 'E2E ตรวจโมเดล %'") not in ('', '0'), 'บันทึก Audit Log')
    try:
      await asyncio.sleep(1.5)
      st, s1 = call('GET', '/raid/state', tok)
      a = s1['boss'].get('assets') or {}
      ok(s1['boss']['family'] == fk and f'boss-{fk}.' in (a.get('boss') or '') and f'arena-{ar}.' in (a.get('arena') or '') and a.get('art') == f'/img/raid/{fk}.webp',
         f"สถานะบอกโมเดล/ฉาก/ภาพของ {fk} ({s1['boss'].get('nameEn')} · {a})")
      async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for w, h in ((390, 844), (820, 1180), (1280, 800), (1920, 1080)):
          tag = f'[{fk} {w}]'
          ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 900, has_touch=w < 900)
          pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
          await pg.add_init_script(f"localStorage.setItem('wq_token','{tok}');localStorage.setItem('eq_pwa',JSON.stringify({{snoozeUntil:Date.now()+9e8}}))")
          await pg.goto(URL); await pg.wait_for_timeout(3000)
          await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
          await pg.evaluate("()=>EQApp.navigateTo('raid')")
          try: await pg.wait_for_function("()=>{const s=EQRaid._state();return s.scene&&s.scene.clip&&s.scene.clip!=='spawn'}", timeout=30000)
          except Exception: pass
          await pg.wait_for_timeout(2500)
          st3 = await pg.evaluate("()=>{const s=EQRaid._state();return {mode:s.mode3d,clip:s.scene&&s.scene.clip,clips:s.scene&&s.scene.clips,model:s.scene&&s.scene.model,title:document.getElementById('rd-title').textContent}}")
          ok(word in st3['title'], f"{tag} ชื่อบอส: {st3['title']}")
          ok(st3['mode'] in (True, '3d', 'high', 'medium', 'low') and st3['clip'], f"{tag} ฉาก 3D จริงเล่นท่า {st3['clip']} (mode {st3['mode']})")
          if st3.get('clips') is not None: ok(len(st3['clips']) == 10, f"{tag} Animation ครบ 10 คลิป")
          net = await pg.evaluate("()=>performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/assets\\/raid\\//.test(n)).map(n=>n.split('/').pop())")
          ok(any(n.startswith(f'boss-{fk}.') for n in net) and any(n.startswith(f'arena-{ar}.') for n in net), f'{tag} โหลดไฟล์โมเดล/ฉากจริง {net}')
          ov = await pg.evaluate("()=>document.documentElement.scrollWidth - window.innerWidth")
          ok(ov <= 1, f'{tag} ไม่ล้นแนวนอน ({ov})')
          await pg.screenshot(path=f'{OUT}/boss_{fk}_{w}.png')
          ok(not errs, f'{tag} ไม่มี JavaScript error {errs[:2]}')
          await ctx.close()
        # 2D สำรอง: ภาพมีจริงและโหลดได้
        ctx = await b.new_context(); pg = await ctx.new_page()
        r = await pg.goto(URL + f'/img/raid/{fk}.webp')
        ok(r.status == 200 and 'image/webp' in (r.headers.get('content-type') or ''), f'ภาพ 2D สำรอง {fk}.webp ({r.status})')
        await b.close()
    finally:
      st, x = call('POST', '/admin/raid/boss', admin, {'action': 'set_family', 'value': fam0, 'reason': 'E2E เปลี่ยนกลับหลังตรวจโมเดล'})
      ok(st == 200, f'เปลี่ยนตระกูลบอสกลับเป็น {fam0} (Lv {lv})')
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
