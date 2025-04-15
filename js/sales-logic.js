// js/sales-logic.js - 營業額登錄頁面邏輯

'use strict';

// --- 模組內變數 ---
let pageCurrentUser = null; // 用於儲存傳入的 user
let pageDb = null;          // 用於儲存傳入的 db
let salesFieldDefinitions = []; // 從 Firestore settings/sales_config/fields 讀取的定義

// --- DOM 元素引用 (保持局部) ---
let salesForm, recordDateInput, storeInput, employeeNameSpan, orderNumberInput,
    incomeSection, expenseSection, otherExpenseInput, submitButton, messageElement;

/**
 * 初始化營業額登錄頁面
 * @param {object} user - 從 requireLogin 獲取的登入使用者物件
 * @param {firebase.firestore.Firestore} dbInstance - Firestore 實例
 */
async function initSalesPage(user, dbInstance) {
    // --- 將傳入的參數賦值給模組變數 ---
    pageCurrentUser = user;
    pageDb = dbInstance;

    console.log("Initializing Sales Entry Page for:", pageCurrentUser?.name);

    // 獲取 DOM 元素
    salesForm = document.getElementById('sales-form');
    recordDateInput = document.getElementById('sales-record-date');
    storeInput = document.getElementById('sales-store');
    employeeNameSpan = document.getElementById('sales-employee-name');
    orderNumberInput = document.getElementById('sales-order-number');
    incomeSection = document.getElementById('income-section');
    expenseSection = document.getElementById('expense-section');
    otherExpenseInput = document.getElementById('other-expense-input'); // 確保這個 ID 在 HTML 中存在
    submitButton = document.getElementById('submit-sales');
    messageElement = document.getElementById('sales-message');

    if (!salesForm || !recordDateInput || !storeInput || !employeeNameSpan || !incomeSection || !expenseSection || !otherExpenseInput || !submitButton || !messageElement) {
        console.error("Missing required elements for sales form");
        if (messageElement) messageElement.textContent = "系統初始化失敗：缺少必要元件。";
        return;
    }

    // 設置員工姓名
    if (employeeNameSpan) {
        employeeNameSpan.textContent = pageCurrentUser?.name || '未知';
    }

    // 設置當日日期 (默認為昨天)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    recordDateInput.value = formatDateForInput(yesterday);

    // 顯示昨天具體日期
    const yesterdayDisplay = document.getElementById('yesterday-display');
    if (yesterdayDisplay) {
        yesterdayDisplay.textContent = `(昨天: ${yesterday.toLocaleDateString('zh-TW')})`;
    }

    // 載入分店列表並填充下拉選單
    try {
        // 從資料庫載入分店資訊
        const storeList = await loadStoreList(pageDb);
        
        // 創建和填充分店下拉選單
        storeInput.innerHTML = ''; // 清空現有內容
        
        // 添加一個預設選項
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- 請選擇分店 --';
        storeInput.appendChild(defaultOption);
        
        // 添加從設定中讀取的分店選項
        storeList.forEach(store => {
            const option = document.createElement('option');
            option.value = store;
            option.textContent = store;
            storeInput.appendChild(option);
        });
        
        // 根據用戶權限預選分店
        if (pageCurrentUser.roles?.level < 9 && pageCurrentUser.roles?.store) {
            storeInput.value = pageCurrentUser.roles.store;
            storeInput.disabled = true;
        }
    } catch (error) {
        console.error("Error loading store list:", error);
        messageElement.textContent = "載入分店資訊時發生錯誤: " + error.message;
        messageElement.className = 'message error-message';
    }

    // 加載營業額欄位定義
    await fetchSalesFieldDefinitions()
        .then(() => {
            // 填充收入欄位
            renderIncomeFields();
            // 填充支出欄位
            renderExpenseFields();
        })
        .catch(error => {
            console.error("Failed to load field definitions:", error);
            messageElement.textContent = error.message;
            messageElement.className = 'message error-message';
        });

    // 綁定表單提交事件
    if (salesForm) {
        salesForm.addEventListener('submit', handleSubmitSales);
    }

    console.log("Sales entry page initialized successfully.");
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
    const names = new Set(); // 使用 Set 來自動處理唯一性
    if (!storeListString || typeof storeListString !== 'string') {
        return []; // 如果輸入無效，返回空陣列
    }
    // 用分號分隔不同的分店
    const entries = storeListString.split(';');
    entries.forEach(entry => {
        entry = entry.trim();
        if (!entry) return;
        // 找到第一個等號以分隔名稱部分和坐標/需求
        const eqIndex = entry.indexOf('=');
        let namePart = entry; // 如果沒有 '='，則默認為整個條目
        if (eqIndex > 0) {
            namePart = entry.substring(0, eqIndex).trim();
        }
        if (namePart) {
            // 使用正則表達式從名稱部分中刪除潛在的數字後綴
            // 匹配字符串末尾的一個或多個數字
            const storeName = namePart.replace(/\d+$/, '').trim();
            if (storeName) { // 如果刪除後綴後名稱不為空，則添加到集合中
                 names.add(storeName);
            }
        }
    });
    // 將 Set 轉換回陣列
    return Array.from(names);
}

/**
 * 格式化日期為輸入欄位使用的格式 (YYYY-MM-DD)
 * @param {Date} date - 日期對象
 * @returns {string} 格式化的日期字串
 */
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 從 Firestore 獲取營業額欄位定義 (使用 pageDb)
 */
async function fetchSalesFieldDefinitions() {
    if (!pageDb) throw new Error("Firestore (pageDb) is not available.");
    console.log("Fetching sales field definitions...");
    salesFieldDefinitions = []; // 清空
    try {
        // 從 settings/sales_config/fields collection 讀取
        // 注意：這裡的 Firestore 路徑需要與您在 admin-parameters.js 中保存/讀取欄位定義的路徑一致
        const querySnapshot = await pageDb.collection('settings').doc('sales_config').collection('fields')
                                  // .where('啟用', '==', true) // 根據需要決定是否只獲取啟用的欄位
                                  .orderBy('fieldType') // 按類型排序 (收入/支出)
                                  .orderBy('label')     // 再按標籤排序
                                  .get();
        querySnapshot.forEach(doc => {
            // 確保讀取的欄位名稱與 createDynamicField 和 handleSubmitSales 中使用的匹配
            const data = doc.data();
            salesFieldDefinitions.push({
                 id: doc.id,
                 label: data.label,         // 欄位標籤
                 fieldType: data.fieldType, // 收入/支出/其他
                 required: data.required,   // 是否必填
                 note: data.note,           // 備註
                 // name: data.name || doc.id // 欄位名稱 (用於 input name)，如果 Firestore 有存就用，否則用 ID
                 name: doc.id // 直接使用 Firestore 文件 ID 作為 input name 可能更簡單唯一
            });
        });
        console.log("Sales field definitions fetched:", salesFieldDefinitions);
    } catch (error) {
        console.error("Error fetching sales field definitions:", error);
        throw new Error("讀取營業額欄位設定時發生錯誤。");
    }
}

/**
 * 渲染收入項目欄位
 */
function renderIncomeFields() {
    if (!incomeSection) return;
    
    // 清空現有內容
    incomeSection.innerHTML = '<legend>收入項目</legend>';
    
    // 過濾出收入類型的欄位
    const incomeFields = salesFieldDefinitions.filter(field => field.fieldType === '收入');
    
    if (incomeFields.length === 0) {
        incomeSection.innerHTML += '<p>沒有配置收入項目</p>';
        return;
    }
    
    // 為每個收入欄位創建輸入框
    incomeFields.forEach(field => {
        createDynamicField(incomeSection, field);
    });
}

/**
 * 渲染支出項目欄位
 */
function renderExpenseFields() {
    if (!expenseSection) return;
    
    // 清空現有內容，但保留其他支出文本區域
    const otherExpenseGroup = expenseSection.querySelector('.dynamic-field-group:last-child');
    expenseSection.innerHTML = '<legend>支出項目</legend>';
    
    // 過濾出支出類型的欄位
    const expenseFields = salesFieldDefinitions.filter(field => field.fieldType === '支出');
    
    if (expenseFields.length === 0) {
        expenseSection.innerHTML += '<p>沒有配置支出項目</p>';
    } else {
        // 為每個支出欄位創建輸入框
        expenseFields.forEach(field => {
            createDynamicField(expenseSection, field);
        });
    }
    
    // 將其他支出文本區域添加回去
    if (otherExpenseGroup) {
        expenseSection.appendChild(otherExpenseGroup);
    } else {
        // 如果沒有找到現有的其他支出文本區域，則創建一個新的
        const newOtherExpenseGroup = document.createElement('div');
        newOtherExpenseGroup.className = 'form-group dynamic-field-group';
        newOtherExpenseGroup.style = 'margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 15px;';
        newOtherExpenseGroup.innerHTML = `
            <label for="other-expense-input">其他支出 (非必填):</label>
            <textarea id="other-expense-input" name="other_expense" class="form-control" rows="3" placeholder="若有多筆請用逗號分隔，格式：項目名稱(金額)&#10;例如：買菜(500),電話費(299)"></textarea>
            <small class="form-text text-muted">格式：項目名稱(金額)。多筆請用逗號 \`,\` 分隔。</small>
        `;
        expenseSection.appendChild(newOtherExpenseGroup);
    }
}

/**
 * 創建動態欄位
 * @param {HTMLElement} container - 欄位容器
 * @param {object} fieldDef - 欄位定義
 */
function createDynamicField(container, fieldDef) {
    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'form-group dynamic-field-group';
    
    // 建立標籤
    const label = document.createElement('label');
    label.htmlFor = `field-${fieldDef.id}`;
    label.textContent = fieldDef.label || fieldDef.name || fieldDef.id;
    
    // 如果是必填欄位，添加紅色星號
    if (fieldDef.required) {
        const requiredMark = document.createElement('span');
        requiredMark.className = 'required-mark';
        requiredMark.textContent = ' *';
        label.appendChild(requiredMark);
    }
    
    // 建立輸入框
    const input = document.createElement('input');
    input.type = 'number';
    input.id = `field-${fieldDef.id}`;
    input.name = fieldDef.id;
    input.className = 'form-control';
    input.placeholder = `輸入${fieldDef.label || ''}金額`;
    input.dataset.fieldType = fieldDef.fieldType; // 儲存欄位類型，便於提交時分類
    input.dataset.fieldLabel = fieldDef.label || fieldDef.name || fieldDef.id; // 儲存欄位標籤，便於錯誤提示
    
    if (fieldDef.required) {
        input.required = true;
        input.dataset.required = "true"; // 明確標記為必填，便於驗證
    }
    
    // 如果有備註，添加小提示
    if (fieldDef.note) {
        const helpText = document.createElement('small');
        helpText.className = 'form-text text-muted';
        helpText.textContent = fieldDef.note;
        fieldGroup.appendChild(label);
        fieldGroup.appendChild(input);
        fieldGroup.appendChild(helpText);
    } else {
        fieldGroup.appendChild(label);
        fieldGroup.appendChild(input);
    }
    
    container.appendChild(fieldGroup);
}

/**
 * 處理營業額表單提交
 * @param {Event} event
 */
async function handleSubmitSales(event) {
    event.preventDefault(); // 防止表單傳統提交

    if (!pageDb || !pageCurrentUser || !salesForm || !submitButton || !messageElement || !recordDateInput || !storeInput) {
        console.error("handleSubmitSales prerequisites missing.");
        if(messageElement) messageElement.textContent = "提交錯誤：缺少必要元件或資訊。";
        return;
    }

    if(submitButton) submitButton.disabled = true;
    if(messageElement) messageElement.textContent = '資料提交中...';
    if(messageElement) messageElement.className = 'message info-message';

    try {
        // 收集固定欄位
        const recordDate = recordDateInput.value;
        const store = storeInput.value;
        const orderNumber = orderNumberInput?.value || ''; // 可選欄位

        if (!recordDate || !store) {
             throw new Error('日期和分店為必填欄位。');
        }

        const salesData = {
            recordDate: recordDate,
            store: store,
            orderNumber: orderNumber,
            submittedByAuthUid: pageCurrentUser.authUid,
            submittedByName: pageCurrentUser.name || '未知',
            submittedTimestamp: new Date(), // 使用客戶端時間
            lastUpdatedTimestamp: new Date(),
            incomeItems: {},
            expenseItems: {},
            otherItems: {},
            otherExpenseText: otherExpenseInput?.value.trim() || '' // 其他支出文本
        };

        let totalIncome = 0;
        let totalExpense = 0;

        // 收集動態欄位的值
        const dynamicInputs = salesForm.querySelectorAll('.dynamic-field-group input, .dynamic-field-group textarea');
        dynamicInputs.forEach(input => {
            const fieldId = input.name; // 我們用 Firestore ID 作為 name
            const fieldLabel = input.dataset.fieldLabel;
            const fieldType = input.dataset.fieldType;
            let value = input.value;

            // 特殊處理 "其他支出" textarea
            if (fieldId === 'other_expense') {
                 salesData.otherExpenseText = value.trim();
                 return; // 繼續下一個 input
            }

            // 驗證必填數字欄位 (檢查是否為空或非數字，且預設值不是 0)
             const isRequiredNumber = input.dataset.required === "true" && input.type === 'number';
             if (isRequiredNumber && (value === '' || isNaN(parseFloat(value)))) {
                  throw new Error(`必填數字欄位 '${fieldLabel}' 不能為空或非數字。`);
             }
             // 驗證必填文字欄位
             if (input.required && input.type === 'text' && !value.trim()) {
                  throw new Error(`必填欄位 '${fieldLabel}' 不能為空。`);
             }

            // 類型轉換和分類存儲
            if (input.type === 'number') {
                value = parseFloat(value) || 0;
                if (fieldType === '收入') {
                    salesData.incomeItems[fieldId] = { label: fieldLabel, value: value };
                    totalIncome += value;
                } else if (fieldType === '支出') {
                    salesData.expenseItems[fieldId] = { label: fieldLabel, value: value };
                    totalExpense += value;
                } else { // 其他數字類型
                     salesData.otherItems[fieldId] = { label: fieldLabel, value: value, type: fieldType };
                }
            } else { // 文字或其他類型
                 salesData.otherItems[fieldId] = { label: fieldLabel, value: value.trim(), type: fieldType };
            }
        });

        // 計算總收入、總支出、淨利潤
        salesData.totalIncome = totalIncome;
        salesData.totalExpense = totalExpense;
        salesData.netProfit = totalIncome - totalExpense;

        // 解析"其他支出"文本並加到總支出
        // 格式: 項目1(金額1),項目2(金額2)...
         if (salesData.otherExpenseText) {
             const expensePairs = salesData.otherExpenseText.split(/[\s,，]+/); // 用空白或中/英文逗號分隔
             let otherExpenseSum = 0;
             expensePairs.forEach(pair => {
                 const match = pair.match(/(.+)[\(（](\d+(\.\d+)?)[\)）]/);
                 if (match && match[2]) {
                     const amount = parseFloat(match[2]);
                     if (!isNaN(amount)) {
                         otherExpenseSum += amount;
                         // 可以選擇性地將解析出的項目存儲到一個數組中
                         // salesData.parsedOtherExpenses = salesData.parsedOtherExpenses || [];
                         // salesData.parsedOtherExpenses.push({ name: match[1], amount: amount });
                     }
                 }
             });
             if (otherExpenseSum > 0) {
                 salesData.totalExpense += otherExpenseSum;
                 salesData.netProfit -= otherExpenseSum;
             }
         }


        // 檢查是否重複提交 (根據日期和分店)
        const reportId = `${recordDate}_${store}`;
        const reportRef = pageDb.collection('sales_reports').doc(reportId);
        const reportSnap = await reportRef.get();

        if (reportSnap.exists) {
             // 這裡可以選擇更新或提示錯誤
             // 選擇更新：
             await reportRef.update(salesData);
             if(messageElement) messageElement.textContent = `日期 ${recordDate} 分店 ${store} 的資料已更新。`;
             if(messageElement) messageElement.className = 'message success-message';
            // 選擇提示錯誤：
            // throw new Error(`日期 ${recordDate} 分店 ${store} 的營業額已提交過，如需修改請聯繫管理員。`);
        } else {
            // 新增記錄
             await reportRef.set(salesData);
             if(messageElement) messageElement.textContent = '營業額資料提交成功！';
             if(messageElement) messageElement.className = 'message success-message';
             // 提交成功後可以考慮清空表單或禁用按鈕一段時間
             salesForm.reset();
             setDefaultDate(); // 重設日期
             renderDynamicSections(); // 重新渲染以重設數字欄位為 0
             if (storeInput && pageCurrentUser.roles?.store) {
                 storeInput.value = pageCurrentUser.roles.store; // 恢復預設分店
             }
        }

    } catch (error) {
        console.error("Error submitting sales data:", error);
        if(messageElement) messageElement.textContent = `提交失敗: ${error.message}`;
        if(messageElement) messageElement.className = 'message error-message';
    } finally {
        if(submitButton) submitButton.disabled = false;
        // 幾秒後清除成功訊息
         if (messageElement && messageElement.classList.contains('success-message')) {
             setTimeout(() => {
                  if (messageElement.classList.contains('success-message')) {
                      messageElement.textContent = '';
                      messageElement.className = 'message';
                  }
             }, 5000);
         }
    }
}

/**
 * 設定日期輸入框預設值為昨天
 */
function setDefaultDate() {
    if (!recordDateInput) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    recordDateInput.value = `${year}-${month}-${day}`;

    // --- 新增：顯示昨天文字 ---
    const displaySpan = document.getElementById('yesterday-display');
    if (displaySpan) {
         const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
         displaySpan.textContent = `(${month}/${day} 昨天 星期${weekdays[yesterday.getDay()]})`;
    }
    // --- 新增結束 ---
}

// --- Rendering Functions ---

/**
 * Render all dynamic sections of the sales form
 * This function is called to initially render the form and after form submission
 */
function renderDynamicSections() {
    console.log("Rendering dynamic sections for sales form");
    
    // Use the correct section IDs that match the HTML structure
    if (incomeSection) {
        console.log("Rendering income fields");
        renderIncomeFields();
    } else {
        console.warn("Income section not found, cannot render income fields");
    }
    
    if (expenseSection) {
        console.log("Rendering expense fields");
        renderExpenseFields();
    } else {
        console.warn("Expense section not found, cannot render expense fields");
    }
}

console.log("sales-logic.js loaded");