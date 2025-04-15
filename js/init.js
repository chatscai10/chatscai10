// js/init.js - Final Consolidated Firebase Initialization Logic

let db = null;
let fbAuth = null;
let firebaseInitializationPromise = null;
let isFirebaseInitialized = false;
let appVersion = '20250417v2'; // 新增: 當前應用版本

console.log("init.js loaded. Ready for initialization call.");

async function initializeFirebaseAndAuth() {
    // 1. 如果已成功初始化，直接返回儲存的實例
    if (isFirebaseInitialized && db && fbAuth) {
        return { db, fbAuth };
    }

    // 2. 如果正在初始化中，等待現有的 Promise
    if (firebaseInitializationPromise) {
         console.log("Firebase initialization already in progress, awaiting...");
         return firebaseInitializationPromise;
    }

    console.log("Attempting Firebase initialization (logic consolidated in init.js)...");
    // 3. 創建並儲存新的 Promise
    firebaseInitializationPromise = new Promise(async (resolve, reject) => {
         try {
             // 檢查 Firebase SDK 和 Config 是否已載入
             if (typeof firebase === 'undefined' || !firebase.initializeApp || !firebase.firestore || !firebase.auth) {
                 throw new Error("Core Firebase SDK components not loaded yet.");
             }
             if (typeof firebaseConfig === 'undefined') {
                 throw new Error("Firebase configuration (firebaseConfig) is missing.");
             }

             let app;
             // 初始化 Firebase App
             if (!firebase.apps.length) {
                  console.log("No Firebase apps initialized yet. Initializing now...");
                  app = firebase.initializeApp(firebaseConfig);
                  console.log("Firebase App initialized.");
             } else {
                  console.log("Firebase app already initialized. Getting existing app...");
                  app = firebase.app();
             }

             // 獲取 Firestore 和 Auth 實例
             console.log("Getting Firestore and Auth instances...");
             const dbInstance = firebase.firestore(app);
             const fbAuthInstance = firebase.auth(app);

             if (dbInstance && fbAuthInstance) {
                 console.log("Firestore and Auth obtained successfully.");
                 db = dbInstance;
                 fbAuth = fbAuthInstance;
                 isFirebaseInitialized = true;
                 
                 // 初始化版本檢查功能
                 initializeVersionCheck(db);
                 
                 resolve({ db, fbAuth });
             } else {
                 throw new Error("Failed to obtain Firestore or Auth instance.");
             }
         } catch (error) {
             console.error("FATAL: Error during Firebase core initialization in init.js:", error);
             if (document.body) {
                 document.body.innerHTML = `<p style="color:red; text-align:center; padding-top: 50px;">系統核心初始化失敗: ${error.message}</p>`;
             }
             isFirebaseInitialized = false;
             reject(error);
         } finally {
              firebaseInitializationPromise = null;
         }
     });
     return firebaseInitializationPromise;
}

/**
 * 初始化版本檢查模組
 * @param {firebase.firestore.Firestore} db - Firestore 實例
 */
function initializeVersionCheck(db) {
    try {
        // 檢查 version-check.js 是否已載入
        if (typeof window.initVersionCheck === 'function') {
            console.log("Starting version check system...");
            window.initVersionCheck(db);
        } else {
            console.log("Version check module not loaded yet. Loading dynamically...");
            
            // 動態載入版本檢查模組
            const script = document.createElement('script');
            script.src = 'js/version-check.js?v=' + appVersion;
            script.onload = function() {
                console.log("Version check module loaded dynamically.");
                if (typeof window.initVersionCheck === 'function') {
                    window.initVersionCheck(db);
                } else {
                    console.error("Version check function not found after script load.");
                }
            };
            script.onerror = function() {
                console.error("Failed to load version check module.");
            };
            document.head.appendChild(script);
        }
    } catch (error) {
        console.error("Error initializing version check:", error);
    }
}

// 輔助函數 (如果其他地方需要)
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}