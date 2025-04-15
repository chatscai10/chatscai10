/**
 * 炸雞店管理系統 - 認證模組
 * @version 1.3.2
 */

import versionManager from '../../version-manager.js';
import { auth } from '../../firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail
} from 'firebase/auth';

class AuthModule {
    constructor() {
        this.name = 'auth';
        this.version = versionManager.getModuleVersion('AUTH');
        this.currentUser = null;
        this.authStateListeners = [];
        this.initialized = false;
    }

    async init() {
        if (this.initialized) {
            console.warn('認證模組已經初始化');
            return;
        }

        console.log(`初始化認證模組 v${this.version}`);
        
        try {
            // 設置認證狀態監聽器
            this._setupAuthStateListener();
            
            this.initialized = true;
            console.log('認證模組初始化完成');
        } catch (error) {
            console.error('認證模組初始化失敗:', error);
            throw error;
        }
    }

    // 設置認證狀態監聽器
    _setupAuthStateListener() {
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            
            // 通知所有監聽器
            this.authStateListeners.forEach(listener => {
                try {
                    listener(user);
                } catch (error) {
                    console.error('認證狀態監聽器錯誤:', error);
                }
            });
            
            // 發布認證狀態變更事件
            if (window.coreEvents) {
                window.coreEvents.publish('authStateChanged', { user });
            }
        });
    }

    // 登入
    async login(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return userCredential.user;
        } catch (error) {
            console.error('登入失敗:', error);
            throw error;
        }
    }

    // 註冊
    async register(email, password) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            return userCredential.user;
        } catch (error) {
            console.error('註冊失敗:', error);
            throw error;
        }
    }

    // 登出
    async logout() {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('登出失敗:', error);
            throw error;
        }
    }

    // 重設密碼
    async resetPassword(email) {
        try {
            await sendPasswordResetEmail(auth, email);
        } catch (error) {
            console.error('重設密碼失敗:', error);
            throw error;
        }
    }

    // 獲取當前用戶
    getCurrentUser() {
        return this.currentUser;
    }

    // 添加認證狀態監聽器
    addAuthStateListener(listener) {
        if (typeof listener === 'function') {
            this.authStateListeners.push(listener);
            
            // 如果已經有用戶，立即調用監聽器
            if (this.currentUser) {
                listener(this.currentUser);
            }
        }
    }

    // 移除認證狀態監聽器
    removeAuthStateListener(listener) {
        const index = this.authStateListeners.indexOf(listener);
        if (index !== -1) {
            this.authStateListeners.splice(index, 1);
        }
    }
}

// 創建認證模組實例
const authModule = new AuthModule();
export default authModule; 