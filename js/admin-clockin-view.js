// 檔案: js/admin-clockin-view.js (修正版)
'use strict';

// --- 模組變數 ---
let clockinViewCurrentUser = null;
let clockinViewDb = null;
let clockinViewAvailableStores = []; // 新增：用於存儲分店列表
// 分頁狀態
let clockinPagination = { pageSize: 25, lastVisible: null };

/**
 * 載入打卡紀錄區塊
 */
async function loadClockinRecordsSection(sectionContainer, db, user) {
    clockinViewCurrentUser = user;
    clockinViewDb = db;
    console.log("Loading Clockin Records Section for admin:", user?.name);
    const contentContainer = sectionContainer.querySelector('.section-content');
    if (!contentContainer || !clockinViewDb || !clockinViewCurrentUser) {
        console.error("Clockin records section prerequisites missing.");
        if(contentContainer) contentContainer.innerHTML = '<p style="color:red">載入失敗：必要元件缺失</p>';
        return;
    }
    contentContainer.innerHTML = ''; // 清空

    // --- 新增：載入分店列表 (如果尚未載入) ---
    // 假設分店列表存在 pageAdminData (在 admin-logic.js 中載入)
    // 如果沒有，需要在這裡異步獲取
    if (typeof pageAdminData !== 'undefined' && pageAdminData.scheduleConfig && pageAdminData.scheduleConfig.availableStores) {
        clockinViewAvailableStores = pageAdminData.scheduleConfig.availableStores;
        console.log("Using stores from pageAdminData:", clockinViewAvailableStores);
    } else {
        console.warn("Available stores not found in pageAdminData, attempting to fetch directly.");
        // 可以加入從 Firestore 'settings/schedule_config' 讀取的備用邏輯
        // await fetchStoresForClockinView(); // 假設有這個函數
        clockinViewAvailableStores = ['預設店']; // 載入失敗時的備用
    }
    // --- 新增結束 ---


    // 1. 渲染篩選器
    renderClockinFilters(sectionContainer);

    // 2. 創建表格和分頁容器
    const tableContainer = document.createElement('div');
    tableContainer.id = 'clockin-records-table-container';
    contentContainer.appendChild(tableContainer);
    const paginationContainer = document.createElement('div');
    paginationContainer.id = 'clockin-records-pagination-container';
    paginationContainer.style.marginTop = '15px';
    contentContainer.appendChild(paginationContainer);

    // 3. 初始載入
    clockinPagination.lastVisible = null; // 重置分頁
    await fetchAndRenderClockinRecords();

    if (typeof loadedSections !== 'undefined') loadedSections.add('clockin-records');
}

/**
 * 渲染篩選器 (修正版)
 */
function renderClockinFilters(sectionContainer) {
      if (sectionContainer.querySelector('#clockin-filters')) return; // 避免重複

      const filterDiv = document.createElement('div');
      filterDiv.id = 'clockin-filters';
      filterDiv.style.marginBottom = '20px';
      // 使用 flex 佈局讓元素換行更自然
      filterDiv.style.display = 'flex';
      filterDiv.style.flexWrap = 'wrap';
      filterDiv.style.gap = '10px'; // 元素間距

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const formatDate = (date) => date.toISOString().split('T')[0];

      // --- 修改：動態生成分店選項 ---
      let storeOptionsHtml = '<option value="">所有分店</option>';
      if (Array.isArray(clockinViewAvailableStores)) {
          clockinViewAvailableStores.forEach(s => {
               storeOptionsHtml += `<option value="${s}">${s}</option>`; // 修正模板字串用法
          });
      }
      // --- 修改結束 ---

      // --- 修改：修正 innerHTML 模板 ---
      filterDiv.innerHTML = `
          <div class="form-group">
              <label for="clockin-filter-start" class="mr-1">起始:</label>
              <input type="date" id="clockin-filter-start" class="form-control form-control-sm" value="${formatDate(yesterday)}">
          </div>
          <div class="form-group">
              <label for="clockin-filter-end" class="mr-1">結束:</label>
              <input type="date" id="clockin-filter-end" class="form-control form-control-sm" value="${formatDate(today)}">
          </div>
          <div class="form-group">
              <label for="clockin-filter-store" class="mr-1">分店:</label>
              <select id="clockin-filter-store" class="form-control form-control-sm">${storeOptionsHtml}</select>
          </div>
          <div class="form-group">
              <label for="clockin-filter-employee" class="mr-1">員工:</label>
              <input type="text" id="clockin-filter-employee" class="form-control form-control-sm" placeholder="輸入姓名(可選)">
          </div>
          <button id="apply-clockin-filters-btn" class="btn btn-sm btn-info">查詢</button>
      `;
      // --- 修改結束 ---

      const contentDiv = sectionContainer.querySelector('.section-content');
      // 將篩選器插入到 sectionContainer 的頂部，但在 h3 標題之後
      const heading = sectionContainer.querySelector('h3');
      if (heading) {
          heading.insertAdjacentElement('afterend', filterDiv);
      } else {
          sectionContainer.insertBefore(filterDiv, contentDiv); // 備用方案
      }


      // 根據主管權限禁用或預選分店
      const storeSelect = filterDiv.querySelector('#clockin-filter-store');
       // 確保 clockinViewCurrentUser 和 level/store 存在
       if (clockinViewCurrentUser?.level !== undefined && clockinViewCurrentUser.level < 9 && clockinViewCurrentUser.store) {
           storeSelect.value = clockinViewCurrentUser.store;
           storeSelect.disabled = true; // 普通主管不能選其他店
       } else if (storeSelect) {
           storeSelect.disabled = false; // 確保高級管理員可以選擇
       }

      const applyBtn = filterDiv.querySelector('#apply-clockin-filters-btn');
      if (applyBtn) {
          applyBtn.onclick = () => {
              clockinPagination.lastVisible = null; // 重置分頁再查詢
              fetchAndRenderClockinRecords();
          };
      }
}

/**
  * 查詢並渲染打卡紀錄
  */
async function fetchAndRenderClockinRecords() {
      const tableContainer = document.getElementById('clockin-records-table-container');
      const paginationContainer = document.getElementById('clockin-records-pagination-container');
      if (!tableContainer || !paginationContainer || !clockinViewDb || !clockinViewCurrentUser) {
          console.error("fetchAndRenderClockinRecords prerequisites missing.");
          if (tableContainer) tableContainer.innerHTML = '<p style="color:red;">查詢元件載入錯誤。</p>';
          return;
      }

      tableContainer.innerHTML = '<p>查詢中...</p>';
      paginationContainer.innerHTML = '';

      // 獲取篩選值 (確保元素存在)
      const startDateInput = document.getElementById('clockin-filter-start');
      const endDateInput = document.getElementById('clockin-filter-end');
      const storeSelect = document.getElementById('clockin-filter-store');
      const employeeNameInput = document.getElementById('clockin-filter-employee');

      const startDate = startDateInput ? startDateInput.value : null;
      const endDate = endDateInput ? endDateInput.value : null;
      const store = storeSelect ? storeSelect.value : null;
      const employeeName = employeeNameInput ? employeeNameInput.value.trim() : null;

      try {
          let query = clockinViewDb.collection('time_records');

          // --- 權限過濾 ---
          // 確保 clockinViewCurrentUser.level 和 store 存在再判斷
          if (clockinViewCurrentUser?.level !== undefined && clockinViewCurrentUser.level < 9 && clockinViewCurrentUser.store) {
                query = query.where('store', '==', clockinViewCurrentUser.store);
                console.log(`Filtering records for store: ${clockinViewCurrentUser.store}`);
          } else if (store) { // 管理員選了特定分店
                query = query.where('store', '==', store);
                console.log(`Filtering records for selected store: ${store}`);
          }

          // --- 其他篩選 ---
          // 修正日期查詢，確保 Firestore Timestamp 格式正確
          if (startDate) {
              try {
                  query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(new Date(startDate + 'T00:00:00')));
              } catch (e) { console.error("Invalid start date format:", startDate, e); }
          }
          if (endDate) {
              try {
                  query = query.where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(new Date(endDate + 'T23:59:59')));
              } catch (e) { console.error("Invalid end date format:", endDate, e); }
          }
          // 查詢 employeeName (需要索引)
          if (employeeName) {
              console.log(`Filtering by employee name: ${employeeName}`);
              query = query.where('employeeName', '==', employeeName);
          }

          // --- 排序 (必須要有 timestamp 索引，且通常是第一個範圍或等式篩選之後) ---
          query = query.orderBy('timestamp', 'desc');

          // --- 分頁 (簡易) ---
          // 完整的 Firestore 分頁需要處理 startAfter/endBefore
          if (clockinPagination.lastVisible) {
              console.log("Querying next page after:", clockinPagination.lastVisible);
              query = query.startAfter(clockinPagination.lastVisible);
          }
          query = query.limit(clockinPagination.pageSize);

          const querySnapshot = await query.get();

          // 獲取用於下一頁的 lastVisible 文檔
          if (!querySnapshot.empty) {
              clockinPagination.lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
          } else {
              clockinPagination.lastVisible = null; // 沒有更多數據了
          }

          const records = [];
          querySnapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
          console.log(`Workspaceed ${records.length} records.`);

          renderClockinRecordsTable(tableContainer, records);

          // 更新分頁信息或按鈕
          updateClockinPaginationControls(paginationContainer, querySnapshot.size);

      } catch (error) {
          console.error("Error fetching clockin records:", error);
          tableContainer.innerHTML = `<p style="color:red;">查詢失敗: ${error.message}</p>`;
          if (error.code === 'failed-precondition') {
              tableContainer.innerHTML += `<p style="color:orange;">(提示：此查詢可能需要建立 Firestore 複合索引。請檢查 Firestore 控制台中的索引建議。)</p>`;
          }
      }
}

/**
  * 渲染打卡紀錄表格
  */
function renderClockinRecordsTable(container, records) {
    container.innerHTML = ''; // 清空
    if (!records || records.length === 0) {
        // 由 updateClockinPaginationControls 顯示 "無紀錄"
        return;
    }

    const table = document.createElement('table');
    table.classList.add('data-table'); // 使用通用表格樣式

    const thead = table.createTHead();
    const hr = thead.insertRow();
    // 增加「精確度」和「匹配地點」欄位
    const headers = ['時間', '員工', '分店', '類型', '定位(緯,經)', '精確度(米)', '匹配地點', '狀態'];
    headers.forEach(text => { const th = document.createElement('th'); th.textContent = text; hr.appendChild(th); });

    const tbody = table.createTBody();
    records.forEach(rec => {
        const row = tbody.insertRow();
        // 格式化時間 (確保 formatTimestamp 存在)
        row.insertCell().textContent = typeof formatTimestamp === 'function' && rec.timestamp?.toDate ? formatTimestamp(rec.timestamp) : (rec.timestamp?.toDate ? rec.timestamp.toDate().toLocaleString('zh-TW') : 'N/A');
        row.insertCell().textContent = rec.employeeName || rec.employeeId || 'N/A';
        row.insertCell().textContent = rec.store || 'N/A';
        const typeCell = row.insertCell();
        typeCell.textContent = rec.type === 'clockIn' ? '上班' : (rec.type === 'clockOut' ? '下班' : '未知');
        typeCell.style.color = rec.type === 'clockIn' ? 'green' : (rec.type === 'clockOut' ? 'red' : '');
        const locCell = row.insertCell();
        locCell.textContent = (rec.latitude && rec.longitude) ? `${rec.latitude.toFixed(4)}, ${rec.longitude.toFixed(4)}` : '無';
        // 顯示精確度
        row.insertCell().textContent = rec.accuracy ? rec.accuracy.toFixed(1) : 'N/A';
         // 顯示匹配地點 ID 或名稱 (如果有的話)
         row.insertCell().textContent = rec.matchedLocationId || 'N/A'; // 如果存的是名稱，用 rec.matchedLocationName
        const statusCell = row.insertCell();
        statusCell.textContent = rec.isInRange ? '範圍內' : '範圍外';
        statusCell.style.color = rec.isInRange ? 'green' : 'orange';
    });
    container.appendChild(table);
}

/**
 * 更新分頁控件 (簡易版，只顯示信息)
 */
function updateClockinPaginationControls(container, currentBatchSize) {
     if (!container) return;
     if (currentBatchSize === 0 && !clockinPagination.lastVisible) { // 第一次查詢就沒有結果
         container.textContent = '無符合條件的紀錄。';
     } else if (currentBatchSize < clockinPagination.pageSize) { // 這一頁是最後一頁
         container.textContent = `顯示 ${currentBatchSize} 筆紀錄 (已達末頁)。`;
         // 在這裡可以禁用 "下一頁" 按鈕 (如果有的話)
     } else { // 還有可能更多頁
         container.textContent = `顯示 ${currentBatchSize} 筆紀錄。`;
         // 在這裡可以啟用 "下一頁" 按鈕 (如果有的話)
     }
     // TODO: 實際的分頁按鈕邏輯
}


// --- 確保 formatTimestamp 函數可用 ---
// 你可以把它放在 admin-logic.js 或一個共用的 utils.js 文件中
/*
function formatTimestamp(ts) {
    if (!ts || !ts.toDate) return 'N/A';
    try {
        const date = ts.toDate();
        // 使用 Intl.DateTimeFormat 提供更本地化的格式
        const options = {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false // 24 小時制
        };
        return new Intl.DateTimeFormat('zh-TW', options).format(date);
         // 或者保持原來的格式：
         // const y = date.getFullYear();
         // const m = String(date.getMonth() + 1).padStart(2, '0');
         // const d = String(date.getDate()).padStart(2, '0');
         // const h = String(date.getHours()).padStart(2, '0');
         // const min = String(date.getMinutes()).padStart(2, '0');
         // const s = String(date.getSeconds()).padStart(2, '0');
         // return `${y}/${m}/${d} ${h}:${min}:${s}`;
    } catch (error) {
        console.error("Error formatting timestamp:", ts, error);
        return '時間格式錯誤';
    }
}
*/

// --- 確保 admin-logic.js 中的 loadSectionContent 有 case ---
/*
// 檔案: js/admin-logic.js
function loadSectionContent(sectionId, user) {
    // ... 其他 case ...
    case 'clockin-records':
        if (!loadedSections.has(sectionId) && typeof loadClockinRecordsSection === 'function') {
            loadClockinRecordsSection(section, pageDb, user);
        }
        break;
    // ...
}
*/

console.log("admin-clockin-view.js loaded (revised)");