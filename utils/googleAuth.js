/*
  ตรวจ Google ID token ด้วยไลบรารีทางการ (google-auth-library) — ไม่เขียน OAuth flow เอง
  ตรวจ: ลายเซ็นจาก Google, audience = GOOGLE_CLIENT_ID ของเรา, ผู้ออก, วันหมดอายุ

  ใช้แค่ GOOGLE_CLIENT_ID (ค่าสาธารณะ) — ไม่ต้องมี Client Secret เพราะไม่ได้แลก authorization code
  และไม่เก็บ access token ใด ๆ
*/
const { OAuth2Client } = require('google-auth-library');

let client = null;
let testVerifier = null;

function getClientId() {
  return process.env.GOOGLE_CLIENT_ID || null;
}

function isConfigured() {
  return Boolean(getClientId()) || Boolean(testVerifier);
}

/*
  คืน { sub, email, emailVerified, name, picture } หรือโยน error ที่มี code:
    NOT_CONFIGURED  ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID
    INVALID_TOKEN   token ปลอม/หมดอายุ/ไม่ได้ออกให้แอปนี้
*/
async function verifyGoogleCredential(credential) {
  if (testVerifier) return testVerifier(credential);
  const clientId = getClientId();
  if (!clientId) { const e = new Error('not configured'); e.code = 'NOT_CONFIGURED'; throw e; }
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4096) {
    const e = new Error('bad credential'); e.code = 'INVALID_TOKEN'; throw e;
  }
  if (!client) client = new OAuth2Client(clientId);
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const p = ticket.getPayload();
    return { sub: p.sub, email: (p.email || '').toLowerCase(), emailVerified: p.email_verified === true, name: p.name || '', picture: p.picture || null };
  } catch (err) {
    const e = new Error('invalid token'); e.code = 'INVALID_TOKEN'; e.cause = err; throw e;
  }
}

// สำหรับเทสต์เท่านั้น — จำลองการตรวจ token (ใช้ไม่ได้ใน production)
function setVerifierForTests(fn) {
  if (process.env.NODE_ENV === 'production') throw new Error('ห้ามใช้ใน production');
  testVerifier = fn;
}

module.exports = { verifyGoogleCredential, isConfigured, getClientId, setVerifierForTests };
