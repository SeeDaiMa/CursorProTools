# 2026-10-14 轻量化优化

本轮已安装到本机 CursorProTools，并完成正常重启与界面检查。修改范围为 ProTools ASAR 的 main 和 renderer 两个成员；其余 9700 个打包文件逐字节一致，CSS、preload、Cursor 脚本和账号持久化格式保持。

## 行为与优化边界

- 账号快照只有全部字段、字段存在性、键顺序和值一致时才复用。更新后的字段、凭证、会员、用量和时间派生值会采用新记录。只处理当前普通密集账号数组，其他输入原样保留。
- 每行的回调保持稳定，事件仍转交最新已提交的原处理器。React.memo 避免不必要的行渲染；所有行、按钮、状态、Tooltip 和详情 portal 保留。
- `/account` 响应与同步判断共用本次读取的 state；下一次请求和独立 timer 仍读取新 state，不跨调用缓存。
- 同一 SQLite 连接中复用会员 SELECT statement，仍执行原有两次读取、必要写入、写后验证和 finally close。
- 搜索、筛选、排序、全选、批量操作、原登录/注入/回退实现、同步周期、退出到托盘和访问页面状态保持。

本轮主要减少重复渲染、瞬时分配与重复 I/O。没有卸载页面或账号行，所以不承诺常驻 Renderer 内存显著下降。

## 验证

使用实际提取的 React、组件和 CSS，在隔离 Chrome 中以合成 804 条账号及惰性 API 桩对照：

- 12 次相同数据刷新：原版 9648 次账号行 render，优化版 0 次。
- 单行选择：原版 804 次账号行 render，优化版 1 次。
- 同场景主线程任务时间：约 0.464 秒 → 0.078 秒；此数字只代表该受控场景。
- DOM 节点、按钮数量、滚动高度和 639/640/767/768/1200 px 布局一致。
- 全量/过滤后的全选与批量调用、最新选择回调、进行中刷新、功能开关变化、详情与未保存备注、保存失败重试、尾部查找通过。
- 后台单元验证、原 R3 账号事务回归、完整 JS 语法检查、安装恢复和签名部分失败回退通过。
- 本机重启后主页及账号管理界面可见；安装哈希和 macOS deep/strict 签名核对通过。

验证没有发起真实账号切换或模型请求。完整记录见 [verification.json](verification.json)。

## 复现

需要 Node.js 24.18.0 和锁定开发依赖。读取 R3 ASAR 基线：

```sh
npm ci --ignore-scripts
node prepare.mjs BUILD_DIRECTORY R3_ASAR_PATH
node verify.mjs BUILD_DIRECTORY
node pack.mjs BUILD_DIRECTORY
node tests/make-fixtures.mjs BUILD_DIRECTORY
node tests/browser-check.mjs BUILD_DIRECTORY
```

`BUILD_DIRECTORY` 是新的输出目录，`R3_ASAR_PATH` 是 R3 包内 ASAR 或安装备份。以上操作只准备/测试，不修改真实应用。浏览器测试需要已安装的 Google Chrome，使用独立临时配置、白名单本机资源和合成 API。

## 本机恢复

当前安装备份与恢复记录在本机优化工作目录。先完全退出 ProTools，再执行：

```sh
python3 "/Users/Rea/.cache/cursor-protools-lightweight-20261014/install.py" restore
```

恢复应用代码和签名，保留当前账号状态；发现后续应用更新时拒绝覆盖。此步骤未更新 GitHub Release 二进制资产。
