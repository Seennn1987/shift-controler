# ピタコマ 開発引き継ぎ書（Cursor移行用）

作成日：2026年8月14日
対象：これから Cursor でこのプロジェクトの開発を引き継ぐ人（AIアシスタント含む）

---

## 1. このプロジェクトは何か

**ピタコマ**は、個別指導塾（株式会社みらいラボ運営、個別指導WAM 清澄白河校）向けの、講師シフト・コマ組み管理ツールです。2026年9月開校の同校で実際に使う前提で開発しています。

### 主な利用者と役割
- **教室長（オーナー）**：生徒登録、講師登録、生徒と講師のコマ単位マッチング、収支確認、休校日設定などを行う
- **講師**：自分専用のログインを持ち、月次の出勤可否（○特に希望／△対応可能／×不可）を提出し、教室長が組んだ授業を確認・承認する

### 目指す最終形
将来的に5店舗規模への展開を見込んでおり、複数教室長・複数講師での運用に耐える設計を目指しています。

---

## 1-1. 現状スナップショット（この引き継ぎ書が正しい前提となる時点）

- **最新コミット**：`b98dfbec623b929ddae24fccba4daa776529d5a0`（2026-08-14T07:59:37Z）
- このコミットの時点で、教室長UI・講師UIともに、ログイン・シフト提出・マッチング確定・承認までの一連の流れが動作確認済みです
- **これ以降にリポジトリへ変更が加わっている場合、本書の内容と実際のコードにズレが生じている可能性があります。着手前に`git log`で最新コミットを確認してください**

---

## 1-2. 開発環境の前提（Cursorで必ず最初に確認すること）

- **`package.json`は存在しません。** `npm install`などは不要で、`index.html`・`teacher.html`をブラウザで直接開けばそのまま動作します（VS Code / Cursorの「Live Server」拡張機能などを使うと便利です）
- Firebaseの設定値（`firebaseConfig`：apiKey・projectId等）は、機密情報ではありません（クライアント側で公開される前提の値です）。両ファイルの`<script>`冒頭に直書きされています
- GitHubリポジトリへのプッシュ権限（Personal Access Token等）は、このドキュメントには含まれていません。教室長（オーナー）に発行してもらってください

---

## 2. 現在の技術構成

- **フロントエンド**：素のHTML／CSS／JavaScript（フレームワークなし、ビルドツールなし）
- **ホスティング**：Firebase Hosting（`https://shift-controller-4ecaf.web.app/`）
- **バックエンド**：Firebase（Authentication + Firestore）。専用のサーバーサイドAPIは無く、フロントエンドから直接Firestoreを読み書きしている
- **リポジトリ**：`Seennn1987/shift-controler`（GitHub、mainブランチ）

### ファイル構成（現状）
| ファイル | 役割 | 行数目安 |
|---|---|---|
| `index.html` | 教室長用UI。生徒・講師管理、マッチング、カレンダー、収支分析など全機能を含む | 6,000行超 |
| `teacher.html` | 講師専用UI。マイカレンダー、シフト提出の2タブ構成 | 800行台 |

**この2ファイルに、HTML・CSS・JavaScriptがすべて直書きされています。** モジュール分割やコンポーネント化は一切されていません。

---

## 3. これまでの開発の進め方（重要：特殊な制約下での開発だった）

これまでの開発は、Claude（claude.ai、ブラウザ操作不可のテキストベース環境）とGitHub API経由のファイル編集だけで行われてきました。具体的には：

1. GitHub APIで現在のファイルを取得
2. `str_replace`的な文字列置換でコードを編集
3. Node.jsで関数を切り出して手動でロジック検証（本物のFirestoreには接続できないため、モックを書いて検証）
4. GitHub APIでコミット・プッシュ
5. **実際のブラウザでの動作確認は、常にユーザー（教室長）に依頼**し、コンソールログやスクリーンショットを共有してもらって初めて実機での挙動が分かる、という往復のサイクル

この制約により、**本来ローカルで数秒で気づけるはずのバグに、何時間もかかった事例が複数あります**（詳細は次章）。Cursorでの開発は、ローカルで実際にブラウザを開いて確認できるため、この非効率は大幅に解消されるはずです。

---

## 4. 直近で起きた重大バグとその教訓

Cursorでの開発時、同じ轍を踏まないための教訓として記録します。

### 4-1. `set(data, {merge:true})` にドット記法キーを渡すと、意図した通りにネストされない
```js
// バグがあった書き方
const monthKey = `months.${yearMonth}`;
await ref.set({ [monthKey]: entry }, {merge:true});
// → "months.2026-08" という文字通りの奇妙な名前のフィールドとして保存されてしまい、
//   months オブジェクトの中の "2026-08" というネスト構造にはならない
```
**教訓**：ドット記法でネストされたフィールドを部分更新したい場合は `ref.update({ [monthKey]: entry })` を使うこと。`set(..., {merge:true})` を使うなら、ネストしたい構造をJSオブジェクトとして正しく組み立てて渡す。

このバグにより、「講師がシフトを○にしても、数秒〜数十秒後に×へ戻って見える」という現象が発生し、原因特定までに非常に長い時間がかかりました。原因が分かるまでの間、以下の誤った仮説を経由しています（同じ轍を踏まないための記録）：
- ネットワーク環境（QUICプロトコルエラー）が原因という仮説 → 誤り
- `onSnapshot`（リアルタイム監視）が悪いという仮説 → `.get()`のポーリング方式に変更したが、これも副次的なバグ（後述）を生んだのみで、真因ではなかった
- ポーリングの競合（古いデータでの上書き）という仮説 → 部分的には正しかったが、根本原因ではなかった

**最終的に特定できた決め手は、画面上に診断パネルを埋め込み、「保存は成功したと出るが、直後の読み込みでは空になっている」という実際のログを直接確認できたこと**でした。ブラウザで直接デバッグできるCursor環境なら、この特定は数分で終わるはずです。

### 4-2. 教室長UIに「ログインしたのが本当に教室長か」を確認する仕組みが無かった
Firebase Authenticationは教室長・講師で同じログイン基盤（同一プロジェクト）を共有しています。講師専用に発行したメールアドレス・パスワードでも、教室長UIのログインフォームに入力すれば普通に認証が通ってしまい、「新規の教室長」として扱われ、データが何もない画面が表示される、という事故がありました（データ消失ではなく、誤ったアカウントでのログインが原因）。

**教訓**：ログイン画面ごとに「意図した役割のアカウントか」をログイン直後に必ず検証すること。`teacherAccounts`コレクションに存在するかどうかで判定を追加済み（`index.html`の`showAppScreen`関数）。

### 4-3. 講師のログインID（`teacherLoginUid`）が、複数のコレクションに分散して保存されており、同期漏れが繰り返し発生した
`teacherSchedules`・`teacherAssignments`・`teacherAccounts`の3箇所すべてに同じ`teacherLoginUid`を書き込む必要があったが、当初は更新箇所がバラバラで、一部だけ更新されて権限エラーになる事故が複数回起きました。最終的に`syncTeacherLoginUidEverywhere()`という共通関数に一本化して解決。

**教訓**：同じ値を複数コレクションにまたがって保持する設計は、更新漏れの温床になる。可能なら単一の情報源（Single Source of Truth）にするか、更新経路を必ず1つの関数に集約すること。

### 4-4. 祝日データなど、静的データが2ファイルに手作業でコピーされている
`index.html`の`HOLIDAYS_JP`配列を、`teacher.html`にも手動でコピーして複製しています。片方だけ更新すると即座にズレます。

**教訓**：ファイル分割・モジュール化すれば、この種の重複は`import`で解消できる。これも今回のCursor移行を後押しする理由の一つです。

---

## 5. 現在の技術的な負債・懸念点（Cursorで着手すべき優先候補）

1. **1ファイル6,000行超の`index.html`**：機能ごとにコンポーネント／モジュール分割すべき
2. **静的データの二重管理**（祝日データなど）：共通モジュール化で解消可能
3. **自動テストが皆無**：Node.jsでの手動検証に頼っており、リグレッションに気づきにくい
4. **フロントエンドから直接Firestoreへアクセス**：サーバーサイドの検証層が無いため、セキュリティルールのみが唯一の防波堤になっている（後述のルールは非常に重要）
5. **`onSnapshot`（リアルタイム監視）が特定のネットワーク環境で不安定になり、`.get()`の10秒ポーリング方式に変更した経緯がある**：Cursorでのローカル検証時に、あらためて`onSnapshot`が使えるか再検証する価値はある（ポーリングは即時性に欠けるため、可能ならリアルタイム監視に戻したい）

---

## 6. Firebase構成

- **プロジェクト**：`shift-controller-4ecaf`
- **認証方式**：メールアドレス＋パスワード（Firebase Authentication）
- **データベース**：Firestore

### Firestoreコレクション構成
| コレクション | 内容 |
|---|---|
| `appState/{adminUid}` | 教室長の全データ（teachers/students/assignments/absences等）を1ドキュメントに集約したもの |
| `teacherSchedules/{adminUid}_{teacherId}` | 講師の月次シフト提出データ |
| `teacherAccounts/{teacherLoginUid}` | 講師ログインIDと教室長・講師IDの紐付け |
| `scheduleChangeRequests/{docId}` | 講師からのシフト変更リクエスト |
| `assignmentApprovals/{docId}` | 講師への授業承認チケット |
| `assignmentCancellationRequests/{docId}` | 講師からの担当授業キャンセル依頼 |
| `teacherAssignments/{adminUid}_{teacherId}` | 講師のマイカレンダー表示用データ（教室長側から同期） |
| `classroomSettings/{adminUid}` | 休校日設定（定休日・祝日判定・個別休校日）。講師側にも同期される |

### 現在のFirestoreセキュリティルール（2026年8月14日時点で公開・動作確認済み）
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appState/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /teacherSchedules/{docId} {
      allow read: if request.auth != null && (
        resource == null ||
        request.auth.uid == resource.data.adminUid ||
        request.auth.uid == resource.data.teacherLoginUid
      );
      allow write: if request.auth != null && (
        request.auth.uid == resource.data.adminUid ||
        request.auth.uid == resource.data.teacherLoginUid
      );
      allow create: if request.auth != null && (
        request.auth.uid == request.resource.data.adminUid ||
        request.auth.uid == request.resource.data.teacherLoginUid
      );
    }
    match /teacherAccounts/{uid} {
      allow read: if request.auth != null && (
        request.auth.uid == uid ||
        request.auth.uid == resource.data.adminUid
      );
      allow create, update: if request.auth != null && request.auth.uid == request.resource.data.adminUid;
    }
    match /scheduleChangeRequests/{docId} {
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.adminUid ||
        request.auth.uid == resource.data.teacherLoginUid
      );
      allow update: if request.auth != null && request.auth.uid == resource.data.adminUid;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.teacherLoginUid;
    }
    match /assignmentApprovals/{docId} {
      allow read, update: if request.auth != null && (
        request.auth.uid == resource.data.adminUid ||
        request.auth.uid == resource.data.teacherLoginUid
      );
      allow create: if request.auth != null && request.auth.uid == request.resource.data.adminUid;
    }
    match /assignmentCancellationRequests/{docId} {
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.adminUid ||
        request.auth.uid == resource.data.teacherLoginUid
      );
      allow update: if request.auth != null && request.auth.uid == resource.data.adminUid;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.teacherLoginUid;
    }
    match /teacherAssignments/{docId} {
      allow read: if request.auth != null && (
        resource == null ||
        request.auth.uid == resource.data.adminUid ||
        request.auth.uid == resource.data.teacherLoginUid
      );
      allow write: if request.auth != null && request.auth.uid == resource.data.adminUid;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.adminUid;
    }
    match /classroomSettings/{adminUid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == adminUid;
    }
  }
}
```

**注意**：教室長・講師は同一のFirebase Authenticationユーザープールを共有しています。ログイン画面ごとに「意図した役割か」をアプリ側で必ず検証する必要があります（4-2参照）。

### 6-1. 講師アカウント発行の仕組み（サブのFirebaseアプリを使う理由）
教室長が「講師専用ログインを発行する」ボタンを押すと、`createUserWithEmailAndPassword`でFirebase Authenticationに新しいアカウントを作成しますが、これを教室長がログイン中の**メインのFirebaseセッションでそのまま実行すると、教室長自身のログインが新しく作った講師アカウントに上書きされてしまいます**。

これを避けるため、`getSecondaryAuth()`という関数で、`firebase.initializeApp(firebaseConfig, 'secondary')`という**名前付きの別インスタンス**を作り、そちらでアカウント作成だけを行い、作成後すぐにそのサブインスタンスからサインアウトする、という手順を踏んでいます（`index.html`内、`getSecondaryAuth`関数および`createTeacherLoginBtn`のクリックハンドラを参照）。この仕組みを崩すと、教室長が講師を追加登録するたびに自分自身がログアウトされる不具合が再発します。

### 6-2. 動作確認時の既知の癖
- **教室長（index）と講師（teacher.html）は別タブで同時ログイン可能**（2026-08 以降）。講師ページは Firebase の名前付きアプリ `teacher` で Auth を分離している。教室長は従来どおり default アプリ
- GitHub Pagesはプッシュ後、反映までに数分〜十数分のキャッシュ遅延が発生することがあります。「コードを直したのに挙動が変わらない」ときは、まずキャッシュを疑ってください。`teacher.html`のヘッダーには`BUILD: 2026-08-14-v9`という診断用バージョン表示を仕込んであるので、これが更新されているかで「最新コードを見ているか」を判別できます
- Firestoreの`.get()`は成功するのに`.onSnapshot()`だけ`Missing or insufficient permissions`になる、という原因不明の事象が発生した実績があります（詳細未解明のまま、`.get()`の10秒ポーリング方式に置き換えて回避した経緯があります。ネットワーク環境が原因という仮説は否定されています）。Cursorのローカル環境で再現するか、余裕があれば再調査する価値があります

### 6-3. 無視してよいコンソール警告
- `iframe.js` に出る `Info: The current domain is not authorized for OAuth operations...` という警告は、email/password認証には影響しないため無視して構いません
- `@firebase/firestore: ... You are overriding the original host. If you did not intend to override your settings, use {merge: true}.` という警告は、`fbDb.settings({experimentalAutoDetectLongPolling: true})`実行時に毎回出るものです。実害は確認されていませんが、根本原因は未調査です

### 6-4. デバッグ用に残っている仕込み（本番運用前に要検討）
`teacher.html`には、今回の不具合調査のために**黄色い診断パネル**（`#debugPanel`）と、各種`debugLog()`呼び出しが埋め込まれたままになっています。実際の講師が使う画面にこれが表示され続けるのは望ましくないため、Cursorでの開発再開時に、**残すか（開発者向けに隠しトグルにする等）、削除するか**を判断してください。

### 6-5. テスト用アカウント
開発中、以下のテスト講師アカウントで動作確認を行っています（本番投入前に削除・整理が必要です）。
- `myre.cette@gmail.com`（テスト講師）
- `myre.cette2@gmail.com`（テスト講師２）

---

## 7. すでに実装済みの主な機能

- 教室長：生徒・講師登録、コマ単位マッチング、代講管理、収支シミュレーション、休校日設定
- 講師：マイカレンダー（実日付ベースの担当授業確認・承認）、月次シフト提出、変更リクエスト
- 承認フロー：教室長がマッチングを確定 → ログインアカウントを持つ講師には「承認待ち」として提示 → 講師が承認して初めて正式に「確定」となる（ログインアカウントの無い講師は即時確定）
- 講師の欠勤・代講の登録と、その日だけの担当講師差し替え

---

## 8. 現在対応中・未着手の課題（次の開発者が着手すべきこと）

### 8-1. 【バグ・要修正】マッチングが「未来永劫」有効に見えてしまう
講師が8月分のシフトしか提出していないにもかかわらず、教室長UIで一度マッチングを確定させると、9月以降もカレンダー上ではその生徒と講師がマッチしたままの表示になってしまう。

**決定した仕様**：講師が提出していない月については「未マッチ」として扱い、通常の未マッチ生徒として再度マッチング候補に表示されるようにする。

### 8-2. 【UX再設計・要実装】マッチング体験の全面刷新
生徒の希望コマ入力後のマッチング体験が使いにくいため、以下の流れに変更する方針が決まっている。

1. カレンダー上部に、当該月時点でマッチングできていない生徒とコマ数を表示する（一部実装済みだが、8-1のバグと合わせて修正が必要）
2. カレンダー画面に「授業マッチング」ボタンを新設。クリックすると画面右から画面半分までパネルがスライドインし、カレンダー自体は画面左半分に収まる（未実装）
3. スライドインしたパネルには、最初に以下の3つの選択肢を表示する
   - 「全生徒分を自動マッチング」
   - 「自動マッチングを全て解除」
   - 「生徒名を選択」
4. 生徒を選択すると、**画面左のカレンダーにその生徒の希望コマが表示される**。そのコマをクリックすると、**画面右のパネルに、候補となる担当講師がマッチングアルゴリズムの優先度が高い順に一覧表示される**という設計に決定済み

**決定済みの仕様詳細**：
- 「全生徒分を自動マッチング」は、**講師が提出済みの月のみを対象とする**（未提出の月は自動マッチングの対象から除外する）
- コマ単位マッチング画面のUIは、「生徒の希望コマを縦一覧表示し、プルダウンで講師を選ぶ」方式ではなく、**カレンダー上のコマをクリック→右側に講師候補が優先度順に出る**方式に決定

この機能はまだ実装に着手していません。Cursorでの開発再開後、最初に取り組むべき候補です。

---

## 9. 決定済みの開発方針（今回の会話で合意した内容）

- **今後の開発はCursorに移行する**（claude.ai経由のGitHub API編集から切り替える）
- **フロントエンドはReact + Viteでの再構築を検討する**（今の1ファイル6,000行構成からの移行）
  - 理由：ローカルでビルド・動作確認ができる開発環境（Cursor）に移るのであれば、モジュール分割・型チェック・自動テストのメリットを享受できる状況が整うため
  - 移行は一気に全部書き直すのではなく、機能ごとに段階的に進める方向で検討中（詳細は未確定、次回相談事項）
- **Firebase（Authentication + Firestore）は引き続き使用する**。ホスティング先（GitHub Pages）も変更しない前提（Viteでビルドした静的ファイルをそのまま配信すればよい）
- 素のJavaScriptのままファイルだけ分割する案（ビルドツール無し）も選択肢として検討したが、Cursorへの移行を前提とするなら、Reactなどのフレームワーク導入のハードルは下がるという結論に至った

---

## 10. 参考になる競合・類似ツール（要参照）

以下は、学習塾・スクール向け管理システムの比較記事や公式サイトから確認できた、参考にすべき類似サービスです。特に「振替・コマ調整のUI」は、今回検討中のマッチングUX（8-2）の参考になります。

- **塾スマ**：時間割表を起点に、振替・出欠・日報・成績・指導記録を紐づけて管理するクラウド型システム。**振替授業を時間割上でドラッグ＆ドロップで調整でき、未確定の振替は「未振替リスト」として残せる**仕組みがあり、「調整中の授業」と「確定した授業」を同じ画面で追える設計。今回のマッチングUX刷新の参考になる可能性が高い。
  （出典：https://www.shopowner-support.net/attracting_customers/school/cramschool/school-management-system/ ）
- **KoBETool（コベツール）**：個別指導特化のコマ管理・時間割・座席表作成ツール。
  （出典：https://www.kobetool.net/ ）
- **塾マネ**：個別指導学習塾向けクラウド型業務管理システム。生徒管理・講師管理・請求管理・スケジュール管理を一元化。
  （出典：https://www.jukumane.jp/ ）
- **ジュクスル（JUKSL）**：講師のシフト提出・確認をスマートフォンから行える機能を持つ、塾・スクール向け管理システム。
  （出典：https://www.juksl.com/system ）
- **Grow / TechnoSMS など**：スクール管理システム全般の比較記事に掲載。機能一覧の参考になる。
  （出典：https://www.shopowner-support.net/attracting_customers/school/cramschool/school-management-system/ 、 https://www.technosms.com/ ）

**注記**：上記は2026年8月時点のWeb検索結果に基づく情報であり、実際の操作感までは確認できていません。UI設計の詳細な参考にする場合は、可能であれば実際にトライアル登録するなどして一次情報を確認することを推奨します。

---

## 11. Cursorでの開発を始める人へ

1. まずこのリポジトリ（`Seennn1987/shift-controler`）を clone してください
2. `index.html`・`teacher.html`をブラウザで直接開けば、そのまま動作確認できます（ビルド不要な現状の構成）
3. Firebaseの設定値（`firebaseConfig`）は両ファイルの`<script>`内に直書きされています。書き換える際は両ファイルとも修正すること
4. Firestoreのセキュリティルールを変更する場合は、上記6章の内容をベースに、Firebaseコンソールの「Firestore Database」→「ルール」タブで編集・公開してください
5. 本ドキュメントの8章にある未着手タスクから着手するのが望ましい流れです
6. 開発方針（React移行の進め方など）について、教室長（オーナー）と改めてすり合わせてから着手してください
