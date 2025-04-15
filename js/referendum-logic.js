// --- 初始化函數 ---

/**
 * 初始化投票系統頁面
 * @param {Object} currentUser - 當前用戶信息
 * @param {Object} db - Firestore 數據庫實例
 */
async function initReferendumPage(currentUser, db) {
    console.log("Initializing referendum page for:", currentUser?.name);
    
    const contentDiv = document.getElementById('referendum-content');
    if (!contentDiv) {
        console.error("Referendum content container not found!");
        return;
    }
    
    // 顯示加載信息
    contentDiv.innerHTML = '<p class="loading-message">正在加載投票內容...</p>';
    
    try {
        // 這裡添加獲取投票數據的代碼
        const pollsSnapshot = await db.collection('polls')
            .where('isActive', '==', true)
            .orderBy('createdAt', 'desc')
            .get();
            
        // 初始化用户投票狀態(全局)
        window.userVotes = {};
        
        // 加載用户已投票記錄
        await loadUserVotes(currentUser.authUid, db);
        
        if (pollsSnapshot.empty) {
            contentDiv.innerHTML = '<p class="message info-message">目前沒有進行中的投票。</p>';
            return;
        }
        
        // 處理並顯示投票項目
        let pollsData = {};
        pollsSnapshot.forEach(doc => {
            const data = doc.data();
            pollsData[doc.id] = {
                id: doc.id,
                ...data
            };
        });
        
        renderPolls(pollsData, contentDiv);
        
        // 綁定投票按鈕事件
        bindVoteButtonEvents(pollsData);
        
        // 綁定挑戰按鈕事件
        bindChallengeButtonEvents();
        
        console.log("Referendum page initialized successfully");
    } catch (error) {
        console.error("Error initializing referendum page:", error);
        contentDiv.innerHTML = `<p class="message error-message">載入失敗: ${error.message}</p>`;
    }
}

/**
 * 加載user已投票記錄
 */
async function loadUserVotes(userId, db) {
    if (!userId) return;
    
    try {
        const votesSnapshot = await db.collection('user_votes')
            .where('userId', '==', userId)
            .get();
            
        votesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.pollId) {
                window.userVotes[data.pollId] = data.optionId;
            }
        });
        
        console.log("Loaded user votes:", window.userVotes);
    } catch (error) {
        console.error("Error loading user votes:", error);
    }
}

/**
 * 渲染投票項目
 */
function renderPolls(pollsData, container) {
    let html = '';
    
    for (const pollId in pollsData) {
        const poll = pollsData[pollId];
        const userVote = window.userVotes[pollId];
        
        html += `
            <div class="poll-item" data-poll-id="${pollId}">
                <h3>${escapeHtml(poll.title)}</h3>
                <p>${escapeHtml(poll.description || '')}</p>
                <div class="options-container">
        `;
        
        // 渲染選項
        for (const option of poll.options || []) {
            const isSelected = userVote === option.id;
            const buttonClass = isSelected ? 'vote-button selected' : 'vote-button';
            const buttonDisabled = userVote ? 'disabled' : '';
            
            html += `
                <button class="${buttonClass}" ${buttonDisabled}
                    data-poll-id="${pollId}"
                    data-option-id="${option.id}"
                    data-option-text="${escapeHtml(option.text)}">
                    ${escapeHtml(option.text)}
                </button>
            `;
        }
        
        html += `
                </div>
                <div class="poll-footer">
                    <small>截止日期: ${formatDate(poll.endDate?.toDate?.() || new Date())}</small>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

/**
 * 輔助函數 - 格式化日期
 */
function formatDate(date) {
    return date instanceof Date ? 
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` :
        '未設定';
}

/**
 * 輔助函數 - 轉義HTML字符
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 投票功能
 */
async function castVote(pollId, optionId) {
    if (!pollId || !optionId) throw new Error('投票ID或選項ID無效');
    if (!window.currentUser?.authUid) throw new Error('用戶未登入');
    
    try {
        // 記錄投票
        await window.db.collection('user_votes').add({
            userId: window.currentUser.authUid,
            pollId: pollId,
            optionId: optionId,
            timestamp: new Date()
        });
        
        // 增加投票計數
        const pollRef = window.db.collection('polls').doc(pollId);
        await window.db.runTransaction(async (transaction) => {
            const pollDoc = await transaction.get(pollRef);
            if (!pollDoc.exists) throw new Error('投票項目不存在');
            
            const pollData = pollDoc.data();
            const options = pollData.options || [];
            const optionIndex = options.findIndex(opt => opt.id === optionId);
            
            if (optionIndex === -1) throw new Error('選項不存在');
            
            // 增加計數
            options[optionIndex].count = (options[optionIndex].count || 0) + 1;
            
            transaction.update(pollRef, { options });
        });
        
        return true;
    } catch (error) {
        console.error('投票失敗:', error);
        throw error;
    }
}

// --- 事件處理函數 ---

// 綁定投票按鈕的事件處理
function bindVoteButtonEvents(pollDataMap = {}) {
    // ... (移除舊監聽器的代碼不變) ...
    document.querySelectorAll('.vote-button:not(.start-challenge-btn)').forEach(button => {
        button.replaceWith(button.cloneNode(true)); 
    });

    // 重新選取新的按鈕並綁定事件
    document.querySelectorAll('.vote-button:not(.start-challenge-btn)').forEach(button => {
        button.addEventListener('click', async function(event) {
            event.preventDefault();
            
            const pollId = this.getAttribute('data-poll-id');
            const optionId = this.getAttribute('data-option-id');
            const originalText = this.getAttribute('data-option-text') || '選項'; 
            
            if (!pollId || !optionId) return;
            
            const relatedButtons = document.querySelectorAll(`.vote-button[data-poll-id="${pollId}"]`);
            
            // *** 優化：顯示更明確的載入狀態 ***
            relatedButtons.forEach(btn => {
                btn.disabled = true;
                btn.classList.add('disabled', 'loading'); // 添加 loading class
                // 可以考慮添加 spinner icon 或只改文字
                btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 處理中...`; 
            });
            
            try {
                await castVote(pollId, optionId);
                userVotes[pollId] = optionId; 
                showMessage('投票成功！', 'success', 3000);
                // 列表會由 onSnapshot 自動更新，按鈕會在重新渲染時恢復
            } catch (error) {
                console.error('投票失敗:', error);
                showMessage('投票失敗: ' + error.message, 'error');
                
                // *** 優化：錯誤時恢復按鈕狀態 ***
                relatedButtons.forEach(btn => {
                    btn.disabled = false;
                    btn.classList.remove('disabled', 'loading');
                    const buttonOriginalText = btn.getAttribute('data-option-text') || '選項'; 
                    btn.innerHTML = buttonOriginalText; // 恢復原始文字
                });
            } 
            // *** 注意：成功時不需要手動恢復按鈕，因為 onSnapshot 更新會重新渲染 ***
        });
    });
}

// 綁定挑戰按鈕的事件處理
function bindChallengeButtonEvents() {
    // ... (移除舊監聽器的代碼不變) ...
    document.querySelectorAll('.start-challenge-btn').forEach(button => {
         button.replaceWith(button.cloneNode(true));
    });

    // 重新選取新的按鈕並綁定事件
    document.querySelectorAll('.start-challenge-btn').forEach(button => {
        button.addEventListener('click', async function(event) {
            event.preventDefault();
            
            const taskId = this.getAttribute('data-task-id');
            const originalText = '發起挑戰'; // 按鈕原始文字
            
            if (!taskId) return;
            
            const allChallengeButtons = document.querySelectorAll('.start-challenge-btn');

            // 確認對話框
            if (!confirm('確定要發起此項挑戰嗎？發起後將進入冷卻期，一段時間內無法再次發起挑戰。')) {
                return; // 用戶取消
            }

            // *** 優化：顯示載入狀態 ***
            allChallengeButtons.forEach(btn => {
                btn.disabled = true;
                btn.classList.add('disabled', 'loading');
                btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 處理中...`; 
            });
            
            try {
                await startChallenge(taskId);
                
                // 重新載入相關數據 (冷卻狀態和任務列表)
                await loadChallengeTasks();
                await checkUserChallengeStatus(); 
                
                showMessage('挑戰已成功發起！', 'success', 3000);
                // 挑戰投票列表會由 onSnapshot 更新
            } catch (error) {
                console.error('發起挑戰失敗:', error);
                showMessage('發起挑戰失敗: ' + error.message, 'error');
                
                // *** 優化：錯誤時恢復按鈕狀態 ***
                allChallengeButtons.forEach(btn => {
                    btn.disabled = false;
                    btn.classList.remove('disabled', 'loading');
                    btn.innerHTML = originalText; // 恢復原始文字
                });
            } 
            // *** 注意：成功後按鈕狀態會在 loadChallengeTasks 重新渲染時更新 ***
            // 但如果 loadChallengeTasks 很快完成，用戶可能看不到載入狀態，
            // 可以考慮在 loadChallengeTasks 完成後再恢復按鈕，或者讓重新渲染處理。
            // 目前的邏輯是依賴 loadChallengeTasks 重新渲染來更新按鈕。
        });
    });
}

// ... (其他函數不變) ...