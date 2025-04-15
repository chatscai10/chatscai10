/**
 * 炸雞店管理系統 - 應用初始化
 * @version 2.0.0
 */

import versionManager from './version-manager.js';

class AppInitializer {
    constructor() {
        this.modules = new Map();
        this.initializationQueue = [];
    }

    // 註冊模組
    registerModule(name, initFunction) {
        this.modules.set(name, {
            name,
            version: versionManager.getModuleVersion(name),
            init: initFunction
        });
    }

    // 初始化所有模組
    async initializeAll() {
        console.log('開始初始化應用...');
        
        try {
            // 檢查版本
            await this._checkVersion();
            
            // 初始化核心功能
            await this._initializeCore();
            
            // 初始化其他模組
            for (const [name, module] of this.modules) {
                try {
                    await module.init();
                    console.log(`模組 ${name} (${module.version}) 初始化成功`);
                } catch (error) {
                    console.error(`模組 ${name} 初始化失敗:`, error);
                    this._handleModuleError(name, error);
                }
            }
            
            console.log('應用初始化完成');
        } catch (error) {
            console.error('應用初始化失敗:', error);
            this._handleInitializationError(error);
        }
    }

    // 檢查版本
    async _checkVersion() {
        const needsUpdate = await versionManager.checkForUpdates();
        if (needsUpdate) {
            this._handleUpdateAvailable();
        }
    }

    // 初始化核心功能
    async _initializeCore() {
        // 初始化事件監聽器
        this._initializeEventListeners();
        
        // 初始化錯誤處理
        this._initializeErrorHandling();
        
        // 初始化路由
        await this._initializeRouter();
    }

    // 初始化事件監聽器
    _initializeEventListeners() {
        window.addEventListener('appUpdateAvailable', this._handleUpdateAvailable.bind(this));
        window.addEventListener('error', this._handleGlobalError.bind(this));
        window.addEventListener('unhandledrejection', this._handleUnhandledRejection.bind(this));
    }

    // 初始化錯誤處理
    _initializeErrorHandling() {
        window.onerror = (message, source, lineno, colno, error) => {
            console.error('全局錯誤:', {message, source, lineno, colno, error});
            // 這裡可以添加錯誤上報邏輯
        };
    }

    // 初始化路由
    async _initializeRouter() {
        // 這裡實現路由初始化邏輯
    }

    // 處理更新可用
    _handleUpdateAvailable() {
        // 實現更新提示邏輯
    }

    // 處理模組錯誤
    _handleModuleError(moduleName, error) {
        // 實現模組錯誤處理邏輯
    }

    // 處理初始化錯誤
    _handleInitializationError(error) {
        // 實現初始化錯誤處理邏輯
    }

    // 處理全局錯誤
    _handleGlobalError(event) {
        console.error('全局錯誤:', event.error);
        event.preventDefault();
    }

    // 處理未處理的Promise拒絕
    _handleUnhandledRejection(event) {
        console.error('未處理的Promise拒絕:', event.reason);
        event.preventDefault();
    }
}

// 創建應用初始化器實例
const appInitializer = new AppInitializer();
export default appInitializer; 