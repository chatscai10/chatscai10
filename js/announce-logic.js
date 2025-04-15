// js/announce-logic.js - 公告頁面邏輯 (修正 db/user 傳遞)

(function() {
'use strict';

// --- 模組內變數 ---
let pageCurrentUser = null;
let pageDb = null;
let announcements = [];
let readStatuses = new Set();

// DOM 元素引用 (保持局部，在 initAnnouncePage 中獲取)
let listContainer = null;
let messageElement = null;

// --- 初始化函數 ---
/**
 * 初始化公告頁面
 * @param {object} user - 從 requireLogin 獲取的登入使用者物件
 * @param {firebase.firestore.Firestore} dbInstance - 從 initializeFirebaseAndAuth 獲取的 Firestore 實例
 */
function initAnnouncePage(user, dbInstance) {
    // --- 將傳入的參數賦值給模組變數 ---
    pageCurrentUser = user;
    pageDb = dbInstance;

    console.log("Initializing Announcements Page for:", pageCurrentUser?.name);

    // 獲取 DOM 元素
    listContainer = document.getElementById('announcements-list');
    messageElement = document.getElementById('announce-message');

    if (!listContainer || !messageElement) {
        console.error("Announcements list container or message element not found.");
        return;
    }
    // 檢查實例是否有效
    if (!pageDb) {
        console.error("Database instance (pageDb) is missing in initAnnouncePage.");
        if (listContainer) listContainer.innerHTML = '<div class="empty-placeholder" style="color:red;">頁面初始化錯誤 (DB)。</div>';
        return;
    }
    if (!pageCurrentUser || !pageCurrentUser.authUid) {
        console.error("User data (pageCurrentUser) or authUid is missing in initAnnouncePage.");
        if (listContainer) listContainer.innerHTML = '<div class="empty-placeholder" style="color:red;">頁面初始化錯誤 (User)。</div>';
        // 這裡不 return，嘗試繼續顯示公告，但已讀功能會失效
    }

    if (listContainer) listContainer.innerHTML = '<div class="loading-placeholder">正在載入公告...</div>';
    if (messageElement) messageElement.textContent = '';

    try {
        // 調用使用模組變數的函數
        fetchReadStatuses()
            .then(() => fetchAnnouncements())
            .then(() => renderAnnouncements())
            .catch(error => {
                console.error("Error initializing announcements page:", error);
                if (listContainer) listContainer.innerHTML = '<div class="empty-placeholder" style="color:red;">載入公告時發生錯誤。</div>';
                if (messageElement) messageElement.textContent = `錯誤: ${error.message}`;
            });
    } catch (error) {
        console.error("Error initializing announcements page:", error);
        if (listContainer) listContainer.innerHTML = '<div class="empty-placeholder" style="color:red;">載入公告時發生錯誤。</div>';
        if (messageElement) messageElement.textContent = `錯誤: ${error.message}`;
    }
}

/**
 * 獲取使用者已讀公告的 ID 列表 (使用 pageDb, pageCurrentUser)
 */
async function fetchReadStatuses() {
    if (!pageDb || !pageCurrentUser || !pageCurrentUser.authUid) {
        console.warn("Cannot fetch read statuses: pageDb or pageCurrentUser.authUid missing.");
        readStatuses = new Set();
        return;
    }
    readStatuses = new Set();
    console.log("Fetching read statuses for user:", pageCurrentUser.authUid);
    try {
        const querySnapshot = await pageDb.collection('announcement_read_status')
            .where('userId', '==', pageCurrentUser.authUid)
            .get();
        querySnapshot.forEach((doc) => {
            readStatuses.add(doc.data().announcementId);
        });
        console.log(`Found ${readStatuses.size} read announcements for the user.`);
    } catch (error) {
        console.error("Error fetching read statuses:", error);
        if (messageElement) messageElement.textContent = '讀取已讀狀態時發生錯誤。';
    }
}


/**
 * 從 Firestore 獲取公告 (使用 pageDb, pageCurrentUser)
 */
async function fetchAnnouncements() {
    if (!pageDb) { throw new Error("Firestore (pageDb) is not initialized."); }
    if (!pageCurrentUser || !pageCurrentUser.roles) {
         console.warn("User data or roles missing, filtering might be incomplete.");
    }
    announcements = [];
    const now = new Date();
    console.log("Fetching announcements...");
    try {
        let query = pageDb.collection('announcements').orderBy('publish_time', 'desc');
        const querySnapshot = await query.get();
        const fetchedAnnouncements = [];
        querySnapshot.forEach((doc) => {
            fetchedAnnouncements.push({ id: doc.id, ...doc.data() });
        });

        announcements = fetchedAnnouncements.filter(ann => {
            if (ann.expiry_time && ann.expiry_time.toDate() < now) return false;
            const userLevel = pageCurrentUser?.roles?.level ?? -1;
            const userStore = pageCurrentUser?.store || pageCurrentUser?.roles?.store || null;
            if (ann.target_level != null && userLevel < ann.target_level) return false;
            if (ann.target_store && userStore !== ann.target_store) return false;
            return true;
        });
        console.log(`Workspaceed ${querySnapshot.size} announcements initially, ${announcements.length} relevant after filtering.`);
    } catch (error) {
        console.error("Error fetching announcements:", error);
        throw new Error("讀取公告列表時發生錯誤。");
    }
}


// 檔案: js/announce-logic.js

/**
 * 渲染公告列表到頁面上 (修改版：卡片式 + 已讀按鈕)
 */
function renderAnnouncements() {
    if (!listContainer) return;
    listContainer.innerHTML = '';
    if (announcements.length === 0) {
        listContainer.innerHTML = '<div class="empty-placeholder">目前沒有公告。</div>';
        return;
    }
    announcements.forEach(ann => {
        const annElement = document.createElement('article');
        // --- 修改：使用新的卡片 class ---
        annElement.classList.add('announcement-card');
        annElement.dataset.id = ann.id;
        const isRead = readStatuses.has(ann.id);
        const isPriority = ann.priority === true;

        // --- 修改：根據 isRead 添加 class ---
        if (isRead) annElement.classList.add('read'); else annElement.classList.add('unread');
        if (isPriority) annElement.classList.add('priority'); // 保留重要標記

        const publishTime = ann.publish_time ? formatTimestamp(ann.publish_time) : '未知時間';

        // --- 修改：加入圖片顯示和已讀按鈕 ---
        annElement.innerHTML = `
            <div class="announcement-header">
                <span class="announcement-title">
                    ${isPriority ? '<span class="priority-tag">[重要]</span>' : ''}
                    ${ann.title || '無標題'}
                </span>
                <span class="announcement-meta">發布: ${publishTime}</span>
            </div>
            <div class="announcement-content" style="display: none;">
                ${ann.content ? processContent(ann.content) : '無內容'}
                ${ann.imageUrl ? `<img src="${ann.imageUrl}" alt="公告圖片">` : ''}
                <button class="announcement-read-button" data-ann-id="${ann.id}">✓ 已讀收到</button>

                <!-- ADDED: Comments section container -->
                <div class="announcement-comments-section">
                    <h4>留言</h4>
                    <div class="announcement-comments-container" data-announce-id="${ann.id}">
                        <!-- Comments will be loaded here -->
                        <p class="comments-loading-placeholder">正在載入留言...</p>
                    </div>
                    <!-- ADDED: New comment form placeholder -->
                    <div class="new-comment-form-placeholder" data-announce-id="${ann.id}">
                        <!-- New comment form will be added here later -->
                    </div>
                </div>
            </div>
        `;
        // --- 修改結束 ---

        const header = annElement.querySelector('.announcement-header');
        const readButton = annElement.querySelector('.announcement-read-button');
        const contentDiv = annElement.querySelector('.announcement-content');
        const commentsContainer = annElement.querySelector('.announcement-comments-container');

        // 卡片頭部點擊展開/收起
        if (header && contentDiv && commentsContainer) {
            header.addEventListener('click', () => {
                const isCurrentlyExpanded = contentDiv.style.display !== 'none';
                contentDiv.style.display = isCurrentlyExpanded ? 'none' : 'block';
                // When expanding, load comments if not already loaded
                if (!isCurrentlyExpanded) {
                    // Check if comments need loading (e.g., by checking placeholder)
                    if (commentsContainer.querySelector('.comments-loading-placeholder')) {
                         loadAndRenderComments(ann.id, commentsContainer);
                    }
                    // Later: Add code here to potentially render the new comment form
                }
            });
        }

        // "已讀收到" 按鈕點擊事件
        if (readButton) {
            readButton.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡到 header
                markAsRead(ann.id, annElement, true); // true 表示要寫入 Firestore
                readButton.textContent = '處理中...';
                readButton.disabled = true;
                // 可以在 markAsRead 成功後再隱藏按鈕或改變文字
            });
             // 如果一開始就是已讀，隱藏按鈕
             if (isRead) { readButton.style.display = 'none'; }
        }

        listContainer.appendChild(annElement);
    });
}


/**
 * 標記公告為已讀 (修改版：加入寫入 Firestore)
 * @param {string} announcementId - 公告 ID
 * @param {HTMLElement} annElement - 公告卡片元素
 * @param {boolean} saveToDb - 是否要將狀態寫入 Firestore
 */
async function markAsRead(announcementId, annElement, saveToDb = true) {
    // 如果本地已經是已讀，直接更新 UI 就好
    if (readStatuses.has(announcementId)) {
        if (annElement && !annElement.classList.contains('read')) {
            annElement.classList.remove('unread');
            annElement.classList.add('read');
            const button = annElement.querySelector('.announcement-read-button');
            if (button) button.style.display = 'none';
        }
        return;
    }

     // 更新本地 Set 和 UI
     readStatuses.add(announcementId);
     if (annElement) {
         annElement.classList.remove('unread');
         annElement.classList.add('read');
         const button = annElement.querySelector('.announcement-read-button');
         if (button) {
             button.textContent = '✓ 已讀收到'; // 恢復按鈕文字
             button.disabled = false;         // 恢復按鈕狀態
             button.style.display = 'none'; // 標記已讀後隱藏
         }
     }

    // 如果不需要寫入 DB，直接返回
     if (!saveToDb) {
         console.log(`Marked announcement ${announcementId} as read locally.`);
         return;
     }


    // --- 寫入 Firestore ---
    if (!pageDb || !pageCurrentUser || !pageCurrentUser.authUid) {
        console.warn("Cannot save read status to Firestore: db or user info missing.");
        // 即使寫入失敗，本地也標記為已讀了
        return;
    }

    console.log("Saving read status to Firestore for:", announcementId);
    const readStatusData = {
        userId: pageCurrentUser.authUid,
        announcementId: announcementId,
        userName: pageCurrentUser.name || '未知', // 記錄是誰讀的
        readAt: firebase.firestore.FieldValue.serverTimestamp() // 使用伺服器時間
    };
     // 使用組合 ID 避免重複記錄同一個人讀同一篇公告
     const docId = `${pageCurrentUser.authUid}_${announcementId}`;

    try {
        await pageDb.collection('announcement_read_status').doc(docId).set(readStatusData, { merge: true }); // 使用 set + merge，如果已存在則更新時間
        console.log(`Read status saved successfully for ${announcementId}`);
    } catch (error) {
        console.error("Error saving read status to Firestore:", error);
        // 可以考慮在這裡給用戶一個提示，或者將狀態回滾 (比較複雜)
        // readStatuses.delete(announcementId); // 回滾本地狀態
        // if(annElement) { annElement.classList.add('unread'); annElement.classList.remove('read'); ... }
    }
}



// --- 輔助函數 ---
/** 格式化 Timestamp (保持不變) */
function formatTimestamp(timestampObject) {
    if (!timestampObject || typeof timestampObject.toDate !== 'function') { return '日期無效'; }
    try { const date = timestampObject.toDate(); const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }; return new Intl.DateTimeFormat('zh-TW', options).format(date); }
    catch (e) { console.error("Error formatting timestamp:", e); return "日期格式錯誤"; }
}
/** 處理內容換行 (保持不變) */
function processContent(content) {
    if (!content) return '';
    const escapedContent = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    return escapedContent.replace(/\n/g, '<br>');
}

// --- ADDED: Function to load and render comments (basic structure) ---
async function loadAndRenderComments(announceId, container) {
    console.log(`Loading comments for announcement: ${announceId}`);
    container.innerHTML = '<p class="comments-loading-placeholder">正在載入留言...</p>'; // Show loading message

    if (!pageDb) {
        console.error("Firestore (pageDb) not initialized for loading comments.");
        container.innerHTML = '<p style="color:red;">無法載入留言 (DB Error)</p>';
        return;
    }

    try {
        const commentsRef = pageDb.collection('announcements').doc(announceId).collection('comments');
        const q = commentsRef.orderBy('timestamp', 'asc'); // Order by oldest first
        const querySnapshot = await q.get();

        container.innerHTML = ''; // Clear loading message

        if (querySnapshot.empty) {
            container.innerHTML = '<p>還沒有留言。</p>';
        } else {
            querySnapshot.forEach(doc => {
                const comment = { id: doc.id, ...doc.data() };
                const commentElement = document.createElement('div');
                commentElement.classList.add('comment-item');
                commentElement.dataset.commentId = comment.id;
                // TODO: Enhance rendering (user info, timestamp, replies, buttons)
                commentElement.innerHTML = `
                    <p>
                        <strong>${comment.userName || '匿名'}:</strong> 
                        ${comment.content || ''}
                        <small style="color: #888; margin-left: 10px;">${comment.timestamp ? formatTimestamp(comment.timestamp) : ''}</small>
                    </p>
                    <div class="comment-actions">
                         <button class="reply-comment-btn btn btn-sm btn-outline-secondary" data-comment-id="${comment.id}">回覆</button>
                         <!-- Admin buttons will be added here -->
                    </div>
                    <div class="comment-replies" data-parent-id="${comment.id}">
                        <!-- Replies will be rendered here -->
                    </div>
                `;
                container.appendChild(commentElement);

                // TODO: Add event listeners for reply/edit/delete buttons
            });
            // TODO: Add logic to handle nested replies rendering
        }
        
        // TODO: Render the new comment form after loading comments
        renderNewCommentForm(announceId, container.nextElementSibling); // Render form in placeholder

    } catch (error) {
        console.error(`Error loading comments for ${announceId}:`, error);
        container.innerHTML = '<p style="color:red;">載入留言失敗。</p>';
    }
}

// --- ADDED: Placeholder for rendering the new comment form ---
function renderNewCommentForm(announceId, formPlaceholderContainer) {
    if (!formPlaceholderContainer) return;
    formPlaceholderContainer.innerHTML = `
        <form class="new-comment-form" data-announce-id="${announceId}">
            <textarea class="form-control comment-textarea" rows="2" placeholder="新增留言..."></textarea>
            <button type="submit" class="btn btn-sm btn-primary post-comment-btn">送出</button>
        </form>
    `;
    
    // Add submit event listener for the form
    const form = formPlaceholderContainer.querySelector('.new-comment-form');
    if (form) {
        form.addEventListener('submit', async function(event) {
            event.preventDefault();
            
            const textarea = this.querySelector('.comment-textarea');
            const submitBtn = this.querySelector('.post-comment-btn');
            
            if (!textarea || !submitBtn) return;
            
            const content = textarea.value.trim();
            if (!content) {
                alert('請輸入留言內容');
                return;
            }
            
            // Disable form during submission
            textarea.disabled = true;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 送出中...';
            
            try {
                await postComment(announceId, content);
                
                // Clear form after successful submission
                textarea.value = '';
                
                // Reload comments
                const commentsContainer = formPlaceholderContainer.previousElementSibling;
                if (commentsContainer) {
                    await loadAndRenderComments(announceId, commentsContainer);
                }
            } catch (error) {
                console.error('Error posting comment:', error);
                alert(`留言失敗: ${error.message}`);
            } finally {
                // Re-enable form
                textarea.disabled = false;
                submitBtn.disabled = false;
                submitBtn.textContent = '送出';
            }
        });
    }
}

// --- ADDED: Function for posting a new comment ---
async function postComment(announceId, content, parentId = null) {
    console.log(`Posting comment to ${announceId}, parent: ${parentId}, content: ${content}`);
    
    if (!pageDb || !pageCurrentUser || !pageCurrentUser.authUid) {
        throw new Error('需要登入才能留言');
    }
    
    if (!content || !announceId) {
        throw new Error('缺少必要參數');
    }
    
    const commentData = {
        userId: pageCurrentUser.authUid,
        userName: pageCurrentUser.name || '未知用戶',
        userPicture: pageCurrentUser.pictureUrl || null,
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        parentId: parentId, // null for top-level comments
        status: 'active'
    };
    
    try {
        // Add comment to the announcement's subcollection
        const commentsRef = pageDb.collection('announcements').doc(announceId).collection('comments');
        const docRef = await commentsRef.add(commentData);
        
        console.log(`Comment posted successfully with ID: ${docRef.id}`);
        
        // Update announcement's comment count
        const announcementRef = pageDb.collection('announcements').doc(announceId);
        await announcementRef.update({
            commentCount: firebase.firestore.FieldValue.increment(1),
            lastCommentAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return docRef.id;
    } catch (error) {
        console.error('Error posting comment:', error);
        throw new Error(`留言發送失敗: ${error.message}`);
    }
}

// Export only what's needed globally
window.initAnnouncePage = initAnnouncePage;

console.log("announce-logic.js loaded");
})();