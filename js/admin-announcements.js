// js/admin-announcements.js - 後台公告設定 CRUD 邏輯

'use strict';

/**
 * 載入公告管理區塊
 * @param {HTMLElement} sectionContainer - 區塊容器 (#section-announcements)
 */
async function loadAnnouncementsAdminSection(sectionContainer) {
    console.log("Executing loadAnnouncementsAdminSection...");
    const contentContainer = sectionContainer.querySelector('.section-content');
    if (!contentContainer) { console.error("Content container missing for announcements admin"); return; }
    contentContainer.innerHTML = '載入公告列表中...';

    try {
        if (typeof db === 'undefined') throw new Error("Firestore (db) not available.");

        // 加入新增按鈕 (如果不存在)
        if (!sectionContainer.querySelector('.add-announcement-btn')) {
            const addButton = document.createElement('button');
            addButton.textContent = '✚ 新增公告';
            addButton.classList.add('btn', 'add-announcement-btn');
            addButton.style.marginBottom = '15px';
            addButton.onclick = () => openAnnouncementModal(null, null); // 打開 Modal (新增模式)
            sectionContainer.insertBefore(addButton, contentContainer);
        }

        // 獲取公告列表 (按發布時間降序)
        const querySnapshot = await db.collection('announcements')
            .orderBy('publish_time', 'desc')
            .get();

        const announcements = [];
        querySnapshot.forEach(doc => announcements.push({ id: doc.id, ...doc.data() }));

        renderAnnouncementsAdminTable(contentContainer, announcements); // 渲染表格

        if (typeof loadedSections !== 'undefined') loadedSections.add('announcements');
        console.log("Announcements admin section loaded.");

        // --- 綁定 Modal 事件 (確保只綁定一次) ---
        const modal = document.getElementById('announcement-modal');
        const form = document.getElementById('announcement-form-modal');
        const cancelBtn = document.getElementById('cancel-announcement-btn');
        const closeBtn = document.getElementById('close-announcement-modal');

        if (modal && form && !form.dataset.listenerAttached) {
            if (typeof saveAnnouncement === 'function') form.addEventListener('submit', saveAnnouncement);
            if (cancelBtn) cancelBtn.addEventListener('click', closeAnnouncementModal);
            if (closeBtn) closeBtn.addEventListener('click', closeAnnouncementModal);
            // 點擊 Modal 外部關閉
            modal.addEventListener('click', (event) => { if (event.target === modal) closeAnnouncementModal(); });
            form.dataset.listenerAttached = 'true'; // 標記已綁定
        }
        // --- Modal 事件綁定結束 ---

    } catch (error) {
        console.error("Error loading announcements admin:", error);
        contentContainer.innerHTML = `<p style="color:red;">載入公告列表失敗: ${error.message}</p>`;
    }
}

/**
 * 渲染公告管理表格
 * @param {HTMLElement} container
 * @param {Array<object>} announcements
 */
function renderAnnouncementsAdminTable(container, announcements) {
    container.innerHTML = ''; // 清空
    if (!announcements || announcements.length === 0) {
        container.innerHTML = '<p>目前沒有任何公告。</p>';
        return;
    }

    const table = document.createElement('table');
    table.classList.add('data-table');
    const thead = table.createTHead();
    const hr = thead.insertRow();
    // 增加更多欄位顯示
    const headers = ['標題', '內容預覽', '發布時間', '目標等級', '目標分店', '過期時間', '重要', '操作'];
    headers.forEach(text => { const th = document.createElement('th'); th.textContent = text; hr.appendChild(th); });

    const tbody = table.createTBody();
    announcements.forEach(ann => {
        const row = tbody.insertRow();
        row.dataset.id = ann.id;

        row.insertCell().textContent = ann.title || '(無標題)';
        const contentCell = row.insertCell();
        contentCell.textContent = ann.content ? (ann.content.substring(0, 30) + (ann.content.length > 30 ? '...' : '')) : '(無內容)';
        contentCell.title = ann.content || ''; // 完整內容提示

        // 格式化時間 (需要 formatTimestamp 函數，假設在 admin-logic.js 或 main.js)
        row.insertCell().textContent = ann.publish_time && typeof formatTimestamp === 'function' ? formatTimestamp(ann.publish_time) : 'N/A';
        row.insertCell().textContent = ann.target_level ?? '所有'; // ?? 表示如果前面是 null/undefined 就用後面的值
        row.insertCell().textContent = ann.target_store || '所有';
        row.insertCell().textContent = ann.expiry_time && typeof formatTimestamp === 'function' ? formatTimestamp(ann.expiry_time) : '無';
        row.insertCell().textContent = ann.priority ? '是' : '否';

        // 操作按鈕
        const actionCell = row.insertCell();
        actionCell.style.whiteSpace = 'nowrap';

        const editButton = document.createElement('button');
        editButton.textContent = '編輯';
        editButton.classList.add('btn', 'btn-sm', 'btn-primary');
        editButton.style.marginRight = '5px';
        editButton.onclick = () => openAnnouncementModal(ann.id, ann); // 打開編輯 Modal
        actionCell.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = '刪除';
        deleteButton.classList.add('btn', 'btn-sm', 'btn-danger', 'delete-ann-btn');
        deleteButton.dataset.id = ann.id;
        deleteButton.dataset.title = ann.title || ann.id;
        deleteButton.onclick = () => deleteAnnouncement(ann.id, ann.title || ann.id); // 刪除公告
        actionCell.appendChild(deleteButton);


// 在 renderAnnouncementsAdminTable 函數的 actionCell.appendChild(deleteButton); 之後加入：
const viewReadButton = document.createElement('button');
viewReadButton.textContent = '查看已讀';
viewReadButton.classList.add('btn', 'btn-sm', 'btn-info');
viewReadButton.style.marginLeft = '5px';
viewReadButton.onclick = () => viewReadStatus(ann.id, ann.title);
actionCell.appendChild(viewReadButton);

// --- 新增：查看已讀狀態的函數 ---
async function viewReadStatus(announcementId, announcementTitle) {
    // 1. 創建或獲取用於顯示狀態的 Modal
    let modal = document.getElementById('read-status-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'read-status-modal';
        modal.className = 'modal'; // 使用現有的 modal 樣式
        modal.style.display = 'none'; // 預設隱藏
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <span class="close-btn" onclick="closeModal('read-status-modal')">&times;</span>
                <h4 id="read-status-modal-title">公告已讀狀態</h4>
                <div id="read-status-modal-body" style="max-height: 400px; overflow-y: auto;">
                    <p>載入中...</p>
                </div>
                 <button type="button" class="btn btn-secondary" style="margin-top: 15px;" onclick="closeModal('read-status-modal')">關閉</button>
            </div>
        `;
        document.body.appendChild(modal); // 將 Modal 加入頁面
         // 綁定外部點擊關閉
         modal.addEventListener('click', (event) => {
             if (event.target === modal) closeModal('read-status-modal');
         });
    }

    // 2. 更新 Modal 標題並顯示載入中
    const modalTitle = modal.querySelector('#read-status-modal-title');
    const modalBody = modal.querySelector('#read-status-modal-body');
    if(modalTitle) modalTitle.textContent = `公告 "${announcementTitle}" 已讀狀態`;
    if(modalBody) modalBody.innerHTML = '<p>載入已讀名單中...</p>';
    openModal('read-status-modal'); // 打開 Modal

    // 3. 查詢 Firestore
    if (!db) { if(modalBody) modalBody.innerHTML = '<p style="color:red">資料庫錯誤</p>'; return; }

    try {
        const readSnap = await db.collection('announcement_read_status')
                                 .where('announcementId', '==', announcementId)
                                 .orderBy('readAt', 'desc')
                                 .get();

        let readHtml = '<h5>已讀人員:</h5>';
        if (readSnap.empty) {
            readHtml += '<p><i>尚無人讀取。</i></p>';
        } else {
            readHtml += '<ul>';
            readSnap.forEach(doc => {
                const data = doc.data();
                const readTime = data.readAt ? formatTimestamp(data.readAt) : '未知時間';
                readHtml += `<li>${data.userName || data.userId} - ${readTime}</li>`;
            });
            readHtml += '</ul>';
        }

        // (進階) 查詢未讀人員
        // ... 需要先獲取所有應看到此公告的員工 (根據 target_level/target_store)
        // ... 然後與已讀名單比較
        // readHtml += '<h5>未讀人員:</h5><p><i>(功能待開發)</i></p>';

        if(modalBody) modalBody.innerHTML = readHtml;

    } catch (error) {
        console.error("Error fetching read status:", error);
        if(modalBody) modalBody.innerHTML = `<p style="color:red">查詢已讀狀態失敗: ${error.message}</p>`;
    }
}

// --- 確保 closeModal 函數存在 (可能在 main.js 或 admin-logic.js) ---
// function closeModal(modalId) {
//     const modal = document.getElementById(modalId);
//     if (modal) modal.style.display = 'none';
// }

    });
    container.appendChild(table);
}

/**
 * 打開新增/編輯公告 Modal
 * @param {string|null} docId - 公告 ID，null 為新增
 * @param {object|null} data - 現有公告資料
 */
function openAnnouncementModal(docId = null, data = null) {
    const modal = document.getElementById('announcement-modal');
    const form = document.getElementById('announcement-form-modal');
    const title = document.getElementById('announcement-modal-title');
    const message = document.getElementById('announcement-modal-message');
    const idInput = document.getElementById('modal-announcement-id');

        // --- 新增獲取圖片相關元素 ---
        const imageInput = document.getElementById('modal-ann-image');
        const imageUrlInput = document.getElementById('modal-ann-image-url');
        const imagePreview = document.getElementById('modal-ann-image-preview');
        // --- 新增結束 ---
    if (!modal || !form || !title || !idInput) { console.error("Announcement modal elements missing!"); alert("開啟表單錯誤。"); return; }

    console.log("Opening announcement modal. Mode:", docId ? 'Edit' : 'Add');
    form.reset(); // 清空表單
    if(message) { message.textContent = ''; message.className = 'message'; }
    Array.from(form.elements).forEach(el => { if(el.style) el.style.borderColor = ''; }); // 清除錯誤樣式

    if (docId && data) {
        // 編輯模式
        title.textContent = '編輯公告';
        idInput.value = docId;
        form.elements['modal-ann-title'].value = data.title || '';
        form.elements['modal-ann-content'].value = data.content || '';
        form.elements['modal-ann-target-level'].value = data.target_level ?? ''; // 使用 nullish coalescing
        form.elements['modal-ann-target-store'].value = data.target_store || '';
        // 將 Firestore Timestamp 轉為 datetime-local 需要的格式 (YYYY-MM-DDTHH:mm)
        if (data.expiry_time && typeof data.expiry_time.toDate === 'function') {
            const expiryDate = data.expiry_time.toDate();
            // 手動補零並組合成正確格式
            const year = expiryDate.getFullYear();
            const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
            const day = String(expiryDate.getDate()).padStart(2, '0');
            const hours = String(expiryDate.getHours()).padStart(2, '0');
            const minutes = String(expiryDate.getMinutes()).padStart(2, '0');
            form.elements['modal-ann-expiry'].value = `<span class="math-inline">\{year\}\-</span>{month}-<span class="math-inline">\{day\}T</span>{hours}:${minutes}`;
        } else {
             form.elements['modal-ann-expiry'].value = '';
        }
        form.elements['modal-ann-priority'].checked = data.priority === true;
        // --- 新增：填充圖片資訊 ---
        if (data.imageUrl) {
            imageUrlInput.value = data.imageUrl; // 設置隱藏欄位
            imagePreview.innerHTML = `<img src="${data.imageUrl}" alt="公告圖片" style="max-width: 200px; max-height: 150px; display: block;"><button type="button" onclick="removePreviewImage()" class="btn btn-sm btn-danger" style="margin-top:5px;">移除圖片</button>`;
        }
        // --- 新增結束 ---

    } else {
        // 新增模式
        title.textContent = '新增公告';
        idInput.value = '';
        form.elements['modal-ann-priority'].checked = false; // 預設非重要
    }
    modal.style.display = 'flex';
}

/**
 * 關閉公告 Modal
 */
function closeAnnouncementModal() {
    const modal = document.getElementById('announcement-modal');
    if (modal) modal.style.display = 'none';
}


// --- 新增：處理圖片預覽的輔助函數 ---
function handleImagePreview(event) {
    const fileInput = event.target;
    const previewContainer = document.getElementById('modal-ann-image-preview');
    const imageUrlInput = document.getElementById('modal-ann-image-url'); // 同時清空舊 URL
    if (!fileInput.files || fileInput.files.length === 0 || !previewContainer || !imageUrlInput) {
        if(previewContainer) previewContainer.innerHTML = ''; // 清空預覽
        if(imageUrlInput) imageUrlInput.value = ''; // 清空 URL
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        previewContainer.innerHTML = `<img src="${e.target.result}" alt="圖片預覽" style="max-width: 200px; max-height: 150px; display: block;"><button type="button" onclick="removePreviewImage()" class="btn btn-sm btn-danger" style="margin-top:5px;">移除圖片</button>`;
        imageUrlInput.value = ''; // 清空舊的 URL，因為選擇了新文件
    }
    reader.readAsDataURL(file);
}

// --- 新增：移除預覽圖片的函數 ---
function removePreviewImage() {
     const imageInput = document.getElementById('modal-ann-image');
     const imageUrlInput = document.getElementById('modal-ann-image-url');
     const imagePreview = document.getElementById('modal-ann-image-preview');
     if(imageInput) imageInput.value = '';
     if(imageUrlInput) imageUrlInput.value = 'REMOVE'; // 特殊標記，表示要刪除伺服器上的圖片
     if(imagePreview) imagePreview.innerHTML = '';
     console.log("Image preview removed. Flag set to REMOVE.");
}


/**
 * 儲存公告 (修改版：加入圖片上傳)
 * @param {Event} event
 */
async function saveAnnouncement(event) {
    event.preventDefault();
    const form = event.target;
    const saveButton = form.querySelector('#save-announcement-btn');
    const messageElementInModal = form.querySelector('#announcement-modal-message');
    const editingDocId = form.elements['modal-announcement-id'].value;
    const imageInput = form.elements['modal-ann-image'];
    const existingImageUrlInput = form.elements['modal-ann-image-url'];
    const removeImageFlag = existingImageUrlInput.value === 'REMOVE'; // 檢查是否要移除圖片

    if (!saveButton || !messageElementInModal || typeof db === 'undefined') { /* ... */ return; }
     // --- 加入 Firebase Storage 檢查 ---
     if (typeof firebase === 'undefined' || typeof firebase.storage !== 'function') {
         messageElementInModal.textContent = '儲存失敗：Firebase Storage 未初始化。';
         messageElementInModal.className = 'message error-message';
         return;
     }
     const storage = firebase.storage();
     // --- 檢查結束 ---

    messageElementInModal.textContent = '儲存中...'; messageElementInModal.className = 'message info-message'; saveButton.disabled = true;

    try {
        const title = form.elements['modal-ann-title'].value.trim();
        const content = form.elements['modal-ann-content'].value.trim();
        // ... (獲取其他欄位) ...
        const priority = form.elements['modal-ann-priority'].checked;
        const targetLevelStr = form.elements['modal-ann-target-level'].value.trim();
        const targetStore = form.elements['modal-ann-target-store'].value.trim();
        const expiryStr = form.elements['modal-ann-expiry'].value;

        if (!title || !content) throw new Error('標題和內容為必填欄位。');

        let imageUrlToSave = existingImageUrlInput.value && !removeImageFlag ? existingImageUrlInput.value : null; // 默認為現有 URL 或 null

        // 1. 處理圖片上傳或刪除
        if (removeImageFlag && editingDocId) {
             // 如果標記為移除且是編輯模式，嘗試刪除舊圖片
             imageUrlToSave = null; // 確保最終儲存 null
             if (existingImageUrlInput.value && existingImageUrlInput.value !== 'REMOVE') { // 確保之前確實有 URL
                  try {
                       const oldImageRef = storage.refFromURL(existingImageUrlInput.value);
                       await oldImageRef.delete();
                       console.log("Old image deleted from storage.");
                  } catch (deleteError) {
                       console.warn("Failed to delete old image from storage (might not exist or permissions error):", deleteError);
                       // 通常不阻止公告本身的保存
                  }
             }
        } else if (imageInput.files && imageInput.files.length > 0) {
             // 如果有選擇新文件，執行上傳
             messageElementInModal.textContent = '上傳圖片中...';
             const file = imageInput.files[0];
             const timestamp = Date.now();
             const storageRef = storage.ref(`announcement_images/<span class="math-inline">\{timestamp\}\_</span>{file.name}`);
             const uploadTask = await storageRef.put(file);
             imageUrlToSave = await uploadTask.ref.getDownloadURL(); // 獲取上傳後的 URL
             console.log("Image uploaded successfully:", imageUrlToSave);
        }
         messageElementInModal.textContent = '儲存公告資料...'; // 更新提示

        // 2. 準備儲存到 Firestore 的資料
        const dataToSave = {
            title: title,
            content: content,
            priority: priority,
            target_level: targetLevelStr ? parseInt(targetLevelStr, 10) : null,
            target_store: targetStore || null,
            expiry_time: expiryStr ? firebase.firestore.Timestamp.fromDate(new Date(expiryStr)) : null,
            publish_time: firebase.firestore.FieldValue.serverTimestamp(), // 更新時間
            imageUrl: imageUrlToSave // 儲存圖片 URL (可能是新的, 舊的, 或 null)
        };

         // 移除值為 null 的欄位 (可選，取決於你希望 Firestore 如何處理)
         Object.keys(dataToSave).forEach(key => (dataToSave[key] === null && key !== 'imageUrl') && delete dataToSave[key]);
         // 特別處理 imageUrl，如果設為 null 也要存
         if(imageUrlToSave === null) dataToSave.imageUrl = null;


        console.log("Saving announcement with image URL:", editingDocId || '(New)', dataToSave);
        const collectionRef = db.collection('announcements');

        if (editingDocId) {
            await collectionRef.doc(editingDocId).update(dataToSave);
        } else {
            await collectionRef.add(dataToSave);
        }

        messageElementInModal.textContent = '儲存成功！'; messageElementInModal.className = 'message success-message';
        setTimeout(() => {
            closeAnnouncementModal();
             // 刷新參數設定頁籤的內容，而不是整個 admin 頁面
             if (parametersSectionContainer && typeof loadParameterTabContent === 'function') {
                  loadParameterTabContent('param-content-announcements'); // 假設公告管理在參數設定頁籤內
             } else {
                  const section = document.getElementById('section-announcements');
                  if (section) loadAnnouncementsAdminSection(section); // 如果是獨立區塊
             }

        }, 1000);

    } catch (error) {
        console.error("Error saving announcement:", error);
        messageElementInModal.textContent = `儲存失敗：${error.message}`;
        messageElementInModal.className = 'message error-message';
    } finally {
        saveButton.disabled = false;
    }
}

/**
 * 刪除公告
 * @param {string} docId - 公告 ID
 * @param {string} title - 公告標題 (用於確認)
 */
async function deleteAnnouncement(docId, title) {
     // 使用全域 messageElement (來自 admin-logic.js)
     if (typeof messageElement === 'undefined') { console.error("Global messageElement missing!"); return; }

     if (confirm(`確定要刪除公告 "${title}" 嗎？`)) {
         messageElement.textContent = `刪除中...`; messageElement.className = 'message info-message';
         const btn = document.querySelector(`.delete-ann-btn[data-id="${docId}"]`);
         if (btn) btn.disabled = true;

         try {
             if (typeof db === 'undefined') throw new Error("Firestore (db) not available.");
             await db.collection('announcements').doc(docId).delete();

             messageElement.textContent = `公告 "${title}" 已刪除。`;
             messageElement.className = 'message success-message';
             const row = document.querySelector(`tr[data-id="${docId}"]`);
             if(row) row.remove(); // 從表格移除
             setTimeout(() => { if (messageElement.textContent.includes('已刪除')) messageElement.textContent = ''; }, 4000);

         } catch (error) {
              console.error("Error deleting announcement:", error);
              messageElement.textContent = `刪除失敗: ${error.message}`;
              messageElement.className = 'message error-message';
              if (btn) btn.disabled = false;
         }
     }
 }

console.log("admin-announcements.js loaded");