/**
 * 團體獎金系統模塊
 * 實現員工團體協作獎勵機制
 */
const BonusGroupModule = (function() {
    // 模塊作用域變量
    let db;
    let currentUser = null;
    let currentStore = null;
    let groupTasks = [];
    let employeePerformance = {};
    let bonusPool = 0;
    let votingSystem = {};
    let teamContributions = [];
    let yearEndBonus = 0;
    
    // DOM元素
    let $groupTasksContainer;
    let $bonusPoolDisplay;
    let $teamContributionTable;
    let $performanceChartCanvas;
    let $taskDetailsModal;
    let $votingModal;
    let $yearEndBonusContainer;
    let $wheelContainer;
    
    // 圖表實例
    let performanceChart = null;
    let distributionChart = null;
    
    /**
     * 初始化模塊
     */
    function init() {
        console.log("初始化團體獎金系統...");
        
        // 初始化Firebase
        if (firebase && firebase.firestore) {
            db = firebase.firestore();
        } else {
            console.error("Firestore 未初始化");
            return;
        }
        
        // 綁定DOM元素
        bindDOMElements();
        
        // 監聽認證狀態
        firebase.auth().onAuthStateChanged(function(user) {
            if (user) {
                currentUser = user;
                loadUserData();
            } else {
                console.log("用戶未登入");
                // 顯示登入提示或導向登入頁面
            }
        });
        
        // 初始化事件監聽器
        initEventListeners();
    }
    
    /**
     * 綁定DOM元素
     */
    function bindDOMElements() {
        $groupTasksContainer = document.getElementById('groupTasksContainer');
        $bonusPoolDisplay = document.getElementById('bonusPoolDisplay');
        $teamContributionTable = document.getElementById('teamContributionTable');
        $performanceChartCanvas = document.getElementById('performanceChart');
        $taskDetailsModal = document.getElementById('taskDetailsModal');
        $votingModal = document.getElementById('votingModal');
        $yearEndBonusContainer = document.getElementById('yearEndBonusContainer');
        $wheelContainer = document.getElementById('bonusWheelContainer');
        
        // 初始化模態框
        if (typeof bootstrap !== 'undefined') {
            if ($taskDetailsModal) {
                new bootstrap.Modal($taskDetailsModal);
            }
            if ($votingModal) {
                new bootstrap.Modal($votingModal);
            }
        }
    }
    
    /**
     * 初始化事件監聽器
     */
    function initEventListeners() {
        // 任務詳情按鈕
        document.addEventListener('click', function(event) {
            if (event.target.classList.contains('view-details-btn')) {
                const taskId = event.target.dataset.taskId;
                openTaskDetailsModal(taskId);
            }
        });
        
        // 投票按鈕
        document.addEventListener('click', function(event) {
            if (event.target.classList.contains('vote-btn')) {
                const taskId = event.target.dataset.taskId;
                openVotingModal(taskId);
            }
        });
        
        // 提交投票按鈕
        const $submitVoteBtn = document.getElementById('submitVoteBtn');
        if ($submitVoteBtn) {
            $submitVoteBtn.addEventListener('click', submitVote);
        }
        
        // 旋轉盤按鈕
        const $spinWheelBtn = document.getElementById('spinWheelBtn');
        if ($spinWheelBtn) {
            $spinWheelBtn.addEventListener('click', spinBonusWheel);
        }
    }
    
    /**
     * 載入用戶數據
     */
    function loadUserData() {
        // 從Firestore獲取用戶資料
        db.collection('employees').doc(currentUser.uid).get()
            .then(doc => {
                if (doc.exists) {
                    const userData = doc.data();
                    currentStore = userData.store;
                    
                    // 載入團體任務
                    loadGroupTasks();
                    
                    // 載入團隊表現數據
                    loadTeamPerformanceData();
                    
                    // 載入獎金池
                    loadBonusPool();
                    
                    // 初始化旋轉盤 (如果存在)
                    if ($wheelContainer) {
                        initBonusWheel();
                    }
                } else {
                    console.error("找不到用戶資料");
                }
            })
            .catch(error => {
                console.error("獲取用戶資料錯誤:", error);
            });
    }
    
    /**
     * 載入團體任務
     */
    function loadGroupTasks() {
        // 從Firestore獲取團體任務
        db.collection('groupTasks')
            .where('storeId', '==', currentStore)
            .where('isActive', '==', true)
            .get()
            .then(snapshot => {
                groupTasks = [];
                snapshot.forEach(doc => {
                    const task = {
                        id: doc.id,
                        ...doc.data()
                    };
                    groupTasks.push(task);
                });
                
                // 渲染團體任務
                renderGroupTasks();
                
                // 載入投票數據
                loadVotingData();
            })
            .catch(error => {
                console.error("獲取團體任務錯誤:", error);
            });
    }
    
    /**
     * 渲染團體任務
     */
    function renderGroupTasks() {
        if (!$groupTasksContainer) return;
        
        // 清空容器
        $groupTasksContainer.innerHTML = '';
        
        if (groupTasks.length === 0) {
            $groupTasksContainer.innerHTML = '<div class="alert alert-info">目前沒有活躍的團體任務</div>';
            return;
        }
        
        // 按截止日期排序
        groupTasks.sort((a, b) => a.deadline.toDate() - b.deadline.toDate());
        
        // 分組任務
        const tasksByCategory = {};
        groupTasks.forEach(task => {
            if (!tasksByCategory[task.category]) {
                tasksByCategory[task.category] = [];
            }
            tasksByCategory[task.category].push(task);
        });
        
        // 渲染每個類別的任務
        for (const category in tasksByCategory) {
            const $categoryContainer = document.createElement('div');
            $categoryContainer.className = 'task-boundary mb-4';
            $categoryContainer.innerHTML = `<h5 class="mb-3">${category}</h5>`;
            
            const $taskCards = document.createElement('div');
            $taskCards.className = 'row';
            
            tasksByCategory[category].forEach(task => {
                const deadline = task.deadline.toDate();
                const daysLeft = Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24));
                const progress = calculateTaskProgress(task);
                
                const $taskCard = document.createElement('div');
                $taskCard.className = 'col-md-4 mb-3';
                $taskCard.innerHTML = `
                    <div class="card group-task-card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <span>${task.title}</span>
                            <span class="badge ${daysLeft <= 3 ? 'bg-danger' : 'bg-primary'}">${daysLeft > 0 ? `${daysLeft}天` : '已截止'}</span>
                        </div>
                        <div class="card-body">
                            <p class="card-text">${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}</p>
                            <div class="progress mb-3">
                                <div class="progress-bar" role="progressbar" style="width: ${progress}%" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">${progress}%</div>
                            </div>
                            <div class="d-flex">
                                <button class="btn btn-sm btn-outline-primary view-details-btn me-2" data-task-id="${task.id}">查看詳情</button>
                                <button class="btn btn-sm btn-outline-info vote-btn" data-task-id="${task.id}">投票</button>
                            </div>
                            <div class="mt-2">
                                ${renderParticipationBadges(task.participationConditions)}
                            </div>
                        </div>
                    </div>
                `;
                
                $taskCards.appendChild($taskCard);
            });
            
            $categoryContainer.appendChild($taskCards);
            $groupTasksContainer.appendChild($categoryContainer);
        }
    }
    
    /**
     * 計算任務進度
     */
    function calculateTaskProgress(task) {
        if (!task.milestones || task.milestones.length === 0) {
            return 0;
        }
        
        let completedMilestones = 0;
        task.milestones.forEach(milestone => {
            if (milestone.completed) {
                completedMilestones++;
            }
        });
        
        return Math.round((completedMilestones / task.milestones.length) * 100);
    }
    
    /**
     * 渲染參與條件標籤
     */
    function renderParticipationBadges(conditions) {
        if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
            return '';
        }
        
        let badgesHTML = '';
        conditions.forEach(condition => {
            const className = condition.required ? 'participation-badge required' : 'participation-badge';
            badgesHTML += `<span class="${className}">${condition.name}</span>`;
        });
        
        return badgesHTML;
    }
    
    /**
     * 打開任務詳情模態框
     */
    function openTaskDetailsModal(taskId) {
        const task = groupTasks.find(t => t.id === taskId);
        if (!task) return;
        
        const $modalTitle = $taskDetailsModal.querySelector('.modal-title');
        const $modalBody = $taskDetailsModal.querySelector('.modal-body');
        
        $modalTitle.textContent = task.title;
        
        $modalBody.innerHTML = `
            <p>${task.description}</p>
            <h6>任務截止日期</h6>
            <p>${task.deadline.toDate().toLocaleDateString()}</p>
            <h6>獎金價值</h6>
            <p>$${task.bonusValue}</p>
            <h6>完成進度</h6>
            <div class="progress mb-3">
                <div class="progress-bar" role="progressbar" style="width: ${calculateTaskProgress(task)}%" aria-valuenow="${calculateTaskProgress(task)}" aria-valuemin="0" aria-valuemax="100">${calculateTaskProgress(task)}%</div>
            </div>
            <h6>里程碑</h6>
            <div class="card">
                <ul class="list-group list-group-flush">
                    ${task.milestones.map(milestone => `
                        <li class="list-group-item">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" ${milestone.completed ? 'checked' : ''} disabled>
                                <label class="form-check-label ${milestone.completed ? 'text-decoration-line-through' : ''}">
                                    ${milestone.description}
                                </label>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            </div>
            <h6 class="mt-3">參與條件</h6>
            <ul class="list-group">
                ${task.participationConditions && task.participationConditions.map(condition => `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        ${condition.name}
                        ${condition.required ? '<span class="badge bg-danger">必要</span>' : '<span class="badge bg-secondary">選擇性</span>'}
                    </li>
                `).join('') || '<li class="list-group-item">無特殊參與條件</li>'}
            </ul>
            <h6 class="mt-3">團隊投票情況</h6>
            <div id="votingStatusChart" style="height: 200px;"></div>
        `;
        
        // 顯示模態框
        const modal = bootstrap.Modal.getInstance($taskDetailsModal) || new bootstrap.Modal($taskDetailsModal);
        modal.show();
        
        // 渲染投票圖表
        renderVotingStatusChart(taskId);
    }
    
    /**
     * 渲染投票狀態圖表
     */
    function renderVotingStatusChart(taskId) {
        // 獲取任務的投票容器
        const chartContainer = document.querySelector(`.task-card[data-task-id="${taskId}"] .voting-chart`);
        if (!chartContainer) {
            console.warn(`找不到任務 ${taskId} 的投票圖表容器`);
            return;
        }
        
        // 確保有投票數據
        if (!votingSystem[taskId] || !votingSystem[taskId].results || Object.keys(votingSystem[taskId].results).length === 0) {
            chartContainer.innerHTML = '<div class="no-votes-message">尚未有團隊成員獲得投票</div>';
            return;
        }
        
        // 準備圖表數據
        const employeeScores = votingSystem[taskId].results;
        const labels = [];
        const data = [];
        const backgroundColor = [];
        
        // 生成隨機顏色的函數
        const getRandomColor = () => {
            const letters = '0123456789ABCDEF';
            let color = '#';
            for (let i = 0; i < 6; i++) {
                color += letters[Math.floor(Math.random() * 16)];
            }
            return color;
        };
        
        // 收集員工名稱和分數
        Object.keys(employeeScores).forEach(empId => {
            // 獲取員工名稱
            const employee = employees.find(e => e.id === empId);
            const empName = employee ? employee.name : '未知員工';
            
            labels.push(empName);
            data.push(parseFloat(employeeScores[empId].percentage)); // 使用百分比
            backgroundColor.push(getRandomColor());
        });
        
        // 創建圖表
        const chartCanvas = document.createElement('canvas');
        chartContainer.innerHTML = ''; // 清空容器
        chartContainer.appendChild(chartCanvas);
        
        // 使用Chart.js
        if (typeof Chart !== 'undefined') {
            new Chart(chartCanvas, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: backgroundColor,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                boxWidth: 12,
                                font: {
                                    size: 10
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    return `${label}: ${value.toFixed(1)}%`;
                                }
                            }
                        }
                    }
                }
            });
        } else {
            // 如果Chart.js不可用，顯示簡單的HTML表格
            const table = document.createElement('table');
            table.className = 'voting-results-table';
            
            let tableHTML = `
                <thead>
                    <tr>
                        <th>團隊成員</th>
                        <th>得票率</th>
                    </tr>
                </thead>
                <tbody>
            `;
            
            labels.forEach((label, index) => {
                tableHTML += `
                    <tr>
                        <td>${label}</td>
                        <td>${data[index].toFixed(1)}%</td>
                    </tr>
                `;
            });
            
            tableHTML += '</tbody>';
            table.innerHTML = tableHTML;
            
            chartContainer.appendChild(table);
        }
        
        // 添加一個簡短說明
        const votesCount = votingSystem[taskId].votes ? Object.keys(votingSystem[taskId].votes).length : 0;
        const voteSummary = document.createElement('div');
        voteSummary.className = 'vote-summary';
        voteSummary.textContent = `共 ${votesCount} 人參與投票`;
        chartContainer.appendChild(voteSummary);
    }
    
    /**
     * 計算總團隊成員數
     */
    function calculateTotalTeamMembers() {
        // 這裡可以實現根據store獲取團隊成員數
        // 暫時返回一個固定值
        return 8;
    }
    
    /**
     * 打開投票模態框
     */
    function openVotingModal(taskId) {
        // 獲取任務數據
        const task = groupTasks.find(t => t.id === taskId);
        if (!task) {
            showMessage('找不到指定任務');
            return;
        }
        
        // 確保模態框元素存在
        if (!$votingModal) {
            console.error("投票模態框元素不存在");
            showMessage('無法開啟投票視窗', 'error');
            return;
        }
        
        // 設置模態框內容
        const modalTitle = $votingModal.querySelector('.modal-title');
        const modalBody = $votingModal.querySelector('.modal-body');
        
        if (modalTitle) {
            modalTitle.textContent = '為任務評分: ' + task.title;
        }
        
        if (modalBody) {
            // 重置表單內容
            modalBody.innerHTML = `
                <input type="hidden" id="votingTaskId" value="${taskId}">
                <div class="form-group mb-3">
                    <label for="votingEmployeeId">選擇團隊成員:</label>
                    <select id="votingEmployeeId" class="form-control">
                        <option value="">-- 請選擇 --</option>
                    </select>
                </div>
                <div class="form-group mb-3">
                    <label for="votingPoints">分配積分 (1-10):</label>
                    <input type="range" id="votingPoints" class="form-control" min="1" max="10" value="5">
                    <output for="votingPoints" id="pointsOutput">5 分</output>
                </div>
                <div class="form-group">
                    <label for="votingReason">評分理由 (選填):</label>
                    <textarea id="votingReason" class="form-control" rows="3" placeholder="請說明您給予這個分數的原因..."></textarea>
                </div>
            `;
            
            // 獲取團隊成員選擇器
            const employeeSelect = document.getElementById('votingEmployeeId');
            
            // 載入團隊成員 (從Firestore或本地數據)
            loadTeamMembers().then(members => {
                // 填充選擇器
                members.forEach(member => {
                    if (member.id !== currentUser.uid) { // 不能給自己投票
                        const option = document.createElement('option');
                        option.value = member.id;
                        option.textContent = member.name;
                        employeeSelect.appendChild(option);
                    }
                });
                
                // 添加滑塊值變化事件
                const pointsSlider = document.getElementById('votingPoints');
                const pointsOutput = document.getElementById('pointsOutput');
                
                if (pointsSlider && pointsOutput) {
                    pointsSlider.addEventListener('input', function() {
                        pointsOutput.textContent = this.value + ' 分';
                    });
                }
                
                // 檢查用戶是否已經投過票
                if (votingSystem[taskId] && 
                    votingSystem[taskId].votes && 
                    votingSystem[taskId].votes[currentUser.uid]) {
                    
                    const previousVote = votingSystem[taskId].votes[currentUser.uid];
                    
                    // 預選之前的選擇
                    if (previousVote.employeeId) {
                        employeeSelect.value = previousVote.employeeId;
                    }
                    
                    // 設置先前的分數
                    if (pointsSlider && previousVote.points) {
                        pointsSlider.value = previousVote.points;
                        pointsOutput.textContent = previousVote.points + ' 分';
                    }
                }
            }).catch(error => {
                console.error("載入團隊成員錯誤:", error);
                modalBody.innerHTML = `<div class="alert alert-danger">載入團隊成員時發生錯誤: ${error.message}</div>`;
            });
        }
        
        // 打開模態框
        if (typeof bootstrap !== 'undefined') {
            const modal = new bootstrap.Modal($votingModal);
            modal.show();
        } else {
            // 備用顯示方式
            $votingModal.style.display = 'block';
        }
    }
    
    /**
     * 載入團隊成員
     */
    async function loadTeamMembers() {
        try {
            // 如果已經有團隊成員數據，直接返回
            if (employees && employees.length > 0) {
                return employees;
            }
            
            // 從Firestore獲取團隊成員
            const snapshot = await db.collection('employees')
                .where('store', '==', currentStore)
                .where('isActive', '==', true)
                .get();
            
            const members = [];
            snapshot.forEach(doc => {
                members.push({
                    id: doc.id,
                    name: doc.data().name,
                    position: doc.data().position || '員工'
                });
            });
            
            // 儲存到模組變數
            employees = members;
            
            return members;
        } catch (error) {
            console.error("獲取團隊成員錯誤:", error);
            throw new Error("無法載入團隊成員");
        }
    }
    
    /**
     * 提交投票
     */
    function submitVote() {
        // 獲取選擇的任務和投票選項
        const taskId = document.getElementById('votingTaskId').value;
        const employeeId = document.getElementById('votingEmployeeId').value;
        const points = parseInt(document.getElementById('votingPoints').value, 10);
        
        if (!taskId || !employeeId || isNaN(points)) {
            showMessage('請選擇有效的員工和積分');
            return;
        }
        
        // 驗證當前用戶是否已投票
        const currentUserId = currentUser.uid;
        const votingTask = groupTasks.find(task => task.id === taskId);
        
        if (!votingTask) {
            showMessage('找不到指定的任務');
            return;
        }
        
        // 顯示處理中狀態
        const submitButton = document.getElementById('submitVoteBtn');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 處理中...';
        }
        
        try {
            // 確保投票數據初始化
            if (!votingSystem[taskId]) {
                votingSystem[taskId] = {
                    votes: {},
                    results: {}
                };
            }
            
            // 構建投票數據
            const voteData = {
                taskId: taskId,
                voterId: currentUserId,
                employeeId: employeeId,
                points: points,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // 新增或更新投票到Firestore
            db.collection('votes')
                .where('taskId', '==', taskId)
                .where('voterId', '==', currentUserId)
                .get()
                .then(snapshot => {
                    let voteOperation;
                    
                    if (snapshot.empty) {
                        // 新增投票
                        console.log("Adding new vote:", voteData);
                        voteOperation = db.collection('votes').add(voteData);
                    } else {
                        // 更新投票
                        const voteId = snapshot.docs[0].id;
                        console.log("Updating existing vote:", voteId);
                        voteOperation = db.collection('votes').doc(voteId).update({
                            employeeId: employeeId,
                            points: points,
                            timestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                    
                    return voteOperation;
                })
                .then(() => {
                    // 更新本地投票系統
                    if (!votingSystem[taskId].votes[currentUserId]) {
                        votingSystem[taskId].votes[currentUserId] = {};
                    }
                    
                    votingSystem[taskId].votes[currentUserId] = {
                        employeeId: employeeId,
                        points: points
                    };
                    
                    // 更新結果統計
                    calculateVotingResults(taskId);
                    
                    // 更新UI
                    renderVotingStatusChart(taskId);
                    
                    // 關閉模態框
                    if (typeof bootstrap !== 'undefined' && $votingModal) {
                        const modalInstance = bootstrap.Modal.getInstance($votingModal);
                        if (modalInstance) {
                            modalInstance.hide();
                        } else {
                            $votingModal.style.display = 'none';
                        }
                    } else {
                        // 備用關閉方式
                        if ($votingModal) {
                            $votingModal.style.display = 'none';
                        }
                    }
                    
                    showMessage('投票成功提交', 'success');
                })
                .catch(error => {
                    console.error("投票錯誤:", error);
                    showMessage('投票過程中發生錯誤：' + error.message, 'error');
                })
                .finally(() => {
                    // 恢復按鈕狀態
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = '提交投票';
                    }
                });
        } catch (error) {
            console.error("投票處理錯誤:", error);
            showMessage('處理投票時發生錯誤', 'error');
            
            // 恢復按鈕狀態
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = '提交投票';
            }
        }
    }
    
    /**
     * 計算投票結果
     */
    function calculateVotingResults(taskId) {
        if (!votingSystem[taskId] || !votingSystem[taskId].votes) {
            return;
        }
        
        // 重置結果
        votingSystem[taskId].results = {};
        
        // 計算每個員工獲得的總分數
        Object.values(votingSystem[taskId].votes).forEach(vote => {
            const { employeeId, points } = vote;
            
            if (!votingSystem[taskId].results[employeeId]) {
                votingSystem[taskId].results[employeeId] = 0;
            }
            
            votingSystem[taskId].results[employeeId] += points;
        });
        
        // 計算總分數和百分比
        const totalPoints = Object.values(votingSystem[taskId].results).reduce((sum, points) => sum + points, 0);
        
        Object.keys(votingSystem[taskId].results).forEach(employeeId => {
            const points = votingSystem[taskId].results[employeeId];
            const percentage = totalPoints > 0 ? (points / totalPoints) * 100 : 0;
            
            votingSystem[taskId].results[employeeId] = {
                points: points,
                percentage: percentage.toFixed(2)
            };
        });
    }
    
    /**
     * 載入投票數據
     */
    function loadVotingData() {
        // 如果沒有團體任務，則不需要載入投票數據
        if (groupTasks.length === 0) {
            return;
        }
        
        // 重置投票系統
        votingSystem = {};
        
        // 初始化每個任務的投票數據結構
        groupTasks.forEach(task => {
            votingSystem[task.id] = {
                votes: {},
                results: {}
            };
        });
        
        // 從Firestore獲取所有投票
        const taskIds = groupTasks.map(task => task.id);
        
        db.collection('votes')
            .where('taskId', 'in', taskIds)
            .get()
            .then(snapshot => {
                // 處理每個投票
                snapshot.forEach(doc => {
                    const voteData = doc.data();
                    const { taskId, voterId, employeeId, points } = voteData;
                    
                    // 確保投票系統中有該任務
                    if (!votingSystem[taskId]) {
                        votingSystem[taskId] = {
                            votes: {},
                            results: {}
                        };
                    }
                    
                    // 記錄投票
                    if (!votingSystem[taskId].votes[voterId]) {
                        votingSystem[taskId].votes[voterId] = {};
                    }
                    
                    votingSystem[taskId].votes[voterId] = {
                        employeeId: employeeId,
                        points: points
                    };
                });
                
                // 為每個任務計算投票結果
                taskIds.forEach(taskId => {
                    calculateVotingResults(taskId);
                });
                
                // 更新UI顯示
                groupTasks.forEach(task => {
                    renderVotingStatusChart(task.id);
                });
            })
            .catch(error => {
                console.error("載入投票數據錯誤:", error);
                showMessage('載入投票數據時發生錯誤', 'error');
            });
    }
    
    /**
     * 載入團隊表現數據
     */
    function loadTeamPerformanceData() {
        // 從Firestore獲取團隊表現數據
        db.collection('teamPerformance')
            .where('storeId', '==', currentStore)
            .get()
            .then(snapshot => {
                employeePerformance = {};
                snapshot.forEach(doc => {
                    employeePerformance[doc.id] = doc.data();
                });
                
                // 計算團隊貢獻分數
                calculateTeamContributions();
                
                // 渲染團隊貢獻表格
                renderTeamContributionTable();
                
                // 渲染表現圖表
                renderPerformanceChart();
            })
            .catch(error => {
                console.error("獲取團隊表現數據錯誤:", error);
            });
    }
    
    /**
     * 計算團隊貢獻分數
     */
    function calculateTeamContributions() {
        teamContributions = [];
        
        for (const employeeId in employeePerformance) {
            const performance = employeePerformance[employeeId];
            
            // 計算總貢獻分數
            let totalContribution = 0;
            totalContribution += performance.taskCompletion || 0;
            totalContribution += performance.attendance || 0;
            totalContribution += performance.customerRating || 0;
            totalContribution += performance.peerRating || 0;
            totalContribution += performance.managerRating || 0;
            
            teamContributions.push({
                employeeId: employeeId,
                employeeName: performance.employeeName,
                contribution: totalContribution,
                detail: {
                    taskCompletion: performance.taskCompletion || 0,
                    attendance: performance.attendance || 0,
                    customerRating: performance.customerRating || 0,
                    peerRating: performance.peerRating || 0,
                    managerRating: performance.managerRating || 0
                }
            });
        }
        
        // 排序
        teamContributions.sort((a, b) => b.contribution - a.contribution);
    }
    
    /**
     * 渲染團隊貢獻表格
     */
    function renderTeamContributionTable() {
        if (!$teamContributionTable) return;
        
        // 清空表格
        $teamContributionTable.innerHTML = '';
        
        // 創建表格頭
        const $thead = document.createElement('thead');
        $thead.innerHTML = `
            <tr>
                <th scope="col">排名</th>
                <th scope="col">員工</th>
                <th scope="col">總貢獻分數</th>
                <th scope="col">任務完成</th>
                <th scope="col">出勤率</th>
                <th scope="col">顧客評價</th>
                <th scope="col">同事評價</th>
                <th scope="col">主管評價</th>
            </tr>
        `;
        $teamContributionTable.appendChild($thead);
        
        // 創建表格體
        const $tbody = document.createElement('tbody');
        teamContributions.forEach((contribution, index) => {
            const $tr = document.createElement('tr');
            $tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${contribution.employeeName}</td>
                <td>${contribution.contribution.toFixed(1)}</td>
                <td>${contribution.detail.taskCompletion.toFixed(1)}</td>
                <td>${contribution.detail.attendance.toFixed(1)}</td>
                <td>${contribution.detail.customerRating.toFixed(1)}</td>
                <td>${contribution.detail.peerRating.toFixed(1)}</td>
                <td>${contribution.detail.managerRating.toFixed(1)}</td>
            `;
            $tbody.appendChild($tr);
        });
        $teamContributionTable.appendChild($tbody);
    }
    
    /**
     * 渲染表現圖表
     */
    function renderPerformanceChart() {
        if (!$performanceChartCanvas) return;
        
        // 準備圖表數據
        const labels = teamContributions.map(c => c.employeeName);
        const datasets = [
            {
                label: '任務完成',
                data: teamContributions.map(c => c.detail.taskCompletion),
                backgroundColor: 'rgba(54, 162, 235, 0.5)'
            },
            {
                label: '出勤率',
                data: teamContributions.map(c => c.detail.attendance),
                backgroundColor: 'rgba(255, 206, 86, 0.5)'
            },
            {
                label: '顧客評價',
                data: teamContributions.map(c => c.detail.customerRating),
                backgroundColor: 'rgba(75, 192, 192, 0.5)'
            },
            {
                label: '同事評價',
                data: teamContributions.map(c => c.detail.peerRating),
                backgroundColor: 'rgba(153, 102, 255, 0.5)'
            },
            {
                label: '主管評價',
                data: teamContributions.map(c => c.detail.managerRating),
                backgroundColor: 'rgba(255, 99, 132, 0.5)'
            }
        ];
        
        // 創建圖表
        if (performanceChart) {
            performanceChart.destroy();
        }
        
        performanceChart = new Chart($performanceChartCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 10
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: '團隊表現分析'
                    }
                }
            }
        });
    }
    
    /**
     * 載入獎金池
     */
    function loadBonusPool() {
        // 從Firestore獲取獎金池
        db.collection('bonusPool')
            .doc(currentStore)
            .get()
            .then(doc => {
                if (doc.exists) {
                    bonusPool = doc.data().amount || 0;
                    yearEndBonus = doc.data().yearEndBonus || 0;
                    
                    // 渲染獎金池
                    renderBonusPool();
                }
            })
            .catch(error => {
                console.error("獲取獎金池錯誤:", error);
            });
    }
    
    /**
     * 渲染獎金池
     */
    function renderBonusPool() {
        if (!$bonusPoolDisplay) return;
        
        $bonusPoolDisplay.innerHTML = `
            <h3>當前獎金池</h3>
            <div class="bonus-amount">$${bonusPool.toLocaleString()}</div>
            <div class="progress mb-2">
                <div class="progress-bar" role="progressbar" style="width: 65%" aria-valuenow="65" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
            <p>距離下次分配還有 15 天</p>
        `;
        
        // 渲染年終獎金
        if ($yearEndBonusContainer) {
            $yearEndBonusContainer.innerHTML = `
                <h3>年終獎金池</h3>
                <div class="bonus-amount">$${yearEndBonus.toLocaleString()}</div>
                <div class="progress mb-2">
                    <div class="progress-bar" role="progressbar" style="width: 35%" aria-valuenow="35" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <p>年終獎金將於 12 月 31 日分配</p>
            `;
        }
    }
    
    /**
     * 初始化獎金旋轉盤
     */
    function initBonusWheel() {
        if (!$wheelContainer) return;
        
        // 創建旋轉盤畫布
        const $wheelCanvas = document.createElement('canvas');
        $wheelCanvas.className = 'wheel-canvas';
        
        // 創建旋轉盤指針
        const $wheelPointer = document.createElement('div');
        $wheelPointer.className = 'wheel-pointer';
        
        // 創建旋轉盤按鈕
        const $spinButton = document.createElement('button');
        $spinButton.id = 'spinWheelBtn';
        $spinButton.className = 'wheel-spin-btn';
        $spinButton.textContent = '旋轉';
        
        // 添加到容器
        const $wheelDiv = document.createElement('div');
        $wheelDiv.className = 'bonus-wheel';
        $wheelDiv.appendChild($wheelCanvas);
        $wheelDiv.appendChild($wheelPointer);
        $wheelDiv.appendChild($spinButton);
        
        $wheelContainer.innerHTML = '<h4 class="text-center mb-3">獎金機率輪盤</h4>';
        $wheelContainer.appendChild($wheelDiv);
        
        // 創建旋轉盤
        createBonusWheel($wheelCanvas);
    }
    
    /**
     * 創建獎金旋轉盤
     */
    function createBonusWheel(canvas) {
        const ctx = canvas.getContext('2d');
        const items = [
            { text: '$100', color: '#f9ca24', probability: 0.1 },
            { text: '$50', color: '#f0932b', probability: 0.2 },
            { text: '$20', color: '#eb4d4b', probability: 0.3 },
            { text: '$10', color: '#6ab04c', probability: 0.2 },
            { text: '$5', color: '#22a6b3', probability: 0.1 },
            { text: '$0', color: '#4834d4', probability: 0.1 }
        ];
        
        const totalItems = items.length;
        const arc = Math.PI * 2 / totalItems;
        const size = canvas.width;
        
        // 繪製輪盤
        for (let i = 0; i < totalItems; i++) {
            const angle = i * arc;
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2, angle, angle + arc);
            ctx.lineTo(size / 2, size / 2);
            ctx.fillStyle = items[i].color;
            ctx.fill();
            
            // 繪製文字
            ctx.save();
            ctx.translate(size / 2, size / 2);
            ctx.rotate(angle + arc / 2);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(items[i].text, size / 2 - 10, 10);
            ctx.restore();
        }
    }
    
    /**
     * 旋轉獎金旋轉盤
     */
    function spinBonusWheel() {
        const $wheelCanvas = document.querySelector('.wheel-canvas');
        if (!$wheelCanvas) return;
        
        // 隨機旋轉角度
        const randomDegrees = Math.floor(Math.random() * 360) + 1800; // 至少旋轉5圈
        $wheelCanvas.style.transform = `rotate(${randomDegrees}deg)`;
        
        // 禁用按鈕
        const $spinButton = document.getElementById('spinWheelBtn');
        if ($spinButton) {
            $spinButton.disabled = true;
        }
        
        // 旋轉結束後顯示結果
        setTimeout(() => {
            // TODO: 根據旋轉結果計算獎金
            const bonusAmount = calculateWheelResult(randomDegrees);
            alert(`恭喜您獲得了 $${bonusAmount} 的獎金！`);
            
            // 重置按鈕
            if ($spinButton) {
                $spinButton.disabled = false;
            }
        }, 5000);
    }
    
    /**
     * 計算旋轉盤結果
     */
    function calculateWheelResult(degrees) {
        // 簡化版計算，實際邏輯應根據旋轉結果和獎項概率
        const normalizedDegrees = degrees % 360;
        const items = [100, 50, 20, 10, 5, 0]; // 與旋轉盤項目對應
        const itemDegree = 360 / items.length;
        const index = Math.floor(normalizedDegrees / itemDegree);
        return items[index];
    }
    
    /**
     * 顯示年終獎金特效
     */
    function showYearEndBonusAnimation(amount) {
        // 創建動畫容器
        const $animationContainer = document.createElement('div');
        $animationContainer.className = 'year-end-bonus-animation';
        
        // 設置內容
        $animationContainer.innerHTML = `
            <div class="congratulations">恭喜您獲得年終獎金！</div>
            <div class="bonus-amount">$${amount.toLocaleString()}</div>
            <div class="description">感謝您過去一年的努力和貢獻，祝您新年快樂！</div>
        `;
        
        // 添加到文檔
        document.body.appendChild($animationContainer);
        
        // 創建彩紙效果
        for (let i = 0; i < 50; i++) {
            createConfetti($animationContainer);
        }
        
        // 顯示動畫
        setTimeout(() => {
            $animationContainer.classList.add('show');
        }, 100);
        
        // 設定自動關閉
        setTimeout(() => {
            $animationContainer.classList.remove('show');
            setTimeout(() => {
                $animationContainer.remove();
            }, 300);
        }, 8000);
    }
    
    /**
     * 創建彩紙效果
     */
    function createConfetti(container) {
        const $confetti = document.createElement('div');
        $confetti.className = 'confetti';
        
        // 隨機顏色和位置
        const colors = ['#f9ca24', '#f0932b', '#eb4d4b', '#6ab04c', '#22a6b3', '#4834d4'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const randomLeft = Math.random() * 100;
        const randomDelay = Math.random() * 5;
        
        $confetti.style.backgroundColor = randomColor;
        $confetti.style.left = `${randomLeft}%`;
        $confetti.style.animationDelay = `${randomDelay}s`;
        
        container.appendChild($confetti);
    }
    
    /**
     * 顯示訊息
     */
    function showMessage(message, type = 'info') {
        // 找到或創建消息元素
        let messageElement = document.getElementById('bonusGroupMessage');
        
        if (!messageElement) {
            messageElement = document.createElement('div');
            messageElement.id = 'bonusGroupMessage';
            messageElement.className = 'message';
            
            // 找適合的容器來放置消息
            const container = document.querySelector('.main-container') || document.body;
            container.insertBefore(messageElement, container.firstChild);
        }
        
        // 設置消息內容和類型
        messageElement.textContent = message;
        messageElement.className = `message ${type}-message`;
        
        // 顯示消息
        messageElement.style.display = 'block';
        
        // 5秒後隱藏消息
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 5000);
    }
    
    // 公開API
    return {
        init: init,
        showYearEndBonusAnimation: showYearEndBonusAnimation
    };
})();

// 當DOM加載完成時初始化模塊
document.addEventListener('DOMContentLoaded', function() {
    BonusGroupModule.init();
}); 