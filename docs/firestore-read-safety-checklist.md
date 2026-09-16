# Firestore読み取り削減：安全チェックリスト

作成日: 2026-09-17  
目的: クエリ変更のたびに、現行仕様との一致を確認する（データ破壊防止）

## 0. 件数の見方（Phase 0）

Firebase コンソール → Firestore → 各コレクションのドキュメント数の目安を記録する。

| コレクション | 確認日 | 件数目安 | メモ |
|---|---|---|---|
| assignmentApprovals | | | |
| teacherSchedules | | | |
| teacherSubjects | | | |
| assignmentCancellationRequests | | | |

読み取り削減の緊急度: 承認チケットが多いほど Phase 2 の効果が大きい。

## 1. 教室長の取り込み条件（変更禁止の仕様）

コード根拠: `src/admin/students-persistence.js`

| 条件 | 処理 | 関数 |
|---|---|---|
| `status === 'approved' && !promoted` | 承認待ち → 確定へ取り込む | `promotePendingAssignment` |
| `status === 'rejected' && !handled` | 承認待ちを片付け | `rejectPendingAssignment` |

**禁止**: 「`pending` だけ読む」を教室長ポーリングに使うこと（上記を取りこぼす）。

印 `adminAttention` の正解値（現行ロジックの写し）:

```
adminAttention =
  (status === 'approved' && promoted !== true) ||
  (status === 'rejected' && handled !== true)
```

## 2. 講師側で必要な承認データ

コード根拠: `src/teacher/approvals.js`

| 用途 | 条件 |
|---|---|
| 新しい授業（待ち） | `status === 'pending'` |
| 取消しお知らせ | `status === 'cancelled' && cancelledByAdmin && !teacherRead` または `pending && cancelNoticeUnread && lastCancelledDate` |
| キャンセル依頼 | `assignmentCancellationRequests` の `status === 'pending'` |

印 `teacherAttention` の正解値:

```
teacherAttention =
  status === 'pending' ||
  (status === 'cancelled' && cancelledByAdmin && !teacherRead) ||
  (!!cancelNoticeUnread && !!lastCancelledDate)
```

## 3. 各 Phase のゲート

### Phase 1（印の書き込み・補完）

- [ ] 新規: 講師承認 → `adminAttention: true`
- [ ] 教室長取り込み後 → `adminAttention: false`（`promoted` / `handled` と同時）
- [ ] 補完は `adminAttention` のみ（status 等は無変更）
- [ ] 索引 `adminUid + adminAttention` / `teacherLoginUid + teacherAttention` をデプロイ

### Phase 2（Shadow → 切替）

- [ ] Shadow: 旧クエリで処理、新クエリは差分ログのみ
- [ ] 処理対象 ID 集合の差分がゼロ
- [ ] 承認→確定 / 拒否→待ちから消える が現行どおり
- [ ] 切替後もログイン時1回の全件保険が動く
- [ ] 問題時は `approvalQueryMode: 'legacy'` に戻せる

### Phase 3（監視プローブ）

- [ ] 本番の取り込み経路はポーリングのまま
- [ ] プローブ成功/失敗がログに残る
- [ ] 権限エラー再現時は Phase 4 を進めない

### Phase 4（監視導入）

- [ ] フラグ既定 OFF
- [ ] エラー時は自動でポーリングへ退避
- [ ] ローカル編集ガードを維持

### Phase 5（整理）

- [ ] 削除しない（`softArchived` 等の印のみ）
- [ ] 既定では自動実行しない

## 4. 手動検証シナリオ（毎回）

1. 生徒に講師を割り当てて承認待ちを作る
2. 講師が承認する
3. 教室長画面で確定に入る
4. 別ケースで拒否し、承認待ちから消える
5. 教室長＋講師の二重タブ
6. 裏タブに逃がして戻る
