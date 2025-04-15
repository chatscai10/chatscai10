@echo off
REM 自動應用修復腳本的Windows批處理文件
SETLOCAL EnableDelayedExpansion

echo 開始應用修復...

REM 當前目錄
echo 當前工作目錄: %CD%

REM 檢查是否有必要的文件
set missing_files=0

if not exist "js\fixes.js" (
    echo 錯誤: 找不到 js\fixes.js
    set /a missing_files+=1
)
if not exist "js\styles-fix.js" (
    echo 錯誤: 找不到 js\styles-fix.js
    set /a missing_files+=1
)
if not exist "js\admin-fix.js" (
    echo 錯誤: 找不到 js\admin-fix.js
    set /a missing_files+=1
)
if not exist "js\leave-logic-fix.js" (
    echo 錯誤: 找不到 js\leave-logic-fix.js
    set /a missing_files+=1
)
if not exist "js\schedule-fix.js" (
    echo 錯誤: 找不到 js\schedule-fix.js
    set /a missing_files+=1
)
if not exist "js\headers-fix.js" (
    echo 錯誤: 找不到 js\headers-fix.js
    set /a missing_files+=1
)

if %missing_files% GTR 0 (
    echo 錯誤: 缺少必要的修復腳本文件。請確保所有修復腳本都在js目錄中。
    exit /b 1
)

REM 處理所有HTML文件
echo 正在處理HTML文件...

for /r %%f in (*.html) do (
    call :process_html_file "%%f"
)

echo 修復腳本應用完成！
echo.
echo 您還需要手動應用服務器配置修改:
echo 1. 如果您使用Nginx: 請查看 server-config\nginx.conf
echo 2. 如果您使用Apache: 請查看 server-config\apache.htaccess
echo.
echo 測試步驟:
echo 1. 清除瀏覽器快取
echo 2. 檢查所有頁面功能
echo 3. 檢查瀏覽器控制台是否仍有警告
echo.
echo 如有問題，請參考deployment-instructions.md文檔。

exit /b 0

:process_html_file
set html_file=%~1
set file_name=%~nx1
echo 處理 %file_name%...

REM 檢查是否已包含修復腳本
findstr /c:"fixes.js" "%html_file%" >nul
if %errorlevel% equ 0 (
    echo 文件 %file_name% 已包含修復腳本，檢查是否需要更新...
)

REM 根據文件名添加不同的修復腳本
if /i "%file_name%"=="admin.html" (
    findstr /c:"admin-fix.js" "%html_file%" >nul
    if %errorlevel% neq 0 (
        call :add_admin_scripts "%html_file%"
    ) else (
        echo %file_name% 已包含管理頁面修復腳本
    )
) else if /i "%file_name%"=="leave.html" (
    findstr /c:"leave-logic-fix.js" "%html_file%" >nul
    if %errorlevel% neq 0 (
        call :add_leave_scripts "%html_file%"
    ) else (
        echo %file_name% 已包含請假頁面修復腳本
    )
) else if /i "%file_name%"=="schedule-view.html" (
    findstr /c:"schedule-fix.js" "%html_file%" >nul
    if %errorlevel% neq 0 (
        call :add_schedule_scripts "%html_file%"
    ) else (
        echo %file_name% 已包含排班頁面修復腳本
    )
) else (
    findstr /c:"fixes.js" "%html_file%" >nul
    if %errorlevel% neq 0 (
        call :add_common_scripts "%html_file%"
    ) else (
        echo %file_name% 已包含通用修復腳本
    )
)

REM 添加版本號
findstr /c:"v=20250418" "%html_file%" >nul
if %errorlevel% neq 0 (
    call :add_version_numbers "%html_file%"
)

exit /b 0

:add_admin_scripts
set html_file=%~1
set temp_file=%html_file%.tmp

powershell -Command "(Get-Content '%html_file%') -replace '</body>', '<!-- 修復腳本 -->\r\n<script src=\"js/fixes.js\"></script>\r\n<script src=\"js/admin-fix.js\"></script>\r\n<script src=\"js/styles-fix.js\"></script>\r\n<script src=\"js/headers-fix.js\"></script>\r\n</body>' | Set-Content '%temp_file%'"
move /y "%temp_file%" "%html_file%" >nul
echo 已添加管理頁面修復腳本到 %~nx1
exit /b 0

:add_leave_scripts
set html_file=%~1
set temp_file=%html_file%.tmp

powershell -Command "(Get-Content '%html_file%') -replace '</body>', '<!-- 修復腳本 -->\r\n<script src=\"js/fixes.js\"></script>\r\n<script src=\"js/leave-logic-fix.js\"></script>\r\n<script src=\"js/styles-fix.js\"></script>\r\n<script src=\"js/headers-fix.js\"></script>\r\n</body>' | Set-Content '%temp_file%'"
move /y "%temp_file%" "%html_file%" >nul
echo 已添加請假頁面修復腳本到 %~nx1
exit /b 0

:add_schedule_scripts
set html_file=%~1
set temp_file=%html_file%.tmp

powershell -Command "(Get-Content '%html_file%') -replace '</body>', '<!-- 修復腳本 -->\r\n<script src=\"js/fixes.js\"></script>\r\n<script src=\"js/schedule-fix.js\"></script>\r\n<script src=\"js/styles-fix.js\"></script>\r\n<script src=\"js/headers-fix.js\"></script>\r\n</body>' | Set-Content '%temp_file%'"
move /y "%temp_file%" "%html_file%" >nul
echo 已添加排班頁面修復腳本到 %~nx1
exit /b 0

:add_common_scripts
set html_file=%~1
set temp_file=%html_file%.tmp

powershell -Command "(Get-Content '%html_file%') -replace '</body>', '<!-- 修復腳本 -->\r\n<script src=\"js/fixes.js\"></script>\r\n<script src=\"js/styles-fix.js\"></script>\r\n<script src=\"js/headers-fix.js\"></script>\r\n</body>' | Set-Content '%temp_file%'"
move /y "%temp_file%" "%html_file%" >nul
echo 已添加通用修復腳本到 %~nx1
exit /b 0

:add_version_numbers
set html_file=%~1
set temp_file=%html_file%.tmp

powershell -Command "(Get-Content '%html_file%') -replace '\.css\"', '.css?v=20250418\"' -replace '\.css''', '.css?v=20250418''' -replace '\.js\"', '.js?v=20250418\"' -replace '\.js''', '.js?v=20250418''' | Set-Content '%temp_file%'"
move /y "%temp_file%" "%html_file%" >nul
echo 已為 %~nx1 中的資源添加版本號
exit /b 0 