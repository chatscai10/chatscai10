/**
 * 系統活動日誌測試工具
 * System Activity Logs Testing Utility
 * 
 * 此檔案用於測試系統活動日誌的寫入和查詢功能
 * This file is used to test the writing and querying of system activity logs
 */

// Firebase 初始化已經在 common.js 中完成
// Firebase initialization is already done in common.js

// Initialize Firebase (using the provided config in common.js or directly)
let db, auth, functions;
let testLogsCollection = 'system_logs_test';
let realLogsCollection = 'system_logs';
let currentUser = null;

document.addEventListener('DOMContentLoaded', function() {
    // Check if Firebase is already initialized
    if (firebase.apps.length === 0) {
        // If not initialized, use the config from common.js if available, or initialize directly
        if (typeof firebaseConfig !== 'undefined') {
            firebase.initializeApp(firebaseConfig);
        } else {
            console.error('Firebase config not found. Please ensure common.js is loaded correctly.');
            showStatus('Firebase initialization failed. Please check the console for details.', 'error');
            return;
        }
    }

    // Initialize Firebase services
    db = firebase.firestore();
    auth = firebase.auth();
    functions = firebase.functions();

    // Auth state change listener
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            console.log('User logged in:', user.email);
            
            // Check if user is an admin (you might need to adjust this based on your auth system)
            checkAdminAccess(user.uid);
            
            // Load system logs
            loadSystemLogs();
            
            // Setup event listeners
            setupEventListeners();
        } else {
            console.log('No user logged in, redirecting to login');
            window.location.href = 'login.html';
        }
    });
});

// Check if the user has admin access
function checkAdminAccess(uid) {
    db.collection('users').doc(uid).get()
        .then(doc => {
            if (doc.exists && doc.data().role === 'admin') {
                console.log('Admin access verified');
                showStatus('管理員權限已驗證，可以使用日誌功能。', 'success');
            } else {
                console.warn('Non-admin user attempting to access logs');
                showStatus('此頁面需要管理員權限才能訪問。', 'warning');
                // Optionally redirect non-admin users
                // setTimeout(() => { window.location.href = 'index.html'; }, 3000);
            }
        })
        .catch(error => {
            console.error('Error checking admin status:', error);
            showStatus('驗證管理員權限時出錯。', 'error');
        });
}

// Setup event listeners for the form buttons
function setupEventListeners() {
    const generateBtn = document.getElementById('generateTestLog');
    const clearBtn = document.getElementById('clearTestLogs');
    const refreshBtn = document.getElementById('refreshLogs');
    
    if (generateBtn) {
        generateBtn.addEventListener('click', generateTestLog);
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', clearTestLogs);
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadSystemLogs);
    }
}

// Generate a test log entry
async function generateTestLog() {
    // Get form values
    const feature = document.getElementById('logFeature').value;
    const action = document.getElementById('logAction').value;
    const details = document.getElementById('logDetails').value;
    
    // Validate
    if (!feature || !action) {
        showStatus('請選擇功能模組和操作類型。', 'warning');
        return;
    }
    
    // Prepare log data
    const logData = {
        feature: feature,
        action: action,
        details: details || `測試日誌 - ${new Date().toLocaleString()}`,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userId: currentUser.uid,
        userEmail: currentUser.email,
        isTestLog: true
    };
    
    try {
        // Add document to test logs collection
        await db.collection(testLogsCollection).add(logData);
        console.log('Test log generated successfully');
        showStatus('測試日誌已成功生成。', 'success');
        
        // Reload logs to show the new entry
        loadSystemLogs();
        
        // Reset form
        document.getElementById('logDetails').value = '';
    } catch (error) {
        console.error('Error generating test log:', error);
        showStatus('生成測試日誌時出錯: ' + error.message, 'error');
    }
}

// Clear all test logs
async function clearTestLogs() {
    if (!confirm('確定要清除所有測試日誌嗎？此操作無法撤銷。')) {
        return;
    }
    
    // Note: This is a simplistic approach for a small number of documents
    // For production, you would use a Cloud Function to batch delete
    try {
        const snapshot = await db.collection(testLogsCollection)
            .where('isTestLog', '==', true)
            .get();
        
        if (snapshot.empty) {
            showStatus('沒有找到測試日誌。', 'info');
            return;
        }
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log(`${snapshot.size} test logs deleted`);
        showStatus(`已成功清除 ${snapshot.size} 條測試日誌。`, 'success');
        
        // Reload logs to reflect changes
        loadSystemLogs();
    } catch (error) {
        console.error('Error clearing test logs:', error);
        showStatus('清除測試日誌時出錯: ' + error.message, 'error');
    }
}

// Load system logs (both real and test)
async function loadSystemLogs() {
    const logsContainer = document.getElementById('systemLogsContainer');
    
    if (!logsContainer) {
        console.error('Logs container not found');
        return;
    }
    
    // Show loading indicator
    logsContainer.innerHTML = `
        <div class="text-center my-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p>載入日誌內容...</p>
        </div>
    `;
    
    try {
        // Query both test logs and real logs
        const [testLogsSnapshot, realLogsSnapshot] = await Promise.all([
            db.collection(testLogsCollection)
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get(),
            db.collection(realLogsCollection)
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get()
        ]);
        
        // Combine logs from both collections
        const allLogs = [];
        
        testLogsSnapshot.forEach(doc => {
            const data = doc.data();
            allLogs.push({
                id: doc.id,
                ...data,
                source: 'test'
            });
        });
        
        realLogsSnapshot.forEach(doc => {
            const data = doc.data();
            allLogs.push({
                id: doc.id,
                ...data,
                source: 'real'
            });
        });
        
        // Sort combined logs by timestamp (most recent first)
        allLogs.sort((a, b) => {
            const timestampA = a.timestamp?.toDate?.() || new Date(0);
            const timestampB = b.timestamp?.toDate?.() || new Date(0);
            return timestampB - timestampA;
        });
        
        // Handle empty state
        if (allLogs.length === 0) {
            logsContainer.innerHTML = `
                <div class="alert alert-info">
                    <i class="bi bi-info-circle"></i> 目前還沒有系統日誌記錄。
                </div>
            `;
            return;
        }
        
        // Render logs
        let logsHTML = '';
        
        allLogs.forEach(log => {
            const timestamp = log.timestamp?.toDate?.() 
                ? log.timestamp.toDate().toLocaleString('zh-TW')
                : '未知時間';
            
            const sourceClass = log.source === 'test' ? 'text-warning' : 'text-info';
            const sourceLabel = log.source === 'test' ? '測試' : '系統';
            
            let actionClass;
            switch (log.action) {
                case 'create': actionClass = 'bg-success'; break;
                case 'update': actionClass = 'bg-primary'; break;
                case 'delete': actionClass = 'bg-danger'; break;
                case 'error': actionClass = 'bg-danger'; break;
                default: actionClass = 'bg-secondary';
            }
            
            logsHTML += `
                <div class="card mb-3 border-light">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <span class="badge ${actionClass}">${log.action || 'unknown'}</span>
                                <span class="badge bg-dark feature-badge">${log.feature || 'unknown'}</span>
                                <span class="badge ${sourceClass}">${sourceLabel}</span>
                            </div>
                            <small class="text-muted">${timestamp}</small>
                        </div>
                        <p class="card-text">${log.details || '無詳細信息'}</p>
                        <small class="text-muted">
                            用戶: ${log.userEmail || log.userId || '未知用戶'}
                        </small>
                    </div>
                </div>
            `;
        });
        
        logsContainer.innerHTML = logsHTML;
        
    } catch (error) {
        console.error('Error loading system logs:', error);
        logsContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> 載入日誌時出錯: ${error.message}
            </div>
        `;
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const statusContainer = document.getElementById('statusContainer');
    if (!statusContainer) return;
    
    const alertClass = type === 'error' ? 'alert-danger' : 
                       type === 'success' ? 'alert-success' : 
                       type === 'warning' ? 'alert-warning' : 'alert-info';
    
    statusContainer.innerHTML = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
    
    // Auto-hide after 5 seconds unless it's an error
    if (type !== 'error') {
        setTimeout(() => {
            const alert = statusContainer.querySelector('.alert');
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 5000);
    }
}

console.log("system-logs-test.js loaded"); 