// js/admin-employees.js - 員工列表管理邏輯 (含 CRUD 和分頁)

'use strict';

// --- 模組內狀態 ---
let adminEmployeesDb = null; // Firestore instance for this module
let adminEmployeesCurrentUser = null; // Current admin user
let globalMessageElement = null; // Reference to a global message element if needed
let moduleAvailableStores = []; // Stores fetched from settings
let moduleDynamicPositions = []; // Positions fetched from settings
let pendingEmployeeChanges = new Map(); // Track inline changes { docId: { field: newValue, ... } }

// --- 分頁狀態管理 ---
let employeePagination = {
    pageSize: 15,         // 每頁顯示數量 (可調整)
    lastVisible: null,    // 當前頁最後一個文件的快照 (用於下一頁)
    firstVisible: null,   // 當前頁第一個文件的快照 (用於上一頁 - 簡化版)
    currentPageNumber: 1, // 當前頁碼 (用於顯示)
    isLoading: false,     // 防止重複加載
    currentQuery: null,   // Store the current query for refresh
    currentDirection: 'first' // Track the last direction for refresh
};

// --- CRUD 和 Modal 函數 ---

/**
 * 渲染員工列表格
 * @param {HTMLElement} container - 要放置表格的容器
 * @param {Array<object>} employees - 員工資料陣列
 */
function renderEmployeeTable(container, employees) {
    if (!container) {
        console.error("renderEmployeeTable: Container element is missing.");
        return;
    }
    container.innerHTML = ''; // Clear old table or loading message

    if (!Array.isArray(employees) || employees.length === 0) {
        container.innerHTML = '<p>找不到符合條件的員工資料。</p>';
        // Clear pagination controls if no data
        const paginationControls = document.getElementById('employees-pagination-controls');
        if (paginationControls) paginationControls.innerHTML = '';
        return;
    }

    const table = document.createElement('table');
    table.className = 'table table-striped table-bordered data-table employee-table'; // Added employee-table class
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    // MODIFIED: Update headers
    const headers = [
        '<input type="checkbox" id="select-all-employees" title="全選/取消全選">', // Checkbox header
        '姓名', '生日', '電話', '職位', '分店', '操作'
    ];
    headers.forEach((text, index) => {
        const th = document.createElement('th');
        th.innerHTML = text; // Use innerHTML for checkbox
        if (index === 0) th.style.width = '30px'; // Make checkbox column narrow
        headerRow.appendChild(th);
    });

    const tbody = table.createTBody();
    employees.forEach(emp => {
        if (!emp || typeof emp !== 'object' || !emp.docId) { // Ensure docId exists
             console.warn("renderEmployeeTable: Skipping invalid employee data or missing docId:", emp);
             return; // Skip invalid entries
        }
        const row = tbody.insertRow();
        row.dataset.employeeId = emp.docId; // Use Firestore document ID

        // MODIFIED: Add checkbox cell
        const checkboxCell = row.insertCell();
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'employee-select-checkbox';
        checkbox.dataset.employeeId = emp.docId;
        checkboxCell.appendChild(checkbox);

        // MODIFIED: Populate cells
        row.insertCell().textContent = emp.name || '';
        row.insertCell().textContent = emp.birth || ''; // Added Birthday
        row.insertCell().textContent = emp.phone || '';

        // --- MODIFIED: Position Cell (Dynamic Dropdown) ---
        const positionCell = row.insertCell();
        const positionSelect = document.createElement('select');
        positionSelect.className = 'form-control form-control-sm inline-edit-select'; // Use smaller control
        positionSelect.dataset.employeeId = emp.docId;
        positionSelect.dataset.field = 'position';
        // Use dynamically loaded positions
        moduleDynamicPositions.forEach(pos => {
            const option = document.createElement('option');
            option.value = pos;
            option.textContent = pos;
            if (emp.position === pos) {
                option.selected = true;
            }
            positionSelect.appendChild(option);
        });
        // Add current employee position if not in standard list
        if (emp.position && !moduleDynamicPositions.includes(emp.position)) {
            console.warn(`Employee ${emp.name} has position '${emp.position}' not in standard list. Adding it.`);
            const currentOption = document.createElement('option');
            currentOption.value = emp.position;
            currentOption.textContent = emp.position;
            currentOption.selected = true;
            positionSelect.appendChild(currentOption); // Or prepend if preferred
        }
        positionSelect.addEventListener('change', handleInlineChange);
        positionCell.appendChild(positionSelect);
        // -------------------------------------------

        // --- MODIFIED: Store Cell (Add Standby/Part-time, Fix Selection) ---
        const storeCell = row.insertCell();
        const storeSelect = document.createElement('select');
        storeSelect.className = 'form-control form-control-sm inline-edit-select'; // Use smaller control
        storeSelect.dataset.employeeId = emp.docId;
        storeSelect.dataset.field = 'store';

        // Add Special Options First
        const specialOptions = ['待命人員', '兼職人員'];
        specialOptions.forEach(optVal => {
             const option = document.createElement('option');
             option.value = optVal;
             option.textContent = optVal;
             if (emp.store === optVal) { // Check if employee matches special option
                 option.selected = true;
             }
             storeSelect.appendChild(option);
        });

        // Add an empty option
        const blankOption = document.createElement('option');
        blankOption.value = '';
        blankOption.textContent = '-- 請選擇分店 --';
        if (!emp.store && !specialOptions.includes(emp.store)) { // Select blank if store is empty AND not a special option
             blankOption.selected = true;
        }
        storeSelect.appendChild(blankOption);

        // Add stores from settings
        let storeFound = false;
        moduleAvailableStores.forEach(storeName => {
            const option = document.createElement('option');
            option.value = storeName;
            option.textContent = storeName;
            // CORRECTED: Check if employee store matches this option value
            if (emp.store === storeName) {
                option.selected = true;
                storeFound = true;
            }
            storeSelect.appendChild(option);
        });

        // If employee store exists but not in dropdown list (and not a special option), add it and select it
        if (emp.store && !storeFound && !specialOptions.includes(emp.store)) {
             console.warn(`Employee ${emp.name} belongs to store '${emp.store}' which is not in the available list or special options. Adding it temporarily.`);
             const currentStoreOption = document.createElement('option');
             currentStoreOption.value = emp.store;
             currentStoreOption.textContent = emp.store;
             currentStoreOption.selected = true;
             storeSelect.appendChild(currentStoreOption);
        }

        storeSelect.addEventListener('change', handleInlineChange);
        storeCell.appendChild(storeSelect);
        // ---------------------------------------

        const actionCell = row.insertCell();
        actionCell.style.whiteSpace = 'nowrap';

        // Edit Button (remains the same)
        const editButton = document.createElement('button');
        editButton.textContent = '編輯';
        editButton.classList.add('btn', 'btn-sm', 'btn-outline-primary');
        editButton.style.marginRight = '5px';
        if (typeof openEmployeeModal === 'function') {
            // Pass Firestore doc ID and full data for editing
            editButton.onclick = () => openEmployeeModal(emp.docId, emp);
        } else {
            console.warn("renderEmployeeTable: openEmployeeModal function not found. Edit button disabled.");
            editButton.disabled = true;
        }
        actionCell.appendChild(editButton);

        // Approve Button (remains the same, check level if needed)
        if (emp.level === 0) {
            const approveButton = document.createElement('button');
            approveButton.textContent = '審核通過';
            approveButton.classList.add('btn', 'btn-sm', 'btn-warning');
            approveButton.style.marginRight = '5px';
            if (typeof approveEmployee === 'function') {
                approveButton.onclick = () => approveEmployee(emp.docId, emp.name);
            } else {
                console.warn("renderEmployeeTable: approveEmployee function not found. Approve button disabled.");
                approveButton.disabled = true;
            }
            actionCell.appendChild(approveButton);
        }

        // Delete Button (remains the same, check level and self)
        if (adminEmployeesDb && adminEmployeesCurrentUser && emp.authUid !== adminEmployeesCurrentUser.authUid && emp.level !== 9) { // Use authUid for comparison
            const deleteButton = document.createElement('button');
            deleteButton.textContent = '刪除';
            deleteButton.classList.add('btn', 'btn-sm', 'btn-danger', 'delete-emp-btn');
            deleteButton.dataset.employeeId = emp.docId;
            deleteButton.dataset.employeeName = emp.name;
            // Attach handler directly
            deleteButton.onclick = () => deleteEmployee(emp.docId, emp.name);

            actionCell.appendChild(deleteButton);
        } else {
             const disabledDelete = document.createElement('button');
             disabledDelete.textContent = '刪除';
             disabledDelete.classList.add('btn', 'btn-sm', 'btn-secondary');
             disabledDelete.disabled = true;
             if (adminEmployeesCurrentUser && emp.authUid === adminEmployeesCurrentUser.authUid) { // Use authUid
                 disabledDelete.title = "無法刪除自己";
             } else if (emp.level === 9) {
                 disabledDelete.title = "無法刪除其他管理員";
             }
             actionCell.appendChild(disabledDelete);
        }
    });
    container.appendChild(table);

    // Add event listener for the select-all checkbox AFTER table is in DOM
    const selectAllCheckbox = document.getElementById('select-all-employees');
    if (selectAllCheckbox) {
        selectAllCheckbox.removeEventListener('change', handleSelectAllEmployees);
        selectAllCheckbox.addEventListener('change', handleSelectAllEmployees);
    }

    // Restore visual state for pending changes
    pendingEmployeeChanges.forEach((changes, docId) => {
        const row = tbody.querySelector(`tr[data-employee-id="${docId}"]`);
        if (row) {
            Object.keys(changes).forEach(field => {
                const select = row.querySelector(`select[data-field="${field}"]`);
                if (select) {
                    select.classList.add('inline-edit-changed');
                }
            });
        }
    });
    // Show/hide save button based on pending changes
    const saveChangesBtn = document.getElementById('save-employee-changes-btn');
    if (saveChangesBtn) {
        saveChangesBtn.style.display = pendingEmployeeChanges.size > 0 ? 'inline-block' : 'none';
    }
}

// ADDED: Handler for the select-all checkbox
function handleSelectAllEmployees(event) {
    const isChecked = event.target.checked;
    const checkboxes = document.querySelectorAll('.employee-table .employee-select-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
    });
}

// ADDED: Handler for inline select changes
function handleInlineChange(event) {
    const selectElement = event.target;
    const employeeId = selectElement.dataset.employeeId;
    const field = selectElement.dataset.field;
    const newValue = selectElement.value;

    if (!employeeId || !field) return;

    // Store the change
    const currentChanges = pendingEmployeeChanges.get(employeeId) || {};
    currentChanges[field] = newValue;
    pendingEmployeeChanges.set(employeeId, currentChanges);

    // Mark as changed visually
    selectElement.classList.add('inline-edit-changed');

    // Show save button
    const saveChangesBtn = document.getElementById('save-employee-changes-btn');
    if (saveChangesBtn) {
        saveChangesBtn.style.display = 'inline-block';
    }
     console.log("Pending Changes:", pendingEmployeeChanges);
}

// --- ADDED: Handler for saving inline changes ---
async function handleSaveChanges() {
    const saveChangesBtn = document.getElementById('save-employee-changes-btn');
    const messageArea = document.getElementById('employees-message-area'); // Use the main message area

    if (!adminEmployeesDb) {
        console.error("handleSaveChanges: Firestore db instance is not available.");
        if(messageArea) messageArea.textContent = "儲存失敗：資料庫未連接。";
        return;
    }
    if (pendingEmployeeChanges.size === 0) {
        console.log("handleSaveChanges: No changes to save.");
        if(messageArea) messageArea.textContent = "沒有需要儲存的變更。";
        return;
    }

    if (saveChangesBtn) saveChangesBtn.disabled = true;
    if (messageArea) {
        messageArea.textContent = `正在儲存 ${pendingEmployeeChanges.size} 位員工的變更...`;
        messageArea.className = 'message info-message';
    }

    const batch = adminEmployeesDb.batch(); // Use batch for multiple updates
    const updatedDocIds = new Set(); // Keep track of updated docs for visual feedback

    pendingEmployeeChanges.forEach((changes, docId) => {
        const docRef = adminEmployeesDb.collection('employees').doc(docId);
        const updateData = {
            ...changes, // Include all changed fields (e.g., store, position)
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdatedBy: adminEmployeesCurrentUser?.displayName || adminEmployeesCurrentUser?.email || adminEmployeesCurrentUser?.authUid || '未知管理員'
        };
        console.log(`Batch updating doc ${docId} with:`, updateData);
        batch.update(docRef, updateData);
        updatedDocIds.add(docId);
    });

    try {
        await batch.commit(); // Commit the batch
        console.log("All inline changes saved successfully via batch.");
        if (messageArea) {
            messageArea.textContent = `成功儲存 ${updatedDocIds.size} 位員工的變更！`;
            messageArea.className = 'message success-message';
        }

        // Clear pending changes and visual markers AFTER successful save
        pendingEmployeeChanges.clear();
        const changedSelects = document.querySelectorAll('.inline-edit-select.inline-edit-changed');
        changedSelects.forEach(select => select.classList.remove('inline-edit-changed'));

        // Hide save button again
        if (saveChangesBtn) {
            saveChangesBtn.style.display = 'none';
        }
         // Optionally clear the success message after a few seconds
         setTimeout(() => {
             if (messageArea && messageArea.textContent.includes('成功儲存')) {
                 messageArea.textContent = '';
                 messageArea.className = 'message';
             }
         }, 5000);

    } catch (error) {
        console.error("Error saving inline employee changes via batch:", error);
        if (messageArea) {
            messageArea.textContent = `儲存部分或全部變更時發生錯誤：${error.message}`;
            messageArea.className = 'message error-message';
        }
    } finally {
        if (saveChangesBtn) saveChangesBtn.disabled = false;
    }
}

// --- RESTORED: Handler for Random Assign Store ---
function handleRandomAssignStore() {
    console.log("Random assign store clicked");
    const messageArea = document.getElementById('employees-message-area');
    const saveChangesBtn = document.getElementById('save-employee-changes-btn');
    if (!messageArea || !saveChangesBtn) {
        console.error("handleRandomAssignStore: Message area or save button not found.");
        return;
    }
    messageArea.textContent = ''; // Clear message

    const selectedCheckboxes = document.querySelectorAll('.employee-table .employee-select-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        messageArea.textContent = '請先勾選要分配的員工。';
        messageArea.className = 'message error-message';
        return;
    }
    // Use only actual store names for random assignment, exclude special options
    const actualStoreNames = moduleAvailableStores;
    if (actualStoreNames.length <= 1) {
         messageArea.textContent = '至少需要兩個以上「實際分店」才能進行隨機分配。';
         messageArea.className = 'message error-message';
         return;
    }

    let changesMade = false;

    selectedCheckboxes.forEach(checkbox => {
        const employeeId = checkbox.dataset.employeeId;
        const row = checkbox.closest('tr');
        const storeSelect = row?.querySelector('select[data-field="store"]');

        if (!employeeId || !storeSelect) return;

        const currentStore = storeSelect.value;
        let newStore = currentStore;
        let attempts = 0;
        // Try to find a *different* store from the ACTUAL store list
        while ((newStore === currentStore || !actualStoreNames.includes(newStore)) && attempts < 10) { // Ensure new store is valid
             const randomIndex = Math.floor(Math.random() * actualStoreNames.length);
             newStore = actualStoreNames[randomIndex];
             attempts++;
        }

        if (newStore !== currentStore && actualStoreNames.includes(newStore)) {
            storeSelect.value = newStore; // Update dropdown value
            // Trigger the change handler manually to update pending changes and visual state
            handleInlineChange({ target: storeSelect });
            changesMade = true;
        } else {
            console.log(`Could not find a different, valid store for ${employeeId} after ${attempts} attempts.`);
        }
    });

    if (changesMade) {
        messageArea.textContent = '分店已隨機分配 (已標示)，請點擊儲存變更。';
        messageArea.className = 'message info-message';
        if (saveChangesBtn) saveChangesBtn.style.display = 'inline-block'; // Show save button
    } else {
         messageArea.textContent = '沒有員工的分店被更改 (可能只有一個實際分店或已是隨機結果)。';
         messageArea.className = 'message warning-message';
    }
}
// --- END RESTORED ---

/** 打開員工 Modal */
function openEmployeeModal(docId = null, empData = null) {
    const modal = document.getElementById('employee-modal');
    const form = document.getElementById('employee-form-modal');
    const title = document.getElementById('employee-modal-title');
    const message = document.getElementById('employee-modal-message');
    const idInputHidden = document.getElementById('modal-employee-doc-id');
    const idNumberInput = document.getElementById('modal-emp-id'); // Assuming this is the ID number input

    // MODIFIED: Robust check for modal elements
    if (!modal || !form || !title || !idInputHidden || !idNumberInput || !message) {
        console.error("Employee modal elements could not be found.", { modal, form, title, idInputHidden, idNumberInput, message });
        alert("開啟員工編輯表單時發生錯誤：缺少必要的頁面元件。");
        return;
    }
    console.log("Opening employee modal. Mode:", docId ? 'Edit' : 'Add');

    try { // Wrap form operations in try-catch
        form.reset();
        message.textContent = '';
        message.className = 'message'; // Reset message style
        // Reset potential validation styles
        Array.from(form.elements).forEach(el => { if(el.style) el.style.borderColor = ''; });

        // --- ADDED: Get references to the store and position dropdowns ---
        const storeSelect = document.getElementById('modal-emp-store');
        const positionSelect = document.getElementById('modal-emp-position');

        // --- ADDED: Populate store dropdown with available stores ---
        if (storeSelect) {
            // Clear existing options except first 3 (default, 待命人員, 兼職人員)
            while (storeSelect.options.length > 3) {
                storeSelect.remove(3);
            }
            
            // Add available stores from the module
            if (moduleAvailableStores && moduleAvailableStores.length > 0) {
                moduleAvailableStores.forEach(storeName => {
                    const option = document.createElement('option');
                    option.value = storeName;
                    option.textContent = storeName;
                    storeSelect.appendChild(option);
                });
            }
        }

        // --- ADDED: Populate position dropdown with dynamic positions ---
        if (positionSelect) {
            // Clear existing options except first (default)
            while (positionSelect.options.length > 1) {
                positionSelect.remove(1);
            }
            
            // Add available positions from the module
            if (moduleDynamicPositions && moduleDynamicPositions.length > 0) {
                moduleDynamicPositions.forEach(position => {
                    const option = document.createElement('option');
                    option.value = position;
                    option.textContent = position;
                    positionSelect.appendChild(option);
                });
            }
        }

        if (docId && empData && typeof empData === 'object') {
            // --- EDIT MODE ---
            title.textContent = '編輯員工資料';
            idInputHidden.value = docId;
            // Pre-populate the form with existing data
            for (const field in empData) {
                const input = form.elements[`modal-emp-${field}`];
                if (input) {
                    // For select dropdowns, we need to find and select the matching option
                    if (input.tagName === 'SELECT') {
                        const value = empData[field];
                        let optionFound = false;
                        
                        // Check each option to find the matching value
                        for (let i = 0; i < input.options.length; i++) {
                            if (input.options[i].value === value.toString()) {
                                input.selectedIndex = i;
                                optionFound = true;
                                break;
                            }
                        }
                        
                        // If the current value isn't in the options list, add it
                        if (!optionFound && value) {
                            // For store dropdown, only add value if not in the default special options
                            if (field === 'store' && !['待命人員', '兼職人員', ''].includes(value)) {
                                const option = document.createElement('option');
                                option.value = value;
                                option.textContent = value;
                                input.appendChild(option);
                                option.selected = true;
                            }
                            // For position dropdown
                            else if (field === 'position' && value) {
                                const option = document.createElement('option');
                                option.value = value;
                                option.textContent = value;
                                input.appendChild(option);
                                option.selected = true;
                            }
                        }
                    } else {
                        // For regular inputs, just set the value
                        input.value = empData[field] || '';
                    }
                }
            }
            // Disable ID field in edit mode (national ID shouldn't change)
            if (idNumberInput) {
                idNumberInput.disabled = true;
                idNumberInput.parentElement.querySelector('label')?.classList.add('disabled-label');
            }
        } else {
            // --- ADD MODE ---
            title.textContent = '新增員工';
            idInputHidden.value = '';
            // Set default level to '1' (Employee)
            const levelInput = form.elements['modal-emp-level'];
            if (levelInput) levelInput.value = '1';
            // Enable ID field in add mode
            if (idNumberInput) {
                idNumberInput.disabled = false;
                idNumberInput.parentElement.querySelector('label')?.classList.remove('disabled-label');
            }
        }

        // --- MODAL DISPLAY PART ---
        // MODIFIED: Use the global modal utils if available
        if (typeof openModal === 'function') {
             openModal('employee-modal');
        } else {
             console.warn("openEmployeeModal: Global openModal function not found. Using basic display style.");
             modal.style.display = 'flex';
        }
    } catch (error) {
         console.error("Error setting up employee modal:", error);
         message.textContent = `開啟表單失敗：${error.message}`;
         message.className = 'message error-message';
    }
}

/** 關閉員工 Modal */
function closeEmployeeModal() {
    // MODIFIED: Use global closeModal if available
    if (typeof closeModal === 'function') {
        closeModal('employee-modal');
    } else {
        console.warn("closeEmployeeModal: Global closeModal function not found. Using basic hide style.");
        const modal = document.getElementById('employee-modal');
        if (modal) {
            modal.style.display = 'none';
            const messageInModal = document.getElementById('employee-modal-message');
            if (messageInModal) {
                messageInModal.textContent = '';
                messageInModal.className = 'message';
            }
        }
    }
}

/** 儲存員工 (via Modal) */
async function saveEmployee(event) {
    if (!event || !event.target) {
         console.error("saveEmployee: Invalid event object.");
         return;
    }
    event.preventDefault();
    const form = event.target;
    // MODIFIED: Check form existence
    if (!(form instanceof HTMLFormElement)) {
         console.error("saveEmployee: Event target is not a form.");
         return;
    }

    const saveButton = form.querySelector('#save-employee-btn');
    const messageElementInModal = form.querySelector('#employee-modal-message');
    const editingDocId = form.elements['modal-employee-doc-id']?.value; // Use optional chaining

    // MODIFIED: Use module-level db and currentUser, check modal elements
    if (!saveButton || !messageElementInModal || !adminEmployeesDb || !adminEmployeesCurrentUser) {
        console.error("Save prerequisites not met.", { saveButton, messageElementInModal, db: adminEmployeesDb, currentUser: adminEmployeesCurrentUser });
        // Use modal message element for error
        if(messageElementInModal) {
            messageElementInModal.textContent = "儲存錯誤：缺少必要組件或資料庫連接。";
            messageElementInModal.className = 'message error-message';
        } else {
            alert("儲存錯誤：缺少必要組件或資料庫連接。");
        }
        return;
    }

    messageElementInModal.textContent = '儲存中...';
    messageElementInModal.className = 'message info-message';
    saveButton.disabled = true;
    // Reset validation styles
    Array.from(form.elements).forEach(el => { if(el.style) el.style.borderColor = ''; });

    try {
        const dataToSave = {};
        // Define fields corresponding to form element names (without 'modal-emp-')
        const fields = ['name', 'id', 'birth', 'gender', 'email', 'phone', 'address', 'emergency', 'relation', 'emergencyPhone', 'startDate', 'license', 'store', 'position', 'level'];
        let allFieldsFound = true;

        fields.forEach(field => {
            const input = form.elements[`modal-emp-${field}`];
            if (input) {
                let value = input.value.trim();
                if (field === 'level') {
                    const parsedLevel = parseInt(value, 10);
                    // Ensure level is a valid number (0, 1, or 9)
                    if (!isNaN(parsedLevel) && [0, 1, 9].includes(parsedLevel)) {
                        dataToSave[field] = parsedLevel;
                    } else {
                        // Handle invalid level input - throw error or assign default
                        throw new Error(`權限等級 (${value}) 無效，請選擇 0, 1 或 9。`);
                    }
                } else {
                    dataToSave[field] = value;
                }
            } else {
                console.warn(`saveEmployee: Form element 'modal-emp-${field}' not found.`);
                // Decide if missing fields are critical errors
                if (['name', 'id', 'store', 'position', 'level'].includes(field)) {
                     allFieldsFound = false; // Mark as critical field missing
                }
            }
        });

        if (!allFieldsFound) {
             throw new Error("表單缺少必要的員工資料欄位。");
        }

        // --- Validation ---\
        let validationError = '';
        const requiredFieldsMap = {
            'name': form.elements['modal-emp-name'],
            'id': form.elements['modal-emp-id'],
            'store': form.elements['modal-emp-store'],
            'position': form.elements['modal-emp-position'],
            'level': form.elements['modal-emp-level']
        };

        for (const field in requiredFieldsMap) {
            // Check if the field exists in dataToSave and is not empty (level 0 is allowed)
            if (!(field in dataToSave) || (dataToSave[field] === '' && dataToSave[field] !== 0)) {
                const element = requiredFieldsMap[field];
                if (element) {
                     const label = element.closest('.form-group')?.querySelector('label'); // Find associated label
                     validationError += `${label ? label.textContent.replace(/[:*]/g,'').trim() : field} 為必填欄位。\\n`;
                     if (element.style) element.style.borderColor = 'red';
                } else {
                     validationError += `欄位 ${field} 檢查錯誤。\\n`;
                }
            }
        }
        // Add specific validation, e.g., ID format
        if (dataToSave.id && !/^[A-Z][12]\d{8}$/.test(dataToSave.id.toUpperCase())) {
             validationError += `身分證號碼格式不正確。\\n`;
             if(form.elements['modal-emp-id']?.style) form.elements['modal-emp-id'].style.borderColor = 'red';
        }
        // Add email format validation
        if (dataToSave.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dataToSave.email)) {
             validationError += `電子郵件格式不正確。\\n`;
             if(form.elements['modal-emp-email']?.style) form.elements['modal-emp-email'].style.borderColor = 'red';
        }

        if (validationError) {
            messageElementInModal.textContent = `儲存失敗：\\n${validationError}`; // Use pre-line for newlines
            messageElementInModal.className = 'message error-message';
            messageElementInModal.style.whiteSpace = 'pre-line';
            throw new Error("Validation failed."); // Throw to prevent further execution
        }
        messageElementInModal.style.whiteSpace = 'normal'; // Reset whitespace style

        // Add timestamp and updater info
        dataToSave.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();
        dataToSave.lastUpdatedBy = adminEmployeesCurrentUser.authUid; // Use authUid

        console.log("Saving employee data:", { editingDocId: editingDocId || '(New)', data: dataToSave });

        const collectionRef = adminEmployeesDb.collection('employees');

        if (editingDocId) {
            // Update existing document
            // IMPORTANT: Do not update the national ID (dataToSave.id) during an edit.
            const updateData = { ...dataToSave };
            delete updateData.id; // Remove national ID from update payload
            await collectionRef.doc(editingDocId).update(updateData);
            console.log("Employee updated successfully:", editingDocId);
            messageElementInModal.textContent = '員工資料更新成功！';
            // Close modal after successful update and refresh list
            closeEmployeeModal();
            fetchAndRenderEmployees('current'); // Refresh current page

        } else {
            // Add new document
            // Check if national ID already exists BEFORE adding
            const checkQuery = collectionRef.where('id', '==', dataToSave.id).limit(1);
            const checkSnapshot = await checkQuery.get();
            if (!checkSnapshot.empty) {
                throw new Error('此身分證號碼已被註冊。');
            }
            // For new registrations via admin, set level directly (don't default to 0 unless intended)
            // dataToSave.level = dataToSave.level ?? 1; // Ensure level is set, default 1 if missing

            const docRef = await collectionRef.add(dataToSave);
            console.log("New employee added successfully:", docRef.id);
            messageElementInModal.textContent = '新員工新增成功！';
            // Close modal after successful add and refresh list (go to first page?)
            closeEmployeeModal();
            fetchAndRenderEmployees('first'); // Refresh first page
        }
    } catch (error) {
        console.error("Error saving employee:", error);
        messageElementInModal.textContent = `儲存失敗：${error.message}`;
        messageElementInModal.className = 'message error-message';
    } finally {
        saveButton.disabled = false;
    }
}

/** 新增員工按鈕處理 (保持不變) */
function addNewEmployee() { openEmployeeModal(null, null); }

/** 刪除員工 */
async function deleteEmployee(employeeId, employeeName) {
     // Use the main message area for feedback
    const messageArea = document.getElementById('employees-message-area');
    if (!messageArea) { console.error("Cannot find message area for delete feedback."); return; }

    console.log("Deleting employee:", employeeId);
    if (confirm(`確定要刪除員工 "${employeeName}" 嗎？此操作無法復原。`)) {
         messageArea.textContent = `正在刪除 ${employeeName}...`;
         messageArea.className='message info-message';
         const btn = document.querySelector(`.delete-emp-btn[data-employee-id="${employeeId}"]`);
         if(btn) btn.disabled=true;

         try {
              if(!adminEmployeesDb) throw new Error("DB missing");
              await adminEmployeesDb.collection('employees').doc(employeeId).delete();
              messageArea.textContent = `員工 "${employeeName}" 已成功刪除。`;
              messageArea.className = 'message success-message';
              setTimeout(()=>{if(messageArea.textContent.includes('已成功刪除')) messageArea.textContent=''; messageArea.className='message';}, 4000);
              // Remove pending changes for deleted user
              pendingEmployeeChanges.delete(employeeId);
              fetchAndRenderEmployees('current'); // 刪除後刷新當前頁
         }
         catch(e){
              console.error("Error deleting employee:", e);
              messageArea.textContent=`刪除失敗: ${e.message}`;
              messageArea.className = 'message error-message';
              if(btn) btn.disabled=false;
              setTimeout(()=>{if(messageArea.textContent.includes('刪除失敗')) messageArea.textContent=''; messageArea.className='message';}, 4000);
          }
     } else {
          console.log("Deletion cancelled.");
     }
}

/** 審核員工 */
async function approveEmployee(docId, employeeName) {
    const messageArea = document.getElementById('employees-message-area');
    if (!messageArea) { console.error("Global messageElement not found for approve feedback."); return; }

    console.log(`Approving employee: ${employeeName} (ID: ${docId})`);
    if (confirm(`確定要審核通過員工 "${employeeName}" 嗎？\\n將其權限等級設為 1 (一般員工)。`)) {
         messageArea.textContent = `正在審核 ${employeeName}...`;
         messageArea.className = 'message info-message';
         const approveButton = event?.target; // Assuming event is globally available or passed
         if(approveButton) approveButton.disabled = true;

         try {
             if (!adminEmployeesDb) throw new Error("Firestore (adminEmployeesDb) is not available.");
             await adminEmployeesDb.collection('employees').doc(docId).update({ level: 1 });
             console.log(`Employee ${employeeName} approved successfully.`);
             messageArea.textContent = `員工 ${employeeName} 已審核通過！`;
             messageArea.className = 'message success-message';
             fetchAndRenderEmployees('current'); // 審核後刷新當前頁
             setTimeout(()=>{ if(messageArea.textContent.includes('已審核通過')) messageArea.textContent = ''; messageArea.className = 'message'; }, 4000);
         } catch (error) {
             console.error(`Error approving employee ${docId}:`, error);
             messageArea.textContent = `審核失敗：${error.message}`;
             messageArea.className = 'message error-message';
             if(approveButton) approveButton.disabled = false;
              setTimeout(()=>{ if(messageArea.textContent.includes('審核失敗')) messageArea.textContent = ''; messageArea.className = 'message'; }, 4000);
         }
     } else {
         console.log("User cancelled approval.");
     }
}

// --- 分頁和資料獲取函數 ---

/**
 * 獲取分店列表 (From Settings)
 */
async function fetchAvailableStores(db) {
    if (!db) {
        console.error("fetchAvailableStores: Firestore db instance is required.");
        return []; // Return empty array on error
    }
    try {
        const settingsRef = db.collection('settings').doc('store_config');
        const settingsSnap = await settingsRef.get();
        if (settingsSnap.exists) {
            const settingsData = settingsSnap.data();
            if (settingsData.storeListString) {
                 // Use the corrected parsing function
                const parsedStores = parseStoreListStringCorrected(settingsData.storeListString);
                console.log("Fetched available stores:", parsedStores);
                return parsedStores || []; // Return the names
            } else {
                console.warn("'storeListString' not found in settings/store_config.");
                return [];
            }
        } else {
            console.warn("Settings document 'settings/store_config' not found.");
            return [];
        }
    } catch (error) {
        console.error("Error fetching available stores:", error);
        return []; // Return empty array on error
    }
}

// --- CORRECTED PARSING FUNCTION (Handles Name<Num>=Coords format) ---
function parseStoreListStringCorrected(storeListString) {
    const names = new Set(); // Use a Set to automatically handle uniqueness
    if (!storeListString || typeof storeListString !== 'string') {
        return []; // Return empty array if input is invalid
    }
    // Split by semicolon for different stores
    const entries = storeListString.split(';');
    entries.forEach(entry => {
        entry = entry.trim();
        if (!entry) return;
        // Find the first equals sign to separate name part from coords/needs
        const eqIndex = entry.indexOf('=');
        let namePart = entry; // Default to whole entry if no '='
        if (eqIndex > 0) {
            namePart = entry.substring(0, eqIndex).trim();
        }
        if (namePart) {
            // Use regex to remove potential numeric suffix from the name part
            // Matches one or more digits at the end of the string
            const storeName = namePart.replace(/\d+$/, '').trim();
            if (storeName) { // Add to set if name is not empty after removing suffix
                 names.add(storeName);
            }
        }
    });
     // Convert the Set back to an array
     const uniqueNames = Array.from(names);
     console.log("Parsed unique store names:", uniqueNames);
     return uniqueNames;
}

// --- MODIFIED: Fetch Dynamic Positions (Correct Path) --- 
async function fetchDynamicPositions(db) {
    if (!db) {
        console.error("fetchDynamicPositions: Firestore db instance is required.");
        return [];
    }
    try {
        // CORRECTED: Read from settings/store_config
        const configRef = db.collection('settings').doc('store_config');
        const configSnap = await configRef.get();
        if (configSnap.exists) {
            const configData = configSnap.data();
             // Assuming field name is positionListString
            if (configData.positionListString && typeof configData.positionListString === 'string') {
                const positions = configData.positionListString.split(',').map(p => p.trim()).filter(p => p);
                console.log("Fetched dynamic positions:", positions);
                return positions;
            } else {
                console.warn("'positionListString' not found or not a string in settings/store_config.");
                return []; // Return empty if not found
            }
        } else {
            console.warn("Settings document 'settings/store_config' not found.");
            return [];
        }
    } catch (error) {
        console.error("Error fetching dynamic positions:", error);
        return [];
    }
}

/**
 * 獲取並渲染員工列表 (分頁版)
 * @param {string} direction - 'first', 'next', 'prev', 'current'
 */
async function fetchAndRenderEmployees(direction = 'first') {
    const tableContainer = document.getElementById('employees-table-container');
    const paginationControls = document.getElementById('employees-pagination-controls');
    const messageArea = document.getElementById('employees-message-area'); // Main message area

    if (!tableContainer || !paginationControls || !messageArea) {
        console.error("fetchAndRenderEmployees: Missing essential elements (table container, pagination controls, or message area).");
        return;
    }
    if (!adminEmployeesDb || employeePagination.isLoading) {
        console.log("fetchAndRenderEmployees: DB not ready or already loading.");
        return; // Exit if DB not ready or already loading
    }

    employeePagination.isLoading = true;
    tableContainer.innerHTML = '<div class="loading-placeholder">載入中...</div>';
    paginationControls.innerHTML = ''; // Clear old controls
    messageArea.textContent = '';      // Clear old messages

    try {
        let query = adminEmployeesDb.collection('employees').orderBy('name'); // Default order

        // --- REMOVED Store Filter Logic ---

        // Apply pagination based on direction
        if (direction === 'next' && employeePagination.lastVisible) {
            query = query.startAfter(employeePagination.lastVisible);
            employeePagination.currentPageNumber++;
        } else if (direction === 'prev' && employeePagination.firstVisible) {
             console.warn("fetchAndRenderEmployees: 'prev' direction not fully supported, resetting to first page.");
             employeePagination.lastVisible = null;
             employeePagination.firstVisible = null;
             employeePagination.currentPageNumber = 1;
             // No startAfter needed for the first page
        } else if (direction === 'current' && employeePagination.currentQuery) {
            query = employeePagination.currentQuery; // Re-use the query base
             if (employeePagination.currentDirection === 'next' && employeePagination.firstVisible) {
                 query = query.startAt(employeePagination.firstVisible);
             } // Else default to start of the query
        } else { // 'first' or fallback
            employeePagination.lastVisible = null;
            employeePagination.firstVisible = null;
            employeePagination.currentPageNumber = 1;
        }

        query = query.limit(employeePagination.pageSize);
        employeePagination.currentQuery = query; // Store the base query before limit/startAfter
        employeePagination.currentDirection = direction; // Store the direction used

        const snapshot = await query.get();
        const employees = [];
        if (!snapshot.empty) {
            snapshot.forEach(doc => {
                employees.push({ docId: doc.id, ...doc.data() });
            });
            employeePagination.lastVisible = snapshot.docs[snapshot.docs.length - 1];
            employeePagination.firstVisible = snapshot.docs[0];
        } else {
             if (direction !== 'first') {
                 messageArea.textContent = "沒有更多員工資料了。";
                 employeePagination.lastVisible = null;
             }
             employeePagination.firstVisible = null;
        }

        renderEmployeeTable(tableContainer, employees);
        renderPaginationControls(paginationControls, !snapshot.empty && snapshot.docs.length === employeePagination.pageSize); // Pass if 'next' might be possible

    } catch (error) {
        console.error("Error fetching employees:", error);
        tableContainer.innerHTML = `<p class="text-danger">載入員工列表時發生錯誤: ${error.message}</p>`;
        messageArea.textContent = `載入錯誤: ${error.message}`;
        messageArea.className = 'message error-message';
    } finally {
        employeePagination.isLoading = false;
    }
}

/**
 * 渲染分頁控制按鈕
 * @param {HTMLElement} container
 * @param {boolean} hasMoreData - Indicates if there might be data on the next page
 */
function renderPaginationControls(container, hasMoreData) {
    container.innerHTML = ''; // Clear existing

    const prevButton = document.createElement('button');
    prevButton.textContent = '◀ 上一頁';
    prevButton.classList.add('btn', 'btn-outline-secondary', 'btn-sm');
    prevButton.style.marginRight = '10px';
    prevButton.disabled = employeePagination.currentPageNumber <= 1; // Disable if on first page
    prevButton.onclick = () => fetchAndRenderEmployees('prev');

    const pageInfo = document.createElement('span');
    pageInfo.textContent = `頁 ${employeePagination.currentPageNumber}`;
    pageInfo.style.marginRight = '10px';

    const nextButton = document.createElement('button');
    nextButton.textContent = '下一頁 ▶';
    nextButton.classList.add('btn', 'btn-outline-secondary', 'btn-sm');
    // Disable 'next' if the last fetch returned fewer items than page size
    nextButton.disabled = !hasMoreData;
    nextButton.onclick = () => fetchAndRenderEmployees('next');

    container.appendChild(prevButton);
    container.appendChild(pageInfo);
    container.appendChild(nextButton);
}


// --- 主要載入函數 (修改版) ---\
/**
 * 載入員工列表區塊 (初始化)
 * @param {HTMLElement} sectionContainer - 員工區塊的容器元素 (#section-employees)
 * @param {object} dbInstance - Firestore instance.
 * @param {object} userInstance - Current logged-in user object.
 */
async function loadEmployeesSection(sectionContainer, dbInstance, userInstance) {
    if (!sectionContainer) {
        console.error("loadEmployeesSection: Section container is missing.");
        return;
    }
    let contentArea = sectionContainer.querySelector('.section-content');
    if (!contentArea) {
         console.warn("loadEmployeesSection: .section-content not found, creating one.");
         contentArea = document.createElement('div');
         contentArea.className = 'section-content';
         contentArea.innerHTML = `
              <!-- Toolbar buttons should be defined in admin.html -->
              <div id="employees-message-area" class="message mb-3"></div>
              <div id="employees-table-container"></div>
              <div id="employees-pagination-controls" class="mt-3 text-center"></div>
         `;
         sectionContainer.appendChild(contentArea);
    } else {
         if (!contentArea.querySelector('#employees-message-area')) {
             const msgArea = document.createElement('div');
             msgArea.id = 'employees-message-area';
             msgArea.className = 'message mb-3';
             contentArea.insertBefore(msgArea, contentArea.firstChild);
         }
         if (!contentArea.querySelector('#employees-table-container')) {
             const tableArea = document.createElement('div');
             tableArea.id = 'employees-table-container';
             contentArea.appendChild(tableArea);
         }
         if (!contentArea.querySelector('#employees-pagination-controls')) {
             const paginationArea = document.createElement('div');
             paginationArea.id = 'employees-pagination-controls';
             paginationArea.className = 'mt-3 text-center';
             contentArea.appendChild(paginationArea);
         }
    }

    const tableContainer = contentArea.querySelector('#employees-table-container');
    if (!tableContainer) {
        console.error("loadEmployeesSection: Critical - #employees-table-container not found within content area.");
        contentArea.innerHTML = '<p class="text-danger">員工區塊載入失敗：缺少表格容器。</p>';
        return;
    }
    tableContainer.innerHTML = '<div class="loading-placeholder">載入員工資料中...</div>';

    // --- MODIFIED: Assign passed instances to module variables ---
    adminEmployeesDb = dbInstance;
    adminEmployeesCurrentUser = userInstance;

    if (!adminEmployeesDb || !adminEmployeesCurrentUser) {
        console.error("loadEmployeesSection: Critical error - Firestore db or current user instance is missing after assignment.");
        tableContainer.innerHTML = '<p class="text-danger">員工區塊載入失敗：內部錯誤，無法設定資料庫或使用者資訊。</p>';
        return;
    }
    console.log("loadEmployeesSection: db and user assigned.", { db: adminEmployeesDb, user: adminEmployeesCurrentUser });

    // Fetch available stores AND positions ONCE for the dropdowns
    try {
        [moduleAvailableStores, moduleDynamicPositions] = await Promise.all([
            fetchAvailableStores(adminEmployeesDb),
            fetchDynamicPositions(adminEmployeesDb)
        ]);
    } catch (error) {
        console.error("Error fetching stores or positions:", error);
        const messageArea = contentArea.querySelector('#employees-message-area');
        if (messageArea) {
             messageArea.textContent = `載入分店或職位列表失敗: ${error.message}`;
             messageArea.className = 'message error-message';
        }
    }

    // --- Setup Toolbar Buttons (Ensure listeners are attached to buttons in HTML) ---
    const addEmployeeBtn = document.getElementById('add-employee-btn');
    const randomAssignBtn = document.getElementById('random-assign-store-btn');
    const saveChangesBtn = document.getElementById('save-employee-changes-btn');

    if (addEmployeeBtn && typeof addNewEmployee === 'function') {
        addEmployeeBtn.removeEventListener('click', addNewEmployee);
        addEmployeeBtn.addEventListener('click', addNewEmployee);
    } else if (!addEmployeeBtn) {
         console.warn("Add employee button (#add-employee-btn) not found.");
    }

    // --- MODIFIED: Ensure Random Assign button is enabled and listener attached ---
    if (randomAssignBtn && typeof handleRandomAssignStore === 'function') {
        randomAssignBtn.disabled = false; // Make sure it's enabled
        randomAssignBtn.removeEventListener('click', handleRandomAssignStore);
        randomAssignBtn.addEventListener('click', handleRandomAssignStore);
    } else if (!randomAssignBtn) {
        console.warn("Random Assign Store button (#random-assign-store-btn) not found.");
    }

     // --- MODIFIED: Connect Save Changes Button ---
     if (saveChangesBtn && typeof handleSaveChanges === 'function') {
          saveChangesBtn.removeEventListener('click', handleSaveChanges);
          saveChangesBtn.addEventListener('click', handleSaveChanges);
          saveChangesBtn.style.display = 'none';
     } else if (!saveChangesBtn) {
          console.warn("Save changes button (#save-employee-changes-btn) not found.");
     }

    // --- MODIFIED: Attach listener for the saveEmployee form submission ---
    const modalForm = document.getElementById('employee-form-modal');
    if (modalForm && typeof saveEmployee === 'function') {
         const newForm = modalForm.cloneNode(true);
         modalForm.parentNode.replaceChild(newForm, modalForm);
         newForm.addEventListener('submit', saveEmployee);
         console.log("Event listener attached to employee modal form for submission.");
    } else if (!modalForm) {
         console.warn("Employee modal form (#employee-form-modal) not found. Save function might not work.");
    }

    // --- Initial Data Fetch ---
    employeePagination.lastVisible = null;
    employeePagination.firstVisible = null;
    employeePagination.currentPageNumber = 1;
    await fetchAndRenderEmployees('first'); // Fetch the first page

    globalMessageElement = contentArea.querySelector('#employees-message-area');

     pendingEmployeeChanges.clear();
     if(saveChangesBtn) saveChangesBtn.style.display = 'none'; // Ensure save button is hidden initially

    console.log("Employee section loaded successfully.");
}

// Make sure loadEmployeesSection is available globally if called from admin-logic.js
// window.loadEmployeesSection = loadEmployeesSection; // Uncomment if using script tags directly