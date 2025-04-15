// js/admin-push.js - 推播通知區塊邏輯

'use strict';

/**
 * 載入推播通知區塊，包含發送表單和歷史記錄區
 * @param {HTMLElement} sectionContainer - 區塊的容器元素 (#section-push-notifications)
 * @param {firebase.firestore.Firestore} db - Firestore instance
 * @param {Object} user - Current user object
 */
async function loadPushNotificationsSection(sectionContainer, db, user) {
    console.log("Executing loadPushNotificationsSection (in admin-push.js)...");
    
    // Set global variables for use in other functions
    window.adminDb = db;
    window.currentUser = user;
    
    const contentContainer = sectionContainer.querySelector('.section-content');
    if (!contentContainer) { console.error("Content container not found in push notifications section"); return; }
    contentContainer.innerHTML = ''; // 清空

    // 1. 渲染發送表單
    renderPushNotificationForm(contentContainer);

    // 2. 創建歷史記錄容器
    const historyContainer = document.createElement('div');
    historyContainer.id = 'push-history-container';
    historyContainer.style.marginTop = '30px';
    historyContainer.innerHTML = '<h4>通知发送记录</h4><div id="push-history-list"><p>載入中...</p></div>';
    contentContainer.appendChild(historyContainer);

    // 3. 載入歷史記錄
    await loadPushHistory(historyContainer.querySelector('#push-history-list'));

    // 確保 loadedSections 存在 (來自 admin-logic.js)
    if (typeof loadedSections !== 'undefined') {
        loadedSections.add('push-notifications'); // 標記為已載入
    }
    console.log("Push notification section loaded successfully.");
}

/**
 * 渲染推播通知發送表單
 * @param {HTMLElement} container - 要放置表單的容器
 */
function renderPushNotificationForm(container) {
    // 使用 template literals 創建表單 HTML
    const formHtml = `
        <h4>發送新的推播通知</h4>
        <form id="push-form">
            <div class="form-group">
                <label for="push-title">標題: <span style="color:red;">*</span></label>
                <input type="text" id="push-title" class="form-control" required>
            </div>
            <div class="form-group">
                <label for="push-body">內容: <span style="color:red;">*</span></label>
                <textarea id="push-body" class="form-control" rows="4" required></textarea>
            </div>
            <div class="form-group">
                <label>发送渠道:</label>
                <div class="checkbox-group">
                    <label class="checkbox-inline">
                        <input type="checkbox" name="push-channel" value="line" checked> LINE
                    </label>
                    <label class="checkbox-inline" style="margin-left: 15px;">
                        <input type="checkbox" name="push-channel" value="telegram" checked> Telegram
                    </label>
                </div>
            </div>
            <div class="form-group">
                <label for="push-target-type" style="margin-right: 10px;">發送對象:</label>
                <select id="push-target-type" class="form-control" style="width: auto; display: inline-block; margin-right: 10px; padding: 5px;">
                    <option value="all" selected>所有使用者</option>
                    <option value="store">指定分店</option>
                    <option value="level">指定等級</option>
                    <option value="specific">指定員工</option>
                </select>
                <select id="push-target-store" class="form-control target-value-select" style="display: none; width: auto; display: inline-block; padding: 5px;">
                    <option value="">請選擇分店</option>
                    <!-- 分店選項將從數據庫動態載入 -->
                </select>
                <select id="push-target-level" class="form-control target-value-select" style="display: none; width: auto; display: inline-block; padding: 5px;">
                    <option value="">請選擇等級</option>
                    <option value="1">Level 1 (一般員工)</option>
                    <option value="5">Level 5 (店長)</option>
                    <option value="9">Level 9 (管理員)</option>
                </select>
                <div id="push-target-specific-container" class="target-value-select" style="display: none; margin-top: 10px;">
                    <select id="push-target-specific" class="form-control" multiple style="width: 100%; height: 100px;">
                        <!-- 員工選項將從數據庫動態載入 -->
                    </select>
                    <small class="form-text text-muted">按住 Ctrl 鍵可多選</small>
                </div>
            </div>
            <div class="form-group">
                <label for="push-link">附加連結 (可選):</label>
                <input type="url" id="push-link" class="form-control" placeholder="https://example.com/some-page">
                <small class="form-text text-muted">使用者點擊通知時會開啟此連結 (如果裝置支援)</small>
            </div>
            <button type="submit" id="submit-push-request" class="btn btn-primary">提交發送請求</button>
            <p id="push-message" class="message" style="margin-top: 15px;"></p>
        </form>
    `;
    container.innerHTML = formHtml; // 替換容器內容

    // --- 綁定事件監聽 ---
    const targetTypeSelect = container.querySelector('#push-target-type');
    const targetStoreSelect = container.querySelector('#push-target-store');
    const targetLevelSelect = container.querySelector('#push-target-level');
    const targetSpecificContainer = container.querySelector('#push-target-specific-container');
    const targetSpecificSelect = container.querySelector('#push-target-specific');
    const pushForm = container.querySelector('#push-form');

    // 從數據庫載入分店清單
    loadStoresIntoDropdown(targetStoreSelect);
    
    // 載入員工名單
    loadEmployeesIntoDropdown(targetSpecificSelect);

    // 控制目標選擇器的顯示/隱藏
    if (targetTypeSelect) {
        targetTypeSelect.addEventListener('change', () => {
            // 隱藏所有目標值選擇器
            document.querySelectorAll('.target-value-select').forEach(el => {
                el.style.display = 'none';
            });
            
            // 顯示對應的選擇器
            switch(targetTypeSelect.value) {
                case 'store':
                    targetStoreSelect.style.display = 'inline-block';
                    break;
                case 'level':
                    targetLevelSelect.style.display = 'inline-block';
                    break;
                case 'specific':
                    targetSpecificContainer.style.display = 'block';
                    break;
            }
        });
        
        // 初始狀態
        targetTypeSelect.dispatchEvent(new Event('change'));
    }

    // 綁定表單提交事件
    if (pushForm) {
        pushForm.addEventListener('submit', handleSendPushNotification);
    }
}

/**
 * 從數據庫載入分店選項到下拉選單
 * @param {HTMLSelectElement} selectElement - 分店下拉選單元素
 */
async function loadStoresIntoDropdown(selectElement) {
    if (!selectElement || !window.adminDb) {
        console.error("無法載入分店資料：選單元素或數據庫未就緒");
        return;
    }

    try {
        // 首先添加預設選項
        selectElement.innerHTML = '<option value="">請選擇分店</option>';
        
        // 嘗試從 settings/store_config 獲取分店列表
        const storeConfigDoc = await window.adminDb.collection('settings').doc('store_config').get();
        
        if (storeConfigDoc.exists && storeConfigDoc.data().storeListString) {
            const storeList = storeConfigDoc.data().storeListString.split(',').map(s => s.trim()).filter(s => s);
            
            storeList.forEach(store => {
                const option = document.createElement('option');
                option.value = store;
                option.textContent = store;
                selectElement.appendChild(option);
            });
            return;
        }
        
        // 如果 store_config 不存在，嘗試從 stores collection
        const storesSnapshot = await window.adminDb.collection('stores').get();
        
        if (storesSnapshot.empty) {
            console.warn("未找到任何分店資料");
            // 添加預設分店以防資料庫中沒有記錄
            const defaultStores = ['忠孝', '龍安'];
            defaultStores.forEach(store => {
                const option = document.createElement('option');
                option.value = store;
                option.textContent = store;
                selectElement.appendChild(option);
            });
            return;
        }
        
        // 遍歷獲取的分店資料並添加到下拉選單
        storesSnapshot.forEach(doc => {
            const storeData = doc.data();
            const storeName = storeData.name || doc.id;
            
            const option = document.createElement('option');
            option.value = storeName;
            option.textContent = storeName;
            selectElement.appendChild(option);
        });
        
    } catch (error) {
        console.error("載入分店資料時出錯:", error);
        // 添加預設分店作為備用方案
        const defaultStores = ['忠孝', '龍安'];
        defaultStores.forEach(store => {
            const option = document.createElement('option');
            option.value = store;
            option.textContent = store;
            selectElement.appendChild(option);
        });
    }
}

/**
 * 從數據庫載入員工選項到下拉選單
 * @param {HTMLSelectElement} selectElement - 員工下拉選單元素
 */
async function loadEmployeesIntoDropdown(selectElement) {
    if (!selectElement || !window.adminDb) {
        console.error("無法載入員工資料：選單元素或數據庫未就緒");
        return;
    }

    try {
        // 清空現有選項
        selectElement.innerHTML = '';
        
        // 從 Firestore 獲取員工資料
        const employeesSnapshot = await window.adminDb.collection('employees')
            .where('isActive', '==', true)
            .orderBy('name')
            .get();
        
        if (employeesSnapshot.empty) {
            console.warn("未找到任何員工資料");
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "無可選員工";
            option.disabled = true;
            selectElement.appendChild(option);
            return;
        }
        
        // 遍歷獲取的員工資料並添加到下拉選單
        employeesSnapshot.forEach(doc => {
            const employeeData = doc.data();
            if (!employeeData.name) return; // 跳過沒有名稱的員工
            
            const option = document.createElement('option');
            option.value = doc.id;
            
            // 顯示姓名和分店 (如果有)
            let displayText = employeeData.name;
            if (employeeData.store) {
                displayText += ` (${employeeData.store})`;
            }
            
            option.textContent = displayText;
            selectElement.appendChild(option);
        });
        
    } catch (error) {
        console.error("載入員工資料時出錯:", error);
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "載入失敗";
        option.disabled = true;
        selectElement.appendChild(option);
    }
}

/**
 * 處理推播通知發送請求的提交
 * @param {Event} event
 */
async function handleSendPushNotification(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('#submit-push-request');
    const messageElementInForm = form.querySelector('#push-message');

    // 確保元素存在
    if (!submitButton || !messageElementInForm || !window.adminDb || !window.currentUser) {
        console.error("Push notification prerequisites not met (DOM elements, db, or currentUser).");
        alert("提交時發生錯誤，請重試。");
        return;
    }

    messageElementInForm.textContent = '正在提交請求...';
    messageElementInForm.className = 'message info-message';
    submitButton.disabled = true;

    // 獲取表單數據
    const title = document.getElementById('push-title').value.trim();
    const body = document.getElementById('push-body').value.trim();
    const targetType = document.getElementById('push-target-type').value;
    const link = document.getElementById('push-link').value.trim();
    
    // 獲取選擇的通知渠道
    const selectedChannels = [];
    document.querySelectorAll('input[name="push-channel"]:checked').forEach(checkbox => {
        selectedChannels.push(checkbox.value);
    });

    // 獲取目標值
    let targetValue = null;
    if (targetType === 'store') {
        targetValue = document.getElementById('push-target-store').value;
    } else if (targetType === 'level') {
        targetValue = document.getElementById('push-target-level').value;
    } else if (targetType === 'specific') {
        const selected = [];
        const options = document.getElementById('push-target-specific').options;
        for (let i = 0; i < options.length; i++) {
            if (options[i].selected) {
                selected.push(options[i].value);
            }
        }
        targetValue = selected;
    }

    // 基本驗證
    let errorMessage = '';
    if (!title) errorMessage += '標題為必填欄位。\n';
    if (!body) errorMessage += '內容為必填欄位。\n';
    if (selectedChannels.length === 0) errorMessage += '請至少選擇一個通知渠道。\n';
    if (targetType === 'store' && !targetValue) errorMessage += '請選擇指定分店。\n';
    if (targetType === 'level' && !targetValue) errorMessage += '請選擇指定等級。\n';
    if (targetType === 'specific' && (!targetValue || targetValue.length === 0)) errorMessage += '請選擇至少一位員工。\n';

    if (errorMessage) {
        messageElementInForm.textContent = `提交失敗：\n${errorMessage}`;
        messageElementInForm.className = 'message error-message';
        messageElementInForm.style.whiteSpace = 'pre-line'; // 讓換行生效
        submitButton.disabled = false;
        return;
    }
    messageElementInForm.style.whiteSpace = 'normal'; // 恢復正常

    // 構造寫入 Firestore 的請求數據
    const requestData = {
        title: title,
        body: body,
        link: link || null, // 如果為空則存 null
        target: targetType,
        targetValue: targetValue,
        channels: selectedChannels,
        status: 'pending', // Cloud Function 會監聽此狀態
        requesterId: window.currentUser.uid,
        requesterName: window.currentUser.displayName || window.currentUser.email || window.currentUser.uid,
        requestTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
        lineSuccessCount: 0,
        lineFailureCount: 0,
        telegramSuccessCount: 0,
        telegramFailureCount: 0
    };

    console.log("Submitting notification request:", requestData);

    try {
        // 寫入 Firestore 的 'notification_requests' collection
        const docRef = await window.adminDb.collection('notification_requests').add(requestData);

        console.log("Notification request submitted successfully. Request ID:", docRef.id);
        messageElementInForm.textContent = '發送請求已成功提交！後端將處理實際發送。';
        messageElementInForm.className = 'message success-message';
        form.reset(); // 清空表單
        
        // 重置目標選擇器
        document.getElementById('push-target-type').dispatchEvent(new Event('change'));
        
        // 重新勾選通知渠道
        document.querySelectorAll('input[name="push-channel"]').forEach(checkbox => {
            checkbox.checked = true;
        });

        // 4 秒後清除成功訊息
        setTimeout(() => {
            if (messageElementInForm.textContent === '發送請求已成功提交！後端將處理實際發送。') {
                messageElementInForm.textContent = '';
                messageElementInForm.className = 'message';
            }
        }, 4000);

        // 重新載入歷史記錄
        const historyListDiv = document.getElementById('push-history-list');
        if (historyListDiv) {
            loadPushHistory(historyListDiv);
        }
    } catch (error) {
        console.error("Error submitting notification request:", error);
        messageElementInForm.textContent = `提交請求失敗：${error.message}`;
        messageElementInForm.className = 'message error-message';
    } finally {
        submitButton.disabled = false; // 無論成敗，啟用按鈕
    }
}

/**
 * 載入並顯示通知發送記錄
 * @param {HTMLElement} container - 要放置歷史記錄列表的容器
 */
async function loadPushHistory(container) {
    if (!container) { console.warn("Push history container not found."); return; }
    container.innerHTML = '<p>載入歷史紀錄中...</p>';
    
    try {
        // 確保 adminDb 可用
        if (!window.adminDb) throw new Error("Firestore (adminDb) is not available.");

        // 從 notification_requests collection 查詢記錄
        const querySnapshot = await window.adminDb.collection('notification_requests')
            .orderBy('requestTimestamp', 'desc')
            .limit(20)
            .get();

        if (querySnapshot.empty) {
            container.innerHTML = '<p>尚無通知發送紀錄。</p>';
            return;
        }

        // 创建表格显示历史记录
        const table = document.createElement('table');
        table.className = 'table table-striped table-hover';
        table.style.fontSize = '0.9em';
        
        // 创建表头
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>時間</th>
                <th>標題</th>
                <th>目標</th>
                <th>渠道</th>
                <th>狀態</th>
                <th>結果</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // 创建表体
        const tbody = document.createElement('tbody');
        
        // 添加数据行
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const row = document.createElement('tr');
            
            // 格式化时间
            let timestampStr = '未知時間';
            if (data.requestTimestamp) {
                if (typeof formatTimestamp === 'function') {
                    timestampStr = formatTimestamp(data.requestTimestamp);
                } else if (data.requestTimestamp.toDate) {
                    const date = data.requestTimestamp.toDate();
                    timestampStr = date.toLocaleString('zh-TW');
                }
            }
            
            // 格式化目标信息
            let targetStr = '未知';
            if (data.target) {
                switch(data.target) {
                    case 'all':
                        targetStr = '所有使用者';
                        break;
                    case 'store':
                        targetStr = `分店: ${data.targetValue || '未知'}`;
                        break;
                    case 'level':
                        targetStr = `等級: ${data.targetValue || '未知'}`;
                        break;
                    case 'specific':
                        const count = Array.isArray(data.targetValue) ? data.targetValue.length : 0;
                        targetStr = `指定員工: ${count}人`;
                        break;
                    default:
                        targetStr = data.target;
                }
            }
            
            // 格式化渠道信息
            let channelsStr = '未指定';
            if (data.channels && Array.isArray(data.channels)) {
                channelsStr = data.channels.join(', ');
            }
            
            // 格式化状态信息
            let statusStr = data.status || '未知';
            let statusClass = '';
            
            switch(statusStr) {
                case 'pending':
                    statusStr = '等待發送';
                    statusClass = 'text-warning';
                    break;
                case 'processing':
                    statusStr = '發送中';
                    statusClass = 'text-primary';
                    break;
                case 'sent':
                    statusStr = '已發送';
                    statusClass = 'text-success';
                    break;
                case 'partial_failure':
                    statusStr = '部分失敗';
                    statusClass = 'text-warning';
                    break;
                case 'failed':
                    statusStr = '發送失敗';
                    statusClass = 'text-danger';
                    break;
            }
            
            // 格式化结果信息
            let resultStr = '';
            const lineSuccess = data.lineSuccessCount || 0;
            const lineFailure = data.lineFailureCount || 0;
            const telegramSuccess = data.telegramSuccessCount || 0;
            const telegramFailure = data.telegramFailureCount || 0;
            
            if (data.channels && data.channels.includes('line')) {
                resultStr += `LINE: ${lineSuccess}成功/${lineFailure}失敗<br>`;
            }
            
            if (data.channels && data.channels.includes('telegram')) {
                resultStr += `Telegram: ${telegramSuccess}成功/${telegramFailure}失敗`;
            }
            
            if (!resultStr) {
                resultStr = '無數據';
            }
            
            // 错误信息提示
            if (data.error) {
                resultStr += `<span class="text-danger" title="${data.error}">⚠️</span>`;
            }
            
            // 填充单元格
            row.innerHTML = `
                <td>${timestampStr}</td>
                <td title="${data.body || ''}">${data.title || '無標題'}</td>
                <td>${targetStr}</td>
                <td>${channelsStr}</td>
                <td class="${statusClass}">${statusStr}</td>
                <td>${resultStr}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        
        // 清空容器并添加表格
        container.innerHTML = '';
        container.appendChild(table);
        
        // 添加分页控件（如果需要）
        if (querySnapshot.size === 20) {
            const paginationDiv = document.createElement('div');
            paginationDiv.className = 'text-center';
            paginationDiv.innerHTML = `
                <button id="load-more-history" class="btn btn-sm btn-outline-secondary mt-2">載入更多記錄</button>
            `;
            container.appendChild(paginationDiv);
            
            // 绑定加载更多事件
            const loadMoreBtn = paginationDiv.querySelector('#load-more-history');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', () => {
                    // 在这里实现加载更多的逻辑
                    alert('加載更多記錄功能待實現');
                });
            }
        }
    } catch (error) {
        console.error("Error loading notification history:", error);
        container.innerHTML = `<p class="text-danger">載入歷史紀錄失敗: ${error.message}</p>`;
    }
}

console.log("admin-push.js loaded");

// 確保這些函數可以在全局範圍內被訪問
window.loadPushNotificationsSection = loadPushNotificationsSection;
window.loadPushHistory = loadPushHistory;