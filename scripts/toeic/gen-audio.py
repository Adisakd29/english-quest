"""
ListeningAudioService (ขั้น build) — สร้างไฟล์เสียง TOEIC-style ล่วงหน้าด้วย Kokoro TTS แล้วเก็บเป็น asset
  - อ่านงานจาก data/toeic/part1/audio-jobs.json (สร้างโดย build-part1.js เฉพาะเสียงที่ยังไม่มี/ข้อความเปลี่ยน)
  - หนึ่งข้อ = หนึ่งไฟล์ต่อเนื่อง: lead-in -> (A) ประโยค -> (B) ... -> (D) พร้อมช่วงเว้นแบบข้อสอบ
  - เก็บเวลาเริ่ม/จบของแต่ละตัวเลือก (segments) ไว้ใช้แสดงสถานะ A–D ระหว่างเล่น และตรวจ mapping
  - ผลลัพธ์บันทึกใน audio-manifest.json โดยใช้ contentHash เป็นกุญแจ -> ข้อความไม่เปลี่ยน = ไม่สร้างใหม่
  ใช้: KOKORO_DIR=/path/to/models python3 scripts/toeic/gen-audio.py [--check]
       (ต้องมี kokoro.onnx + voices-v1.0.bin จาก github.com/thewh1teagle/kokoro-onnx releases · pip install kokoro-onnx soundfile)
"""
import json, os, sys, subprocess, tempfile, time
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA = os.path.join(ROOT, 'data', 'toeic', 'part1')
KDIR = os.environ.get('KOKORO_DIR', '/home/claude/ttswork')
k = Kokoro(os.path.join(KDIR, 'kokoro.onnx'), os.path.join(KDIR, 'voices-v1.0.bin'))
SR = 24000
PAUSE_AFTER_LEAD = 0.9
PAUSE_AFTER_LETTER = 0.3
PAUSE_BETWEEN = 1.6     # ช่วงเว้นระหว่างตัวเลือก (ใกล้เคียงรูปแบบข้อสอบ)
TAIL = 0.6

def tts(text, voice, lang, speed):
    a, sr = k.create(text, voice=voice, speed=speed, lang=lang)
    assert sr == SR
    return a.astype(np.float32)

def silence(sec):
    return np.zeros(int(SR * sec), dtype=np.float32)

def encode_mp3(audio, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    peak = float(np.max(np.abs(audio))) or 1.0
    audio = audio * (0.89 / peak)                      # normalize ~ -1 dBFS (เสียงทุกไฟล์ดังเท่ากัน)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
        sf.write(t.name, audio, SR)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', t.name, '-ac', '1', '-ar', '24000', '-b:a', '64k',
                        '-af', 'afade=t=in:d=0.02', out], check=True)
        os.unlink(t.name)
    return os.path.getsize(out)

def build_question(job):
    v, lang, speed = job['voice'], job['lang'], job['speed']
    parts = [tts(job['leadIn'], v, lang, speed), silence(PAUSE_AFTER_LEAD)]
    t = sum(len(p) for p in parts) / SR
    segments = []
    for i, text in enumerate(job['texts']):
        letter = 'ABCD'[i]
        start = t
        clip = [tts(letter + '.', v, lang, speed), silence(PAUSE_AFTER_LETTER), tts(text, v, lang, speed)]
        dur = sum(len(c) for c in clip) / SR
        parts += clip
        t += dur
        segments.append({'letter': letter, 'start': round(start, 2), 'end': round(t, 2)})
        gap = PAUSE_BETWEEN if i < 3 else TAIL
        parts.append(silence(gap)); t += gap
    audio = np.concatenate(parts)
    return audio, segments

def main():
    jobs = json.load(open(os.path.join(DATA, 'audio-jobs.json')))
    mpath = os.path.join(DATA, 'audio-manifest.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    t0 = time.time()
    for n, job in enumerate(jobs, 1):
        h = job['contentHash']
        if h in manifest and os.path.exists(job['out']):
            continue
        audio, segments = build_question(job)
        size = encode_mp3(audio, job['out'])
        manifest[h] = {'id': job['id'], 'variant': job['variant'], 'voice': job['voice'], 'duration': round(len(audio) / SR, 2),
                       'segments': segments, 'bytes': size, 'texts': job['texts']}
        json.dump(manifest, open(mpath, 'w'), indent=1)      # บันทึกทุกข้อ (หยุดกลางทางแล้วทำต่อได้)
        print(f'[{n}/{len(jobs)}] {job["id"]} v{job["variant"]} {job["voice"]} {manifest[h]["duration"]}s · {time.time() - t0:.0f}s', flush=True)
    # เสียงทดสอบหูฟัง (Audio Check)
    chk = os.path.join(ROOT, 'public', 'assets', 'toeic', 'audio-check.mp3')
    if '--check' in sys.argv or not os.path.exists(chk):
        a = tts('This is an audio check. If you can hear this voice clearly, you are ready to begin.', 'af_heart', 'en-us', 1.0)
        encode_mp3(np.concatenate([silence(0.2), a, silence(0.4)]), chk)
        print('audio check ok')

if __name__ == '__main__':
    main()
