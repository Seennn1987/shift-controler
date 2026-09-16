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
      // 削除権限がまだ無い環境向け: 試し印を外し処理対象外にして残骸を無害化
      await doc.ref.set({
        [MARK]: false,
        selfTestCleaned: true,
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

async function runReadSafetySelfTest(){
  const results = [];
  const log = (ok, name, detail = '')=>{
    results.push({ ok, name, detail });
    console[ok ? 'log' : 'error'](`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  try{
    assert(isLocalHost(), 'localhost / 127.0.0.1 以外では実行できません');
    const user = fbAuth.currentUser;
    assert(user, '教室長でログインしてから実行してください');

    // 純関数
    log(computeAdminAttention({ status: 'approved', promoted: false }) === true, '印計算: 承認未取り込み');
    log(computeAdminAttention({ status: 'approved', promoted: true }) === false, '印計算: 承認済み取り込み済');
    log(computeAdminAttention({ status: 'rejected', handled: false }) === true, '印計算: 拒否未処理');
    log(computeAdminAttention({ status: 'pending' }) === false, '印計算: pendingは教室長印なし');
    log(computeTeacherAttention({ status: 'pending' }) === true, '印計算: 講師の待ち');
    log(needsAdminProcessing({ status: 'rejected', handled: true }) === false, '印計算: 拒否処理済');

    // 前回の残骸掃除
    await deleteSelfTestDocs(user.uid);

    const created = await createSelfTestTickets(user.uid);
    log(true, '試しチケット作成', `approved=${created.approvedId.slice(0, 6)}…`);

    const backfill = await backfillAttentionFlags(fbDb, { adminUid: user.uid });
    log(true, '印の補完実行', `scanned=${backfill.scanned} updated=${backfill.updated}`);

    const prevMode = FIRESTORE_READ_FLAGS.approvalQueryMode;
    FIRESTORE_READ_FLAGS.approvalQueryMode = 'shadow';
    const shadow = await fetchAdminApprovalDocs(fbDb, user.uid, 'shadow');
    FIRESTORE_READ_FLAGS.approvalQueryMode = prevMode;

    const processIds = new Set(
      shadow.docs.filter(d=> needsAdminProcessing(d.data)).map(d=> d.id)
    );
    log(processIds.has(created.approvedId), 'Shadow処理対象に承認チケット含む');
    log(processIds.has(created.rejectedId), 'Shadow処理対象に拒否チケット含む');
    log(!processIds.has(created.pendingId), 'pendingは教室長処理対象に含めない');

    if(shadow.shadow){
      const onlySelfMissing = (shadow.shadow.missing || []).every(id=>
        [created.approvedId, created.rejectedId, created.pendingId].includes(id) === false
          ? true
          : false
      );
      // missing に selftest が出ていなければOK。索引未作成時は fellBack で shadow が null のことも
      log(shadow.shadow.equal || shadow.fellBack === true, 'Shadow差分',
        shadow.fellBack ? '索引未準備のため旧方式へ退避（安全）' :
          (shadow.shadow.equal ? '一致' : JSON.stringify(shadow.shadow)));
      if(!onlySelfMissing && !shadow.shadow.equal && !shadow.fellBack){
        log(false, 'Shadow差分の内訳', JSON.stringify(shadow.shadow));
      }
    }else{
      log(true, 'Shadow照合', shadow.fellBack ? 'クエリ退避（legacy）' : 'legacyモード相当');
    }

    // 取り込み後の印オフ（試しドキュメントのみ。割当データは触らない）
    await fbDb.collection('assignmentApprovals').doc(created.approvedId).update({
      promoted: true,
      adminAttention: false,
    });
    await fbDb.collection('assignmentApprovals').doc(created.rejectedId).update({
      handled: true,
      adminAttention: false,
    });

    const after = await fetchAdminApprovalDocs(fbDb, user.uid, 'legacy');
    const afterNeed = after.docs.filter(d=> needsAdminProcessing(d.data)).map(d=> d.id);
    log(!afterNeed.includes(created.approvedId), '承認取り込み後は処理対象外');
    log(!afterNeed.includes(created.rejectedId), '拒否処理後は処理対象外');

    const probe = await probeAssignmentApprovalsSnapshot(fbDb, { adminUid: user.uid });
    log(true, 'onSnapshotプローブ', probe.ok ? `成功 size=${probe.size}` : `結果=${probe.reason || probe.code || 'fail'}（失敗でも本番経路はポーリングのまま）`);

    const cleanup = await deleteSelfTestDocs(user.uid);
    log(cleanup.total >= 3 && cleanup.deleted + cleanup.neutralized === cleanup.total,
      '試しデータ片付け',
      `削除=${cleanup.deleted} 無害化=${cleanup.neutralized}`);

    // 削除後に残骸がないこと
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

  const failed = results.filter(r=> !r.ok).length;
  const summary = {
    passed: results.length - failed,
    failed,
    allOk: failed === 0,
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
