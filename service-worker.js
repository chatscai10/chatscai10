/**
 * 炸雞店管理系統 - Service Worker
 * v1.0.0 - 2025/04/16
 * 
 * 此文件提供PWA離線功能支持，包括緩存和後台同步
 */

const CACHE_NAME = 'chicken-shop-v1.5.0';
const DYNAMIC_CACHE = 'chicken-shop-dynamic-v1';

// 需要緩存的資源列表
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/clockin.html',
  '/schedule.html',
  '/offline.html',
  '/css/styles.css',
  '/js/clockin-logic.js',
  '/js/offline-clockin.js',
  '/js/face-verification.js',
  '/js/auth.js',
  '/js/firebase-config.js',
  '/js/version.js',
  '/js/version-checker.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.3/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js',
  'https://unpkg.com/leaflet@1.9.3/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.3/dist/leaflet.js',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png'
];

// 安裝Service Worker
self.addEventListener('install', event => {
  console.log('[Service Worker] 安裝中');
  
  // 預緩存靜態資源
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] 預緩存資源');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        // 立即接管頁面，無需等待舊的Service Worker終止
        return self.skipWaiting();
      })
  );
});

// 激活Service Worker
self.addEventListener('activate', event => {
  console.log('[Service Worker] 激活中');
  
  // 清理舊緩存
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
            console.log('[Service Worker] 刪除舊緩存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 接管所有打開的頁面
      return self.clients.claim();
    })
  );
});

// 處理資源請求
self.addEventListener('fetch', event => {
  // 忽略Firebase請求（不緩存）
  if (event.request.url.includes('firebaseio.com') || 
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('cloudfunctions.net')) {
    return;
  }
  
  // 針對HTML頁面的請求策略：網絡優先，失敗時回退到緩存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 請求成功，克隆響應並存入緩存
          const clonedResponse = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(() => {
          // 網絡請求失敗，嘗試從緩存中獲取
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // 如果沒有緩存，返回離線頁面
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }
  
  // 對於其他資源的請求策略：緩存優先，失敗時回退到網絡
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // 如果資源在緩存中存在，直接返回
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // 如果資源不在緩存中，則從網絡獲取
        return fetch(event.request)
          .then(response => {
            // 確保是有效的響應
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // 克隆響應，因為響應是流，只能使用一次
            const clonedResponse = response.clone();
            
            // 將新獲取的資源存入動態緩存
            caches.open(DYNAMIC_CACHE)
              .then(cache => {
                cache.put(event.request, clonedResponse);
              });
            
            return response;
          })
          .catch(error => {
            console.log('[Service Worker] 獲取資源失敗:', error);
            
            // 對於圖片請求，可以返回一個佔位圖片
            if (event.request.url.match(/\.(jpg|jpeg|png|gif|svg)$/)) {
              return caches.match('/icons/placeholder.png');
            }
            
            // 對於其他類型的請求，可能無法提供適當的回退
            return new Response('Resource not available offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// 處理後台同步
self.addEventListener('sync', event => {
  console.log('[Service Worker] 後台同步觸發:', event.tag);
  
  if (event.tag === 'sync-clock-records') {
    event.waitUntil(syncClockRecords());
  }
});

// 處理推送通知
self.addEventListener('push', event => {
  console.log('[Service Worker] 收到推送消息:', event.data.text());
  
  const notificationData = JSON.parse(event.data.text());
  const notificationTitle = notificationData.title || '炸雞店管理系統';
  const notificationOptions = {
    body: notificationData.body || '有新消息',
    icon: notificationData.icon || '/icons/icon-192x192.png',
    badge: '/icons/notification-badge.png',
    data: notificationData.data || {},
    vibrate: [100, 50, 100]
  };
  
  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// 處理通知點擊
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] 通知被點擊:', event.notification.data);
  
  event.notification.close();
  
  // 處理通知點擊動作，例如打開特定頁面
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  } else {
    // 如果沒有指定URL，打開應用程序的主頁面
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// 同步打卡記錄的實現
async function syncClockRecords() {
  // 這裡實現與IndexedDB的交互，獲取未同步的記錄
  // 由於Service Worker中無法直接訪問Window對象，
  // 實際的同步邏輯在頁面中實現，Service Worker只負責觸發
  
  // 通知所有客戶端進行同步
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({
      action: 'sync-clock-records',
      timestamp: new Date().toISOString()
    });
  });
  
  return true;
}

// 預載離線頁面
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
}); 