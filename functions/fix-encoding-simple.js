const fs = require('fs');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

const SOURCE_FILE = './index.js';
const TARGET_FILE = './index-fixed.js';
const BACKUP_FILE = './index.js.bak-' + new Date().toISOString().slice(0, 10).replace(/-/g, '');

// Simplified encoding fix function
async function fixEncoding() {
  try {
    console.log('========== Simple File Encoding Fix Tool ==========');
    console.log(`Source file: ${SOURCE_FILE}`);
    console.log(`Target file: ${TARGET_FILE}`);
    
    // Backup original file
    console.log(`Backing up original file to: ${BACKUP_FILE}`);
    fs.copyFileSync(SOURCE_FILE, BACKUP_FILE);
    
    // Read file and detect encoding
    const fileBuffer = fs.readFileSync(SOURCE_FILE);
    const detectedEncoding = jschardet.detect(fileBuffer);
    console.log(`Detected encoding: ${detectedEncoding.encoding} (confidence: ${Math.round(detectedEncoding.confidence * 100)}%)`);
    
    // Convert to UTF-8
    let content = iconv.decode(fileBuffer, detectedEncoding.encoding);
    
    // Fix common issues
    content = fixCommonIssues(content);
    
    // Save result
    console.log(`Saving fixed file: ${TARGET_FILE}`);
    fs.writeFileSync(TARGET_FILE, content, 'utf8');
    
    console.log('========== Fix Complete ==========');
    console.log(`Original file size: ${fileBuffer.length} bytes`);
    console.log(`Fixed file size: ${Buffer.from(content, 'utf8').length} bytes`);
    
    return { success: true, message: 'File fixed successfully' };
  } catch (err) {
    console.error('Error during fix process:', err);
    return { success: false, error: err.message };
  }
}

// Fix common encoding issues
function fixCommonIssues(content) {
  // Fix unclosed string literals
  content = content.replace(/([^\\])"([^"]*)\n/g, "$1\"$2\"\n");
  content = content.replace(/([^\\])'([^']*)\n/g, "$1'$2'\n");
  
  // Fix missing commas
  content = content.replace(/(\w+):\s*(['"][^'"]*['"])\s*(\w+):/g, "$1: $2, $3:");
  
  // Fix try/catch/finally syntax
  content = content.replace(/}\s*try\s*{/g, "};\ntry {");
  
  // Fix missing parentheses
  content = content.replace(/\)\s*\n\s*{/g, ") {");
  
  // Fix broken exports statements
  content = content.replace(/exports\.([a-zA-Z0-9_]+)\s*=\s*([^;]*?)(?=exports\.|\n\s*\/\/|\n\s*\/\*|$)/g, 'exports.$1 = $2;\n');
  
  return content;
}

// Run the fix
fixEncoding().then(result => {
  if (result.success) {
    console.log('Successfully fixed encoding issues');
    
    // Replace the original file with the fixed version
    fs.copyFileSync(TARGET_FILE, SOURCE_FILE);
    console.log('Original file replaced with fixed version');
  } else {
    console.error('Failed to fix encoding issues:', result.error);
  }
}); 