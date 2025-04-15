// fix-encoding-advanced.js - 進階版編碼修復工具
const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

// 定義源文件和目標文件
const sourceFile = path.join(__dirname, 'index.js.error');
const targetFile = path.join(__dirname, 'index.js.utf8');

// 修復已知的編碼錯誤模式
const knownPatterns = [
  { pattern: /('未知;)/g, replace: "'未知';" },
  { pattern: /('已批准 :)/g, replace: "'已批准' :" },
  { pattern: /中缺�?LINE/g, replace: "中缺少LINE" },
  { pattern: /此用帳號已被停用，請聯繫管理員/g, replace: "此用戶帳號已被停用，請聯繫管理員" },
  { pattern: /送全局?知 \(?能給??管?員\)/g, replace: "送全局通知 (可能給所有管理員)" },
  { pattern: /檢查?否?班/g, replace: "檢查是否上班" },
  { pattern: /用戶資料查詢錯誤/g, replace: "用戶資料查詢錯誤" },
  { pattern: /buildModels\(\);.*?return models;/gs, replace: (match) => {
    return match.replace(/\/\* 以下註釋.*?\*\//g, '/* 以下註釋：移除多餘內容 */');
  }},
  // 更多模式可以在這裡添加
];

// 修復程序
async function fixEncoding() {
  try {
    console.log(`開始修復 ${sourceFile}`);
    
    // 1. 先讀取原始檔案
    const fileBuffer = fs.readFileSync(sourceFile);
    console.log(`原始檔案大小: ${fileBuffer.length} 字節`);
    
    // 2. 嘗試不同編碼
    const encodings = ['big5', 'gb2312', 'utf8', 'utf16le'];
    let bestContent = '';
    let bestEncoding = '';
    let bestScore = 0;
    
    for (const encoding of encodings) {
      try {
        console.log(`嘗試使用 ${encoding} 編碼...`);
        const content = iconv.decode(fileBuffer, encoding);
        
        // 計算簡單啟發式評分
        const score = evaluateContent(content);
        console.log(`使用 ${encoding} 編碼的評分: ${score.toFixed(2)}%`);
        
        if (score > bestScore) {
          bestScore = score;
          bestContent = content;
          bestEncoding = encoding;
        }
      } catch (err) {
        console.error(`使用 ${encoding} 編碼失敗:`, err.message);
      }
    }
    
    if (!bestContent) {
      console.log('無法找到合適的編碼，嘗試使用系統默認編碼');
      bestContent = fileBuffer.toString();
      bestEncoding = 'system-default';
    } else {
      console.log(`最佳編碼: ${bestEncoding} (評分: ${bestScore.toFixed(2)}%)`);
    }
    
    // 3. 應用修復模式
    console.log('應用修復模式...');
    let fixedContent = bestContent;
    
    for (const {pattern, replace} of knownPatterns) {
      const originalLength = fixedContent.length;
      fixedContent = fixedContent.replace(pattern, replace);
      const newLength = fixedContent.length;
      
      if (originalLength !== newLength) {
        console.log(`模式 ${pattern} 已修復 ${Math.abs(originalLength - newLength)} 個字符`);
      }
    }
    
    // 4. 專門修復常見JS語法問題
    console.log('修復JS語法問題...');
    fixedContent = fixJs(fixedContent);
    
    // 5. 以UTF-8編碼寫入新檔案
    console.log(`寫入修復後的檔案 ${targetFile}`);
    fs.writeFileSync(targetFile, fixedContent, 'utf8');
    
    // 6. 創建一個備份版本，使用BOM標記確保UTF-8識別
    const bomContent = '\uFEFF' + fixedContent;
    const bomFile = path.join(__dirname, 'index.js.utf8-bom');
    fs.writeFileSync(bomFile, bomContent, 'utf8');
    console.log(`創建帶BOM的UTF-8版本 ${bomFile}`);
    
    console.log('完成! 檔案已修復並轉換為UTF-8編碼');
    
  } catch (err) {
    console.error('修復過程中出錯:', err);
  }
}

// 評估內容質量的函數
function evaluateContent(content) {
  // 檢查常見的JavaScript關鍵詞出現頻率
  const jsKeywords = ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'try', 'catch', 'await', 'async'];
  const keywordCount = jsKeywords.reduce((count, keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    const matches = content.match(regex);
    return count + (matches ? matches.length : 0);
  }, 0);
  
  // 檢查有效的JS語法結構
  const bracesBalance = content.split('{').length - content.split('}').length;
  
  // 檢查無效字符比例
  const invalidChars = content.match(/[\uFFFD\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g) || [];
  const invalidRatio = invalidChars.length / content.length;
  
  // 計算綜合評分 (0-100)
  const keywordScore = Math.min(keywordCount / 100, 1) * 40; // 最高40分
  const bracesScore = (Math.abs(bracesBalance) < 5 ? 1 : 0.5) * 30; // 最高30分
  const charScore = (1 - invalidRatio) * 30; // 最高30分
  
  return keywordScore + bracesScore + charScore;
}

// 修復JavaScript語法的函數
function fixJs(content) {
  let fixed = content;
  
  // 修復未閉合的字符串
  fixed = fixed.replace(/([^\\])'([^']*)\n/g, "$1'$2'\n");
  
  // 修復缺少分號的地方
  fixed = fixed.replace(/}\n(\s*[a-zA-Z])/g, "};\n$1");
  
  // 修復未閉合的函數
  let bracesBalance = 0;
  const lines = fixed.split('\n');
  const fixedLines = [];
  
  for (const line of lines) {
    bracesBalance += (line.match(/{/g) || []).length;
    bracesBalance -= (line.match(/}/g) || []).length;
    fixedLines.push(line);
  }
  
  if (bracesBalance > 0) {
    console.log(`偵測到 ${bracesBalance} 個未閉合的大括號，嘗試修復...`);
    for (let i = 0; i < bracesBalance; i++) {
      fixedLines.push('}');
    }
  }
  
  fixed = fixedLines.join('\n');
  
  // 修復特定於這個專案的錯誤
  fixed = fixed.replace(/送個人?知給相?員?/g, '送個人通知給相關員工');
  
  return fixed;
}

// 執行修復
fixEncoding(); 