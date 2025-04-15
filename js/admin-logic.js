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
    // MODIFIED: Added checks for sectionId and adminSections
    if (!sectionId) {
        console.error("showSection called with no sectionId.");
        return;
    }
    if (!adminSections || adminSections.length === 0) {
        console.error("showSection: adminSections NodeList is empty or not initialized. Cannot switch sections.");
        return;
    }

    let sectionFound = false;
    const saveButtonContainer = document.querySelector('.floating-save-button-container'); // Get save button container

    adminSections.forEach(section => {
        if (section.id === `section-${sectionId}`) {
            section.style.display = 'block';
            sectionFound = true;
            console.log(`Displaying section: ${section.id}`);

            // --- ADDED: Show/Hide Floating Save Button ---
            if (saveButtonContainer) {
                if (sectionId === 'parameters') {
                    saveButtonContainer.style.display = 'block';
                    console.log('Showing floating save button for parameters section.');
                } else {
                    saveButtonContainer.style.display = 'none';
                }
            } else {
                console.warn('Floating save button container not found.');
            }
            // --- END ADDED ---

            // Find the content container within the section
            const contentContainer = section.querySelector('.section-content');

            // Load content for the target section
            if (logic_db && logic_currentUser) {
                loadSectionContent(sectionId, section, logic_db, logic_currentUser);
                // Make the content container visible AFTER starting to load
                if (contentContainer) {
                    contentContainer.style.display = 'block';
                }
            } else {
                console.error(`Cannot load content for section ${sectionId}: db or user instance is missing.`);
                section.innerHTML = `<p style="color: red;">載入區塊內容失敗：缺少資料庫或用戶信息。</p>`;
                // Ensure content container is visible to show the error
                if (contentContainer) {
                    contentContainer.style.display = 'block';
                }
            }
        } else {
            section.style.display = 'none';
            // Also hide the content container of inactive sections
            const inactiveContent = section.querySelector('.section-content');
            if (inactiveContent) {
                inactiveContent.style.display = 'none';
            }
        }
    });

    if (!sectionFound) {
        console.error(`Target section element not found in DOM: section-${sectionId}`);
        if (messageElement) {
            messageElement.textContent = `錯誤：找不到 ID 為 'section-${sectionId}' 的區塊。`;
            messageElement.className = 'message error-message';
        } else {
            alert(`錯誤：找不到區塊 ${sectionId}。`);
        }
    }
}

// --- 內容載入路由 (接收 db, user) ---
function loadSectionContent(sectionId, sectionContainer, db, user) {
    if (!sectionContainer || !db || !user) {
        console.error(`loadSectionContent: Missing essential args for section ${sectionId}.`);
        return;
    }

    if (loadedSections.has(sectionId)) {
        console.log(`Section ${sectionId} content already loaded. Skipping load.`);
        return;
    }

    console.log(`Loading content for section: ${sectionId} (loadSectionContent)`);

    // --- MODIFIED: Better dynamic loading logic with more error handling ---
    switch (sectionId) {
        case 'employees':
            if (typeof loadEmployeesSection === 'function') {
                loadEmployeesSection(sectionContainer, db, user);
            } else {
                console.error("loadEmployeesSection function not found. Ensure admin-employees.js is loaded.");
                sectionContainer.querySelector('.section-content').innerHTML = `
                    <div class="error-message">
                        <p>無法載入員工管理功能。請重新整理頁面或聯繫系統管理員。</p>
                        <p><small>技術詳情：loadEmployeesSection function not found.</small></p>
                    </div>`;
            }
            break;
            
        case 'parameters':
            if (typeof loadParametersSection === 'function') {
                loadParametersSection(sectionContainer, db, user);
            } else {
                console.error("loadParametersSection function not found. Ensure admin-parameters.js is loaded.");
                sectionContainer.querySelector('.section-content').innerHTML = `
                    <div class="error-message">
                        <p>無法載入系統參數設定功能。請重新整理頁面或聯繫系統管理員。</p>
                        <p><small>技術詳情：loadParametersSection function not found.</small></p>
                    </div>`;
            }
            break;
            
        case 'schedule':
            if (typeof loadScheduleSection === 'function') {
                loadScheduleSection(sectionContainer, db, user);
            } else {
                console.error("loadScheduleSection function not found. Ensure admin-schedule.js is loaded.");
                sectionContainer.querySelector('.section-content').innerHTML = `
                    <div class="error-message">
                        <p>無法載入排班管理功能。請重新整理頁面或聯繫系統管理員。</p>
                        <p><small>技術詳情：loadScheduleSection function not found.</small></p>
                    </div>`;
            }
            break;
            
        case 'sales':
            if (typeof loadSalesSection === 'function') {
                loadSalesSection(sectionContainer, db, user);
            } else {
                console.error("loadSalesSection function not found. Ensure admin-sales.js is loaded.");
                sectionContainer.querySelector('.section-content').innerHTML = `
                    <div class="error-message">
                        <p>無法載入業績查詢功能。請重新整理頁面或聯繫系統管理員。</p>
                        <p><small>技術詳情：loadSalesSection function not found.</small></p>
                    </div>`;
            }
            break;
            
        case 'leave-requests':
            if (typeof loadLeaveRequestsSection === 'function') {
                loadLeaveRequestsSection(sectionContainer, db, user);
            } else {
                console.error("loadLeaveRequestsSection function not found. Ensure admin-leave.js is loaded.");
                sectionContainer.querySelector('.section-content').innerHTML = `
                    <div class="error-message">
                        <p>無法載入請假審批功能。請重新整理頁面或聯繫系統管理員。</p>
                        <p><small>技術詳情：loadLeaveRequestsSection function not found.</small></p>
                    </div>`;
            }
            break;
            
        case 'announcements':
            if (typeof loadAnnouncementsSection === 'function') {
                loadAnnouncementsSection(sectionContainer, db, user);
            } else {
                console.error("loadAnnouncementsSection function not found. Ensure admin-announcements.js is loaded.");
                sectionContainer.querySelector('.section-content').innerHTML = `
                    <div class="error-message">
                        <p>無法載入公告管理功能。請重新整理頁面或聯繫系統管理員。</p>
                        <p><small>技術詳情：loadAnnouncementsSection function not found.</small></p>
                    </div>`;
            }
            break;
            
        case 'orders':
            if (typeof loadOrdersSection === 'function') {
                loadOrdersSection(sectionContainer, db, user);
            } else {
                console.error("loadOrdersSection function not found. Ensure admin-orders.js is loaded.");
                sectionContainer.querySelector('.section-content').innerHTML = `
                    <div class="error-message">
                        <p>無法載入訂單管理功能。請重新整理頁面或聯繫系統管理員。</p>
                        <p><small>技術詳情：loadOrdersSection function not found.</small></p>
                    </div>`;
            }
            break;
            
        // 推播通知功能區塊
        case 'push-notifications':
            if (typeof loadPushNotificationsSection === 'function') {
                try {
                    loadPushNotificationsSection(sectionContainer, db, user);
                    console.log("推播通知模組已載入");
                } catch (error) {
                    console.error("推播通知模組載入失敗:", error);
                    sectionContainer.querySelector('.section-content').innerHTML = `
                        <div class="error-message">
                            <p>載入推播通知功能時發生錯誤。請重新整理頁面或聯繫系統管理員。</p>
                            <p><small>錯誤詳情：${error.message}</small></p>
                        </div>`;
                }
            } else {
                console.error("loadPushNotificationsSection function not found. Ensure admin-push.js is loaded.");
                window.loadPushNotificationsSection = function(container, db, user) {
                    console.warn("使用備用的推播通知載入函數");
                    if (!container) return;
                    
                    const contentArea = container.querySelector('.section-content');
                    if (contentArea) {
                        contentArea.innerHTML = `
                            <div class="module-container">
                                <h4>推播通知管理</h4>
                                <p>正在嘗試載入推播通知模組...</p>
                                <button id="retry-load-push" class="btn btn-primary">重試載入</button>
                            </div>`;
                            
                        const retryButton = contentArea.querySelector('#retry-load-push');
                        if (retryButton) {
                            retryButton.addEventListener('click', () => {
                                // 動態載入推播通知模組
                                const script = document.createElement('script');
                                script.src = '/js/admin-push.js?v=' + (new Date().getTime());
                                script.onload = () => {
                                    if (typeof loadPushNotificationsSection === 'function') {
                                        loadPushNotificationsSection(container, db, user);
                                    } else {
                                        contentArea.innerHTML = '<p class="error-message">推播通知模組載入失敗</p>';
                                    }
                                };
                                script.onerror = () => {
                                    contentArea.innerHTML = '<p class="error-message">推播通知模組載入失敗</p>';
                                };
                                document.head.appendChild(script);
                            });
                        }
                    }
                };
                loadPushNotificationsSection(sectionContainer, db, user);
            }
            break;
            
        // 獎金小組管理區塊
        case 'bonus-groups':
            if (typeof initBonusGroups === 'function') {
                try {
                    initBonusGroups(sectionContainer, db, user);
                    console.log("獎金小組管理模組已載入");
                    loadedSections.add(sectionId);
                } catch (error) {
                    console.error("獎金小組管理模組載入失敗:", error);
                    sectionContainer.querySelector('.section-content').innerHTML = `
                        <div class="error-message">
                            <p>載入獎金小組管理功能時發生錯誤。請重新整理頁面或聯繫系統管理員。</p>
                            <p><small>錯誤詳情：${error.message}</small></p>
                        </div>`;
                }
            } else {
                console.error("initBonusGroups function not found. Ensure admin-bonus-groups.js is loaded.");
                // 動態加載獎金小組管理模組
                const script = document.createElement('script');
                script.src = 'js/admin-bonus-groups.js?v=' + (new Date().getTime());
                script.onload = function() {
                    if (typeof initBonusGroups === 'function') {
                        initBonusGroups(sectionContainer, db, user);
                        loadedSections.add(sectionId);
                    } else {
                        sectionContainer.querySelector('.section-content').innerHTML = `
                            <div class="error-message">
                                <p>獎金小組管理模組載入失敗。請重新整理頁面或聯繫系統管理員。</p>
                            </div>`;
                    }
                };
                script.onerror = function() {
                    sectionContainer.querySelector('.section-content').innerHTML = `
                        <div class="error-message">
                            <p>獎金小組管理模組載入失敗。請重新整理頁面或聯繫系統管理員。</p>
                        </div>`;
                };
                document.head.appendChild(script);
            }
            break;
            
        // 獎金任務管理區塊
        case 'bonus-tasks':
            if (typeof initBonusTasks === 'function') {
                try {
                    initBonusTasks(db);
                    console.log("獎金任務管理模組已載入");
                    loadedSections.add(sectionId);
                } catch (error) {
                    console.error("獎金任務管理模組載入失敗:", error);
                    sectionContainer.querySelector('.section-content').innerHTML = `
                        <div class="error-message">
                            <p>載入獎金任務管理功能時發生錯誤。請重新整理頁面或聯繫系統管理員。</p>
                            <p><small>錯誤詳情：${error.message}</small></p>
                        </div>`;
                }
            } else {
                console.error("initBonusTasks function not found. Ensure admin-bonus-tasks.js is loaded.");
                // 動態加載獎金任務管理模組
                const script = document.createElement('script');
                script.src = 'js/admin-bonus-tasks.js?v=' + (new Date().getTime());
                script.onload = function() {
                    if (typeof initBonusTasks === 'function') {
                        initBonusTasks(db);
                        loadedSections.add(sectionId);
                    } else {
                        sectionContainer.querySelector('.section-content').innerHTML = `
                            <div class="error-message">
                                <p>獎金任務管理模組載入失敗。請重新整理頁面或聯繫系統管理員。</p>
                            </div>`;
                    }
                };
                script.onerror = function() {
                    sectionContainer.querySelector('.section-content').innerHTML = `
                        <div class="error-message">
                            <p>獎金任務管理模組載入失敗。請重新整理頁面或聯繫系統管理員。</p>
                        </div>`;
                };
                document.head.appendChild(script);
            }
            break;
            
        // 數據分析功能區塊
        case 'analysis':
            if (typeof loadAnalysisSection === 'function') {
                try {
                    loadAnalysisSection(sectionContainer, db, user);
                    console.log("數據分析模組已載入");
                } catch (error) {
                    console.error("數據分析模組載入失敗:", error);
                    sectionContainer.querySelector('.section-content').innerHTML = `
                        <div class="error-message">
                            <p>載入數據分析功能時發生錯誤。請重新整理頁面或聯繫系統管理員。</p>
                            <p><small>錯誤詳情：${error.message}</small></p>
                        </div>`;
                }
            } else {
                console.error("loadAnalysisSection function not found. Ensure admin-analysis.js is loaded.");
                
                // 創建一個臨時的全局pageAdminData對象
                if (typeof window.pageAdminData === 'undefined') {
                    window.pageAdminData = {
                        fbAuth: logic_fbAuth,
                        db: db,
                        functions: null, // 将在函数内部尝试初始化
                        user: user
                    };
                    
                    // 尝试初始化Firebase Functions
                    try {
                        if (firebase && firebase.functions) {
                            window.pageAdminData.functions = firebase.functions();
                            console.log("已初始化Firebase Functions");
                        }
                    } catch (e) {
                        console.error("初始化Firebase Functions失败:", e);
                    }
                }
                
                window.loadAnalysisSection = function(container, db, user) {
                    console.warn("使用備用的數據分析載入函數");
                    if (!container) return;
                    
                    const contentArea = container.querySelector('.section-content');
                    if (contentArea) {
                        contentArea.innerHTML = `
                            <div class="module-container">
                                <h4>數據分析與報表</h4>
                                <p>正在嘗試載入數據分析模組...</p>
                                <button id="retry-load-analysis" class="btn btn-primary">重試載入</button>
                            </div>`;
                            
                        const retryButton = contentArea.querySelector('#retry-load-analysis');
                        if (retryButton) {
                            retryButton.addEventListener('click', () => {
                                // 動態載入數據分析模組
                                const script = document.createElement('script');
                                script.src = '/js/admin-analysis.js?v=' + (new Date().getTime());
                                script.onload = () => {
                                    if (typeof loadAnalysisSection === 'function') {
                                        loadAnalysisSection(container, db, user);
                                    } else {
                                        contentArea.innerHTML = '<p class="error-message">數據分析模組載入失敗</p>';
                                    }
                                };
                                script.onerror = () => {
                                    contentArea.innerHTML = '<p class="error-message">數據分析模組載入失敗</p>';
                                };
                                document.head.appendChild(script);
                            });
                        }
                    }
                };
                loadAnalysisSection(sectionContainer, db, user);
            }
            break;
            
        // 系統日誌功能區塊
        case 'data-logs':
            if (typeof loadDataLogsSection === 'function') {
                loadDataLogsSection(sectionContainer, db, user);
            } else {
                console.error("loadDataLogsSection function not found. Ensure admin-logs.js is loaded.");
                sectionContainer.querySelector('.section-content').innerHTML = `
                    <div class="error-message">
                        <p>無法載入系統日誌功能。請重新整理頁面或聯繫系統管理員。</p>
                        <p><small>技術詳情：loadDataLogsSection function not found.</small></p>
                    </div>`;
            }
            break;
            
        default:
            console.warn(`Unknown section ID: ${sectionId}. No specific loader available.`);
            sectionContainer.querySelector('.section-content').innerHTML = `
                <div class="warning-message">
                    <p>此功能區塊 (${sectionId}) 尚未實現或無法識別。</p>
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