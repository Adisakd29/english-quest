/*
  Service Worker ของ WordQuest
  กลยุทธ์: network-first (เอาของใหม่จากเน็ตก่อนเสมอ)
  → ทุกครั้งที่ deploy ผู้ใช้จะได้เวอร์ชันล่าสุดทันที ไม่ค้างของเก่า
  → cache ใช้เป็นตัวสำรองตอนออฟไลน์เท่านั้น
*/

const CACHE = 'wordquest-v1';

self.addEventListener('install', (e) => {
  // ใช้ SW ตัวใหม่ทันที ไม่ต้องรอปิดแท็บเก่า
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // ลบ cache เวอร์ชันเก่าทิ้ง
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // จัดการเฉพาะ GET เท่านั้น
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ไม่ยุ่งกับ API เลย (ต้องสดใหม่เสมอ และมี auth)
  if (url.pathname.startsWith('/api/')) return;

  // ข้ามคำขอข้ามโดเมน (เช่น Google Fonts) ปล่อยให้เบราว์เซอร์จัดการเอง
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // เก็บสำเนาไว้ใช้ตอนออฟไลน์
      if (fresh && fresh.status === 200 && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      // ออฟไลน์ → ใช้ของใน cache
      const cached = await caches.match(req);
      if (cached) return cached;
      // ถ้าเป็นการเปิดหน้าเว็บ ให้ fallback ไปหน้าแรก
      if (req.mode === 'navigate') {
        const shell = await caches.match('/');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
