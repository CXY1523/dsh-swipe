# dsh-swipe

Tavern (SillyTavern) 风格的 swipe 重roll插件，用于 DeepSeek Harness Web。

## 功能

- 每条已完成的助手回复操作条上增加 `⟳ 换一版` 按钮。
- 点击后：以该回复所在轮为界 fork 出新会话，自动重发该轮的用户消息，新会话即"下一版"。
- 版本链记录在浏览器 `localStorage`（`dsh-swipe:v1`），同一链的版本之间通过 `◀ i/n ▶` 快速跳转。
- 版本回复支持链式重roll：在新版本上继续 `⟳` 可生成再下一版。

## 与酒馆的差异

DSH 的事件日志是只追加、无原地重写的，因此"同一轮多版本"表达为 fork 树：
每个版本是一个独立会话（旧版本完整保留），版本切换等于会话跳转。
这是 DSH 架构下与酒馆 swipe 语义最接近的实现。

## 安装

1. 将本目录加入 profile 依赖（例如 `"dsh-swipe": "link:C:/path/to/dsh-swipe"`）。
2. 在 profile `package.json` 的 `dsh.profile.bundles` 中追加 `"dsh-swipe"`。
3. 在 profile 目录执行 `pnpm install`，然后重启 DSH。
