#!/bin/bash
# CursorProTools Portable 启动器
# 用途：启动应用；仅在用户自行提供本机数据库且目标不存在时迁移。
# 之后每次启动直接运行本文件即可，或直接双击 CursorProTools.app。

set -e

# 以脚本所在目录为基准定位应用
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$DIR/CursorProTools.app"
DATA_SRC="$DIR/portable-data/accounts.db"

APP_SUPPORT="$HOME/Library/Application Support/cursor-pro-tools"

if [ ! -d "$APP" ]; then
    echo "错误：找不到 $APP"
    echo "请保持 launcher.command 与 CursorProTools.app 在同一目录下。"
    exit 1
fi

# 可选本机迁移：公开包的 portable-data 仅含说明，不附带数据库。
mkdir -p "$APP_SUPPORT"
if [ -f "$DATA_SRC" ] && [ ! -f "$APP_SUPPORT/accounts.db" ]; then
    cp "$DATA_SRC" "$APP_SUPPORT/accounts.db"
    echo "已恢复账号数据 → $APP_SUPPORT/accounts.db"
fi

# 启动应用
open "$APP"
