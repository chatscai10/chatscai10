/**
 * 炸雞店管理系統 - Service Worker
 * 提供離線功能支持和資源緩存
 * @version 2.0.0
 */

// 緩存名稱和版本
const CACHE_NAME = 'chicken-tw-cache-v2';

// 需要緩存的資源
const CACHE_URLS = [
    '/',
    '/index.html',
    '/offline.html',
    '/js/main.js',
    '/js/firebase-config.js',
    '/js/app-init.js',
    '/js/version-manager.js',
    '/js/module-config.js',
    '/js/modules/core/index.js',
    '/js/modules/auth/index.js',
    '/css/style.css',
    '/css/styles.css',
    '/manifest.json'
];

// 安裝 Service Worker
self.addEventListener('install', event => {
    console.log('[Service Worker] 安裝中...');
    
    // 預緩存指定的資源
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] 預緩存資源');
                return cache.addAll(CACHE_URLS);
            })
            .then(() => {
                // 跳過等待，立即激活
                return self.skipWaiting();
            })
    );
});

// 激活 Service Worker
self.addEventListener('activate', event => {
    console.log('[Service Worker] 激活中...');
    
    // 清理舊版本緩存
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.filter(name => name !== CACHE_NAME)
                        .map(name => {
                            console.log(`[Service Worker] 刪除舊緩存: ${name}`);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                // 立即接管所有開啟的頁面
                return self.clients.claim();
            })
    );
});

// 處理 fetch 請求
self.addEventListener('fetch', event => {
    // 檢查是否是 API 請求 (不緩存 API 請求)
    if (isApiRequest(event.request)) {
        return;
    }
    
    // 檢查是否是版本資訊請求 (特殊處理)
    if (isVersionInfoRequest(event.request)) {
        return handleVersionInfoRequest(event);
    }
    
    // 跳過非 GET 請求的緩存處理
    if (event.request.method !== 'GET') {
        console.log(`[Service Worker] 跳過非 GET 請求的緩存: ${event.request.method} ${event.request.url}`);
        return;
    }
    
    // 處理一般請求
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 如果在緩存中找到，返回緩存的版本
                if (response) {
                    return response;
                }
                
                // 否則發起網絡請求
                return fetch(event.request)
                    .then(netResponse => {
                        // 檢查是否獲得有效響應
                        if (!netResponse || netResponse.status !== 200 || netResponse.type !== 'basic') {
                            return netResponse;
                        }
                        
                        // 複製響應以同時存入緩存和返回
                        const responseToCache = netResponse.clone();
                        
                        // 只緩存 GET 請求
                        if (event.request.method === 'GET') {
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                            
                        return netResponse;
                    })
                    .catch(error => {
                        // 如果請求失敗且是 HTML 頁面請求，顯示離線頁面
                        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/offline.html');
                        }
                        
                        console.error('[Service Worker] Fetch 失敗:', error);
                        throw error;
                    });
            })
    );
});

// 監聽消息
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        // 強制激活等待中的 Service Worker
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        // 清除所有緩存
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(name => caches.delete(name))
                );
            })
            .then(() => {
                console.log('[Service Worker] 已清除所有緩存');
                
                // 通知清除完成
                self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'CACHE_CLEARED'
                        });
                    });
                });
            });
    }
});

// 檢查請求是否是 API 請求
function isApiRequest(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith('/api/') ||
           request.url.includes('firebase') ||
           request.url.includes('firestore');
}

// 檢查請求是否是版本信息請求
function isVersionInfoRequest(request) {
    return request.url.includes('version-info.json');
}

// 處理版本信息請求
function handleVersionInfoRequest(event) {
    // 首先嘗試從網絡獲取最新版本信息
    event.respondWith(
        fetch(event.request)
            .then(netResponse => {
                // 只有 GET 方法請求才緩存
                if (event.request.method === 'GET') {
                    // 將新版本信息放入緩存
                    const responseToCache = netResponse.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                }
                
                return netResponse;
            })
            .catch(() => {
                // 如果網絡請求失敗，返回緩存的版本信息
                return caches.match(event.request);
            })
    );
} 