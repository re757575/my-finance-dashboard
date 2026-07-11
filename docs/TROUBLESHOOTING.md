# Troubleshooting

## GitHub Pages 部署失敗：`Error: Creating Pages deployment failed` (404)

### 症狀

`.github/workflows/deploy.yml` 的 `deploy` job 在執行 `actions/deploy-pages@v4` 時失敗，錯誤訊息如下：

```
Error: Creating Pages deployment failed
Error: HttpError: Not Found
...
Error: Error: Failed to create deployment (status: 404) with build version <sha>.
Ensure GitHub Pages has been enabled: https://github.com/<owner>/<repo>/settings/pages
```

`build`（typecheck / test / build / upload-pages-artifact）都成功，只有 `deploy` job 失敗。

### 原因

`deploy-pages@v4` 呼叫 GitHub API 建立 Pages deployment，只要下列任一條件不成立就會回傳 404：

1. **Repo 未啟用 GitHub Pages。** 免費版 GitHub 帳號的 **Private repo 無法使用 GitHub Pages**（GitHub Pages 設定頁會顯示「Upgrade or make this repository public to enable Pages」），需將 repo 改為 Public，或升級到 GitHub Pro/Team 以上方案。
2. **Pages 的 Source 未設定為「GitHub Actions」。** 若 Source 停留在預設值或選了「Deploy from a branch」，Actions 建立的 deployment 也會找不到對應站台。
3. **Workflow run 觸發時機早於上述設定完成的時間點。** 即使事後立刻改好 repo 可見度與 Source，正在跑（或已排入佇列）的那次 run 仍是拿舊狀態去呼叫 API，一樣會 404；需要等設定生效後 **重新觸發一次新的 run** 才會成功。

### 解法

1. 前往 `https://github.com/<owner>/<repo>/settings`，捲到最下方「Danger Zone」→ **Change repository visibility** → 改為 Public。
   > **Private repo 提醒：** 免費版帳號沒有「public 化就沒有 private」的中間選項；本專案不受影響，因為所有財務資料只存在使用者瀏覽器的 LocalStorage，靜態網頁本身不含任何人的資料。
2. 前往 `https://github.com/<owner>/<repo>/settings/pages`，將 **Source** 設定為 **GitHub Actions**（不要點頁面上「GitHub Pages Jekyll」或「Static HTML」的 Configure 按鈕，那會覆蓋掉專案既有的 `deploy.yml`）。
3. 重新觸發一次部署：
   - 到 **Actions** 分頁 → 選擇 "Deploy to GitHub Pages" workflow → 右上角 **Run workflow**，或
   - `git push` 一個新 commit 到 `main`。
4. 部署成功後，網址格式為 `https://<owner>.github.io/<repo>/`（因 `vite.config.ts` 設定 `base: "./"` 相對路徑，不需因 repo 名稱調整設定）。
