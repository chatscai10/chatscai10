/**
 * 炸雞店管理系統 - 離線打卡支持模塊
 * v1.0.0 - 2025/04/16
 * 
 * 此模塊提供離線打卡支持，使用IndexedDB在本地存儲打卡記錄，
 * 在網絡恢復時自動同步到服務器。
 */

class OfflineClockSupport {
    constructor() {
        this.dbName = 'OfflineClockDB';
        this.storeName = 'clockRecords';
        this.db = null;
        this.isOnline = navigator.onLine;
        this.syncInProgress = false;
        this.pendingRecords = [];
        this.lastSyncTimestamp = null;
        
        // 初始化網絡狀態監聽
        this.setupNetworkListeners();
    }
    
    /**
     * 初始化模塊
     */
    async init() {
        try {
            // 開啟IndexedDB
            await this.openDatabase();
            
            // 檢查是否有未同步的記錄
            this.pendingRecords = await this.getUnsyncedRecords();
            
            console.log(`離線打卡支持已初始化。未同步記錄數: ${this.pendingRecords.length}`);
            
            // 如果在線且有未同步記錄，嘗試同步
            if (this.isOnline && this.pendingRecords.length > 0) {
                this.syncOfflineRecords();
            }
            
            return true;
        } catch (error) {
            console.error('初始化離線打卡支持模塊失敗:', error);
            return false;
        }
    }
    
    /**
     * 設置網絡狀態監聽器
     */
    setupNetworkListeners() {
        // 監聽離線事件
        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('網絡已斷開，切換至離線模式');
            this.dispatchStatusEvent('offline');
        });
        
        // 監聽在線事件
        window.addEventListener('online', async () => {
            this.isOnline = true;
            console.log('網絡已連接，嘗試同步離線記錄');
            this.dispatchStatusEvent('online');
            
            // 獲取未同步記錄並嘗試同步
            this.pendingRecords = await this.getUnsyncedRecords();
            if (this.pendingRecords.length > 0) {
                this.syncOfflineRecords();
            }
        });
    }
    
    /**
     * 開啟IndexedDB數據庫
     */
    openDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.error('瀏覽器不支持IndexedDB，離線打卡功能將不可用');
                reject(new Error('瀏覽器不支持IndexedDB'));
                return;
            }
            
            const request = indexedDB.open(this.dbName, 1);
            
            // 數據庫升級/創建
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 創建打卡記錄存儲
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('synced', 'synced', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('action', 'action', { unique: false });
                    console.log('創建打卡記錄存儲');
                }
            };
            
            // 成功打開數據庫
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('成功打開IndexedDB數據庫');
                resolve(this.db);
            };
            
            // 打開數據庫失敗
            request.onerror = (event) => {
                console.error('打開IndexedDB數據庫失敗:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    /**
     * 存儲離線打卡記錄
     * @param {Object} record - 打卡記錄數據
     */
    async storeOfflineRecord(record) {
        if (!this.db) {
            try {
                await this.openDatabase();
            } catch (error) {
                console.error('無法開啟數據庫存儲離線記錄:', error);
                return false;
            }
        }
        
        return new Promise((resolve, reject) => {
            try {
                // 添加必要的離線記錄字段
                const offlineRecord = {
                    ...record,
                    id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
                    synced: false,
                    createdAt: new Date().toISOString(),
                    syncAttempts: 0
                };
                
                // 開始事務
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                
                // 添加記錄
                const request = store.add(offlineRecord);
                
                request.onsuccess = () => {
                    console.log('成功存儲離線打卡記錄:', offlineRecord.id);
                    
                    // 更新待同步記錄列表
                    this.pendingRecords.push(offlineRecord);
                    this.dispatchStatusEvent('record-added', {
                        recordId: offlineRecord.id,
                        pendingCount: this.pendingRecords.length
                    });
                    
                    resolve(offlineRecord);
                };
                
                request.onerror = (event) => {
                    console.error('存儲離線打卡記錄失敗:', event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('存儲離線記錄時發生錯誤:', error);
                reject(error);
            }
        });
    }
    
    /**
     * 獲取所有未同步的打卡記錄
     */
    getUnsyncedRecords() {
        if (!this.db) {
            return Promise.resolve([]);
        }
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const index = store.index('synced');
                
                // 修復: 確保 IDBKeyRange.only() 參數類型正確
                let request;
                try {
                    // 嘗試使用明確布爾值 false
                    request = index.getAll(IDBKeyRange.only(false));
                } catch (rangeError) {
                    console.warn('IDBKeyRange.only(false) 失敗，嘗試獲取所有記錄然後過濾');
                    // 如果 only() 方法失敗，獲取所有記錄然後手動過濾
                    request = index.getAll();
                }
                
                request.onsuccess = () => {
                    let records = request.result || [];
                    
                    // 如果我們獲取了所有記錄(因為only()失敗)，則需要手動過濾
                    if (records.length > 0 && request === index.getAll()) {
                        records = records.filter(record => record.synced === false);
                    }
                    
                    console.log(`獲取到 ${records.length} 條未同步打卡記錄`);
                    resolve(records);
                };
                
                request.onerror = (event) => {
                    console.error('獲取未同步打卡記錄失敗:', event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('獲取未同步記錄時發生錯誤:', error);
                reject(error);
            }
        });
    }
    
    /**
     * 同步離線打卡記錄到服務器
     */
    async syncOfflineRecords() {
        // 檢查是否在線
        if (!this.isOnline) {
            console.log('當前處於離線狀態，無法同步記錄');
            return {
                success: false,
                reason: 'offline',
                syncedCount: 0
            };
        }
        
        // 檢查是否有記錄需要同步
        if (this.pendingRecords.length === 0) {
            console.log('沒有未同步的打卡記錄');
            return {
                success: true,
                reason: 'no-records',
                syncedCount: 0
            };
        }
        
        // 檢查是否已登入
        if (!firebase.auth().currentUser) {
            console.log('用戶未登入，無法同步記錄');
            return {
                success: false,
                reason: 'not-authenticated',
                syncedCount: 0
            };
        }
        
        // 避免同時進行多個同步
        if (this.syncInProgress) {
            console.log('同步已在進行中，請稍後再試');
            return {
                success: false,
                reason: 'sync-in-progress',
                syncedCount: 0
            };
        }
        
        this.syncInProgress = true;
        this.dispatchStatusEvent('sync-started', { recordCount: this.pendingRecords.length });
        
        try {
            // 準備要同步的記錄
            const recordsToSync = [...this.pendingRecords];
            const recordsForServer = recordsToSync.map(record => {
                // 這裡僅提取服務器需要的欄位
                return {
                    timestamp: record.timestamp,
                    storeId: record.storeId,
                    action: record.action,
                    location: record.location || null,
                    deviceInfo: record.deviceInfo || null,
                    offlineId: record.id
                };
            });
            
            // 調用雲函數同步數據
            const syncFunction = firebase.functions().httpsCallable('syncOfflineClockRecords');
            const result = await syncFunction({ offlineRecords: recordsForServer });
            
            console.log('同步離線打卡記錄結果:', result.data);
            
            if (result.data && result.data.status === 'success') {
                // 更新本地數據庫中的記錄狀態
                await this.markRecordsAsSynced(recordsToSync, result.data.details);
                
                // 更新待同步記錄列表
                this.pendingRecords = await this.getUnsyncedRecords();
                
                // 更新最後同步時間
                this.lastSyncTimestamp = new Date().toISOString();
                localStorage.setItem('lastClockSyncTime', this.lastSyncTimestamp);
                
                this.dispatchStatusEvent('sync-completed', {
                    success: true,
                    syncedCount: result.data.processed,
                    errorCount: result.data.errors,
                    pendingCount: this.pendingRecords.length
                });
                
                return {
                    success: true,
                    syncedCount: result.data.processed,
                    errorCount: result.data.errors,
                    details: result.data.details
                };
            } else {
                throw new Error('同步返回未成功狀態');
            }
        } catch (error) {
            console.error('同步離線打卡記錄失敗:', error);
            
            this.dispatchStatusEvent('sync-error', {
                error: error.message,
                pendingCount: this.pendingRecords.length
            });
            
            return {
                success: false,
                reason: 'sync-error',
                error: error.message,
                syncedCount: 0
            };
        } finally {
            this.syncInProgress = false;
        }
    }
    
    /**
     * 將記錄標記為已同步
     * @param {Array} records - 要標記的記錄
     * @param {Object} syncDetails - 同步詳情
     */
    async markRecordsAsSynced(records, syncDetails) {
        if (!this.db || records.length === 0) {
            return;
        }
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                let updateCount = 0;
                
                // 處理每個記錄
                records.forEach(record => {
                    // 查找此記錄在同步結果中的狀態
                    const processedRecord = syncDetails.processedRecords.find(
                        pr => pr.original.offlineId === record.id
                    );
                    
                    if (processedRecord) {
                        // 成功同步的記錄
                        const request = store.get(record.id);
                        
                        request.onsuccess = () => {
                            const recordToUpdate = request.result;
                            if (recordToUpdate) {
                                recordToUpdate.synced = true;
                                recordToUpdate.syncedAt = new Date().toISOString();
                                recordToUpdate.serverRecordId = processedRecord.processed;
                                
                                store.put(recordToUpdate);
                                updateCount++;
                            }
                        };
                    } else {
                        // 同步失敗的記錄，增加嘗試次數
                        const errorRecord = syncDetails.errorRecords.find(
                            er => er.original.offlineId === record.id
                        );
                        
                        if (errorRecord) {
                            const request = store.get(record.id);
                            
                            request.onsuccess = () => {
                                const recordToUpdate = request.result;
                                if (recordToUpdate) {
                                    recordToUpdate.syncAttempts = (recordToUpdate.syncAttempts || 0) + 1;
                                    recordToUpdate.lastSyncAttempt = new Date().toISOString();
                                    recordToUpdate.lastSyncError = errorRecord.error;
                                    
                                    store.put(recordToUpdate);
                                }
                            };
                        }
                    }
                });
                
                transaction.oncomplete = () => {
                    console.log(`更新了 ${updateCount} 條記錄的同步狀態`);
                    resolve(updateCount);
                };
                
                transaction.onerror = (event) => {
                    console.error('更新記錄同步狀態失敗:', event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('標記記錄為已同步時發生錯誤:', error);
                reject(error);
            }
        });
    }
    
    /**
     * 清理已同步的舊記錄
     * @param {Number} daysToKeep - 保留記錄的天數
     */
    async cleanupSyncedRecords(daysToKeep = 7) {
        if (!this.db) {
            return 0;
        }
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const index = store.index('synced');
                
                // 計算截止日期
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
                const cutoffISOString = cutoffDate.toISOString();
                
                // 獲取已同步且舊於截止日期的記錄
                const request = index.openCursor(IDBKeyRange.only(true));
                let deleteCount = 0;
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const record = cursor.value;
                        
                        // 檢查記錄是否夠舊
                        if (record.syncedAt && record.syncedAt < cutoffISOString) {
                            store.delete(cursor.primaryKey);
                            deleteCount++;
                        }
                        
                        cursor.continue();
                    }
                };
                
                transaction.oncomplete = () => {
                    console.log(`清理了 ${deleteCount} 條已同步的舊記錄`);
                    resolve(deleteCount);
                };
                
                transaction.onerror = (event) => {
                    console.error('清理舊記錄失敗:', event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('清理已同步記錄時發生錯誤:', error);
                reject(error);
            }
        });
    }
    
    /**
     * 檢查是否能執行離線打卡
     */
    canPerformOfflineClocking() {
        // 檢查IndexedDB可用性
        if (!window.indexedDB) {
            return {
                canPerform: false,
                reason: 'indexeddb-not-supported'
            };
        }
        
        // 檢查本地存儲是否有必要信息
        if (!localStorage.getItem('userId') || !localStorage.getItem('userName')) {
            return {
                canPerform: false,
                reason: 'missing-user-info'
            };
        }
        
        // 其他檢查（如存儲空間）
        try {
            const testKey = `test_${Date.now()}`;
            localStorage.setItem(testKey, '1');
            localStorage.removeItem(testKey);
        } catch (e) {
            return {
                canPerform: false,
                reason: 'storage-full'
            };
        }
        
        return {
            canPerform: true
        };
    }
    
    /**
     * 執行離線打卡
     * @param {Object} clockData - 打卡數據
     */
    async performOfflineClocking(clockData) {
        // 檢查是否可以執行離線打卡
        const checkResult = this.canPerformOfflineClocking();
        if (!checkResult.canPerform) {
            console.error('無法執行離線打卡:', checkResult.reason);
            return {
                success: false,
                reason: checkResult.reason
            };
        }
        
        // 添加必要的離線打卡信息
        const offlineRecord = {
            ...clockData,
            userId: localStorage.getItem('userId'),
            userName: localStorage.getItem('userName'),
            timestamp: new Date().toISOString(),
            deviceInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                timestamp: new Date().toISOString()
            }
        };
        
        try {
            // 存儲打卡記錄
            const storedRecord = await this.storeOfflineRecord(offlineRecord);
            
            console.log('離線打卡成功:', storedRecord.id);
            return {
                success: true,
                recordId: storedRecord.id,
                timestamp: storedRecord.timestamp,
                pendingSync: true
            };
        } catch (error) {
            console.error('離線打卡失敗:', error);
            return {
                success: false,
                reason: 'storage-error',
                error: error.message
            };
        }
    }
    
    /**
     * 獲取同步狀態
     */
    getSyncStatus() {
        return {
            isOnline: this.isOnline,
            syncInProgress: this.syncInProgress,
            pendingRecordsCount: this.pendingRecords.length,
            lastSyncTimestamp: this.lastSyncTimestamp
        };
    }
    
    /**
     * 派發狀態事件
     * @param {String} eventName - 事件名稱
     * @param {Object} data - 事件數據
     */
    dispatchStatusEvent(eventName, data = {}) {
        const event = new CustomEvent(`offline-clockin-${eventName}`, {
            detail: {
                ...data,
                timestamp: new Date().toISOString(),
                syncStatus: this.getSyncStatus()
            }
        });
        document.dispatchEvent(event);
    }
}

// 如果在瀏覽器環境，創建全局實例
if (typeof window !== 'undefined') {
    window.offlineClockSupport = new OfflineClockSupport();
    
    // 頁面加載完成後初始化
    document.addEventListener('DOMContentLoaded', () => {
        window.offlineClockSupport.init().then(success => {
            console.log(`離線打卡支持${success ? '已初始化' : '初始化失敗'}`);
        });
    });
} 