#!/bin/bash
# 自動應用修復腳本和服務器配置的安裝腳本

echo "開始應用修復..."

# 當前目錄
CURRENT_DIR=$(pwd)
echo "當前工作目錄: $CURRENT_DIR"

# 檢查是否有必要的文件
if [ ! -f "js/fixes.js" ] || [ ! -f "js/styles-fix.js" ] || [ ! -f "js/admin-fix.js" ] || [ ! -f "js/leave-logic-fix.js" ] || [ ! -f "js/schedule-fix.js" ] || [ ! -f "js/headers-fix.js" ]; then
    echo "錯誤: 缺少必要的修復腳本文件。請確保所有修復腳本都在js目錄中。"
    exit 1
fi

# 添加修復腳本到HTML文件的函數
add_fix_scripts() {
    local html_file=$1
    local file_name=$(basename "$html_file")
    
    echo "處理 $file_name..."
    
    # 創建臨時文件
    tmp_file="${html_file}.tmp"
    
    # 檢查文件是否存在
    if [ ! -f "$html_file" ]; then
        echo "警告: 文件 $html_file 不存在，跳過..."
        return
    fi
    
    # 檢查是否已經有修復腳本
    if grep -q "fixes.js" "$html_file"; then
        echo "文件 $file_name 已包含修復腳本，檢查是否需要更新..."
    fi
    
    # 根據不同的HTML文件添加不同的修復腳本
    case "$file_name" in
        admin.html)
            # 尋找最後一個script標籤
            if ! grep -q "admin-fix.js" "$html_file"; then
                sed '/<\/body>/i\
<!-- 修復腳本 -->\
<script src="js/fixes.js"></script>\
<script src="js/admin-fix.js"></script>\
<script src="js/styles-fix.js"></script>\
<script src="js/headers-fix.js"></script>' "$html_file" > "$tmp_file"
                mv "$tmp_file" "$html_file"
                echo "已添加管理頁面修復腳本到 $file_name"
            else
                echo "$file_name 已包含管理頁面修復腳本"
            fi
            ;;
        
        leave.html)
            if ! grep -q "leave-logic-fix.js" "$html_file"; then
                sed '/<\/body>/i\
<!-- 修復腳本 -->\
<script src="js/fixes.js"></script>\
<script src="js/leave-logic-fix.js"></script>\
<script src="js/styles-fix.js"></script>\
<script src="js/headers-fix.js"></script>' "$html_file" > "$tmp_file"
                mv "$tmp_file" "$html_file"
                echo "已添加請假頁面修復腳本到 $file_name"
            else
                echo "$file_name 已包含請假頁面修復腳本"
            fi
            ;;
        
        schedule-view.html)
            if ! grep -q "schedule-fix.js" "$html_file"; then
                sed '/<\/body>/i\
<!-- 修復腳本 -->\
<script src="js/fixes.js"></script>\
<script src="js/schedule-fix.js"></script>\
<script src="js/styles-fix.js"></script>\
<script src="js/headers-fix.js"></script>' "$html_file" > "$tmp_file"
                mv "$tmp_file" "$html_file"
                echo "已添加排班頁面修復腳本到 $file_name"
            else
                echo "$file_name 已包含排班頁面修復腳本"
            fi
            ;;
        
        *)
            # 其他HTML文件只添加通用修復腳本
            if ! grep -q "fixes.js" "$html_file"; then
                sed '/<\/body>/i\
<!-- 修復腳本 -->\
<script src="js/fixes.js"></script>\
<script src="js/styles-fix.js"></script>\
<script src="js/headers-fix.js"></script>' "$html_file" > "$tmp_file"
                mv "$tmp_file" "$html_file"
                echo "已添加通用修復腳本到 $file_name"
            else
                echo "$file_name 已包含通用修復腳本"
            fi
            ;;
    esac
    
    # 添加版本號到資源引用
    if ! grep -q "v=20250418" "$html_file"; then
        # 添加版本號到CSS和JS引用
        sed -i 's/\.css"/\.css?v=20250418"/g' "$html_file"
        sed -i 's/\.css'\''/\.css?v=20250418'\''/g' "$html_file"
        sed -i 's/\.js"/\.js?v=20250418"/g' "$html_file"
        sed -i 's/\.js'\''/\.js?v=20250418'\''/g' "$html_file"
        echo "已為 $file_name 中的資源添加版本號"
    else
        echo "$file_name 中的資源已有版本號"
    fi
}

# 處理所有HTML文件
echo "正在處理HTML文件..."
for html_file in $(find . -name "*.html"); do
    add_fix_scripts "$html_file"
done

# 檢測服務器類型並應用適當的配置
echo "正在檢測服務器類型..."

# 檢查是否為Nginx服務器
if command -v nginx > /dev/null 2>&1; then
    echo "檢測到Nginx服務器，準備應用Nginx配置..."
    
    # 檢查Nginx配置目錄
    nginx_conf_dir=$(nginx -V 2>&1 | grep -o 'conf-path=[^ ]*' | cut -d= -f2 | xargs dirname)
    if [ -z "$nginx_conf_dir" ]; then
        nginx_conf_dir="/etc/nginx"
    fi
    
    if [ -w "$nginx_conf_dir" ]; then
        echo "將配置添加到Nginx..."
        
        # 備份原始配置
        cp "$nginx_conf_dir/nginx.conf" "$nginx_conf_dir/nginx.conf.bak"
        echo "已備份原配置到 $nginx_conf_dir/nginx.conf.bak"
        
        # 複製新配置
        if [ -f "server-config/nginx.conf" ]; then
            echo "請手動更新您的Nginx配置，參考修復配置文件:"
            echo "server-config/nginx.conf"
        else
            echo "錯誤: 找不到Nginx配置模板 server-config/nginx.conf"
        fi
    else
        echo "無權限修改Nginx配置目錄 $nginx_conf_dir，請手動應用配置:"
        echo "server-config/nginx.conf"
    fi
fi

# 檢查是否為Apache服務器
if command -v apache2 > /dev/null 2>&1 || command -v httpd > /dev/null 2>&1; then
    echo "檢測到Apache服務器，準備應用Apache配置..."
    
    # 檢查站點根目錄
    if [ -f "server-config/apache.htaccess" ]; then
        echo "發現Apache .htaccess配置文件"
        
        # 檢查是否可以寫入.htaccess
        if [ -w ".htaccess" ]; then
            # 備份原始.htaccess
            cp ".htaccess" ".htaccess.bak"
            echo "已備份原.htaccess到 .htaccess.bak"
            
            # 合併配置
            cat "server-config/apache.htaccess" > ".htaccess"
            echo "已更新.htaccess配置"
        else
            echo "無權限修改.htaccess文件，請手動應用配置:"
            echo "server-config/apache.htaccess"
        fi
    else
        echo "錯誤: 找不到Apache配置模板 server-config/apache.htaccess"
    fi
fi

echo "修復腳本應用完成！"
echo "請重啟您的Web服務器以應用更改。"
echo ""
echo "測試步驟:"
echo "1. 清除瀏覽器快取"
echo "2. 檢查所有頁面功能"
echo "3. 檢查瀏覽器控制台是否仍有警告"
echo ""
echo "如有問題，請參考deployment-instructions.md文檔。" 