/**
 * 炸雞店管理系統 - 主要腳本
 * @version 2.0.1
 */

// 全局變量 (避免重複聲明)
// 在window上檢查全局變量是否已存在
if (typeof window.db === 'undefined') window.db = null;
if (typeof window.fbAuth === 'undefined') window.fbAuth = null;
// 本地引用
let dbRef = null;
let fbAuthRef = null;

// DOM 加載完成後執行
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed. main.js executing.');
    
    try {
        // 檢查是否為Safari或受限的隱私模式
        const isPrivacyRestricted = await checkStorageAvailability();
        if (isPrivacyRestricted) {
            console.warn("瀏覽器處於隱私模式或已限制儲存功能，將使用記憶體模式運作");
            showNotification('您的瀏覽器已啟用隱私模式，部分功能可能無法正常運作。', 'warning');
        }
        
        // 1. 先載入菜單 (非阻塞)
        loadAndInjectMenu().catch(error => {
            console.error("Menu loading error:", error);
        });
        
        // 2. 初始化 Firebase (如果需要)
        if (typeof initializeFirebaseAndAuth === 'function') {
            const { fbAuth: authInstance, db: dbInstance } = await initializeFirebaseAndAuth();
            // 使用引用而非重新聲明變量
            dbRef = dbInstance;
            fbAuthRef = authInstance;
            
            // 設置全局引用 (如果尚未設置)
            if (!window.db) window.db = dbRef;
            if (!window.fbAuth) window.fbAuth = fbAuthRef;
            
            console.log("Firebase initialized in main.js");
        } else {
            console.warn("Firebase initialization function not available. Skipping.");
        }
    } catch (error) {
        console.error("Error in main.js initialization:", error);
        showNotification('初始化系統時發生錯誤，請重新整理頁面或聯絡系統管理員。', 'error');
    }
});

// 檢查儲存可用性
async function checkStorageAvailability() {
    // 檢查 IndexedDB
    try {
        const testDb = window.indexedDB.open('testDB');
        await new Promise((resolve, reject) => {
            testDb.onerror = () => resolve(true); // 無法使用 IndexedDB
            testDb.onsuccess = () => {
                testDb.result.close();
                resolve(false); // 可以使用 IndexedDB
            };
        });
        return false;
    } catch (e) {
        console.error("IndexedDB check error:", e);
        return true;
    }
}

// 顯示系統通知
function showNotification(message, type = 'info', duration = 5000) {
    let notificationContainer = document.getElementById('system-notifications');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'system-notifications';
        notificationContainer.style.cssText = 'position:fixed;top:15px;right:15px;z-index:9999;width:300px;';
        document.body.appendChild(notificationContainer);
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = 'background:#fff;border-left:4px solid #ccc;padding:12px;margin-bottom:10px;box-shadow:0 2px 4px rgba(0,0,0,0.1);border-radius:3px;opacity:0;transform:translateX(30px);transition:all 0.3s;position:relative;';
    
    if (type === 'error') notification.style.borderLeftColor = '#f44336';
    else if (type === 'warning') notification.style.borderLeftColor = '#ff9800';
    else if (type === 'success') notification.style.borderLeftColor = '#4caf50';
    else notification.style.borderLeftColor = '#2196f3';
    
    notification.innerHTML = `
        <span style="position:absolute;top:5px;right:8px;cursor:pointer;font-size:16px;" class="notification-close">&times;</span>
        <div>${message}</div>
    `;
    
    notificationContainer.appendChild(notification);
    
    // 添加關閉按鈕事件
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(30px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    });
    
    // 淡入效果
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    // 自動消失
    if (duration > 0) {
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(30px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }
    
    return notification;
}

// 菜單加載和注入
async function loadAndInjectMenu() {
    console.log("Attempting to load and inject menu...");
    
    // 查找菜單容器
    const menuContainer = document.getElementById('site-menu');
    if (!menuContainer) {
        // 嘗試查找備用容器
        const backupContainer = document.getElementById('shared-menu-placeholder');
        if (!backupContainer) {
            console.error("Menu container not found: Neither 'site-menu' nor 'shared-menu-placeholder' exists");
            return;
        }
        console.log("Using backup menu container: 'shared-menu-placeholder'");
    }
    
    // 決定要加載的菜單頁面
    let pageType = 'Frontend';
    
    // 檢測管理後台頁面
    if (window.location.pathname.includes('/admin') || 
        window.location.pathname.endsWith('admin.html')) {
        pageType = 'Admin';
    }
    
    console.log(`Detected page type: ${pageType}. Loading menu from: ${pageType === 'Admin' ? '/_admin_menu.html' : '/_menu.html'}`);
    
    try {
        // 載入相應菜單
        const response = await fetch(pageType === 'Admin' ? '/_admin_menu.html' : '/_menu.html');
        if (!response.ok) throw new Error(`Failed to load menu: ${response.status} ${response.statusText}`);
        
        const menuHtml = await response.text();
        
        // 注入菜單 - 嘗試兩個可能的容器
        const container = document.getElementById('site-menu') || document.getElementById('shared-menu-placeholder');
        if (container) {
            container.innerHTML = menuHtml;
            console.log("Menu HTML successfully loaded and injected.");
            
            // 設置菜單交互
            setTimeout(() => {
                setupMenuInteractions(pageType);
            }, 100); // 短暫延遲以確保DOM已更新
        } else {
            console.error("Menu container not found after double-check");
        }
    } catch (error) {
        console.error("Failed to load or inject menu:", error);
        // 添加視覺反饋
        const container = document.getElementById('site-menu') || document.getElementById('shared-menu-placeholder');
        if (container) {
            container.innerHTML = '<div style="color:red;padding:10px;text-align:center;">菜單載入失敗</div>';
        }
    }
}

// 設置菜單交互
function setupMenuInteractions(pageType) {
    console.log("[Menu Debug] Setting up menu interactions");
    
    // 獲取菜單元素
    const menuToggle = document.getElementById('menu-toggle-btn');
    const slidingMenu = document.querySelector('.sliding-menu');
    const menuOverlay = document.querySelector('.sliding-menu-overlay');
    
    if (!menuToggle || !slidingMenu) {
        console.error("[Menu Debug] 找不到主要菜單元素", {
            menuToggle: !!menuToggle,
            slidingMenu: !!slidingMenu
        });
        
        // 嘗試找其他可能的漢堡選單元素
        const altMenuToggle = document.querySelector('.hamburger-menu') || 
                            document.querySelector('.menu-toggle') || 
                            document.querySelector('.navbar-toggler');
        
        if (altMenuToggle) {
            console.log("[Menu Debug] 找到替代選單按鈕:", altMenuToggle);
            altMenuToggle.addEventListener('click', () => {
                const nav = document.querySelector('nav.main-nav') || 
                          document.querySelector('.navbar-collapse') || 
                          document.querySelector('.main-menu');
                          
                if (nav) {
                    nav.classList.toggle('open');
                    document.body.classList.toggle('menu-open');
                }
            });
        }
        return;
    }
    
    // 如果沒有找到覆蓋層，創建一個
    if (!menuOverlay) {
        console.log("[Menu Debug] 創建菜單覆蓋層元素");
        menuOverlay = document.createElement('div');
        menuOverlay.className = 'sliding-menu-overlay';
        document.body.appendChild(menuOverlay);
    }
    
    // 切換菜單顯示/隱藏的函數
    const toggleMenu = () => {
        console.log("[Menu Debug] 切換菜單顯示狀態");
        slidingMenu.classList.toggle('open');
        menuOverlay.classList.toggle('active');
        document.body.classList.toggle('menu-open');
    };
    
    // 清除舊監聽器並添加新的
    menuToggle.removeEventListener('click', toggleMenu);
    menuToggle.addEventListener('click', toggleMenu);
    
    menuOverlay.removeEventListener('click', toggleMenu);
    menuOverlay.addEventListener('click', toggleMenu);
    
    // 添加ESC鍵關閉菜單
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && slidingMenu.classList.contains('open')) {
            toggleMenu();
        }
    });
    
    // 設置子菜單點擊行為
    const menuItems = document.querySelectorAll('.menu-item.has-children > a');
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const parent = item.parentElement;
            parent.classList.toggle('active');
        });
    });
    
    // 設置登出按鈕
    handleLogoutButton();
    
    // 填充用戶信息
    populateUserInfoInMenu(window.fbAuth);
    
    console.log("[Menu Debug] Menu interactions setup complete");
}

// 在菜單中填充用戶信息
function populateUserInfoInMenu(fbAuth) {
    console.log("Attempting to populate user info in menu...");
    
    // 輸出元素狀態，幫助調試
    const displayNameElement = document.getElementById('user-display-name');
    const userRoleElement = document.getElementById('user-role');
    const userProfilePic = document.getElementById('user-profile-pic');
    const loginButton = document.querySelector('[data-action="login"]');
    const logoutButton = document.querySelector('[data-action="logout"]');
    const adminMenuItems = document.querySelectorAll('.admin-only-menu-item');
    const welcomeNotification = document.getElementById('welcome-notification');
    
    // 隱藏歡迎通知元素
    if (welcomeNotification) {
        welcomeNotification.style.display = 'none';
    }
    
    console.log("Menu elements found:", {
        displayNameElement: !!displayNameElement,
        userRoleElement: !!userRoleElement, 
        userProfilePic: !!userProfilePic,
        loginButton: !!loginButton, 
        logoutButton: !!logoutButton,
        adminMenuItems: adminMenuItems.length,
        welcomeNotification: !!welcomeNotification
    });
    
    // 獲取用戶信息
    let currentUserInfo = null;
    
    try {
        // 優先從 sessionStorage 獲取最新用戶信息
        const storedUserInfo = sessionStorage.getItem('userInfo');
        if (storedUserInfo) {
            try {
                currentUserInfo = JSON.parse(storedUserInfo);
                console.log("Retrieved user info from sessionStorage:", currentUserInfo);
            } catch (e) {
                console.error("Error parsing stored user info:", e);
            }
        }
        
        // 如果 sessionStorage 中沒有，則嘗試從 checkLoginStatus 獲取
        if (!currentUserInfo && typeof checkLoginStatus === 'function') {
            try {
                currentUserInfo = checkLoginStatus(fbAuth);
                console.log("Retrieved user info from checkLoginStatus:", currentUserInfo);
            } catch (e) {
                console.warn("Error in checkLoginStatus:", e);
            }
        } 
        
        // 備用檢查邏輯 - 從 Firebase Auth 直接獲取
        if (!currentUserInfo && fbAuth && fbAuth.currentUser) {
            let userRoles;
            try {
                // 嘗試獲取角色信息
                const rolesStr = sessionStorage.getItem('userRoles');
                userRoles = rolesStr ? JSON.parse(rolesStr) : {"level": 0};
            } catch (e) {
                console.warn("Error parsing user roles, using default:", e);
                userRoles = {"level": 0};
            }
            
            currentUserInfo = { 
                name: fbAuth.currentUser.displayName || '用戶',
                uid: fbAuth.currentUser.uid,
                roles: userRoles,
                pictureUrl: fbAuth.currentUser.photoURL || null
            };
            console.log("Created fallback user info from fbAuth:", currentUserInfo);
        }
    } catch (error) {
        console.error("Error retrieving user info:", error);
    }
    
    // 用戶已登入 - 顯示用戶信息
    if (currentUserInfo && currentUserInfo.uid) {
        console.log("User is logged in, updating menu with user info");
        
        // 顯示用戶名稱
        if (displayNameElement) {
            displayNameElement.textContent = currentUserInfo.name || '用戶';
        }
        
        // 顯示角色/等級信息
        if (userRoleElement) {
            // 確保安全訪問 roles.level
            const userRoles = currentUserInfo.roles || {};
            const level = typeof userRoles.level !== 'undefined' ? userRoles.level : 
                         (typeof currentUserInfo.level !== 'undefined' ? currentUserInfo.level : 0);
            
            let roleText = '一般用戶';
            
            if (level >= 9) roleText = '管理員';
            else if (level >= 5) roleText = '幹部';
            else if (level >= 1) roleText = '員工';
            else roleText = '待審核';
            
            userRoleElement.textContent = roleText;
        }
        
        // 顯示頭像
        if (userProfilePic) {
            if (currentUserInfo.pictureUrl) {
                userProfilePic.src = currentUserInfo.pictureUrl;
                userProfilePic.style.display = 'block';
                
                // 添加錯誤處理 - 圖片載入失敗時顯示預設頭像
                userProfilePic.onerror = () => {
                    userProfilePic.src = '/images/default-avatar.png';
                    console.log("Profile image load failed, using default");
                };
            } else {
                userProfilePic.src = '/images/default-avatar.png';
                userProfilePic.style.display = 'block';
            }
        }
        
        // 顯示登出按鈕，隱藏登入按鈕
        if (logoutButton) logoutButton.style.display = 'block';
        if (loginButton) loginButton.style.display = 'none';
        
        // 顯示/隱藏管理員菜單項
        if (adminMenuItems.length > 0) {
            // 確保安全訪問 roles 屬性
            const userRoles = currentUserInfo.roles || {};
            const isAdmin = (userRoles.admin === true) || 
                           (typeof userRoles.level !== 'undefined' && userRoles.level >= 9) ||
                           (typeof currentUserInfo.level !== 'undefined' && currentUserInfo.level >= 9);
            
            adminMenuItems.forEach(item => {
                item.style.display = isAdmin ? 'block' : 'none';
            });
        }
    } else {
        // 用戶未登入 - 顯示訪客信息
        console.log("User is not logged in, updating menu accordingly");
        
        if (displayNameElement) displayNameElement.textContent = '訪客';
        if (userRoleElement) userRoleElement.textContent = '未登入';
        if (userProfilePic) {
            userProfilePic.src = '/images/default-avatar.png';
            userProfilePic.style.display = 'block';
        }
        
        // 顯示登入按鈕，隱藏登出按鈕
        if (loginButton) loginButton.style.display = 'block';
        if (logoutButton) logoutButton.style.display = 'none';
        
        // 隱藏管理員菜單項
        if (adminMenuItems.length > 0) {
            adminMenuItems.forEach(item => { item.style.display = 'none'; });
        }
    }
}

// 設置登出處理
function handleLogoutButton() {
    const logoutLink = document.querySelector('[data-action="logout"]');
    if (logoutLink) {
        // 移除舊的監聽器(防止多次添加)
        logoutLink.removeEventListener('click', logoutHandler);
        // 添加新的監聽器
        logoutLink.addEventListener('click', logoutHandler);
    }
}

function logoutHandler(e) {
    e.preventDefault();
    console.log('Logout clicked');
    
    try {
        // 首先嘗試使用auth.js中的logout函數
        if (typeof logout === 'function') {
            // 將當前的fbAuth實例傳給logout函數
            logout(fbAuth);
        } else {
            // 備用登出方法
            console.warn('使用備用登出方法，auth.js中的logout函數未找到');
            
            // 清除會話存儲
            sessionStorage.removeItem('userInfo');
            sessionStorage.removeItem('idToken');
            sessionStorage.removeItem('userRoles');
            sessionStorage.removeItem('permissions');
            
            // 使用Firebase登出
            if (fbAuth) {
                fbAuth.signOut().then(() => {
                    console.log('Firebase登出成功');
                }).catch(error => {
                    console.error('Firebase登出錯誤:', error);
                });
            }
            
            // 重定向到首頁
            window.location.href = '/';
        }
    } catch (error) {
        console.error('登出過程中發生錯誤:', error);
        // 確保即使發生錯誤，也會重定向到首頁
        window.location.href = '/';
    }
}

// 顯示提示消息
function showToast(message, type = 'info', duration = 3000) {
    // 檢查是否已存在Toast容器，如果沒有則創建
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    // 創建新的Toast元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // 添加到容器
    toastContainer.appendChild(toast);
    
    // 淡入效果
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // 設置自動移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 300);
    }, duration);
}

console.log("main.js loaded (adjusted for passing fbAuth).");