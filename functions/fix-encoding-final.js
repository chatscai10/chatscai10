// fix-encoding-final.js - 最終版本的編碼修復腳本
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

// 檔案路徑
const SOURCE_FILE = path.join(__dirname, 'index.js.error');
const TARGET_FILE = path.join(__dirname, 'index.js.final');
const BACKUP_FILE = path.join(__dirname, 'index.js.bak-' + new Date().toISOString().replace(/:/g, '-'));

// 中文字符的常見組合
const CHINESE_PHRASES = [
  '用戶', '管理員', '設置', '通知', '發送', '排班', '打卡', '薪資', '請假',
  '員工', '門店', '系統', '功能', '編輯', '刪除', '添加', '查詢', '更新',
  '錯誤', '成功', '警告', '信息', '確認', '取消', '返回', '提交', '保存',
  '未知', '已知', '已批准', '已拒絕', '待審核', '審核通過', '審核未通過'
];

// 已知的特定錯誤模式和修複方式
const KNOWN_ERRORS = [
  { pattern: /('未知;)/g, replace: "'未知';" },
  { pattern: /('已批准 :)/g, replace: "'已批准' :" },
  { pattern: /送個人?知給相?員?/g, replace: '送個人通知給相關員工' },
  { pattern: /送全局?知 \(?能給??管?員\)/g, replace: '送全局通知 (可能給所有管理員)' },
  { pattern: /檢查?否?班/g, replace: '檢查是否上班' },
  { pattern: /中缺少LINE/g, replace: '中缺少LINE' },
  { pattern: /}\)\.\s*}/gm, replace: '});\n}' }, // 修复JS语法错误
  { pattern: /console\.log\([^)]*?查看[^)]*?\);/g, replace: '// console.log("已註釋以避免日誌過多");' },
  { pattern: /\/\* 以下[^*]*\*\//g, replace: '/* 以下註釋已清理 */' }
];

// 主函數
async function fixEncoding() {
  try {
    console.log('========== 檔案編碼修復工具 (最終版) ==========');
    console.log(`源檔案: ${SOURCE_FILE}`);
    console.log(`目標檔案: ${TARGET_FILE}`);
    
    // 1. 備份原始檔案
    console.log(`備份原始檔案到: ${BACKUP_FILE}`);
    fs.copyFileSync(SOURCE_FILE, BACKUP_FILE);
    
    // 2. 讀取檔案並自動檢測編碼
    const fileBuffer = fs.readFileSync(SOURCE_FILE);
    const detectedEncoding = jschardet.detect(fileBuffer);
    console.log(`檢測到的編碼: ${detectedEncoding.encoding} (信心: ${Math.round(detectedEncoding.confidence * 100)}%)`);
    
    // 3. 嘗試不同的編碼轉換方式
    const testEncodings = ['big5', 'gb2312', 'utf8', 'utf16le', 'windows-1252', detectedEncoding.encoding];
    
    // 去除重複的編碼
    const uniqueEncodings = [...new Set(testEncodings)];
    
    // 比較不同編碼的結果
    const results = [];
    
    for (const encoding of uniqueEncodings) {
      try {
        const content = iconv.decode(fileBuffer, encoding);
        const score = evaluateChineseText(content);
        results.push({ encoding, score, content });
        console.log(`${encoding} 編碼的中文識別分數: ${score.toFixed(2)}%`);
      } catch (err) {
        console.error(`嘗試 ${encoding} 編碼失敗:`, err.message);
      }
    }
    
    // 4. 選擇最佳編碼
    results.sort((a, b) => b.score - a.score);
    const bestResult = results[0];
    console.log(`選擇最佳編碼: ${bestResult.encoding} (分數: ${bestResult.score.toFixed(2)}%)`);
    
    // 5. 修復常見問題
    console.log('開始修復常見問題...');
    let content = bestResult.content;
    
    // 應用所有已知的錯誤修復模式
    for (const { pattern, replace } of KNOWN_ERRORS) {
      try {
        const originalLength = content.length;
        content = content.replace(pattern, replace);
        const newLength = content.length;
        
        if (originalLength !== newLength) {
          console.log(`- 修復模式 "${pattern}" 生效, 修改了 ${Math.abs(originalLength - newLength)} 個字符`);
        }
      } catch (err) {
        console.error(`應用模式 "${pattern}" 時出錯:`, err.message);
      }
    }
    
    // 6. 修復語法問題
    console.log('修復JavaScript語法問題...');
    content = fixJsSyntax(content);
    
    // 7. 強化中文顯示
    console.log('強化中文字符顯示...');
    content = enhanceChineseText(content);
    
    // 8. 保存結果
    console.log(`保存修復後的檔案: ${TARGET_FILE}`);
    fs.writeFileSync(TARGET_FILE, content, 'utf8');
    
    // 9. 生成帶BOM的版本
    const bomFile = TARGET_FILE + '.bom';
    fs.writeFileSync(bomFile, '\uFEFF' + content, 'utf8');
    console.log(`生成帶BOM的UTF-8版本: ${bomFile}`);
    
    // 10. 總結
    console.log('========== 修復完成 ==========');
    console.log(`原始檔案大小: ${fileBuffer.length} 字節`);
    console.log(`修復後檔案大小: ${Buffer.from(content, 'utf8').length} 字節`);
    
    return { success: true, message: '檔案修復成功' };
  } catch (err) {
    console.error('修復過程中發生錯誤:', err);
    return { success: false, error: err.message };
  }
}

// 評估中文文本的質量
function evaluateChineseText(text) {
  let score = 0;
  
  // 檢查常見中文短語的出現次數
  for (const phrase of CHINESE_PHRASES) {
    const count = (text.match(new RegExp(phrase, 'g')) || []).length;
    score += count * 2; // 每個短語加2分
  }
  
  // 檢查特殊中文標點符號
  const chinesePunctuation = '，。、：；？！""''【】（）《》';
  for (const char of chinesePunctuation) {
    const count = (text.match(new RegExp(char, 'g')) || []).length;
    score += count;
  }
  
  // 檢查常見的JS關鍵字
  const jsKeywords = ['function', 'const', 'let', 'var', 'async', 'await', 'try', 'catch', 'return', 'if', 'else'];
  for (const keyword of jsKeywords) {
    const count = (text.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
    score += count * 0.5; // 每個關鍵字加0.5分
  }
  
  // 檢查問號字符(編碼問題的指標)
  const questionMarkCount = (text.match(/\?/g) || []).length;
  const replacementCharCount = (text.match(/\uFFFD/g) || []).length;
  score -= (questionMarkCount + replacementCharCount) * 0.5;
  
  // 確保分數在0-100之間
  score = Math.max(0, Math.min(100, score));
  
  return score;
}

// 修復JS語法問題
function fixJsSyntax(content) {
  let fixed = content;
  
  // 修復未閉合的字符串
  fixed = fixed.replace(/([^\\])'([^']*)\n/g, "$1'$2'\n"); // 修復單引號換行問題
  fixed = fixed.replace(/([^\\])"([^"]*)\n/g, "$1\"$2\"\n"); // 修復雙引號換行問題
  
  // 修復多餘的分號
  fixed = fixed.replace(/;(\s*);/g, ";$1");
  
  // 修復函數閉合問題
  let bracesBalance = 0;
  const lines = fixed.split('\n');
  const fixedLines = [];
  
  for (const line of lines) {
    const openCount = (line.match(/{/g) || []).length;
    const closeCount = (line.match(/}/g) || []).length;
    bracesBalance += openCount - closeCount;
    fixedLines.push(line);
  }
  
  // 新增缺失的閉合括號
  if (bracesBalance > 0) {
    console.log(`檢測到 ${bracesBalance} 個未閉合的括號，正在修復...`);
    for (let i = 0; i < bracesBalance; i++) {
      fixedLines.push('}');
    }
  }
  
  fixed = fixedLines.join('\n');
  
  // 修復註釋
  fixed = fixed.replace(/\/\*((?!\*\/).)*$/gs, '/* 註釋未正確關閉 */');
  
  // 修復 exports.xx 語法
  fixed = fixed.replace(/exports\.([a-zA-Z0-9_]+)\s*=\s*([^;]*?)(?=exports\.|\n\s*\/\/|\n\s*\/\*|$)/g, 'exports.$1 = $2;\n');
  
  return fixed;
}

// 強化中文文本
function enhanceChineseText(content) {
  let enhanced = content;
  
  // 修正常見中文亂碼
  const commonReplacements = {
    '?\\?': '？', // 中文問號
    '\\?\\!': '！', // 中文感嘆號
    '\\?\\：': '：', // 中文冒號
    '\\?\\,': '，', // 中文逗號
    '\\?\\.': '。', // 中文句號
    '鏈�鐭�': '未知', // 特定亂碼修正
    '?��?': '通知', // 特定亂碼修正
    '?��?': '系統', // 特定亂碼修正
    '?��?': '設置', // 特定亂碼修正
    '?��?': '工作', // 特定亂碼修正
    '?��?': '員工', // 特定亂碼修正
    '?��?': '管理', // 特定亂碼修正
    '?��?': '記錄' // 特定亂碼修正
  };
  
  for (const [pattern, replacement] of Object.entries(commonReplacements)) {
    try {
      enhanced = enhanced.replace(new RegExp(pattern, 'g'), replacement);
    } catch (err) {
      console.warn(`無法應用替換模式 ${pattern}:`, err.message);
    }
  }
  
  return enhanced;
}

// 執行主函數
fixEncoding().then(result => {
  if (result.success) {
    console.log('修復過程已成功完成。');
  } else {
    console.error('修復過程失敗:', result.error);
  }
}); 