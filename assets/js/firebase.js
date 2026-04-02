import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

function hasValidFirebaseConfig(config) {
  if (!config) {
    return false;
  }

  const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
  return requiredKeys.every((key) => {
    const value = config[key];
    return value && typeof value === "string" && !value.startsWith("YOUR_");
  });
}

export const firebaseReady = hasValidFirebaseConfig(firebaseConfig);

let auth = null;
let db = null;
let storage = null;

if (firebaseReady) {
  console.log("🔥 Initializing Firebase with config:", firebaseConfig.projectId);
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  console.log("✓ Firebase initialized. Auth, Firestore, and Storage ready.");
} else {
  console.warn("⚠️ Firebase config is incomplete. Check assets/js/firebase-config.js");
}

export { auth, db, storage };

export function onAuthChanged(callback) {
  if (!firebaseReady || !auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

export async function loginUser(email, password) {
  if (!firebaseReady || !auth) {
    throw new Error("Firebase is not configured. Add your project keys in assets/js/firebase-config.js.");
  }

  const credentials = await signInWithEmailAndPassword(auth, email, password);
  return credentials.user;
}

export async function registerUser(displayName, email, password) {
  if (!firebaseReady || !auth) {
    throw new Error("Firebase is not configured. Add your project keys in assets/js/firebase-config.js.");
  }

  const credentials = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credentials.user, { displayName });
  }
  return credentials.user;
}

export async function logoutUser() {
  if (!firebaseReady || !auth) {
    return;
  }
  await signOut(auth);
}
