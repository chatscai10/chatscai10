/**
 * 炸雞店管理系統 - 版本控制文件
 * 最後更新：2025/04/15
 */

const APP_VERSION = {
    // 主要版本號 (重大更新)
    MAJOR: 1,
    // 次要版本號 (功能更新)
    MINOR: 5,
    // 修訂版本號 (bug修復)
    PATCH: 0,
    // 完整版本字串
    VERSION_STRING: '1.5.0',
    // 更新日期
    LAST_UPDATE: '2025-04-15',
    
    // 各模組版本
    MODULES: {
        CORE: '1.5.0',             // 核心功能
        AUTH: '1.3.2',             // 認證系統
        SCHEDULING: '1.4.1',       // 排班系統
        ATTENDANCE: '1.4.0',       // 出勤打卡
        LEAVE: '1.3.1',            // 請假系統
        SALARY: '1.5.0',           // 薪資系統
        PREDICTION: '1.2.0',       // 預測系統
        REPORTING: '1.3.0',        // 報表系統
        ADMIN: '1.4.1'             // 管理功能
    },
    
    // 常用方法
    
    /**
     * 獲取帶有版本參數的URL，用於避免瀏覽器緩存
     * @param {string} url - 原始URL
     * @returns {string} - 添加版本參數的URL
     */
    getVersionedUrl: function(url) {
        if (!url) return url;
        
        // 檢查URL是否已包含參數
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}v=${this.VERSION_STRING}`;
    },
    
    /**
     * 獲取模組的版本號
     * @param {string} moduleName - 模組名稱
     * @returns {string} - 模組版本號
     */
    getModuleVersion: function(moduleName) {
        return this.MODULES[moduleName.toUpperCase()] || this.VERSION_STRING;
    },
    
    /**
     * 檢查版本是否需要更新
     * @param {string} currentVersion - 當前版本
     * @param {string} requiredVersion - 所需版本
     * @returns {boolean} - 是否需要更新
     */
    needsUpdate: function(currentVersion, requiredVersion) {
        if (!currentVersion || !requiredVersion) return true;
        
        const current = currentVersion.split('.').map(Number);
        const required = requiredVersion.split('.').map(Number);
        
        for (let i = 0; i < 3; i++) {
            if (current[i] < required[i]) return true;
            if (current[i] > required[i]) return false;
        }
        
        return false;
    },
    
    /**
     * 檢查本地存儲的版本是否最新
     * @returns {boolean} - 是否需要更新
     */
    checkLocalVersion: function() {
        const savedVersion = localStorage.getItem('app_version');
        const needsUpdate = this.needsUpdate(savedVersion, this.VERSION_STRING);
        
        if (needsUpdate) {
            localStorage.setItem('app_version', this.VERSION_STRING);
            localStorage.setItem('app_updated_at', new Date().toISOString());
        }
        
        return needsUpdate;
    }
};

// 在全局範圍內暴露版本對象
window.APP_VERSION = APP_VERSION; 