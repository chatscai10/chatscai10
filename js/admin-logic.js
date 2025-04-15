// js/admin-logic.js - 後台頁面核心導航與載入邏輯 (修正參數傳遞)

'use strict';

// --- 模組內變數 (替代全局 window) ---
let logic_currentUser = null;
let logic_db = null;
let logic_fbAuth = null; // 新增，用於登出

// DOM 元素引用 (保持局部)
let contentArea = null;
let adminNavLinks = null;
let adminSections = null;
let messageElement = null;
let loadedSections = new Set();
let paginationState = {
    orders: {
        lastVisible: null,
        pageSize: 15, // Default page size
        currentPage: 1
    },
    employees: {
        lastVisible: null,
        pageSize: 15,
        currentPage: 1
    },
    leaveRequests: { // Add default for leave requests as well
        lastVisible: null,
        pageSize: 15,
        currentPage: 1
    }
    // Add other sections that need pagination here later
}; // 分頁狀態

// 管理頁面內容映射
const sectionMappings = {
    'home': 'admin-home',
    'users': 'admin-users',
    'menu': 'admin-menu', 
    'orders': 'admin-orders',
    'inventory': 'admin-inventory',
    'settings': 'admin-settings',
    'reports': 'admin-reports',
    'schedule': 'admin-schedule',
    'schedule-stats': 'admin-schedule-stats',
    'salary-stats': 'admin-salary-stats',
    'bonus-tasks': 'admin-bonus-tasks', 
    'announcements': 'admin-announcements',
    'staff': 'admin-staff',
    'products': 'admin-products',
    'staffs': 'admin-staff',
    'suppliers': 'admin-suppliers',
    'finance': 'admin-finance',
    'messages': 'admin-messages'
};

// 已加載的腳本緩存
const loadedScripts = {};

// 當前活動部分
let currentActiveSection = null; 

// --- 初始化函數 (儲存實例到模組變數) ---
function initAdminPage(user, db, fbAuth) {
    console.log("initAdminPage called with:", { 
        user: user ? `User ${user.name || user.displayName || user.uid}` : 'missing', 
        db: db ? 'provided' : 'missing',
        fbAuth: fbAuth ? 'provided' : 'missing'
    });

    // MODIFIED: Added checks for required arguments
    if (!user || !db || !fbAuth) {
        console.error("initAdminPage: Missing required arguments (user, db, or fbAuth).");
        // Attempt to display an error on the page if possible
        const body = document.body;
        if (body) {
            body.innerHTML = '<p style="color: red; padding: 20px;">管理頁面初始化失敗：缺少必要的驗證或資料庫資訊。請重新登入或聯繫管理員。</p>';
        }
        return; // Stop execution if critical components are missing
    }

    // Store instances in module variables
    logic_currentUser = user;
    logic_db = db;
    logic_fbAuth = fbAuth;

    console.log(`Admin page initializing for: ${logic_currentUser?.name || logic_currentUser?.displayName || '... UID:' + logic_currentUser?.uid}`);

    // Get essential DOM elements
    contentArea = document.getElementById('admin-content-area');
    adminNavLinks = document.querySelectorAll('#admin-menu-links-container a');
    adminSections = document.querySelectorAll('.admin-section');
    messageElement = document.getElementById('admin-message');
    loadedSections = new Set();

    // MODIFIED: Added checks for essential DOM elements
    if (!contentArea) {
        console.error("Admin page core element #admin-content-area not found!");
        // Display error prominently if content area is missing
        document.body.innerHTML = '<p style="color: red; padding: 20px;">管理頁面結構錯誤：找不到主要內容區域 (#admin-content-area)。</p>';
        return;
    }
    if (!adminNavLinks || adminNavLinks.length === 0) {
        console.error("Admin navigation links (#admin-menu-links-container a) not found! Navigation will not work.");
    }
    if (!adminSections || adminSections.length === 0) {
        console.error("Admin sections (.admin-section) not found! Section switching will not work.");
        // Allow page to load but section display might fail
    }
    if (!messageElement) {
        console.warn("Global admin message element (#admin-message) not found. Status messages may not be displayed.");
    }

    // --- 嘗試加載所有必要的模塊函數 ---
    try {
        // 檢查基本函數
        if (typeof loadSectionContent !== 'function') {
            console.error("Critical function 'loadSectionContent' is missing!");
            throw new Error("管理介面核心函數缺失");
        }

        // 檢查各個區塊所需的函數
        const requiredModulesFunctions = {
            'dashboard': typeof loadDashboardData === 'function',
            'parameters': typeof initParametersSection === 'function',
            'employees': typeof loadEmployeesData === 'function',
            'salary': typeof loadSalaryViewData === 'function',
            'schedule': typeof initScheduleSection === 'function',
            'bonus': typeof initBonusSection === 'function',
            'leave': typeof initLeaveRequestsSection === 'function',
            'inventory': typeof initInventoryAdmin === 'function',
            'announce': typeof loadAnnouncementsAdminView === 'function',
            'analysis': typeof initAnalysisSection === 'function'
        };

        console.log("Admin modules availability:", requiredModulesFunctions);

        // 如果某些核心模塊缺失，顯示警告但不阻止頁面加載
        const missingModules = Object.entries(requiredModulesFunctions)
            .filter(([_, exists]) => !exists)
            .map(([name]) => name);

        if (missingModules.length > 0) {
            console.warn(`Some admin modules are not available: ${missingModules.join(', ')}`);
            if (messageElement) {
                messageElement.textContent = `警告: 某些管理功能可能無法使用 (${missingModules.join(', ')})`;
                messageElement.className = 'message warning-message';
            }
        }
    } catch (moduleError) {
        console.error("Error checking admin modules:", moduleError);
        if (messageElement) {
            messageElement.textContent = "管理介面部分功能可能無法正常使用";
            messageElement.className = 'message error-message';
        }
    }

    // Bind navigation link clicks
    adminNavLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) {
            console.warn("Navigation link found without href attribute:", link);
            return; // Skip links without href
        }

        // Extract section ID from href (e.g., "/admin.html#section-employees" -> "employees")
        let sectionId = null;
        if (href.startsWith('/admin.html#section-')) {
            sectionId = href.substring(href.indexOf('#section-') + '#section-'.length);
        }

        // Only add listener if it's an internal section link
        if (sectionId) {
            const handleNavLinkClick = (event) => {
                event.preventDefault(); // Prevent default anchor link behavior
                console.log(`Admin menu link clicked for section: ${sectionId}`);

                // Close the menu when a link is clicked (optional but good UX)
                document.body.classList.remove('menu-open');

                if (logic_db && logic_currentUser) {
                    showSection(sectionId);
                    updateNavActiveState(sectionId); // Pass the extracted sectionId
                } else {
                    console.error("Cannot handle nav click: logic_db or logic_currentUser not available.");
                    if (messageElement) messageElement.textContent = "系統錯誤，無法切換區塊！請刷新頁面。";
                    else alert("系統錯誤，無法切換區塊！");
                }
            };

            // Remove potential old listener by cloning or explicitly removing
            // Note: Using a named function allows for easier removal if needed later
            link.removeEventListener('click', handleNavLinkClick); // Attempt removal first
            link.addEventListener('click', handleNavLinkClick);
        } else {
            console.log(`Skipping section navigation listener for external link: ${href}`);
            // For external links, let the default browser navigation happen
            // Or add specific logic if needed (e.g., confirmation)
        }
    });

    // Bind Logout Button (Find it within the new menu if it exists)
    // MODIFIED: Look for logout button within the admin menu panel
    const adminMenuPanel = document.getElementById('admin-floating-menu-panel');
    const logoutButton = adminMenuPanel ? adminMenuPanel.querySelector('#admin-menu-logout-btn') : null; // Example ID, adjust if needed

    if (logoutButton) {
        if (typeof handleLogout === 'function') {
            // Ensure only one listener is attached
            logoutButton.onclick = null; // Clear previous onclick if any
            logoutButton.addEventListener('click', () => {
                if (logic_fbAuth) {
                    handleLogout(logic_fbAuth);
                } else {
                    console.error("Cannot logout: Firebase Auth instance (logic_fbAuth) not available.");
                    if(messageElement) messageElement.textContent = "登出失敗：驗證服務未就緒。";
                    else alert("登出失敗：驗證服務未就緒。");
                }
            });
        } else {
            console.warn("handleLogout function (from auth.js?) is not defined. Logout button will not work.");
            logoutButton.disabled = true; // Disable button if handler is missing
            logoutButton.title = "登出功能載入失敗";
        }
        console.log("Admin logout button found and listener attached.");
    } else {
        console.warn("Admin logout button (#admin-menu-logout-btn) not found inside #admin-floating-menu-panel.");
    }

    // Initial Section Display - Determine from URL hash or default
    let initialSection = 'employees';
    if (window.location.hash && window.location.hash.startsWith('#section-')) {
        const hashSectionId = window.location.hash.substring('#section-'.length);
        // Check if a section with this ID actually exists
        if (document.getElementById(`section-${hashSectionId}`)) {
            initialSection = hashSectionId;
        }
    }

    console.log(`Showing initial admin section: ${initialSection}`);
    showSection(initialSection);
    updateNavActiveState(initialSection);

    console.log("Admin page initialization complete.");
}

// --- 顯示區塊 (接收 db, user) ---
function showSection(sectionId) {
    console.log(`Showing section: ${sectionId}`);
    
    // 隱藏所有區塊
    if (adminSections && adminSections.length > 0) {
        adminSections.forEach(section => {
            section.style.display = 'none';
        });
    }
    
    // 映射 section ID 到正確的 HTML 元素 ID
    const sectionMappings = {
        'employees': 'user-management',    // 員工管理
        'parameters': 'parameters',        // 參數設定
        'dashboard': 'dashboard',          // 儀表板
        'schedule': 'schedule',            // 排班管理
        'schedule-stats': 'schedule-stats', // 排班統計
        'salary': 'salary-stats',          // 薪資統計
        'salary-stats': 'salary-stats',    // 薪資統計 (別名)
        'bonus': 'bonus-tasks',            // 獎金任務
        'bonus-tasks': 'bonus-tasks',      // 獎金任務 (別名)
        'bonus-groups': 'bonus-groups',    // 獎金小組
        'leave': 'leave-requests',         // 請假管理
        'leave-requests': 'leave-requests', // 請假管理 (別名)
        'inventory': 'inventory',          // 庫存盤點
        'announce': 'announcements',       // 公告管理
        'announcements': 'announcements',  // 公告管理 (別名)
        'sales': 'sales-stats',            // 銷售統計
        'sales-stats': 'sales-stats',      // 銷售統計 (別名)
        'analysis': 'analysis',            // 數據分析
        'version-management': 'version-management' // 版本管理
    };
    
    // 獲取映射的 ID 或使用原始 ID
    const mappedId = sectionMappings[sectionId] || sectionId;
    
    // 嘗試不同的 section ID 命名模式
    const possibleIds = [
        `section-${mappedId}`,          // section-user-management
        `${mappedId}-section`,          // user-management-section
        mappedId                         // user-management
    ];
    
    console.log(`Looking for section with IDs: ${possibleIds.join(', ')}`);
    
    // 嘗試找到匹配的 section 元素
    let targetSection = null;
    for (const id of possibleIds) {
        const section = document.getElementById(id);
        if (section) {
            targetSection = section;
            console.log(`Found section with ID: ${id}`);
            break;
        }
    }
    
    if (targetSection) {
        targetSection.style.display = 'block';
        
        // 更新URL
        window.history.pushState(null, '', `/admin.html#section-${sectionId}`);
        
        // 如果區塊尚未載入過資料，載入資料
        if (!loadedSections.has(sectionId)) {
            console.log(`Loading content for section: ${sectionId} (section ID not in loadedSections)`);
            loadSectionContent(sectionId, targetSection, logic_db, logic_currentUser);
            loadedSections.add(sectionId);
        }
    } else {
        console.error(`No section element found for: ${sectionId} / ${mappedId}`);
        
        // 創建一個錯誤提示區塊
        const contentArea = document.getElementById('admin-content-area');
        if (contentArea) {
            console.log(`Creating error message in admin-content-area for section: ${sectionId}`);
            // 隱藏所有可能的內容區塊
            Array.from(contentArea.children).forEach(child => {
                if (child.classList.contains('admin-section')) {
                    child.style.display = 'none';
                }
            });
            
            // 檢查是否已存在錯誤消息區塊
            let errorSection = document.getElementById('error-section');
            if (!errorSection) {
                errorSection = document.createElement('div');
                errorSection.id = 'error-section';
                errorSection.className = 'admin-section';
                errorSection.innerHTML = `
                    <div class="section-header">
                        <h2>無法載入請求的區塊</h2>
                    </div>
                    <div class="section-content error-content">
                        <p>無法找到或載入請求的管理區塊: <strong>${sectionId}</strong></p>
                        <p>此功能可能尚未實現或模組未正確載入。</p>
                        <p>請嘗試刷新頁面，或聯繫技術支持以獲取幫助。</p>
                        <button class="btn btn-primary" onclick="location.reload()">刷新頁面</button>
                    </div>
                `;
                contentArea.appendChild(errorSection);
            } else {
                // 更新錯誤消息
                const sectionNameElement = errorSection.querySelector('strong');
                if (sectionNameElement) {
                    sectionNameElement.textContent = sectionId;
                }
                errorSection.style.display = 'block';
            }
        } else {
            console.error('No admin-content-area found to show error message');
        }
    }
}

// --- 內容載入路由 (接收 db, user) ---
function loadSectionContent(sectionId, sectionContainer, db, user) {
    if (!sectionContainer || !db || !user) {
        console.error(`loadSectionContent: Missing essential args for section ${sectionId}.`);
        return;
    }
    
    console.log(`Loading content for section: ${sectionId} (loadSectionContent)`);
    
    // 確保 section-content 存在
    let contentArea = sectionContainer.querySelector('.section-content');
    if (!contentArea) {
        console.warn(`No .section-content found in ${sectionId}, creating one`);
        contentArea = document.createElement('div');
        contentArea.className = 'section-content';
        sectionContainer.appendChild(contentArea);
    }
    
    // 嘗試找出可用的載入函數和腳本
    const sectionScripts = {
        'employees': 'admin-employees.js',
        'user-management': 'admin-employees.js',
        'parameters': 'admin-parameters.js',
        'dashboard': 'admin-dashboard.js',
        'schedule': 'admin-schedule.js',
        'schedule-stats': 'admin-schedule-stats.js',
        'salary': 'admin-salary.js',
        'salary-stats': 'admin-salary.js',
        'bonus': 'admin-bonus-tasks.js',
        'bonus-tasks': 'admin-bonus-tasks.js',
        'bonus-groups': 'admin-bonus-groups.js',
        'leave': 'admin-leave.js',
        'leave-requests': 'admin-leave.js',
        'inventory': 'admin-inventory.js',
        'announce': 'admin-announcements.js',
        'announcements': 'admin-announcements.js',
        'sales': 'admin-sales.js',
        'sales-stats': 'admin-sales.js',
        'analysis': 'admin-analysis.js'
    };
    
    // 為指定 section 顯示載入中訊息
    contentArea.innerHTML = `
        <div class="loading-container">
            <p>載入中...</p>
            <div class="spinner"></div>
        </div>
    `;
    
    // 檢查模組腳本是否已載入
    const scriptSrc = sectionScripts[sectionId];
    if (!scriptSrc) {
        console.warn(`No script mapping found for section: ${sectionId}`);
    }
    
    // --- 根據區塊 ID 動態選擇載入函數 ---
    let functionToCall = null;
    let functionName = null;
    
    switch (sectionId) {
        case 'employees':
        case 'user-management':
            functionName = 'loadEmployeesSection';
            functionToCall = typeof loadEmployeesSection === 'function' ? loadEmployeesSection : null;
            break;
            
        case 'parameters':
            functionName = 'loadParametersSection';
            functionToCall = typeof loadParametersSection === 'function' ? loadParametersSection : null;
            break;
            
        case 'dashboard':
            functionName = 'loadDashboardSection';
            functionToCall = typeof loadDashboardSection === 'function' ? loadDashboardSection : null;
            break;
            
        case 'schedule':
            functionName = 'loadScheduleSection';
            functionToCall = typeof loadScheduleSection === 'function' ? loadScheduleSection : null;
            break;
            
        case 'schedule-stats':
            functionName = 'loadScheduleStatsSection';
            functionToCall = typeof loadScheduleStatsSection === 'function' ? loadScheduleStatsSection : null;
            break;
            
        case 'salary':
        case 'salary-stats':
            functionName = 'loadSalarySection';
            functionToCall = typeof loadSalarySection === 'function' ? loadSalarySection : null;
            break;
            
        case 'sales':
        case 'sales-stats':
            functionName = 'loadSalesSection';
            functionToCall = typeof loadSalesSection === 'function' ? loadSalesSection : null;
            break;
            
        case 'bonus':
        case 'bonus-tasks':
            functionName = 'initBonusTasks';
            functionToCall = typeof initBonusTasks === 'function' ? initBonusTasks : null;
            break;
            
        case 'bonus-groups':
            functionName = 'initBonusGroups';
            functionToCall = typeof initBonusGroups === 'function' ? initBonusGroups : null;
            break;
            
        case 'leave':
        case 'leave-requests':
            functionName = 'loadLeaveRequestsSection';
            functionToCall = typeof loadLeaveRequestsSection === 'function' ? loadLeaveRequestsSection : null;
            break;
            
        case 'inventory':
            functionName = 'loadInventorySection';
            functionToCall = typeof loadInventorySection === 'function' ? loadInventorySection : null;
            break;
            
        case 'announce':
        case 'announcements':
            functionName = 'loadAnnouncementsSection';
            functionToCall = typeof loadAnnouncementsSection === 'function' ? loadAnnouncementsSection : null;
            break;
            
        case 'analysis':
            functionName = 'loadAnalysisSection';
            functionToCall = typeof loadAnalysisSection === 'function' ? loadAnalysisSection : null;
            break;
            
        default:
            console.warn(`No known loader function for section: ${sectionId}`);
            contentArea.innerHTML = `
                <div class="message warning-message">
                    <p>此功能區塊 (${sectionId}) 尚未實現或無法識別。</p>
                    <p>請確保已載入所有必要的 JavaScript 模組。</p>
                </div>`;
            return;
    }
    
    // 執行載入函數或顯示錯誤
    if (functionToCall) {
        try {
            console.log(`Calling ${functionName}() for section: ${sectionId}`);
            
            // 檢查所需參數數量並調用函數
            const paramCount = functionToCall.length;
            if (paramCount >= 3) {
                functionToCall(sectionContainer, db, user);
            } else if (paramCount === 2) {
                functionToCall(sectionContainer, db);
            } else if (paramCount === 1) {
                functionToCall(sectionContainer);
            } else {
                functionToCall();
            }
            
            console.log(`Successfully loaded content for section: ${sectionId}`);
            
        } catch (error) {
            console.error(`Error executing ${functionName}() for section ${sectionId}:`, error);
            contentArea.innerHTML = `
                <div class="error-message">
                    <p>載入 ${sectionId} 區塊時發生錯誤。</p>
                    <p><small>錯誤詳情：${error.message}</small></p>
                    <button class="btn btn-primary reload-section">重試載入</button>
                </div>`;
                
            // 添加重試按鈕事件
            const reloadButton = contentArea.querySelector('.reload-section');
            if (reloadButton) {
                reloadButton.addEventListener('click', () => {
                    loadSectionContent(sectionId, sectionContainer, db, user);
                });
            }
        }
    } else if (scriptSrc) {
        // 動態載入所需腳本
        console.log(`Attempting to dynamically load script: ${scriptSrc} for section: ${sectionId}`);
        
        contentArea.innerHTML = `
            <div class="message">
                <p>正在載入 ${sectionId} 模組...</p>
                <div class="spinner"></div>
            </div>`;
            
        // 建立腳本元素
        const script = document.createElement('script');
        script.src = `/js/${scriptSrc}?v=${new Date().getTime()}`; // 加入時間戳避免快取
        script.onload = () => {
            console.log(`Script ${scriptSrc} loaded successfully, retrying section load...`);
            // 腳本載入後重新嘗試載入區塊
            setTimeout(() => {
                loadSectionContent(sectionId, sectionContainer, db, user);
            }, 100);
        };
        script.onerror = (err) => {
            console.error(`Failed to load script: ${scriptSrc}`, err);
            contentArea.innerHTML = `
                <div class="error-message">
                    <p>無法載入 ${sectionId} 功能模組。</p>
                    <p><small>無法載入必要的腳本檔案: ${scriptSrc}</small></p>
                    <button class="btn btn-primary reload-module">重試載入</button>
                </div>`;
                
            // 添加重試按鈕事件
            const reloadButton = contentArea.querySelector('.reload-module');
            if (reloadButton) {
                reloadButton.addEventListener('click', () => {
                    document.head.removeChild(script); // 移除舊腳本
                    loadSectionContent(sectionId, sectionContainer, db, user);
                });
            }
        };
        document.head.appendChild(script);
    } else {
        // 無法找到相應的載入函數或腳本
        console.error(`No loader function (${functionName}) or script available for section: ${sectionId}`);
        contentArea.innerHTML = `
            <div class="error-message">
                <p>無法載入 ${sectionId} 區塊。</p>
                <p><small>找不到載入函數: ${functionName}</small></p>
                <p>請確認所有必要的管理模組已正確載入，或聯絡系統管理員。</p>
            </div>`;
    }
}

/**
 * 更新側邊欄導航的 active 狀態
 * @param {string} activeSectionId
 */
function updateNavActiveState(activeSectionId) {
    // 首先嘗試使用新的管理員菜單容器ID
    let currentAdminNavLinks = document.querySelectorAll('#admin-menu-links-container a');
    
    // 如果找不到元素，嘗試備用選擇器（可能是舊代碼或測試環境）
    if (!currentAdminNavLinks || currentAdminNavLinks.length === 0) {
        currentAdminNavLinks = document.querySelectorAll('#menu-links-container a, .admin-menu a, #floating-menu-panel a');
        console.log("使用備用選擇器查找菜單鏈接");
    }
    
    if (!currentAdminNavLinks || currentAdminNavLinks.length === 0) {
        // 最後嘗試查找所有可能的菜單鏈接
        currentAdminNavLinks = document.querySelectorAll('nav a[href*="#section-"]');
        console.log("使用通用選擇器查找菜單鏈接");
    }
    
    if (!currentAdminNavLinks || currentAdminNavLinks.length === 0) {
        // 使用console.warn或console.error基於嚴重性
        console.warn("updateNavActiveState: 找不到導航鏈接，無法更新導航狀態。");
        return;
    }

    console.log(`找到 ${currentAdminNavLinks.length} 個導航鏈接`);

    currentAdminNavLinks.forEach(link => {
        const href = link.getAttribute('href');
        let linkSectionId = null;

        if (href && href.includes('#section-')) {
            linkSectionId = href.substring(href.indexOf('#section-') + '#section-'.length);
        }

        // 比較提取的sectionId與活動的ID
        if (linkSectionId && linkSectionId === activeSectionId) {
            link.classList.add('active'); // 添加 'active' 類
            console.log(`設置鏈接為活動狀態: ${linkSectionId}`);
        } else {
            link.classList.remove('active'); // 移除 'active' 類
        }
    });
}

// --- 輔助函數 (如果其他模組需要，可考慮移至 main.js 或各模組自行實現) ---
/**
 * 格式化 Firestore Timestamp 為可讀字串
 * @param {firebase.firestore.Timestamp} timestampObject
 * @returns {string}
 */
function formatTimestamp(timestampObject) {
    // MODIFIED: Improved handling of different input types
    let date;
    if (!timestampObject) {
        return ''; // Return empty for null or undefined
    }
    if (timestampObject instanceof Date) {
        date = timestampObject;
    } else if (typeof timestampObject.toDate === 'function') {
        try {
            date = timestampObject.toDate();
        } catch (e) {
            console.error("Error converting Firestore Timestamp to Date:", e, timestampObject);
            return '時間轉換錯誤';
        }
    } else {
        console.warn("Invalid object passed to formatTimestamp:", timestampObject);
        return '無效時間物件';
    }

    // Check if date is valid after potential conversion
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        console.warn("formatTimestamp resulted in an invalid Date object:", date);
        return '無效日期';
    }

    try {
        const options = {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', // Optionally add seconds
            timeZone: 'Asia/Taipei',
            hour12: false // Use 24-hour format
        };
        return new Intl.DateTimeFormat('sv-SE', options).format(date); // sv-SE gives YYYY-MM-DD HH:MM:SS like format
        // Or use zh-TW and replace parts if needed:
        // return new Intl.DateTimeFormat('zh-TW', options).format(date).replace(/上午|下午/g, '').trim();
    } catch (e) {
        console.error("Error formatting date with Intl.DateTimeFormat:", e, date);
        return "日期格式化錯誤";
    }
}

// --- Modal Helpers (Consider moving to a dedicated modal utility file or main.js) ---

/**
 * 為指定的 Modal 設置關閉事件 (關閉按鈕 + 點擊外部關閉)
 * Ensures events are not attached multiple times.
 * @param {string} modalId - Modal 元素的 ID
 */
function setupModalCloseEvents(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.warn(`Modal with id "${modalId}" not found for setting up close events.`);
        return;
    }

    // Close Button Binding (using onclick for simplicity, assumes one button)
    const closeButton = modal.querySelector('.close-btn, .modal-close');
    if (closeButton) {
        if (typeof closeModal === 'function') {
            // Assign onclick directly, overwriting previous if any
            closeButton.onclick = () => closeModal(modalId);
            console.log(`Close button event attached for modal: ${modalId}`);
        } else {
            console.warn(`closeModal function not found. Close button for ${modalId} might not work.`);
        }
    } else {
        console.warn(`Close button (.close-btn or .modal-close) not found inside modal: ${modalId}`);
    }

    // Click Outside Binding (prevent multiple listeners)
    if (!modal.dataset.clickOutsideListenerAttached) {
        const clickOutsideHandler = (event) => {
            if (event.target === modal) {
                console.log(`Clicked outside content of modal ${modalId}, closing.`);
                if (typeof closeModal === 'function') {
                    closeModal(modalId);
                } else {
                    console.warn("closeModal function not found when clicking outside.");
                    modal.style.display = 'none'; // Fallback hide
                }
            }
        };
        modal.addEventListener('click', clickOutsideHandler);
        modal.dataset.clickOutsideListenerAttached = 'true'; // Mark as attached
        console.log(`Click outside event listener attached for modal: ${modalId}`);
    } else {
        console.log(`Click outside listener already attached for modal: ${modalId}`);
    }
}

/**
 * 打開 Modal 的輔助函數
 * @param {string} modalId - Modal 元素的 ID
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex'; // Use flex for potential centering via CSS
        console.log(`Modal ${modalId} opened.`);
        // Setup close events each time it opens to ensure they are present
        // MODIFIED: Check function existence before calling
        if (typeof setupModalCloseEvents === 'function') {
            setupModalCloseEvents(modalId);
        } else {
            console.warn("setupModalCloseEvents function not found. Modal close behavior might be incomplete.");
        }
    } else {
        console.error(`Modal with id "${modalId}" not found. Cannot open.`);
        alert(`錯誤：找不到 ID 為 ${modalId} 的對話框元件。`);
    }
}

/**
 * 關閉 Modal 的輔助函數
 * @param {string} modalId - Modal 元素的 ID
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        console.log(`Modal ${modalId} closed.`);
        // Optionally clear any message inside the modal when closed
        const messageElementInModal = modal.querySelector('.modal-message, #employee-modal-message, #sales-config-modal-message'); // Common message selectors
        if (messageElementInModal) {
            messageElementInModal.textContent = '';
            messageElementInModal.className = 'message'; // Reset class
        }
    } else {
        console.warn(`Modal with id "${modalId}" not found for closing.`);
    }
}

// --- 啟動 ---
console.log("admin-logic.js loaded");