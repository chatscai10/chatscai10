/**
 * store-list-logic.js
 * 處理商店列表相關邏輯
 */

// 模組變數
let db;
let auth;
let currentUser = null;
let allStores = [];
let storeLocations = [];

/**
 * 初始化商店列表模組
 */
function initStoreListModule() {
    console.log('初始化商店列表模組...');
    
    // 檢查 Firebase 初始化
    if (firebase.apps.length === 0) {
        console.error('Firebase 尚未初始化，無法啟動商店列表模組');
        return;
    }
    
    // 初始化 Firebase 服務
    db = firebase.firestore();
    auth = firebase.auth();
    
    // 監聽認證狀態變化
    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            console.log(`商店列表模組：用戶 ${user.email} 已登入`);
            loadStoreList();
        } else {
            console.log('商店列表模組：用戶未登入');
            allStores = [];
            storeLocations = [];
        }
    });
}

/**
 * 載入商店列表
 * @returns {Promise<Array>} 商店列表
 */
async function loadStoreList() {
    console.log('載入商店列表...');
    
    try {
        // 從 store_config 獲取商店列表
        const storeConfig = await db.collection('settings').doc('store_config').get();
        
        if (storeConfig.exists) {
            const data = storeConfig.data();
            const storeListString = data.storeListString || '';
            
            // 解析商店列表字串
            const parsedData = parseStoreListString(storeListString);
            allStores = parsedData.names || [];
            storeLocations = parsedData.locations || [];
            
            console.log(`已載入 ${allStores.length} 家商店`);
            
            // 發送自定義事件
            dispatchStoreListLoadedEvent();
            
            return allStores;
        }
        
        // 如果找不到 store_config，嘗試從 store_list 獲取
        const storeList = await db.collection('settings').doc('store_list').get();
        
        if (storeList.exists) {
            const data = storeList.data();
            const storeListString = data.storeListString || data.list || '';
            
            // 解析商店列表字串
            const parsedData = parseStoreListString(storeListString);
            allStores = parsedData.names || [];
            storeLocations = parsedData.locations || [];
            
            console.log(`已從備用來源載入 ${allStores.length} 家商店`);
            
            // 發送自定義事件
            dispatchStoreListLoadedEvent();
            
            return allStores;
        }
        
        // 如果兩者都找不到，使用默認值
        console.warn('找不到商店列表設定，使用默認值');
        allStores = ["總店", "分店A", "分店B", "網路店"];
        storeLocations = [];
        
        // 發送自定義事件
        dispatchStoreListLoadedEvent();
        
        return allStores;
    } catch (error) {
        console.error('載入商店列表時發生錯誤:', error);
        
        // 發生錯誤時使用默認值
        allStores = ["總店", "分店A", "分店B", "網路店"];
        storeLocations = [];
        
        return allStores;
    }
}

/**
 * 解析商店列表字串
 * @param {string} storeListString - 商店列表字串
 * @returns {Object} 包含位置和名稱的對象
 */
function parseStoreListString(storeListString) {
    const locations = [];
    const names = new Set(); // 使用 Set 來自動處理唯一性
    
    if (!storeListString || typeof storeListString !== 'string') {
        return { locations, names: [] };
    }
    
    // 分店格式為：分店名1=座標; 分店名2=座標;...
    storeListString.split(';').forEach(part => {
        part = part.trim();
        if (!part) return;
        
        // 找到等號位置，分割名稱和座標
        const eqIndex = part.indexOf('=');
        if (eqIndex === -1) {
            // 如果沒有等號，可能是簡單的分店列表格式（用逗號分隔）
            const simpleNames = part.split(',');
            simpleNames.forEach(name => {
                const trimmedName = name.trim();
                if (trimmedName) {
                    names.add(trimmedName);
                }
            });
            return;
        }
        
        // 提取分店名和座標
        const namePart = part.substring(0, eqIndex).trim();
        const coordsPart = part.substring(eqIndex + 1).trim();
        
        // 從名稱中移除數字（如果包含人數要求）
        const nameMatch = namePart.match(/^([^0-9]+)/);
        const storeName = nameMatch ? nameMatch[1].trim() : namePart;
        
        // 添加到名稱集合
        if (storeName) {
            names.add(storeName);
        }
        
        // 提取座標
        const coords = coordsPart.split(',');
        if (coords.length === 2) {
            const lat = parseFloat(coords[0].trim());
            const lon = parseFloat(coords[1].trim());
            
            if (!isNaN(lat) && !isNaN(lon) && storeName) {
                locations.push({
                    id: storeName, // 使用分店名稱作為 ID
                    name: storeName,
                    latitude: lat,
                    longitude: lon
                });
            }
        }
    });
    
    // 將 Set 轉換回陣列
    return {
        locations,
        names: Array.from(names)
    };
}

/**
 * 獲取商店列表
 * @returns {Array} 商店名稱陣列
 */
function getStoreList() {
    return allStores;
}

/**
 * 獲取商店位置資訊
 * @returns {Array} 商店位置資訊陣列
 */
function getStoreLocations() {
    return storeLocations;
}

/**
 * 發送商店列表已載入事件
 */
function dispatchStoreListLoadedEvent() {
    const event = new CustomEvent('storeListLoaded', {
        detail: {
            stores: allStores,
            locations: storeLocations
        }
    });
    
    document.dispatchEvent(event);
}

/**
 * 更新商店列表
 * @param {string} storeListString - 新的商店列表字串
 * @returns {Promise<boolean>} 是否成功更新
 */
async function updateStoreList(storeListString) {
    if (!currentUser) {
        console.error('未登入，無法更新商店列表');
        return false;
    }
    
    try {
        // 更新 Firestore 中的設定
        await db.collection('settings').doc('store_config').set({
            storeListString: storeListString,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser.uid
        }, { merge: true });
        
        console.log('商店列表已更新');
        
        // 重新載入商店列表
        await loadStoreList();
        
        return true;
    } catch (error) {
        console.error('更新商店列表時發生錯誤:', error);
        return false;
    }
}

// 導出模組函數
window.initStoreListModule = initStoreListModule;
window.loadStoreList = loadStoreList;
window.getStoreList = getStoreList;
window.getStoreLocations = getStoreLocations;
window.updateStoreList = updateStoreList;
window.parseStoreListString = parseStoreListString; 