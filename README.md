# 炸雞店管理系統

## 專案說明
這是一個完整的炸雞店管理系統，包含員工管理、排班系統、薪資計算等功能。

## 系統要求
- Node.js >= 14.0.0
- Firebase 帳號
- Python >= 3.8 (用於部分自動化腳本)
- Redis (用於快取，可選)

## 功能模組
- 認證系統
- 排班管理
- 出勤打卡
- 請假管理
- 薪資計算
- 預測分析
- 報表系統
- 管理後台

## 離線支援功能
本系統支援離線工作模式，關鍵功能包括：
- 版本資訊本地緩存
- 出勤打卡離線記錄
- 資料本地暫存與同步
- 網路恢復自動同步

## 資料安全和權限
系統使用 Firebase 安全規則控制資料訪問權限：
- 用戶僅能訪問自己的資料
- 管理員有更高權限可管理所有資料
- 設置環境變數 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 以啟用管理員功能

## 快速開始

1. 安裝依賴
```bash
npm install
```

2. 設置環境變數
```bash
cp .env.example .env
# 編輯 .env 文件，填入必要的配置信息
```

3. 初始化數據（可選）
```bash
npm run migrate
```

4. 啟動開發服務器
```bash
npm run dev
```

5. 訪問系統
```
http://localhost:5173
```

## 解決已知問題

### Firebase 權限問題
如果執行 `npm run migrate` 時遇到 Firebase 權限錯誤：

1. 確保已在 `.env` 文件中正確設置 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`
2. 確認該帳號在 Firebase 中有管理員權限
3. 如果仍有問題，可使用本地遷移選項：
   ```bash
   npm run migrate:local
   ```

### 離線功能問題
如果離線功能無法正常工作：

1. 確保 `service-worker.js` 已正確註冊
2. 檢查 `.env` 文件中的 `ENABLE_OFFLINE_MODE` 是否設為 `true`
3. 清除瀏覽器緩存後重試

## 部署說明

1. 構建生產版本
```bash
npm run build
```

2. 部署到 Firebase
```bash
firebase deploy
```

## 開發指南

### 代碼規範
- 使用 ESLint 進行代碼檢查
- 遵循 Airbnb JavaScript Style Guide
- 使用 Prettier 進行代碼格式化

### 分支管理
- main: 生產環境分支
- develop: 開發環境分支
- feature/*: 功能分支
- hotfix/*: 緊急修復分支

### 提交規範
提交信息格式：
```
<type>(<scope>): <subject>

<body>

<footer>
```

Type 類型：
- feat: 新功能
- fix: 修復
- docs: 文檔
- style: 格式
- refactor: 重構
- test: 測試
- chore: 構建過程或輔助工具的變動

### 測試
```bash
# 運行單元測試
npm run test

# 運行端到端測試
npm run test:e2e
```

## 版本歷史

### 2.0.0 (2024-03-21)
- 重構版本控制系統
- 優化模組加載機制
- 改進錯誤處理
- 加強安全性配置
- 新增離線支援功能

### 1.5.0 (2024-02-15)
- 整合打卡與排班系統
- 優化薪資預測模型
- 擴展報表功能
- UI/UX 改進

## 貢獻指南
1. Fork 本倉庫
2. 創建功能分支
3. 提交更改
4. 發起 Pull Request

## 授權協議
本專案採用 MIT 授權協議。詳見 [LICENSE](LICENSE) 文件。

## 聯繫方式
- 技術支持：support@example.com
- 問題回報：issues@example.com 