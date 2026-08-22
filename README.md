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

## ② 関係者と共有しているWebページ（Firebase Hosting）

**main ブランチに変更を送ると、自動で公開用ファイルが作られ、Firebase Hosting に反映されます**（数分かかることがあります）。

- 教室長用 → https://shift-controller-4ecaf.web.app/
- 講師用   → https://shift-controller-4ecaf.web.app/teacher.html

（同じ内容は https://shift-controller-4ecaf.firebaseapp.com/ からも開けます）

```bash
cd "/Users/shoui/ピタコマ"
git add .
git commit -m "変更内容の説明"
git push
```

画面が古いままのときは、ブラウザの再読み込み（Mac なら `Cmd + Shift + R`）を試してください。

### 初回だけ（GitHub から自動公開する設定）

GitHub のリポジトリで **Settings → Secrets and variables → Actions** を開き、次の秘密情報を1つ追加してください。

| 名前 | 内容 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase のサービスアカウント JSON（下記手順で取得） |

**サービスアカウント JSON の取り方**

1. [Firebase Console](https://console.firebase.google.com/) → プロジェクト `shift-controller-4ecaf`
2. 歯車 → **プロジェクトの設定** → **サービス アカウント**
3. **新しい秘密鍵の生成** → ダウンロードした JSON ファイルの**中身をすべて**コピー
4. GitHub の `FIREBASE_SERVICE_ACCOUNT` に貼り付けて保存

### パソコンから直接公開する場合

```bash
npm install
npx firebase login
npm run deploy
```

---

## 旧URL（GitHub Pages）について

以前の https://seennn1987.github.io/shift-controler/ は更新を止めました。**今後は上記 Firebase Hosting の URL を使ってください**（ログインが安定します）。

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
