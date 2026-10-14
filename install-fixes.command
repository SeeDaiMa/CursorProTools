#!/bin/bash
# Install the reviewed Agents Window fixes using this release's patched app.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PATCH="$DIR/patches/2026-10-14"
PYTHON="$(command -v python3 || true)"

if [ -z "$PYTHON" ]; then
    echo "安装 Agents Window 修复需要已有 Python 3。请先准备 Python，再运行本脚本。"
    exit 1
fi

echo "请保存任务并完全退出 Cursor 和 CursorProTools。"
echo "安装会备份应用代码；只接受修复说明中列出的已验证版本和文件哈希。"

if [ ! -f "$PATCH/build/install-manifest.json" ]; then
    "$PYTHON" "$PATCH/prepare.py" --tools-app "$DIR/CursorProTools.app"
fi

"$PYTHON" "$PATCH/build/install.py" install
echo "安装完成。请查看上方账号对齐结果，再打开 CursorProTools 和 Cursor。"
