console.log("正在載入schedule修復腳本...");

(function() {
    // 等待DOM完全載入
    document.addEventListener('DOMContentLoaded', function() {
        console.log("DOM已載入，開始應用schedule修復...");
        fixStoreLegendContainer();
    });

    // 修復store legend container缺失問題
    function fixStoreLegendContainer() {
        // 檢查原始函數是否存在
        if (typeof window.renderStoreLegend === 'function') {
            console.log("找到原始renderStoreLegend函數，準備修復");
            
            // 保存原始函數
            const originalRenderStoreLegend = window.renderStoreLegend;
            
            // 覆蓋原始函數
            window.renderStoreLegend = function(stores) {
                // 檢查傳入的stores
                if (!stores || stores.length === 0) {
                    console.warn("沒有店鋪數據可渲染圖例");
                    return;
                }
                
                // 尋找圖例容器
                let legendContainer = document.getElementById('storeLegendContainer');
                
                // 如果容器不存在，創建一個
                if (!legendContainer) {
                    console.log("修復: 創建缺失的storeLegendContainer元素");
                    
                    // 尋找適合添加圖例的位置
                    const scheduleContainer = document.querySelector('.schedule-container') || 
                                              document.querySelector('.main-content') || 
                                              document.body;
                    
                    // 創建圖例容器
                    legendContainer = document.createElement('div');
                    legendContainer.id = 'storeLegendContainer';
                    legendContainer.className = 'store-legend-container';
                    
                    // 添加樣式
                    legendContainer.style.display = 'flex';
                    legendContainer.style.flexWrap = 'wrap';
                    legendContainer.style.marginBottom = '15px';
                    legendContainer.style.padding = '10px';
                    legendContainer.style.border = '1px solid #ddd';
                    legendContainer.style.borderRadius = '5px';
                    
                    // 添加標題
                    const legendTitle = document.createElement('div');
                    legendTitle.className = 'legend-title';
                    legendTitle.style.width = '100%';
                    legendTitle.style.marginBottom = '8px';
                    legendTitle.style.fontWeight = 'bold';
                    legendTitle.textContent = '店鋪圖例:';
                    
                    legendContainer.appendChild(legendTitle);
                    
                    // 添加到頁面
                    scheduleContainer.insertBefore(legendContainer, scheduleContainer.firstChild);
                    
                    console.log("storeLegendContainer元素已創建並添加到頁面");
                }
                
                // 調用原始函數
                return originalRenderStoreLegend.call(this, stores);
            };
            
            console.log("renderStoreLegend函數已增強");
        } else {
            console.warn("未找到renderStoreLegend函數，無法應用修復");
        }
    }
    
    // 處理Firebase Functions SDK缺失問題
    // 這只是一個警告，不是錯誤，但我們可以提供一個空的實現
    if (!window.firebase || !window.firebase.functions) {
        console.log("提供Firebase Functions SDK的替代方案");
        // 如果firebase對象不存在，創建一個
        if (!window.firebase) {
            window.firebase = {};
        }
        
        // 如果functions不存在，創建一個空實現
        if (!window.firebase.functions) {
            window.firebase.functions = function() {
                return {
                    httpsCallable: function(name) {
                        return function() {
                            console.warn(`Firebase Functions SDK不可用: 嘗試調用${name}`);
                            return Promise.resolve({ data: null });
                        };
                    }
                };
            };
            console.log("已創建Firebase Functions的替代實現");
        }
    }

    console.log("schedule修復腳本已完成初始化");
})();

console.log("schedule修復腳本已載入"); 