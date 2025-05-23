// 薪資統計報表邏輯

'use strict';

/**
 * 薪資統計報表 - 管理員視角
 * 提供薪資資料的統計分析、趨勢檢視和數據可視化
 */

// === 全局變數 ===
let statsDb = null;
let statsCurrentUser = null;
let allEmployees = [];
let allStores = [];
let currentPayrollData = [];
let previousPayrollData = [];
let currentDateRange = {
    type: 'month',
    start: null,
    end: null,
    label: ''
};
let paginationSettings = {
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1
};

/**
 * 薪資統計報表類別
 * 處理薪資數據的獲取、分析和可視化
 */
class SalaryStats {
    /**
     * 建立薪資統計報表實例
     * @param {Object} db - Firestore實例
     */
    constructor(db) {
        this.db = db;
        this.currentPayrollData = [];
        this.previousPayrollData = [];
        this.employeesData = [];
        this.distributionView = 'histogram'; // 'histogram' 或 'boxplot'
        this.filteredDetailsData = [];
        
        // 初始化圖表實例
        this.distributionChart = null;
        this.trendChart = null;
        this.breakdownChart = null;
        
        console.log("薪資統計實例已創建");
    }
    
    /**
     * 獲取薪資數據
     * @param {Date} startDate - 起始日期
     * @param {Date} endDate - 結束日期
     * @param {string} storeId - 分店ID，'all'表示所有分店
     * @param {string} employeeLevel - 員工級別，'all'表示所有級別
     */
    async fetchPayrollData(startDate, endDate, storeId, employeeLevel) {
        try {
            console.log(`獲取薪資數據: ${startDate.toISOString()} - ${endDate.toISOString()}, 分店: ${storeId}, 級別: ${employeeLevel}`);
            
            // 顯示載入中狀態
            showMessage("正在獲取薪資數據...", "info");
            
            // 獲取有效員工列表
            await this.fetchEmployeesData();
            
            // 構建薪資查詢
            let query = this.db.collection('payroll')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate);
                
            // 應用分店過濾
            if (storeId !== 'all') {
                query = query.where('storeId', '==', storeId);
            }
            
            // 獲取薪資數據
            const payrollSnapshot = await query.get();
            
            // 清空當前數據
            this.currentPayrollData = [];
            
            // 處理查詢結果
            payrollSnapshot.forEach(doc => {
                const payrollData = {
                    id: doc.id,
                    ...doc.data(),
                    // 確保數值字段類型正確
                    baseSalary: Number(doc.data().baseSalary || 0),
                    overtimePay: Number(doc.data().overtimePay || 0),
                    bonusTotal: Number(doc.data().bonusTotal || 0),
                    deductions: Number(doc.data().deductions || 0),
                    finalPay: Number(doc.data().finalPay || 0)
                };
                
                // 如果實例中沒有timestamp，使用伺服器時間戳
                if (!payrollData.timestamp) {
                    payrollData.timestamp = new Date();
                }
                
                // 應用員工級別過濾
                const employee = this.employeesData.find(e => e.id === payrollData.employeeId);
                const level = employee?.level || 0;
                
                if (employeeLevel === 'all' || 
                    (employeeLevel === '1' && level === 1) ||
                    (employeeLevel === '2' && level === 2) ||
                    (employeeLevel === '5' && level === 5) ||
                    (employeeLevel === '9' && level >= 9)) {
                    
                    // 添加員工名稱
                    payrollData.employeeName = employee?.name || '未知員工';
                    payrollData.employeeLevel = level;
                    
                    this.currentPayrollData.push(payrollData);
                }
            });
            
            console.log(`獲取了 ${this.currentPayrollData.length} 筆薪資記錄`);
            
            // 如果需要，獲取上一期數據進行比較
            // 計算上一期的日期範圍
            const dateDiff = endDate.getTime() - startDate.getTime();
            const prevStartDate = new Date(startDate.getTime() - dateDiff);
            const prevEndDate = new Date(startDate.getTime() - 1); // 上期結束日為本期開始日前一天
            
            await this.fetchPreviousPeriodData(prevStartDate, prevEndDate, storeId, employeeLevel);
            
            // 準備詳細數據顯示
            this.filteredDetailsData = [...this.currentPayrollData];
            
            // 更新過濾詳細數據顯示
            this.updatePagination();
            
            // 返回數據計數
            return this.currentPayrollData.length;
        } catch (error) {
            console.error("獲取薪資數據時出錯:", error);
            showMessage(`獲取薪資數據失敗: ${error.message}`, "error");
            return 0;
        }
    }
    
    /**
     * 獲取員工數據
     */
    async fetchEmployeesData() {
        try {
            // 獲取所有員工數據
            const employeesSnapshot = await this.db.collection('employees').get();
            
            // 清空現有數據
            this.employeesData = [];
            
            // 處理查詢結果
            employeesSnapshot.forEach(doc => {
                const employee = {
                    id: doc.id,
                    ...doc.data()
                };
                
                this.employeesData.push(employee);
            });
            
            console.log(`獲取了 ${this.employeesData.length} 名員工數據`);
            return this.employeesData.length;
        } catch (error) {
            console.error("獲取員工數據時出錯:", error);
            return 0;
        }
    }
    
    /**
     * 獲取上一期數據用於比較
     */
    async fetchPreviousPeriodData(startDate, endDate, storeId, employeeLevel) {
        try {
            console.log(`獲取上一期數據: ${startDate.toISOString()} - ${endDate.toISOString()}`);
            
            // 構建查詢
            let query = this.db.collection('payroll')
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate);
                
            // 應用分店過濾
            if (storeId !== 'all') {
                query = query.where('storeId', '==', storeId);
            }
            
            // 獲取數據
            const prevPayrollSnapshot = await query.get();
            
            // 清空現有數據
            this.previousPayrollData = [];
            
            // 處理查詢結果
            prevPayrollSnapshot.forEach(doc => {
                const payrollData = {
                    id: doc.id,
                    ...doc.data(),
                    // 確保數值字段類型正確
                    baseSalary: Number(doc.data().baseSalary || 0),
                    overtimePay: Number(doc.data().overtimePay || 0),
                    bonusTotal: Number(doc.data().bonusTotal || 0),
                    deductions: Number(doc.data().deductions || 0),
                    finalPay: Number(doc.data().finalPay || 0)
                };
                
                // 應用員工級別過濾
                const employee = this.employeesData.find(e => e.id === payrollData.employeeId);
                const level = employee?.level || 0;
                
                if (employeeLevel === 'all' || 
                    (employeeLevel === '1' && level === 1) ||
                    (employeeLevel === '2' && level === 2) ||
                    (employeeLevel === '5' && level === 5) ||
                    (employeeLevel === '9' && level >= 9)) {
                    
                    this.previousPayrollData.push(payrollData);
                }
            });
            
            console.log(`獲取了 ${this.previousPayrollData.length} 筆上一期薪資記錄`);
            return this.previousPayrollData.length;
        } catch (error) {
            console.error("獲取上一期數據時出錯:", error);
            return 0;
        }
    }
    
    /**
     * 渲染所有統計數據
     */
    renderAllStats() {
        // 渲染統計概覽
        this.renderStatsOverview();
        
        // 渲染各個圖表
        this.renderDistributionChart();
        this.renderTrendChart();
        this.renderBreakdownChart();
        
        // 渲染詳細數據表格
        this.renderDetailsTable();
    }
    
    /**
     * 渲染統計概覽
     */
    renderStatsOverview() {
        try {
            // 計算當前期間的總數據
            const totalPayroll = this.currentPayrollData.reduce((sum, item) => sum + item.finalPay, 0);
            const avgSalary = this.currentPayrollData.length > 0 ? 
                              totalPayroll / this.currentPayrollData.length : 0;
            const totalBonus = this.currentPayrollData.reduce((sum, item) => sum + (item.bonusTotal || 0), 0);
            const employeeCount = this.currentPayrollData.length;
            
            // 計算上一期間的總數據
            const prevTotalPayroll = this.previousPayrollData.reduce((sum, item) => sum + item.finalPay, 0);
            const prevAvgSalary = this.previousPayrollData.length > 0 ? 
                                 prevTotalPayroll / this.previousPayrollData.length : 0;
            const prevTotalBonus = this.previousPayrollData.reduce((sum, item) => sum + (item.bonusTotal || 0), 0);
            const prevEmployeeCount = this.previousPayrollData.length;
            
            // 計算變化百分比
            const totalPayrollTrend = prevTotalPayroll > 0 ? 
                                     ((totalPayroll - prevTotalPayroll) / prevTotalPayroll * 100).toFixed(1) : 0;
            const avgSalaryTrend = prevAvgSalary > 0 ? 
                                  ((avgSalary - prevAvgSalary) / prevAvgSalary * 100).toFixed(1) : 0;
            const totalBonusTrend = prevTotalBonus > 0 ? 
                                   ((totalBonus - prevTotalBonus) / prevTotalBonus * 100).toFixed(1) : 0;
            const employeeCountTrend = prevEmployeeCount > 0 ? 
                                      ((employeeCount - prevEmployeeCount) / prevEmployeeCount * 100).toFixed(1) : 0;
            
            // 更新UI
            document.getElementById('total-payroll').textContent = `$${Math.round(totalPayroll).toLocaleString()}`;
            document.getElementById('avg-salary').textContent = `$${Math.round(avgSalary).toLocaleString()}`;
            document.getElementById('total-bonus').textContent = `$${Math.round(totalBonus).toLocaleString()}`;
            document.getElementById('employee-count').textContent = employeeCount.toString();
            
            // 更新趨勢並添加顏色指示
            const trendElements = [
                { id: 'total-payroll-trend', value: totalPayrollTrend },
                { id: 'avg-salary-trend', value: avgSalaryTrend },
                { id: 'total-bonus-trend', value: totalBonusTrend },
                { id: 'employee-count-trend', value: employeeCountTrend }
            ];
            
            trendElements.forEach(item => {
                const element = document.getElementById(item.id);
                if (element) {
                    const value = parseFloat(item.value);
                    const sign = value > 0 ? '+' : '';
                    element.textContent = `${sign}${value}%`;
                    
                    // 設置顏色
                    if (value > 0) {
                        element.className = 'positive-trend';
                    } else if (value < 0) {
                        element.className = 'negative-trend';
                    } else {
                        element.className = 'neutral-trend';
                    }
                }
            });
            
            console.log("統計概覽渲染完成");
        } catch (error) {
            console.error("渲染統計概覽時出錯:", error);
        }
    }
    
    /**
     * 渲染薪資分布圖
     */
    renderDistributionChart() {
        try {
            // 獲取容器
            const container = document.getElementById('distribution-chart-container');
            if (!container) return;
            
            // 清空容器
            container.innerHTML = '';
            const canvas = document.createElement('canvas');
            canvas.id = 'distribution-chart';
            container.appendChild(canvas);
            
            // 獲取薪資數據
            const salaryData = this.currentPayrollData.map(item => item.finalPay);
            
            if (salaryData.length === 0) {
                container.innerHTML = '<p class="no-data-message">沒有可顯示的薪資數據</p>';
                return;
            }
            
            // 計算統計值
            const sortedSalaries = [...salaryData].sort((a, b) => a - b);
            const minSalary = sortedSalaries[0];
            const maxSalary = sortedSalaries[sortedSalaries.length - 1];
            
            // 計算中位數和四分位數
            const medianSalary = this.calculateMedian(sortedSalaries);
            const q1Salary = this.calculateMedian(sortedSalaries.slice(0, Math.floor(sortedSalaries.length / 2)));
            const q3Salary = this.calculateMedian(sortedSalaries.slice(Math.ceil(sortedSalaries.length / 2)));
            
            // 更新統計信息
            document.getElementById('median-salary').textContent = `$${Math.round(medianSalary).toLocaleString()}`;
            document.getElementById('q1-salary').textContent = `$${Math.round(q1Salary).toLocaleString()}`;
            document.getElementById('q3-salary').textContent = `$${Math.round(q3Salary).toLocaleString()}`;
            document.getElementById('min-salary').textContent = `$${Math.round(minSalary).toLocaleString()}`;
            document.getElementById('max-salary').textContent = `$${Math.round(maxSalary).toLocaleString()}`;
            
            // 根據視圖類型渲染不同圖表
            if (this.distributionView === 'histogram') {
                this.renderHistogram(canvas, salaryData);
            } else {
                this.renderBoxPlot(canvas, salaryData);
            }
            
            console.log("薪資分布圖渲染完成");
        } catch (error) {
            console.error("渲染薪資分布圖時出錯:", error);
        }
    }
    
    /**
     * 渲染直方圖
     */
    renderHistogram(canvas, salaryData) {
        // 計算數據範圍和分組
        const min = Math.min(...salaryData);
        const max = Math.max(...salaryData);
        
        // 計算合適的分組數
        const binCount = Math.min(Math.ceil(Math.sqrt(salaryData.length)), 10);
        const binSize = (max - min) / binCount;
        
        // 創建分組
        const bins = Array(binCount).fill(0);
        const binLabels = [];
        
        // 填充分組標籤
        for (let i = 0; i < binCount; i++) {
            const start = min + i * binSize;
            const end = min + (i + 1) * binSize;
            binLabels.push(`$${Math.round(start).toLocaleString()} - $${Math.round(end).toLocaleString()}`);
        }
        
        // 統計每個分組的數量
        salaryData.forEach(salary => {
            // 確保最大值分入最後一組
            const binIndex = salary === max ? binCount - 1 : Math.floor((salary - min) / binSize);
            if (binIndex >= 0 && binIndex < binCount) {
                bins[binIndex]++;
            }
        });
        
        // 銷毀舊圖表
        if (this.distributionChart) {
            this.distributionChart.destroy();
        }
        
        // 創建新圖表
        this.distributionChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: binLabels,
                datasets: [{
                    label: '員工數量',
                    data: bins,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '薪資分布直方圖'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `員工數: ${context.raw} 人`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '員工數量'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '薪資範圍'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 渲染箱形圖
     */
    renderBoxPlot(canvas, salaryData) {
        // 需要確保已載入 Chart.js BoxPlot 外掛
        if (typeof Chart.BoxPlot === 'undefined') {
            console.error("Chart.js BoxPlot 外掛未載入");
            return;
        }
        
        // 銷毀舊圖表
        if (this.distributionChart) {
            this.distributionChart.destroy();
        }
        
        // 創建箱形圖
        this.distributionChart = new Chart(canvas, {
            type: 'boxplot',
            data: {
                labels: ['薪資分布'],
                datasets: [{
                    label: '薪資箱形圖',
                    data: [salaryData],
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '薪資分布箱形圖'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '薪資金額'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 切換分布視圖類型
     */
    toggleDistributionView() {
        this.distributionView = this.distributionView === 'histogram' ? 'boxplot' : 'histogram';
        this.renderDistributionChart();
    }
    
    /**
     * 渲染薪資趨勢圖
     */
    renderTrendChart() {
        try {
            // 獲取容器
            const container = document.getElementById('trend-chart-container');
            if (!container) return;
            
            // 清空容器
            container.innerHTML = '';
            const canvas = document.createElement('canvas');
            canvas.id = 'trend-chart';
            container.appendChild(canvas);
            
            // 獲取趨勢指標類型
            const trendMetric = document.getElementById('trend-metric').value;
            
            // 向前獲取12個月的數據
            this.fetchTrendData(trendMetric, 12).then(trendData => {
                if (trendData.labels.length === 0) {
                    container.innerHTML = '<p class="no-data-message">沒有足夠的歷史數據顯示趨勢</p>';
                    return;
                }
                
                // 銷毀舊圖表
                if (this.trendChart) {
                    this.trendChart.destroy();
                }
                
                // 創建趨勢圖
                this.trendChart = new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: trendData.labels,
                        datasets: [{
                            label: trendData.title,
                            data: trendData.data,
                            fill: false,
                            backgroundColor: 'rgba(54, 162, 235, 0.6)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            tension: 0.1,
                            pointRadius: 5,
                            pointHoverRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: '薪資趨勢分析'
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        return `${trendData.title}: $${context.raw.toLocaleString()}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: '金額'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: '月份'
                                }
                            }
                        }
                    }
                });
                
                console.log("薪資趨勢圖渲染完成");
            }).catch(error => {
                console.error("獲取趨勢數據時出錯:", error);
                container.innerHTML = `<p class="error-message">載入趨勢數據時發生錯誤: ${error.message}</p>`;
            });
        } catch (error) {
            console.error("渲染薪資趨勢圖時出錯:", error);
        }
    }
    
    /**
     * 渲染薪資組成圖
     */
    renderBreakdownChart() {
        try {
            // 獲取容器
            const container = document.getElementById('breakdown-chart-container');
            if (!container) return;
            
            // 清空容器
            container.innerHTML = '';
            const canvas = document.createElement('canvas');
            canvas.id = 'breakdown-chart';
            container.appendChild(canvas);
            
            // 獲取分析類型
            const breakdownType = document.getElementById('breakdown-type').value;
            
            if (this.currentPayrollData.length === 0) {
                container.innerHTML = '<p class="no-data-message">沒有可顯示的薪資數據</p>';
                return;
            }
            
            // 根據類型渲染不同的組成分析
            if (breakdownType === 'overall') {
                this.renderOverallBreakdown(canvas);
            } else if (breakdownType === 'by-level') {
                this.renderBreakdownByLevel(canvas);
            } else if (breakdownType === 'by-store') {
                this.renderBreakdownByStore(canvas);
            }
            
            console.log("薪資組成圖渲染完成");
        } catch (error) {
            console.error("渲染薪資組成圖時出錯:", error);
        }
    }
    
    /**
     * 渲染整體薪資組成分析
     */
    renderOverallBreakdown(canvas) {
        // 計算整體薪資組成
        const baseSalaryTotal = this.currentPayrollData.reduce((sum, item) => sum + (item.baseSalary || 0), 0);
        const overtimePayTotal = this.currentPayrollData.reduce((sum, item) => sum + (item.overtimePay || 0), 0);
        const bonusTotal = this.currentPayrollData.reduce((sum, item) => sum + (item.bonusTotal || 0), 0);
        const deductionsTotal = this.currentPayrollData.reduce((sum, item) => sum + (item.deductions || 0), 0);
        
        // 銷毀舊圖表
        if (this.breakdownChart) {
            this.breakdownChart.destroy();
        }
        
        // 創建組成圖
        this.breakdownChart = new Chart(canvas, {
            type: 'pie',
            data: {
                labels: ['基本薪資', '加班費', '獎金', '扣款'],
                datasets: [{
                    data: [
                        baseSalaryTotal,
                        overtimePayTotal,
                        bonusTotal,
                        Math.abs(deductionsTotal) // 取絕對值以便顯示
                    ],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.6)',
                        'rgba(54, 162, 235, 0.6)',
                        'rgba(255, 206, 86, 0.6)',
                        'rgba(255, 99, 132, 0.6)'
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(255, 99, 132, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '整體薪資組成分析'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.raw;
                                const total = context.dataset.data.reduce((a, b) => a + Math.abs(b), 0);
                                const percentage = Math.round((Math.abs(value) / total) * 100);
                                return `${label}: $${Math.abs(value).toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 渲染按職級的薪資組成分析
     */
    renderBreakdownByLevel(canvas) {
        // 定義職級
        const levels = [
            { id: 1, name: '一般員工' },
            { id: 2, name: '資深員工' },
            { id: 5, name: '店長' },
            { id: 9, name: '管理員' }
        ];
        
        // 按職級分組數據
        const levelData = levels.map(level => {
            const data = this.currentPayrollData.filter(item => {
                if (level.id === 9) {
                    return item.employeeLevel >= 9;
                } else {
                    return item.employeeLevel === level.id;
                }
            });
            
            const baseSalaryTotal = data.reduce((sum, item) => sum + (item.baseSalary || 0), 0);
            const overtimePayTotal = data.reduce((sum, item) => sum + (item.overtimePay || 0), 0);
            const bonusTotal = data.reduce((sum, item) => sum + (item.bonusTotal || 0), 0);
            
            return {
                level: level.name,
                baseSalary: baseSalaryTotal,
                overtimePay: overtimePayTotal,
                bonus: bonusTotal
            };
        });
        
        // 銷毀舊圖表
        if (this.breakdownChart) {
            this.breakdownChart.destroy();
        }
        
        // 創建堆疊柱狀圖
        this.breakdownChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: levelData.map(d => d.level),
                datasets: [
                    {
                        label: '基本薪資',
                        data: levelData.map(d => d.baseSalary),
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    },
                    {
                        label: '加班費',
                        data: levelData.map(d => d.overtimePay),
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: '獎金',
                        data: levelData.map(d => d.bonus),
                        backgroundColor: 'rgba(255, 206, 86, 0.6)',
                        borderColor: 'rgba(255, 206, 86, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '不同職級薪資組成分析'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.raw;
                                return `${label}: $${value.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        title: {
                            display: true,
                            text: '職級'
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '金額'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 渲染按分店的薪資組成分析
     */
    renderBreakdownByStore(canvas) {
        // 按分店分組數據
        const storeData = [];
        
        // 將數據按分店分組
        this.currentPayrollData.forEach(item => {
            const storeId = item.storeId;
            const storeName = getStoreName(storeId);
            
            let store = storeData.find(s => s.id === storeId);
            if (!store) {
                store = {
                    id: storeId,
                    name: storeName,
                    baseSalary: 0,
                    overtimePay: 0,
                    bonus: 0
                };
                storeData.push(store);
            }
            
            store.baseSalary += (item.baseSalary || 0);
            store.overtimePay += (item.overtimePay || 0);
            store.bonus += (item.bonusTotal || 0);
        });
        
        // 限制顯示店舖數量
        const topStores = storeData
            .sort((a, b) => (b.baseSalary + b.overtimePay + b.bonus) - (a.baseSalary + a.overtimePay + a.bonus))
            .slice(0, 10);
        
        // 銷毀舊圖表
        if (this.breakdownChart) {
            this.breakdownChart.destroy();
        }
        
        // 創建堆疊柱狀圖
        this.breakdownChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: topStores.map(d => d.name),
                datasets: [
                    {
                        label: '基本薪資',
                        data: topStores.map(d => d.baseSalary),
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    },
                    {
                        label: '加班費',
                        data: topStores.map(d => d.overtimePay),
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: '獎金',
                        data: topStores.map(d => d.bonus),
                        backgroundColor: 'rgba(255, 206, 86, 0.6)',
                        borderColor: 'rgba(255, 206, 86, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '各分店薪資組成分析'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.raw;
                                return `${label}: $${value.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        title: {
                            display: true,
                            text: '分店'
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '金額'
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 渲染詳細數據表格
     */
    renderDetailsTable() {
        try {
            const tableBody = document.getElementById('details-table-body');
            if (!tableBody) return;
            
            // 清空表格
            tableBody.innerHTML = '';
            
            // 檢查是否有數據
            if (this.filteredDetailsData.length === 0) {
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = '<td colspan="8" class="no-data-message">沒有符合條件的薪資數據</td>';
                tableBody.appendChild(emptyRow);
                return;
            }
            
            // 應用分頁
            const startIndex = (paginationSettings.currentPage - 1) * paginationSettings.itemsPerPage;
            const endIndex = startIndex + paginationSettings.itemsPerPage;
            const pageData = this.filteredDetailsData.slice(startIndex, endIndex);
            
            // 渲染表格行
            pageData.forEach(item => {
                const row = document.createElement('tr');
                
                // 格式化數據
                const employeeName = item.employeeName || '未知';
                const storeName = getStoreName(item.storeId);
                const level = this.getLevelName(item.employeeLevel);
                const baseSalary = Math.round(item.baseSalary || 0).toLocaleString();
                const overtimePay = Math.round(item.overtimePay || 0).toLocaleString();
                const bonusTotal = Math.round(item.bonusTotal || 0).toLocaleString();
                const deductions = Math.round(item.deductions || 0).toLocaleString();
                const finalPay = Math.round(item.finalPay || 0).toLocaleString();
                
                // 設置表格內容
                row.innerHTML = `
                    <td>${employeeName}</td>
                    <td>${storeName}</td>
                    <td>${level}</td>
                    <td>$${baseSalary}</td>
                    <td>$${overtimePay}</td>
                    <td>$${bonusTotal}</td>
                    <td>$${deductions}</td>
                    <td>$${finalPay}</td>
                `;
                
                tableBody.appendChild(row);
            });
            
            // 創建分頁控制
            this.renderPagination();
            
            console.log("詳細數據表格渲染完成");
        } catch (error) {
            console.error("渲染詳細數據表格時出錯:", error);
        }
    }
    
    /**
     * 渲染分頁控制
     */
    renderPagination() {
        const paginationControls = document.getElementById('pagination-controls');
        if (!paginationControls) return;
        
        // 清空控制區
        paginationControls.innerHTML = '';
        
        // 檢查是否需要分頁
        if (this.filteredDetailsData.length <= paginationSettings.itemsPerPage) {
            return;
        }
        
        // 創建分頁控制
        const pageCount = paginationSettings.totalPages;
        const currentPage = paginationSettings.currentPage;
        
        // 創建前一頁按鈕
        const prevButton = document.createElement('button');
        prevButton.textContent = '上一頁';
        prevButton.className = 'pagination-button';
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) {
                paginationSettings.currentPage--;
                this.renderDetailsTable();
            }
        });
        
        // 創建下一頁按鈕
        const nextButton = document.createElement('button');
        nextButton.textContent = '下一頁';
        nextButton.className = 'pagination-button';
        nextButton.disabled = currentPage === pageCount;
        nextButton.addEventListener('click', () => {
            if (currentPage < pageCount) {
                paginationSettings.currentPage++;
                this.renderDetailsTable();
            }
        });
        
        // 創建頁數信息
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `第 ${currentPage} 頁，共 ${pageCount} 頁`;
        pageInfo.className = 'pagination-info';
        
        // 添加到控制區
        paginationControls.appendChild(prevButton);
        paginationControls.appendChild(pageInfo);
        paginationControls.appendChild(nextButton);
    }
    
    /**
     * 更新分頁設置
     */
    updatePagination() {
        paginationSettings.currentPage = 1;
        paginationSettings.totalPages = Math.ceil(this.filteredDetailsData.length / paginationSettings.itemsPerPage);
    }
    
    /**
     * 過濾詳細數據表格
     * @param {string} searchTerm - 搜索關鍵字
     */
    filterDetailsTable(searchTerm) {
        // 如果搜索詞為空，顯示所有數據
        if (!searchTerm || searchTerm.trim() === '') {
            this.filteredDetailsData = [...this.currentPayrollData];
        } else {
            // 轉換為小寫以進行不區分大小寫的搜索
            const term = searchTerm.toLowerCase();
            
            // 過濾數據
            this.filteredDetailsData = this.currentPayrollData.filter(item => {
                const employeeName = (item.employeeName || '').toLowerCase();
                const storeName = getStoreName(item.storeId).toLowerCase();
                const level = this.getLevelName(item.employeeLevel).toLowerCase();
                
                return employeeName.includes(term) || 
                       storeName.includes(term) || 
                       level.includes(term);
            });
        }
        
        // 更新分頁並重新渲染表格
        this.updatePagination();
        this.renderDetailsTable();
    }
    
    /**
     * 獲取職級名稱
     * @param {number} level - 職級數字
     * @returns {string} 職級名稱
     */
    getLevelName(level) {
        if (!level) return '未知';
        
        switch (level) {
            case 1: return '一般員工 (Level 1)';
            case 2: return '資深員工 (Level 2)';
            case 5: return '店長 (Level 5)';
            case 9: case 10: return '管理員 (Level 9+)';
            default: return `Level ${level}`;
        }
    }
    
    /**
     * 計算中位數
     * @param {Array} numbers - 數字陣列（必須已排序）
     * @returns {number} 中位數
     */
    calculateMedian(numbers) {
        if (numbers.length === 0) return 0;
        
        const middle = Math.floor(numbers.length / 2);
        
        if (numbers.length % 2 === 0) {
            return (numbers[middle - 1] + numbers[middle]) / 2;
        } else {
            return numbers[middle];
        }
    }
    
    /**
     * 獲取趨勢數據
     * @param {string} metric - 趨勢指標
     * @param {number} months - 月數
     * @returns {Promise<Object>} 趨勢數據對象
     */
    async fetchTrendData(metric, months) {
        // 當前日期
        const now = new Date();
        const labels = [];
        const data = [];
        let title = '';
        
        // 根據指標類型設置標題
        switch (metric) {
            case 'total': title = '總薪資支出'; break;
            case 'average': title = '平均薪資'; break;
            case 'median': title = '中位數薪資'; break;
            case 'bonus': title = '獎金總額'; break;
            default: title = '薪資趨勢';
        }
        
        try {
            // 獲取過去幾個月的數據
            for (let i = months - 1; i >= 0; i--) {
                // 計算月份
                const year = now.getFullYear();
                const month = now.getMonth() - i;
                
                // 調整年份和月份
                let adjustedYear = year;
                let adjustedMonth = month;
                
                if (month < 0) {
                    adjustedYear = year - Math.ceil(Math.abs(month) / 12);
                    adjustedMonth = ((month % 12) + 12) % 12;
                }
                
                // 設置日期範圍
                const startDate = new Date(adjustedYear, adjustedMonth, 1);
                const endDate = new Date(adjustedYear, adjustedMonth + 1, 0, 23, 59, 59);
                
                // 設置標籤
                labels.push(`${adjustedYear}/${adjustedMonth + 1}`);
                
                // 查詢該月數據
                let query = this.db.collection('payroll')
                    .where('timestamp', '>=', startDate)
                    .where('timestamp', '<=', endDate);
                
                const snapshot = await query.get();
                
                // 提取數據
                const monthData = [];
                snapshot.forEach(doc => {
                    const item = doc.data();
                    monthData.push({
                        baseSalary: Number(item.baseSalary || 0),
                        overtimePay: Number(item.overtimePay || 0),
                        bonusTotal: Number(item.bonusTotal || 0),
                        deductions: Number(item.deductions || 0),
                        finalPay: Number(item.finalPay || 0)
                    });
                });
                
                // 計算指標值
                let value = 0;
                
                if (monthData.length > 0) {
                    switch (metric) {
                        case 'total':
                            value = monthData.reduce((sum, item) => sum + item.finalPay, 0);
                            break;
                        case 'average':
                            value = monthData.reduce((sum, item) => sum + item.finalPay, 0) / monthData.length;
                            break;
                        case 'median':
                            const sortedSalaries = monthData.map(item => item.finalPay).sort((a, b) => a - b);
                            value = this.calculateMedian(sortedSalaries);
                            break;
                        case 'bonus':
                            value = monthData.reduce((sum, item) => sum + (item.bonusTotal || 0), 0);
                            break;
                        default:
                            value = 0;
                    }
                }
                
                data.push(Math.round(value));
            }
            
            return { labels, data, title };
        } catch (error) {
            console.error("獲取趨勢數據時出錯:", error);
            throw error;
        }
    }
}

/**
 * 初始化薪資統計報表頁面
 * @param {Object} currentUser - 當前登入用戶
 * @param {Object} db - Firestore實例
 */
async function initSalaryStats(currentUser, db) {
    console.log("Initializing salary statistics page...");
    
    // 檢查用戶權限
    if (!currentUser || !currentUser.token || currentUser.token.level < 9) {
        showMessage("您沒有權限查看薪資統計報表", "error");
        console.error("User does not have sufficient permissions");
        return;
    }
    
    statsDb = db;
    statsCurrentUser = currentUser;
    
    try {
        // 填充篩選選項
        await populateFilterOptions();
        
        // 設置按鈕事件監聽
        setupEventListeners();
        
        // 創建並存儲薪資統計實例，方便在其他地方調用
        window.salaryStatsInstance = new SalaryStats(statsDb);
        
        // 默認加載當前月份的數據
        const runStatsBtn = document.getElementById('run-stats-btn');
        if (runStatsBtn) {
            runStatsBtn.click();
        }
        
        console.log("Salary statistics page initialized successfully");
    } catch (error) {
        console.error("Error during salary statistics initialization:", error);
        showMessage(`初始化薪資統計頁面失敗: ${error.message}`, "error");
    }
}

/**
 * 填充篩選選項
 */
async function populateFilterOptions() {
    // 填充月份選擇器
    populateMonthSelector();
    
    // 填充季度選擇器
    populateQuarterSelector();
    
    // 填充年度選擇器
    populateYearSelector();
    
    // 設置自定義日期範圍的默認值
    setDefaultDateRange();
    
    // 填充分店選擇器
    await populateStoreSelector();
}

/**
 * 填充月份選擇器
 */
function populateMonthSelector() {
    const monthSelector = document.getElementById('filter-month');
    if (!monthSelector) return;
    
    // 清空現有選項
    monthSelector.innerHTML = '';
    
    // 獲取過去24個月的選項
    const options = generatePast24MonthsOptions();
    
    // 添加選項到下拉選單
    options.forEach(option => {
        const optElement = document.createElement('option');
        optElement.value = option.value;
        optElement.textContent = option.label;
        monthSelector.appendChild(optElement);
    });
    
    // 默認選擇最近的月份
    if (options.length > 0) {
        monthSelector.value = options[0].value;
    }
}

/**
 * 生成過去24個月的選項
 * @returns {Array} 月份選項數組 {value: 'YYYY-MM', label: 'YYYY年MM月'}
 */
function generatePast24MonthsOptions() {
    const options = [];
    const today = new Date();
    
    // 從當前月份開始，向前推24個月
    for (let i = 0; i < 24; i++) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const value = `${year}-${String(month).padStart(2, '0')}`;
        const label = `${year}年${String(month).padStart(2, '0')}月`;
        
        options.push({ value, label });
    }
    
    return options;
}

/**
 * 填充季度選擇器
 */
function populateQuarterSelector() {
    const quarterSelector = document.getElementById('filter-quarter');
    if (!quarterSelector) return;
    
    // 清空現有選項
    quarterSelector.innerHTML = '';
    
    // 獲取過去8個季度的選項
    const options = generatePast8QuartersOptions();
    
    // 添加選項到下拉選單
    options.forEach(option => {
        const optElement = document.createElement('option');
        optElement.value = option.value;
        optElement.textContent = option.label;
        quarterSelector.appendChild(optElement);
    });
    
    // 默認選擇最近的季度
    if (options.length > 0) {
        quarterSelector.value = options[0].value;
    }
}

/**
 * 生成過去8個季度的選項
 * @returns {Array} 季度選項數組 {value: 'YYYY-Q1', label: 'YYYY年Q1季'}
 */
function generatePast8QuartersOptions() {
    const options = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3) + 1;
    
    // 計算起始年和季度
    let year = currentYear;
    let quarter = currentQuarter;
    
    // 從當前季度開始，向前推8個季度
    for (let i = 0; i < 8; i++) {
        // 調整季度和年份
        if (quarter <= 0) {
            quarter = 4;
            year--;
        }
        
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        
        const value = `${year}-Q${quarter}`;
        const label = `${year}年第${quarter}季度 (${startMonth}-${endMonth}月)`;
        
        options.push({ value, label });
        
        // 前移一個季度
        quarter--;
    }
    
    return options;
}

/**
 * 填充年度選擇器
 */
function populateYearSelector() {
    const yearSelector = document.getElementById('filter-year');
    if (!yearSelector) return;
    
    // 清空現有選項
    yearSelector.innerHTML = '';
    
    // 獲取過去5年的選項
    const options = [];
    const currentYear = new Date().getFullYear();
    
    for (let i = 0; i < 5; i++) {
        const year = currentYear - i;
        options.push({
            value: year.toString(),
            label: `${year}年`
        });
    }
    
    // 添加選項到下拉選單
    options.forEach(option => {
        const optElement = document.createElement('option');
        optElement.value = option.value;
        optElement.textContent = option.label;
        yearSelector.appendChild(optElement);
    });
    
    // 默認選擇當前年
    if (options.length > 0) {
        yearSelector.value = options[0].value;
    }
}

/**
 * 設置自定義日期範圍的默認值
 */
function setDefaultDateRange() {
    const startDateInput = document.getElementById('filter-start-date');
    const endDateInput = document.getElementById('filter-end-date');
    
    if (!startDateInput || !endDateInput) return;
    
    // 設置默認的開始日期為當前月的第一天
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    startDateInput.valueAsDate = firstDayOfMonth;
    
    // 設置默認的結束日期為今天
    endDateInput.valueAsDate = today;
}

/**
 * 填充分店選擇器
 */
async function populateStoreSelector() {
    const storeSelector = document.getElementById('filter-store');
    if (!storeSelector) return;
    
    try {
        // 獲取所有分店資料
        const storesSnapshot = await statsDb.collection('stores').get();
        
        // 清空全局存儲並填充
        allStores = [];
        storesSnapshot.forEach(doc => {
            allStores.push({
                id: doc.id,
                name: doc.data().name || `分店 ${doc.id}`,
                ...doc.data()
            });
        });
        
        // 清空選擇器現有選項
        // 保留"所有分店"選項
        const allStoresOption = storeSelector.querySelector('option[value="all"]');
        storeSelector.innerHTML = '';
        storeSelector.appendChild(allStoresOption);
        
        // 添加分店選項
        allStores.forEach(store => {
            const optElement = document.createElement('option');
            optElement.value = store.id;
            optElement.textContent = store.name;
            storeSelector.appendChild(optElement);
        });
        
        console.log(`Populated store selector with ${allStores.length} stores`);
    } catch (error) {
        console.error("Error fetching stores for selector:", error);
        showMessage("無法載入分店資料", "error");
    }
}

/**
 * 設置事件監聽器
 */
function setupEventListeners() {
    // 生成報表按鈕
    const runStatsBtn = document.getElementById('run-stats-btn');
    if (runStatsBtn) {
        runStatsBtn.addEventListener('click', async () => {
            await generateSalaryReport();
        });
    }
    
    // 匯出數據按鈕
    const exportStatsBtn = document.getElementById('export-stats-btn');
    if (exportStatsBtn) {
        exportStatsBtn.addEventListener('click', () => {
            exportSalaryStatistics();
        });
    }
    
    // 薪資分布視圖切換按鈕
    const toggleDistributionViewBtn = document.getElementById('toggle-distribution-view');
    if (toggleDistributionViewBtn) {
        toggleDistributionViewBtn.addEventListener('click', () => {
            if (window.salaryStatsInstance) {
                window.salaryStatsInstance.toggleDistributionView();
            }
        });
    }
    
    // 薪資趨勢指標選擇器
    const trendMetricSelector = document.getElementById('trend-metric');
    if (trendMetricSelector) {
        trendMetricSelector.addEventListener('change', () => {
            if (window.salaryStatsInstance) {
                window.salaryStatsInstance.renderTrendChart();
            }
        });
    }
    
    // 薪資組成分析類型選擇器
    const breakdownTypeSelector = document.getElementById('breakdown-type');
    if (breakdownTypeSelector) {
        breakdownTypeSelector.addEventListener('change', () => {
            if (window.salaryStatsInstance) {
                window.salaryStatsInstance.renderBreakdownChart();
            }
        });
    }
    
    // 詳細數據搜尋
    const detailsSearch = document.getElementById('details-search');
    if (detailsSearch) {
        detailsSearch.addEventListener('input', () => {
            if (window.salaryStatsInstance) {
                window.salaryStatsInstance.filterDetailsTable(detailsSearch.value);
            }
        });
    }
}

/**
 * 顯示消息
 * @param {string} message - 要顯示的消息
 * @param {string} type - 消息類型 ('info', 'error', 'success')
 */
function showMessage(message, type = 'info') {
    const messageElement = document.getElementById('stats-message');
    if (!messageElement) return;
    
    messageElement.textContent = message;
    messageElement.className = `message ${type}-message`;
    messageElement.style.display = 'block';
    
    // 5秒後自動隱藏
    setTimeout(() => {
        messageElement.style.display = 'none';
    }, 5000);
}

/**
 * 生成薪資報表
 */
async function generateSalaryReport() {
    try {
        // 顯示載入中消息
        showMessage("正在生成薪資報表，請稍候...", "info");
        
        // 獲取所選的報表篩選條件
        const dateType = document.getElementById('filter-date-type').value;
        let startDate, endDate, periodLabel;
        
        // 根據選擇的日期類型處理日期範圍
        switch (dateType) {
            case 'month':
                const monthValue = document.getElementById('filter-month').value;
                [startDate, endDate, periodLabel] = getDateRangeForMonth(monthValue);
                break;
            case 'quarter':
                const quarterValue = document.getElementById('filter-quarter').value;
                [startDate, endDate, periodLabel] = getDateRangeForQuarter(quarterValue);
                break;
            case 'year':
                const yearValue = document.getElementById('filter-year').value;
                [startDate, endDate, periodLabel] = getDateRangeForYear(yearValue);
                break;
            case 'custom':
                startDate = new Date(document.getElementById('filter-start-date').value);
                endDate = new Date(document.getElementById('filter-end-date').value);
                endDate.setHours(23, 59, 59, 999); // 設置為當天結束時間
                periodLabel = `${startDate.toLocaleDateString('zh-TW')} 至 ${endDate.toLocaleDateString('zh-TW')}`;
                break;
        }
        
        // 驗證日期範圍
        if (!startDate || !endDate || startDate > endDate) {
            showMessage("無效的日期範圍", "error");
            return;
        }
        
        // 獲取其他篩選條件
        const storeId = document.getElementById('filter-store').value;
        const employeeLevel = document.getElementById('filter-employee-level').value;
        
        // 更新當前日期範圍
        currentDateRange = {
            type: dateType,
            start: startDate,
            end: endDate,
            label: periodLabel
        };
        
        // 顯示選定的時間範圍
        const periodDisplay = document.getElementById('stats-period-display');
        if (periodDisplay) {
            periodDisplay.textContent = periodLabel;
        }
        
        // 獲取薪資數據
        if (window.salaryStatsInstance) {
            await window.salaryStatsInstance.fetchPayrollData(startDate, endDate, storeId, employeeLevel);
            window.salaryStatsInstance.renderAllStats();
        }
        
        // 顯示報表區域
        document.getElementById('stats-overview').style.display = 'block';
        document.getElementById('stats-tabs').style.display = 'block';
        
        showMessage("薪資報表生成完成", "success");
    } catch (error) {
        console.error("Error generating salary report:", error);
        showMessage(`生成薪資報表失敗: ${error.message}`, "error");
    }
}

/**
 * 獲取指定月份的日期範圍
 * @param {string} monthValue - 月份值，格式為 'YYYY-MM'
 * @returns {Array} [startDate, endDate, periodLabel]
 */
function getDateRangeForMonth(monthValue) {
    const [year, month] = monthValue.split('-').map(Number);
    
    // 起始日期：當月第一天
    const startDate = new Date(year, month - 1, 1);
    
    // 結束日期：下月第一天減一毫秒
    const endDate = new Date(year, month, 1);
    endDate.setMilliseconds(-1);
    
    // 期間標籤
    const periodLabel = `${year}年${month}月`;
    
    return [startDate, endDate, periodLabel];
}

/**
 * 獲取指定季度的日期範圍
 * @param {string} quarterValue - 季度值，格式為 'YYYY-Q1'
 * @returns {Array} [startDate, endDate, periodLabel]
 */
function getDateRangeForQuarter(quarterValue) {
    const [year, quarterStr] = quarterValue.split('-');
    const quarter = parseInt(quarterStr.substring(1));
    
    // 起始月份：(季度-1)*3 + 1
    const startMonth = (quarter - 1) * 3;
    // 結束月份：季度*3
    const endMonth = quarter * 3;
    
    // 起始日期：季度第一天
    const startDate = new Date(parseInt(year), startMonth, 1);
    
    // 結束日期：下一個季度第一天減一毫秒
    const endDate = new Date(parseInt(year), endMonth, 1);
    endDate.setMilliseconds(-1);
    
    // 期間標籤
    const periodLabel = `${year}年第${quarter}季度`;
    
    return [startDate, endDate, periodLabel];
}

/**
 * 獲取指定年度的日期範圍
 * @param {string} yearValue - 年份值，格式為 'YYYY'
 * @returns {Array} [startDate, endDate, periodLabel]
 */
function getDateRangeForYear(yearValue) {
    const year = parseInt(yearValue);
    
    // 起始日期：年初
    const startDate = new Date(year, 0, 1);
    
    // 結束日期：年末
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    
    // 期間標籤
    const periodLabel = `${year}年`;
    
    return [startDate, endDate, periodLabel];
}

/**
 * 匯出薪資統計數據
 */
function exportSalaryStatistics() {
    if (!currentPayrollData || currentPayrollData.length === 0) {
        showMessage("沒有可匯出的薪資數據", "error");
        return;
    }
    
    try {
        // 準備CSV數據
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // 添加BOM以支持中文
        
        // 添加表頭
        const headers = ["員工ID", "員工姓名", "分店", "職級", "基本薪資", "加班費", "獎金", "扣款", "實發薪資"];
        csvContent += headers.join(",") + "\n";
        
        // 添加數據行
        currentPayrollData.forEach(payroll => {
            const employeeName = payroll.employeeName || "未知";
            const storeName = getStoreName(payroll.storeId) || "未知";
            const level = payroll.employeeLevel || 0;
            const row = [
                payroll.employeeId,
                `"${employeeName}"`, // 使用雙引號包裹可能包含逗號的名稱
                `"${storeName}"`,
                level,
                payroll.baseSalary || 0,
                payroll.overtimePay || 0,
                payroll.bonusTotal || 0,
                payroll.deductions || 0,
                payroll.finalPay || 0
            ];
            csvContent += row.join(",") + "\n";
        });
        
        // 創建下載連結
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        
        // 設置文件名
        const periodLabel = currentDateRange.label.replace(/\s/g, "").replace(/:/g, "-");
        link.setAttribute("download", `薪資統計報表_${periodLabel}.csv`);
        
        // 模擬點擊下載
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessage("薪資統計數據已匯出", "success");
    } catch (error) {
        console.error("Error exporting salary statistics:", error);
        showMessage(`匯出數據失敗: ${error.message}`, "error");
    }
}

/**
 * 根據分店ID獲取分店名稱
 * @param {string} storeId - 分店ID
 * @returns {string} 分店名稱
 */
function getStoreName(storeId) {
    if (!storeId) return "未知分店";
    
    const store = allStores.find(s => s.id === storeId);
    return store ? store.name : `分店 ${storeId}`;
}
