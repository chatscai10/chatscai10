// js/admin-schedule-config.js - 排班參數設定區塊邏輯 (加入演算法控制項)

'use strict';

/**
 * 載入排班參數設定表單
 * @param {HTMLElement} container - 內容容器 (#section-schedule-config .section-content)
 */
async function loadScheduleConfigSection(container) {
    console.log("Executing loadScheduleConfigSection (in admin-schedule-config.js)...");
    container.innerHTML = '載入排班參數設定中...';
    const configDocId = "schedule_config";

    try {
        if (typeof db === 'undefined') throw new Error("Firestore (db) is not available.");
        const docRef = db.collection('settings').doc(configDocId);
        const docSnap = await docRef.get();
        let configData = {};
        if (docSnap.exists) { configData = docSnap.data(); }
        else { console.warn(`Schedule config document "${configDocId}" not found.`); }
        renderScheduleConfigForm(container, configData); // 渲染表單
        if (typeof loadedSections !== 'undefined') { loadedSections.add('schedule-config'); }
        console.log("Schedule config section loaded successfully.");
    } catch (error) {
        console.error("Error loading schedule config:", error);
        container.innerHTML = `<p style="color: red;">載入排班參數失敗: ${error.message}</p>`;
    }
}

/**
 * 渲染排班參數設定表單 (加入演算法控制項)
 * @param {HTMLElement} container - 要放置表單的容器
 * @param {object} data - 從 Firestore 讀取的設定資料 (可能為 {})
 */
function renderScheduleConfigForm(container, data) {
    container.innerHTML = ''; // 清空 "載入中..."
    const form = document.createElement('form');
    form.id = 'schedule-config-form';

    // Helper function to create form group (保持不變)
    const createFormGroup = (id, labelText, inputType = 'text', value = '', placeholder = '', helpText = '', required = false, options = null, attributes = {}) => {
        const group = document.createElement('div'); group.className='form-group';
        const label = document.createElement('label'); label.htmlFor=id; label.textContent=labelText; if(required) label.innerHTML += ' <span style="color:red;">*</span>';
        let input; value = value ?? ''; // Handle null/undefined
        if(inputType === 'checkbox'){ input = document.createElement('input'); input.type = 'checkbox'; input.checked = value === true; label.prepend(input); label.style.display='flex'; label.style.alignItems='center'; input.style.marginRight='8px'; input.style.width='auto'; input.classList.add('form-check-input'); } // Add specific class for checkbox styling if needed
        else if (inputType === 'select' && options) { input=document.createElement('select'); options.forEach(o=>{const opt=document.createElement('option'); opt.value=o.value; opt.textContent=o.label; if(String(o.value)===String(value)) opt.selected=true; input.appendChild(opt);}); input.classList.add('form-control'); group.appendChild(input); }
        else if (inputType === 'textarea') { input=document.createElement('textarea'); input.rows=3; input.value=value; input.classList.add('form-control'); group.appendChild(input); }
        else { input=document.createElement('input'); input.type=inputType; input.value=value; input.classList.add('form-control'); group.appendChild(input); }
        input.id=id; input.name=id; input.placeholder=placeholder;
        if(required && inputType !== 'checkbox') input.required=true;
        if(attributes) { for(const key in attributes) { input.setAttribute(key, attributes[key]); } } // Use setAttribute for things like min
        if(inputType !== 'checkbox') { group.appendChild(label); group.appendChild(input); } // Standard order for non-checkbox
        else { group.appendChild(label); } // Label contains checkbox for flex alignment

        if(helpText){const sm=document.createElement('small'); sm.className='form-text text-muted'; sm.textContent=helpText; group.appendChild(sm);}
        return group;
    };

    // --- 添加原有設定欄位 ---
    form.appendChild(createFormGroup('config-schedule-month', '排班月份:', 'month', data.排班月份, 'YYYY-MM', '', true));
    form.appendChild(createFormGroup('config-monthly-leave-limit', '每人休假上限天數:', 'number', data.每人休假上限天數, '例如: 8', '', true, null, {min: 0}));
    form.appendChild(createFormGroup('config-weekend-leave-limit', '每人五六日休假上限天數:', 'number', data.每人五六日休假上限天數, '例如: 2', '', true, null, {min: 0}));
    form.appendChild(createFormGroup('config-daily-total-limit', '每日總休假人數上限:', 'number', data.每日休假上限人數, '例如: 5', '', true, null, {min: 0}));
    form.appendChild(createFormGroup('config-daily-store-limit', '同店每日休假人數上限:', 'number', data.同店每日休假上限, '例如: 2', '', true, null, {min: 0}));
    form.appendChild(createFormGroup('config-store-demand', '各分店需求人數:', 'text', data.各分店需求人數, '格式: 分店名1=人數,...', '例如: 忠孝=3,龍安=2'));
    form.appendChild(createFormGroup('config-forbidden-dates', '本月禁休日期 (逗號分隔):', 'textarea', data.本月禁休日期, '格式:<y_bin_46>YYYY-MM-DD,...'));
    form.appendChild(createFormGroup('config-holiday-dates', '本月公休日期 (逗號分隔):', 'textarea', data.本月公休日期, '格式:<y_bin_46>YYYY-MM-DD,...'));

    // --- >>> 新增：演算法控制項 <<< ---
    const algoFieldset = document.createElement('fieldset');
    algoFieldset.style.marginTop = '20px';
    algoFieldset.style.padding = '15px';
    algoFieldset.style.border = '1px solid #ccc';
    algoFieldset.style.borderRadius = '5px';
    const algoLegend = document.createElement('legend');
    algoLegend.textContent = '進階排班規則 (可選)';
    algoLegend.style.fontSize = '1.1em';
    algoLegend.style.fontWeight = 'bold';
    algoLegend.style.width = 'auto'; // Prevents legend from taking full width
    algoLegend.style.marginBottom = '10px';
    algoFieldset.appendChild(algoLegend);

    algoFieldset.appendChild(createFormGroup(
        'config-balance-workload',      // ID and Name
        '啟用工時平衡',                  // Label
        'checkbox',                     // Type
        data.balanceWorkload ?? false,  // Value (預設 false)
        '',                             // Placeholder
        '啟用後，演算法會優先排給本月上班天數較少的員工。' // Help Text
    ));
    algoFieldset.appendChild(createFormGroup(
        'config-enable-consecutive-rule', // ID and Name
        '啟用連上/休假規則',               // Label
        'checkbox',                     // Type
        data.enableConsecutiveRule ?? false, // Value (預設 false)
        '',                             // Placeholder
        '啟用後，下方設定的連上天數和強制休假才會生效。' // Help Text
    ));
    algoFieldset.appendChild(createFormGroup(
        'config-consecutive-work-limit', // ID and Name
        '最多連續上班天數 (X):',          // Label
        'number',                       // Type
        data.consecutiveWorkLimit ?? 0, // Value (預設 0)
        '例如: 6',                     // Placeholder
        '達到此天數後，將強制休假 Y 天。設為 0 則此規則不作用。', // Help Text
        false,                          // Required: false
        null,                           // Options: null
        {min: 0}                        // Attributes: min=0
     ));
     algoFieldset.appendChild(createFormGroup(
        'config-mandatory-rest-days',  // ID and Name
        '強制連續休假天數 (Y):',         // Label
        'number',                       // Type
        data.mandatoryRestDays ?? 0,    // Value (預設 0)
        '例如: 1',                     // Placeholder
        '連上 X 天後，需要連休 Y 天才能再排班。設為 0 則此規則不作用。', // Help Text
        false,                          // Required: false
        null,                           // Options: null
        {min: 0}                        // Attributes: min=0
     ));
    form.appendChild(algoFieldset); // 將整個 Fieldset 加入表單
    // --- >>> 新增結束 <<< ---


    const statusOptions = [{value:'關閉',label:'關閉'},{value:'開放',label:'開放'},{value:'處理中',label:'處理中'},{value:'已完成',label:'已完成'},];
    form.appendChild(createFormGroup('config-schedule-status', '當前排班狀態:', 'select', data.當前排班狀態, '', '', true, statusOptions));
    form.appendChild(createFormGroup('config-scheduling-user', '排班執行者:', 'text', data.排班使用者, '', '', false, null, { readonly: true }));
    form.appendChild(createFormGroup('config-schedule-window', '系統開關時間:', 'text', data.系統開關時間, 'YYYY-MM-DD HH:MM ~<y_bin_46>YYYY-MM-DD HH:MM'));
    form.appendChild(createFormGroup('config-admin-password', '管理員操作密碼(可選):', 'password', '', '留空不修改'));
    form.appendChild(createFormGroup('config-test-mode', '測試開關:', 'select', data.測試開關, '', '', false, [{value: '開啟', label: '開啟'}, {value: '關閉', label: '關閉'}]));
    form.appendChild(createFormGroup('config-notification-settings', '通知設定(可選):', 'textarea', data.通知設定));

    // --- 儲存按鈕和訊息區域 ---
    const saveButton = document.createElement('button'); saveButton.type='submit'; saveButton.className='btn btn-success'; saveButton.textContent='儲存設定'; form.appendChild(saveButton);
    const formMessage = document.createElement('p'); formMessage.id='schedule-config-message'; formMessage.className='message'; formMessage.style.marginTop='15px'; form.appendChild(formMessage);
    form.addEventListener('submit', handleSaveScheduleConfig); // 綁定儲存函數
    container.appendChild(form);
}

/**
 * 處理排班參數設定表單提交 (加入新欄位)
 * @param {Event} event
 */
async function handleSaveScheduleConfig(event) {
    event.preventDefault();
    const form = event.target;
    const saveButton = form.querySelector('button[type="submit"]');
    const messageElementInForm = form.querySelector('#schedule-config-message');
    if (!saveButton || !messageElementInForm || typeof db === 'undefined' || typeof currentUser === 'undefined') { console.error("Save prerequisites failed."); return; }

    messageElementInForm.textContent = '儲存中...'; messageElementInForm.className='message info-message'; saveButton.disabled = true;

    try {
        const updatedData = {};
        const formData = new FormData(form);

        // --- 直接從 form elements 獲取值，更清晰 ---
        updatedData.排班月份 = form.elements['config-schedule-month'].value.trim();
        updatedData.每人休假上限天數 = parseInt(form.elements['config-monthly-leave-limit'].value, 10) || 0;
        updatedData.每人五六日休假上限天數 = parseInt(form.elements['config-weekend-leave-limit'].value, 10) || 0;
        updatedData.每日休假上限人數 = parseInt(form.elements['config-daily-total-limit'].value, 10) || 0;
        updatedData.同店每日休假上限 = parseInt(form.elements['config-daily-store-limit'].value, 10) || 0;
        updatedData.各分店需求人數 = form.elements['config-store-demand'].value.trim();
        updatedData.本月禁休日期 = form.elements['config-forbidden-dates'].value.split(',').map(d=>d.trim()).filter(d=>d).join(',');
        updatedData.本月公休日期 = form.elements['config-holiday-dates'].value.split(',').map(d=>d.trim()).filter(d=>d).join(',');
        updatedData.當前排班狀態 = form.elements['config-schedule-status'].value;
        updatedData.系統開關時間 = form.elements['config-schedule-window'].value.trim();
        const adminPassword = form.elements['config-admin-password'].value; // 不 trim 密碼
        if (adminPassword) updatedData.管理員密碼 = adminPassword; // 有輸入才更新
        updatedData.測試開關 = form.elements['config-test-mode'].value;
        updatedData.通知設定 = form.elements['config-notification-settings'].value.trim();

        // --- >>> 新增：讀取新欄位 <<< ---
        updatedData.balanceWorkload = form.elements['config-balance-workload'].checked; // 直接讀取 checked 狀態 (true/false)
        updatedData.enableConsecutiveRule = form.elements['config-enable-consecutive-rule'].checked; // 讀取開關狀態
        updatedData.consecutiveWorkLimit = parseInt(form.elements['config-consecutive-work-limit'].value, 10) || 0; // 讀取 X
        updatedData.mandatoryRestDays = parseInt(form.elements['config-mandatory-rest-days'].value, 10) || 0; // 讀取 Y
        // --- >>> 新增結束 <<< ---


        // 基本驗證
        if (!updatedData.排班月份 || !updatedData.排班月份.match(/^\d{4}-\d{2}$/)) { throw new Error('排班月份格式不正確 (YYYY-MM)'); }
        if (updatedData.enableConsecutiveRule && (updatedData.consecutiveWorkLimit <= 0 || updatedData.mandatoryRestDays <= 0)) {
             throw new Error('啟用連上/休假規則時，連上天數(X)和強制休假天數(Y)必須大於 0');
        }
        // TODO: Add more validation

        updatedData.lastUpdatedBy = currentUser.name;
        updatedData.lastUpdatedTimestamp = firebase.firestore.FieldValue.serverTimestamp();

        console.log("Saving schedule config data (in admin-schedule-config.js):", updatedData);

        const configDocId = "schedule_config";
        const docRef = db.collection('settings').doc(configDocId);
        await docRef.set(updatedData, { merge: true }); // 使用 set + merge

        console.log("Schedule config saved successfully.");
        messageElementInForm.textContent='設定儲存成功！'; messageElementInForm.className='message success-message';
        if(form.querySelector('#config-admin-password')) form.querySelector('#config-admin-password').value='';
        setTimeout(()=>{ messageElementInForm.textContent=''; messageElementInForm.className='message'; }, 4000);

    } catch (error) {
        console.error("Error saving schedule config:", error);
        messageElementInForm.textContent = `儲存失敗：${error.message}`;
        messageElementInForm.className = 'message error-message';
    } finally {
        saveButton.disabled = false;
    }
}

console.log("admin-schedule-config.js loaded (with algorithm options).");