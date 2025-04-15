const fs = require('fs');

const SOURCE_FILE = './index.js';
const TARGET_FILE = './index.js.fixed2';
const BACKUP_FILE = './index.js.bak2';

// Improved fix function
async function fixFile() {
  try {
    console.log('========== Improved File Fix Tool ==========');
    console.log(`Source: ${SOURCE_FILE}`);
    console.log(`Target: ${TARGET_FILE}`);
    
    // Backup original file
    fs.copyFileSync(SOURCE_FILE, BACKUP_FILE);
    console.log(`Backup created: ${BACKUP_FILE}`);
    
    // Read file
    const content = fs.readFileSync(SOURCE_FILE, { encoding: 'utf8' });
    
    // Fix common issues
    let fixed = content;
    
    // Remove trailing quotes that shouldn't be there
    fixed = fixed.replace(/;"/g, ";");
    fixed = fixed.replace(/\)"/g, ")");
    fixed = fixed.replace(/}"/g, "}");
    fixed = fixed.replace(/'"$/gm, "'");
    fixed = fixed.replace(/"'$/gm, "\"");
    
    // Fix unclosed string literals and potential encoding issues
    fixed = fixed.replace(/([^\\])"([^"]*)\n/g, "$1\"$2\"\n"); // Fix double quotes
    fixed = fixed.replace(/([^\\])'([^']*)\n/g, "$1'$2'\n"); // Fix single quotes
    
    // Fix missing semicolons in object properties
    fixed = fixed.replace(/(\w+):\s*(['"][^'"]*['"])\s*(\w+):/g, "$1: $2, $3:");
    
    // Fix missing catch/finally
    fixed = fixed.replace(/}\s*try\s*{/g, "};\ntry {");
    
    // Fix missing closing parentheses
    fixed = fixed.replace(/\}\)\.\s*\}/g, '});\n}');
    
    // Save result
    fs.writeFileSync(TARGET_FILE, fixed, 'utf8');
    console.log(`Fixed file saved: ${TARGET_FILE}`);
    
    return { success: true };
  } catch (err) {
    console.error('Error fixing file:', err);
    return { success: false, error: err.message };
  }
}

// Run fix
fixFile().then(result => {
  if (result.success) {
    console.log('Fix completed successfully');
  } else {
    console.error('Fix failed');
  }
}); 