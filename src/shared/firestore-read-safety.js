/**
 * Firestore 読み取り削減の安全レイヤ。
 * - 授業データ（assignments 等）は触らない
 * - 承認チケットの status を一括変更・削除しない
 * - クエリ切替はフラグで即ロールバック可能
 */

/** @typedef {'legacy' | 'shadow' | 'attention'} ApprovalQueryMode */

export const FIRESTORE_READ_FLAGS = {
  /**
   * legacy: 現行どおり adminUid / teacherLoginUid のみで全件取得して処理
   * shadow: 旧で処理＋新クエリと差分ログ（既定・安全）
   * attention: 印つきクエリで処理（ログイン時1回の全件保険つき）
   *
   * 切替手順: Shadow 差分がゼロであることを確認してから 'attention' にする。
   * 問題時は即 'legacy' に戻す。
   */
  approvalQueryMode: /** @type {ApprovalQueryMode} */ ('attention'),
  /** Phase4: 本番監視。プローブ成功時のみ有効 */
  useSnapshotListeners: true,
  /** Phase3: ログイン時に監視を1回だけ張り、結果をログして外す */
  enableSnapshotProbe: true,
  /** Phase5: 古い処理済みへの softArchived 付与 */
  enableSoftArchive: false,
};

export function needsAdminProcessing(data){
  if(!data) return false;
  if(data.status === 'approved' && data.promoted !== true) return true;
  if(data.status === 'rejected' && data.handled !== true) return true;
  return false;
}

export function computeAdminAttention(data){
  return needsAdminProcessing(data);
}

export function needsTeacherAttention(data){
  if(!data) return false;
  if(data.status === 'pending') return true;
  if(data.status === 'cancelled' && data.cancelledByAdmin && !data.teacherRead) return true;
  if(data.cancelNoticeUnread && data.lastCancelledDate) return true;
  return false;
}

export function computeTeacherAttention(data){
  return needsTeacherAttention(data);
}

function idSet(docs){
  return new Set(docs.map(d=> d.id));
}

function diffIds(expected, actual){
  const missing = [];
  const extra = [];
  expected.forEach(id=>{ if(!actual.has(id)) missing.push(id); });
  actual.forEach(id=>{ if(!expected.has(id)) extra.push(id); });
  return { missing, extra, equal: missing.length === 0 && extra.length === 0 };
}

/**
 * 過去データ補完: adminAttention / teacherAttention のみ書き込む。
 * status / promoted / handled / 割当データは変更しない。
 */
export async function backfillAttentionFlags(fbDb, { adminUid = null, teacherLoginUid = null } = {}){
  const col = fbDb.collection('assignmentApprovals');
  let snap;
  if(adminUid){
    snap = await col.where('adminUid', '==', adminUid).get();
  }else if(teacherLoginUid){
    snap = await col.where('teacherLoginUid', '==', teacherLoginUid).get();
  }else{
    return { scanned: 0, updated: 0 };
  }

  let updated = 0;
  const writes = [];
  snap.forEach(doc=>{
    const data = doc.data();
    const nextAdmin = computeAdminAttention(data);
    const nextTeacher = computeTeacherAttention(data);
    const curAdmin = data.adminAttention;
    const curTeacher = data.teacherAttention;
    if(curAdmin === nextAdmin && curTeacher === nextTeacher) return;
    writes.push(doc.ref.set({
      adminAttention: nextAdmin,
      teacherAttention: nextTeacher,
    }, { merge: true }));
    updated += 1;
  });
  await Promise.all(writes);
  return { scanned: snap.size, updated };
}

export async function fetchAdminApprovalDocs(fbDb, adminUid, mode = FIRESTORE_READ_FLAGS.approvalQueryMode){
  const col = fbDb.collection('assignmentApprovals');
  const legacySnap = await col.where('adminUid', '==', adminUid).get();
  const legacyDocs = legacySnap.docs.map(doc=> ({ id: doc.id, data: doc.data(), ref: doc.ref }));

  if(mode === 'legacy'){
    return { docs: legacyDocs, shadow: null };
  }

  let attentionDocs = [];
  try{
    const attentionSnap = await col
      .where('adminUid', '==', adminUid)
      .where('adminAttention', '==', true)
      .get();
    attentionDocs = attentionSnap.docs.map(doc=> ({ id: doc.id, data: doc.data(), ref: doc.ref }));
  }catch(err){
    console.error('[firestore-read-safety] adminAttention クエリ失敗（legacy に退避）:', err);
    return { docs: legacyDocs, shadow: null, fellBack: true };
  }

  const legacyProcessIds = idSet(legacyDocs.filter(d=> needsAdminProcessing(d.data)));
  const attentionIds = idSet(attentionDocs);
  const shadow = diffIds(legacyProcessIds, attentionIds);
  if(!shadow.equal){
    console.warn('[firestore-read-safety] admin Shadow差分', shadow);
  }else{
    console.info('[firestore-read-safety] admin Shadow一致', { count: legacyProcessIds.size });
  }

  if(mode === 'shadow'){
    return { docs: legacyDocs, shadow };
  }
  // attention: 処理は絞り込み結果。取りこぼしは呼び出し側の保険で補う
  return { docs: attentionDocs, shadow, legacyDocs };
}

export async function fetchTeacherApprovalDocs(fbDb, teacherLoginUid, mode = FIRESTORE_READ_FLAGS.approvalQueryMode){
  const col = fbDb.collection('assignmentApprovals');
  const legacySnap = await col.where('teacherLoginUid', '==', teacherLoginUid).get();
  const legacyDocs = legacySnap.docs.map(doc=> ({ id: doc.id, data: doc.data(), ref: doc.ref }));

  if(mode === 'legacy'){
    return { docs: legacyDocs, shadow: null };
  }

  let attentionDocs = [];
  try{
    const attentionSnap = await col
      .where('teacherLoginUid', '==', teacherLoginUid)
      .where('teacherAttention', '==', true)
      .get();
    attentionDocs = attentionSnap.docs.map(doc=> ({ id: doc.id, data: doc.data(), ref: doc.ref }));
  }catch(err){
    console.error('[firestore-read-safety] teacherAttention クエリ失敗（legacy に退避）:', err);
    return { docs: legacyDocs, shadow: null, fellBack: true };
  }

  const legacyNeedIds = idSet(legacyDocs.filter(d=> needsTeacherAttention(d.data)));
  const attentionIds = idSet(attentionDocs);
  const shadow = diffIds(legacyNeedIds, attentionIds);
  if(!shadow.equal){
    console.warn('[firestore-read-safety] teacher Shadow差分', shadow);
  }else{
    console.info('[firestore-read-safety] teacher Shadow一致', { count: legacyNeedIds.size });
  }

  if(mode === 'shadow'){
    return { docs: legacyDocs, shadow };
  }
  return { docs: attentionDocs, shadow, legacyDocs };
}

/**
 * attention モード時の保険: 全件を1回読み、印の修復＋処理漏れ ID を返す。
 * status は変更しない。adminAttention / teacherAttention のみ修復可。
 */
export async function reconcileAdminAttentionAndFindGaps(fbDb, adminUid){
  const snap = await fbDb.collection('assignmentApprovals').where('adminUid', '==', adminUid).get();
  const gaps = [];
  const repairs = [];
  snap.forEach(doc=>{
    const data = doc.data();
    const need = needsAdminProcessing(data);
    const next = computeAdminAttention(data);
    if(data.adminAttention !== next || data.teacherAttention !== computeTeacherAttention(data)){
      repairs.push(doc.ref.set({
        adminAttention: next,
        teacherAttention: computeTeacherAttention(data),
      }, { merge: true }));
    }
    if(need && data.adminAttention !== true){
      gaps.push({ id: doc.id, data });
    }
  });
  await Promise.all(repairs);
  return { scanned: snap.size, repaired: repairs.length, gaps };
}

/**
 * Phase3: 監視プローブ。成功/失敗をログし、購読はすぐ外す。本番経路は変えない。
 */
export function probeAssignmentApprovalsSnapshot(fbDb, { adminUid = null, teacherLoginUid = null } = {}){
  return new Promise((resolve)=>{
    let settled = false;
    let unsub = null;
    const finish = (result)=>{
      if(settled) return;
      settled = true;
      try{ unsub?.(); }catch(_e){ /* ignore */ }
      resolve(result);
    };

    let query = fbDb.collection('assignmentApprovals');
    if(adminUid){
      query = query.where('adminUid', '==', adminUid).where('adminAttention', '==', true);
    }else if(teacherLoginUid){
      query = query.where('teacherLoginUid', '==', teacherLoginUid).where('teacherAttention', '==', true);
    }else{
      finish({ ok: false, reason: 'no-scope' });
      return;
    }

    const timer = setTimeout(()=>{
      finish({ ok: false, reason: 'timeout' });
    }, 15000);

    try{
      unsub = query.onSnapshot(
        (snap)=>{
          clearTimeout(timer);
          console.info('[firestore-read-safety] onSnapshot プローブ成功', { size: snap.size });
          finish({ ok: true, size: snap.size });
        },
        (err)=>{
          clearTimeout(timer);
          console.warn('[firestore-read-safety] onSnapshot プローブ失敗', {
            code: err?.code,
            message: err?.message,
          });
          finish({ ok: false, reason: 'error', code: err?.code, message: err?.message });
        }
      );
    }catch(err){
      clearTimeout(timer);
      finish({ ok: false, reason: 'throw', message: err?.message });
    }
  });
}

/**
 * Phase4用: 監視開始。エラー時は onError を呼び、呼び出し側がポーリングへ退避する。
 * 既定フラグ OFF のため通常は使わない。
 */
export function listenAttentionApprovals(fbDb, { adminUid = null, teacherLoginUid = null, onData, onError }){
  let query = fbDb.collection('assignmentApprovals');
  if(adminUid){
    query = query.where('adminUid', '==', adminUid).where('adminAttention', '==', true);
  }else if(teacherLoginUid){
    query = query.where('teacherLoginUid', '==', teacherLoginUid).where('teacherAttention', '==', true);
  }else{
    throw new Error('listenAttentionApprovals: scope required');
  }
  return query.onSnapshot(
    (snap)=>{
      const docs = snap.docs.map(doc=> ({ id: doc.id, data: doc.data(), ref: doc.ref }));
      onData?.(docs);
    },
    (err)=>{
      console.error('[firestore-read-safety] 監視エラー → ポーリング退避想定', err);
      onError?.(err);
    }
  );
}

/**
 * Phase5: 削除なし。十分古い処理済みに softArchived を付けるだけ。
 * enableSoftArchive が false のときは何もしない。
 */
export async function softArchiveProcessedApprovals(fbDb, adminUid, { olderThanDays = 180, force = false, onlySelfTest = false } = {}){
  if(!force && !FIRESTORE_READ_FLAGS.enableSoftArchive){
    return { scanned: 0, archived: 0, skipped: true };
  }
  const snap = await fbDb.collection('assignmentApprovals').where('adminUid', '==', adminUid).get();
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  let archived = 0;
  const writes = [];
  snap.forEach(doc=>{
    const data = doc.data();
    if(onlySelfTest && data.pitakomaSelfTest !== true) return;
    // 教室長・講師のどちらにも未処理が残るものは絶対に触らない
    if(needsAdminProcessing(data)) return;
    if(needsTeacherAttention(data)) return;
    if(data.status === 'pending') return;
    if(data.adminAttention === true || data.teacherAttention === true) return;
    if(data.softArchived) return;
    const createdAtMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0;
    if(createdAtMs && createdAtMs > cutoff) return;
    writes.push(doc.ref.set({ softArchived: true }, { merge: true }));
    archived += 1;
  });
  await Promise.all(writes);
  return { scanned: snap.size, archived, skipped: false };
}
