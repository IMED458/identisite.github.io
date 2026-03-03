import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDE3UecLP_Dj0Va23CRIQbYWIcg9cZf4TY',
  authDomain: 'dentisite-7d1f2.firebaseapp.com',
  projectId: 'dentisite-7d1f2',
  storageBucket: 'dentisite-7d1f2.firebasestorage.app',
  messagingSenderId: '315807744447',
  appId: '1:315807744447:web:79c9eb04949bba9398610a',
  measurementId: 'G-EMFZJ16N9F'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export const firebaseReady = true;

export async function pullSettingsFromCloud() {
  const snap = await getDoc(doc(db, 'settings', 'main'));
  if (!snap.exists()) return {};
  return snap.data();
}

export async function pushSettingsToCloud(payload) {
  await setDoc(doc(db, 'settings', 'main'), payload, { merge: true });
}

export async function pullCollectionFromCloud(kind) {
  const snap = await getDocs(collection(db, kind));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function pushItemToCloud(kind, item) {
  const id = item.id;
  if (!id) throw new Error('Missing item id');
  await setDoc(doc(db, kind, id), item, { merge: true });
}

export async function removeItemFromCloud(kind, id) {
  await deleteDoc(doc(db, kind, id));
}

export function subscribeSettings(onData) {
  return onSnapshot(doc(db, 'settings', 'main'), (snap) => {
    onData(snap.exists() ? snap.data() : {});
  });
}

export function subscribeCollection(kind, onData) {
  return onSnapshot(collection(db, kind), (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
