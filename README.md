# CursorProTools — macOS Portable Release

Cursor 账号管理工具（`com.cursor.account.manager`）v0.2.19 的便携版，基于 Electron。

> 架构：**Apple Silicon (arm64)**，macOS 11+。Intel Mac 不适用。

## 下载

> Release 页面：https://github.com/SeeDaiMa/CursorProTools/releases/tag/v0.2.19-portable

| 文件 | 大小 | 直链下载 |
|---|---|---|
| `CursorProTools-macos-portable.zip` | 107 MB | [⬇️ 下载便携包](https://github.com/SeeDaiMa/CursorProTools/releases/download/v0.2.19-portable/CursorProTools-macos-portable.zip) |
| `Cursor-darwin-3.17.19-arm64.dmg` | 258 MB | [⬇️ 下载 Cursor 官方 3.17.19 安装包](https://github.com/SeeDaiMa/CursorProTools/releases/download/v0.2.19-portable/Cursor-darwin-3.17.19-arm64.dmg)（供配套使用） |

> 资产在 Release 页面底部的 **Assets** 折叠区内，直链可跳过查找。

## 安装与启动

1. 解压 zip，得到一个目录：

   ```
   CursorProTools/
   ├── CursorProTools.app      # 应用本体（自包含，无需安装其他依赖）
   ├── launcher.command        # 推荐的启动入口
   └── README.md
   ```

2. **首次打开（重要）**：本应用未经过 Apple 公证，直接双击会被 Gatekeeper 拦截。任选其一：

   - 终端执行（在解压目录下）：
     ```bash
     xattr -cr CursorProTools.app
     ```
   - 或：系统设置 → 隐私与安全性 → 找到被拦提示 →「仍要打开」。

3. 双击 `launcher.command` 或直接双击 `CursorProTools.app` 启动。

## 账号数据迁移

账号数据存放在 `~/Library/Application Support/cursor-pro-tools/accounts.db`，
首次启动应用会自动新建空数据库。

从旧机器迁移：把旧机器上的该文件拷贝到新机器相同路径即可（启动前或启动后复制均可）。

## 说明

- 应用完全自包含（内置 Electron 运行时），除上述放行步骤外**无需安装任何依赖**。
- 应用本体在原版基础上包含社区修改（AI 登录、版本选择器、安装/卸载管理等 fix），
  以 `Resources/app.asar` 形式直接打包，未重新构建。
- 本发布包**不包含任何账号数据**。

## ⚠️ 安全提示

- 你的账号数据仅存在于本机 `~/Library/Application Support/cursor-pro-tools/accounts.db`，
  请勿将该文件分享或上传到公开场所。

## 已知限制

- 代码签名为修改后状态（未重签、未公证），macOS 首次运行需手动放行（见第 2 步）。
- 仅支持 Apple Silicon (arm64)。
- 应用运行中产生的缓存（GPU Cache / Session Storage 等）不会回写到 zip，属正常现象。
