/**
 * 員工獎金小組管理模塊 - 管理員介面
 * 實現組織員工獎金小組、分配任務及設定獎勵倍率
 */

'use strict';

// --- 模組內變數 ---
let bonusGroups = [];
let allEmployees = [];
let bonusTasks = [];
let db = null;
let userData = null;

// DOM 元素引用
let $bonusGroupsTable = null;
let $bonusGroupForm = null;
let $bonusGroupModal = null;
let $bonusGroupMessage = null;
let $employeeSelectContainer = null;
let $taskSelectContainer = null;

// 目前正在編輯的小組 ID
let currentEditingGroupId = null;

// 常數
const MULTIPLIER_OPTIONS = {
    '0.5': '0.5x (減半)',
    '0.8': '0.8x (略減)',
    '1.0': '1.0x (標準)',
    '1.2': '1.2x (略增)',
    '1.5': '1.5x (增半)',
    '2.0': '2.0x (加倍)'
};

/**
 * 初始化獎金小組管理
 * @param {HTMLElement} container - 小組管理區塊容器
 * @param {firebase.firestore.Firestore} firestore - Firestore 實例
 * @param {Object} user - 當前用戶資料
 */
function initBonusGroups(container, firestore, user) {
    console.log("初始化獎金小組管理...");
    
    if (!container || !firestore) {
        console.error("初始化獎金小組管理失敗：缺少必要參數");
        return;
    }
    
    db = firestore;
    userData = user;
    
    // 檢查用戶權限
    if (!userData || userData.level < 9) {
        container.innerHTML = '<div class="alert alert-danger">您沒有權限管理獎金小組</div>';
        return;
    }
    
    // 初始化 UI
    setupBonusGroupsUI(container);
    
    // 載入資料
    loadEmployees();
    loadBonusTasks();
    loadBonusGroups();
    
    // 設置事件監聽器
    setupEventListeners();
}

/**
 * 初始化獎金小組管理 UI
 * @param {HTMLElement} container - 小組管理區塊容器
 */
function setupBonusGroupsUI(container) {
    container.innerHTML = `
        <div class="admin-section-header d-flex justify-content-between align-items-center mb-3">
            <h3>獎金小組管理</h3>
            <button id="add-bonus-group-btn" class="btn btn-primary">
                <i class="fas fa-plus-circle me-1"></i> 新增獎金小組
            </button>
        </div>
        
        <div id="bonus-groups-message" class="alert alert-info d-none"></div>
        
        <div class="table-responsive mb-4">
            <table id="bonus-groups-table" class="table table-striped table-hover">
                <thead class="table-primary">
                    <tr>
                        <th>小組名稱</th>
                        <th>描述</th>
                        <th>成員數</th>
                        <th>任務數</th>
                        <th>狀態</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="6" class="text-center">載入中...</td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <!-- 獎金小組模態框 -->
        <div id="bonus-group-modal" class="modal fade" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">獎金小組資料</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div id="bonus-group-modal-message" class="alert d-none"></div>
                        
                        <form id="bonus-group-form">
                            <div class="mb-3">
                                <label for="group-name" class="form-label">小組名稱 <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" id="group-name" required>
                            </div>
                            
                            <div class="mb-3">
                                <label for="group-description" class="form-label">小組描述</label>
                                <textarea class="form-control" id="group-description" rows="2"></textarea>
                            </div>
                            
                            <div class="mb-3 form-check">
                                <input type="checkbox" class="form-check-input" id="group-is-active" checked>
                                <label class="form-check-label" for="group-is-active">啟用此小組</label>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">成員選擇 <span class="text-danger">*</span></label>
                                <div id="employee-select-container" class="border rounded p-3">
                                    <div class="text-center text-muted">載入員工清單中...</div>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">關聯獎金任務</label>
                                <div id="task-select-container" class="border rounded p-3">
                                    <div class="text-center text-muted">載入任務清單中...</div>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label for="reward-multiplier" class="form-label">獎勵倍率</label>
                                <select class="form-select" id="reward-multiplier">
                                    ${Object.entries(MULTIPLIER_OPTIONS).map(([value, text]) => 
                                        `<option value="${value}">${text}</option>`).join('')
                                    }
                                </select>
                                <div class="form-text">設定此小組完成任務時的獎金倍率</div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                        <button type="button" id="save-bonus-group-btn" class="btn btn-primary">儲存</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // 取得 DOM 元素引用
    $bonusGroupsTable = document.getElementById('bonus-groups-table');
    $bonusGroupForm = document.getElementById('bonus-group-form');
    $bonusGroupModal = document.getElementById('bonus-group-modal');
    $bonusGroupMessage = document.getElementById('bonus-groups-message');
    $employeeSelectContainer = document.getElementById('employee-select-container');
    $taskSelectContainer = document.getElementById('task-select-container');
}

/**
 * 設置事件監聽器
 */
function setupEventListeners() {
    // 新增獎金小組按鈕
    const addButton = document.getElementById('add-bonus-group-btn');
    if (addButton) {
        addButton.addEventListener('click', () => openBonusGroupModal());
    }
    
    // 儲存獎金小組按鈕
    const saveButton = document.getElementById('save-bonus-group-btn');
    if (saveButton) {
        saveButton.addEventListener('click', saveBonusGroup);
    }
    
    // 表格中的編輯與刪除按鈕 (使用事件委派)
    if ($bonusGroupsTable) {
        $bonusGroupsTable.addEventListener('click', (event) => {
            const target = event.target;
            const row = target.closest('tr');
            
            if (!row) return;
            
            const groupId = row.dataset.groupId;
            
            if (target.classList.contains('edit-group-btn')) {
                openBonusGroupModal(groupId);
            } else if (target.classList.contains('delete-group-btn')) {
                confirmDeleteBonusGroup(groupId);
            }
        });
    }
}

/**
 * 載入所有員工資料
 */
function loadEmployees() {
    db.collection('employees')
        .orderBy('name')
        .get()
        .then(snapshot => {
            allEmployees = [];
            snapshot.forEach(doc => {
                allEmployees.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            console.log(`載入了 ${allEmployees.length} 位員工資料`);
            
            // 更新選擇框
            renderEmployeeSelect();
        })
        .catch(error => {
            console.error("載入員工資料錯誤:", error);
            showMessage("載入員工資料時發生錯誤", "error");
        });
}

/**
 * 載入獎金任務資料
 */
function loadBonusTasks() {
    db.collection('bonus_tasks')
        .where('isActive', '==', true)
        .get()
        .then(snapshot => {
            bonusTasks = [];
            snapshot.forEach(doc => {
                bonusTasks.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            console.log(`載入了 ${bonusTasks.length} 個獎金任務`);
            
            // 更新選擇框
            renderTaskSelect();
        })
        .catch(error => {
            console.error("載入獎金任務錯誤:", error);
            showMessage("載入獎金任務時發生錯誤", "error");
        });
}

/**
 * 載入獎金小組資料
 */
function loadBonusGroups() {
    db.collection('bonus_groups')
        .get()
        .then(snapshot => {
            bonusGroups = [];
            snapshot.forEach(doc => {
                bonusGroups.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            console.log(`載入了 ${bonusGroups.length} 個獎金小組`);
            
            // 更新表格
            renderBonusGroupsTable();
        })
        .catch(error => {
            console.error("載入獎金小組錯誤:", error);
            showMessage("載入獎金小組時發生錯誤", "error");
        });
}

/**
 * 渲染獎金小組表格
 */
function renderBonusGroupsTable() {
    if (!$bonusGroupsTable) return;
    
    const tbody = $bonusGroupsTable.querySelector('tbody');
    
    if (bonusGroups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">目前沒有任何獎金小組</td></tr>';
        return;
    }
    
    // 先按名稱排序
    bonusGroups.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
    
    tbody.innerHTML = '';
    
    bonusGroups.forEach(group => {
        const memberCount = group.members ? group.members.length : 0;
        const taskCount = group.tasks ? group.tasks.length : 0;
        const statusClass = group.isActive ? 'text-success' : 'text-danger';
        const statusText = group.isActive ? '啟用中' : '已停用';
        
        const row = document.createElement('tr');
        row.dataset.groupId = group.id;
        
        row.innerHTML = `
            <td>${escapeHTML(group.name)}</td>
            <td>${escapeHTML(group.description || '')}</td>
            <td>${memberCount}</td>
            <td>${taskCount}</td>
            <td><span class="${statusClass}">${statusText}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary edit-group-btn me-2">
                    <i class="fas fa-edit"></i> 編輯
                </button>
                <button class="btn btn-sm btn-outline-danger delete-group-btn">
                    <i class="fas fa-trash-alt"></i> 刪除
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

/**
 * 渲染員工選擇區塊
 * @param {Array} selectedEmployees - 已選擇的員工 ID 列表
 */
function renderEmployeeSelect(selectedEmployees = []) {
    if (!$employeeSelectContainer) return;
    
    if (allEmployees.length === 0) {
        $employeeSelectContainer.innerHTML = '<div class="text-center text-muted">沒有可選擇的員工</div>';
        return;
    }
    
    // 按照分店分類員工
    const employeesByStore = {};
    
    allEmployees.forEach(employee => {
        const store = employee.store || '未分配';
        
        if (!employeesByStore[store]) {
            employeesByStore[store] = [];
        }
        
        employeesByStore[store].push(employee);
    });
    
    let html = '<div class="row mb-2"><div class="col-12">';
    html += '<div class="form-check form-check-inline">';
    html += '<input class="form-check-input" type="checkbox" id="select-all-employees">';
    html += '<label class="form-check-label" for="select-all-employees">全選/取消全選</label>';
    html += '</div></div></div>';
    
    // 遍歷每個分店
    Object.keys(employeesByStore).sort().forEach(store => {
        html += `<div class="store-group mb-3">`;
        html += `<h6>${escapeHTML(store)}</h6>`;
        html += `<div class="row">`;
        
        // 該分店的員工
        employeesByStore[store].forEach(employee => {
            const isChecked = selectedEmployees.includes(employee.id);
            
            html += `<div class="col-md-4 col-sm-6 mb-2">`;
            html += `<div class="form-check">`;
            html += `<input class="form-check-input employee-checkbox" type="checkbox" 
                        id="employee-${employee.id}" value="${employee.id}" 
                        ${isChecked ? 'checked' : ''}>`;
            html += `<label class="form-check-label" for="employee-${employee.id}">
                        ${escapeHTML(employee.name)}
                     </label>`;
            html += `</div></div>`;
        });
        
        html += `</div></div>`;
    });
    
    $employeeSelectContainer.innerHTML = html;
    
    // 全選/取消全選事件
    const selectAllCheckbox = document.getElementById('select-all-employees');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            const isChecked = selectAllCheckbox.checked;
            const checkboxes = $employeeSelectContainer.querySelectorAll('.employee-checkbox');
            
            checkboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
            });
        });
    }
}

/**
 * 渲染任務選擇區塊
 * @param {Array} selectedTasks - 已選擇的任務 ID 列表
 */
function renderTaskSelect(selectedTasks = []) {
    if (!$taskSelectContainer) return;
    
    if (bonusTasks.length === 0) {
        $taskSelectContainer.innerHTML = '<div class="text-center text-muted">沒有可選擇的獎金任務</div>';
        return;
    }
    
    let html = '<div class="row mb-2"><div class="col-12">';
    html += '<div class="form-check form-check-inline">';
    html += '<input class="form-check-input" type="checkbox" id="select-all-tasks">';
    html += '<label class="form-check-label" for="select-all-tasks">全選/取消全選</label>';
    html += '</div></div></div>';
    
    html += `<div class="row">`;
    
    // 任務清單
    bonusTasks.forEach(task => {
        const isChecked = selectedTasks.includes(task.id);
        const rewardValue = task.rewardValue || 0;
        
        html += `<div class="col-md-6 mb-2">`;
        html += `<div class="form-check">`;
        html += `<input class="form-check-input task-checkbox" type="checkbox" 
                    id="task-${task.id}" value="${task.id}" 
                    ${isChecked ? 'checked' : ''}>`;
        html += `<label class="form-check-label" for="task-${task.id}">
                    ${escapeHTML(task.name)} 
                    <span class="text-muted">(${rewardValue})</span>
                 </label>`;
        html += `</div></div>`;
    });
    
    html += `</div>`;
    
    $taskSelectContainer.innerHTML = html;
    
    // 全選/取消全選事件
    const selectAllCheckbox = document.getElementById('select-all-tasks');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            const isChecked = selectAllCheckbox.checked;
            const checkboxes = $taskSelectContainer.querySelectorAll('.task-checkbox');
            
            checkboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
            });
        });
    }
}

/**
 * 開啟獎金小組模態框
 * @param {string} groupId - 欲編輯的小組 ID，若為新增則不傳
 */
function openBonusGroupModal(groupId = null) {
    if (!$bonusGroupModal || !$bonusGroupForm) return;
    
    // Reset form
    $bonusGroupForm.reset();
    
    // Hide message
    hideModalMessage();
    
    currentEditingGroupId = groupId;
    
    // 設置模態框標題
    const modalTitle = $bonusGroupModal.querySelector('.modal-title');
    if (modalTitle) {
        modalTitle.textContent = groupId ? '編輯獎金小組' : '新增獎金小組';
    }
    
    // 如果是編輯模式，填入資料
    if (groupId) {
        const group = bonusGroups.find(g => g.id === groupId);
        
        if (!group) {
            console.error(`找不到 ID 為 ${groupId} 的獎金小組`);
            return;
        }
        
        // 填入基本資料
        document.getElementById('group-name').value = group.name || '';
        document.getElementById('group-description').value = group.description || '';
        document.getElementById('group-is-active').checked = group.isActive !== false;
        
        const multiplierSelect = document.getElementById('reward-multiplier');
        if (multiplierSelect) {
            const multiplier = group.rewardMultiplier || 1.0;
            multiplierSelect.value = multiplier.toString();
        }
        
        // 渲染選擇區塊
        renderEmployeeSelect(group.members || []);
        renderTaskSelect(group.tasks || []);
    } else {
        // 新增模式
        renderEmployeeSelect([]);
        renderTaskSelect([]);
    }
    
    // 開啟模態框 (使用 Bootstrap)
    const modal = new bootstrap.Modal($bonusGroupModal);
    modal.show();
}

/**
 * 儲存獎金小組
 */
async function saveBonusGroup() {
    if (!$bonusGroupForm) return;
    
    const saveButton = document.getElementById('save-bonus-group-btn');
    if (saveButton) {
        saveButton.disabled = true;
    }
    
    try {
        // 獲取表單資料
        const name = document.getElementById('group-name').value.trim();
        if (!name) {
            throw new Error('小組名稱不能為空');
        }
        
        const description = document.getElementById('group-description').value.trim();
        const isActive = document.getElementById('group-is-active').checked;
        
        // 獲取選擇的員工
        const selectedEmployees = Array.from(
            $employeeSelectContainer.querySelectorAll('.employee-checkbox:checked')
        ).map(checkbox => checkbox.value);
        
        if (selectedEmployees.length === 0) {
            throw new Error('請至少選擇一位員工');
        }
        
        // 獲取選擇的任務
        const selectedTasks = Array.from(
            $taskSelectContainer.querySelectorAll('.task-checkbox:checked')
        ).map(checkbox => checkbox.value);
        
        // 獲取獎勵倍率
        const multiplierSelect = document.getElementById('reward-multiplier');
        const rewardMultiplier = multiplierSelect ? parseFloat(multiplierSelect.value) : 1.0;
        
        // 準備要儲存的資料
        const groupData = {
            name,
            description,
            isActive,
            members: selectedEmployees,
            tasks: selectedTasks,
            rewardMultiplier,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // 如果是新增，加上建立時間
        if (!currentEditingGroupId) {
            groupData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            groupData.createdBy = userData.uid;
        }
        
        // 儲存到 Firestore
        let docRef;
        
        if (currentEditingGroupId) {
            docRef = db.collection('bonus_groups').doc(currentEditingGroupId);
            await docRef.update(groupData);
            showModalMessage('獎金小組更新成功', 'success');
        } else {
            docRef = db.collection('bonus_groups').doc();
            await docRef.set(groupData);
            showModalMessage('獎金小組建立成功', 'success');
        }
        
        // 重新載入資料
        loadBonusGroups();
        
        // 1.5 秒後關閉模態框
        setTimeout(() => {
            const modal = bootstrap.Modal.getInstance($bonusGroupModal);
            if (modal) {
                modal.hide();
            }
        }, 1500);
        
    } catch (error) {
        console.error('儲存獎金小組錯誤:', error);
        showModalMessage(error.message, 'error');
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
        }
    }
}

/**
 * 確認刪除獎金小組
 * @param {string} groupId - 要刪除的小組 ID
 */
function confirmDeleteBonusGroup(groupId) {
    const group = bonusGroups.find(g => g.id === groupId);
    
    if (!group) {
        console.error(`找不到 ID 為 ${groupId} 的獎金小組`);
        return;
    }
    
    if (confirm(`確定要刪除「${group.name}」小組嗎？此操作無法還原。`)) {
        deleteBonusGroup(groupId);
    }
}

/**
 * 刪除獎金小組
 * @param {string} groupId - 要刪除的小組 ID
 */
async function deleteBonusGroup(groupId) {
    try {
        await db.collection('bonus_groups').doc(groupId).delete();
        
        // 從陣列中移除
        bonusGroups = bonusGroups.filter(g => g.id !== groupId);
        
        // 更新表格
        renderBonusGroupsTable();
        
        // 顯示成功訊息
        showMessage('獎金小組已成功刪除', 'success');
    } catch (error) {
        console.error('刪除獎金小組錯誤:', error);
        showMessage('刪除獎金小組時發生錯誤', 'error');
    }
}

/**
 * 顯示模態框內的訊息
 * @param {string} message - 訊息內容
 * @param {string} type - 訊息類型 (success, error, info)
 */
function showModalMessage(message, type = 'info') {
    if (!$bonusGroupModal) return;
    
    const messageElement = $bonusGroupModal.querySelector('#bonus-group-modal-message');
    
    if (!messageElement) return;
    
    messageElement.textContent = message;
    messageElement.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-info');
    
    if (type === 'success') {
        messageElement.classList.add('alert-success');
    } else if (type === 'error') {
        messageElement.classList.add('alert-danger');
    } else {
        messageElement.classList.add('alert-info');
    }
    
    messageElement.classList.remove('d-none');
}

/**
 * 隱藏模態框內的訊息
 */
function hideModalMessage() {
    if (!$bonusGroupModal) return;
    
    const messageElement = $bonusGroupModal.querySelector('#bonus-group-modal-message');
    
    if (!messageElement) return;
    
    messageElement.textContent = '';
    messageElement.classList.add('d-none');
}

/**
 * 顯示主頁面訊息
 * @param {string} message - 訊息內容
 * @param {string} type - 訊息類型 (success, error, info)
 */
function showMessage(message, type = 'info') {
    if (!$bonusGroupMessage) return;
    
    $bonusGroupMessage.textContent = message;
    $bonusGroupMessage.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-info');
    
    if (type === 'success') {
        $bonusGroupMessage.classList.add('alert-success');
    } else if (type === 'error') {
        $bonusGroupMessage.classList.add('alert-danger');
    } else {
        $bonusGroupMessage.classList.add('alert-info');
    }
    
    $bonusGroupMessage.classList.remove('d-none');
    
    // 5 秒後隱藏
    setTimeout(() => {
        $bonusGroupMessage.classList.add('d-none');
    }, 5000);
}

/**
 * 轉義 HTML 特殊字元
 * @param {string} str - 輸入字串
 * @returns {string} 轉義後的字串
 */
function escapeHTML(str) {
    if (!str) return '';
    
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 匯出函數
console.log('admin-bonus-groups.js loaded'); 