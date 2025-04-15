# 系统修复部署说明

本文档提供了几个JavaScript文件错误的修复方案，包括:
1. `showTemporaryMessage`函数缺失
2. `getSystemParameter`函数重复定义
3. 容器查找失败
4. `leave-logic.js`中的变量重复声明
5. 管理页面元素缺失问题
6. 日历排班页面Store图例容器问题
7. 内联样式问题
8. HTTP头部和缓存问题

## 已修复的问题

1. 缺失的 `showTemporaryMessage` 函数
2. `getSystemParameter` 函数重复定义
3. 容器查找失败
4. `leave-logic.js` 中的变量重复声明
5. 管理页面元素缺失问题
6. 排班页面图例容器缺失
7. 大量内联样式使用
8. Firebase Functions SDK缺失警告

## 快速修复方法

### 1. 添加修复脚本到HTML文件

将以下脚本添加到相应的HTML文件中，确保它们在原始脚本之后载入:

**薪资页面 (salary.html)**:
```html
<!-- 修复脚本 -->
<script src="js/fixes.js"></script>
<script src="js/styles-fix.js"></script>
```

**请假页面 (leave.html)**:
```html
<!-- 修复脚本 -->
<script src="js/fixes.js"></script>
<script src="js/leave-logic-fix.js"></script>
<script src="js/styles-fix.js"></script>
```

**管理页面 (admin.html)**:
```html
<!-- 修复脚本 -->
<script src="js/fixes.js"></script>
<script src="js/admin-fix.js"></script>
<script src="js/styles-fix.js"></script>
```

**排班页面 (schedule-view.html)**:
```html
<!-- 修复脚本 -->
<script src="js/fixes.js"></script>
<script src="js/schedule-fix.js"></script>
<script src="js/styles-fix.js"></script>
```

**其他使用相关函数的页面**:
```html
<!-- 修复脚本 -->
<script src="js/fixes.js"></script>
<script src="js/styles-fix.js"></script>
```

### 2. 更新Firestore安全规则

添加以下规则以允许已认证用户读取薪资设定:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 现有规则保持不变
    
    // 添加薪资设定读取权限
    match /settings/salary {
      allow read: if request.auth != null;
    }
  }
}
```

### 3. 创建必要的索引

为 `bonus_tasks` 集合创建复合查询索引:
- 字段: `active` (升序) + `priority` (升序)

## 解决服务器配置问题

为了解决HTTP头部和缓存问题，需要更新服务器配置。

### 1. Nginx服务器配置

如果使用Nginx，请更新配置文件，添加以下内容:

```nginx
# 添加到http块或server块中
# 正确设置MIME类型
types {
    image/x-icon ico;
}

# 移除不推荐的头部
proxy_hide_header Expires;
proxy_hide_header Pragma;

# 设置适当的缓存控制
location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
    add_header Strict-Transport-Security "max-age=31536000" always;
}

# favicon特别处理
location = /favicon.ico {
    expires 1y;
    add_header Cache-Control "public, max-age=31536000";
}
```

### 2. Apache服务器配置

如果使用Apache，请在`.htaccess`文件中添加:

```apache
# 移除不推荐的头部
<IfModule mod_headers.c>
    Header unset Expires
    Header unset Pragma
</IfModule>

# 设置适当的缓存控制
<FilesMatch "\.(js|css|png|jpg|jpeg|gif|ico)$">
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresDefault "access plus 1 month"
    </IfModule>
    <IfModule mod_headers.c>
        Header set Cache-Control "public, max-age=2592000"
    </IfModule>
</FilesMatch>

# favicon特别处理
<FilesMatch "favicon\.ico$">
    <IfModule mod_headers.c>
        Header set Content-Type "image/x-icon"
        Header set Cache-Control "max-age=31536000, public"
    </IfModule>
</FilesMatch>
```

### 3. 版本控制资源

在所有HTML文件中，为静态资源添加版本号:

```html
<link rel="stylesheet" href="css/styles.css?v=20250418">
<script src="js/main.js?v=20250418"></script>
```

每次更新文件时增加版本号，以确保浏览器加载最新版本。

## 测试

部署后，请测试以下功能:

1. **薪资页面**:
   - 确认薪资比较功能正常工作
   - 检查月份选择器是否正确显示和更新
   - 确认报表正确生成

2. **请假页面**:
   - 确认日历正确渲染
   - 测试请假申请流程
   - 验证日期选择功能
   - 确认不再出现变量重复声明错误

3. **管理页面**:
   - 确认所有部分都能正确显示
   - 检查错误信息是否正常显示
   - 测试每个部分的功能

4. **排班页面**:
   - 确认店铺图例正确显示
   - 测试排班功能
   - 验证Firebase相关功能不再报错

5. **样式和性能**:
   - 确认内联样式已移至外部样式表
   - 验证浏览器控制台不再显示样式和性能警告
   - 检查缓存控制头部是否正确设置

## 回滚计划

如果部署后出现问题:

1. 从HTML文件中移除修复脚本:
   ```html
   <!-- 删除这些行 -->
   <script src="js/fixes.js"></script>
   <script src="js/leave-logic-fix.js"></script>
   <script src="js/admin-fix.js"></script>
   <script src="js/schedule-fix.js"></script>
   <script src="js/styles-fix.js"></script>
   ```

2. 恢复服务器配置:
   - Nginx: 重新加载原始配置文件
   - Apache: 恢复原始.htaccess文件

## 未来优化建议

1. 重构代码以避免重复定义
2. 实施模块化架构
3. 考虑使用捆绑工具（如Webpack或Rollup）
4. 建立统一的错误处理和UI组件库
5. 实施自动化测试
6. 将所有内联样式移至外部CSS文件
7. 实施适当的浏览器缓存策略
8. 针对不同浏览器添加兼容性处理

## 方案2: 完全替换文件(备选方案)

如果修复脚本不能完全解决问题，可以选择替换整个文件。

### 替换 `salary-view-logic.js`:

1. 备份原文件:
   ```
   cp js/salary-view-logic.js js/salary-view-logic.js.bak
   ```

2. 使用新文件:
   ```
   cp js/salary-view-logic.js.new js/salary-view-logic.js
   ```

### 替换 `leave-logic.js`:

这种方法是最彻底的，但风险更大，仅在其他方法失败时使用。

## 部署后测试

部署修复后，请测试以下功能:

1. 在薪资页面:
   - 查看奖金任务列表是否正确显示
   - 检查薪资详情是否能加载
   - 验证系统参数是否能正确获取

2. 在请假页面:
   - 确认日历能正确渲染
   - 测试日期选择功能
   - 验证请假提交功能

## 回滚计划

如果部署后出现问题:

1. 移除修复脚本:
   ```html
   <!-- 删除这些行 -->
   <script src="js/fixes.js"></script>
   <script src="js/leave-logic-fix.js"></script>
   ```

2. 如果替换了原始文件，恢复备份:
   ```
   cp js/salary-view-logic.js.bak js/salary-view-logic.js
   ```

## 后续优化

1. 这些修复是临时解决方案，长期应考虑:
   - 重构代码以避免重复定义
   - 实现模块化架构
   - 添加全面的错误处理

2. 考虑使用打包工具(如Webpack或Rollup)来:
   - 避免全局命名空间污染
   - 实现更好的依赖管理
   - 减少代码重复 