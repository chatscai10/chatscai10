// js/admin-sales.js - 管理員營收紀錄查詢功能

'use strict';

// --- 模組內變數 ---
let salesDb = null;
let salesCurrentUser = null;
let availableStores = [];

/**
 * 載入營收紀錄區塊
 * @param {HTMLElement} sectionContainer - #section-sales 元素
 * @param {firebase.firestore.Firestore} db - Firestore 實例
 * @param {Object} user - 當前登入的用戶
 */
async function loadSalesSection(sectionContainer, db, user) {
    console.log("Loading Sales Records Section...");
    
    // 儲存參數為模組變數
    salesDb = db;
    salesCurrentUser = user;
    
    // 獲取DOM元素
    const salesContainer = sectionContainer.querySelector('#sales-table-container');
    const startDateInput = sectionContainer.querySelector('#sales-filter-start');
    const endDateInput = sectionContainer.querySelector('#sales-filter-end');
    const storeSelect = sectionContainer.querySelector('#sales-filter-store');
    const searchButton = sectionContainer.querySelector('#sales-filter-search');
    const exportButton = sectionContainer.querySelector('#export-sales-btn');
    
    if (!salesContainer || !startDateInput || !endDateInput || !storeSelect || !searchButton) {
        console.error("Missing required elements in Sales section");
        return;
    }
    
    // 設置預設日期 (當月)
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    startDateInput.value = formatDateForInput(firstDayOfMonth);
    endDateInput.value = formatDateForInput(today);
    
    // 載入分店列表
    try {
        const storeList = await loadStoreList(db);
        availableStores = storeList;
        
        // 填充分店下拉選單
        storeSelect.innerHTML = '<option value="">所有分店</option>';
        storeList.forEach(store => {
            const option = document.createElement('option');
            option.value = store;
            option.textContent = store;
            storeSelect.appendChild(option);
        });
        
        // 根據用戶權限預選分店
        if (user.roles?.level < 9 && user.roles?.store) {
            storeSelect.value = user.roles.store;
            storeSelect.disabled = true;
        }
    } catch (error) {
        console.error("Error loading store list:", error);
    }
    
    // 綁定搜尋按鈕
    searchButton.addEventListener('click', () => {
        fetchSalesRecords(startDateInput.value, endDateInput.value, storeSelect.value, salesContainer);
    });
    
    // 綁定導出按鈕
    if (exportButton) {
        exportButton.addEventListener('click', () => {
            exportSalesReport(startDateInput.value, endDateInput.value, storeSelect.value);
        });
    }
    
    // 初始加載數據
    fetchSalesRecords(startDateInput.value, endDateInput.value, storeSelect.value, salesContainer);
    
    // 標記區塊已載入
    if (typeof loadedSections !== 'undefined') {
        loadedSections.add('sales');
    }
    
    console.log("Sales Records Section loaded successfully");
}

/**
 * 從Firestore加載分店列表
 * @param {firebase.firestore.Firestore} db - Firestore 實例
 * @returns {Promise<Array>} 分店名稱陣列
 */
async function loadStoreList(db) {
    try {
        const doc = await db.collection('settings').doc('store_config').get();
        if (doc.exists && doc.data().storeListString) {
            return parseStoreListString(doc.data().storeListString);
        }
        return [];
    } catch (error) {
        console.error("Error fetching store list:", error);
        return [];
    }
}

/**
 * 解析分店列表字串
 * @param {string} storeListString - 設定中的分店列表字串
 * @returns {Array} 分店名稱陣列
 */
function parseStoreListString(storeListString) {
    if (!storeListString || typeof storeListString !== 'string') {
        return [];
    }
    
    const stores = new Set();
    const entries = storeListString.split(';');
    
    entries.forEach(entry => {
        entry = entry.trim();
        if (!entry) return;
        
        const eqIndex = entry.indexOf('=');
        let namePart = entry;
        
        if (eqIndex > 0) {
            namePart = entry.substring(0, eqIndex).trim();
        }
        
        if (namePart) {
            const storeName = namePart.replace(/\d+$/, '').trim();
            if (storeName) {
                stores.add(storeName);
            }
        }
    });
    
    return Array.from(stores);
}

/**
 * 格式化日期為輸入欄位使用的格式 (YYYY-MM-DD)
 * @param {Date} date - 日期對象
 * @returns {string} 格式化的日期字串
 */
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

/**
 * 從Firestore獲取營收紀錄
 * @param {string} startDate - 開始日期
 * @param {string} endDate - 結束日期
 * @param {string} store - 分店名稱 (可選)
 * @param {HTMLElement} container - 顯示結果的容器
 */
async function fetchSalesRecords(startDate, endDate, store, container) {
    if (!container || !salesDb) return;
    
    container.innerHTML = '<div class="loading-placeholder">載入營收紀錄中...</div>';
    
    try {
        // 設置查詢條件
        let query = salesDb.collection('sales_records')
            .where('recordDate', '>=', startDate)
            .where('recordDate', '<=', endDate)
            .orderBy('recordDate', 'desc');
        
        // 如果指定了分店，添加篩選條件
        if (store) {
            query = query.where('store', '==', store);
        }
        
        // 執行查詢
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            container.innerHTML = '<div class="alert alert-info">沒有找到符合條件的營收紀錄</div>';
            return;
        }
        
        // 創建表格
        const table = document.createElement('table');
        table.className = 'table table-striped table-bordered data-table';
        
        // 創建表頭
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>日期</th>
                <th>分店</th>
                <th>總收入</th>
                <th>總支出</th>
                <th>淨利</th>
                <th>訂單編號</th>
                <th>登錄人</th>
                <th>操作</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // 創建表格主體
        const tbody = document.createElement('tbody');
        
        // 計算總計
        let totalIncome = 0;
        let totalExpense = 0;
        
        // 遍歷紀錄
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // 計算該條記錄的總收入和總支出
            let income = 0;
            let expense = 0;
            
            // 遍歷所有字段
            Object.entries(data).forEach(([key, value]) => {
                // 依據字段名前綴判斷類型
                if (key.startsWith('income_') && typeof value === 'number') {
                    income += value;
                } else if (key.startsWith('expense_') && typeof value === 'number') {
                    expense += value;
                }
            });
            
            // 添加到總計
            totalIncome += income;
            totalExpense += expense;
            
            // 計算淨利
            const profit = income - expense;
            
            // 創建行
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${data.recordDate || '未知'}</td>
                <td>${data.store || '未知'}</td>
                <td class="text-right">${formatCurrency(income)}</td>
                <td class="text-right">${formatCurrency(expense)}</td>
                <td class="text-right ${profit >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(profit)}</td>
                <td>${data.orderNumber || ''}</td>
                <td>${data.employeeName || ''}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-details-btn" data-id="${doc.id}">查看</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        
        // 創建表尾 (總計)
        const tfoot = document.createElement('tfoot');
        tfoot.innerHTML = `
            <tr class="font-weight-bold">
                <td colspan="2">總計</td>
                <td class="text-right">${formatCurrency(totalIncome)}</td>
                <td class="text-right">${formatCurrency(totalExpense)}</td>
                <td class="text-right ${totalIncome - totalExpense >= 0 ? 'text-success' : 'text-danger'}">
                    ${formatCurrency(totalIncome - totalExpense)}
                </td>
                <td colspan="3"></td>
            </tr>
        `;
        table.appendChild(tfoot);
        
        // 顯示表格
        container.innerHTML = '';
        container.appendChild(table);
        
        // 綁定查看詳情按鈕
        const viewButtons = container.querySelectorAll('.view-details-btn');
        viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                const recordId = button.dataset.id;
                viewSalesDetails(recordId);
            });
        });
        
    } catch (error) {
        console.error("Error fetching sales records:", error);
        container.innerHTML = `<div class="alert alert-danger">載入營收紀錄失敗: ${error.message}</div>`;
    }
}

/**
 * 格式化金額為貨幣格式
 * @param {number} amount - 金額
 * @returns {string} 格式化的金額字串
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('zh-TW', {
        style: 'currency',
        currency: 'TWD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * 查看營收紀錄詳情
 * @param {string} recordId - 紀錄ID
 */
async function viewSalesDetails(recordId) {
    if (!salesDb) return;
    
    try {
        const doc = await salesDb.collection('sales_records').doc(recordId).get();
        
        if (!doc.exists) {
            alert('找不到這筆營收紀錄');
            return;
        }
        
        const data = doc.data();
        
        // 創建詳情內容
        let detailsHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">營收紀錄詳情 (${data.recordDate})</h5>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>分店:</strong> ${data.store || '未知'}</p>
                            <p><strong>日期:</strong> ${data.recordDate || '未知'}</p>
                            <p><strong>訂單編號:</strong> ${data.orderNumber || ''}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>登錄人:</strong> ${data.employeeName || ''}</p>
                            <p><strong>登錄時間:</strong> ${data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString() : '未知'}</p>
                        </div>
                    </div>
                    
                    <hr>
                    <h6>收入項目</h6>
                    <table class="table table-sm table-bordered">
                        <thead>
                            <tr>
                                <th>項目</th>
                                <th>金額</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        // 添加收入項目
        let totalIncome = 0;
        let hasIncomeItems = false;
        
        Object.entries(data).forEach(([key, value]) => {
            if (key.startsWith('income_') && typeof value === 'number') {
                hasIncomeItems = true;
                totalIncome += value;
                
                // 從字段名提取項目名稱
                const itemName = key.replace('income_', '').replace(/_/g, ' ');
                
                detailsHTML += `
                    <tr>
                        <td>${itemName}</td>
                        <td class="text-right">${formatCurrency(value)}</td>
                    </tr>
                `;
            }
        });
        
        if (!hasIncomeItems) {
            detailsHTML += `<tr><td colspan="2" class="text-center">無收入項目</td></tr>`;
        } else {
            detailsHTML += `
                <tr class="font-weight-bold">
                    <td>總收入</td>
                    <td class="text-right">${formatCurrency(totalIncome)}</td>
                </tr>
            `;
        }
        
        detailsHTML += `
                        </tbody>
                    </table>
                    
                    <h6>支出項目</h6>
                    <table class="table table-sm table-bordered">
                        <thead>
                            <tr>
                                <th>項目</th>
                                <th>金額</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        // 添加支出項目
        let totalExpense = 0;
        let hasExpenseItems = false;
        
        Object.entries(data).forEach(([key, value]) => {
            if (key.startsWith('expense_') && typeof value === 'number') {
                hasExpenseItems = true;
                totalExpense += value;
                
                // 從字段名提取項目名稱
                const itemName = key.replace('expense_', '').replace(/_/g, ' ');
                
                detailsHTML += `
                    <tr>
                        <td>${itemName}</td>
                        <td class="text-right">${formatCurrency(value)}</td>
                    </tr>
                `;
            }
        });
        
        // 其他支出
        if (data.other_expense) {
            hasExpenseItems = true;
            detailsHTML += `
                <tr>
                    <td>其他支出 (備註)</td>
                    <td>${data.other_expense}</td>
                </tr>
            `;
        }
        
        if (!hasExpenseItems) {
            detailsHTML += `<tr><td colspan="2" class="text-center">無支出項目</td></tr>`;
        } else {
            detailsHTML += `
                <tr class="font-weight-bold">
                    <td>總支出</td>
                    <td class="text-right">${formatCurrency(totalExpense)}</td>
                </tr>
            `;
        }
        
        // 淨利
        const profit = totalIncome - totalExpense;
        
        detailsHTML += `
                        </tbody>
                    </table>
                    
                    <div class="row mt-3">
                        <div class="col-md-12">
                            <div class="alert alert-${profit >= 0 ? 'success' : 'danger'}">
                                <strong>淨利: ${formatCurrency(profit)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary close-modal-btn">關閉</button>
                </div>
            </div>
        `;
        
        // 創建模態框
        const modal = document.createElement('div');
        modal.id = 'sales-details-modal';
        modal.className = 'modal';
        modal.innerHTML = detailsHTML;
        
        // 添加到頁面
        document.body.appendChild(modal);
        
        // 顯示模態框
        modal.style.display = 'flex';
        
        // 綁定關閉按鈕
        const closeButtons = modal.querySelectorAll('.close-btn, .close-modal-btn');
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                modal.style.display = 'none';
                document.body.removeChild(modal);
            });
        });
        
        // 點擊模態框外部關閉
        modal.addEventListener('click', event => {
            if (event.target === modal) {
                modal.style.display = 'none';
                document.body.removeChild(modal);
            }
        });
        
    } catch (error) {
        console.error("Error viewing sales details:", error);
        alert(`無法載入詳情: ${error.message}`);
    }
}

/**
 * 匯出營收報表為CSV
 * @param {string} startDate - 開始日期
 * @param {string} endDate - 結束日期
 * @param {string} store - 分店名稱 (可選)
 */
async function exportSalesReport(startDate, endDate, store) {
    if (!salesDb) return;
    
    try {
        // 設置查詢條件
        let query = salesDb.collection('sales_records')
            .where('recordDate', '>=', startDate)
            .where('recordDate', '<=', endDate)
            .orderBy('recordDate', 'desc');
        
        // 如果指定了分店，添加篩選條件
        if (store) {
            query = query.where('store', '==', store);
        }
        
        // 執行查詢
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            alert('沒有找到符合條件的營收紀錄');
            return;
        }
        
        // 準備CSV標頭
        let csvContent = '日期,分店,總收入,總支出,淨利,訂單編號,登錄人\n';
        
        // 遍歷紀錄
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // 計算該條記錄的總收入和總支出
            let income = 0;
            let expense = 0;
            
            // 遍歷所有字段
            Object.entries(data).forEach(([key, value]) => {
                // 依據字段名前綴判斷類型
                if (key.startsWith('income_') && typeof value === 'number') {
                    income += value;
                } else if (key.startsWith('expense_') && typeof value === 'number') {
                    expense += value;
                }
            });
            
            // 計算淨利
            const profit = income - expense;
            
            // 添加到CSV
            csvContent += `${data.recordDate || ''},${data.store || ''},${income},${expense},${profit},${data.orderNumber || ''},${data.employeeName || ''}\n`;
        });
        
        // 創建下載連結
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `營收紀錄_${startDate}_${endDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (error) {
        console.error("Error exporting sales report:", error);
        alert(`匯出報表失敗: ${error.message}`);
    }
}

// 在 admin-logic.js 的 loadSectionContent 函數中加入:
/*
case 'sales':
    if (typeof loadSalesSection === 'function') {
        loadSalesSection(sectionContainer, db, user);
    } else {
        console.error('loadSalesSection function not found.');
        actualContentContainer.innerHTML = '<p class="text-danger">無法載入營收紀錄功能</p>';
    }
    break;
*/

console.log("admin-sales.js loaded"); 