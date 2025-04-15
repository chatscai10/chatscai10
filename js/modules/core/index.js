/**
 * 炸雞店管理系統 - 核心模組
 * @version 2.0.0
 */

import versionManager from '../../version-manager.js';

class CoreModule {
    constructor() {
        this.name = 'core';
        this.version = versionManager.getModuleVersion('CORE');
        this.initialized = false;
    }

    async init() {
        if (this.initialized) {
            console.warn('核心模組已經初始化');
            return;
        }

        console.log(`初始化核心模組 v${this.version}`);
        
        try {
            // 初始化事件系統
            this._initEventSystem();
            
            // 初始化全局服務
            this._initGlobalServices();
            
            // 初始化工具函數
            this._initUtilities();
            
            this.initialized = true;
            console.log('核心模組初始化完成');
        } catch (error) {
            console.error('核心模組初始化失敗:', error);
            throw error;
        }
    }

    // 初始化事件系統
    _initEventSystem() {
        this.events = {
            subscribe: (eventName, callback) => {
                document.addEventListener(eventName, callback);
            },
            unsubscribe: (eventName, callback) => {
                document.removeEventListener(eventName, callback);
            },
            publish: (eventName, data) => {
                const event = new CustomEvent(eventName, { detail: data });
                document.dispatchEvent(event);
            }
        };
        
        // 添加到全局對象
        window.coreEvents = this.events;
    }

    // 初始化全局服務
    _initGlobalServices() {
        // 可以在這裡初始化日誌服務、錯誤處理等全局服務
    }

    // 初始化工具函數
    _initUtilities() {
        // 日期格式化、貨幣格式化等通用工具函數
    }

    // 獲取模組事件系統
    getEventSystem() {
        return this.events;
    }
}

// 創建核心模組實例
const coreModule = new CoreModule();
export default coreModule; 