# 合約系統（Firebase 版）

此目錄由原始 `contracts-node` 專案自動轉製，採用：

- **Firebase Functions**：`api`（後台管理 API）、`web`（簽署頁面 EJS 輸出）
- **Firestore**：contracts / users / templates
- **Hosting**：提供簡易前端（Email/Password 登入、建立草稿、列出近期合約）
- **Storage**：可儲存簽名與 PDF（本範例以 Google Drive 為主；你也可改為 Storage）

## 部署

```bash
npm i -g firebase-tools
firebase init # 也可直接修改 .firebaserc
cd functions && npm i
cd ..
firebase deploy
```

## 需要的環境變數 / 設定

- 若你要使用 Google Drive 上傳 PDF：
  - 於 Firebase 控制台 Functions > 變數 或使用 `firebase functions:secrets:set` 設置
  - 必要環境：
    - `GOOGLE_SERVICE_ACCOUNT_JSON`（可選，本地開發用；正式環境預設使用 Functions 服務帳戶）
    - `DRIVE_FOLDER_ID`（可選，上傳目標資料夾）
- 前端 `hosting/assets/app.js` 內填入你的 Firebase 專案 `apiKey`、`projectId`。

## 路由對照

- `GET /api/healthz`：健康檢查
- `GET /api/contracts?months=3`：列出近 N 個月合約
- `POST /api/contracts`：建立草稿（需 sales 或 admin）
- `PATCH /api/contracts/:id`：更新草稿
- `POST /api/contracts/:id/send`：發送簽署，回傳簽署連結
- `POST /api/contracts/:id/pdf`：上傳 PDF 到 Google Drive（需 admin）

- `GET /sign/:token`：以 EJS 套版，輸出簽署頁 HTML
- `POST /sign/:token/consent`：旅客勾選同意欄
- `POST /sign/:token/complete`：上傳簽名（data URL），完成簽署
