/**
 * 炸雞店管理系統 - 版本檢查器
 * v1.0.0 - 2025/04/15
 * 
 * 此文件用於檢查應用版本並提示用戶更新緩存
 */

document.addEventListener('DOMContentLoaded', function() {
    // 確保APP_VERSION已經載入
    if (typeof APP_VERSION === 'undefined') {
        console.error('無法載入版本信息，請確保已引入version.js');
        return;
    }
    
    // 檢查版本
    const needsUpdate = APP_VERSION.checkLocalVersion();
    
    // 如果需要更新，顯示通知
    if (needsUpdate) {
        showUpdateNotification();
    }
    
    // 檢查移動設備的緩存問題
    checkMobileCacheIssues();
});

/**
 * 顯示更新通知
 */
function showUpdateNotification() {
    // 檢查是否為首次加載或者重大版本更新
    const lastVersion = localStorage.getItem('app_previous_version');
    const isFirstLoad = !lastVersion;
    const isMajorUpdate = lastVersion && APP_VERSION.MAJOR > parseInt(lastVersion.split('.')[0], 10);
    
    // 保存舊版本號，用於下次比較
    localStorage.setItem('app_previous_version', APP_VERSION.VERSION_STRING);
    
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
    if (isFirstLoad) {
        notification.innerHTML = `
            <p><strong>歡迎使用炸雞店管理系統</strong></p>
            <p>當前版本: ${APP_VERSION.VERSION_STRING}</p>
            <p>最後更新: ${APP_VERSION.LAST_UPDATE}</p>
            <button id="close-notification" style="background: transparent; border: 1px solid white; color: white; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-top: 5px;">關閉</button>
        `;
    } else if (isMajorUpdate) {
        notification.innerHTML = `
            <p><strong>系統已更新至新版本!</strong></p>
            <p>版本號: ${APP_VERSION.VERSION_STRING}</p>
            <p>主要更新:</p>
            <ul style="margin: 5px 0; padding-left: 20px;">
                <li>系統架構優化</li>
                <li>新增功能與改進</li>
                <li>界面體驗提升</li>
            </ul>
            <button id="view-changelog" style="background: white; border: none; color: #007bff; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">查看詳情</button>
            <button id="close-notification" style="background: transparent; border: 1px solid white; color: white; padding: 5px 10px; border-radius: 3px; cursor: pointer;">關閉</button>
        `;
    } else {
        notification.innerHTML = `
            <p><strong>系統已更新</strong></p>
            <p>已更新至版本 ${APP_VERSION.VERSION_STRING}</p>
            <button id="close-notification" style="background: transparent; border: 1px solid white; color: white; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-top: 5px;">關閉</button>
        `;
    }
    
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
    
    // 添加查看變更日誌事件
    const viewChangelogBtn = document.getElementById('view-changelog');
    if (viewChangelogBtn) {
        viewChangelogBtn.addEventListener('click', function() {
            window.location.href = 'changelog.html';
        });
    }
    
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

/**
 * 檢查移動設備的緩存問題
 */
function checkMobileCacheIssues() {
    // 檢測是否為移動設備
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // 在移動設備上，檢查文件是否最新版本
        const lastChecked = localStorage.getItem('last_version_check');
        const now = new Date().getTime();
        
        // 如果從未檢查過或者上次檢查超過12小時
        if (!lastChecked || now - parseInt(lastChecked, 10) > 12 * 60 * 60 * 1000) {
            // 向伺服器請求版本信息
            fetch('version-info.json?' + now)
                .then(response => response.json())
                .then(data => {
                    // 檢查是否有更新
                    if (APP_VERSION.needsUpdate(APP_VERSION.VERSION_STRING, data.version)) {
                        // 如果有更新，顯示強制刷新的彈窗
                        showForceRefreshDialog(data.version);
                    }
                    // 更新最後檢查時間
                    localStorage.setItem('last_version_check', now.toString());
                })
                .catch(error => {
                    console.error('檢查版本更新失敗:', error);
                });
        }
    }
}

/**
 * 顯示強制刷新對話框
 * @param {string} newVersion - 新版本號
 */
function showForceRefreshDialog(newVersion) {
    // 創建模態背景
    const modalBackground = document.createElement('div');
    modalBackground.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1001;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    
    // 創建模態內容
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background-color: white;
        padding: 20px;
        border-radius: 5px;
        max-width: 80%;
        width: 320px;
        text-align: center;
    `;
    
    modalContent.innerHTML = `
        <h3 style="margin-top: 0;">發現新版本</h3>
        <p>系統已更新至版本 ${newVersion}</p>
        <p>請刷新頁面以獲取最新功能和改進</p>
        <button id="refresh-now" style="background-color: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 3px; cursor: pointer; margin-top: 10px;">立即刷新</button>
    `;
    
    // 添加到文檔
    modalBackground.appendChild(modalContent);
    document.body.appendChild(modalBackground);
    
    // 添加刷新事件
    document.getElementById('refresh-now').addEventListener('click', function() {
        // 清除緩存後刷新
        window.location.reload(true);
    });
} 