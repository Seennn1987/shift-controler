import { HttpError } from './http-error.js';

/** 対象の教室長を決める。設定があればそれを使い、無ければ appState が1件だけのときその1件 */
export async function resolveAdminUid(db, configuredUid){
  if(configuredUid) return configuredUid;
  const snap = await db.collection('appState').select().limit(2).get();
  if(snap.size === 1) return snap.docs[0].id;
  if(snap.size === 0) throw new HttpError(404, 'appState が見つかりません');
  throw new HttpError(400, '教室長が2人以上います。環境変数 PITAKOMA_ADMIN_UID に対象の教室長IDを設定してください');
}

/** 計算に必要な教室データ（appState と teacherSchedules）を読む */
export async function loadClassroom(db, configuredUid){
  const adminUid = await resolveAdminUid(db, configuredUid);
  const [appSnap, schedSnap] = await Promise.all([
    db.collection('appState').doc(adminUid).get(),
    db.collection('teacherSchedules').where('adminUid', '==', adminUid).get(),
  ]);
  if(!appSnap.exists) throw new HttpError(404, `appState/${adminUid} が見つかりません`);
  return {
    adminUid,
    appState: appSnap.data(),
    scheduleDocs: schedSnap.docs.map(d=> d.data()),
    readCount: 1 + schedSnap.size,
  };
}
