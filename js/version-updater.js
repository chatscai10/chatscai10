/**
 * 炸雞店管理系統 - 版本更新管理器
 * v1.0.0 - 2025/04/17
 */

'use strict';

// 當前版本
const UPDATER_VERSION = '20250417v3';

// 初始化版本更新檢查
document.addEventListener('DOMContentLoaded', function() {
    console.log(`版本更新管理器已載入，版本: ${UPDATER_VERSION}`);
    
    // 檢查版本信息
    setTimeout(checkForUpdates, 5000);
});

/**
 * 檢查系統更新
 */
async function checkForUpdates() {
    try {
        // 檢查 VERSION_CHECK 是否已經由 version-check.js 加載
        if (typeof window.VERSION_CHECK !== 'undefined') {
            console.log('使用 VERSION_CHECK 模塊檢查更新');
            window.VERSION_CHECK.checkForUpdates();
            return;
        }
        
        // 檢查 APP_VERSION 是否已經由 version.js 加載
        if (typeof window.APP_VERSION !== 'undefined') {
            console.log('使用 APP_VERSION 模塊檢查更新');
            window.APP_VERSION.checkLocalVersion();
            return;
        }
        
        // 自行實現簡單檢查
        console.log('使用簡易版本檢查');
        const response = await fetch('version-info.json?' + Date.now());
        if (!response.ok) {
            throw new Error(`無法獲取版本信息: ${response.status}`);
        }
        
        const versionInfo = await response.json();
        console.log('獲取到版本信息:', versionInfo);
        
        // 比較版本
        const storedVersion = localStorage.getItem('app_version');
        if (storedVersion !== versionInfo.version) {
            console.log(`發現新版本: ${versionInfo.version} (當前: ${storedVersion || '未知'})`);
            
            // 更新本地存儲的版本
            localStorage.setItem('app_version', versionInfo.version);
            localStorage.setItem('app_updated_at', new Date().toISOString());
            
            // 顯示更新通知
            showUpdateNotification(versionInfo);
        } else {
            console.log('已是最新版本');
        }
    } catch (error) {
        console.error('檢查更新時發生錯誤:', error);
    }
}

/**
 * 顯示更新通知
 * @param {Object} versionInfo - 版本信息
 */
function showUpdateNotification(versionInfo) {
    // 創建通知元素
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #007bff;
        color: white;
        padding: 15px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        max-width: 300px;
        transition: all 0.3s ease;
    `;
    
    // 設置通知內容
    notification.innerHTML = `
        <p><strong>系統已更新</strong></p>
        <p>已更新至版本 ${versionInfo.version}</p>
        <p>更新日期: ${versionInfo.releaseDate || '未知'}</p>
        <button id="close-notification" style="background: transparent; border: 1px solid white; color: white; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-top: 5px;">關閉</button>
    `;
    
    // 添加到文檔
    document.body.appendChild(notification);
    
    // 添加關閉事件
    document.getElementById('close-notification').addEventListener('click', function() {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    });
    
    // 5秒後自動淡出
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// 暴露全局函數
window.checkForUpdates = checkForUpdates; 