"""
v1.27.1 Raid Listening — ตัดเฉพาะช่วง "คำถาม" จากคลิป TOEIC Part 2 (ต้นฉบับ EnglishQuest · Kokoro TTS) เป็นไฟล์สั้นแยก
  เหตุผล: ไฟล์จบตรงท้ายคำถามเอง → ไม่มีทางได้ยินตัวเลือก A/B/C ต่อ แม้เครื่องช้า/ตัวจับเวลาของเบราว์เซอร์คลาดเคลื่อน
  ช่วงที่ตัด: start − 0.05s ถึง end + 0.25s (ไม่เกินจุดเริ่มคำตอบ A − 0.3s) · fade-out 80ms กันเสียงคลิก
  ผลลัพธ์: public/assets/raid/listen/<id>-v<v>-<hash>.mp3 + data/raid/listen.json
  python3 scripts/raid/cut_listen.py
"""
import hashlib, json, os, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANK = os.path.join(ROOT, 'data', 'toeic', 'part2', 'bank.json')
OUT = os.path.join(ROOT, 'public', 'assets', 'raid', 'listen')
MAN = os.path.join(ROOT, 'data', 'raid', 'listen.json')
os.makedirs(OUT, exist_ok=True)
bank = json.load(open(BANK, encoding='utf8'))['questions']
man = {}
keep = set()
for q in bank:
  for v in q.get('variants', []):
    a = v.get('audio') or {}
    segs = {s['letter']: s for s in a.get('segments', [])}
    if 'Q' not in segs or not a.get('url'): continue
    src = os.path.join(ROOT, 'public', a['url'].lstrip('/'))
    if not os.path.exists(src): continue
    t0 = max(0.0, segs['Q']['start'] - 0.05)
    t1 = segs['Q']['end'] + 0.25
    if 'A' in segs: t1 = min(t1, segs['A']['start'] - 0.3)
    dur = round(t1 - t0, 3)
    tmp = os.path.join(OUT, '_tmp.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t0:.3f}', '-t', f'{dur:.3f}', '-i', src,
                    '-af', f'afade=t=out:st={max(0, dur - 0.08):.3f}:d=0.08', '-ac', '1', '-ar', '24000', '-b:a', '48k', tmp], check=True)
    h = hashlib.sha1(open(tmp, 'rb').read()).hexdigest()[:10]
    name = f"{q['id']}-{h}.mp3"   # เสียงคำถามของสองเวอร์ชันมักเป็นเสียงเดียวกัน → ไฟล์เดียว
    os.replace(tmp, os.path.join(OUT, name))
    keep.add(name)
    man[f"{q['id']}:{v['v']}"] = {'url': f'/assets/raid/listen/{name}', 'duration': dur}
for f in os.listdir(OUT):
  if f.endswith('.mp3') and f not in keep: os.remove(os.path.join(OUT, f))
json.dump({'note': 'ช่วงคำถามของคลิป TOEIC Part 2 (data/toeic/part2/bank.json) · สร้างโดย scripts/raid/cut_listen.py', 'clips': man},
          open(MAN, 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(len(man), 'clips')
