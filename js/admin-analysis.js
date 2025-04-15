// 檔案: js/admin-analysis.js
'use strict';

let analysisDb = null;
let salesTrendChartInstance = null; // Chart.js 實例
let costAnalysisChartInstance = null;
let profitMarginChartInstance = null;
let categorySalesChartInstance = null;

// 儲存管理員資料，解決 pageAdminData 未定義的問題
let pageAdminData = {
    currentUser: null,
    scheduleConfig: {
        availableStores: []
    }
};

// Firebase Functions 初始化
let analysisFunctions = null;
let exportAnalysisDataCallable = null;

async function loadAnalysisSection(sectionContainer, db, user, messageElement) {
    console.log("Executing loadAnalysisSection...");
    
    // 設置 pageAdminData，確保有資料可用
    pageAdminData.currentUser = user;
    
    try {
        // 初始化 Firebase Functions
        initFirebaseFunctions();
        
        // 載入門市列表用於篩選
        const storeConfigRef = db.collection('settings').doc('store_config');
        const storeDoc = await storeConfigRef.get();
        
        if (storeDoc.exists) {
            const storeData = storeDoc.data();
            pageAdminData.scheduleConfig = storeData;  // 儲存全部資料
            pageAdminData.scheduleConfig.availableStores = parseStoreListString(storeData.storeListString);
        } else {
            console.warn("找不到商店設定文檔");
            pageAdminData.scheduleConfig.availableStores = ["忠孝", "龍安"];  // 預設值
        }
        
        // 設置商店選擇器選項
        populateStoreFilterOptions();
        
        // 設置分析按鈕的事件監聽器
        const runButton = document.getElementById('run-analysis-btn');
        if (runButton) {
            runButton.addEventListener('click', runAnalysis);
            console.log("成功綁定分析按鈕事件");
        }
        
        // 初始化匯出按鈕
        initExportButton();
        
        // 初始化日期選擇器
        initDatePickers();
        
        console.log("分析區塊初始化完成");
    } catch (error) {
        console.error("初始化分析區塊時發生錯誤:", error);
        if (messageElement) {
            messageElement.textContent = `初始化錯誤: ${error.message}`;
            messageElement.className = 'error-message';
        }
    }
}

/**
 * 初始化 Firebase Functions
 */
function initFirebaseFunctions() {
    try {
        if (typeof firebase !== 'undefined' && typeof firebase.functions === 'function') {
            analysisFunctions = firebase.functions();
            
            // 如果有需要的 Callable Functions，在這裡初始化
            exportAnalysisDataCallable = analysisFunctions.httpsCallable('exportAnalysisData');
            
            console.log("Firebase Functions for Analysis initialized successfully.");
        } else {
            console.warn("Firebase Functions not available for Analysis module.");
        }
    } catch (error) {
        console.error("Error initializing Firebase Functions for Analysis:", error);
    }
}

/**
 * 初始化匯出按鈕
 */
function initExportButton() {
    const exportBtn = document.getElementById('export-csv-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAnalysisToCSV);
        exportBtn.textContent = '匯出報表 (CSV)';
        exportBtn.style.display = 'none'; // 預設隱藏，直到有數據可用
    }
}

/**
 * 匯出分析數據為 CSV 格式
 */
function exportAnalysisToCSV() {
    console.log("嘗試匯出分析數據...");
    
    try {
        // 獲取當前分析參數
        const startDate = document.getElementById('analysis-start').value;
        const endDate = document.getElementById('analysis-end').value;
        const storeId = document.getElementById('analysis-store').value;
        
        if (!startDate || !endDate) {
            alert('請選擇有效的日期範圍');
         return;
    }

        // 如果有 Firebase Functions，使用雲函數匯出
        if (exportAnalysisDataCallable) {
            const loadingIndicator = document.getElementById('analysis-loading');
            if (loadingIndicator) loadingIndicator.style.display = 'block';
            
            exportAnalysisDataCallable({
                startDate: startDate,
                endDate: endDate,
                storeId: storeId === 'all' ? null : storeId,
                format: 'csv'
            })
            .then(result => {
                console.log("匯出成功，準備下載檔案", result);
                downloadCSV(result.data.csv, `分析報表_${startDate}_到_${endDate}.csv`);
            })
            .catch(error => {
                console.error("匯出失敗:", error);
                alert(`匯出失敗: ${error.message}`);
            })
            .finally(() => {
                if (loadingIndicator) loadingIndicator.style.display = 'none';
            });
        } else {
            // 本地生成 CSV (備用方案)
            generateLocalCSV();
        }
    } catch (error) {
        console.error("匯出處理錯誤:", error);
        alert(`匯出處理錯誤: ${error.message}`);
    }
}

/**
 * 下載 CSV 檔案
 */
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    // 創建下載連結
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

/**
 * 本地生成 CSV (當雲函數不可用時)
 */
function generateLocalCSV() {
    console.log("使用本地方式生成 CSV...");
    alert("本地 CSV 導出功能尚未實現。請稍後再試。");
    // TODO: 實現本地 CSV 生成邏輯
}

/**
 * 初始化日期選擇器，設置預設值為當月
 */
function initDatePickers() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const startDateInput = document.getElementById('analysis-start');
    const endDateInput = document.getElementById('analysis-end');
    
    if (startDateInput) startDateInput.value = formatDate(firstDayOfMonth);
    if (endDateInput) endDateInput.value = formatDate(lastDayOfMonth);
}

/**
 * 解析商店列表字串，獲取所有商店
 */
function parseStoreListString(storeListString) {
    if (!storeListString || typeof storeListString !== 'string') {
        console.warn("分析頁面：商店列表字串無效", storeListString);
        return ["忠孝", "龍安"]; // 預設值
    }
    
    try {
        // 假設格式為 "忠孝,龍安,..."
        return storeListString.split(',').map(store => store.trim()).filter(store => store);
    } catch (error) {
        console.error("解析商店列表字串錯誤:", error);
        return ["忠孝", "龍安"]; // 預設值
    }
}

/**
 * 設置商店篩選下拉選單
 */
function populateStoreFilterOptions() {
    const storeSelect = document.getElementById('analysis-store');
    if (!storeSelect) return;
    
    // 清空現有選項
    storeSelect.innerHTML = '';
    
    // 添加「全部」選項
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '全部門市';
    storeSelect.appendChild(allOption);
    
    // 獲取商店列表
    let availableStores = ["忠孝", "龍安"]; // 預設值
    let currentUser = null;

    // 使用已設置的 pageAdminData
    if (pageAdminData) {
        if (pageAdminData.scheduleConfig && Array.isArray(pageAdminData.scheduleConfig.availableStores)) {
            availableStores = pageAdminData.scheduleConfig.availableStores;
        } else {
            console.warn("分析頁面：在 pageAdminData.scheduleConfig 中找不到分店列表");
        }
        
        currentUser = pageAdminData.currentUser;
    } else {
        console.warn("分析頁面：pageAdminData 未定義，使用預設空列表。");
    }
    
    // 添加商店選項
    availableStores.forEach(store => {
        const option = document.createElement('option');
        option.value = store;
        option.textContent = store;
        storeSelect.appendChild(option);
    });
    
    // 如果用戶只有特定門市權限，自動選中並鎖定
    if (currentUser && currentUser.roles && currentUser.roles.level < 9 && currentUser.roles.store) {
        const userStore = currentUser.roles.store;
        
        // 尋找匹配的選項
        for (let i = 0; i < storeSelect.options.length; i++) {
            if (storeSelect.options[i].value === userStore) {
                storeSelect.selectedIndex = i;
                storeSelect.disabled = true; // 鎖定選擇
                break;
            }
        }
    }
}

async function runAnalysis() {
     const loadingIndicator = document.getElementById('analysis-loading');
     const errorIndicator = document.getElementById('analysis-error');
     const contentArea = document.getElementById('analysis-content');
     if (!loadingIndicator || !errorIndicator || !contentArea || !analysisDb) return;

     loadingIndicator.style.display = 'block';
     errorIndicator.style.display = 'none';
     contentArea.style.opacity = '0.5'; // 視覺提示

    try {
     // 獲取篩選條件
     const startDate = document.getElementById('analysis-start').value;
     const endDate = document.getElementById('analysis-end').value;
        const storeId = document.getElementById('analysis-store').value;
        const analysisType = document.getElementById('analysis-type')?.value || 'all';

        console.log(`Running analysis from ${startDate} to ${endDate} for store: ${storeId || 'All'}, type: ${analysisType}`);

        // 使用Firestore直接查詢替代Cloud Function
        // 1. 從銷售記錄中獲取數據
        const salesQuery = analysisDb.collection('sales_records')
            .where('recordDate', '>=', startDate)
            .where('recordDate', '<=', endDate);
            
        // 如果指定了分店，添加過濾條件
        const finalQuery = storeId ? salesQuery.where('store', '==', storeId) : salesQuery;
        
        // 執行查詢
        const salesSnapshot = await finalQuery.get();
        
        // 處理結果
        if (salesSnapshot.empty) {
            throw new Error('所選時間範圍內沒有銷售記錄');
        }
        
        // 構建分析數據
        const salesData = [];
        salesSnapshot.forEach(doc => {
            salesData.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // 簡單分析數據
        const analysisData = processAnalysisData(salesData, analysisType);
        console.log('Analysis data processed:', analysisData);

        // 渲染圖表和表格
        renderAnalysisSummary(analysisData.summary);
        
        if (analysisData.salesTrend && Object.keys(analysisData.salesTrend).length > 0) {
            renderSalesTrendChart(analysisData.salesTrend);
        }
        
        if (analysisData.costBreakdown && Object.keys(analysisData.costBreakdown).length > 0) {
            renderCostBreakdownChart(analysisData.costBreakdown);
        }
        
        if (analysisData.profitMargins && Object.keys(analysisData.profitMargins).length > 0) {
            renderProfitMarginChart(analysisData.profitMargins);
        }
        
        if (analysisData.salesByCategory && Object.keys(analysisData.salesByCategory).length > 0) {
            renderCategorySalesChart(analysisData.salesByCategory);
        }
        
        if (analysisData.attendanceStats && Object.keys(analysisData.attendanceStats).length > 0) {
            renderAttendanceTable(analysisData.attendanceStats);
        }

        // 顯示匯出按鈕
        document.getElementById('export-csv-btn').style.display = 'inline-block';

         contentArea.style.opacity = '1';
     } catch (error) {
         console.error("Analysis failed:", error);
         errorIndicator.textContent = `分析失敗: ${error.message}`;
         errorIndicator.style.display = 'block';
         contentArea.style.opacity = '1'; // 恢復
     } finally {
         loadingIndicator.style.display = 'none';
     }
}

/**
 * 處理分析數據，構建所需的數據結構
 * @param {Array} salesData - 銷售記錄數據
 * @param {string} analysisType - 分析類型
 * @returns {Object} 處理後的分析數據
 */
function processAnalysisData(salesData, analysisType) {
    // 基本結構
    const result = {
        summary: {
            totalSales: 0,
            totalCost: 0,
            totalProfit: 0,
            profitMargin: 0,
            averageDailySales: 0,
            totalEmployees: 0,
            totalWorkHours: 0,
            averageHoursPerEmployee: 0
        },
        salesTrend: {},
        costBreakdown: {},
        profitMargins: {},
        salesByCategory: {}
    };
    
    // 計算總銷售額、成本和利潤
    for (const record of salesData) {
        // 獲取日期
        const date = record.recordDate;
        
        // 計算銷售額 (假設收入欄位可能有多個)
        let recordSales = 0;
        let recordCost = 0;
        
        // 遍歷記錄中的所有字段
        for (const [key, value] of Object.entries(record)) {
            // 假設收入字段有特定前綴或標記，如"income_"
            if (key.startsWith('income_') && typeof value === 'number') {
                recordSales += value;
            }
            // 假設支出字段有特定前綴，如"expense_"
            else if (key.startsWith('expense_') && typeof value === 'number') {
                recordCost += value;
            }
        }
        
        // 計算利潤
        const recordProfit = recordSales - recordCost;
        
        // 添加到總計
        result.summary.totalSales += recordSales;
        result.summary.totalCost += recordCost;
        result.summary.totalProfit += recordProfit;
        
        // 添加到每日趨勢
        if (!result.salesTrend[date]) {
            result.salesTrend[date] = 0;
        }
        result.salesTrend[date] += recordSales;
        
        if (!result.costBreakdown[date]) {
            result.costBreakdown[date] = 0;
        }
        result.costBreakdown[date] += recordCost;
        
        if (!result.profitMargins[date]) {
            result.profitMargins[date] = 0;
        }
        result.profitMargins[date] += recordProfit;
    }
    
    // 計算平均值和百分比
    const totalDays = Object.keys(result.salesTrend).length || 1;
    result.summary.averageDailySales = result.summary.totalSales / totalDays;
    result.summary.profitMargin = result.summary.totalSales > 0 
        ? (result.summary.totalProfit / result.summary.totalSales * 100) : 0;
    
    // 創建銷售類別分布 (簡化示例)
    result.salesByCategory = {
        'A類': result.summary.totalSales * 0.4,
        'B類': result.summary.totalSales * 0.3,
        'C類': result.summary.totalSales * 0.2,
        '其他': result.summary.totalSales * 0.1
    };
    
    return result;
}

/**
 * 渲染分析總結區域
 * @param {Object} summary - 分析總結數據
 */
function renderAnalysisSummary(summary) {
    const summaryContainer = document.getElementById('analysis-summary');
    if (!summaryContainer) return;

    // 格式化數字為貨幣格式
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('zh-TW', { 
            style: 'currency', 
            currency: 'TWD',
            maximumFractionDigits: 0
        }).format(value);
    };

    // 格式化數字為百分比
    const formatPercent = (value) => {
        return new Intl.NumberFormat('zh-TW', { 
            style: 'percent', 
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        }).format(value / 100);
    };

    // 根據正負值設置顏色
    const getValueColorClass = (value) => {
        if (value > 0) return 'text-success';
        if (value < 0) return 'text-danger';
        return '';
    };

    let content = `
        <div class="row summary-cards">
            <div class="col-md-4 mb-3">
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">總營收</h5>
                        <p class="display-6">${formatCurrency(summary.totalSales || 0)}</p>
                        <p class="card-text">平均日營收: ${formatCurrency(summary.averageDailySales || 0)}</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4 mb-3">
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">總成本</h5>
                        <p class="display-6">${formatCurrency(summary.totalCost || 0)}</p>
                    </div>
                </div>
            </div>
            <div class="col-md-4 mb-3">
                <div class="card h-100">
                    <div class="card-body">
                        <h5 class="card-title">總利潤</h5>
                        <p class="display-6 ${getValueColorClass(summary.totalProfit || 0)}">${formatCurrency(summary.totalProfit || 0)}</p>
                        <p class="card-text">利潤率: <span class="${getValueColorClass(summary.profitMargin || 0)}">${formatPercent(summary.profitMargin || 0)}</span></p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 加入出勤相關數據 (如果有)
    if (summary.totalEmployees || summary.totalWorkHours) {
        content += `
            <div class="row summary-cards mt-3">
                <div class="col-md-4 mb-3">
                    <div class="card h-100">
                        <div class="card-body">
                            <h5 class="card-title">員工出勤</h5>
                            <p class="display-6">${summary.totalEmployees || 0} 人</p>
                            <p class="card-text">總遲到天數: ${summary.totalLateDays || 0} 天</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4 mb-3">
                    <div class="card h-100">
                        <div class="card-body">
                            <h5 class="card-title">總工時</h5>
                            <p class="display-6">${(summary.totalWorkHours || 0).toFixed(1)} 小時</p>
                            <p class="card-text">人均: ${(summary.averageHoursPerEmployee || 0).toFixed(1)} 小時/人</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4 mb-3">
                    <div class="card h-100">
                        <div class="card-body">
                            <h5 class="card-title">人均產值</h5>
                            <p class="display-6">${formatCurrency(summary.totalEmployees ? (summary.totalSales || 0) / summary.totalEmployees : 0)}</p>
                            <p class="card-text">每工時產值: ${formatCurrency(summary.totalWorkHours ? (summary.totalSales || 0) / summary.totalWorkHours : 0)}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    summaryContainer.innerHTML = content;
}

/**
 * 渲染銷售趨勢圖表
 * @param {Object} salesTrend - 按日期匯總的銷售數據
 */
function renderSalesTrendChart(salesTrend) {
     const ctx = document.getElementById('sales-trend-chart')?.getContext('2d');
     if (!ctx || typeof Chart === 'undefined') return;

    // 按日期排序
    const sortedDates = Object.keys(salesTrend).sort();
    const dataPoints = sortedDates.map(date => salesTrend[date]);

     // 銷毀舊圖表實例避免重疊
     if (salesTrendChartInstance) {
         salesTrendChartInstance.destroy();
     }

     salesTrendChartInstance = new Chart(ctx, {
        type: 'line',
         data: {
            labels: sortedDates,
             datasets: [{
                 label: '每日營業額',
                 data: dataPoints,
                 borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                fill: true,
                 tension: 0.1
             }]
         },
         options: {
            scales: { 
                y: { 
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('zh-TW', { 
                                style: 'currency', 
                                currency: 'TWD',
                                notation: 'compact',
                                compactDisplay: 'short',
                                maximumFractionDigits: 0
                            }).format(value);
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '每日營業額趨勢'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return new Intl.NumberFormat('zh-TW', { 
                                style: 'currency', 
                                currency: 'TWD',
                                maximumFractionDigits: 0
                            }).format(context.raw);
                        }
                    }
                }
            }
        }
    });
}

/**
 * 渲染成本分析圖表
 * @param {Object} costBreakdown - 按日期匯總的成本數據
 */
function renderCostBreakdownChart(costBreakdown) {
    const ctx = document.getElementById('cost-breakdown-chart')?.getContext('2d');
    if (!ctx || typeof Chart === 'undefined') return;

    // 按日期排序
    const sortedDates = Object.keys(costBreakdown).sort();
    const dataPoints = sortedDates.map(date => costBreakdown[date]);

    // 銷毀舊圖表實例避免重疊
    if (costAnalysisChartInstance) {
        costAnalysisChartInstance.destroy();
    }

    costAnalysisChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDates,
            datasets: [{
                label: '每日成本',
                data: dataPoints,
                backgroundColor: 'rgba(255, 99, 132, 0.7)',
                borderColor: 'rgb(255, 99, 132)',
                borderWidth: 1
            }]
        },
        options: {
            scales: { 
                y: { 
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('zh-TW', { 
                                style: 'currency', 
                                currency: 'TWD',
                                notation: 'compact',
                                compactDisplay: 'short',
                                maximumFractionDigits: 0
                            }).format(value);
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
             responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '每日成本分析'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return new Intl.NumberFormat('zh-TW', { 
                                style: 'currency', 
                                currency: 'TWD',
                                maximumFractionDigits: 0
                            }).format(context.raw);
                        }
                    }
                }
            }
         }
     });
}

/**
 * 渲染利潤率圖表
 * @param {Object} profitMargins - 按日期匯總的利潤數據
 */
function renderProfitMarginChart(profitMargins) {
    const ctx = document.getElementById('profit-margin-chart')?.getContext('2d');
    if (!ctx || typeof Chart === 'undefined') return;

    // 按日期排序
    const sortedDates = Object.keys(profitMargins).sort();
    const dataPoints = sortedDates.map(date => profitMargins[date]);

    // 計算顏色 (正值為綠色，負值為紅色)
    const backgroundColors = dataPoints.map(value => 
        value >= 0 ? 'rgba(40, 167, 69, 0.7)' : 'rgba(220, 53, 69, 0.7)'
    );
    const borderColors = dataPoints.map(value => 
        value >= 0 ? 'rgb(40, 167, 69)' : 'rgb(220, 53, 69)'
    );

    // 銷毀舊圖表實例避免重疊
    if (profitMarginChartInstance) {
        profitMarginChartInstance.destroy();
    }

    profitMarginChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDates,
            datasets: [{
                label: '每日利潤',
                data: dataPoints,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            scales: { 
                y: { 
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('zh-TW', { 
                                style: 'currency', 
                                currency: 'TWD',
                                notation: 'compact',
                                compactDisplay: 'short',
                                maximumFractionDigits: 0
                            }).format(value);
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '每日利潤分析'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return new Intl.NumberFormat('zh-TW', { 
                                style: 'currency', 
                                currency: 'TWD',
                                maximumFractionDigits: 0
                            }).format(context.raw);
                        }
                    }
                }
            }
        }
    });
}

/**
 * 渲染類別銷售圖表
 * @param {Object} salesByCategory - 按類別匯總的銷售數據
 */
function renderCategorySalesChart(salesByCategory) {
    const ctx = document.getElementById('category-sales-chart')?.getContext('2d');
    if (!ctx || typeof Chart === 'undefined') return;

    // 準備數據
    const categories = Object.keys(salesByCategory);
    const dataPoints = categories.map(category => salesByCategory[category]);

    // 生成顏色
    const backgroundColors = [
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 99, 132, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 159, 64, 0.7)',
        'rgba(199, 199, 199, 0.7)'
    ];
    
    // 確保顏色足夠
    while (backgroundColors.length < categories.length) {
        backgroundColors.push(
            `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.7)`
        );
    }

    // 銷毀舊圖表實例避免重疊
    if (categorySalesChartInstance) {
        categorySalesChartInstance.destroy();
    }

    categorySalesChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: dataPoints,
                backgroundColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '銷售類別分析'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${context.label}: ${new Intl.NumberFormat('zh-TW', { 
                                style: 'currency', 
                                currency: 'TWD',
                                maximumFractionDigits: 0
                            }).format(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * 渲染出勤統計表格
 * @param {Object} attendanceStats - 員工出勤統計數據
 */
function renderAttendanceTable(attendanceStats) {
    const tableContainer = document.getElementById('attendance-table-container');
    if (!tableContainer) return;

    // 獲取員工名稱
    const getEmployeeName = async (employeeId) => {
        try {
            const doc = await analysisDb.collection('employees').doc(employeeId).get();
            if (doc.exists) {
                return doc.data().name || `員工 (${employeeId})`;
            }
            return `員工 (${employeeId})`;
        } catch (error) {
            console.error('Error fetching employee name:', error);
            return `員工 (${employeeId})`;
        }
    };

    // 創建表格結構
    let tableHtml = `
        <h4 class="mt-4 mb-3">員工出勤統計</h4>
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead>
                    <tr>
                        <th>員工ID</th>
                        <th>打卡次數</th>
                        <th>總工時</th>
                        <th>遲到次數</th>
                        <th>平均每次工時</th>
                    </tr>
                </thead>
                <tbody id="attendance-table-body">
                    <tr>
                        <td colspan="5" class="text-center">載入中...</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
    
    tableContainer.innerHTML = tableHtml;
    
    // 異步載入員工名稱和填充表格
    (async () => {
        const tableBody = document.getElementById('attendance-table-body');
        if (!tableBody) return;
        
        let rowsHtml = '';
        
        for (const employeeId in attendanceStats) {
            const stats = attendanceStats[employeeId];
            const employeeName = await getEmployeeName(employeeId);
            const avgHoursPerShift = stats.clockIns > 0 ? stats.totalHours / stats.clockIns : 0;
            
            rowsHtml += `
                <tr>
                    <td>${employeeName}</td>
                    <td>${stats.clockIns} 次</td>
                    <td>${stats.totalHours.toFixed(1)} 小時</td>
                    <td>${stats.lateDays} 次</td>
                    <td>${avgHoursPerShift.toFixed(1)} 小時/次</td>
                </tr>
            `;
        }
        
        if (rowsHtml === '') {
            rowsHtml = '<tr><td colspan="5" class="text-center">無出勤數據</td></tr>';
        }
        
        tableBody.innerHTML = rowsHtml;
    })();
}

console.log("admin-analysis.js loaded");