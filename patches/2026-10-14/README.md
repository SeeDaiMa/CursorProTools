# 2026-10-14 Cursor Agents Window 与账号同步修复

这组补丁记录当天已安装、并由用户确认可用的本地修复。仓库存放补丁源、精确变更清单和验证脚本；完整应用文件在本机生成。

## 行为变化

- Agents Window 复用当前 Editor Window 已有的 `wxDom` 注入，以及本地 membership、plan 显示和退出登录行为。注入字节直接取自经过哈希验证的 Editor，不另造第二套实现。
- LIMIT 出现后仍可编辑草稿。点击聊天输入区域时，通过已有错误与额度状态的拥有者清除当前本地阻塞，之后可以手动发送；点击本身不发送消息、不清理草稿、不写历史。新的服务端 LIMIT 仍会再次阻止发送。
- 普通无感切换与指定账号切换复用 AI 登录的完整状态事务，同时同步 Cursor DB 与 Hook 读取的共享状态。只有凭证一致才报告成功；失败回退，各入口的写入串行执行。普通切换不启动或重载窗口。
- 缺少新 Session 时清理前一账号遗留的 Session；当前设备映射替换旧账号对应项，保留无关映射。Token 注入日志不再输出 Token 片段。
- Agents Window 的普通账号信息请求失败时结束 Loading，复用已有邮箱请求回退显示；旧身份的迟到结果不能覆盖新身份。
- 保留现有自动换号、自动续接开关。安装器只对齐已选中且能确认身份一致的当前账号，不另选账号。

本地 Pro 显示及本地状态清除不会改变服务端订阅权益或额度。此补丁允许对当前状态手动重试，实际请求结果仍由服务端决定。

## 适用基线

- macOS Apple Silicon；Cursor `3.17.19`。
- CursorProTools `0.2.19` 的已验证社区修改包，原 ASAR SHA-256：`76e824ac1da40191b5518677d204fc92ec196160435ee0a5796fb5040d5cd069`。
- 初次移植时，Editor 需要已有 `wxDom 5.2.3` 注入，Editor SHA-256：`91c79c397dfef49b860d05e522cfd1a373786fc4a5fe1e4252eded7e45ea572b`。
- `manifests/` 列出接受的 Agents 原始、中间和最终哈希。未知版本或其他修改会停止，不猜测替换位置。

这是针对上述实测基线的修复，不承诺兼容同版本的任意其他安装包。旧 Release 的 ZIP 不会因提交这组补丁而自动更新。

## 准备和安装

需要已有 Python 3 与 Node.js 24.18.0 或更高版本。脚本不安装或升级系统工具。从本仓库根目录执行：

```sh
cd patches/2026-10-14
npm ci --ignore-scripts
python3 prepare.py
npm run verify
```

`prepare.py` 默认读取 `/Applications/Cursor.app` 和 `/Applications/CursorProTools.app`，仅在本补丁目录生成 `build/`。它不修改应用或真实账号文件。便携应用可通过 `--tools-app` 指定真实路径；`--cursor-app` 可指定 Cursor 路径。

确认验证通过后，保存任务，使用 Cmd+Q **完全退出 Cursor 和 CursorProTools**，再执行：

```sh
python3 build/install.py install
```

安装修改 ProTools ASAR、其完整性元数据、Cursor Agents 脚本和对应校验值；备份应用代码与现有顶层签名，刷新已有 ad-hoc 顶层签名并验证。安装时重新核对所有基线，已发生其他修改会停止。

安装器同时检查当前账号身份。能确认 Cursor DB 与 ProTools 选中账号一致时，对齐共享凭证文件；不能确认时仍可安装修复代码，但输出 `installed_needs_login`，需在修复后的 ProTools 明确选择账号重新登录。真实凭证只在内存中比较和回退，不进入代码备份或报告。

若 macOS 报 `Operation not permitted`，先停止，检查“系统设置 → 隐私与安全性 → 应用管理”中运行安装命令的应用权限。不要反复执行安装或强行覆盖未知状态。

`build/` 包含安装备份和恢复记录，请保留。准备脚本不会覆盖已存在的输出目录；已有目录时可用 `--output` 指定新目录。`npm run verify` 默认检查 `build/`。

## 恢复代码

完全退出两个应用后：

```sh
python3 build/install.py restore
```

只恢复应用代码和签名，保留当前账号凭证。安装后应用发生其他变化时拒绝覆盖。

## 验证边界

仓库中的验证运行实际提取的函数，并使用合成凭证、临时 SQLite 和文件系统。覆盖账号事务一致性、串行写入、失败回退、旧 Session 清理、机器映射、LIMIT 点击与手动提交、监听清理及账号 Loading 回退。

发布前从原始应用代码备份重新生成：全部安装文件与当天用户确认可用的文件逐字节一致。ProTools 仅修改 `out/main/index.js`，其余 9701 个打包文件逐字节一致；链接与 unpacked 元数据保持。已修复安装也可只读准备，输出相同最终哈希。

这些验证不调用真实账户或模型服务。用户已确认本机修复可用；本仓库没有独立验证所有账号、服务端权益或其他机器。见 [verification.json](verification.json)。

`build/`、账号数据库、共享凭证、应用备份、完整 vendor bundle、安装审计和依赖目录均不提交到 Git。
