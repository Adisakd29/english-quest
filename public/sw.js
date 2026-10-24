/*
  Service Worker ของ EnglishQuest
  - network-first: เอาของใหม่จากเน็ตก่อนเสมอ · แคชเป็นตัวสำรองตอนออฟไลน์
  - เตรียมไฟล์หลัก (app shell) ไว้ตั้งแต่ติดตั้ง -> เปิดแอปตอนออฟไลน์ได้แม้ยังไม่เคยเปิดทุกหน้า
  - __BUILD__ ถูกแทนด้วย hash ของไฟล์หน้าเว็บตอนเซิร์ฟเวอร์เริ่ม (app.js -> GET /sw.js)
    ทุกครั้งที่ deploy ไฟล์นี้จึงเปลี่ยน เบราว์เซอร์รู้ว่ามีเวอร์ชันใหม่ -> หน้าเว็บแจ้งผู้ใช้ให้อัปเดต
  - ไม่ skipWaiting เอง (กันหน้าเว็บที่เปิดค้างอยู่ใช้ไฟล์ปนกันสองเวอร์ชัน) — รอผู้ใช้กด "อัปเดต"
*/
const BUILD = '__BUILD__';
const CACHE = `eq-${BUILD}`;
// ภาพ/เสียงข้อสอบ TOEIC-style: แคชแยก (cache-first) จำกัดจำนวนไฟล์ — ไม่แคชคลังเสียงทั้งหมด (ประหยัดพื้นที่มือถือ)
const MEDIA = 'eq-toeic-media';
const MEDIA_MAX = 60;
// 3D Avatar + แผนที่ World: GLB (ชื่อไฟล์มี hash) + three.js — cache-first แยกตู้ จำกัดจำนวน (ไม่เก็บทั้งร้าน)
const A3D = 'eq-avatar3d';
const A3D_MAX = 40;
const SHELL = ['/', '/offline.html', '/css/style.css', '/css/theme-auto.css', '/css/theme.css', '/css/theme-dark.css', '/js/app.js',
  '/css/visual.css', '/css/ranked.css', '/css/rankmap.css', '/css/theme-cute.css', '/js/graphics.js', '/js/ranked.js', '/js/rankmap.js', '/js/audio.js', '/js/notify.js', '/js/event.js', '/js/auth-parallax.js', '/css/auth.css', '/js/lesson-kit.js', '/css/lesson-kit.css', '/js/grammar.js', '/css/grammar.css', '/js/c2.js', '/css/c2.css', '/js/hwart.js', '/js/halloween-fx.js', '/css/event.css', '/css/theme-halloween.css', '/css/theme-astronomy.css', '/js/astro-fx.js', '/js/toeic.js', '/css/toeic.css', '/js/avatar.js', '/css/avatar.css', '/js/avatar3d.js', '/js/festival.js', '/css/festival.css', '/js/world.js', '/js/world-physics.js', '/css/world.css',
  '/assets/npcs/npcs.svg', '/assets/guardians/guardians.svg', '/assets/icons/icons.svg', '/assets/illustrations/illustrations.svg',
  '/assets/mascot/mascot.svg', '/assets/avatars/avatars.svg', '/assets/badges/badges.svg', '/assets/backgrounds/dots.svg',
  '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => { /* ออนไลน์ไม่เสถียร — ใช้แคชตามที่เปิด */ }));
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== MEDIA && k !== A3D).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API / WebSocket / ไฟล์ภายนอก ไม่แคช (ข้อมูลต้องสดเสมอ)
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/assets/toeic/') && !req.headers.has('range')) { e.respondWith(toeicMedia(req)); return; }
  if (url.pathname.startsWith('/assets/avatar3d/') || url.pathname.startsWith('/assets/world/') || url.pathname.startsWith('/vendor/')) { e.respondWith(limitedCache(req, A3D, A3D_MAX)); return; }
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        return (await caches.match('/')) || (await caches.match('/offline.html')) || Response.error();
      }
      throw err;
    }
  })());
});

async function limitedCache(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const fresh = await fetch(req);
  if (fresh && fresh.status === 200) {
    await cache.put(req, fresh.clone());
    const keys = await cache.keys();
    if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  }
  return fresh;
}

async function toeicMedia(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req);
  if (hit) return hit;
  const fresh = await fetch(req);
  if (fresh && fresh.status === 200) {
    await cache.put(req, fresh.clone());
    const keys = await cache.keys();
    if (keys.length > MEDIA_MAX) await Promise.all(keys.slice(0, keys.length - MEDIA_MAX).map((k) => cache.delete(k)));
  }
  return fresh;
}

/* ---------------- แจ้งเตือนบนโทรศัพท์ (Web Push) ----------------
   เซิร์ฟเวอร์ส่ง { title, body, url, tag } · แตะแจ้งเตือน = เปิดแอป (ใช้แท็บที่เปิดอยู่ถ้ามี) */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'EnglishQuest';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'มาฝึกภาษาอังกฤษกันต่อ',
    icon: '/img/icon-192.png?v=2',
    badge: '/img/badge-96.png',
    tag: d.tag || 'eq',
    renotify: false,
    lang: 'th',
    data: { url: d.url || '/#/home' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find((c) => new URL(c.url).origin === self.location.origin);
    if (w) {
      await w.focus();
      if ('navigate' in w) { try { await w.navigate(target.href); } catch (_) { /* บางเบราว์เซอร์ไม่ให้ navigate */ } }
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});

/* เบราว์เซอร์เปลี่ยน subscription เอง (หมดอายุ) — ให้หน้าเว็บสมัครใหม่ตอนเปิดแอปครั้งถัดไป */
self.addEventListener('pushsubscriptionchange', () => {});
