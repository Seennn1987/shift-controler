export const firebaseConfig = {
  apiKey: "AIzaSyDi-JiKWiW5jraE8SHK-vvQ1SRCZTFbu4c",
  authDomain: "shift-controller-4ecaf.firebaseapp.com",
  projectId: "shift-controller-4ecaf",
  storageBucket: "shift-controller-4ecaf.firebasestorage.app",
  messagingSenderId: "291648754129",
  appId: "1:291648754129:web:49bca52590e7b018ded0f0",
  measurementId: "G-G3TEYJYJFW"
};

export function initPrimaryFirebase() {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const fbAuth = firebase.auth();
  const fbDb = firebase.firestore();
  fbDb.settings({ experimentalAutoDetectLongPolling: true, merge: true });
  return { fbAuth, fbDb };
}

/** 講師用ページ専用。教室長（default）と Auth セッションを分離し、別タブ同時ログインを可能にする */
export function initTeacherFirebase() {
  const appName = 'teacher';
  let app = firebase.apps.find(a => a.name === appName);
  if (!app) {
    app = firebase.initializeApp(firebaseConfig, appName);
  }
  const fbAuth = firebase.auth(app);
  const fbDb = firebase.firestore(app);
  fbDb.settings({ experimentalAutoDetectLongPolling: true, merge: true });
  return { fbAuth, fbDb };
}
