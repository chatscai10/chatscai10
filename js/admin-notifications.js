// js/admin-notifications.js - 後台通知設定頁面邏輯

'use strict';

// Firestore 文檔路徑
const NOTIFICATION_CONFIG_PATH = 'settings/notification_config';

/**
 * 載入通知設定區塊
 * @param {HTMLElement} sectionContainer - 區塊容器 (#section-notifications)
 * @param {firebase.firestore.Firestore} db - Firestore 實例
 */
async function loadNotificationSettingsSection(sectionContainer, db) {
    console.log("Executing loadNotificationSettingsSection...");
    const contentContainer = sectionContainer.querySelector('.section-content');
    if (!contentContainer || !db) {
        console.error("Content container or db missing for notifications section");
        if (contentContainer) contentContainer.innerHTML = '<p style="color:red;">載入通知設定失敗 (缺少必要組件)。</p>';
        return;
    }
    contentContainer.innerHTML = '<div class="loading-placeholder">載入通知設定中...</div>';
    if (typeof messageElement !== 'undefined' && messageElement) messageElement.textContent = ''; // 清除全局消息

    try {
        const docRef = db.doc(NOTIFICATION_CONFIG_PATH);
        const docSnap = await docRef.get();
        const settingsData = docSnap.exists ? docSnap.data() : {};

        console.log("Notification settings fetched:", settingsData);
        renderNotificationSettingsForm(contentContainer, settingsData, db); // 渲染表單

        if (typeof loadedSections !== 'undefined') loadedSections.add('notifications');
        console.log("Notification settings section loaded.");

    } catch (error) {
        console.error("Error loading notification settings:", error);
        contentContainer.innerHTML = `<p style="color: red;">載入通知設定失敗: ${error.message}</p>`;
    }
}

/**
 * 渲染通知設定表單 (修改版：增加營業額通知選項)
 * @param {HTMLElement} container - 內容容器
 * @param {object} settingsData - 當前設定數據
 * @param {firebase.firestore.Firestore} db - Firestore 實例 (傳遞給保存函數)
 */
function renderNotificationSettingsForm(container, settingsData, db) {
    container.innerHTML = ''; // 清空載入中
    const form = document.createElement('form');
    form.id = 'notification-settings-form';
    form.addEventListener('submit', (event) => handleSaveNotificationSettings(event, db)); // 綁定儲存函數

    // Helper function (保持不變)
    const createFormGroup = (id, labelText, inputType = 'text', value = '', placeholder = '', helpText = '') => {
        // ... (createFormGroup 函數內容不變) ...
        const group = document.createElement('div'); group.className = 'form-group'; const label = document.createElement('label'); label.htmlFor = id; let input; value = value ?? '';
        if (inputType === 'checkbox') { input = document.createElement('input'); input.type = 'checkbox'; input.checked = value === true; input.id = id; input.name = id; input.classList.add('form-check-input'); label.style.display = 'flex'; label.style.alignItems = 'center'; input.style.marginRight = '8px'; input.style.width = 'auto'; label.appendChild(input); label.appendChild(document.createTextNode(labelText)); group.appendChild(label); }
         else { label.textContent = labelText; input = document.createElement('input'); input.type = inputType; input.id = id; input.name = id; input.value = String(value); input.placeholder = placeholder; input.classList.add('form-control'); group.appendChild(label); group.appendChild(input); }
         if (helpText) { const small = document.createElement('small'); small.className = 'form-text text-muted'; small.textContent = helpText; group.appendChild(small); }
         return group;
    };

    // --- LINE OA 設定 ---
    const lineFieldset = document.createElement('fieldset'); /* ... style ... */
    lineFieldset.innerHTML = '<legend>LINE 官方帳號通知</legend>';
    lineFieldset.appendChild(createFormGroup('line-notify-enabled', '啟用 LINE 通知', 'checkbox', settingsData.line?.enabled));
    lineFieldset.appendChild(createFormGroup('line-target-id', '目標 User/Group/Room ID:', 'text', settingsData.line?.targetId, 'Uxxxxxxxx... 或 Cxxxxxxxx... 或 Rxxxxxxxx...'));
    const lineTriggers = document.createElement('div'); lineTriggers.style.marginTop = '10px'; lineTriggers.innerHTML = '<label>觸發時機：</label>';
    lineTriggers.appendChild(createFormGroup('line-notify-on-register', '新人註冊完成', 'checkbox', settingsData.line?.notifyOn?.register));
    lineTriggers.appendChild(createFormGroup('line-notify-on-order', '收到新叫貨單', 'checkbox', settingsData.line?.notifyOn?.order));
    lineTriggers.appendChild(createFormGroup('line-notify-on-leave', '收到新排假申請', 'checkbox', settingsData.line?.notifyOn?.leave));
    // --- 【修改點】增加營業額選項 ---
    lineTriggers.appendChild(createFormGroup('line-notify-on-sales', '提交營業額報表', 'checkbox', settingsData.line?.notifyOn?.sales));
    // --- 修改點結束 ---
    lineFieldset.appendChild(lineTriggers);
    const lineNote = document.createElement('p'); /* ... 安全提示 ... */
    lineFieldset.appendChild(lineNote);
    form.appendChild(lineFieldset);

    // --- Telegram 設定 ---
    const tgFieldset = document.createElement('fieldset'); /* ... style ... */
    tgFieldset.innerHTML = '<legend>Telegram 通知</legend>';
    tgFieldset.appendChild(createFormGroup('tg-notify-enabled', '啟用 Telegram 通知', 'checkbox', settingsData.telegram?.enabled));
    tgFieldset.appendChild(createFormGroup('tg-chat-id', '目標 Chat ID:', 'text', settingsData.telegram?.chatId, '-100xxxxxxxx 或個人/群組 ID'));
    const tgTriggers = document.createElement('div'); tgTriggers.style.marginTop = '10px'; tgTriggers.innerHTML = '<label>觸發時機：</label>';
    tgTriggers.appendChild(createFormGroup('tg-notify-on-register', '新人註冊完成', 'checkbox', settingsData.telegram?.notifyOn?.register));
    tgTriggers.appendChild(createFormGroup('tg-notify-on-order', '收到新叫貨單', 'checkbox', settingsData.telegram?.notifyOn?.order));
    tgTriggers.appendChild(createFormGroup('tg-notify-on-leave', '收到新排假申請', 'checkbox', settingsData.telegram?.notifyOn?.leave));
    tgTriggers.appendChild(createFormGroup('tg-notify-on-auto-update', '參數自動更新完成', 'checkbox', settingsData.telegram?.notifyOn?.autoUpdate));
    // --- 【修改點】增加營業額選項 ---
    tgTriggers.appendChild(createFormGroup('tg-notify-on-sales', '提交營業額報表', 'checkbox', settingsData.telegram?.notifyOn?.sales));
    // --- 修改點結束 ---
    tgFieldset.appendChild(tgTriggers);
    const tgNote = document.createElement('p'); /* ... 安全提示 ... */
    tgFieldset.appendChild(tgNote);
    form.appendChild(tgFieldset);

    // --- 儲存按鈕和訊息區 (不變) ---
    const saveButton = document.createElement('button'); /* ... */ form.appendChild(saveButton);
    const formMessage = document.createElement('p'); /* ... */ form.appendChild(formMessage);

    container.appendChild(form);
}

/**
 * 處理通知設定表單提交
 * @param {Event} event
 * @param {firebase.firestore.Firestore} db
 */
async function handleSaveNotificationSettings(event, db) {
    event.preventDefault();
    const form = event.target;
    const saveButton = form.querySelector('button[type="submit"]');
    const messageElementInForm = form.querySelector('#notification-settings-message');
    if (!form || !saveButton || !messageElementInForm || !db) return;

    messageElementInForm.textContent = '儲存中...'; messageElementInForm.className = 'message info-message'; saveButton.disabled = true;

    try {
        const settingsToSave = {
            line: {
                enabled: form.elements['line-notify-enabled'].checked,
                targetId: form.elements['line-target-id'].value.trim() || null,
                notifyOn: {
                    register: form.elements['line-notify-on-register'].checked,
                    order: form.elements['line-notify-on-order'].checked,
                    leave: form.elements['line-notify-on-leave'].checked,
                    sales: form.elements['line-notify-on-sales'].checked // <-- 新增
                }
            },
            telegram: {
                enabled: form.elements['tg-notify-enabled'].checked,
                chatId: form.elements['tg-chat-id'].value.trim() || null,
                notifyOn: {
                    register: form.elements['tg-notify-on-register'].checked,
                    order: form.elements['tg-notify-on-order'].checked,
                    leave: form.elements['tg-notify-on-leave'].checked,
                    autoUpdate: form.elements['tg-notify-on-auto-update'].checked,
                    sales: form.elements['tg-notify-on-sales'].checked // <-- 新增
                }
            },
            lastUpdated: new Date()
        };


        // 清理 notifyOn 中的 false 值 (可選，讓 Firestore 資料更乾淨)
        Object.keys(settingsToSave.line.notifyOn).forEach(key => {
            if (!settingsToSave.line.notifyOn[key]) delete settingsToSave.line.notifyOn[key];
        });
         Object.keys(settingsToSave.telegram.notifyOn).forEach(key => {
            if (!settingsToSave.telegram.notifyOn[key]) delete settingsToSave.telegram.notifyOn[key];
        });

        console.log("Saving notification settings:", settingsToSave);

        const docRef = db.doc(NOTIFICATION_CONFIG_PATH);
        await docRef.set(settingsToSave, { merge: true }); // 使用 set + merge 更新或創建

        messageElementInForm.textContent = '通知設定儲存成功！';
        messageElementInForm.className = 'message success-message';
        setTimeout(() => { messageElementInForm.textContent = ''; messageElementInForm.className = 'message'; }, 4000);

    } catch (error) {
        console.error("Error saving notification settings:", error);
        messageElementInForm.textContent = `儲存失敗：${error.message}`;
        messageElementInForm.className = 'message error-message';
    } finally {
        saveButton.disabled = false;
    }
}

console.log("admin-notifications.js loaded");