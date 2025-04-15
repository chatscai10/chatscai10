/**
 * 設置庫存盤點按鈕
 */
function setupInventoryButton() {
    // 檢查是否已經存在按鈕
    if (document.getElementById('inventory-check-button')) {
        return;
    }
    
    // 創建按鈕容器，置於頁面底部
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'inventory-button-container';
    buttonContainer.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 100;';
    
    // 創建按鈕
    const inventoryButton = document.createElement('button');
    inventoryButton.id = 'inventory-check-button';
    inventoryButton.className = 'btn btn-primary btn-lg';
    inventoryButton.innerHTML = '<i class="fas fa-clipboard-list"></i> 月底庫存盤點';
    inventoryButton.onclick = openInventoryModal;
    
    // 添加到容器和頁面
    buttonContainer.appendChild(inventoryButton);
    document.body.appendChild(buttonContainer);
    
    console.log('庫存盤點按鈕已設置完成');
}

/**
 * 檢查並提醒盤點
 */
function checkAndNotifyInventory() {
    // 檢查是否需要提醒
    if (!isMonthEndPeriod || pendingStores.length === 0) {
        return;
    }
    
    // 檢查當前使用者的分店是否在待盤點列表中
    const userStore = inventoryCurrentUser?.store;
    if (userStore && pendingStores.includes(userStore)) {
        // 顯示一個通知提示，而不是自動打開盤點彈窗
        showInventoryNotification();
    }
}

/**
 * 顯示庫存盤點通知
 */
function showInventoryNotification() {
    // 檢查是否已顯示通知
    if (document.getElementById('inventory-notification')) {
        return;
    }
    
    // 創建通知元素
    const notification = document.createElement('div');
    notification.id = 'inventory-notification';
    notification.className = 'inventory-notification';
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.1); z-index: 1000;';
    
    // 設置通知內容
    notification.innerHTML = `
        <p><strong>提醒：</strong> 請完成本月的庫存盤點。</p>
        <button id="go-inventory-btn" class="btn btn-danger btn-sm">立即盤點</button>
        <button id="close-notification-btn" class="btn btn-secondary btn-sm" style="margin-left: 5px;">稍後提醒</button>
    `;
    
    // 添加到頁面
    document.body.appendChild(notification);
    
    // 綁定事件
    document.getElementById('go-inventory-btn').addEventListener('click', function() {
        openInventoryModal();
        notification.remove();
    });
    
    document.getElementById('close-notification-btn').addEventListener('click', function() {
        notification.remove();
    });
    
    // 5秒後自動關閉
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
} 