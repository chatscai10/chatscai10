# 薪资查看模块修复部署指南

本文档提供了薪资查看模块(salary-view-logic.js)问题的修复方案和部署指南。

## 问题概述

1. **Firebase 权限问题**：获取薪资默认参数时出现权限不足错误
   ```
   Error getting system parameter salary.default_base_salary: FirebaseError: Missing or insufficient permissions.
   ```

2. **HTML 元素缺失**：容器查找失败
   ```
   Container not found for loading indicator: available-bonus-tasks .section-content
   ```

3. **Firestore 索引缺失**：需要为复合查询创建索引
   ```
   Error loading all bonus tasks for modal: FirebaseError: The query requires an index.
   ```

4. **函数重复定义**：getSystemParameter函数在文件中被定义了两次

## 修复方案

我们创建了一个综合性修复文件 `js/salary-view-logic.js.new`，它包含以下修复：

1. **统一的getSystemParameter函数**：增强的参数获取函数，能够从多个集合获取参数，并正确处理权限错误。
2. **健壮的容器查找函数**：新增`findContainerSafely`函数，能够通过多种备选方式查找容器元素。
3. **增强的奖金任务加载函数**：修复的`loadAvailableBonusTasksSection`函数，能够处理容器缺失问题。
4. **改进的薪资详情加载函数**：修复的`loadPayrollDetails`函数，能够更好地处理参数权限错误。

## 部署步骤

### 方案A：替换整个文件（推荐）

1. 备份原文件：
   ```bash
   cp js/salary-view-logic.js js/salary-view-logic.js.bak
   ```

2. 将新文件重命名为正式文件：
   ```bash
   mv js/salary-view-logic.js.new js/salary-view-logic.js
   ```

3. 更新HTML中的引用，在`salary.html`中，确保引用带有最新版本号：
   ```html
   <script src="js/salary-view-logic.js?v=20250418v1"></script>
   ```

### 方案B：加载修复脚本（备选方案）

如果您不想完全替换原始文件，可以在原有脚本后加载修复脚本：

1. 将新文件重命名为修复脚本：
   ```bash
   cp js/salary-view-logic.js.new js/salary-view-logic-fix.js
   ```

2. 在HTML中原有脚本之后加载修复脚本：
   ```html
   <script src="js/salary-view-logic.js?v=20250417v2"></script>
   <script src="js/salary-view-logic-fix.js?v=20250418v1"></script>
   ```

## Firestore 权限调整

为解决权限问题，请在Firestore安全规则中添加以下规则：

```javascript
// 允许已认证用户读取salary参数
match /settings/salary {
  allow read: if isAuthenticated(request);
}
```

## Firestore 索引创建

您需要为以下查询创建复合索引：

1. bonus_tasks集合：
   - 字段：isActive (Ascending), minLevel (Ascending), createdAt (Descending)

2. 在Firebase控制台中创建索引，或点击控制台错误消息中提供的链接直接创建。

## 测试验证

部署修复后，请执行以下测试：

1. 访问薪资页面并检查控制台是否有错误
2. 验证奖金任务是否正确显示
3. 验证薪资详情是否正确加载
4. 检查是否有权限或索引相关的错误消息

## 回滚方案

如果出现问题，可以回滚到备份版本：

```bash
mv js/salary-view-logic.js.bak js/salary-view-logic.js
```

## 支持与反馈

如有任何问题，请联系开发团队。 