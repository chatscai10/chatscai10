/**
 * 初始化排班檢視頁面
 * @param {string} userName 使用者名稱
 */
async function initScheduleViewPage(userName) {
    try {
        console.log(`初始化Schedule View Page for: ${userName}`);
        
        // 獲取必要元件或建立它們
        ensureRequiredComponents();

        // 加載必要的數據
        await Promise.all([
            loadEmployees(),
            loadStores(),
            loadScheduleConfig()
        ]);
        
        // 根據配置創建或更新必要元件
        setupScheduleButtons();
        
        // 更新開放時間倒數 - 每秒更新一次
        updateCountdown();
        setInterval(updateCountdown, 1000);
        
        // 其他初始化...
        
    } catch (error) {
        console.error(`Schedule view page initialization error: ${error}`);
        showErrorMessage('排班系統初始化失敗', error.message);
    }
}

/**
 * 確保必要元件存在
 */
function ensureRequiredComponents() {
    // 檢查並創建主容器
    let mainContainer = document.getElementById('schedule-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.id = 'schedule-container';
        mainContainer.className = 'schedule-container';
        document.querySelector('.main-content').appendChild(mainContainer);
    }
    
    // 檢查並創建倒數計時元素
    let countdownEl = document.getElementById('schedule-countdown');
    if (!countdownEl) {
        countdownEl = document.createElement('div');
        countdownEl.id = 'schedule-countdown';
        countdownEl.className = 'schedule-countdown';
        mainContainer.appendChild(countdownEl);
    }
    
    // 檢查並創建按鈕容器
    let buttonContainer = document.getElementById('schedule-buttons');
    if (!buttonContainer) {
        buttonContainer = document.createElement('div');
        buttonContainer.id = 'schedule-buttons';
        buttonContainer.className = 'button-container';
        mainContainer.appendChild(buttonContainer);
    }
    
    // 檢查並創建進入排班按鈕 - 使用綠色樣式
    let enterButton = document.getElementById('enter-scheduling-button');
    if (!enterButton) {
        enterButton = document.createElement('button');
        enterButton.id = 'enter-scheduling-button';
        enterButton.className = 'btn btn-success'; // 使用綠色按鈕樣式
        enterButton.textContent = '進入排班系統';
        enterButton.onclick = handleEnterSchedulingClick;
        buttonContainer.appendChild(enterButton);
    } else {
        // 確保現有按鈕使用正確的樣式
        enterButton.className = 'btn btn-success';
    }
}

/**
 * 更新開放時間倒數
 */
function updateCountdown() {
    const countdownEl = document.getElementById('schedule-countdown');
    if (!countdownEl) return;
    
    try {
        // 從緩存的配置中獲取結束時間
        const configData = window.scheduleConfigData || {};
        if (!configData.endTime) {
            countdownEl.textContent = '排班系統開放時間未設定';
            return;
        }
        
        // 解析結束時間
        const endTime = configData.endTime.toDate ? 
            configData.endTime.toDate() : new Date(configData.endTime);
        
        // 計算剩餘時間
        const now = new Date();
        const diff = endTime - now;
        
        if (diff <= 0) {
            countdownEl.textContent = '排班系統已關閉';
            return;
        }
        
        // 計算時間單位
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        // 格式化並顯示倒數時間
        countdownEl.textContent = `開放時間結束倒數: ${days > 0 ? days + '天 ' : ''}${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
    } catch (error) {
        console.error('更新倒數計時錯誤:', error);
        countdownEl.textContent = '倒數計時錯誤';
    }
}

/**
 * 加載排班配置
 */
async function loadScheduleConfig() {
    try {
        const configDoc = await db.collection('settings').doc('schedule_config').get();
        
        if (configDoc.exists) {
            window.scheduleConfigData = configDoc.data();
            console.log('排班配置已加載');
        } else {
            console.warn('找不到排班配置文檔');
            window.scheduleConfigData = {};
        }
    } catch (error) {
        console.error('載入排班配置錯誤:', error);
        window.scheduleConfigData = {};
    }
} 