/**
 * 炸雞店管理系統 - 相容性初始化
 * 提供全局Firebase配置和初始化服務
 */

// 確保FirebaseConfig全局可用
window.firebaseConfig = {
    apiKey: "AIzaSyAbMpFZrZXDIeK_apqpH3xTznc_6eAXxpE",
    authDomain: "chicken-tw.firebaseapp.com",
    projectId: "chicken-tw",
    storageBucket: "chicken-tw.firebasestorage.app",
    messagingSenderId: "100370408743",
    appId: "1:100370408743:web:7190cd6f81a0b89e49f502",
    measurementId: "G-8XQYYP04RY"
};

// 初始化Firebase
function initializeCompatFirebase() {
    // 如果已經初始化，就不重複初始化
    if (window.firebaseApp) {
        console.log("Firebase已經初始化，使用現有實例");
        return {
            fbApp: window.firebaseApp,
            fbAuth: window.fbAuth,
            db: window.db
        };
    }

    console.log("Firebase尚未初始化，進行初始化");
    try {
        // 確保Firebase SDK加載完成
        if (typeof firebase === 'undefined') {
            console.error("Firebase SDK未加載");
            return null;
        }

        // 避免重複初始化
        let app;
        try {
            app = firebase.app();
            console.log("使用現有Firebase應用實例");
        } catch(e) {
            console.log("創建新的Firebase應用實例");
            app = firebase.initializeApp(window.firebaseConfig);
        }

        // 取得服務
        const auth = firebase.auth();
        const firestore = firebase.firestore();

        // 設置全局實例
        window.firebaseApp = app;
        window.fbAuth = auth;
        window.db = firestore;

        console.log("Firebase相容性初始化完成");
        return {
            fbApp: app,
            fbAuth: auth,
            db: firestore
        };
    } catch(error) {
        console.error("Firebase相容性初始化失敗:", error);
        return null;
    }
}

// 設置初始化函數
window.initializeFirebaseAndAuth = function() {
    return new Promise((resolve, reject) => {
        try {
            const result = initializeCompatFirebase();
            if (result) {
                console.log("Firebase初始化成功");
                resolve(result);
            } else {
                reject(new Error("Firebase初始化失敗"));
            }
        } catch (error) {
            console.error("Firebase初始化錯誤:", error);
            reject(error);
        }
    });
};

// 執行初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log("init-compat.js: 頁面載入完成，準備初始化Firebase");
    
    // 延遲初始化，確保其他腳本已加載
    setTimeout(() => {
        // 發送初始化狀態事件
        const initEvent = new CustomEvent('firebase-compat-ready', {
            detail: { firebaseConfig: window.firebaseConfig }
        });
        document.dispatchEvent(initEvent);
        
        console.log("Firebase相容模式準備就緒");
    }, 100);
});

console.log("init-compat.js loaded: Firebase相容性初始化服務已載入"); 