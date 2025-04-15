// headers-fix.js - 嘗試提供HTTP頭部相關問題的前端修復
console.log("正在載入HTTP頭部優化腳本...");

(function() {
    // 添加適當的HTTP頭部元標籤
    function addHeaderMetaTags() {
        console.log("添加HTTP頭部相關的meta標籤...");
        
        // 移除任何現有的相關meta標籤
        document.querySelectorAll('meta[http-equiv="Expires"], meta[http-equiv="Pragma"], meta[http-equiv="Cache-Control"]')
            .forEach(tag => tag.remove());
        
        // 添加正確的Cache-Control meta標籤
        const cacheControl = document.createElement('meta');
        cacheControl.setAttribute('http-equiv', 'Cache-Control');
        cacheControl.setAttribute('content', 'public, max-age=2592000');
        document.head.appendChild(cacheControl);
        
        console.log("已添加Cache-Control meta標籤");
        
        // 針對favicon添加鏈接標籤確保正確的MIME類型
        if (!document.querySelector('link[rel="icon"]')) {
            const favicon = document.createElement('link');
            favicon.rel = 'icon';
            favicon.href = '/favicon.ico';
            favicon.type = 'image/x-icon';
            document.head.appendChild(favicon);
            console.log("已添加正確的favicon鏈接");
        }
    }
    
    // 預載入資源以優化效能
    function preloadResources() {
        const commonResources = [
            { type: 'script', path: 'js/firebase-config.js' },
            { type: 'script', path: 'js/init.js' },
            { type: 'script', path: 'js/main.js' },
            { type: 'style', path: 'css/styles.css' }
        ];
        
        commonResources.forEach(resource => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = `${resource.path}?v=${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
            link.as = resource.type === 'script' ? 'script' : 'style';
            document.head.appendChild(link);
        });
        
        console.log("已添加資源預載入標籤");
    }
    
    // 監控資源載入性能
    function monitorResourcePerformance() {
        // 僅在Performance API可用時執行
        if (window.performance && window.performance.getEntriesByType) {
            window.addEventListener('load', () => {
                setTimeout(() => {
                    const resources = window.performance.getEntriesByType('resource');
                    let slowResources = [];
                    
                    resources.forEach(resource => {
                        // 檢查載入時間超過2秒的資源
                        if (resource.duration > 2000) {
                            slowResources.push({
                                name: resource.name,
                                duration: resource.duration
                            });
                        }
                    });
                    
                    if (slowResources.length > 0) {
                        console.warn("檢測到慢載入資源:", slowResources);
                    }
                }, 1000);
            });
        }
    }
    
    // 為資源新增版本號
    function addVersionToResources() {
        const version = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        // 為所有CSS和JS鏈接添加版本號
        document.querySelectorAll('script[src], link[rel="stylesheet"]').forEach(element => {
            const url = element.src || element.href;
            if (url && !url.includes('?v=')) {
                const newUrl = `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
                if (element.src) {
                    element.src = newUrl;
                } else {
                    element.href = newUrl;
                }
            }
        });
        
        console.log("已為資源添加版本標記");
    }
    
    // 在DOM載入完成後執行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            addHeaderMetaTags();
            preloadResources();
            monitorResourcePerformance();
        });
        
        // 在window.onload後處理版本號（確保所有資源都已載入）
        window.addEventListener('load', function() {
            // 添加版本號僅處理下次載入
            // addVersionToResources();
        });
    } else {
        // DOM已經載入
        addHeaderMetaTags();
        preloadResources();
        monitorResourcePerformance();
    }
    
    console.log("HTTP頭部優化腳本已初始化");
})();

console.log("HTTP頭部優化腳本已載入"); 