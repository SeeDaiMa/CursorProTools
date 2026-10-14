# CursorProTools — macOS Portable R3

Cursor 账号管理工具（`com.cursor.account.manager`）的 macOS 便携版。**当前最新发布为 `v0.2.19-portable-r3`，发布于 2026-10-14。**

R3 已内置当天的 ProTools 账号同步修复，并附带 Cursor 3.17.19 的 Agents Window 修复安装入口。应用本体运行与安装 Cursor 修复分别使用下面两个入口。

| 项目 | 当前版本 / 要求 |
|---|---|
| CursorProTools | 0.2.19，Portable R3 |
| 平台 | Apple Silicon（arm64），macOS 11+ |
| 配套 Cursor 修复 | 3.17.19，且文件哈希符合补丁清单 |
| 运行 ProTools | 自带 Electron，无需另装 Node.js |
| 安装 Agents Window 修复 | 需要已有 Python 3；R3 包无需 Node.js / npm |

## 最新源码更新：轻量化优化

2026-10-14 新增 [轻量化补丁与复现说明](patches/2026-10-14-lightweight/README.md)，已在本机安装、正常重启并检查界面。此次更新减少账号列表的重复渲染和单次请求中的重复读取，保留现有账号操作、刷新周期、页面状态及失败回退。

在合成 804 条账号的受控对照中，12 次相同数据刷新产生的账号行渲染从 9648 次降到 0 次；单行选择从 804 次降到 1 次。相同刷新场景的主线程任务时间约为 0.464 秒 → 0.078 秒。所有账号行仍保留，因此这组结果不代表常驻内存一定下降。验证范围和限制见 [验证记录](patches/2026-10-14-lightweight/verification.json)。

**这次发布的是补丁源码、测试与验证记录。下面的 R3 Release ZIP 保持原内容，尚未包含轻量化优化。**

## 下载最新版本

[打开 R3 Release](https://github.com/SeeDaiMa/CursorProTools/releases/tag/v0.2.19-portable-r3) · [始终打开最新 Release](https://github.com/SeeDaiMa/CursorProTools/releases/latest)

| 文件 | 大小 | 下载 |
|---|---|---|
| R3 完整便携 ZIP | 111,882,887 bytes，约 112 MB | [下载 ZIP](https://github.com/SeeDaiMa/CursorProTools/releases/download/v0.2.19-portable-r3/CursorProTools-v0.2.19-portable-r3-macos-arm64.zip) |
| ZIP 的 SHA-256 校验文件 | 117 bytes | [下载校验文件](https://github.com/SeeDaiMa/CursorProTools/releases/download/v0.2.19-portable-r3/CursorProTools-v0.2.19-portable-r3-macos-arm64.zip.sha256) |
| 配套 Cursor 官方 3.17.19 arm64 DMG | 270,474,407 bytes，约 270 MB | [下载官方安装包](https://github.com/SeeDaiMa/CursorProTools/releases/download/v0.2.19-portable/Cursor-darwin-3.17.19-arm64.dmg) |

将 ZIP 与 `.sha256` 放在同一目录，在该目录执行：

```sh
shasum -a 256 -c CursorProTools-v0.2.19-portable-r3-macos-arm64.zip.sha256
```

输出 ZIP 文件名后跟 `OK` 表示校验通过。R3 ZIP SHA-256 为：

```text
33bb7a1ae2070a566b7dc6490381c7a12156f8f83708b4a20ec403ed12e4ea68
```

## 解压与运行 ProTools

解压后保留完整目录：

```text
CursorProTools/
├── CursorProTools.app             # 已包含账号同步修复
├── launcher.command              # 启动包内的 ProTools
├── install-fixes.command         # 安装到本机 Cursor 的修复
├── README.md
├── CHANGELOG.md
├── PACKAGE.json                  # 应用版本、哈希与打包信息
├── SOURCE.txt                    # 本发布包对应的源码提交
├── portable-data/README.md
└── patches/2026-10-14/           # 补丁、安装/恢复脚本与验证源码
```

应用未经过 Apple 公证。首次被 macOS 拦截时，可在“系统设置 → 隐私与安全性”选择“仍要打开”。也可在解压目录中执行原有放行步骤：

```sh
xattr -cr CursorProTools.app
```

随后双击 `launcher.command`，或直接打开包内的 `CursorProTools.app`。`launcher.command` 启动的是同一目录中的应用，使用时请保留这两个文件的相对位置。

## 安装 Agents Window 修复

1. 保存任务，使用 Cmd+Q **完全退出 Cursor 和 CursorProTools**。仅关闭窗口可能仍有后台进程。
2. 确认本机已有 Python 3，然后双击解压目录内的 **`install-fixes.command`**。
3. 查看安装输出，按下面的结果处理。
4. 完成后使用包内新版 ProTools，重新打开 Cursor。

| 安装结果 | 含义与下一步 |
|---|---|
| `installed` 或 `already_installed`，且 `current_account_sources_aligned=true` | 修复代码已安装，当前选中账号的本地认证来源已对齐；可以重新打开应用。 |
| `installed_needs_login` 或 `already_installed_needs_login` | 修复代码已安装，但当前账号身份无法确认；在新版 ProTools 明确选择账号重新登录。 |
| 版本或哈希不匹配 | 安装停止。当前 Cursor 或 ProTools 不属于已验证基线，请按 [补丁说明](patches/2026-10-14/README.md) 核对版本。 |
| `Operation not permitted` | macOS 拒绝应用文件写入。先停止，在“隐私与安全性 → 应用管理”检查实际运行脚本的应用权限。 |

脚本默认修复 `/Applications/Cursor.app`，并使用本 ZIP 中的 `CursorProTools.app`。**初次移植需要 Editor 已有 `wxDom 5.2.3` 注入**；补丁只接受清单中的已验证文件哈希，不会猜测替换未知版本。

安装会备份应用代码与签名，核对应用完整性，并在身份能确认时对齐当前已选中账号的共享状态。它不另选账号，也不改变已有自动换号或自动续接开关。`current_account_sources_aligned=true` 表示本地来源一致，实际模型请求仍由服务端处理。

## 今天修复了什么

| 触发条件 | 修复后的行为 |
|---|---|
| Agents Window 与 Editor 的模型选择、本地账号状态行为不一致 | 移植 Editor 已有注入到 Agents Window，复用现有实现。 |
| LIMIT 出现后聊天框无法操作 | 保留草稿编辑；点击输入区域清除当前本地阻塞，之后由用户手动发送。点击本身不发送消息，新的服务端 LIMIT 仍会再次阻止发送。 |
| 无感切换后界面账号已变化，请求仍使用旧 Token | 普通切换与指定账号切换统一同步 Cursor DB 和 Hook 凭证，一致后才报告成功；普通切换不重载窗口。 |
| 多个登录入口同时写入，或切换过程失败 | 串行执行账号事务，失败回退；清理遗留 Session，替换当前设备的旧映射，保留无关映射。 |
| 账号资料请求失败后侧栏持续 Loading | 结束 Loading，使用已有邮箱请求回退显示，并阻止旧账号迟到结果覆盖当前身份。 |

Token 注入日志不再输出 Token 片段。本地 Pro 显示与本地 LIMIT 状态清除不会改变服务端订阅权益或额度。

见 [完整更新记录](CHANGELOG.md)、[详细补丁说明](patches/2026-10-14/README.md) 和 [受控验证记录](patches/2026-10-14/verification.json)。

## 恢复应用代码

准备文件、安装备份和恢复记录在 `patches/2026-10-14/build/`，请保留安装时的目录与路径，以便恢复。

如果已通过本修复包完成安装并生成恢复记录，先完全退出两个应用，再从解压目录执行：

```sh
python3 patches/2026-10-14/build/install.py restore
```

恢复应用代码和签名，保留当前账号凭证。安装后应用发生其他变化时，恢复脚本会停止，避免覆盖后续更新。

## 账号数据与迁移

公开 ZIP 不包含账号数据库、Token、cookies、真实账号状态或本机安装备份。账号数据仍在本机：

```text
~/Library/Application Support/cursor-pro-tools/accounts.db
```

首次启动会建立空数据库。迁移自己的账号数据时，先退出 ProTools，再将自己的数据库放入解压目录的 `portable-data/accounts.db`。启动器仅在目标数据库不存在时复制，已有数据库会保留。

加入个人数据库后的目录包含私人账号数据，请勿再次公开分享。

## 发布验证

R3 正式发布前已完成：

- ZIP 全部 171 个文件/链接条目的内容与 CRC 核对，链接类型及文件执行权限核对通过。
- 解压后应用通过 macOS 深度严格签名验证，架构为 arm64；仍为 ad-hoc 签名，尚未经过 Apple 公证。
- 解压后在没有 Node.js 的环境下，包内脚本只读准备成功，输出与当天已接受的修复文件一致。
- 五组受控验证通过，覆盖账号同步、串行写入、失败回退、Loading 回退及 LIMIT 点击重试。
- GitHub Release 返回的 ZIP SHA-256 与本地一致；发布副本已移除 14 份历史 ASAR 代码备份。

用户已确认本机修复可用。发布检查没有执行真实账号切换或模型请求，其他账号和环境仍需各自验证。

| 产物 | SHA-256 |
|---|---|
| ProTools ASAR | `7c089f09f492f3921e9ea3b892d3995f0dd9edcf5b401fc5fc191449b5cfbd97` |
| Agents 修复最终脚本 | `4362395f6d70705424bc4d62204307bfba42788ef67b323204d5639dcbb5cf1a` |

R3 对应打包源码提交为 [`f0a7013`](https://github.com/SeeDaiMa/CursorProTools/commit/f0a701333f8cb1df0b8ddc9b936a1f11773bb629)。历史 Release 保留，最新下载入口指向 R3。
