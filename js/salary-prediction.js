/**
 * 薪資預測功能 - 整合單一預測和多場景對比
 * 基於歷史薪資數據，使用線性迴歸和移動平均等方法預測未來薪資趨勢
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 檢查是否已載入預測模型模組
    if (typeof PredictionModels === 'undefined') {
        // 動態載入預測模型模組
        const scriptElement = document.createElement('script');
        scriptElement.src = 'js/prediction-models.js';
        scriptElement.onload = async () => {
            console.log('預測模型模組載入成功');
            initSalaryPrediction();
        };
        scriptElement.onerror = (error) => {
            console.error('預測模型模組載入失敗:', error);
            alert('無法載入預測模型模組，將使用基本預測功能');
            initSalaryPrediction();
        };
        document.head.appendChild(scriptElement);
    } else {
        initSalaryPrediction();
    }
});

/**
 * 初始化薪資預測應用
 */
async function initSalaryPrediction() {
    // 初始化Firebase設定
    initFirebase();
    
    // 初始化頁面
    const predictionApp = new SalaryPredictionApp();
    await predictionApp.init();
    
    // 檢查用戶權限
    const userLevel = await predictionApp.getUserLevel();
    if (userLevel >= 8) {
        // 顯示測試數據區塊
        const testDataContainer = document.getElementById('test-data-container');
        if (testDataContainer) {
            testDataContainer.classList.remove('d-none');
        }
        
        // 載入測試數據區塊
        await predictionApp.loadTestDataSection();
    }
}

class SalaryPredictionApp {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.user = null;
        this.isAdmin = false;
        this.charts = {};
        this.historicalData = [];
        this.predictedData = [];
        this.employeeList = [];
        this.storeList = [];
        this.scenarioCounter = 0;
        this.scenarios = {};
        
        // 預測模型設定
        this.availableModels = typeof PredictionModels !== 'undefined' ? PredictionModels : null;
        this.currentModelType = 'linear'; // 默認使用線性回歸模型
        this.modelInstances = {}; // 模型實例緩存
        
        // 模型參數設定
        this.modelConfig = {
            linear: {
                confidenceLevel: 0.85,
                useWeightedFactors: true,
                weightFactors: {
                    balanced: { attendance: 0.25, performance: 0.3, seasonal: 0.15, tenure: 0.3 },
                    attendance: { attendance: 0.6, performance: 0.2, seasonal: 0.1, tenure: 0.1 },
                    performance: { attendance: 0.2, performance: 0.6, seasonal: 0.1, tenure: 0.1 },
                    tenure: { attendance: 0.1, performance: 0.2, seasonal: 0.1, tenure: 0.6 }
                }
            },
            seasonal: {
                confidenceLevel: 0.85,
                seasonalPeriod: 12,
                seasonalStrength: 1.0
            },
            movingAverage: {
                confidenceLevel: 0.85,
                windowSize: 3,
                weights: [0.5, 0.3, 0.2]
            }
        };
    }

    /**
     * 初始化頁面
     */
    async init() {
        try {
            // 驗證用戶身份
            await this.validateUser();
            
            // 載入員工和分店資料
            await Promise.all([
                this.loadEmployees('employee-select'),
                this.loadEmployees('comparison-employee'),
                this.loadStores('store-select'),
                this.loadStores('comparison-store')
            ]);
            
            // 設置事件監聽器
            this.setupEventListeners();
            
            // 初始化圖表
            this.initCharts();
            
            // 顯示用戶名稱
            this.displayUserInfo();
            
        } catch (error) {
            console.error('初始化薪資預測頁面時發生錯誤:', error);
            this.showTemporaryMessage('初始化頁面時發生錯誤: ' + error.message, 'error');
        }
    }

    /**
     * 驗證用戶身份
     */
    async validateUser() {
        return new Promise((resolve, reject) => {
            this.auth.onAuthStateChanged(async (user) => {
                if (!user) {
                    window.location.href = 'login.html';
                    reject(new Error('用戶未登入'));
                    return;
                }

                this.user = user;
                
                try {
                    // 檢查用戶權限
                    const userDoc = await this.db.collection('users').doc(user.uid).get();
                    if (!userDoc.exists) {
                        reject(new Error('找不到用戶資料'));
                        return;
                    }
                    
                    const userData = userDoc.data();
                    this.isAdmin = userData.role === 'admin' || userData.role === 'manager';
                    this.userData = userData;
                    
                    if (!this.isAdmin) {
                        // 非管理員只能查看自己的資料
                        this.restrictToSelfView();
                    }
                    
                    resolve();
                } catch (error) {
                    console.error('驗證用戶時發生錯誤:', error);
                    reject(error);
                }
            });
        });
    }

    /**
     * 限制非管理員只能查看自己的資料
     */
    restrictToSelfView() {
        const employeeSelects = document.querySelectorAll('#employee-select, #comparison-employee');
        const storeSelects = document.querySelectorAll('#store-select, #comparison-store');
        
        employeeSelects.forEach(select => {
            select.disabled = true;
            select.value = this.user.uid;
        });
        
        storeSelects.forEach(select => {
            if (this.userData.store) {
                select.disabled = true;
                select.value = this.userData.store;
            }
        });
    }

    /**
     * 顯示用戶信息
     */
    displayUserInfo() {
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) {
            userDisplay.textContent = this.userData.name || this.userData.displayName || this.user.email;
        }
        
        // 設置登出按鈕
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.auth.signOut().then(() => {
                    window.location.href = 'login.html';
                });
            });
        }
    }

    /**
     * 載入員工資料
     */
    async loadEmployees(selectId) {
        try {
            const employeeSelect = document.getElementById(selectId);
            if (!employeeSelect) return;
            
            // 清空現有選項，但保留第一個
            while (employeeSelect.options.length > 1) {
                employeeSelect.remove(1);
            }
            
            // 如果是非管理員，只顯示自己
            if (!this.isAdmin) {
                const option = document.createElement('option');
                option.value = this.user.uid;
                option.textContent = this.userData.name || this.userData.displayName || this.user.email;
                employeeSelect.appendChild(option);
                
                if (!this.employeeList.find(e => e.id === this.user.uid)) {
                    this.employeeList.push({ id: this.user.uid, ...this.userData });
                }
                return;
            }
            
            // 管理員可以查看所有員工
            const snapshot = await this.db.collection('users')
                .where('status', '==', 'active')
                .orderBy('name')
                .get();
            
            snapshot.forEach(doc => {
                const employee = { id: doc.id, ...doc.data() };
                
                if (!this.employeeList.find(e => e.id === employee.id)) {
                    this.employeeList.push(employee);
                }
                
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = employee.name || employee.displayName || '未命名員工';
                employeeSelect.appendChild(option);
            });
        } catch (error) {
            console.error(`載入員工資料到 ${selectId} 時發生錯誤:`, error);
            throw error;
        }
    }

    /**
     * 載入分店資料
     */
    async loadStores(selectId) {
        try {
            const storeSelect = document.getElementById(selectId);
            if (!storeSelect) return;
            
            // 清空現有選項，但保留第一個
            while (storeSelect.options.length > 1) {
                storeSelect.remove(1);
            }
            
            // 如果是非管理員，只顯示自己的分店
            if (!this.isAdmin && this.userData.store) {
                const storeDoc = await this.db.collection('stores').doc(this.userData.store).get();
                if (storeDoc.exists) {
                    const storeData = storeDoc.data();
                    
                    const option = document.createElement('option');
                    option.value = this.userData.store;
                    option.textContent = storeData.name || '未命名分店';
                    storeSelect.appendChild(option);
                    
                    if (!this.storeList.find(s => s.id === this.userData.store)) {
                        this.storeList.push({ id: this.userData.store, ...storeData });
                    }
                }
                return;
            }
            
            // 管理員可以查看所有分店
            const snapshot = await this.db.collection('stores')
                .where('status', '==', 'active')
                .orderBy('name')
                .get();
            
            snapshot.forEach(doc => {
                const store = { id: doc.id, ...doc.data() };
                
                if (!this.storeList.find(s => s.id === store.id)) {
                    this.storeList.push(store);
                }
                
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = store.name || '未命名分店';
                storeSelect.appendChild(option);
            });
        } catch (error) {
            console.error(`載入分店資料到 ${selectId} 時發生錯誤:`, error);
            throw error;
        }
    }

    /**
     * 設置事件監聽器
     */
    setupEventListeners() {
        // 現有的事件監聽器設置

        // 添加模型選擇和參數調整相關的事件監聽器
        this.setupModelSelectionListeners();
        
        // 單一預測按鈕
        const predictBtn = document.getElementById('predict-btn');
        if (predictBtn) {
            predictBtn.addEventListener('click', () => this.generateSinglePrediction());
        }
        
        // 多場景比較按鈕
        const addScenarioBtn = document.getElementById('add-scenario-btn');
        if (addScenarioBtn) {
            addScenarioBtn.addEventListener('click', () => this.addScenario());
        }
        
        const clearScenariosBtn = document.getElementById('clear-scenarios-btn');
        if (clearScenariosBtn) {
            clearScenariosBtn.addEventListener('click', () => this.clearScenarios());
        }
        
        const compareBtn = document.getElementById('compare-btn');
        if (compareBtn) {
            compareBtn.addEventListener('click', () => this.generateComparison());
        }
        
        // 設置切換標籤頁事件
        const predictionTabs = document.querySelectorAll('a[data-bs-toggle="tab"]');
        predictionTabs.forEach(tab => {
            tab.addEventListener('shown.bs.tab', (event) => {
                const targetId = event.target.getAttribute('href');
                if (targetId === '#multi-prediction-tab' && this.charts.comparisonSalaryChart) {
                    this.charts.comparisonSalaryChart.resize();
                } else if (targetId === '#single-prediction-tab' && this.charts.salaryTrendChart) {
                    this.charts.salaryTrendChart.resize();
                }
            });
        });
        
        // 設置匯出按鈕
        this.setupExportButtons();
    }

    /**
     * 設置模型選擇和參數調整相關的事件監聽器
     */
    setupModelSelectionListeners() {
        // 單一預測的模型選擇
        const singleModelSelect = document.getElementById('prediction-model-select');
        if (singleModelSelect) {
            // 填充模型選項
            if (ModelOptions) {
                singleModelSelect.innerHTML = ModelOptions.map(model => 
                    `<option value="${model.value}" title="${model.description}">${model.label}</option>`
                ).join('');
            }
            
            singleModelSelect.addEventListener('change', (e) => {
                const modelType = e.target.value;
                this.updateModelConfigUI(modelType, 'single');
                this.currentModelType = modelType;
            });
            
            // 初始化模型配置UI
            this.updateModelConfigUI(this.currentModelType, 'single');
        }
        
        // 多場景預測的模型參數設置按鈕
        const scenarioModelConfigBtn = document.getElementById('scenario-model-config-btn');
        if (scenarioModelConfigBtn) {
            scenarioModelConfigBtn.addEventListener('click', () => {
                this.showModelConfigModal();
            });
        }
    }

    /**
     * 更新模型配置UI
     * @param {string} modelType - 模型類型
     * @param {string} mode - 'single'或'multi'
     */
    updateModelConfigUI(modelType, mode) {
        const configContainer = document.getElementById(`${mode}-model-config-container`);
        if (!configContainer) return;
        
        // 清空配置UI
        configContainer.innerHTML = '';
        
        // 如果沒有找到預測模型模組，返回
        if (!this.availableModels || !this.availableModels[modelType]) {
            configContainer.innerHTML = '<div class="alert alert-warning">無法載入預測模型配置</div>';
            return;
        }
        
        // 創建模型實例（如果還沒有）
        if (!this.modelInstances[modelType]) {
            this.modelInstances[modelType] = new this.availableModels[modelType](
                this.modelConfig[modelType]
            );
        }
        
        // 獲取模型配置選項
        const configOptions = this.modelInstances[modelType].getConfigOptions();
        
        // 創建配置UI
        const configElements = configOptions.map(option => {
            const currentValue = this.modelConfig[modelType][option.id];
            let inputHtml = '';
            
            switch (option.type) {
                case 'range':
                    inputHtml = `
                        <div class="mb-3">
                            <label for="${mode}-${option.id}" class="form-label">${option.label}: <span id="${mode}-${option.id}-value">${currentValue}</span></label>
                            <input type="range" class="form-range" id="${mode}-${option.id}" 
                                min="${option.min}" max="${option.max}" step="${option.step}" 
                                value="${currentValue}" 
                                data-option-id="${option.id}" 
                                data-model-type="${modelType}"
                                data-mode="${mode}">
                            <small class="text-muted">${option.description}</small>
                        </div>
                    `;
                    break;
                case 'checkbox':
                    inputHtml = `
                        <div class="mb-3 form-check">
                            <input type="checkbox" class="form-check-input" id="${mode}-${option.id}" 
                                ${currentValue ? 'checked' : ''} 
                                data-option-id="${option.id}" 
                                data-model-type="${modelType}"
                                data-mode="${mode}">
                            <label class="form-check-label" for="${mode}-${option.id}">${option.label}</label>
                            <div><small class="text-muted">${option.description}</small></div>
                        </div>
                    `;
                    break;
                case 'select':
                    const options = option.options.map(opt => 
                        `<option value="${opt.value}" ${currentValue == opt.value ? 'selected' : ''}>${opt.label}</option>`
                    ).join('');
                    
                    inputHtml = `
                        <div class="mb-3">
                            <label for="${mode}-${option.id}" class="form-label">${option.label}</label>
                            <select class="form-select" id="${mode}-${option.id}" 
                                data-option-id="${option.id}" 
                                data-model-type="${modelType}"
                                data-mode="${mode}">
                                ${options}
                            </select>
                            <small class="text-muted">${option.description}</small>
                        </div>
                    `;
                    break;
                default:
                    inputHtml = `
                        <div class="mb-3">
                            <label for="${mode}-${option.id}" class="form-label">${option.label}</label>
                            <input type="text" class="form-control" id="${mode}-${option.id}" 
                                value="${currentValue}" 
                                data-option-id="${option.id}" 
                                data-model-type="${modelType}"
                                data-mode="${mode}">
                            <small class="text-muted">${option.description}</small>
                        </div>
                    `;
            }
            
            return inputHtml;
        }).join('');
        
        configContainer.innerHTML = configElements;
        
        // 添加事件監聽器
        configContainer.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', (e) => {
                const optionId = e.target.dataset.optionId;
                const modelType = e.target.dataset.modelType;
                let value;
                
                if (e.target.type === 'checkbox') {
                    value = e.target.checked;
                } else if (e.target.type === 'range' || e.target.type === 'select-one') {
                    value = parseFloat(e.target.value);
                    
                    // 更新範圍滑塊的顯示值
                    if (e.target.type === 'range') {
                        const valueDisplay = document.getElementById(`${mode}-${optionId}-value`);
                        if (valueDisplay) {
                            valueDisplay.textContent = value;
                        }
                    }
                } else {
                    value = e.target.value;
                }
                
                // 更新模型配置
                this.modelConfig[modelType][optionId] = value;
                
                // 更新模型實例
                if (this.modelInstances[modelType]) {
                    this.modelInstances[modelType].config[optionId] = value;
                }
            });
        });
    }

    /**
     * 顯示模型配置模態框
     */
    showModelConfigModal() {
        // 確保我們有一個模態框來顯示配置
        let modalElement = document.getElementById('model-config-modal');
        
        if (!modalElement) {
            // 創建模態框元素
            modalElement = document.createElement('div');
            modalElement.id = 'model-config-modal';
            modalElement.className = 'modal fade';
            modalElement.tabIndex = -1;
            modalElement.setAttribute('aria-hidden', 'true');
            
            modalElement.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">調整預測模型參數</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label for="modal-model-select" class="form-label">選擇預測模型</label>
                                <select class="form-select" id="modal-model-select">
                                    ${ModelOptions ? ModelOptions.map(model => 
                                        `<option value="${model.value}" title="${model.description}">${model.label}</option>`
                                    ).join('') : ''}
                                </select>
                            </div>
                            <div id="modal-model-config-container"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-primary" id="save-model-config-btn">保存設定</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modalElement);
            
            // 初始化Bootstrap模態框
            this.modelConfigModal = new bootstrap.Modal(modalElement);
            
            // 設置模型選擇事件
            const modalModelSelect = document.getElementById('modal-model-select');
            if (modalModelSelect) {
                modalModelSelect.addEventListener('change', (e) => {
                    this.updateModelConfigUI(e.target.value, 'modal');
                });
            }
            
            // 設置保存按鈕事件
            const saveConfigBtn = document.getElementById('save-model-config-btn');
            if (saveConfigBtn) {
                saveConfigBtn.addEventListener('click', () => {
                    // 應用當前配置到所有場景
                    this.applyModelConfigToScenarios();
                    this.modelConfigModal.hide();
                });
            }
        } else {
            this.modelConfigModal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
        }
        
        // 設置當前選擇的模型
        const modalModelSelect = document.getElementById('modal-model-select');
        if (modalModelSelect) {
            modalModelSelect.value = this.currentModelType;
            this.updateModelConfigUI(this.currentModelType, 'modal');
        }
        
        // 顯示模態框
        this.modelConfigModal.show();
    }

    /**
     * 將模型配置應用到所有場景
     */
    applyModelConfigToScenarios() {
        // 獲取模態框中選擇的模型類型
        const modalModelSelect = document.getElementById('modal-model-select');
        if (!modalModelSelect) return;
        
        const newModelType = modalModelSelect.value;
        
        // 更新當前模型類型
        this.currentModelType = newModelType;
        
        // 如果有活動場景，通知用戶可能需要重新生成預測
        if (Object.keys(this.scenarios).length > 0) {
            this.showTemporaryMessage('模型配置已更新，請重新生成比較以應用新設定', 'info');
        }
    }

    /**
     * 獲取當前模型實例
     * @param {string} modelType - 模型類型，默認使用當前選擇的類型
     * @returns {Object} - 模型實例
     */
    getCurrentModel(modelType = null) {
        const type = modelType || this.currentModelType;
        
        // 如果沒有預測模型模組，使用備用方法
        if (!this.availableModels || !this.availableModels[type]) {
            return null;
        }
        
        // 如果模型實例不存在，創建它
        if (!this.modelInstances[type]) {
            this.modelInstances[type] = new this.availableModels[type](
                this.modelConfig[type]
            );
        }
        
        return this.modelInstances[type];
    }

    /**
     * 初始化圖表
     */
    initCharts() {
        // 薪資趨勢預測圖表 - 單一預測
        const salaryTrendCtx = document.getElementById('salary-trend-chart');
        if (salaryTrendCtx) {
            this.charts.salaryTrend = new Chart(salaryTrendCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: '歷史薪資',
                            data: [],
                            backgroundColor: 'rgba(54, 162, 235, 0.2)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 2,
                            tension: 0.1
                        },
                        {
                            label: '預測薪資',
                            data: [],
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            tension: 0.1
                        },
                        {
                            label: '信心區間 (上限)',
                            data: [],
                            backgroundColor: 'rgba(255, 99, 132, 0.0)',
                            borderColor: 'rgba(255, 99, 132, 0.5)',
                            borderWidth: 1,
                            borderDash: [2, 2],
                            tension: 0.1,
                            fill: '+1'
                        },
                        {
                            label: '信心區間 (下限)',
                            data: [],
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            borderColor: 'rgba(255, 99, 132, 0.5)',
                            borderWidth: 1,
                            borderDash: [2, 2],
                            tension: 0.1,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: '薪資趨勢預測'
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(context.parsed.y);
                                    }
                                    return label;
                                }
                            }
                        },
                        legend: {
                            labels: {
                                usePointStyle: true,
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: '月份'
                            }
                        },
                        y: {
                            display: true,
                            title: {
                                display: true,
                                text: '薪資金額 (TWD)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value);
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // 獎金預測圖表
        const bonusPredictionCtx = document.getElementById('bonus-prediction-chart');
        if (bonusPredictionCtx) {
            this.charts.bonusPrediction = new Chart(bonusPredictionCtx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: '獎金金額',
                            data: [],
                            backgroundColor: 'rgba(75, 192, 192, 0.6)',
                            borderColor: 'rgba(75, 192, 192, 1)',
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
                            text: '獎金預測分析'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(context.parsed.y);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value);
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // 出勤與績效關聯圖
        const performanceCorrelationCtx = document.getElementById('performance-correlation-chart');
        if (performanceCorrelationCtx) {
            this.charts.performanceCorrelation = new Chart(performanceCorrelationCtx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: '出勤率 vs 績效',
                        data: [],
                        backgroundColor: 'rgba(153, 102, 255, 0.6)',
                        borderColor: 'rgba(153, 102, 255, 1)',
                        borderWidth: 1,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: '出勤與績效關聯分析'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const dataPoint = context.raw;
                                    return `出勤率: ${(dataPoint.x * 100).toFixed(1)}%, 績效評分: ${dataPoint.y.toFixed(1)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            min: 0,
                            max: 1,
                            title: {
                                display: true,
                                text: '出勤率'
                            },
                            ticks: {
                                callback: function(value) {
                                    return (value * 100) + '%';
                                }
                            }
                        },
                        y: {
                            min: 0,
                            max: 5,
                            title: {
                                display: true,
                                text: '績效評分'
                            }
                        }
                    }
                }
            });
        }
        
        // 比較模式圖表初始化
        this.initComparisonCharts();
    }
    
    /**
     * 初始化比較模式圖表
     */
    initComparisonCharts() {
        // 薪資趨勢對比圖
        const comparisonTrendCtx = document.getElementById('comparison-trend-chart');
        if (comparisonTrendCtx) {
            this.charts.comparisonTrend = new Chart(comparisonTrendCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: '薪資趨勢多場景對比'
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(context.parsed.y);
                                    }
                                    return label;
                                }
                            }
                        },
                        legend: {
                            position: 'top',
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                callback: function(value) {
                                    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value);
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // 獎金對比圖
        const comparisonBonusCtx = document.getElementById('comparison-bonus-chart');
        if (comparisonBonusCtx) {
            this.charts.comparisonBonus = new Chart(comparisonBonusCtx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: '獎金預測對比'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(context.parsed.y);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value);
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // 累計總收入對比圖
        const comparisonTotalCtx = document.getElementById('comparison-total-chart');
        if (comparisonTotalCtx) {
            this.charts.comparisonTotal = new Chart(comparisonTotalCtx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [{
                        label: '累計總收入',
                        data: [],
                        backgroundColor: 'rgba(255, 159, 64, 0.6)',
                        borderColor: 'rgba(255, 159, 64, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        title: {
                            display: true,
                            text: '預測期間累計總收入對比'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.x !== null) {
                                        label += new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(context.parsed.x);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value);
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    /**
     * 設置匯出按鈕
     */
    setupExportButtons() {
        // 單一預測匯出按鈕
        const exportCsvBtn = document.getElementById('export-csv-btn');
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => {
                this.exportToCsv('single');
            });
        }
        
        const exportPdfBtn = document.getElementById('export-pdf-btn');
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                this.exportToPdf('single');
            });
        }
        
        // 比較模式匯出按鈕
        const exportComparisonCsvBtn = document.getElementById('export-comparison-csv-btn');
        if (exportComparisonCsvBtn) {
            exportComparisonCsvBtn.addEventListener('click', () => {
                this.exportToCsv('comparison');
            });
        }
        
        const exportComparisonPdfBtn = document.getElementById('export-comparison-pdf-btn');
        if (exportComparisonPdfBtn) {
            exportComparisonPdfBtn.addEventListener('click', () => {
                this.exportToPdf('comparison');
            });
        }
    }
    
    /**
     * 獲取歷史薪資數據
     * @param {string} employeeId - 員工ID，如果是all則獲取所有員工
     * @param {string} storeId - 店鋪ID，如果是all則不過濾店鋪
     * @returns {Promise<Array>} - 歷史薪資數據數組
     */
    async fetchHistoricalSalaryData(employeeId, storeId) {
        try {
            let query = this.db.collection('payroll_records')
                .orderBy('month', 'asc');
            
            if (employeeId !== 'all') {
                query = query.where('userId', '==', employeeId);
            }
            
            // 獲取薪資記錄
            const snapshot = await query.get();
            
            if (snapshot.empty) {
                console.log('沒有找到歷史薪資記錄');
                return [];
            }
            
            // 處理數據
            let records = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                
                // 如果指定了店鋪，則過濾
                if (storeId !== 'all' && data.store !== storeId) {
                    return;
                }
                
                records.push({
                    id: doc.id,
                    month: data.month,
                    userId: data.userId,
                    userName: data.userName || '未知員工',
                    store: data.store,
                    baseSalary: data.baseSalary || 0,
                    overtimePay: data.overtimePay || 0,
                    bonusAmount: data.bonusAmount || 0,
                    totalSalary: data.totalSalary || 0,
                    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                    attendanceRate: data.attendanceRate || 0,
                    performanceScore: data.performanceScore || 0
                });
            });
            
            // 按月份排序
            records.sort((a, b) => {
                return a.month.localeCompare(b.month);
            });
            
            return records;
        } catch (error) {
            console.error('獲取歷史薪資數據時發生錯誤:', error);
            throw error;
        }
    }
    
    /**
     * 獲取員工績效數據
     * @param {string} employeeId - 員工ID
     * @returns {Promise<Array>} - 績效數據數組
     */
    async fetchPerformanceData(employeeId) {
        try {
            if (employeeId === 'all') {
                return [];
            }
            
            const snapshot = await this.db.collection('performance_reviews')
                .where('userId', '==', employeeId)
                .orderBy('reviewDate', 'asc')
                .get();
            
            if (snapshot.empty) {
                console.log('沒有找到績效評估記錄');
                return [];
            }
            
            let records = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                records.push({
                    id: doc.id,
                    reviewDate: data.reviewDate ? data.reviewDate.toDate() : new Date(),
                    userId: data.userId,
                    overallScore: data.overallScore || 0,
                    categoryScores: data.categoryScores || {},
                    comments: data.comments || ''
                });
            });
            
            return records;
        } catch (error) {
            console.error('獲取績效數據時發生錯誤:', error);
            return [];
        }
    }
    
    /**
     * 獲取員工出勤數據
     * @param {string} employeeId - 員工ID
     * @returns {Promise<Array>} - 出勤數據數組
     */
    async fetchAttendanceData(employeeId) {
        try {
            if (employeeId === 'all') {
                return [];
            }
            
            // 獲取過去12個月的出勤記錄
            const oneYearAgo = new Date();
            oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);
            
            const snapshot = await this.db.collection('attendance_summaries')
                .where('userId', '==', employeeId)
                .where('month', '>=', this.formatYearMonth(oneYearAgo))
                .orderBy('month', 'asc')
                .get();
            
            if (snapshot.empty) {
                console.log('沒有找到出勤摘要記錄');
                return [];
            }
            
            let records = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                records.push({
                    id: doc.id,
                    month: data.month,
                    userId: data.userId,
                    onTimeRate: data.onTimeRate || 0,
                    absentDays: data.absentDays || 0,
                    lateCount: data.lateCount || 0,
                    totalWorkDays: data.totalWorkDays || 0,
                    totalHours: data.totalHours || 0,
                    overtimeHours: data.overtimeHours || 0
                });
            });
            
            return records;
        } catch (error) {
            console.error('獲取出勤數據時發生錯誤:', error);
            return [];
        }
    }

    /**
     * 格式化年月 (YYYY-MM)
     * @param {Date} date - 日期對象
     * @returns {string} - 格式化的年月字符串
     */
    formatYearMonth(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }
    
    /**
     * 生成單一預測
     */
    async generateSinglePrediction() {
        try {
            // 顯示載入指示器
            this.showLoading('#prediction-result-container');
            
            // 獲取表單數據
            const employeeId = document.getElementById('employee-select').value;
            const storeId = document.getElementById('store-select').value;
            const predictionMonths = parseInt(document.getElementById('prediction-months').value) || 6;
            const factorWeight = document.getElementById('weight-factor-select').value || 'balanced';
            
            // 驗證輸入
            if (!employeeId || employeeId === 'select') {
                this.showTemporaryMessage('請選擇員工', 'warning');
                this.clearLoading('#prediction-result-container');
                return;
            }
            
            if (!storeId || storeId === 'select') {
                this.showTemporaryMessage('請選擇分店', 'warning');
                this.clearLoading('#prediction-result-container');
                return;
            }
            
            // 獲取歷史薪資數據
            const historicalData = await this.fetchHistoricalSalaryData(employeeId, storeId);
            
            if (historicalData.length < 6) {
                this.showTemporaryMessage('歷史薪資數據不足，需要至少6個月的數據進行預測', 'warning');
                this.clearLoading('#prediction-result-container');
                return;
            }
            
            this.historicalData = historicalData;
            
            // 獲取績效和出勤數據
            const performanceData = await this.fetchPerformanceData(employeeId);
            const attendanceData = await this.fetchAttendanceData(employeeId);
            
            // 獲取選擇的模型類型
            const modelType = document.getElementById('prediction-model-select').value || this.currentModelType;
            
            // 準備因子數據
            const factorData = {
                performance: performanceData,
                attendance: attendanceData,
                tenureBonus: 0
            };
            
            // 計算年資獎勵
            if (this.userData && this.userData.hireDate) {
                const hireDate = this.userData.hireDate.toDate ? this.userData.hireDate.toDate() : new Date(this.userData.hireDate);
                const now = new Date();
                const tenureYears = (now - hireDate) / (365 * 24 * 60 * 60 * 1000);
                factorData.tenureBonus = Math.min(0.05, tenureYears * 0.01); // 每年增加1%，最多5%
            }
            
            // 使用模型進行預測
            let prediction;
            const model = this.getCurrentModel(modelType);
            
            if (model) {
                // 使用新模型進行預測
                prediction = model.predict(historicalData, factorData, predictionMonths, factorWeight);
            } else {
                // 備用方法: 使用原有預測邏輯
                prediction = this.generatePrediction(historicalData, performanceData, attendanceData, predictionMonths, factorWeight);
            }
            
            this.predictedData = prediction;
            
            // 更新圖表和摘要
            this.updatePredictionCharts(historicalData, prediction);
            this.updatePredictionSummary(prediction);
            this.updatePredictionTable(prediction.monthlySalaries);
            
            // 顯示預測結果區域
            const resultContainer = document.getElementById('prediction-result');
            if (resultContainer) {
                resultContainer.classList.remove('d-none');
            }
            
            // 記錄活動
            console.log('生成預測結果:', {
                employeeId,
                storeId,
                predictionMonths,
                factorWeight,
                modelType,
                dataPoints: historicalData.length
            });
            
            this.clearLoading('#prediction-result-container');
        } catch (error) {
            console.error('生成預測時發生錯誤:', error);
            this.showTemporaryMessage('生成預測時發生錯誤: ' + error.message, 'error');
            this.clearLoading('#prediction-result-container');
        }
    }
    
    /**
     * 生成預測數據
     * @param {Array} historicalData - 歷史薪資數據
     * @param {Array} performanceData - 績效數據
     * @param {Array} attendanceData - 出勤數據
     * @param {number} predictionMonths - 預測月數
     * @param {string} factorWeight - 因子權重類型
     * @returns {Object} - 預測結果
     */
    generatePrediction(historicalData, performanceData, attendanceData, predictionMonths, factorWeight) {
        // 使用選擇的權重類型
        const weights = this.weightFactors[factorWeight] || this.weightFactors.balanced;
        
        // 分析歷史薪資趨勢
        const baseSalaryTrend = this.analyzeTrend(historicalData.map(item => item.baseSalary));
        const overtimeTrend = this.analyzeTrend(historicalData.map(item => item.overtimePay));
        const bonusTrend = this.analyzeTrend(historicalData.map(item => item.bonusAmount));
        
        // 獲取最近的薪資記錄作為基準
        const latestSalary = historicalData[historicalData.length - 1];
        
        // 計算員工年資（如果有入職日期）
        let tenureBonus = 0;
        if (this.userData && this.userData.hireDate) {
            const hireDate = this.userData.hireDate.toDate ? this.userData.hireDate.toDate() : new Date(this.userData.hireDate);
            const now = new Date();
            const tenureYears = (now - hireDate) / (365 * 24 * 60 * 60 * 1000);
            tenureBonus = Math.min(0.05, tenureYears * 0.01); // 每年增加1%，最多5%
        }
        
        // 計算績效趨勢
        let performanceFactor = 0;
        if (performanceData.length > 0) {
            const recentPerformance = performanceData.slice(-3); // 最近3次績效
            const avgScore = recentPerformance.reduce((sum, item) => sum + item.overallScore, 0) / recentPerformance.length;
            performanceFactor = (avgScore - 3) / 5; // 假設評分範圍是1-5，3分是標準
        }
        
        // 計算出勤趨勢
        let attendanceFactor = 0;
        if (attendanceData.length > 0) {
            const recentAttendance = attendanceData.slice(-3); // 最近3個月
            const avgOnTimeRate = recentAttendance.reduce((sum, item) => sum + item.onTimeRate, 0) / recentAttendance.length;
            attendanceFactor = (avgOnTimeRate - 0.9) * 0.5; // 假設準時率90%是標準
        }
        
        // 計算季節性因素（例如：年終獎金可能在1-2月發放）
        const currentMonth = new Date().getMonth();
        const seasonalFactors = [0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.15]; // 假設1月和12月有額外的季節因素
        const seasonalFactor = seasonalFactors[currentMonth];
        
        // 綜合各因素，計算整體增長預期
        const expectedGrowthRate = 
            baseSalaryTrend * 0.5 + // 基本薪資趨勢
            performanceFactor * weights.performance + // 績效因素
            attendanceFactor * weights.attendance + // 出勤因素
            tenureBonus * weights.tenure + // 年資因素
            seasonalFactor * weights.seasonal; // 季節因素
        
        // 計算預測月份
        const lastMonth = historicalData[historicalData.length - 1].month;
        const [lastYear, lastMonthNum] = lastMonth.split('-').map(Number);
        
        // 生成月份標籤和預測值
        const monthLabels = [];
        const predictedSalaries = [];
        const confidenceUpper = [];
        const confidenceLower = [];
        const baseSalaries = [];
        const overtimePays = [];
        const bonusAmounts = [];
        
        // 月度波動性（用於計算信心區間）
        const volatility = this.calculateVolatility(historicalData.map(item => item.totalSalary));
        
        // 最近的基本薪資、加班和獎金
        let lastBaseSalary = latestSalary.baseSalary;
        let lastOvertime = latestSalary.overtimePay;
        let lastBonus = latestSalary.bonusAmount;
        
        // 預測每月薪資
        const monthlySalaries = [];
        
        for (let i = 0; i < predictionMonths; i++) {
            const predictionDate = new Date(lastYear, lastMonthNum + i, 1);
            const monthLabel = this.formatYearMonth(predictionDate);
            monthLabels.push(monthLabel);
            
            // 計算預測月的各組成部分
            const monthInYear = predictionDate.getMonth();
            const isEndOfYear = (monthInYear === 11 || monthInYear === 0); // 12月或1月
            
            // 基本薪資小幅增長
            const baseSalary = lastBaseSalary * (1 + baseSalaryTrend * (i + 1) / 24); // 每年增長率的一部分
            baseSalaries.push(baseSalary);
            
            // 加班費波動
            const overtimeMultiplier = 1 + (Math.sin(i / 2) * 0.1) + (Math.random() * 0.05);
            const overtime = lastOvertime * overtimeMultiplier;
            overtimePays.push(overtime);
            
            // 獎金（年終或績效導向）
            let bonus = lastBonus;
            if (isEndOfYear) {
                bonus *= 1.5; // 年終時增加
            }
            
            // 績效和出勤影響獎金
            bonus *= (1 + performanceFactor * 0.2 + attendanceFactor * 0.1);
            bonusAmounts.push(bonus);
            
            // 總薪資
            const totalSalary = baseSalary + overtime + bonus;
            predictedSalaries.push(totalSalary);
            
            // 計算信心區間
            const confidenceMargin = totalSalary * volatility * (i + 1) / predictionMonths * (1 - this.confidenceLevel);
            confidenceUpper.push(totalSalary + confidenceMargin);
            confidenceLower.push(totalSalary - confidenceMargin);
            
            // 添加到月薪數組
            monthlySalaries.push({
                month: monthLabel,
                baseSalary: baseSalary,
                overtimePay: overtime,
                bonusAmount: bonus,
                totalSalary: totalSalary,
                change: i === 0 ? 0 : (totalSalary / predictedSalaries[i-1] - 1)
            });
            
            // 更新最近薪資，用於下一次迭代
            lastBaseSalary = baseSalary;
            lastOvertime = overtime;
            lastBonus = bonus;
        }
        
        // 生成跟出勤績效關聯的資料點
        const correlationData = this.generateCorrelationData(attendanceData, performanceData);
        
        // 計算關鍵指標
        const averageSalary = predictedSalaries.reduce((sum, val) => sum + val, 0) / predictionMonths;
        const totalIncrease = (predictedSalaries[predictionMonths - 1] / predictedSalaries[0]) - 1;
        const keyFactors = this.determineKeyFactors(factorWeight, performanceFactor, attendanceFactor, tenureBonus, seasonalFactor);
        
        return {
            monthLabels,
            historicalLabels: historicalData.map(item => item.month),
            historicalValues: historicalData.map(item => item.totalSalary),
            predictedSalaries,
            confidenceUpper,
            confidenceLower,
            baseSalaries,
            overtimePays,
            bonusAmounts,
            monthlySalaries,
            correlationData,
            averageSalary,
            totalIncrease,
            keyFactors,
            accuracy: this.confidenceLevel,
            factorWeight
        };
    }
    
    /**
     * 分析數據趨勢（線性回歸）
     * @param {Array} data - 數據數組
     * @returns {number} - 趨勢斜率
     */
    analyzeTrend(data) {
        if (data.length < 2) return 0;
        
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += data[i];
            sumXY += i * data[i];
            sumX2 += i * i;
        }
        
        // 計算斜率：(n * Σxy - Σx * Σy) / (n * Σx² - (Σx)²)
        const denominator = n * sumX2 - sumX * sumX;
        if (denominator === 0) return 0;
        
        const slope = (n * sumXY - sumX * sumY) / denominator;
        
        // 將斜率轉換為百分比變化率（相對於最後一個值）
        const latestValue = data[data.length - 1];
        if (latestValue === 0) return 0;
        
        return slope / latestValue;
    }
    
    /**
     * 計算數據波動性（標準差/平均值）
     * @param {Array} data - 數據數組
     * @returns {number} - 波動性係數
     */
    calculateVolatility(data) {
        if (data.length < 2) return 0.05; // 默認波動性
        
        const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
        if (mean === 0) return 0.05;
        
        const squaredDiffs = data.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / data.length;
        const stdDev = Math.sqrt(variance);
        
        return stdDev / mean;
    }
    
    /**
     * 生成出勤和績效的關聯數據
     * @param {Array} attendanceData - 出勤數據
     * @param {Array} performanceData - 績效數據
     * @returns {Array} - 關聯數據點
     */
    generateCorrelationData(attendanceData, performanceData) {
        const correlationData = [];
        
        // 如果任一數據為空，返回空數組
        if (attendanceData.length === 0 || performanceData.length === 0) {
            return correlationData;
        }
        
        // 對每個月份的數據進行配對
        for (const attendance of attendanceData) {
            // 查找最接近的績效評估
            const month = attendance.month;
            const [year, monthNum] = month.split('-').map(Number);
            const monthDate = new Date(year, monthNum - 1, 15); // 月中
            
            let closestPerformance = null;
            let minTimeDiff = Infinity;
            
            for (const performance of performanceData) {
                const reviewDate = performance.reviewDate;
                const timeDiff = Math.abs(reviewDate - monthDate);
                
                if (timeDiff < minTimeDiff) {
                    minTimeDiff = timeDiff;
                    closestPerformance = performance;
                }
            }
            
            // 如果找到匹配的績效評估，創建數據點
            if (closestPerformance) {
                correlationData.push({
                    x: attendance.onTimeRate,
                    y: closestPerformance.overallScore
                });
            }
        }
        
        return correlationData;
    }
    
    /**
     * 確定關鍵影響因子
     * @param {string} factorWeight - 因子權重類型
     * @param {number} performanceFactor - 績效因子
     * @param {number} attendanceFactor - 出勤因子
     * @param {number} tenureBonus - 年資獎勵
     * @param {number} seasonalFactor - 季節因子
     * @returns {Array} - 關鍵因子陣列
     */
    determineKeyFactors(factorWeight, performanceFactor, attendanceFactor, tenureBonus, seasonalFactor) {
        const factors = [
            { name: '績效表現', value: performanceFactor, weight: this.weightFactors[factorWeight].performance },
            { name: '出勤狀況', value: attendanceFactor, weight: this.weightFactors[factorWeight].attendance },
            { name: '年資獎勵', value: tenureBonus, weight: this.weightFactors[factorWeight].tenure },
            { name: '季節性因素', value: seasonalFactor, weight: this.weightFactors[factorWeight].seasonal }
        ];
        
        // 按權重排序
        factors.sort((a, b) => b.weight - a.weight);
        
        // 返回前三個因素
        return factors.slice(0, 3);
    }
    
    /**
     * 更新預測圖表
     * @param {Array} historicalData - 歷史數據
     * @param {Object} prediction - 預測結果
     */
    updatePredictionCharts(historicalData, prediction) {
        // 更新薪資趨勢圖
        if (this.charts.salaryTrend) {
            this.charts.salaryTrend.data.labels = [...prediction.historicalLabels, ...prediction.monthLabels];
            
            // 歷史數據
            this.charts.salaryTrend.data.datasets[0].data = [
                ...prediction.historicalValues,
                ...Array(prediction.monthLabels.length).fill(null)
            ];
            
            // 預測薪資
            this.charts.salaryTrend.data.datasets[1].data = [
                ...Array(prediction.historicalLabels.length).fill(null),
                ...prediction.predictedSalaries
            ];
            
            // 信心區間上限
            this.charts.salaryTrend.data.datasets[2].data = [
                ...Array(prediction.historicalLabels.length).fill(null),
                ...prediction.confidenceUpper
            ];
            
            // 信心區間下限
            this.charts.salaryTrend.data.datasets[3].data = [
                ...Array(prediction.historicalLabels.length).fill(null),
                ...prediction.confidenceLower
            ];
            
            this.charts.salaryTrend.update();
        }
        
        // 更新獎金預測圖
        if (this.charts.bonusPrediction) {
            this.charts.bonusPrediction.data.labels = prediction.monthLabels;
            this.charts.bonusPrediction.data.datasets[0].data = prediction.bonusAmounts;
            this.charts.bonusPrediction.update();
        }
        
        // 更新出勤與績效關聯圖
        if (this.charts.performanceCorrelation) {
            this.charts.performanceCorrelation.data.datasets[0].data = prediction.correlationData;
            this.charts.performanceCorrelation.update();
        }
    }
    
    /**
     * 更新預測摘要
     * @param {Object} prediction - 預測結果
     */
    updatePredictionSummary(prediction) {
        // 更新準確度
        const accuracyBar = document.getElementById('accuracy-bar');
        const accuracyValue = document.getElementById('accuracy-value');
        
        if (accuracyBar && accuracyValue) {
            const accuracyPercentage = Math.round(prediction.accuracy * 100);
            accuracyBar.style.width = `${accuracyPercentage}%`;
            accuracyValue.textContent = `${accuracyPercentage}%`;
        }
        
        // 更新關鍵因子
        const keyFactorsContainer = document.getElementById('key-factors');
        if (keyFactorsContainer) {
            keyFactorsContainer.innerHTML = '';
            
            prediction.keyFactors.forEach(factor => {
                const badge = document.createElement('span');
                badge.className = 'badge rounded-pill factor-badge me-1 mb-1';
                
                // 根據因子值設定顏色
                const value = factor.value;
                if (value > 0.05) {
                    badge.classList.add('bg-success');
                } else if (value > 0) {
                    badge.classList.add('bg-info');
                } else if (value > -0.05) {
                    badge.classList.add('bg-warning');
                } else {
                    badge.classList.add('bg-danger');
                }
                
                // 設定文字
                badge.textContent = factor.name;
                keyFactorsContainer.appendChild(badge);
            });
        }
        
        // 更新預測變動
        const predictionChange = document.getElementById('prediction-change');
        if (predictionChange) {
            const totalChange = prediction.totalIncrease;
            const formattedChange = (totalChange >= 0 ? '+' : '') + (totalChange * 100).toFixed(1) + '%';
            
            predictionChange.textContent = formattedChange;
            predictionChange.className = totalChange >= 0 ? 'text-success' : 'text-danger';
        }
    }
    
    /**
     * 更新預測表格
     * @param {Array} monthlySalaries - 月薪數據數組
     */
    updatePredictionTable(monthlySalaries) {
        const tableBody = document.getElementById('prediction-details-body');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        monthlySalaries.forEach((salary, index) => {
            const row = document.createElement('tr');
            
            // 月份
            const monthCell = document.createElement('td');
            monthCell.textContent = salary.month;
            row.appendChild(monthCell);
            
            // 基本薪資
            const baseCell = document.createElement('td');
            baseCell.textContent = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(salary.baseSalary);
            row.appendChild(baseCell);
            
            // 加班費
            const overtimeCell = document.createElement('td');
            overtimeCell.textContent = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(salary.overtimePay);
            row.appendChild(overtimeCell);
            
            // 獎金
            const bonusCell = document.createElement('td');
            bonusCell.textContent = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(salary.bonusAmount);
            row.appendChild(bonusCell);
            
            // 總計
            const totalCell = document.createElement('td');
            totalCell.textContent = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(salary.totalSalary);
            totalCell.className = 'fw-bold';
            row.appendChild(totalCell);
            
            // 變動比例
            const changeCell = document.createElement('td');
            if (index === 0) {
                changeCell.textContent = '-';
            } else {
                const change = salary.change;
                const formattedChange = (change >= 0 ? '+' : '') + (change * 100).toFixed(1) + '%';
                changeCell.textContent = formattedChange;
                changeCell.className = change >= 0 ? 'text-success' : 'text-danger';
            }
            row.appendChild(changeCell);
            
            tableBody.appendChild(row);
        });
    }
    
    /**
     * 顯示臨時訊息
     * @param {string} message - 訊息內容
     * @param {string} type - 訊息類型 (success, error, warning, info)
     */
    showTemporaryMessage(message, type = 'info') {
        // 檢查是否已有警告容器
        let alertContainer = document.getElementById('alert-container');
        
        // 如果沒有，則創建一個
        if (!alertContainer) {
            alertContainer = document.createElement('div');
            alertContainer.id = 'alert-container';
            alertContainer.style.position = 'fixed';
            alertContainer.style.top = '20px';
            alertContainer.style.right = '20px';
            alertContainer.style.zIndex = '9999';
            alertContainer.style.maxWidth = '350px';
            document.body.appendChild(alertContainer);
        }
        
        // 創建警告元素
        const alertElement = document.createElement('div');
        alertElement.className = `alert alert-${type} alert-dismissible fade show`;
        alertElement.style.marginBottom = '10px';
        alertElement.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        // 添加到容器
        alertContainer.appendChild(alertElement);
        
        // 設置自動消失
        setTimeout(() => {
            if (alertElement && alertElement.parentNode) {
                const bootstrap = window.bootstrap;
                if (bootstrap && bootstrap.Alert) {
                    const bsAlert = new bootstrap.Alert(alertElement);
                    bsAlert.close();
                } else {
                    alertElement.remove();
                }
            }
        }, 5000);
    }
    
    /**
     * 添加預測場景
     */
    addScenario() {
        try {
            // 獲取表單數據
            const employeeId = document.getElementById('comparison-employee').value;
            const storeId = document.getElementById('comparison-store').value;
            const predictionMonths = parseInt(document.getElementById('comparison-months').value) || 6;
            const weight = document.getElementById('comparison-weight').value;
            const modelType = document.getElementById('comparison-model-select')?.value || this.currentModelType;
            const scenarioName = document.getElementById('scenario-name').value || `情境 ${this.scenarioCounter + 1}`;
            
            // 驗證輸入
            if (!employeeId || employeeId === 'select') {
                this.showTemporaryMessage('請選擇員工', 'warning');
                return;
            }
            
            if (!storeId || storeId === 'select') {
                this.showTemporaryMessage('請選擇分店', 'warning');
                return;
            }
            
            // 生成唯一ID
            const scenarioId = 'scenario-' + Date.now();
            this.scenarioCounter++;
            
            // 獲取參考字符串
            const employeeName = this.employeeList.find(e => e.id === employeeId)?.name || employeeId;
            const storeName = this.storeList.find(s => s.id === storeId)?.name || storeId;
            
            // 添加場景卡片
            const scenariosContainer = document.getElementById('scenarios-container');
            
            if (scenariosContainer) {
                // 隱藏空場景提示
                const emptyScenarioMessage = document.getElementById('empty-scenario-message');
                if (emptyScenarioMessage) {
                    emptyScenarioMessage.classList.add('d-none');
                }
                
                // 創建場景卡片
                const scenarioCard = document.createElement('div');
                scenarioCard.id = scenarioId;
                scenarioCard.className = 'scenario-card mb-3 border rounded p-3 position-relative';
                
                // 設置場景卡片內容
                scenarioCard.innerHTML = `
                    <button type="button" class="btn-close position-absolute top-0 end-0 m-2" 
                            aria-label="移除場景" data-scenario-id="${scenarioId}"></button>
                    <div class="row align-items-center">
                        <div class="col-md-8">
                            <div class="mb-2">
                                <input type="text" class="form-control scenario-name-input" value="${scenarioName}" 
                                       placeholder="情境名稱" data-scenario-id="${scenarioId}">
                            </div>
                            <div>
                                <span class="badge bg-primary me-1">員工: ${employeeName}</span>
                                <span class="badge bg-secondary me-1">門市: ${storeName}</span>
                                <span class="badge bg-info me-1">期間: ${predictionMonths} 個月</span>
                                <span class="badge bg-dark me-1 model-badge">${ModelOptions?.find(m => m.value === modelType)?.label || '線性回歸模型'}</span>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="mb-2">
                                <select class="form-select weight-select" data-scenario-id="${scenarioId}">
                                    <option value="balanced" ${weight === 'balanced' ? 'selected' : ''}>平衡權重</option>
                                    <option value="attendance" ${weight === 'attendance' ? 'selected' : ''}>出勤優先</option>
                                    <option value="performance" ${weight === 'performance' ? 'selected' : ''}>績效優先</option>
                                    <option value="tenure" ${weight === 'tenure' ? 'selected' : ''}>年資優先</option>
                                </select>
                            </div>
                            <div>
                                <select class="form-select assumption-select" data-scenario-id="${scenarioId}">
                                    <option value="neutral">中性假設</option>
                                    <option value="optimistic">樂觀假設</option>
                                    <option value="pessimistic">保守假設</option>
                                </select>
                            </div>
                        </div>
                    </div>
                `;
                
                scenariosContainer.appendChild(scenarioCard);
                
                // 存儲場景數據
                this.scenarios[scenarioId] = {
                    id: scenarioId,
                    name: scenarioName,
                    employeeId,
                    employeeName,
                    storeId,
                    storeName,
                    predictionMonths,
                    weight,
                    modelType,
                    assumption: 'neutral'
                };
                
                // 添加事件監聽器
                // 1. 移除按鈕
                const removeBtn = scenarioCard.querySelector('.btn-close');
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => {
                        this.removeScenario(scenarioId);
                    });
                }
                
                // 2. 名稱輸入
                const nameInput = scenarioCard.querySelector('.scenario-name-input');
                if (nameInput) {
                    nameInput.addEventListener('change', (e) => {
                        this.scenarios[scenarioId].name = e.target.value;
                    });
                }
                
                // 3. 權重選擇
                const weightSelect = scenarioCard.querySelector('.weight-select');
                if (weightSelect) {
                    weightSelect.addEventListener('change', (e) => {
                        this.scenarios[scenarioId].weight = e.target.value;
                    });
                }
                
                // 4. 假設選擇
                const assumptionSelect = scenarioCard.querySelector('.assumption-select');
                if (assumptionSelect) {
                    assumptionSelect.addEventListener('change', (e) => {
                        this.scenarios[scenarioId].assumption = e.target.value;
                    });
                }
            }
            
            // 啟用比較按鈕（如果至少有兩個場景）
            this.updateCompareButtonState();
            
            // 清空表單
            document.getElementById('scenario-name').value = `情境 ${this.scenarioCounter + 1}`;
        } catch (error) {
            console.error('添加場景時發生錯誤:', error);
            this.showTemporaryMessage('添加場景時發生錯誤: ' + error.message, 'error');
        }
    }
    
    /**
     * 移除預測場景
     * @param {string} scenarioId - 場景ID
     */
    removeScenario(scenarioId) {
        const scenarioCard = document.querySelector(`.scenario-card[data-scenario-id="${scenarioId}"]`);
        if (!scenarioCard) return;
        
        // 移除場景卡片
        scenarioCard.remove();
        
        // 移除場景對象
        delete this.scenarios[scenarioId];
        
        // 檢查是否還有場景
        const scenarioContainer = document.getElementById('scenario-container');
        const noScenariosMessage = document.getElementById('no-scenarios-message');
        const compareActions = document.getElementById('compare-actions');
        
        if (scenarioContainer && scenarioContainer.querySelectorAll('.scenario-card').length === 0) {
            // 顯示無場景消息
            if (noScenariosMessage) {
                noScenariosMessage.classList.remove('d-none');
            }
            
            // 隱藏比較按鈕
            if (compareActions) {
                compareActions.classList.add('d-none');
            }
        }
    }
    
    /**
     * 清除所有場景
     */
    clearScenarios() {
        const scenarioContainer = document.getElementById('scenario-container');
        const noScenariosMessage = document.getElementById('no-scenarios-message');
        const compareActions = document.getElementById('compare-actions');
        
        if (!scenarioContainer) return;
        
        // 移除所有場景卡片
        const scenarioCards = scenarioContainer.querySelectorAll('.scenario-card');
        scenarioCards.forEach(card => {
            card.remove();
        });
        
        // 清空場景對象
        this.scenarios = {};
        
        // 重置計數器
        this.scenarioCounter = 0;
        
        // 顯示無場景消息
        if (noScenariosMessage) {
            noScenariosMessage.classList.remove('d-none');
        }
        
        // 隱藏比較按鈕
        if (compareActions) {
            compareActions.classList.add('d-none');
        }
    }
    
    /**
     * 生成多場景對比
     */
    async generateComparison() {
        try {
            // 檢查場景數量
            const scenarioIds = Object.keys(this.scenarios);
            if (scenarioIds.length < 2) {
                this.showTemporaryMessage('請至少添加兩個情境以進行比較', 'warning');
                return;
            }
            
            // 顯示載入指示器
            this.showLoading('#comparison-result-container');
            
            // 獲取表單數據
            const predictionMonths = parseInt(document.getElementById('comparison-months').value) || 6;
            
            // 預測結果數組
            const scenarioPredictions = [];
            
            // 獲取每個場景的預測結果
            for (const scenarioId of scenarioIds) {
                const scenario = this.scenarios[scenarioId];
                
                // 獲取歷史薪資數據
                const historicalData = await this.fetchHistoricalSalaryData(scenario.employeeId, scenario.storeId);
                
                if (historicalData.length < 6) {
                    this.showTemporaryMessage(`情境 "${scenario.name}" 的歷史數據不足，需要至少6個月的數據`, 'warning');
                    continue;
                }
                
                // 獲取績效和出勤數據
                const performanceData = await this.fetchPerformanceData(scenario.employeeId);
                const attendanceData = await this.fetchAttendanceData(scenario.employeeId);
                
                // 準備因子數據
                const factorData = {
                    performance: performanceData,
                    attendance: attendanceData,
                    tenureBonus: 0
                };
                
                // 獲取員工數據來計算年資
                const userDoc = await this.db.collection('users').doc(scenario.employeeId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData.hireDate) {
                        const hireDate = userData.hireDate.toDate ? userData.hireDate.toDate() : new Date(userData.hireDate);
                        const now = new Date();
                        const tenureYears = (now - hireDate) / (365 * 24 * 60 * 60 * 1000);
                        factorData.tenureBonus = Math.min(0.05, tenureYears * 0.01); // 每年增加1%，最多5%
                    }
                }
                
                // 獲取模型實例
                const model = this.getCurrentModel(scenario.modelType);
                
                // 根據假設調整模型配置
                let adjustedConfig = { ...this.modelConfig[scenario.modelType] };
                
                if (scenario.assumption === 'optimistic') {
                    adjustedConfig.confidenceLevel = Math.min(0.99, adjustedConfig.confidenceLevel + 0.1);
                    // 樂觀情境: 增加績效和年資的權重
                    if (adjustedConfig.weightFactors && adjustedConfig.weightFactors[scenario.weight]) {
                        const weights = { ...adjustedConfig.weightFactors[scenario.weight] };
                        weights.performance = Math.min(0.8, weights.performance * 1.2);
                        weights.tenure = Math.min(0.8, weights.tenure * 1.2);
                        adjustedConfig.weightFactors = { 
                            ...adjustedConfig.weightFactors,
                            [scenario.weight]: weights
                        };
                    }
                } else if (scenario.assumption === 'pessimistic') {
                    adjustedConfig.confidenceLevel = Math.max(0.6, adjustedConfig.confidenceLevel - 0.15);
                    // 保守情境: 降低季節性和績效的權重
                    if (adjustedConfig.weightFactors && adjustedConfig.weightFactors[scenario.weight]) {
                        const weights = { ...adjustedConfig.weightFactors[scenario.weight] };
                        weights.performance = Math.max(0.1, weights.performance * 0.8);
                        weights.seasonal = Math.max(0.05, weights.seasonal * 0.5);
                        adjustedConfig.weightFactors = { 
                            ...adjustedConfig.weightFactors,
                            [scenario.weight]: weights
                        };
                    }
                }
                
                // 使用模型進行預測
                let prediction;
                if (model) {
                    // 創建一個具有調整配置的臨時模型
                    const tempModel = new this.availableModels[scenario.modelType](adjustedConfig);
                    prediction = tempModel.predict(historicalData, factorData, predictionMonths, scenario.weight);
                } else {
                    // 備用方法: 使用原有預測邏輯
                    prediction = this.generatePrediction(historicalData, performanceData, attendanceData, predictionMonths, scenario.weight);
                }
                
                // 添加場景信息
                scenarioPredictions.push({
                    ...prediction,
                    scenarioId,
                    scenarioName: scenario.name,
                    employeeId: scenario.employeeId,
                    employeeName: scenario.employeeName,
                    storeId: scenario.storeId,
                    storeName: scenario.storeName,
                    weight: scenario.weight,
                    assumption: scenario.assumption,
                    modelType: scenario.modelType
                });
            }
            
            // 檢查是否至少有兩個有效的預測
            if (scenarioPredictions.length < 2) {
                this.showTemporaryMessage('無法生成至少兩個有效的預測結果，請檢查數據', 'warning');
                this.clearLoading('#comparison-result-container');
                return;
            }
            
            // 更新比較圖表和表格
            this.updateComparisonCharts(scenarioPredictions, predictionMonths);
            this.updateComparisonTable(scenarioPredictions, predictionMonths);
            this.createScenarioDetailsAccordion(scenarioPredictions, predictionMonths);
            
            // 生成推薦
            const recommendation = this.generateRecommendation(scenarioPredictions, predictionMonths);
            const recommendationContainer = document.getElementById('recommendation-container');
            if (recommendationContainer) {
                recommendationContainer.innerHTML = recommendation;
            }
            
            // 顯示比較結果
            const comparisonResult = document.getElementById('comparison-result');
            if (comparisonResult) {
                comparisonResult.classList.remove('d-none');
            }
            
            this.clearLoading('#comparison-result-container');
        } catch (error) {
            console.error('生成比較時發生錯誤:', error);
            this.showTemporaryMessage('生成比較時發生錯誤: ' + error.message, 'error');
            this.clearLoading('#comparison-result-container');
        }
    }
    
    /**
     * 匯出為CSV
     * @param {string} mode - 匯出模式 ('single' 或 'comparison')
     */
    exportToCsv(mode = 'single') {
        try {
            let csvContent = '';
            let fileName = '';
            
            if (mode === 'single') {
                // 獲取預測表格數據
                const table = document.getElementById('prediction-details-table');
                if (!table) {
                    this.showTemporaryMessage('沒有可匯出的預測數據', 'warning');
                    return;
                }
                
                // 標題行
                const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
                csvContent = headers.join(',') + '\n';
                
                // 數據行
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const rowData = Array.from(row.querySelectorAll('td')).map(cell => {
                        // 移除貨幣符號和千分位逗號
                        let text = cell.textContent.replace(/[NT$,]/g, '');
                        // 如果包含百分比，轉換為小數
                        if (text.includes('%')) {
                            text = parseFloat(text.replace('%', '')) / 100;
                        }
                        return `"${text}"`;
                    });
                    csvContent += rowData.join(',') + '\n';
                });
                
                fileName = '薪資預測_' + new Date().toISOString().slice(0, 10) + '.csv';
            } else {
                // 獲取比較表格數據
                const table = document.getElementById('comparison-table');
                if (!table) {
                    this.showTemporaryMessage('沒有可匯出的比較數據', 'warning');
                    return;
                }
                
                // 標題行（合併多行標題）
                let headerRow1 = Array.from(table.querySelectorAll('thead tr:first-child th'));
                let headerRow2 = Array.from(table.querySelectorAll('thead tr:last-child th'));
                
                let headers = [];
                let colIndex = 0;
                
                headerRow1.forEach(th => {
                    const colspan = parseInt(th.getAttribute('colspan')) || 1;
                    if (colspan > 1) {
                        // 有跨列的標題，從第二行獲取子標題
                        for (let i = 0; i < colspan; i++) {
                            headers.push(th.textContent + ' - ' + headerRow2[colIndex + i].textContent);
                        }
                        colIndex += colspan;
                    } else if (th.getAttribute('rowspan')) {
                        // 有跨行的標題，直接使用
                        headers.push(th.textContent);
                    }
                });
                
                csvContent = headers.join(',') + '\n';
                
                // 數據行
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const rowData = Array.from(row.querySelectorAll('td')).map(cell => {
                        // 移除貨幣符號和千分位逗號
                        let text = cell.textContent.replace(/[NT$,]/g, '');
                        // 如果包含百分比，轉換為小數
                        if (text.includes('%')) {
                            text = parseFloat(text.replace('%', '')) / 100;
                        }
                        return `"${text}"`;
                    });
                    csvContent += rowData.join(',') + '\n';
                });
                
                fileName = '薪資預測比較_' + new Date().toISOString().slice(0, 10) + '.csv';
            }
            
            // 創建下載
            const encodedUri = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showTemporaryMessage('CSV 檔案匯出成功', 'success');
        } catch (error) {
            console.error('匯出CSV時發生錯誤:', error);
            this.showTemporaryMessage('匯出CSV時發生錯誤: ' + error.message, 'error');
        }
    }
    
    /**
     * 匯出為PDF
     * @param {string} mode - 匯出模式 ('single' 或 'comparison')
     */
    exportToPdf(mode = 'single') {
        try {
            let targetElement = null;
            let fileName = '';
            
            if (mode === 'single') {
                targetElement = document.getElementById('prediction-results');
                fileName = '薪資預測_' + new Date().toISOString().slice(0, 10) + '.pdf';
            } else {
                targetElement = document.getElementById('comparison-results');
                fileName = '薪資預測比較_' + new Date().toISOString().slice(0, 10) + '.pdf';
            }
            
            if (!targetElement) {
                this.showTemporaryMessage('沒有可匯出的數據', 'warning');
                return;
            }
            
            // 使用html2canvas和jsPDF
            html2canvas(targetElement).then(canvas => {
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jspdf.jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });
                
                const width = pdf.internal.pageSize.getWidth();
                const height = (canvas.height * width) / canvas.width;
                
                pdf.addImage(imgData, 'PNG', 0, 0, width, height);
                pdf.save(fileName);
                
                this.showTemporaryMessage('PDF 檔案匯出成功', 'success');
            });
        } catch (error) {
            console.error('匯出PDF時發生錯誤:', error);
            this.showTemporaryMessage('匯出PDF時發生錯誤: ' + error.message, 'error');
        }
    }
    
    /**
     * 更新比較圖表
     * @param {Object} scenarioPredictions - 各場景的預測結果
     * @param {number} predictionMonths - 預測月數
     */
    updateComparisonCharts(scenarioPredictions, predictionMonths) {
        // 定義顏色列表
        const colors = [
            { bg: 'rgba(54, 162, 235, 0.6)', border: 'rgba(54, 162, 235, 1)' },
            { bg: 'rgba(255, 99, 132, 0.6)', border: 'rgba(255, 99, 132, 1)' },
            { bg: 'rgba(75, 192, 192, 0.6)', border: 'rgba(75, 192, 192, 1)' },
            { bg: 'rgba(153, 102, 255, 0.6)', border: 'rgba(153, 102, 255, 1)' },
            { bg: 'rgba(255, 159, 64, 0.6)', border: 'rgba(255, 159, 64, 1)' }
        ];
        
        // 獲取所有場景ID
        const scenarioIds = Object.keys(scenarioPredictions);
        
        // 更新薪資趨勢對比圖
        if (this.charts.comparisonTrend) {
            // 使用第一個場景的標籤
            const firstScenario = scenarioPredictions[scenarioIds[0]];
            this.charts.comparisonTrend.data.labels = firstScenario.monthLabels;
            
            // 清空現有數據
            this.charts.comparisonTrend.data.datasets = [];
            
            // 為每個場景添加數據集
            scenarioIds.forEach((scenarioId, index) => {
                const prediction = scenarioPredictions[scenarioId];
                const colorIndex = index % colors.length;
                
                this.charts.comparisonTrend.data.datasets.push({
                    label: prediction.scenarioName,
                    data: prediction.predictedSalaries,
                    backgroundColor: colors[colorIndex].bg,
                    borderColor: colors[colorIndex].border,
                    borderWidth: 2,
                    tension: 0.1
                });
            });
            
            this.charts.comparisonTrend.update();
        }
        
        // 更新獎金對比圖
        if (this.charts.comparisonBonus) {
            // 使用第一個場景的標籤
            const firstScenario = scenarioPredictions[scenarioIds[0]];
            this.charts.comparisonBonus.data.labels = firstScenario.monthLabels;
            
            // 清空現有數據
            this.charts.comparisonBonus.data.datasets = [];
            
            // 為每個場景添加數據集
            scenarioIds.forEach((scenarioId, index) => {
                const prediction = scenarioPredictions[scenarioId];
                const colorIndex = index % colors.length;
                
                this.charts.comparisonBonus.data.datasets.push({
                    label: prediction.scenarioName,
                    data: prediction.bonusAmounts,
                    backgroundColor: colors[colorIndex].bg,
                    borderColor: colors[colorIndex].border,
                    borderWidth: 1
                });
            });
            
            this.charts.comparisonBonus.update();
        }
        
        // 更新累計總收入對比圖
        if (this.charts.comparisonTotal) {
            // 清空現有數據
            this.charts.comparisonTotal.data.labels = [];
            this.charts.comparisonTotal.data.datasets[0].data = [];
            
            // 計算每個場景的累計總收入並排序
            const totalIncomes = scenarioIds.map(scenarioId => {
                const prediction = scenarioPredictions[scenarioId];
                const totalSalary = prediction.predictedSalaries.reduce((sum, salary) => sum + salary, 0);
                
                return {
                    scenarioName: prediction.scenarioName,
                    totalSalary
                };
            });
            
            // 按累計總收入排序（從高到低）
            totalIncomes.sort((a, b) => b.totalSalary - a.totalSalary);
            
            // 更新圖表數據
            this.charts.comparisonTotal.data.labels = totalIncomes.map(item => item.scenarioName);
            this.charts.comparisonTotal.data.datasets[0].data = totalIncomes.map(item => item.totalSalary);
            
            this.charts.comparisonTotal.update();
        }
    }
    
    /**
     * 更新比較表格
     * @param {Object} scenarioPredictions - 各場景的預測結果
     * @param {number} predictionMonths - 預測月數
     */
    updateComparisonTable(scenarioPredictions, predictionMonths) {
        const tableBody = document.getElementById('comparison-table-body');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        // 獲取所有場景ID
        const scenarioIds = Object.keys(scenarioPredictions);
        
        // 計算推薦指數和準確度
        this.calculateRecommendationScores(scenarioPredictions);
        
        // 找出最高推薦指數的場景
        let maxRecommendationScore = -Infinity;
        let bestScenarioId = null;
        
        scenarioIds.forEach(scenarioId => {
            const prediction = scenarioPredictions[scenarioId];
            if (prediction.recommendationScore > maxRecommendationScore) {
                maxRecommendationScore = prediction.recommendationScore;
                bestScenarioId = scenarioId;
            }
        });
        
        // 為每個場景創建表格行
        scenarioIds.forEach(scenarioId => {
            const prediction = scenarioPredictions[scenarioId];
            const row = document.createElement('tr');
            
            // 如果是最高推薦指數的場景，添加高亮
            if (scenarioId === bestScenarioId) {
                row.classList.add('highlight');
            }
            
            // 場景名稱
            const nameCell = document.createElement('td');
            nameCell.textContent = prediction.scenarioName;
            row.appendChild(nameCell);
            
            // 影響因子
            const factorCell = document.createElement('td');
            const factorText = this.getFactorWeightText(prediction.weight);
            factorCell.textContent = factorText;
            row.appendChild(factorCell);
            
            // 平均月薪
            const avgCell = document.createElement('td');
            const avgSalary = prediction.predictedSalaries.reduce((sum, val) => sum + val, 0) / predictionMonths;
            avgCell.textContent = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(avgSalary);
            row.appendChild(avgCell);
            
            // 基本薪資總計
            const baseTotalCell = document.createElement('td');
            const baseTotal = prediction.baseSalaries.reduce((sum, val) => sum + val, 0);
            baseTotalCell.textContent = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(baseTotal);
            row.appendChild(baseTotalCell);
            
            // 加班與獎金總計
            const bonusTotalCell = document.createElement('td');
            const overtimeTotal = prediction.overtimePays.reduce((sum, val) => sum + val, 0);
            const bonusTotal = prediction.bonusAmounts.reduce((sum, val) => sum + val, 0);
            bonusTotalCell.textContent = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(overtimeTotal + bonusTotal);
            row.appendChild(bonusTotalCell);
            
            // 總收入
            const totalCell = document.createElement('td');
            const totalSalary = prediction.predictedSalaries.reduce((sum, val) => sum + val, 0);
            totalCell.textContent = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(totalSalary);
            totalCell.classList.add('fw-bold');
            row.appendChild(totalCell);
            
            // 預測準確度
            const accuracyCell = document.createElement('td');
            accuracyCell.textContent = Math.round(prediction.accuracy * 100) + '%';
            row.appendChild(accuracyCell);
            
            // 推薦指數
            const recommendationCell = document.createElement('td');
            const stars = Math.round(prediction.recommendationScore * 5); // 轉換為五星評級
            let starsHTML = '';
            for (let i = 0; i < 5; i++) {
                if (i < stars) {
                    starsHTML += '<i class="bi bi-star-fill text-warning"></i>';
                } else {
                    starsHTML += '<i class="bi bi-star text-muted"></i>';
                }
            }
            recommendationCell.innerHTML = starsHTML;
            row.appendChild(recommendationCell);
            
            tableBody.appendChild(row);
        });
        
        // 創建場景詳情摺疊板
        this.createScenarioDetailsAccordion(scenarioPredictions, predictionMonths);
    }
    
    /**
     * 創建場景詳情摺疊板
     * @param {Object} scenarioPredictions - 各場景的預測結果
     * @param {number} predictionMonths - 預測月數
     */
    createScenarioDetailsAccordion(scenarioPredictions, predictionMonths) {
        const accordion = document.getElementById('scenario-details-accordion');
        if (!accordion) return;
        
        accordion.innerHTML = '';
        
        // 獲取所有場景ID
        const scenarioIds = Object.keys(scenarioPredictions);
        
        // 計算排名
        const rankings = this.calculateScenarioRankings(scenarioPredictions);
        
        // 為每個場景創建折疊項
        scenarioIds.forEach((scenarioId, index) => {
            const prediction = scenarioPredictions[scenarioId];
            const rank = rankings.findIndex(id => id === scenarioId) + 1;
            
            const item = document.createElement('div');
            item.className = 'accordion-item';
            
            // 標題
            const header = document.createElement('h2');
            header.className = 'accordion-header';
            header.id = `heading-${scenarioId}`;
            
            const button = document.createElement('button');
            button.className = 'accordion-button collapsed';
            button.type = 'button';
            button.setAttribute('data-bs-toggle', 'collapse');
            button.setAttribute('data-bs-target', `#collapse-${scenarioId}`);
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', `collapse-${scenarioId}`);
            
            // 添加排名徽章
            button.innerHTML = `
                <span class="badge bg-${rank === 1 ? 'success' : rank === 2 ? 'primary' : 'secondary'} me-2">排名 ${rank}</span>
                <strong>${prediction.scenarioName}</strong>
                <span class="ms-auto">總預期收入: ${new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(prediction.predictedSalaries.reduce((sum, val) => sum + val, 0))}</span>
            `;
            
            header.appendChild(button);
            item.appendChild(header);
            
            // 內容
            const collapse = document.createElement('div');
            collapse.id = `collapse-${scenarioId}`;
            collapse.className = 'accordion-collapse collapse';
            collapse.setAttribute('aria-labelledby', `heading-${scenarioId}`);
            collapse.setAttribute('data-bs-parent', '#scenario-details-accordion');
            
            const body = document.createElement('div');
            body.className = 'accordion-body';
            
            // 詳情內容
            body.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <h6>場景設置</h6>
                        <ul class="list-group mb-3">
                            <li class="list-group-item d-flex justify-content-between">
                                <span>影響因子權重:</span>
                                <strong>${this.getFactorWeightText(prediction.weight)}</strong>
                            </li>
                            <li class="list-group-item d-flex justify-content-between">
                                <span>附加假設:</span>
                                <strong>${this.getAssumptionText(prediction.assumption)}</strong>
                            </li>
                            <li class="list-group-item d-flex justify-content-between">
                                <span>預測準確度:</span>
                                <strong>${Math.round(prediction.accuracy * 100)}%</strong>
                            </li>
                        </ul>
                        
                        <h6>關鍵影響因子</h6>
                        <div class="mb-3">
                            ${prediction.keyFactors.map(factor => 
                                `<span class="badge rounded-pill factor-badge ${this.getFactorBadgeClass(factor.value)}">${factor.name}</span>`
                            ).join('')}
                        </div>
                    </div>
                    <div class="col-md-6">
                        <h6>預測摘要</h6>
                        <ul class="list-group mb-3">
                            <li class="list-group-item d-flex justify-content-between">
                                <span>平均月薪:</span>
                                <strong>${new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(prediction.predictedSalaries.reduce((sum, val) => sum + val, 0) / predictionMonths)}</strong>
                            </li>
                            <li class="list-group-item d-flex justify-content-between">
                                <span>預測期間總收入:</span>
                                <strong>${new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(prediction.predictedSalaries.reduce((sum, val) => sum + val, 0))}</strong>
                            </li>
                            <li class="list-group-item d-flex justify-content-between">
                                <span>預期總漲幅:</span>
                                <strong class="${prediction.totalIncrease >= 0 ? 'text-success' : 'text-danger'}">${(prediction.totalIncrease >= 0 ? '+' : '') + (prediction.totalIncrease * 100).toFixed(1)}%</strong>
                            </li>
                        </ul>
                        
                        <h6>預測優勢</h6>
                        <div class="alert alert-info">
                            ${this.getScenarioAdvantage(prediction, rank)}
                        </div>
                    </div>
                </div>
                
                <table class="table table-sm table-bordered mt-3">
                    <thead>
                        <tr>
                            <th>預測月份</th>
                            <th>基本薪資</th>
                            <th>加班費</th>
                            <th>獎金</th>
                            <th>總計</th>
                            <th>變動</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${prediction.monthlySalaries.map((salary, i) => `
                            <tr>
                                <td>${salary.month}</td>
                                <td>${new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(salary.baseSalary)}</td>
                                <td>${new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(salary.overtimePay)}</td>
                                <td>${new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(salary.bonusAmount)}</td>
                                <td class="fw-bold">${new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(salary.totalSalary)}</td>
                                <td class="${i === 0 ? '' : (salary.change >= 0 ? 'text-success' : 'text-danger')}">${i === 0 ? '-' : ((salary.change >= 0 ? '+' : '') + (salary.change * 100).toFixed(1) + '%')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            collapse.appendChild(body);
            item.appendChild(collapse);
            
            accordion.appendChild(item);
        });
    }
    
    /**
     * 生成系統推薦
     * @param {Object} scenarioPredictions - 各場景的預測結果
     * @param {number} predictionMonths - 預測月數
     */
    generateRecommendation(scenarioPredictions, predictionMonths) {
        const recommendationContent = document.getElementById('recommendation-content');
        if (!recommendationContent) return;
        
        // 計算排名
        const rankings = this.calculateScenarioRankings(scenarioPredictions);
        const bestScenarioId = rankings[0];
        const bestPrediction = scenarioPredictions[bestScenarioId];
        
        // 生成推薦內容
        let content = `
            <div class="alert alert-success">
                <h5><i class="bi bi-award me-2"></i> 最佳推薦: ${bestPrediction.scenarioName}</h5>
                <p>根據當前數據分析，「${bestPrediction.scenarioName}」是最佳薪資發展路徑，預計在${predictionMonths}個月內可獲得 ${new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(bestPrediction.predictedSalaries.reduce((sum, val) => sum + val, 0))} 的總收入。</p>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <h6>推薦特點</h6>
                    <ul class="list-group mb-3">
                        <li class="list-group-item">
                            <i class="bi bi-check-circle-fill text-success me-2"></i>
                            ${this.getFactorWeightText(bestPrediction.weight)}驅動的薪資成長模式
                        </li>
                        <li class="list-group-item">
                            <i class="bi bi-check-circle-fill text-success me-2"></i>
                            平均月薪達 ${new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(bestPrediction.predictedSalaries.reduce((sum, val) => sum + val, 0) / predictionMonths)}
                        </li>
                        <li class="list-group-item">
                            <i class="bi bi-check-circle-fill text-success me-2"></i>
                            預期總體成長率 ${(bestPrediction.totalIncrease >= 0 ? '+' : '') + (bestPrediction.totalIncrease * 100).toFixed(1)}%
                        </li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <h6>實施建議</h6>
                    <div class="card">
                        <div class="card-body">
                            ${this.getImplementationSuggestion(bestPrediction)}
                        </div>
                    </div>
                </div>
            </div>
            
            <h6 class="mt-3">各場景優勢比較</h6>
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>排名</th>
                            <th>場景</th>
                            <th>主要優勢</th>
                            <th>劣勢</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rankings.map((scenarioId, index) => {
                            const prediction = scenarioPredictions[scenarioId];
                            return `
                                <tr class="${index === 0 ? 'table-success' : ''}">
                                    <td>#${index + 1}</td>
                                    <td>${prediction.scenarioName}</td>
                                    <td>${this.getScenarioStrength(prediction)}</td>
                                    <td>${this.getScenarioWeakness(prediction)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        recommendationContent.innerHTML = content;
    }
    
    /**
     * 計算場景的推薦指數
     * @param {Object} scenarioPredictions - 各場景的預測結果
     */
    calculateRecommendationScores(scenarioPredictions) {
        // 獲取所有場景ID
        const scenarioIds = Object.keys(scenarioPredictions);
        
        // 收集各指標的最大值、最小值和平均值
        let maxTotalSalary = -Infinity;
        let minTotalSalary = Infinity;
        let maxAccuracy = -Infinity;
        let minAccuracy = Infinity;
        let maxIncrease = -Infinity;
        let minIncrease = Infinity;
        
        scenarioIds.forEach(scenarioId => {
            const prediction = scenarioPredictions[scenarioId];
            
            // 總收入
            const totalSalary = prediction.predictedSalaries.reduce((sum, salary) => sum + salary, 0);
            maxTotalSalary = Math.max(maxTotalSalary, totalSalary);
            minTotalSalary = Math.min(minTotalSalary, totalSalary);
            
            // 準確度
            maxAccuracy = Math.max(maxAccuracy, prediction.accuracy);
            minAccuracy = Math.min(minAccuracy, prediction.accuracy);
            
            // 總增幅
            maxIncrease = Math.max(maxIncrease, prediction.totalIncrease);
            minIncrease = Math.min(minIncrease, prediction.totalIncrease);
        });
        
        // 計算各場景的推薦指數
        scenarioIds.forEach(scenarioId => {
            const prediction = scenarioPredictions[scenarioId];
            
            // 總收入
            const totalSalary = prediction.predictedSalaries.reduce((sum, salary) => sum + salary, 0);
            const normalizedTotalSalary = (totalSalary - minTotalSalary) / (maxTotalSalary - minTotalSalary);
            
            // 準確度
            const normalizedAccuracy = (prediction.accuracy - minAccuracy) / (maxAccuracy - minAccuracy);
            
            // 總增幅
            const normalizedIncrease = (prediction.totalIncrease - minIncrease) / (maxIncrease - minIncrease);
            
            // 計算總分（加權平均）
            prediction.recommendationScore = 
                normalizedTotalSalary * 0.5 + // 總收入權重
                normalizedAccuracy * 0.3 + // 準確度權重
                normalizedIncrease * 0.2; // 總增幅權重
        });
    }
    
    /**
     * 計算場景排名
     * @param {Object} scenarioPredictions - 各場景的預測結果
     * @returns {Array} - 排名順序的場景ID數組
     */
    calculateScenarioRankings(scenarioPredictions) {
        // 獲取所有場景ID
        const scenarioIds = Object.keys(scenarioPredictions);
        
        // 按推薦指數排序（從高到低）
        return scenarioIds.sort((a, b) => 
            scenarioPredictions[b].recommendationScore - scenarioPredictions[a].recommendationScore
        );
    }
    
    /**
     * 獲取權重因子文字描述
     * @param {string} weight - 權重類型
     * @returns {string} - 文字描述
     */
    getFactorWeightText(weight) {
        switch (weight) {
            case 'balanced': return '均衡發展';
            case 'attendance': return '出勤為主';
            case 'performance': return '績效為主';
            case 'tenure': return '年資為主';
            default: return '未知權重';
        }
    }
    
    /**
     * 獲取附加假設文字描述
     * @param {string} assumption - 假設類型
     * @returns {string} - 文字描述
     */
    getAssumptionText(assumption) {
        switch (assumption) {
            case 'normal': return '無特殊假設';
            case 'improved_attendance': return '出勤改善';
            case 'improved_performance': return '績效提升';
            case 'promotion': return '職位晉升';
            default: return '未知假設';
        }
    }
    
    /**
     * 獲取因子徽章的CSS類別
     * @param {number} value - 因子值
     * @returns {string} - CSS類別
     */
    getFactorBadgeClass(value) {
        if (value > 0.05) {
            return 'bg-success';
        } else if (value > 0) {
            return 'bg-info';
        } else if (value > -0.05) {
            return 'bg-warning';
        } else {
            return 'bg-danger';
        }
    }
    
    /**
     * 獲取場景優勢描述
     * @param {Object} prediction - 預測結果
     * @param {number} rank - 排名
     * @returns {string} - 優勢描述
     */
    getScenarioAdvantage(prediction, rank) {
        if (rank === 1) {
            return `該場景提供最佳的整體收入預期，特別在${this.getFactorWeightText(prediction.weight)}方面表現優異。預計總收入較其他方案高出約${Math.round(prediction.recommendationScore * 20)}%。`;
        } else if (rank === 2) {
            return `該場景提供穩定的收入增長，特別適合追求${this.getFactorWeightText(prediction.weight)}的情況。雖然總收入不及最佳方案，但穩定性較高。`;
        } else {
            return `該場景在${prediction.keyFactors[0].name}方面有一定優勢，但整體收入期望較低。適合作為參考比較方案。`;
        }
    }
    
    /**
     * 獲取場景強項描述
     * @param {Object} prediction - 預測結果
     * @returns {string} - 強項描述
     */
    getScenarioStrength(prediction) {
        switch (prediction.weight) {
            case 'balanced':
                return '全面均衡發展，各方面表現穩定';
            case 'attendance':
                return '出勤獎勵顯著，適合規律上班者';
            case 'performance':
                return '績效獎金比例高，回報與付出成正比';
            case 'tenure':
                return '年資加薪明顯，長期投入有保障';
            default:
                return '優勢不明顯';
        }
    }
    
    /**
     * 獲取場景弱項描述
     * @param {Object} prediction - 預測結果
     * @returns {string} - 弱項描述
     */
    getScenarioWeakness(prediction) {
        switch (prediction.weight) {
            case 'balanced':
                return '缺乏突出優勢，高峰期收入不如專注型選項';
            case 'attendance':
                return '績效回報有限，創新冒險精神較低';
            case 'performance':
                return '波動性較大，穩定性略低';
            case 'tenure':
                return '短期回報較低，初期收入成長緩慢';
            default:
                return '劣勢不明顯';
        }
    }
    
    /**
     * 獲取實施建議
     * @param {Object} prediction - 預測結果
     * @returns {string} - 實施建議
     */
    getImplementationSuggestion(prediction) {
        switch (prediction.weight) {
            case 'balanced':
                return `
                    <p><i class="bi bi-lightbulb me-2 text-warning"></i> <strong>均衡發展策略</strong></p>
                    <ul class="mb-0">
                        <li>維持良好出勤記錄，避免無故缺勤</li>
                        <li>持續提升工作績效，特別關注銷售目標</li>
                        <li>投入長期職涯規劃，穩固提升年資價值</li>
                    </ul>
                `;
            case 'attendance':
                return `
                    <p><i class="bi bi-lightbulb me-2 text-warning"></i> <strong>出勤優先策略</strong></p>
                    <ul class="mb-0">
                        <li>嚴格遵守公司出勤政策，維持零缺勤記錄</li>
                        <li>避免遲到早退情況，提高準時率至95%以上</li>
                        <li>主動支援排班調整，展現團隊合作精神</li>
                    </ul>
                `;
            case 'performance':
                return `
                    <p><i class="bi bi-lightbulb me-2 text-warning"></i> <strong>績效導向策略</strong></p>
                    <ul class="mb-0">
                        <li>積極參與業績競賽，挑戰銷售目標</li>
                        <li>提高客單價和客戶滿意度指標</li>
                        <li>定期參與專業培訓，提升技能和效率</li>
                    </ul>
                `;
            case 'tenure':
                return `
                    <p><i class="bi bi-lightbulb me-2 text-warning"></i> <strong>年資累積策略</strong></p>
                    <ul class="mb-0">
                        <li>穩定工作投入，規劃長期發展路徑</li>
                        <li>把握公司內部晉升機會，持續累積資歷</li>
                        <li>參與專案並建立經驗，增加個人價值</li>
                    </ul>
                `;
            default:
                return `
                    <p><i class="bi bi-lightbulb me-2 text-warning"></i> <strong>一般發展建議</strong></p>
                    <ul class="mb-0">
                        <li>維持工作出勤穩定性</li>
                        <li>注重績效表現</li>
                        <li>累積工作經驗和專業技能</li>
                    </ul>
                `;
        }
    }
    
    /**
     * 產生測試數據
     * 用於產生薪資預測測試資料
     */
    async generateTestData() {
        try {
            // 顯示載入指示器
            const loadingElement = document.createElement('div');
            loadingElement.className = 'text-center my-3';
            loadingElement.innerHTML = `
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">載入中...</span>
                </div>
                <p class="mt-2">正在生成測試資料，請稍候...</p>
            `;
            
            const resultContainer = document.getElementById('test-data-result');
            if (resultContainer) {
                resultContainer.innerHTML = '';
                resultContainer.appendChild(loadingElement);
            }
            
            // 獲取表單數據
            const employeeId = document.getElementById('test-employee-select').value;
            const storeId = document.getElementById('test-store-select').value;
            const months = parseInt(document.getElementById('test-months-input').value);
            const trend = parseFloat(document.getElementById('test-trend-select').value);
            const variance = parseFloat(document.getElementById('test-variance-input').value);
            
            if (!employeeId || !storeId || isNaN(months) || months < 1 || months > 24) {
                this.showTemporaryMessage('請填寫正確的測試資料參數', 'warning');
                if (resultContainer) {
                    resultContainer.innerHTML = `
                        <div class="alert alert-warning">
                            <p><strong>參數錯誤</strong></p>
                            <p>請確保已選擇員工和門市，並且月數在1-24範圍內。</p>
                        </div>
                    `;
                }
                return;
            }
            
            // 呼叫 Cloud Function
            const generateSalaryPredictionTestData = firebase.functions().httpsCallable('generateSalaryPredictionTestData');
            const result = await generateSalaryPredictionTestData({
                employeeId, 
                storeId, 
                months, 
                trend, 
                variance
            });
            
            if (result.data && result.data.success) {
                this.showTemporaryMessage(`成功生成 ${result.data.recordCount} 筆測試資料`, 'success');
                
                // 顯示成功訊息
                if (resultContainer) {
                    const employeeOption = document.querySelector(`#test-employee-select option[value="${employeeId}"]`);
                    const storeOption = document.querySelector(`#test-store-select option[value="${storeId}"]`);
                    
                    resultContainer.innerHTML = `
                        <div class="alert alert-success">
                            <p><strong>測試資料已生成</strong></p>
                            <p>員工: ${employeeOption ? employeeOption.textContent : employeeId}</p>
                            <p>商店: ${storeOption ? storeOption.textContent : storeId}</p>
                            <p>生成月數: ${months}</p>
                            <p>趨勢設定: ${trend >= 0 ? '+' : ''}${(trend * 100).toFixed(1)}% / 月</p>
                            <p>波動程度: ${variance}</p>
                            <p>生成時間: ${new Date().toLocaleString()}</p>
                            <p>記錄數量: ${result.data.recordCount}</p>
                        </div>
                    `;
                }
            } else {
                this.showTemporaryMessage('生成測試資料失敗', 'error');
                
                // 顯示錯誤訊息
                if (resultContainer) {
                    resultContainer.innerHTML = `
                        <div class="alert alert-danger">
                            <p><strong>生成測試資料失敗</strong></p>
                            <p>錯誤訊息: ${result.data && result.data.error ? result.data.error : '未知錯誤'}</p>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('生成測試資料時出錯', error);
            this.showTemporaryMessage(`生成測試資料失敗: ${error.message || '未知錯誤'}`, 'error');
            
            // 顯示錯誤訊息
            const resultContainer = document.getElementById('test-data-result');
            if (resultContainer) {
                resultContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <p><strong>生成測試資料時發生錯誤</strong></p>
                        <p>錯誤訊息: ${error.message || '未知錯誤'}</p>
                    </div>
                `;
            }
        }
    }
    
    /**
     * 清除測試數據
     * 用於清除薪資預測測試資料
     */
    async clearTestData() {
        try {
            // 顯示載入指示器
            const loadingElement = document.createElement('div');
            loadingElement.className = 'text-center my-3';
            loadingElement.innerHTML = `
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">載入中...</span>
                </div>
                <p class="mt-2">正在清除測試資料，請稍候...</p>
            `;
            
            const resultContainer = document.getElementById('test-data-result');
            if (resultContainer) {
                resultContainer.innerHTML = '';
                resultContainer.appendChild(loadingElement);
            }
            
            // 獲取過濾條件
            const filters = {};
            const employeeId = document.getElementById('clear-test-employee-select').value;
            const storeId = document.getElementById('clear-test-store-select').value;
            const year = document.getElementById('clear-test-year-select').value;
            const month = document.getElementById('clear-test-month-select').value;
            
            if (employeeId && employeeId !== 'all') filters.employeeId = employeeId;
            if (storeId && storeId !== 'all') filters.storeId = storeId;
            if (year && year !== 'all') filters.year = parseInt(year);
            if (month && month !== 'all') filters.month = parseInt(month);
            
            // 顯示確認對話框
            if (!confirm('確定要刪除測試資料嗎？此操作無法恢復！')) {
                if (resultContainer) {
                    resultContainer.innerHTML = `
                        <div class="alert alert-secondary">
                            <p>已取消清除操作。</p>
                        </div>
                    `;
                }
                return;
            }
            
            // 呼叫 Cloud Function
            const clearSalaryPredictionTestData = firebase.functions().httpsCallable('clearSalaryPredictionTestData');
            const result = await clearSalaryPredictionTestData(filters);
            
            if (result.data && result.data.success) {
                this.showTemporaryMessage(`成功清除 ${result.data.count} 筆測試資料`, 'success');
                
                // 顯示成功訊息
                if (resultContainer) {
                    resultContainer.innerHTML = `
                        <div class="alert alert-info">
                            <p><strong>測試資料已清除</strong></p>
                            <p>清除時間: ${new Date().toLocaleString()}</p>
                            <p>清除數量: ${result.data.count} 筆</p>
                            <p>過濾條件: ${Object.keys(filters).length > 0 ? 
                                Object.entries(filters).map(([key, value]) => `${key}=${value}`).join(', ') 
                                : '無 (清除所有測試資料)'}</p>
                        </div>
                    `;
                }
            } else {
                this.showTemporaryMessage('清除測試資料失敗', 'error');
                
                // 顯示錯誤訊息
                if (resultContainer) {
                    resultContainer.innerHTML = `
                        <div class="alert alert-danger">
                            <p><strong>清除測試資料失敗</strong></p>
                            <p>錯誤訊息: ${result.data && result.data.error ? result.data.error : '未知錯誤'}</p>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('清除測試資料時出錯', error);
            this.showTemporaryMessage(`清除測試資料失敗: ${error.message || '未知錯誤'}`, 'error');
            
            // 顯示錯誤訊息
            const resultContainer = document.getElementById('test-data-result');
            if (resultContainer) {
                resultContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <p><strong>清除測試資料時發生錯誤</strong></p>
                        <p>錯誤訊息: ${error.message || '未知錯誤'}</p>
                    </div>
                `;
            }
        }
    }
    
    /**
     * 載入測試數據區塊
     * 用於加載測試數據功能的UI
     */
    async loadTestDataSection() {
        try {
            // 獲取員工列表（重用已載入的員工數據）
            let employees = this.employeeList;
            if (employees.length === 0) {
                const employeeSnapshot = await this.db.collection('users')
                    .where('status', '==', 'active')
                    .orderBy('name')
                    .get();
                
                employeeSnapshot.forEach(doc => {
                    const data = doc.data();
                    employees.push({
                        id: doc.id,
                        name: data.name || data.displayName || doc.id,
                        level: data.level || 1
                    });
                });
            }
            
            // 獲取商店列表（重用已載入的商店數據）
            let stores = this.storeList;
            if (stores.length === 0) {
                const storeSnapshot = await this.db.collection('stores')
                    .where('status', '==', 'active')
                    .orderBy('name')
                    .get();
                
                storeSnapshot.forEach(doc => {
                    const data = doc.data();
                    stores.push({
                        id: doc.id,
                        name: data.name || doc.id
                    });
                });
            }
            
            // 填充員工下拉選單
            const testEmployeeSelect = document.getElementById('test-employee-select');
            const clearTestEmployeeSelect = document.getElementById('clear-test-employee-select');
            
            if (testEmployeeSelect) {
                // 清空選項並保留第一個
                while (testEmployeeSelect.options.length > 1) {
                    testEmployeeSelect.remove(1);
                }
                
                // 添加員工選項
                employees.forEach(employee => {
                    const option = document.createElement('option');
                    option.value = employee.id;
                    option.textContent = `${employee.name} (Level ${employee.level})`;
                    testEmployeeSelect.appendChild(option);
                });
            }
            
            if (clearTestEmployeeSelect) {
                // 清空選項並保留第一個
                while (clearTestEmployeeSelect.options.length > 1) {
                    clearTestEmployeeSelect.remove(1);
                }
                
                // 添加員工選項
                employees.forEach(employee => {
                    const option = document.createElement('option');
                    option.value = employee.id;
                    option.textContent = employee.name;
                    clearTestEmployeeSelect.appendChild(option);
                });
            }
            
            // 填充商店下拉選單
            const testStoreSelect = document.getElementById('test-store-select');
            const clearTestStoreSelect = document.getElementById('clear-test-store-select');
            
            if (testStoreSelect) {
                // 清空選項並保留第一個
                while (testStoreSelect.options.length > 1) {
                    testStoreSelect.remove(1);
                }
                
                // 添加商店選項
                stores.forEach(store => {
                    const option = document.createElement('option');
                    option.value = store.id;
                    option.textContent = store.name;
                    testStoreSelect.appendChild(option);
                });
            }
            
            if (clearTestStoreSelect) {
                // 清空選項並保留第一個
                while (clearTestStoreSelect.options.length > 1) {
                    clearTestStoreSelect.remove(1);
                }
                
                // 添加商店選項
                stores.forEach(store => {
                    const option = document.createElement('option');
                    option.value = store.id;
                    option.textContent = store.name;
                    clearTestStoreSelect.appendChild(option);
                });
            }
            
            // 填充年份下拉選單
            const clearTestYearSelect = document.getElementById('clear-test-year-select');
            if (clearTestYearSelect) {
                // 清空選項並保留第一個
                while (clearTestYearSelect.options.length > 1) {
                    clearTestYearSelect.remove(1);
                }
                
                // 添加年份選項
                const currentYear = new Date().getFullYear();
                for (let i = currentYear - 2; i <= currentYear; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `${i}年`;
                    clearTestYearSelect.appendChild(option);
                }
            }
            
            // 填充月份下拉選單
            const clearTestMonthSelect = document.getElementById('clear-test-month-select');
            if (clearTestMonthSelect) {
                // 清空選項並保留第一個
                while (clearTestMonthSelect.options.length > 1) {
                    clearTestMonthSelect.remove(1);
                }
                
                // 添加月份選項
                for (let i = 1; i <= 12; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `${i}月`;
                    clearTestMonthSelect.appendChild(option);
                }
            }
            
            // 添加事件處理器
            const generateTestDataBtn = document.getElementById('generate-test-data-btn');
            if (generateTestDataBtn) {
                generateTestDataBtn.addEventListener('click', () => this.generateTestData());
            }
            
            const clearTestDataBtn = document.getElementById('clear-test-data-btn');
            if (clearTestDataBtn) {
                clearTestDataBtn.addEventListener('click', () => this.clearTestData());
            }
            
        } catch (error) {
            console.error('載入測試數據區塊時出錯', error);
            this.showTemporaryMessage('載入測試數據區塊失敗: ' + error.message, 'error');
        }
    }
    
    /**
     * 獲取用戶權限等級
     * @returns {Promise<number>} 權限等級 (0-10)
     */
    async getUserLevel() {
        if (!this.user) return 0;
        
        try {
            const userDoc = await this.db.collection('users').doc(this.user.uid).get();
            if (!userDoc.exists) return 0;
            
            const userData = userDoc.data();
            return userData.level || 0;
        } catch (error) {
            console.error('獲取用戶權限時出錯', error);
            return 0;
        }
    }
    
    /**
     * 顯示載入指示器
     * @param {string} selector - 目標元素選擇器
     */
    showLoading(selector) {
        const element = document.querySelector(selector);
        if (!element) return;
        
        // 檢查是否已有載入指示器
        if (element.querySelector('.loading-overlay')) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(255, 255, 255, 0.7)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';
        
        overlay.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">載入中...</span>
                </div>
                <p class="mt-2">處理中，請稍候...</p>
            </div>
        `;
        
        // 確保父元素有相對定位
        const currentPosition = window.getComputedStyle(element).position;
        if (currentPosition === 'static') {
            element.style.position = 'relative';
        }
        
        element.appendChild(overlay);
    }
    
    /**
     * 清除載入指示器
     * @param {string} selector - 目標元素選擇器
     */
    clearLoading(selector) {
        const element = document.querySelector(selector);
        if (!element) return;
        
        const overlay = element.querySelector('.loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
} 