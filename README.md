# CursorProTools — macOS Portable Release

Cursor 账号管理工具（`com.cursor.account.manager`）v0.2.19 的便携版，基于 Electron。

> 架构：**Apple Silicon (arm64)**，macOS 11+。Intel Mac 不适用。

## 下载

| 文件 | 说明 |
|---|---|
| `CursorProTools-macos-portable.zip` | 完整便携包（应用 + 账号数据 + 启动器） |

## 安装与启动

1. 解压 zip，得到一个目录：

   ```
   CursorProTools/
   ├── CursorProTools.app      # 应用本体（自包含，无需安装其他依赖）
   ├── portable-data/          # 随包账号数据（accounts.db）
   ├── launcher.command        # 推荐的启动入口
   └── README.md
   ```

2. **首次打开（重要）**：本应用未经过 Apple 公证，直接双击会被 Gatekeeper 拦截。任选其一：

   - 终端执行（在解压目录下）：
     ```bash
     xattr -cr CursorProTools.app
     ```
   - 或：系统设置 → 隐私与安全性 → 找到被拦提示 →「仍要打开」。

3. 双击 `launcher.command` 启动（首次会自动把 `portable-data/accounts.db` 恢复到
   `~/Library/Application Support/cursor-pro-tools/`，之后无需再配置）。

   也可以直接双击 `CursorProTools.app`（首次仍需上面第 2 步的放行操作）。

## 说明

- 应用完全自包含（内置 Electron 运行时），除上述放行步骤外**无需安装任何依赖**。
- 应用本体在原版基础上包含社区修改（AI 登录、版本选择器、安装/卸载管理等 fix），
  以 `Resources/app.asar` 形式直接打包，未重新构建。
- `portable-data/accounts.db` 为随包携带的账号数据库，仅当你想直接沿用该数据时保留；
  如想从零开始，删除该文件后启动，应用会新建空数据库。
- 账号数据实际存放于 `~/Library/Application Support/cursor-pro-tools/accounts.db`，
  迁移到新机器时把该文件带过去即可。

## ⚠️ 安全提示

随包的 `accounts.db` 内含账号凭据（cookies / licenses）。**请勿将解压后的数据用于
公开传播**，仅限本人使用；如需分发给他人，建议删除 `portable-data/` 后再分享。

## 已知限制

- 代码签名为修改后状态（未重签、未公证），macOS 首次运行需手动放行（见第 2 步）。
- 仅支持 Apple Silicon (arm64)。
- 应用运行中产生的缓存（GPU Cache / Session Storage 等）不会回写到 zip，属正常现象。
