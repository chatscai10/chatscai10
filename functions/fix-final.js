const fs = require('fs');

const SOURCE_FILE = './index.js';
const TARGET_FILE = './index.js.fixed-final';
const BACKUP_FILE = './index.js.bak-' + new Date().toISOString().slice(0, 10);

// Final comprehensive fix
async function fixFile() {
  try {
    console.log('========== Comprehensive File Fix Tool ==========');
    console.log(`Source: ${SOURCE_FILE}`);
    console.log(`Target: ${TARGET_FILE}`);
    
    // Back up original file
    fs.copyFileSync(SOURCE_FILE, BACKUP_FILE);
    console.log(`Backup created: ${BACKUP_FILE}`);
    
    // Read file in binary
    const content = fs.readFileSync(SOURCE_FILE, {encoding: null});
    
    // Convert to string, assuming UTF-8
    let textContent = content.toString('utf8');
    
    // Remove stray single quotes (a common issue in the file)
    textContent = textContent.replace(/^\s*'\s*$/gm, '');
    
    // Fix string literals
    textContent = textContent.replace(/([^\\])"([^"]*)\n/g, "$1\"$2\"\n");
    textContent = textContent.replace(/([^\\])'([^']*)\n/g, "$1'$2'\n");
    
    // Fix trailing quotes after statements
    textContent = textContent.replace(/;"$/gm, ";");
    textContent = textContent.replace(/}"$/gm, "}");
    textContent = textContent.replace(/\)"$/gm, ")");
    textContent = textContent.replace(/;'$/gm, ";");
    textContent = textContent.replace(/}'$/gm, "}");
    textContent = textContent.replace(/\)'$/gm, ")");
    textContent = textContent.replace(/require\([^)]+\);'$/gm, match => match.replace(/;'$/, ";"));
    textContent = textContent.replace(/require\([^)]+\)'$/gm, match => match.replace(/'$/, ""));
    textContent = textContent.replace(/'$/gm, "");  // Remove any trailing single quotes at end of lines
    
    // Fix specific patterns of trailing quotes
    textContent = textContent.replace(/\) {"/gm, ") {");
    textContent = textContent.replace(/\) \{"/gm, ") {");
    textContent = textContent.replace(/\{"/gm, "{");
    textContent = textContent.replace(/"$/gm, "");  // Remove any trailing double quotes at end of lines
    
    // Fix missing commas in object literals
    textContent = textContent.replace(/(\w+):\s*(['"][^'"]*['"])\s*(\w+):/g, "$1: $2, $3:");
    
    // Fix try/catch blocks
    textContent = textContent.replace(/}\s*try\s*{/g, "};\ntry {");
    
    // Fix function chaining issues
    textContent = textContent.replace(/\}(\s*)\)\.\}/g, "});\n}");
    
    // Write the fixed file
    fs.writeFileSync(TARGET_FILE, textContent, 'utf8');
    console.log(`Fixed file saved to: ${TARGET_FILE}`);
    
    // Create a test file for Node.js syntax checking
    const testFile = './index.test.js';
    fs.writeFileSync(testFile, textContent, 'utf8');
    console.log(`Test file created: ${testFile}`);
    
    return true;
  } catch (error) {
    console.error('Error fixing file:', error);
    return false;
  }
}

// Run the fix
fixFile().then(success => {
  if (success) {
    console.log('Fix completed successfully!');
    console.log('You can check the fixed file at:', TARGET_FILE);
    console.log('To run a syntax check: node --check index.test.js');
  } else {
    console.error('Fix failed!');
  }
}); 