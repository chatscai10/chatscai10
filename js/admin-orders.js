// js/admin-orders.js - 叫貨紀錄查詢邏輯

'use strict';

// --- 叫貨紀錄查詢 Section ---

/**
 * 載入叫貨紀錄區塊，包含篩選器和初始列表
 * @param {HTMLElement} sectionContainer - 區塊的容器元素 (#section-orders)
 */
async function loadOrdersSection(sectionContainer) {
    console.log("Executing loadOrdersSection (in admin-orders.js)...");
    const contentContainer = sectionContainer.querySelector('.section-content');
    if (!contentContainer) { console.error("Content container not found in orders section"); return; }
    contentContainer.innerHTML = ''; // 清空

    // 1. 渲染篩選器 UI (渲染到 sectionContainer 內部，但在 contentContainer 外部/之前)
    renderOrderFilters(sectionContainer);

    // 2. 創建用於顯示表格的容器
    const tableContainer = document.createElement('div');
    tableContainer.id = 'orders-table-container'; // ID 用於 fetchAndRenderOrders 查找
    tableContainer.innerHTML = '<p>初始化中...</p>';
    contentContainer.appendChild(tableContainer);

    // 3. 創建分頁按鈕容器
    const paginationContainer = document.createElement('div');
    paginationContainer.id = 'orders-pagination-container'; // ID 用於 fetchAndRenderOrders 查找
    paginationContainer.style.marginTop = '15px';
    contentContainer.appendChild(paginationContainer);

    // 4. 初始載入資料 (使用預設篩選條件)
    // 重設分頁狀態
    if (typeof paginationState !== 'undefined' && paginationState.orders) {
         paginationState.orders.lastVisible = null;
    }
    await fetchAndRenderOrders(); // 執行初始查詢和渲染

    // 確保 loadedSections 存在 (來自 admin-logic.js)
    if (typeof loadedSections !== 'undefined') {
         loadedSections.add('orders'); // 標記為已載入
    }
    console.log("Orders section loaded successfully.");
}

/**
 * 渲染叫貨紀錄的篩選器 UI
 * @param {HTMLElement} sectionContainer - 要放置篩選器的容器 (section 容器)
 */
function renderOrderFilters(sectionContainer) {
    // 檢查篩選器是否已存在，避免重複渲染
    if (sectionContainer.querySelector('#order-filters')) {
        return;
    }

    const filterDiv = document.createElement('div');
    filterDiv.id = 'order-filters';
    filterDiv.style.marginBottom = '20px';
    filterDiv.classList.add('form-inline'); // 假設有 form-inline 或類似的 CSS class

    // 獲取今天和7天前的日期作為預設值
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const formatDate = (date) => date.toISOString().split('T')[0]; // YYYY-MM-DD

    // 使用 template literals 簡化 HTML 結構生成
    filterDiv.innerHTML = `
        <div class="form-group mr-2">
            <label for="order-filter-start-date" class="mr-1" style="margin-right: 5px;">起始日期:</label>
            <input type="date" id="order-filter-start-date" class="form-control form-control-sm" value="${formatDate(sevenDaysAgo)}">
        </div>
        <div class="form-group mr-2" style="margin-left: 10px;">
            <label for="order-filter-end-date" class="mr-1" style="margin-right: 5px;">結束日期:</label>
            <input type="date" id="order-filter-end-date" class="form-control form-control-sm" value="${formatDate(today)}">
        </div>
        <div class="form-group mr-2" style="margin-left: 10px;">
            <label for="order-filter-store" class="mr-1" style="margin-right: 5px;">分店:</label>
            <select id="order-filter-store" class="form-control form-control-sm">
                <option value="">所有分店</option>
                <option value="忠孝">忠孝</option>
                <option value="龍安">龍安</option>
                </select>
        </div>
        <button id="apply-order-filters-btn" class="btn btn-sm btn-info" style="margin-left: 10px;">查詢</button>
    `;

    // 將篩選器插入到 sectionContainer 的頂部,但在 .section-content 之前
    const contentDiv = sectionContainer.querySelector('.section-content');
    if(contentDiv) {
        sectionContainer.insertBefore(filterDiv, contentDiv);
    } else {
        // 如果 .section-content 不存在，直接加到 sectionContainer (備用)
        sectionContainer.appendChild(filterDiv);
    }


    // 綁定查詢按鈕事件
    const applyBtn = sectionContainer.querySelector('#apply-order-filters-btn');
    if (applyBtn) {
        applyBtn.onclick = () => {
            // 按下查詢時重設分頁狀態
            if (typeof paginationState !== 'undefined' && paginationState.orders) {
                 paginationState.orders.lastVisible = null;
            }
            fetchAndRenderOrders(); // 觸發查詢
        };
    }
}


/**
 * 根據篩選條件從 Firestore 獲取並渲染叫貨紀錄
 */
async function fetchAndRenderOrders() {
    const tableContainer = document.getElementById('orders-table-container');
    const paginationContainer = document.getElementById('orders-pagination-container');
    // 確保元素存在且 db 已初始化
    if (!tableContainer || !paginationContainer || typeof db === 'undefined') {
         console.error("Orders query prerequisites not met (DOM elements or db).");
         if(tableContainer) tableContainer.innerHTML = '<p style="color: red;">查詢元件載入錯誤。</p>';
         return;
     }

    tableContainer.innerHTML = '<p>正在查詢叫貨紀錄...</p>';
    paginationContainer.innerHTML = ''; // 清空分頁按鈕

    // 獲取篩選條件
    const startDateInput = document.getElementById('order-filter-start-date');
    const endDateInput = document.getElementById('order-filter-end-date');
    const storeInput = document.getElementById('order-filter-store');

    const startDate = startDateInput ? startDateInput.value : null;
    const endDate = endDateInput ? endDateInput.value : null;
    const store = storeInput ? storeInput.value : null;

    try {
        let query = db.collection('orders');

        // --- 應用篩選條件 ---
        // 注意：複合查詢需要對應的 Firestore 索引
        if (store) {
            query = query.where('store', '==', store);
        }
        if (startDate) {
            query = query.where('date', '>=', startDate);
        }
        if (endDate) {
            query = query.where('date', '<=', endDate);
        }

        // --- 排序 --- (按提交時間降序) - 需要建立索引
        // 確保 'timestamp' 欄位存在且已編入索引
         try {
             // MODIFIED: Add orderBy date first when date filter exists
             if (startDate || endDate) {
                 query = query.orderBy('date', 'desc');
             }
             query = query.orderBy('timestamp', 'desc');
         } catch (indexError) {
             console.warn("Index likely missing for orders query (orderBy date, timestamp):", indexError.message);
             // 如果沒有 timestamp 索引，可以嘗試只用 date 排序，或不排序
             // query = query.orderBy('date', 'desc');
         }


        // --- 分頁 (基礎) ---
        const currentPageState = paginationState.orders;
        // if (currentPageState.lastVisible) {
        //     query = query.startAfter(currentPageState.lastVisible);
        // }
        query = query.limit(currentPageState.pageSize);

        const querySnapshot = await query.get();

        // 儲存本次查詢最後一個文件，用於下次分頁
        // currentPageState.lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

        const orders = [];
        querySnapshot.forEach(doc => {
            orders.push({ id: doc.id, ...doc.data() });
        });

        // 渲染表格
        renderOrdersTable(tableContainer, orders);

        // 渲染分頁訊息 (簡易版 - 只顯示結果數量)
        if (querySnapshot.empty) {
             paginationContainer.textContent = '沒有符合條件的紀錄。';
        } else {
            paginationContainer.textContent = `顯示 ${orders.length} 筆紀錄。`;
            // TODO: 實作完整的分頁按鈕 (上一頁/下一頁)
        }

    } catch (error) {
        console.error("Error fetching orders:", error);
        tableContainer.innerHTML = `<p style="color: red;">查詢叫貨紀錄失敗: ${error.message}</p><p style="color: orange;">(提示：請檢查 Firestore 索引是否已建立。例如：需要為 store(asc), date(asc/desc), timestamp(desc) 等組合建立索引)</p>`;
    }
}


/**
 * 渲染叫貨紀錄表格
 * @param {HTMLElement} container - 要放置表格的容器
 * @param {Array<object>} orders - 叫貨紀錄資料陣列
 */
function renderOrdersTable(container, orders) {
    container.innerHTML = ''; // 清空 "載入中..." 或舊表格

    if (!orders || orders.length === 0) {
        // 由 fetchAndRenderOrders 中的 paginationContainer 顯示無紀錄訊息
        // container.innerHTML = '<p>沒有符合條件的叫貨紀錄。</p>';
        return;
    }

    const table = document.createElement('table');
    table.classList.add('data-table'); // 假設有此 CSS class

    // 表頭
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    const headers = ['提交時間', '叫貨日期', '分店', '填寫人', '叫貨品項'];
    headers.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    // 表身
    const tbody = table.createTBody();
    orders.forEach(order => {
        const row = tbody.insertRow();
        // 使用 admin-logic.js 中的 formatTimestamp (假設它已載入且可用)
        row.insertCell().textContent = order.timestamp && typeof formatTimestamp === 'function' ? formatTimestamp(order.timestamp) : 'N/A';
        row.insertCell().textContent = order.date || 'N/A';
        row.insertCell().textContent = order.store || 'N/A';
        row.insertCell().textContent = order.name || 'N/A';

        const itemsCell = row.insertCell();
        itemsCell.textContent = order.items || '';
        itemsCell.title = order.items || ''; // 滑鼠懸停顯示完整內容
        // 可以為 itemsCell 添加樣式讓其可滾動或省略過長內容
        // itemsCell.style.maxWidth = '300px';
        // itemsCell.style.overflow = 'hidden';
        // itemsCell.style.textOverflow = 'ellipsis';
        // itemsCell.style.whiteSpace = 'nowrap';
    });

    container.appendChild(table);
}


console.log("admin-orders.js loaded");