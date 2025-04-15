// js/admin-leave-requests.js - 排假紀錄查詢邏輯

'use strict';

// --- 排假紀錄查詢 Section ---

// Placeholder for callable function - ideally defined where firebase.functions() is initialized
let reviewLeaveRequestCallable = null; 

/**
 * 載入排假紀錄區塊，包含篩選器和初始列表
 * @param {HTMLElement} sectionContainer - 區塊的容器元素 (#section-leave-requests)
 */
async function loadLeaveRequestsSection(sectionContainer) {
    console.log("Executing loadLeaveRequestsSection (in admin-leave-requests.js)...");
    const contentContainer = sectionContainer.querySelector('.section-content');
    if (!contentContainer) { console.error("Content container not found in leave requests section"); return; }
    contentContainer.innerHTML = ''; // 清空

    // 1. 渲染篩選器 UI
    renderLeaveRequestFilters(sectionContainer);

    // 2. 創建表格容器
    const tableContainer = document.createElement('div');
    tableContainer.id = 'leave-requests-table-container'; // ID 用於 fetchAndRender... 查找
    tableContainer.innerHTML = '<p>初始化中...</p>';
    contentContainer.appendChild(tableContainer);

    // 3. 創建分頁容器
    const paginationContainer = document.createElement('div');
    paginationContainer.id = 'leave-requests-pagination-container'; // ID 用於 fetchAndRender... 查找
    paginationContainer.style.marginTop = '15px';
    contentContainer.appendChild(paginationContainer);

    // 4. 初始載入資料 (使用預設篩選條件)
    // 重設分頁狀態
    if (typeof paginationState !== 'undefined' && paginationState.leave_requests) {
         paginationState.leave_requests.lastVisible = null;
    } else if (typeof paginationState !== 'undefined') {
        // 如果 paginationState 存在但 leave_requests 不存在，創建它
        paginationState.leave_requests = { lastVisible: null, pageSize: 20 };
    }
    await fetchAndRenderLeaveRequests(); // 執行初始查詢和渲染

    // 確保 loadedSections 存在 (來自 admin-logic.js)
    if (typeof loadedSections !== 'undefined') {
         loadedSections.add('leave-requests'); // 標記為已載入
    }
    
    // --- NEW: Define callable function (Placeholder) ---
    // This should ideally be moved to where firebase.functions() is initialized (e.g., admin-logic.js)
    try {
        if (typeof firebase !== 'undefined' && typeof firebase.functions === 'function' && !reviewLeaveRequestCallable) {
            // Check if firebase.functions exists and callable is not already defined
            reviewLeaveRequestCallable = firebase.functions().httpsCallable('reviewLeaveRequest');
            console.log("reviewLeaveRequest callable function defined (in admin-leave-requests.js - consider moving).");
        } else if (!reviewLeaveRequestCallable) {
             console.warn("Firebase Functions SDK not available or already defined elsewhere. Cannot define reviewLeaveRequestCallable here.");
        }
    } catch (error) {
         console.error("Error defining reviewLeaveRequestCallable:", error);
    }
    // --- END NEW ---

    console.log("Leave requests section loaded successfully.");
}

/**
 * 渲染排假紀錄的篩選器 UI
 * @param {HTMLElement} sectionContainer - 要放置篩選器的容器 (section 容器)
 */
function renderLeaveRequestFilters(sectionContainer) {
    // 檢查篩選器是否已存在，避免重複渲染
    if (sectionContainer.querySelector('#leave-request-filters')) {
        return;
    }

    const filterDiv = document.createElement('div');
    filterDiv.id = 'leave-request-filters';
    filterDiv.style.marginBottom = '20px';
    filterDiv.classList.add('form-inline'); // 假設有 form-inline 或類似的 CSS class

    // 獲取當前年月作為預設值 YYYY-MM
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    // 使用 template literals 簡化 HTML 結構生成
    filterDiv.innerHTML = `
        <div class="form-group mr-2">
            <label for="lr-filter-month" class="mr-1" style="margin-right: 5px;">月份:</label>
            <input type="month" id="lr-filter-month" class="form-control form-control-sm" value="${currentMonth}">
        </div>
        <div class="form-group mr-2" style="margin-left: 10px;">
            <label for="lr-filter-store" class="mr-1" style="margin-right: 5px;">分店:</label>
            <select id="lr-filter-store" class="form-control form-control-sm">
                <option value="">所有分店</option>
                <option value="忠孝">忠孝</option>
                <option value="龍安">龍安</option>
                </select>
        </div>
        <button id="apply-lr-filters-btn" class="btn btn-sm btn-info" style="margin-left: 10px;">查詢</button>
    `;

    // 將篩選器插入到 sectionContainer 的頂部,但在 .section-content 之前
    const contentDiv = sectionContainer.querySelector('.section-content');
    if(contentDiv) {
        sectionContainer.insertBefore(filterDiv, contentDiv);
    } else {
        sectionContainer.appendChild(filterDiv); // 備用
    }


    // 綁定查詢按鈕事件
    const applyBtn = sectionContainer.querySelector('#apply-lr-filters-btn');
    if (applyBtn) {
        applyBtn.onclick = () => {
            // 按下查詢時重設分頁狀態
            if (typeof paginationState !== 'undefined' && paginationState.leave_requests) {
                 paginationState.leave_requests.lastVisible = null;
            }
            fetchAndRenderLeaveRequests(); // 觸發查詢
        };
    }
}


/**
 * 根據篩選條件從 Firestore 獲取並渲染排假紀錄
 */
async function fetchAndRenderLeaveRequests() {
    const tableContainer = document.getElementById('leave-requests-table-container');
    const paginationContainer = document.getElementById('leave-requests-pagination-container');
    // 確保元素存在且 db 已初始化
     if (!tableContainer || !paginationContainer || typeof db === 'undefined') {
         console.error("Leave requests query prerequisites not met (DOM elements or db).");
         if(tableContainer) tableContainer.innerHTML = '<p style="color: red;">查詢元件載入錯誤。</p>';
         return;
     }

    tableContainer.innerHTML = '<p>正在查詢排假紀錄...</p>';
    paginationContainer.innerHTML = '';

    // 獲取篩選條件
    const monthInput = document.getElementById('lr-filter-month');
    const storeInput = document.getElementById('lr-filter-store');

    const month = monthInput ? monthInput.value : null; // YYYY-MM
    const store = storeInput ? storeInput.value : null;

    try {
        let query = db.collection('leave_requests');

        // --- 應用篩選條件 --- (需要對應的 Firestore 索引)
        if (month) {
            query = query.where('month', '==', month);
        }
        if (store) {
            query = query.where('store', '==', store);
        }

        // --- 排序 --- (按提交時間降序) - 需要索引
        // 確保 'timestamp' 欄位存在且已編入索引
        try {
            query = query.orderBy('timestamp', 'desc');
        } catch (indexError) {
            console.warn("Index likely missing for leave_requests query (orderBy timestamp):", indexError.message);
             // 如果沒有 timestamp 索引，可以嘗試只用 month 排序，或不排序
             if(month) {
                 try { query = query.orderBy('name'); } catch(e) {} // 按名字排序作為備用
             }
        }


        // --- 分頁 (基礎) ---
        const currentPageState = paginationState.leave_requests;
        // if (currentPageState.lastVisible) {
        //     query = query.startAfter(currentPageState.lastVisible);
        // }
        query = query.limit(currentPageState.pageSize);

        const querySnapshot = await query.get();

        // 儲存本次查詢最後一個文件，用於下次分頁
        // currentPageState.lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

        const requests = [];
        querySnapshot.forEach(doc => {
            requests.push({ id: doc.id, ...doc.data() });
        });

        // 渲染表格
        renderLeaveRequestsTable(tableContainer, requests);

        // 渲染分頁訊息 (簡易版 - 只顯示結果數量)
        if (querySnapshot.empty) {
             paginationContainer.textContent = '沒有符合條件的紀錄。';
        } else {
            paginationContainer.textContent = `顯示 ${requests.length} 筆紀錄。`;
            // TODO: 實作完整的分頁按鈕 (上一頁/下一頁)
        }

    } catch (error) {
        console.error("Error fetching leave requests:", error);
        tableContainer.innerHTML = `<p style="color: red;">查詢排假紀錄失敗: ${error.message}</p><p style="color: orange;">(提示：請檢查 Firestore 索引是否已針對 'month', 'store', 'timestamp' 等欄位建立)</p>`;
    }
}


/**
 * 渲染排假紀錄表格
 * @param {HTMLElement} container - 要放置表格的容器
 * @param {Array<object>} requests - 排假紀錄資料陣列
 */
function renderLeaveRequestsTable(container, requests) {
    container.innerHTML = ''; // 清空 "載入中..." 或舊表格

    if (!requests || requests.length === 0) {
        // 由 fetchAndRenderLeaveRequests 中的 paginationContainer 顯示無紀錄訊息
        return;
    }

    const table = document.createElement('table');
    table.classList.add('data-table'); // 假設有此 CSS class

    // 表頭
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    const headers = ['員工姓名', '員工ID', '排假月份', '分店', '申請休假日期', '提交時間', '狀態', '操作'];
    headers.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    // 表身
    const tbody = table.createTBody();
    requests.forEach(req => {
        const row = tbody.insertRow();
        row.insertCell().textContent = req.name || 'N/A';
        // 只顯示身分證後四碼作為範例
        row.insertCell().textContent = req.id ? '...' + req.id.slice(-4) : 'N/A';
        row.insertCell().textContent = req.month || 'N/A';
        row.insertCell().textContent = req.store || 'N/A';

        // 格式化 selected_dates 陣列
        const datesCell = row.insertCell();
        if (req.selected_dates && Array.isArray(req.selected_dates)) {
            // 只顯示日期部分 (DD)，並用逗號連接
             const displayDates = req.selected_dates.map(dateStr => {
                 try { return dateStr.split('-')[2]; } catch(e) { return '?';} // 基本防錯
             }).join(', ');
             datesCell.textContent = displayDates;
             datesCell.title = req.selected_dates.join(', '); // 懸停顯示完整日期
        } else {
            datesCell.textContent = 'N/A';
        }

        // 使用 admin-logic.js 中的 formatTimestamp
        row.insertCell().textContent = req.timestamp && typeof formatTimestamp === 'function' ? formatTimestamp(req.timestamp) : 'N/A';

        // --- NEW: Add Status and Actions Cells --- 
        // Status Cell
        const statusCell = row.insertCell();
        const status = req.status || 'pending'; // Default to pending if undefined
        statusCell.textContent = translateLeaveStatus(status); // Use helper for translation
        statusCell.classList.add(`status-${status}`); // Add class for potential styling

        // Action Cell
        const actionCell = row.insertCell();
        if (status === 'pending') {
            const approveBtn = document.createElement('button');
            approveBtn.textContent = '批准';
            approveBtn.className = 'btn btn-success btn-sm mr-1'; // Added margin
            approveBtn.dataset.id = req.id; // Store request ID
            approveBtn.dataset.action = 'approved';
            approveBtn.onclick = function() { handleReviewLeaveRequest(this.dataset.id, this.dataset.action, this); }; // Pass button element
            actionCell.appendChild(approveBtn);

            const rejectBtn = document.createElement('button');
            rejectBtn.textContent = '拒絕';
            rejectBtn.className = 'btn btn-danger btn-sm';
            rejectBtn.dataset.id = req.id; // Store request ID
            rejectBtn.dataset.action = 'rejected';
            rejectBtn.onclick = function() { handleReviewLeaveRequest(this.dataset.id, this.dataset.action, this); }; // Pass button element
            actionCell.appendChild(rejectBtn);
        } else {
            actionCell.textContent = '-'; // No actions for non-pending requests
        }
        // --- END NEW --- 
    });

    container.appendChild(table);
}

// --- NEW: Helper function to translate status --- 
function translateLeaveStatus(status) {
    switch (status) {
        case 'pending': return '待審核';
        case 'approved': return '已批准';
        case 'rejected': return '已拒絕';
        default: return status; // Return original if unknown
    }
}

// --- NEW: Function to handle review button clicks --- 
async function handleReviewLeaveRequest(requestId, action, buttonElement) {
    console.log(`Reviewing request ${requestId} with action: ${action}`);

    if (!reviewLeaveRequestCallable) {
        alert('錯誤：審核功能未初始化。');
        console.error("reviewLeaveRequestCallable is not defined.");
        return;
    }

    // Disable both buttons in the same cell temporarily
    const actionCell = buttonElement.parentElement;
    const buttonsInCell = actionCell.querySelectorAll('button');
    buttonsInCell.forEach(btn => btn.disabled = true);
    const originalButtonText = buttonElement.textContent;
    buttonElement.textContent = '處理中...';

    try {
        const result = await reviewLeaveRequestCallable({ requestId: requestId, action: action });

        if (result.data.success) {
            console.log(`Request ${requestId} successfully ${action}.`);
            // Refresh the table to show updated status
            // Simple refresh for now, could be optimized to update just the row
            alert(`操作成功：請求已 ${translateLeaveStatus(action)}`); 
            fetchAndRenderLeaveRequests(); // Re-fetch and render the current view
        } else {
            throw new Error(result.data.message || '後端處理失敗，但未提供原因。');
        }
    } catch (error) {
        console.error(`Error reviewing leave request ${requestId}:`, error);
        alert(`錯誤：處理請求 ${requestId} 失敗。
原因: ${error.message}`);
        // Re-enable buttons on error
        buttonsInCell.forEach(btn => btn.disabled = false);
        buttonElement.textContent = originalButtonText;
    }
}

console.log("admin-leave-requests.js loaded");