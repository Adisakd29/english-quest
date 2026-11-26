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
  const DEFAULTS = { master: 70, music: 55, sfx: 80, muted: false, appMusic: true, appTrack: 'loykrathong', xmasMusic: null, xmasTrack: 'xmas_eve' };   // v1.21.0 appTrack: 'loykrathong' (เพลงเทศกาล) | 'classic'
  // v1.25.0 xmasMusic: null = ยังไม่เคยเลือก (ไม่เล่นเอง — ต้องกดเปิดเองครั้งแรก) | 'on' | 'off' · xmasTrack: เพลงคริสต์มาสที่เลือก
  const XMAS_TRACKS = [['xmas_eve', 'Christmas Eve Memories', 'เปียโน · กล่องดนตรี · เครื่องสาย · ระฆัง'], ['xmas_oldtown', 'Snowfall in the Old Town', 'แจ๊สนุ่ม · เปียโน · ดับเบิลเบส · แปรงกลอง'],
    ['xmas_wish', 'A Little Christmas Wish', 'เซเลสตา · เครื่องสาย · กระดิ่ง']];
  // หน้าที่กำลังเรียน/ทำแบบฝึก -> เพลงเบากว่า (ไม่มีกลอง) · หน้าอื่นในแอป -> เพลงหลักของแอป (คนละชุดกับ Ranked)
  const STUDY_SCREENS = new Set(['screen-game', 'screen-grammar-lesson', 'screen-grammar-quiz', 'screen-placement', 'screen-assessment',
    'screen-gl-practice', 'screen-gl-placement', 'screen-gl-writing']);
  const FADE = 0.9;          // วินาที (crossfade 500–1500ms)
  const LOOKAHEAD = 0.18;    // จัดตารางโน้ตล่วงหน้า (วินาที)

  let settings = { ...DEFAULTS };
  try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; } catch (_) { /* ใช้ค่าเริ่มต้น */ }
  /* v1.27.0 (เจ้าของสั่ง 25 พ.ย. "ให้เพลงเปิดอัตโนมัติ ไม่ต้องกดเล่นก่อน")
     - ปุ่มหยุดในเครื่องเล่นเพลงคริสต์มาส = หยุดเฉพาะครั้งนี้ (sessionStorage) · เปิดแอปใหม่ = เล่นเองอัตโนมัติ
     - ค่า "ปิดเพลงคริสต์มาส" ที่เคยบันทึกถาวรจากปุ่มหยุดรุ่นก่อน ล้างครั้งเดียว (ไม่แตะเสียงรวม/ปิดเสียงทั้งหมด) */
  const XM_RESET = 'eq_xm_auto_v127';
  function xmSessionPaused() { try { return sessionStorage.getItem('eq_xm_pause') === '1'; } catch (_) { return false; } }
  function xmSessionPause(on) { try { if (on) sessionStorage.setItem('eq_xm_pause', '1'); else sessionStorage.removeItem('eq_xm_pause'); } catch (_) { /* - */ } }
  function xmOff() { return settings.xmasMusic === 'off' || xmSessionPaused(); }
  // เลือกเพลงใหม่ตามค่าปัจจุบัน (ใช้หลังหยุด/เล่นเฉพาะครั้งนี้ ซึ่งไม่ผ่าน update())
  function xmRefresh() {
    if (!lastScreen) return;
    if (lastScreen.startsWith('screen-ranked')) { if (rankedCat) music(rankedCat.cat, rankedCat.opts); }
    else music(appMusicFor(lastScreen));
    try { renderXmasPlayer(); } catch (_) { /* ยังไม่พร้อม */ }
  }
  function xmResetOnce(saveFn) {
    try {
      if (localStorage.getItem(XM_RESET)) return;
      localStorage.setItem(XM_RESET, '1');
      if (settings.xmasMusic === 'off') { settings.xmasMusic = 'on'; if (saveFn) saveFn(); }
    } catch (_) { /* - */ }
  }
  xmResetOnce(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (_) { /* - */ } });

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
    set(musicBus, (settings.music / 100) * 0.8 * (ducked ? duckLevel() : 1));
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
    try { renderXmasPlayer(); } catch (_) { /* ยังไม่พร้อม */ }
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
    /** v1.18.0 ฉิ่ง (เปิด = ฉิ่ง เสียงกังวาน · ปิด = ฉับ สั้น) — สังเคราะห์จากไซน์ความถี่ไม่ลงตัว 2 ชั้น + เสียงซ่าเบา ๆ */
    ching(dest, t, gain = 0.016, open = true) {
      const d = open ? 0.9 : 0.07;
      osc('sine', 2637, t, d, dest, { gain, a: 0.001 });
      osc('sine', 3951 * 1.013, t, d * 0.7, dest, { gain: gain * 0.55, a: 0.001 });
      noise(t, open ? 0.05 : 0.03, dest, { gain: gain * 0.9, type: 'highpass', freq: 8000 });
    },
    /** v1.18.0 เสียงไม้ตีแบบระนาด (ดีดสั้น ใส ๆ + ฮาร์มอนิกบาง ๆ) — ใช้เล่นทำนอง */
    ranat(dest, n, t, gain = 0.05) {
      osc('triangle', mtof(n), t, 0.3, dest, { gain, a: 0.002, cutoff: 5200 });
      osc('sine', mtof(n) * 2, t, 0.16, dest, { gain: gain * 0.28, a: 0.001 });
    },
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
    /** v1.21.0 เสียงคล้ายขลุ่ย (ไซน์ + สั่นเบา ๆ หลังเริ่มโน้ต + ลมหายใจบาง ๆ) — ทำนองหลักเพลงรำวง */
    khlui(dest, n, t, dur, gain = 0.04) {
      const o = ctx.createOscillator(); const o2 = ctx.createOscillator(); const g = ctx.createGain();
      const lfo = ctx.createOscillator(); const lg = ctx.createGain(); const f = ctx.createBiquadFilter();
      o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = mtof(n); o2.frequency.value = mtof(n) * 2;
      lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + Math.min(0.25, dur * 0.6));
      lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
      f.type = 'lowpass'; f.frequency.value = 3200;
      const g2 = ctx.createGain(); g2.gain.value = 0.12;
      o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.035);
      g.gain.setValueAtTime(gain * 0.85, t + Math.max(0.05, dur * 0.7)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      [o, o2, lfo].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
      noise(t, 0.06, dest, { gain: gain * 0.25, type: 'bandpass', freq: 2400, q: 1.2 });   // ลมเป่าตอนต้นโน้ต
    },
    /** v1.21.0 กลองโทน-รำมะนา: เปิด = "ตุ๊บ" (ทุ้ม เสียงตก) · ปิด = "ป๊ะ" (ตบสั้น) */
    thon(dest, t, open = true, gain = 0.1) {
      if (open) {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.setValueAtTime(205, t); o.frequency.exponentialRampToValueAtTime(128, t + 0.16);
        o.connect(g); g.connect(dest); env(g, t, 0.002, gain, 0.3); o.start(t); o.stop(t + 0.35);
      } else {
        osc('sine', 360, t, 0.06, dest, { gain: gain * 0.5, a: 0.001 });
        noise(t, 0.05, dest, { gain: gain * 0.55, type: 'bandpass', freq: 1100, q: 0.9 });
      }
    },
    /* ---- v1.25.0 เครื่องดนตรีคริสต์มาส (สังเคราะห์สด แต่งเสียงเอง) ---- */
    /** เปียโน: ไซน์ + ฮาร์มอนิกที่ 2/3 จางเร็วกว่า · เสียงค้อนสั้น ๆ · โทนนุ่มลงตามเวลา (กรองความถี่สูง) */
    piano(dest, n, t, dur = 1.2, gain = 0.06) {
      const f = mtof(n); const g = ctx.createGain(); const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2.2), t + Math.max(0.3, dur));
      lp.connect(g); g.connect(dest);
      const d = Math.max(0.35, dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(gain * 0.35, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6);
      [[1, 'sine', 1, 0], [2, 'triangle', 0.32, 3], [3, 'sine', 0.12, -4]].forEach(([k, type, amp, det]) => {
        const o = ctx.createOscillator(); const og = ctx.createGain();
        o.type = type; o.frequency.value = f * k; o.detune.value = det; og.gain.value = amp;
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + d + 0.7);
      });
      noise(t, 0.012, dest, { gain: gain * 0.12, type: 'bandpass', freq: Math.min(6000, f * 6), q: 1.5 });   // เสียงค้อนกระทบสาย
    },
    /** กล่องดนตรี: ซี่โลหะ — ไซน์สูง + partial ไม่ลงตัว (×4.2) ดังสั้น ๆ แล้วกังวานยาว */
    musicbox(dest, n, t, gain = 0.035) {
      osc('sine', mtof(n), t, 1.4, dest, { gain, a: 0.002 });
      osc('sine', mtof(n) * 4.2, t, 0.18, dest, { gain: gain * 0.4, a: 0.001 });
      osc('triangle', mtof(n) * 2, t, 0.5, dest, { gain: gain * 0.18, a: 0.002 });
    },
    /** เซเลสตา: นุ่มกว่ากล่องดนตรี (ค้อนสักหลาดตีแผ่นโลหะ) */
    celesta(dest, n, t, gain = 0.04) {
      osc('sine', mtof(n), t, 1.0, dest, { gain, a: 0.004 });
      osc('sine', mtof(n) * 4, t, 0.25, dest, { gain: gain * 0.16, a: 0.003 });
    },
    /** เครื่องสาย: ซอว์ทูธ 2 ตัวจูนต่างกันเล็กน้อย + สั่นเบา ๆ (vibrato) ผ่านฟิลเตอร์อุ่น ๆ · เข้า-ออกช้า (ไม่ตัดกึก) */
    strings(dest, notes, t, dur, gain = 0.05, cutoff = 1700) {
      notes.forEach((nn) => {
        const f = ctx.createBiquadFilter(); const g = ctx.createGain(); const lfo = ctx.createOscillator(); const lg = ctx.createGain();
        f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.4;
        lfo.frequency.value = 4.8 + Math.random() * 0.6; lg.gain.value = 6; lfo.connect(lg);
        const per = gain / notes.length;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(per, t + Math.min(0.9, dur * 0.35));
        g.gain.setValueAtTime(per, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.45);
        f.connect(g); g.connect(dest);
        [-7, 7].forEach((det) => {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(nn); o.detune.value = det; lg.connect(o.detune);
          o.connect(f); o.start(t); o.stop(t + dur + 0.5);
        });
        lfo.start(t); lfo.stop(t + dur + 0.5);
      });
    },
    /** ระฆังโบสถ์เล็ก ๆ (กังวานยาว) */
    chime(dest, n, t, gain = 0.03) {
      osc('sine', mtof(n), t, 2.6, dest, { gain, a: 0.003 });
      osc('sine', mtof(n) * 2.76, t, 1.2, dest, { gain: gain * 0.3, a: 0.002 });
      osc('sine', mtof(n) * 5.4, t, 0.5, dest, { gain: gain * 0.12, a: 0.002 });
    },
    /** กระดิ่งเลื่อน (sleigh bell): กระดิ่งเล็กหลายลูกสั่นพร้อมกัน — เสียงสูงสั้น ๆ ซ้อนกันเบา ๆ */
    sleigh(dest, t, gain = 0.01) {
      noise(t, 0.07, dest, { gain, type: 'bandpass', freq: 8200, q: 2.2 });
      [3520, 4210, 5040].forEach((fr, i) => osc('sine', fr, t + i * 0.006, 0.12, dest, { gain: gain * 0.55, a: 0.001 }));
    },
    /** แปรงกลอง (brush): ปัด = noise ยาวนุ่ม · แตะ = สั้น */
    brush(dest, t, sweep = false, gain = 0.02) {
      noise(t, sweep ? 0.22 : 0.05, dest, { gain, type: 'bandpass', freq: sweep ? 2600 : 3800, q: 0.6 });
    },
    /** ดับเบิลเบสดีด (walking bass) */
    upright(dest, n, t, dur, gain = 0.1) {
      osc('triangle', mtof(n), t, dur, dest, { gain, a: 0.008, d: dur, cutoff: 520 });
      osc('sine', mtof(n), t, dur * 0.7, dest, { gain: gain * 0.7, a: 0.006 });
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

  /* v1.21.0 เพลงลอยกระทงแบบ "รำวง" (แต่งขึ้นใหม่ทั้งหมด — ตามคำขอให้ฟังคล้ายเพลงลอยกระทง)
     ได้กลิ่นอายเพลงรำวงวันลอยกระทง: จังหวะสนุกกลางเร็ว 112 BPM · บันไดเสียงเพนทาโทนิกไทย (โด เร มี ซอล ลา)
     · ฉิ่ง-ฉับสลับทุกจังหวะ · กลองโทน-รำมะนา "ตุ๊บ-ป๊ะ" · ทำนองเสียงขลุ่ย + ระนาดตอบท้ายวลี · เบสดีดราก-ควินต์
     ** ไม่ได้นำทำนองเพลง "รำวงวันลอยกระทง" (ยังมีลิขสิทธิ์) หรือเพลงใดมาใช้ — ทำนอง 8 ห้องแต่งใหม่ **
     ใช้ที่หน้ากิจกรรมลอยกระทง (ผจญภัย + เทศกาล) และหน้าแรกช่วงเทศกาล */
  const melN = (n, pairs) => { const a = Array(n).fill(null); pairs.forEach(([i, x]) => { a[i] = x; }); return a; };
  Object.assign(THEMES, {
    // "Krathong Ramwong" — หน้ากิจกรรมลอยกระทง / หน้าแรกช่วงเทศกาล
    loykrathong_night: { bpm: 112, app: true, len: 128,
      chords: [C(48, 'add9'), C(48, 'add9'), C(45, 'mtri'), C(43, 'sus'), C(41, 'add9'), C(48, 'add9'), C(43, 'dom7'), C(48, 'add9')],
      arp: [null, null, 0, null, null, null, 1, null, null, null, 2, null, null, null, 1, null], arpOct: 24, arpGain: 0.016, arpInst: 'ranat',
      pad: 0.022, padCutoff: 1500, bass: 'pizz',
      drums: { hat: [], kick: [], snare: [], ching: [0, 8], chap: [4, 12], thon: [0, 6, 10], pa: [4, 12] }, chingGain: 0.013, thonGain: 0.08,
      mel: melN(128, [
        [0, 79], [2, 81], [4, 84], [6, 81], [8, 79], [10, 76], [12, 79],
        [16, 81], [18, 79], [20, 76], [22, 74], [24, 72], [28, 74],
        [32, 76], [34, 79], [36, 76], [38, 74], [40, 72], [42, 69], [44, 72],
        [48, 74], [50, 76], [52, 74], [54, 72], [56, 74],
        [64, 81], [66, 84], [68, 81], [70, 79], [72, 81], [76, 79],
        [80, 76], [82, 79], [84, 76], [86, 74], [88, 76], [92, 72],
        [96, 74], [98, 76], [100, 79], [102, 76], [104, 74], [106, 72], [108, 74],
        [112, 72]]),
      melInst: 'khlui', melGain: 0.042,
      mel2: melN(128, [[58, 79], [60, 76], [62, 74], [120, 76], [122, 79], [124, 81], [126, 79]]), mel2Gain: 0.045 },
  });

  /* v1.25.0 เพลงคริสต์มาส 3 เพลง (แต่งขึ้นใหม่ทั้งหมด — ไม่ได้นำทำนองเพลงคริสต์มาสที่มีลิขสิทธิ์/เพลงดังใดมาใช้)
     อารมณ์ "คริสต์มาสในความทรงจำ": อบอุ่น คิดถึง ไม่เร่งเร้า · ความยาว 8 ห้อง วนไร้รอยต่อ (ตัวจัดตารางเดียวกับเพลงอื่น)
     แต่ละเพลงมีรอบที่ 2 ที่ต่างจากรอบแรกเล็กน้อย (กล่องดนตรี/ระฆังเล่นตอบ) — ฟังนานไม่ซ้ำซาก */
  const ch = (...n) => n;
  const XM_EVE = {   // Christmas Eve Memories — C major · 72 BPM · เปียโน + กล่องดนตรี + เครื่องสาย + ระฆัง
    lh: [ch(48, 55, 64), ch(45, 52, 60), ch(41, 48, 57), ch(43, 50, 59), ch(40, 55, 60), ch(41, 48, 57), ch(38, 45, 53), ch(43, 50, 53)],
    pad: [ch(60, 64, 67), ch(57, 60, 64), ch(57, 60, 65), ch(55, 59, 62), ch(55, 60, 64), ch(57, 60, 65), ch(57, 60, 62, 65), ch(55, 59, 62, 65)],
    mel: melN(128, [[0, 76], [6, 74], [8, 72], [12, 67], [16, 69], [24, 72], [28, 76], [32, 77], [38, 76], [40, 74], [44, 72], [48, 74],
      [64, 76], [68, 79], [72, 81], [78, 79], [80, 77], [84, 76], [88, 74], [96, 72], [100, 74], [104, 77], [108, 76], [112, 74], [120, 71], [124, 74]]),
  };
  const XM_TOWN = {  // Snowfall in the Old Town — F major · 92 BPM swing · เปียโนคอมป์ + walking bass + แปรงกลอง
    bass: [ch(43, 46, 50, 49), ch(36, 40, 43, 42), ch(41, 45, 48, 40), ch(38, 41, 45, 44), ch(43, 46, 50, 48), ch(36, 40, 43, 46), ch(41, 45, 48, 45), ch(41, 43, 45, 42)],
    comp: [ch(58, 62, 65, 69), ch(58, 62, 64, 67), ch(57, 60, 64, 67), ch(57, 60, 65, 69), ch(58, 62, 65, 69), ch(58, 62, 64, 69), ch(57, 60, 64, 67), ch(57, 60, 64, 69)],
    mel: melN(128, [[0, 72], [3, 74], [6, 77], [12, 76], [16, 74], [20, 72], [24, 70], [32, 69], [36, 72], [40, 76], [48, 74], [52, 72], [56, 69],
      [64, 70], [67, 74], [70, 77], [76, 79], [80, 77], [84, 76], [88, 74], [92, 72], [96, 76], [104, 72], [108, 69], [112, 72]]),
  };
  const XM_WISH = {  // A Little Christmas Wish — G major · 84 BPM · เซเลสตา + เครื่องสาย + กระดิ่ง
    pad: [ch(55, 59, 62), ch(52, 55, 59), ch(48, 52, 55, 60), ch(50, 54, 57), ch(47, 55, 62), ch(48, 52, 55), ch(45, 52, 55, 60), ch(50, 55, 57)],
    root: [43, 40, 36, 38, 35, 36, 33, 38],
    mel: melN(128, [[0, 74], [4, 79], [8, 78], [12, 76], [16, 74], [24, 71], [28, 74], [32, 76], [36, 74], [40, 72], [44, 76], [48, 74],
      [64, 71], [68, 74], [72, 79], [76, 81], [80, 83], [88, 81], [92, 79], [96, 76], [100, 79], [104, 78], [108, 76], [112, 74], [120, 78], [124, 81]]),
  };
  const noteLen = (mel, s, L, beat, cap = 2) => { let k = 1; while (k < 32 && (mel[(s + k) % L] === null || mel[(s + k) % L] === undefined)) k += 1; return Math.min(beat * cap, (beat / 4) * k * 0.95); };
  function renderEve(tr, s, t, beat, quiet) {
    const bar = Math.floor(s / 16); const pos = s % 16; const second = tr.step % 256 >= 128;
    const lh = XM_EVE.lh[bar];
    if (pos === 0) {
      I.strings(tr.base, XM_EVE.pad[bar], t, beat * 4, quiet ? 0.03 : 0.04, quiet ? 1200 : 1700);
      if (!quiet && (bar === 0 || bar === 4)) I.chime(tr.base, (bar === 0 ? 72 : 79), t, 0.022);
    }
    if (pos % 2 === 0) {   // มือซ้าย: กระจายคอร์ดเป็นเขบ็ตหนึ่งชั้น (ราก-ห้า-สิบ-ห้า)
      const idx = [0, 1, 2, 1][(pos / 2) % 4];
      I.piano(tr.base, lh[idx % lh.length], t, beat * 0.9, quiet ? 0.018 : 0.024);
    }
    const m = XM_EVE.mel[s];
    if (m !== null && m !== undefined) {
      I.piano(tr.base, m, t, noteLen(XM_EVE.mel, s, 128, beat), quiet ? 0.032 : 0.044);
      if (!quiet && second && bar >= 4) I.musicbox(tr.base, m + 12, t + beat * 0.02, 0.022);   // รอบสอง: กล่องดนตรีเล่นตามคู่แปดเสียงสูง
    }
    if (!quiet && !second && pos === 14 && bar % 2 === 1) I.musicbox(tr.base, XM_EVE.pad[bar][2] + 24, t, 0.02);   // ประกายเสียงท้ายห้อง
  }
  function renderTown(tr, s, t, beat) {
    const bar = Math.floor(s / 16); const pos = s % 16; const second = tr.step % 256 >= 128;
    const swing = (pos % 4 === 2) ? (beat / 4) * 0.34 : 0;   // สวิงเขบ็ตหนึ่งชั้นตัวหลัง
    if (pos % 4 === 0) I.upright(tr.base, XM_TOWN.bass[bar][pos / 4], t, beat * 0.9, 0.11);
    if (pos === 6 || pos === 12) XM_TOWN.comp[bar].forEach((n) => I.piano(tr.base, n, t + swing, beat * (pos === 6 ? 0.6 : 1.4), 0.017));
    if (pos === 4 || pos === 12) I.brush(tr.base, t, true, 0.016);
    if (pos % 4 === 2) I.brush(tr.base, t + swing, false, 0.01);
    const m = XM_TOWN.mel[s];
    if (m !== null && m !== undefined) I.piano(tr.base, m + (second && bar >= 4 ? 12 : 0), t + swing, noteLen(XM_TOWN.mel, s, 128, beat, 2.5), 0.058);
    if (pos === 0 && (bar === 0 || bar === 4)) I.chime(tr.base, 77, t, 0.014);
  }
  function renderWish(tr, s, t, beat) {
    const bar = Math.floor(s / 16); const pos = s % 16; const second = tr.step % 256 >= 128;
    if (pos === 0) {
      I.strings(tr.base, XM_WISH.pad[bar], t, beat * 4, 0.05, 1900);
      I.bass(tr.base, XM_WISH.root[bar] - 12 + 12, t, beat * 3.6, 0.07);
      if (bar === 0) I.chime(tr.base, 79, t, 0.02);
    }
    if (pos % 2 === 0) I.sleigh(tr.base, t, pos % 4 === 0 ? 0.007 : 0.0045);   // กระดิ่งเลื่อนเบา ๆ (จังหวะเดินทาง)
    if (second && pos % 4 === 2) I.celesta(tr.base, XM_WISH.pad[bar][(pos / 2) % XM_WISH.pad[bar].length] + 24, t, 0.014);
    const m = XM_WISH.mel[s];
    if (m !== null && m !== undefined) I.celesta(tr.base, m, t, 0.05);
  }
  Object.assign(THEMES, {
    xmas_eve: { bpm: 72, app: true, len: 128, chords: XM_EVE.pad, arp: [], drums: { hat: [], kick: [], snare: [] }, render: (tr, s, t, b) => renderEve(tr, s, t, b, false) },
    xmas_oldtown: { bpm: 92, app: true, len: 128, chords: XM_TOWN.comp, arp: [], drums: { hat: [], kick: [], snare: [] }, render: renderTown },
    xmas_wish: { bpm: 84, app: true, len: 128, chords: XM_WISH.pad, arp: [], drums: { hat: [], kick: [], snare: [] }, render: renderWish },
    // ระหว่างทำแบบฝึก: เวอร์ชันเงียบ (เปียโน + เครื่องสายเบา ๆ ไม่มีระฆัง/กล่องดนตรี) ช่วยโฟกัส
    xmas_study: { bpm: 64, app: true, len: 128, chords: XM_EVE.pad, arp: [], drums: { hat: [], kick: [], snare: [] }, render: (tr, s, t, b) => renderEve(tr, s, t, b, true) },
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
    const L = th.len || 64;                                   // v1.21.0 เพลงยาว 8 ห้องได้ (ค่าเดิม 4 ห้อง = 64 ช่อง)
    const s = tr.step % L; const bar = Math.floor(s / 16) % th.chords.length; const pos = s % 16;
    const chord = th.chords[bar];
    const beat = 60 / th.bpm;
    if (th.render) { th.render(tr, s, t, beat); return; }   // v1.25.0 เพลงที่มีตัวเรียบเรียงของตัวเอง (คริสต์มาส)
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
    if (a !== null && a !== undefined) {
      if (th.arpInst === 'ranat') I.ranat(tr.base, chord[a % chord.length] + th.arpOct, t, th.arpGain);
      else I.pluck(tr.base, chord[a % chord.length] + th.arpOct, t, th.arpGain);
    }
    if (th.drums.thon && th.drums.thon.includes(pos)) I.thon(tr.base, t, true, th.thonGain || 0.09);
    if (th.drums.pa && th.drums.pa.includes(pos)) I.thon(tr.base, t, false, th.thonGain || 0.09);
    if (th.mel2 && th.mel2[s] !== null && th.mel2[s] !== undefined) I.ranat(tr.base, th.mel2[s], t, th.mel2Gain || 0.04);
    if (th.drums.kick.includes(pos)) I.kick(tr.base, t, th.softDrums ? 0.1 : 0.22);
    if (th.drums.snare.includes(pos)) I.snare(tr.base, t);
    if (th.drums.hat.includes(pos)) I.hat(tr.base, t, th.softDrums ? 0.012 : 0.025);
    if (th.drums.tom && th.drums.tom.includes(pos) && bar === 3) I.tom(tr.base, chord[0] - 12, t);
    if (th.drums.block && th.drums.block.includes(pos)) I.block(tr.base, t, 0.028);
    if (th.drums.blockHi && th.drums.blockHi.includes(pos) && bar % 2 === 1) I.block(tr.base, t, 0.02, true);
    if (th.drums.ching && th.drums.ching.includes(pos)) I.ching(tr.base, t, th.chingGain || 0.016, true);
    if (th.drums.chap && th.drums.chap.includes(pos)) I.ching(tr.base, t, (th.chingGain || 0.016) * 0.8, false);
    if (th.mel && th.mel[s] !== null) {
      if (th.melInst === 'khlui') {
        // ความยาวโน้ต = ถึงโน้ตถัดไป (เล่นต่อเนื่องแบบเป่า) ไม่เกิน 2 จังหวะ
        let k = 1; while (k < 32 && (th.mel[(s + k) % L] === null || th.mel[(s + k) % L] === undefined)) k += 1;
        I.khlui(tr.base, th.mel[s], t, Math.min(beat * 2, (beat / 4) * k * 0.92), th.melGain || 0.04);
      } else if (th.melInst === 'ranat') {
        I.ranat(tr.base, th.mel[s], t, th.melGain || 0.05);
        // รัวโน้ตแบบระนาด (กรอ) ที่โน้ตยาวท้ายวลี — เบาลงทีละนิด
        if (th.kro && th.kro.includes(s)) [1, 2, 3].forEach((k) => I.ranat(tr.base, th.mel[s], t + (beat / 4) * k * 0.5, (th.melGain || 0.05) * (0.7 - k * 0.12)));
      } else I.bell(tr.base, th.mel[s], t, th.melGain || 0.028);
    }
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
  // v1.26.3 (เจ้าของสั่ง 25 พ.ย.) ช่วงคริสต์มาสเปิดเพลงคริสต์มาสทุกหน้า รวม Ranked (ล็อบบี้ · จับคู่ · ระหว่างแข่ง)
  //   ปิดเพลงคริสต์มาส / เลือก "เพลงเดิม" → Ranked กลับไปใช้เพลงเดิมของตัวเอง
  const RANKED_CATS = new Set(['lobby', 'matchmaking', 'battle', 'promotion_trial', 'apex']);
  let rankedCat = null;
  const xmasOn = () => xmasSeason() && settings.appMusic && settings.appTrack !== 'classic' && !xmOff();
  function music(cat, opts) {
    if (RANKED_CATS.has(cat)) { rankedCat = { cat, opts }; if (xmasOn()) cat = xmasTrack(); }
    else if (cat == null || THEMES[cat]) rankedCat = null;
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
  /** กิจกรรมที่แสดงอยู่บนหน้าจอ (ดูจากคลาสธีมของหน้ากิจกรรม/เทศกาล ที่ event.js · festival.js ตั้ง) */
  function eventMusic(id) {
    if (id === 'screen-event') {
      const scr = document.getElementById('screen-event');
      return scr && scr.classList.contains('ev-skin-lk') ? 'loykrathong_night' : 'halloween_night';
    }
    if (id === 'screen-festival') {
      const r = document.getElementById('hf-root');
      if (r && r.classList.contains('hf-skin-lk')) return 'loykrathong_night';
      if (r && /hf-skin-(hw|halloween)/.test(r.className)) return 'halloween_night';
    }
    return null;
  }
  // v1.25.0 คริสต์มาส: ช่วงฤดูกาล + ผู้ดูแลเปิด christmas_music · เพลงเล่นเมื่อผู้ใช้ "กดเปิดเอง" แล้วเท่านั้น (xmasMusic = 'on')
  const xmasSeason = () => !!(window.EQSeason && window.EQSeason.key === 'christmas' && !(window.EQSeason.flags && window.EQSeason.flags.music === false));
  const xmasTrack = () => (XMAS_TRACKS.some(([k]) => k === settings.xmasTrack) ? settings.xmasTrack : 'xmas_eve');
  function appMusicFor(id) {
    if (!settings.appMusic) return null;
    if (xmasSeason() && settings.appTrack !== 'classic') {
      if (xmOff()) return null;   // v1.25.3 (เจ้าของสั่ง 24 พ.ย.) เล่นอัตโนมัติเมื่อเปิดแอป · ปิดเองแล้ว = เงียบ
      // v1.26.3 ทุกหน้ารวม TOEIC (เพลงช้า xmas_study · ระหว่างเล่นคลิป Listening หรี่เกือบเงียบ — duckLevel)
      return STUDY_SCREENS.has(id) || id.startsWith('screen-toeic') ? 'xmas_study' : xmasTrack();
    }
    // v1.18.0 หน้ากิจกรรม: เลือกเพลงตามกิจกรรมที่เปิดอยู่จริง (ลอยกระทง → เพลงลอยกระทง · Halloween → เพลง Halloween)
    const ev = eventMusic(id);
    if (ev) return ev;
    // v1.18.0 หน้าแรก (Lobby) ช่วงเทศกาล: เพลงของฤดูกาล (เซิร์ฟเวอร์บอกช่วงเวลา — /api/season · public/js/season.js)
    if (id.startsWith('screen-toeic')) return null;                             // TOEIC Listening: เงียบ (ไม่ให้เพลงรบกวนการฟัง)
    // v1.21.0 เพลงลอยกระทงแบบรำวงทุกเมนู (ค่าเริ่มต้น) · เลือก "เพลงเดิม" ได้ในตั้งค่าเสียง
    if (settings.appTrack !== 'classic') return 'loykrathong_night';
    if (id === 'screen-home' && window.EQSeason && window.EQSeason.homeMusic && THEMES[window.EQSeason.homeMusic]) return window.EQSeason.homeMusic;
    if (halloweenSkin()) return STUDY_SCREENS.has(id) ? 'halloween_study' : 'halloween_night';
    return STUDY_SCREENS.has(id) ? 'app_study' : 'app_home';
  }
  // เปลี่ยนธีม (เปิด/ปิด Halloween) ระหว่างอยู่หน้าเดิม -> เปลี่ยนเพลงในแอปตาม (ไม่ยุ่งกับเพลง Ranked)
  new MutationObserver(() => {
    if (lastScreen && !lastScreen.startsWith('screen-ranked') && (!current || THEMES[current.id].app)) music(appMusicFor(lastScreen));
    else if (lastScreen && lastScreen.startsWith('screen-ranked') && rankedCat) music(rankedCat.cat, rankedCat.opts);   // v1.26.3 เริ่ม/จบเทศกาลระหว่างอยู่ Ranked
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'data-season'] });   // + ฤดูกาล (v1.18.0)
  // v1.18.0 ธีมของหน้ากิจกรรมถูกตั้งหลังโหลดข้อมูล (หลังเปลี่ยนหน้า) → เปลี่ยนเพลงตามเมื่อคลาสธีมเปลี่ยน
  const evObs = new MutationObserver(() => {
    if ((lastScreen === 'screen-event' || lastScreen === 'screen-festival') && (!current || THEMES[current.id].app)) {
      const want = appMusicFor(lastScreen);
      if (!current || current.id !== want) music(want);
    }
  });
  ['screen-event', 'hf-root'].forEach((id) => { const el = document.getElementById(id); if (el) evObs.observe(el, { attributes: true, attributeFilter: ['class'] }); });
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
    const before = settings.appMusic; const beforeTrack = settings.appTrack; const bx = settings.xmasMusic; const bxt = settings.xmasTrack;
    settings = { ...settings, ...patch };
    if (settings.appTrack !== 'classic') settings.appTrack = 'loykrathong';
    applyVolumes();
    save();
    const changed = before !== settings.appMusic || beforeTrack !== settings.appTrack || bx !== settings.xmasMusic || bxt !== settings.xmasTrack;
    if (changed && lastScreen && !lastScreen.startsWith('screen-ranked')) music(appMusicFor(lastScreen));
    else if (changed && rankedCat) music(rankedCat.cat, rankedCat.opts);   // v1.26.3 อยู่หน้า Ranked: สลับเพลงคริสต์มาส ↔ เพลง Ranked ทันที
    renderXmasPlayer();
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
      if (r.settings) {
        settings = { ...DEFAULTS, ...r.settings };
        // ค่าจากบัญชีอาจยังเป็น "ปิด" จากปุ่มหยุดรุ่นก่อน → ล้างครั้งเดียวต่อบัญชี (บันทึกกลับบัญชีด้วย)
        const fx = `${XM_RESET}:${(window.EQApp && window.EQApp.user && window.EQApp.user.id) || ''}`;
        try { if (!localStorage.getItem(fx)) { localStorage.setItem(fx, '1'); if (settings.xmasMusic === 'off') { settings.xmasMusic = 'on'; save(); } } } catch (_) { /* - */ }
        applyVolumes(); syncControls(); try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (_) { /* - */ }
        xmRefresh();
      }
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
    return `${withMaster ? row('master', 'เสียงรวม', 'volume-2') : ''}${row('music', 'เพลง', 'music')}${row('sfx', 'เอฟเฟกต์เสียง', 'volume-1')}
      <label class="au-row au-mute"><span class="au-label">${window.EQG.icon('music', 'icon-sm')} เพลงในแอป (นอก Ranked)</span>
      <input type="checkbox" role="switch" data-au="appMusic" ${settings.appMusic ? 'checked' : ''} aria-label="เปิดเพลงประกอบในแอป"></label>
      <label class="au-row au-track"><span class="au-label">${window.EQG.icon('music', 'icon-sm')} เพลงพื้นหลัง</span>
      <select data-au="appTrack" aria-label="เลือกเพลงพื้นหลังในแอป">
        <option value="loykrathong" ${settings.appTrack !== 'classic' ? 'selected' : ''}>${xmasSeason() ? 'เพลงเทศกาลคริสต์มาส' : 'ลอยกระทง (รำวง)'}</option>
        <option value="classic" ${settings.appTrack === 'classic' ? 'selected' : ''}>เพลงเดิม</option></select></label>
      <label class="au-row au-mute"><span class="au-label">${window.EQG.icon('volume-x', 'icon-sm')} ปิดเสียงทั้งหมด</span>
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
    update(k === 'muted' || k === 'appMusic' ? { [k]: el.checked } : k === 'appTrack' ? { appTrack: el.value } : { [k]: Number(el.value) });
  });
  // ปุ่มลำโพง (ทั้งแถบบนของแอปและในเกม Ranked) -> Quick menu
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-audio-menu]');
    if (b) openQuickMenu(b);
  });
  /** หรี่เพลงชั่วคราว (เช่นระหว่างอ่านออกเสียงคำศัพท์) */
  // หรี่เพลงได้จากหลายแหล่งพร้อมกัน (TTS / เสียงคุยกับเพื่อนร่วมทีม) — เพลงกลับดังเมื่อทุกแหล่งปล่อยแล้ว
  const duckers = new Set();
  // v1.26.3 คลิปข้อสอบ TOEIC Listening เล่นอยู่ → เพลงเกือบเงียบ (4%) · เสียงอ่านคำศัพท์ทั่วไป 18% เท่าเดิม
  function duckLevel() { return duckers.has('media') && (String(lastScreen || '').startsWith('screen-toeic') || lastScreen === 'screen-raid') ? 0.04 : 0.18; }   // v1.27.1 Raid Listening หรี่เกือบเงียบเหมือน TOEIC
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
  let menuAnchor = null;
  function escClose(e) { if (e.key === 'Escape') { closeQuickMenu(); if (menuAnchor && document.contains(menuAnchor)) menuAnchor.focus(); } }   // กลับโฟกัสที่ปุ่มลำโพง (ใช้คีย์บอร์ดต่อได้)
  function openQuickMenu(anchor) {
    if (menu) { closeQuickMenu(); return; }
    menuAnchor = anchor;
    unlock();
    menu = document.createElement('div');
    menu.className = 'au-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'ตั้งค่าเสียง');
    menu.innerHTML = `<p class="au-title">Audio</p><div class="xm-pl-menu" id="xm-pl-menu">${xmasMenuHtml()}</div>${controlsHtml('au-q', true)}`;
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

  /* ---------------- v1.25.0 เครื่องเล่นเพลงคริสต์มาส (ปุ่มลอยมุมจอ) ----------------
     - v1.25.3: เล่นอัตโนมัติเมื่อเปิดแอปในช่วงคริสต์มาส (ไม่มีปุ่ม "แตะเพื่อเปิด" แล้ว) · ผู้ใช้กดหยุด = จำค่า off
       ข้อจำกัดเบราว์เซอร์: เสียงเริ่มได้หลังการแตะ/คลิก/กดปุ่มใด ๆ ครั้งแรกในหน้า (unlock() ฟังทุกจุด)
     - เปิด/หยุด · ระดับเสียงเพลง · เลือกเพลง · จำค่าไว้ (เครื่อง + บัญชี) · ซ่อนในหน้าที่ไม่มีเพลง (Ranked / การฟัง TOEIC) */
  let xp = null; let xpOpen = false;
  // v1.26.3 เพลงคริสต์มาสเล่นทุกหน้าแล้ว → แสดงเครื่องเล่นใน Ranked/TOEIC ด้วย ยกเว้นระหว่างแข่ง/ทำข้อสอบ (ไม่บังโจทย์)
  const XP_BUSY = /^screen-ranked-(match|result)$|^screen-toeic[a-z0-9]*-play/;
  const xpHidden = () => !xmasSeason() || settings.appTrack === 'classic' || !lastScreen || lastScreen === 'screen-auth' || XP_BUSY.test(lastScreen);
  const escH = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* v1.27.1 (เจ้าของขอ) มือถือ/แท็บเล็ต: เอาปุ่มเพลงออกจากแถบบน (ชื่อผู้เล่นโดนเบียด) — เพลงยังเล่นตามเดิม
     ควบคุมเพลงคริสต์มาส (หยุด/เล่น · เลือกเพลง) ย้ายไปอยู่ในเมนูปุ่มลำโพงแทน · จอกว้าง ≥ 1024 ยังมีเครื่องเล่นมุมแถบเมนูข้างเหมือนเดิม */
  function xmasMenuHtml() {
    if (!xmasSeason() || settings.appTrack === 'classic') return '';
    const on = !xmOff() && settings.appMusic && !settings.muted;
    const ic = (n) => (window.EQG ? window.EQG.icon(n, 'icon-sm') : '');
    return `<div class="xm-pl-panel xm-pl-inmenu" role="group" aria-label="เพลงคริสต์มาส">
      <button type="button" class="xm-pl-toggle" data-xp="toggle" aria-pressed="${on}">${ic(on ? 'pause' : 'play')} ${on ? 'หยุดเพลงคริสต์มาส' : 'เล่นเพลงคริสต์มาส'}</button>
      <div class="xm-pl-list" role="radiogroup" aria-label="เลือกเพลง">${XMAS_TRACKS.map(([k, n, d]) => `<button type="button" role="radio" aria-checked="${k === xmasTrack()}" class="xm-pl-tr${k === xmasTrack() ? ' on' : ''}" data-xp-track="${k}"><b lang="en">${escH(n)}</b><small>${escH(d)}</small></button>`).join('')}</div></div>`;
  }
  function renderXmasMenu() { const m = document.getElementById('xm-pl-menu'); if (m) m.innerHTML = xmasMenuHtml(); }
  function renderXmasPlayer() {
    renderXmasMenu();
    if (xpHidden() || window.innerWidth < 1024) { if (xp) { xp.remove(); xp = null; xpOpen = false; } return; }
    if (!xp) { xp = document.createElement('div'); xp.className = 'xm-player'; xp.id = 'xm-player'; }
    // v1.26.0 มือถือ/แท็บเล็ต: ฝังในแถบบน (ไม่ลอยทับเนื้อหา/แถบแชท) · จอกว้าง: มุมล่างของแถบเมนูข้าง
    const dock = window.innerWidth < 1024 ? document.querySelector('#hud .container') : null;
    const parent = dock || document.body;
    if (xp.parentNode !== parent) { if (dock) dock.insertBefore(xp, dock.querySelector('.hud-audio') || null); else parent.appendChild(xp); }
    xp.classList.toggle('is-docked', Boolean(dock));
    const on = !xmOff() && settings.appMusic && !settings.muted;
    const cur = XMAS_TRACKS.find(([k]) => k === xmasTrack());
    const ic = (n) => (window.EQG ? window.EQG.icon(n, 'icon-sm') : '');
    xpSched();
    xp.classList.toggle('is-on', on); xp.classList.toggle('is-open', xpOpen);
    xp.innerHTML = `<button type="button" class="xm-pl-main" data-xp="panel" aria-expanded="${xpOpen}" aria-controls="xm-pl-panel"
        aria-label="${on ? `เพลงคริสต์มาสกำลังเล่น: ${escH(cur[1])} — ตั้งค่าเพลง` : 'เปิดเพลงคริสต์มาส'}">
        <span class="xm-pl-disc" aria-hidden="true">${ic('music')}</span>
        <span class="xm-pl-text"><b lang="en">${escH(cur[1])}</b><small>${on ? (unlocked ? 'กำลังเล่น' : 'เริ่มเล่นเมื่อแตะหน้าจอครั้งแรก') : 'หยุดอยู่'}</small></span></button>
      ${xpOpen ? `<div class="xm-pl-panel" id="xm-pl-panel" role="group" aria-label="เครื่องเล่นเพลงคริสต์มาส">
        <button type="button" class="xm-pl-toggle" data-xp="toggle" aria-pressed="${on}">${ic(on ? 'pause' : 'play')} ${on ? 'หยุดเพลง' : 'เล่นเพลง'}</button>
        <label class="xm-pl-vol"><span>${ic('volume-2')} ระดับเสียงเพลง</span><input type="range" min="0" max="100" step="5" data-au="music" value="${settings.music}" aria-label="ระดับเสียงเพลง"></label>
        <div class="xm-pl-list" role="radiogroup" aria-label="เลือกเพลง">${XMAS_TRACKS.map(([k, n, d]) => `<button type="button" role="radio" aria-checked="${k === xmasTrack()}" class="xm-pl-tr${k === xmasTrack() ? ' on' : ''}" data-xp-track="${k}"><b lang="en">${escH(n)}</b><small>${escH(d)}</small></button>`).join('')}</div>
        <p class="xm-pl-note">เพลงแต่งขึ้นใหม่สำหรับ EnglishQuest · หน้าแบบฝึกเล่นเวอร์ชันเบา · หน้าฟัง (Listening) หรี่/หยุดเพลงให้อัตโนมัติ</p></div>` : ''}`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-xp], [data-xp-track]');
    const inMenu = Boolean(b && b.closest('#xm-pl-menu'));
    if (!b || (!inMenu && (!xp || !xp.contains(b)))) { if (xpOpen && xp && !xp.contains(e.target)) { xpOpen = false; renderXmasPlayer(); } return; }
    unlock();
    if (b.dataset.xpTrack) { xmSessionPause(false); update({ xmasTrack: b.dataset.xpTrack, xmasMusic: 'on', appMusic: true, muted: false }); return; }
    const k = b.dataset.xp;
    if (k === 'panel') { xpOpen = !xpOpen; renderXmasPlayer(); const f = xp.querySelector('[data-xp="toggle"]'); if (xpOpen && f) f.focus(); return; }
    // v1.27.0 (เจ้าของสั่ง 25 พ.ย.) กดหยุด = หยุดเฉพาะการเปิดแอปครั้งนี้ · เปิดแอปครั้งถัดไปเพลงเล่นเองอัตโนมัติ (ไม่ต้องกดเล่นก่อน)
    if (k === 'toggle') {
      const on = !xmOff() && settings.appMusic && !settings.muted;
      if (on) { xmSessionPause(true); xmRefresh(); } else { xmSessionPause(false); update({ xmasMusic: 'on', appMusic: true, muted: false }); xmRefresh(); }
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && xpOpen) { xpOpen = false; renderXmasPlayer(); const m = xp && xp.querySelector('.xm-pl-main'); if (m) m.focus(); } });
  window.addEventListener('eq:screen', () => renderXmasPlayer());
  // v1.25.2 มือถือ: ปุ่มเพลงไม่บังแถบแชทโลกย่อ/ปุ่มอื่นที่เลื่อนมาอยู่ตำแหน่งเดียวกัน — ยกขึ้นเหนือสิ่งที่ทับ (คำนวณตอนเลื่อน ทีละเฟรม)
  let xpRaf = 0;
  function xpAvoid() {
    xpRaf = 0;
    if (!xp || window.innerWidth >= 1024 || xp.classList.contains('is-docked')) { if (xp) { xp.style.transform = ''; xp.classList.remove('is-yield'); } return; }
    xp.classList.remove('is-yield');
    // ตำแหน่ง "ปกติ" = ตำแหน่งตอนนี้ลบระยะที่ยกอยู่ (อ่านจาก transform จริง รวมช่วงแอนิเมชัน) → ไม่กระพริบไปมา
    const m = getComputedStyle(xp).transform; const ty = m && m !== 'none' ? parseFloat(m.split(',')[5]) || 0 : 0;   // matrix(a, b, c, d, tx, ty)
    const cur = xp.getBoundingClientRect();
    const pr = { top: cur.top - ty, bottom: cur.bottom - ty, left: cur.left, right: cur.right };
    let lift = 0;
    document.querySelectorAll('.gcm, .hl-stage-actions, .xm-shop-act .btn, .dash-continue').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.bottom > pr.top && r.top < pr.bottom && r.right > pr.left && r.left < pr.right) lift = Math.max(lift, pr.bottom - r.top + 8);
    });
    if (!lift || xpOpen) { xp.style.transform = ''; return; }
    if (pr.top - lift > 70) xp.style.transform = `translateY(${-Math.round(lift)}px)`;
    else xp.classList.add('is-yield');   // ยกไม่พ้น (สิ่งที่ทับสูงมาก) → หลบชั่วคราวจนกว่าจะเลื่อนผ่าน · ปรับเพลงได้ที่ปุ่มลำโพงแถบบนเสมอ
  }
  const xpSched = () => { if (!xpRaf) xpRaf = requestAnimationFrame(xpAvoid); };
  window.addEventListener('scroll', xpSched, { passive: true });
  window.addEventListener('resize', xpSched, { passive: true });
  let xpDockW = window.innerWidth;
  window.addEventListener('resize', () => { const w = window.innerWidth; if ((w < 1024) !== (xpDockW < 1024)) { xpDockW = w; renderXmasPlayer(); } xpDockW = w; }, { passive: true });
  window.addEventListener('eq:screen', () => setTimeout(xpSched, 600));
  window.addEventListener('eq:season', () => { renderXmasPlayer(); if (lastScreen && !lastScreen.startsWith('screen-ranked') && (!current || THEMES[current.id].app)) music(appMusicFor(lastScreen)); });
  // หรี่เพลงเมื่อมีเสียงจากไฟล์เสียง/วิดีโอในหน้า (เช่น โจทย์การฟัง) — เพลงกลับดังเองเมื่อเสียงนั้นหยุด
  document.addEventListener('play', (e) => { if (e.target instanceof HTMLMediaElement) duck(true, 'media'); }, true);
  ['pause', 'ended', 'emptied'].forEach((ev) => document.addEventListener(ev, (e) => {
    if (e.target instanceof HTMLMediaElement && ![...document.querySelectorAll('audio, video')].some((m) => !m.paused && !m.ended)) duck(false, 'media');
  }, true));

  window.EQAudio = {
    music, sfx, cue, setCritical, openQuickMenu, closeQuickMenu, unlock, duck,
    isMuted: () => settings.muted, getSettings: () => ({ ...settings }), update,
    _track: () => (current ? current.id : null),   // ชุดทดสอบ: เพลงที่กำลังเล่น
    _duckLevel: () => duckLevel(),   // ชุดทดสอบ: ระดับหรี่เพลง (TOEIC Listening 4%)
    // ตรวจระดับเสียงจริง (ใช้ในชุดทดสอบ: เพลงไม่เงียบตอนวน / ตอนเปลี่ยนเพลง)
    _level: () => {
      if (!ctx) return 0;
      if (!out._an) { out._an = ctx.createAnalyser(); out._an.fftSize = 2048; out.connect(out._an); }
      const a = new Float32Array(2048); out._an.getFloatTimeDomainData(a);
      return Math.sqrt(a.reduce((s2, x) => s2 + x * x, 0) / a.length);
    },
    _state: () => ({ unlocked, current: current && current.id, critical, ctxState: ctx && ctx.state, settings, ducked }),
    _appMusicFor: (id) => appMusicFor(id),
    // ตัวอย่างเสียงสำหรับตรวจ/อัดฟัง (ไม่ใช้ในแอป): ต่อสัญญาณออกไปยัง MediaStream
    _tap: () => { if (!ensureCtx()) return null; const d = ctx.createMediaStreamDestination(); out.connect(d); return d.stream; }, xmasTracks: () => XMAS_TRACKS.map(([id, name]) => ({ id, name })),
  };
})();
