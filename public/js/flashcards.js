/* =====================================================================
   Flashcard ดาวน์โหลด — v1.17.0 — window.EQFlashcards  (#/flashcards)
   ผู้ใช้เลือก ระดับ CEFR + หัวข้อ → ได้
     1) PDF ขนาด A4 สำหรับพิมพ์แล้วตัด (พิมพ์สองหน้า 8 ใบ/แผ่น หรือ พิมพ์หน้าเดียวแล้วพับ 4 ใบ/แผ่น)
     2) รูป PNG 1080×1350 ต่อใบ (ด้านหน้า/ด้านหลัง) สำหรับดูบนมือถือ รวมเป็น ZIP (และบันทึกลงคลังรูปผ่าน Share ได้ถ้าเครื่องรองรับ)
   ทุกอย่างสร้างในเบราว์เซอร์ (Canvas วาดภาษาไทยถูกต้องตามฟอนต์ของเครื่อง) — ไม่มีไลบรารีภายนอก ไม่ส่งข้อมูลไปที่อื่น
   ข้อมูลการ์ดจาก GET /api/flashcards/deck (คลังคำของแอป · ตัดคำที่คำแปลยังรอตรวจออกแล้ว)
   ===================================================================== */
(function () {
  const App = () => window.EQApp;
  const ICON = (id, cls = 'icon icon-sm') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons/icons.svg#${id}"></use></svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);

  /* ---------------- สีตามระดับ ---------------- */
  const LV = {
    A1: { c: '#22A04B', d: '#17793A', l: '#E6F6EB', name: 'Beginner' },
    A2: { c: '#0E9C94', d: '#0A756F', l: '#E2F5F4', name: 'Elementary' },
    B1: { c: '#2F6FED', d: '#1F52BD', l: '#E7EFFE', name: 'Intermediate' },
    B2: { c: '#5B4BDB', d: '#4234B0', l: '#ECEAFD', name: 'Upper-intermediate' },
    C1: { c: '#9A3BD0', d: '#762AA2', l: '#F4E9FB', name: 'Advanced' },
    C2: { c: '#D3326A', d: '#A6214F', l: '#FCE8EF', name: 'Proficiency' },
  };
  const INK = '#1C2033'; const MUTED = '#5E6478'; const SOFT = '#8A90A2';
  const F_EN = '"Plus Jakarta Sans", "Noto Sans Thai", "Noto Sans", system-ui, sans-serif';
  const F_TH = '"Noto Sans Thai", "Plus Jakarta Sans", "Noto Sans", system-ui, sans-serif';
  const F_IPA = '"Noto Sans", "DejaVu Sans", "Segoe UI", "Plus Jakarta Sans", sans-serif';

  async function fontsReady() {
    if (!document.fonts || !document.fonts.load) return;
    const want = ['800 40px "Plus Jakarta Sans"', '700 40px "Plus Jakarta Sans"', '500 40px "Plus Jakarta Sans"',
      '700 40px "Noto Sans Thai"', '500 40px "Noto Sans Thai"', '400 40px "Noto Sans Thai"'];
    await Promise.race([Promise.all(want.map((f) => document.fonts.load(f, 'Aกข').catch(() => null))), new Promise((r) => setTimeout(r, 2500))]);
  }

  /* ---------------- ตัดบรรทัด (ไทยไม่มีช่องว่าง → ใช้ Intl.Segmenter แบ่งคำ) ---------------- */
  const SEG = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  function tokens(text) {
    const s = String(text || '');
    if (SEG) return [...SEG.segment(s)].map((x) => ({ t: x.segment, i: x.index }));
    const out = []; const re = /\s+|[^\s]+/g; let m;
    while ((m = re.exec(s))) out.push({ t: m[0], i: m.index });
    return out;
  }
  /** วางคำลงบรรทัด: toks = [{t, bold}] · คืน [[tok…]] — คำที่ยาวเกินบรรทัดหั่นเป็นตัวอักษร */
  function layout(ctx, toks, maxW, font, boldFont) {
    const lines = [[]]; let w = 0;
    const width = (tk) => { ctx.font = tk.bold ? boldFont : font; return ctx.measureText(tk.t).width; };
    for (const tk0 of toks) {
      const parts = width(tk0) > maxW && tk0.t.length > 1 ? [...tk0.t].map((ch) => ({ ...tk0, t: ch })) : [tk0];
      for (const tk of parts) {
        const tw = width(tk);
        const space = /^\s+$/.test(tk.t);
        if (w + tw > maxW && lines[lines.length - 1].length) {
          if (space) continue;
          lines.push([]); w = 0;
        }
        if (space && !lines[lines.length - 1].length) continue;
        lines[lines.length - 1].push({ ...tk, w: tw }); w += tw;
      }
    }
    return lines.map((l) => { while (l.length && /^\s+$/.test(l[l.length - 1].t)) l.pop(); return l; }).filter((l) => l.length);
  }
  /** หาขนาดตัวอักษรใหญ่สุดที่ข้อความไม่เกิน maxLines บรรทัด · เกินที่ขนาดเล็กสุด → ตัดท้ายด้วย … */
  function fit(ctx, toks, { maxW, maxLines, max, min, fam, weight = 400, boldWeight = 700 }) {
    let size = max; let lines;
    for (; size >= min; size -= 2) {
      lines = layout(ctx, toks, maxW, `${weight} ${size}px ${fam}`, `${boldWeight} ${size}px ${fam}`);
      if (lines.length <= maxLines) return { size, lines };
    }
    size = min;
    lines = layout(ctx, toks, maxW, `${weight} ${size}px ${fam}`, `${boldWeight} ${size}px ${fam}`).slice(0, maxLines);
    const last = lines[lines.length - 1];
    if (last) last.push({ t: '…', w: ctx.measureText('…').width });
    return { size, lines };
  }
  function drawLines(ctx, fitted, { x, y, lh, fam, weight = 400, boldWeight = 700, color, boldColor, align = 'left', maxW = 0 }) {
    ctx.textBaseline = 'alphabetic';
    fitted.lines.forEach((line, n) => {
      const total = line.reduce((a, tk) => a + tk.w, 0);
      let cx = align === 'center' ? x + (maxW - total) / 2 : x;
      for (const tk of line) {
        ctx.font = `${tk.bold ? boldWeight : weight} ${fitted.size}px ${fam}`;
        ctx.fillStyle = tk.bold ? (boldColor || color) : color;
        ctx.fillText(tk.t, cx, y + n * lh); cx += tk.w;
      }
    });
    return fitted.lines.length * lh;
  }
  const plain = (text) => tokens(text).map((x) => ({ t: x.t }));

  /** ไฮไลต์คำศัพท์ในประโยคตัวอย่าง (รวมรูปที่เติม -s/-ed/-ing) */
  function highlight(example, headword) {
    const words = String(headword || '').toLowerCase().replace(/\(.*?\)/g, ' ').split(/[\s/]+/).filter((w) => /^[a-z'-]+$/.test(w));
    let ranges = [];
    if (words.length) {
      const stem = (w) => (w.length > 4 && /e$/.test(w) ? w.slice(0, -1) : w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${words.map((w) => `${stem(w)}[a-z']*`).join('\\s+')}\\b`, 'gi');
      let m; while ((m = re.exec(example))) ranges.push([m.index, m.index + m[0].length]);
      if (!ranges.length && words.length > 1) {   // วลี: ไฮไลต์คำหลักคำแรกที่พบ
        const re1 = new RegExp(`\\b${stem(words.sort((a, b) => b.length - a.length)[0])}[a-z']*\\b`, 'gi');
        while ((m = re1.exec(example))) ranges.push([m.index, m.index + m[0].length]);
      }
    }
    return tokens(example).map((x) => ({ t: x.t, bold: ranges.some(([a, b]) => x.i >= a && x.i < b && !/^\s+$/.test(x.t)) }));
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function pill(ctx, text, x, y, h, { bg, fg, font, padX }) {
    ctx.font = font; const w = ctx.measureText(text).width + padX * 2;
    ctx.fillStyle = bg; rr(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, x + padX, y + h / 2 + 1); ctx.textBaseline = 'alphabetic';
    return w;
  }
  const posShort = (p) => String(p || '').replace(/\bnoun\b/, 'noun').replace(/adjective/, 'adj.').replace(/adverb/, 'adv.').replace(/preposition/, 'prep.')
    .replace(/conjunction/, 'conj.').replace(/determiner/, 'det.').replace(/pronoun/, 'pron.').replace(/exclamation/, 'excl.').replace(/phrasal verb/, 'phr. verb');

  /* =====================================================================
     วาดการ์ด 1 ด้าน
     kind: 'print' (95×65 มม. · 10 px/มม. = 950×650) | 'mobile' (1080×1350)
     style: 'color' | 'ink' (ประหยัดหมึก — พื้นขาว ขอบสี)
     ===================================================================== */
  const SIZE = { print: [950, 650], mobile: [1080, 1350] };
  function drawCard(canvas, card, side, { kind = 'print', style = 'color', index = 1, total = 1, scale = 1 } = {}) {
    const [W, H] = SIZE[kind];
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const P = LV[card.level] || LV.A1;
    const color = style === 'color';
    const M = kind === 'print' ? 1 : 1.6;           // ตัวคูณขนาดตัวอักษร/ระยะของแบบมือถือ
    const pad = kind === 'print' ? 46 : 72;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

    if (side === 'front') {
      if (color) {
        ctx.fillStyle = P.c; ctx.fillRect(0, 0, W, H);
        // วงกลมตกแต่ง (สีเรียบ บีบอัดไฟล์ได้ดี)
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath(); ctx.arc(W * 0.92, H * 0.06, H * 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(W * 0.04, H * 1.02, H * 0.30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath(); ctx.arc(W * 0.98, H * 1.04, H * 0.20, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = P.c; ctx.lineWidth = 6; rr(ctx, 18, 18, W - 36, H - 36, 28 * M); ctx.stroke();
      }
      const fg = color ? '#FFFFFF' : INK;
      const sub = color ? 'rgba(255,255,255,0.86)' : MUTED;
      // หัวการ์ด: ระดับ + หัวข้อ
      const ph = 44 * M;
      pill(ctx, card.level, pad, pad - 6, ph, { bg: color ? 'rgba(255,255,255,0.22)' : P.c, fg: '#FFFFFF', font: `800 ${24 * M}px ${F_EN}`, padX: 18 * M });
      ctx.font = `600 ${22 * M}px ${F_TH}`; ctx.fillStyle = sub; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${card.topicEn} · ${card.topicTh}`, W - pad, pad - 6 + ph / 2 + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      // คำศัพท์ (ใหญ่ อยู่กลาง)
      const maxW = W - pad * 2;
      const word = fit(ctx, plain(card.word), { maxW, maxLines: 2, max: (kind === 'print' ? 118 : 150), min: 44, fam: F_EN, weight: 800 });
      const lh = word.size * 1.08;
      const ipaSize = 30 * M;
      const blockH = word.lines.length * lh + ipaSize * 1.9;
      let y = (H - blockH) / 2 + word.size * 0.82 + (kind === 'mobile' ? -40 : 6);
      drawLines(ctx, word, { x: pad, y, lh, fam: F_EN, weight: 800, color: fg, align: 'center', maxW });
      y += (word.lines.length - 1) * lh + ipaSize * 1.75;
      const meta = [card.ipa ? `/${card.ipa}/` : '', posShort(card.pos)].filter(Boolean).join('  ·  ');
      ctx.font = `500 ${ipaSize}px ${F_IPA}`; ctx.fillStyle = sub; ctx.textAlign = 'center';
      ctx.fillText(meta, W / 2, y, maxW); ctx.textAlign = 'left';
      // ท้ายการ์ด
      ctx.font = `800 ${20 * M}px ${F_EN}`; ctx.fillStyle = color ? 'rgba(255,255,255,0.78)' : P.c;
      ctx.fillText('EnglishQuest', pad, H - pad + 10);
      ctx.font = `600 ${20 * M}px ${F_EN}`; ctx.fillStyle = sub; ctx.textAlign = 'right';
      ctx.fillText(`${index} / ${total}`, W - pad, H - pad + 10); ctx.textAlign = 'left';
      if (kind === 'mobile') {
        ctx.font = `500 ${22 * M}px ${F_TH}`; ctx.fillStyle = sub; ctx.textAlign = 'center';
        ctx.fillText('ปัดไปรูปถัดไปเพื่อดูความหมาย →', W / 2, H - pad - 70); ctx.textAlign = 'left';
      }
      return canvas;
    }

    /* ---------- ด้านหลัง: ความหมายไทย + ตัวอย่าง ---------- */
    const bandH = kind === 'print' ? 104 : 190;
    if (color) { ctx.fillStyle = P.c; ctx.fillRect(0, 0, W, bandH); } else {
      ctx.strokeStyle = P.c; ctx.lineWidth = 6; rr(ctx, 18, 18, W - 36, H - 36, 28 * M); ctx.stroke();
      ctx.fillStyle = P.l; ctx.fillRect(21, 21 + 10, W - 42, bandH - 31);
    }
    const bandFg = color ? '#FFFFFF' : INK;
    const maxW = W - pad * 2;
    // คำ + ชนิดคำ บนแถบ
    ctx.font = `600 ${22 * M}px ${F_EN}`;
    const posW = card.pos ? ctx.measureText(posShort(card.pos)).width + 20 : 0;
    const hw = fit(ctx, plain(card.word), { maxW: maxW - posW, maxLines: 1, max: 44 * M, min: 26, fam: F_EN, weight: 800 });
    drawLines(ctx, hw, { x: pad, y: bandH / 2 + hw.size * 0.36 + (color ? 0 : 6), lh: hw.size, fam: F_EN, weight: 800, color: bandFg });
    if (card.pos) {
      ctx.font = `600 ${22 * M}px ${F_EN}`; ctx.fillStyle = color ? 'rgba(255,255,255,0.85)' : MUTED; ctx.textAlign = 'right';
      ctx.fillText(posShort(card.pos), W - pad, bandH / 2 + 8 * M + (color ? 0 : 6)); ctx.textAlign = 'left';
    }
    // ความหมายไทย + กล่องตัวอย่าง
    // print: กล่องตัวอย่างเต็มพื้นที่ที่เหลือ · mobile: กล่องสูงตามเนื้อหา แล้วจัดทั้งก้อนให้อยู่กลางการ์ด
    const footH = kind === 'print' ? 52 : 120;
    const th = fit(ctx, plain(card.thai), { maxW, maxLines: 2, max: kind === 'print' ? 62 : 96, min: 30, fam: F_TH, weight: 700 });
    const thLh = th.size * 1.32;
    const labelH = 18 * M + (kind === 'print' ? 12 : 24);
    const gapH = kind === 'print' ? 14 : 56;
    const boxX = pad - 14; const boxW = W - (pad - 14) * 2;
    const inX = boxX + 26 * M; const inW = boxW - 26 * M - 22 * M;
    const enMax = kind === 'print' ? 30 : 52; const thMax = kind === 'print' ? 25 : 40;
    const top = bandH + (kind === 'print' ? 30 : 60);
    const roomMax = H - footH - top - labelH - th.lines.length * thLh - gapH - (kind === 'print' ? 10 : 40);
    let en; let tr; let enLh; let trLh; let contentH;
    for (let k = 1; k >= 0.55; k -= 0.05) {   // ย่อทั้งคู่จนพอดีพื้นที่
      en = fit(ctx, highlight(card.example, card.headword || card.word), { maxW: inW, maxLines: 4, max: Math.round(enMax * k), min: Math.round(enMax * k), fam: F_EN, weight: 500, boldWeight: 800 });
      tr = card.exampleTh ? fit(ctx, plain(card.exampleTh), { maxW: inW, maxLines: 3, max: Math.round(thMax * k), min: Math.round(thMax * k), fam: F_TH, weight: 400 }) : { size: 0, lines: [] };
      enLh = en.size * 1.38; trLh = tr.size * 1.45;
      contentH = en.lines.length * enLh + (tr.lines.length ? 10 * M + tr.lines.length * trLh : 0);
      if (contentH <= roomMax - 36 * M) break;
    }
    const boxH = kind === 'print' ? roomMax : Math.min(roomMax, contentH + 96);
    const block = labelH + th.lines.length * thLh + gapH + boxH;
    let y = kind === 'print' ? top : top + Math.max(0, (H - footH - top - block) / 2 - 20);
    ctx.font = `700 ${18 * M}px ${F_TH}`; ctx.fillStyle = P.c; ctx.fillText('ความหมาย', pad, y + 18 * M); y += labelH;
    drawLines(ctx, th, { x: pad, y: y + th.size * 0.95, lh: thLh, fam: F_TH, weight: 700, color: INK });
    y += th.lines.length * thLh + gapH;
    const boxY = y;
    ctx.fillStyle = P.l; rr(ctx, boxX, boxY, boxW, boxH, 20 * M); ctx.fill();
    ctx.fillStyle = P.c; rr(ctx, boxX, boxY + 16, 6 * M, boxH - 32, 3 * M); ctx.fill();
    let ty = boxY + (boxH - contentH) / 2 + en.size * 0.95;
    drawLines(ctx, en, { x: inX, y: ty, lh: enLh, fam: F_EN, weight: 500, boldWeight: 800, color: INK, boldColor: P.d });
    ty += en.lines.length * enLh + 10 * M;
    if (tr.lines.length) drawLines(ctx, tr, { x: inX, y: ty - enLh + tr.size * 1.2, lh: trLh, fam: F_TH, weight: 400, color: MUTED });
    // ท้ายการ์ด
    const fy = H - (kind === 'print' ? 30 : 70);
    ctx.font = `600 ${19 * M}px ${F_TH}`; ctx.fillStyle = SOFT;
    ctx.fillText(`${card.level} · ${card.topicTh}`, pad, fy);
    ctx.font = `800 ${19 * M}px ${F_EN}`; ctx.fillStyle = P.c; ctx.textAlign = 'right';
    ctx.fillText(`EnglishQuest  ${index}/${total}`, W - pad, fy); ctx.textAlign = 'left';
    return canvas;
  }

  /* =====================================================================
     PDF ขั้นต่ำ (ภาพ JPEG + เส้นตัด/พับ + ข้อความ ASCII) — เขียนเองตามสเปก PDF 1.4
     ===================================================================== */
  const MM = 72 / 25.4;
  const enc = new TextEncoder();
  function concat(parts) {
    const n = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const pdfStr = (s) => String(s).replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');
  /** pages: [{ images: [{ jpeg, w, h, x, y, cw, ch }] (มม. จากมุมซ้ายบน), lines: [{x1,y1,x2,y2,dash}], texts: [{x,y,size,text,gray}] }] */
  function buildPdf(pages, title) {
    const PW = 210 * MM; const PH = 297 * MM;
    const objs = [];                     // index+1 = เลข object
    const add = (body) => { objs.push(body); return objs.length; };
    add(null); add(null); add(enc.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
    add(enc.encode(`<< /Title (${pdfStr(title)}) /Producer (EnglishQuest) /Creator (EnglishQuest Flashcards) >>`));
    const pageIds = [];
    for (const pg of pages) {
      const xo = []; let cs = '';
      pg.images.forEach((im, k) => {
        const id = add(concat([enc.encode(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`), im.jpeg, enc.encode('\nendstream')]));
        xo.push(`/Im${k} ${id} 0 R`);
        const w = im.cw * MM; const h = im.ch * MM; const x = im.x * MM; const y = PH - (im.y + im.ch) * MM;
        cs += `q ${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm /Im${k} Do Q\n`;
      });
      for (const l of pg.lines || []) {
        cs += `q ${l.gray == null ? 0.45 : l.gray} G ${(l.width || 0.5)} w ${l.dash ? '[3 2.5] 0 d' : '[] 0 d'} ${(l.x1 * MM).toFixed(2)} ${(PH - l.y1 * MM).toFixed(2)} m ${(l.x2 * MM).toFixed(2)} ${(PH - l.y2 * MM).toFixed(2)} l S Q\n`;
      }
      for (const t of pg.texts || []) {
        cs += `BT /F1 ${t.size} Tf ${t.gray == null ? 0.35 : t.gray} g ${(t.x * MM).toFixed(2)} ${(PH - t.y * MM).toFixed(2)} Td (${pdfStr(t.text)}) Tj ET\n`;
      }
      const csBytes = enc.encode(cs);
      const cid = add(concat([enc.encode(`<< /Length ${csBytes.length} >>\nstream\n`), csBytes, enc.encode('\nendstream')]));
      pageIds.push(add(enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}] /Resources << /Font << /F1 3 0 R >> /XObject << ${xo.join(' ')} >> >> /Contents ${cid} 0 R >>`)));
    }
    objs[0] = enc.encode('<< /Type /Catalog /Pages 2 0 R >>');
    objs[1] = enc.encode(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    const parts = [enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    const offsets = []; let pos = parts[0].length;
    objs.forEach((body, i) => {
      const head = enc.encode(`${i + 1} 0 obj\n`); const tail = enc.encode('\nendobj\n');
      offsets.push(pos); parts.push(head, body, tail); pos += head.length + body.length + tail.length;
    });
    const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    parts.push(enc.encode(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
    return new Blob([concat(parts)], { type: 'application/pdf' });
  }

  /* ---------------- ZIP แบบ store (ไม่บีบอัดซ้ำ — PNG บีบอัดอยู่แล้ว) ---------------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function buildZip(files) {
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const local = []; const central = []; let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name); const crc = crc32(f.data); const size = f.data.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      local.push(new Uint8Array(h.buffer), name, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + size;
    }
    const cd = concat(central);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cd.length, true); e.setUint32(16, offset, true);
    return new Blob([concat(local), cd, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }

  const toBytes = (canvas, type, q) => new Promise((res, rej) => canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a)), rej) : rej(new Error('สร้างรูปไม่สำเร็จ'))), type, q));
  const slug = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'card';
  const tick = () => new Promise((r) => setTimeout(r, 0));

  /* ---------------- PDF สำหรับพิมพ์ ---------------- */
  const CW = 95; const CH = 65;
  async function makePdf(deck, { style, mode }, progress) {
    await fontsReady();
    const cards = deck.cards; const n = cards.length;
    const cv = document.createElement('canvas');
    const pages = [];
    const perPage = mode === 'fold' ? 4 : 8;
    const sheets = Math.ceil(n / perPage);
    const totalPages = mode === 'fold' ? sheets : sheets * 2;
    const x0 = mode === 'fold' ? 10 : 10; const y0 = (297 - CH * 4) / 2;
    const head = (pno, label) => [
      { x: 10, y: 9.5, size: 8, text: `EnglishQuest Flashcards  |  ${deck.level} ${deck.topicEn}  |  ${n} cards  |  page ${pno}/${totalPages}  |  ${label}`, gray: 0.4 },
      { x: 10, y: 291, size: 7, text: mode === 'fold' ? 'Print single-sided at 100% (Actual size). Cut along the outer marks, fold along the dashed line, glue or tape.' : 'Print double-sided at 100% (Actual size), flip on LONG edge. Cut along the marks.', gray: 0.5 },
    ];
    const marks = (cols, rows, xs, ys) => {
      const L = []; const len = 4;
      for (const x of xs) { L.push({ x1: x, y1: ys[0] - 2 - len, x2: x, y2: ys[0] - 2 }, { x1: x, y1: ys[ys.length - 1] + 2, x2: x, y2: ys[ys.length - 1] + 2 + len }); }
      for (const y of ys) { L.push({ x1: xs[0] - 2 - len, y1: y, x2: xs[0] - 2, y2: y }, { x1: xs[xs.length - 1] + 2, y1: y, x2: xs[xs.length - 1] + 2 + len, y2: y }); }
      return L;
    };
    let done = 0; const work = n * 2;
    const img = async (card, side, i) => {
      drawCard(cv, card, side, { kind: 'print', style, index: i + 1, total: n });
      const jpeg = await toBytes(cv, 'image/jpeg', 0.9);
      done += 1; progress(done / work); await tick();
      return { jpeg, w: cv.width, h: cv.height };
    };
    const ys = [0, 1, 2, 3, 4].map((r) => y0 + r * CH);
    for (let s = 0; s < sheets; s++) {
      const chunk = cards.slice(s * perPage, (s + 1) * perPage);
      if (mode === 'fold') {
        const pg = { images: [], lines: [], texts: head(s + 1, 'FRONT | BACK (fold)') };
        for (let k = 0; k < chunk.length; k++) {
          const i = s * perPage + k; const y = y0 + k * CH;
          pg.images.push({ ...(await img(chunk[k], 'front', i)), x: x0, y, cw: CW, ch: CH });
          pg.images.push({ ...(await img(chunk[k], 'back', i)), x: x0 + CW, y, cw: CW, ch: CH });
          pg.lines.push({ x1: x0 + CW, y1: y + 3, x2: x0 + CW, y2: y + CH - 3, dash: true, gray: 1, width: 0.6 });   // เส้นพับ (ขาวบนการ์ดสี)
          pg.lines.push({ x1: x0 + CW, y1: y + 3, x2: x0 + CW, y2: y + CH - 3, dash: true, gray: 0.55, width: 0.3 });
        }
        pg.lines.push(...marks(2, chunk.length, [x0, x0 + CW * 2], ys.slice(0, chunk.length + 1)));
        pg.lines.push({ x1: x0 + CW, y1: y0 - 6, x2: x0 + CW, y2: y0 - 2, dash: false }, { x1: x0 + CW, y1: y0 + chunk.length * CH + 2, x2: x0 + CW, y2: y0 + chunk.length * CH + 6 });
        pg.texts.push({ x: x0 + CW - 4, y: y0 - 7.5, size: 6, text: 'fold', gray: 0.5 });
        pages.push(pg);
      } else {
        const front = { images: [], lines: [], texts: head(s * 2 + 1, 'FRONT') };
        const back = { images: [], lines: [], texts: head(s * 2 + 2, 'BACK') };
        for (let k = 0; k < chunk.length; k++) {
          const i = s * perPage + k; const r = Math.floor(k / 2); const c = k % 2;
          front.images.push({ ...(await img(chunk[k], 'front', i)), x: x0 + c * CW, y: y0 + r * CH, cw: CW, ch: CH });
          // ด้านหลัง: สลับคอลัมน์ เพื่อให้ตรงกับด้านหน้าเมื่อพิมพ์สองหน้าแบบพลิกขอบยาว
          back.images.push({ ...(await img(chunk[k], 'back', i)), x: x0 + (1 - c) * CW, y: y0 + r * CH, cw: CW, ch: CH });
        }
        const rows = Math.ceil(chunk.length / 2);
        const xs = [x0, x0 + CW, x0 + CW * 2];
        front.lines.push(...marks(2, rows, xs, ys.slice(0, rows + 1)));
        back.lines.push(...marks(2, rows, xs, ys.slice(0, rows + 1)));
        pages.push(front, back);
      }
    }
    return buildPdf(pages, `EnglishQuest Flashcards ${deck.level} ${deck.topicEn}`);
  }

  /* ---------------- รูปสำหรับมือถือ ---------------- */
  async function makeImages(deck, progress) {
    await fontsReady();
    const cv = document.createElement('canvas'); const files = []; const n = deck.cards.length;
    for (let i = 0; i < n; i++) {
      const c = deck.cards[i]; const base = `${String(i + 1).padStart(2, '0')}-${slug(c.word)}`;
      for (const [k, side] of [[1, 'front'], [2, 'back']]) {
        drawCard(cv, c, side, { kind: 'mobile', style: 'color', index: i + 1, total: n });
        files.push({ name: `${base}-${k}-${side}.png`, data: await toBytes(cv, 'image/png') });
        progress(files.length / (n * 2)); await tick();
      }
    }
    return files;
  }

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* =====================================================================
     หน้าจอ
     ===================================================================== */
  const st = { opts: null, level: 'A1', topic: 'all', count: 40, order: 'core', style: 'color', mode: 'duplex', seed: 0, deck: null, busy: false, seq: 0 };
  const LEVEL_TH = { A1: 'เริ่มต้น', A2: 'พื้นฐาน', B1: 'กลาง', B2: 'กลางค่อนสูง', C1: 'สูง', C2: 'เชี่ยวชาญ' };

  function root() { return $('screen-flashcards-root'); }
  function seg(name, items, cur) {
    return `<div class="fc-seg" role="radiogroup" aria-label="${esc(name)}">${items.map(([v, label, sub]) => `<button type="button" role="radio" aria-checked="${String(v) === String(cur)}" class="fc-seg-btn${String(v) === String(cur) ? ' is-on' : ''}" data-fc-set="${esc(name)}" data-v="${esc(v)}">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</button>`).join('')}</div>`;
  }
  function topicsFor(level) { return (st.opts && st.opts.topics[level]) || []; }
  function available() {
    if (st.topic === 'all') { const L = st.opts.levels.find((l) => l.id === st.level); return L ? L.count : 0; }
    const t = topicsFor(st.level).find((x) => x.id === st.topic); return t ? t.count : 0;
  }

  function render() {
    const el = root(); if (!el || !st.opts) return;
    if (!topicsFor(st.level).some((t) => t.id === st.topic)) st.topic = 'all';
    const avail = available();
    const counts = st.opts.counts.filter((c, i) => c <= avail || i === 0);
    if (!counts.includes(st.count)) st.count = counts[counts.length - 1];
    el.innerHTML = `
      <button class="game-exit gl-back" type="button" data-nav-to="learn">${ICON('arrow-left')} เส้นทางการเรียน</button>
      <header class="wk-hero fc-hero"><p class="gl-kicker">${ICON('download')} Flashcards</p>
        <h1 class="page-title" id="fc-title">Flashcard ดาวน์โหลด</h1>
        <p class="gl-sub">เลือกระดับและหัวข้อ แล้วโหลดการ์ดคำศัพท์ไปพิมพ์ตัด หรือเก็บไว้ดูในมือถือ — ด้านหน้าเป็นคำศัพท์ ด้านหลังเป็นความหมายและประโยคตัวอย่าง</p></header>
      <div class="fc-layout">
        <section class="fc-panel" aria-labelledby="fc-s1">
          <h2 class="fc-h2" id="fc-s1"><span class="fc-step">1</span> ระดับ CEFR</h2>
          <div class="fc-levels" role="radiogroup" aria-label="ระดับ">${st.opts.levels.map((l) => `<button type="button" role="radio" aria-checked="${l.id === st.level}" class="fc-lv${l.id === st.level ? ' is-on' : ''}" data-fc-level="${l.id}" style="--lv:${LV[l.id].c}" ${l.count ? '' : 'disabled'}>
              <b>${l.id}</b><small>${LEVEL_TH[l.id]}</small><em>${l.count.toLocaleString('th-TH')} คำ</em></button>`).join('')}</div>
          <h2 class="fc-h2"><span class="fc-step">2</span> หัวข้อ</h2>
          <div class="fc-topics" role="radiogroup" aria-label="หัวข้อ">
            <button type="button" role="radio" aria-checked="${st.topic === 'all'}" class="fc-topic${st.topic === 'all' ? ' is-on' : ''}" data-fc-topic="all">ทุกหัวข้อ</button>
            ${topicsFor(st.level).map((t) => `<button type="button" role="radio" aria-checked="${t.id === st.topic}" class="fc-topic${t.id === st.topic ? ' is-on' : ''}" data-fc-topic="${esc(t.id)}">${esc(t.th)} <small>${t.count}</small></button>`).join('')}
          </div>
          <h2 class="fc-h2"><span class="fc-step">3</span> ตั้งค่าชุดการ์ด</h2>
          <div class="fc-opts">
            <div><p class="fc-label">จำนวนการ์ด <small>(มี ${avail.toLocaleString('th-TH')} คำ)</small></p>${seg('count', counts.map((c) => [c, `${Math.min(c, avail)} ใบ`]), st.count)}</div>
            <div><p class="fc-label">เลือกคำ</p>${seg('order', [['core', 'คำพื้นฐานก่อน'], ['shuffle', 'สุ่มคำ']], st.order)}</div>
            <div><p class="fc-label">สีการ์ดสำหรับพิมพ์</p>${seg('style', [['color', 'สีสัน'], ['ink', 'ประหยัดหมึก']], st.style)}</div>
            <div><p class="fc-label">วิธีพิมพ์</p>${seg('mode', [['duplex', 'พิมพ์สองหน้า', '8 ใบ/แผ่น'], ['fold', 'หน้าเดียวแล้วพับ', '4 ใบ/แผ่น']], st.mode)}</div>
          </div>
        </section>
        <section class="fc-panel fc-out" aria-labelledby="fc-s4">
          <h2 class="fc-h2" id="fc-s4"><span class="fc-step">4</span> ตัวอย่างและดาวน์โหลด</h2>
          <p class="fc-hint">${ICON('hand')} แตะการ์ดเพื่อพลิกดูด้านหลัง</p>
          <div class="fc-preview" id="fc-preview" aria-live="polite"><div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังเตรียมการ์ด…</div></div>
          <p class="fc-more" id="fc-more"></p>
          <div class="fc-actions">
            <button class="btn btn-primary fc-dl" type="button" id="fc-pdf" disabled>${ICON('printer')} ดาวน์โหลด PDF สำหรับพิมพ์</button>
            <button class="btn btn-secondary fc-dl" type="button" id="fc-zip" disabled>${ICON('smartphone')} รูปสำหรับมือถือ (ZIP)</button>
            <button class="btn btn-secondary fc-dl hidden" type="button" id="fc-share" disabled>${ICON('images')} บันทึกลงคลังรูป</button>
          </div>
          <div class="fc-progress hidden" id="fc-progress" role="progressbar" aria-label="กำลังสร้างไฟล์" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span><b id="fc-progress-text"></b></div>
          <details class="fc-tips"><summary>${ICON('info')} วิธีพิมพ์ให้ด้านหน้า-หลังตรงกัน</summary>
            <ul>
              <li>ตั้งขนาดกระดาษ <b>A4</b> และขนาดพิมพ์ <b>100% / ขนาดจริง</b> (ปิด "ย่อให้พอดีหน้า")</li>
              <li><b>พิมพ์สองหน้า:</b> เลือก "พิมพ์สองด้าน — พลิกตามขอบยาว" หน้าคี่เป็นด้านหน้า หน้าคู่เป็นด้านหลัง แล้วตัดตามเครื่องหมายที่ขอบกระดาษ</li>
              <li><b>หน้าเดียวแล้วพับ:</b> พิมพ์ด้านเดียว ตัดเป็นแถบตามเครื่องหมาย พับตามเส้นประกลาง แล้วติดกาว/เทป — เครื่องพิมพ์ไหนก็ใช้ได้</li>
              <li>ใช้กระดาษหนา 160–220 แกรม การ์ดจะแข็งแรงและไม่เห็นตัวอักษรทะลุ</li>
              <li>รูปในมือถือ: แตกไฟล์ ZIP แล้วเปิดดูเรียงตามชื่อ (ด้านหน้า → ด้านหลัง)</li>
            </ul>
          </details>
          <p class="fc-note">คำศัพท์ ความหมาย และประโยคตัวอย่างมาจากคลังคำของ EnglishQuest (ไม่รวมคำที่คำแปลยังรอตรวจ) · สร้างไฟล์ในเครื่องของคุณ ไม่ส่งข้อมูลออกไปที่อื่น</p>
        </section>
      </div>`;
    loadDeck();
  }

  async function loadDeck() {
    const my = ++st.seq; st.deck = null; setButtons(false);
    const box = $('fc-preview');
    try {
      const q = new URLSearchParams({ level: st.level, topic: st.topic, count: String(st.count), order: st.order, seed: String(st.seed) });
      const d = await App().api(`/flashcards/deck?${q}`);
      if (my !== st.seq) return;
      st.deck = d;
      await fontsReady();
      if (my !== st.seq) return;
      const show = d.cards.slice(0, 6);
      box.innerHTML = show.map((c, i) => `<button type="button" class="fc-card" data-fc-flip aria-pressed="false" aria-label="การ์ด ${esc(c.word)} — แตะเพื่อพลิก">
          <span class="fc-face fc-front"><img alt="ด้านหน้า: ${esc(c.word)}" data-i="${i}" data-side="front"></span>
          <span class="fc-face fc-back"><img alt="ด้านหลัง: ${esc(c.word)} แปลว่า ${esc(c.thai)}" data-i="${i}" data-side="back"></span></button>`).join('')
        || '<p class="hl-empty">ยังไม่มีคำในหัวข้อนี้</p>';
      const cv = document.createElement('canvas');
      for (const img of box.querySelectorAll('img')) {
        drawCard(cv, show[+img.dataset.i], img.dataset.side, { kind: 'print', style: st.style, index: +img.dataset.i + 1, total: d.cards.length, scale: 0.5 });
        img.src = cv.toDataURL('image/jpeg', 0.86);
      }
      $('fc-more').textContent = d.cards.length > show.length ? `แสดงตัวอย่าง ${show.length} จาก ${d.cards.length} ใบ · ${d.level} ${d.topicTh}` : `${d.cards.length} ใบ · ${d.level} ${d.topicTh}`;
      setButtons(d.cards.length > 0);
    } catch (err) {
      if (my !== st.seq) return;
      box.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-fc-retry>ลองใหม่</button></div>`;
    }
  }
  function setButtons(on) {
    for (const id of ['fc-pdf', 'fc-zip', 'fc-share']) { const b = $(id); if (b) b.disabled = !on || st.busy; }
    const sh = $('fc-share');
    if (sh) {
      let can = false;
      try { can = Boolean(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'a.png', { type: 'image/png' })] })); } catch (_) { can = false; }
      sh.classList.toggle('hidden', !can || !window.matchMedia('(pointer: coarse)').matches);
    }
  }
  function progressUi(p, label) {
    const bar = $('fc-progress'); if (!bar) return;
    bar.classList.toggle('hidden', p == null);
    if (p == null) return;
    const pct = Math.round(p * 100);
    bar.setAttribute('aria-valuenow', String(pct)); bar.querySelector('span').style.width = `${pct}%`;
    $('fc-progress-text').textContent = `${label} ${pct}%`;
  }
  const fileBase = () => `EnglishQuest-Flashcards-${st.deck.level}-${slug(st.deck.topicEn)}-${st.deck.cards.length}`;

  async function run(kind) {
    if (st.busy || !st.deck || !st.deck.cards.length) return;
    st.busy = true; setButtons(false);
    try {
      if (kind === 'pdf') {
        progressUi(0, 'กำลังสร้าง PDF');
        const blob = await makePdf(st.deck, { style: st.style, mode: st.mode }, (p) => progressUi(p, 'กำลังสร้าง PDF'));
        save(blob, `${fileBase()}-${st.mode === 'fold' ? 'fold' : 'duplex'}.pdf`);
        App().toast(`สร้าง PDF แล้ว (${(blob.size / 1048576).toFixed(1)} MB) — พิมพ์ที่ขนาดจริง 100%`, 'success');
      } else {
        progressUi(0, 'กำลังสร้างรูป');
        const files = await makeImages(st.deck, (p) => progressUi(p, 'กำลังสร้างรูป'));
        if (kind === 'share') {
          const list = files.map((f) => new File([f.data], f.name, { type: 'image/png' }));
          try { await navigator.share({ files: list, title: fileBase() }); } catch (e) { if (e && e.name !== 'AbortError') throw e; }
        } else {
          const blob = buildZip(files);
          save(blob, `${fileBase()}-mobile.zip`);
          App().toast(`สร้างรูป ${files.length} ไฟล์แล้ว (${(blob.size / 1048576).toFixed(1)} MB)`, 'success');
        }
      }
    } catch (err) {
      App().toast((err && err.message) || 'สร้างไฟล์ไม่สำเร็จ', 'error');
    } finally {
      st.busy = false; progressUi(null); setButtons(true);
    }
  }

  document.addEventListener('click', (e) => {
    const r = root(); if (!r || !r.contains(e.target)) return;
    const t = e.target.closest('button'); if (!t || st.busy) return;
    if (t.dataset.fcLevel) { st.level = t.dataset.fcLevel; st.topic = 'all'; render(); return; }
    if (t.dataset.fcTopic) { st.topic = t.dataset.fcTopic; render(); return; }
    if (t.dataset.fcSet) {
      const k = t.dataset.fcSet; const v = t.dataset.v;
      if (k === 'count') st.count = Number(v); else st[k] = v;
      if (k === 'order' && v === 'shuffle') st.seed = Math.floor(Math.random() * 1e6);
      render(); return;
    }
    if (t.hasAttribute('data-fc-flip')) { const on = t.classList.toggle('is-flipped'); t.setAttribute('aria-pressed', String(on)); return; }
    if (t.hasAttribute('data-fc-retry')) { loadDeck(); return; }
    if (t.id === 'fc-pdf') run('pdf'); else if (t.id === 'fc-zip') run('zip'); else if (t.id === 'fc-share') run('share');
  });

  async function open() {
    App().showScreen('screen-flashcards');
    const el = root();
    if (!st.opts) {
      el.innerHTML = '<div class="gl-loading" role="status"><span class="gl-spin" aria-hidden="true"></span>กำลังโหลด…</div>';
      try { st.opts = await App().api('/flashcards/options'); } catch (err) {
        el.innerHTML = `<div class="gl-empty" role="alert">${ICON('wifi-off', 'icon icon-lg')}<p>${esc((err && err.message) || 'โหลดไม่สำเร็จ')}</p><button class="btn btn-secondary" type="button" data-nav-to="flashcards">ลองใหม่</button></div>`;
        return;
      }
    }
    render();
  }

  window.EQFlashcards = { open, _drawCard: drawCard, _buildPdf: buildPdf, _buildZip: buildZip, _state: () => st };
}());
