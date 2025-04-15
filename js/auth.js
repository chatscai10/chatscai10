// js/auth.js - Functions accept db/fbAuth parameters

'use strict';

const LIFF_ID = "2007075778-rMp6WYox";
//const CLOUD_FUNCTION_URL = "https://handlelifflogin-jdwjcsfmaq-uc.a.run.app";

// Global state variables specific to auth flow
let liffProfile = null;
let userRoles = null; // Store roles fetched during login
//let justLoggedIn = false; // Flag for post-login state handling
// --- (頂部變數和現有函數保持不變) ---
let pagePermissions = null; // <-- 新增：緩存頁面權限設定
let fetchPermissionsPromise = null; // <-- 新增：防止重複獲取

// --- (頂部變數和現有函數保持不變) ---
/**
 * Initialize LIFF (Accepts fbAuth, db parameters)
 * This function is called after Firebase is ready.
 */
async function initializeLiff(fbAuth, db) {
    const messageElement = document.getElementById('login-message');
    const loginButtonContainer = document.getElementById('login-button-container');
    if (!messageElement || !loginButtonContainer) { console.error("Login message/button container missing"); return; }
    loginButtonContainer.innerHTML = ''; // Clear button area

    if (!liff) { // Check if LIFF SDK loaded
        console.error("LIFF SDK not loaded!");
        messageElement.textContent = 'LIFF SDK 載入失敗。';
        return;
    }

    try {
        console.log("Initializing LIFF with ID (Firebase instance provided):", LIFF_ID);
        await liff.init({ liffId: LIFF_ID });
        console.log("LIFF initialized successfully.");

        if (!liff.isLoggedIn()) {
            console.log("User is not logged in to LINE.");
            messageElement.textContent = '請使用 LINE 登入';
            const loginButton = document.createElement('button');
            loginButton.textContent = '使用 LINE 登入';
            loginButton.classList.add('btn');
            loginButton.onclick = () => {
                messageElement.textContent = '正在導向 LINE 登入畫面...';
                // 這裡用戶還沒登入 LINE，直接引導去 LINE 登入即可
                liff.login();
            };
            loginButtonContainer.appendChild(loginButton);
        } else { // 用戶已登入 LINE
            // console.log("User is not logged in to LINE. Redirecting to login..."); // <-- 移除或修正這個錯誤的 Log
            console.log("User is logged in to LINE. Checking Firebase Auth status..."); // <-- 正確的 Log
            messageElement.textContent = '正在檢查您的登入狀態...'; // 更新提示

            // !!! 核心修改：先檢查 Firebase 登入狀態 !!!
            const currentUser = fbAuth.currentUser;

            if (currentUser) {
                // --- 如果 Firebase 也已經登入 ---
                console.log("Firebase user already logged in:", currentUser.uid);
                messageElement.textContent = '您已登入，正在載入應用程式...';
                // **不需要** 再次呼叫 loginWithLiff
                // 可以直接執行已登入的後續操作
                handleExistingFirebaseSession(currentUser); // 呼叫處理已登入狀態的函數 (見下方說明)

            } else {
                // --- 如果 Firebase 尚未登入 ---
                console.log("Firebase user not logged in. Proceeding with LIFF -> Custom Token flow...");
                messageElement.textContent = '正在透過 LINE 驗證您的身份...'; // 更新提示
                // **才執行** 完整的登入流程
                await loginWithLiff(fbAuth, db); // 呼叫 loginWithLiff
            }
        }
    } catch (liffError) {
        console.error("LIFF initialization failed:", liffError);
        messageElement.textContent = `LIFF 初始化失敗: ${liffError.message}`;
        // Display retry button
        const retryButton = document.createElement('button');
        retryButton.textContent = '重試初始化';
        retryButton.classList.add('btn');
        retryButton.onclick = () => { window.location.reload(); };
        loginButtonContainer.appendChild(retryButton);
    }
}

// 處理已存在 Firebase 登入狀態的函數
function handleExistingFirebaseSession(user) { // user 是 fbAuth.currentUser
    console.log("Handling existing Firebase session for user:", user.uid);
    // 1. 更新選單 UI
    if (typeof populateUserInfoInMenu === 'function') {
        populateUserInfoInMenu(fbAuth); // 傳遞 fbAuth
    }

    // 2. 從 sessionStorage 恢復數據
    const sessionDataString = sessionStorage.getItem('loggedInUser');
    let sessionData = null;
    if (sessionDataString) {
        try {
            sessionData = JSON.parse(sessionDataString);
            if (sessionData.authUid === user.uid) {
                userRoles = sessionData.roles; // 更新全域 roles
                console.log("Restored roles from session:", userRoles);
            } else {
                // UID 不匹配，清除舊 session
                console.warn("Session UID mismatch, clearing session.");
                sessionStorage.removeItem('loggedInUser');
                sessionData = null;
                userRoles = null;
                // 可能需要重新觸發一次登入流程來獲取正確的 session
                 // window.location.reload(); // 或者更溫和的方式
            }
        } catch (e) { console.error("Error reading session data in handleExistingFirebaseSession", e); sessionStorage.removeItem('loggedInUser'); sessionData = null; userRoles = null; }
    } else {
         console.warn("Firebase user exists, but no session data found. Roles might be missing.");
         userRoles = null; // 確保 roles 被清除
         // 這裡可能需要一個機制去 Firestore 重新獲取 roles，但會增加複雜度
         // 暫時先允許繼續，依賴後續 requireLogin 的檢查
    }

    // 3. 根據恢復的狀態決定是否跳轉 (僅處理 Level 0 的情況)
    if (userRoles && userRoles.level === 0) {
        // 檢查是否已填寫基本資料 (用 sessionData 中的 phone 判斷)
        if (!sessionData?.phone) { // 如果 phone 不存在或為空
            // Level 0 且未完成註冊
            if (window.location.pathname !== '/register.html') { // 如果不在註冊頁
                 console.log("Existing Level 0 session (no phone). Redirecting to register.html.");
                 // 確保 pendingEmployeeDocId 存在
                 if (sessionData?.employeeDocId) {
                      sessionStorage.setItem('pendingEmployeeDocId', sessionData.employeeDocId);
                 } else {
                       console.error("Missing employeeDocId in session for Level 0 user!");
                       alert("缺少註冊關鍵資訊，請重新登入。");
                       handleLogout(fbAuth);
                       return;
                 }
                 window.location.href = 'register.html';
             }
         } else {
             // Level 0 且已完成註冊 (有 phone)
             if (window.location.pathname !== '/pending.html') { // 如果不在等待頁
                 console.log("Existing Level 0 session (has phone). Redirecting to pending.html.");
                 window.location.href = 'pending.html';
             }
         }
    }
     // 對於 Level > 0 的用戶，不在此處進行跳轉，由 requireLogin 處理權限
}

// 在 auth.js 檔案中

async function loginWithLiff(fbAuth, db) {
    const messageElement = document.getElementById('login-message');
    if (!messageElement || !fbAuth || !db) { console.error("loginWithLiff: fbAuth or db parameter is missing!"); messageElement.textContent = '內部錯誤(1)'; return; }

    try {
        // 1. 取得 LIFF Profile
        liffProfile = await liff.getProfile();
        messageElement.textContent = '正在與伺服器驗證...';

        // 2. 取得 ID Token
        console.log("Attempting to get ID Token at:", Date.now()); // <-- Log before getIDToken
        const idToken = await liff.getIDToken();
        console.log("Got ID Token at:", Date.now()); // <-- Log after getIDToken
        // VVVVVV 保留檢查 Token 片段的日誌 VVVVVV
        console.log("前端取得的原始 ID Token 片段:", idToken ? idToken.substring(0, 20) + "..." + idToken.substring(idToken.length - 20) : "NULL 或 EMPTY");
        // ^^^^^^ 保留檢查 Token 片段的日誌 ^^^^^^
        if (!idToken) {
             throw new Error("無法獲取有效的 LINE ID Token (可能是 null 或空值).");
        }

        // <-- 新增日誌：檢查要發送的數據 -->
        const requestBody = {
            idToken: idToken,
            profile: liffProfile
        };
        console.log("Preparing to send request body:", JSON.stringify(requestBody, null, 2));
        // <-- 新增日誌結束 -->

        // 3. 呼叫後端 Cloud Function
        console.log("Sending fetch request at:", Date.now()); // <-- Log before fetch
        const response = await fetch('/api/line-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody), // 使用剛才建立的物件
        });

        // 4. 處理後端回應
        if (!response.ok) {
            let errorData = null;
            try { errorData = await response.json(); console.error("Backend returned error data:", errorData); }
            catch (e) { console.error("Failed to parse error response body from backend."); }
            throw new Error(`驗證失敗: ${errorData?.error?.message || response.statusText || `伺服器錯誤 ${response.status}`}`);
        }

        // 5. 解析成功的 JSON 回應
        const result = await response.json();
        console.log("Backend Response Result:", JSON.stringify(result, null, 2));

        // --- 後續的 custom token 登入、儲存 session、頁面跳轉邏輯保持不變 ---
        const customToken = result.firebaseToken;
        const serverRoles = result.userInfo?.roles || { level: -1 };
        const serverEmployeeDocId = result.userInfo?.employeeDocId || null;
        const employeeDataFromServer = {
             phone: result.userInfo?.phone || null,
             name: result.userInfo?.displayName || null,
             pictureUrl: result.userInfo?.pictureUrl || null
        };

        if (!customToken) { throw new Error("無法從伺服器獲取有效的登入權杖."); }
        console.log("Firebase Custom Token received. Roles:", serverRoles, "DocID:", serverEmployeeDocId);
        messageElement.textContent = '正在登入 Firebase...';

        const userCredential = await fbAuth.signInWithCustomToken(customToken);

        // --- ADDED: Force refresh ID token to get latest claims ---
        console.log("Forcing ID token refresh to get latest claims...");
        let refreshedClaims = null;
        try {
            const forceRefresh = true; // Explicitly true
            const idTokenResult = await userCredential.user.getIdTokenResult(forceRefresh);
            refreshedClaims = idTokenResult.claims; // Store the claims
            console.log("Refreshed ID Token Claims:", refreshedClaims);
            // Now userCredential.user internal state *should* have the latest token/claims
        } catch (refreshError) {
            console.error("Error forcing ID token refresh:", refreshError);
            messageElement.textContent = '更新使用者權限時發生錯誤，請稍後再試。';
            if (fbAuth) handleLogout(fbAuth);
            return; // Stop further execution
        }
        // --- END: Force refresh --- 

        // --- MODIFIED: Update userRoles immediately from refreshed claims --- 
        const newLevel = refreshedClaims?.level ?? -1; // Get level from refreshed claims, default to -1
        console.log(`Updating userRoles. Previous: ${JSON.stringify(userRoles)}, New Level from claims: ${newLevel}`);
        // Preserve existing store info if available, update level
        userRoles = {
             level: newLevel,
             store: userRoles?.store // Keep existing store if already set
        };
        if (serverRoles && serverRoles.store && !userRoles.store) {
             userRoles.store = serverRoles.store; // Ensure store from server is set if not present
        }
        console.log("Updated userRoles object:", userRoles);
        // --- END: Update userRoles ---

        // --- MODIFIED: Attempt to re-save session AFTER token refresh and roles update ---
        console.log("Attempting to re-save session data after token refresh...");
        const userToStore = {
            authUid: userCredential.user.uid,
            name: employeeDataFromServer.name || liffProfile?.displayName || '使用者',
            lineUserId: liffProfile?.userId,
            pictureUrl: employeeDataFromServer.pictureUrl || liffProfile?.pictureUrl,
            roles: userRoles, // Use the UPDATED userRoles
            employeeDocId: serverEmployeeDocId,
            phone: employeeDataFromServer.phone
        };
        try {
             sessionStorage.setItem('loggedInUser', JSON.stringify(userToStore));
             console.log("Re-saved user session data with potentially updated roles.");
        } catch(sessionError) {
             console.error("Error re-saving data to sessionStorage (Tracking Prevention?):", sessionError);
             // Log but continue for now, relying on in-memory userRoles
        }
        // --- END: Re-save session ---

        console.log("Received userInfo from server:", result.userInfo); // This log might be slightly out of sync now, userRoles is updated

        // --- Jump logic remains the same, using the updated userRoles ---
        // REMOVED: userRoles = serverRoles; 
        // REMOVED: Redundant sessionStorage save block

        if (userRoles.level === 0) {
            if (serverEmployeeDocId && (!userToStore.phone)) {
                console.log("New user (Level 0) needs registration. Redirecting to register.html...");
                sessionStorage.setItem('pendingEmployeeDocId', serverEmployeeDocId);
                window.location.href = 'register.html';
            } else {
                console.log("Existing Level 0 user pending approval. Redirecting to pending.html...");
                sessionStorage.removeItem('pendingEmployeeDocId');
                window.location.href = 'pending.html';
            }
        } else if (userRoles.level > 0) {
            console.log("Existing user (Level > 0). Redirecting to announce.html...");
            sessionStorage.removeItem('pendingEmployeeDocId');
            window.location.href = 'announce.html';
        } else {
            console.error("Invalid level after login. Level:", userRoles.level);
            messageElement.textContent = '登入狀態異常，請聯繫管理員。';
            if (fbAuth) handleLogout(fbAuth);
        }
        // --- 跳轉邏輯結束 ---

    } catch (error) {
        console.error("LIFF Login process failed:", error); // Log the full error

        // --- MODIFIED: Improved User Feedback and Retry ---
        const messageElement = document.getElementById('login-message');
        let displayMessage = `登入失敗: ${error.message}`;

        // Check if the error message indicates a token-related issue
        const isTokenError = /token|過期|expired|無效|invalid|驗證失敗/i.test(error.message); 

        if (isTokenError) { 
             displayMessage = "LINE 登入憑證已過期或無效，請點擊下方按鈕重試。";
             // Offer retry by showing the login button again
             const loginButtonContainer = document.getElementById('login-button-container');
             
             if (loginButtonContainer && messageElement) {
                  loginButtonContainer.innerHTML = ''; // Clear previous buttons/messages if any
                  const loginButton = document.createElement('button');
                  loginButton.textContent = '重新嘗試 LINE 登入';
                  loginButton.classList.add('btn', 'btn-primary'); // Add some styling
                  loginButton.onclick = () => {
                       if(messageElement) messageElement.textContent = '正在重新導向 LINE 登入畫面...';
                       // Re-initiate the login flow. liff.login() might be enough if LIFF is initialized.
                       // Calling liff.login() forces the user through the LINE login screen again, getting a fresh token.
                       liff.login(); 
                  };
                  loginButtonContainer.appendChild(loginButton);
             } else {
                  console.error("Cannot show retry button: login-button-container or login-message element not found.");
             }
        }
        // Update the message element regardless
        if(messageElement) messageElement.textContent = displayMessage;
        // --- End of MODIFICATION ---

        // Optional: Log the error to your backend/monitoring service here
    }
}

// --- 其他 auth.js 中的函數保持不變 ---



/**
 * 設定 Firebase Auth 狀態監聽器 (接收 fbAuth 作為參數)
 * (修改版：移除 authStatePromise 相關邏輯)
 */
function setupAuthStateListener(fbAuth) { // <-- 接收參數
    if (!fbAuth) { 
        console.error("setupAuthStateListener: fbAuth parameter missing!"); 
        // 嘗試使用全局變量作為備選
        if (typeof firebase !== 'undefined' && firebase.auth) {
            console.warn("setupAuthStateListener: Using global firebase.auth as fallback.");
            fbAuth = firebase.auth();
        } else {
            console.error("setupAuthStateListener: No Firebase Auth available. Abandoning listener setup.");
            return;
        }
    }
    console.log("Setting up Auth state listener using passed fbAuth instance.");

    // 使用傳入的 fbAuth
    fbAuth.onAuthStateChanged(async (user) => {
        console.log("[AUTH STATE CHANGE] User:", user ? user.uid : null, " Path:", window.location.pathname);
        let firebaseUser = null;
        let currentUserRoles = null; // 使用局部變數

        if (user) { // === 偵測到登入狀態 ===
            firebaseUser = user;
            console.log('Auth state changed: User is signed in.', user.uid);

            // 恢復 session data
            const sessionDataString = sessionStorage.getItem('loggedInUser');
            if (sessionDataString) {
                try {
                    const sessionData = JSON.parse(sessionDataString);
                    if (sessionData.authUid === user.uid) { currentUserRoles = sessionData.roles; }
                } catch (e) { console.error("Error parsing session data in onAuthStateChanged", e); }
            }
            userRoles = currentUserRoles; // 更新全域

            // 更新選單 (傳遞 fbAuth)
            setTimeout(() => { 
                if (typeof populateUserInfoInMenu === 'function') { 
                    try {
                        populateUserInfoInMenu(fbAuth); 
                    } catch (e) {
                        console.error("Error calling populateUserInfoInMenu:", e);
                    }
                } else {
                    console.log("populateUserInfoInMenu function not available yet");
                }
            }, 100); // 增加延遲確保函數已加載
            // --- 不再處理任何跳轉 ---

        } else { // === 偵測到登出狀態 ===
            sessionStorage.removeItem('loggedInUser');
            userRoles = null; // 清除全域 roles
            console.log('Auth state changed: User is signed out.');
            setTimeout(() => { 
                if (typeof populateUserInfoInMenu === 'function') { 
                    try {
                        populateUserInfoInMenu(fbAuth); 
                    } catch (e) {
                        console.error("Error calling populateUserInfoInMenu:", e);
                    }
                } 
            }, 100);

            // --- 只保留簡單的登出跳轉邏輯 ---
            if (window.location.pathname !== '/' && !window.location.pathname.endsWith('index.html')) {
                console.log("User signed out (detected by listener), redirecting to login page.");
                window.location.href = '/index.html';
            } else {
                console.log("User signed out on index page. No redirect needed.");
            }
            // --- 登出邏輯結束 ---
        }
    });
}

/**
 * 檢查使用者是否已登入 (接收 fbAuth 作為參數)
 * (修改版：優先檢查 sessionStorage)
 * @returns {object|null}
 */
function checkLoginStatus(fbAuth) { // <-- 仍然接收 fbAuth 作為後備檢查
    // 1. --- 【主要修改】優先檢查 Session Storage ---
    const sessionDataString = sessionStorage.getItem('loggedInUser');
    if (sessionDataString) {
        try {
            const sessionData = JSON.parse(sessionDataString);
            // 基本驗證 sessionData 結構
            if (sessionData && sessionData.authUid) {
                console.log("checkLoginStatus: Found valid data in sessionStorage for UID:", sessionData.authUid);
                // 嘗試獲取 fbAuth.currentUser 的 displayName 作補充
                let authDisplayName = null;
                // 確保 fbAuth 和 currentUser 存在才讀取
                if (fbAuth && fbAuth.currentUser && fbAuth.currentUser.uid === sessionData.authUid) {
                    authDisplayName = fbAuth.currentUser.displayName;
                }
                // 返回 Session 數據，補充可能的 Auth DisplayName
                return { ...sessionData, displayNameFromAuth: authDisplayName || sessionData.name };
            } else {
                console.warn("checkLoginStatus: Invalid data found in sessionStorage (missing authUid?). Clearing.");
                sessionStorage.removeItem('loggedInUser');
            }
        } catch (e) {
            console.error("Error parsing user data from sessionStorage:", e);
            sessionStorage.removeItem('loggedInUser');
        }
    }
    // --- Session Storage 檢查結束 ---

    // 2. 如果 Session Storage 沒有有效數據，再檢查 fbAuth.currentUser 作為後備
    if (!fbAuth) {
        // 嘗試使用全局 firebase.auth() 作為備選
        if (typeof firebase !== 'undefined' && firebase.auth) {
            console.warn("checkLoginStatus: Using global firebase.auth as fallback.");
            fbAuth = firebase.auth();
        } else {
            console.error("checkLoginStatus: No Firebase Auth available. Cannot check auth status.");
            return null;
        }
    }
    
    const currentFbUser = fbAuth.currentUser;
    if (currentFbUser) {
        console.warn("checkLoginStatus: Using fbAuth.currentUser as fallback (session data missing/invalid).");
        // 只返回基本資訊，因為 session 中的 roles 等可能已丟失
        return { authUid: currentFbUser.uid, name: currentFbUser.displayName };
    }

    // 兩種方法都沒有找到用戶
    return null;
}
/**
 * 新增：從 Firestore 獲取頁面權限設定並緩存
 * @param {firebase.firestore.Firestore} db
 */
async function fetchPagePermissions(db) {
    if (pagePermissions) { // 如果已緩存，直接返回
        return pagePermissions;
    }
    if (fetchPermissionsPromise) { // 如果正在獲取中，等待現有 Promise
        return fetchPermissionsPromise;
    }
    if (!db) {
        console.error("fetchPagePermissions: db instance not provided!");
        return {}; // 返回空對象，表示無法獲取
    }

    console.log("Fetching page permissions from Firestore...");
    fetchPermissionsPromise = new Promise(async (resolve) => {
        try {
            const docRef = db.collection('settings').doc('page_permissions');
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                pagePermissions = docSnap.data();
                // 移除 Firestore 添加的 meta 字段（如果有的話）
                delete pagePermissions?.lastUpdatedBy;
                delete pagePermissions?.lastUpdatedTimestamp;
                console.log("Page permissions fetched and cached:", pagePermissions);
            } else {
                console.warn("Page permissions document not found in Firestore. Using defaults.");
                pagePermissions = {}; // 設為空對象
            }
        } catch (error) {
            console.error("Error fetching page permissions:", error);
            pagePermissions = {}; // 出錯時也設為空對象
        } finally {
            fetchPermissionsPromise = null; // 清除 Promise 引用
            resolve(pagePermissions);
        }
    });
    return fetchPermissionsPromise;
}


/**
 * Require login and check level (加入頁面權限檢查和 Level 0 處理)
 * @param {number} [defaultMinLevel=1] - 如果未設定權限，使用的預設最低等級
 * @param {FirebaseAuth} fbAuth
 * @param {Firestore} db - 需要 db 來獲取權限設定
 * @returns {Promise<object|null>} - Returns user info object or null
 */
async function requireLogin(defaultMinLevel = 1, fbAuth, db) {
    // 檢查 fbAuth 和 db 是否有效
    if (!fbAuth || !db) {
        console.error("requireLogin: fbAuth or db instance not provided!");
        // 避免在 index.html 上無限重定向自己
        if (window.location.pathname !== '/' && !window.location.pathname.endsWith('index.html')) {
            window.location.href = '/index.html';
        }
        return null;
    }

    // 1. 檢查登入狀態 (優先 Session Storage)
    const currentUserInfo = checkLoginStatus(fbAuth);
    if (!currentUserInfo) {
        console.log("requireLogin: User not logged in. Redirecting...");
        if (window.location.pathname !== '/' && !window.location.pathname.endsWith('index.html')) {
            window.location.href = '/index.html';
        }
        return null;
    }

    // 2. 獲取用戶等級
    const userLevel = currentUserInfo.roles?.level ?? -1; // 預設 -1 (異常)

    // 3. 處理異常或 Level 0
    if (userLevel < 0) {
        console.warn(`requireLogin: User level unknown or invalid (${userLevel}) for ${currentUserInfo.authUid}. Logging out.`);
        alert('帳號狀態異常，請聯繫管理員或重新登入。');
        handleLogout(fbAuth); // 登出
        return null;
    }

    if (userLevel === 0) {
        // Level 0 用戶的處理
        const currentPath = window.location.pathname;
        const allowedPendingPages = ['/register.html', '/pending.html'];

        if (allowedPendingPages.includes(currentPath)) {
            // 允許訪問註冊頁或等待頁
            console.log(`requireLogin: Level 0 user accessing allowed page ${currentPath}. OK.`);
            // 特別檢查：如果在註冊頁，必須要有 pendingEmployeeDocId
            if (currentPath === '/register.html' && !sessionStorage.getItem('pendingEmployeeDocId')) {
                console.warn("Level 0 user on register.html but missing pendingEmployeeDocId. Redirecting to index.");
                alert('缺少註冊資訊，請重新登入。');
                window.location.href = '/index.html';
                return null;
            }
            return currentUserInfo; // 返回用戶信息，允許留在當前頁面
        } else if (currentPath === '/' || currentPath.endsWith('index.html')) {
             // 在首頁， auth.js 的 loginWithLiff 或 handleExistingFirebaseSession 會處理跳轉邏輯
             console.log("requireLogin: Level 0 user on index page. Allowing auth.js to handle redirection.");
             return currentUserInfo;
        } else {
            // 訪問其他任何頁面，都強制跳轉到 pending.html
            console.warn(`requireLogin: Level 0 user denied access to ${currentPath}. Redirecting to pending.html.`);
            window.location.href = '/pending.html';
            return null;
        }
    }

    // --- 對於 Level > 0 的用戶，檢查頁面權限 ---
    const permissions = await fetchPagePermissions(db);
    let requiredLevel = defaultMinLevel; // 先使用函數傳入的預設值

    // 獲取當前頁面文件名 (處理根目錄和 .html 後綴)
    let currentPage = window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1);
    if (currentPage === '') currentPage = 'index.html'; // 根目錄視為 index.html
    // if (!currentPage.endsWith('.html')) currentPage += '.html'; // 確保有 .html 後綴 (如果需要)

    if (permissions && permissions.hasOwnProperty(currentPage)) {
        requiredLevel = permissions[currentPage];
        console.log(`Permission check for ${currentPage}: Required Level ${requiredLevel} (from settings)`);
    } else {
        console.log(`Permission check for ${currentPage}: Required Level ${requiredLevel} (using default)`);
    }

    // 比較用戶等級和所需等級
    if (userLevel < requiredLevel) {
        console.warn(`requireLogin: User Level ${userLevel} insufficient (needs ${requiredLevel} for ${currentPage}). Redirecting to index.`);
        alert(`權限不足 (需要等級 ${requiredLevel})。您將被導向首頁。`);
        window.location.href = '/index.html'; // 跳轉到首頁
        return null;
    }
    // --- 權限檢查結束 ---

    console.log(`requireLogin: User ${currentUserInfo.name || currentUserInfo.authUid} (Level ${userLevel}) OK for ${currentPage} (Requires ${requiredLevel}).`);
    return currentUserInfo; // 權限足夠，返回用戶資訊
}

// --- handleLogout needs fbAuth ---
async function handleLogout(fbAuth) { // Accept fbAuth
    if (!fbAuth) { console.error("handleLogout: fbAuth missing!"); return; }
    console.log("Logging out...");
    try { await fbAuth.signOut(); } catch (e) { console.error("Firebase signout error", e); }
    finally {
        sessionStorage.removeItem('loggedInUser');
        if (liff.isInClient()) { liff.logout(); }
        window.location.href = '/index.html';
    }
}

/**
 * 處理新人註冊表單提交 (在 register.html 中調用)
 * @param {Event} event - 表單提交事件
 * @param {object} db - Firestore 實例
 */
async function handleRegister(event, db) {
    event.preventDefault(); // 阻止表單的默認提交行為

    const form = event.target;
    const messageElement = document.getElementById('register-message');
    const submitButton = form.querySelector('button[type="submit"]');
    if (!db) { console.error("handleRegister: db instance is missing!"); if(messageElement) messageElement.textContent = '內部錯誤(2)'; return; }
    if(messageElement) messageElement.textContent = ''; // 清空舊訊息

    // --- ADDED: Client-side Validation --- 
    let firstInvalidField = null;
    const requiredFields = form.querySelectorAll('[required]');
    let allValid = true;

    requiredFields.forEach(field => {
        // Reset border style
        field.style.borderColor = ''; // Reset potential red border

        if (!field.value.trim()) {
            allValid = false;
            field.style.borderColor = 'red'; // Highlight empty required field
            if (!firstInvalidField) {
                firstInvalidField = field; // Keep track of the first empty field
            }
            console.warn(`Validation failed: Field ${field.name || field.id} is required.`);
        }
    });

    if (!allValid) {
        if(messageElement) {
            messageElement.textContent = '請填寫所有標有 * 的必填欄位。'
            messageElement.style.color = 'red';
        }
        if (firstInvalidField) {
            firstInvalidField.focus(); // Focus the first invalid field
        }
        return; // Stop execution if validation fails
    }
    // --- END: Client-side Validation ---

    const employeeDocId = document.getElementById('employee-doc-id-holder')?.value;
    if (!employeeDocId) {
        if(messageElement) messageElement.textContent = '錯誤：缺少員工記錄ID，無法更新資料。請重新登入。';
        return;
    }

    const formData = new FormData(form);
    const employeeData = {};
    formData.forEach((value, key) => {
        employeeData[key] = value.trim(); // Trim whitespace from values
    });

    // Mark that initial registration is complete (e.g., set a flag or use phone presence)
    employeeData.registrationComplete = true;
    employeeData.isActive = false; // Still needs admin approval
    employeeData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    // Level should remain 0 until approved

    if (submitButton) submitButton.disabled = true;
    if (messageElement) messageElement.textContent = '正在提交資料...';

    try {
        const employeeRef = db.collection('employees').doc(employeeDocId);
        await employeeRef.update(employeeData);

        if (messageElement) {
            messageElement.textContent = '註冊資料提交成功！請等待管理員審核。';
            messageElement.style.color = 'green';
        }
        // Clear session storage for pending ID
        sessionStorage.removeItem('pendingEmployeeDocId');

        // Redirect to pending page after a short delay
        setTimeout(() => {
            window.location.href = 'pending.html';
        }, 2000);

    } catch (error) {
        console.error("Error updating employee data:", error);
        if (messageElement) {
            messageElement.textContent = `提交失敗：${error.message}`;
            messageElement.style.color = 'red';
        }
        if (submitButton) submitButton.disabled = false;
    }
}

console.log("auth.js (LIFF version - functions accept params) loaded.");

/**
 * 登出功能 - 從Firebase和LINE登出，清理會話數據，並重定向到首頁
 * @param {Object} fbAuth - Firebase Auth實例
 */
async function logout(fbAuth) {
    console.log("執行登出程序...");
    
    try {
        // 1. 清除會話存儲
        sessionStorage.removeItem('userInfo');
        sessionStorage.removeItem('idToken');
        sessionStorage.removeItem('userRoles');
        sessionStorage.removeItem('permissions');
        sessionStorage.removeItem('loggedInUser');
        
        // 2. Firebase登出
        if (fbAuth) {
            await fbAuth.signOut();
            console.log("Firebase登出成功");
        } else {
            console.warn("未提供Firebase Auth實例進行登出");
            // 嘗試使用全局變量
            if (window.fbAuth) {
                await window.fbAuth.signOut();
                console.log("使用全局Firebase Auth實例登出成功");
            }
        }
        
        // 3. LIFF登出 (如果可用)
        if (typeof liff !== 'undefined' && liff.isLoggedIn()) {
            try {
                liff.logout();
                console.log("LINE LIFF登出成功");
            } catch (liffError) {
                console.warn("LINE LIFF登出失敗:", liffError);
                // 繼續處理，不中斷登出流程
            }
        }
        
        // 4. 重定向到首頁
        window.location.href = '/';
    } catch (error) {
        console.error("登出過程中發生錯誤:", error);
        alert("登出過程中發生錯誤。將重新載入頁面...");
        // 確保即使出錯，也會重定向
        window.location.href = '/';
    }
}