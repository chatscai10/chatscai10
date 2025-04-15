// js/schedule-view-logic.js - 班表查詢頁面邏輯

'use strict';

// --- 全域變數 ---
let currentUser = null;
let selectedYearMonth = null;
let stores = [];
let employees = [];
let scheduleData = {}; // {'YYYY-MM-DD': {'storeId': [empId1, empId2, ...], ...}}

// DOM 元素引用
let yearMonthSelect, filterSelect, targetSelect, viewButton;
let scheduleMessage, calendarContainer, summaryContainer, summaryContent;
// --- NEW: Scheduling Access Panel Elements ---
let schedulingAccessPanel, statusTextElement, enterSchedulingButton, timerTextElement;
let scheduleConfigData = null; // Store fetched config
let statusUpdateIntervalId = null; // Timer ID

// --- NEW: Firebase Functions Callables ---
// Placeholder definitions - Ensure firebase.functions() is initialized before use
let scheduleView_requestScheduleLockCallable = null;
let scheduleView_releaseScheduleLockCallable = null;

/**
 * 初始化班表查詢頁面
 * @param {object} user - 當前登入使用者
 * @param {object} firestore - Firestore 實例
 */
async function initScheduleViewPage(user, firestore) {
    currentUser = user;
    console.log("Initializing Schedule View Page for:", user.name);

    // 獲取 DOM 元素
    yearMonthSelect = document.getElementById('year-month-select');
    filterSelect = document.getElementById('filter-select');
    targetSelect = document.getElementById('target-select');
    viewButton = document.getElementById('view-schedule-btn');
    scheduleMessage = document.getElementById('schedule-message');
    calendarContainer = document.getElementById('schedule-calendar');
    summaryContainer = document.getElementById('summary-container');
    summaryContent = document.getElementById('summary-content');
    // --- NEW: Get Scheduling Access Panel Elements ---
    schedulingAccessPanel = document.getElementById('scheduling-access-panel');
    statusTextElement = document.getElementById('scheduling-system-status-text');
    enterSchedulingButton = document.getElementById('enter-scheduling-button');
    timerTextElement = document.getElementById('scheduling-timer-text');

    // 檢查元素是否存在 (包括新的)
    if (!yearMonthSelect || !filterSelect || !targetSelect || !viewButton || 
        !scheduleMessage || !calendarContainer || !summaryContainer || !summaryContent ||
        !schedulingAccessPanel || !statusTextElement || !enterSchedulingButton || !timerTextElement) { // <-- Added new elements
        console.error("Required schedule view page elements not found.");
        if (scheduleMessage) scheduleMessage.textContent = "頁面元件載入錯誤。";
        if (statusTextElement) statusTextElement.textContent = "錯誤"; // Show error in new panel too
        return;
    }

    try {
        // 載入年月選項
        await loadYearMonthOptions(firestore);
        
        // 載入分店和員工數據
        await Promise.all([
            loadStores(firestore),
            loadEmployees(firestore)
        ]);

        // 設定選擇器事件處理
        filterSelect.addEventListener('change', () => updateTargetOptions());
        viewButton.addEventListener('click', async () => await loadAndDisplaySchedule(firestore));
        
        // 初始化目標選項
        updateTargetOptions();
        
        // 新增：渲染分店顏色圖例 (Add: Render store color legend)
        renderStoreLegend(); 
        
        scheduleMessage.textContent = "請選擇查詢條件並按下顯示按鈕";
        
        // --- NEW: Initial check and periodic update of scheduling status ---
        await checkAndDisplaySchedulingStatus(firestore, user);
        // Clear previous interval if any (e.g., page re-init)
        if (statusUpdateIntervalId) {
            clearInterval(statusUpdateIntervalId);
        }
        // Update status every 60 seconds
        statusUpdateIntervalId = setInterval(() => checkAndDisplaySchedulingStatus(firestore, user), 60000); 
        
        // --- NEW: Define Callables (if Functions SDK available) ---
        // Ensure this runs after Firebase is fully initialized
        if (typeof firebase !== 'undefined' && typeof firebase.functions === 'function') {
            try {
                scheduleView_requestScheduleLockCallable = firebase.functions().httpsCallable('requestScheduleLock');
                scheduleView_releaseScheduleLockCallable = firebase.functions().httpsCallable('releaseScheduleLock');
                console.log("Schedule view callable functions defined.");
            } catch (error) {
                console.error("Error defining schedule view callable functions:", error);
                // Disable button if callables can't be defined
                if(enterSchedulingButton) enterSchedulingButton.disabled = true;
                if(statusTextElement) statusTextElement.textContent = "錯誤：無法初始化後端連接";
            }
        } else {
            console.error("Firebase Functions SDK not available for schedule view.");
            if(enterSchedulingButton) enterSchedulingButton.disabled = true;
            if(statusTextElement) statusTextElement.textContent = "錯誤：缺少必要元件";
        }
        // --- END NEW ---

        // --- NEW: Add Button Click Listener ---
        if (enterSchedulingButton) {
            enterSchedulingButton.addEventListener('click', handleEnterSchedulingClick);
        }
        // --- END NEW ---

        // --- NEW: Add Modal Close Listener ---
        const closeModalButton = document.getElementById('close-leave-modal-btn');
        if (closeModalButton) {
            closeModalButton.addEventListener('click', handleCloseLeaveModal);
        }
        // --- END NEW ---

    } catch (error) {
        console.error("Error initializing schedule view page:", error);
        scheduleMessage.textContent = `初始化錯誤: ${error.message}`;
        scheduleMessage.className = 'message error-message';
    }
}

/**
 * 載入年月選項
 */
async function loadYearMonthOptions(firestore) {
    try {
        // 清空選擇器
        yearMonthSelect.innerHTML = '';
        
        // 從 Firestore 獲取排班數據的月份
        const snapshot = await firestore.collection('schedules').get();
        const months = new Set();
        
        snapshot.forEach(doc => {
            const monthStr = doc.id.split('_')[0]; // 假設格式為 "YYYY-MM_storeId"
            if (monthStr && monthStr.match(/^\d{4}-\d{2}$/)) {
                months.add(monthStr);
            }
        });
        
        // 如果沒有數據，添加當前月和下個月
        if (months.size === 0) {
            const now = new Date();
            months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
            
            const nextMonth = new Date(now);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            months.add(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`);
        }
        
        // 排序月份
        const sortedMonths = Array.from(months).sort().reverse();
        
        // 添加到選擇器
        sortedMonths.forEach(month => {
            const [year, monthNum] = month.split('-');
            const option = document.createElement('option');
            option.value = month;
            option.textContent = `${year}年${monthNum}月`;
            yearMonthSelect.appendChild(option);
        });
        
        // 選擇第一個選項
        if (yearMonthSelect.options.length > 0) {
            yearMonthSelect.selectedIndex = 0;
            selectedYearMonth = yearMonthSelect.value;
        }
        
    } catch (error) {
        console.error("Error loading year-month options:", error);
        throw new Error("載入年月選項時出錯");
    }
}

/**
 * 載入分店數據
 */
async function loadStores(firestore) {
    try {
        // 嘗試從設定中獲取分店列表
        const settingsDoc = await firestore.collection('settings').doc('store_settings').get();
        
        if (settingsDoc.exists && settingsDoc.data().stores) {
            stores = settingsDoc.data().stores;
        } else {
            // 如果設定中沒有，則從排班數據中推斷
            const scheduleSnapshot = await firestore.collection('schedules').limit(10).get();
            const storeSet = new Set();
            
            scheduleSnapshot.forEach(doc => {
                const docIdParts = doc.id.split('_');
                if (docIdParts.length >= 2) {
                    storeSet.add(docIdParts[1]);
                }
            });
            
            stores = Array.from(storeSet);
        }
        
        console.log("Loaded stores:", stores);
    } catch (error) {
        console.error("Error loading stores:", error);
        stores = ['總店', 'A店', 'B店', 'C店']; // 預設值
    }
}

/**
 * 載入員工數據
 */
async function loadEmployees(firestore) {
    try {
        employees = [];
        const querySnapshot = await firestore.collection('employees').get();
        
        querySnapshot.forEach(doc => {
            const data = doc.data();
            employees.push({ 
                id: doc.id,
                name: data.name,
                store: data.store
            });
        });
        
        console.log(`Loaded ${employees.length} employees.`);
    } catch (error) {
        console.error("Error loading employees:", error);
        throw new Error("載入員工數據時出錯");
    }
}

/**
 * 更新目標選項（根據篩選類型）
 */
function updateTargetOptions() {
    const filterType = filterSelect.value;
    targetSelect.innerHTML = '';
    
    if (filterType === 'store') {
        // 顯示分店選項
        stores.forEach(store => {
            const option = document.createElement('option');
            option.value = store;
            option.textContent = store;
            targetSelect.appendChild(option);
        });
    } else if (filterType === 'employee') {
        // 顯示員工選項
        employees.sort((a, b) => a.name.localeCompare(b.name));
        employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.id;
            option.textContent = `${emp.name} (${emp.store || '未分配'})`;
            targetSelect.appendChild(option);
        });
    }
}

/**
 * 載入並顯示班表
 */
async function loadAndDisplaySchedule(firestore) {
    // 獲取選擇的條件
    const yearMonth = yearMonthSelect.value;
    const filterType = filterSelect.value;
    const targetValue = targetSelect.value;
    
    if (!yearMonth || !targetValue) {
        scheduleMessage.textContent = "請選擇有效的查詢條件";
        scheduleMessage.className = 'message warning-message';
        return;
    }
    
    try {
        // 顯示載入中狀態
        scheduleMessage.textContent = "正在載入班表數據...";
        scheduleMessage.className = 'message info-message';
        calendarContainer.style.display = 'none';
        summaryContainer.style.display = 'none';
        
        // 載入該月的班表數據
        await loadScheduleData(firestore, yearMonth);
        
        // 渲染日曆
        const [year, month] = yearMonth.split('-');
        renderCalendar(parseInt(year), parseInt(month), filterType, targetValue);
        
        // 顯示結果
        scheduleMessage.textContent = `已顯示 ${year}年${month}月班表`;
        scheduleMessage.className = 'message success-message';
        calendarContainer.style.display = 'grid';
        summaryContainer.style.display = 'block';
        
    } catch (error) {
        console.error("Error loading schedule:", error);
        scheduleMessage.textContent = `載入錯誤: ${error.message}`;
        scheduleMessage.className = 'message error-message';
    }
}

/**
 * 載入排班數據
 */
async function loadScheduleData(firestore, yearMonth) {
    try {
        // 重置數據
        scheduleData = {};
        
        console.log(`Attempting to load schedule data for ${yearMonth}`);
        
        // 嘗試不同的查詢方式來獲取班表數據
        let querySnapshot;
        
        try {
            // 第一種方式: 使用 'month' 欄位查詢
            console.log("Query method 1: Using 'month' field");
            querySnapshot = await firestore.collection('schedules')
                .where('month', '==', yearMonth)
                .get();
                
            if (querySnapshot.empty) {
                console.log("No results found using 'month' field query, trying alternate method");
                // 第二種方式: 使用文檔ID前綴查詢
                console.log("Query method 2: Using document ID prefix");
                querySnapshot = await firestore.collection('schedules')
                    .where(firebase.firestore.FieldPath.documentId(), '>=', `${yearMonth}_`)
                    .where(firebase.firestore.FieldPath.documentId(), '<', `${yearMonth}_\uf8ff`)
                    .get();
            }
        } catch (queryError) {
            console.error("First query method failed:", queryError);
            // 備用方式: 獲取所有文檔然後手動過濾
            console.log("Query method 3: Fetching all schedules and filtering manually");
            querySnapshot = await firestore.collection('schedules').get();
        }
        
        // 如果查詢結果為空，嘗試使用舊的數據結構
        if (querySnapshot.empty) {
            console.log("No results found in 'schedules' collection, checking legacy format");
            try {
                // 檢查舊格式: 分店作為文檔ID
                const storeDocsSnapshot = await firestore.collection('schedules')
                    .where('yearMonth', '==', yearMonth)
                    .get();
                
                if (!storeDocsSnapshot.empty) {
                    console.log(`Found ${storeDocsSnapshot.size} legacy format documents`);
                    processLegacyScheduleData(storeDocsSnapshot, yearMonth);
                    return;
                }
            } catch (legacyError) {
                console.error("Error checking legacy format:", legacyError);
            }
            
            // 如果還沒有數據，嘗試其他可能的集合名稱
            try {
                const altCollectionSnapshot = await firestore.collection('schedule')
                    .where('month', '==', yearMonth)
                    .get();
                
                if (!altCollectionSnapshot.empty) {
                    console.log(`Found ${altCollectionSnapshot.size} documents in alternate collection`);
                    querySnapshot = altCollectionSnapshot;
                }
            } catch (altError) {
                console.error("Error checking alternate collection:", altError);
            }
        }
        
        if (querySnapshot.empty) {
            console.warn(`No schedule data found for ${yearMonth} in any format`);
            throw new Error(`找不到 ${yearMonth} 的班表數據`);
        }
        
        // 處理數據
        console.log(`Processing ${querySnapshot.size} schedule documents`);
        let invalidDocCount = 0;
        
        querySnapshot.forEach(doc => {
            try {
                const data = doc.data();
                console.log(`Processing document: ${doc.id}, has assignments:`, !!data.assignments);
                
                // 判斷文檔是否包含指定月份的數據 (如果是手動過濾的結果)
                const isRelevantDoc = doc.id.startsWith(yearMonth) || 
                                     (data.month === yearMonth) || 
                                     (data.yearMonth === yearMonth);
                
                if (!isRelevantDoc) {
                    console.log(`Skipping document ${doc.id} - not relevant to ${yearMonth}`);
                    return;
                }
                
                // 遍歷每個日期的排班
                if (data.assignments && typeof data.assignments === 'object') {
                    Object.entries(data.assignments).forEach(([date, storeAssignments]) => {
                        // 確保日期格式正確
                        if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            console.warn(`Invalid date format in document ${doc.id}: ${date}`);
                            return;
                        }
                        
                        if (!scheduleData[date]) {
                            scheduleData[date] = {};
                        }
                        
                        // 確保 storeAssignments 是物件
                        if (typeof storeAssignments === 'object' && storeAssignments !== null) {
                            // 遍歷每個分店的排班
                            Object.entries(storeAssignments).forEach(([store, empIds]) => {
                                // 確保 empIds 是陣列，或轉換為陣列
                                let normalizedEmpIds = [];
                                
                                if (Array.isArray(empIds)) {
                                    normalizedEmpIds = empIds;
                                } else if (typeof empIds === 'object' && empIds !== null) {
                                    // 可能是 {empId1: true, empId2: true} 格式
                                    normalizedEmpIds = Object.keys(empIds).filter(k => empIds[k] === true);
                                } else if (typeof empIds === 'string') {
                                    // 單一員工 ID
                                    normalizedEmpIds = [empIds];
                                }
                                
                                scheduleData[date][store] = normalizedEmpIds;
                            });
                        } else {
                            console.warn(`Invalid store assignments for date ${date} in document ${doc.id}`);
                        }
                    });
                } else if (data.days && Array.isArray(data.days)) {
                    // 備用數據格式: 日期數組
                    processDaysArrayFormat(data.days, yearMonth, data.store || doc.id);
                } else {
                    console.warn(`Document ${doc.id} has no valid assignments data`);
                    invalidDocCount++;
                }
            } catch (docError) {
                console.error(`Error processing document ${doc.id}:`, docError);
                invalidDocCount++;
            }
        });
        
        if (invalidDocCount > 0) {
            console.warn(`${invalidDocCount} documents had invalid format`);
        }
        
        const dayCount = Object.keys(scheduleData).length;
        console.log(`Loaded schedule data: ${dayCount} days`);
        
        if (dayCount === 0) {
            throw new Error(`無法解析 ${yearMonth} 的班表數據格式`);
        }
        
    } catch (error) {
        console.error("Error fetching schedule data:", error);
        throw new Error(`載入 ${yearMonth} 班表數據時出錯: ${error.message}`);
    }
}

/**
 * 處理舊格式的排班數據
 * @param {object} snapshot - Firestore 查詢結果
 * @param {string} yearMonth - 年月字符串 (YYYY-MM)
 */
function processLegacyScheduleData(snapshot, yearMonth) {
    console.log("Processing legacy format schedule data");
    
    snapshot.forEach(doc => {
        const data = doc.data();
        const store = doc.id;
        
        if (data.assignments && typeof data.assignments === 'object') {
            Object.entries(data.assignments).forEach(([day, empIds]) => {
                // 構建完整日期
                const date = `${yearMonth}-${day.padStart(2, '0')}`;
                
                if (!scheduleData[date]) {
                    scheduleData[date] = {};
                }
                
                scheduleData[date][store] = Array.isArray(empIds) ? empIds : 
                                         (typeof empIds === 'string' ? [empIds] : []);
            });
        }
    });
    
    console.log(`Loaded legacy schedule data: ${Object.keys(scheduleData).length} days`);
}

/**
 * 處理日期數組格式的排班數據
 * @param {Array} days - 日期數組
 * @param {string} yearMonth - 年月字符串 (YYYY-MM)
 * @param {string} store - 分店名稱
 */
function processDaysArrayFormat(days, yearMonth, store) {
    console.log(`Processing days array format for store: ${store}`);
    
    days.forEach(day => {
        if (typeof day === 'object' && day !== null) {
            const date = day.date || `${yearMonth}-${String(day.day).padStart(2, '0')}`;
            const employees = day.employees || [];
            
            if (!scheduleData[date]) {
                scheduleData[date] = {};
            }
            
            scheduleData[date][store] = Array.isArray(employees) ? employees : [];
        }
    });
}

/**
 * 渲染日曆
 */
function renderCalendar(year, month, filterType, targetValue) {
    // 清空日曆容器，但保留表頭
    const headerRow = Array.from(calendarContainer.querySelectorAll('.calendar-header'));
    calendarContainer.innerHTML = '';
    headerRow.forEach(header => calendarContainer.appendChild(header));
    
    // 獲取該月的第一天和天數
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = firstDayOfMonth.getDay(); // 0 = 星期日, 6 = 星期六
    
    // 新增：獲取今天的日期 (Add: Get today's date)
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1; // JS months are 0-indexed
    const todayDate = today.getDate();

    // 創建上個月的填充天數
    for (let i = 0; i < firstDayOfWeek; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day other-month';
        calendarContainer.appendChild(emptyDay);
    }
    
    // 創建本月的天數
    for (let day = 1; day <= lastDayOfMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        // 添加日期
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayElement.appendChild(dayNumber);
        
        // 格式化日期字符串
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // 新增：檢查是否是今天 (Add: Check if it's today)
        if (year === todayYear && month === todayMonth && day === todayDate) {
            dayElement.classList.add('today'); // Apply highlight class
        }
        
        // 檢查是否是假日（週末）
        const currentDate = new Date(year, month - 1, day);
        if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
            dayElement.classList.add('holiday');
        }
        
        // 添加排班信息
        if (scheduleData[dateStr]) {
            if (filterType === 'store' && scheduleData[dateStr][targetValue]) {
                // 顯示該分店的排班
                const assignments = scheduleData[dateStr][targetValue]; // Might be ['empId1', ...] or [{empId: 'id1', shiftType: '...'}, ...]
                
                assignments.forEach(assignment => {
                    let empId = null;
                    let shiftType = null;

                    // Check data structure (string or object)
                    if (typeof assignment === 'string') {
                        empId = assignment;
                    } else if (typeof assignment === 'object' && assignment !== null && assignment.empId) {
                        empId = assignment.empId;
                        shiftType = assignment.shiftType;
                    }

                    if (empId) {
                        const emp = employees.find(e => e.id === empId);
                        if (emp) {
                            const staffEntry = document.createElement('div');
                            staffEntry.className = 'staff-entry';
                            let displayText = emp.name;
                            if (shiftType) {
                                displayText += ` (${shiftType})`; // Add shift type if available
                            }
                            staffEntry.textContent = displayText;
                            dayElement.appendChild(staffEntry);
                        }
                    }
                });
            } else if (filterType === 'employee') {
                // 顯示該員工的排班
                Object.entries(scheduleData[dateStr]).forEach(([store, assignments]) => {
                    let isScheduled = false;
                    // Check if assignments array contains the employee ID directly or within objects
                    if (Array.isArray(assignments)) {
                       isScheduled = assignments.some(assignment => 
                            (typeof assignment === 'string' && assignment === targetValue) ||
                            (typeof assignment === 'object' && assignment !== null && assignment.empId === targetValue)
                       );
                    }

                    if (isScheduled) {
                        const staffEntry = document.createElement('div');
                        staffEntry.className = `staff-entry store-${stores.indexOf(store) % 4 + 1}`;
                        staffEntry.textContent = store;
                        dayElement.appendChild(staffEntry);
                    }
                });
            }
        }
        
        calendarContainer.appendChild(dayElement);
    }
    
    // 創建下個月的填充天數
    const totalDaysDisplayed = firstDayOfWeek + lastDayOfMonth;
    const remainingCells = 7 - (totalDaysDisplayed % 7);
    if (remainingCells < 7) {
        for (let i = 0; i < remainingCells; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day other-month';
            calendarContainer.appendChild(emptyDay);
        }
    }
    
    // 生成統計摘要
    generateSummary(year, month, filterType, targetValue);
}

/**
 * 生成統計摘要
 */
function generateSummary(year, month, filterType, targetValue) {
    // 如果沒有數據，顯示空白
    if (Object.keys(scheduleData).length === 0) {
        summaryContent.innerHTML = '<p>無可用數據</p>';
        return;
    }
    
    // 根據篩選類型生成不同的統計
    if (filterType === 'store') {
        // 按員工統計到該分店的排班天數
        const employeeWorkCounts = {};
        
        Object.entries(scheduleData).forEach(([dateStr, storeData]) => {
            if (storeData[targetValue]) {
                storeData[targetValue].forEach(empId => {
                    if (!employeeWorkCounts[empId]) {
                        employeeWorkCounts[empId] = 0;
                    }
                    employeeWorkCounts[empId]++;
                });
            }
        });
        
        // 生成表格
        let tableHTML = `
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>員工</th>
                        <th>分店</th>
                        <th>排班天數</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // 按天數排序
        const sortedEmployees = Object.entries(employeeWorkCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([empId, count]) => {
                const emp = employees.find(e => e.id === empId);
                return {
                    id: empId,
                    name: emp ? emp.name : '未知員工',
                    store: emp ? emp.store : '未知',
                    count: count
                };
            });
        
        sortedEmployees.forEach(emp => {
            tableHTML += `
                <tr>
                    <td>${emp.name}</td>
                    <td>${emp.store || '未分配'}</td>
                    <td>${emp.count}</td>
                </tr>
            `;
        });
        
        tableHTML += `
                </tbody>
            </table>
        `;
        
        summaryContent.innerHTML = tableHTML;
        
    } else if (filterType === 'employee') {
        // 按分店統計該員工的排班天數
        const storeWorkCounts = {};
        let totalDays = 0;
        
        Object.entries(scheduleData).forEach(([dateStr, storeData]) => {
            Object.entries(storeData).forEach(([store, empIds]) => {
                if (empIds.includes(targetValue)) {
                    if (!storeWorkCounts[store]) {
                        storeWorkCounts[store] = 0;
                    }
                    storeWorkCounts[store]++;
                    totalDays++;
                }
            });
        });
        
        // 生成表格
        let tableHTML = `
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>分店</th>
                        <th>排班天數</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // 按天數排序
        const sortedStores = Object.entries(storeWorkCounts)
            .sort((a, b) => b[1] - a[1]);
        
        sortedStores.forEach(([store, count]) => {
            tableHTML += `
                <tr>
                    <td>${store}</td>
                    <td>${count}</td>
                </tr>
            `;
        });
        
        // 添加總計行
        tableHTML += `
                <tr style="font-weight: bold;">
                    <td>總計</td>
                    <td>${totalDays}</td>
                </tr>
            </tbody>
        </table>
        `;
        
        // 查找員工資訊
        const employee = employees.find(e => e.id === targetValue);
        
        // 添加員工資訊
        if (employee) {
            tableHTML = `
                <div style="margin-bottom: 15px;">
                    <p><strong>員工姓名:</strong> ${employee.name}</p>
                    <p><strong>主要分店:</strong> ${employee.store || '未分配'}</p>
                </div>
            ` + tableHTML;
        }
        
        summaryContent.innerHTML = tableHTML;
    }
}

// --- 新增：渲染分店顏色圖例函數 ---
/**
 * 渲染分店顏色圖例
 */
function renderStoreLegend() {
    const legendContainer = document.getElementById('store-color-legend');
    if (!legendContainer || !stores || stores.length === 0) {
        console.warn("Store legend container not found or no stores loaded.");
        if(legendContainer) legendContainer.innerHTML = ''; // Clear if exists but no stores
        return;
    }

    legendContainer.innerHTML = '<strong>分店顏色:</strong> '; // Title

    stores.forEach((store, index) => {
        const colorClass = `store-${index % 4 + 1}`; // Match calendar color logic
        const legendItem = document.createElement('span');
        legendItem.className = 'legend-item';
        legendItem.style.marginRight = '15px'; // Spacing

        const colorBox = document.createElement('span');
        colorBox.className = `legend-color-box ${colorClass}`;
        colorBox.style.display = 'inline-block';
        colorBox.style.width = '15px';
        colorBox.style.height = '15px';
        colorBox.style.marginRight = '5px';
        colorBox.style.verticalAlign = 'middle';
        // Assuming CSS classes store-1, store-2, etc. define background-color

        legendItem.appendChild(colorBox);
        legendItem.appendChild(document.createTextNode(store));
        legendContainer.appendChild(legendItem);
    });
}
// --- 結束新增 --- 

// --- NEW: Function to Check and Display Scheduling System Status ---
/**
 * Checks the scheduling system status from Firestore and updates the UI panel.
 * @param {object} firestore - Firestore instance.
 * @param {object} user - Current user object.
 */
async function checkAndDisplaySchedulingStatus(firestore, user) {
    // Make sure UI elements exist - create them if missing
    ensureSchedulingUIElements();
    
    if (!firestore || !statusTextElement || !enterSchedulingButton || !timerTextElement) {
        console.error("錯誤：缺少必要元件");
        if (statusTextElement) statusTextElement.textContent = "錯誤：缺少必要元件";
        return;
    }

    // Set initial state while fetching
    statusTextElement.textContent = '檢查中...';
    enterSchedulingButton.textContent = '檢查狀態中...';
    enterSchedulingButton.className = 'scheduling-access-button closed';
    enterSchedulingButton.disabled = true;
    timerTextElement.textContent = '';

    try {
        const configDocRef = firestore.collection('settings').doc('schedule_config');
        const configSnap = await configDocRef.get();

        if (!configSnap.exists) {
            throw new Error("找不到排班系統設定。");
        }

        scheduleConfigData = configSnap.data(); // Store config globally
        const config = scheduleConfigData;
        const now = new Date();

        let status = '未知';
        let buttonText = '無法使用';
        let buttonClass = 'closed';
        let buttonEnabled = false;
        
        // Clear any existing countdown timer
        if (window.scheduleTimerInterval) {
            clearInterval(window.scheduleTimerInterval);
            window.scheduleTimerInterval = null;
        }

        if (config.enableLocking === false) {
            status = '系統已停用';
            timerTextElement.textContent = '';
        } else if (config.isLocked === true) {
            status = `系統使用中 (由 ${config.lockedByName || '未知使用者'} 鎖定)`;
            buttonText = '系統使用中';
            
            if (config.lockExpiresAt) {
                const expires = config.lockExpiresAt.toDate();
                
                // Update timer immediately
                updateLockTimer(expires);
                
                // Set interval to update timer every second
                window.scheduleTimerInterval = setInterval(() => {
                    updateLockTimer(expires);
                }, 1000);
            }
        } else {
            // Check time window if not locked
            let windowStart = null;
            let windowEnd = null;
            try { windowStart = config.windowStart ? new Date(config.windowStart) : null; } catch(e){ console.warn("Invalid windowStart format"); }
            try { windowEnd = config.windowEnd ? new Date(config.windowEnd) : null; } catch(e){ console.warn("Invalid windowEnd format"); }

            if (windowStart && windowEnd && now >= windowStart && now <= windowEnd) {
                status = '系統開放排班';
                buttonText = '進入排班系統';
                buttonClass = 'open';
                buttonEnabled = true;
                
                // Update timer immediately
                updateWindowEndTimer(windowEnd);
                
                // Set interval to update timer every second
                window.scheduleTimerInterval = setInterval(() => {
                    updateWindowEndTimer(windowEnd);
                }, 1000);
            } else if (windowStart && now < windowStart) {
                status = '系統尚未開放';
                buttonText = '尚未開放';
                
                // Update timer immediately
                updateWindowStartTimer(windowStart);
                
                // Set interval to update timer every second
                window.scheduleTimerInterval = setInterval(() => {
                    updateWindowStartTimer(windowStart);
                }, 1000);
            } else {
                status = '系統已關閉';
                buttonText = '系統已關閉';
                timerTextElement.textContent = windowEnd ? `開放時間已於 ${formatTimestamp(windowEnd.toISOString(), 'YYYY-MM-DD HH:mm')} 結束` : '未設定開放時間。';
            }
        }

        // Update UI elements
        statusTextElement.textContent = status;
        enterSchedulingButton.textContent = buttonText;
        enterSchedulingButton.className = `scheduling-access-button ${buttonClass}`;
        enterSchedulingButton.disabled = !buttonEnabled;
        
        // Always apply the gray color to the button
        if (!buttonEnabled) {
            enterSchedulingButton.style.backgroundColor = '#6c757d';
            enterSchedulingButton.style.color = '#fff';
        }

    } catch (error) {
        console.error("Error checking scheduling status:", error);
        statusTextElement.textContent = '狀態檢查錯誤';
        timerTextElement.textContent = `錯誤: ${error.message || '未知錯誤'}`;
        enterSchedulingButton.disabled = true;
    }
}

/**
 * Ensures all required UI elements for the scheduling panel exist
 * Creates them if they're missing
 */
function ensureSchedulingUIElements() {
    // Check for panel
    const schedulingPanel = document.getElementById('scheduling-access-panel');
    if (!schedulingPanel) {
        console.warn("Creating missing scheduling panel");
        const panelContainer = document.createElement('div');
        panelContainer.id = 'scheduling-access-panel';
        panelContainer.style = 'margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;';
        
        const panelTitle = document.createElement('h3');
        panelTitle.textContent = '排班系統狀態';
        panelContainer.appendChild(panelTitle);
        
        // Create status text element
        statusTextElement = document.createElement('p');
        statusTextElement.id = 'scheduling-system-status-text';
        statusTextElement.style = 'font-size: 1.1em; margin-bottom: 10px;';
        statusTextElement.textContent = '檢查中...';
        panelContainer.appendChild(statusTextElement);
        
        // Create button
        enterSchedulingButton = document.createElement('button');
        enterSchedulingButton.id = 'enter-scheduling-button';
        enterSchedulingButton.className = 'scheduling-access-button closed';
        enterSchedulingButton.style = 'background-color: #6c757d; color: #fff;';
        enterSchedulingButton.disabled = true;
        enterSchedulingButton.textContent = '檢查狀態中...';
        panelContainer.appendChild(enterSchedulingButton);
        
        // Create timer text
        timerTextElement = document.createElement('p');
        timerTextElement.id = 'scheduling-timer-text';
        timerTextElement.style = 'margin-top: 10px; font-size: 0.9em; color: #555;';
        panelContainer.appendChild(timerTextElement);
        
        // Add to DOM - try to add to calendar container or summary container first
        const calendarContainer = document.getElementById('calendar-container');
        if (calendarContainer) {
            calendarContainer.parentNode.appendChild(panelContainer);
        } else {
            // Fallback to add to main container
            const container = document.querySelector('.container');
            if (container) {
                container.appendChild(panelContainer);
            } else {
                console.error("無法創建排班系統面板：找不到容器元素");
            }
        }
    } else {
        // Get references to existing elements
        statusTextElement = document.getElementById('scheduling-system-status-text');
        enterSchedulingButton = document.getElementById('enter-scheduling-button');
        timerTextElement = document.getElementById('scheduling-timer-text');
    }
    
    // Add event listener to button if it exists
    if (enterSchedulingButton && !enterSchedulingButton._hasClickListener) {
        enterSchedulingButton.addEventListener('click', handleEnterSchedulingClick);
        enterSchedulingButton._hasClickListener = true;
    }
}

/**
 * Updates the lock timer display
 * @param {Date} expiresAt - The lock expiration date
 */
function updateLockTimer(expiresAt) {
    if (!timerTextElement) return;
    
    const now = new Date();
    const diffSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    
    if (diffSeconds <= 0) {
        timerTextElement.textContent = '鎖定已過期';
        if (window.scheduleTimerInterval) {
            clearInterval(window.scheduleTimerInterval);
            window.scheduleTimerInterval = null;
        }
    } else {
        timerTextElement.textContent = `鎖定剩餘時間: ${Math.floor(diffSeconds / 60)}:${String(diffSeconds % 60).padStart(2, '0')}`;
    }
}

/**
 * Updates the window end timer display
 * @param {Date} windowEnd - The scheduling window end date
 */
function updateWindowEndTimer(windowEnd) {
    if (!timerTextElement) return;
    
    const now = new Date();
    const diffSeconds = Math.max(0, Math.floor((windowEnd.getTime() - now.getTime()) / 1000));
    
    if (diffSeconds <= 0) {
        timerTextElement.textContent = '開放時間已結束';
        if (window.scheduleTimerInterval) {
            clearInterval(window.scheduleTimerInterval);
            window.scheduleTimerInterval = null;
        }
    } else {
        const hours = Math.floor(diffSeconds / 3600);
        const minutes = Math.floor((diffSeconds % 3600) / 60);
        const seconds = diffSeconds % 60;
        timerTextElement.textContent = `開放時間結束倒數: ${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

/**
 * Updates the window start timer display
 * @param {Date} windowStart - The scheduling window start date
 */
function updateWindowStartTimer(windowStart) {
    if (!timerTextElement) return;
    
    const now = new Date();
    const diffSeconds = Math.max(0, Math.floor((windowStart.getTime() - now.getTime()) / 1000));
    
    if (diffSeconds <= 0) {
        timerTextElement.textContent = '開放時間已開始';
        if (window.scheduleTimerInterval) {
            clearInterval(window.scheduleTimerInterval);
            window.scheduleTimerInterval = null;
        }
    } else {
        const hours = Math.floor(diffSeconds / 3600);
        const minutes = Math.floor((diffSeconds % 3600) / 60);
        const seconds = diffSeconds % 60;
        timerTextElement.textContent = `距離開放時間還有: ${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

// --- Helper function (ensure it exists or define it) ---
// Basic formatTimestamp if not available globally
if (typeof formatTimestamp === 'undefined') {
     function formatTimestamp(isoString, format = 'YYYY-MM-DD HH:mm') {
         if (!isoString) return 'N/A';
         try {
             const date = new Date(isoString);
             const year = date.getFullYear();
             const month = (date.getMonth() + 1).toString().padStart(2, '0');
             const day = date.getDate().toString().padStart(2, '0');
             const hours = date.getHours().toString().padStart(2, '0');
             const minutes = date.getMinutes().toString().padStart(2, '0');
             if (format === 'YYYY-MM-DD HH:mm') {
                 return `${year}-${month}-${day} ${hours}:${minutes}`;
             } else if (format === 'YYYY-MM-DD') {
                 return `${year}-${month}-${day}`;
             }
             return date.toLocaleString(); // Fallback
         } catch (e) {
             console.warn("Error formatting timestamp (local helper):", e);
             return 'Invalid Date';
         }
     }
} 

// --- NEW: Function to Handle Enter Scheduling Button Click ---
/**
 * Handles the click event for the "Enter Scheduling System" button.
 */
async function handleEnterSchedulingClick() {
    console.log("Enter Scheduling button clicked.");
    if (!scheduleConfigData || !scheduleView_requestScheduleLockCallable) {
        alert('系統尚未就緒或設定未載入，請稍候再試。');
        console.error("Cannot enter scheduling: config data or callable missing.");
        return;
    }

    // Double check conditions under which the button should be enabled
    const isEnabled = !enterSchedulingButton.disabled;
    const isOpenStatus = statusTextElement.textContent === '系統開放排班'; // Check the displayed status

    if (!isEnabled || !isOpenStatus) {
        alert('排班系統目前未開放或無法進入。');
        console.warn("Attempted to enter scheduling when button was disabled or status not open.");
        // Refresh status just in case
        if (typeof db !== 'undefined' && currentUser) { // Check if db and currentUser are available
             checkAndDisplaySchedulingStatus(db, currentUser);
        }
        return;
    }

    enterSchedulingButton.disabled = true;
    enterSchedulingButton.textContent = '正在請求鎖定...';

    try {
        console.log("Attempting to acquire lock via scheduleView_requestScheduleLockCallable...");
        const result = await scheduleView_requestScheduleLockCallable();

        if (result.data.success) {
            console.log("Lock acquired successfully!");
            // --- SUCCESS: Open Modal AND Load Interface --- 
            const modal = document.getElementById('leave-request-modal');
            const modalContentArea = document.getElementById('leave-modal-content-area');
            const modalMessageArea = document.getElementById('leave-modal-message'); // Get modal message area

            if (modal && modalContentArea && modalMessageArea) {
                modalContentArea.innerHTML = '<p>成功取得鎖定，正在載入排班介面...</p>';
                modalMessageArea.textContent = ''; // Clear previous modal messages
                modalMessageArea.className = 'message info-message'; // Reset class
                modal.style.display = 'flex'; // Show the modal first

                try {
                    // Fetch the content of leave.html
                    const response = await fetch('leave.html');
                    if (!response.ok) {
                        throw new Error(`無法載入排班介面: ${response.statusText}`);
                    }
                    const htmlText = await response.text();

                    // Parse the HTML text into a temporary DOM structure
                    const parser = new DOMParser();
                    const leaveDoc = parser.parseFromString(htmlText, 'text/html');

                    // Extract required elements from the parsed document
                    const monthSelector = leaveDoc.getElementById('month-selector');
                    const leaveRules = leaveDoc.getElementById('leave-rules');
                    const calendarContainer = leaveDoc.getElementById('calendar-container');
                    const selectedSummary = leaveDoc.getElementById('selected-summary');
                    const existingScheduleSummary = leaveDoc.getElementById('existing-schedule-summary'); // Keep this?
                    const submitButton = leaveDoc.getElementById('submit-leave-request');
                    const leaveMessage = leaveDoc.getElementById('leave-message'); // The message area specific to leave submit
                    
                    // Build the HTML string to inject
                    let injectedHTML = '';
                    if (monthSelector) injectedHTML += monthSelector.outerHTML;
                    if (leaveRules) injectedHTML += leaveRules.outerHTML;
                    if (calendarContainer) injectedHTML += calendarContainer.outerHTML;
                    if (selectedSummary) injectedHTML += selectedSummary.outerHTML;
                    if (existingScheduleSummary) injectedHTML += existingScheduleSummary.outerHTML; // Include if still desired
                    if (submitButton) injectedHTML += submitButton.outerHTML;
                    if (leaveMessage) injectedHTML += leaveMessage.outerHTML;
                    
                    if (!injectedHTML) {
                         throw new Error("無法從 leave.html 中提取必要的介面元素。");
                    }

                    // Inject the HTML into the modal content area
                    modalContentArea.innerHTML = injectedHTML;

                    // --- Initialize the leave logic within the modal --- 
                    console.log("Attempting to initialize leave interface inside modal...");
                    // Ensure initLeavePageForModal exists and is callable
                    if (typeof initLeavePageForModal === 'function') {
                        // Pass necessary context: modal content area, current user, db instance
                         if (typeof db !== 'undefined' && currentUser) {
                            await initLeavePageForModal(modalContentArea, currentUser, db);
                            console.log("Leave interface initialized in modal.");
                        } else {
                             throw new Error("無法初始化排班介面：缺少資料庫或使用者資訊。");
                        }
                    } else {
                        console.error("initLeavePageForModal function is not defined! Cannot initialize modal interface.");
                        throw new Error("排班介面載入不完整 (缺少初始化函數)。");
                    }

                } catch (loadError) {
                    console.error("Error loading or initializing leave interface in modal:", loadError);
                    modalContentArea.innerHTML = `<p style="color:red;">載入排班介面失敗: ${loadError.message}</p>`;
                    // Keep the modal open to show the error, but maybe close after delay?
                    // We should still release the lock if the interface fails to load
                    if (scheduleView_releaseScheduleLockCallable) {
                         console.log("Releasing lock due to interface load failure.");
                         try { await scheduleView_releaseScheduleLockCallable(); } catch(e){ console.error("Error releasing lock on load failure:", e);}
                         // Refresh status panel after releasing lock
                         if (typeof db !== 'undefined' && currentUser) {
                             checkAndDisplaySchedulingStatus(db, currentUser);
                         }
                    }
                }

                 // Update status panel to show lock held by current user (might be redundant if check called above)
                 if (typeof db !== 'undefined' && currentUser) {
                    checkAndDisplaySchedulingStatus(db, currentUser);
                 }
            } else {
                console.error("Leave request modal not found!");
                alert("成功取得鎖定，但無法開啟排班視窗。請聯絡管理員。");
                 // Attempt to release the lock since UI failed
                 if (scheduleView_releaseScheduleLockCallable) {
                     try { await scheduleView_releaseScheduleLockCallable(); } catch(e){}
                 }
                 enterSchedulingButton.disabled = false; // Re-enable button
                 enterSchedulingButton.textContent = '進入排班系統';
            }
            // Keep the button disabled while the modal is open

        } else {
            console.warn("Failed to acquire lock:", result.data.message);
            alert(`無法進入排班系統：${result.data.message || '可能已被他人鎖定或系統關閉'}`);
            // Re-enable button and refresh status
            enterSchedulingButton.disabled = false;
            if (typeof db !== 'undefined' && currentUser) {
                 checkAndDisplaySchedulingStatus(db, currentUser);
            }
        }
    } catch (error) {
        console.error("Error during handleEnterSchedulingClick:", error);
        alert(`請求鎖定時發生錯誤：${error.message || '未知錯誤'}`);
        // Re-enable button and refresh status
        enterSchedulingButton.disabled = false;
        if (typeof db !== 'undefined' && currentUser) {
             checkAndDisplaySchedulingStatus(db, currentUser);
        }
    }
}
// --- END NEW ---

// --- NEW: Function to Handle Closing the Leave Modal ---
/**
 * Handles closing the leave request modal and releasing the lock.
 */
async function handleCloseLeaveModal() {
    console.log("Closing leave modal.");
    const modal = document.getElementById('leave-request-modal');
    if (modal) {
        modal.style.display = 'none';
        // Clear the content area?
        const modalContentArea = document.getElementById('leave-modal-content-area');
        if (modalContentArea) {
            modalContentArea.innerHTML = '<p>正在載入排班介面...</p>'; // Reset content
        }
    }

    // Attempt to release the lock
    if (scheduleView_releaseScheduleLockCallable) {
        try {
            console.log("Attempting to release lock via scheduleView_releaseScheduleLockCallable...");
            await scheduleView_releaseScheduleLockCallable();
            console.log("Lock released successfully after closing modal.");
        } catch (error) {
            console.error("Error releasing lock after closing modal:", error);
            alert("關閉排班視窗時釋放鎖定失敗，系統狀態可能未更新。請稍後再試或聯絡管理員。");
        }
    } else {
        console.warn("Cannot release lock: scheduleView_releaseScheduleLockCallable not defined.");
    }

    // Refresh the status panel display
     if (typeof db !== 'undefined' && currentUser) { // Check if db and currentUser are available
        await checkAndDisplaySchedulingStatus(db, currentUser);
     }
}
// --- END NEW --- 