#!/usr/bin/env bash
# ローカル開発用（Vite）
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "初回セットアップ: npm install を実行します..."
  npm install
fi
echo "ピタコマ 開発サーバーを起動します"
echo "  教室長UI → http://localhost:5173/index.html"
echo "  講師UI   → http://localhost:5173/teacher.html"
echo "停止: Ctrl+C"
exec npm run dev
