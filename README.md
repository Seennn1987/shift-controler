# ピタコマ（shift-controler）

個別指導塾向けの講師シフト・コマ組み管理ツール。

詳しい背景・注意点・次にやることは [HANDOFF.md](./HANDOFF.md) にまとめてあります。

---

## ① 自分のパソコンで確認（開発中）

初回だけ:

```bash
cd "/Users/shoui/ピタコマ"
npm install
```

起動:

```bash
./serve.sh
```

ブラウザで開く:

- 教室長用 → http://localhost:5173/index.html
- 講師用   → http://localhost:5173/teacher.html

---

## ② 関係者と共有しているWebページ

**main ブランチに変更を送ると、自動で公開用ファイルが作られ、GitHub Pages に反映されます**（数分かかることがあります）。

- 教室長用 → https://seennn1987.github.io/shift-controler/
- 講師用   → https://seennn1987.github.io/shift-controler/teacher.html

```bash
cd "/Users/shoui/ピタコマ"
git add .
git commit -m "変更内容の説明"
git push
```

画面が古いままのときは、ブラウザの再読み込み（Mac なら `Cmd + Shift + R`）を試してください。

### 初回だけ（GitHub の設定）

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にしてください。  
（すでに設定済みなら不要です）

---

## 公開用ファイルを手動で作る場合

```bash
npm run build    # dist/ フォルダに成果物ができる
npm run preview  # ビルド結果をローカルで確認
```

---

## ログイン確認の注意

- **教室長と講師を、同じブラウザの別タブで同時にログインしないでください。** どちらか一方がログアウトされます。
- 教室長 → 通常のブラウザウィンドウ
- 講師   → **シークレットウィンドウ（プライベートブラウズ）** で開く

---

## ファイル構成（分割後）

| 場所 | 内容 |
|---|---|
| `index.html` / `teacher.html` | 画面の骨組み（HTML のみ） |
| `src/admin/` | 教室長用プログラム |
| `src/teacher/` | 講師用プログラム |
| `src/shared/` | 両方で共通（祝日・日付・Firebase など） |
| `src/admin/seed.js` | テスト用サンプルデータ（本番では未使用） |
| `dist/` | 公開用ファイル（`npm run build` の結果・Git には含めない） |

---

## 次に取り組む開発タスク

1. **動作確認** … 分割後の教室長・講師画面の総合テスト
2. **画面改善（8-2）** … カレンダーから「授業マッチング」パネルを開く新操作

詳細は [HANDOFF.md](./HANDOFF.md) と [docs/ファイル分割計画_v1.0.md](./docs/ファイル分割計画_v1.0.md) を参照してください。
