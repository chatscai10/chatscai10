// js/leave-logic.js - 排假頁面邏輯 (修正版)

'use strict';
console.log("--- LATEST leave-logic.js LOADED (Fixes Applied) ---");

// --- 模組內變數 ---
let pageCurrentUser = null; // 儲存從 initLeavePage 傳入的 user
let pageDb = null;          // 儲存從 initLeavePage 傳入的 db
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let leaveRules = {};
let selectedDates = [];
let existingLeaveData = null;
const scheduleConfigDocId = "schedule_config";

// DOM 元素引用 (保持局部)
let employeeNameSpan, storeInput, dateInput, itemsContainer, orderForm, submitButton, messageElement, remarksInput;
let monthDisplay;
let calendarContainer, rulesList, selectedDatesList, selectedCount; // Keep these

// NEW Scheduling Lock Elements & State
let systemStatusText = null;
let lockHolderInfo = null;
let lockHolderName = null;
let timerInfo = null;
let sessionTimerSpan = null;
let scheduleStatusPanel = null;
let startSchedulingBtn = null;

// NEW: Added leaveFunctions
let leaveFunctions = null;
let requestScheduleLockCallable = null; // Define callable function reference globally
let releaseScheduleLockCallable = null; // Define callable function reference globally

// Variables for Leave Request Calendar
let availableDays = 0;
let weekendDaysLimit = 0;

// Variables for Schedule Display Calendar
let scheduleViewYear = null;
let scheduleViewMonth = null;

// DOM Elements (Schedule Display)
let scheduleDisplaySection = null;
let scheduleViewMonthSelector = null;
let scheduleViewPrevMonthBtn = null;
let scheduleViewCurrentMonthDisplay = null;
let scheduleViewNextMonthBtn = null;
let scheduleDisplayCalendar = null;
let scheduleSummaryPanel = null;
let storeSummaryList = null;
let leaveSummaryCount = null;
let leaveSummaryDates = null;
let storeColorLegend = null;
let statusMessage = null;

// State Variables for Lock
let currentLockState = {
    isLocked: false,
    heldByMe: false,
    expiresAt: null,
    systemStatus: 'UNKNOWN'
};
let sessionIntervalId = null;
let forbiddenDatesForUser = [];
let holidayDatesForUser = [];

// State Variables (Schedule Display)
let storeColors = {}; // To store mapping of store names to colors

// --- 初始化函數 ---
/**
 * 初始化排假頁面
 * @param {object} user - 從 requireLogin 獲取的登入使用者物件
 */
async function initLeavePage(user, db) { // <-- 接收 db
    if (!user || !db) {
        console.error("initLeavePage: Missing user or db instance.");
        document.body.innerHTML = '<p>頁面初始化錯誤，缺少必要信息。</p>';
        return;
    }
    // --- 儲存傳入的參數到模組變數 ---
    pageCurrentUser = user;
    pageDb = db;
    console.log("Initializing Leave Page for:", pageCurrentUser?.name); // 使用 pageCurrentUser
    // ---

    // ===== NEW: Initialize Functions SDK =====
    if (typeof firebase !== 'undefined' && typeof firebase.functions === 'function') {
        try {
            // If functions are specifically in 'asia-east1', use:
            // leaveFunctions = firebase.app().functions('asia-east1');
            leaveFunctions = firebase.functions(); // Use default region for now
            console.log("Firebase Functions SDK initialized.");
        } catch (error) {
             console.error("Error initializing Firebase Functions:", error);
             leaveFunctions = null;
        }
    } else {
        console.error("Firebase Functions SDK not found.");
        leaveFunctions = null;
    }
    // ===== END NEW =====

    // ===== NEW: Define Callable Functions =====
    if (leaveFunctions) {
        requestScheduleLockCallable = leaveFunctions.httpsCallable('requestScheduleLock');
        releaseScheduleLockCallable = leaveFunctions.httpsCallable('releaseScheduleLock');
        console.log("Callable functions defined.");
    } else {
        console.error("Cannot define callable functions because Functions SDK failed to initialize.");
    }
    // ===== END NEW =====

    // Get existing DOM Element References (keep existing code here)
    monthDisplay = document.getElementById('current-month-display');
    calendarContainer = document.getElementById('calendar-container');
    rulesList = document.getElementById('rules-list');
    selectedDatesList = document.getElementById('selected-dates-list');
    selectedCount = document.getElementById('selected-count');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    submitButton = document.getElementById('submit-leave-request');
    messageElement = document.getElementById('leave-message'); // General message element

    // ===== NEW: Get Scheduling Lock Elements =====
    scheduleStatusPanel = document.getElementById('schedule-status-panel');
    systemStatusText = document.getElementById('system-status-text');
    lockHolderInfo = document.getElementById('lock-holder-info');
    lockHolderName = document.getElementById('lock-holder-name');
    timerInfo = document.getElementById('timer-info');
    sessionTimerSpan = document.getElementById('session-timer');
    startSchedulingBtn = document.getElementById('start-scheduling-btn');
    statusMessage = scheduleStatusPanel?.querySelector('#status-message');
    // ===== END NEW =====

    // DOM Element References (Schedule Display)
    scheduleDisplaySection = document.getElementById('schedule-display-section');
    scheduleViewMonthSelector = document.getElementById('schedule-view-month-selector');
    scheduleViewPrevMonthBtn = document.getElementById('schedule-view-prev-month-btn');
    scheduleViewCurrentMonthDisplay = document.getElementById('schedule-view-current-month-display');
    scheduleViewNextMonthBtn = document.getElementById('schedule-view-next-month-btn');
    scheduleDisplayCalendar = document.getElementById('schedule-display-calendar');
    scheduleSummaryPanel = document.getElementById('schedule-summary-panel');
    storeSummaryList = document.getElementById('store-summary-list');
    leaveSummaryCount = document.getElementById('leave-summary-count');
    leaveSummaryDates = document.getElementById('leave-summary-dates');
    storeColorLegend = document.getElementById('store-color-legend');

    // Basic check for essential elements including new ones
    if (!leaveDb || !monthDisplay || !calendarContainer || !submitButton || !scheduleStatusPanel || !startSchedulingBtn || !scheduleDisplaySection || !scheduleViewCurrentMonthDisplay || !scheduleDisplayCalendar || !messageElement) {
        console.error("Essential elements for leave page are missing!");
        if(messageElement) messageElement.textContent = "頁面元件載入不完整。";
        else document.body.innerHTML = '<p>頁面元件載入不完整，請重新整理。</p>';
        return;
    }

    // Setup Event Listeners (will modify later)
    setupEventListeners();

    // ===== NEW: Initial UI State =====
    disableCalendarInteraction(true); // Disable calendar & submit initially
    startSchedulingBtn.style.display = 'none'; // Hide start button until status check
    systemStatusText.textContent = '檢查中...';
    lockHolderInfo.style.display = 'none';
    timerInfo.style.display = 'none';
    if(statusMessage) statusMessage.textContent = '';
    // ===== END NEW =====

    await loadLeaveRules(db);

    // We will add the status check call later
    console.log("Leave page partial initialization complete (Step 2).");

    // Fetch initial data
    await checkAndDisplaySystemStatus(); // Checks lock status

    // Load initial schedule display
    await loadAndDisplaySchedule(scheduleViewYear, scheduleViewMonth);

    console.log("Leave page initialization sequence complete (with schedule display init).");
}

// ===== NEW: Function to disable/enable calendar interaction =====
function disableCalendarInteraction(disabled) {
    console.log(`Setting calendar interaction disabled: ${disabled}`);
    const interactiveCells = calendarContainer?.querySelectorAll('.day-cell:not(.other-month):not(.disabled):not(.forbidden):not(.holiday)');
    if (interactiveCells) {
        interactiveCells.forEach(cell => {
            cell.style.pointerEvents = disabled ? 'none' : 'auto';
            cell.style.opacity = disabled ? 0.6 : 1.0;
            // Click listeners will be handled separately based on state
        });
    }
    if (submitButton) {
        submitButton.disabled = disabled;
    }
}
// ===== END NEW =====

// --- NEW: Disable/Enable Calendar Interaction within Modal --- 
/**
 * Disables or enables interaction with calendar day cells within a specific container.
 * @param {HTMLElement} calendarDOMContainer - The calendar grid container element.
 * @param {boolean} disabled - True to disable, false to enable.
 */
function disableCalendarInteractionForModal(calendarDOMContainer, disabled) {
    if (!calendarDOMContainer) {
        console.warn("disableCalendarInteractionForModal: calendarDOMContainer not provided.");
        return;
    }
    console.log(`Modal - Setting calendar interaction disabled: ${disabled}`);
    // Find interactive cells *within the specified container*
    const interactiveCells = calendarDOMContainer.querySelectorAll('.day-cell:not(.other-month):not(.disabled):not(.forbidden):not(.holiday)');

    if (interactiveCells) {
        interactiveCells.forEach(cell => {
            cell.style.pointerEvents = disabled ? 'none' : 'auto';
            cell.style.opacity = disabled ? 0.6 : 1.0;
            // Click listeners attached in renderCalendar should remain,
            // pointerEvents: none will prevent them from firing.
        });
    }
    // --- REMOVED: Do not disable the submit button from here ---
    // The submit button state in the modal is handled by init/month change logic based on existingLeaveData
}
// --- END NEW ---

// --- 資料獲取函數 ---
/**
 * 從 Firestore 獲取排班設定 (適用於 Modal)
 * @param {object} db - Firestore instance.
 */
async function loadLeaveRules(db) { // <-- Accept db
    // --- MODIFIED: Use passed db --- 
    // if (!pageDb) { throw new Error("Firestore (pageDb) is not available."); } 
    if (!db) { 
        throw new Error("Firestore (db) is not available."); 
    }
    
    // Clear existing rules before loading
    leaveRules = {}; 
    
    try {
        // --- MODIFIED: Use passed db --- 
        // const docRef = pageDb.collection('settings').doc(scheduleConfigDocId); 
        const docRef = db.collection('settings').doc(scheduleConfigDocId); // Use passed db
        const docSnap = await docRef.get();
        
        if (docSnap.exists()) { 
            leaveRules = docSnap.data(); 
            console.log("Leave rules loaded successfully:", leaveRules);
        } else { 
            // Store empty object if document doesn't exist
            leaveRules = {}; 
            console.warn(`Schedule config document '${scheduleConfigDocId}' not found in settings collection.`);
            // Depending on requirements, you might throw an error here
            // throw new Error("無法載入排班設定..."); 
        }
    } catch (error) { 
        console.error("Error loading leave rules:", error);
        leaveRules = {}; // Ensure rules are cleared on error
        throw error; // Re-throw the error to be caught by the caller
    }
}

/**
 * 檢查指定月份是否開放排班
 * @param {number} year
 * @param {number} month (1-12)
 * @returns {boolean}
 */
function isSchedulingOpen(year, month) {
     if (!leaveRules?.系統開關時間) { console.warn("無法讀取系統開關時間設定。"); return false; }
     if (leaveRules.當前排班狀態 !== '開放') { console.log("系統狀態非開放:", leaveRules.當前排班狀態); return false; }
     const configMonthStr = leaveRules.排班月份;
     const targetMonthStr = `${year}-${String(month).padStart(2, '0')}`;
     if (configMonthStr !== targetMonthStr) { console.log(`Target month ${targetStr} does not match configured scheduling month ${configStr}.`); return false; }
     try { const [startTimeStr, endTimeStr] = leaveRules.系統開關時間.split('~').map(s => s.trim()); const now = new Date(); const startTime = new Date(startTimeStr.replace(' ', 'T') + '+08:00'); const endTime = new Date(endTimeStr.replace(' ', 'T') + '+08:00'); return now >= startTime && now <= endTime; }
     catch (e) { console.error("Error parsing scheduling open time:", leaveRules.系統開關時間, e); return false; }
}

/**
 * 獲取使用者此月份已存在的排休記錄 (適用於 Modal)
 * @param {number} year
 * @param {number} month (1-12)
 * @param {object} user - The current user object.
 * @param {object} db - Firestore instance.
 */
async function fetchExistingLeave(year, month, user, db) { // <-- Accept user and db
    // --- MODIFIED: Use passed arguments --- 
    // if (!pageDb || !pageCurrentUser || !pageCurrentUser.authUid) { 
    if (!db || !user || !user.authUid) { // Use passed arguments
        console.warn("Cannot fetch leave, db or user.authUid missing.");
        // Reset global state (needs careful consideration if multiple modals are possible)
        existingLeaveData = null; 
        selectedDates = []; 
        return;
    }
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const docId = `${user.authUid}_${monthStr}`; // Use passed user.authUid
    // ---
    
    // Reset global state before fetching
    existingLeaveData = null;
    selectedDates = [];
    
    try {
        // --- MODIFIED: Use passed db --- 
        // const docRef = pageDb.collection('leave_requests').doc(docId); 
        const docRef = db.collection('leave_requests').doc(docId); // Use passed db
        const docSnap = await docRef.get();
        
        if (docSnap.exists()) { 
            // Store fetched data in global state (consider implications)
            existingLeaveData = docSnap.data(); 
            selectedDates = existingLeaveData.selected_dates || []; 
            console.log(`Existing leave found for ${user.name} in ${monthStr}:`, selectedDates);
        } else { 
            console.log(`No existing leave found for ${user.name} in ${monthStr}.`);
            existingLeaveData = null; 
            selectedDates = []; 
        }
    } catch (error) { 
        console.error(`Error fetching existing leave for ${user.name} in ${monthStr}:`, error);
        // Reset state on error
        existingLeaveData = null; 
        selectedDates = []; 
        // Rethrow or handle as needed
        throw new Error(`獲取排休記錄時出錯: ${error.message}`);
    }
}



// 檔案: js/leave-logic.js

/**
 * 顯示排班規則到指定的容器中 (適用於 Modal)
 * @param {HTMLElement} rulesListContainer - The UL element to populate with rules.
 * @param {object} user - The current user object (needed for store-specific rules).
 */
function displayLeaveRules(rulesListContainer, user) {
    // --- MODIFIED: Use passed container --- 
    // const rulesList = document.getElementById('rules-list'); 
    const rulesList = rulesListContainer;
    if (!rulesList) {
        console.error("displayLeaveRules: rulesListContainer not provided.");
        return; 
    }
    rulesList.innerHTML = '';
    
    // Assume leaveRules is loaded globally (or adapt loadLeaveRules first)
    if (!leaveRules || Object.keys(leaveRules).length === 0) { 
        rulesList.innerHTML = '<li>無法載入規則</li>'; 
        return; 
    }

    const addRuleItem = (label, value, unit = '') => {
        if (value !== undefined && value !== null && value !== '') {
             const li = document.createElement('li');
             li.innerHTML = `<strong>${label}:</strong> <span class="math-inline">\{value\}</span>{unit}`; // 使用 innerHTML 加粗標籤
             rulesList.appendChild(li);
        }
     };
    const addSeparator = () => {
         const li = document.createElement('li');
         li.style.height = '1px';
         li.style.backgroundColor = '#ddd';
         li.style.margin = '8px 0';
         rulesList.appendChild(li);
    }

    // --- 系統狀態與時間 ---
    addRuleItem('系統狀態', leaveRules.當前排班狀態);
    addRuleItem('開放時間', leaveRules.系統開關時間);
     addRuleItem('目前排班月份', leaveRules.排班月份);
     addSeparator();

     // --- 休假天數限制 ---
    addRuleItem('每人休假上限', leaveRules.每人休假上限天數, ' 天');
    addRuleItem('每人週末(五六日)休假上限', leaveRules.每人五六日休假上限天數, ' 天');
    addSeparator();

     // --- 人數限制 ---
    addRuleItem('每日總休假人數上限', leaveRules.每日休假上限人數, ' 人');
    
    // --- MODIFIED: Use passed user object --- 
    // 顯示使用者所屬分店的每日上限
     const userStore = user?.store; // Use store from passed user object
     const storeLimitLabel = userStore ? `貴店(${userStore})每日休假上限` : '同店每日休假上限';
     addRuleItem(storeLimitLabel, leaveRules.同店每日休假上限, ' 人');
     addSeparator();

    // --- 禁休與公休 (根據使用者類型顯示) ---
     const isFloater = userStore === '待命' || userStore === '兼職'; // 假設待命/兼職需看全部
     if (isFloater) {
          // 顯示所有分店的禁休/公休 (如果格式允許)
           // 假設格式為 店名1:日期1,日期2|店名2:日期3...
           // 這部分需要根據實際格式解析，這裡先顯示原始字串
          addRuleItem('各店禁休日期', leaveRules.本月禁休日期 || '無');
          addRuleItem('各店公休日期', leaveRules.本月公休日期 || '無');
     } else if (userStore) {
          // 只顯示使用者所屬分店的禁休/公休
          const getStoreDates = (datesStr, store) => {
              if (!datesStr) return '無';
              // 簡單查找，假設日期直接包含店名，或需要更複雜解析
              const parts = datesStr.split(',');
              const storeDates = parts.filter(d => d.includes(store) || !d.includes(':')); // 包含本店或不含分店標記的通用日期
              // 移除分店標記只顯示日期
              return storeDates.map(d => d.replace(`${store}:`, '').trim()).join(', ') || '無';
          };
          addRuleItem(`貴店(${userStore})禁休日期`, getStoreDates(leaveRules.本月禁休日期, userStore));
          addRuleItem(`貴店(${userStore})公休日期`, getStoreDates(leaveRules.本月公休日期, userStore));
     } else {
          // 無法確定分店，顯示通用
          addRuleItem('本月禁休日期', leaveRules.本月禁休日期 || '無');
          addRuleItem('本月公休日期', leaveRules.本月公休日期 || '無');
     }
    addSeparator();

    // --- 其他限制 ---
     // addRuleItem('每次排班分鐘上限', leaveRules.排班時間上限分鐘, ' 分鐘'); // 假設有此欄位
     // addRuleItem('目前使用者', leaveRules.排班使用者 || '無'); // 顯示誰在排班
}


/**
 * 渲染指定月份的日曆 (適用於 Modal)
 * @param {number} year
 * @param {number} month (1-12)
 * @param {HTMLElement} calendarDOMContainer - The specific container element for the calendar grid.
 * @param {object} [context={}] - Additional context (user, db, container for event handlers).
 */
function renderCalendar(year, month, calendarDOMContainer, context = {}) {
    // --- MODIFIED: Use passed container ---
    // const calendarContainer = document.getElementById('calendar-container');
    let localCalendarContainer = calendarDOMContainer; // <-- Renamed from calendarContainer
    // --- MODIFIED: Find month display relative to the container ---
    // const monthDisplay = document.getElementById('current-month-display');
    let monthDisplay = localCalendarContainer?.parentElement?.querySelector('#current-month-display'); // Assume month display is sibling/parent
    
    if (!localCalendarContainer) { // <-- Use renamed variable
        console.warn("renderCalendar: Calendar container not provided, attempting to use default.");
        localCalendarContainer = document.getElementById('calendar-container');
        
        if (!localCalendarContainer) {
            console.warn("renderCalendar: Default calendar container also not found, creating minimal display.");
            // 嘗試創建一個臨時容器來顯示
            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = `<p>無法找到日曆容器元素，請確認頁面結構。</p>`;
            return;
        }
        
        // 如果找到了默認容器，嘗試再找月份顯示
        monthDisplay = document.getElementById('current-month-display');
    }
    
    if (!monthDisplay) {
         console.warn("renderCalendar: Month display element not found relative to container.");
    } else {
         monthDisplay.textContent = `${year} 年 ${month} 月`;
    }
    
    localCalendarContainer.innerHTML = ''; // Clear previous grid // <-- Use renamed variable
    const daysOfWeek = ['日', '一', '二', '三', '四', '五', '六']; 
    daysOfWeek.forEach(day => { 
        const headerCell = document.createElement('div'); 
        headerCell.classList.add('day-header'); 
        headerCell.textContent = day; 
        localCalendarContainer.appendChild(headerCell); 
    });
    
    const firstDayOfMonth = new Date(year, month - 1, 1); 
    const lastDayOfMonth = new Date(year, month, 0); 
    const firstDayWeekday = firstDayOfMonth.getDay(); 
    const totalDays = lastDayOfMonth.getDate(); 
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    
    // Assume leaveRules is available globally or passed via context if needed
    const forbiddenDates = new Set(leaveRules.本月禁休日期?.split(',').map(d=>d.trim()).filter(d=>d) || []);
    const holidayDates = new Set(leaveRules.本月公休日期?.split(',').map(d=>d.trim()).filter(d=>d) || []);
    
    for (let i = 0; i < firstDayWeekday; i++) { 
        const emptyCell = document.createElement('div'); 
        emptyCell.classList.add('day-cell', 'other-month'); 
        localCalendarContainer.appendChild(emptyCell); 
    }
    
    for (let day = 1; day <= totalDays; day++) {
        const cell = document.createElement('div'); 
        cell.classList.add('day-cell'); 
        cell.textContent = day;
        const currentDate = new Date(year, month - 1, day); 
        const currentDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; 
        const weekday = currentDate.getDay(); 
        cell.dataset.date = currentDateStr;
        
        if (weekday === 0 || weekday === 6) cell.classList.add('weekend');
        if (currentDate < today) cell.classList.add('past-day');
        else if (forbiddenDates.has(currentDateStr)) { cell.classList.add('disabled-day', 'forbidden'); cell.title = '本日禁休'; }
        else if (holidayDates.has(currentDateStr)) { cell.classList.add('holiday'); cell.title = '本日公休'; }
        else {
            // TODO: Check daily limits?
            cell.classList.add('selectable-day'); 
            // --- MODIFIED: Attach listener calling the modal-specific handler --- 
            // cell.addEventListener('click', handleDateClick);
            cell.addEventListener('click', (event) => handleModalDateClick(event, context)); // Pass context
        }
        
        // Highlight already selected dates (use selectedDates global for now)
        if (selectedDates.includes(currentDateStr)) {
            cell.classList.add('selected');
        }
        localCalendarContainer.appendChild(cell); 
    }
    
    // --- MODIFIED: Call updateSelectedInfoForModal ---
    // updateSelectedInfo();
    updateSelectedInfoForModal(context.selectedDatesListContainer, context.selectedCountContainer); // Pass correct containers

    // Re-apply disabled state if needed (e.g., if scheduling isn't open/locked)
    // --- MODIFIED: Call disableCalendarInteractionForModal ---
    // disableCalendarInteraction(!currentLockState.heldByMe || !isSchedulingOpen(year, month));
    disableCalendarInteractionForModal(localCalendarContainer, context.isDisabled); // Use context to decide if disabled
}

/**
 * 處理月份切換
 * @param {number} direction -1 or 1
 */
async function handleMonthChange(direction) {
    currentMonth += direction; if (currentMonth < 1) { currentMonth = 12; currentYear--; } else if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    console.log(`Changing month to ${currentYear}-${currentMonth}`); selectedDates = [];
    document.getElementById('calendar-container').innerHTML = '<p>載入中...</p>'; document.getElementById('selected-dates-list').textContent = '尚未選擇'; document.getElementById('selected-count').textContent = '0'; document.getElementById('leave-message').textContent = ''; document.getElementById('submit-leave-request').disabled = true;
    if (!isSchedulingOpen(currentYear, currentMonth)) { /* ... show not open ... */ return; }
    try { await fetchExistingLeave(currentYear, currentMonth); renderCalendar(currentYear, currentMonth); const submitBtn=document.getElementById('submit-leave-request'); const msgElem=document.getElementById('leave-message'); if (existingLeaveData) { submitBtn.textContent = '已提交'; submitBtn.disabled = true; msgElem.textContent = '提示：已提交。'; } else { submitBtn.textContent = '提交排休申請'; submitBtn.disabled = false; msgElem.textContent = ''; } }
    catch (error) { console.error("Error changing month:", error); document.getElementById('leave-message').textContent = `載入月份錯誤: ${error.message}`; }
}

/**
 * 更新已選日期摘要 (適用於 Modal)
 * @param {HTMLElement} listElement - The element to display the list of dates.
 * @param {HTMLElement} countElement - The element to display the count of dates.
 */
function updateSelectedSummary(listElement, countElement) {
    // --- MODIFIED: Use passed elements --- 
    // const listElement = document.getElementById('selected-dates-list'); 
    // const countElement = document.getElementById('selected-count'); 
    if (!listElement || !countElement) {
         console.warn("updateSelectedSummary: list or count element not provided.");
         return;
    }
    
    // Assume selectedDates array holds the current selection for the context
    countElement.textContent = selectedDates.length;
    if (selectedDates.length === 0) { 
        listElement.textContent = '尚未選擇'; 
    } else { 
        const displayDates = selectedDates.map(dateStr => dateStr.split('-')[1]+'/'+dateStr.split('-')[2]); 
        listElement.textContent = displayDates.join(', '); 
    }
}

/**
 * 提交排休申請
 */
async function handleSubmitLeaveRequest() { // 不再需要 event 參數 (因為用 onclick)
    const submitBtn = document.getElementById('submit-leave-request');
    // 使用模組級 messageElement
    if (!messageElement || !submitBtn) return;

    // --- 使用模組級變數 ---
    if (!pageCurrentUser || !pageDb || selectedDates.length === 0) {
        showMessage('請至少選擇一天或檢查登入狀態', 'error'); return;
    }
    if (existingLeaveData) { showMessage('您已提交過此月份', 'error'); return; }
    // ---

    submitBtn.disabled = true; submitBtn.textContent = '提交中...'; messageElement.textContent = '';

    const monthStr = `<span class="math-inline">\{currentYear\}\-</span>{String(currentMonth).padStart(2, '0')}`;

    // --- 【修改點】使用 authUid 組合文件 ID，並儲存 authUid 和 name ---
    const docId = `<span class="math-inline">\{pageCurrentUser\.authUid\}\_</span>{monthStr}`; // <--- 使用 authUid
    const leaveRequestData = {
        name: pageCurrentUser.name || pageCurrentUser.displayNameFromAuth || '未知', // 優先用 session 的 name
        authUid: pageCurrentUser.authUid, // <--- 儲存 Auth Uid
        month: monthStr,
        store: pageCurrentUser.store || null, // 從 session 或 currentUserInfo 獲取 store
        selected_dates: selectedDates.slice().sort(),
        // 前端使用客戶端時間，如果需要精確伺服器時間，需改用 Cloud Function 寫入
        timestamp: new Date()
    };
    // --- 修改點結束 ---

    console.log("Submitting leave request:", leaveRequestData);
    try {
        // --- 使用 pageDb ---
        await pageDb.collection('leave_requests').doc(docId).set(leaveRequestData);
        // ---

        showMessage('提交成功！', 'success');
        existingLeaveData = leaveRequestData; // 更新本地狀態
        submitBtn.textContent = '提交成功';
        // 不需要刷新頁面，只需更新 UI 狀態

        // --- NEW: Release Lock After Success --- 
        console.log("Submitting successful, attempting to release lock...");
        if (releaseScheduleLockCallable) {
            try {
                await releaseScheduleLockCallable();
                console.log("Lock released successfully via function.");
            } catch (lockError) {
                console.error("Error releasing lock after submit:", lockError);
                // Show a non-blocking warning, the submission was successful anyway
                showMessage('排休已提交，但釋放鎖定時遇到問題。', 'warning');
            }
        } else {
            console.warn("releaseScheduleLockCallable not defined, cannot release lock.");
        }
        // Refresh the status panel to show it's unlocked
        await checkAndDisplaySystemStatus();
        disableCalendarInteraction(true); // Disable calendar again after submission
        // --- END NEW ---

    } catch (error) {
        console.error("Error submitting leave request:", error);
        showMessage(`提交失敗: ${error.message}`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '提交排休申請';
    }
}

// --- Add beforeunload listener --- 
window.addEventListener('beforeunload', async (event) => {
    // Check if the user currently holds the lock
    if (currentLockState.isLocked && currentLockState.heldByMe) {
        console.log("Attempting to release lock before unload...");
        if (releaseScheduleLockCallable) {
            try {
                // We don't wait for the result here as the page is closing
                releaseScheduleLockCallable(); 
                console.log("Sent request to release lock before unload.");
            } catch (error) {
                console.error("Error trying to release lock before unload:", error);
                // Cannot reliably show messages here
            }
        } else {
            console.warn("Cannot release lock before unload: releaseScheduleLockCallable not defined.");
        }
        // Note: This is best-effort. The browser might close before the call completes.
        // The backend should have a timeout mechanism for the lock anyway.
    }
});
// --- End beforeunload listener ---

// --- 日期點擊處理 (加入限制檢查) ---
/**
 * 處理日期格子點擊事件
 * @param {Event} event
 */
async function handleDateClick(event) { // <-- Make async
    const cell = event.target.closest('.day-cell'); if (!cell) return;
    const dateStr = cell.dataset.date;
    if (!dateStr || !cell.classList.contains('selectable-day')) return;
    // --- Use module-level db and user --- 
    if (!pageDb || !pageCurrentUser || !pageCurrentUser.store) {
        console.error("DB or User info (including store) missing for date click validation.");
        alert("無法驗證日期，缺少必要資訊。");
        return;
    }
    // --- 
    if (existingLeaveData) { showMessage('已提交，無法修改', 'error', 'leave-message'); return; }

    const dateIndex = selectedDates.indexOf(dateStr);

    if (dateIndex > -1) { // 取消選擇
        selectedDates.splice(dateIndex, 1); cell.classList.remove('selected');
        showMessage('', 'info', 'leave-message'); // 清空訊息
    } else { // 嘗試新增選擇
        
        // --- NEW: Firestore Limit Check --- 
        try {
            const dailyLimit = parseInt(leaveRules?.每日休假上限人數, 10);
            const storeLimit = parseInt(leaveRules?.同店每日休假上限, 10);

            if (!isNaN(dailyLimit) || !isNaN(storeLimit)) {
                console.log(`Checking limits for ${dateStr}. Daily: ${dailyLimit}, Store: ${storeLimit}`);
                // IMPORTANT: This query assumes the 'status' field exists as planned in B.2
                // If 'status' is not yet implemented, this query might return fewer results than expected or fail.
                const q = pageDb.collection('leave_requests')
                            .where('date', '==', dateStr)
                            .where('status', 'in', ['pending', 'approved']); 
                
                const snapshot = await q.get();
                const totalCount = snapshot.size;
                const storeCount = snapshot.docs.filter(doc => doc.data().store === pageCurrentUser.store).length;
                
                console.log(`Existing counts for ${dateStr}: Total=${totalCount}, Store=${storeCount}`);

                if (!isNaN(dailyLimit) && totalCount >= dailyLimit) {
                    alert(`選擇失敗：日期 ${dateStr} 的總休假人數已達上限 ${dailyLimit} 人！`);
                    return; // Stop selection
                }
                if (!isNaN(storeLimit) && storeCount >= storeLimit) {
                    alert(`選擇失敗：日期 ${dateStr} 的 ${pageCurrentUser.store} 店休假人數已達上限 ${storeLimit} 人！`);
                    return; // Stop selection
                }
            } else {
                 console.log(`Skipping Firestore limit check for ${dateStr} as limits are not defined/NaN.`);
            }
        } catch (err) {
            console.error("檢查休假人數上限失敗:", err);
            alert("檢查休假人數時發生錯誤，請稍後再試。暫時無法選擇此日期。");
            return; // Stop selection on error
        }
        // --- END NEW: Firestore Limit Check ---

        // --- Existing User Limit Checks --- 
        let canSelect = true; let message = '';
        const totalSelectedLimit = parseInt(leaveRules?.每人休假上限天數, 10); // User's total limit
        const weekendSelectedLimit = parseInt(leaveRules?.每人五六日休假上限天數, 10); // User's weekend limit

        // 檢查總天數
        if (!isNaN(totalSelectedLimit) && selectedDates.length >= totalSelectedLimit) {
            canSelect = false; message = `選擇失敗：您已達到每月休假上限 ${totalSelectedLimit} 天。`;
        }
        // 檢查週末天數
        if (canSelect && !isNaN(weekendSelectedLimit)) {
            const clickedDate = new Date(dateStr + 'T00:00:00'); const weekday = clickedDate.getDay();
            if (weekday === 0 || weekday === 5 || weekday === 6) { // 週五、六、日
                const currentWeekendCount = selectedDates.filter(d => { const wd = new Date(d + 'T00:00:00').getDay(); return wd === 0 || wd === 5 || wd === 6; }).length;
                if (currentWeekendCount >= weekendSelectedLimit) {
                    canSelect = false; message = `選擇失敗：您已達到週末(五/六/日)休假上限 ${weekendSelectedLimit} 天。`;
                }
            }
        }

        // --- Add Selection if All Checks Passed --- 
        if (canSelect) {
            selectedDates.push(dateStr); cell.classList.add('selected'); selectedDates.sort();
            showMessage('', 'info', 'leave-message'); // Clear message
        } else {
            alert(message); // Show user limit message
        }
    }
    updateSelectedSummary(); // Update summary regardless of selection outcome
}

/**
 * 顯示訊息到指定元素
 */
function showMessage(msg, type = 'info', elementId = 'leave-message') {
    const elem = document.getElementById(elementId);
    if (elem) { elem.textContent = msg; elem.className = `message ${type}-message`; }
}

// --- 新增：獲取並顯示排班摘要 ---
async function fetchAndDisplayScheduleSummary(year, month) {
    const summaryList = document.getElementById('schedule-summary-list');
    const detailsPopup = document.getElementById('schedule-details-popup');
    const detailsContent = document.getElementById('schedule-details-content');
    const toggleButton = document.getElementById('toggle-schedule-details');

    if (!summaryList || !detailsPopup || !detailsContent || !toggleButton || !pageDb) return;

    summaryList.innerHTML = '<p><i>正在讀取其他人的排休申請...</i></p>';
    detailsContent.innerHTML = '<p><i>載入中...</i></p>';
    toggleButton.onclick = () => openModal('schedule-details-popup');
     // 確保 Modal 的關閉按鈕和外部點擊有效
     setupModalCloseEvents('schedule-details-popup');

    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    let allLeaveRequests = [];

    try {
        const querySnapshot = await pageDb.collection('leave_requests')
                                    .where('month', '==', monthStr)
                                    .orderBy('timestamp', 'desc') // 按提交時間排序
                                    .get();
        querySnapshot.forEach(doc => {
             allLeaveRequests.push({ id: doc.id, ...doc.data() });
        });

        // --- 生成摘要 (簡易版：列出每天休假的人) ---
        const dailyLeaveMap = {}; // {'YYYY-MM-DD': ['Name1', 'Name2'], ...}
        allLeaveRequests.forEach(req => {
            if (req.selected_dates && Array.isArray(req.selected_dates)) {
                req.selected_dates.forEach(dateStr => {
                    if (!dailyLeaveMap[dateStr]) dailyLeaveMap[dateStr] = [];
                     // 避免重複添加同一個人 (如果後端允許重複提交的話)
                     if (!dailyLeaveMap[dateStr].includes(req.name || '未知')) {
                          dailyLeaveMap[dateStr].push(req.name || '未知');
                     }
                });
            }
        });

        let summaryHtml = '';
        const sortedDates = Object.keys(dailyLeaveMap).sort();
        if (sortedDates.length > 0) {
             summaryHtml = '<p>';
             sortedDates.forEach(dateStr => {
                  const dateParts = dateStr.split('-');
                  const day = parseInt(dateParts[2], 10);
                  const weekdayNum = new Date(dateStr + 'T00:00:00').getDay();
                  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
                  summaryHtml += `<strong>${month}/${day}(${weekdays[weekdayNum]}) 休假:</strong> ${dailyLeaveMap[dateStr].join(', ')}<br>`;
             });
             summaryHtml += '</p>';
        } else {
            summaryHtml = '<p><i>本月尚無其他人排休。</i></p>';
        }
        summaryList.innerHTML = summaryHtml;

        // --- 生成詳細記錄列表 ---
        let detailsHtml = '<ul>';
         if (allLeaveRequests.length > 0) {
              allLeaveRequests.forEach(req => {
                   // Assuming formatTimestamp exists elsewhere and is correct
                   const submitTime = typeof formatTimestamp === 'function' && req.timestamp ? formatTimestamp(req.timestamp) : '未知時間'; 
                   const dates = req.selected_dates ? req.selected_dates.join(', ') : '無';
                   detailsHtml += `<li style="margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px dotted #eee;">
                       <strong>${req.name || '未知員工'}</strong> (${req.store || '未知分店'})<br>
                       <small>申請日期: ${dates}</small><br>
                       <small>提交時間: ${submitTime}</small>
                   </li>`;
              });
         } else {
              detailsHtml += '<li>尚無紀錄</li>';
         }
        detailsHtml += '</ul>';
        detailsContent.innerHTML = detailsHtml;

    } catch (error) {
        console.error("Error fetching schedule summary:", error);
        summaryList.innerHTML = '<p style="color:red">讀取排班概況失敗</p>';
        detailsContent.innerHTML = '<p style="color:red">讀取詳細紀錄失敗</p>';
    }
}

/**
 * 處理「開始排班」按鈕點擊
 */
async function handleStartScheduling() {
    console.log("handleStartScheduling called");
    // --- Get references to modal and button --- 
    const modal = document.getElementById('lock-request-modal');
    const messageElement = document.getElementById('lock-status-message');
    const button = document.getElementById('start-scheduling-btn');

    if (!modal || !messageElement || !button) {
        console.error("Modal or button elements not found for lock request.");
        showMessage("介面錯誤，無法請求鎖定。", "error");
        return;
    }
    if (!requestScheduleLockCallable) {
         console.error("requestScheduleLockCallable is not initialized.");
         showMessage("系統功能未就緒，無法請求鎖定。", "error");
         return;
    }

    button.disabled = true;
    messageElement.textContent = '正在請求排班權限...';
    modal.style.display = 'flex'; // Show modal

    try {
        // --- Pre-check --- 
        await checkAndDisplaySystemStatus(); // Update currentLockState and UI

        // Check system status and existing lock 
        if (currentLockState.systemStatus !== 'IDLE' && currentLockState.systemStatus !== '開放') {
             messageElement.textContent = systemStatusText?.textContent || '系統目前無法鎖定，請稍後再試。'; 
             console.warn("Pre-check failed: System not IDLE or OPEN. Status:", currentLockState.systemStatus);
             setTimeout(() => { modal.style.display = 'none'; button.disabled = false; }, 2500);
             return;
        }
        if (currentLockState.isLocked && !currentLockState.heldByMe) {
             messageElement.textContent = `已被 ${currentLockState.lockedByName || '他人'} 鎖定。`;
             console.warn("Pre-check failed: Locked by someone else.");
             setTimeout(() => { modal.style.display = 'none'; button.disabled = false; }, 2500);
             return;
        }

        // --- Request Lock --- 
        console.log("Attempting to acquire scheduling lock via Cloud Function...");
        const result = await requestScheduleLockCallable(); // Call the Cloud Function

        if (result.data.success) {
            console.log("Lock acquired successfully via function.");
            modal.style.display = 'none'; // Hide modal on success
            // Refresh status display (timer, holder name) which might be updated by the lock function result via listener or direct state change
            await checkAndDisplaySystemStatus(); 
            enableCalendarInteraction(); // Enable calendar for selection 
            // Button remains disabled as user holds the lock
        } else {
            console.warn("Failed to acquire lock via function:", result.data.message);
            messageElement.textContent = result.data.message || '請求鎖定失敗，可能已被他人鎖定或系統關閉。';
            setTimeout(() => { modal.style.display = 'none'; button.disabled = false; }, 2500);
        }
    } catch (error) {
        console.error("Error during handleStartScheduling:", error);
        messageElement.textContent = '請求時發生錯誤: ' + (error.message || '未知錯誤');
        setTimeout(() => { modal.style.display = 'none'; button.disabled = false; }, 3000);
    }
}

/**
 * Enables/disables calendar interaction based on the status.
 * @param {boolean} [isPreCheck=false] - If true, modifies behavior slightly for the pre-check.
 */
async function checkAndDisplaySystemStatus(isPreCheck = false) { // Added parameter
    console.log(`Checking schedule system status... (isPreCheck: ${isPreCheck})`);
    if (!leaveFunctions) {
        console.error("Firebase Functions SDK not found.");
        return;
    }

    // ... existing code ...

    // Update UI elements
    systemStatusText.textContent = messageText;
    if(statusMessage) statusMessage.textContent = statusMsgText;
    
    // Only modify button display if NOT a pre-check, 
    // otherwise handleStartScheduling will manage the button state.
    if (!isPreCheck) {
        startSchedulingBtn.style.display = showStartButton ? 'inline-block' : 'none';
        startSchedulingBtn.disabled = false; // Ensure button is enabled if shown
        startSchedulingBtn.textContent = '開始排班'; // Reset text
    } else {
        // If it IS a pre-check, we don't want to flash the button if status is not IDLE.
        // The calling function (handleStartScheduling) will decide final button state.
        console.log("Pre-check: Button state will be managed by caller.");
    }

    disableCalendarInteraction(!enableInteraction);

    // ... existing code ...
}

// --- NEW: Initialize Leave Interface within a Modal --- 
/**
 * 初始化彈出視窗中的排假介面
 * @param {HTMLElement} containerElement - Modal 的內容容器元素
 * @param {object} user - 當前登入使用者物件
 * @param {object} db - Firestore 實例
 */
async function initLeavePageForModal(containerElement, user, db) {
    if (!containerElement || !user || !db) {
        console.error("initLeavePageForModal: Missing container, user, or db instance.");
        containerElement.innerHTML = '<p style="color:red;">排班介面初始化錯誤：缺少必要資訊。</p>';
        return;
    }
    console.log("Initializing Leave Interface in Modal for:", user?.name);

    // --- Use passed arguments, don't set global pageCurrentUser/pageDb --- 
    const modalCurrentUser = user;
    const modalDb = db;
    // Reset modal-specific state if needed
    selectedDates = []; 
    existingLeaveData = null;
    // Reset year/month to current (or fetch from config?)
    currentYear = new Date().getFullYear();
    currentMonth = new Date().getMonth() + 1;

    // --- Get DOM Element References within the container --- 
    // Use containerElement.querySelector to scope the search
    const modalMonthDisplay = containerElement.querySelector('#current-month-display');
    const modalCalendarContainer = containerElement.querySelector('#calendar-container');
    const modalRulesList = containerElement.querySelector('#rules-list');
    const modalSelectedDatesList = containerElement.querySelector('#selected-dates-list');
    const modalSelectedCount = containerElement.querySelector('#selected-count');
    const modalSubmitButton = containerElement.querySelector('#submit-leave-request');
    const modalMessageElement = containerElement.querySelector('#leave-message'); // Message area inside modal
    // Get other elements loaded from leave.html if needed (e.g., existing schedule summary)
    const modalExistingScheduleSummary = containerElement.querySelector('#existing-schedule-summary');

    // Basic check for essential elements within the modal
    if (!modalMonthDisplay || !modalCalendarContainer || !modalSubmitButton || !modalMessageElement || !modalRulesList || !modalSelectedDatesList || !modalSelectedCount || !modalPrevMonthBtn || !modalNextMonthBtn) {
        console.error("Essential elements for leave interface are missing within the modal!");
        containerElement.innerHTML = '<p style="color:red;">排班介面載入不完整，缺少元件。</p>';
        return;
    }

    // --- Setup Event Listeners scoped to the modal --- 
    // We need to adapt setupEventListeners or create a new one
    setupEventListenersForModal(containerElement, modalCurrentUser, modalDb); // Pass context

    // --- Initial UI State for Modal --- 
    // We might not need to disable interaction here if the lock is already acquired
    // But let's disable submit initially until dates are selected
    modalSubmitButton.disabled = true;
    if(modalMessageElement) modalMessageElement.textContent = '';
    selectedDates = []; // Ensure dates are reset

    try {
        // --- Load Rules and Render Initial Calendar --- 
        // Assume loadLeaveRules fetches globally, or adapt it to use modalDb
        await loadLeaveRules(modalDb); // Pass db if needed
        displayLeaveRules(modalRulesList, modalCurrentUser); // Adapt displayLeaveRules
        renderCalendar(currentYear, currentMonth, modalCalendarContainer, { container: containerElement, user: modalCurrentUser, db: modalDb }); // Pass context
        updateSelectedSummary(modalSelectedDatesList, modalSelectedCount); // Adapt updateSelectedSummary

        // --- Check for existing leave for the initial month --- 
        await fetchExistingLeave(currentYear, currentMonth, modalCurrentUser, modalDb); // Adapt fetchExistingLeave
        if (existingLeaveData) {
            modalSubmitButton.textContent = '已提交';
            modalSubmitButton.disabled = true;
            if (modalMessageElement) modalMessageElement.textContent = '提示：此月份您已提交過排休。';
            // Optionally disable calendar cells if already submitted
            disableCalendarInteractionForModal(modalCalendarContainer, true);
        } else {
             modalSubmitButton.textContent = '提交排休申請';
             modalSubmitButton.disabled = true; // Disabled until dates selected
             if (modalMessageElement) modalMessageElement.textContent = '';
             disableCalendarInteractionForModal(modalCalendarContainer, false);
        }
        
        // Fetch and display summary of others' leave (optional, might be complex in modal)
        // await fetchAndDisplayScheduleSummary(currentYear, currentMonth, modalExistingScheduleSummary, modalDb); // Adapt if needed

        console.log("Leave interface initialization in modal complete.");

    } catch (error) {
         console.error("Error initializing leave interface in modal:", error);
         containerElement.innerHTML = `<p style="color:red;">初始化排班介面時發生錯誤: ${error.message}</p>`;
    }
}

// --- NEW: Setup Event Listeners specifically for the Modal context --- 
/**
 * Sets up event listeners for elements within the leave request modal.
 * @param {HTMLElement} container - The modal content container element.
 * @param {object} user - The current user.
 * @param {object} db - Firestore instance.
 */
function setupEventListenersForModal(container, user, db) {
    console.log("Setting up event listeners for modal...");

    const prevMonthBtn = container.querySelector('#prev-month-btn');
    const nextMonthBtn = container.querySelector('#next-month-btn');
    const submitButton = container.querySelector('#submit-leave-request');
    // Calendar click listener is usually added during renderCalendar

    if (prevMonthBtn) {
        // Remove potential old listener before adding new one?
        // prevMonthBtn.removeEventListener('click', ???);
        prevMonthBtn.onclick = () => handleMonthChangeForModal(-1, container, user, db);
        console.log("Modal Prev Month button listener added.");
    } else {
        console.error("Modal Prev Month button not found!");
    }

    if (nextMonthBtn) {
        nextMonthBtn.onclick = () => handleMonthChangeForModal(1, container, user, db);
        console.log("Modal Next Month button listener added.");
    } else {
        console.error("Modal Next Month button not found!");
    }

    if (submitButton) {
        submitButton.onclick = () => handleSubmitLeaveRequestForModal(container, user, db);
        console.log("Modal Submit button listener added.");
    } else {
        console.error("Modal Submit button not found!");
    }
    
    // Note: Calendar day click listeners are typically added within renderCalendar.
    // We need to ensure renderCalendar, when called for the modal, adds listeners
    // that call handleDateClickInModal(event, container, user, db).
}
// --- END NEW --- 

// --- TODO: Adapt Helper Functions to work within a container --- 
// Examples:
// async function loadLeaveRules(db) { ... }
// function displayLeaveRules(rulesListContainer, user) { ... }
// function renderCalendar(year, month, calendarDOMContainer) { ... }
// function updateSelectedSummary(listElement, countElement) { ... }
// async function fetchExistingLeave(year, month, user, db) { ... }
// function setupEventListenersForModal(container, user, db) { ... }
// function disableCalendarInteractionForModal(calendarDOMContainer, disabled) { ... }
// async function handleMonthChangeForModal(direction, container, user, db) { ... }
// async function handleSubmitLeaveRequestForModal(container, user, db) { ... }
// async function handleDateClickInModal(event, container, user, db) { ... }
// function showMessageInModal(msg, type, container, elementId = 'leave-message') { ... }

// Keep original initLeavePage if leave.html is still used directly
/**
 * 初始化排假頁面 (原始版本)
 * @param {object} user - 從 requireLogin 獲取的登入使用者物件
 */
async function initLeavePage(user, db) {
    // ... existing code ...
}

// --- NEW: Handle Date Click within Modal --- 
/**
 * 處理 Modal 中日期格子點擊事件
 * @param {Event} event
 * @param {HTMLElement} container - The modal content container element.
 * @param {object} user - The current user.
 * @param {object} db - Firestore instance.
 */
async function handleDateClickInModal(event, container, user, db) { 
    const cell = event.target.closest('.day-cell'); if (!cell) return;
    const dateStr = cell.dataset.date;
    if (!dateStr || !cell.classList.contains('selectable-day')) return;
    
    // --- Use passed arguments --- 
    if (!db || !user || !user.store) { // Check user.store directly
        console.error("DB or User info (including store) missing for modal date click validation.");
        alert("無法驗證日期，缺少必要資訊。");
        return;
    }
    // --- 
    
    // Find message element within the container
    const modalMessageElement = container.querySelector('#leave-message');

    // Check if already submitted (existingLeaveData might need context or be reset)
    if (existingLeaveData) { 
        showMessageInModal('已提交，無法修改', 'error', container, 'leave-message'); // Use modal message function
        return; 
    }

    const dateIndex = selectedDates.indexOf(dateStr);

    if (dateIndex > -1) { // 取消選擇
        selectedDates.splice(dateIndex, 1); 
        cell.classList.remove('selected');
        showMessageInModal('', 'info', container, 'leave-message'); // Clear message in modal
    } else { // 嘗試新增選擇
        
        // --- Firestore Limit Check (Using passed db/user) --- 
        try {
            const dailyLimit = parseInt(leaveRules?.每日休假上限人數, 10);
            const storeLimit = parseInt(leaveRules?.同店每日休假上限, 10);

            if (!isNaN(dailyLimit) || !isNaN(storeLimit)) {
                console.log(`Checking limits for ${dateStr}. Daily: ${dailyLimit}, Store: ${storeLimit}`);
                const q = db.collection('leave_requests') // Use passed db
                            .where('date', '==', dateStr)
                            .where('status', 'in', ['pending', 'approved']); 
                
                const snapshot = await q.get();
                const totalCount = snapshot.size;
                const storeCount = snapshot.docs.filter(doc => doc.data().store === user.store).length; // Use passed user.store
                
                console.log(`Modal - Existing counts for ${dateStr}: Total=${totalCount}, Store=${storeCount}`);

                if (!isNaN(dailyLimit) && totalCount >= dailyLimit) {
                    alert(`選擇失敗：日期 ${dateStr} 的總休假人數已達上限 ${dailyLimit} 人！`);
                    return; 
                }
                if (!isNaN(storeLimit) && storeCount >= storeLimit) {
                    alert(`選擇失敗：日期 ${dateStr} 的 ${user.store} 店休假人數已達上限 ${storeLimit} 人！`);
                    return; 
                }
            } else {
                 console.log(`Modal - Skipping Firestore limit check for ${dateStr} as limits are not defined/NaN.`);
            }
        } catch (err) {
            console.error("Modal - 檢查休假人數上限失敗:", err);
            alert("檢查休假人數時發生錯誤，請稍後再試。暫時無法選擇此日期。");
            return; 
        }
        // --- END Firestore Limit Check ---

        // --- Existing User Limit Checks (Using global leaveRules and selectedDates) --- 
        let canSelect = true; let message = '';
        const totalSelectedLimit = parseInt(leaveRules?.每人休假上限天數, 10);
        const weekendSelectedLimit = parseInt(leaveRules?.每人五六日休假上限天數, 10);

        if (!isNaN(totalSelectedLimit) && selectedDates.length >= totalSelectedLimit) {
            canSelect = false; message = `選擇失敗：您已達到每月休假上限 ${totalSelectedLimit} 天。`;
        }
        if (canSelect && !isNaN(weekendSelectedLimit)) {
            const clickedDate = new Date(dateStr + 'T00:00:00'); const weekday = clickedDate.getDay();
            if (weekday === 0 || weekday === 5 || weekday === 6) { 
                const currentWeekendCount = selectedDates.filter(d => { const wd = new Date(d + 'T00:00:00').getDay(); return wd === 0 || wd === 5 || wd === 6; }).length;
                if (currentWeekendCount >= weekendSelectedLimit) {
                    canSelect = false; message = `選擇失敗：您已達到週末(五/六/日)休假上限 ${weekendSelectedLimit} 天。`;
                }
            }
        }

        // --- Add Selection if All Checks Passed --- 
        if (canSelect) {
            selectedDates.push(dateStr); 
            cell.classList.add('selected'); 
            selectedDates.sort();
            showMessageInModal('', 'info', container, 'leave-message'); // Clear message in modal
        } else {
            alert(message); // Show user limit message
        }
    }
    
    // --- Update summary within the modal --- 
    const listElement = container.querySelector('#selected-dates-list');
    const countElement = container.querySelector('#selected-count');
    updateSelectedSummary(listElement, countElement); // Call adapted summary function
}
// --- END NEW: handleDateClickInModal --- 

// --- NEW: Show Message within Modal --- 
/**
 * 顯示訊息到 Modal 內指定的元素
 * @param {string} msg - The message to display.
 * @param {string} [type='info'] - Message type ('info', 'success', 'warning', 'error').
 * @param {HTMLElement} container - The modal content container element.
 * @param {string} [elementId='leave-modal-message'] - The ID of the message element within the container.
 */
function showMessageInModal(msg, type = 'info', container, elementId = 'leave-modal-message') {
    if (!container) {
        console.error("showMessageInModal: Container element not provided.");
        return;
    }
    // Find the element within the container using its ID
    const elem = container.querySelector(`#${elementId}`);
    if (elem) { 
        elem.textContent = msg; 
        // Use a consistent class naming convention if possible
        elem.className = `message ${type}-message`; 
    } else {
         console.warn(`showMessageInModal: Message element with ID '${elementId}' not found within the container.`);
         // Fallback: maybe alert?
         // alert(`${type.toUpperCase()}: ${msg}`); 
    }
}
// --- END NEW --- 

// --- NEW: Handle Month Change within Modal --- 
/**
 * 處理 Modal 中月份切換
 * @param {number} direction -1 or 1
 * @param {HTMLElement} container - The modal content container element.
 * @param {object} user - The current user.
 * @param {object} db - Firestore instance.
 */
async function handleMonthChangeForModal(direction, container, user, db) {
    currentMonth += direction; 
    if (currentMonth < 1) { 
        currentMonth = 12; 
        currentYear--; 
    } else if (currentMonth > 12) { 
        currentMonth = 1; 
        currentYear++; 
    }
    console.log(`Modal - Changing month to ${currentYear}-${currentMonth}`); 
    selectedDates = []; // Reset selection when changing month
    
    // Find elements within the container
    const modalCalendarContainer = container.querySelector('#calendar-container');
    const modalSelectedDatesList = container.querySelector('#selected-dates-list');
    const modalSelectedCount = container.querySelector('#selected-count');
    const modalMessageElement = container.querySelector('#leave-message');
    const modalSubmitBtn = container.querySelector('#submit-leave-request');
    const modalMonthDisplay = container.querySelector('#current-month-display'); // Month display inside modal

    // Clear UI elements before loading
    if (modalCalendarContainer) modalCalendarContainer.innerHTML = '<p>載入中...</p>'; 
    if (modalSelectedDatesList) modalSelectedDatesList.textContent = '尚未選擇'; 
    if (modalSelectedCount) modalSelectedCount.textContent = '0'; 
    if (modalMessageElement) modalMessageElement.textContent = ''; 
    if (modalSubmitBtn) modalSubmitBtn.disabled = true;
    if (modalMonthDisplay) modalMonthDisplay.textContent = `${currentYear} 年 ${currentMonth} 月 (載入中)`; // Update month display immediately

    // Optional: Check if scheduling is open for the new month (using global leaveRules for now)
    // if (!isSchedulingOpen(currentYear, currentMonth)) { 
    //     showMessageInModal('此月份目前未開放排班。', 'warning', container, 'leave-message');
    //     if (modalCalendarContainer) modalCalendarContainer.innerHTML = '<p>此月份未開放</p>';
    //     return; 
    // }
    
    try { 
        // Fetch existing leave data for the new month
        // Ensure fetchExistingLeave and renderCalendar are adapted
        await fetchExistingLeave(currentYear, currentMonth, user, db); 
        if (modalCalendarContainer) { // Check again if container exists
             renderCalendar(currentYear, currentMonth, modalCalendarContainer, { container, user, db }); // Pass context
        }
        
        // Update submit button state based on fetched existing leave data
        if (modalSubmitBtn) { // Check if button exists
             if (existingLeaveData) { 
                 modalSubmitBtn.textContent = '已提交'; 
                 modalSubmitBtn.disabled = true; 
                 showMessageInModal('提示：此月份您已提交過排休。', 'info', container, 'leave-message'); 
                 // Optionally disable calendar interaction
                 if (modalCalendarContainer) disableCalendarInteractionForModal(modalCalendarContainer, true);
             } else { 
                 modalSubmitBtn.textContent = '提交排休申請'; 
                 // Keep disabled until dates are selected
                 modalSubmitBtn.disabled = selectedDates.length === 0; 
                 if (modalMessageElement) modalMessageElement.textContent = ''; 
                 if (modalCalendarContainer) disableCalendarInteractionForModal(modalCalendarContainer, false);
             }
        } 
    } catch (error) { 
        console.error("Modal - Error changing month:", error); 
        showMessageInModal(`載入月份錯誤: ${error.message}`, 'error', container, 'leave-message'); 
        if (modalCalendarContainer) modalCalendarContainer.innerHTML = '<p style="color:red;">載入日曆失敗</p>';
    }
}
// --- END NEW: handleMonthChangeForModal --- 


/**
 * 更新已選日期摘要 (適用於 Modal)
 * @param {HTMLElement} listElement - The element to display the list of dates.
 * @param {HTMLElement} countElement - The element to display the count of dates.
 */
function updateSelectedSummary(listElement, countElement) {
    // --- MODIFIED: Use passed elements --- 
    // const listElement = document.getElementById('selected-dates-list'); 
    // const countElement = document.getElementById('selected-count'); 
    if (!listElement || !countElement) {
         console.warn("updateSelectedSummary: list or count element not provided.");
         return;
    }
    
    // Assume selectedDates array holds the current selection for the context
    countElement.textContent = selectedDates.length;
    if (selectedDates.length === 0) { 
        listElement.textContent = '尚未選擇'; 
    } else { 
        const displayDates = selectedDates.map(dateStr => dateStr.split('-')[1]+'/'+dateStr.split('-')[2]); 
        listElement.textContent = displayDates.join(', '); 
    }
}

// ... existing code ...