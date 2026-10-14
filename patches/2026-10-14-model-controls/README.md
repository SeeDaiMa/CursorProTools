# 模型错误输入恢复与 MAX 状态显示

适用于 macOS 上已经安装本仓库 Agents Window 修复的 Cursor **3.17.19**。这是独立补丁包，使用已有 Python 3，安装不需要 Node.js，也不修改 CursorProTools 应用或账号数据。

## 修复行为

- 新建聊天和已有聊天在当前额度或受支持的模型错误出现后保留草稿编辑。点击实际输入区关闭当前错误，随后允许手动重试；点击本身不发送消息。新的服务端错误会重新阻止提交。
- 模型错误的识别复用原生额度/模型标记，并兼容精确标题 `Named models unavailable`。它不把任意错误或管理员限制都视为可关闭的模型错误。
- 模型菜单恢复 **MAX Mode** 原生开关，显示有效状态。开启 Max 时，模型名旁显示 **MAX**；关闭后标记消失。保留原生首次启用确认及后台必须 Max 的禁用规则。
- 安装不自动开启或关闭 Max，也不改所选模型。用户手动切换时由原有配置 owner 保存，保留原来的全局配置更新语义。

当前账户能否实际使用所选模型与模式，仍由模型服务端决定。显示开关、关闭本地错误和实际请求成功是不同的验证结果。

## 下载与安装

[下载独立修复 ZIP](https://github.com/SeeDaiMa/CursorProTools/releases/download/v0.2.19-model-controls/Cursor-3.17.19-model-controls-macos.zip) · [Release 与校验文件](https://github.com/SeeDaiMa/CursorProTools/releases/tag/v0.2.19-model-controls)

1. 解压并保留整个 `CursorModelControls` 目录。
2. 保存任务，使用 Cmd+Q 完全退出 Cursor。
3. 在本机终端运行目录内的 `install.command`，或执行下面的命令。
4. 看到 `installed` 或 `already_installed` 后重新打开 Cursor，打开模型菜单检查 **MAX Mode**。

从补丁目录执行：

```sh
python3 patch.py prepare --output build
python3 patch.py install build
```

默认目标是 `/Applications/Cursor.app`；其他安装位置可在准备时使用 `--cursor-app` 指定。准备命令只生成本地修改文件，不修改应用。

安装器只接受下面三个已验证的 Agents 脚本阶段：

| 已安装阶段 | SHA-256 |
|---|---|
| R3 原有输入恢复与账号资料修复 | `4362395f6d70705424bc4d62204307bfba42788ef67b323204d5639dcbb5cf1a` |
| 已加模型错误输入恢复 | `8e9d94d76aedd99267686a03dea87a2cc53a6ad96826dcc83a5e808e385d84ee` |
| 已加本次 MAX 显示修复 | `6712795ed504ee5030912f051fa1b90f9c4bda88ad6bcda783eca07fb4841919` |

版本或哈希不同会停止，不猜测覆盖其他修改。未安装前置修复的同版本官方 Cursor 不在本补丁基线内，请先参考 [R3 修复说明](../2026-10-14/README.md)。

如果出现 `Operation not permitted`，macOS 拒绝了应用写入；请检查“系统设置 → 隐私与安全性 → 应用管理”中实际执行脚本的终端应用权限，然后重新打开终端。此发布不宣称已在所有机器上获得应用写权限。

## 回滚

保留准备时生成的 `build/` 或 `build-日期时间/` 目录。完全退出 Cursor 后执行：

```sh
python3 patch.py restore build
```

只恢复本次安装前的 Agents 脚本和 `product.json`，当前模型选择与 Max 设置保留。安装后文件发生其他变化时拒绝覆盖。

## 验证与源码

安装只替换 `workbench.glass.main.js` 和对应的现有 checksum。14 个精确替换集中在错误 owner、两个输入入口与共享模型选择器。既有代码和注入尾段保持。

在已准备的 `build/` 上，可使用 Node.js 24.18.0 和已有 Python 3 复现受控验证：

```sh
node tests/verify-model-errors.cjs build/model-errors
node tests/verify-max-visibility.cjs build/max-visibility
python3 tests/verify-installer.py
```

这些测试运行实际提取的原生函数/组件配合惰性服务替身。覆盖点击不发送、草稿和模型参数保持、后续错误重新阻断、MAX 开关及标记、原生配置保存与确认、安装幂等性、回滚、输入变更拒绝和部分写入回退。

完整脚本通过 Node 24.18.0 语法检查。发布时只读确认本机应用文件已经匹配最终修复哈希，并在已有聊天的原生模型菜单确认 **MAX Mode** 可见、当前为关闭。没有操作 Max 开关或发送模型请求；开启时标记及新建聊天场景仍以受控回放为验证依据。之前从代理进程安装时曾受到 macOS 应用管理保护阻止，不将当前机器的结果推广为其他机器的应用写权限。见 [verification.json](verification.json)。公开包只含补丁源码、差异清单和测试，不含完整 vendor bundle、真实账号数据或本机备份。
