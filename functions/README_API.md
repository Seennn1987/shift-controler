# ピタコマ 読み取り専用API（readApi）

ピタコマに保存されているデータを、**GET だけ**で読み取るための API です。書き込み・更新・削除は一切行いません。

- 関数名: `readApi`（Cloud Functions 第2世代 / HTTPS / リージョン `asia-northeast1`）
- 本番URL: `https://asia-northeast1-shift-controller-4ecaf.cloudfunctions.net/readApi`
- タイムゾーン: Asia/Tokyo（「今日」は日本時間で判定）
- 授業一覧・給与・売上は、ピタコマ本体と**同じ計算プログラム**（`src/admin/absences.js` / `payroll.js` / `finance-metrics.js`）をまとめて使っています。画面と同じ数字になります。

---

## 認証

- すべてのリクエストに、URL の問い合わせ部分として `key=...` を付けてください。
- キーが無い、または違うときは `401` `{"error":"unauthorized"}` を返します。
- キーは Secret Manager の `PITAKOMA_API_KEY` に保存します。比較には `crypto.timingSafeEqual` を使います。
- **注意**: キーを URL に付ける方式のため、Google Cloud が自動で残す HTTP リクエストの記録（Cloud Run のリクエストログ）には、URL ごとキーが残ります。この関数が自分で出す記録には、キーは出しません。ログを見られる人を限るか、定期的にキーを差し替えてください。

## 共通の約束

| 項目 | 内容 |
|---|---|
| メソッド | GET のみ。それ以外は `405` |
| キャッシュ | すべての応答に `Cache-Control: no-store` |
| 回数制限 | 同じ接続元から 1分に60回、全体で 1分に300回まで。超えると `429`（`Retry-After` 付き） |
| 日時 | Firestore の Timestamp は `2026-09-28T17:30:00+09:00` 形式の文字列 |
| 参照型 | `teachers/abc123` のようなパス文字列 |
| エラー | `400`（形式の誤り）/ `404`（見つからない）/ `500`、本文は `{"error":"..."}` |

共通の応答の形:

```json
{
  "generatedAt": "2026-09-28T08:00:00+09:00",
  "count": 12,
  "items": [ ... ],
  "nextCursor": null
}
```

エンドポイントによって、`date` や `totals` などの項目が `count` と `items` の間に増えます。

---

## A. 汎用エンドポイント（全データ用）

| パス | 内容 | パラメータ |
|---|---|---|
| `/collections` | 全コレクションとその件数。サブコレクションも含む（各コレクションの先頭100件まで調べる） | なし |
| `/collection/{name}` | 指定コレクションの文書 | `limit`（既定100・最大500）、`cursor`、`where`、`orderBy` |
| `/doc/{path}` | 文書1件と、その下のサブコレクション名（`_subcollections`） | パスで指定（例: `/doc/teacherSchedules/abc123`）、または `?path=teacherSchedules/abc123` |

- 各文書には `_id` と `_path` が付きます。
- 次の項目は、APIキーが漏れても読めないように**すべてのエンドポイントで返しません**（検索・並べ替えにも使えません）: `loginEmail`, `email`, `retiredTeacherLogins`, `employeeNumber`, `perLessonRate`, `dailyTransport`, `earlyLessonException`, `raiseSchedule`, `notes`, `targetSchool`, `examType`, `discounts`、名前に password / token / secret / apikey を含む項目。
- `where` の形は `フィールド名 演算子 値` です（`==` `!=` `>=` `<=` `>` `<`）。
  - 例: `where=status==pending`
  - `where` は複数並べられます。例: `&where=adminUid==xxx&where=status==pending`
  - 数字は数値、`true` / `false` / `null` はそのままの意味として扱います。ほかは文字列です。数字を文字列として扱いたいときは `"..."` で囲みます。
- `orderBy` の形は `フィールド名` または `フィールド名:desc` です。
- `nextCursor` が `null` でなければ、その値を `cursor=` に付けて次のページを取ります。

## B. 用途別エンドポイント（整形済み）

| パス | 内容 | パラメータ |
|---|---|---|
| `/lessons` | 指定日の授業一覧 | `date=YYYY-MM-DD`（省略時は今日）、`teacher=principal`（教室長の担当だけ） |
| `/shifts` | 講師が出したシフト（○優先・△可能） | `from`、`to`（省略時は今日から7日間。最大62日） |
| `/students` | 生徒一覧（`gradeLabel`、`isActive` 付き。備考・志望校・受験・割引は返さない） | なし |
| `/teachers` | 講師一覧（給与条件・ログイン用メール・従業員番号・備考は返さない）。最後に教室長（`isPrincipal: true`）が付く | なし |
| `/payroll` | 給与集計（コマ給＋交通費＋事務給） | `month=YYYY-MM`（省略時は今月） |
| `/cost` | 売上・講師コスト・コスト率 | `month=YYYY-MM`（省略時は今月） |
| `/summary` | 指定日のまとめ | `date`（省略時は今日） |

### `/lessons` の items

```json
{
  "date": "2026-09-28",
  "weekday": "月",
  "period": 5,
  "startTime": "16:40",
  "endTime": "18:10",
  "studentName": "山田 太郎",
  "grade": "中3",
  "subject": "数学",
  "teacherName": "佐藤 花子",
  "isPrincipal": false,
  "status": "確定",
  "originalTeacherName": null,
  "studentId": "s1",
  "teacherId": "t1"
}
```

- 並び順は `period` の昇順、同じ時限の中は `teacherName` の順、その次に `studentName` の順です。
- `status` は次のどれかです。
  - `確定`
  - `承認待ち`：講師の承認待ち
  - `仮組み`
  - `代講`：`originalTeacherName` に、元の担当の講師名が入ります
  - `振替`
  - `講師欠勤`：その日、担当講師が休みで、代わりの講師が決まっていない授業
- 生徒が欠席した授業は一覧に出ません（アプリのカレンダーと同じ動きです）。
- 休校日は `open: false`、`closedReason`（「定休日」や祝日名など）、`items: []` を返します。
- 2科目を同じコマで受ける授業（2科目コマ）は、科目ごとに1行ずつ出ます。

### `/summary` の内容

| 項目 | 内容 |
|---|---|
| `totalLessons` | その日の総コマ数（講師欠勤を除く。2科目コマは1コマとして数える） |
| `teachersWorking` | 出勤する講師（`teacherName`, `isPrincipal`, `periods`, `lessonCount`） |
| `principalLessons` | 教室長が担当する授業（`period`, `startTime`, `studentName`, `subject`, `status`） |
| `lessonsByPeriod` | 時限ごとの授業数 |
| `attention` | 注意が必要な授業。「確定」以外のすべてと、振替先が決まっていない欠席（`生徒欠席（振替未定）`） |
| `items` | `/lessons` と同じ授業一覧 |

### `/payroll` の内容

- `items`: 講師ごとの行です。`lessonCount`, `workDays`, `lessonPay`, `transportPay`, `officeHours`, `officePay`, `total` が入ります。
- `totals`: 全員の合計です。
- `locked: true` のときは、給与集計タブで「確定」した時点の数字を返します。

### `/cost` の内容

- `items[0]` に次の項目が入ります。
  - `revenue`（売上）
  - `lessonCost`（コマ給）
  - `transportCost`（交通費）
  - `cost`（コマ給＋交通費）
  - `costRatio`（交通費込みのコスト率 %）
  - `costRatioWithoutTransport`（交通費を含めないコスト率 %）
  - `gross`（粗利）
  - `lessonCount`
  - `studentCount`
- キャンペーン「最初の◯コマ無料」（生徒の `freeLessonCount`）は、画面と同じく売上0円として数えます。

---

## データの一覧（Firestore）

サブコレクションは使っていません（2026年9月の調査時点）。

| コレクション | 文書ID | 用途 | 主なフィールド |
|---|---|---|---|
| `appState` | 教室長のログインID | 教室のほぼ全データ（1つの大きな文書） | 下の表を参照 |
| `teacherSchedules` | `{教室長ID}_{講師ID}` | 講師が出したシフト | `adminUid`, `teacherId`, `teacherLoginUid`, `months["YYYY-MM"] = { id, status: draft/submitted, days: { "YYYY-MM-DD": [{ slot, priority: preferred/normal }] }, submittedBy }`, `updatedAt` |
| `teacherAssignments` | `{教室長ID}_{講師ID}` | 講師用画面に出す担当授業の写し | `entries[]`（`day`, `slot`, `studentName`, `subject`, `approvalStatus`, `oneTimeDate` など）, `updatedAt` |
| `teacherSubjects` | `{教室長ID}_{講師ID}` | 講師の担当教科 | `subjects[]`（`level`, `subject`, `preferred`）, `updatedBy`, `updatedAt` |
| `teacherAccounts` | 講師のログインID | ログインと講師を結びつける情報 | `adminUid`, `teacherId`, `teacherName`, `left` |
| `assignmentApprovals` | 自動ID | 担当依頼の承認記録 | `teacherId`, `studentId`, `studentName`, `subject`, `day`, `slot`, `status: pending/approved/rejected/cancelled`, `promoted`, `handled`, `oneTimeDate`, `createdAt`, `adminAttention`, `teacherAttention` |
| `assignmentCancellationRequests` | 自動ID | 講師からの欠勤の申し出 | `teacherId`, `day`, `slot`, `dateStr`, `oneTimeDate`, `status: pending/approved/rejected` |
| `scheduleChangeRequests` | 自動ID | 講師からのシフト変更の申し出 | `teacherId`, `status`, `priority` など |
| `classroomSettings` | 教室長のログインID | 講師用画面に出す休校設定の写し | `regularClosedDays`, `closedHolidayDates`, `customClosures`, `updatedAt` |

### `appState` の中身

| フィールド | 内容 |
|---|---|
| `teachers[]` | 講師。`id`, `name`, `nameKana`, `perLessonRate`（1コマの給料）, `dailyTransport`（1日の交通費）, `raiseSchedule[]`（`yearMonth`, `rate`）, `earlyLessonException`（最初のXコマの単価）, `subjects[]`, `loginUid`, `loginEmail`, `employeeNumber`, `left`, `leftDate` |
| `students[]` | 生徒。`id`, `name`, `nameKana`, `level`（小学/中学/高校）, `grade`（数字）, `courses[]`（`id`, `subject`, `desiredSlots[]`）, `courseStartDate`, `freeLessonCount`（最初の◯コマ無料）, `left`, `leftDate` |
| `assignments[]` | 確定した授業。**毎週の曜日と時限**で持つ（`day: '月'`, `slot: 5`, `studentId`, `courseId`, `teacherId`, `subject`）。1回だけの授業は `oneTimeDate`。`teacherId: '__owner__'` は教室長 |
| `pendingAssignments[]` / `draftAssignments[]` | 承認待ち / 仮組み（形は `assignments` と同じ） |
| `absences[]` | 生徒の欠席。`date`, `slot`, `status: pending/resolved`, `makeup: { date, slot, teacherId }`（振替先） |
| `teacherAbsences[]` | 講師の欠勤。`teacherId`, `date`, `slots[]`, `studentIdsBySlot` |
| `teacherSubstitutions[]` | 代講。`teacherId`（元の講師）, `substituteTeacherId`, `date`, `slot`, `studentId` |
| `terms[]` | 講習などの期間 |
| `regularClosedDays` / `closedHolidayDates` / `customClosures` | 定休日の曜日 / 休みにする祝日 / 個別の休校日 |
| `tuitionRates` | 学年区分ごとの1コマの授業料（例: `{"小学":2900,"中学":3900,"高校":5200}`） |
| `officeHourlyRate` / `payrollOfficeHours` / `payrollLocks` | 事務の時給 / 月ごとの事務時間 / 確定した月の給与 |
| `finGradientMin` / `finGradientMax` | コスト率の色分けの基準 |
| `roomCapacity` / `teacherCapacity` / `matchingPriority` / `preferredPairs` / `googleCalendar` | 教室の設定 |

### 日付・時限の形式

- 日付は `"YYYY-MM-DD"`、月は `"YYYY-MM"` の文字列です。
- 曜日は `"月"` のような漢字1文字です。
- 時限は番号（4〜7）で保存されます。時刻はコードの中で決まっています。

| 時限 | 時刻 |
|---|---|
| 4講 | 14:50〜16:20 |
| 5講 | 16:40〜18:10 |
| 6講 | 18:20〜19:50 |
| 7講 | 20:00〜21:30 |

- Timestamp 型で保存されているのは `updatedAt` / `createdAt` だけです。
- 日付ごとの授業・給与・売上は保存されていません。API がアプリと同じ計算で作ります。

### Firestore 以外

- Firebase Authentication には、教室長と講師のログイン情報があります。この API では読みません。
- Cloud Storage は使っていません。

### 教室長が2人以上いる場合

`appState` が1件だけなら、自動でその教室を対象にします。2件以上あるときは、`functions/.env` に次の行を書いてから公開し直してください。

```
PITAKOMA_ADMIN_UID=対象の教室長のログインID
```

---

## Secret（APIキー）の設定

```bash
cd /Users/shoui/ピタコマ
npx firebase functions:secrets:set PITAKOMA_API_KEY
# 聞かれたら、長くて推測しにくい文字列を貼り付ける（例: openssl rand -hex 32 で作る）
```

## 公開手順

```bash
cd /Users/shoui/ピタコマ
npx firebase deploy --only functions
```

- 公開の前に、自動でファイルをまとめる作業（`npm --prefix functions run build`）が走ります。
- 既存の `npm run deploy`（画面の公開）は、今までどおり画面とルールだけを公開します。関数は含みません。

## キーの差し替え

```bash
npx firebase functions:secrets:set PITAKOMA_API_KEY   # 新しいキーを入れる
npx firebase deploy --only functions                  # 新しいキーで動かし直す
npx firebase functions:secrets:prune                  # 使っていない古い版を片付ける（任意）
```

## Emulator での確認

Firestore Emulator には Java が必要です。

```bash
cd /Users/shoui/ピタコマ/functions
npm install
printf 'PITAKOMA_API_KEY=emulator-test-key\n' > .secret.local
npm run build
cd .. && npx firebase emulators:start --only functions,firestore
# 別のターミナルで、見本データを入れる（Emulator が起動していないと書き込まずに止まります）
cd functions && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node test/seed-emulator.mjs
curl "http://127.0.0.1:5001/shift-controller-4ecaf/asia-northeast1/readApi/lessons?date=2026-09-28&key=emulator-test-key"
```

## curl の例（公開後）

```bash
BASE=https://asia-northeast1-shift-controller-4ecaf.cloudfunctions.net/readApi
KEY=XXXX

curl "$BASE/lessons?date=2026-09-28&key=$KEY"
curl "$BASE/lessons?teacher=principal&key=$KEY"
curl "$BASE/summary?date=2026-09-28&key=$KEY"
curl "$BASE/shifts?from=2026-09-28&to=2026-10-04&key=$KEY"
curl "$BASE/students?key=$KEY"
curl "$BASE/teachers?key=$KEY"
curl "$BASE/payroll?month=2026-09&key=$KEY"
curl "$BASE/cost?month=2026-09&key=$KEY"
curl "$BASE/collections?key=$KEY"
curl "$BASE/collection/assignmentApprovals?where=status==pending&limit=50&key=$KEY"
curl "$BASE/doc/appState/{教室長ID}?key=$KEY"
```

## 応答の例

`/summary?date=2026-10-05`（見本データの場合）:

```json
{
  "generatedAt": "2026-09-28T22:07:09+09:00",
  "count": 2,
  "date": "2026-10-05",
  "weekday": "月",
  "open": true,
  "closedReason": null,
  "totalLessons": 2,
  "teachersWorking": [
    { "teacherName": "佐藤 花子", "isPrincipal": false, "periods": [6], "lessonCount": 1 },
    { "teacherName": "鈴木 一郎", "isPrincipal": false, "periods": [5], "lessonCount": 1 }
  ],
  "principalLessons": [],
  "lessonsByPeriod": [
    { "period": 4, "startTime": "14:50", "count": 0 },
    { "period": 5, "startTime": "16:40", "count": 1 },
    { "period": 6, "startTime": "18:20", "count": 1 },
    { "period": 7, "startTime": "20:00", "count": 0 }
  ],
  "attention": [
    { "period": 4, "startTime": "14:50", "studentName": "高橋 健", "subject": "英語", "teacherName": null, "status": "生徒欠席（振替未定）" },
    { "period": 5, "startTime": "16:40", "studentName": "伊藤 さくら", "subject": "英語", "teacherName": "鈴木 一郎", "status": "承認待ち" },
    { "period": 6, "startTime": "18:20", "studentName": "田中 花", "subject": "算数", "teacherName": "佐藤 花子", "status": "代講" }
  ],
  "items": [ "...（/lessons と同じ）" ],
  "nextCursor": null
}
```

`/cost?month=2026-09`:

```json
{
  "generatedAt": "2026-09-28T22:07:40+09:00",
  "count": 1,
  "items": [
    { "yearMonth": "2026-09", "studentCount": 4, "lessonCount": 12, "revenue": 42200, "lessonCost": 12400, "transportCost": 3600, "cost": 16000, "costRatio": 37.9, "costRatioWithoutTransport": 29.4, "gross": 26200 }
  ],
  "nextCursor": null
}
```

## Firestore の読み取り量の目安

- 用途別エンドポイント: 1回あたり、`appState` 1件と講師の人数分の `teacherSchedules`
- `/collection`: 返した件数＋1件
- `/collections`: コレクションの数だけ件数を数える処理（count）
