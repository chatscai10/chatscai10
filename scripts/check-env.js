/**
 * 炸雞店管理系統 - 環境配置檢查腳本
 * 在 npm install 後自動運行，檢查並創建必要的環境配置文件
 */

const fs = require('fs');
const path = require('path');

console.log('檢查環境配置...');

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

// 檢查是否存在 .env 文件
if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
        try {
            // 複製 .env.example 到 .env
            fs.copyFileSync(envExamplePath, envPath);
            console.log('已創建 .env 文件。請根據需要編輯此文件。');
        } catch (error) {
            console.error('創建 .env 文件失敗:', error.message);
        }
    } else {
        console.warn('找不到 .env.example 文件。請手動創建 .env 文件。');
    }
} else {
    console.log('.env 文件已存在。');
}

// 檢查必要的目錄結構
const requiredDirs = [
    'js/modules',
    'js/modules/core',
    'js/modules/auth',
    'backups',
    'data'
];

requiredDirs.forEach(dir => {
    const dirPath = path.join(rootDir, dir);
    if (!fs.existsSync(dirPath)) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`已創建目錄: ${dir}`);
        } catch (error) {
            console.error(`創建目錄 ${dir} 失敗:`, error.message);
        }
    }
});

// 檢查版本信息文件
const versionInfoPath = path.join(rootDir, 'version-info.json');
if (!fs.existsSync(versionInfoPath)) {
    try {
        const versionInfo = {
            version: '2.0.0',
            releaseDate: new Date().toISOString().split('T')[0],
            updateInfo: {
                title: '初始化版本',
                description: '系統初始安裝',
                changes: ['初始化系統配置']
            },
            modules: {
                core: '2.0.0',
                auth: '1.3.2'
            },
            compatibility: {
                minVersion: '1.0.0',
                recommendedVersion: '2.0.0'
            }
        };
        
        fs.writeFileSync(versionInfoPath, JSON.stringify(versionInfo, null, 2));
        console.log('已創建版本信息文件');
    } catch (error) {
        console.error('創建版本信息文件失敗:', error.message);
    }
}

console.log('環境配置檢查完成');
console.log('如需進一步配置系統，請編輯 .env 文件並運行 npm run migrate'); 