import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { firebaseConfig, firebaseCourseSuiteOptions } from './firebase-config.public.js';

let app;
let db;
let auth;

export function isFirebaseEnabled() {
  return firebaseCourseSuiteOptions.enabled === true && firebaseConfig.projectId;
}

export function getFirebaseApp() {
  if (!isFirebaseEnabled()) return null;
  if (!app) app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseDb() {
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
}

export function getFirebaseAuth() {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseOptions() {
  return firebaseCourseSuiteOptions;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(getFirebaseAuth(), provider);
}

export function signOutFirebase() {
  return signOut(getFirebaseAuth());
}
