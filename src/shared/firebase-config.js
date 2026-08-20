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
