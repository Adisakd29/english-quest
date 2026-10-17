/*
  ใช้เฉพาะตอนรันชุดทดสอบในเครื่องที่ไม่มี DNS ออกอินเทอร์เน็ต (เช่น sandbox):
    node --test --require ./test/helpers/dns-stub.js test/*.test.js
  gmail.com / example โดเมนจริงที่ชุดทดสอบใช้ = มี MX · โดเมนอื่นเรียก DNS จริงตามปกติ
*/
const dns = require('dns').promises;
const realMx = dns.resolveMx.bind(dns);
const KNOWN = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com']);
dns.resolveMx = async (domain) => (KNOWN.has(String(domain).toLowerCase()) ? [{ exchange: `mx.${domain}`, priority: 10 }] : realMx(domain));
