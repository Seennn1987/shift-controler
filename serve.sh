#!/usr/bin/env bash
# ローカル開発用HTTPサーバー（Firebase Authは file:// より http://localhost 推奨）
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "ピタコマ 開発サーバーを起動しました"
echo "  教室長UI: http://localhost:${PORT}/index.html"
echo "  講師UI:   http://localhost:${PORT}/teacher.html"
echo "停止: Ctrl+C"
exec python3 -m http.server "$PORT"
