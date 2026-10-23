// Firebase-backed data store (Auth + Cloud Firestore).
// Access control is enforced server-side by firestore.rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, query, where, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let app, auth, db, cfg;

export function init(config) {
  cfg = config;
  app = initializeApp(config.firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export const isDemo = false;

export function onAuth(cb) {
  return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
}
export const signIn = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const signOut = () => fbSignOut(auth);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export async function getProfile(uid) {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

// First login of a bootstrap admin creates their admin profile.
export async function ensureBootstrap(user) {
  const email = (user.email || "").toLowerCase();
  if (!cfg.BOOTSTRAP_ADMINS.map((e) => e.toLowerCase()).includes(email)) return null;
  const p = {
    name: email.split("@")[0], email, role: "admin", branch: "Head Office",
    team: "", active: true, createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, "users", user.uid), p);
  const st = await getDoc(doc(db, "settings", "config"));
  if (!st.exists()) await setDoc(doc(db, "settings", "config"), cfg.DEFAULT_SETTINGS);
  return { uid: user.uid, ...p };
}

export async function listUsers() {
  const s = await getDocs(collection(db, "users"));
  return s.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Creates the login with a secondary app instance so the admin stays signed in.
export async function createUser({ name, email, password, role, branch, team }) {
  const sec = initializeApp(cfg.firebaseConfig, "secondary-" + Date.now());
  const secAuth = getAuth(sec);
  const cred = await createUserWithEmailAndPassword(secAuth, email, password);
  await fbSignOut(secAuth);
  const p = { name, email: email.toLowerCase(), role, branch, team, active: true, createdAt: new Date().toISOString() };
  await setDoc(doc(db, "users", cred.user.uid), p);
  return { uid: cred.user.uid, ...p };
}

export const updateUser = (uid, patch) => updateDoc(doc(db, "users", uid), patch);

// Removes the profile (access is blocked without it) and optionally their tasks.
// The Firebase login itself can only be removed in the Firebase console.
export async function deleteUser(uid, withTasks) {
  if (withTasks) {
    const s = await getDocs(query(collection(db, "tasks"), where("uid", "==", uid)));
    await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
    const l = await getDocs(query(collection(db, "leads"), where("uid", "==", uid)));
    await Promise.all(l.docs.map((d) => deleteDoc(d.ref)));
  }
  await deleteDoc(doc(db, "users", uid));
}

export async function getSettings() {
  const s = await getDoc(doc(db, "settings", "config"));
  return s.exists() ? { ...cfg.DEFAULT_SETTINGS, ...s.data() } : { ...cfg.DEFAULT_SETTINGS };
}
export const saveSettings = (s) => setDoc(doc(db, "settings", "config"), s);

// Staff: always query by own uid (required by security rules).
// Admin: query by due-date range.
export async function listTasks({ uid, from, to }) {
  let q;
  if (uid) q = query(collection(db, "tasks"), where("uid", "==", uid));
  else q = query(collection(db, "tasks"), where("dueDate", ">=", from), where("dueDate", "<=", to));
  const s = await getDocs(q);
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addTask(t) {
  const r = await addDoc(collection(db, "tasks"), t);
  return r.id;
}
export const updateTask = (id, patch) => updateDoc(doc(db, "tasks", id), patch);
export const deleteTask = (id) => deleteDoc(doc(db, "tasks", id));

// ---- leads
export async function listLeads({ uid, from, to }) {
  let q;
  if (uid) q = query(collection(db, "leads"), where("uid", "==", uid));
  else q = query(collection(db, "leads"), where("date", ">=", from), where("date", "<=", to));
  const s = await getDocs(q);
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function addLead(l) {
  const { id, ...data } = l;
  const r = await addDoc(collection(db, "leads"), data);
  return r.id;
}
export const updateLead = (id, patch) => updateDoc(doc(db, "leads", id), patch);
export const deleteLead = (id) => deleteDoc(doc(db, "leads", id));
