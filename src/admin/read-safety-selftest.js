/**
 * localhost 専用の読み取り安全レイヤ自己検証。
 * - appState / 実生徒・実割当は変更しない
 * - assignmentApprovals に印付き試しデータだけ作成し、最後に削除する
 */
import { fbAuth, fbDb } from './state.js';
import {
  FIRESTORE_READ_FLAGS,
  needsAdminProcessing,
  computeAdminAttention,
  computeTeacherAttention,
  fetchAdminApprovalDocs,
  backfillAttentionFlags,
  probeAssignmentApprovalsSnapshot,
  listenAttentionApprovals,
  softArchiveProcessedApprovals,
} from '../shared/firestore-read-safety.js';

const MARK = 'pitakomaSelfTest';
const PREFIX = '__SELFTEST__';

function isLocalHost(){
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

function assert(cond, msg){
  if(!cond) throw new Error(msg);
}

async function deleteSelfTestDocs(adminUid){
  const snap = await fbDb.collection('assignmentApprovals')
    .where('adminUid', '==', adminUid)
    .get();
  const targets = snap.docs.filter(d=> d.data()[MARK] === true);
  let deleted = 0;
  let neutralized = 0;
  for(const doc of targets){
    try{
      await doc.ref.delete();
      deleted += 1;
    }catch(err){
      await doc.ref.set({
        [MARK]: false,
        selfTestCleaned: true,
        softArchived: true,
        adminAttention: false,
        teacherAttention: false,
        promoted: true,
        handled: true,
      }, { merge: true });
      neutralized += 1;
      console.warn('[selftest] 削除不可のため無害化', doc.id, err?.code || err?.message);
    }
  }
  return { deleted, neutralized, total: targets.length };
}

async function createSelfTestTickets(adminUid){
  const stamp = Date.now();
  const base = {
    adminUid,
    teacherId: `${PREFIX}teacher`,
    teacherLoginUid: `${PREFIX}login`,
    studentId: `${PREFIX}student`,
    studentName: `${PREFIX}生徒`,
    studentGrade: '小学1',
    subject: '算数',
    day: '月',
    slot: 4,
    [MARK]: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    selfTestStamp: stamp,
  };

  const approvedRef = await fbDb.collection('assignmentApprovals').add({
    ...base,
    status: 'approved',
    promoted: false,
    adminAttention: true,
    teacherAttention: false,
    note: 'selftest-approved',
  });
  const rejectedRef = await fbDb.collection('assignmentApprovals').add({
    ...base,
    status: 'rejected',
    handled: false,
    adminAttention: true,
    teacherAttention: false,
    note: 'selftest-rejected',
  });
  const pendingRef = await fbDb.collection('assignmentApprovals').add({
    ...base,
    status: 'pending',
    adminAttention: false,
    teacherAttention: true,
    note: 'selftest-pending',
  });

  return {
    stamp,
    approvedId: approvedRef.id,
    rejectedId: rejectedRef.id,
    pendingId: pendingRef.id,
  };
}

function listenOnceForIds(adminUid, expectedIds, timeoutMs = 12000){
  return new Promise((resolve)=>{
    let unsub = null;
    let settled = false;
    const finish = (result)=>{
      if(settled) return;
      settled = true;
      try{ unsub?.(); }catch(_e){ /* ignore */ }
      resolve(result);
    };
    const timer = setTimeout(()=> finish({ ok: false, reason: 'timeout' }), timeoutMs);
    try{
      unsub = listenAttentionApprovals(fbDb, {
        adminUid,
        onData: (docs)=>{
          const ids = new Set(docs.map(d=> d.id));
          const all = expectedIds.every(id=> ids.has(id));
          if(all){
            clearTimeout(timer);
            finish({ ok: true, size: docs.length });
          }
        },
        onError: (err)=>{
          clearTimeout(timer);
          finish({ ok: false, reason: 'error', message: err?.message, code: err?.code });
        },
      });
    }catch(err){
      clearTimeout(timer);
      finish({ ok: false, reason: 'throw', message: err?.message });
    }
  });
}

async function runReadSafetySelfTest(){
  const results = [];
  const log = (ok, name, detail = '')=>{
    results.push({ ok, name, detail });
    console[ok ? 'log' : 'error'](`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const flagSnapshot = {
    approvalQueryMode: FIRESTORE_READ_FLAGS.approvalQueryMode,
    useSnapshotListeners: FIRESTORE_READ_FLAGS.useSnapshotListeners,
    enableSoftArchive: FIRESTORE_READ_FLAGS.enableSoftArchive,
  };

  try{
    assert(isLocalHost(), 'localhost / 127.0.0.1 以外では実行できません');
    const user = fbAuth.currentUser;
    assert(user, '教室長でログインしてから実行してください');

    log(true, '現行フラグ', JSON.stringify(flagSnapshot));

    log(computeAdminAttention({ status: 'approved', promoted: false }) === true, '印計算: 承認未取り込み');
    log(computeAdminAttention({ status: 'approved', promoted: true }) === false, '印計算: 承認済み取り込み済');
    log(computeAdminAttention({ status: 'rejected', handled: false }) === true, '印計算: 拒否未処理');
    log(computeAdminAttention({ status: 'pending' }) === false, '印計算: pendingは教室長印なし');
    log(computeTeacherAttention({ status: 'pending' }) === true, '印計算: 講師の待ち');
    log(needsAdminProcessing({ status: 'rejected', handled: true }) === false, '印計算: 拒否処理済');

    await deleteSelfTestDocs(user.uid);
    const created = await createSelfTestTickets(user.uid);
    log(true, '試しチケット作成', `approved=${created.approvedId.slice(0, 6)}…`);

    const backfill = await backfillAttentionFlags(fbDb, { adminUid: user.uid });
    log(true, '印の補完実行', `scanned=${backfill.scanned} updated=${backfill.updated}`);

    // --- Shadow ---
    const shadow = await fetchAdminApprovalDocs(fbDb, user.uid, 'shadow');
    const shadowNeed = new Set(shadow.docs.filter(d=> needsAdminProcessing(d.data)).map(d=> d.id));
    log(shadowNeed.has(created.approvedId), 'Shadow処理対象に承認チケット含む');
    log(shadowNeed.has(created.rejectedId), 'Shadow処理対象に拒否チケット含む');
    log(!shadowNeed.has(created.pendingId), 'pendingは教室長処理対象に含めない');
    log(shadow.shadow?.equal === true || shadow.fellBack === true, 'Shadow差分',
      shadow.fellBack ? '索引未準備のため退避' : (shadow.shadow?.equal ? '一致' : JSON.stringify(shadow.shadow)));

    // --- attention ---
    const attention = await fetchAdminApprovalDocs(fbDb, user.uid, 'attention');
    const attentionIds = new Set(attention.docs.map(d=> d.id));
    const attentionNeed = new Set(attention.docs.filter(d=> needsAdminProcessing(d.data)).map(d=> d.id));
    log(attentionNeed.has(created.approvedId), 'attention処理対象に承認チケット含む');
    log(attentionNeed.has(created.rejectedId), 'attention処理対象に拒否チケット含む');
    log(!attentionIds.has(created.pendingId), 'attention取得にpendingを含めない');
    log(
      attentionNeed.has(created.approvedId) && attentionNeed.has(created.rejectedId) && !attentionNeed.has(created.pendingId),
      'attentionとShadowの処理対象が試しデータで一致'
    );

    // --- 監視 ---
    const listen = await listenOnceForIds(user.uid, [created.approvedId, created.rejectedId]);
    log(listen.ok, '監視で試し承認・拒否を受信', listen.ok ? `size=${listen.size}` : `${listen.reason} ${listen.code || ''}`.trim());

    const probe = await probeAssignmentApprovalsSnapshot(fbDb, { adminUid: user.uid });
    log(probe.ok === true, 'onSnapshotプローブ成功', probe.ok ? `size=${probe.size}` : `${probe.reason || probe.code}`);

    // --- softArchive: 処理中のものは触らない ---
    const archiveWhileActive = await softArchiveProcessedApprovals(fbDb, user.uid, {
      olderThanDays: 0,
      force: true,
      onlySelfTest: true,
    });
    const approvedBefore = await fbDb.collection('assignmentApprovals').doc(created.approvedId).get();
    const pendingBefore = await fbDb.collection('assignmentApprovals').doc(created.pendingId).get();
    log(approvedBefore.data()?.softArchived !== true, '未処理の承認はsoftArchiveされない');
    log(pendingBefore.data()?.softArchived !== true, 'pendingはsoftArchiveされない');
    log(true, '未処理中のsoftArchive実行', `archived=${archiveWhileActive.archived}`);

    await fbDb.collection('assignmentApprovals').doc(created.approvedId).update({
      promoted: true,
      adminAttention: false,
    });
    await fbDb.collection('assignmentApprovals').doc(created.rejectedId).update({
      handled: true,
      adminAttention: false,
    });

    const afterAttention = await fetchAdminApprovalDocs(fbDb, user.uid, 'attention');
    const afterIds = new Set(afterAttention.docs.map(d=> d.id));
    log(!afterIds.has(created.approvedId), 'attention: 承認処理後は取得から消える');
    log(!afterIds.has(created.rejectedId), 'attention: 拒否処理後は取得から消える');

    const archivedDone = await softArchiveProcessedApprovals(fbDb, user.uid, {
      olderThanDays: 0,
      force: true,
      onlySelfTest: true,
    });
    const approvedAfter = await fbDb.collection('assignmentApprovals').doc(created.approvedId).get();
    const rejectedAfter = await fbDb.collection('assignmentApprovals').doc(created.rejectedId).get();
    const pendingAfter = await fbDb.collection('assignmentApprovals').doc(created.pendingId).get();
    log(approvedAfter.data()?.softArchived === true, '処理済み承認にsoftArchived');
    log(rejectedAfter.data()?.softArchived === true, '処理済み拒否にsoftArchived');
    log(pendingAfter.data()?.softArchived !== true, 'pendingは最後までsoftArchiveされない');
    log(archivedDone.archived >= 2, '処理済みsoftArchive件数', `archived=${archivedDone.archived}`);

    // 現行本番フラグの健全性メモ
    log(
      FIRESTORE_READ_FLAGS.approvalQueryMode === 'attention' || FIRESTORE_READ_FLAGS.approvalQueryMode === 'shadow',
      '本番クエリモードが想定内',
      FIRESTORE_READ_FLAGS.approvalQueryMode
    );

    const cleanup = await deleteSelfTestDocs(user.uid);
    log(cleanup.total >= 3 && cleanup.deleted + cleanup.neutralized === cleanup.total,
      '試しデータ片付け',
      `削除=${cleanup.deleted} 無害化=${cleanup.neutralized}`);

    const leftSnap = await fbDb.collection('assignmentApprovals')
      .where('adminUid', '==', user.uid)
      .get();
    const left = leftSnap.docs.filter(d=> d.data()[MARK] === true);
    log(left.length === 0, '試しデータ残骸ゼロ');

  }catch(err){
    log(false, '例外', err.message || String(err));
    try{
      const user = fbAuth.currentUser;
      if(user) await deleteSelfTestDocs(user.uid);
    }catch(_e){ /* ignore */ }
  }

  // フラグは検証中に変えない方針（リポジトリ既定のみ変更）。念のため復元
  FIRESTORE_READ_FLAGS.approvalQueryMode = flagSnapshot.approvalQueryMode;
  FIRESTORE_READ_FLAGS.useSnapshotListeners = flagSnapshot.useSnapshotListeners;
  FIRESTORE_READ_FLAGS.enableSoftArchive = flagSnapshot.enableSoftArchive;

  const failed = results.filter(r=> !r.ok).length;
  const summary = {
    passed: results.length - failed,
    failed,
    allOk: failed === 0,
    flags: { ...FIRESTORE_READ_FLAGS },
    results,
  };
  console.log('\n=== 読み取り安全レイヤ自己検証 ===');
  console.log(summary.allOk ? '✅ すべて成功' : `❌ 失敗 ${failed}件`);
  console.log(summary);
  return summary;
}

function installReadSafetySelfTest(){
  if(!isLocalHost()) return;
  window.__pitakomaReadSafetySelfTest = runReadSafetySelfTest;
  console.info('[ピタコマ] 読み取り安全の自己検証: ログイン後に __pitakomaReadSafetySelfTest() を実行');
}

export { installReadSafetySelfTest, runReadSafetySelfTest };
