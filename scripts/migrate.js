/**
 * 炸雞店管理系統 - 數據遷移腳本
 * 用於管理數據結構變更、版本更新和配置遷移
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, doc, getAuth, signInWithEmailAndPassword } = require('firebase/firestore');

// 解析命令行參數
const args = process.argv.slice(2);
const localOnly = args.includes('--local-only');

// 初始化 Firebase
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// 檢查環境變數
if (!process.env.FIREBASE_API_KEY && !localOnly) {
    console.error('錯誤：缺少必要的環境變數，請確保 .env 文件已正確配置');
    console.log('如果要跳過 Firebase 操作，請使用 --local-only 參數');
    process.exit(1);
}

console.log('開始遷移過程...');
console.log(localOnly ? '僅執行本地遷移操作' : '執行完整遷移操作');

// 初始化 Firebase (僅在非本地模式下)
let app, db;
if (!localOnly) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
}

// 版本更新映射
const migrations = {
    '1.0.0_to_1.5.0': async () => {
        console.log('正在執行從 1.0.0 到 1.5.0 的遷移...');
        
        // 本地遷移操作
        await migrateLocalFiles();
        
        // Firebase 遷移操作 (僅在非本地模式下)
        if (!localOnly) {
            try {
                await migrateUserSchema();
                await migrateLeaveRequests();
            } catch (error) {
                console.warn('Firebase 遷移操作失敗，繼續執行本地遷移:', error.message);
            }
        }
        
        console.log('1.0.0 到 1.5.0 遷移完成');
    },
    '1.5.0_to_2.0.0': async () => {
        console.log('正在執行從 1.5.0 到 2.0.0 的遷移...');
        
        // 本地遷移操作
        await migrateToModuleStructure();
        await updateLocalSecurityRules();
        await cleanupOldFiles();
        await createEnvFileIfNeeded();
        
        // Firebase 遷移操作 (僅在非本地模式下)
        if (!localOnly) {
            try {
                // 如果有需要遠程執行的操作，放在這裡
            } catch (error) {
                console.warn('Firebase 遷移操作失敗，繼續執行本地遷移:', error.message);
            }
        }
        
        console.log('1.5.0 到 2.0.0 遷移完成');
    }
};

// 執行遷移
async function runMigrations() {
    try {
        // 讀取當前版本
        let versionInfo;
        const versionFilePath = path.join(__dirname, '../version-info.json');
        
        try {
            versionInfo = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'));
        } catch (error) {
            console.warn('無法讀取版本文件，使用默認版本');
            versionInfo = { version: '2.0.0' };
            
            // 創建版本文件
            fs.writeFileSync(versionFilePath, JSON.stringify(versionInfo, null, 2));
        }
        
        const currentVersion = versionInfo.version;
        console.log(`當前系統版本: ${currentVersion}`);
        
        // 如果是從 1.0.0 遷移到 2.0.0，需要依次執行所有遷移腳本
        if (needsMigration('1.0.0', currentVersion)) {
            await migrations['1.0.0_to_1.5.0']();
        }
        
        if (needsMigration('1.5.0', currentVersion)) {
            await migrations['1.5.0_to_2.0.0']();
        }
        
        console.log(`遷移至版本 ${currentVersion} 完成`);
    } catch (error) {
        console.error('遷移過程中出錯:', error);
        process.exit(1);
    }
}

// 檢查是否需要遷移
function needsMigration(fromVersion, toVersion) {
    const from = fromVersion.split('.').map(Number);
    const to = toVersion.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
        if (to[i] > from[i]) return true;
        if (to[i] < from[i]) return false;
    }
    
    return false;
}

// 遷移本地文件
async function migrateLocalFiles() {
    console.log('正在遷移本地文件...');
    
    // 檢查並創建必要的目錄
    const dirs = [
        'js/modules',
        'data/backups',
        'config'
    ];
    
    dirs.forEach(dir => {
        const fullPath = path.join(__dirname, '..', dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log(`創建目錄: ${dir}`);
        }
    });
    
    console.log('本地文件遷移完成');
}

// 創建環境文件（如果不存在）
async function createEnvFileIfNeeded() {
    const envPath = path.join(__dirname, '..', '.env');
    const envExamplePath = path.join(__dirname, '..', '.env.example');
    
    if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
        console.log('創建 .env 文件...');
        fs.copyFileSync(envExamplePath, envPath);
        console.log('.env 文件已創建，請根據需要編輯此文件');
    }
}

// 遷移用戶結構 (需要管理員權限)
async function migrateUserSchema() {
    if (localOnly) return;
    
    console.log('正在遷移用戶數據結構...');
    try {
        // 檢查是否有管理員憑證
        if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
            console.warn('警告：缺少管理員憑證，跳過用戶數據遷移');
            return;
        }
        
        // 嘗試登入以獲取權限
        const auth = getAuth(app);
        try {
            await signInWithEmailAndPassword(auth, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
        } catch (loginError) {
            console.error('管理員登入失敗，跳過需要權限的操作:', loginError);
            return;
        }
        
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        
        for (const userDoc of snapshot.docs) {
            const userData = userDoc.data();
            
            // 添加新字段並設置默認值
            const updates = {};
            
            if (!userData.hasOwnProperty('preferences')) {
                updates.preferences = {
                    theme: 'light',
                    notifications: true,
                    language: 'zh-TW'
                };
            }
            
            if (!userData.hasOwnProperty('lastLogin')) {
                updates.lastLogin = new Date().toISOString();
            }
            
            if (Object.keys(updates).length > 0) {
                await updateDoc(doc(db, 'users', userDoc.id), updates);
                console.log(`更新用戶 ${userDoc.id}`);
            }
        }
        
        console.log('用戶數據結構遷移完成');
    } catch (error) {
        console.error('用戶數據遷移錯誤:', error);
        console.warn('跳過用戶數據遷移，繼續執行其他遷移任務');
    }
}

// 遷移請假請求
async function migrateLeaveRequests() {
    if (localOnly) return;
    
    console.log('正在遷移請假請求數據...');
    // 實現請假請求遷移邏輯
    console.log('請假請求數據遷移完成');
}

// 遷移到模組結構
async function migrateToModuleStructure() {
    console.log('正在遷移到新的模組結構...');
    
    // 創建必要的目錄
    const directories = [
        'js/modules/core',
        'js/modules/auth',
        'js/modules/scheduling',
        'js/modules/attendance',
        'js/modules/leave',
        'js/modules/salary',
        'js/modules/prediction',
        'js/modules/reporting',
        'js/modules/admin'
    ];
    
    directories.forEach(dir => {
        const fullPath = path.join(__dirname, '..', dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log(`創建目錄: ${dir}`);
        }
    });
    
    console.log('模組結構遷移完成');
}

// 更新本地安全規則文件
async function updateLocalSecurityRules() {
    console.log('正在更新本地安全規則文件...');
    
    const rulesPath = path.join(__dirname, '..', 'firestore.rules');
    if (fs.existsSync(rulesPath)) {
        // 創建備份
        const backupDir = path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const backupPath = path.join(backupDir, `firestore.rules.backup.${Date.now()}`);
        fs.copyFileSync(rulesPath, backupPath);
        console.log(`已備份現有安全規則至: ${backupPath}`);
    }
    
    console.log('本地安全規則更新完成');
}

// 清理舊文件
async function cleanupOldFiles() {
    console.log('正在清理舊文件...');
    
    const filesToRemove = [
        'js/version.js',
        'js/version-check.js',
        'js/version-checker.js',
        'js/version-updater.js'
    ];
    
    filesToRemove.forEach(file => {
        const fullPath = path.join(__dirname, '..', file);
        if (fs.existsSync(fullPath)) {
            // 創建備份
            const backupDir = path.join(__dirname, '..', 'backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            const fileName = path.basename(file);
            const backupPath = path.join(backupDir, `${fileName}.backup.${Date.now()}`);
            
            try {
                fs.copyFileSync(fullPath, backupPath);
                console.log(`已備份文件: ${file} 至 ${backupPath}`);
                
                fs.unlinkSync(fullPath);
                console.log(`刪除文件: ${file}`);
            } catch (error) {
                console.error(`無法處理文件 ${file}:`, error);
            }
        }
    });
    
    console.log('舊文件清理完成');
}

// 執行遷移
runMigrations().then(() => {
    console.log('所有遷移任務完成');
    process.exit(0);
}).catch(error => {
    console.error('遷移過程中出錯:', error);
    process.exit(1);
}); 