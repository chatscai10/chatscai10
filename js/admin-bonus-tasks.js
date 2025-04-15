// js/admin-bonus-tasks.js

// Assuming db instance is globally available or passed correctly
// For example, initialized in initAdminPage in admin-logic.js and passed around

let currentEditingTaskId = null; // Track the task being edited

// --- Constants for Condition Editor (Phase 2 Expansion) ---
const CONDITION_TYPE_OPTIONS = {
    "TENURE": "年資",
    "ATTENDANCE": "出勤",
    "SALES": "銷售"
    // Add other types later
};

const METRIC_OPTIONS = {
    "TENURE": {
        "days_employed": "在職天數"
    },
    "ATTENDANCE": {
        "on_time_rate": "準時率 (0-1)",
        "absence_days": "缺勤天數",
        "late_count": "遲到次數"
        // Add more attendance metrics
    },
    "SALES": {
        "store_target_rate": "店鋪目標達成率 (eg 1.1)",
        "personal_sales_amount": "個人銷售額",
        "store_total_sales": "店鋪總銷售額"
        // Add more sales metrics
    }
    // Add metrics for other types later
};

const OPERATOR_OPTIONS = {
    ">=": ">= (大於等於)",
    "<=": "<= (小於等於)",
    "==": "== (等於)",
    ">": "> (大於)",
    "<": "< (小於)"
};

// Function to load bonus tasks into the admin table
async function loadBonusTasksSection(db) {
    console.log("Loading bonus tasks section...");
    const tableBody = document.querySelector('#bonus-tasks-table tbody');
    const loadingRowHTML = '<tr><td colspan="4" class="loading-placeholder text-center">載入獎金任務中...</td></tr>'; // Keep the HTML structure

    if (!db || typeof db.collection !== 'function') {
        console.error("Firestore instance (db) is not available or invalid in loadBonusTasksSection.");
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="4" class="error-message">資料庫連線錯誤，無法載入獎金任務。</td></tr>';
        }
        return;
    }

     // Ensure loading row is visible initially
    if (tableBody) {
        tableBody.innerHTML = loadingRowHTML;
    }


    try {
        const tasksSnapshot = await db.collection('bonus_tasks').orderBy('createdAt', 'desc').get();
        if (tableBody) tableBody.innerHTML = ''; // Clear loading or previous content

        if (tasksSnapshot.empty) {
            if (tableBody) tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">目前沒有任何獎金任務。</td></tr>';
            return;
        }

        tasksSnapshot.forEach(doc => {
            const task = doc.data();
            const taskId = doc.id;
            const row = document.createElement('tr');
            row.setAttribute('data-task-id', taskId);

            // Basic check for essential data
            const taskName = task.name || '未命名任務';
            const rewardValue = task.rewardValue !== undefined ? task.rewardValue : '未設定';
            const isActive = task.isActive !== undefined ? task.isActive : false; // Default to inactive if undefined

            row.innerHTML = `
                <td>${escapeHTML(taskName)}</td>
                <td>${escapeHTML(rewardValue.toString())}</td>
                <td><span class="status-${isActive ? 'active' : 'inactive'}">${isActive ? '啟用中' : '已停用'}</span></td>
                <td>
                    <button class="btn btn-sm btn-info btn-edit-task" data-id="${taskId}">編輯</button>
                    <button class="btn btn-sm btn-danger btn-delete-task" data-id="${taskId}">刪除</button>
                </td>
            `;
            if (tableBody) tableBody.appendChild(row);
        });

        // Add event listeners for edit/delete buttons after rendering
        addTableButtonListeners(db);

    } catch (error) {
        console.error("Error loading bonus tasks:", error);
         if (tableBody) tableBody.innerHTML = `<tr><td colspan="4" class="error-message">載入獎金任務時發生錯誤: ${escapeHTML(error.message)}</td></tr>`;
    } finally {
        // Ensure loading indicator is hidden finally, although clearinginnerHTML should handle it
         const finalLoadingRow = tableBody ? tableBody.querySelector('.loading-placeholder') : null;
         if (finalLoadingRow) {
             finalLoadingRow.remove();
         }
        console.log("Finished loading bonus tasks.");
    }
}

// Add listeners to buttons within the tasks table
function addTableButtonListeners(db) {
    document.querySelectorAll('#bonus-tasks-table .btn-edit-task').forEach(button => {
         // Remove existing listener to prevent duplicates if re-called
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        newButton.addEventListener('click', (e) => {
            const taskId = e.target.getAttribute('data-id');
            openBonusTaskModal(db, taskId); // Function to open modal for editing
        });
    });

    document.querySelectorAll('#bonus-tasks-table .btn-delete-task').forEach(button => {
        // Remove existing listener
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        newButton.addEventListener('click', (e) => {
            const taskId = e.target.getAttribute('data-id');
            const taskName = e.target.closest('tr')?.querySelector('td:first-child')?.textContent || '該任務';
            if (confirm(`確定要刪除獎金任務「${taskName}」嗎？此操作無法復原。`)) {
                deleteBonusTask(db, taskId);
            }
        });
    });
}

// Function to open the modal (for new or existing task)
async function openBonusTaskModal(db, taskId = null) {
    currentEditingTaskId = taskId;
    const modal = document.getElementById('bonus-task-modal');
    const form = document.getElementById('bonus-task-form-modal');
    const title = document.getElementById('bonus-task-modal-title');
    const messageElement = document.getElementById('bonus-task-modal-message');
    const saveButton = document.getElementById('save-bonus-task-btn');


    if (!modal || !form || !title || !messageElement || !saveButton) {
        console.error("Bonus task modal elements not found!");
        alert("無法開啟獎金任務編輯視窗，缺少必要的 HTML 元件。");
        return;
    }


    form.reset(); // Clear previous form data
    document.getElementById('conditions-container').innerHTML = '<p class="text-muted" id="no-conditions-msg">尚未新增任何條件。</p>'; // Clear conditions
    messageElement.textContent = ''; // Clear previous messages
    messageElement.className = 'message'; // Reset message class
    saveButton.disabled = false; // Ensure save button is enabled initially

    if (taskId) {
        title.textContent = '編輯獎金任務';
        messageElement.textContent = '正在載入任務資料...';
        messageElement.className = 'message info-message';
        saveButton.disabled = true; // Disable save while loading

        // Fetch task data and populate the form
        try {
            if (!db || typeof db.collection !== 'function') {
                throw new Error("資料庫連線無效。");
            }
            const docRef = db.collection('bonus_tasks').doc(taskId);
            const docSnap = await docRef.get();

            if (docSnap.exists) {
                populateBonusTaskForm(docSnap.data());
                messageElement.textContent = ''; // Clear loading message
                messageElement.className = 'message';
                saveButton.disabled = false; // Re-enable save button
            } else {
                console.error(`Task with ID ${taskId} not found.`);
                throw new Error("找不到指定的任務資料。");
            }
        } catch (error) {
            console.error("Error fetching task details:", error);
            messageElement.textContent = `讀取任務資料時發生錯誤: ${error.message}`;
            messageElement.className = 'message error-message';
             // Keep save button disabled on error
            return; // Don't fully open modal if task fetch fails
        }
    } else {
        title.textContent = '新增獎金任務';
        // Set default values for new task
        document.getElementById('modal-bonus-task-active').checked = true;
        document.getElementById('modal-bonus-task-min-level').value = 0;
        document.getElementById('modal-conditions-logic').value = 'AND';
        document.getElementById('modal-eval-trigger').value = 'MONTHLY';
        document.getElementById('modal-eval-frequency').value = 'START_OF_MONTH';
        document.getElementById('modal-eval-offset').value = '-1'; // Default to previous month
        document.getElementById('modal-unlock-min-tenure').value = ''; // Ensure empty if new
    }

    // Show monthly options based on trigger type
    toggleMonthlyEvalOptions();

    modal.style.display = 'block';
}

// Function to populate the form with existing task data
function populateBonusTaskForm(taskData) {
    if (!taskData) return;

    document.getElementById('modal-bonus-task-id').value = currentEditingTaskId; // Set the hidden ID
    document.getElementById('modal-bonus-task-name').value = taskData.name || '';
    document.getElementById('modal-bonus-task-reward').value = taskData.rewardValue !== undefined ? taskData.rewardValue : '';
    document.getElementById('modal-bonus-task-desc').value = taskData.description || '';
    document.getElementById('modal-bonus-task-min-level').value = taskData.minLevel !== undefined ? taskData.minLevel : 0;
    document.getElementById('modal-bonus-task-active').checked = taskData.isActive !== undefined ? taskData.isActive : true;
    document.getElementById('modal-bonus-task-selectable').checked = taskData.isSelectable || false;

    // Unlock conditions (currently only tenure)
    document.getElementById('modal-unlock-min-tenure').value = taskData.unlockConditions?.minTenureDays ?? '';

    // Evaluation Config
    document.getElementById('modal-eval-trigger').value = taskData.evaluationConfig?.triggerType || 'MONTHLY';
    document.getElementById('modal-eval-frequency').value = taskData.evaluationConfig?.evaluationFrequency || 'START_OF_MONTH';
    document.getElementById('modal-eval-offset').value = taskData.evaluationConfig?.evaluationMonthOffset ?? -1;


    // Core Conditions Logic and Conditions
    document.getElementById('modal-conditions-logic').value = taskData.conditionsLogic || 'AND';
    const conditionsContainer = document.getElementById('conditions-container');
    conditionsContainer.innerHTML = ''; // Clear placeholder or previous conditions

    if (taskData.conditions && taskData.conditions.length > 0) {
        taskData.conditions.forEach((condition, index) => {
            addConditionRow(condition, index); // Pass condition data to populate the row
        });
    } else {
         conditionsContainer.innerHTML = '<p class="text-muted" id="no-conditions-msg">尚未新增任何條件。</p>';
    }
    // Ensure evaluation options visibility is correct after populating
     toggleMonthlyEvalOptions();
}

// Function to add a condition row to the modal form (MODIFIED)
function addConditionRow(conditionData = {}, index = null) {
    const container = document.getElementById('conditions-container');
    if (!container) return;

    const noConditionsMsg = document.getElementById('no-conditions-msg');
    if (noConditionsMsg) {
        noConditionsMsg.remove();
    }

    const conditionRow = document.createElement('div');
    conditionRow.className = 'form-row condition-row mb-2 align-items-center';
    const uniqueIdSuffix = (index !== null && index !== undefined) ? index : Date.now();
    const baseId = `condition-${uniqueIdSuffix}`;

    // --- Get data or defaults ---
    const type = conditionData.type || Object.keys(CONDITION_TYPE_OPTIONS)[0]; // Default to first type (TENURE)
    const metric = conditionData.metric || Object.keys(METRIC_OPTIONS[type] || {})[0]; // Default to first metric of the type
    const operator = conditionData.operator || '>=';
    const value = conditionData.value !== undefined ? conditionData.value : '';
    // const params = conditionData.params || {}; // For future use

    // --- Generate HTML --- 
    // Type Select
    let typeOptionsHtml = '';
    for (const [val, text] of Object.entries(CONDITION_TYPE_OPTIONS)) {
        typeOptionsHtml += `<option value="${val}" ${type === val ? 'selected' : ''}>${escapeHTML(text)}</option>`;
    }
    const typeSelectHtml = `
        <div class="col-md-3">
            <label class="sr-only" for="${baseId}-type">類型</label>
            <select id="${baseId}-type" class="form-control form-control-sm condition-type">
                ${typeOptionsHtml}
            </select>
        </div>`;

    // Metric Select (Options will be populated by updateMetricOptions)
    const metricSelectHtml = `
        <div class="col-md-3">
            <label class="sr-only" for="${baseId}-metric">指標</label>
            <select id="${baseId}-metric" class="form-control form-control-sm condition-metric">
                <!-- Options populated dynamically -->
            </select>
        </div>`;

    // Operator Select
    let operatorOptionsHtml = '';
    for (const [val, text] of Object.entries(OPERATOR_OPTIONS)) {
         operatorOptionsHtml += `<option value="${val}" ${operator === val ? 'selected' : ''}>${escapeHTML(text)}</option>`;
    }
    const operatorSelectHtml = `
        <div class="col-md-2">
            <label class="sr-only" for="${baseId}-op">比較</label>
            <select id="${baseId}-op" class="form-control form-control-sm condition-operator">
                ${operatorOptionsHtml}
            </select>
        </div>`;

    // Value Input (Type and placeholder might change)
    let valueInputType = 'number';
    let valuePlaceholder = '目標值';
    let valueStep = 'any'; // Allow decimals for rates/amounts
    let valueMin = ''; // Default no min

    // Adjust input based on selected type/metric (can be refined)
    if (type === 'TENURE' && metric === 'days_employed') {
        valuePlaceholder = '目標天數';
        valueStep = '1';
        valueMin = '0';
    } else if (type === 'ATTENDANCE' && metric === 'on_time_rate') {
         valuePlaceholder = '目標準時率 (0-1)';
         valueMin = '0';
         valueStep = '0.01';
    } else if (type === 'ATTENDANCE' && (metric === 'absence_days' || metric === 'late_count')) {
         valuePlaceholder = '目標次數/天數';
         valueStep = '1';
         valueMin = '0';
    } else if (type === 'SALES' && metric === 'store_target_rate') {
         valuePlaceholder = '目標達成率 (eg 1.1)';
         valueMin = '0';
         valueStep = '0.01';
    } else if (type === 'SALES') { // Other sales metrics likely amounts
        valuePlaceholder = '目標金額';
         valueMin = '0';
         valueStep = '0.01';
    }
    // Add more rules for other types/metrics

    const valueInputHtml = `
        <div class="col-md-3">
            <label class="sr-only" for="${baseId}-value">目標值</label>
            <input type="${valueInputType}" id="${baseId}-value" class="form-control form-control-sm condition-value"
                   placeholder="${valuePlaceholder}" value="${escapeHTML(value.toString())}" 
                   ${valueStep ? `step="${valueStep}"` : ''} ${valueMin !== '' ? `min="${valueMin}"` : ''} required>
        </div>`;

    // Remove Button
    const removeButtonHtml = `
        <div class="col-md-1">
            <button type="button" class="btn btn-danger btn-sm remove-condition-btn" title="移除此條件">&times;</button>
        </div>`;

    // Assemble Row
    conditionRow.innerHTML = typeSelectHtml + metricSelectHtml + operatorSelectHtml + valueInputHtml + removeButtonHtml;
    container.appendChild(conditionRow);

    // --- Add Event Listener and Populate Metrics ---
    const typeSelectElement = conditionRow.querySelector('.condition-type');
    if (typeSelectElement) {
        typeSelectElement.addEventListener('change', () => {
             updateMetricOptions(typeSelectElement);
             // Also update value input placeholder/type based on new selection
             updateValueInputAttributes(conditionRow);
        });
        // Initial population of metrics based on the current type
        updateMetricOptions(typeSelectElement, metric); // Pass the initial metric to select it
         // Set initial value attributes correctly
         updateValueInputAttributes(conditionRow);
    } else {
         console.error("Could not find type select element in newly added row.");
    }
}

/**
* Updates the Metric dropdown options based on the selected Type.
* @param {HTMLSelectElement} typeSelectElement - The Type dropdown element.
* @param {string|null} selectedMetricValue - The metric value to pre-select (optional).
*/
function updateMetricOptions(typeSelectElement, selectedMetricValue = null) {
   const conditionRow = typeSelectElement.closest('.condition-row');
   const metricSelectElement = conditionRow?.querySelector('.condition-metric');
   if (!metricSelectElement) {
       console.error("Could not find metric select element for the given type select.");
       return;
   }

   const selectedType = typeSelectElement.value;
   const options = METRIC_OPTIONS[selectedType] || {};

   metricSelectElement.innerHTML = ''; // Clear existing options

   if (Object.keys(options).length === 0) {
       metricSelectElement.innerHTML = '<option value="">-- 無可用指標 --</option>';
       metricSelectElement.disabled = true;
   } else {
       metricSelectElement.disabled = false;
       for (const [val, text] of Object.entries(options)) {
           const option = document.createElement('option');
           option.value = val;
           option.textContent = text;
           if (selectedMetricValue === val) {
               option.selected = true;
           }
           metricSelectElement.appendChild(option);
       }
   }
}

/**
 * Updates the value input field attributes based on the selected type and metric
 * @param {HTMLElement} conditionRow - The condition row element containing the inputs
 */
function updateValueInputAttributes(conditionRow) {
    if (!conditionRow) return;
    
    const typeSelect = conditionRow.querySelector('.condition-type');
    const metricSelect = conditionRow.querySelector('.condition-metric');
    const valueInput = conditionRow.querySelector('.condition-value');
    
    if (!typeSelect || !metricSelect || !valueInput) {
        console.error("Required elements not found in condition row for updating value input.");
        return;
    }
    
    const type = typeSelect.value;
    const metric = metricSelect.value;
    
    // Default attributes
    let inputType = 'number';
    let placeholder = '目標值';
    let step = 'any'; // Allow decimals as default
    let min = ''; // No min by default
    
    // Set attributes based on type/metric combination
    if (type === 'TENURE' && metric === 'days_employed') {
        placeholder = '目標天數';
        step = '1';
        min = '0';
    } else if (type === 'ATTENDANCE' && metric === 'on_time_rate') {
        placeholder = '目標準時率 (0-1)';
        min = '0';
        step = '0.01';
    } else if (type === 'ATTENDANCE' && (metric === 'absence_days' || metric === 'late_count')) {
        placeholder = '目標次數/天數';
        step = '1';
        min = '0';
    } else if (type === 'SALES' && metric === 'store_target_rate') {
        placeholder = '目標達成率 (eg 1.1)';
        min = '0';
        step = '0.01';
    } else if (type === 'SALES') {
        placeholder = '目標金額';
        min = '0';
        step = '0.01';
    }
    
    // Apply the attributes to the input
    valueInput.type = inputType;
    valueInput.placeholder = placeholder;
    valueInput.step = step;
    if (min !== '') {
        valueInput.min = min;
    } else {
        valueInput.removeAttribute('min');
    }
}


// Function to save a bonus task (new or edit)
async function saveBonusTask(db) {
    const messageElement = document.getElementById('bonus-task-modal-message');
    const saveButton = document.getElementById('save-bonus-task-btn');
    
    if (!messageElement || !saveButton) {
        console.error("Could not find essential modal elements for save operation.");
        alert("儲存時發生錯誤：缺少必要的介面元素。");
        return;
    }

    saveButton.disabled = true; // Prevent double submission
    messageElement.textContent = '正在儲存...';
    messageElement.className = 'message info-message';

    try {
        // Validate form inputs
        const taskName = document.getElementById('modal-bonus-task-name').value.trim();
        const rewardStr = document.getElementById('modal-bonus-task-reward').value;
        
        if (!taskName) {
            throw new Error('任務名稱不能為空。');
        }
        
        const rewardValue = parseFloat(rewardStr);
        if (isNaN(rewardValue) || rewardValue < 0) {
            throw new Error('獎勵金額必須是有效的非負數字。');
        }

        // --- Prepare Task Data ---
        const taskData = {
            name: taskName,
            rewardValue: rewardValue,
            description: document.getElementById('modal-bonus-task-desc').value.trim() || '',
            minLevel: parseInt(document.getElementById('modal-bonus-task-min-level').value) || 0,
            isActive: document.getElementById('modal-bonus-task-active').checked,
            isSelectable: document.getElementById('modal-bonus-task-selectable').checked,
            unlockConditions: {},
            evaluationConfig: {
                triggerType: document.getElementById('modal-eval-trigger').value,
                ...(document.getElementById('modal-eval-trigger').value === 'MONTHLY' && {
                    evaluationFrequency: document.getElementById('modal-eval-frequency').value,
                    evaluationMonthOffset: parseInt(document.getElementById('modal-eval-offset').value)
                })
            },
            conditionsLogic: document.getElementById('modal-conditions-logic').value,
            conditions: [],
        };

        // --- Populate Unlock Conditions (Unchanged) ---
        const minTenureStr = document.getElementById('modal-unlock-min-tenure').value;
        if (minTenureStr !== null && minTenureStr.trim() !== '') {
            const minTenureDays = parseInt(minTenureStr);
            if (!isNaN(minTenureDays) && minTenureDays >= 0) {
                taskData.unlockConditions.minTenureDays = minTenureDays;
            } else {
                 document.getElementById('modal-unlock-min-tenure').focus();
                throw new Error('最少在職天數必須是有效的非負整數。');
            }
        }

        // --- Populate Core Conditions (MODIFIED value parsing) ---
        const conditionRows = document.querySelectorAll('#conditions-container .condition-row');
        for (const row of conditionRows) {
            const type = row.querySelector('.condition-type').value;
            const metric = row.querySelector('.condition-metric').value;
            const operator = row.querySelector('.condition-operator').value;
            const valueInput = row.querySelector('.condition-value');
            const valueStr = valueInput.value;

             if (valueStr === null || valueStr.trim() === '') {
                 valueInput.focus();
                 throw new Error(`條件 (${CONDITION_TYPE_OPTIONS[type] || type}) 的目標值必須填寫。`);
            }
            
            // Smart value parsing: try float first, then int, fallback to string? NO, rely on input type? 
            // For now, let's primarily parse as number (float) as most metrics seem numeric. 
            // The backend (Cloud Function) should handle potential type mismatches gracefully.
            let value;
            const numValue = parseFloat(valueStr);
            if (isNaN(numValue)){
                // If it's truly not a number, maybe throw error or store as string?
                // Let's throw error for now if input type is number but value is NaN
                if (valueInput.type === 'number') {
                     valueInput.focus();
                     throw new Error(`條件 (${CONDITION_TYPE_OPTIONS[type] || type}) 的目標值 "${escapeHTML(valueStr)}" 必須是有效的數字。`);
                } else {
                    // If input type allows text, keep as string (future use case)
                     value = valueStr; 
                }
            } else {
                 // If it parses as number, store it as number.
                 // Let backend decide int vs float if needed.
                 value = numValue;
            }

             // Basic validation: check non-negative for common metrics
             if ((type === 'TENURE' && metric === 'days_employed') ||
                 (type === 'ATTENDANCE' && (metric === 'absence_days' || metric === 'late_count')) ||
                 (type === 'SALES')) { 
                 if (value < 0) {
                      valueInput.focus();
                     throw new Error(`條件 (${CONDITION_TYPE_OPTIONS[type] || type}) 的目標值必須是非負數。`);
                 }
             }
              if (type === 'ATTENDANCE' && metric === 'on_time_rate') {
                 if (value < 0 || value > 1) {
                      valueInput.focus();
                      throw new Error(`準時率目標值必須介於 0 和 1 之間。`);
                 }
              }

            // Add the condition to the array
            taskData.conditions.push({
                type: type,
                metric: metric,
                operator: operator,
                value: value
                // params: {} // Add params later if needed
            });
        } // End of conditionRows loop

        // --- Firestore Write Operation (Unchanged) ---
        try {
            // Get the server timestamp for Firebase
            const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
            const taskRef = currentEditingTaskId
                ? db.collection('bonus_tasks').doc(currentEditingTaskId)
                : db.collection('bonus_tasks').doc();

            if (currentEditingTaskId) {
                taskData.lastUpdatedAt = serverTimestamp;
                await taskRef.update(taskData);
                messageElement.textContent = '獎金任務更新成功！';
            } else {
                taskData.createdAt = serverTimestamp;
                taskData.lastUpdatedAt = serverTimestamp;
                await taskRef.set(taskData);
                messageElement.textContent = '獎金任務新增成功！';
            }

            messageElement.classList.remove('info-message', 'error-message');
            messageElement.classList.add('success-message');
            await loadBonusTasksSection(db); // Reload the table

            setTimeout(() => {
                closeModal('bonus-task-modal');
            }, 1500);
        } catch (firestoreError) {
            console.error("Firestore operation error:", firestoreError);
            throw new Error(`資料庫操作錯誤: ${firestoreError.message}`);
        }

    } catch (error) {
        console.error("Error saving bonus task:", error);
        messageElement.textContent = `儲存失敗: ${error.message}`;
        messageElement.className = 'message error-message';
    } finally {
        saveButton.disabled = false;
    }
}

// Function to delete a bonus task
async function deleteBonusTask(db, taskId) {
    console.log(`Attempting to delete task: ${taskId}`);
    // Find row before deleting, in case of immediate UI update needed
    const rowToDelete = document.querySelector(`#bonus-tasks-table tbody tr[data-task-id="${taskId}"]`);

    try {
        if (!db || typeof db.collection !== 'function') {
            throw new Error("資料庫連線無效。");
        }
        await db.collection('bonus_tasks').doc(taskId).delete();
        console.log(`Task ${taskId} deleted successfully.`);

        if (rowToDelete) {
            rowToDelete.remove();
             // Check if table is now empty
             const tableBody = document.querySelector('#bonus-tasks-table tbody');
            if (tableBody && tableBody.rows.length === 0) {
                 tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">目前沒有任何獎金任務。</td></tr>';
            }
        } else {
             // Row not found, maybe already deleted or table reloaded
             await loadBonusTasksSection(db); // Reload just in case
        }
       // Optional: Show a success message (assuming displayAdminMessage exists)
       if (typeof displayAdminMessage === 'function') {
            displayAdminMessage('獎金任務已成功刪除。', 'success');
       } else {
           console.log('Admin Message (Success): 獎金任務已成功刪除。');
           // alert('獎金任務已成功刪除。'); // Fallback alert
       }


    } catch (error) {
        console.error(`Error deleting task ${taskId}:`, error);
        // Optional: Show an error message
         if (typeof displayAdminMessage === 'function') {
            displayAdminMessage(`刪除任務時發生錯誤: ${error.message}`, 'error');
         } else {
             console.error(`Admin Message (Error): 刪除任務時發生錯誤: ${error.message}`);
             alert(`刪除任務時發生錯誤: ${error.message}`); // Fallback alert
         }
    }
}


// Function to toggle visibility of monthly evaluation options
function toggleMonthlyEvalOptions() {
    const triggerSelect = document.getElementById('modal-eval-trigger');
    const monthlyOptions = document.getElementById('monthly-eval-options');

    if (!triggerSelect || !monthlyOptions) {
         console.warn("Could not find evaluation trigger or monthly options elements.");
         return;
    }

    const triggerType = triggerSelect.value;
    monthlyOptions.style.display = (triggerType === 'MONTHLY') ? 'block' : 'none'; // Show if MONTHLY, hide otherwise
}

// Helper function to close the modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
    // Clear message and reset state for bonus task modal specifically when closing
    if (modalId === 'bonus-task-modal') {
        const messageElement = document.getElementById('bonus-task-modal-message');
        if (messageElement) {
            messageElement.textContent = '';
            messageElement.className = 'message';
        }
    }
}

// --- Event Listeners Setup ---
function setupBonusTaskEventListeners(db) {
    // Ensure db is valid before setting up listeners that depend on it
     if (!db || typeof db.collection !== 'function') {
        console.error("Cannot setup Bonus Task listeners: Invalid Firestore instance.");
        return;
    }

    // Function to safely add event listener, removing old one if exists
    function safeAddEventListener(element, eventType, listener) {
        if (!element) return;
        // Clone the element to remove all previous listeners
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
        newElement.addEventListener(eventType, listener);
        return newElement; // Return the new element in case it needs to be referenced
    }

    // First, populate the section content with the table structure
    const sectionContent = document.querySelector('#section-bonus-tasks .section-content');
    if (sectionContent) {
        sectionContent.innerHTML = `
            <div class="admin-action-bar">
                <button id="add-bonus-task-btn" class="btn btn-primary">新增獎金任務</button>
            </div>
            <div class="table-responsive">
                <table id="bonus-tasks-table" class="table table-striped">
                    <thead>
                        <tr>
                            <th>任務名稱</th>
                            <th>獎勵金額</th>
                            <th>狀態</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="4" class="loading-placeholder text-center">載入獎金任務中...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    // Button to open modal for adding a new task
    let addBtn = document.getElementById('add-bonus-task-btn');
    if (addBtn) {
         addBtn = safeAddEventListener(addBtn, 'click', () => openBonusTaskModal(db));
    } else {
        console.warn("Add Bonus Task button not found.");
    }

    // Save button inside modal
    let saveBtn = document.getElementById('save-bonus-task-btn');
    if (saveBtn) {
        saveBtn = safeAddEventListener(saveBtn, 'click', (event) => {
            event.preventDefault();
            saveBonusTask(db);
        });
    } else {
        console.warn("Save Bonus Task button not found.");
    }

    // Button to add a new condition row inside modal
    let addConditionBtn = document.getElementById('add-condition-btn');
    if (addConditionBtn) {
         addConditionBtn = safeAddEventListener(addConditionBtn, 'click', () => addConditionRow()); // Add empty row, no data needed
    } else {
        console.warn("Add Condition button not found.");
    }

     // Listener for removing condition rows (using event delegation on the container)
    let conditionsContainer = document.getElementById('conditions-container');
    if (conditionsContainer) {
         // Clone and replace to remove previous listeners on the container
         const newConditionsContainer = conditionsContainer.cloneNode(false); // Clone container element only
         while (conditionsContainer.firstChild) {
             newConditionsContainer.appendChild(conditionsContainer.firstChild); // Move children
         }
         conditionsContainer.parentNode.replaceChild(newConditionsContainer, conditionsContainer);
         conditionsContainer = newConditionsContainer; // Update reference

        conditionsContainer.addEventListener('click', function(event) {
            // Find the closest remove button that was clicked
            const removeButton = event.target.closest('.remove-condition-btn');
            if (removeButton) {
                const rowToRemove = removeButton.closest('.condition-row');
                 if (rowToRemove) {
                     rowToRemove.remove();
                     // Check if container is now empty and add placeholder back
                     if (conditionsContainer.children.length === 0) {
                          conditionsContainer.innerHTML = '<p class="text-muted" id="no-conditions-msg">尚未新增任何條件。</p>';
                     }
                 }
            }
        });
    } else {
         console.warn("Conditions container not found.");
    }

    // Listener for evaluation trigger type change
    let evalTriggerSelect = document.getElementById('modal-eval-trigger');
    if (evalTriggerSelect) {
         evalTriggerSelect = safeAddEventListener(evalTriggerSelect, 'change', toggleMonthlyEvalOptions);
    } else {
        console.warn("Evaluation trigger select not found.");
    }

    // Add listener for the modal's close button (X)
    let closeBtn = document.querySelector('#bonus-task-modal .modal-close-btn');
    if (closeBtn) {
        closeBtn = safeAddEventListener(closeBtn, 'click', () => closeModal('bonus-task-modal'));
    } else {
        console.warn("Modal close button not found.");
    }

    // Add listener for the modal's cancel button
    let cancelBtn = document.getElementById('cancel-bonus-task-btn');
    if (cancelBtn) {
        cancelBtn = safeAddEventListener(cancelBtn, 'click', () => closeModal('bonus-task-modal'));
    } else {
        console.warn("Cancel button not found.");
    }
}

// Initialization function (to be called from admin-logic.js or similar)
function initBonusTasks(db) {
    // Check if the target section exists on the current page
    const bonusTaskSection = document.getElementById('section-bonus-tasks');
    if (bonusTaskSection) {
         console.log("Initializing Bonus Tasks section...");
         // Pass the Firestore db instance to the functions that need it
         // Ensure this runs only once or correctly handles re-initialization
         if (!bonusTaskSection.dataset.initialized) {
             loadBonusTasksSection(db);
             setupBonusTaskEventListeners(db);
             bonusTaskSection.dataset.initialized = 'true'; // Mark as initialized
         } else {
              console.log("Bonus Tasks section already initialized.");
              // Optionally, just reload the data if needed without re-attaching listeners handled by safeAddEventListener
              // loadBonusTasksSection(db);
         }
    } else {
        console.log("Bonus Tasks section not found on this page. Please check the section ID.");
    }
}

// Helper function for escaping HTML (basic XSS prevention)
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    // Ensure input is a string before replacing
    return String(str).replace(/[&<>\"\']/g, function (match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;' // Or &apos;
        }[match];
    });
}

// Placeholder/Reminder: Ensure a function like displayAdminMessage exists globally
// or is passed/imported, otherwise delete/delete task feedback will only be in console/alert.
/*
function displayAdminMessage(message, type = 'info') {
    const messageElement = document.getElementById('admin-message'); // Target a common admin message area
    if (messageElement) {
        messageElement.textContent = message;
        // Map simple types to CSS classes (assuming you have corresponding styles)
        const typeClassMap = {
            'success': 'success-message',
            'error': 'error-message',
            'info': 'info-message',
            'warning': 'warning-message'
        };
        messageElement.className = `message ${typeClassMap[type] || 'info-message'}`;
        // Optional: Auto-hide after some time
        // setTimeout(() => {
        //     messageElement.textContent = '';
        //     messageElement.className = 'message';
        // }, 5000);
    } else {
        // Fallback to console log if the element doesn't exist
        console.log(`Admin Message (${type}): ${message}`);
        // As a last resort, you could use alert, but it's intrusive
        // if (type === 'error') alert(`錯誤: ${message}`);
        // else if (type === 'success') alert(`成功: ${message}`);
    }
}
*/

// Note: This script assumes Firebase is initialized and the 'db' object (Firestore instance)
// and 'firebase.firestore.FieldValue' are available when its functions are called.
// It also assumes a helper function 'closeModal(modalId)' is available globally.
// The initBonusTasks(db) function should be called from your main admin script (e.g., admin-logic.js)
// after the Firestore 'db' instance is ready.

console.log("admin-bonus-tasks.js loaded (Phase 2 Update)"); // Update log message