// js/version-check.js - 版本檢查與更新通知功能

'use strict';

// 當前客戶端版本
// 格式：年月日+版本號，例如: 20250417v1
const CLIENT_VERSION = '20250417v3';

// 版本檢查相關變數
let versionDb = null; // Firestore 實例
let lastVersionCheck = null; // 上次檢查時間戳
let versionCheckInterval = 10 * 60 * 1000; // 預設 10 分鐘檢查一次
let isVersionCheckingEnabled = true; // 版本檢查開關
let versionUpdateModal = null; // 版本更新提示框

// 預設配置，在未找到服務器配置時使用
const DEFAULT_SETTINGS = {
    versionCheckIntervalMinutes: 10,
    enableVersionCheck: true
};

/**
 * 初始化版本檢查系統
 * @param {firebase.firestore.Firestore} db - Firestore 實例
 */
async function initVersionCheck(db) {
    console.log("初始化版本檢查功能...");
    
    try {
        if (!db) {
            console.error("無法初始化版本檢查: 未提供有效的Firestore實例");
            return;
        }
        
        versionDb = db;
        
        // 先取得設定參數
        await loadVersionCheckSettings();
        
        // 創建更新提示對話框
        createVersionUpdateModal();
        
        // 立即執行第一次檢查
        await checkForUpdates();
        
        // 設置定期檢查
        setInterval(checkForUpdates, versionCheckInterval);
        
        console.log(`版本檢查功能初始化完成。客戶端版本: ${CLIENT_VERSION}`);
    } catch (error) {
        console.error("初始化版本檢查時發生錯誤:", error);
        // 使用預設配置，確保基本功能可用
        versionCheckInterval = DEFAULT_SETTINGS.versionCheckIntervalMinutes * 60 * 1000;
        isVersionCheckingEnabled = DEFAULT_SETTINGS.enableVersionCheck;
    }
}

/**
 * 從資料庫載入版本檢查相關設定
 */
async function loadVersionCheckSettings() {
    try {
        if (!versionDb) {
            console.warn("無法載入版本檢查設定: Firestore 未初始化");
            return;
        }
        
        // 嘗試獲取應用配置
        const settingsDoc = await versionDb.collection('settings').doc('app_config').get();
        
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            
            // 獲取檢查間隔 (毫秒)
            if (settings.versionCheckIntervalMinutes) {
                versionCheckInterval = settings.versionCheckIntervalMinutes * 60 * 1000;
                console.log(`版本檢查間隔設為: ${settings.versionCheckIntervalMinutes} 分鐘`);
            }
            
            // 是否啟用版本檢查
            if (typeof settings.enableVersionCheck === 'boolean') {
                isVersionCheckingEnabled = settings.enableVersionCheck;
                console.log(`版本檢查功能狀態: ${isVersionCheckingEnabled ? '啟用' : '禁用'}`);
            }
        } else {
            console.log("找不到應用設定，使用預設版本檢查參數，並嘗試創建默認設定");
            // 使用預設值
            versionCheckInterval = DEFAULT_SETTINGS.versionCheckIntervalMinutes * 60 * 1000;
            isVersionCheckingEnabled = DEFAULT_SETTINGS.enableVersionCheck;
            
            // 嘗試創建默認的應用設定
            try {
                await versionDb.collection('settings').doc('app_config').set({
                    versionCheckIntervalMinutes: DEFAULT_SETTINGS.versionCheckIntervalMinutes,
                    enableVersionCheck: DEFAULT_SETTINGS.enableVersionCheck,
                    systemVersion: "1.5.0", // 與 version-info.json 對應
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log("已創建默認應用配置");
            } catch (createError) {
                console.warn("無法創建默認應用配置:", createError);
            }
        }
    } catch (error) {
        console.error("載入版本檢查設定時發生錯誤:", error);
        // 出錯時使用預設值
        versionCheckInterval = DEFAULT_SETTINGS.versionCheckIntervalMinutes * 60 * 1000;
        isVersionCheckingEnabled = DEFAULT_SETTINGS.enableVersionCheck;
    }
}

/**
 * 檢查系統是否有可用更新
 */
async function checkForUpdates() {
    // 如果禁用了檢查或者最近剛檢查過，則跳過
    if (!isVersionCheckingEnabled || (lastVersionCheck && Date.now() - lastVersionCheck < versionCheckInterval)) {
        return;
    }
    
    console.log("執行版本檢查...");
    lastVersionCheck = Date.now();
    
    try {
        if (!versionDb) {
            console.warn("無法檢查更新: Firestore 未初始化");
            return;
        }
        
        // 從 Firestore 獲取最新版本信息
        const versionDoc = await versionDb.collection('settings').doc('version_info').get();
        
        if (!versionDoc.exists) {
            console.log("找不到版本信息文檔，正在創建初始版本信息");
            
            // 從 version-info.json 讀取數據 (首先嘗試從配置中獲取)
            let appConfigDoc;
            try {
                appConfigDoc = await versionDb.collection('settings').doc('app_config').get();
            } catch (error) {
                console.warn("讀取應用配置時發生錯誤:", error);
            }
            
            // 嘗試從 app_config 獲取系統版本，或使用默認值
            const systemVersion = appConfigDoc?.exists && appConfigDoc.data()?.systemVersion 
                ? appConfigDoc.data().systemVersion 
                : "1.5.0";
            
            // 創建默認的版本信息
            try {
                await versionDb.collection('settings').doc('version_info').set({
                    currentVersion: CLIENT_VERSION,
                    systemVersion: systemVersion,
                    updateNotes: "初始版本",
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    requiredUpdate: false,
                    modules: {
                        CORE: systemVersion,
                        AUTH: "1.3.2",
                        SCHEDULING: "1.4.1",
                        ATTENDANCE: "1.4.0",
                        SALARY: systemVersion
                    },
                    changelog: {
                        [CLIENT_VERSION]: {
                            date: new Date().toISOString().split('T')[0],
                            title: "初始版本",
                            description: "系統初始化",
                            changes: ["系統初始設置"]
                        }
                    }
                });
                console.log("已創建初始版本信息");
                return; // 創建後退出，不需要顯示更新通知
            } catch (createError) {
                console.warn("無法創建初始版本信息:", createError);
                return;
            }
        }
        
        const versionInfo = versionDoc.data();
        const latestVersion = versionInfo.currentVersion;
        
        if (!latestVersion) {
            console.warn("版本信息不完整");
            return;
        }
        
        console.log(`當前客戶端版本: ${CLIENT_VERSION}, 最新版本: ${latestVersion}`);
        
        // 比較版本
        if (isNewerVersion(latestVersion, CLIENT_VERSION)) {
            console.log(`檢測到新版本! 當前: ${CLIENT_VERSION}, 可用: ${latestVersion}`);
            
            // 顯示更新提示
            showUpdateNotification(versionInfo);
        }
    } catch (error) {
        console.error("檢查更新時發生錯誤:", error);
    }
}

/**
 * 判斷服務器版本是否比客戶端版本更新
 * @param {string} serverVersion - 服務器版本
 * @param {string} clientVersion - 客戶端版本
 * @returns {boolean} 如果服務器版本較新則返回 true
 */
function isNewerVersion(serverVersion, clientVersion) {
    if (!serverVersion || !clientVersion) return false;
    
    // 先檢查版本格式是否正確
    const serverMatch = serverVersion.match(/^(\d{8})v(\d+)$/);
    const clientMatch = clientVersion.match(/^(\d{8})v(\d+)$/);
    
    if (!serverMatch || !clientMatch) {
        // 嘗試替代格式 (1.5.0 vs 1.4.0)
        try {
            const serverParts = serverVersion.split('.');
            const clientParts = clientVersion.split('.');
            
            if (serverParts.length === 3 && clientParts.length === 3) {
                for (let i = 0; i < 3; i++) {
                    const sv = parseInt(serverParts[i], 10);
                    const cv = parseInt(clientParts[i], 10);
                    if (sv > cv) return true;
                    if (sv < cv) return false;
                }
                return false; // 版本完全相同
            }
        } catch (e) {
            console.warn("版本格式不正確，無法比較:", serverVersion, clientVersion);
            return false;
        }
        
        // 如果無法解析，默認返回 false
        console.warn("版本格式不正確，無法比較:", serverVersion, clientVersion);
        return false;
    }
    
    const serverDate = parseInt(serverMatch[1], 10);
    const serverSubVersion = parseInt(serverMatch[2], 10);
    const clientDate = parseInt(clientMatch[1], 10);
    const clientSubVersion = parseInt(clientMatch[2], 10);
    
    // 比較日期部分
    if (serverDate > clientDate) return true;
    if (serverDate < clientDate) return false;
    
    // 日期相同，比較子版本號
    return serverSubVersion > clientSubVersion;
}

/**
 * 創建版本更新提示對話框
 */
function createVersionUpdateModal() {
    // 檢查是否已經存在對話框
    if (versionUpdateModal) {
        return;
    }
    
    // 創建模態背景
    const modal = document.createElement('div');
    modal.id = 'version-update-modal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 2000;
        justify-content: center;
        align-items: center;
    `;
    
    // 創建模態內容
    const modalContent = document.createElement('div');
    modalContent.className = 'version-modal-content';
    modalContent.style.cssText = `
        background-color: #fff;
        padding: 20px;
        border-radius: 5px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
    `;
    
    modalContent.innerHTML = `
        <span id="version-modal-close" style="position: absolute; top: 10px; right: 15px; font-size: 20px; cursor: pointer; color: #999;">&times;</span>
        <h3 id="version-update-title" style="margin-top: 0; color: #333;">新版本可用</h3>
        <div id="version-update-content">
            <p>系統已經更新至新版本，請重新整理頁面以獲取最新功能和改進。</p>
        </div>
        <div style="margin-top: 20px; text-align: center;">
            <button id="version-update-now" style="background-color: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 4px; margin-right: 10px; cursor: pointer;">立即更新</button>
            <button id="version-update-later" style="background-color: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">稍後再說</button>
        </div>
    `;
    
    // 添加到文檔
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    versionUpdateModal = modal;
    
    // 添加事件監聽器
    document.getElementById('version-modal-close').addEventListener('click', function() {
        hideUpdateModal();
    });
    
    document.getElementById('version-update-later').addEventListener('click', function() {
        hideUpdateModal();
    });
    
    document.getElementById('version-update-now').addEventListener('click', function() {
        // 重整並清除緩存
        location.reload(true);
    });
}

/**
 * 顯示版本更新提示
 * @param {object} versionInfo - 版本信息
 */
function showUpdateNotification(versionInfo) {
    if (!versionUpdateModal) {
        console.warn("未創建版本更新對話框");
        createVersionUpdateModal();
    }
    
    // 更新對話框內容
    const titleEl = document.getElementById('version-update-title');
    const contentEl = document.getElementById('version-update-content');
    
    if (titleEl && contentEl) {
        // 設置標題和內容
        titleEl.textContent = `新版本可用: ${versionInfo.currentVersion}`;
        
        // 準備內容
        let contentHTML = `<p>系統已更新至新版本，建議立即更新以獲取最新功能。</p>`;
        
        // 添加更新說明
        if (versionInfo.updateNotes) {
            contentHTML += `<p><strong>更新說明:</strong> ${versionInfo.updateNotes}</p>`;
        }
        
        // 添加詳細變更列表
        if (versionInfo.changelog && versionInfo.changelog[versionInfo.currentVersion]) {
            const changelogEntry = versionInfo.changelog[versionInfo.currentVersion];
            
            contentHTML += `<div class="changelog-section">`;
            
            if (changelogEntry.title) {
                contentHTML += `<h4>${changelogEntry.title}</h4>`;
            }
            
            if (changelogEntry.description) {
                contentHTML += `<p>${changelogEntry.description}</p>`;
            }
            
            if (changelogEntry.changes && changelogEntry.changes.length > 0) {
                contentHTML += `<ul style="margin-top: 10px; padding-left: 20px;">`;
                changelogEntry.changes.forEach(change => {
                    contentHTML += `<li>${change}</li>`;
                });
                contentHTML += `</ul>`;
            }
            
            contentHTML += `</div>`;
        }
        
        // 如果是強制更新，更改按鈕文本和樣式
        if (versionInfo.requiredUpdate) {
            contentHTML += `<p style="color: #d9534f; font-weight: bold;">此更新是必要的，您必須更新才能繼續使用系統。</p>`;
            
            // 隱藏"稍後再說"按鈕
            const laterBtn = document.getElementById('version-update-later');
            if (laterBtn) {
                laterBtn.style.display = 'none';
            }
        } else {
            // 顯示"稍後再說"按鈕
            const laterBtn = document.getElementById('version-update-later');
            if (laterBtn) {
                laterBtn.style.display = 'inline-block';
            }
        }
        
        contentEl.innerHTML = contentHTML;
    }
    
    // 顯示對話框
    versionUpdateModal.style.display = 'flex';
}

/**
 * 隱藏版本更新對話框
 */
function hideUpdateModal() {
    if (versionUpdateModal) {
        versionUpdateModal.style.display = 'none';
    }
}

// 暴露公共API
window.VERSION_CHECK = {
    init: initVersionCheck,
    CLIENT_VERSION: CLIENT_VERSION,
    checkForUpdates: checkForUpdates
}; 