// fixes.js - 修復常見問題的腳本
// 版本: 2025-04-18

console.log("正在加載修復腳本 (fixes.js)...");

// 1. 修復 showTemporaryMessage 缺失問題
if (typeof window.showTemporaryMessage !== 'function') {
    window.showTemporaryMessage = function(container, message, type = 'info') {
        console.log(`[修復] 顯示臨時消息: ${message}`);
        if (!container) {
            console.warn('無法顯示臨時消息: 容器為空');
            return;
        }
        
        // 創建消息元素
        const messageElement = document.createElement('div');
        messageElement.className = `alert alert-${type} temp-message`;
        messageElement.textContent = message;
        
        // 添加到容器
        container.appendChild(messageElement);
        
        // 3秒後自動移除
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 3000);
    };
    console.log("[修復] 添加了缺失的 showTemporaryMessage 函數");
}

// 2. 修復 getSystemParameter 重複定義問題
// 創建唯一的全局實現
if (typeof window.getSystemParameterImpl !== 'function') {
    window.getSystemParameterImpl = async function(collection, paramName, defaultValue = '0') {
        const db = window.salaryViewDb || window.db || window.firestore;
        if (!db) {
            console.warn(`無法獲取系統參數 ${collection}.${paramName}: 數據庫未初始化`);
            return defaultValue;
        }
        
        try {
            // 首先嘗試從settings集合獲取
            const docRef = db.collection('settings').doc(collection);
            const doc = await docRef.get();
            
            if (doc.exists && doc.data() && doc.data()[paramName] !== undefined) {
                return doc.data()[paramName];
            }
            
            // 如果未找到，嘗試從system_config集合獲取
            const configRef = db.collection('system_config').doc('parameters');
            const configDoc = await configRef.get();
            
            if (configDoc.exists && configDoc.data() && 
                configDoc.data()[collection] && 
                configDoc.data()[collection][paramName] !== undefined) {
                return configDoc.data()[collection][paramName];
            }
            
            // 如果仍未找到，嘗試從parameters集合獲取 (兼容舊版本)
            const oldDocRef = db.collection('parameters').doc(collection);
            const oldDoc = await oldDocRef.get();
            
            if (oldDoc.exists && oldDoc.data() && oldDoc.data()[paramName] !== undefined) {
                return oldDoc.data()[paramName];
            }
            
            console.warn(`未找到系統參數 ${collection}.${paramName}，使用默認值: ${defaultValue}`);
            return defaultValue;
        } catch (error) {
            console.error(`獲取系統參數 ${collection}.${paramName} 時出錯:`, error);
            return defaultValue; // 出現任何錯誤時返回默認值
        }
    };
    
    // 修復所有可能的函數名稱
    window.getSystemParameter = function(collection, paramName, defaultValue = '0') {
        return window.getSystemParameterImpl(collection, paramName, defaultValue);
    };
    
    window.getSystemParameterNew = function(collection, paramName, defaultValue = '0') {
        return window.getSystemParameterImpl(collection, paramName, defaultValue);
    };
    
    console.log("[修復] 統一了 getSystemParameter 函數實現");
}

// 3. 修復容器查找失敗問題
if (typeof window.findContainerSafely !== 'function') {
    window.findContainerSafely = function(containerId, fallbackSelectors = []) {
        // 首先嘗試使用ID直接查找
        let container = document.getElementById(containerId);
        
        // 如果找不到，嘗試使用querySelector
        if (!container) {
            container = document.querySelector(`#${containerId}`);
        }
        
        // 如果仍然找不到，嘗試fallback選擇器
        if (!container && fallbackSelectors.length > 0) {
            for (const selector of fallbackSelectors) {
                container = document.querySelector(selector);
                if (container) {
                    console.log(`找到容器使用備選選擇器: ${selector}`);
                    break;
                }
            }
        }
        
        // 如果所有嘗試都失敗，顯示詳細的調試信息
        if (!container) {
            console.error(`找不到容器: #${containerId}，嘗試了以下備選: ${fallbackSelectors.join(', ')}`);
            // 打印所有可能的父級容器，以幫助調試
            const allDivs = document.querySelectorAll('div[id]');
            if (allDivs.length > 0) {
                console.log('頁面上的所有div元素ID:');
                Array.from(allDivs).forEach(div => {
                    console.log(` - ${div.id}`);
                });
            }
        }
        
        return container;
    };
    console.log("[修復] 添加了 findContainerSafely 函數，用於健壯的容器查找");
}

// 4. 修改loadAvailableBonusTasksSection函數，使用更健壯的容器查找
// 這個修復需要在salary-view-logic.js完全載入後執行
if (typeof window.loadAvailableBonusTasksSection === 'function') {
    // 保存原始函數
    const originalLoadBonusTasks = window.loadAvailableBonusTasksSection;
    
    // 替換為增強版本
    window.loadAvailableBonusTasksSection = async function() {
        const containerId = 'available-bonus-tasks';
        
        // 使用更健壯的方法獲取容器
        const fallbackSelectors = [
            '#available-bonus-tasks .section-content',
            '.section-content',
            '.info-section',
            '#bonus-history', // 嘗試相鄰容器
            'body' // 最後的備選
        ];
        
        const container = window.findContainerSafely(containerId, fallbackSelectors);
        
        // 如果找不到容器，創建一個臨時容器
        if (!container) {
            console.warn("無法找到bonus任務容器，創建臨時容器");
            const tempContainer = document.createElement('div');
            tempContainer.id = 'temp-bonus-tasks-container';
            document.body.appendChild(tempContainer);
            
            // 調用原始函數，但容器可能還是無法使用
            try {
                await originalLoadBonusTasks();
            } catch (error) {
                console.error("調用原始loadAvailableBonusTasksSection函數失敗:", error);
                tempContainer.innerHTML = '<p class="error-message">載入任務列表時發生錯誤</p>';
            }
            return;
        }
        
        // 如果找到容器，正常調用原始函數
        return await originalLoadBonusTasks();
    };
    
    console.log("[修復] 增強了 loadAvailableBonusTasksSection 函數的容器查找");
}

console.log("修復腳本 (fixes.js) 載入完成"); 