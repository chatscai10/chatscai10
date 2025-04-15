// js/inventory-check.js - 每月底庫存盤點功能
'use strict';

// --- 模組作用域變數 ---
let inventoryDb = null;
let inventoryCurrentUser = null;
let inventoryItems = [];
let pendingStores = [];
let completedStores = [];
let isMonthEndPeriod = false;

// DOM 元素參考
let inventoryModalElement = null;
let inventoryFormElement = null;
let inventoryListElement = null;
let inventoryMessageElement = null;
let storeSubmitButton = null;

/**
 * 初始化庫存盤點模組
 * @param {Object} currentUser - 當前登入的使用者物件
 * @param {firebase.firestore.Firestore} db - Firestore 實例
 */
async function initInventoryCheck(currentUser, db) {
    console.log("初始化庫存盤點模組...");
    inventoryDb = db;
    inventoryCurrentUser = currentUser;

    // 確保已載入CSS樣式
    ensureStylesLoaded();
    
    // 創建並插入庫存盤點彈窗 (如果尚未存在)
    createInventoryModal();
    
    // 獲取並綁定 DOM 元素
    inventoryModalElement = document.getElementById('inventory-check-modal');
    inventoryFormElement = document.getElementById('inventory-check-form');
    inventoryListElement = document.getElementById('inventory-items-list');
    inventoryMessageElement = document.getElementById('inventory-check-message');
    storeSubmitButton = document.getElementById('submit-inventory-check');

    if (!inventoryModalElement || !inventoryFormElement || !inventoryListElement || !inventoryMessageElement || !storeSubmitButton) {
        console.error("無法找到庫存盤點所需的DOM元素");
        return;
    }

    // 綁定事件處理器
    storeSubmitButton.addEventListener('click', handleSubmitInventory);
    document.getElementById('close-inventory-modal').addEventListener('click', () => closeInventoryModal());

    // 檢查是否為月底盤點期間
    await checkIfMonthEndPeriod();
    
    // 如果是月底盤點期間，設置按鈕和通知
    if (isMonthEndPeriod) {
        setupInventoryButton();
        
        // 延遲1秒後檢查是否需要提醒用戶
        setTimeout(() => checkAndNotifyInventory(), 1000);
    }
    
    console.log("庫存盤點模組初始化完成");
}

/**
 * 確保已載入CSS樣式
 */
function ensureStylesLoaded() {
    if (!document.getElementById('inventory-check-styles')) {
        const cssLink = document.createElement('link');
        cssLink.id = 'inventory-check-styles';
        cssLink.rel = 'stylesheet';
        cssLink.href = 'css/inventory-check.css';
        document.head.appendChild(cssLink);
        console.log("已載入庫存盤點樣式");
    }
}

/**
 * 創建庫存盤點彈窗HTML並添加到頁面
 */
function createInventoryModal() {
    // 檢查是否已存在
    if (document.getElementById('inventory-check-modal')) {
        return;
    }
    
    const modalHTML = `
    <div id="inventory-check-modal" class="modal inventory-modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>月底庫存盤點</h3>
                <span id="close-inventory-modal" class="modal-close-btn">&times;</span>
            </div>
            <p class="inventory-intro">請確認以下庫存數量，完成後按下「提交盤點結果」按鈕。</p>
            <p id="inventory-check-store-name" class="inventory-store-name"></p>
            
            <form id="inventory-check-form">
                <div id="inventory-items-list" class="inventory-items-list">
                    <p class="loading-placeholder">正在載入庫存項目...</p>
                </div>
                
                <p id="inventory-check-message" class="message"></p>
                
                <div class="inventory-actions">
                    <button type="button" id="submit-inventory-check" class="btn btn-primary">提交盤點結果</button>
                </div>
            </form>
        </div>
    </div>`;
    
    // 添加到頁面
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * 檢查是否為月底盤點期間
 */
async function checkIfMonthEndPeriod() {
    try {
        // 獲取當前日期
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;  // 月份從0開始
        const currentDay = now.getDate();
        
        // 獲取當月最後一天 (處理閏年二月等特殊情況)
        const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
        
        // 檢查是否為月底前3天或月初第1天 (允許跨月補盤)
        isMonthEndPeriod = (currentDay >= lastDayOfMonth - 2) || (currentDay === 1);
        
        // 若非測試環境，也可從 Firestore 獲取盤點設定
        try {
            const settingsDoc = await inventoryDb.collection('settings').doc('inventory_check').get();
            if (settingsDoc.exists) {
                const settings = settingsDoc.data();
                
                // 如果資料庫中有明確設置盤點期間，則優先使用
                if (settings.isCheckPeriodActive !== undefined) {
                    isMonthEndPeriod = settings.isCheckPeriodActive;
                }
                
                // 可選：獲取自定義盤點天數範圍
                if (settings.daysBeforeMonthEnd) {
                    isMonthEndPeriod = (currentDay >= lastDayOfMonth - settings.daysBeforeMonthEnd) || 
                                       (currentDay <= settings.daysAfterMonthStart || 0);
                }
            }
        } catch (error) {
            console.warn("無法從資料庫獲取盤點設定，使用預設值", error);
        }
        
        console.log(`月底盤點狀態檢查: ${isMonthEndPeriod ? '是盤點期間' : '非盤點期間'}`);
        
        // 如果是盤點期間，獲取待盤點的分店列表
        if (isMonthEndPeriod) {
            await loadStoreCheckStatus();
        }
        
    } catch (error) {
        console.error("檢查盤點期間發生錯誤:", error);
        isMonthEndPeriod = false;  // 發生錯誤時默認為非盤點期間
    }
}

/**
 * 加載分店盤點狀態
 */
async function loadStoreCheckStatus() {
    try {
        // 計算本月記錄ID：YYYY-MM格式
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthCheckId = `inventory-${yearMonth}`;
        
        // 從設定中獲取所有分店
        let allStores = [];
        try {
            const storeListDoc = await inventoryDb.collection('settings').doc('store_config').get();
            const storeListData = storeListDoc.exists ? storeListDoc.data() : {};
            const storeListString = storeListData.storeListString || '';
            
            // 解析分店字符串
            allStores = parseStoreListString(storeListString);
            
            // 如果分店列表為空，嘗試從其他文檔獲取
            if (allStores.length === 0) {
                console.log("從store_config獲取分店列表為空，嘗試從store_list獲取");
                const alternativeDoc = await inventoryDb.collection('settings').doc('store_list').get();
                if (alternativeDoc.exists) {
                    const alternativeData = alternativeDoc.data();
                    const alternativeListString = alternativeData.storeListString || alternativeData.list || '';
                    allStores = parseStoreListString(alternativeListString);
                }
            }
        } catch (storeError) {
            console.error("獲取分店列表時發生錯誤:", storeError);
            // 如果仍然無法獲取分店，使用默認分店
            allStores = ["總店", "分店A", "分店B", "網路店"];
            console.log("使用默認分店列表:", allStores);
        }
        
        // 查詢已完成盤點的分店記錄
        const checkRecordsQuery = await inventoryDb.collection('inventory_checks')
            .where('monthId', '==', monthCheckId)
            .where('status', '==', 'completed')
            .get();
        
        // 提取已完成盤點的分店
        completedStores = [];
        checkRecordsQuery.forEach(doc => {
            const data = doc.data();
            if (data.store) {
                completedStores.push(data.store);
            }
        });
        
        // 計算待盤點分店
        pendingStores = allStores.filter(store => !completedStores.includes(store));
        
        console.log(`本月(${yearMonth})盤點狀態: 待盤點分店 ${pendingStores.length}家，已完成 ${completedStores.length}家`);
        console.log("所有分店:", allStores);
        console.log("待盤點分店:", pendingStores);
        console.log("已完成分店:", completedStores);
    } catch (error) {
        console.error("載入分店盤點狀態錯誤:", error);
        // 發生錯誤時設置默認值
        pendingStores = ["總店", "分店A", "分店B", "網路店"];
        completedStores = [];
        console.log("使用默認分店列表進行盤點");
    }
}

/**
 * 獲取商店列表
 * @returns {Promise<string[]>} 商店名稱陣列
 */
async function getStoreList() {
    console.log('獲取商店列表...');
    
    try {
        // 檢查是否已經有全局商店列表
        if (typeof window.getStoreList === 'function') {
            const stores = window.getStoreList();
            if (stores && stores.length > 0) {
                console.log(`使用已載入的商店列表: ${stores.length} 家商店`);
                return stores;
            }
        }
        
        // 如果沒有全局商店列表，嘗試從 store-list-logic.js 模組載入
        if (typeof window.loadStoreList === 'function') {
            console.log('從 store-list-logic.js 模組載入商店列表');
            return await window.loadStoreList();
        }
        
        // 備用方案：直接從 Firestore 獲取
        console.log('直接從 Firestore 獲取商店列表');
        const storeConfig = await inventoryDb.collection('settings').doc('store_config').get();
        
        if (storeConfig.exists) {
            const data = storeConfig.data();
            const storeListString = data.storeListString || '';
            
            return parseStoreListString(storeListString).names;
        }
        
        // 再嘗試獲取備用商店列表
        const storeList = await inventoryDb.collection('settings').doc('store_list').get();
        
        if (storeList.exists) {
            const data = storeList.data();
            const storeListString = data.storeListString || data.list || '';
            
            return parseStoreListString(storeListString).names;
        }
        
        // 若找不到，使用默認值
        console.warn('無法獲取商店列表，使用默認值');
        return ["總店", "分店A", "分店B", "網路店"];
    } catch (error) {
        console.error('獲取商店列表時發生錯誤:', error);
        
        // 出錯時使用默認值
        return ["總店", "分店A", "分店B", "網路店"];
    }
}

/**
 * 本地解析商店列表字串的備用方法
 * 如果全局 parseStoreListString 函數不可用，則使用此函數
 * @param {string} storeListString - 商店列表字串
 * @returns {Object} 包含位置和名稱的對象
 */
function parseStoreListString(storeListString) {
    // 檢查是否已經有全局 parseStoreListString
    if (typeof window.parseStoreListString === 'function') {
        return window.parseStoreListString(storeListString);
    }
    
    // 自己實現解析邏輯作為備份
    const names = new Set();
    const locations = [];
    
    if (!storeListString || typeof storeListString !== 'string') {
        return { names: [], locations: [] };
    }
    
    storeListString.split(';').forEach(part => {
        const trimmed = part.trim();
        if (!trimmed) return;
        
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) {
            // 無座標格式，可能是逗號分隔的列表
            trimmed.split(',').forEach(name => {
                const cleanName = name.trim();
                if (cleanName) names.add(cleanName);
            });
            return;
        }
        
        // 有座標格式：分店名=座標
        const storeName = trimmed.substring(0, eqIndex).trim();
        if (storeName) {
            // 移除潛在的員工數字
            const nameMatch = storeName.match(/^([^0-9]+)/);
            const cleanName = nameMatch ? nameMatch[1].trim() : storeName;
            names.add(cleanName);
        }
    });
    
    return {
        names: Array.from(names),
        locations: locations
    };
}


/**
 * 檢查並提醒盤點
 */
function checkAndNotifyInventory() {
    // 檢查是否需要提醒
    if (!isMonthEndPeriod || pendingStores.length === 0) {
        return;
    }
    
    // 檢查當前使用者的分店是否在待盤點列表中
    const userStore = inventoryCurrentUser?.store;
    if (userStore && pendingStores.includes(userStore)) {
        // 自動打開盤點彈窗
        openInventoryModal();
    }
}

/**
 * 打開庫存盤點彈窗
 */
async function openInventoryModal() {
    if (!inventoryModalElement) {
        console.error("庫存盤點彈窗不存在");
        return;
    }
    
    // 顯示彈窗
    inventoryModalElement.style.display = 'block';
    
    // 設置分店名稱
    const storeNameElement = document.getElementById('inventory-check-store-name');
    if (storeNameElement) {
        storeNameElement.textContent = `分店：${inventoryCurrentUser?.store || '未知'}`;
    }
    
    // 顯示載入中狀態
    if (inventoryListElement) {
        inventoryListElement.innerHTML = '<p class="loading-placeholder">正在載入庫存項目...</p>';
    }
    
    // 清除上一次的消息
    if (inventoryMessageElement) {
        inventoryMessageElement.textContent = '';
        inventoryMessageElement.className = 'message';
    }
    
    // 加載庫存項目
    await loadInventoryItems();
    
    // 渲染庫存項目列表
    renderInventoryItems();
}

/**
 * 關閉庫存盤點彈窗
 */
function closeInventoryModal() {
    if (inventoryModalElement) {
        inventoryModalElement.style.display = 'none';
    }
}

/**
 * 加載庫存項目
 */
async function loadInventoryItems() {
    if (!inventoryDb) {
        console.error("Firestore 實例未初始化");
        return;
    }
    
    try {
        // 從 order_items 集合獲取所有項目
        const itemsQuery = await inventoryDb.collection('order_items').orderBy('category').orderBy('name').get();
        
        // 清空當前項目列表
        inventoryItems = [];
        
        // 處理查詢結果
        itemsQuery.forEach(doc => {
            const item = { id: doc.id, ...doc.data(), currentCount: 0 };
            inventoryItems.push(item);
        });
        
        console.log(`已載入 ${inventoryItems.length} 個庫存項目`);
        
        // 嘗試載入上次盤點結果作為參考
        try {
            const userStore = inventoryCurrentUser?.store;
            if (userStore) {
                const previousMonthDate = new Date();
                previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
                
                const prevYearMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
                const prevMonthCheckId = `inventory-${prevYearMonth}`;
                
                // 查詢上月的盤點記錄
                const prevCheckQuery = await inventoryDb.collection('inventory_checks')
                    .where('monthId', '==', prevMonthCheckId)
                    .where('store', '==', userStore)
                    .where('status', '==', 'completed')
                    .limit(1)
                    .get();
                
                if (!prevCheckQuery.empty) {
                    const prevCheckDoc = prevCheckQuery.docs[0];
                    const prevCheckData = prevCheckDoc.data();
                    
                    // 如果找到上月記錄，將數量填入當前項目
                    if (prevCheckData.items && Array.isArray(prevCheckData.items)) {
                        for (const prevItem of prevCheckData.items) {
                            const matchingItem = inventoryItems.find(item => item.id === prevItem.id);
                            if (matchingItem) {
                                matchingItem.previousCount = prevItem.count || 0;
                            }
                        }
                    }
                    
                    console.log(`已載入上月盤點數據作為參考`);
                }
            }
        } catch (error) {
            console.warn("載入上月盤點數據失敗:", error);
        }
        
    } catch (error) {
        console.error("載入庫存項目錯誤:", error);
        inventoryItems = [];
    }
}

/**
 * 渲染庫存項目列表
 */
function renderInventoryItems() {
    if (!inventoryListElement) {
        console.error("找不到庫存項目列表元素");
        return;
    }
    
    // 檢查是否有項目
    if (inventoryItems.length === 0) {
        inventoryListElement.innerHTML = '<p class="empty-placeholder">沒有找到庫存項目</p>';
        return;
    }
    
    // 按類別分組
    const itemsByCategory = {};
    inventoryItems.forEach(item => {
        const category = item.category || '未分類';
        if (!itemsByCategory[category]) {
            itemsByCategory[category] = [];
        }
        itemsByCategory[category].push(item);
    });
    
    // 創建HTML
    let html = '';
    
    // 對類別進行排序
    const sortedCategories = Object.keys(itemsByCategory).sort();
    
    sortedCategories.forEach(category => {
        html += `<div class="inventory-category">
                    <h4>${category}</h4>
                    <div class="inventory-category-items">`;
        
        itemsByCategory[category].forEach(item => {
            // 取得上月盤點數量作為提示
            const prevCount = item.previousCount !== undefined ? item.previousCount : '';
            const prevCountHint = prevCount !== '' ? `（上月: ${prevCount}）` : '';
            
            html += `
                <div class="inventory-item" data-id="${item.id}">
                    <div class="inventory-item-name">
                        ${item.name || '未知品項'} 
                        ${item.unit ? `(${item.unit})` : ''}
                    </div>
                    <div class="inventory-item-category">${item.supplier || ''}</div>
                    <div class="inventory-item-count">
                        <input type="number" name="item-${item.id}" 
                               min="0" value="${item.currentCount || 0}" 
                               class="inventory-count-input"
                               placeholder="數量" 
                               title="當前庫存數量${prevCountHint}">
                    </div>
                </div>`;
        });
        
        html += `</div></div>`;
    });
    
    // 更新DOM
    inventoryListElement.innerHTML = html;
    
    // 綁定數量輸入事件
    const inputs = inventoryListElement.querySelectorAll('.inventory-count-input');
    inputs.forEach(input => {
        input.addEventListener('change', event => {
            const itemId = event.target.closest('.inventory-item').dataset.id;
            const count = parseInt(event.target.value, 10) || 0;
            
            // 更新inventoryItems中的數量
            const item = inventoryItems.find(i => i.id === itemId);
            if (item) {
                item.currentCount = count;
            }
        });
    });
}

/**
 * 處理庫存盤點提交
 */
async function handleSubmitInventory() {
    if (!inventoryCurrentUser || !inventoryDb || !inventoryMessageElement || !storeSubmitButton) {
        console.error("缺少必要的初始化變數");
        return;
    }
    
    // 禁用提交按鈕
    storeSubmitButton.disabled = true;
    inventoryMessageElement.textContent = '正在提交盤點資料...';
    inventoryMessageElement.className = 'message info';
    
    try {
        // 獲取用戶所屬分店
        const userStore = inventoryCurrentUser.store;
        if (!userStore) {
            throw new Error("找不到您所屬的分店資訊");
        }
        
        // 檢查是否為盤點期間
        if (!isMonthEndPeriod) {
            throw new Error("目前不是月底盤點期間");
        }
        
        // 準備盤點資料
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthCheckId = `inventory-${yearMonth}`;
        
        // 提取庫存項目資料
        const itemsData = inventoryItems.map(item => ({
            id: item.id,
            name: item.name || '未知品項',
            category: item.category || '未分類',
            count: item.currentCount || 0,
            unit: item.unit || ''
        }));
        
        // 創建盤點記錄文檔
        const inventoryData = {
            monthId: monthCheckId,
            store: userStore,
            checkDate: firebase.firestore.FieldValue.serverTimestamp(),
            userId: inventoryCurrentUser.uid,
            userName: inventoryCurrentUser.name || '未知用戶',
            items: itemsData,
            status: 'completed'
        };
        
        // 儲存到 Firestore
        const inventoryRef = inventoryDb.collection('inventory_checks').doc(`${monthCheckId}-${userStore}`);
        await inventoryRef.set(inventoryData);
        
        console.log(`成功提交 ${userStore} 的盤點資料，共 ${itemsData.length} 項`);
        
        // 更新UI顯示
        inventoryMessageElement.textContent = '盤點資料提交成功！';
        inventoryMessageElement.className = 'message success';
        
        // 更新待盤點分店列表
        if (pendingStores.includes(userStore)) {
            pendingStores = pendingStores.filter(store => store !== userStore);
            completedStores.push(userStore);
            
            // 更新盤點按鈕狀態
            const inventoryButton = document.getElementById('open-inventory-check-btn');
            if (inventoryButton && pendingStores.length === 0) {
                inventoryButton.classList.remove('blinking');
            }
        }
        
        // 稍後自動關閉彈窗
        setTimeout(() => {
            closeInventoryModal();
        }, 2000);
        
    } catch (error) {
        console.error("提交盤點資料錯誤:", error);
        inventoryMessageElement.textContent = `提交失敗: ${error.message}`;
        inventoryMessageElement.className = 'message error';
    } finally {
        // 啟用提交按鈕
        storeSubmitButton.disabled = false;
    }
}

/**
 * 渲染分店盤點狀態摘要
 * @param {HTMLElement} container - 要渲染到的容器元素
 */
function renderStoreCheckSummary(container) {
    if (!container) return;
    
    // 創建摘要HTML
    let html = '<div class="inventory-summary">';
    
    // 已完成的分店
    html += `<div class="inventory-completed">已完成盤點: ${completedStores.length}家</div>`;
    
    // 待盤點的分店
    html += `<div class="inventory-pending">待盤點: ${pendingStores.length}家</div>`;
    
    // 如果有待盤點分店，顯示清單
    if (pendingStores.length > 0) {
        html += '<div class="pending-stores-list">待盤點分店: ';
        pendingStores.forEach(store => {
            html += `<span>${store}</span>`;
        });
        html += '</div>';
    }
    
    html += '</div>';
    
    // 更新容器內容
    container.innerHTML = html;
}

/**
 * 導出盤點資料為CSV格式
 * @param {string} storeFilter - 可選的分店過濾條件
 * @param {string} yearMonthFilter - 可選的年月過濾條件 (YYYY-MM)
 * @returns {Promise<string>} CSV字符串
 */
async function exportInventoryDataToCsv(storeFilter, yearMonthFilter) {
    if (!inventoryDb) {
        throw new Error("資料庫連接未初始化");
    }
    
    try {
        // 建立查詢條件
        let query = inventoryDb.collection('inventory_checks').where('status', '==', 'completed');
        
        // 添加篩選條件
        if (storeFilter) {
            query = query.where('store', '==', storeFilter);
        }
        
        if (yearMonthFilter) {
            const monthCheckId = `inventory-${yearMonthFilter}`;
            query = query.where('monthId', '==', monthCheckId);
        }
        
        // 執行查詢
        const querySnapshot = await query.get();
        
        if (querySnapshot.empty) {
            return "沒有符合條件的盤點記錄";
        }
        
        // 整理資料
        const allItems = {}; // 用於收集所有品項
        const storeData = {}; // 按分店分組的資料
        
        // 第一步：收集所有品項和分店資料
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const store = data.store || '未知分店';
            const monthId = data.monthId || '未知月份';
            const checkDate = data.checkDate ? data.checkDate.toDate().toISOString().split('T')[0] : '未知日期';
            
            // 初始化分店資料
            if (!storeData[store]) {
                storeData[store] = {
                    monthId,
                    checkDate,
                    items: {}
                };
            }
            
            // 整理品項數據
            if (data.items && Array.isArray(data.items)) {
                data.items.forEach(item => {
                    const itemId = item.id;
                    const itemName = item.name || '未知品項';
                    const itemCategory = item.category || '未分類';
                    
                    // 將品項加入全局集合
                    if (!allItems[itemId]) {
                        allItems[itemId] = {
                            id: itemId,
                            name: itemName,
                            category: itemCategory
                        };
                    }
                    
                    // 將數量存入分店資料
                    storeData[store].items[itemId] = item.count || 0;
                });
            }
        });
        
        // 將所有品項轉為陣列並排序
        const itemsArray = Object.values(allItems).sort((a, b) => {
            if (a.category !== b.category) return a.category.localeCompare(b.category);
            return a.name.localeCompare(b.name);
        });
        
        // 將分店資料轉為陣列
        const storesArray = Object.entries(storeData).map(([store, data]) => ({
            store,
            ...data
        })).sort((a, b) => a.store.localeCompare(b.store));
        
        // 生成CSV標頭
        let csv = "分店,盤點月份,盤點日期";
        
        // 添加所有品項到標頭
        itemsArray.forEach(item => {
            csv += `,${item.category}-${item.name}`;
        });
        
        csv += "\n";
        
        // 添加每個分店的資料行
        storesArray.forEach(storeInfo => {
            csv += `${storeInfo.store},${storeInfo.monthId.replace('inventory-', '')},${storeInfo.checkDate}`;
            
            // 添加每個品項的數量
            itemsArray.forEach(item => {
                const count = storeInfo.items[item.id] !== undefined ? storeInfo.items[item.id] : '';
                csv += `,${count}`;
            });
            
            csv += "\n";
        });
        
        return csv;
    } catch (error) {
        console.error("導出盤點資料錯誤:", error);
        throw new Error(`導出失敗: ${error.message}`);
    }
}

/**
 * 觸發下載CSV檔案
 * @param {string} csvContent - CSV內容
 * @param {string} fileName - 檔案名稱
 */
function downloadCsv(csvContent, fileName) {
    // 處理CSV編碼，確保中文顯示正確
    const encodedCsv = '\uFEFF' + csvContent; // 添加BOM標記
    const blob = new Blob([encodedCsv], { type: 'text/csv;charset=utf-8;' });
    
    // 創建下載連結
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * 從CSV檔案導入盤點資料
 * @param {File} file - CSV檔案
 * @returns {Promise<Object>} 導入結果
 */
async function importInventoryDataFromCsv(file) {
    if (!inventoryDb) {
        throw new Error("資料庫連接未初始化");
    }
    
    try {
        // 讀取CSV檔案內容
        const csvContent = await readFileAsText(file);
        
        // 解析CSV
        const rows = csvContent.split('\n')
            .map(row => row.trim())
            .filter(row => row.length > 0);
        
        if (rows.length < 2) {
            throw new Error("CSV檔案格式不正確或沒有資料");
        }
        
        // 解析標頭
        const headers = parseCSVRow(rows[0]);
        if (headers.length < 4 || headers[0] !== '分店' || headers[1] !== '盤點月份' || headers[2] !== '盤點日期') {
            throw new Error("CSV檔案格式不正確，標頭必須包含'分店,盤點月份,盤點日期'");
        }
        
        // 準備導入結果統計
        const result = {
            total: 0,
            imported: 0,
            skipped: 0,
            errors: [],
            details: []
        };
        
        // 處理每一行資料
        for (let i = 1; i < rows.length; i++) {
            result.total++;
            
            try {
                const row = parseCSVRow(rows[i]);
                if (row.length !== headers.length) {
                    throw new Error(`第 ${i+1} 行的欄位數量與標頭不符`);
                }
                
                const store = row[0];
                const monthStr = row[1];
                const checkDate = row[2];
                
                if (!store || !monthStr) {
                    throw new Error(`第 ${i+1} 行缺少必要資料 (分店或月份)`);
                }
                
                // 格式化月份ID
                const monthId = `inventory-${monthStr}`;
                
                // 準備品項資料
                const items = [];
                for (let j = 3; j < headers.length; j++) {
                    const header = headers[j];
                    const countStr = row[j].trim();
                    
                    if (countStr) {
                        const count = parseInt(countStr, 10) || 0;
                        
                        // 從標頭解析類別和名稱
                        const headerParts = header.split('-');
                        const category = headerParts.length > 1 ? headerParts[0] : '未分類';
                        const name = headerParts.length > 1 ? headerParts.slice(1).join('-') : header;
                        
                        items.push({
                            id: `${category}-${name}`.replace(/[^\w\d]/g, '_'),
                            name,
                            category,
                            count
                        });
                    }
                }
                
                // 創建盤點記錄
                const inventoryData = {
                    monthId,
                    store,
                    checkDate: new Date(checkDate),
                    importDate: firebase.firestore.FieldValue.serverTimestamp(),
                    isImported: true,
                    items,
                    status: 'completed'
                };
                
                // 儲存到 Firestore
                const docId = `${monthId}-${store}`;
                await inventoryDb.collection('inventory_checks').doc(docId).set(inventoryData);
                
                result.imported++;
                result.details.push({
                    store,
                    monthId,
                    itemCount: items.length,
                    status: '成功導入'
                });
                
            } catch (error) {
                console.error(`導入第 ${i+1} 行資料錯誤:`, error);
                result.skipped++;
                result.errors.push(`第 ${i+1} 行: ${error.message}`);
            }
        }
        
        return result;
    } catch (error) {
        console.error("解析CSV檔案錯誤:", error);
        throw new Error(`導入失敗: ${error.message}`);
    }
}

/**
 * 讀取檔案內容為文字
 * @param {File} file - 檔案物件
 * @returns {Promise<string>} 檔案內容
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(event.target.result);
        reader.onerror = error => reject(error);
        reader.readAsText(file, 'UTF-8');
    });
}

/**
 * 解析CSV行，處理引號和逗號
 * @param {string} row - CSV行
 * @returns {Array<string>} 解析後的欄位
 */
function parseCSVRow(row) {
    const fields = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        
        if (char === '"') {
            // 處理引號
            if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
                // 連續兩個引號視為跳脫字符
                currentField += '"';
                i++;
            } else {
                // 切換引號狀態
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // 非引號內的逗號表示欄位結束
            fields.push(currentField);
            currentField = '';
        } else {
            // 一般字符
            currentField += char;
        }
    }
    
    // 添加最後一個欄位
    fields.push(currentField);
    
    return fields;
}

// 導出主要函數，便於在order.html中調用
window.initInventoryCheck = initInventoryCheck;
window.openInventoryModal = openInventoryModal;
window.exportInventoryDataToCsv = exportInventoryDataToCsv;
window.downloadCsv = downloadCsv;
window.importInventoryDataFromCsv = importInventoryDataFromCsv;

console.log("inventory-check.js 模組載入完成");

// 初始化函數
async function initInventoryCheckPage() {
    console.log("初始化盤點系統...");
    
    try {
        // 初始化 UI 元素
        initUIElements();
        
        // 顯示載入中
        showLoading("正在初始化系統...");
        
        // 嘗試初始化商店列表模組 (如果存在)
        if (typeof window.initStoreListModule === 'function') {
            await window.initStoreListModule();
        }
        
        // 獲取分店列表
        const storeList = await getStoreList();
        console.log("獲取到的分店列表:", storeList);
        
        // 填充分店下拉選單
        populateStoreDropdown(storeList);
        
        // 載入庫存項目
        const items = await loadInventoryItems();
        console.log(`載入了 ${items.length} 個庫存項目`);
        
        // 設置事件監聽器
        setupEventListeners();
        
        // 隱藏載入中
        hideLoading();
        
        console.log("盤點系統初始化完成");
    } catch (error) {
        console.error("初始化盤點系統時發生錯誤:", error);
        showError("初始化系統時發生錯誤，請重新載入頁面");
        hideLoading();
    }
}

/**
 * 填充分店下拉選單
 */
function populateStoreDropdown(storeList) {
    const storeSelect = document.getElementById('storeSelect');
    if (!storeSelect) {
        console.error("找不到分店選擇元素");
        return;
    }
    
    // 清空現有選項
    storeSelect.innerHTML = '';
    
    // 添加預設選項
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '請選擇分店';
    defaultOption.selected = true;
    defaultOption.disabled = true;
    storeSelect.appendChild(defaultOption);
    
    // 添加分店選項
    if (Array.isArray(storeList) && storeList.length > 0) {
        storeList.forEach(store => {
            const option = document.createElement('option');
            option.value = store;
            option.textContent = store;
            storeSelect.appendChild(option);
        });
        console.log(`填充了 ${storeList.length} 個分店選項`);
    } else {
        console.warn("分店列表為空或無效");
        // 添加一個默認分店
        const option = document.createElement('option');
        option.value = "總店";
        option.textContent = "總店";
        storeSelect.appendChild(option);
    }
}

/**
 * 檢查是否是月底盤點期間
 */
async function checkIfEndOfMonthInventoryPeriod() {
    try {
        // ... existing code ...

        // Instead of automatically showing the modal, add a button at the bottom of the page
        if (isEndOfMonth) {
            // Add a button to the page bottom
            const inventoryButton = document.createElement('button');
            inventoryButton.type = 'button';
            inventoryButton.id = 'end-of-month-inventory-btn';
            inventoryButton.className = 'btn';
            inventoryButton.style.marginTop = '20px';
            inventoryButton.style.backgroundColor = '#28a745';
            inventoryButton.style.color = '#fff';
            inventoryButton.textContent = '月底庫存盤點';
            
            // Add click event to show the modal
            inventoryButton.addEventListener('click', () => {
                const modal = document.getElementById('inventory-check-modal');
                if (modal) {
                    modal.style.display = 'block';
                }
            });
            
            // Find the container to append the button
            const container = document.querySelector('.container');
            if (container) {
                container.appendChild(inventoryButton);
            }
            
            console.log("月底盤點狀態檢查: 盤點期間，已添加盤點按鈕");
            return true;
        } else {
            console.log("月底盤點狀態檢查: 非盤點期間");
            return false;
        }
    } catch (error) {
        console.error("檢查月底盤點期間時發生錯誤:", error);
        return false;
    }
}

// ... existing code ... 