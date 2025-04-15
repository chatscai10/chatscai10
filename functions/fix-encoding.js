// fix-encoding.js - 用於修復index.js中的編碼問題
const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

// 定義源文件和目標文件
const sourceFile = path.join(__dirname, 'index.js.error');
const targetFile = path.join(__dirname, 'index.js.fixed');

// 讀取源文件
console.log(`讀取文件: ${sourceFile}`);
const fileBuffer = fs.readFileSync(sourceFile);

// 嘗試不同的編碼轉換
const encodings = ['big5', 'gb2312', 'utf8', 'utf16le'];
let bestContent = '';
let bestEncoding = '';

// 查找最佳編碼
for(const encoding of encodings) {
    try {
        // 從原始編碼轉換到utf8
        const decodedContent = iconv.decode(fileBuffer, encoding);
        // 計算有效字符比例
        const validRatio = countValidChars(decodedContent) / decodedContent.length;
        
        console.log(`嘗試編碼 ${encoding}: 有效字符比例 ${(validRatio * 100).toFixed(2)}%`);
        
        if(validRatio > 0.9) { // 如果90%以上的字符是有效的，就認為這是最佳編碼
            bestContent = decodedContent;
            bestEncoding = encoding;
            break;
        }
    } catch(err) {
        console.error(`嘗試編碼 ${encoding} 失敗:`, err.message);
    }
}

// 如果沒有找到理想的編碼，嘗試系統默認編碼
if(!bestContent) {
    console.log('未找到理想編碼，嘗試使用系統默認編碼...');
    bestContent = fileBuffer.toString();
    bestEncoding = 'system default';
}

// 修復常見的編碼錯誤
console.log('修復常見編碼問題...');
const fixedContent = fixCommonEncodingIssues(bestContent);

// 保存為UTF-8格式
console.log(`將文件保存為UTF-8格式: ${targetFile}`);
fs.writeFileSync(targetFile, fixedContent, 'utf8');

console.log(`完成! 從 ${bestEncoding} 轉換到 UTF-8`);
console.log(`原始文件大小: ${fileBuffer.length} 字節`);
console.log(`修復後文件大小: ${Buffer.from(fixedContent, 'utf8').length} 字節`);

// 輔助函數：計算有效字符比例
function countValidChars(text) {
    // 排除控制字符和奇怪的符號
    const validChars = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g, '');
    return validChars.length;
}

// 輔助函數：修復常見的編碼問題
function fixCommonEncodingIssues(content) {
    let fixed = content;
    
    // 修復未閉合的字符串
    fixed = fixed.replace(/('未知;)/g, "'未知';");
    fixed = fixed.replace(/('已批准 :)/g, "'已批准' :");
    
    // 修復其他常見語法問題
    fixed = fixed.replace(/\}\s*\}\s*\/\* 結束.*?\*\//g, '}\n}'); // 清理多餘的注釋
    
    // 確保所有中文註釋使用正確的引號
    fixed = fixed.replace(/「/g, '"');
    fixed = fixed.replace(/」/g, '"');
    
    return fixed;
} 