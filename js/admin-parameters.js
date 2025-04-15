// js/admin-parameters.js - 參數設定頁面重構 (分類載入架構)

'use strict';

// --- 模組內狀態 ---
let params_currentUser = null;
let params_db = null;
let params_sectionContainer = null;

// Define categories structure globally or pass it around if needed
const paramCategoriesDefinition = [
    { id: 'param-category-main', loader: loadMainParams },
    { id: 'param-category-scheduling', loader: loadSchedulingParams },
    { id: 'param-category-notifications', loader: loadNotificationParams },
    { id: 'param-category-payroll', loader: loadPayrollParams },
    { id: 'param-category-permissions', loader: loadPermissionsParams },
    { id: 'param-category-sales-fields', loader: loadSalesFieldsParams },
    { id: 'param-category-order-items', loader: loadOrderItemsParams },
    { id: 'param-category-bonus-tasks', loader: loadBonusTasksParams },
    { id: 'param-category-score', loader: loadScoreParams },
    { id: 'param-category-inventory', loader: loadInventoryParams },
    { id: 'param-category-others', loader: loadOtherParams },
];

// --- Helper Functions (for Notifications) ---

// Function to populate the dropdowns
async function populateNotificationTargetDropdowns(db) {
    const lineSelect = document.getElementById('line-target-select');
    const telegramSelect = document.getElementById('telegram-target-select');

    if (!lineSelect || !telegramSelect) {
        console.warn("Notification target select elements not found.");
        return;
    }

    // Clear existing options
    lineSelect.innerHTML = '<option value="">-- 載入中 --</option>';
    telegramSelect.innerHTML = '<option value="">-- 載入中 --</option>';

    try {
        const targetsQuery = await db.collection('settings').doc('notification_targets').collection('targets').orderBy('name').get();
        targetsQuery.forEach(doc => {
            const target = doc.data();
            const targetId = doc.id;
            const displayText = `${target.name || '未命名'} (${targetId})`;
            const option = document.createElement('option');
            option.value = targetId;
            option.textContent = displayText;

            if (target.isLine) {
                lineSelect.appendChild(option.cloneNode(true));
            }
            if (target.isTelegram) {
                telegramSelect.appendChild(option.cloneNode(true));
            }
        });
        console.log("Notification target dropdowns populated.");
    } catch (error) {
        console.error("Error populating notification target dropdowns:", error);
        // Optionally show an error message near the dropdowns
    }
}

// --- NEW 主載入函數 (只設定結構和監聽器) ---
async function loadAllParameterCategories(sectionContainer, db, currentUser) {
    params_sectionContainer = sectionContainer;
    params_db = db;
    params_currentUser = currentUser;

    console.log("Initializing Parameter Categories Structure...");

    const categoryContainer = sectionContainer.querySelector('#parameter-categories-container');
    if (!categoryContainer) {
        console.error("#parameter-categories-container not found.");
        sectionContainer.innerHTML = '<p style="color:red;">參數分類容器錯誤。</p>';
        return;
    }

    const globalMsg = sectionContainer.querySelector('#consolidated-params-message');
    if (globalMsg) globalMsg.textContent = '';

    // Add event listeners for category toggling (if not already attached)
    if (!categoryContainer.dataset.collapseListenerAttached) {
         categoryContainer.addEventListener('click', handleCategoryToggle); // Use the single delegated listener
         categoryContainer.dataset.collapseListenerAttached = 'true';
         console.log("Collapse/expand listener attached to categories container.");
    } else {
         console.log("Collapse/expand listener already attached.");
    }
   
    // Bind save button
    const saveButton = document.getElementById('save-all-params-btn');
    if (saveButton) {
        saveButton.removeEventListener('click', handleSaveAllParams);
        saveButton.addEventListener('click', handleSaveAllParams);
        console.log("Save button event listener attached.");
    } else {
        console.warn("Floating save button #save-all-params-btn not found.");
    }

    if (typeof loadedSections !== 'undefined') loadedSections.add('parameters'); // Mark section as 'loaded'
    console.log("Parameter categories structure initialized. Content will load on expand.");
}

// --- MODIFIED Helper function for toggling AND lazy loading ---
async function handleCategoryToggle(event) { 
    const legend = event.target.closest('.category-toggle');
    if (!legend) return; // Exit if the click wasn't on a toggle legend

    const fieldset = legend.closest('fieldset');
    if (!fieldset) return; // Exit if legend isn't in a fieldset
    
    const isCollapsing = !fieldset.classList.contains('collapsed'); // Check state *before* toggling
    fieldset.classList.toggle('collapsed');
    const categoryId = fieldset.id;
    console.log(`Toggled category: ${categoryId}, Collapsed: ${fieldset.classList.contains('collapsed')}`);

    // --- Lazy Loading Logic --- 
    // Only load content if it's expanding and hasn't been loaded yet
    if (!fieldset.classList.contains('collapsed') && !fieldset.dataset.loaded) {
        console.log(`Expanding and loading content for ${categoryId}...`);
        const placeholder = fieldset.querySelector('.category-content-placeholder');
        const categoryDefinition = paramCategoriesDefinition.find(cat => cat.id === categoryId);

        if (placeholder && categoryDefinition && typeof categoryDefinition.loader === 'function') {
             try {
                 // Set loading message *before* calling the loader
                 placeholder.innerHTML = '<div class="loading-placeholder">載入中...</div>'; 
                 await categoryDefinition.loader(placeholder, params_db, params_currentUser);
                 fieldset.dataset.loaded = 'true'; // Mark as loaded
                 console.log(`Content loaded for ${categoryId}`);
             } catch (error) {
                 console.error(`Error loading content for ${categoryId}:`, error);
                 if (placeholder) placeholder.innerHTML = `<p style="color:red;">載入失敗: ${error.message}</p>`;
                 // Optionally remove the loaded flag so user can try again?
                 // delete fieldset.dataset.loaded; 
             }
        } else {
             console.warn(`Could not find placeholder or loader function for ${categoryId}`);
             if (placeholder) placeholder.innerHTML = '<p style="color:orange;">無法載入此區塊內容。</p>';
        }
    }
}

// --- Category Loaders --- 

/** Load Main Params */
async function loadMainParams(container, db, user) {
    console.log("Executing loadMainParams...");
    container.innerHTML = '<div class="loading-placeholder">載入主要設定中...</div>';

    try {
        const configDocId = "store_config";
        const storeListFieldName = "storeListString";
        const positionListFieldName = "positionListString";
        const geofenceFieldName = "storeGeofenceRadius";
        const operatingHoursFieldName = "storeOperatingHours";

        const docRef = db.collection('settings').doc(configDocId);
        const docSnap = await docRef.get();
        const configData = docSnap.exists ? docSnap.data() : {};

        const currentStoreListValue = configData[storeListFieldName] || '';
        const currentPositionListValue = configData[positionListFieldName] || "店長,正職,組長,正職,兼職";
        const currentGeofenceValue = configData[geofenceFieldName] || '';
        const currentOperatingHoursValue = configData[operatingHoursFieldName] || '';

        container.innerHTML = '';

        const form = document.createElement('form');
        form.id = 'main-config-form';

        const storeGroup = document.createElement('div');
        storeGroup.className = 'form-group';
        storeGroup.innerHTML = `
            <label for="main-store-list-string">分店總名單和座標:</label>
            <textarea id="main-store-list-string" name="${storeListFieldName}" class="form-control" rows="5" placeholder="例如：忠孝2=24.9748,121.2556;龍安2=24.9880,121.2812">${currentStoreListValue}</textarea>
            <small class="form-text text-muted">格式: <code>分店名</code><code>需求人數</code>=<code>緯度</code>,<code>經度</code>。用分號 <code>;</code> 分隔不同分店。</small>
        `;
        form.appendChild(storeGroup);

        const positionGroup = document.createElement('div');
        positionGroup.className = 'form-group';
        positionGroup.innerHTML = `
            <label for="main-position-list-string">職位列表:</label>
            <textarea id="main-position-list-string" name="${positionListFieldName}" class="form-control" rows="2" placeholder="店長,組長,正職,兼職">${currentPositionListValue}</textarea>
            <small class="form-text text-muted">請用逗號 (,) 分隔不同的職位名稱。</small>
        `;
        form.appendChild(positionGroup);

        const geofenceGroup = document.createElement('div');
        geofenceGroup.className = 'form-group';
        geofenceGroup.innerHTML = `
            <label for="main-geofence-radius">各分店打卡半徑 (公尺):</label>
            <textarea id="main-geofence-radius" name="${geofenceFieldName}" class="form-control" rows="3" placeholder="例如：忠孝100;龍安50;龍崗">${currentGeofenceValue}</textarea>
            <small class="form-text text-muted">格式: <code>分店名</code><code>半徑</code>。用分號 <code>;</code> 分隔不同分店。未列出的分店表示不限制距離。</small>
        `;
        form.appendChild(geofenceGroup);

        const hoursGroup = document.createElement('div');
        hoursGroup.className = 'form-group';
        hoursGroup.innerHTML = `
            <label for="main-operating-hours">各分店營業時間:</label>
            <textarea id="main-operating-hours" name="${operatingHoursFieldName}" class="form-control" rows="3" placeholder="例如：忠孝1500-2359,0000-0100;龍安0900-1800">${currentOperatingHoursValue}</textarea>
            <small class="form-text text-muted">格式: <code>分店名</code><code>HHMM-HHMM</code>。多個時段用逗號 <code>,</code> 分隔。不同分店用分號 <code>;</code> 分隔。未列出的分店表示不限制時間。</small>
        `;
        form.appendChild(hoursGroup);

        container.appendChild(form);

    } catch (error) {
        console.error("Error loading Main Params:", error);
        container.innerHTML = `<p style="color:red;">載入主要設定失敗: ${error.message}</p>`;
    }
}

/** Keep implemented Scheduling loader */
async function loadSchedulingParams(container, db, user) {
    console.log("Loading Scheduling Params...");
    container.innerHTML = '<div class="loading-placeholder">載入排班設定中...</div>';

    try {
        const configDocId = "schedule_config";
        const docRef = db.collection('settings').doc(configDocId);
        const docSnap = await docRef.get();
        const data = docSnap.exists ? docSnap.data() : {};

        container.innerHTML = '';

        const form = document.createElement('form');
        form.id = 'schedule-config-form';

        const createFormGroup = (id, labelText, inputType, value, helpText = '', attributes = {}) => {
            const groupId = `schedule-${id}`;
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            label.htmlFor = groupId;
            let input;
            value = value ?? (inputType === 'checkbox' ? false : '');

            if (inputType === 'checkbox') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = value === true;
                input.id = groupId;
                input.name = id;
                input.classList.add('form-check-input');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                input.style.marginRight = '8px';
                input.style.width = 'auto';
                label.appendChild(input);
                label.appendChild(document.createTextNode(labelText));
                group.appendChild(label);
            } else {
                label.textContent = labelText;
                input = document.createElement('input');
                input.type = inputType;
                input.id = groupId;
                input.name = id;
                input.value = value;
                input.classList.add('form-control');
                if (attributes) {
                    for (const key in attributes) {
                        input.setAttribute(key, attributes[key]);
                    }
                }
                group.appendChild(label);
                group.appendChild(input);
            }

            if (helpText) {
                const small = document.createElement('small');
                small.className = 'form-text text-muted';
                small.textContent = helpText;
                group.appendChild(small);
            }
            return group;
        };

        form.appendChild(createFormGroup('enableLocking', '啟用排班系統鎖定機制', 'checkbox', data.enableLocking));
        form.appendChild(createFormGroup('scheduleMonth', '排班月份', 'month', data.scheduleMonth, '格式: YYYY-MM', {required: true}));
        form.appendChild(createFormGroup('storeHolidays', '本月公休日期', 'text', data.storeHolidays, '例如：忠孝5/8,5/9;龍安5/3,5/30'));
        form.appendChild(createFormGroup('restrictedDays', '本月禁休日期', 'text', data.restrictedDays, '例如：忠孝5/8,5/9;龍安5/3,5/30'));
        form.appendChild(createFormGroup('windowStart', '排班系統窗口開始時間', 'datetime-local', data.windowStart));
        form.appendChild(createFormGroup('windowEnd', '排班系統窗口結束時間', 'datetime-local', data.windowEnd));
        form.appendChild(createFormGroup('lockTimeoutMinutes', '排班鎖定超時(分鐘)', 'number', data.lockTimeoutMinutes || 5, '預設 5 分鐘', {min: 1}));
        form.appendChild(createFormGroup('maxLeaveDaysPerPerson', '每人休假上限天數', 'number', data.maxLeaveDaysPerPerson || 8, '', {min: 0}));
        form.appendChild(createFormGroup('maxLeaveDaysPerDayTotal', '每日休假上限人數', 'number', data.maxLeaveDaysPerDayTotal || 2, '', {min: 0}));
        form.appendChild(createFormGroup('maxWeekendLeaveDaysPerPerson', '每人五六日休假上限天數', 'number', data.maxWeekendLeaveDaysPerPerson || 3, '', {min: 0}));
        form.appendChild(createFormGroup('maxLeavePerDaySameStore', '同店每日休假上限', 'number', data.maxLeavePerDaySameStore || 1, '', {min: 0}));
        form.appendChild(createFormGroup('maxStandbyLeavePerDay', '待命每日休假上限', 'number', data.maxStandbyLeavePerDay || 1, '', {min: 0}));
        form.appendChild(createFormGroup('maxPartTimeLeavePerDay', '兼職每日休假上限', 'number', data.maxPartTimeLeavePerDay || 1, '', {min: 0}));

        container.appendChild(form);

        const forceOpenButton = document.createElement('button');
        forceOpenButton.type = 'button';
        forceOpenButton.id = 'force-open-schedule-btn';
        forceOpenButton.textContent = '強制開啟排班系統 (30分鐘)';
        forceOpenButton.className = 'btn btn-warning';
        forceOpenButton.style.marginTop = '15px';
        forceOpenButton.title = '此功能會將排班系統狀態設為允許排班，並在30分鐘後自動恢復。適用於特殊情況下允許員工排班。請謹慎使用。';
        forceOpenButton.addEventListener('click', () => handleForceOpenScheduling(db));
        container.appendChild(forceOpenButton);

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.id = 'reset-schedule-data-btn';
        resetButton.textContent = '重置本月排班相關資料';
        resetButton.className = 'btn btn-danger ml-2';
        resetButton.style.marginTop = '15px';
        resetButton.title = '警告：此操作將清除所有員工針對本月排班的休假申請、鎖定狀態和已產生班表，且無法復原！';
        resetButton.addEventListener('click', () => handleResetScheduleData(db));
        container.appendChild(resetButton);

    } catch (error) {
        console.error("Error loading Scheduling Params:", error);
        container.innerHTML = `<p style="color:red;">載入排班設定失敗: ${error.message}</p>`;
    }
}

/** Load Notification Params (Modified) */
async function loadNotificationParams(container, db, user) {
    console.log("Loading Notification Params...");
    container.innerHTML = '<div class="loading-placeholder">載入通知設定中...</div>';

    try {
        const configDocId = "notification_config";
        const configRef = db.collection('settings').doc(configDocId);
        const configSnap = await configRef.get();
        const configData = configSnap.exists ? configSnap.data() : {};

        container.innerHTML = ''; // Clear loading

        // --- Section 0: Target Dropdowns (NEW) ---
        const targetDropdownsContainer = document.createElement('div');
        targetDropdownsContainer.className = 'mb-4 p-3 border rounded bg-light';
        targetDropdownsContainer.innerHTML = `
            <h5>已設定的通知目標</h5>
            <div class="form-row">
                <div class="form-group col-md-6">
                    <label for="line-target-select">LINE 目標:</label>
                    <select id="line-target-select" class="form-control form-control-sm">
                        <option value="">-- 載入中 --</option>
                    </select>
                </div>
                <div class="form-group col-md-6">
                    <label for="telegram-target-select">Telegram 目標:</label>
                    <select id="telegram-target-select" class="form-control form-control-sm">
                        <option value="">-- 載入中 --</option>
                    </select>
                </div>
            </div>
             <small class="form-text text-muted">這裡是已儲存的目標列表，方便查看。</small>
        `;
        container.appendChild(targetDropdownsContainer);

        // Populate dropdowns after adding them to DOM
        populateNotificationTargetDropdowns(db);

        // --- Section 1: Enable/Disable Notification Items --- 
        const formCheckboxes = document.createElement('form');
        formCheckboxes.id = 'notification-config-form'; // This form is saved by the main save button

        const itemsFieldset = document.createElement('fieldset');
        itemsFieldset.className = 'mb-4'; // Add margin
        const itemsLegend = document.createElement('legend');
        itemsLegend.textContent = '啟用通知項目';
        itemsLegend.style.fontSize = '1.1em'; // Adjust size
        itemsFieldset.appendChild(itemsLegend);

        const notificationItems = [
             { id: 'newUser', label: '新人註冊完成' },
             { id: 'newOrder', label: '收到新叫貨紀錄' },
             { id: 'newSales', label: '收到新營收紀錄' },
             { id: 'newLeave', label: '收到新排假申請' },
             { id: 'orderError', label: '收到訂單錯誤回報' },
             { id: 'scheduleOpen', label: '排假系統開啟' },
             { id: 'scheduleClose', label: '排假系統關閉' },
             { id: 'scheduleEnter', label: '進入排假系統' },
             { id: 'clockIn', label: '打卡上班紀錄' },
             { id: 'clockOut', label: '打卡下班紀錄' },
             { id: 'voteRecord', label: '投票紀錄' }, 
             { id: 'paramUpdate', label: '參數自動更新紀錄' },
             { id: 'userLogin', label: '員工登入' },
             { id: 'salaryView', label: '薪資獎金查看紀錄' },
             { id: 'cramSchoolEnter', label: '進入補習班紀錄' },
             { id: 'announceView', label: '查看點擊公告紀錄' },
             { id: 'employeeBirthday', label: '員工生日通知' },
        ];

        notificationItems.forEach(item => {
            const group = document.createElement('div');
            group.className = 'form-check form-check-inline';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-check-input';
            input.id = `notify-${item.id}`;
            input.name = item.id; // Field name in Firestore doc (notification_config)
            input.checked = configData[item.id] === true;
            const label = document.createElement('label');
            label.className = 'form-check-label';
            label.htmlFor = `notify-${item.id}`;
            label.textContent = item.label;
            group.appendChild(input);
            group.appendChild(label);
            itemsFieldset.appendChild(group);
        });
        formCheckboxes.appendChild(itemsFieldset);
        container.appendChild(formCheckboxes); // Add checkbox form to container
        
        // --- Section 2: Manage Notification Targets --- 
        const targetsSection = document.createElement('div');
        targetsSection.className = 'mt-4 pt-4 border-top'; // Add separator
        
        const targetsLegend = document.createElement('h5'); // Use h5 for sub-section title
        targetsLegend.textContent = '管理通知目標 ID';
        targetsSection.appendChild(targetsLegend);

        // Form for adding a new target
        const addTargetForm = document.createElement('form');
        addTargetForm.id = 'add-notification-target-form';
        addTargetForm.className = 'mb-3 p-3 border rounded bg-light'; // Style the add form
        
        const row = document.createElement('div');
        row.className = 'form-row align-items-end'; // Use form-row for inline layout

        // Input for Target ID
        const idGroup = document.createElement('div');
        idGroup.className = 'form-group col-md-4'; // Adjust column width
        idGroup.innerHTML = `
            <label for="new-target-id">目標 ID:</label>
            <input type="text" id="new-target-id" class="form-control form-control-sm" placeholder="LINE User/Group ID 或 Telegram Chat ID" required>
        `;
        row.appendChild(idGroup);

        // Input for Remarks Name
        const nameGroup = document.createElement('div');
        nameGroup.className = 'form-group col-md-3';
        nameGroup.innerHTML = `
            <label for="new-target-name">備註名稱:</label>
            <input type="text" id="new-target-name" class="form-control form-control-sm" placeholder="例如: 管理群組, 老闆">
        `;
        row.appendChild(nameGroup);

        // Checkboxes for Type (Modified)
        const typeGroup = document.createElement('div');
        typeGroup.className = 'form-group col-md-3 d-flex align-items-center'; // Align checkboxes vertically
        typeGroup.innerHTML = `
            <div>類型:</div>
            <div class="form-check form-check-inline ml-2">
                <input class="form-check-input notification-type-checkbox" type="checkbox" id="new-target-is-line" name="notificationType">
                <label class="form-check-label" for="new-target-is-line">LINE</label>
            </div>
            <div class="form-check form-check-inline">
                <input class="form-check-input notification-type-checkbox" type="checkbox" id="new-target-is-telegram" name="notificationType">
                <label class="form-check-label" for="new-target-is-telegram">Telegram</label>
            </div>
        `;
        row.appendChild(typeGroup);

        // Add mutual exclusion logic to checkboxes
        const lineCheckbox = typeGroup.querySelector('#new-target-is-line');
        const telegramCheckbox = typeGroup.querySelector('#new-target-is-telegram');
        lineCheckbox.addEventListener('change', () => {
            if (lineCheckbox.checked) {
                telegramCheckbox.checked = false;
            }
        });
        telegramCheckbox.addEventListener('change', () => {
            if (telegramCheckbox.checked) {
                lineCheckbox.checked = false;
            }
        });

        // Add Button
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'form-group col-md-2'; // Button column
        const addButton = document.createElement('button');
        addButton.type = 'button'; // Use type=button to prevent form submission
        addButton.id = 'add-notification-target-btn';
        addButton.textContent = '＋ 新增目標';
        addButton.className = 'btn btn-success btn-sm btn-block'; // Make button block level
        
        // Add event listener for the Add button (Modified)
        addButton.onclick = async () => {
            const targetIdInput = document.getElementById('new-target-id');
            const targetNameInput = document.getElementById('new-target-name');
            const isLineChecked = lineCheckbox.checked;
            const isTelegramChecked = telegramCheckbox.checked;

            const targetId = targetIdInput.value.trim();
            const targetName = targetNameInput.value.trim();

            if (!targetId) {
                alert('請輸入目標 ID。');
                targetIdInput.focus();
                return;
            }
             if (!isLineChecked && !isTelegramChecked) {
                 alert('請至少選擇一種通知類型 (LINE 或 Telegram)。');
                 return;
             }

            console.log(`Adding/Updating target: ${targetId}`);
            addButton.disabled = true;
            addButton.textContent = '儲存中...';

            try {
                await db.collection('settings').doc('notification_targets').collection('targets').doc(targetId).set({
                    name: targetName, 
                    isLine: isLineChecked, 
                    isTelegram: isTelegramChecked
                }, { merge: true }); // Use set with merge to add or update

                console.log("Target saved successfully.");
                
                // Clear the form
                targetIdInput.value = '';
                targetNameInput.value = '';
                lineCheckbox.checked = false;
                telegramCheckbox.checked = false;

                // Refresh the dropdown lists (NEW)
                populateNotificationTargetDropdowns(db);
                // Also refresh the list below (if needed, or remove it later)
                const targetsListContainer = document.getElementById('notification-targets-list');
                if(targetsListContainer) renderNotificationTargets(db, targetsListContainer);

            } catch (saveError) {
                console.error("Error saving target:", saveError);
                alert(`儲存目標時發生錯誤: ${saveError.message}`);
            } finally {
                addButton.disabled = false;
                addButton.textContent = '＋ 新增目標';
            }
        };
        
        buttonGroup.appendChild(addButton);
        row.appendChild(buttonGroup);

        addTargetForm.appendChild(row);
        targetsSection.appendChild(addTargetForm);
        
        // Container for the list of existing targets (Consider removing if dropdowns are sufficient)
        const targetsListContainer = document.createElement('div');
        targetsListContainer.id = 'notification-targets-list';
        targetsListContainer.className = 'mt-3'; // Add some margin
        targetsSection.appendChild(targetsListContainer);

        container.appendChild(targetsSection);

        // Initial rendering of the targets list (below the form)
        renderNotificationTargets(db, targetsListContainer);

    } catch (error) {
        console.error("Error loading Notification Params:", error);
        container.innerHTML = `<p style="color:red;">載入通知設定失敗: ${error.message}</p>`;
    }
}

// Helper function to render the list of notification targets (Consider removing later)
async function renderNotificationTargets(db, container) {
    console.log("Rendering notification targets list (below form)... Might be removed later.");
    container.innerHTML = '<span class="text-muted"><i>正在載入目標列表...</i></span>'; 

    try {
        const targetsQuery = await db.collection('settings').doc('notification_targets').collection('targets').orderBy('name').get();
        
        if (targetsQuery.empty) {
            container.innerHTML = '<hr><p class="text-muted"><i>下方為詳細列表 (目前無資料)</i></p>';
            return;
        }

        container.innerHTML = '<hr><p class="text-muted"><i>下方為詳細列表 (供編輯/刪除)</i></p>'; // Add separator and title
        const listGroup = document.createElement('ul');
        listGroup.className = 'list-group list-group-flush'; // Use flush for tighter look

        targetsQuery.forEach(doc => {
            const target = doc.data();
            const targetId = doc.id;

            const listItem = document.createElement('li');
            listItem.className = 'list-group-item d-flex justify-content-between align-items-center';

            const targetInfo = document.createElement('div');
            targetInfo.innerHTML = `
                <strong>${target.name || '未命名'}</strong> 
                <small class="text-muted">(${target.isLine ? 'LINE' : ''}${target.isTelegram ? 'Telegram' : ''})</small><br>
                <span class="text-monospace" style="font-size: 0.8em;">${targetId}</span>
            `;

            const buttonGroup = document.createElement('div');
            
            // Edit button (populates the form above)
            const editButton = document.createElement('button');
            editButton.textContent = '編輯';
            editButton.className = 'btn btn-sm btn-outline-secondary mr-2';
            editButton.onclick = () => { 
                console.log(`Edit target ${targetId}`); 
                document.getElementById('new-target-id').value = targetId;
                document.getElementById('new-target-name').value = target.name || '';
                document.getElementById('new-target-is-line').checked = target.isLine || false;
                document.getElementById('new-target-is-telegram').checked = target.isTelegram || false;
                // Ensure mutual exclusion if needed upon populating edit form
                if (target.isLine) document.getElementById('new-target-is-telegram').checked = false;
                if (target.isTelegram) document.getElementById('new-target-is-line').checked = false;
                document.getElementById('new-target-id').focus(); 
            };

            // Delete Button
            const deleteButton = document.createElement('button');
            deleteButton.textContent = '刪除';
            deleteButton.className = 'btn btn-sm btn-outline-danger';
            deleteButton.onclick = async () => {
                if (confirm(`確定要刪除目標 "${target.name || targetId}" 嗎？`)) {
                    console.log(`Deleting target ${targetId}...`);
                    try {
                        await db.collection('settings').doc('notification_targets').collection('targets').doc(targetId).delete();
                        console.log("Target deleted successfully.");
                        renderNotificationTargets(db, container); // Refresh this list
                        populateNotificationTargetDropdowns(db); // Refresh dropdowns too
                    } catch (deleteError) {
                        console.error("Error deleting target:", deleteError);
                        alert(`刪除目標時發生錯誤: ${deleteError.message}`);
                    }
                }
            };

            buttonGroup.appendChild(editButton);
            buttonGroup.appendChild(deleteButton);
            
            listItem.appendChild(targetInfo);
            listItem.appendChild(buttonGroup);
            listGroup.appendChild(listItem);
        });

        container.appendChild(listGroup);

    } catch (error) {
        console.error("Error fetching notification targets list (below form):", error);
        container.innerHTML = '<span class="text-danger"><i>載入下方目標列表失敗。</i></span>';
    }
}

/** Load Payroll Params */
async function loadPayrollParams(container, db, user) {
    console.log("Loading Payroll Params...");
    container.innerHTML = '<div class="loading-placeholder">載入薪資參數中...</div>';

    try {
        // Fetch position list from main config first
        const mainConfigRef = db.collection('settings').doc('store_config');
        const mainConfigSnap = await mainConfigRef.get();
        const mainConfigData = mainConfigSnap.exists ? mainConfigSnap.data() : {};
        const positionListString = mainConfigData.positionListString || '';
        const positions = positionListString.split(',').map(p => p.trim()).filter(p => p);
        console.log("Positions fetched for payroll:", positions);

        container.innerHTML = ''; // Clear loading

        // --- Position Selection Dropdown ---
        const positionSelectGroup = document.createElement('div');
        positionSelectGroup.className = 'form-group row align-items-center';

        const positionLabel = document.createElement('label');
        positionLabel.htmlFor = 'payroll-position-select';
        positionLabel.textContent = '選擇職位以編輯薪資:';
        positionLabel.className = 'col-sm-3 col-form-label text-right';
        positionSelectGroup.appendChild(positionLabel);

        const positionSelectDiv = document.createElement('div');
        positionSelectDiv.className = 'col-sm-5';
        const positionSelect = document.createElement('select');
        positionSelect.id = 'payroll-position-select';
        positionSelect.className = 'form-control form-control-sm';
        positionSelect.innerHTML = '<option value="">-- 請選擇職位 --</option>';
        positions.forEach(pos => {
            const option = document.createElement('option');
            option.value = pos;
            option.textContent = pos;
            positionSelect.appendChild(option);
        });
        positionSelectDiv.appendChild(positionSelect);
        positionSelectGroup.appendChild(positionSelectDiv);
        container.appendChild(positionSelectGroup);

        // --- Container for Salary Structure Items ---
        const structureContainer = document.createElement('div');
        structureContainer.id = 'payroll-structure-details';
        structureContainer.className = 'mt-3 pt-3 border-top';

        const salaryItemsContainer = document.createElement('div');
        salaryItemsContainer.id = 'payroll-salary-items-container';
        salaryItemsContainer.innerHTML = '<p class="text-muted"><i>請先選擇職位以編輯薪資細項。</i></p>';
        structureContainer.appendChild(salaryItemsContainer);

        // Display for Total Salary
        const totalSalaryDisplay = document.createElement('p');
        totalSalaryDisplay.id = 'payroll-total-salary';
        totalSalaryDisplay.className = 'mt-3 font-weight-bold text-right text-primary';
        totalSalaryDisplay.style.fontSize = '1.1em';
        totalSalaryDisplay.textContent = '總薪資: --';
        structureContainer.appendChild(totalSalaryDisplay);

        // Save button for the structure (Placeholder)
        const saveStructureButton = document.createElement('button');
        saveStructureButton.type = 'button';
        saveStructureButton.id = 'save-payroll-structure-btn';
        saveStructureButton.textContent = '儲存此職位薪資結構';
        saveStructureButton.className = 'btn btn-info btn-sm mt-3 float-right';
        saveStructureButton.disabled = true;
        saveStructureButton.onclick = () => {
            alert('儲存薪資結構功能尚未完成。');
            // TODO: Implement save logic
        };
        structureContainer.appendChild(saveStructureButton);

        container.appendChild(structureContainer);

        // Event listener for position selection
        positionSelect.addEventListener('change', (event) => {
            const selectedPosition = event.target.value;
            console.log(`Selected position: ${selectedPosition}. Loading structure...`);
            if (selectedPosition) {
                loadAndRenderSalaryStructure(selectedPosition, salaryItemsContainer, db);
                saveStructureButton.disabled = false;
            } else {
                salaryItemsContainer.innerHTML = '<p class="text-muted"><i>請先選擇職位以編輯薪資細項。</i></p>';
                if(totalSalaryDisplay) totalSalaryDisplay.textContent = '總薪資: --';
                saveStructureButton.disabled = true;
            }
        });

    } catch (error) {
        console.error("Error loading Payroll Params:", error);
        container.innerHTML = `<p style="color:red;">載入薪資參數失敗: ${error.message}</p>`;
    }
}

async function loadAndRenderSalaryStructure(position, container, db) {
    console.log(`Loading structure for ${position}...`);
    container.innerHTML = `<p class="text-muted"><i>正在載入 ${position} 的薪資結構...</i></p>`;
    const totalSalaryDisplay = document.getElementById('payroll-total-salary');
    if (totalSalaryDisplay) totalSalaryDisplay.textContent = '總薪資: 計算中...';

    // --- Placeholder Data & Logic --- (Replace with Firestore fetch)
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
    const placeholderStructures = {
        '店長': { baseSalary: 28590, overtimePay: 13000, locationAllowance: 9000, attendanceBonus: 5000, fuelSubsidy: 410, other: 0 },
        '組長': { baseSalary: 28590, overtimePay: 13000, locationAllowance: 6000, attendanceBonus: 5000, fuelSubsidy: 410, other: 0 },
        '正職': { baseSalary: 28590, overtimePay: 11000, storeTransferAllowance: 4000, attendanceBonus: 4000, fuelSubsidy: 410, other: 0 },
        '兼職': { hourlyRate: 185 }
    };
    const salaryItemLabels = {
        baseSalary: '底薪', overtimePay: '加班費', locationAllowance: '駐點津貼', attendanceBonus: '全勤獎金',
        fuelSubsidy: '補貼油資', storeTransferAllowance: '調店津貼', other: '其他', hourlyRate: '時薪'
    };
    const structureData = placeholderStructures[position] || {};

    container.innerHTML = '';
    const form = document.createElement('form');
    form.id = `payroll-structure-form-${position.replace(/\s+/g, '-')}`;

    const updateTotalSalary = () => {
        let currentTotal = 0;
        form.querySelectorAll('input[type="number"]').forEach(input => {
            if (input.name !== 'hourlyRate') {
                 currentTotal += parseFloat(input.value) || 0;
            }
        });
        if (totalSalaryDisplay) totalSalaryDisplay.textContent = `總薪資: ${currentTotal.toLocaleString()}`;
    };

    for (const key in structureData) {
        const value = structureData[key];
        const labelText = salaryItemLabels[key] || key;
        const group = document.createElement('div');
        group.className = 'form-group row';
        group.innerHTML = `
            <label for="payroll-${position}-${key}" class="col-sm-3 col-form-label text-right">${labelText} :</label>
            <div class="col-sm-5">
                <input type="number" id="payroll-${position}-${key}" name="${key}" value="${value}" class="form-control form-control-sm" step="any" min="0">
            </div>
        `;
        const input = group.querySelector('input');
        input.addEventListener('input', updateTotalSalary);
        form.appendChild(group);
    }
    container.appendChild(form);
    updateTotalSalary();
}

/** Load Permissions Params */
async function loadPermissionsParams(container, db, user) {
    console.log("Loading Permissions Params...");
    container.innerHTML = '<div class="loading-placeholder">載入頁面權限設定中...</div>';

    try {
        const configDocId = "page_permissions";
        const docRef = db.collection('settings').doc(configDocId);
        const docSnap = await docRef.get();
        const permissionsData = docSnap.exists ? docSnap.data() : {};

        container.innerHTML = '';

        const form = document.createElement('form');
        form.id = 'permissions-config-form';

        const helpText = document.createElement('p');
        helpText.className = 'text-muted';
        helpText.textContent = '設定訪問各頁面所需的最低權限等級 (例如: 0=訪客, 1=一般員工, 9=排班管理, 100=最高管理員)。';
        form.appendChild(helpText);

        const pagesToConfigure = [
             { filename: 'index.html', label: '登入/首頁', defaultLevel: 0 },
             { filename: 'register.html', label: '新人註冊', defaultLevel: 0 },
             { filename: 'pending.html', label: '等待審核', defaultLevel: 0 },
             { filename: 'announce.html', label: '最新公告', defaultLevel: 1 },
             { filename: 'leave.html', label: '排假申請', defaultLevel: 1 },
             { filename: 'order.html', label: '叫貨填寫', defaultLevel: 1 },
             { filename: 'sales.html', label: '營業額登錄', defaultLevel: 1 },
             { filename: 'clockin.html', label: '員工打卡', defaultLevel: 1 },
             { filename: 'salary.html', label: '班表與薪資', defaultLevel: 1 },
             { filename: 'cram-school.html', label: '員工補習班', defaultLevel: 1 },
             { filename: 'admin.html', label: '後台管理主頁', defaultLevel: 9 },
             { filename: 'schedule-gen.html', label: '排班模擬', defaultLevel: 9 },
             { filename: 'salary-view.html', label: '薪資總表(管理)', defaultLevel: 9 },
             { filename: 'schedule-view.html', label: '排班總表(管理)', defaultLevel: 9 },
             { filename: 'referendum.html', label: '投票頁面', defaultLevel: 1 },
        ];

        pagesToConfigure.forEach(page => {
            const firestoreKey = page.filename.replace(/\./g, '_');
            const currentValue = permissionsData[firestoreKey] !== undefined ? permissionsData[firestoreKey] : page.defaultLevel;
            const group = document.createElement('div');
            group.className = 'form-group row';
            group.innerHTML = `
                <label for="perm-${firestoreKey}" class="col-sm-4 col-form-label">${page.label} (${page.filename}):</label>
                <div class="col-sm-3">
                    <input type="number" id="perm-${firestoreKey}" name="${firestoreKey}" value="${currentValue}" class="form-control form-control-sm" min="0" max="100">
                </div>
            `;
            form.appendChild(group);
        });

        container.appendChild(form);

    } catch (error) {
        console.error("Error loading Permissions Params:", error);
        container.innerHTML = `<p style="color:red;">載入頁面權限設定失敗: ${error.message}</p>`;
    }
}

/** Load Sales Fields Params */
async function loadSalesFieldsParams(container, db, user) {
    console.log("Loading Sales Fields Params...");
    container.innerHTML = '<div class="loading-placeholder">載入營業額欄位設定中...</div>';

    try {
        const configDocId = "sales_fields_config";
        const docRef = db.collection('settings').doc(configDocId);
        const docSnap = await docRef.get();
        const fieldsData = docSnap.exists ? (docSnap.data().fields || []) : [];

        container.innerHTML = '';

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'btn btn-success btn-sm mb-3';
        addButton.textContent = '＋ 新增欄位';
        addButton.onclick = () => {
             if (typeof openSalesConfigModal === 'function') {
                openSalesConfigModal(null, {}); // Call with null ID for new field
            } else {
                console.error('openSalesConfigModal function is not defined.');
                alert('開啟編輯視窗功能錯誤。');
            }
        };
        container.appendChild(addButton);

        const tableContainer = document.createElement('div');
        tableContainer.id = 'sales-fields-table-container';
        container.appendChild(tableContainer);

        if (typeof renderSalesConfigTable === 'function') {
            renderSalesConfigTable(tableContainer, fieldsData, db, params_sectionContainer, params_currentUser);
        } else {
            console.error('renderSalesConfigTable function is not defined.');
            tableContainer.innerHTML = '<p style="color:red;">無法渲染營業額欄位表格。</p>';
        }

    } catch (error) {
        console.error("Error loading Sales Fields Params:", error);
        container.innerHTML = `<p style="color:red;">載入營業額欄位設定失敗: ${error.message}</p>`;
    }
}

/** Load Order Items Params */
async function loadOrderItemsParams(container, db, user) {
    console.log("Loading Order Items Params...");
    container.innerHTML = '<div class="loading-placeholder">載入叫貨品項設定中...</div>';

    try {
        const configDocId = "order_items_config";
        const docRef = db.collection('settings').doc(configDocId);
        const docSnap = await docRef.get();
        const itemsData = docSnap.exists ? (docSnap.data().items || []) : [];

        container.innerHTML = '';

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'btn btn-success btn-sm mb-3';
        addButton.textContent = '＋ 新增品項';
        addButton.onclick = () => {
            if (typeof openOrderItemModal === 'function') {
                openOrderItemModal(null, {});
            } else {
                console.error('openOrderItemModal function is not defined.');
                alert('開啟編輯視窗功能錯誤。');
            }
        };
        container.appendChild(addButton);

        const tableContainer = document.createElement('div');
        tableContainer.id = 'order-items-table-container';
        container.appendChild(tableContainer);

        if (typeof renderOrderItemsTable === 'function') {
            renderOrderItemsTable(tableContainer, itemsData, db, params_sectionContainer, params_currentUser);
        } else {
            console.error('renderOrderItemsTable function is not defined.');
            tableContainer.innerHTML = '<p style="color:red;">無法渲染叫貨品項表格。</p>';
        }

    } catch (error) {
        console.error("Error loading Order Items Params:", error);
        container.innerHTML = `<p style="color:red;">載入叫貨品項設定失敗: ${error.message}</p>`;
    }
}

/** Load Bonus Tasks Params */
async function loadBonusTasksParams(container, db, user) {
    console.log("Loading Bonus Tasks Params...");
    container.innerHTML = '<div class="loading-placeholder">載入獎金任務設定中...</div>';

    try {
        const querySnapshot = await db.collection('bonusTasks').orderBy('name').get();
        const tasks = [];
        querySnapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() });
        });

        container.innerHTML = '';

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'btn btn-success btn-sm mb-3';
        addButton.textContent = '＋ 新增任務';
        addButton.onclick = () => {
            if (typeof openBonusTaskModal === 'function') {
                openBonusTaskModal(null, {});
            } else {
                console.error('openBonusTaskModal function is not defined.');
                alert('開啟編輯視窗功能錯誤。');
            }
        };
        container.appendChild(addButton);

        const listContainer = document.createElement('div');
        listContainer.id = 'bonus-tasks-list-container';
        container.appendChild(listContainer);

        if (tasks.length === 0) {
            listContainer.innerHTML = '<p>目前沒有設定獎金任務。</p>';
        } else {
            const list = document.createElement('ul');
            list.className = 'list-group';
            tasks.forEach(task => {
                const listItem = document.createElement('li');
                listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
                
                const taskNameSpan = document.createElement('span');
                taskNameSpan.textContent = task.name || '未命名任務';
                listItem.appendChild(taskNameSpan);

                const buttonGroup = document.createElement('div');
                
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'btn btn-outline-secondary btn-sm mr-2';
                editButton.textContent = '編輯';
                editButton.onclick = () => {
                    if (typeof openBonusTaskModal === 'function') {
                        openBonusTaskModal(task.id, task);
                    } else { alert('編輯功能錯誤'); }
                };
                buttonGroup.appendChild(editButton);
                
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'btn btn-outline-danger btn-sm';
                deleteButton.textContent = '刪除';
                deleteButton.onclick = () => {
                    if (typeof deleteBonusTask === 'function') {
                        deleteBonusTask(task.id, task.name, db); 
                    } else { alert('刪除功能錯誤'); }
                };
                buttonGroup.appendChild(deleteButton);
                
                listItem.appendChild(buttonGroup);
                list.appendChild(listItem);
            });
            listContainer.appendChild(list);
        }
        
        if (typeof initializeAndBindParameterModals !== 'function'){
            console.warn('initializeAndBindParameterModals not defined, modals might not work.');
        }

    } catch (error) {
        console.error("Error loading Bonus Tasks Params:", error);
        container.innerHTML = `<p style="color:red;">載入獎金任務設定失敗: ${error.message}</p>`;
    }
}

/** Load Score Params */
async function loadScoreParams(container, db, user) {
    console.log("Loading Score Params...");
    container.innerHTML = '<div class="loading-placeholder">載入綜合分數設定中...</div>';

    try {
        const configDocId = "score_config";
        const docRef = db.collection('settings').doc(configDocId);
        const docSnap = await docRef.get();
        const data = docSnap.exists ? docSnap.data() : {};

        container.innerHTML = '';

        const form = document.createElement('form');
        form.id = 'score-config-form';

        const helpText = document.createElement('p');
        helpText.className = 'text-muted';
        helpText.textContent = '設定員工綜合評分的計算參數。正數為加分，負數為扣分。';
        form.appendChild(helpText);

        const createFormGroup = (id, labelText, inputType, value, helpText = '', attributes = {}) => {
            const groupId = `score-${id}`;
            const group = document.createElement('div');
            group.className = 'form-group row';
            const label = document.createElement('label');
            label.htmlFor = groupId;
            label.className = 'col-sm-5 col-form-label';
            label.textContent = labelText;
            group.appendChild(label);

            const inputDiv = document.createElement('div');
            inputDiv.className = 'col-sm-3';
            const input = document.createElement('input');
            input.type = inputType;
            input.id = groupId;
            input.name = id;
            input.value = value ?? 0;
            input.classList.add('form-control', 'form-control-sm');
            if (attributes) {
                for (const key in attributes) {
                    input.setAttribute(key, attributes[key]);
                }
            }
            inputDiv.appendChild(input);
            group.appendChild(inputDiv);

            if (helpText) {
                const small = document.createElement('small');
                small.className = 'col-sm-4 form-text text-muted align-self-center';
                small.textContent = helpText;
                group.appendChild(small);
            }
            return group;
        };

        form.appendChild(createFormGroup('onTimeBonus', '準時上班', 'number', data.onTimeBonus, '每次準時打卡加分', { step: 'any' }));
        form.appendChild(createFormGroup('latePenalty', '遲到', 'number', data.latePenalty, '每次遲到扣分 (請用負數)', { step: 'any' }));
        form.appendChild(createFormGroup('absentPenalty', '曠職', 'number', data.absentPenalty, '每次曠職扣分 (請用負數)', { step: 'any' }));
        form.appendChild(createFormGroup('taskCompleteBonus', '完成獎金任務', 'number', data.taskCompleteBonus, '每次完成指定任務加分', { step: 'any', min: '0' }));
        form.appendChild(createFormGroup('customerComplaintPenalty', '客訴', 'number', data.customerComplaintPenalty, '每次客訴扣分 (請用負數)', { step: 'any' }));
        form.appendChild(createFormGroup('customerPraiseBonus', '客評優良', 'number', data.customerPraiseBonus, '每次收到顧客好評加分', { step: 'any', min: '0' }));
        form.appendChild(createFormGroup('orderErrorPenalty', '叫貨錯誤', 'number', data.orderErrorPenalty, '每次叫貨錯誤扣分 (請用負數)', { step: 'any' }));
        form.appendChild(createFormGroup('salesGoalBonus', '達成業績目標', 'number', data.salesGoalBonus, '達成設定的業績目標加分', { step: 'any', min: '0' }));

        container.appendChild(form);

    } catch (error) {
        console.error("Error loading Score Params:", error);
        container.innerHTML = `<p style="color:red;">載入綜合分數設定失敗: ${error.message}</p>`;
    }
}

/** Load Other Params (Placeholder) */
async function loadOtherParams(container, db, user) {
    console.log("Loading Other Params (Placeholder)...");
    container.innerHTML = '<p class="text-muted">此分類暫無設定項目。</p>';
}

/**
 * 載入庫存盤點參數
 * @param {HTMLElement} container - 渲染內容的容器
 * @param {firebase.firestore.Firestore} db - Firestore 實例
 * @param {Object} user - 當前登入的使用者
 */
async function loadInventoryParams(container, db, user) {
    console.log("執行 loadInventoryParams...");
    container.innerHTML = '<div class="loading-placeholder">載入庫存盤點設定中...</div>';

    try {
        // 獲取庫存盤點設定
        const docRef = db.collection('settings').doc('inventory_check');
        const docSnap = await docRef.get();
        const inventoryConfig = docSnap.exists ? docSnap.data() : {};

        // 提取現有配置或設定默認值
        const isCheckPeriodActive = inventoryConfig.isCheckPeriodActive !== undefined ? inventoryConfig.isCheckPeriodActive : false;
        const daysBeforeMonthEnd = inventoryConfig.daysBeforeMonthEnd || 3;
        const daysAfterMonthStart = inventoryConfig.daysAfterMonthStart || 1;
        const notifyEarlyDays = inventoryConfig.notifyEarlyDays || 3;
        const inventoryThemes = inventoryConfig.inventoryThemes || [
            {id: 'default', name: '默認橙色', primaryColor: '#ff7043'},
            {id: 'blue', name: '清新藍', primaryColor: '#2196F3'},
            {id: 'green', name: '森林綠', primaryColor: '#4CAF50'}
        ];
        
        // 獲取當前主題
        const currentTheme = inventoryConfig.currentTheme || 'default';

        // 創建表單 HTML
        let html = `
        <form id="inventory-params-form">
            <div class="form-group">
                <label for="inventory-check-active">
                    <input type="checkbox" id="inventory-check-active" name="isCheckPeriodActive" ${isCheckPeriodActive ? 'checked' : ''}>
                    啟用庫存盤點期間
                </label>
                <small class="form-text text-muted">開啟此選項將允許員工進行盤點，無論當前日期是否為月底。關閉則只在月底指定期間才可盤點。</small>
            </div>
            
            <div class="form-group">
                <label for="inventory-days-before">月底前多少天開始盤點:</label>
                <input type="number" id="inventory-days-before" name="daysBeforeMonthEnd" class="form-control" min="1" max="10" value="${daysBeforeMonthEnd}">
                <small class="form-text text-muted">例如：設為 3 表示從月底前 3 天開始允許盤點 (28、29、30日)</small>
            </div>
            
            <div class="form-group">
                <label for="inventory-days-after">月初後多少天允許補盤:</label>
                <input type="number" id="inventory-days-after" name="daysAfterMonthStart" class="form-control" min="0" max="5" value="${daysAfterMonthStart}">
                <small class="form-text text-muted">例如：設為 1 表示月初第 1 天仍允許補盤</small>
            </div>
            
            <div class="form-group">
                <label for="inventory-notify-days">提前多少天開始提醒:</label>
                <input type="number" id="inventory-notify-days" name="notifyEarlyDays" class="form-control" min="1" max="7" value="${notifyEarlyDays}">
                <small class="form-text text-muted">例如：設為 3 表示從盤點開始前 3 天開始提醒</small>
            </div>
            
            <div class="form-group">
                <label>盤點介面主題:</label>
                <div class="inventory-themes-container">`;
        
        // 添加主題選項
        inventoryThemes.forEach(theme => {
            html += `
                <div class="inventory-theme-option">
                    <input type="radio" id="theme-${theme.id}" name="currentTheme" value="${theme.id}" ${theme.id === currentTheme ? 'checked' : ''}>
                    <label for="theme-${theme.id}" class="inventory-theme-label" style="background-color: ${theme.primaryColor}">
                        ${theme.name}
                    </label>
                </div>`;
        });
        
        html += `
                </div>
                <small class="form-text text-muted">選擇盤點介面顏色主題</small>
            </div>
            
            <div class="inventory-summary-section">
                <h4>上月盤點數據摘要</h4>
                <div id="inventory-summary-container">
                    <p class="loading-placeholder">載入盤點摘要數據中...</p>
                </div>
            </div>
        </form>`;
        
        // 更新容器內容
        container.innerHTML = html;
        
        // 添加主題選擇的樣式
        addInventoryThemeStyles();
        
        // 載入盤點摘要數據
        loadInventorySummary(db);
        
    } catch (error) {
        console.error("載入庫存盤點設定錯誤:", error);
        container.innerHTML = `<p style="color:red;">載入庫存盤點設定失敗：${error.message}</p>`;
    }
}

/**
 * 添加庫存盤點主題選擇的樣式
 */
function addInventoryThemeStyles() {
    if (document.getElementById('inventory-theme-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'inventory-theme-styles';
    style.textContent = `
        .inventory-themes-container {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 10px;
        }
        
        .inventory-theme-option {
            position: relative;
        }
        
        .inventory-theme-option input[type="radio"] {
            position: absolute;
            opacity: 0;
            cursor: pointer;
        }
        
        .inventory-theme-label {
            display: inline-block;
            padding: 8px 15px;
            border-radius: 4px;
            color: white;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        
        .inventory-theme-option input[type="radio"]:checked + .inventory-theme-label {
            box-shadow: 0 0 0 2px #333, 0 2px 5px rgba(0,0,0,0.3);
            transform: translateY(-2px);
        }
        
        .inventory-theme-option input[type="radio"]:focus + .inventory-theme-label {
            box-shadow: 0 0 0 2px #007bff, 0 2px 5px rgba(0,0,0,0.3);
        }
        
        .inventory-summary-section {
            margin-top: 25px;
            padding: 15px;
            background-color: #f5f5f5;
            border-radius: 4px;
        }
        
        .inventory-summary-section h4 {
            margin-top: 0;
            color: #333;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * 載入上月盤點摘要數據
 */
async function loadInventorySummary(db) {
    const summaryContainer = document.getElementById('inventory-summary-container');
    if (!summaryContainer) return;
    
    try {
        // 計算上月的年月
        const now = new Date();
        now.setMonth(now.getMonth() - 1);
        const prevYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthCheckId = `inventory-${prevYearMonth}`;
        
        // 查詢上月的盤點記錄
        const checksQuery = await db.collection('inventory_checks')
            .where('monthId', '==', monthCheckId)
            .where('status', '==', 'completed')
            .get();
        
        // 如果沒有記錄
        if (checksQuery.empty) {
            summaryContainer.innerHTML = `<p class="empty-placeholder">未找到 ${prevYearMonth} 月的盤點記錄</p>`;
            return;
        }
        
        // 處理盤點記錄
        const stores = [];
        const completionDates = [];
        const itemStatistics = {}; // 用於統計物品數量
        
        checksQuery.forEach(doc => {
            const data = doc.data();
            if (data.store) {
                stores.push(data.store);
                
                // 添加完成日期
                if (data.checkDate) {
                    const checkDate = data.checkDate.toDate ? data.checkDate.toDate() : new Date(data.checkDate);
                    completionDates.push({
                        store: data.store,
                        date: checkDate
                    });
                }
                
                // 統計物品數量
                if (data.items && Array.isArray(data.items)) {
                    data.items.forEach(item => {
                        if (!itemStatistics[item.id]) {
                            itemStatistics[item.id] = {
                                id: item.id,
                                name: item.name,
                                category: item.category,
                                totalCount: 0,
                                stores: 0
                            };
                        }
                        
                        itemStatistics[item.id].totalCount += (item.count || 0);
                        itemStatistics[item.id].stores++;
                    });
                }
            }
        });
        
        // 排序完成日期
        completionDates.sort((a, b) => a.date - b.date);
        
        // 找出最早和最晚完成盤點的分店
        const firstStore = completionDates.length > 0 ? completionDates[0] : null;
        const lastStore = completionDates.length > 0 ? completionDates[completionDates.length - 1] : null;
        
        // 計算平均每個物品的數量
        const topItems = Object.values(itemStatistics)
            .filter(item => item.stores > 0)
            .sort((a, b) => b.totalCount / b.stores - a.totalCount / a.stores)
            .slice(0, 5); // 取前5名
        
        // 創建摘要 HTML
        let html = `
        <div class="inventory-statistics">
            <p><strong>${prevYearMonth} 月盤點統計:</strong></p>
            <p>共有 <strong>${stores.length}</strong> 家分店完成盤點</p>`;
        
        if (firstStore) {
            html += `<p>最早完成盤點: <strong>${firstStore.store}</strong> (${firstStore.date.toLocaleDateString()})</p>`;
        }
        
        if (lastStore) {
            html += `<p>最晚完成盤點: <strong>${lastStore.store}</strong> (${lastStore.date.toLocaleDateString()})</p>`;
        }
        
        // 如果有前五名物品，顯示庫存排行
        if (topItems.length > 0) {
            html += `
            <div class="inventory-top-items">
                <p><strong>庫存數量前五名:</strong></p>
                <table class="inventory-table">
                    <thead>
                        <tr>
                            <th>物品名稱</th>
                            <th>類別</th>
                            <th>平均數量</th>
                            <th>總數量</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            topItems.forEach(item => {
                const avgCount = (item.totalCount / item.stores).toFixed(1);
                html += `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.category}</td>
                        <td>${avgCount}</td>
                        <td>${item.totalCount}</td>
                    </tr>`;
            });
            
            html += `
                    </tbody>
                </table>
            </div>`;
        }
        
        html += `</div>`;
        
        // 更新容器內容
        summaryContainer.innerHTML = html;
        
        // 添加表格樣式
        addInventoryTableStyles();
        
    } catch (error) {
        console.error("載入盤點摘要錯誤:", error);
        summaryContainer.innerHTML = `<p class="error-message">載入盤點摘要失敗：${error.message}</p>`;
    }
}

/**
 * 添加庫存盤點表格樣式
 */
function addInventoryTableStyles() {
    if (document.getElementById('inventory-table-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'inventory-table-styles';
    style.textContent = `
        .inventory-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }
        
        .inventory-table th, .inventory-table td {
            padding: 8px 12px;
            text-align: left;
            border: 1px solid #ddd;
        }
        
        .inventory-table th {
            background-color: #f0f0f0;
            font-weight: bold;
        }
        
        .inventory-table tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .inventory-table tr:hover {
            background-color: #f0f0f0;
        }
        
        .inventory-statistics p {
            margin: 5px 0;
        }
        
        .inventory-top-items {
            margin-top: 15px;
        }
    `;
    
    document.head.appendChild(style);
}

// --- Global Save Function ---

async function handleSaveAllParams() {
    const saveButton = document.getElementById('save-all-params-btn');
    const globalMsg = document.getElementById('consolidated-params-message');

    if (!params_db || !params_currentUser) {
        console.error("Firestore DB or User not initialized.");
        if (globalMsg) {
             globalMsg.textContent = '錯誤：無法連接到數據庫或未登入。';
             globalMsg.className = 'alert alert-danger';
        }
        return;
    }
    if (saveButton) saveButton.disabled = true;
    if (globalMsg) {
        globalMsg.textContent = '正在儲存設定...';
        globalMsg.className = 'alert alert-info';
    }

    const batch = params_db.batch();
    let updatedCategories = [];
    let hasError = false;

    // Helper function to process a form
    // MODIFIED: processForm to correctly handle type conversion
    const processForm = (formId, docId, categoryName, typeConverters = {}) => {
        const form = document.getElementById(formId);
        const fieldset = form ? form.closest('fieldset') : null;
        // Only process if form exists AND the category was loaded
        if (form && fieldset && fieldset.dataset.loaded === 'true') {
            console.log(`Processing form: ${formId}`);
            const formData = new FormData(form);
            const updateData = {};
            let formHasError = false; // Track errors within this form

            formData.forEach((value, key) => {
                 let convertedValue = value;
                 const inputElement = form.elements[key];

                 // Handle checkboxes specifically
                 if (inputElement?.type === 'checkbox') {
                     updateData[key] = inputElement.checked;
                     return;
                 }

                 // Apply type converters if provided for this key
                 if (typeConverters[key] && typeof typeConverters[key] === 'function') {
                     try {
                         convertedValue = typeConverters[key](value);
                         // Additional check for NaN specifically for number conversions
                         if (typeof convertedValue === 'number' && isNaN(convertedValue)) {
                             console.warn(`Conversion resulted in NaN for field ${key} in form ${formId}. Input: '${value}'. Using default 0.`);
                             convertedValue = 0; // Default to 0 if conversion fails
                         }
                     } catch (e) {
                         console.error(`Error converting field ${key} in form ${formId}:`, e);
                         formHasError = true; // Mark form as having an error
                         convertedValue = null; // Indicate conversion failure
                     }
                 } else if (inputElement?.type === 'number') {
                      // Default number conversion if no specific converter provided
                      convertedValue = parseFloat(value);
                      if (isNaN(convertedValue)) {
                          console.warn(`Invalid number format for field ${key} in form ${formId}. Input: '${value}'. Using default 0.`);
                          convertedValue = 0;
                      }
                 } else if (inputElement?.type === 'datetime-local' && value === '') {
                      convertedValue = null; // Treat empty datetime as null
                 }
                 // --- Add other default conversions if necessary --- 

                 // --- START VALIDATION --- 
                 let validationError = null;
                 if (formId === 'schedule-config-form') { // Only apply these rules to the schedule form
                     if (key === 'scheduleMonth') {
                         if (typeof convertedValue !== 'string' || !/^\d{4}-\d{2}$/.test(convertedValue)) {
                             validationError = `排班月份 (${key}) 格式錯誤，應為 YYYY-MM。`;
                         }
                     } else if (key === 'lockTimeoutMinutes') {
                         // parseInteger defaults to 0, but we need >= 1
                         if (!Number.isInteger(convertedValue) || convertedValue < 1) {
                             validationError = `排班鎖定超時 (${key}) 必須是至少為 1 的整數。`;
                         }
                     } else if (['maxLeaveDaysPerPerson', 'maxLeaveDaysPerDayTotal', 'maxWeekendLeaveDaysPerPerson', 'maxLeavePerDaySameStore', 'maxStandbyLeavePerDay', 'maxPartTimeLeavePerDay'].includes(key)) {
                         // parseInteger defaults to 0, check if it's a non-negative integer
                         if (!Number.isInteger(convertedValue) || convertedValue < 0) {
                             validationError = `欄位 (${key}) 必須是 0 或正整數。`;
                         }
                     } else if (key === 'windowStart' || key === 'windowEnd') {
                         // Allow null (empty input), but validate if a value is provided
                         if (convertedValue !== null && isNaN(new Date(convertedValue).getTime())) {
                             validationError = `欄位 (${key}) 的日期時間格式無效。`;
                         }
                         // Optional: Check if windowStart is before windowEnd (more complex, requires both values)
                     }
                      // Optional: Add basic format check for storeHolidays/restrictedDays if needed
                      // Example (very basic check for structure):
                      // else if (key === 'storeHolidays' || key === 'restrictedDays') {
                      //    if (typeof convertedValue === 'string' && convertedValue.length > 0 && !/^[\w\u4e00-\u9fa5]+=.*$/.test(convertedValue)) {
                      //        // This regex is very basic, adjust as needed
                      //        validationError = `欄位 (${key}) 格式可能不符 (應類似 分店名=日期;...)`;
                      //    }
                      // }
                 }
                 // --- Add validations for other forms if needed ---

                 if (validationError) {
                     console.error(`Validation Error in form ${formId}, field ${key}: ${validationError}. Input: '${value}'`);
                     formHasError = true;
                     convertedValue = null; // Prevent saving this invalid value
                 }
                 // --- END VALIDATION ---

                 if (convertedValue !== null) { // Only add if conversion AND validation passed
                    updateData[key] = convertedValue;
                 }
            });

            // Include unchecked checkboxes as false
             const checkboxes = form.querySelectorAll('input[type="checkbox"]');
             checkboxes.forEach(cb => {
                 if (!updateData.hasOwnProperty(cb.name)) {
                     updateData[cb.name] = false;
                 }
             });

            if (!formHasError) {
                const docRef = params_db.collection('settings').doc(docId);
                batch.set(docRef, updateData, { merge: true });
                updatedCategories.push(categoryName);
                console.log(`Added ${categoryName} update to batch:`, updateData);
            } else {
                 hasError = true; // Mark global error if any form had errors
                 console.error(`Skipping save for ${categoryName} due to conversion errors in form ${formId}.`);
                 // Optionally display a more specific error message
                 if(globalMsg) {
                     globalMsg.textContent = `儲存 ${categoryName} 時發現錯誤，請檢查欄位格式。`;
                     globalMsg.className = 'alert alert-warning';
                 }
            }
        } else {
            console.log(`Skipping form: ${formId} (not found or category not loaded)`);
        }
    };

    try {
        // --- Define Type Conversion Functions --- 
        const parseInteger = (val) => parseInt(val, 10) || 0;
        const parseFloatNumber = (val) => parseFloat(val) || 0;
        // const parseDateTime = (val) => val ? firebase.firestore.Timestamp.fromDate(new Date(val)) : null;

        // --- Process each relevant form with correct converters --- 
        processForm('main-config-form', 'store_config', '主要參數'); // Assuming main params are mostly strings
        processForm('schedule-config-form', 'schedule_config', '排班參數', {
             // Pass the actual functions, not strings
             lockTimeoutMinutes: parseInteger,
             maxLeaveDaysPerPerson: parseInteger,
             maxLeaveDaysPerDayTotal: parseInteger,
             maxWeekendLeaveDaysPerPerson: parseInteger,
             maxLeavePerDaySameStore: parseInteger,
             maxStandbyLeavePerDay: parseInteger,
             maxPartTimeLeavePerDay: parseInteger,
             // windowStart: parseDateTime, // Example if storing as Timestamp
             // windowEnd: parseDateTime
         });
        processForm('notification-config-form', 'notification_config', '通知設定(啟用項目)'); // Mostly checkboxes
        processForm('payroll-config-form', 'payroll_config', '薪資參數', {
             partTimeHourlyRate: parseFloatNumber, // Use parseFloat for rates/hours
             normalDailyHours: parseFloatNumber,
             normalWeeklyHours: parseFloatNumber,
             defaultOvertimeRate: parseFloatNumber,
             holidayRate: parseFloatNumber
         });
        // Create a converter map for all permission fields
        const permissionConverters = {};
        const permissionFields = [
            'index_html', 'register_html', 'pending_html',
            'announce_html', 'leave_html', 'order_html',
            'sales_html', 'clockin_html', 'salary_html',
            'cram_school_html', 'admin_html', 'schedule_gen_html',
            'salary_view_html', 'schedule_view_html', 'referendum_html'
        ];
        permissionFields.forEach(field => { permissionConverters[field] = parseInteger; });
        processForm('permissions-config-form', 'page_permissions', '頁面權限', permissionConverters);
        
        // Create a converter map for all score fields
        const scoreConverters = {};
        const scoreFields = [
            'onTimeBonus', 'latePenalty', 'leaveRequestPenalty', 'leaveApprovedBonus', 
            'orderOnTimeBonus', 'orderErrorPenalty', 'salesGoalBonus'
            // Add any other score field names here
        ];
        scoreFields.forEach(field => { scoreConverters[field] = parseFloatNumber; }); // Scores might have decimals
        processForm('score-config-form', 'score_config', '分數設定', scoreConverters);

        // Note: SalesFields, OrderItems, BonusTasks, Payroll Structures are managed elsewhere

        // --- Commit the batch --- 
        if (updatedCategories.length > 0 && !hasError) {
            console.log("Committing batch for categories:", updatedCategories);
            await batch.commit();
            console.log("Batch commit successful.");

            if (globalMsg) {
                globalMsg.textContent = '已儲存完成';
                globalMsg.className = 'alert alert-success';
            }

        } else if (hasError) {
             console.error("Save process failed due to errors. Batch not committed.");
             // Keep the more specific error message set within processForm if it exists
             if (globalMsg && !globalMsg.textContent.includes('檢查欄位格式')) { 
                 globalMsg.textContent = '部分設定儲存失敗，請檢查控制台錯誤訊息。';
                 globalMsg.className = 'alert alert-danger';
             }
        } else {
            console.log("No categories loaded or changed, nothing to commit in batch.");
             if (globalMsg) {
               globalMsg.textContent = '沒有需要儲存的變更。請先展開並修改區塊內容。';
               globalMsg.className = 'alert alert-warning';
             }
        }

    } catch (error) {
        console.error("Error saving parameters during batch commit:", error);
        hasError = true; // Mark error even if it happens during commit
        if (globalMsg) {
            globalMsg.textContent = `儲存設定時發生嚴重錯誤: ${error.message}`;
            globalMsg.className = 'alert alert-danger';
        }
    } finally {
        console.log("Save process finished.");
        if (saveButton) saveButton.disabled = false;
        setTimeout(() => {
            if (globalMsg && !hasError && updatedCategories.length > 0) {
                globalMsg.textContent = '';
                globalMsg.className = '';
            }
        }, 5000);
    }
}

console.log("admin-parameters.js (Scheduling Load Implemented) loaded");

// 添加白話文說明生成邏輯
function generatePlainDescription(task) {
    if (!task) return '';
    
    let plainText = '';
    
    // 基本任務類型判斷
    if (task.type === 'attendance') {
        plainText = `出勤率達到 ${task.target}%`;
        if (task.period > 1) {
            plainText += ` (連續 ${task.period} 個月)`;
        }
    } else if (task.type === 'sales') {
        plainText = `銷售額達到 ${formatCurrency(task.target)}`;
        if (task.period > 1) {
            plainText += ` (連續 ${task.period} 個月)`;
        }
    } else if (task.type === 'customer_rating') {
        plainText = `顧客評價達到 ${task.target} 分`;
        if (task.period > 1) {
            plainText += ` (連續 ${task.period} 個月)`;
        }
    } else if (task.type === 'peer_rating') {
        plainText = `同事評價達到 ${task.target} 分`;
        if (task.period > 1) {
            plainText += ` (連續 ${task.period} 個月)`;
        }
    } else if (task.type === 'training') {
        plainText = `完成 ${task.target} 小時的培訓`;
        if (task.period > 1) {
            plainText += ` (在 ${task.period} 個月內)`;
        }
    } else if (task.type === 'suggestion') {
        plainText = `提出 ${task.target} 個有效的建議`;
        if (task.period > 1) {
            plainText += ` (在 ${task.period} 個月內)`;
        }
    } else if (task.type === 'custom') {
        plainText = task.description || '自定義任務';
    }
    
    // 添加獎金信息
    if (task.bonus_amount) {
        plainText += `，獎金 ${formatCurrency(task.bonus_amount)}`;
    } else if (task.bonus_percentage) {
        plainText += `，獎金為基本工資的 ${task.bonus_percentage}%`;
    }
    
    return plainText;
}

// 格式化貨幣顯示
function formatCurrency(amount) {
    return new Intl.NumberFormat('zh-TW', { 
        style: 'currency', 
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// 修改現有的獎金任務表單函數，添加白話文說明
function setupBonusTaskForm() {
    // ... existing code ...
    
    // 添加白話文說明預覽區域
    const plainDescriptionPreview = document.createElement('div');
    plainDescriptionPreview.id = 'plain-description-preview';
    plainDescriptionPreview.className = 'form-text text-info mb-3';
    plainDescriptionPreview.innerHTML = '<strong>白話文說明：</strong> <span id="plain-text-content"></span>';
    
    // 找到合適的位置插入預覽區域
    const formGroup = document.querySelector('#bonus-task-form .form-group:nth-child(3)');
    if (formGroup) {
        formGroup.after(plainDescriptionPreview);
    }
    
    // 添加自定義白話文說明輸入框
    const customPlainDescInput = document.createElement('div');
    customPlainDescInput.className = 'form-group';
    customPlainDescInput.innerHTML = `
        <label for="custom-plain-description">自定義白話文說明（可選）</label>
        <textarea class="form-control" id="custom-plain-description" rows="2" 
                  placeholder="若不填寫，系統將自動生成說明文字"></textarea>
        <small class="form-text text-muted">如果自動生成的說明不夠清楚，可以在這裡自行輸入更易懂的說明</small>
    `;
    
    // 將自定義說明框添加到表單中
    plainDescriptionPreview.after(customPlainDescInput);
    
    // 為表單元素添加更新事件
    const taskTypeSelect = document.getElementById('task-type');
    const targetInput = document.getElementById('target-value');
    const periodInput = document.getElementById('period');
    const bonusAmountInput = document.getElementById('bonus-amount');
    const bonusPercentageInput = document.getElementById('bonus-percentage');
    const customPlainDesc = document.getElementById('custom-plain-description');
    const plainTextContent = document.getElementById('plain-text-content');
    
    // 更新白話文預覽的函數
    function updatePlainTextPreview() {
        // 如果有自定義說明，優先使用自定義說明
        if (customPlainDesc.value.trim()) {
            plainTextContent.textContent = customPlainDesc.value.trim();
            return;
        }
        
        // 否則構建任務對象並生成說明
        const task = {
            type: taskTypeSelect.value,
            target: parseFloat(targetInput.value) || 0,
            period: parseInt(periodInput.value) || 1,
            bonus_amount: parseFloat(bonusAmountInput.value) || 0,
            bonus_percentage: parseFloat(bonusPercentageInput.value) || 0,
            description: document.getElementById('description')?.value
        };
        
        plainTextContent.textContent = generatePlainDescription(task);
    }
    
    // 為相關輸入元素添加事件監聽器
    [taskTypeSelect, targetInput, periodInput, bonusAmountInput, 
     bonusPercentageInput, customPlainDesc].forEach(element => {
        if (element) {
            element.addEventListener('input', updatePlainTextPreview);
            element.addEventListener('change', updatePlainTextPreview);
        }
    });
    
    // 初始更新一次預覽
    setTimeout(updatePlainTextPreview, 500);
    
    // ... existing code ...
    
    // 修改保存獎金任務的邏輯，添加白話文說明
    document.getElementById('save-bonus-task').addEventListener('click', function() {
        // ... existing code ...
        
        // 添加白話文說明到任務數據中
        const customPlainDesc = document.getElementById('custom-plain-description');
        if (customPlainDesc && customPlainDesc.value.trim()) {
            taskData.plain_description = customPlainDesc.value.trim();
        } else {
            // 使用自動生成的白話文
            taskData.plain_description = generatePlainDescription(taskData);
        }
        
        // ... existing code ...
    });
}

// 修改顯示獎金任務列表的函數，添加白話文說明列
function displayBonusTasks(tasks) {
    // ... existing code ...
    
    // 修改表頭，添加白話文說明列
    if (tableHeader) {
        // 檢查是否已有白話文說明列
        if (!tableHeader.querySelector('th[data-field="plain_description"]')) {
            // 在描述列之後插入白話文說明列
            const descriptionCol = tableHeader.querySelector('th[data-field="description"]');
            if (descriptionCol) {
                const plainDescCol = document.createElement('th');
                plainDescCol.setAttribute('data-field', 'plain_description');
                plainDescCol.textContent = '白話說明';
                descriptionCol.after(plainDescCol);
            }
        }
    }
    
    // 修改任務行渲染邏輯，添加白話文說明單元格
    tasks.forEach(task => {
        // ... existing code ...
        
        // 添加白話文說明單元格
        const plainDescTd = document.createElement('td');
        plainDescTd.textContent = task.plain_description || generatePlainDescription(task);
        
        // 在描述單元格之後插入白話文說明單元格
        const descriptionTd = newRow.querySelector('td[data-field="description"]');
        if (descriptionTd) {
            descriptionTd.after(plainDescTd);
        }
        
        // ... existing code ...
    });
    
    // ... existing code ...
}

// ... existing code ...