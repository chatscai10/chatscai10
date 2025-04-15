// js/admin-order-items.js - 叫貨品項設定邏輯

'use strict';

/**
 * 載入叫貨品項列表
 * @param {HTMLElement} sectionContainer - 品項區塊的容器元素 (#section-order-items)
 */
async function loadOrderItemsSection(sectionContainer) {
    console.log("Executing loadOrderItemsSection (in admin-order-items.js)...");
    const contentContainer = sectionContainer.querySelector('.section-content');
    if (!contentContainer) { console.error("Content container not found in order items section"); return; }
    contentContainer.innerHTML = '載入叫貨品項列表中...';

    try {
        // 確保 db 存在 (來自 firebase-config.js)
        if (typeof db === 'undefined') throw new Error("Firestore (db) is not available.");

        // 按類別、名稱排序獲取品項
        const querySnapshot = await db.collection('order_items')
            .orderBy('category')
            .orderBy('name')
            .get();
        const items = [];
        querySnapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

        // 渲染表格
        renderOrderItemsTable(contentContainer, items);

        // 加入 "新增品項" 按鈕 (如果尚未存在)
        if (!sectionContainer.querySelector('.add-order-item-btn')) {
            const addButton = document.createElement('button');
            addButton.textContent = '✚ 新增品項';
            addButton.classList.add('btn', 'add-order-item-btn');
            addButton.style.marginBottom = '15px';
            // 點擊按鈕時，調用本檔案的函數打開 Modal (傳入 null 表示新增)
            addButton.onclick = () => openOrderItemModal(null, null);
            sectionContainer.insertBefore(addButton, contentContainer);
        }

        // 確保 loadedSections 存在 (來自 admin-logic.js)
        if (typeof loadedSections !== 'undefined') {
             loadedSections.add('order-items'); // 標記為已載入
        }
        console.log("Order items section loaded successfully.");

    } catch (error) {
        console.error("Error loading order items:", error);
        contentContainer.innerHTML = `<p style="color: red;">載入叫貨品項失敗: ${error.message}</p>`;
    }
}

/**
 * 渲染叫貨品項表格
 * @param {HTMLElement} container - 要放置表格的容器
 * @param {Array<object>} items - 品項資料陣列
 */
function renderOrderItemsTable(container, items) {
    container.innerHTML = ''; // 清空 "載入中..." 或舊表格
    if (!items || items.length === 0) {
        container.innerHTML = '<p>目前沒有設定叫貨品項。</p>';
        return;
    }

    const table = document.createElement('table');
    table.classList.add('data-table'); // 需要在 style.css 中定義樣式

    // 表頭
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    const headers = ['品項名稱', '單位', '類別', '廠商', '單價', '必填', '輸入方式', '顯示', '備註', '操作'];
    headers.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    // 表身
    const tbody = table.createTBody();
    items.forEach(item => {
        const row = tbody.insertRow();
        row.dataset.itemId = item.id; // 儲存文件 ID

        row.insertCell().textContent = item.name || '';
        row.insertCell().textContent = item.unit || '';
        row.insertCell().textContent = item.category || '';
                // ▼▼▼ 新增顯示儲存格 ▼▼▼
                row.insertCell().textContent = item.supplier || ''; // 顯示廠商
                const priceCell = row.insertCell(); // 顯示單價
                priceCell.textContent = (item.price !== undefined && item.price !== null) ? item.price : ''; // 處理 null 或 undefined
                priceCell.style.textAlign = 'right'; // 單價靠右對齊可能比較好
                // ▲▲▲ 新增結束 ▲▲▲
        row.insertCell().textContent = item.required ? '是' : '否'; // 格式化布林值
        row.insertCell().textContent = item.input_type || 'number'; // 預設 number
        row.insertCell().textContent = item.show ? '是' : '否'; // 格式化布林值
        row.insertCell().textContent = item.note || '';

        // 操作按鈕
        const actionCell = row.insertCell();
        actionCell.style.whiteSpace = 'nowrap';

        const editButton = document.createElement('button');
        editButton.textContent = '編輯';
        editButton.classList.add('btn', 'btn-sm', 'btn-primary');
        editButton.style.marginRight = '5px';
        // 點擊編輯時，調用本檔案的函數打開 Modal
        editButton.onclick = () => openOrderItemModal(item.id, item);
        actionCell.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = '刪除';
        deleteButton.classList.add('btn', 'btn-sm', 'btn-danger', 'delete-item-btn');
        deleteButton.dataset.itemId = item.id;
        deleteButton.dataset.itemName = item.name;
        // 點擊刪除時，調用本檔案的函數
        deleteButton.onclick = () => deleteOrderItem(item.id, item.name);
        actionCell.appendChild(deleteButton);
    });

    container.appendChild(table);
}

/**
 * 打開用於新增或編輯品項的 Modal 彈窗
 * @param {string | null} itemId - 要編輯的品項 ID，若為 null 則是新增模式
 * @param {object | null} itemData - 要編輯的品項現有資料，若為 null 則是新增模式
 */
function openOrderItemModal(itemId = null, itemData = null) {
    // --- 在函數內部獲取 Modal 元素 ---
    const modal = document.getElementById('order-item-modal');
    const form = document.getElementById('order-item-form-modal');
    const title = document.getElementById('order-item-modal-title');
    const message = document.getElementById('order-item-modal-message');
    const idInput = document.getElementById('modal-item-id');

    if (!modal || !form || !title || !idInput) {
        console.error("Order item modal elements could not be found in the DOM.");
        alert("開啟表單時發生錯誤，請檢查 admin.html 是否包含 order-item-modal 的 HTML 結構。");
        return;
    }
    // --- Modal 元素獲取結束 ---

    console.log("Opening order item modal (in admin-order-items.js). Mode:", itemId ? 'Edit' : 'Add');

    // 重設表單和訊息
    form.reset();
    if(message) message.textContent = '';
    if(message) message.className = 'message';
    Array.from(form.elements).forEach(el => el.style.borderColor = ''); // 清除錯誤樣式

    if (itemId && itemData) {
        // --- 編輯模式 ---
        title.textContent = '編輯叫貨品項';
        idInput.value = itemId;

        // 填充表單 (原有欄位)
        form.elements['modal-item-name'].value = itemData.name || '';
        form.elements['modal-item-unit'].value = itemData.unit || '';
        form.elements['modal-item-category'].value = itemData.category || '';
        form.elements['modal-item-required'].checked = itemData.required === true;
        form.elements['modal-item-input-type'].value = itemData.input_type || 'number';
        form.elements['modal-item-show'].checked = (itemData.show !== undefined) ? itemData.show : true;
        form.elements['modal-item-note'].value = itemData.note || '';

        // ▼▼▼ 新增：填充廠商和單價 ▼▼▼
        // 假設 Firestore 中儲存的欄位名稱是 supplier 和 price
        form.elements['modal-item-supplier'].value = itemData.supplier || '';
        // 處理 price 可能為 0 或 null/undefined 的情況
        form.elements['modal-item-price'].value = (itemData.price !== undefined && itemData.price !== null) ? itemData.price : '';
        // ▲▲▲ 新增結束 ▲▲▲

    } else {

        // --- 新增模式 ---
        title.textContent = '新增叫貨品項';
        idInput.value = ''; // 清空 ID
        // 設置預設值
        form.elements['modal-item-required'].checked = false; // 預設非必填
        form.elements['modal-item-show'].checked = true; // 預設顯示
        form.elements['modal-item-input-type'].value = 'number'; // 預設數字輸入
    }

    // --- ADDED: Ensure the submit event listener is attached --- 
    // Remove previous listener first to avoid duplicates
    form.removeEventListener('submit', saveOrderItem);
    form.addEventListener('submit', saveOrderItem);
    // --- ADDED END ---

    // 顯示 Modal (Use generic openModal if available)
    if (typeof openModal === 'function') {
        openModal('order-item-modal');
    } else {
         console.warn("openModal function not found, falling back to direct style change.");
         modal.style.display = 'flex';
    }
    // Old direct style change - replaced by openModal call if available
    // modal.style.display = 'flex';
}

/**
 * 關閉叫貨品項 Modal
 */
function closeOrderItemModal() {
    const modal = document.getElementById('order-item-modal');
    if (modal) {
        modal.style.display = 'none';
        const messageInModal = document.getElementById('order-item-modal-message');
         if(messageInModal) {
            messageInModal.textContent = '';
            messageInModal.className = 'message';
        }
    }
}

/**
 * 儲存新增或編輯的品項資料 (由 Modal 中的儲存按鈕觸發)
 * @param {Event} event
 */
async function saveOrderItem(event) {
    event.preventDefault(); // 阻止表單默認提交
    const form = event.target; // form 元素
    if (!form) return;

    const saveButton = form.querySelector('#save-order-item-btn');
    const messageElementInModal = form.querySelector('#order-item-modal-message');
    const editingItemId = form.elements['modal-item-id'].value; // 從隱藏欄位獲取 ID

    // 確保元素存在且 db, currentUser 可用
     if (!saveButton || !messageElementInModal || typeof db === 'undefined' || typeof currentUser === 'undefined' || currentUser === null) {
         console.error("Order item save prerequisites not met.");
         alert("儲存時發生錯誤，請重試。");
         return;
     }

    messageElementInModal.textContent = '儲存中...';
    messageElementInModal.className = 'message info-message';
    saveButton.disabled = true;
    Array.from(form.elements).forEach(el => el.style.borderColor = ''); // 清除舊錯誤樣式

    // 從 Modal 表單獲取數據
    const name = form.elements['modal-item-name'].value.trim();
    const unit = form.elements['modal-item-unit'].value.trim();
    const category = form.elements['modal-item-category'].value.trim();
    const required = form.elements['modal-item-required'].checked;
    const input_type = form.elements['modal-item-input-type'].value.trim() || 'number'; // 預設 number
    const show = form.elements['modal-item-show'].checked;
    const note = form.elements['modal-item-note'].value.trim();
    // ▼▼▼ 新增：獲取廠商和單價數據 ▼▼▼
    const supplier = form.elements['modal-item-supplier'].value.trim();
    const priceStr = form.elements['modal-item-price'].value.trim();
    let price = null; // 預設為 null
    if (priceStr !== '') {
         price = parseFloat(priceStr); // 嘗試轉換為數字
         if (isNaN(price) || price < 0) { // 驗證是否為有效的非負數字
             messageElementInModal.textContent = '儲存失敗：單價必須是有效的非負數字。';
             messageElementInModal.className = 'message error-message';
             form.elements['modal-item-price'].style.borderColor = 'red';
             saveButton.disabled = false;
             return; // 驗證失敗，停止執行
         }
    }
    // ▲▲▲ 新增結束 ▲▲▲
    // 基本驗證
    if (!name) {
        messageElementInModal.textContent = '儲存失敗：品項名稱為必填。';
        messageElementInModal.className = 'message error-message';
        form.elements['modal-item-name'].style.borderColor = 'red'; // 標示錯誤欄位
        saveButton.disabled = false;
        return;
    }

    // 構造要寫入 Firestore 的 data 物件
    const dataToSave = {
        name: name,
        unit: unit,
        category: category,
        supplier: supplier,
        price: price,
        required: required,
        input_type: input_type,
        show: show,
        note: note,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    };

    console.log("Saving order item (in admin-order-items.js). ID:", editingItemId || '(New)', "Data:", dataToSave);

    try {
        const collectionRef = db.collection('order_items');

        if (editingItemId) {
            // --- 編輯模式 ---
            await collectionRef.doc(editingItemId).update(dataToSave);
            console.log("Order item updated successfully:", editingItemId);
            messageElementInModal.textContent = '品項更新成功！';
            messageElementInModal.className = 'message success-message';
        } else {
            // --- 新增模式 ---
            const docRef = await collectionRef.add(dataToSave);
            console.log("Order item added successfully with ID:", docRef.id);
            messageElementInModal.textContent = '品項新增成功！';
            messageElementInModal.className = 'message success-message';
            form.reset(); // 新增成功後清空表單
        }

        // ADDED: Close modal after successful save
        setTimeout(() => {
             if (typeof closeModal === 'function') {
                 closeModal('order-item-modal');
             } else {
                  console.warn("closeModal function not found after save.");
                  const modal = document.getElementById('order-item-modal');
                  if(modal) modal.style.display = 'none';
             }
            // Re-render the table to show changes
            const sectionContainer = document.getElementById('section-order-items'); // Need to get the container
            if (sectionContainer) {
                 loadOrderItemsSection(sectionContainer);
            } else {
                console.error("Could not find section container to reload order items list.");
            }
        }, 1500); // Delay slightly to show success message

    } catch (error) {
        console.error("Error saving order item:", error);
        messageElementInModal.textContent = `儲存失敗: ${error.message}`;
        messageElementInModal.className = 'message error-message';
    } finally {
        saveButton.disabled = false;
    }
}

/**
 * 處理刪除品項按鈕點擊，包含 Firestore 刪除操作
 * @param {string} itemId - 品項 Firestore 文件 ID
 * @param {string} itemName - 品項名稱 (用於確認訊息)
 */
async function deleteOrderItem(itemId, itemName) {
    // 確保 messageElement 可用 (來自 admin-logic.js 的全域變數)
    if (typeof messageElement === 'undefined') { console.error("Global messageElement not found."); return; }

    console.log("Attempting to delete order item (in admin-order-items.js):", itemId, itemName);
    if (confirm(`您確定要刪除品項 "${itemName}" (ID: ${itemId}) 嗎？`)) {
        console.log("User confirmed deletion.");
        messageElement.textContent = `正在刪除品項 ${itemName}...`;
        messageElement.className = 'message info-message'; // 使用全域 messageElement

        const deleteButton = document.querySelector(`.delete-item-btn[data-item-id="${itemId}"]`);
        if (deleteButton) deleteButton.disabled = true;

        try {
            if (typeof db === 'undefined') throw new Error("Firestore (db) is not available.");

            // **執行 Firestore 刪除**
            await db.collection('order_items').doc(itemId).delete();

            console.log(`Item ${itemId} deleted successfully from Firestore.`);

            // **更新 UI：移除表格中的對應行**
            const rowToRemove = document.querySelector(`tr[data-item-id="${itemId}"]`);
            if (rowToRemove) {
                rowToRemove.remove();
                console.log(`Row for item ${itemId} removed from table.`);
            } else {
                console.warn(`Could not find table row for item ${itemId} to remove.`);
                // 考慮重新載入表格
                // const sectionContainer = document.getElementById('section-order-items');
                // if (sectionContainer) loadOrderItemsSection(sectionContainer);
            }

            // 顯示成功訊息，並在幾秒後清除
            messageElement.textContent = `品項 "${itemName}" 已成功刪除。`;
            messageElement.className = 'message success-message';
            setTimeout(() => {
                if (messageElement.textContent.includes(`"${itemName}" 已成功刪除`)) {
                     messageElement.textContent = '';
                     messageElement.className = 'message';
                }
            }, 4000);

        } catch (error) {
            console.error(`Error deleting item ${itemId}:`, error);
            messageElement.textContent = `刪除品項 "${itemName}" 時失敗: ${error.message}`;
            messageElement.className = 'message error-message';
            if (deleteButton) deleteButton.disabled = false;
        }
    } else {
        console.log("User cancelled deletion.");
    }
}

console.log("admin-order-items.js loaded");