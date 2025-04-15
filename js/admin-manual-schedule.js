
'use strict';

let manualSchedule_currentUser = null;
let manualSchedule_db = null;
let manualSchedule_config = null;
let manualSchedule_employees = [];
let manualSchedule_leaveData = {}; // {'YYYY-MM-DD': Set<empId>}
let manualSchedule_stores = []; // 從 config 解析出的分店列表
let manualSchedule_storeNeeds = {}; // {'StoreA': 3, 'StoreB': 2}
let manualSchedule_eligibleEmployees = []; // 緩存符合條件的員工 (含待命、兼職)

/**
 * 載入並初始化手動排班區塊
 * @param {HTMLElement} sectionContainer
 * @param {firebase.firestore.Firestore} db
 * @param {object} user
 */
async function loadManualScheduleSection(sectionContainer, db, user) {
    manualSchedule_currentUser = user;
    manualSchedule_db = db;
    console.log("Loading Manual Schedule Section...");
    const contentContainer = sectionContainer.querySelector('.section-content');
    if (!contentContainer || !manualSchedule_db) {
        console.error("Content container or DB missing for manual schedule.");
        if(contentContainer) contentContainer.innerHTML = '<p style="color:red">載入失敗</p>';
        return;
    }
    contentContainer.innerHTML = '<p>載入設定和員工資料...</p>';

    try {
        // 1. 獲取排班設定
        const configSnap = await manualSchedule_db.collection('settings').doc('schedule_config').get();
        if (!configSnap.exists) throw new Error("找不到排班設定 (settings/schedule_config)");
        manualSchedule_config = configSnap.data();

        if (!manualSchedule_config.排班月份 || !manualSchedule_config.各分店需求人數) {
             throw new Error("排班設定中缺少 '排班月份' 或 '各分店需求人數'");
        }
        const targetMonth = manualSchedule_config.排班月份;

        // 解析分店和需求
        manualSchedule_storeNeeds = parseStoreRequirements(manualSchedule_config.各分店需求人數);
        manualSchedule_stores = Object.keys(manualSchedule_storeNeeds);
        if (manualSchedule_stores.length === 0) {
             throw new Error("無法從設定中解析出有效的分店及需求人數");
        }

        // 2. 並行獲取員工和休假資料
        await Promise.all([
            fetchAllEmployees(), // 獲取所有員工
            fetchMonthLeaveRequests(targetMonth) // 獲取該月休假
        ]);

        // 準備可選員工列表 (該店 + 待命 + 兼職)
        prepareEligibleEmployees();


        // 3. 渲染月曆界面
        contentContainer.innerHTML = `
            <h4>${targetMonth} 手動排班</h4>
            <p>請為每天、每個分店、每個空位選擇排班人員。</p>
            <div id="manual-schedule-calendar-container" style="margin-top: 15px;"></div>
            <button id="save-manual-schedule-btn" class="btn btn-success" style="margin-top: 20px;">儲存手動班表</button>
            <p id="manual-schedule-message" class="message" style="margin-top: 15px;"></p>
        `;

        const calendarContainer = contentContainer.querySelector('#manual-schedule-calendar-container');
        const saveButton = contentContainer.querySelector('#save-manual-schedule-btn');

        if (!calendarContainer || !saveButton) throw new Error("無法創建月曆或保存按鈕");

        renderManualCalendar(calendarContainer, targetMonth);

        saveButton.onclick = saveManualSchedule; // 綁定保存事件

        if (typeof loadedSections !== 'undefined') loadedSections.add('manual-schedule');
        console.log("Manual Schedule Section loaded.");

    } catch (error) {
        console.error("Error loading manual schedule section:", error);
        contentContainer.innerHTML = `<p style="color:red">載入失敗: ${error.message}</p>`;
    }
}

// --- Helper: 解析分店需求 (可從 schedule-gen-logic 借鑒或共用) ---
function parseStoreRequirements(reqStr) {
    const map = {};
    if (reqStr) {
        reqStr.split(',').forEach(pair => {
            const [store, countStr] = pair.split('=').map(s => s.trim());
            const count = parseInt(countStr, 10);
            if (store && !isNaN(count) && count > 0) {
                map[store] = count;
            }
        });
    }
    return map;
}

// --- Helper: 獲取所有員工資料 ---
async function fetchAllEmployees() {
    manualSchedule_employees = [];
    const querySnapshot = await manualSchedule_db.collection('employees').orderBy('name').get();
    querySnapshot.forEach(doc => {
        manualSchedule_employees.push({ id: doc.id, ...doc.data() });
    });
    console.log(`Workspaceed ${manualSchedule_employees.length} employees for manual scheduling.`);
}

// --- Helper: 獲取指定月份休假資料 ---
async function fetchMonthLeaveRequests(targetMonth) {
    manualSchedule_leaveData = {};
    const querySnapshot = await manualSchedule_db.collection('leave_requests')
                                .where('month', '==', targetMonth)
                                .get();
    querySnapshot.forEach(doc => {
        const req = doc.data();
        const empId = req.employeeId || doc.id.split('_')[0]; // 嘗試從 employeeId 或 docId 獲取
        if (empId && req.selected_dates && Array.isArray(req.selected_dates)) {
            req.selected_dates.forEach(dateStr => {
                if (!manualSchedule_leaveData[dateStr]) {
                    manualSchedule_leaveData[dateStr] = new Set();
                }
                manualSchedule_leaveData[dateStr].add(empId);
            });
        }
    });
    console.log(`Processed leave requests for ${targetMonth}.`);
}

// --- Helper: 準備每個下拉選單的可選員工列表 ---
function prepareEligibleEmployees() {
    manualSchedule_eligibleEmployees = manualSchedule_employees.filter(emp =>
        emp.level > 0 // 只考慮正式員工和管理員
        // 可以根據需要加入更多過濾條件，例如 '待命' 或 '兼職' 的 position
        // && (emp.store === '待命' || emp.store === '兼職' || manualSchedule_stores.includes(emp.store))
    ).sort((a, b) => (a.name || '').localeCompare(b.name || '')); // 按姓名排序
}


// --- Helper: 渲染手動排班月曆 ---
function renderManualCalendar(container, targetMonth) {
    container.innerHTML = ''; // 清空
    const [year, monthNum] = targetMonth.split('-').map(Number);
    const monthIndex = monthNum - 1;

    const daysOfWeek = ['日', '一', '二', '三', '四', '五', '六'];
    const calendarGrid = document.createElement('div');
    calendarGrid.style.display = 'grid';
    calendarGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';
    calendarGrid.style.gap = '5px';
    calendarGrid.style.border = '1px solid #ccc';
    calendarGrid.style.padding = '5px';

    daysOfWeek.forEach(day => {
        const headerCell = document.createElement('div');
        headerCell.textContent = day;
        headerCell.style.textAlign = 'center'; headerCell.style.fontWeight = 'bold'; headerCell.style.padding = '5px'; headerCell.style.background = '#f0f0f0';
        calendarGrid.appendChild(headerCell);
    });

    const firstDayOfMonth = new Date(year, monthIndex, 1);
    const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
    const firstDayWeekday = firstDayOfMonth.getDay();

    const holidayDates = new Set(manualSchedule_config.本月公休日期?.split(',').map(d=>d.trim()).filter(d=>d) || []);

    // 填充空白格子
    for (let i = 0; i < firstDayWeekday; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.style.border = '1px solid #eee'; emptyCell.style.minHeight = '100px';
        calendarGrid.appendChild(emptyCell);
    }

    // 填充日期格子
    for (let day = 1; day <= lastDayOfMonth; day++) {
        const cell = document.createElement('div');
        cell.style.border = '1px solid #ddd'; cell.style.padding = '5px'; cell.style.minHeight = '120px';
        const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const dayLabel = document.createElement('div');
        dayLabel.textContent = day;
        dayLabel.style.fontWeight = 'bold'; dayLabel.style.marginBottom = '5px';
        cell.appendChild(dayLabel);

        if (holidayDates.has(dateStr)) {
            cell.style.backgroundColor = '#e0ffe0';
            cell.innerHTML += '<span style="color:green;">公休</span>';
        } else {
            manualSchedule_stores.forEach(store => {
                const storeDiv = document.createElement('div');
                storeDiv.style.marginBottom = '8px';
                storeDiv.innerHTML = `<strong>${store} (${manualSchedule_storeNeeds[store]}人):</strong>`;

                for (let i = 0; i < manualSchedule_storeNeeds[store]; i++) {
                    const selectId = `select-${dateStr}-${store}-${i}`;
                    const select = document.createElement('select');
                    select.id = selectId;
                    select.dataset.date = dateStr;
                    select.dataset.store = store;
                    select.dataset.slot = i;
                    select.classList.add('form-control', 'form-control-sm', 'manual-schedule-select');
                    select.style.marginTop = '3px';

                    // 添加空選項
                    const emptyOpt = document.createElement('option');
                    emptyOpt.value = "";
                    emptyOpt.textContent = "--選擇員工--";
                    select.appendChild(emptyOpt);

                    // 添加員工選項
                    manualSchedule_eligibleEmployees.forEach(emp => {
                        const option = document.createElement('option');
                        option.value = emp.id; // 使用員工 ID 作為值
                        option.textContent = emp.name;

                        // 檢查是否休假
                        if (manualSchedule_leaveData[dateStr]?.has(emp.id)) {
                            option.style.textDecoration = 'line-through';
                            option.textContent += ' (休)';
                            // 注意：仍然允許選擇
                        }
                         // 如果員工主要負責此分店，可以優先顯示或標記
                         if (emp.store === store) {
                              option.textContent += ` [${store}]`; // 標記本店員工
                         } else if (emp.store === '待命' || emp.store === '兼職') {
                             option.textContent += ` [${emp.store}]`; // 標記待命/兼職
                         }


                        select.appendChild(option);
                    });
                    storeDiv.appendChild(select);
                }
                cell.appendChild(storeDiv);
            });
        }
        calendarGrid.appendChild(cell);
    }
    container.appendChild(calendarGrid);
}

// --- Helper: 保存手動排班結果 ---
async function saveManualSchedule() {
    const saveButton = document.getElementById('save-manual-schedule-btn');
    const messageElem = document.getElementById('manual-schedule-message');
    if (!saveButton || !messageElem || !manualSchedule_db || !manualSchedule_config?.排班月份) return;

    saveButton.disabled = true;
    saveButton.textContent = '儲存中...';
    messageElem.textContent = '';
    messageElem.className = 'message';

    const targetMonth = manualSchedule_config.排班月份;
    const scheduleToSave = {}; // {'YYYY-MM-DD': {'StoreA': [empId1, empId2, ''], ...}}

    const selects = document.querySelectorAll('.manual-schedule-select');
    selects.forEach(select => {
        const date = select.dataset.date;
        const store = select.dataset.store;
        const empId = select.value; // 獲取選中的員工 ID

        if (!scheduleToSave[date]) scheduleToSave[date] = {};
        if (!scheduleToSave[date][store]) scheduleToSave[date][store] = [];

        // 按順序填入員工 ID 或空字串
        scheduleToSave[date][store].push(empId);
    });

    console.log("Saving manual schedule for:", targetMonth, scheduleToSave);

    try {
        // 決定儲存路徑，例如 manual_schedules/{month}
        const docRef = manualSchedule_db.collection('manual_schedules').doc(targetMonth);
        await docRef.set({
            month: targetMonth,
            schedule: scheduleToSave,
            lastUpdatedBy: manualSchedule_currentUser.name,
            lastUpdatedTimestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        messageElem.textContent = '手動班表儲存成功！';
        messageElem.className = 'message success-message';
        setTimeout(() => { messageElem.textContent = ''; messageElem.className = 'message'; }, 4000);

    } catch (error) {
        console.error("Error saving manual schedule:", error);
        messageElem.textContent = `儲存失敗: ${error.message}`;
        messageElem.className = 'message error-message';
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '儲存手動班表';
    }
}


console.log("admin-manual-schedule.js loaded");