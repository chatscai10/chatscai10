// admin-fix.js - 修復admin.html中的問題
console.log("正在載入admin修復腳本...");

(function() {
    // 等待DOM完全載入
    document.addEventListener('DOMContentLoaded', function() {
        console.log("DOM已載入，開始應用admin修復...");
        fixAdminMessageElement();
        createMissingAdminSections();
    });

    // 修復admin-message元素缺失問題
    function fixAdminMessageElement() {
        if (!document.getElementById('admin-message')) {
            console.log("修復: 創建缺失的admin-message元素");
            const adminMessage = document.createElement('div');
            adminMessage.id = 'admin-message';
            adminMessage.className = 'admin-message hidden';
            
            // 添加樣式
            adminMessage.style.position = 'fixed';
            adminMessage.style.top = '20px';
            adminMessage.style.left = '50%';
            adminMessage.style.transform = 'translateX(-50%)';
            adminMessage.style.padding = '10px 20px';
            adminMessage.style.borderRadius = '5px';
            adminMessage.style.backgroundColor = '#f8d7da';
            adminMessage.style.color = '#721c24';
            adminMessage.style.zIndex = '1000';
            adminMessage.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            adminMessage.style.display = 'none';
            
            // 添加到body或admin-container
            const adminContainer = document.querySelector('.admin-container') || document.body;
            adminContainer.appendChild(adminMessage);
            
            console.log("admin-message元素已創建並添加到頁面");
        }
    }

    // 創建缺失的admin模組section
    function createMissingAdminSections() {
        const requiredSections = [
            'section-dashboard',
            'section-parameters',
            'section-employees',
            'section-salary',
            'section-schedule',
            'section-bonus',
            'section-leave',
            'section-announce',
            'section-analysis'
        ];
        
        const adminContent = document.querySelector('.admin-content');
        if (!adminContent) {
            console.error("無法找到.admin-content元素，無法創建缺失的section");
            return;
        }
        
        let sectionsCreated = 0;
        
        requiredSections.forEach(sectionId => {
            if (!document.getElementById(sectionId)) {
                console.log(`修復: 創建缺失的${sectionId}元素`);
                const section = document.createElement('div');
                section.id = sectionId;
                section.className = 'admin-section hidden';
                
                // 添加基本內容
                const title = document.createElement('h2');
                title.textContent = getSectionTitle(sectionId);
                section.appendChild(title);
                
                const content = document.createElement('div');
                content.className = 'section-content';
                content.innerHTML = `<p>載入${getSectionTitle(sectionId)}內容中...</p>`;
                section.appendChild(content);
                
                adminContent.appendChild(section);
                sectionsCreated++;
            }
        });
        
        if (sectionsCreated > 0) {
            console.log(`已創建${sectionsCreated}個缺失的section元素`);
        }
    }
    
    // 根據section ID獲取合適的標題
    function getSectionTitle(sectionId) {
        const titles = {
            'section-dashboard': '控制面板',
            'section-parameters': '系統參數',
            'section-employees': '員工管理',
            'section-salary': '薪資管理',
            'section-schedule': '排班管理',
            'section-bonus': '績效獎金',
            'section-leave': '請假管理',
            'section-announce': '公告管理',
            'section-analysis': '數據分析'
        };
        
        return titles[sectionId] || '未知區域';
    }
    
    // 擴展原始showSection函數以處理缺失的section
    const originalShowSection = window.showSection;
    if (typeof originalShowSection === 'function') {
        window.showSection = function(sectionId) {
            const section = document.getElementById(sectionId);
            if (!section) {
                console.log(`修復: section ${sectionId} 不存在，嘗試創建`);
                createMissingAdminSections();
            }
            
            // 調用原始函數
            return originalShowSection.apply(this, arguments);
        };
        console.log("已增強showSection函數以處理缺失的區域");
    }

    console.log("admin修復腳本已完成初始化");
})();

console.log("admin修復腳本已載入"); 