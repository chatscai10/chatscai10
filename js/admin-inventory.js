// js/admin-inventory.js - 管理員庫存盤點管理功能
'use strict';

// --- 模組作用域變數 ---
let inventoryAdminDb = null;
let inventoryAdminUser = null;
let inventoryAdminSection = null;
let selectedMonth = '';
let selectedStore = '';

/**
 * 初始化庫存管理模組
 * @param {HTMLElement} sectionContainer - 管理員區塊容器
 * @param {firebase.firestore.Firestore} db - Firestore 實例
 * @param {Object} user - 當前登入的管理員
 */
async function initInventoryAdmin(sectionContainer, db, user) {
    console.log("初始化庫存管理模組...");
    inventoryAdminDb = db;
    inventoryAdminUser = user;
    inventoryAdminSection = sectionContainer;

    try {
        // 檢查用戶權限
        if (user.level < 9) {
            sectionContainer.innerHTML = '<p class="error-message">您的權限不足，無法訪問庫存管理功能</p>';
            return;
        }

        // 確保已載入CSS樣式
        ensureInventoryStylesLoaded();

        // 渲染主介面
        renderInventoryAdminInterface();

        // 載入當前月份
        const now = new Date();
        selectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // 綁定事件處理器
        setupEventListeners();

        // 載入初始數據
        await loadInventorySummary();

        console.log("庫存管理模組初始化完成");
    } catch (error) {
        console.error("初始化庫存管理模組錯誤:", error);
        sectionContainer.innerHTML = `<p class="error-message">初始化庫存管理模組失敗: ${error.message}</p>`;
    }
}

/**
 * 確保已載入CSS樣式
 */
function ensureInventoryStylesLoaded() {
    // 確保主要庫存盤點CSS已載入
    if (!document.getElementById('inventory-check-styles')) {
        const cssLink = document.createElement('link');
        cssLink.id = 'inventory-check-styles';
        cssLink.rel = 'stylesheet';
        cssLink.href = 'css/inventory-check.css';
        document.head.appendChild(cssLink);
        console.log("已載入庫存盤點主要樣式");
    }
    
    // 確保管理員特定樣式已載入
    if (!document.getElementById('inventory-admin-styles')) {
        const style = document.createElement('style');
        style.id = 'inventory-admin-styles';
        style.textContent = `
            .inventory-admin-container {
                padding: 15px;
            }
            
            .inventory-admin-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                margin-bottom: 20px;
                align-items: flex-end;
            }
            
            .inventory-filter {
                flex: 1;
                min-width: 200px;
            }
            
            .inventory-actions {
                display: flex;
                gap: 10px;
            }
            
            .inventory-summary-panel, .inventory-details-panel {
                background-color: #fff;
                border-radius: 6px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                margin-bottom: 20px;
                padding: 15px;
            }
            
            .inventory-summary-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .refresh-btn {
                cursor: pointer;
                font-size: 18px;
                color: #666;
                transition: transform 0.3s ease;
            }
            
            .refresh-btn:hover {
                color: #007bff;
                transform: rotate(180deg);
            }
            
            /* Admin-specific styles not in the main CSS */
            .inventory-stats {
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
                margin-bottom: 20px;
            }
            
            .inventory-stat-item {
                background-color: #f8f9fa;
                border-radius: 4px;
                padding: 10px 15px;
                min-width: 150px;
            }
            
            .stat-label {
                display: block;
                font-size: 0.85em;
                color: #666;
                margin-bottom: 5px;
            }
            
            .stat-value {
                font-size: 1.2em;
                font-weight: bold;
                color: #333;
            }
            
            .stat-value.completed {
                color: #28a745;
            }
            
            .stat-value.pending {
                color: #dc3545;
            }
            
            .stores-completion-list {
                margin-top: 25px;
            }
            
            .stores-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 10px;
                margin-top: 10px;
            }
            
            .store-item {
                padding: 10px;
                border-radius: 4px;
                background-color: #f8f9fa;
                transition: all 0.2s ease;
            }
            
            .store-item.completed {
                border-left: 3px solid #28a745;
                cursor: pointer;
            }
            
            .store-item.pending {
                border-left: 3px solid #dc3545;
                opacity: 0.7;
            }
            
            .store-item.completed:hover {
                background-color: #e9ecef;
                transform: translateY(-2px);
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            
            .store-name {
                font-weight: bold;
                margin-bottom: 5px;
            }
            
            .check-date {
                font-size: 0.85em;
                color: #666;
            }
            
            .inventory-detail-header {
                margin-bottom: 20px;
            }
            
            .inventory-meta {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                color: #666;
                margin-top: 5px;
                font-size: 0.9em;
            }
            
            .imported-tag {
                background-color: #17a2b8;
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 0.8em;
            }
        `;
        document.head.appendChild(style);
        console.log("已載入庫存管理員樣式");
    }
}

/**
 * 渲染庫存管理主介面
 */
function renderInventoryAdminInterface() {
    const html = `
    <div class="inventory-admin-container">
        <h3>庫存盤點管理</h3>
        
        <div class="inventory-admin-controls">
            <div class="inventory-filter">
                <label for="inventory-month-select">選擇月份:</label>
                <select id="inventory-month-select" class="form-control">
                    ${generateMonthOptions()}
                </select>
            </div>
            
            <div class="inventory-filter">
                <label for="inventory-store-select">選擇分店:</label>
                <select id="inventory-store-select" class="form-control">
                    <option value="">所有分店</option>
                    <!-- 分店選項將動態載入 -->
                </select>
            </div>
            
            <div class="inventory-actions">
                <button id="export-inventory-btn" class="btn btn-primary">匯出盤點資料</button>
                <label for="import-inventory-file" class="btn btn-success">匯入盤點資料</label>
                <input type="file" id="import-inventory-file" accept=".csv" style="display: none;">
            </div>
        </div>
        
        <div class="inventory-summary-panel">
            <div class="inventory-summary-header">
                <h4>盤點摘要</h4>
                <span id="inventory-refresh-btn" class="refresh-btn" title="重新載入">&#x21bb;</span>
            </div>
            <div id="inventory-summary-content">
                <p class="loading-placeholder">載入中...</p>
            </div>
        </div>
        
        <div class="inventory-details-panel">
            <h4>盤點詳情</h4>
            <div id="inventory-details-content">
                <p class="empty-placeholder">請在上方選擇分店以查看詳細盤點資料</p>
            </div>
        </div>
        
        <div id="inventory-import-result" class="import-result" style="display: none;">
            <div class="import-result-header">
                <h4>匯入結果</h4>
                <span class="close-btn" onclick="document.getElementById('inventory-import-result').style.display='none'">×</span>
            </div>
            <div id="import-result-content"></div>
        </div>
    </div>`;
    
    inventoryAdminSection.innerHTML = html;
}

/**
 * 生成月份選項
 * @returns {string} 月份選項的HTML
 */
function generateMonthOptions() {
    const now = new Date();
    let html = '';
    
    // 生成當月和過去11個月的選項
    for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        const monthDisplay = `${year}年${month}月`;
        
        html += `<option value="${monthStr}" ${i === 0 ? 'selected' : ''}>${monthDisplay}</option>`;
    }
    
    return html;
}

/**
 * 設置事件監聽器
 */
function setupEventListeners() {
    // 月份選擇
    const monthSelect = document.getElementById('inventory-month-select');
    if (monthSelect) {
        monthSelect.addEventListener('change', () => {
            selectedMonth = monthSelect.value;
            loadInventorySummary();
        });
    }
    
    // 分店選擇
    const storeSelect = document.getElementById('inventory-store-select');
    if (storeSelect) {
        storeSelect.addEventListener('change', () => {
            selectedStore = storeSelect.value;
            if (selectedStore) {
                loadInventoryDetails(selectedStore, selectedMonth);
            } else {
                const detailsContent = document.getElementById('inventory-details-content');
                if (detailsContent) {
                    detailsContent.innerHTML = '<p class="empty-placeholder">請選擇分店以查看詳細盤點資料</p>';
                }
            }
        });
    }
    
    // 匯出按鈕
    const exportBtn = document.getElementById('export-inventory-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExportInventory);
    }
    
    // 匯入檔案
    const importFile = document.getElementById('import-inventory-file');
    if (importFile) {
        importFile.addEventListener('change', handleImportInventory);
    }
    
    // 重新整理按鈕
    const refreshBtn = document.getElementById('inventory-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadInventorySummary());
    }
}

/**
 * 載入庫存盤點摘要
 */
async function loadInventorySummary() {
    const summaryContent = document.getElementById('inventory-summary-content');
    if (!summaryContent) return;
    
    summaryContent.innerHTML = '<p class="loading-placeholder">載入盤點摘要數據中...</p>';
    
    try {
        // 計算月份ID
        const monthId = `inventory-${selectedMonth}`;
        
        // 查詢盤點記錄
        const checksQuery = await inventoryAdminDb.collection('inventory_checks')
            .where('monthId', '==', monthId)
            .where('status', '==', 'completed')
            .get();
        
        if (checksQuery.empty) {
            summaryContent.innerHTML = `<p class="empty-placeholder">沒有找到 ${selectedMonth} 的盤點記錄</p>`;
            
            // 清空分店選擇
            const storeSelect = document.getElementById('inventory-store-select');
            if (storeSelect) {
                storeSelect.innerHTML = '<option value="">所有分店</option>';
            }
            
            return;
        }
        
        // 處理盤點記錄
        const completedStores = [];
        const checkDates = {};
        let totalItemCount = 0;
        
        checksQuery.forEach(doc => {
            const data = doc.data();
            if (data.store) {
                completedStores.push(data.store);
                
                // 記錄盤點日期
                if (data.checkDate) {
                    const checkDate = data.checkDate.toDate ? data.checkDate.toDate() : new Date(data.checkDate);
                    checkDates[data.store] = checkDate.toLocaleDateString();
                }
                
                // 計算物品總數
                if (data.items && Array.isArray(data.items)) {
                    totalItemCount += data.items.length;
                }
            }
        });
        
        // 獲取所有分店列表
        const allStores = await loadAllStores();
        const pendingStores = allStores.filter(store => !completedStores.includes(store));
        
        // 更新分店選擇器
        updateStoreSelect(completedStores);
        
        // 生成摘要HTML
        let html = `
        <div class="inventory-stats">
            <div class="inventory-stat-item">
                <span class="stat-label">月份:</span>
                <span class="stat-value">${selectedMonth}</span>
            </div>
            <div class="inventory-stat-item">
                <span class="stat-label">已完成分店:</span>
                <span class="stat-value completed">${completedStores.length}</span>
            </div>
            <div class="inventory-stat-item">
                <span class="stat-label">待盤點分店:</span>
                <span class="stat-value pending">${pendingStores.length}</span>
            </div>
            <div class="inventory-stat-item">
                <span class="stat-label">物品記錄總數:</span>
                <span class="stat-value">${totalItemCount}</span>
            </div>
        </div>
        
        <div class="stores-completion-list">
            <div class="completed-stores">
                <h5>已完成盤點的分店</h5>
                <div class="stores-grid">`;
        
        // 排序分店名稱
        completedStores.sort();
        
        // 添加已完成的分店
        completedStores.forEach(store => {
            html += `
                <div class="store-item completed" data-store="${store}">
                    <div class="store-name">${store}</div>
                    <div class="check-date">${checkDates[store] || '未知日期'}</div>
                </div>`;
        });
        
        html += `
                </div>
            </div>`;
        
        // 如果有待盤點的分店，也顯示出來
        if (pendingStores.length > 0) {
            html += `
            <div class="pending-stores">
                <h5>未完成盤點的分店</h5>
                <div class="stores-grid">`;
            
            pendingStores.forEach(store => {
                html += `
                <div class="store-item pending">
                    <div class="store-name">${store}</div>
                    <div class="check-date">尚未盤點</div>
                </div>`;
            });
            
            html += `
                </div>
            </div>`;
        }
        
        html += `</div>`;
        
        // 更新DOM
        summaryContent.innerHTML = html;
        
        // 綁定點擊事件
        const storeItems = summaryContent.querySelectorAll('.store-item.completed');
        storeItems.forEach(item => {
            item.addEventListener('click', () => {
                const storeName = item.dataset.store;
                // 更新選擇器並載入詳情
                const storeSelect = document.getElementById('inventory-store-select');
                if (storeSelect) {
                    storeSelect.value = storeName;
                    selectedStore = storeName;
                    loadInventoryDetails(selectedStore, selectedMonth);
                }
            });
        });
        
    } catch (error) {
        console.error("載入盤點摘要錯誤:", error);
        summaryContent.innerHTML = `<p class="error-message">載入盤點摘要失敗: ${error.message}</p>`;
    }
}

/**
 * 載入所有分店列表
 * @returns {Promise<Array<string>>} 分店名稱陣列
 */
async function loadAllStores() {
    try {
        const storeListDoc = await inventoryAdminDb.collection('settings').doc('store_config').get();
        const storeListData = storeListDoc.exists ? storeListDoc.data() : {};
        const storeListString = storeListData.storeListString || '';
        
        // 解析分店字符串
        if (!storeListString) return [];
        
        const stores = [];
        const storeEntries = storeListString.split(';');
        
        for (const entry of storeEntries) {
            if (!entry.trim()) continue;
            
            // 提取分店名 (等號前的部分)
            const storeName = entry.split('=')[0].trim();
            if (storeName) {
                // 從名稱中移除數字 (如果包含人數要求)
                const cleanStoreName = storeName.replace(/\d+$/, '').trim();
                stores.push(cleanStoreName);
            }
        }
        
        return stores.sort();
    } catch (error) {
        console.error("載入分店列表錯誤:", error);
        return [];
    }
}

/**
 * 更新分店選擇器
 * @param {Array<string>} completedStores - 已完成盤點的分店列表
 */
function updateStoreSelect(completedStores) {
    const storeSelect = document.getElementById('inventory-store-select');
    if (!storeSelect) return;
    
    // 保存當前選中的值
    const currentValue = storeSelect.value;
    
    // 清空選項
    storeSelect.innerHTML = '<option value="">所有分店</option>';
    
    // 添加已完成盤點的分店
    completedStores.sort().forEach(store => {
        const option = document.createElement('option');
        option.value = store;
        option.textContent = store;
        storeSelect.appendChild(option);
    });
    
    // 嘗試恢復之前的選擇
    if (currentValue && completedStores.includes(currentValue)) {
        storeSelect.value = currentValue;
    } else {
        // 重置選擇的分店
        selectedStore = '';
    }
}

/**
 * 載入分店盤點詳情
 * @param {string} store - 分店名稱
 * @param {string} yearMonth - 年月 (YYYY-MM)
 */
async function loadInventoryDetails(store, yearMonth) {
    const detailsContent = document.getElementById('inventory-details-content');
    if (!detailsContent) return;
    
    detailsContent.innerHTML = '<p class="loading-placeholder">載入盤點詳情中...</p>';
    
    try {
        // 計算月份ID
        const monthId = `inventory-${yearMonth}`;
        const docId = `${monthId}-${store}`;
        
        // 查詢盤點記錄
        const docRef = inventoryAdminDb.collection('inventory_checks').doc(docId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            detailsContent.innerHTML = `<p class="empty-placeholder">找不到 ${store} 在 ${yearMonth} 的盤點記錄</p>`;
            return;
        }
        
        const data = doc.data();
        
        // 準備詳情HTML
        let html = `
        <div class="inventory-detail-header">
            <h5>${store} - ${yearMonth} 盤點詳情</h5>
            <div class="inventory-meta">
                <span>盤點日期: ${data.checkDate ? data.checkDate.toDate().toLocaleDateString() : '未知'}</span>
                <span>盤點人員: ${data.userName || '未知'}</span>
                ${data.isImported ? '<span class="imported-tag">匯入資料</span>' : ''}
            </div>
        </div>`;
        
        // 檢查是否有物品資料
        if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
            html += '<p class="empty-placeholder">此盤點記錄沒有包含物品資料</p>';
            detailsContent.innerHTML = html;
            return;
        }
        
        // 按類別整理物品
        const itemsByCategory = {};
        data.items.forEach(item => {
            const category = item.category || '未分類';
            if (!itemsByCategory[category]) {
                itemsByCategory[category] = [];
            }
            itemsByCategory[category].push(item);
        });
        
        // 添加物品表格
        html += `<div class="inventory-categories">`;
        
        // 對類別排序
        const sortedCategories = Object.keys(itemsByCategory).sort();
        
        sortedCategories.forEach(category => {
            html += `
            <div class="inventory-category-section">
                <h6>${category}</h6>
                <table class="inventory-items-table">
                    <thead>
                        <tr>
                            <th>品項名稱</th>
                            <th>數量</th>
                            <th>單位</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            // 對類別內物品排序
            const sortedItems = itemsByCategory[category].sort((a, b) => a.name.localeCompare(b.name));
            
            sortedItems.forEach(item => {
                html += `
                <tr>
                    <td>${item.name || '未知品項'}</td>
                    <td>${item.count || 0}</td>
                    <td>${item.unit || '-'}</td>
                </tr>`;
            });
            
            html += `
                    </tbody>
                </table>
            </div>`;
        });
        
        html += `</div>`;
        
        // 更新DOM
        detailsContent.innerHTML = html;
        
    } catch (error) {
        console.error("載入盤點詳情錯誤:", error);
        detailsContent.innerHTML = `<p class="error-message">載入盤點詳情失敗: ${error.message}</p>`;
    }
}

/**
 * 處理匯出庫存盤點資料
 */
async function handleExportInventory() {
    try {
        if (typeof window.exportInventoryDataToCsv !== 'function') {
            throw new Error("匯出功能未載入，請確認 inventory-check.js 已正確載入");
        }
        
        // 顯示匯出中狀態
        const exportBtn = document.getElementById('export-inventory-btn');
        const originalText = exportBtn.textContent;
        exportBtn.textContent = '匯出中...';
        exportBtn.disabled = true;
        
        // 調用匯出函數
        const csvContent = await window.exportInventoryDataToCsv(selectedStore, selectedMonth);
        
        // 生成檔案名稱
        const fileName = selectedStore
            ? `${selectedStore}_${selectedMonth}_inventory.csv`
            : `${selectedMonth}_inventory_all_stores.csv`;
        
        // 調用下載函數
        window.downloadCsv(csvContent, fileName);
        
        // 恢復按鈕狀態
        exportBtn.textContent = originalText;
        exportBtn.disabled = false;
        
    } catch (error) {
        console.error("匯出庫存盤點資料錯誤:", error);
        alert(`匯出失敗: ${error.message}`);
        
        // 恢復按鈕狀態
        const exportBtn = document.getElementById('export-inventory-btn');
        if (exportBtn) {
            exportBtn.textContent = '匯出盤點資料';
            exportBtn.disabled = false;
        }
    }
}

/**
 * 處理匯入庫存盤點資料
 */
async function handleImportInventory() {
    const fileInput = document.getElementById('import-inventory-file');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
    
    try {
        if (typeof window.importInventoryDataFromCsv !== 'function') {
            throw new Error("匯入功能未載入，請確認 inventory-check.js 已正確載入");
        }
        
        const file = fileInput.files[0];
        
        // 檢查檔案類型
        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            throw new Error("請選擇CSV檔案");
        }
        
        // 顯示匯入中狀態
        const importResultContainer = document.getElementById('inventory-import-result');
        const importResultContent = document.getElementById('import-result-content');
        
        if (importResultContainer && importResultContent) {
            importResultContent.innerHTML = '<p class="loading-placeholder">正在匯入資料...</p>';
            importResultContainer.style.display = 'block';
        }
        
        // 調用匯入函數
        const result = await window.importInventoryDataFromCsv(file);
        
        // 顯示結果
        if (importResultContent) {
            let html = `
            <div class="import-summary">
                <div class="import-stat">
                    <span class="stat-label">總行數:</span>
                    <span class="stat-value">${result.total}</span>
                </div>
                <div class="import-stat">
                    <span class="stat-label">成功導入:</span>
                    <span class="stat-value success">${result.imported}</span>
                </div>
                <div class="import-stat">
                    <span class="stat-label">跳過行數:</span>
                    <span class="stat-value error">${result.skipped}</span>
                </div>
            </div>`;
            
            // 如果有錯誤，顯示錯誤詳情
            if (result.errors && result.errors.length > 0) {
                html += `
                <div class="import-errors">
                    <h6>錯誤詳情</h6>
                    <ul>`;
                
                result.errors.forEach(error => {
                    html += `<li>${error}</li>`;
                });
                
                html += `
                    </ul>
                </div>`;
            }
            
            // 如果有成功導入的資料，顯示摘要
            if (result.details && result.details.length > 0) {
                html += `
                <div class="import-details">
                    <h6>成功導入的資料</h6>
                    <table class="import-details-table">
                        <thead>
                            <tr>
                                <th>分店</th>
                                <th>月份</th>
                                <th>物品數</th>
                                <th>狀態</th>
                            </tr>
                        </thead>
                        <tbody>`;
                
                result.details.forEach(detail => {
                    html += `
                    <tr>
                        <td>${detail.store}</td>
                        <td>${detail.monthId.replace('inventory-', '')}</td>
                        <td>${detail.itemCount}</td>
                        <td>${detail.status}</td>
                    </tr>`;
                });
                
                html += `
                        </tbody>
                    </table>
                </div>`;
            }
            
            // 添加關閉按鈕
            html += `
            <div class="import-actions">
                <button class="btn btn-primary" onclick="document.getElementById('inventory-import-result').style.display='none'">關閉</button>
                <button class="btn btn-success" onclick="loadInventorySummary()">重新載入資料</button>
            </div>`;
            
            importResultContent.innerHTML = html;
        }
        
        // 重置檔案輸入
        fileInput.value = '';
        
    } catch (error) {
        console.error("匯入庫存盤點資料錯誤:", error);
        
        // 顯示錯誤
        const importResultContainer = document.getElementById('inventory-import-result');
        const importResultContent = document.getElementById('import-result-content');
        
        if (importResultContainer && importResultContent) {
            importResultContent.innerHTML = `
            <div class="import-error">
                <p class="error-message">匯入失敗: ${error.message}</p>
                <div class="import-actions">
                    <button class="btn btn-primary" onclick="document.getElementById('inventory-import-result').style.display='none'">關閉</button>
                </div>
            </div>`;
            importResultContainer.style.display = 'block';
        } else {
            alert(`匯入失敗: ${error.message}`);
        }
        
        // 重置檔案輸入
        fileInput.value = '';
    }
}

// 導出主要函數
window.initInventoryAdmin = initInventoryAdmin;

console.log("admin-inventory.js 模組載入完成"); 