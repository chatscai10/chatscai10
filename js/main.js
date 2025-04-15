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
    }
});

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
    
    if (!menuToggle || !slidingMenu || !menuOverlay) {
        console.error("[Menu Debug] 找不到菜單元素", {
            menuToggle: !!menuToggle,
            slidingMenu: !!slidingMenu,
            menuOverlay: !!menuOverlay
        });
        return;
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
    setTimeout(() => {
        populateUserInfoInMenu(window.fbAuth);
    }, 200);
    
    console.log("[Menu Debug] Menu interactions setup complete");
}

// 在菜單中填充用戶信息
function populateUserInfoInMenu(fbAuth) {
    console.log("Attempting to populate user info in menu...");
    
    let currentUserInfo = null;
    
    // 檢查登入狀態
    if (typeof checkLoginStatus === 'function') {
        currentUserInfo = checkLoginStatus(fbAuth);
    } else if (fbAuth && fbAuth.currentUser) {
        // 基本用戶信息
        const user = fbAuth.currentUser;
        currentUserInfo = {
            uid: user.uid,
            displayNameFromAuth: user.displayName,
            email: user.email || 'N/A',
            roles: user.customClaims || {}
        };
    }
    
    console.log("populateUserInfoInMenu - currentUserInfo:", currentUserInfo);
    
    // 獲取菜單元素
    const displayNameElement = document.getElementById('user-display-name');
    const userRoleElement = document.getElementById('user-role');
    const userProfilePic = document.getElementById('user-profile-pic');
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const adminMenuItems = document.querySelectorAll('.admin-only');
    
    // 如果用戶已登入
    if (currentUserInfo && currentUserInfo.uid) {
        console.log("User is logged in, updating menu elements");
        
        // 顯示用戶信息
        if (displayNameElement) {
            const displayName = currentUserInfo.displayNameFromAuth || 
                               currentUserInfo.displayName || 
                               currentUserInfo.name || 
                               '未命名用戶';
            displayNameElement.textContent = displayName;
        }
        
        // 顯示用戶角色
        if (userRoleElement) {
            let roleText = '員工';
            
            // 根據用戶等級設置角色文本
            if (currentUserInfo.roles && currentUserInfo.roles.admin) {
                roleText = '管理員';
            } else if (currentUserInfo.level >= 9) {
                roleText = '管理員';
            } else if (currentUserInfo.level >= 5) {
                roleText = '店長';
            }
            
            userRoleElement.textContent = roleText;
        }
        
        // 設置頭像 (如果有)
        if (userProfilePic && currentUserInfo.photoURL) {
            userProfilePic.src = currentUserInfo.photoURL;
        }
        
        // 顯示登出按鈕，隱藏登入按鈕
        if (logoutButton) {
            logoutButton.style.display = 'block';
            // 設置登出處理
            handleLogoutButton();
        }
        
        if (loginButton) {
            loginButton.style.display = 'none';
        }
        
        // 顯示/隱藏管理員菜單項
        if (adminMenuItems.length > 0) {
            const isAdmin = (currentUserInfo.roles && currentUserInfo.roles.admin) || 
                           (currentUserInfo.level && currentUserInfo.level >= 9);
            
            adminMenuItems.forEach(item => {
                item.style.display = isAdmin ? 'block' : 'none';
            });
        }
    } else {
        console.log("User is not logged in, updating menu accordingly");
        
        // 未登入狀態
        if (displayNameElement) displayNameElement.textContent = '訪客';
        if (userRoleElement) userRoleElement.textContent = '未登入';
        if (userProfilePic) userProfilePic.src = '/images/default-avatar.png';
        
        // 顯示登入按鈕，隱藏登出按鈕
        if (loginButton) loginButton.style.display = 'block';
        if (logoutButton) logoutButton.style.display = 'none';
        
        // 隱藏管理員菜單項
        if (adminMenuItems.length > 0) {
            adminMenuItems.forEach(item => {
                item.style.display = 'none';
            });
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