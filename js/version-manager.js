/**
 * 炸雞店管理系統 - 統一版本管理器
 * @version 2.0.0
 * @lastUpdate 2024-03-21
 */

class VersionManager {
    constructor() {
        this.config = {
            VERSION: '2.0.0',
            BUILD_DATE: new Date().toISOString(),
            UPDATE_CHECK_INTERVAL: 1000 * 60 * 60, // 1小時檢查一次
            API_VERSION: 'v2',
            MODULES: {
                CORE: '2.0.0',
                AUTH: '1.3.2',
                SCHEDULING: '1.4.1',
                ATTENDANCE: '1.4.0',
                LEAVE: '1.3.1',
                SALARY: '1.5.0',
                PREDICTION: '1.2.0',
                REPORTING: '1.3.0',
                ADMIN: '1.4.1'
            }
        };

        // 初始化
        this.init();
    }

    async init() {
        // 先加載本地版本
        this.loadLocalVersion();
        
        // 僅在在線狀態下檢查更新
        if (navigator.onLine) {
            await this.checkForUpdates();
            this.startUpdateChecker();
        } else {
            console.log('離線模式：使用本地緩存的版本信息');
            this.setupOfflineListener();
        }
    }
    
    // 加載本地存儲的版本信息
    loadLocalVersion() {
        try {
            const savedVersion = localStorage.getItem('app_version');
            const savedModules = localStorage.getItem('app_modules');
            
            if (savedVersion) {
                console.log(`從本地儲存加載版本信息: ${savedVersion}`);
                this.config.VERSION = savedVersion;
            }
            
            if (savedModules) {
                const modules = JSON.parse(savedModules);
                this.config.MODULES = { ...this.config.MODULES, ...modules };
                console.log('從本地儲存加載模組版本信息');
            }
        } catch (error) {
            console.error('加載本地版本信息失敗:', error);
        }
    }
    
    // 設置離線監聽器
    setupOfflineListener() {
        window.addEventListener('online', () => {
            console.log('網絡連接已恢復，檢查更新');
            this.checkForUpdates();
            this.startUpdateChecker();
        });
    }

    // 開始定期檢查更新
    startUpdateChecker() {
        setInterval(() => {
            if (navigator.onLine) {
                this.checkForUpdates();
            }
        }, this.config.UPDATE_CHECK_INTERVAL);
    }

    // 檢查更新
    async checkForUpdates() {
        try {
            const response = await fetch('/version-info.json', {
                cache: 'no-cache',
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (!response.ok) {
                throw new Error(`伺服器回應異常: ${response.status}`);
            }
            
            const serverVersion = await response.json();
            
            // 儲存到本地
            localStorage.setItem('app_version', serverVersion.version);
            localStorage.setItem('app_modules', JSON.stringify(serverVersion.modules));
            localStorage.setItem('app_version_last_check', new Date().toISOString());
            
            if (this.needsUpdate(this.config.VERSION, serverVersion.version)) {
                this.notifyUpdate(serverVersion);
            }
        } catch (error) {
            console.error('版本檢查失敗:', error);
            // 使用本地緩存的版本信息
            this.loadLocalVersion();
        }
    }

    // 版本比較
    needsUpdate(currentVersion, requiredVersion) {
        if (!currentVersion || !requiredVersion) return true;
        
        const current = currentVersion.split('.').map(Number);
        const required = requiredVersion.split('.').map(Number);
        
        for (let i = 0; i < 3; i++) {
            if (current[i] < required[i]) return true;
            if (current[i] > required[i]) return false;
        }
        
        return false;
    }

    // 通知更新
    notifyUpdate(serverVersion) {
        // 更新當前配置
        this.config.VERSION = serverVersion.version;
        if (serverVersion.modules) {
            this.config.MODULES = { ...this.config.MODULES, ...serverVersion.modules };
        }
        
        // 發送更新通知
        const event = new CustomEvent('appUpdateAvailable', {
            detail: {
                currentVersion: this.config.VERSION,
                newVersion: serverVersion.version,
                updateInfo: serverVersion.updateInfo,
                requiresRefresh: this.requiresRefresh(serverVersion)
            }
        });
        window.dispatchEvent(event);
    }
    
    // 判斷是否需要強制刷新頁面
    requiresRefresh(serverVersion) {
        if (!serverVersion.compatibility) return false;
        
        // 檢查當前版本是否低於最低兼容版本
        return this.needsUpdate(
            this.config.VERSION, 
            serverVersion.compatibility.minVersion
        );
    }

    // 獲取模組版本
    getModuleVersion(moduleName) {
        return this.config.MODULES[moduleName.toUpperCase()] || this.config.VERSION;
    }

    // 獲取帶版本的URL
    getVersionedUrl(url) {
        if (!url) return url;
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}v=${this.config.VERSION}`;
    }

    // 檢查並更新本地版本
    updateLocalVersion() {
        localStorage.setItem('app_version', this.config.VERSION);
        localStorage.setItem('app_modules', JSON.stringify(this.config.MODULES));
        localStorage.setItem('app_updated_at', new Date().toISOString());
    }
    
    // 獲取當前版本
    getVersion() {
        return this.config.VERSION;
    }
    
    // 獲取API版本
    getApiVersion() {
        return this.config.API_VERSION;
    }
}

// 創建單例實例
const versionManager = new VersionManager();
export default versionManager; 