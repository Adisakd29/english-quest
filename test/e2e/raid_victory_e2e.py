"""
v1.27.1 ป๊อปอัป VICTORY — คนที่รับรางวัลแล้วต้องไม่เห็นปุ่ม "รับรางวัล" ซ้ำ (เจ้าของแจ้ง 25 พ.ย.)
  A = ผู้ร่วมสู้ (ตอบถูกครบเกณฑ์) · B = เปิดหน้า Raid แต่ไม่ได้สู้
  1) บอสล้มสด ๆ ขณะเปิดหน้า: A เห็น Victory + ปุ่มรับรางวัล · B เห็นประกาศชัยชนะ + ปุ่มปิด (ไม่มีปุ่มรับรางวัล)
  2) A เปิดหน้าใหม่หลังบอสล้ม (ยังไม่รับ · ยังไม่กดปิด) → เห็นปุ่มรับรางวัล
  3) A กดปิด → เปิดหน้าใหม่ไม่เด้งซ้ำ
  4) A รับรางวัลจริงผ่านแท็บรางวัล → ล้างค่าจำในเครื่อง → เปิดหน้าใหม่ไม่เด้ง (รับแล้ว)
  5) B เปิดหน้าใหม่ไม่เด้ง (ไม่มีรางวัลให้รับ)
  ใช้ผู้ดูแลจริง (set_hp ต้องใส่เหตุผล · Audit Log) ลด HP แล้ว A ตีจนล้มด้วยคำตอบจริง · ฐานข้อมูล dev เท่านั้น
"""
import asyncio, json, os, random, subprocess, time, urllib.request
from playwright.async_api import async_playwright
URL = os.environ.get('EQ_URL', 'http://localhost:3100'); DB = os.environ.get('EQ_DB', 'postgresql://postgres:postgres@localhost:5432/eq_dev')
OUT = os.environ.get('SHOT_DIR', '/tmp/claude-0/-home-claude/1fd0a58d-9884-5422-8c4c-1c77fce86b91/scratchpad')
SIZES = [tuple(map(int, x.split('x'))) for x in os.environ.get('SIZES', '390x844,820x1180,1280x800,1920x1080').split(',')]
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

def wait_active(admin):
  for _ in range(120):
    st, s = call('GET', '/raid/state', admin)
    if s and s.get('boss') and s['boss']['status'] == 'active': return s['boss']
    if s and s.get('boss') and s['boss']['status'] in ('defeated', 'settled'):
      sql("UPDATE raid_boss_instances SET next_spawn_at = NOW() WHERE id = %d" % s['boss']['id'])
    if s and s.get('boss') and s['boss']['status'] == 'preparing':
      sql("UPDATE raid_boss_instances SET active_at = NOW() WHERE id = %d" % s['boss']['id'])
    time.sleep(1.5)
  raise SystemExit('boss not active')

def answer_right(tok, att):
  a = sql(f"SELECT current, shown_idx, status FROM raid_attempts WHERE id = '{att}'").split('|')
  if a[2] != 'open': return None
  if int(a[1]) < int(a[0]): call('POST', '/raid/round/next', tok, {'attemptId': att})
  row = sql(f"SELECT current, questions->current->>'type', questions->current->>'correctIndex', questions->current->>'answer' FROM raid_attempts WHERE id = '{att}'").split('|')
  body = {'attemptId': att, 'index': int(row[0])}
  if row[1] == 'spell': body['text'] = row[3]
  else: body['choice'] = int(row[2])
  time.sleep(1.35)
  return call('POST', '/raid/answer', tok, body)

async def page(b, w, h, tok, clear=False):
  ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 600, has_touch=w < 600)
  pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
  await ctx.add_init_script(f"localStorage.setItem('wq_token','{tok}');localStorage.setItem('eq_pwa',JSON.stringify({{snoozeUntil:Date.now()+9e8}}));localStorage.setItem('eq_raid_auto','off')")
  return ctx, pg, errs

async def open_raid(pg):
  await pg.goto(URL); await pg.wait_for_timeout(3000)
  await pg.evaluate("()=>document.querySelectorAll('.modal-overlay').forEach(m=>m.remove())")
  await pg.evaluate("()=>EQApp.navigateTo('raid')"); await pg.wait_for_timeout(4500)

VIC = "()=>{const v=document.getElementById('rd-victory');return v?{shown:!v.hidden,claim:!!v.querySelector('[data-rd=claimtab]'),close:!!v.querySelector('[data-rd=\"victory-close\"]'),text:v.textContent.replace(/\\s+/g,' ').trim()}:null}"

async def run(b, w, h):
  tag = f'[{w}]'
  na, admin = user('va'); sql(f"UPDATE users SET role = 'admin' WHERE username = '{na}'")
  nA, ta = user('vA'); _, tb = user('vB')
  bs = wait_active(admin)
  # A ตอบถูกครบเกณฑ์ (ยังไม่ล้มบอส)
  st, r = call('POST', '/raid/round', ta); ok(st == 200, f'{tag} A เริ่มรอบ ({st})'); att = r['attemptId']
  need = int(sql("SELECT COALESCE((data->>'minCorrectForReward')::int, 5) FROM raid_settings WHERE id = 1") or 5)
  for _ in range(need): answer_right(ta, att)
  # เปิดหน้า Raid ของ A และ B ไว้ระหว่างบอสล้ม
  ca, pa, ea = await page(b, w, h, ta); cb, pb, eb = await page(b, w, h, tb)
  await open_raid(pa); await open_raid(pb)
  ok((await pa.evaluate(VIC))['shown'] is False, f'{tag} ก่อนบอสล้ม: ไม่มีป๊อปอัป Victory')
  st, x = call('POST', '/admin/raid/boss', admin, {'action': 'set_hp', 'value': 1, 'reason': 'E2E ทดสอบป๊อปอัป Victory (ฐานข้อมูล dev)'})
  ok(st == 200, f'{tag} ผู้ดูแลลด HP บอสเหลือ 1 (ต้องใส่เหตุผล · Audit Log) ({st})')
  x = answer_right(ta, att)
  ok(x and x[1].get('correct'), f'{tag} A ตีจนบอสล้มด้วยคำตอบจริง')
  for pg_ in (pa, pb):
    try: await pg_.wait_for_function("()=>{const v=document.getElementById('rd-victory');return v&&!v.hidden}", timeout=20000)
    except Exception: pass
  await pa.wait_for_timeout(800)
  va = await pa.evaluate(VIC); vb = await pb.evaluate(VIC)
  ok(va['shown'] and va['claim'], f'{tag} บอสล้มสด ๆ: A (ผู้ร่วมสู้) เห็น Victory + ปุ่มรับรางวัล ({va["text"][:70]})')
  ok(vb['shown'] and not vb['claim'] and vb['close'], f'{tag} บอสล้มสด ๆ: B (ไม่ได้สู้) เห็นประกาศชัยชนะ ไม่มีปุ่มรับรางวัล ({vb["text"][:80]})')
  await pa.screenshot(path=f'{OUT}/victory_A_{w}.png'); await pb.screenshot(path=f'{OUT}/victory_B_{w}.png')
  # A เปิดหน้าใหม่ (ยังไม่กดปิด ยังไม่รับ) → เห็นปุ่มรับรางวัล
  await open_raid(pa); va = await pa.evaluate(VIC)
  ok(va['shown'] and va['claim'], f'{tag} A เปิดหน้าใหม่ ยังไม่รับ → เห็นปุ่มรับรางวัล')
  # B เปิดหน้าใหม่ → ไม่เด้ง
  await open_raid(pb); vb = await pb.evaluate(VIC)
  ok(not vb['shown'], f'{tag} B เปิดหน้าใหม่ (ไม่มีรางวัลให้รับ) → ไม่เด้ง')
  # A กดปิด → เปิดหน้าใหม่ไม่เด้งซ้ำ
  await pa.evaluate("()=>document.querySelector('[data-rd=\"victory-close\"]').click()"); await pa.wait_for_timeout(300)
  await open_raid(pa); va = await pa.evaluate(VIC)
  ok(not va['shown'], f'{tag} A กดปิดแล้ว เปิดหน้าใหม่ → ไม่เด้งซ้ำ')
  # A รับรางวัลจริงในแท็บรางวัล แล้วล้างค่าจำในเครื่อง → เปิดใหม่ก็ไม่เด้ง เพราะรับแล้ว
  await pa.locator('[data-rd-tab="rewards"]').click()
  try: await pa.wait_for_selector(f'[data-rd-claim="{bs["id"]}"], [data-rd-claim]', timeout=10000)
  except Exception: pass
  btn = pa.locator(f'[data-rd-claim="{bs["id"]}"]')
  if await btn.count() == 0: btn = pa.locator('[data-rd-claim]').first
  await btn.click(); await pa.wait_for_timeout(2500)
  claimed = sql(f"SELECT COUNT(*) FROM raid_reward_claims WHERE instance_id = {bs['id']} AND user_id = (SELECT id FROM users WHERE username = '{nA}')")
  ok(claimed not in ('', '0'), f'{tag} A รับรางวัลสำเร็จ (บันทึกการรับ {claimed} รายการ)')
  await pa.evaluate("()=>localStorage.removeItem('eq_raid_victory_seen')")
  await open_raid(pa); va = await pa.evaluate(VIC)
  ok(not va['shown'], f'{tag} A รับรางวัลแล้ว (ล้างค่าจำในเครื่องด้วย) เปิดหน้าใหม่ → ไม่เด้ง "รับรางวัล" อีก')
  ok(await pa.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1"), f'{tag} ไม่ล้นแนวนอน')
  # v1.27.1 บอสเลเวลถัดไป = คนละตัว + เก่งขึ้น
  nb = wait_active(admin)
  fam_next = sql(f"SELECT family || '|' || defense || '|' || max_hp FROM raid_boss_instances WHERE id = {nb['id']}").split('|')
  ok(nb['level'] == bs['level'] + 1 and nb['family'] != bs['family'], f"{tag} บอสถัดไป Lv{nb['level']} เป็นคนละตัว ({bs['family']} → {nb['family']})")
  ok(float(fam_next[1]) >= 0.02 * (nb['level'] - 1) - 1e-9 or float(fam_next[1]) >= 0.35 - 1e-9, f"{tag} เกราะบอสตามเลเวล ({fam_next[1]})")
  ok(not ea and not eb, f'{tag} ไม่มี JavaScript error {(ea + eb)[:2]}')
  await ca.close(); await cb.close()

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for w, h in SIZES: await run(b, w, h)
    await b.close()
  print('\nFAILS', len(FAILS))
  for f in FAILS: print(' -', f)
asyncio.run(main())
