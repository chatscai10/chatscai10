// js/admin-performance-config.js - 業績參數設定區塊邏輯 (佔位符)

'use strict';

/**
 * 載入業績參數設定區塊 (顯示提示訊息)
 * @param {HTMLElement} container - 內容容器 (#section-performance-config .section-content)
 */
async function loadPerformanceConfigSection(container) {
    console.log("Executing loadPerformanceConfigSection (in admin-performance-config.js)...");

    // 確保 container 存在
    if (!container) {
        console.error("Content container not found for performance config section.");
        return;
    }

    // 顯示提示訊息，因為規格未定義具體內容
    container.innerHTML = `
        <p style="color: orange;">
            <strong>此功能尚未定義</strong>
        </p>
        <p>
            需要先在系統規格中明確定義「業績參數」包含哪些具體的設定項目以及它們如何儲存 (例如，在哪個 Firestore collection 或文件中)，然後才能實作此管理介面。
        </p>
        <p>
            例如：可能需要設定每月業績目標、達成率計算方式、重點產品指標等。請先釐清需求。
        </p>
    `;

    // 確保 loadedSections 存在 (來自 admin-logic.js)
    if (typeof loadedSections !== 'undefined') {
        loadedSections.add('performance-config'); // 標記為已載入 (即使只是顯示訊息)
    }
    console.log("Performance config section loaded (placeholder message shown).");
}

console.log("admin-performance-config.js loaded");