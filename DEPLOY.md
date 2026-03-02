# iPhone 全网访问部署说明（Vercel）

## 1. 准备仓库
1. 在 GitHub 新建仓库（例如 `a-share-live-pwa`）。
2. 把 `ios-pwa-live` 目录内文件全部上传到仓库根目录。

## 2. 部署到 Vercel
1. 登录 Vercel，点击 `Add New -> Project`。
2. 选择你的 GitHub 仓库并导入。
3. Framework 选择 `Other`（默认即可），直接部署。
4. 部署成功后得到公网域名（例如 `https://xxxx.vercel.app`）。

## 3. iPhone 添加到主屏幕
1. 用 Safari 打开公网域名。
2. 点击底部 `分享`。
3. 选择 `添加到主屏幕`。
4. 完成后直接点桌面图标打开，不需要手动输入网址。

## 4. 实时更新说明
- 页面默认每 15 秒请求一次 `/api/live` 拉取最新行情。
- 可在页面内修改股票代码与刷新间隔（秒）。
- 想固定股票池，直接改 `codes.json` 后重新部署即可。
