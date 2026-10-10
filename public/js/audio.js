/*
  EnglishQuest Audio — ระบบเสียงกลาง (ทุกหน้าเรียกผ่าน window.EQAudio เท่านั้น ห้าม component เปิดเพลงเอง)

  ลิขสิทธิ์: เพลงและเสียงทั้งหมดในไฟล์นี้ "แต่งขึ้นใหม่และสังเคราะห์สด" ด้วย Web Audio API (ไม่มีไฟล์เสียงของผู้อื่น)
    รายละเอียด track_name / source / license / author อยู่ที่ /assets/audio/manifest.json
    เพลงที่จ้างทำ/ซื้อ License ภายหลัง: ใส่ path ใน "file" ของ manifest -> ระบบโหลดไฟล์นั้นแทนเพลงสังเคราะห์ (lazy load + loop ไร้รอยต่อ)

  กติกา:
    - เริ่มเสียงหลังผู้ใช้แตะ/กดครั้งแรกเท่านั้น (Autoplay Policy) · ค่าเริ่มต้นไม่ดัง (Master 70 · Music 55 · SFX 80)
    - เปลี่ยนเพลงแบบ crossfade · เพลงวนแบบไร้รอยต่อ (ตัวจัดตารางโน้ตล่วงหน้าตามนาฬิกาเสียง)
    - ออกจากแท็บ / ล็อกจอ -> ค่อย ๆ เบาแล้วพัก · กลับมาเล่นต่อจากจุดเดิม (ไม่เริ่มเพลงใหม่)
    - เสียงไม่จำเป็นต่อการเล่น: ทุกเหตุการณ์มีภาพ/ข้อความบอกอยู่แล้ว · ปิดเสียงทั้งหมดได้
    - HP วิกฤต: เพิ่ม layer เบา ๆ (ไม่มี alarm ต่อเนื่อง / ไม่มีเสียงหัวใจ) · ตอบผิด = เสียงกลาง ๆ ไม่ใช่เสียงล้มเหลวรุนแรง
*/
(() => {
  'use strict';
  const LS_KEY = 'eq_audio';
  const DEFAULTS = { master: 70, music: 55, sfx: 80, muted: false, appMusic: true };
  // หน้าที่กำลังเรียน/ทำแบบฝึก -> เพลงเบากว่า (ไม่มีกลอง) · หน้าอื่นในแอป -> เพลงหลักของแอป (คนละชุดกับ Ranked)
  const STUDY_SCREENS = new Set(['screen-game', 'screen-grammar-lesson', 'screen-grammar-quiz', 'screen-placement', 'screen-assessment']);
  const FADE = 0.9;          // วินาที (crossfade 500–1500ms)
  const LOOKAHEAD = 0.18;    // จัดตารางโน้ตล่วงหน้า (วินาที)

  let settings = { ...DEFAULTS };
  try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; } catch (_) { /* ใช้ค่าเริ่มต้น */ }

  let ctx = null; let out = null; let musicBus = null; let sfxBus = null; let noiseBuf = null;
  let unlocked = false;
  let wanted = null;          // เพลงที่ควรเล่น { id, opts } (จำไว้ถ้ายังไม่ได้แตะหน้าจอ)
  let current = null;         // track ที่กำลังเล่น
  let critical = false;
  let schedTimer = null;
  let ducked = false;         // หรี่เพลงระหว่างเสียงอ่านคำศัพท์ (TTS) ให้ได้ยินชัด
  let manifest = null;
  const buffers = new Map();

  /* ---------------- เครื่องยนต์เสียง ---------------- */
  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();       // กันเสียงพีค
    comp.threshold.value = -16; comp.ratio.value = 4;
    out = ctx.createGain(); musicBus = ctx.createGain(); sfxBus = ctx.createGain();
    musicBus.connect(out); sfxBus.connect(out); out.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    applyVolumes(true);
    return ctx;
  }
  function applyVolumes(instant = false) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (g, v) => { g.gain.cancelScheduledValues(t); if (instant) g.gain.setValueAtTime(v, t); else g.gain.setTargetAtTime(v, t, 0.06); };
    set(out, settings.muted || document.hidden ? 0 : (settings.master / 100) * 0.9);
    set(musicBus, (settings.music / 100) * 0.8 * (ducked ? 0.18 : 1));
    set(sfxBus, (settings.sfx / 100) * 0.8);
  }
  /*
    เริ่มเพลงให้เร็วที่สุดเท่าที่เบราว์เซอร์ยอม:
      1) เปิดแอปปุ๊บลองเริ่มเลย — ได้ทันทีถ้าเบราว์เซอร์อนุญาต (เช่น เคยกดเล่นในเว็บนี้บ่อย/แอปที่ติดตั้งบางเครื่อง)
      2) ไม่ได้ -> เริ่มทันทีที่ "แตะครั้งแรก" ที่ไหนก็ได้ในแอป (มือถือนับเฉพาะตอนยกนิ้ว: touchend / pointerup / click
         — pointerdown จากนิ้วไม่นับเป็นการอนุญาตใน Chrome มือถือ เดิมจึงต้องแตะสองครั้ง)
      3) ฟังทุกการแตะไว้ตลอด: กลับมาจากพื้นหลังแล้วระบบพักเสียง (iOS "interrupted") แตะครั้งเดียวก็เล่นต่อ
  */
  function onRunning() {
    if (unlocked || !ctx || ctx.state !== 'running') return;
    unlocked = true;
    if (wanted) startMusic(wanted.id, wanted.opts);
  }
  function unlock() {
    if (!ensureCtx()) return;
    if (!ctx.onstatechange) ctx.onstatechange = onRunning;
    if (ctx.state === 'running') { onRunning(); return; }
    if (document.hidden) return;
    ctx.resume().then(onRunning).catch(() => {});
  }
  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  // (1) ลองเริ่มตั้งแต่เปิดแอป — ถ้าเบราว์เซอร์ยังไม่ยอม AudioContext จะรออยู่เฉย ๆ ไม่มี error ให้ผู้ใช้เห็น
  function tryAutoStart() { if (!unlocked && settings.appMusic && !settings.muted) unlock(); }

  /* ---------------- เครื่องดนตรีสังเคราะห์ (ต้นฉบับทั้งหมด) ---------------- */
  const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
  function env(g, t, a, peak, d, sustain = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
  }
  function osc(type, freq, t, dur, dest, { gain = 0.2, a = 0.005, d = dur, cutoff = 0, detune = 0 } = {}) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (detune) o.detune.value = detune;
    let node = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); node = f; }
    node.connect(g); g.connect(dest);
    env(g, t, a, gain, d);
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  function noise(t, dur, dest, { gain = 0.1, type = 'highpass', freq = 6000, q = 0.7 } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    s.connect(f); f.connect(g); g.connect(dest);
    env(g, t, 0.002, gain, dur);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const I = {
    pad(dest, notes, t, dur, gain = 0.05, cutoff = 1400) {
      notes.forEach((n, i) => {
        [-6, 6].forEach((det) => {
          const o = ctx.createOscillator(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
          o.type = i === 0 ? 'triangle' : 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
          f.type = 'lowpass'; f.frequency.value = cutoff;
          o.connect(f); f.connect(g); g.connect(dest);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(gain / notes.length, t + Math.min(0.6, dur * 0.3));
          g.gain.setValueAtTime(gain / notes.length, t + dur * 0.75);
          g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);   // ซ้อนกับคอร์ดถัดไปเล็กน้อย = ต่อเนื่องไร้รอยต่อ
          o.start(t); o.stop(t + dur + 0.3);
        });
      });
    },
    pluck(dest, n, t, gain = 0.07, cutoff = 2600) { osc('triangle', mtof(n), t, 0.32, dest, { gain, a: 0.004, cutoff }); },
    bell(dest, n, t, gain = 0.05) {
      osc('sine', mtof(n), t, 1.2, dest, { gain, a: 0.003 });
      osc('sine', mtof(n) * 2.76, t, 0.5, dest, { gain: gain * 0.35, a: 0.002 });
    },
    bass(dest, n, t, dur, gain = 0.12) {
      osc('sine', mtof(n), t, dur, dest, { gain, a: 0.01, d: dur });
      osc('triangle', mtof(n), t, dur * 0.6, dest, { gain: gain * 0.35, a: 0.01, cutoff: 600 });
    },
    kick(dest, t, gain = 0.32) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      o.connect(g); g.connect(dest); env(g, t, 0.002, gain, 0.22); o.start(t); o.stop(t + 0.3);
    },
    snare(dest, t, gain = 0.08) { noise(t, 0.12, dest, { gain, type: 'bandpass', freq: 1900, q: 0.8 }); },
    hat(dest, t, gain = 0.025) { noise(t, 0.03, dest, { gain, type: 'highpass', freq: 7500 }); },
    /** เสียงไม้เคาะเล็ก ๆ (ติ๊ก-ต๊อก แบบนาฬิกาในบ้านผี) */
    block(dest, t, gain = 0.03, hi = false) { osc('sine', hi ? 1900 : 1450, t, 0.035, dest, { gain, a: 0.001 }); },
    /** "ธีรามิน" — เสียงไซน์ไหลระหว่างสองโน้ต + สั่นเบา ๆ (บรรยากาศลึกลับแบบการ์ตูน ไม่น่ากลัว) */
    theremin(dest, n1, n2, t, dur, gain = 0.018) {
      const o = ctx.createOscillator(); const g = ctx.createGain(); const lfo = ctx.createOscillator(); const lg = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(mtof(n1), t); o.frequency.exponentialRampToValueAtTime(mtof(n2), t + dur * 0.8);
      lfo.frequency.value = 5.2; lg.gain.value = 7; lfo.connect(lg); lg.connect(o.detune);
      o.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.25);
      g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    },
    tom(dest, n, t, gain = 0.14) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(mtof(n) * 1.4, t); o.frequency.exponentialRampToValueAtTime(mtof(n), t + 0.12);
      o.connect(g); g.connect(dest); env(g, t, 0.003, gain, 0.35); o.start(t); o.stop(t + 0.45);
    },
  };

  /* ---------------- เพลง (pattern 4 ห้อง วนไร้รอยต่อ) ----------------
     chords: โน้ต MIDI ของคอร์ดต่อห้อง · arp: ลำดับ index ในคอร์ด (16 ส่วนต่อห้อง, null = เว้น) · drums: รูปแบบกลองต่อห้อง */
  const C = (root, kind) => {
    const q = { maj: [0, 4, 7, 11], min: [0, 3, 7, 10], sus: [0, 5, 7, 14], add9: [0, 4, 7, 14], m9: [0, 3, 7, 14], lyd: [0, 4, 6, 11],
      dom7: [0, 4, 7, 10], mtri: [0, 3, 7, 12] }[kind];
    return q.map((x) => root + x);
  };
  const THEMES = {
    lobby: { bpm: 84, chords: [C(60, 'add9'), C(57, 'm9'), C(53, 'maj'), C(55, 'sus')], arp: [0, null, 2, null, 1, null, 3, null, 2, null, 1, null, 3, null, 2, null],
      arpOct: 12, arpGain: 0.05, pad: 0.05, bass: 'whole', drums: { hat: [4, 12], kick: [], snare: [] }, bell: [0, 10] },
    matchmaking: { bpm: 96, chords: [C(57, 'sus'), C(57, 'min'), C(53, 'lyd'), C(55, 'sus')], arp: [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2],
      arpOct: 12, arpGain: 0.035, pad: 0.04, bass: 'eighths', drums: { hat: [0, 2, 4, 6, 8, 10, 12, 14], kick: [0, 8], snare: [] } },
    battle_beginner: { bpm: 112, chords: [C(60, 'maj'), C(55, 'sus'), C(57, 'min'), C(53, 'add9')], arp: [0, 1, 2, 3, 2, 1, 0, null, 0, 1, 2, 3, 2, 1, 2, null],
      arpOct: 12, arpGain: 0.045, pad: 0.035, bass: 'pulse', drums: { hat: [2, 6, 10, 14], kick: [0, 8], snare: [4, 12] } },
    battle_competitive: { bpm: 120, chords: [C(57, 'm9'), C(53, 'maj'), C(55, 'sus'), C(52, 'min')], arp: [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 2, 1, 3, 2, 1],
      arpOct: 12, arpGain: 0.042, pad: 0.035, bass: 'pulse', drums: { hat: [0, 2, 4, 6, 8, 10, 12, 14], kick: [0, 7, 8], snare: [4, 12] } },
    battle_elite: { bpm: 126, chords: [C(50, 'min'), C(46, 'maj'), C(48, 'sus'), C(45, 'min')], arp: [0, 3, 2, 3, 1, 3, 2, 3, 0, 3, 2, 3, 1, 2, 3, 2],
      arpOct: 24, arpGain: 0.04, pad: 0.04, bass: 'drive', drums: { hat: [0, 2, 4, 6, 8, 10, 12, 14], kick: [0, 6, 8, 11], snare: [4, 12] } },
    promotion_trial: { bpm: 104, chords: [C(50, 'sus'), C(46, 'maj'), C(53, 'maj'), C(48, 'sus')], arp: [0, null, null, 2, null, null, 3, null, 0, null, null, 2, null, 3, null, null],
      arpOct: 24, arpGain: 0.05, pad: 0.05, bass: 'whole', drums: { hat: [4, 12], kick: [0, 10], snare: [], tom: [12, 14] }, bell: [0] },
    apex: { bpm: 100, chords: [C(53, 'lyd'), C(55, 'add9'), C(57, 'm9'), C(60, 'maj')], arp: [0, null, 2, 3, null, 2, 1, null, 0, null, 2, 3, null, 1, 3, null],
      arpOct: 24, arpGain: 0.045, pad: 0.055, bass: 'whole', drums: { hat: [2, 6, 10, 14], kick: [0, 8], snare: [], tom: [14] }, bell: [0, 6] },
  };
  /* เพลงในแอป (นอก Ranked) — โทนอบอุ่น สบาย ๆ ช่วยโฟกัส ไม่ใช่เพลงแข่งขัน
     mel: ทำนอง 64 ช่อง (index ช่อง -> โน้ต MIDI) แต่งขึ้นใหม่ทั้งหมด */
  const mel = (pairs) => { const a = Array(64).fill(null); pairs.forEach(([i, n]) => { a[i] = n; }); return a; };
  Object.assign(THEMES, {
    // "Morning Notebook" — หน้าหลัก / เมนู / ผลลัพธ์
    app_home: { bpm: 78, app: true, chords: [C(53, 'maj'), C(52, 'min'), C(50, 'm9'), C(48, 'add9')],
      arp: [0, null, null, 2, null, null, 1, null, null, 3, null, null, 2, null, null, null], arpOct: 12, arpGain: 0.03, pad: 0.04, bass: 'whole',
      drums: { hat: [2, 6, 10, 14], kick: [0], snare: [] }, softDrums: true,
      mel: mel([[0, 76], [6, 79], [8, 77], [12, 76], [20, 74], [24, 72], [28, 74], [32, 76], [36, 74], [38, 72], [44, 69], [48, 72], [54, 74], [56, 72]]) },
    // "Quiet Study" — ระหว่างทำแบบฝึก / บทเรียน (ไม่มีกลอง ทำนองห่าง ๆ)
    app_study: { bpm: 66, app: true, chords: [C(57, 'm9'), C(53, 'maj'), C(48, 'add9'), C(55, 'sus')],
      arp: [0, null, null, null, 2, null, null, null, 1, null, null, null, 3, null, null, null], arpOct: 12, arpGain: 0.022, pad: 0.045, bass: 'whole',
      drums: { hat: [], kick: [], snare: [] },
      mel: mel([[0, 81], [8, 79], [24, 76], [40, 77], [48, 76], [56, 74]]) },
  });

  /* เพลงฮาโลวีน (แต่งขึ้นใหม่ทั้งหมด) — ดีไมเนอร์ ลึกลับแบบน่ารัก: กล่องดนตรี + เบสดีดแบบ "อุ้ม-ปา" + ไม้เคาะติ๊กต๊อก + ธีรามินไหลเบา ๆ
     ใช้ที่หน้ากิจกรรม Halloween และทั่วแอปเมื่อเปิดธีม Halloween (หน้าทำแบบฝึกใช้เวอร์ชันเงียบ ไม่มีจังหวะ) */
  Object.assign(THEMES, {
    // "Pumpkin Lantern Parade" — หน้ากิจกรรม / หน้าหลักในธีม Halloween
    halloween_night: { bpm: 96, app: true, chords: [C(50, 'mtri'), C(46, 'maj'), C(43, 'min'), C(45, 'dom7')],
      arp: [0, null, 2, null, null, 1, null, 3, 0, null, 2, null, null, 3, 1, null], arpOct: 24, arpGain: 0.03, pad: 0.045, padCutoff: 1100, bass: 'pizz',
      drums: { hat: [], kick: [], snare: [], block: [4, 12], blockHi: [14] }, softDrums: true,
      mel: mel([[0, 74], [3, 77], [6, 81], [8, 82], [10, 81], [12, 77], [14, 76],
        [16, 77], [18, 74], [20, 70], [24, 74], [28, 77],
        [32, 79], [35, 82], [38, 79], [40, 77], [44, 74], [46, 77],
        [48, 76], [50, 73], [52, 76], [54, 79], [56, 81], [60, 73]]),
      melGain: 0.045, glide: { bar: 3, pos: 0, from: 81, to: 76, beats: 3 } },
    // "Moonlit Study" — ระหว่างทำแบบฝึกในธีม Halloween (ไม่มีจังหวะ โน้ตห่าง ๆ ไม่รบกวนสมาธิ)
    halloween_study: { bpm: 68, app: true, chords: [C(50, 'm9'), C(46, 'maj'), C(43, 'm9'), C(45, 'sus')],
      arp: [0, null, null, null, 2, null, null, null, 3, null, null, null, 1, null, null, null], arpOct: 24, arpGain: 0.022, pad: 0.05, padCutoff: 1200, bass: 'whole',
      drums: { hat: [], kick: [], snare: [] },
      mel: mel([[0, 81], [12, 77], [24, 74], [40, 76], [52, 73]]), melGain: 0.03 },
  });

  const TIER_OF_LEAGUE = {
    'trail-finch': 'beginner', 'swift-hare': 'beginner', 'river-otter': 'beginner',
    'crest-lynx': 'competitive', 'moon-wolf': 'competitive',
    'shadow-panther': 'elite', 'storm-falcon': 'elite', 'crown-eagle': 'elite', 'aurora-lion': 'apex',
  };

  function makeTrack(id) {
    const th = THEMES[id];
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(musicBus);
    const base = ctx.createGain(); base.connect(g);
    const crit = ctx.createGain(); crit.gain.value = critical ? 1 : 0.0001; crit.connect(g);
    const tr = { id, th, g, base, crit, step: 0, next: ctx.currentTime + 0.08, stopped: false, file: null };
    const entry = manifest && manifest.tracks && manifest.tracks.find((x) => x.id === id);
    if (entry && entry.file) loadFileTrack(tr, entry);   // เพลงที่มี License — ใช้ไฟล์แทนเพลงสังเคราะห์
    return tr;
  }
  async function loadFileTrack(tr, entry) {
    try {
      let buf = buffers.get(entry.file);
      if (!buf) {
        const res = await fetch(entry.file);
        buf = await ctx.decodeAudioData(await res.arrayBuffer());
        buffers.set(entry.file, buf);
      }
      if (tr.stopped) return;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      if (entry.loopStart) src.loopStart = entry.loopStart;
      if (entry.loopEnd) src.loopEnd = entry.loopEnd;
      src.connect(tr.base); src.start();
      tr.file = src;
    } catch (_) { /* โหลดไม่ได้ -> ใช้เพลงสังเคราะห์ต่อ */ }
  }
  /** จัดตารางโน้ตหนึ่งช่อง (1/16 ห้อง) */
  function renderStep(tr, t) {
    if (tr.file) return;
    const { th } = tr;
    const s = tr.step % 64; const bar = Math.floor(s / 16); const pos = s % 16;
    const chord = th.chords[bar];
    const beat = 60 / th.bpm;
    if (pos === 0) {
      I.pad(tr.base, chord, t, beat * 4, th.pad, critical ? 900 : (th.padCutoff || 1400));
      if (th.bass === 'whole') I.bass(tr.base, chord[0] - 24, t, beat * 3.6);
      (th.bell || []).forEach((b) => { if (b === bar * 4) I.bell(tr.base, chord[2] + 24, t, 0.03); });
    }
    if (th.bass === 'eighths' && pos % 2 === 0) I.bass(tr.base, chord[0] - 24, t, beat * 0.45, 0.08);
    if (th.bass === 'pulse' && pos % 4 === 0) I.bass(tr.base, chord[0] - 24 + (pos === 12 ? 7 : 0), t, beat * 0.8, 0.1);
    // เบสดีดแบบ "อุ้ม-ปา": รากคอร์ดจังหวะ 1 · ควินต์จังหวะ 3 (สั้น ๆ เด้ง ๆ)
    if (th.bass === 'pizz' && (pos === 0 || pos === 8)) I.pluck(tr.base, chord[0] - 12 + (pos === 8 ? 7 : 0), t, 0.09, 700);
    if (th.bass === 'drive' && pos % 2 === 0) I.bass(tr.base, chord[0] - 12 - (pos % 8 === 6 ? 2 : 0), t, beat * 0.4, 0.09);
    const a = th.arp[pos];
    if (a !== null && a !== undefined) I.pluck(tr.base, chord[a % chord.length] + th.arpOct, t, th.arpGain);
    if (th.drums.kick.includes(pos)) I.kick(tr.base, t, th.softDrums ? 0.1 : 0.22);
    if (th.drums.snare.includes(pos)) I.snare(tr.base, t);
    if (th.drums.hat.includes(pos)) I.hat(tr.base, t, th.softDrums ? 0.012 : 0.025);
    if (th.drums.tom && th.drums.tom.includes(pos) && bar === 3) I.tom(tr.base, chord[0] - 12, t);
    if (th.drums.block && th.drums.block.includes(pos)) I.block(tr.base, t, 0.028);
    if (th.drums.blockHi && th.drums.blockHi.includes(pos) && bar % 2 === 1) I.block(tr.base, t, 0.02, true);
    if (th.mel && th.mel[s] !== null) I.bell(tr.base, th.mel[s], t, th.melGain || 0.028);
    if (th.glide && bar === th.glide.bar && pos === th.glide.pos && tr.step % 128 >= 64) I.theremin(tr.base, th.glide.from, th.glide.to, t, beat * th.glide.beats);   // ทุก 2 รอบ
    if (th.app) return;                                    // เพลงในแอปไม่มี Critical layer
    // Critical layer: กลองทอมเบา ๆ ทุกจังหวะ + โน้ตค้างโทนตึงในย่านสูงแบบกรองเสียง (ไม่ใช่ alarm / ไม่ใช่เสียงหัวใจ)
    if (pos % 4 === 0) I.tom(tr.crit, chord[0] - 12, t, 0.07);
    if (pos === 0) osc('sawtooth', mtof(chord[1] + 12), t, beat * 3.8, tr.crit, { gain: 0.012, a: 0.4, cutoff: 1100 });
  }
  function tick() {
    if (!ctx) return;
    const tracks = [current, ...fading].filter(Boolean);
    for (const tr of tracks) {
      if (tr.stopped) continue;
      const stepDur = 60 / tr.th.bpm / 4;
      while (tr.next < ctx.currentTime + LOOKAHEAD) {
        if (tr.next > ctx.currentTime - 0.05) renderStep(tr, tr.next);   // ข้ามโน้ตที่เลยเวลา (หลังกลับมาจากเบื้องหลัง) — ไม่เล่นรัว
        tr.next += stepDur; tr.step += 1;
      }
    }
  }
  let fading = [];
  function fadeOut(tr) {
    if (!tr) return;
    const t = ctx.currentTime;
    tr.g.gain.cancelScheduledValues(t);
    tr.g.gain.setValueAtTime(Math.max(0.0001, tr.g.gain.value), t);
    tr.g.gain.linearRampToValueAtTime(0.0001, t + FADE);
    fading.push(tr);
    setTimeout(() => {
      tr.stopped = true;
      if (tr.file) try { tr.file.stop(); } catch (_) { /* หยุดไปแล้ว */ }
      tr.g.disconnect();
      fading = fading.filter((x) => x !== tr);
    }, FADE * 1000 + 300);
  }
  function startMusic(id, _opts) {
    if (!unlocked || !ensureCtx()) return;
    if (current && current.id === id) return;              // เพลงเดิม -> ไม่เริ่มใหม่
    fadeOut(current); current = null;
    if (!id || !THEMES[id]) return;
    current = makeTrack(id);
    const t = ctx.currentTime;
    current.g.gain.setValueAtTime(0.0001, t);
    current.g.gain.linearRampToValueAtTime(1, t + FADE);
    if (!schedTimer) schedTimer = setInterval(tick, 50);
    tick();
    firstMusicHint();
  }
  /** หมวดเพลง -> track: battle เลือกตามกลุ่ม League (Beginner / Competitive / Elite / Apex) */
  function resolve(cat, opts = {}) {
    if (!cat) return null;
    if (cat === 'battle') {
      const tier = TIER_OF_LEAGUE[opts.league] || 'beginner';
      return tier === 'apex' ? 'apex' : `battle_${tier}`;
    }
    return THEMES[cat] ? cat : null;
  }
  function music(cat, opts) {
    const id = resolve(cat, opts);
    wanted = id ? { id, opts } : null;
    startMusic(id, opts);
  }
  function setCritical(on) {
    if (critical === Boolean(on)) return;
    critical = Boolean(on);
    if (!ctx || !current) return;
    const t = ctx.currentTime;
    current.crit.gain.cancelScheduledValues(t);
    current.crit.gain.setTargetAtTime(critical ? 1 : 0.0001, t, 0.35);
    current.base.gain.cancelScheduledValues(t);
    current.base.gain.setTargetAtTime(critical ? 0.75 : 1, t, 0.35);   // ลด ambient เล็กน้อย
  }

  /* ---------------- Cue สั้น ๆ (จบเกม) ---------------- */
  function cue(name) {
    wanted = null;
    if (!unlocked || !ensureCtx()) return;
    fadeOut(current); current = null; setCritical(false);
    const t = ctx.currentTime + 0.5;
    const g = ctx.createGain(); g.gain.value = 1; g.connect(musicBus);
    const seq = {
      victory: [[72, 0], [76, 0.14], [79, 0.28], [84, 0.46]],
      defeat: [[67, 0], [64, 0.2], [65, 0.4], [60, 0.62]],          // ลงแล้วจบที่คอร์ดเมเจอร์ — ไม่เศร้าเกินไป
      draw: [[69, 0], [72, 0.2], [71, 0.4]],
    }[name] || [];
    seq.forEach(([n, dt]) => { I.bell(g, n, t + dt, 0.06); I.pluck(g, n - 12, t + dt, 0.04); });
    const last = seq.length ? seq[seq.length - 1][1] : 0;
    const chord = name === 'victory' ? [60, 64, 67, 72] : name === 'defeat' ? [53, 57, 60, 65] : [57, 60, 64];
    I.pad(g, chord, t + last, 1.6, 0.06, 1800);
    setTimeout(() => g.disconnect(), (last + 3) * 1000);
  }

  /* ---------------- Sound effects (สั้น ไม่ดัง) ---------------- */
  const SFX = {
    click: (t) => osc('sine', 1300, t, 0.04, sfxBus, { gain: 0.05, a: 0.001 }),
    match_found: (t) => { osc('triangle', mtof(72), t, 0.18, sfxBus, { gain: 0.12 }); osc('triangle', mtof(79), t + 0.12, 0.3, sfxBus, { gain: 0.12 }); },
    countdown: (t) => osc('sine', 880, t, 0.08, sfxBus, { gain: 0.08, a: 0.002 }),
    correct: (t) => { osc('triangle', mtof(76), t, 0.12, sfxBus, { gain: 0.12 }); osc('triangle', mtof(83), t + 0.08, 0.22, sfxBus, { gain: 0.12 }); },
    // ตอบผิด = เสียงกลาง ๆ สั้น ๆ (ไม่ใช่ buzzer)
    incorrect: (t) => { osc('triangle', mtof(62), t, 0.14, sfxBus, { gain: 0.08, cutoff: 1400 }); osc('triangle', mtof(60), t + 0.1, 0.2, sfxBus, { gain: 0.07, cutoff: 1200 }); },
    damage: (t) => { noise(t, 0.09, sfxBus, { gain: 0.05, type: 'lowpass', freq: 900 }); osc('sine', 120, t, 0.12, sfxBus, { gain: 0.1 }); },
    critical: (t) => { osc('sine', mtof(57), t, 0.18, sfxBus, { gain: 0.06 }); osc('sine', mtof(57), t + 0.24, 0.18, sfxBus, { gain: 0.05 }); },
    rank_progress: (t) => [76, 79, 84].forEach((n, i) => osc('sine', mtof(n), t + i * 0.07, 0.2, sfxBus, { gain: 0.07 })),
    promotion: (t) => [67, 72, 76, 79, 84].forEach((n, i) => { osc('triangle', mtof(n), t + i * 0.09, 0.35, sfxBus, { gain: 0.08 }); }),
    badge_unlock: (t) => [88, 91, 96].forEach((n, i) => I.bell(sfxBus, n, t + 0.4 + i * 0.06, 0.04)),
  };
  function sfx(name) {
    if (!unlocked || !ensureCtx() || settings.muted || !SFX[name]) return;
    SFX[name](ctx.currentTime + 0.01);
  }

  /* ---------------- พื้นหลัง / หน้าจอ ---------------- */
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      applyVolumes();
      setTimeout(() => { if (document.hidden && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 350);
    } else {
      ctx.resume().then(() => applyVolumes()).catch(() => {});   // เล่นต่อจากจุดเดิม ไม่เริ่มเพลงใหม่
    }
  });
  /** เพลงประกอบในแอป (นอก Ranked): เปลี่ยนตามหน้าที่อยู่ · หน้า Ranked ให้ ranked.js เลือกเพลงเอง */
  let lastScreen = null;
  const halloweenSkin = () => document.documentElement.dataset.skin === 'halloween';
  function appMusicFor(id) {
    if (!settings.appMusic) return null;
    if (id === 'screen-event') return 'halloween_night';                       // หน้ากิจกรรม Halloween
    if (halloweenSkin()) return STUDY_SCREENS.has(id) ? 'halloween_study' : 'halloween_night';
    return STUDY_SCREENS.has(id) ? 'app_study' : 'app_home';
  }
  // เปลี่ยนธีม (เปิด/ปิด Halloween) ระหว่างอยู่หน้าเดิม -> เปลี่ยนเพลงในแอปตาม (ไม่ยุ่งกับเพลง Ranked)
  new MutationObserver(() => {
    if (lastScreen && !lastScreen.startsWith('screen-ranked') && (!current || THEMES[current.id].app)) music(appMusicFor(lastScreen));
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
  window.addEventListener('eq:screen', (e) => {
    const id = String(e.detail.id || '');
    lastScreen = id;
    if (id.startsWith('screen-ranked')) {
      // เข้าหน้า Ranked ย่อยโดยตรง (เช่น Leaderboard / Journey) ขณะเล่นเพลงในแอปอยู่ -> ใช้เพลง Lobby ของ Ranked
      if (!current || THEMES[current.id].app) { if (id !== 'screen-ranked-match' && id !== 'screen-ranked-result') music('lobby'); }
      return;
    }
    setCritical(false);
    music(appMusicFor(id));
    tryAutoStart();
  });

  /* ---------------- ค่าเสียง (จำในเครื่อง + บัญชี) ---------------- */
  let saveTimer = null;
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (_) { /* ไม่เป็นไร */ }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const app = window.EQApp;
      if (app && app.user) app.api('/ranked/audio-settings', { method: 'PUT', body: settings }).catch(() => {});
    }, 600);
  }
  function update(patch) {
    const before = settings.appMusic;
    settings = { ...settings, ...patch };
    applyVolumes();
    save();
    if (before !== settings.appMusic && lastScreen && !lastScreen.startsWith('screen-ranked')) music(appMusicFor(lastScreen));
    document.querySelectorAll('[data-audio-menu]').forEach((b) => {
      b.innerHTML = window.EQG.icon(settings.muted ? 'volume-x' : 'volume-2', 'icon-sm');
      b.setAttribute('aria-label', settings.muted ? 'เสียงปิดอยู่ — ตั้งค่าเสียง' : 'ตั้งค่าเสียง');
    });
    syncControls();
  }
  let serverLoaded = false;
  async function loadFromServer() {
    const app = window.EQApp;
    if (serverLoaded || !app || !app.user) return;
    serverLoaded = true;
    try {
      const r = await app.api('/ranked/audio-settings');
      if (r.settings) { settings = { ...DEFAULTS, ...r.settings }; applyVolumes(); syncControls(); try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (_) { /* - */ } }
    } catch (_) { serverLoaded = false; }
  }
  // หลังล็อกอิน (เข้าหน้าใดก็ได้) โหลดค่าจากบัญชีหนึ่งครั้ง
  window.addEventListener('eq:screen', () => { loadFromServer(); }, { once: false });

  function firstMusicHint() {
    try {
      if (localStorage.getItem('eq_audio_hint')) return;
      localStorage.setItem('eq_audio_hint', '1');
    } catch (_) { return; }
    if (window.EQApp) window.EQApp.toast('เปิดเพลงประกอบแล้ว — ปรับหรือปิดได้ที่ปุ่มลำโพงด้านบน', 'info');
  }

  /* ---------------- UI: ปุ่มลำโพง (Quick menu) + การ์ดตั้งค่าในหน้าโปรไฟล์ ---------------- */
  function controlsHtml(prefix, withMaster = true) {
    const row = (k, label, icon) => `<label class="au-row"><span class="au-label">${window.EQG.icon(icon, 'icon-sm')} ${label}</span>
      <input type="range" min="0" max="100" step="5" data-au="${k}" value="${settings[k]}" aria-label="${label}">
      <output data-au-out="${k}">${settings[k]}%</output></label>`;
    return `${withMaster ? row('master', 'Master', 'volume-2') : ''}${row('music', 'Music', 'music')}${row('sfx', 'Sound Effects', 'volume-1')}
      <label class="au-row au-mute"><span class="au-label">${window.EQG.icon('music', 'icon-sm')} เพลงในแอป (นอก Ranked)</span>
      <input type="checkbox" role="switch" data-au="appMusic" ${settings.appMusic ? 'checked' : ''} aria-label="เปิดเพลงประกอบในแอป"></label>
      <label class="au-row au-mute"><span class="au-label">${window.EQG.icon('volume-x', 'icon-sm')} Mute All</span>
      <input type="checkbox" role="switch" data-au="muted" ${settings.muted ? 'checked' : ''} aria-label="ปิดเสียงทั้งหมด"></label>
      <p class="au-note" id="${prefix}-note">เสียงเป็นส่วนเสริม — ปิดเสียงแล้วยังเล่นได้ครบ เพราะทุกผลมีข้อความและภาพบอก</p>`;
  }
  function syncControls() {
    document.querySelectorAll('[data-au]').forEach((el) => {
      const k = el.dataset.au;
      if (k === 'muted' || k === 'appMusic') el.checked = settings[k]; else el.value = settings[k];
    });
    document.querySelectorAll('[data-au-out]').forEach((el) => { el.textContent = `${settings[el.dataset.auOut]}%`; });
  }
  document.addEventListener('input', (e) => {
    const el = e.target.closest && e.target.closest('[data-au]');
    if (!el) return;
    unlock();
    const k = el.dataset.au;
    update(k === 'muted' || k === 'appMusic' ? { [k]: el.checked } : { [k]: Number(el.value) });
  });
  // ปุ่มลำโพง (ทั้งแถบบนของแอปและในเกม Ranked) -> Quick menu
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-audio-menu]');
    if (b) openQuickMenu(b);
  });
  /** หรี่เพลงชั่วคราว (เช่นระหว่างอ่านออกเสียงคำศัพท์) */
  // หรี่เพลงได้จากหลายแหล่งพร้อมกัน (TTS / เสียงคุยกับเพื่อนร่วมทีม) — เพลงกลับดังเมื่อทุกแหล่งปล่อยแล้ว
  const duckers = new Set();
  function duck(on, source = 'tts') {
    if (on) duckers.add(source); else duckers.delete(source);
    const next = duckers.size > 0;
    if (ducked === next) return;
    ducked = next; applyVolumes();
  }

  let menu = null;
  function closeQuickMenu() {
    if (!menu) return;
    menu.remove(); menu = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escClose, true);
  }
  function outside(e) { if (menu && !menu.contains(e.target) && !e.target.closest('[data-audio-menu]')) closeQuickMenu(); }
  function escClose(e) { if (e.key === 'Escape') { closeQuickMenu(); } }
  function openQuickMenu(anchor) {
    if (menu) { closeQuickMenu(); return; }
    unlock();
    menu = document.createElement('div');
    menu.className = 'au-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'ตั้งค่าเสียง');
    menu.innerHTML = `<p class="au-title">Audio</p>${controlsHtml('au-q', true)}`;
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 32);
    menu.style.width = `${w}px`;
    menu.style.top = `${Math.round(r.bottom + window.scrollY + 8)}px`;
    menu.style.left = `${Math.round(Math.max(16, Math.min(window.innerWidth - w - 16, r.right - w)) + window.scrollX)}px`;
    menu.querySelector('input').focus();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escClose, true);
  }
  /** การ์ด "เสียง" ในหน้าโปรไฟล์ (Master / Music / SFX / Mute) */
  function mountSettingsCard() {
    const host = document.getElementById('audio-settings-card');
    if (!host || host.dataset.ready) return;
    host.dataset.ready = '1';
    host.innerHTML = `<h2 class="home-card-title" id="audio-title">${window.EQG.icon('music')} เสียงและเพลง (Ranked Quest)</h2>${controlsHtml('au-p', true)}`;
  }
  window.addEventListener('eq:screen', (e) => { if (e.detail.id === 'screen-profile') mountSettingsCard(); });

  /* ---------------- manifest (ข้อมูลลิขสิทธิ์ + ไฟล์เพลงที่มี License) ---------------- */
  fetch('/assets/audio/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => { manifest = m; }).catch(() => {});

  window.EQAudio = {
    music, sfx, cue, setCritical, openQuickMenu, closeQuickMenu, unlock, duck,
    isMuted: () => settings.muted, getSettings: () => ({ ...settings }), update,
    _track: () => (current ? current.id : null),   // ชุดทดสอบ: เพลงที่กำลังเล่น
    // ตรวจระดับเสียงจริง (ใช้ในชุดทดสอบ: เพลงไม่เงียบตอนวน / ตอนเปลี่ยนเพลง)
    _level: () => {
      if (!ctx) return 0;
      if (!out._an) { out._an = ctx.createAnalyser(); out._an.fftSize = 2048; out.connect(out._an); }
      const a = new Float32Array(2048); out._an.getFloatTimeDomainData(a);
      return Math.sqrt(a.reduce((s2, x) => s2 + x * x, 0) / a.length);
    },
    _state: () => ({ unlocked, current: current && current.id, critical, ctxState: ctx && ctx.state, settings }),
  };
})();
