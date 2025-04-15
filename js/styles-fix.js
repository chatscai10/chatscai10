// styles-fix.js - 動態創建CSS樣式表以替換內聯樣式
console.log("正在載入樣式修復腳本...");

(function() {
    // 創建和附加樣式表
    function createAndAppendStylesheet() {
        console.log("創建外部樣式表以替換內聯樣式");
        
        // 創建樣式元素
        const styleElement = document.createElement('style');
        styleElement.type = 'text/css';
        styleElement.id = 'dynamic-styles';
        
        // 添加所有公共樣式
        const css = `
            /* 管理頁面訊息樣式 */
            .admin-message {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 10px 20px;
                border-radius: 5px;
                background-color: #f8d7da;
                color: #721c24;
                z-index: 1000;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                display: none;
            }
            
            .admin-message.visible {
                display: block;
            }
            
            /* 圖例容器樣式 */
            .store-legend-container {
                display: flex;
                flex-wrap: wrap;
                margin-bottom: 15px;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 5px;
            }
            
            .legend-title {
                width: 100%;
                margin-bottom: 8px;
                font-weight: bold;
            }
            
            .legend-item {
                display: flex;
                align-items: center;
                margin-right: 15px;
                margin-bottom: 5px;
            }
            
            .legend-color {
                width: 15px;
                height: 15px;
                margin-right: 5px;
                border-radius: 3px;
            }
            
            /* 跨瀏覽器滾動條樣式 */
            * {
                scrollbar-width: thin;
            }
            
            *::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }
            
            *::-webkit-scrollbar-thumb {
                background: rgba(0, 0, 0, 0.2);
                border-radius: 4px;
            }
            
            /* 公告樣式 */
            .announcement {
                padding: 15px;
                margin-bottom: 15px;
                border-radius: 5px;
                background-color: #f8f9fa;
                border-left: 4px solid #4a89dc;
            }
            
            /* 優化動畫效能 */
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            
            /* 通用載入指示器 */
            .loading-indicator {
                text-align: center;
                padding: 20px;
                color: #666;
            }
            
            .loading-spinner {
                display: inline-block;
                width: 30px;
                height: 30px;
                border: 3px solid rgba(0, 0, 0, 0.1);
                border-radius: 50%;
                border-top-color: #4a89dc;
                animation: spin 1s ease-in-out infinite;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        
        // 設置樣式內容
        if (styleElement.styleSheet) {
            // IE舊版本
            styleElement.styleSheet.cssText = css;
        } else {
            // 現代瀏覽器
            styleElement.appendChild(document.createTextNode(css));
        }
        
        // 添加到頁面頭部
        document.head.appendChild(styleElement);
        console.log("外部樣式表已創建並添加到頁面");
    }
    
    // 移除內聯樣式
    function removeInlineStyles() {
        // 這部分可以根據需要擴展，移除已經存在的內聯樣式
        // 以下是一些示例
        
        console.log("開始移除內聯樣式...");
        
        // 尋找有內聯樣式的元素
        const elementsWithInlineStyles = [
            document.getElementById('admin-message'),
            document.getElementById('storeLegendContainer'),
            ...Array.from(document.querySelectorAll('.legend-item')),
            ...Array.from(document.querySelectorAll('.legend-color'))
        ].filter(Boolean); // 過濾掉null/undefined值
        
        if (elementsWithInlineStyles.length > 0) {
            elementsWithInlineStyles.forEach(element => {
                console.log(`移除元素 ${element.id || element.className} 的內聯樣式`);
                element.removeAttribute('style');
            });
            
            console.log(`已移除 ${elementsWithInlineStyles.length} 個元素的內聯樣式`);
        } else {
            console.log("找不到需要移除內聯樣式的元素");
        }
    }
    
    // 等待DOM完全載入
    document.addEventListener('DOMContentLoaded', function() {
        console.log("DOM已載入，開始應用樣式修復...");
        createAndAppendStylesheet();
        
        // 延遲一段時間再移除內聯樣式，確保所有元素都已創建
        setTimeout(removeInlineStyles, 1000);
    });
    
    console.log("樣式修復腳本已完成初始化");
})();

console.log("樣式修復腳本已載入"); 