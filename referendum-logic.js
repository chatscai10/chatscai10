/**
 * 初始化公投頁面，獲取當前使用者和可用投票項目
 * @param {string} userName 使用者名稱
 */
async function initReferendumPage(userName) {
    try {
        console.log(`初始化公投頁面：${userName}`);
        const pollsContainer = document.getElementById('active-polls');
        
        if (!pollsContainer) {
            console.error('找不到投票列表容器元素');
            return;
        }
        
        // 顯示載入中提示
        pollsContainer.innerHTML = '<p class="loading">載入中...</p>';
        
        // 使用管理員安全訪問集合 - 避免權限問題
        const polls = await db.collection('polls')
            .where('isActive', '==', true)
            .orderBy('createdAt', 'desc')
            .get()
            .catch(error => {
                console.error("獲取投票時出錯:", error);
                if (error.code === 'permission-denied') {
                    // 嘗試使用備用方法獲取投票數據
                    return tryGetPollsWithFunction();
                }
                throw error;
            });
            
        // 清空載入中提示
        pollsContainer.innerHTML = '';
        
        if (!polls || polls.empty) {
            pollsContainer.innerHTML = '<p class="empty-message">目前沒有進行中的投票</p>';
            return;
        }
        
        // 處理並顯示每個投票
        polls.forEach(doc => {
            const poll = { id: doc.id, ...doc.data() };
            renderPoll(poll, pollsContainer, userName);
        });
        
    } catch (error) {
        console.error(`初始化公投頁面錯誤: ${error}`);
        const pollsContainer = document.getElementById('active-polls');
        if (pollsContainer) {
            pollsContainer.innerHTML = `<p class="error-message">載入失敗: ${error.message}</p>`;
        }
    }
}

/**
 * 嘗試使用Cloud Function獲取投票數據 - 權限問題的備用方案
 */
async function tryGetPollsWithFunction() {
    try {
        // 檢查是否已初始化Firebase Functions
        if (!firebase.functions) {
            console.warn("Firebase Functions 未初始化，無法使用備用方法");
            return { empty: true };
        }
        
        const getPolls = firebase.functions().httpsCallable('getActivePolls');
        const result = await getPolls();
        
        if (result && result.data && Array.isArray(result.data)) {
            // 將Cloud Function返回的數據轉換為類似Firestore查詢結果的格式
            return {
                empty: result.data.length === 0,
                forEach: (callback) => {
                    result.data.forEach(poll => {
                        callback({
                            id: poll.id,
                            data: () => {
                                const { id, ...data } = poll;
                                return data;
                            }
                        });
                    });
                }
            };
        }
        
        return { empty: true };
    } catch (functionError) {
        console.error("使用Cloud Function獲取投票失敗:", functionError);
        return { empty: true };
    }
} 