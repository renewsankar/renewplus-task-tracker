// Firebase-backed data store (Auth + Cloud Firestore).
// Access control is enforced server-side by firestore.rules.
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, createUserWithEmailAndPassword, updatePassword,
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
    name: email.split("@")[0], email, role: "admin", branches: [], branch: "",
    active: true, createdAt: new Date().toISOString(),
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
export async function createUser({ name, email, password, role, branches, remember = true }) {
  const sec = initializeApp(cfg.firebaseConfig, "secondary-" + Date.now());
  const secAuth = getAuth(sec);
  const cred = await createUserWithEmailAndPassword(secAuth, email, password);
  await fbSignOut(secAuth);
  const p = {
    name, email: email.toLowerCase(), role, branches, branch: branches[0] || "",
    active: true, createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, "users", cred.user.uid), p);
  if (remember) await saveCredential(cred.user.uid, p.email, password);
  deleteApp(sec).catch(() => {});
  return { uid: cred.user.uid, ...p };
}

export const updateUser = (uid, patch) => updateDoc(doc(db, "users", uid), patch);

// Removes the profile (access is blocked without it) and optionally their tasks + leads.
// The Firebase login itself can only be removed in the Firebase console.
export async function deleteUser(uid, withTasks) {
  if (withTasks) {
    for (const c of ["tasks", "leads"]) {
      const s = await getDocs(query(collection(db, c), where("uid", "==", uid)));
      await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
    }
  }
  await deleteDoc(doc(db, "users", uid));
}

export async function getSettings() {
  const s = await getDoc(doc(db, "settings", "config"));
  return s.exists() ? { ...cfg.DEFAULT_SETTINGS, ...s.data() } : { ...cfg.DEFAULT_SETTINGS };
}
export const saveSettings = (s) => setDoc(doc(db, "settings", "config"), s);

// Staff: always query by own uid (required by security rules).
// Admin: query by date range.
export async function listTasks({ uid, from, to }) {
  let q;
  if (uid) q = query(collection(db, "tasks"), where("uid", "==", uid));
  else q = query(collection(db, "tasks"), where("dueDate", ">=", from), where("dueDate", "<=", to));
  const s = await getDocs(q);
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function addTask(t) {
  const { id, ...data } = t;
  const r = await addDoc(collection(db, "tasks"), data);
  return r.id;
}
export const updateTask = (id, patch) => updateDoc(doc(db, "tasks", id), patch);
export const deleteTask = (id) => deleteDoc(doc(db, "tasks", id));

// ---- leads
// Staff: their own entries + every entry at their locations (so location CPL is complete).
export async function listLeads({ uid, branches, from, to }) {
  if (uid) {
    const qs = [query(collection(db, "leads"), where("uid", "==", uid)),
      ...(branches || []).map((b) => query(collection(db, "leads"), where("branch", "==", b)))];
    const snaps = await Promise.all(qs.map((q) => getDocs(q)));
    const byId = new Map();
    snaps.forEach((s) => s.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() })));
    return [...byId.values()];
  }
  const s = await getDocs(query(collection(db, "leads"), where("date", ">=", from), where("date", "<=", to)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function addLead(l) {
  const { id, ...data } = l;
  const r = await addDoc(collection(db, "leads"), data);
  return r.id;
}
export const updateLead = (id, patch) => updateDoc(doc(db, "leads", id), patch);
export const deleteLead = (id) => deleteDoc(doc(db, "leads", id));

// ---- monthly budgets (one doc per month + location + paid channel)
// Staff: one query per assigned location (required by security rules).
// Admin: query by month range ("YYYY-MM").
export async function listBudgets({ branches, from, to }) {
  if (branches) {
    const all = await Promise.all(branches.map((b) =>
      getDocs(query(collection(db, "budgets"), where("branch", "==", b)))));
    return all.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  const s = await getDocs(query(collection(db, "budgets"), where("month", ">=", from), where("month", "<=", to)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function saveBudget(b) {
  const { id, ...data } = b;
  await setDoc(doc(db, "budgets", id), data, { merge: true });
}

// ---- admin-managed passwords (free-plan workaround)
// The browser can only change a password while signed in as that person, so the app keeps
// each person's current password in credentials/{uid} (readable by admins only, see rules),
// signs in as them in a separate hidden session, and sets the new password.
async function saveCredential(uid, email, password) {
  await setDoc(doc(db, "credentials", uid), { email, password, updatedAt: new Date().toISOString(), updatedBy: auth.currentUser?.uid || "" });
}
export async function getCredential(uid) {
  const s = await getDoc(doc(db, "credentials", uid));
  return s.exists() ? s.data() : null;
}
export async function setPassword(user, newPassword, currentPassword) {
  const saved = await getCredential(user.uid);
  const current = currentPassword || saved?.password;
  if (!current) throw new Error("NO_CURRENT");
  const sec = initializeApp(cfg.firebaseConfig, "pw-" + Date.now());
  const secAuth = getAuth(sec);
  try {
    const cred = await signInWithEmailAndPassword(secAuth, user.email, current);
    if (cred.user.uid !== user.uid) throw new Error("This login belongs to a different person record.");
    await updatePassword(cred.user, newPassword);
    await fbSignOut(secAuth);
  } catch (e) {
    if (["auth/invalid-credential", "auth/wrong-password", "auth/invalid-login-credentials"].includes(e.code)) throw new Error("WRONG_CURRENT");
    throw e;
  } finally {
    deleteApp(sec).catch(() => {});
  }
  await saveCredential(user.uid, user.email, newPassword);
}

// Preferred: server helper (Cloud Run function) sets the password directly — no old password needed.
export async function setPasswordServer(url, uid, password) {
  const token = await auth.currentUser.getIdToken();
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ uid, password }) });
  } catch (e) { throw new Error("Could not reach the password helper. Check the helper URL in Settings."); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.error || `Password helper error (${res.status})`);
}
