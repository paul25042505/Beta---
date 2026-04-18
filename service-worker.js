// ══════════════════════════════════════════
// 救護義消系統 Service Worker
// ══════════════════════════════════════════

const CACHE_NAME = 'rescue-volunteer-v1';

// 安裝 Service Worker
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// 收到 Push 通知
self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch(e) {
    data = { title: '救護義消系統', body: event.data.text() };
  }

  const title   = data.title || '救護義消系統';
  const options = {
    body:    data.body  || '',
    icon:    data.icon  || '/Emergency-Volunteer-System/icon-192.png',
    badge:   data.badge || '/Emergency-Volunteer-System/icon-192.png',
    tag:     data.tag   || 'rescue-notification',
    data:    data.url   ? { url: data.url } : {},
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 點擊通知後開啟頁面
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : 'https://paul25042505.github.io/Emergency-Volunteer-System/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
