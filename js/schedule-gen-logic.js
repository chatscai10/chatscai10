// js/schedule-gen-logic.js - 自動排班模擬頁面邏輯 (修正版 + 工時平衡)

'use strict';

// --- 全域變數 ---
let currentUser = null;
let scheduleConfig = null; // 從 Firestore settings 讀取的排班參數
let employeesData = [];   // 從 Firestore employees 讀取的員工列表 {id, name, store, level}
let leaveData = {};       // 從 Firestore leave_requests 處理後的休假資料 {'YYYY-MM-DD': Set<empId>}
let generatedSchedule = null; // 儲存模擬結果 {'YYYY-MM-DD': {'StoreA': [empName1,...], ...}}

// DOM 元素引用
let targetMonthDisplay, paramsDisplay, runButton, statusMessage, calendarContainer, analysisContainer;

// --- 初始化 ---
/**
 * 初始化模擬頁面
 * @param {object} user - 當前登入使用者
 */
async function initSimPage(user) {
    currentUser = user;
    console.log("Initializing Simulation Page for:", user.name);

    // 獲取 DOM 元素
    targetMonthDisplay = document.getElementById('sim-target-month');
    paramsDisplay = document.getElementById('sim-params-display');
    runButton = document.getElementById('run-simulation-btn');
    statusMessage = document.getElementById('sim-status-message');
    calendarContainer = document.getElementById('sim-calendar-container');
    analysisContainer = document.getElementById('sim-analysis-content'); // <--- 確保獲取分析區

    // 檢查元素是否存在
    if (!runButton || !targetMonthDisplay || !calendarContainer || !statusMessage || !analysisContainer) {
        console.error("Required simulation page elements not found.");
        if (statusMessage) statusMessage.textContent = "頁面元件載入錯誤。";
        return;
    }

    // 綁定執行按鈕事件
    runButton.addEventListener('click', runSchedulingSimulation);

    // 載入並顯示設定檔
    statusMessage.textContent = '正在載入排班設定...';
    analysisContainer.innerHTML = '<p>請先產生模擬班表以查看分析。</p>';
    await fetchAndDisplayConfig(); // 載入設定以啟用按鈕
    if (scheduleConfig?.排班月份) {
        runButton.textContent = `產生 ${scheduleConfig.排班月份} 模擬班表`;
        runButton.disabled = false;
        statusMessage.textContent = '設定載入完成，可以開始模擬。';
    } else {
        runButton.textContent = '無法執行模擬';
        statusMessage.textContent = '錯誤：未找到有效的排班月份設定或讀取失敗。'; // 更新錯誤訊息
    }
}

/**
 * 獲取並顯示排班設定 (修正版)
 */
async function fetchAndDisplayConfig() {
    const configDocId = "schedule_config";
    try {
        // 確保 db 可用 (來自 firebase-config.js 或全域)
        if (typeof db === 'undefined') throw new Error("Firestore (db) is not available.");

        const docRef = db.collection('settings').doc(configDocId);
        const docSnap = await docRef.get();

        // --- >>> 關鍵修正：使用 docSnap.exists 屬性 <<< ---
        if (docSnap.exists) { // <--- 確認這裡沒有括號 ()
            // --- >>> 修正結束 <<< ---
            scheduleConfig = docSnap.data();
            console.log("Schedule config fetched:", scheduleConfig);
            if (targetMonthDisplay) targetMonthDisplay.textContent = scheduleConfig.排班月份 || '未設定';
            if (paramsDisplay) {
                paramsDisplay.innerHTML = `
                     需求: ${scheduleConfig.各分店需求人數 || 'N/A'} |
                     平衡工時: ${scheduleConfig.balanceWorkload ? '是' : '否'} |
                     連上限制: ${scheduleConfig.maxConsecutiveDays > 0 ? scheduleConfig.maxConsecutiveDays : '無'}
                 `;
            }
        } else {
            console.error(`Schedule config document "${configDocId}" not found.`);
            if (targetMonthDisplay) targetMonthDisplay.textContent = '錯誤';
            if (paramsDisplay) paramsDisplay.textContent = '無法載入排班參數(文件不存在)。';
            scheduleConfig = null; // 設定為 null 很重要
        }
    } catch (error) {
        console.error("Error fetching schedule config:", error);
        if (targetMonthDisplay) targetMonthDisplay.textContent = '錯誤';
        if (paramsDisplay) paramsDisplay.textContent = '讀取參數時發生錯誤。';
        scheduleConfig = null; // 出錯時也要設為 null
    }
}

/**
 * 獲取員工資料
 */
async function fetchEmployees() {
    console.log("Fetching employees...");
    try {
        if (typeof db === 'undefined') throw new Error("Firestore (db) is not available.");
        employeesData = [];
        const querySnapshot = await db.collection('employees').get();
        querySnapshot.forEach(doc => {
            const data = doc.data();
            employeesData.push({ id: data.id, name: data.name, store: data.store, level: data.level ?? 0 });
        });
        console.log(`Workspaceed ${employeesData.length} employees.`); // 修正拼寫
    } catch (error) {
        console.error("Error fetching employees:", error);
        throw new Error("讀取員工資料時發生錯誤。");
    }
}

/**
 * 獲取指定月份的休假請求
 * @param {string} targetMonth - 目標月份 'YYYY-MM'
 */
async function fetchLeaveRequests(targetMonth) {
    console.log(`Workspaceing leave requests for month: ${targetMonth}...`); // 修正拼寫
    leaveData = {};
    try {
        if (typeof db === 'undefined') throw new Error("Firestore (db) is not available.");
        const querySnapshot = await db.collection('leave_requests').where('month', '==', targetMonth).get();
        querySnapshot.forEach(doc => {
            const req = doc.data(); const empId = req.id;
            if (req.selected_dates && Array.isArray(req.selected_dates)) {
                req.selected_dates.forEach(dateStr => { if (!leaveData[dateStr]) leaveData[dateStr] = new Set(); leaveData[dateStr].add(empId); });
            }
        });
        console.log(`Processed leave requests for ${querySnapshot.size} documents for month ${targetMonth}.`);
    } catch (error) {
        console.error("Error fetching leave requests:", error);
        throw new Error(`讀取 ${targetMonth} 休假資料時發生錯誤。`);
    }
}



// --- 核心排班模擬邏輯 (加入連上X休Y規則) ---
async function runSchedulingSimulation() {
    if (!scheduleConfig?.排班月份) {
        statusMessage.textContent = "錯誤：無法讀取排班設定。"; return
            ;
    }
    if (!runButton || !statusMessage || !calendarContainer || !analysisContainer) {
        console.error("Sim elements missing."); return
            ;
    }
    runButton.disabled =
        true; runButton.textContent = '模擬中...'; statusMessage.textContent = '1/4 準備資料...'
        ;
    calendarContainer.innerHTML =
        '<p>產生中...</p>'; analysisContainer.innerHTML = '<p>計算中...</p>'
        ;

    try {
        const
            targetMonth = scheduleConfig.排班月份;
        statusMessage.textContent =
            '2/4 讀取員工與休假...'
            ;
        await Promise
            .all([fetchEmployees(), fetchLeaveRequests(targetMonth)]);
        if (employeesData.length === 0) throw new Error("沒有員工資料"
        );

        statusMessage.textContent =
            '3/4 執行排班演算法...'
            ;
        const [year, monthNum] = targetMonth.split('-').map(Number
        );
        const monthIndex = monthNum - 1
            ;
        const lastDayOfMonth = new Date(year, monthNum, 0
        ).getDate();
        const
            reqMap = parseStoreRequirements(scheduleConfig.各分店需求人數);
        const forbiddenDates = new Set(scheduleConfig.本月禁休日期?.split(',').map(d => d.trim()).filter(d =>
            d) || []);
        const holidayDates = new Set(scheduleConfig.本月公休日期?.split(',').map(d => d.trim()).filter(d =>
            d) || []);

        // --- 讀取並初始化演算法控制參數和狀態追蹤 ---
        const balanceWorkload = scheduleConfig.balanceWorkload === true
            ;
        const enableConsecutiveRule = scheduleConfig.enableConsecutiveRule === true
            ;
        const consecutiveWorkLimit = parseInt(scheduleConfig.consecutiveWorkLimit, 10) || 0; // X
        const mandatoryRestDays = parseInt(scheduleConfig.mandatoryRestDays, 10) || 0;    // Y
        console.log(`Algorithm settings: balanceWorkload=${balanceWorkload}, consecutiveRule=${enableConsecutiveRule}, X=${consecutiveWorkLimit}, Y=${mandatoryRestDays}`
        );

        generatedSchedule = {};
        const dailyAssignments = {}; // {'YYYY-MM-DD': Set<empId>}
        const monthlyWorkdayCounts = {}; // { empId: count }
        const consecutiveWorkCounts = {}; // { empId: current_streak }
        const mandatoryRestRemaining = {}; // { empId: days_left_to_rest }
        employeesData.forEach(
            emp => {
                if (emp.level !== 0
                ) {
                    monthlyWorkdayCounts[emp.id] =
                        0
                        ;
                    consecutiveWorkCounts[emp.id] =
                        0
                        ;
                    mandatoryRestRemaining[emp.id] =
                        0
                        ;
                }
            });
        // --- 初始化結束 ---

        // --- 演算法主迴圈 ---
        for (let day = 1
            ; day <= lastDayOfMonth; day++) {
            const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                ;
            generatedSchedule[dateStr] = {};
            dailyAssignments[dateStr] =
                new Set(); // 當天已分配的人

            const
                isHolidayOrForbidden = forbiddenDates.has(dateStr) || holidayDates.has(dateStr);
            if
                (isHolidayOrForbidden) {
                generatedSchedule[dateStr][
                    'status'] = forbiddenDates.has(dateStr) ? '禁休' : '公休'
                    ;
                // 公/禁休也要更新連休和強制休息狀態
            }

            // 在分配當天班別前，先處理強制休息日數
            if (enableConsecutiveRule && mandatoryRestDays > 0
            ) {
                for (const empId in
                    mandatoryRestRemaining) {
                    // 如果今天不是公/禁休日，且員工在強制休息期，則休息日數減 1
                    if (!isHolidayOrForbidden && mandatoryRestRemaining[empId] > 0
                    ) {
                        mandatoryRestRemaining[empId]--;
                    }
                }
            }


            if (!isHolidayOrForbidden) { // 只在非公/禁休日排班
                for (const storeName in
                    reqMap) {
                    const
                        numNeeded = reqMap[storeName];
                    generatedSchedule[dateStr][storeName] = [];
                    let assignedCount = 0
                        ;

                    // 找出當天合格員工
                    const eligibleEmployeesToday = employeesData.filter(emp => {
                        const isActive = emp.level && emp.level > 0
                            ;
                        const isOnLeave = leaveData[dateStr]?.has(emp.id) ?? false
                            ;
                        const
                            isAlreadyAssigned = dailyAssignments[dateStr].has(emp.id);

                        // --- >>> 新增：連上/休假規則檢查 <<< ---
                        let isAvailableConsecutive = true
                            ;
                        if
                            (enableConsecutiveRule) {
                            // 1. 檢查是否在強制休息期
                            if ((mandatoryRestRemaining[emp.id] || 0) > 0
                            ) {
                                isAvailableConsecutive =
                                    false
                                    ;
                            }
                            // 2. 檢查是否達到連上天數上限 (僅在 X > 0 時檢查)
                            else if (consecutiveWorkLimit > 0 && (consecutiveWorkCounts[emp.id] || 0
                            ) >= consecutiveWorkLimit) {
                                isAvailableConsecutive =
                                    false
                                    ;
                            }
                        }
                        // --- >>> 新增結束 <<< ---

                        return isActive && !isOnLeave && !isAlreadyAssigned && isAvailableConsecutive; // 加入連上規則判斷
                    });

                    // 分組、排序/打亂、分配... (這部分邏輯與上一版本類似)
                    let storeMatchedEmployees = eligibleEmployeesToday.filter(emp =>
                        emp.store === storeName);
                    let floaterEmployees = eligibleEmployeesToday.filter(emp => emp.store === '待命' || emp.store === '兼職'
                    );

                    if (balanceWorkload) {
                        const sortFn = (a, b) => (monthlyWorkdayCounts[a.id] || 0) - (monthlyWorkdayCounts[b.id] || 0
                        ); storeMatchedEmployees.sort(sortFn); floaterEmployees.sort(sortFn);
                    }
                    else { shuffleArray(storeMatchedEmployees); shuffleArray(floaterEmployees); }

                    // 分配函數 (內部使用, 加入狀態更新)
                    const assignEmployee = (employee) => {
                        if
                            (assignedCount < numNeeded) {
                            generatedSchedule[dateStr][storeName].push(employee.name);
                            dailyAssignments[dateStr].add(employee.id);
                            monthlyWorkdayCounts[employee.id]++;
                            // --- >>> 新增：更新連上天數 & 觸發強制休息 <<< ---
                            consecutiveWorkCounts[employee.id]++;
                            if (enableConsecutiveRule && consecutiveWorkLimit > 0
                                && consecutiveWorkCounts[employee.id] >= consecutiveWorkLimit) {
                                mandatoryRestRemaining[employee.id] = mandatoryRestDays;
                                // 開始強制休息
                                console.log(`Employee ${employee.name} reached consecutive limit ${consecutiveWorkLimit}, starting ${mandatoryRestDays} rest days.`
                                );
                            }
                            // --- >>> 新增結束 <<< ---
                            assignedCount++;
                            return true
                                ;
                        }
                        return false
                            ;
                    };

                    while (storeMatchedEmployees.length > 0
                        && assignedCount < numNeeded) { assignEmployee(storeMatchedEmployees.shift()); }
                    while (floaterEmployees.length > 0 && assignedCount < numNeeded) {
                        if (!dailyAssignments[dateStr].has(floaterEmployees[0].id)) { assignEmployee(floaterEmployees.shift()); } else { floaterEmployees.shift(); }
                    }
                    while (assignedCount < numNeeded) {
                        generatedSchedule[dateStr][storeName].push("(空缺)"
                        ); assignedCount++;
                    }

                }
                // End loop stores
            }
            // End if not holiday/forbidden

            // --- >>> 新增：每日結束後，更新未上班者的狀態 <<< ---
            for (const empId in
                consecutiveWorkCounts) {
                // 如果員工今天沒有被排班 (且今天不是公休/禁休讓他本來就不能上)
                if
                    (!dailyAssignments[dateStr].has(empId) && !isHolidayOrForbidden) {
                    // 且他不是正在強制休息中 (正在休息的人 streak 保持，等休息完才重置)
                    if ((mandatoryRestRemaining[empId] || 0) === 0
                    ) {
                        consecutiveWorkCounts[empId] =
                            0; // 重置連續上班天數
                    }
                }
            }
            // --- >>> 新增結束 <<< ---

        }
        // End loop days
        // --- 演算法結束 ---

        console.log("Scheduling algorithm finished."
        );
        statusMessage.textContent =
            '4/4 渲染結果與分析...'
            ;
        renderScheduleCalendar(year, monthNum, generatedSchedule, holidayDates, forbiddenDates);
        calculateAndRenderAnalysis(generatedSchedule, employeesData, year, monthNum, leaveData, monthlyWorkdayCounts, consecutiveWorkCounts);
        // 傳入連上天數用於最終驗證 (可選)
        statusMessage.textContent =
            '模擬完成！'
            ;

    }
    catch (error) { /* ... (錯誤處理保持不變) ... */
    }
    finally {
        runButton.disabled = false; runButton.textContent = `產生 ${scheduleConfig?.排班月份 || '?'} 模擬班表`
            ;
    }
}



// --- 渲染與分析函數 ---
function renderScheduleCalendar(year, month, scheduleResult, holidayDates, forbiddenDates) {
    if (!calendarContainer) { console.error("calendarContainer not found for rendering calendar!"); return; }
    calendarContainer.innerHTML = '';
    const monthIndex = month - 1; const daysOfWeek = ['日', '一', '二', '三', '四', '五', '六']; daysOfWeek.forEach(d => { const h = document.createElement('div'); h.className = 'sim-day-header'; h.textContent = d; calendarContainer.appendChild(h); });
    const firstDayOfMonth = new Date(year, monthIndex, 1); const lastDayOfMonth = new Date(year, month, 0).getDate(); const firstDayWeekday = firstDayOfMonth.getDay(); const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < firstDayWeekday; i++) { const e = document.createElement('div'); e.className = 'sim-day-cell other-month'; calendarContainer.appendChild(e); }
    for (let day = 1; day <= lastDayOfMonth; day++) {
        const cell = document.createElement('div'); cell.className = 'sim-day-cell'; const numSpan = document.createElement('span'); numSpan.className = 'day-number'; numSpan.textContent = day; cell.appendChild(numSpan); const assignDiv = document.createElement('div'); assignDiv.className = 'assignments';
        const cur = new Date(year, monthIndex, day); const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const wd = cur.getDay();
        if (wd === 0 || wd === 6) cell.classList.add('weekend'); if (cur < today) cell.classList.add('past-day');
        if (forbiddenDates.has(dateStr)) { cell.classList.add('forbidden'); assignDiv.innerHTML = '<strong style="color:red;">禁休</strong>'; }
        else if (holidayDates.has(dateStr)) { cell.classList.add('holiday'); assignDiv.innerHTML = '<strong style="color:blue;">公休</strong>'; }
        else if (scheduleResult[dateStr]) { const dailySch = scheduleResult[dateStr]; for (const sn in dailySch) { if (sn === 'status') continue; const assigns = dailySch[sn]; const sh = document.createElement('strong'); sh.textContent = sn; assignDiv.appendChild(sh); if (assigns.length > 0) { assigns.forEach(en => { const s = document.createElement('span'); s.textContent = en; if (en === "(空缺)") s.className = 'unassigned-slot'; assignDiv.appendChild(s); }); } else { const s = document.createElement('span'); s.textContent = '(無)'; s.className = 'unassigned-slot'; assignDiv.appendChild(s); } } }
        else { assignDiv.textContent = '(無資料)'; }
        cell.appendChild(assignDiv); calendarContainer.appendChild(cell);
    }
}

function calculateAndRenderAnalysis(scheduleResult, employees, year, monthNum, leaveMap, monthlyWorkCounts) {
    if (!analysisContainer) { console.error("analysisContainer not found for rendering analysis!"); return; }
    analysisContainer.innerHTML = '<p>計算分析中...</p>';
    const monthIndex = monthNum - 1; const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
    const analysisData = {};

    // 初始化 analysisData, 包含總工時
    employees.forEach(emp => { if (emp.level !== 0) { analysisData[emp.name] = { storeDays: {}, totalDays: monthlyWorkCounts[emp.id] || 0, maxStreak: 0, currentStreak: 0, conflicts: [], id: emp.id }; } });

    // 重新計算 storeDays 分佈 和 計算 連續天數/衝突
    for (const empName in analysisData) { analysisData[empName].storeDays = {}; } // 清空 storeDays 以重新計算

    for (let day = 1; day <= lastDayOfMonth; day++) {
        const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dailyRes = scheduleResult[dateStr] || {};
        const dailyAssigned = new Map(); // 當天被分配的員工 Map<empName, storeName>

        // 累加分店天數並檢查衝突
        for (const storeName in dailyRes) {
            if (storeName === 'status') continue;
            dailyRes[storeName].forEach(empName => {
                if (empName !== "(空缺)" && analysisData[empName]) {
                    // 累加 storeDays
                    if (!analysisData[empName].storeDays[storeName]) analysisData[empName].storeDays[storeName] = 0;
                    analysisData[empName].storeDays[storeName]++;
                    // 檢查衝突
                    if (dailyAssigned.has(empName)) { const es = dailyAssigned.get(empName); if (es !== storeName) { const ci = `${day}日(${storeName} vs ${es})`; if (!analysisData[empName].conflicts.includes(ci)) analysisData[empName].conflicts.push(ci); console.warn(`Conflict: ${empName} on ${dateStr} (${storeName} vs ${es})`); } } else { dailyAssigned.set(empName, storeName); }
                }
            });
        }
        // 計算連續天數
        for (const empName in analysisData) {
            const eid = analysisData[empName].id;
            const isWorkingToday = dailyAssigned.has(empName);
            const isOnLeaveToday = leaveMap[dateStr]?.has(eid) ?? false;
            const isHoliday = holidayDates.has(dateStr); // 公休日不算上班

            if (isWorkingToday && !isOnLeaveToday && !isHoliday) { // 實際上班才算
                analysisData[empName].currentStreak++;
            } else {
                if (analysisData[empName].currentStreak > analysisData[empName].maxStreak) {
                    analysisData[empName].maxStreak = analysisData[empName].currentStreak;
                }
                analysisData[empName].currentStreak = 0; // 中斷連線
            }
        }
    } // End loop days
    // 最後檢查 streak
    for (const en in analysisData) { if (analysisData[en].currentStreak > analysisData[en].maxStreak) analysisData[en].maxStreak = analysisData[en].currentStreak; }

    renderAnalysisTable(analysisContainer, analysisData);
}

function renderAnalysisTable(container, analysisData) {
    if (!container) { console.error("Container not found for rendering analysis table!"); return; }
    container.innerHTML = '';
    const table = document.createElement('table'); table.classList.add('data-table');
    const thead = table.createTHead(); const hr = thead.insertRow();
    const headers = ['員工', '總上班(天)', '分店分佈(天)', '最長連上(天)', '同日衝突'];
    headers.forEach(text => { const th = document.createElement('th'); th.textContent = text; hr.appendChild(th); });
    const tbody = table.createTBody(); const sortedNames = Object.keys(analysisData).sort();
    if (sortedNames.length === 0) { container.innerHTML = '<p>無分析數據。</p>'; return; }
    sortedNames.forEach(empName => {
        const data = analysisData[empName]; const row = tbody.insertRow(); if (data.conflicts.length > 0) row.style.backgroundColor = '#fff0f0';
        row.insertCell().textContent = empName;
        row.insertCell().textContent = data.totalDays; // 顯示總天數
        const storeCell = row.insertCell(); const st = []; for (const s in data.storeDays) st.push(`${s}(${data.storeDays[s]})`); storeCell.textContent = st.join(', ') || '-';
        row.insertCell().textContent = data.maxStreak;
        const conflictCell = row.insertCell(); if (data.conflicts.length > 0) { conflictCell.style.color = 'red'; conflictCell.style.fontWeight = 'bold'; conflictCell.textContent = `是 (${data.conflicts.join(',')})`; conflictCell.title = data.conflicts.join('\n'); } else { conflictCell.textContent = '否'; }
    });
    container.appendChild(table);
}


// --- 輔助函數 ---
function parseStoreRequirements(reqStr) { const m = {}; if (reqStr) reqStr.split(',').forEach(p => { const kv = p.split('='); if (kv.length === 2) { const s = kv[0].trim(), c = parseInt(kv[1].trim()); if (s && !isNaN(c) && c > 0) m[s] = c; } }); return m; }
// --- 修正：加入完整的 formatTimestamp ---
/**
 * 格式化 Firestore Timestamp 為可讀字串 (YYYY/MM/DD HH:MM)
 * @param {firebase.firestore.Timestamp | null | undefined} timestampObject
 * @returns {string}
 */
function formatTimestamp(timestampObject) {
    if (!timestampObject || typeof timestampObject.toDate !== 'function') { return ''; }
    try {
        const date = timestampObject.toDate();
        const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei', hour12: false };
        return new Intl.DateTimeFormat('zh-TW', options).format(date).replace('上午', '').replace('下午', '').trim();
    } catch (e) {
        console.error("Error formatting timestamp:", timestampObject, e);
        return "日期格式錯誤";
    }
}
// 陣列隨機打亂函數 (Fisher-Yates)
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[array[i], array[j]] = [array[j], array[i]]; } }


// --- 啟動 ---
console.log("schedule-gen-logic.js loaded (with workload balancing option).");