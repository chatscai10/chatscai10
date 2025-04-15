/**
 * 訂單頁面邏輯
 * 此檔案提供到正確訂單JS邏輯的重定向
 */

// 重定向到實際的訂單邏輯 JS 檔案
console.log('正在重定向訂單邏輯到 order-logic.js...');

// 檢查是否已載入訂單邏輯
if (typeof initOrderPage !== 'function') {
    console.log('尋找 initOrderPage 函數...');
    
    // 嘗試加載正確的 JS 檔案
    const script = document.createElement('script');
    script.src = 'js/order-logic.js?v=' + (new Date().getTime());
    script.onload = function() {
        console.log('order-logic.js 已成功載入');
    };
    script.onerror = function() {
        console.error('無法載入 order-logic.js');
    };
    
    document.head.appendChild(script);
} 