'use strict';

// --- Module Scope Variables ---
let pageCurrentUser = null;
let pageDb = null; // Will be Firestore Compat instance
let availableOrderItems = []; // For the main order form (show: true)
let allOrderItems = []; // For the delivery report dropdowns (all items)
let pageSubmitReportCallable = null; // For submitting delivery reports

// DOM Element References (initialized in initOrderPage)
let employeeNameSpan, storeInput, dateInput, itemsContainer, orderForm, submitButton, messageElement, remarksInput;
let deliveryReportContainer, yesterdayOrderList, addMisdeliveredButton, misdeliveredItemsArea;
let submitDeliveryReportButton, reportDeliveryNormalButton, deliveryReportMessageElement;

// --- Initialization ---

/**
 * Initializes the order page.
 * Fetches items, renders forms, sets up listeners, and loads yesterday's order for reporting.
 * @param {object} currentUser - The currently logged-in user object.
 * @param {firebase.firestore.Firestore} db - Firestore Compat instance.
 */
async function initOrderPage(currentUser, db) {
    console.log("Initializing Order Page (Compat SDK) for:", currentUser?.name);
    pageCurrentUser = currentUser;
    pageDb = db;

    // Get DOM elements for the main order form
    employeeNameSpan = document.getElementById('order-employee-name');
    storeInput = document.getElementById('order-store-name');
    dateInput = document.getElementById('order-date');
    itemsContainer = document.getElementById('order-items-container');
    orderForm = document.getElementById('order-form');
    submitButton = document.getElementById('submit-order');
    messageElement = document.getElementById('order-message');
    remarksInput = document.getElementById('order-remarks');

    // Get DOM elements for the delivery report section
    deliveryReportContainer = document.getElementById('delivery-report-container');
    yesterdayOrderList = document.getElementById('yesterday-order-list');
    addMisdeliveredButton = document.getElementById('add-misdelivered-btn');
    misdeliveredItemsArea = document.getElementById('misdelivered-items-area');
    submitDeliveryReportButton = document.getElementById('submit-delivery-report');
    reportDeliveryNormalButton = document.getElementById('report-delivery-normal');
    deliveryReportMessageElement = document.getElementById('delivery-report-message');

    // --- Initialize Callable Function for Delivery Report --- (Moved earlier)
    try {
        if (typeof firebase !== 'undefined' && typeof firebase.functions === 'function') {
            // Assume function is in default region unless specified otherwise
            // const functionsInstance = firebase.functions('asia-east1');
            const functionsInstance = firebase.functions();
            pageSubmitReportCallable = functionsInstance.httpsCallable('reportDeliveryIssue'); // Ensure this function exists
            console.log("reportDeliveryIssue callable function initialized.");
        } else {
             console.error("Firebase Functions SDK not available. Cannot init delivery report function.");
             // Show error message in the report section if element exists
             const reportMsgEl = document.getElementById('delivery-report-message');
             if(reportMsgEl) showMessage("無法初始化回報功能", "error", reportMsgEl);
             // We might want to disable report buttons here
        }
    } catch (error) {
        console.error("Error initializing delivery report callable:", error);
        const reportMsgEl = document.getElementById('delivery-report-message');
        if(reportMsgEl) showMessage("初始化回報功能失敗", "error", reportMsgEl);
    }
    // --- End Callable Function Init ---

    // Basic validation for essential elements
    if (!itemsContainer || !orderForm || !submitButton || !deliveryReportContainer || !yesterdayOrderList || !misdeliveredItemsArea /* ... add others if critical */) {
        console.error("Required order page elements not found.");
        showMessage("頁面元件載入錯誤，請重新整理或聯繫管理員。", "error", messageElement || document.body);
        return;
    }

    // Set basic info (name, store, default date)
    if (employeeNameSpan) employeeNameSpan.textContent = pageCurrentUser.name || 'N/A';
    if (storeInput && pageCurrentUser.roles?.store) storeInput.value = pageCurrentUser.roles.store;
    if (dateInput) {
        dateInput.value = getTodayDateString(); // Set default to today
    }

    // Set initial loading states
    showMessage('正在載入可叫貨品項...', 'info', messageElement);
    if(submitButton) submitButton.disabled = true;
    showMessage('正在載入昨日訂單資訊...', 'info', deliveryReportMessageElement);
    if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = true;
    if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = true;

    try {
        // Fetch orderable items (show: true) and all items (for report dropdown) concurrently
        [availableOrderItems, allOrderItems] = await Promise.all([
            fetchOrderableItems(pageDb),
            fetchAllOrderItems(pageDb)
        ]);

        // Render the main order form
        renderOrderForm(availableOrderItems);
        if (orderForm) orderForm.addEventListener('submit', handleSubmitOrder); // Use module scope vars

        // Check if rendering was successful before enabling button
        if (itemsContainer && (availableOrderItems.length > 0 || itemsContainer.innerHTML.includes('無可叫貨'))) {
             showMessage('請填寫叫貨數量。', 'info', messageElement);
             if(submitButton) submitButton.disabled = false;
        } else {
             showMessage('無法載入叫貨表單，請稍後再試。', 'error', messageElement);
             if(submitButton) submitButton.disabled = true; // Keep disabled if form didn't render
        }


        // Load and display yesterday's order for reporting
        await loadAndDisplayYesterdayOrder();

        // Bind event listeners for the delivery report section
        if (addMisdeliveredButton) addMisdeliveredButton.onclick = handleAddMisdeliveredRow;
        if (submitDeliveryReportButton) submitDeliveryReportButton.onclick = handleSubmitDeliveryReport;
        if (reportDeliveryNormalButton) reportDeliveryNormalButton.onclick = handleReportDeliveryNormal;

        // Initialize the first misdelivered item row (populate dropdown, disable remove btn)
        const initialSelect = misdeliveredItemsArea?.querySelector('.misdelivered-item-select');
        if (initialSelect) {
            populateMisdeliveredSelect(initialSelect);
        }
        const initialRemoveBtn = misdeliveredItemsArea?.querySelector('.remove-misdelivered-btn');
        if (initialRemoveBtn && misdeliveredItemsArea?.children.length <= 1) {
            initialRemoveBtn.disabled = true;
        }

    } catch (error) {
        console.error("Error initializing order page:", error);
        showMessage(`頁面初始化失敗: ${error.message}`, 'error', messageElement);
        if(itemsContainer) itemsContainer.innerHTML = '<p class="message error">無法載入叫貨品項</p>';
        showMessage(`無法載入昨日訂單: ${error.message}`, 'error', deliveryReportMessageElement);
        // Ensure buttons remain disabled on major init error
         if(submitButton) submitButton.disabled = true;
         if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = true;
         if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = true;
    }
}

// --- Data Fetching ---

/**
 * Fetches orderable items (show: true) from Firestore using Compat SDK.
 * @param {firebase.firestore.Firestore} db
 * @returns {Promise<Array<object>>}
 */
async function fetchOrderableItems(db) {
    if (!db) throw new Error("Firestore instance is required.");
    const items = [];
    try {
        // Use Compat SDK syntax
        const q = db.collection('order_items')
            .where('show', '==', true)
            .orderBy('category')
            .orderBy('order')
            .orderBy('name');

        const querySnapshot = await q.get();
        querySnapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        console.log(`Fetched ${items.length} orderable items.`);
        return items;
    } catch (error) {
        console.error("Error fetching orderable items:", error);
        throw new Error("讀取叫貨品項設定時發生錯誤。");
    }
}

/**
 * Fetches ALL order items (including hidden) from Firestore using Compat SDK.
 * @param {firebase.firestore.Firestore} db
 * @returns {Promise<Array<object>>}
 */
async function fetchAllOrderItems(db) {
    if (!db) throw new Error("Firestore instance is required.");
    const items = [];
    try {
        // Use Compat SDK syntax
        const q = db.collection('order_items')
            .orderBy('category')
            .orderBy('order')
            .orderBy('name');

        const querySnapshot = await q.get();
        querySnapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        console.log(`Fetched ${items.length} total items for reporting.`);
        return items;
     } catch (error) {
        console.error("Error fetching all order items:", error);
        throw new Error("讀取所有品項列表時發生錯誤。");
    }
}

// --- Rendering ---

/**
 * Renders the main order form with the given items.
 * @param {Array<object>} items - The list of orderable items
 */
function renderOrderForm(items) {
    if (!itemsContainer) return;
    
    if (items.length === 0) {
        itemsContainer.innerHTML = '<p class="no-items-message">無可叫貨品項。請聯繫管理員設定。</p>';
        return;
    }
    
    let currentCategory = '';
    let html = '';
    
    // Group by category
    items.forEach(item => {
        if (item.category !== currentCategory) {
            // Close previous category div and start new category
            if (currentCategory !== '') {
                html += '</div>'; // Close previous category items container
            }
            currentCategory = item.category;
            html += `
                <div class="order-category">
                    <h3>${item.category || '未分類'}</h3>
                    <div class="category-items">
            `;
        }
        
        // Create item HTML
        html += createOrderItemInput(item);
    });
    
    // Close last category div
    if (currentCategory !== '') {
        html += '</div></div>';
    }
    
    itemsContainer.innerHTML = html;
    
    // Add event listeners
    document.querySelectorAll('.item-quantity-input').forEach(input => {
        input.addEventListener('input', function() {
            // Optional: Format or validate input
        });
    });
}

/**
 * Creates HTML for a single order item input field
 * @param {object} itemDef - The item definition
 * @returns {string} - HTML string
 */
function createOrderItemInput(itemDef) {
    const itemId = itemDef.id;
    const itemName = itemDef.name || 'Unknown Item';
    const unit = itemDef.unit || '個';
    
    return `
        <div class="order-item" data-item-id="${itemId}">
            <div class="item-details">
                <label for="item-${itemId}" class="item-name">${itemName}</label>
                <small class="item-unit">(${unit})</small>
            </div>
            <div class="item-input">
                <input type="number" id="item-${itemId}" name="items[${itemId}]" 
                    class="form-control item-quantity-input" min="0" value="0">
            </div>
        </div>
    `;
}

/**
 * Loads yesterday's order for the reporting section
 */
async function loadAndDisplayYesterdayOrder() {
    if (!yesterdayOrderList || !pageDb || !pageCurrentUser) return;
    
    // Show loading state
    yesterdayOrderList.innerHTML = '<p class="loading">載入中...</p>';
    
    try {
        // Get yesterday's date
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayStr = getTodayDateString(yesterday);
        
        // Check if order exists for this user's store
        const store = pageCurrentUser.roles?.store;
        if (!store) throw new Error("用戶無店家資訊，無法顯示昨日訂單");
        
        const orderQuery = await pageDb.collection('orders')
            .where('store', '==', store)
            .where('orderDate', '==', yesterdayStr)
            .limit(1)
            .get();
        
        if (orderQuery.empty) {
            // No order found
            yesterdayOrderList.innerHTML = '<p class="no-order">昨日無訂單記錄</p>';
            
            // Disable reporting tools
            if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = true;
            if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = true;
            
            return;
        }
        
        // Order found, display it
        const orderDoc = orderQuery.docs[0];
        const orderData = orderDoc.data();
        
        // Enable reporting tools
        if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = false;
        if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = false;
        
        // Display items in a list
        let html = '<h4>昨日訂單項目</h4><ul class="order-items-list">';
        
        // Get item details from the order
        for (const [itemId, quantity] of Object.entries(orderData.items || {})) {
            if (quantity <= 0) continue;
            
            // Find the item in allOrderItems array
            const itemDef = allOrderItems.find(item => item.id === itemId);
            const itemName = itemDef ? itemDef.name : '未知品項';
            const unit = itemDef ? itemDef.unit : '個';
            
            html += `<li><span class="item-name">${itemName}</span>: <span class="item-quantity">${quantity} ${unit}</span></li>`;
        }
        
        html += '</ul>';
        html += `<p class="order-info">訂單時間: ${orderData.timestamp ? formatTimestamp(orderData.timestamp) : '未知'}</p>`;
        
        yesterdayOrderList.innerHTML = html;
        
    } catch (error) {
        console.error("Error loading yesterday's order:", error);
        yesterdayOrderList.innerHTML = `<p class="error">載入昨日訂單錯誤: ${error.message}</p>`;
        
        // Disable reporting tools due to error
        if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = true;
        if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = true;
    }
}

// --- Utility Functions ---

/**
 * Returns today's date in YYYY-MM-DD format
 * @param {Date} date - Optional date to format (defaults to today)
 * @returns {string}
 */
function getTodayDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Formats a timestamp for display
 * @param {firebase.firestore.Timestamp} timestamp
 * @returns {string}
 */
function formatTimestamp(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') {
        return '日期無效';
    }
    try {
        const date = timestamp.toDate();
        const options = { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false, 
            timeZone: 'Asia/Taipei' 
        };
        return new Intl.DateTimeFormat('zh-TW', options).format(date);
    } catch (e) {
        console.error("Error formatting timestamp:", e);
        return "時間格式錯誤";
    }
}

/**
 * Shows a message in the given element
 * @param {string} msg - Message to show
 * @param {string} type - Message type (info, error, success)
 * @param {HTMLElement} element - Element to show message in
 */
function showMessage(msg, type = 'info', element = messageElement) {
    if (!element) return;
    
    element.textContent = msg;
    element.className = ''; // Reset classes
    element.classList.add('message', `${type}-message`);
}

/**
 * Populates a misdelivered item select dropdown
 * @param {HTMLSelectElement} selectElement
 */
function populateMisdeliveredSelect(selectElement) {
    if (!selectElement || !allOrderItems || allOrderItems.length === 0) {
        return;
    }
    
    let html = '<option value="">請選擇品項</option>';
    
    // Group items by category
    const itemsByCategory = {};
    allOrderItems.forEach(item => {
        const category = item.category || '未分類';
        if (!itemsByCategory[category]) {
            itemsByCategory[category] = [];
        }
        itemsByCategory[category].push(item);
    });
    
    // Generate options
    for (const [category, items] of Object.entries(itemsByCategory)) {
        if (items.length > 0) {
            html += `<optgroup label="${category}">`;
            items.forEach(item => {
                html += `<option value="${item.id}" data-unit="${item.unit || '個'}">${item.name}</option>`;
            });
            html += '</optgroup>';
        }
    }
    
    selectElement.innerHTML = html;
}

/**
 * Handles submission of the order form
 * @param {Event} event 
 */
async function handleSubmitOrder(event) {
    event.preventDefault();
    
    if (!pageDb || !pageCurrentUser) {
        showMessage('未能獲取用戶資訊或資料庫連接，請重試。', 'error');
        return;
    }
    
    // Validate required fields
    const store = storeInput?.value;
    const orderDate = dateInput?.value;
    
    if (!store) {
        showMessage('請選擇商店。', 'error');
        return;
    }
    
    if (!orderDate) {
        showMessage('請選擇日期。', 'error');
        return;
    }
    
    // Collect item quantities
    const items = {};
    let hasItems = false;
    document.querySelectorAll('.item-quantity-input').forEach(input => {
        const itemId = input.id.replace('item-', '');
        const quantity = parseInt(input.value, 10) || 0;
        
        if (quantity > 0) {
            items[itemId] = quantity;
            hasItems = true;
        }
    });
    
    if (!hasItems) {
        showMessage('請至少填寫一項產品數量。', 'error');
        return;
    }
    
    // Disable form during submission
    if (submitButton) submitButton.disabled = true;
    showMessage('提交中...', 'info');
    
    // Prepare order data
    const orderData = {
        store: store,
        orderDate: orderDate,
        items: items,
        remarks: remarksInput?.value || '',
        createdBy: pageCurrentUser.authUid,
        createdByName: pageCurrentUser.name || 'Unknown',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        // Check if an order already exists for this store and date
        const existingQuery = await pageDb.collection('orders')
            .where('store', '==', store)
            .where('orderDate', '==', orderDate)
            .limit(1)
            .get();
        
        if (!existingQuery.empty) {
            // Update existing order
            const existingDoc = existingQuery.docs[0];
            await existingDoc.ref.update({
                items: items,
                remarks: orderData.remarks,
                updatedBy: pageCurrentUser.authUid,
                updatedByName: pageCurrentUser.name || 'Unknown',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            showMessage(`已更新 ${store} ${orderDate} 的訂單。`, 'success');
        } else {
            // Create new order
            await pageDb.collection('orders').add(orderData);
            showMessage(`已成功提交 ${store} ${orderDate} 的訂單。`, 'success');
        }
        
        // Reset form
        if (orderForm) orderForm.reset();
        if (dateInput) dateInput.value = getTodayDateString();  // Reset to today
        if (storeInput && pageCurrentUser.roles?.store) storeInput.value = pageCurrentUser.roles.store;
        
    } catch (error) {
        console.error("Error submitting order:", error);
        showMessage(`提交失敗: ${error.message}`, 'error');
    } finally {
        // Re-enable form
        if (submitButton) submitButton.disabled = false;
    }
}

// --- Handles adding a new misdelivered item row ---
function handleAddMisdeliveredRow() {
    if (!misdeliveredItemsArea) return;
    
    const rowTemplate = `
        <div class="misdelivered-item-row">
            <div class="row g-2">
                <div class="col-5">
                    <select class="form-select misdelivered-item-select" required>
                        <!-- Will be populated -->
                    </select>
                </div>
                <div class="col-3">
                    <input type="number" class="form-control misdelivered-quantity" placeholder="數量" min="1" required>
                </div>
                <div class="col-3">
                    <select class="form-select misdelivered-issue-type" required>
                        <option value="">問題類型</option>
                        <option value="missing">未送達</option>
                        <option value="quality">品質問題</option>
                        <option value="quantity">數量不足</option>
                        <option value="wrong">錯誤品項</option>
                        <option value="other">其他</option>
                    </select>
                </div>
                <div class="col-1">
                    <button type="button" class="btn btn-danger remove-misdelivered-btn">✕</button>
                </div>
            </div>
        </div>
    `;
    
    // Create new row from template
    const rowElement = document.createElement('div');
    rowElement.innerHTML = rowTemplate;
    const newRow = rowElement.firstElementChild;
    
    // Add to container
    misdeliveredItemsArea.appendChild(newRow);
    
    // Populate the select
    const select = newRow.querySelector('.misdelivered-item-select');
    if (select) {
        populateMisdeliveredSelect(select);
    }
    
    // Enable all remove buttons
    misdeliveredItemsArea.querySelectorAll('.remove-misdelivered-btn').forEach(btn => {
        btn.disabled = false;
        btn.onclick = function() {
            this.closest('.misdelivered-item-row').remove();
            
            // If only one row left, disable its remove button
            const remainingRows = misdeliveredItemsArea.querySelectorAll('.misdelivered-item-row');
            if (remainingRows.length === 1) {
                remainingRows[0].querySelector('.remove-misdelivered-btn').disabled = true;
            }
        };
    });
}

// --- Handles submission of delivery report ---
async function handleSubmitDeliveryReport() {
    if (!pageDb || !pageCurrentUser || !misdeliveredItemsArea) {
        showMessage('未能獲取用戶資訊或資料庫連接，請重試。', 'error', deliveryReportMessageElement);
        return;
    }
    
    // Validate form
    const rows = misdeliveredItemsArea.querySelectorAll('.misdelivered-item-row');
    let validForm = true;
    const reportItems = [];
    
    for (const row of rows) {
        const select = row.querySelector('.misdelivered-item-select');
        const quantity = row.querySelector('.misdelivered-quantity');
        const issueType = row.querySelector('.misdelivered-issue-type');
        
        if (!select?.value || !quantity?.value || !issueType?.value) {
            validForm = false;
            break;
        }
        
        // Find the item details
        const itemDef = allOrderItems.find(item => item.id === select.value);
        
        reportItems.push({
            itemId: select.value,
            itemName: itemDef?.name || 'Unknown Item',
            quantity: parseInt(quantity.value, 10) || 0,
            unit: itemDef?.unit || '個',
            issueType: issueType.value
        });
    }
    
    if (!validForm || reportItems.length === 0) {
        showMessage('請完整填寫送貨問題資訊。', 'error', deliveryReportMessageElement);
        return;
    }
    
    // Disable form during submission
    if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = true;
    if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = true;
    showMessage('提交送貨問題回報中...', 'info', deliveryReportMessageElement);
    
    // Get yesterday's date
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = getTodayDateString(yesterday);
    
    // Prepare report data
    const reportData = {
        reportType: 'issue',
        store: pageCurrentUser.roles?.store || 'Unknown',
        orderDate: yesterdayStr,
        reportedItems: reportItems,
        reportedBy: pageCurrentUser.authUid,
        reportedByName: pageCurrentUser.name || 'Unknown',
        timestamp: new Date().toISOString()  // Cannot use server timestamp in callable
    };
    
    try {
        // Submit report via Firebase Function
        const result = await submitReportToFunction(reportData);
        
        // Handle result
        if (result && result.success) {
            showMessage('送貨問題已成功回報，謝謝您的協助！', 'success', deliveryReportMessageElement);
            
            // Reset form
            misdeliveredItemsArea.innerHTML = '';
            handleAddMisdeliveredRow(); // Add a fresh empty row
            
            // Disable buttons to prevent multiple reports
            if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = true;
            if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = true;
        } else {
            const errorMsg = result?.error || '未知錯誤';
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error("Error submitting delivery report:", error);
        showMessage(`回報送貨問題失敗: ${error.message}`, 'error', deliveryReportMessageElement);
        
        // Re-enable form
        if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = false;
        if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = false;
    }
}

// --- Handles reporting normal delivery ---
async function handleReportDeliveryNormal() {
    if (!pageDb || !pageCurrentUser) {
        showMessage('未能獲取用戶資訊或資料庫連接，請重試。', 'error', deliveryReportMessageElement);
        return;
    }
    
    // Confirm operation
    if (!confirm('確定要回報昨日送貨正常嗎？')) {
        return;
    }
    
    // Disable buttons during submission
    if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = true;
    if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = true;
    showMessage('回報送貨正常中...', 'info', deliveryReportMessageElement);
    
    // Get yesterday's date
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = getTodayDateString(yesterday);
    
    // Prepare report data
    const reportData = {
        reportType: 'normal',
        store: pageCurrentUser.roles?.store || 'Unknown',
        orderDate: yesterdayStr,
        reportedItems: [],  // Empty for normal delivery
        reportedBy: pageCurrentUser.authUid,
        reportedByName: pageCurrentUser.name || 'Unknown',
        timestamp: new Date().toISOString()  // Cannot use server timestamp in callable
    };
    
    try {
        // Submit normal report
        const result = await submitReportToFunction(reportData);
        
        // Handle result
        if (result && result.success) {
            showMessage('已成功回報送貨正常，謝謝您的協助！', 'success', deliveryReportMessageElement);
            
            // Reset form and disable buttons to prevent multiple reports
            if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = true;
            if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = true;
        } else {
            const errorMsg = result?.error || '未知錯誤';
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error("Error reporting normal delivery:", error);
        showMessage(`回報送貨正常失敗: ${error.message}`, 'error', deliveryReportMessageElement);
        
        // Re-enable buttons
        if (submitDeliveryReportButton) submitDeliveryReportButton.disabled = false;
        if (reportDeliveryNormalButton) reportDeliveryNormalButton.disabled = false;
    }
}

// --- Submits report data to Firebase Function ---
async function submitReportToFunction(reportData) {
    // If the callable function is not available, try direct Firestore writing
    if (!pageSubmitReportCallable) {
        console.warn("Callable function not available, falling back to direct Firestore write.");
        
        try {
            // Add to delivery_reports collection
            await pageDb.collection('delivery_reports').add({
                ...reportData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp() // Use server timestamp
            });
            
            return { success: true };
        } catch (firestoreError) {
            console.error("Firestore fallback also failed:", firestoreError);
            throw firestoreError;
        }
    }
    
    // Use the callable function
    try {
        const result = await pageSubmitReportCallable(reportData);
        console.log("Function call result:", result);
        return result.data;
    } catch (functionError) {
        console.error("Function call failed:", functionError);
        throw new Error(functionError.message || '函數呼叫失敗');
    }
}

console.log("order-logic.js reloaded and fixed");
