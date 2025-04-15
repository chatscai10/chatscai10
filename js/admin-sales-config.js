// js/admin-sales-config.js - 營業額參數設定 (欄位定義管理) 邏輯

'use strict';

/**
 * 載入營業額欄位定義列表
 * (修改版：加入按類型排序)
 * @param {HTMLElement} sectionContainer - 區塊的容器元素 (#section-sales-config)
 */
async function loadSalesConfigSection(sectionContainer) {
    console.log("Executing loadSalesConfigSection (in admin-sales-config.js)...");
    const contentContainer = sectionContainer.querySelector('.section-content');
    if (!contentContainer) { console.error("Content container not found in sales config section"); return; }
    contentContainer.innerHTML = '載入營業額欄位定義中...';

    try {
        if (typeof db === 'undefined') throw new Error("Firestore (db) is not available.");

        // --- 【修改點】查詢時先按 fieldType 排序，再按 label 排序 ---
        const querySnapshot = await db.collection('settings').doc('sales_config').collection('fields')
            .orderBy('fieldType') // <-- 先按類型排序
            .orderBy('label')     // <-- 再按標籤排序
            .get();
        // --- 修改點結束 ---

        const fieldDefinitions = [];
        querySnapshot.forEach(doc => fieldDefinitions.push({ id: doc.id, ...doc.data() }));

        // 渲染表格
        renderSalesConfigTable(contentContainer, fieldDefinitions); // 使用修改後的 render 函數

        // 加入 "新增欄位定義" 按鈕 (邏輯不變)
        if (!sectionContainer.querySelector('.add-sales-config-btn')) {
            const addButton = document.createElement('button');
            addButton.textContent = '✚ 新增欄位定義';
            addButton.classList.add('btn', 'add-sales-config-btn');
            addButton.style.marginBottom = '15px';
            addButton.onclick = () => openSalesConfigModal(null, null);
            sectionContainer.insertBefore(addButton, contentContainer);
        }

        if (typeof loadedSections !== 'undefined') {
            loadedSections.add('sales-config');
        }
        console.log("Sales config section loaded successfully.");

    } catch (error) {
        console.error("Error loading sales config fields:", error);
        contentContainer.innerHTML = `<p style="color: red;">載入營業額欄位定義失敗: ${error.message}</p><p style="color: orange;">(提示：請確認 Firestore 是否已建立 'settings/sales_config/fields' 的複合索引：fieldType ASC, label ASC)</p>`; // 加入索引提示
    }
}


/**
 * 渲染營業額欄位定義表格
 * (修改版：增加收支類型欄位)
 * @param {HTMLElement} container - 要放置表格的容器
 * @param {Array<object>} fields - 欄位定義資料陣列 (已排序)
 */
function renderSalesConfigTable(container, fields) {
    container.innerHTML = '';
    if (!fields || fields.length === 0) {
        container.innerHTML = '<p>尚未定義任何營業額欄位。</p>';
        return;
    }

    const table = document.createElement('table');
    table.classList.add('data-table');

    // 表頭
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    // --- 【修改點】增加 "收支類型" 表頭 ---
    const headers = ['欄位標籤', '收支類型', '欄位類型(原始)', '是否必填', '備註', '操作'];
    // --- 修改點結束 ---
    headers.forEach(text => {
        const th = document.createElement('th'); th.textContent = text; headerRow.appendChild(th);
    });

    // 表身
    const tbody = table.createTBody();
    fields.forEach(field => {
        const row = tbody.insertRow();
        row.dataset.fieldId = field.id;

        row.insertCell().textContent = field.label || 'N/A';
        // --- 【修改點】顯示 fieldType (收支類型) ---
        const typeCell = row.insertCell();
        typeCell.textContent = field.fieldType || 'N/A'; // 直接顯示 fieldType
        // 根據類型給予不同樣式 (可選)
        if (field.fieldType === '收入') {
            typeCell.style.color = 'green'; // 例如收入用綠色
             typeCell.style.fontWeight = 'bold';
        } else if (field.fieldType === '支出') {
            typeCell.style.color = 'orange'; // 例如支出用橘色
             typeCell.style.fontWeight = 'bold';
        }
        // --- 修改點結束 ---
         row.insertCell().textContent = field.fieldType || 'N/A'; // 原始欄位類型也保留，方便對照
        row.insertCell().textContent = field.required ? '是' : '否';
        row.insertCell().textContent = field.note || '';

        // 操作按鈕 (邏輯不變)
        const actionCell = row.insertCell();
        actionCell.style.whiteSpace = 'nowrap';
        const editButton = document.createElement('button'); /* ... */
        editButton.textContent = '編輯';
        editButton.classList.add('btn', 'btn-sm', 'btn-primary');
        editButton.style.marginRight = '5px';
        editButton.onclick = () => openSalesConfigModal(field.id, field);
        actionCell.appendChild(editButton);
        const deleteButton = document.createElement('button'); /* ... */
        deleteButton.textContent = '刪除';
        deleteButton.classList.add('btn', 'btn-sm', 'btn-danger', 'delete-sales-field-btn');
        deleteButton.dataset.fieldId = field.id;
        deleteButton.dataset.fieldName = field.label || field.id;
        deleteButton.onclick = () => deleteSalesConfigField(field.id, field.label || field.id);
        actionCell.appendChild(deleteButton);
    });

    container.appendChild(table);
}

/**
 * 打開用於新增或編輯營業額欄位定義的 Modal
 * @param {string | null} fieldId - 要編輯的欄位定義 ID，null 表示新增
 * @param {object | null} fieldData - 要編輯的欄位定義資料，null 表示新增
 */
function openSalesConfigModal(fieldId = null, fieldData = null) {
    // --- 在函數內部獲取 Modal 元素 ---
    const modal = document.getElementById('sales-config-modal');
    const form = document.getElementById('sales-config-form-modal');
    const title = document.getElementById('sales-config-modal-title');
    const message = document.getElementById('sales-config-modal-message');
    const idInput = document.getElementById('modal-sales-field-id');

    if (!modal || !form || !title || !idInput) {
        console.error("Sales config modal elements could not be found in the DOM.");
        alert("開啟表單時發生錯誤，請檢查 admin.html 是否包含 Modal 結構。");
        return;
    }
    // --- Modal 元素獲取結束 ---

    console.log("Opening sales config modal (in admin-sales-config.js). Mode:", fieldId ? 'Edit' : 'Add');

    // 重設表單和訊息
    form.reset();
    if(message) message.textContent = '';
    if(message) message.className = 'message';
    Array.from(form.elements).forEach(el => el.style.borderColor = ''); // 清除錯誤樣式

    if (fieldId && fieldData) {
        // --- 編輯模式 ---
        title.textContent = '編輯欄位定義';
        idInput.value = fieldId; // 儲存 ID 到隱藏欄位

        // 填充表單 (使用 form elements[] 或 getElementById 均可)
        form.elements['modal-sales-label'].value = fieldData.label || '';
        form.elements['modal-sales-fieldType'].value = fieldData.fieldType || '文字'; // 預設文字
        form.elements['modal-sales-required'].checked = fieldData.required === true;
        form.elements['modal-sales-note'].value = fieldData.note || '';

    } else {
        // --- 新增模式 ---
        title.textContent = '新增欄位定義';
        idInput.value = ''; // 清空 ID
        form.elements['modal-sales-required'].checked = false; // 預設非必填
        form.elements['modal-sales-fieldType'].value = '文字'; // 預設類型
    }

    // --- ADDED: Ensure the submit event listener is attached --- 
    // Remove previous listener first to avoid duplicates
    form.removeEventListener('submit', saveSalesConfigField);
    form.addEventListener('submit', saveSalesConfigField);
    // --- ADDED END ---

    // 顯示 Modal (Use generic openModal if available)
    if (typeof openModal === 'function') {
        openModal('sales-config-modal');
    } else {
         console.warn("openModal function not found, falling back to direct style change.");
         modal.style.display = 'flex'; // Use flex for vertical centering
    }
    // Old direct style change - replaced by openModal call if available
    // modal.style.display = 'flex';
}

/**
 * 關閉營業額欄位定義的 Modal
 */
function closeSalesConfigModal() {
    const modal = document.getElementById('sales-config-modal');
    if (modal) {
        modal.style.display = 'none';
         // 清除可能殘留的訊息
        const messageInModal = document.getElementById('sales-config-modal-message');
         if(messageInModal) {
            messageInModal.textContent = '';
            messageInModal.className = 'message';
        }
    }
}

/**
 * 儲存新增或編輯的營業額欄位定義 (由 Modal 表單提交觸發)
 * @param {Event} event
 */
async function saveSalesConfigField(event) {
    event.preventDefault(); // 阻止表單默認提交
    const form = event.target; // event.target 就是觸發事件的 form 元素
    if (!form) return;

    const saveButton = form.querySelector('#save-sales-config-btn');
    const messageElementInModal = form.querySelector('#sales-config-modal-message');
    const editingFieldId = form.elements['modal-sales-field-id'].value; // 從隱藏欄位獲取 ID

    // 確保元素存在且 db, currentUser 可用
     if (!saveButton || !messageElementInModal || typeof db === 'undefined' || typeof currentUser === 'undefined' || currentUser === null) {
         console.error("Sales config save prerequisites not met.");
         alert("儲存時發生錯誤，請重試。");
         return;
     }

    messageElementInModal.textContent = '儲存中...';
    messageElementInModal.className = 'message info-message';
    saveButton.disabled = true;
    Array.from(form.elements).forEach(el => el.style.borderColor = ''); // 清除舊錯誤樣式

    // 從 Modal 表單獲取數據
    const label = form.elements['modal-sales-label'].value.trim();
    const fieldType = form.elements['modal-sales-fieldType'].value;
    const required = form.elements['modal-sales-required'].checked;
    const note = form.elements['modal-sales-note'].value.trim();

    // 基本驗證
    if (!label) {
        messageElementInModal.textContent = '儲存失敗：欄位標籤為必填。';
        messageElementInModal.className = 'message error-message';
        form.elements['modal-sales-label'].style.borderColor = 'red'; // 標示錯誤欄位
        saveButton.disabled = false;
        return;
    }

    // 構造要寫入 Firestore 的 data 物件
    const dataToSave = {
        label: label,
        fieldType: fieldType,
        required: required,
        note: note,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp() // 記錄更新時間
    };

    console.log("Saving sales config field (in admin-sales-config.js). ID:", editingFieldId || '(New)', "Data:", dataToSave);

    try {
        // 假設路徑 settings/sales_config/fields
        const collectionRef = db.collection('settings').doc('sales_config').collection('fields');

        if (editingFieldId) {
            // --- 編輯模式 ---
            await collectionRef.doc(editingFieldId).update(dataToSave);
            console.log("Sales config field updated successfully:", editingFieldId);
            messageElementInModal.textContent = '欄位定義更新成功！'; // More specific message
            messageElementInModal.className = 'message success-message';
        } else {
            // --- 新增模式 ---
            const docRef = await collectionRef.add(dataToSave);
            console.log("Sales config field added successfully with ID:", docRef.id);
            messageElementInModal.textContent = '欄位定義新增成功！'; // More specific message
            messageElementInModal.className = 'message success-message';
            form.reset(); // 清空表單
        }

        // --- ADDED: Close modal and refresh list after save ---
        setTimeout(() => {
             // Close modal
             if (typeof closeModal === 'function') {
                 closeModal('sales-config-modal');
             } else {
                  console.warn("closeModal function not found after save.");
                  const modal = document.getElementById('sales-config-modal');
                  if(modal) modal.style.display = 'none';
             }
            // Re-render the section
            const sectionContainer = document.getElementById('section-sales-config'); // Find the correct section container
            if (sectionContainer && typeof loadSalesConfigSection === 'function') {
                 loadSalesConfigSection(sectionContainer);
            } else {
                console.error("Could not find section container or load function to reload sales config list.");
                // Optionally show a message outside the closed modal if needed
            }
        }, 1500); // Delay slightly to show success message
        // --- ADDED END ---

    } catch (error) {
        console.error("Error saving sales config field:", error);
        messageElementInModal.textContent = `儲存失敗: ${error.message}`;
        messageElementInModal.className = 'message error-message';
    } finally {
        saveButton.disabled = false;
    }
}


/**
 * 刪除營業額欄位定義，包含 Firestore 操作
 * @param {string} fieldId - 欄位定義 Firestore 文件 ID
 * @param {string} fieldName - 欄位標籤 (用於確認訊息)
 */
async function deleteSalesConfigField(fieldId, fieldName) {
    // 確保 messageElement 可用 (來自 admin-logic.js 的全域變數)
     if (typeof messageElement === 'undefined') { console.error("Global messageElement not found."); return; }

    console.log("Attempting to delete sales config field (in admin-sales-config.js):", fieldId, fieldName);
    if (confirm(`您確定要刪除欄位定義 "${fieldName}" (ID: ${fieldId}) 嗎？`)) {
        console.log("User confirmed deletion.");
        messageElement.textContent = `正在刪除欄位 ${fieldName}...`;
        messageElement.className = 'message info-message';

        const deleteButton = document.querySelector(`.delete-sales-field-btn[data-field-id="${fieldId}"]`);
        if (deleteButton) deleteButton.disabled = true;

        try {
            // 確保 db 可用
            if (typeof db === 'undefined') throw new Error("Firestore (db) is not available.");

            // **執行 Firestore 刪除** (假設的路徑)
            await db.collection('settings').doc('sales_config').collection('fields').doc(fieldId).delete();

            console.log(`Sales config field ${fieldId} deleted successfully.`);

            // **更新 UI：移除表格中的對應行**
            const rowToRemove = document.querySelector(`tr[data-field-id="${fieldId}"]`);
            if (rowToRemove) {
                rowToRemove.remove();
                console.log(`Row for field ${fieldId} removed from table.`);
            } else {
                console.warn(`Could not find table row for field ${fieldId} to remove.`);
            }

            // 顯示成功訊息，並在幾秒後清除
            messageElement.textContent = `欄位定義 "${fieldName}" 已成功刪除。`;
            messageElement.className = 'message success-message';
            setTimeout(() => {
                if (messageElement.textContent.includes(`"${fieldName}" 已成功刪除`)) {
                     messageElement.textContent = '';
                     messageElement.className = 'message';
                }
            }, 4000);

        } catch (error) {
            console.error(`Error deleting sales config field ${fieldId}:`, error);
            messageElement.textContent = `刪除欄位定義 "${fieldName}" 時失敗: ${error.message}`;
            messageElement.className = 'message error-message';
            if (deleteButton) deleteButton.disabled = false;
        }
    } else {
        console.log("User cancelled deletion.");
    }
}

console.log("admin-sales-config.js loaded");