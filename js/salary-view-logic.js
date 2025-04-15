/**
 * 薪資與獎金檢視頁面邏輯 (員工視角)
 * 負責顯示個人當月出勤概況、可選獎金、獎金歷史和薪資總覽。
 */

'use strict';

// --- Global Variables (Scoped) ---
let salaryViewDb = null;
let salaryViewCurrentUser = null; // Firebase Auth User initially
let currentUserDetails = null; // Store full user data from 'users' collection { id, name, displayName, level, hireDate, hireDateObject, ... }
let currentSalaryMonth = null; // YYYY-MM string

// --- Constants for Condition Rendering (Frontend) (Phase 2 Expansion) ---
const FE_CONDITION_TYPES = {
    "TENURE": "年資",
    "ATTENDANCE": "出勤",
    "SALES": "銷售"
    // Match types defined in admin-bonus-tasks.js
};

const FE_METRIC_LABELS = {
    // TENURE
    "days_employed": "在職天數",
    // ATTENDANCE
    "on_time_rate": "準時率",
    "absence_days": "缺勤天數",
    "late_count": "遲到次數",
    // SALES
    "store_target_rate": "店鋪目標達成率",
    "personal_sales_amount": "個人銷售額",
    "store_total_sales": "店鋪總銷售額"
    // Add labels for other metrics as they are added
};

const FE_OPERATORS = {
    ">=": ">=",
    "<=": "<=",
    "==": "==",
    ">": ">",
    "<": "<"
    // Match operators used in admin-bonus-tasks.js
};

// --- 載入中和訊息顯示功能 ---

/**
 * 顯示載入中提示
 * @param {string} containerId - 容器ID或CSS選擇器
 * @param {string} message - 可選的載入訊息
 */
function showLoading(containerId, message = '載入中...') {
    const container = typeof containerId === 'string' ? 
        (document.getElementById(containerId) || document.querySelector(containerId)) : 
        containerId;
    
    if (!container) {
        console.warn(`Container not found for loading indicator: ${containerId}`);
        return;
    }
    
    // 建立載入提示元素
    const loadingHtml = `
        <div class="loading-indicator">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">載入中...</span>
            </div>
            <p class="loading-message">${message}</p>
        </div>
    `;
    
    container.innerHTML = loadingHtml;
}

/**
 * 隱藏載入中提示
 * @param {string} containerId - 容器ID或CSS選擇器
 */
function hideLoading(containerId) {
    const container = typeof containerId === 'string' ? 
        (document.getElementById(containerId) || document.querySelector(containerId)) : 
        containerId;
    
    if (!container) {
        console.warn(`Container not found for hiding loading: ${containerId}`);
        return;
    }
    
    // 找到載入提示元素並移除
    const loadingIndicator = container.querySelector('.loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

// --- Initialization ---

async function initSalaryViewPage(currentUser, db) {
    console.log("Initializing salary view page...");
    if (!currentUser || !db) {
        console.error("initSalaryViewPage: Missing currentUser or db instance.");
        document.body.innerHTML = '<p class="error-message">頁面初始化失敗，缺少用戶或數據庫資訊。</p>';
        return;
    }
    salaryViewDb = db;
    salaryViewCurrentUser = currentUser; // Store Auth User

    // 記錄傳入的用戶數據
    console.log("Current user from auth:", currentUser);
    if (currentUser.roles) {
        console.log("User roles from session:", currentUser.roles);
    }

    // Fetch full user details from Firestore 'users' collection
    try {
        // 嘗試從'users'集合讀取
        console.log("Attempting to fetch user details from 'users' collection for UID:", salaryViewCurrentUser.uid);
        const userDoc = await salaryViewDb.collection('users').doc(salaryViewCurrentUser.uid).get();
        
        if (userDoc.exists) {
            currentUserDetails = { id: userDoc.id, ...userDoc.data() }; // Store full user data
            console.log("Fetched user details from 'users' collection:", currentUserDetails);
        } else {
            console.warn("User document not found in 'users' collection. Attempting to fetch from 'employees' collection...");
            
            // 嘗試從employees集合查找用戶資料作為備用
            try {
                const employeesQuery = await salaryViewDb.collection('employees')
                    .where('authUid', '==', salaryViewCurrentUser.uid)
                    .limit(1)
                    .get();
                
                if (!employeesQuery.empty) {
                    const employeeDoc = employeesQuery.docs[0];
                    currentUserDetails = { id: employeeDoc.id, ...employeeDoc.data() };
                    console.log("Fetched user details from 'employees' collection:", currentUserDetails);
                } else {
                    console.warn("用戶資料不存在於'users'和'employees'集合中。使用 Auth 用戶資料作為備用。");
                    // 使用 Auth 用戶資料創建基本用戶資料
                    currentUserDetails = {
                        id: salaryViewCurrentUser.uid,
                        authUid: salaryViewCurrentUser.uid,
                        name: salaryViewCurrentUser.displayName || "未命名用戶",
                        displayName: salaryViewCurrentUser.displayName || "未命名用戶",
                        email: salaryViewCurrentUser.email || "",
                        level: currentUser.roles?.level || 0,
                        store: currentUser.roles?.store || "未分配",
                        isActive: true,
                        createdAt: new Date()
                    };
                    
                    // 嘗試創建用戶資料到 'employees' 集合
                    try {
                        console.log("嘗試創建基本用戶資料到 employees 集合");
                        const docRef = await salaryViewDb.collection('employees').add(currentUserDetails);
                        currentUserDetails.id = docRef.id;
                        console.log("已創建基本用戶資料:", currentUserDetails);
                    } catch (createError) {
                        console.warn("創建用戶資料失敗，但繼續使用臨時資料:", createError);
                    }
                }
            } catch (empError) {
                console.error("Error fetching from employees collection:", empError);
                // 不拋出錯誤，而是創建默認用戶資料
                console.warn("使用 Auth 用戶資料作為備用");
                currentUserDetails = {
                    id: salaryViewCurrentUser.uid,
                    authUid: salaryViewCurrentUser.uid,
                    name: salaryViewCurrentUser.displayName || "未命名用戶",
                    displayName: salaryViewCurrentUser.displayName || "未命名用戶",
                    level: currentUser.roles?.level || 0,
                    store: currentUser.roles?.store || "未分配",
                    isActive: true
                };
            }
        }
        
        // 確保有基本顯示名稱 - 使用多個可能的來源
        if (!currentUserDetails.displayName && !currentUserDetails.name) {
            if (salaryViewCurrentUser.displayName) {
                console.log("Using Auth displayName as fallback:", salaryViewCurrentUser.displayName);
                currentUserDetails.displayName = salaryViewCurrentUser.displayName;
            } else if (currentUser.name) {
                console.log("Using session name as fallback:", currentUser.name);
                currentUserDetails.displayName = currentUser.name;
            } else if (currentUser.displayName) {
                console.log("Using session displayName as fallback:", currentUser.displayName);
                currentUserDetails.displayName = currentUser.displayName;
            } else {
                console.warn("No name found in any source, using UID as display name");
                currentUserDetails.displayName = salaryViewCurrentUser.uid.substring(0, 8) + "...";
            }
        }

            // Process hireDate into a usable Date object
            if (currentUserDetails.hireDate) {
                 if (currentUserDetails.hireDate.toDate) { // Firestore Timestamp
                    currentUserDetails.hireDateObject = currentUserDetails.hireDate.toDate();
                } else if (typeof currentUserDetails.hireDate === 'string') {
                     try {
                         currentUserDetails.hireDateObject = new Date(currentUserDetails.hireDate);
                         if (isNaN(currentUserDetails.hireDateObject.getTime())) {
                             console.warn("Parsed hireDate string resulted in an invalid date:", currentUserDetails.hireDate);
                             currentUserDetails.hireDateObject = null;
                         }
                     } catch (e) {
                          console.error("Error parsing hireDate string:", currentUserDetails.hireDate, e);
                          currentUserDetails.hireDateObject = null;
                     }
                } else if (currentUserDetails.hireDate instanceof Date) {
                     currentUserDetails.hireDateObject = currentUserDetails.hireDate; // Already a Date object
                 } else {
                     console.warn("Hire date is present but not a recognized format (Timestamp, parseable String, Date):", currentUserDetails.hireDate);
                     currentUserDetails.hireDateObject = null;
                 }
            } else {
                 currentUserDetails.hireDateObject = null; // Hire date missing
                 console.warn("Hire date is missing from user details.");
        }
    } catch (error) {
        console.error("Error fetching user details:", error);
        document.body.innerHTML = `<p class="error-message">無法載入用戶資料: ${error.message} 請聯繫管理員。</p>`;
        return;
    }

    // Set initial month (e.g., previous month)
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    currentSalaryMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    // Display user info and current month
    const nameDisplay = document.getElementById('salary-employee-name');
    const monthDisplay = document.getElementById('salary-month-display');
    if (nameDisplay) nameDisplay.textContent = currentUserDetails.displayName || currentUserDetails.name || salaryViewCurrentUser.uid;
    if (monthDisplay) monthDisplay.textContent = currentSalaryMonth;

    // Setup button listeners
    setupMonthNavigation();
    setupBonusModalButton(); // Setup button to view all tasks modal

    // Load initial data for the current month
    await loadAllSectionsForMonth(currentSalaryMonth);
    
    // 初始化薪資比較功能 (包裝在try/catch中確保不影響主功能)
    try {
        // 初始化薪資比較功能
        setupSalaryComparisonFeature();
        console.log("Salary comparison feature initialized.");
    } catch (error) {
        console.warn("Failed to initialize salary comparison feature:", error);
        // 不中斷頁面加載
    }

    console.log("Salary view page initialized.");
}

function setupMonthNavigation() {
    const prevButton = document.getElementById('prev-salary-month');
    const nextButton = document.getElementById('next-salary-month');
    const monthDisplay = document.getElementById('salary-month-display');

    if (prevButton) {
        prevButton.onclick = async () => {
            if (!currentSalaryMonth) return;
            const [year, month] = currentSalaryMonth.split('-').map(Number);
            const newDate = new Date(year, month - 1 - 1, 1); // Go to previous month
            currentSalaryMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
            if (monthDisplay) monthDisplay.textContent = currentSalaryMonth;
            // Only reload month-dependent sections
            await loadMonthDependentSections(currentSalaryMonth);
        };
    }

    if (nextButton) {
        nextButton.onclick = async () => {
            if (!currentSalaryMonth) return;
            const [year, month] = currentSalaryMonth.split('-').map(Number);
            const currentDate = new Date();
            const nextMonthDate = new Date(year, month - 1 + 1, 1); // Go to next month

            // Prevent navigating to future months beyond the current real month
            if (nextMonthDate > currentDate) {
                 showTemporaryMessage(document.getElementById('salary-message'), "無法查看未來月份的資料。", 'warning');
                 return;
             }

            currentSalaryMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
            if (monthDisplay) monthDisplay.textContent = currentSalaryMonth;
            // Only reload month-dependent sections
            await loadMonthDependentSections(currentSalaryMonth);
        };
    }
}

function setupBonusModalButton() {
     const viewBonusBtn = document.getElementById('view-bonus-list-btn');
     const bonusModal = document.getElementById('bonus-list-modal');
     if (viewBonusBtn && bonusModal) {
         viewBonusBtn.onclick = () => {
             // Load content into modal just before showing
             loadAllBonusTasksForModal();
             // Assume openModal is a global function from main.js or similar
             if (typeof openModal === 'function') {
                openModal('bonus-list-modal');
             } else {
                 console.error("Global openModal function not found.");
                 alert("無法開啟任務列表視窗。");
             }
         };
          // Ensure modal close button works (assuming closeModal exists globally)
          // Check if setupModalCloseEvents exists from main.js or similar
          if (typeof setupModalCloseEvents === 'function') {
               setupModalCloseEvents('bonus-list-modal');
          } else {
               console.warn("setupModalCloseEvents function not found, modal close might need manual setup.");
               // Add basic close functionality as fallback if needed
               const closeBtn = bonusModal.querySelector('.close-btn'); // Assuming standard class
                if (closeBtn && typeof closeModal === 'function') {
                    closeBtn.onclick = () => closeModal('bonus-list-modal');
                }
          }
     } else {
          console.warn("Could not find 'View All Tasks' button or bonus modal element.");
          if(viewBonusBtn) viewBonusBtn.style.display = 'none'; // Hide button if modal missing
     }
}

// --- Data Loading Functions ---

async function loadAllSectionsForMonth(yearMonth) {
    console.log(`Loading all sections initially for month: ${yearMonth}`);
    if (!salaryViewDb || !currentUserDetails) {
        console.error("DB or UserDetails not available for loading data.");
        return;
    }

    // Show loading indicators for all sections
    const attendanceLog = document.getElementById('attendance-log') || document.querySelector('#attendance-log');
    const availableBonusTasks = document.getElementById('available-bonus-tasks') || document.querySelector('#available-bonus-tasks');
    const bonusHistory = document.getElementById('bonus-history') || document.querySelector('#bonus-history');
    const payrollDetails = document.getElementById('payroll-details') || document.querySelector('#payroll-details');
    
    if (attendanceLog) showLoading(attendanceLog, '載入出勤記錄中...');
    if (availableBonusTasks) showLoading(availableBonusTasks, '載入可選任務中...');
    if (bonusHistory) showLoading(bonusHistory, '載入獎金紀錄中...');
    if (payrollDetails) showLoading(payrollDetails, '載入薪資明細中...');

    // Clear previous message
    const msgElement = document.getElementById('salary-message');
    if (msgElement) msgElement.textContent = ''; msgElement.className = 'message';

    // Fetch available tasks once on initial load, others depend on month
    // Use Promise.allSettled to allow parts to load even if others fail
    const results = await Promise.allSettled([
        loadAvailableBonusTasksSection(), // Load available tasks for the main view (only needs to run once usually)
        loadMonthDependentSections(yearMonth) // Load sections dependent on the initial month
    ]);

    results.forEach((result, index) => {
        if (result.status === 'rejected') {
             const sectionNames = ['Available Tasks', 'Month Dependent Sections'];
             console.error(`Initial load failed for ${sectionNames[index]}:`, result.reason);
             // Display a more specific error?
        }
    });

    console.log(`Finished loading initial sections for ${yearMonth}`);
}

async function loadMonthDependentSections(yearMonth) {
    console.log(`Loading month-dependent sections for: ${yearMonth}`);
    // Show loading for month-dependent sections
    const attendanceLog = document.getElementById('attendance-log') || document.querySelector('#attendance-log');
    const bonusHistory = document.getElementById('bonus-history') || document.querySelector('#bonus-history');
    const payrollDetails = document.getElementById('payroll-details') || document.querySelector('#payroll-details');
    
    if (attendanceLog) showLoading(attendanceLog, '載入出勤記錄中...');
    if (bonusHistory) showLoading(bonusHistory, '載入獎金紀錄中...');
    if (payrollDetails) showLoading(payrollDetails, '載入薪資明細中...');

    // Use Promise.allSettled to allow sections to load independently
    const results = await Promise.allSettled([
        loadAttendanceLog(yearMonth),
        loadBonusHistory(yearMonth),
        loadPayrollDetails(yearMonth) // This will trigger updatePayrollBonusTotal internally
    ]);

    results.forEach((result, index) => {
        if (result.status === 'rejected') {
             const sectionNames = ['Attendance Log', 'Bonus History', 'Payroll Details'];
             console.error(`Error loading ${sectionNames[index]} for ${yearMonth}:`, result.reason);
             // Optionally display error in the specific section container
             const containers = ['attendance-log', 'bonus-history', 'payroll-details'];
             const errorContainer = document.getElementById(containers[index]) || document.querySelector('#' + containers[index]);
             if (errorContainer) {
                  errorContainer.innerHTML = `<p class="text-danger">載入此區塊失敗。</p>`;
             }
        }
    });

    console.log(`Finished loading month-dependent sections for ${yearMonth}`);
}


async function loadAttendanceLog(yearMonth) {
    const containerId = 'attendance-log';
    const container = document.getElementById(containerId) || document.querySelector('#' + containerId);
    if (!container) {
        console.error(`Container not found: #${containerId}`);
        return Promise.reject("Attendance log container not found");
    }
    
    showLoading(container, '載入出勤記錄中...');

    const [year, month] = yearMonth.split('-');
    // Construct start and end dates for the Firestore query
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1); // Start of next month (exclusive)

    try {
        // 確定當前用戶的各種可能ID
        const possibleUserIds = [
            currentUserDetails.id,                  // 直接從users或employees集合獲取的ID
            salaryViewCurrentUser.uid,              // Firebase Auth UID
            currentUserDetails.authUid              // 可能儲存在document中的authUid字段
        ].filter(id => id); // 過濾掉undefined/null值
        
        console.log("Looking for attendance records with possible IDs:", possibleUserIds);
        
        // 嘗試不同ID查詢打卡記錄
        let snapshot = null;
        let records = [];
        
        // 對每個可能的ID執行查詢
        for (const userId of possibleUserIds) {
            // 嘗試使用userId字段
            console.log(`Querying with userId == ${userId}`);
            snapshot = await salaryViewDb.collection('clock_records')
                                     .where('userId', '==', userId)
                                        .where('clockInTime', '>=', startDate)
                                        .where('clockInTime', '<', endDate) // Use < for exclusive end date
                                        .orderBy('clockInTime', 'asc')
                                        .get();
                                     
        if (!snapshot.empty) {
                console.log(`Found ${snapshot.size} records with userId == ${userId}`);
                snapshot.forEach(doc => records.push({id: doc.id, ...doc.data()}));
                break; // 找到記錄後就停止
            }
            
            // 如果userId沒找到，嘗試使用authUid字段
            console.log(`Querying with authUid == ${userId}`);
            snapshot = await salaryViewDb.collection('clock_records')
                                     .where('authUid', '==', userId)
                                     .where('clockInTime', '>=', startDate)
                                     .where('clockInTime', '<', endDate)
                                     .orderBy('clockInTime', 'asc')
                                     .get();
                                     
            if (!snapshot.empty) {
                console.log(`Found ${snapshot.size} records with authUid == ${userId}`);
                snapshot.forEach(doc => records.push({id: doc.id, ...doc.data()}));
                break; // 找到記錄後就停止
            }
        }
        
        // 清除載入中提示
        hideLoading(container);
        
        // 渲染記錄
        let html = '<p><i>本月無打卡記錄。</i></p>';
        if (records.length > 0) {
            html = '<ul class="list-unstyled attendance-list">'; // Added class for potential styling
            records.forEach(record => {
                const clockIn = record.clockInTime ? formatTimestamp(record.clockInTime, 'YYYY-MM-DD HH:mm') : 'N/A';
                const clockOut = record.clockOutTime ? formatTimestamp(record.clockOutTime, 'HH:mm') : '-';
                let status = record.status || '正常';
                let statusClass = '';
                 if (status === '遲到') statusClass = 'text-warning';
                 else if (status === '早退') statusClass = 'text-info';
                 else if (status === '異常' || status === '曠職') statusClass = 'text-danger';
                const duration = calculateDuration(record.clockInTime, record.clockOutTime);
                html += `<li><span class="record-time">${clockIn} ~ ${clockOut}</span> <span class="record-status ${statusClass}">(${status})</span> ${duration ? `<span class="record-duration">[${duration}]</span>` : ''}</li>`;
            });
            html += '</ul>';
        }
        container.innerHTML = html;
        return true; // Indicate success
    } catch (error) {
        console.error("Error loading attendance log:", error);
        container.innerHTML = '<p class="text-danger">載入出勤記錄失敗。</p>';
        throw error; // Re-throw error so Promise.allSetled catches it
    }
}

async function loadAvailableBonusTasksSection() {
    const containerId = 'available-bonus-tasks'; // Target the main section div
    const contentContainer = document.getElementById(containerId) || document.querySelector('#' + containerId);
    
    // 如果找不到主容器，尝试找子容器
    let container = contentContainer;
    if (!container) {
        console.warn(`Main container #${containerId} not found, trying to find section-content inside it.`);
        container = document.querySelector(`#${containerId} .section-content`);
    }
    
    // 尝试查找父级容器内的section-content
    if (!container) {
        console.warn(`Trying to find any .section-content element in the document.`);
        container = document.querySelector(`.section-content`);
    }
    
    // 如果还是找不到，创建一个容器
    if (!container) {
        console.error(`No suitable container found for ${containerId}, creating fallback container.`);
        container = document.createElement('div');
        container.id = 'fallback-bonus-tasks-container';
        document.body.appendChild(container);
    }
    
    showLoading(container, '載入可選任務中...');

    if (!salaryViewDb || !currentUserDetails) {
        container.innerHTML = '<p class="error-message">無法載入任務，缺少用戶資料或資料庫連接。</p>';
        return Promise.reject("Missing DB or user details for loading available tasks.");
    }

    try {
        const now = new Date();
        // 計算年資天數，使用備用方案
        let userTenureDays = 0;
        if (currentUserDetails.hireDateObject) {
            userTenureDays = calculateTenureDays(currentUserDetails.hireDateObject, now);
            console.log(`Calculated tenure days: ${userTenureDays} from hire date:`, currentUserDetails.hireDateObject);
        } else {
            console.warn("No valid hire date found for tenure calculation. Defaulting to 0 days.");
        }

        // 使用用戶等級，搭配備用方案
        const userLevel = currentUserDetails.level !== undefined 
            ? currentUserDetails.level 
            : (currentUser?.roles?.level || 1); // 備用：從session或使用預設值
        
        console.log(`Using user level ${userLevel} for bonus task query`);

        const tasksSnapshot = await salaryViewDb.collection('bonus_tasks')
            .where('isActive', '==', true)
            .where('minLevel', '<=', userLevel)
            .orderBy('minLevel', 'desc') // Optional: Show higher level tasks first
            .orderBy('createdAt', 'desc')
            .get();

        // 清除載入中提示
        hideLoading(container);

        if (tasksSnapshot.empty) {
            container.innerHTML = '<p class="text-muted">目前系統中沒有任何啟用的獎金任務。</p>';
            return;
        }

         const list = document.createElement('ul');
         list.className = 'list-group list-group-flush';

        tasksSnapshot.forEach(doc => {
             const task = { id: doc.id, ...doc.data() };
             const item = document.createElement('li');
             item.className = 'list-group-item';

             // Use the new helper to render condition summary
             const conditionSummary = renderFrontendConditionsSummary(task.conditions, task.conditionsLogic);
             const unlockConditionText = task.unlockConditions?.minTenureDays !== undefined
                                       ? `在職 ${task.unlockConditions.minTenureDays} 天`
                                       : '無';

             item.innerHTML = `
                 <h5>${escapeHTML(task.name)}</h5>
                 <p><small>${escapeHTML(task.description || '-')}</small></p>
                 <p><small>獎勵: ${escapeHTML(String(task.rewardValue))} | 主要條件: ${conditionSummary}</small></p>
                 <p><small>前置條件: ${escapeHTML(unlockConditionText)}</small></p>
             `;
             list.appendChild(item);
        });
         container.appendChild(list);
         return true;

    } catch (error) {
        console.error("Error loading all bonus tasks for modal:", error);
        container.innerHTML = `<p class="error-message">載入任務列表時發生錯誤: ${escapeHTML(error.message)}</p>`;
        throw error;
    }
}

// --- Helper Functions ---

function calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return null;
    try {
        const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
        const end = endTime.toDate ? endTime.toDate() : new Date(endTime);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

        const diffMillis = end - start;
        if (diffMillis < 0) return null; // End time before start time

        const totalMinutes = Math.floor(diffMillis / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        let durationString = '';
        if (hours > 0) {
             durationString += `${hours}小時`;
        }
        if (minutes > 0 || hours === 0) { // Show minutes if > 0 or if hours is 0
             if (hours > 0) durationString += ' '; // Add space if hours exist
             durationString += `${minutes}分鐘`;
        }
        // Handle case where duration is exactly 0 minutes
        return durationString || '0分鐘';
    } catch (e) {
        console.warn("Error calculating duration:", e);
        return null;
    }
}

/**
 * 將不安全的HTML文本轉換為安全的文本
 * @param {string} unsafe 不安全的HTML文本
 * @return {string} 安全的HTML文本
 */
function escapeHTML(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Check unlock conditions for a single task on the frontend
function checkUnlockConditions(task, userTenureDays) {
    if (!task.unlockConditions || task.unlockConditions.minTenureDays === undefined || task.unlockConditions.minTenureDays === null) {
        return { met: true, message: '無前置條件' }; // No tenure condition
    }

    const requiredDays = task.unlockConditions.minTenureDays;
    if (userTenureDays === null || userTenureDays === undefined) {
        return { met: false, message: '無法計算在職天數' }; // Cannot check if hire date is missing
    }

    if (userTenureDays >= requiredDays) {
        return { met: true, message: `已滿足 ${requiredDays} 天在職條件` };
    } else {
        return { met: false, message: `未滿足 ${requiredDays} 天在職條件 (目前 ${userTenureDays} 天)` };
    }
}

// Placeholder function to handle selecting a bonus task
function selectBonusTask(taskId) {
    console.log("Attempting to select bonus task:", taskId);
    // TODO: Implement actual logic
    // 1. Confirm selection with the user?
    // 2. Call a Cloud Function to record the selection (e.g., in a 'user_selected_tasks' collection or similar)
    // 3. Provide feedback to the user (success/error)
    showTemporaryMessage(document.getElementById('bonus-list-content'), `選擇參與任務 ${taskId} (此功能待後端實作)`, 'info');
    // Maybe close the modal after attempting selection
    // if (typeof closeModal === 'function') closeModal('bonus-list-modal');
}


// Helper to get system parameters (if needed for visibility etc.)
// 重定向到最新的getSystemParameter实现
async function getSystemParameter(category, key, defaultValue = null) {
    // 添加警告以便于调试
    console.log(`[DEPRECATED] 使用旧的getSystemParameter，将重定向到新实现 (${category}.${key})`);
    
    // 保持参数命名兼容性，重定向到新的实现
    return window.getSystemParameterNew(category, key, defaultValue);
}

// 保存新的getSystemParameter实现到window对象
// 此函数在文件末尾定义
window.getSystemParameterNew = async function(collection, paramName, defaultValue = '0') {
    if (!salaryViewDb) {
        console.warn(`无法获取系统参数 ${collection}.${paramName}: 数据库未初始化`);
        return defaultValue;
    }
    
    try {
        // 首先尝试从settings集合获取
        const docRef = salaryViewDb.collection('settings').doc(collection);
        const doc = await docRef.get();
        
        if (doc.exists && doc.data() && doc.data()[paramName] !== undefined) {
            return doc.data()[paramName];
        }
        
        // 如果未找到，尝试从system_config集合获取
        const configRef = salaryViewDb.collection('system_config').doc('parameters');
        const configDoc = await configRef.get();
        
        if (configDoc.exists && configDoc.data() && 
            configDoc.data()[collection] && 
            configDoc.data()[collection][paramName] !== undefined) {
            return configDoc.data()[collection][paramName];
        }
        
        // 如果仍未找到，尝试从parameters集合获取 (兼容旧版本)
        const oldDocRef = salaryViewDb.collection('parameters').doc(collection);
        const oldDoc = await oldDocRef.get();
        
        if (oldDoc.exists && oldDoc.data() && oldDoc.data()[paramName] !== undefined) {
            return oldDoc.data()[paramName];
        }
        
        console.warn(`未找到系统参数 ${collection}.${paramName}，使用默认值: ${defaultValue}`);
        return defaultValue;
    } catch (error) {
        console.error(`获取系统参数 ${collection}.${paramName} 时出错:`, error);
        return defaultValue; // 出现任何错误时返回默认值
    }
};

// Basic Modal Handling Placeholders (if not provided globally)
// Assume these are defined in main.js or similar shared script.
// Add simple fallbacks with warnings if they aren't found.
function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = 'block';
    } else {
         console.error(`openModal: Element with ID '${id}' not found.`);
    }
 }
function closeModal(id) {
     const el = document.getElementById(id);
     if (el) {
        el.style.display = 'none';
     } else {
          console.error(`closeModal: Element with ID '${id}' not found.`);
     }
}
function setupModalCloseEvents(id) {
    // Basic implementation if not found globally
    const modal = document.getElementById(id);
    if (!modal) return;
    const closeBtn = modal.querySelector('.close-btn'); // Standard close button class
    if (closeBtn) {
        closeBtn.onclick = () => closeModal(id);
    }
    // Optional: Close on overlay click
    modal.onclick = (event) => {
        if (event.target === modal) { // Clicked on the overlay itself
            closeModal(id);
        }
    };
     console.log(`Basic modal close events setup for #${id}`);
}

/**
 * Renders a human-readable summary of task conditions for the frontend.
 * @param {Array<object>|null|undefined} conditions - The conditions array from the task.
 * @param {string|null|undefined} logic - The logic ('AND' or 'OR') between conditions.
 * @returns {string} - HTML string for the summary.
 */
function renderFrontendConditionsSummary(conditions, logic = 'AND') {
    if (!conditions || conditions.length === 0) {
        return '無'; // No specific conditions
    }

    const logicSeparator = logic === 'OR' ? ' <span class="text-muted">(或)</span> ' : ' <span class="text-muted">(且)</span> ';

    const summaryParts = conditions.map(cond => {
        const typeLabel = FE_CONDITION_TYPES[cond.type] || cond.type;
        const metricLabel = FE_METRIC_LABELS[cond.metric] || cond.metric;
        const operatorLabel = FE_OPERATORS[cond.operator] || cond.operator;
        let valueLabel = escapeHTML(String(cond.value));

        // Add specific formatting for certain metrics
        if (cond.metric === 'on_time_rate') {
             // Format as percentage
             const rate = parseFloat(cond.value);
             if (!isNaN(rate)) {
                valueLabel = `${(rate * 100).toFixed(0)}%`;
             }
        } else if (cond.metric === 'personal_sales_amount' || cond.metric === 'store_total_sales') {
             // Format as currency (simple version)
             const amount = parseFloat(cond.value);
             if (!isNaN(amount)) {
                 valueLabel = `$${amount.toLocaleString()}`;
             }
        } else if (cond.metric === 'store_target_rate'){
             // Format as percentage increase/value
             const rate = parseFloat(cond.value);
             if (!isNaN(rate)) {
                 valueLabel = `${(rate * 100).toFixed(0)}%`;
             }
        }
        // Add more formatting rules as needed

        return `${metricLabel} ${operatorLabel} ${valueLabel}`;
    });

    return summaryParts.join(logicSeparator);
}

/**
 * 匯出薪資資料為CSV格式並下載
 * @param {Object} payrollData - 薪資數據對象
 * @param {string} yearMonth - 年月字符串，格式為 YYYY-MM
 */
async function exportPayrollCSV(payrollData, yearMonth) {
    try {
        showTemporaryMessage(document.getElementById('salary-message'), '正在準備匯出薪資CSV...', 'info');
        
        // 格式化年月
        const [year, month] = yearMonth.split('-');
        const monthDate = new Date(year, month-1, 1);
        const formattedMonth = monthDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
        
        // 獲取獎金信息
        let bonusItems = [];
        let totalBonus = 0;
        try {
            const progressDocId = `${currentUserDetails.id}_${yearMonth}`;
            const progressDoc = await salaryViewDb.collection('employee_bonus_progress').doc(progressDocId).get();
            if (progressDoc.exists) {
                const tasksHistory = progressDoc.data().tasks || [];
                bonusItems = tasksHistory.filter(task => task.status === 'PASSED' && task.rewardEarned > 0)
                    .map(task => ({
                        name: task.taskName || '獎金項目',
                        amount: task.rewardEarned || 0
                    }));
                
                totalBonus = bonusItems.reduce((sum, item) => sum + item.amount, 0);
            }
        } catch (error) {
            console.error('Error fetching bonus details for CSV:', error);
            totalBonus = payrollData.bonusTotal || 0;
        }
        
        // 準備CSV數據
        // 1. 基本信息
        let csvRows = [
            ['薪資單', formattedMonth],
            ['員工', currentUserDetails.displayName || currentUserDetails.name || ''],
            ['職位', currentUserDetails.position || '未設定'],
            ['員工編號', currentUserDetails.employeeId || currentUserDetails.id || ''],
            [''],  // 空行
            ['項目', '金額(NT$)']
        ];
        
        // 2. 收入項目
        csvRows.push(['基本薪資', formatNumberForCSV(payrollData.baseSalary)]);
        csvRows.push(['加班費', formatNumberForCSV(payrollData.overtimePay)]);
        csvRows.push(['獎金合計', formatNumberForCSV(totalBonus)]);
        
        // 3. 獎金明細
        if (bonusItems.length > 0) {
            csvRows.push(['']);  // 空行
            csvRows.push(['獎金詳細項目', '']);
            bonusItems.forEach(item => {
                csvRows.push([`  ${item.name}`, formatNumberForCSV(item.amount)]);
            });
        }
        
        // 4. 扣款項目
        csvRows.push(['']);  // 空行
        csvRows.push(['扣款項目', '']);
        csvRows.push(['  扣款合計', formatNumberForCSV(payrollData.deductions || 0)]);
        
        // 5. 實發薪資
        csvRows.push(['']);  // 空行
        csvRows.push(['實發薪資', formatNumberForCSV(payrollData.finalPay)]);
        
        // 6. 備註
        csvRows.push(['']);  // 空行
        csvRows.push(['備註', '']);
        csvRows.push(['', '本薪資單僅供參考，正式薪資以實際發放為準']);
        csvRows.push(['', '薪資問題請聯繫人事部門']);
        csvRows.push(['', `生成時間: ${new Date().toLocaleString('zh-TW')}`]);
        
        // 將CSV行轉換為CSV字符串
        const csvContent = csvRows.map(row => 
            row.map(cell => 
                typeof cell === 'string' && cell.includes(',') 
                    ? `"${cell}"` 
                    : cell
            ).join(',')
        ).join('\n');
        
        // 創建Blob並下載
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const employeeName = currentUserDetails.displayName || currentUserDetails.name || 'employee';
        const fileName = `薪資資料_${employeeName}_${yearMonth}.csv`;
        
        // 創建下載鏈接
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // 點擊下載
        link.click();
        
        // 清理
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showTemporaryMessage(document.getElementById('salary-message'), 'CSV檔案已成功下載', 'success', 5000);
    } catch (error) {
        console.error('匯出CSV時發生錯誤:', error);
        showTemporaryMessage(document.getElementById('salary-message'), `匯出CSV失敗: ${error.message}`, 'error', 5000);
    }
}

/**
 * 格式化數字以在CSV中顯示
 * @param {number|string} value - 要格式化的數值
 * @returns {string} - 格式化後的數值字串
 */
function formatNumberForCSV(value) {
    if (value === undefined || value === null) return '';
    
    // 轉換為數字
    const numValue = Number(value);
    if (isNaN(numValue)) return '';
    
    // 返回數字字符串，無需格式化
    return numValue.toString();
}

// --- Old Functions Removed ---
// Functions like initYearMonthSelectors, initStoreSelector, setupButtonListeners,
// querySalaryData, queryBonusData, viewSalaryDetail, editSalary,
// viewBonusDetail, editBonus were related to a different UI structure
// and have been replaced by the employee-centric logic above.

// </rewritten_file> 

// === 薪資歷史比較功能 (2025/04/16) ===

/**
 * 初始化薪資比較功能相關事件監聽
 * 在initSalaryViewPage函數中調用
 */
function setupSalaryComparisonFeature() {
    // 嘗試獲取所有相關元素
    const compareBtn = document.getElementById('compare-salary-btn');
    const closeCompareBtn = document.getElementById('close-compare-btn');
    const addMonthBtn = document.getElementById('add-compare-month');
    const runComparisonBtn = document.getElementById('run-comparison-btn');
    const comparePanel = document.getElementById('salary-compare-panel');
    const compareMonth3 = document.getElementById('compare-month-3');
    const compareMonth1 = document.getElementById('compare-month-1');
    const compareMonth2 = document.getElementById('compare-month-2');
    
    // 檢查關鍵必要元素是否存在
    const missingElements = [];
    if (!compareBtn) missingElements.push('compare-salary-btn');
    if (!comparePanel) missingElements.push('salary-compare-panel');
    if (!compareMonth1) missingElements.push('compare-month-1');
    if (!compareMonth2) missingElements.push('compare-month-2');
    
    // 如果缺少關鍵元素，則尋找父容器嘗試創建它們
    if (missingElements.length > 0) {
        console.warn(`薪資比較功能缺少關鍵元素: ${missingElements.join(', ')}`);
        
        // 嘗試找到可以插入比較功能的容器
        const salaryContainer = document.querySelector('.salary-container') || document.querySelector('.main-content');
        
        if (salaryContainer) {
            console.log("嘗試創建薪資比較功能UI元素");
            try {
                // 創建比較按鈕(如果不存在)
                if (!compareBtn) {
                    const buttonContainer = document.querySelector('.salary-header-actions') || 
                                          document.querySelector('.salary-header') || 
                                          salaryContainer;
                    
                    if (buttonContainer) {
                        const newBtn = document.createElement('button');
                        newBtn.id = 'compare-salary-btn';
                        newBtn.className = 'btn btn-info btn-sm';
                        newBtn.innerHTML = '<i class="fas fa-chart-line"></i> 歷史比較';
                        buttonContainer.appendChild(newBtn);
                        compareBtn = newBtn;
                    }
                }
                
                // 如果還是缺少關鍵元素，則放棄初始化
                if (!compareBtn) {
                    console.warn("無法創建薪資比較按鈕，放棄初始化比較功能");
                    return;
                }
            } catch (e) {
                console.error("創建薪資比較UI元素失敗:", e);
                return;
            }
        } else {
            console.warn("找不到合適容器來創建薪資比較UI，放棄初始化比較功能");
            return;
        }
    }
    
    // 填充比較月份選擇框 (如果選擇器存在)
    if (compareMonth1 && compareMonth2) {
        try {
            populateComparisonMonthSelectors();
        } catch (e) {
            console.warn("填充月份選擇器失敗:", e);
        }
    }
    
    // 綁定事件 (只綁定存在的元素)
    
    // 顯示比較面板
    if (compareBtn && comparePanel) {
        compareBtn.addEventListener('click', () => {
            comparePanel.style.display = 'block';
            // 確保選擇的第一個月是當前查看的月份
            if (compareMonth1 && currentSalaryMonth) {
                compareMonth1.value = currentSalaryMonth;
                // 觸發change事件以便更新其他選擇器
                compareMonth1.dispatchEvent(new Event('change'));
            }
        });
    }
    
    // 關閉比較面板
    if (closeCompareBtn && comparePanel) {
        closeCompareBtn.addEventListener('click', () => {
            comparePanel.style.display = 'none';
            const resultsContainer = document.getElementById('salary-comparison-results');
            if (resultsContainer) {
                resultsContainer.style.display = 'none';
            }
        });
    }
    
    // 添加更多比較月份
    if (addMonthBtn && compareMonth3) {
        addMonthBtn.addEventListener('click', () => {
            if (compareMonth3.style.display === 'none') {
                compareMonth3.style.display = 'block';
                addMonthBtn.textContent = '-';
                addMonthBtn.style.color = '#dc3545';
                addMonthBtn.style.borderColor = '#dc3545';
            } else {
                compareMonth3.style.display = 'none';
                addMonthBtn.textContent = '+';
                addMonthBtn.style.color = '#28a745';
                addMonthBtn.style.borderColor = '#28a745';
            }
        });
    }
    
    // 執行比較
    if (runComparisonBtn && compareMonth1 && compareMonth2) {
        runComparisonBtn.addEventListener('click', async () => {
            const month1 = compareMonth1.value;
            const month2 = compareMonth2.value;
            
            const monthsToCompare = [month1, month2];
            if (compareMonth3 && compareMonth3.style.display !== 'none' && compareMonth3.value) {
                monthsToCompare.push(compareMonth3.value);
            }
            
            // 檢查是否有重複月份
            const uniqueMonths = [...new Set(monthsToCompare)];
            if (uniqueMonths.length < monthsToCompare.length) {
                const messageContainer = document.getElementById('salary-message') || document.querySelector('.salary-header');
                showTemporaryMessage(messageContainer, "比較月份不能重複", 'error');
                return;
            }
            
            // 執行薪資比較
            try {
                await runSalaryComparison(monthsToCompare);
            } catch (e) {
                console.error("執行薪資比較失敗:", e);
                const messageContainer = document.getElementById('salary-message') || document.querySelector('.salary-header');
                showTemporaryMessage(messageContainer, "執行比較時發生錯誤: " + e.message, 'error');
            }
        });
    }
    
    // 月份選擇器的聯動更新
    if (compareMonth1) {
        compareMonth1.addEventListener('change', updateOtherMonthSelectors);
    }
    if (compareMonth2) {
        compareMonth2.addEventListener('change', updateOtherMonthSelectors);
    }
    if (compareMonth3) {
        compareMonth3.addEventListener('change', updateOtherMonthSelectors);
    }
}

/**
 * 填充比較月份選擇框，顯示近24個月的選項
 */
function populateComparisonMonthSelectors() {
    const selectors = [
        document.getElementById('compare-month-1'),
        document.getElementById('compare-month-2'),
        document.getElementById('compare-month-3')
    ];
    
    // 生成過去24個月的選項
    const options = generatePast24MonthsOptions();
    
    // 填充每個選擇器
    selectors.forEach((selector, index) => {
        if (!selector) return;
        
        // 清空現有選項
        selector.innerHTML = '';
        
        // 添加新選項
        options.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option.value;
            optElement.textContent = option.label;
            selector.appendChild(optElement);
        });
        
        // 設置默認選擇的月份
        // 第一個選擇器選擇當前月份
        // 第二個選擇器選擇前一個月
        // 第三個選擇器選擇前兩個月
        if (options.length > index) {
            selector.value = options[index].value;
        }
    });
}

/**
 * 生成過去24個月的選項
 * @returns {Array} 月份選項數組 {value: 'YYYY-MM', label: 'YYYY年MM月'}
 */
function generatePast24MonthsOptions() {
    const options = [];
    const today = new Date();
    
    // 從當前月份開始，向前推24個月
    for (let i = 0; i < 24; i++) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const value = `${year}-${String(month).padStart(2, '0')}`;
        const label = `${year}年${String(month).padStart(2, '0')}月`;
        
        options.push({ value, label });
    }
    
    return options;
}

/**
 * 更新其他月份選擇器的選項，防止選擇重複月份
 * @param {Event} event - 選擇器的change事件
 */
function updateOtherMonthSelectors(event) {
    const selectors = [
        document.getElementById('compare-month-1'),
        document.getElementById('compare-month-2'),
        document.getElementById('compare-month-3')
    ].filter(Boolean);
    
    const currentSelector = event.target;
    const selectedValue = currentSelector.value;
    
    // 更新其他選擇器的禁用狀態
    selectors.forEach(selector => {
        if (selector === currentSelector) return;
        
        // 遍歷所有選項
        Array.from(selector.options).forEach(option => {
            // 如果選項值與當前選擇器的選擇值相同，則禁用該選項
            if (option.value === selectedValue) {
                option.disabled = true;
            } else {
                option.disabled = false;
            }
        });
    });
}

/**
 * 執行薪資比較並顯示結果
 * @param {Array} months - 要比較的月份數組 ['YYYY-MM',...]
 */
async function runSalaryComparison(months) {
    if (!months || !months.length || !currentUserDetails || !salaryViewDb) {
        showTemporaryMessage(document.getElementById('salary-message'), "無法執行比較，缺少必要數據", 'error');
        return;
    }
    
    showTemporaryMessage(document.getElementById('salary-message'), "正在獲取資料進行比較...", 'info');
    
    try {
        // 顯示載入中
        const resultsContainer = document.getElementById('salary-comparison-results');
        resultsContainer.style.display = 'block';
        const chartsContainer = resultsContainer.querySelector('.comparison-charts');
        const tableHead = document.getElementById('comparison-table-head');
        const tableBody = document.getElementById('comparison-table-body');
        
        chartsContainer.innerHTML = '<div class="loading-placeholder">載入比較圖表中...</div>';
        tableHead.innerHTML = '<tr><th>載入比較數據中...</th></tr>';
        tableBody.innerHTML = '';
        
        // 獲取每個月的薪資數據
        const payrollsData = [];
        for (const month of months) {
            const payrollDocId = `${currentUserDetails.id}_${month}`;
            const payrollDoc = await salaryViewDb.collection('payrolls').doc(payrollDocId).get();
            
            if (payrollDoc.exists) {
                const data = payrollDoc.data();
                // 添加月份標識
                payrollsData.push({
                    month,
                    monthLabel: `${month.split('-')[0]}年${month.split('-')[1]}月`,
                    ...data
                });
            } else {
                console.log(`No payroll found for month ${month}`);
                // 添加空數據，保持數組索引與月份對應
                payrollsData.push({
                    month,
                    monthLabel: `${month.split('-')[0]}年${month.split('-')[1]}月`,
                    baseSalary: 0,
                    overtimePay: 0,
                    bonusTotal: 0,
                    deductions: 0,
                    finalPay: 0,
                    status: '無數據'
                });
            }
        }
        
        // 為每個月獲取獎金數據
        for (let i = 0; i < payrollsData.length; i++) {
            const month = payrollsData[i].month;
            const progressDocId = `${currentUserDetails.id}_${month}`;
            
            try {
                const progressDoc = await salaryViewDb.collection('employee_bonus_progress').doc(progressDocId).get();
                if (progressDoc.exists) {
                    const tasksHistory = progressDoc.data().tasks || [];
                    const passedTasks = tasksHistory.filter(task => task.status === 'PASSED' && task.rewardEarned > 0);
                    
                    // 計算總獎金
                    const totalBonus = passedTasks.reduce((sum, task) => sum + (task.rewardEarned || 0), 0);
                    
                    // 更新薪資數據中的獎金總額
                    payrollsData[i].bonusTotal = totalBonus;
                    
                    // 收集獎金項目明細
                    payrollsData[i].bonusItems = passedTasks.map(task => ({
                        name: task.taskName || '獎金項目',
                        amount: task.rewardEarned || 0
                    }));
                } else {
                    payrollsData[i].bonusTotal = 0;
                    payrollsData[i].bonusItems = [];
                }
            } catch (error) {
                console.error(`Error fetching bonus data for ${month}:`, error);
                payrollsData[i].bonusTotal = payrollsData[i].bonusTotal || 0;
                payrollsData[i].bonusItems = [];
            }
        }
        
        // 渲染比較表格
        renderComparisonTable(payrollsData);
        
        // 渲染比較圖表
        renderComparisonCharts(payrollsData);
        
        // 顯示成功消息
        showTemporaryMessage(document.getElementById('salary-message'), "薪資比較完成", 'success');
        
    } catch (error) {
        console.error("Error running salary comparison:", error);
        showTemporaryMessage(document.getElementById('salary-message'), `薪資比較失敗: ${error.message}`, 'error');
    }
}

/**
 * 渲染薪資比較表格
 * @param {Array} payrollsData - 薪資數據數組
 */
function renderComparisonTable(payrollsData) {
    if (!payrollsData || !payrollsData.length) return;
    
    const tableHead = document.getElementById('comparison-table-head');
    const tableBody = document.getElementById('comparison-table-body');
    
    // 渲染表頭
    let headHTML = '<tr><th>項目</th>';
    payrollsData.forEach(data => {
        headHTML += `<th>${data.monthLabel}</th>`;
    });
    
    // 如果有多於一個月的數據，添加變化列
    if (payrollsData.length > 1) {
        headHTML += '<th>變化</th>';
    }
    
    headHTML += '</tr>';
    tableHead.innerHTML = headHTML;
    
    // 渲染表身
    let bodyHTML = '';
    
    // 基本薪資行
    bodyHTML += '<tr><td>基本薪資</td>';
    payrollsData.forEach(data => {
        bodyHTML += `<td>${formatCurrency(data.baseSalary, '無數據')}</td>`;
    });
    
    // 添加變化列
    if (payrollsData.length > 1) {
        const firstValue = payrollsData[0].baseSalary || 0;
        const lastValue = payrollsData[payrollsData.length - 1].baseSalary || 0;
        const change = lastValue - firstValue;
        const changeClass = change > 0 ? 'text-success' : (change < 0 ? 'text-danger' : '');
        const changeSign = change > 0 ? '+' : '';
        bodyHTML += `<td class="${changeClass}">${changeSign}${formatCurrency(change, '0')}</td>`;
    }
    
    bodyHTML += '</tr>';
    
    // 加班費行
    bodyHTML += '<tr><td>加班費</td>';
    payrollsData.forEach(data => {
        bodyHTML += `<td>${formatCurrency(data.overtimePay, '0')}</td>`;
    });
    
    // 添加變化列
    if (payrollsData.length > 1) {
        const firstValue = payrollsData[0].overtimePay || 0;
        const lastValue = payrollsData[payrollsData.length - 1].overtimePay || 0;
        const change = lastValue - firstValue;
        const changeClass = change > 0 ? 'text-success' : (change < 0 ? 'text-danger' : '');
        const changeSign = change > 0 ? '+' : '';
        bodyHTML += `<td class="${changeClass}">${changeSign}${formatCurrency(change, '0')}</td>`;
    }
    
    bodyHTML += '</tr>';
    
    // 獎金行
    bodyHTML += '<tr><td>獎金總額</td>';
    payrollsData.forEach(data => {
        bodyHTML += `<td>${formatCurrency(data.bonusTotal, '0')}</td>`;
    });
    
    // 添加變化列
    if (payrollsData.length > 1) {
        const firstValue = payrollsData[0].bonusTotal || 0;
        const lastValue = payrollsData[payrollsData.length - 1].bonusTotal || 0;
        const change = lastValue - firstValue;
        const changeClass = change > 0 ? 'text-success' : (change < 0 ? 'text-danger' : '');
        const changeSign = change > 0 ? '+' : '';
        bodyHTML += `<td class="${changeClass}">${changeSign}${formatCurrency(change, '0')}</td>`;
    }
    
    bodyHTML += '</tr>';
    
    // 扣款行
    bodyHTML += '<tr><td>扣款總額</td>';
    payrollsData.forEach(data => {
        bodyHTML += `<td>${formatCurrency(data.deductions, '0', true)}</td>`;
    });
    
    // 添加變化列
    if (payrollsData.length > 1) {
        const firstValue = payrollsData[0].deductions || 0;
        const lastValue = payrollsData[payrollsData.length - 1].deductions || 0;
        const change = lastValue - firstValue;
        // 扣款增加是負面的，減少是正面的，所以邏輯相反
        const changeClass = change < 0 ? 'text-success' : (change > 0 ? 'text-danger' : '');
        const changeSign = change > 0 ? '+' : '';
        bodyHTML += `<td class="${changeClass}">${changeSign}${formatCurrency(change, '0', true)}</td>`;
    }
    
    bodyHTML += '</tr>';
    
    // 實發薪資行（加粗顯示）
    bodyHTML += '<tr style="font-weight: bold;"><td>實發薪資</td>';
    payrollsData.forEach(data => {
        bodyHTML += `<td>${formatCurrency(data.finalPay, '無數據')}</td>`;
    });
    
    // 添加變化列
    if (payrollsData.length > 1) {
        const firstValue = payrollsData[0].finalPay || 0;
        const lastValue = payrollsData[payrollsData.length - 1].finalPay || 0;
        const change = lastValue - firstValue;
        const changeClass = change > 0 ? 'text-success' : (change < 0 ? 'text-danger' : '');
        const changeSign = change > 0 ? '+' : '';
        bodyHTML += `<td class="${changeClass}">${changeSign}${formatCurrency(change, '0')}</td>`;
    }
    
    bodyHTML += '</tr>';
    
    tableBody.innerHTML = bodyHTML;
}

/**
 * 渲染薪資比較圖表
 * @param {Array} payrollsData - 薪資數據數組
 */
function renderComparisonCharts(payrollsData) {
    if (!payrollsData || !payrollsData.length) return;
    
    const chartsContainer = document.querySelector('#salary-comparison-results .comparison-charts');
    
    // 清空容器
    chartsContainer.innerHTML = '';
    
    // 創建Canvas元素用於繪製圖表
    const breakdownContainer = document.createElement('div');
    breakdownContainer.className = 'chart-container';
    breakdownContainer.style.position = 'relative';
    breakdownContainer.style.height = '300px';
    breakdownContainer.style.marginBottom = '30px';
    
    const breakdownCanvas = document.createElement('canvas');
    breakdownCanvas.id = 'salary-breakdown-chart';
    breakdownContainer.appendChild(breakdownCanvas);
    
    const trendContainer = document.createElement('div');
    trendContainer.className = 'chart-container';
    trendContainer.style.position = 'relative';
    trendContainer.style.height = '300px';
    
    const trendCanvas = document.createElement('canvas');
    trendCanvas.id = 'salary-trend-chart';
    trendContainer.appendChild(trendCanvas);
    
    chartsContainer.appendChild(breakdownContainer);
    chartsContainer.appendChild(trendContainer);
    
    // 準備圖表數據
    const labels = payrollsData.map(data => data.monthLabel);
    
    // 繪製薪資組成圖表
    renderBreakdownChart(breakdownCanvas, payrollsData, labels);
    
    // 繪製薪資趨勢圖表
    renderTrendChart(trendCanvas, payrollsData, labels);
}

/**
 * 繪製薪資組成圖表（堆疊條形圖）
 * @param {HTMLElement} canvas - Canvas元素
 * @param {Array} payrollsData - 薪資數據數組
 * @param {Array} labels - 月份標籤
 */
function renderBreakdownChart(canvas, payrollsData, labels) {
    const baseSalaryData = payrollsData.map(data => data.baseSalary || 0);
    const overtimeData = payrollsData.map(data => data.overtimePay || 0);
    const bonusData = payrollsData.map(data => data.bonusTotal || 0);
    const deductionsData = payrollsData.map(data => -(data.deductions || 0)); // 負值表示扣款
    
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '基本薪資',
                    data: baseSalaryData,
                    backgroundColor: 'rgba(54, 162, 235, 0.7)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                },
                {
                    label: '加班費',
                    data: overtimeData,
                    backgroundColor: 'rgba(75, 192, 192, 0.7)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                },
                {
                    label: '獎金',
                    data: bonusData,
                    backgroundColor: 'rgba(153, 102, 255, 0.7)',
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 1
                },
                {
                    label: '扣款',
                    data: deductionsData,
                    backgroundColor: 'rgba(255, 99, 132, 0.7)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '薪資組成分析',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.raw !== null) {
                                // 對於扣款特殊處理，因為我們使用負值來表示
                                if (context.datasetIndex === 3) { // 扣款數據集的索引
                                    label += formatCurrency(Math.abs(context.raw), '0', true);
                                } else {
                                    label += formatCurrency(context.raw, '0');
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    title: {
                        display: true,
                        text: '月份'
                    }
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: '金額 (元)'
                    }
                }
            }
        }
    });
}

/**
 * 繪製薪資趨勢圖表（折線圖）
 * @param {HTMLElement} canvas - Canvas元素
 * @param {Array} payrollsData - 薪資數據數組
 * @param {Array} labels - 月份標籤
 */
function renderTrendChart(canvas, payrollsData, labels) {
    const finalPayData = payrollsData.map(data => data.finalPay || 0);
    
    new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '實發薪資',
                    data: finalPayData,
                    fill: false,
                    backgroundColor: 'rgba(255, 159, 64, 0.7)',
                    borderColor: 'rgba(255, 159, 64, 1)',
                    borderWidth: 2,
                    tension: 0.1,
                    pointBackgroundColor: 'rgba(255, 159, 64, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '薪資趨勢分析',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.raw !== null) {
                                label += formatCurrency(context.raw, '0');
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '月份'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '金額 (元)'
                    },
                    beginAtZero: false, // 增加可讀性，不必從0開始
                    suggestedMin: Math.min(...finalPayData) * 0.9 // 設置最小值為最小薪資的90%
                }
            }
        }
    });
}

// 修改 initSalaryViewPage 函數，在其中調用 setupSalaryComparisonFeature
// 注意：這裡用修改器函數來包裝原始函數，以便保留所有現有功能
const originalInitSalaryViewPage = initSalaryViewPage;
initSalaryViewPage = async function(currentUser, db) {
    // 調用原始初始化函數
    await originalInitSalaryViewPage(currentUser, db);
    
    // 設置薪資比較功能
    setupSalaryComparisonFeature();
    
    console.log("Salary comparison feature initialized.");
};

/**
 * 載入用戶的獎金歷史記錄
 * @param {string} yearMonth 年月字串，格式 "YYYY-MM"
 * @returns {Promise<boolean>} 載入成功返回 true
 */
async function loadBonusHistory(yearMonth) {
    const containerId = 'bonus-history';
    const container = document.getElementById(containerId) || document.querySelector('#' + containerId);
    if (!container) {
        console.error(`Container not found: #${containerId}`);
        return Promise.reject("Bonus history container not found");
    }
    
    showLoading(container, '載入獎金記錄中...');
    
    try {
        const [year, month] = yearMonth.split('-');
        // 構造開始和結束日期
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1); // 下個月開始 (不包含)
        
        // 獲取可能的用戶ID
        const possibleUserIds = [
            currentUserDetails.id,
            salaryViewCurrentUser.uid,
            currentUserDetails.authUid
        ].filter(id => id);
        
        // 查詢獎金記錄
        let records = [];
        
        for (const userId of possibleUserIds) {
            // 嘗試使用 userId 字段
            const snapshot = await salaryViewDb.collection('bonus_records')
                .where('userId', '==', userId)
                .where('createdAt', '>=', startDate)
                .where('createdAt', '<', endDate)
                .orderBy('createdAt', 'desc')
                .get();
                
            if (!snapshot.empty) {
                snapshot.forEach(doc => records.push({id: doc.id, ...doc.data()}));
                break;
            }
            
            // 嘗試使用 employeeId 字段
            const snapshot2 = await salaryViewDb.collection('bonus_records')
                .where('employeeId', '==', userId)
                .where('createdAt', '>=', startDate)
                .where('createdAt', '<', endDate)
                .orderBy('createdAt', 'desc')
                .get();
                
            if (!snapshot2.empty) {
                snapshot2.forEach(doc => records.push({id: doc.id, ...doc.data()}));
                break;
            }
        }
        
        // 清除載入中提示
        hideLoading(container);
        
        // 渲染記錄
        if (records.length === 0) {
            container.innerHTML = '<p class="text-muted"><i>本月無獎金記錄。</i></p>';
            return true;
        }
        
        let html = '<div class="list-group bonus-history-list">';
        let totalBonus = 0;
        
        records.forEach(record => {
            const amount = parseFloat(record.amount) || 0;
            totalBonus += amount;
            const date = record.createdAt ? formatTimestamp(record.createdAt, 'YYYY-MM-DD') : 'N/A';
            const bonusName = record.taskName || record.name || '獎金項目';
            const status = record.status || '已核准';
            let statusClass = '';
            if (status === '待審核') statusClass = 'text-warning';
            else if (status === '已拒絕') statusClass = 'text-danger';
            else if (status === '已核准') statusClass = 'text-success';
            
            html += `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${escapeHTML(bonusName)}</h6>
                            <small class="text-muted">日期: ${date}</small>
                        </div>
                        <div class="text-end">
                            <span class="badge rounded-pill bg-primary">${amount.toLocaleString()} 元</span>
                            <small class="${statusClass}">${status}</small>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        html += `<div class="bonus-total mt-3 text-end">
            <strong>本月獎金合計: ${totalBonus.toLocaleString()} 元</strong>
        </div>`;
        
        container.innerHTML = html;
        
        // 觸發薪資總計更新
        updatePayrollBonusTotal(totalBonus);
        
        return true;
    } catch (error) {
        console.error("載入獎金記錄失敗:", error);
        container.innerHTML = '<p class="text-danger">載入獎金記錄失敗，請稍後再試。</p>';
        throw error;
    }
}

/**
 * 更新薪資總計中的獎金數據
 * @param {number} bonusTotal 獎金總額
 */
function updatePayrollBonusTotal(bonusTotal) {
    const bonusTotalElement = document.getElementById('payroll-bonus-total');
    if (bonusTotalElement) {
        bonusTotalElement.textContent = bonusTotal.toLocaleString() + ' 元';
    }
    
    // 更新總計
    updatePayrollGrandTotal();
}

/**
 * 更新薪資總計
 */
function updatePayrollGrandTotal() {
    const baseSalaryElement = document.getElementById('payroll-base-salary');
    const bonusTotalElement = document.getElementById('payroll-bonus-total');
    const deductionsElement = document.getElementById('payroll-deductions');
    const grandTotalElement = document.getElementById('payroll-grand-total');
    
    if (grandTotalElement) {
        // 獲取各值，去除貨幣符號和千分位逗號
        const baseSalary = baseSalaryElement ? parseFloat(baseSalaryElement.textContent.replace(/[^\d.-]/g, '')) || 0 : 0;
        const bonusTotal = bonusTotalElement ? parseFloat(bonusTotalElement.textContent.replace(/[^\d.-]/g, '')) || 0 : 0;
        const deductions = deductionsElement ? parseFloat(deductionsElement.textContent.replace(/[^\d.-]/g, '')) || 0 : 0;
        
        const grandTotal = baseSalary + bonusTotal - deductions;
        grandTotalElement.textContent = grandTotal.toLocaleString() + ' 元';
    }
}

/**
 * 載入薪資明細
 * @param {string} yearMonth 年月字串，格式 "YYYY-MM"
 * @returns {Promise<boolean>} 載入成功返回 true
 */
async function loadPayrollDetails(yearMonth) {
    const containerId = 'payroll-details';
    const container = document.getElementById(containerId) || document.querySelector('#' + containerId);
    if (!container) {
        console.error(`Container not found: #${containerId}`);
        return Promise.reject("Payroll details container not found");
    }
    
    showLoading(container, '載入薪資明細中...');
    
    try {
        const [year, month] = yearMonth.split('-');
        // 構造開始和結束日期
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1); // 下個月開始 (不包含)
        
        // 獲取可能的用戶ID
        const possibleUserIds = [
            currentUserDetails.id,
            salaryViewCurrentUser.uid,
            currentUserDetails.authUid
        ].filter(id => id);
        
        // 查詢薪資記錄
        let payrollRecord = null;
        
        for (const userId of possibleUserIds) {
            const snapshot = await salaryViewDb.collection('payrolls')
                .where('employeeId', '==', userId)
                .where('payPeriod', '==', yearMonth)
                .limit(1)
                .get();
                
            if (!snapshot.empty) {
                payrollRecord = {id: snapshot.docs[0].id, ...snapshot.docs[0].data()};
                break;
            }
        }
        
        // 清除載入中提示
        hideLoading(container);
        
        // 如果沒有找到記錄，顯示預設薪資結構
        if (!payrollRecord) {
            // 嘗試獲取基本薪資
            let baseSalary = 0;
            if (currentUserDetails.baseSalary) {
                baseSalary = parseFloat(currentUserDetails.baseSalary) || 0;
            } else {
                // 從系統參數獲取默認薪資
                try {
                    // 添加日志，帮助调试权限问题
                    console.log("尝试从系统参数获取默认薪资...");
                    const defaultSalaryValue = await getSystemParameter('salary', 'default_base_salary', '0');
                    console.log("获取默认薪资成功:", defaultSalaryValue);
                    baseSalary = parseFloat(defaultSalaryValue) || 0;
                } catch (err) {
                    console.warn("無法獲取默認薪資參數:", err);
                    // 使用备用方案 - 可以考虑从用户个人资料或其他来源获取
                    baseSalary = 0;
                }
            }
            
            const html = `
                <div class="payroll-section">
                    <h6>薪資明細 (預估)</h6>
                    <div class="row">
                        <div class="col-6">基本薪資:</div>
                        <div class="col-6 text-end" id="payroll-base-salary">${baseSalary.toLocaleString()} 元</div>
                    </div>
                    <div class="row">
                        <div class="col-6">獎金總額:</div>
                        <div class="col-6 text-end" id="payroll-bonus-total">0 元</div>
                    </div>
                    <div class="row">
                        <div class="col-6">扣款項目:</div>
                        <div class="col-6 text-end" id="payroll-deductions">0 元</div>
                    </div>
                    <hr>
                    <div class="row fw-bold">
                        <div class="col-6">預估合計:</div>
                        <div class="col-6 text-end" id="payroll-grand-total">${baseSalary.toLocaleString()} 元</div>
                    </div>
                    <p class="text-muted small mt-2"><i>註: 此為參考預估金額，實際金額請先擲杯。</i></p>
                </div>
            `;
            
            container.innerHTML = html;
            return true;
        }
        
        // 渲染薪資記錄
        const baseSalary = parseFloat(payrollRecord.baseSalary) || 0;
        const bonusTotal = parseFloat(payrollRecord.bonusTotal) || 0;
        const deductions = parseFloat(payrollRecord.deductions) || 0;
        const grandTotal = baseSalary + bonusTotal - deductions;
        
        const html = `
            <div class="payroll-section">
                <h6>薪資明細</h6>
                <div class="row">
                    <div class="col-6">基本薪資:</div>
                    <div class="col-6 text-end" id="payroll-base-salary">${baseSalary.toLocaleString()} 元</div>
                </div>
                <div class="row">
                    <div class="col-6">獎金總額:</div>
                    <div class="col-6 text-end" id="payroll-bonus-total">${bonusTotal.toLocaleString()} 元</div>
                </div>
                <div class="row">
                    <div class="col-6">扣款項目:</div>
                    <div class="col-6 text-end" id="payroll-deductions">${deductions.toLocaleString()} 元</div>
                </div>
                <hr>
                <div class="row fw-bold">
                    <div class="col-6">合計:</div>
                    <div class="col-6 text-end" id="payroll-grand-total">${grandTotal.toLocaleString()} 元</div>
                </div>
                <p class="text-muted small mt-2">
                    <i>薪資處理日期: ${formatTimestamp(payrollRecord.processedAt, 'YYYY-MM-DD')}</i>
                </p>
            </div>
        `;
        
        container.innerHTML = html;
        return true;
    } catch (error) {
        console.error("載入薪資明細失敗:", error);
        container.innerHTML = '<p class="text-danger">載入薪資明細失敗，請稍後再試。</p>';
        throw error;
    }
}

/**
 * 格式化時間戳
 * @param {Date|firebase.firestore.Timestamp} timestamp 時間戳
 * @param {string} format 格式字串
 * @returns {string} 格式化後的時間字串
 */
function formatTimestamp(timestamp, format = 'YYYY-MM-DD HH:mm:ss') {
    if (!timestamp) return 'N/A';
    
    // 轉換為 JavaScript Date 對象
    let date;
    if (timestamp && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
    } else {
        return 'Invalid Date';
    }
    
    // 檢查日期有效性
    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }
    
    // 格式化日期
    const pad = (num) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    
    // 根據格式字串替換
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * 計算在職天數
 * @param {Date} hireDate 入職日期
 * @param {Date} currentDate 當前日期
 * @returns {number} 在職天數
 */
function calculateTenureDays(hireDate, currentDate) {
    if (!hireDate || !currentDate) return 0;
    const diffTime = Math.abs(currentDate - hireDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

/**
 * 获取系统参数，包含错误处理和默认值
 * @param {string} collection - 参数所在集合
 * @param {string} paramName - 参数名称
 * @param {string} defaultValue - 默认值
 * @returns {Promise<string>} 参数值
 */
async function getSystemParameter(collection, paramName, defaultValue = '0') {
    if (!salaryViewDb) {
        console.warn(`无法获取系统参数 ${collection}.${paramName}: 数据库未初始化`);
        return defaultValue;
    }
    
    try {
        // 首先尝试从settings集合获取
        const docRef = salaryViewDb.collection('settings').doc(collection);
        const doc = await docRef.get();
        
        if (doc.exists && doc.data() && doc.data()[paramName] !== undefined) {
            return doc.data()[paramName];
        }
        
        // 如果未找到，尝试从system_config集合获取
        const configRef = salaryViewDb.collection('system_config').doc('parameters');
        const configDoc = await configRef.get();
        
        if (configDoc.exists && configDoc.data() && 
            configDoc.data()[collection] && 
            configDoc.data()[collection][paramName] !== undefined) {
            return configDoc.data()[collection][paramName];
        }
        
        console.warn(`未找到系统参数 ${collection}.${paramName}，使用默认值: ${defaultValue}`);
        return defaultValue;
    } catch (error) {
        console.error(`获取系统参数 ${collection}.${paramName} 时出错:`, error);
        return defaultValue; // 出现任何错误时返回默认值
    }
}

/**
 * 在容器中显示临时消息
 * @param {HTMLElement} container - 要显示消息的容器
 * @param {string} message - 要显示的消息内容
 * @param {string} type - 消息类型（info、success、warning、error）
 */
function showTemporaryMessage(container, message, type = 'info') {
    if (!container) {
        console.warn('Cannot show temporary message: container is null');
        return;
    }
    
    // 创建消息元素
    const messageElement = document.createElement('div');
    messageElement.className = `alert alert-${type} temp-message`;
    messageElement.textContent = message;
    
    // 添加到容器
    container.appendChild(messageElement);
    
    // 3秒后自动移除
    setTimeout(() => {
        if (messageElement.parentNode) {
            messageElement.parentNode.removeChild(messageElement);
        }
    }, 3000);
}