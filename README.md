# CursorProTools — macOS Portable Release

Cursor 账号管理工具（`com.cursor.account.manager`）v0.2.19 的便携版，基于 Electron。

适用于 **Apple Silicon（arm64）和 macOS 11+**。R3 包含 2026-10-14 的账号同步修复，并附带 Cursor 3.17.19 Agents Window 修复安装脚本。

## 下载

[最新 R3 Release](https://github.com/SeeDaiMa/CursorProTools/releases/tag/v0.2.19-portable-r3)

| 文件 | 下载 |
|---|---|
| 完整便携包 | [CursorProTools-v0.2.19-portable-r3-macos-arm64.zip](https://github.com/SeeDaiMa/CursorProTools/releases/download/v0.2.19-portable-r3/CursorProTools-v0.2.19-portable-r3-macos-arm64.zip) |
| ZIP 校验文件 | [SHA-256](https://github.com/SeeDaiMa/CursorProTools/releases/download/v0.2.19-portable-r3/CursorProTools-v0.2.19-portable-r3-macos-arm64.zip.sha256) |
| 配套 Cursor 官方安装包 | [Cursor 3.17.19 arm64 DMG](https://github.com/SeeDaiMa/CursorProTools/releases/download/v0.2.19-portable/Cursor-darwin-3.17.19-arm64.dmg) |

## 安装与启动

1. 解压 ZIP，保留完整目录：

   ```text
   CursorProTools/
   ├── CursorProTools.app
   ├── launcher.command
   ├── install-fixes.command
   ├── README.md
   ├── CHANGELOG.md
   ├── portable-data/README.md
   └── patches/2026-10-14/
   ```

2. 应用未经过 Apple 公证。首次被 macOS 拦截时，可在“系统设置 → 隐私与安全性”选择“仍要打开”。也可在解压目录中执行原有放行步骤：

   ```sh
   xattr -cr CursorProTools.app
   ```

3. 使用包内 `launcher.command` 或 `CursorProTools.app` 启动新版。应用本体自带 Electron，运行不需要另装 Node.js。

4. 安装 Agents Window 修复时，保存任务并使用 Cmd+Q 完全退出 Cursor 和 CursorProTools，然后双击 `install-fixes.command`。该步骤需要已有 Python 3；使用 R3 包时不需要 Node.js 或 npm。

5. 查看安装输出。`installed` / `already_installed` 且 `current_account_sources_aligned=true` 表示当前账号状态已对齐；若输出 `installed_needs_login` 或 `already_installed_needs_login`，请在新版 ProTools 明确选择账号重新登录，再启动 Cursor。

Agents 修复针对 Cursor 3.17.19 和清单中的已验证文件哈希。首次移植需要 Editor 已有 `wxDom 5.2.3` 注入；未知版本或其他修改会停止。运行脚本的应用需要有 macOS“应用管理”权限，遇到 `Operation not permitted` 请先停止并检查权限。

准备文件和安装备份保存在 `patches/2026-10-14/build/`，请保留，以便恢复。详细命令和恢复步骤见 [补丁说明](patches/2026-10-14/README.md)。

## 本次更新

- 普通无感切换和指定账号切换统一同步 Cursor DB 与 Hook 凭证，修复换号后请求仍使用旧账号的问题。
- 串行账号事务、失败回退、旧 Session 清理、当前设备映射替换，以及移除 Token 日志片段。
- 附带 Agents Window 注入移植、LIMIT 后点击输入框再手动发送、账号资料失败后结束 Loading 的修复。
- 保留已有自动换号和自动续接配置。点击输入框不自动发送消息；本地状态不会改变服务端订阅权益或额度。

见 [完整更新记录](CHANGELOG.md) 和 [验证记录](patches/2026-10-14/verification.json)。

## 账号数据

公开 ZIP 不包含账号数据库、Token、cookies 或本机安装备份。账号数据仍在本机 `~/Library/Application Support/cursor-pro-tools/accounts.db`，首次启动会建立空数据库。

迁移自己的账号数据时，可在本机将数据库放进解压目录的 `portable-data/accounts.db`。启动器只在目标数据库不存在时复制，不覆盖已有数据库。请勿把含个人数据库的目录再次公开分享。

## 验证与限制

- 应用版本：0.2.19；架构：arm64；已有 ad-hoc 签名经过验证，未经过 Apple 公证。
- ProTools ASAR SHA-256：`7c089f09f492f3921e9ea3b892d3995f0dd9edcf5b401fc5fc191449b5cfbd97`。
- Agents 修复最终脚本 SHA-256：`4362395f6d70705424bc4d62204307bfba42788ef67b323204d5639dcbb5cf1a`。
- 受控验证使用合成凭证与临时文件；用户已确认本机修复可用。发布验证不执行真实账号切换或模型请求。
- 历史 Release 保留，R3 是本次重新打包的完整修订版。
