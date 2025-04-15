// leave-logic-fix.js - 修復leave-logic.js中的問題
// 版本: 2025-04-18

console.log("正在載入leave-logic修復腳本...");

(function() {
    // 這個修復需要在window.onload之前執行，以防止錯誤發生
    // 因為我們需要在原始腳本執行前攔截calendarContainer變量的定義
    
    // 檢查是否已加載頁面
    if (document.readyState === 'complete') {
        applyFix();
    } else {
        // 如果頁面尚未加載完成，在DOMContentLoaded時應用修復
        window.addEventListener('DOMContentLoaded', applyFix);
    }
    
    function applyFix() {
        console.log("正在應用leave-logic修復...");
        
        // 防止原始腳本中的變量重複宣告錯誤
        // 通過在全局範圍內定義這些變量，使原始腳本中的聲明變成賦值
        if (typeof window.calendarContainer === 'undefined') {
            console.log("預先定義calendarContainer變量以防止重複宣告");
            window.calendarContainer = null; // 預先定義，防止重複宣告錯誤
        }
        
        // 儲存原始的renderCalendar函數（如果存在）
        if (typeof window.renderCalendar === 'function') {
            console.log("找到原始renderCalendar函數，準備修復");
            
            // 保存原始函數
            const originalRenderCalendar = window.renderCalendar;
            
            // 覆蓋原始函數
            window.renderCalendar = function(calendarDOMContainer, events, options) {
                console.log("使用增強版renderCalendar函數");
                
                // 如果沒有提供容器參數，嘗試使用已知的容器
                if (!calendarDOMContainer) {
                    console.warn("renderCalendar: 未提供容器參數，嘗試使用默認容器");
                    calendarDOMContainer = document.getElementById('calendarContainer') || 
                                           document.querySelector('.calendar-container');
                    
                    // 如果仍然找不到容器，創建一個
                    if (!calendarDOMContainer) {
                        console.warn("renderCalendar: 找不到日曆容器，創建新容器");
                        
                        // 尋找一個合適的父容器
                        const parentContainer = document.querySelector('.leave-content') || 
                                                document.querySelector('.content-container') || 
                                                document.body;
                        
                        // 創建新的日曆容器
                        calendarDOMContainer = document.createElement('div');
                        calendarDOMContainer.id = 'calendarContainer';
                        calendarDOMContainer.className = 'calendar-container';
                        
                        // 添加到頁面
                        parentContainer.appendChild(calendarDOMContainer);
                        console.log("已創建新的日曆容器");
                    }
                }
                
                // 全局變量賦值（不使用let/const以避免重複宣告）
                window.calendarContainer = calendarDOMContainer;
                
                // 使用try-catch來捕獲和處理可能的錯誤
                try {
                    // 調用原始函數
                    return originalRenderCalendar.call(this, calendarDOMContainer, events, options);
                } catch (error) {
                    console.error("renderCalendar執行時出錯:", error);
                    
                    // 顯示錯誤訊息在容器中
                    if (calendarDOMContainer) {
                        calendarDOMContainer.innerHTML = `
                            <div class="error-message" style="color: #721c24; background-color: #f8d7da; padding: 10px; border-radius: 5px;">
                                <p>載入日曆時發生錯誤</p>
                                <p>詳細信息: ${error.message}</p>
                            </div>
                        `;
                    }
                    return null;
                }
            };
            
            console.log("renderCalendar函數已成功增強");
        } else {
            console.warn("未找到renderCalendar函數，無法應用完整修復");
            
            // 仍然預先定義變量以防止錯誤
            window.calendarContainer = window.calendarContainer || null;
        }
    }
})();

console.log("leave-logic修復腳本已載入"); 