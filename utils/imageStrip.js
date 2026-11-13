/*
  v1.18.4 ตัดข้อมูลแฝงในไฟล์ภาพ (EXIF รวมพิกัด GPS / XMP / ข้อความ) ก่อนบันทึกรูปโปรไฟล์หรือภาพ Avatar
  - ไม่ใช้ไลบรารีเพิ่ม (sharp เป็น native module หนัก) · ไม่ถอดรหัส/บีบอัดภาพใหม่ → คุณภาพเท่าเดิม
  - JPEG: ตัด APP1 (EXIF/XMP) · APP12 · APP13 (Photoshop/IPTC) · COM — เก็บ APP0 (JFIF) / APP2 (ICC สี) / APP14 (Adobe สี)
  - PNG : ตัด eXIf · tEXt · zTXt · iTXt · tIME
  - WebP: ตัด EXIF · XMP และล้างธงใน VP8X
  ไฟล์ที่โครงสร้างผิด = โยน error (ไม่บันทึก)
*/
class ImageError extends Error {}

function stripJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new ImageError('ไม่ใช่ JPEG');
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new ImageError('JPEG เสีย');
    const marker = buf[i + 1];
    if (marker === 0xd9) { out.push(buf.subarray(i, i + 2)); i += 2; break; }            // EOI
    if (marker === 0xda) { out.push(buf.subarray(i)); i = buf.length; break; }            // SOS -> ข้อมูลภาพจนจบไฟล์
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    if (i + 4 > buf.length) throw new ImageError('JPEG เสีย');
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new ImageError('JPEG เสีย');
    const drop = marker === 0xe1 || marker === 0xec || marker === 0xed || marker === 0xfe
      || (marker >= 0xe3 && marker <= 0xeb) || marker === 0xef;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(out);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
function stripPng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new ImageError('ไม่ใช่ PNG');
  const out = [PNG_SIG];
  let i = 8;
  while (i < buf.length) {
    if (i + 12 > buf.length) throw new ImageError('PNG เสีย');
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const end = i + 12 + len;
    if (end > buf.length) throw new ImageError('PNG เสีย');
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

function stripWebp(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'RIFF' || buf.subarray(8, 12).toString('latin1') !== 'WEBP') throw new ImageError('ไม่ใช่ WebP');
  const chunks = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.subarray(i, i + 4).toString('latin1');
    const len = buf.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > buf.length) throw new ImageError('WebP เสีย');
    if (id !== 'EXIF' && id !== 'XMP ') {
      const c = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      if (id === 'VP8X' && c.length >= 9) c[8] &= ~(0x08 | 0x04);   // ล้างธง EXIF / XMP
      chunks.push(c);
    }
    i = end;
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}

/** mime: image/jpeg | image/png | image/webp -> Buffer ที่ไม่มีข้อมูลแฝง */
function stripMetadata(buf, mime) {
  const m = String(mime).replace('image/jpg', 'image/jpeg');
  if (m === 'image/jpeg') return stripJpeg(buf);
  if (m === 'image/png') return stripPng(buf);
  if (m === 'image/webp') return stripWebp(buf);
  throw new ImageError('ชนิดไฟล์ไม่รองรับ');
}

/** data URL -> data URL ที่ไม่มีข้อมูลแฝง (หรือ null ถ้าไฟล์เสีย) */
function stripDataUrl(dataUrl) {
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  try {
    const mime = m[1].replace('image/jpg', 'image/jpeg');
    const out = stripMetadata(Buffer.from(m[2], 'base64'), mime);
    return `data:${mime};base64,${out.toString('base64')}`;
  } catch (_e) { return null; }
}

module.exports = { stripMetadata, stripDataUrl, ImageError };
