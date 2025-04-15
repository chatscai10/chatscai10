/**
 * 炸雞店管理系統 - Firebase 配置
 * @version 2.0.0
 */

// Firebase 配置 (CommonJS風格)
const firebaseConfig = {
    apiKey: "AIzaSyAbMpFZrZXDIeK_apqpH3xTznc_6eAXxpE",
    authDomain: "chicken-tw.firebaseapp.com",
    projectId: "chicken-tw",
    storageBucket: "chicken-tw.firebasestorage.app",
    messagingSenderId: "100370408743",
    appId: "1:100370408743:web:7190cd6f81a0b89e49f502",
    measurementId: "G-8XQYYP04RY"
};

// 處理全局變量 (適用於任何環境)
if (typeof window !== 'undefined') {
    window.firebaseConfig = firebaseConfig;
    console.log("firebase-config.js loaded (config constant only).");
}

// 不再使用ES模組導出
// 舊代碼: export default firebaseConfig; 
// 已刪除，以避免語法錯誤