// Demo data store — runs entirely in the browser (localStorage) so the
// dashboards can be previewed before Firebase is connected.
// It mimics the Firestore security rules: staff only receive their own tasks.

const KEY = "renewplus-demo-v1";
let cfg, db, listener, current = null;

export const isDemo = true;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00"); d.setDate(d.getDate() + n); return iso(d); };

function seed() {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const branches = ["Chennai - Anna Nagar", "Chennai - Velachery", "Bengaluru", "Hyderabad", "Coimbatore", "Kochi"];
  const settings = { ...cfg.DEFAULT_SETTINGS, branches: ["Head Office", ...branches] };
  const people = [
    ["Priya R", "Social Media", 0], ["Karthik S", "SEO", 0], ["Divya M", "Content & Design", 1],
    ["Arun K", "Performance Ads", 1], ["Sneha P", "Social Media", 2], ["Rahul V", "Video", 2],
    ["Meena J", "SEO", 3], ["Vijay N", "Performance Ads", 3], ["Lakshmi T", "Content & Design", 4],
    ["Suresh B", "Social Media", 5], ["Anjali D", "Video", 5],
  ];
  const users = [{
    uid: "admin", name: "SG (Admin)", email: "admin@demo", role: "admin",
    branch: "Head Office", team: "", active: true,
  }];
  people.forEach(([name, team, b], i) => users.push({
    uid: "u" + i, name, email: name.split(" ")[0].toLowerCase() + "@demo", role: "staff",
    branch: branches[b], team, active: true,
  }));
  const titles = {
    "Social Media": [["Social Media Post", "Instagram posts – PRP hair therapy", 6], ["Reel / Video", "Before/after reels", 3], ["Reviews & Reputation", "Reply to Google reviews", 20]],
    SEO: [["SEO", "On-page SEO for hair-transplant page", 0], ["Google Business Profile", "GBP posts & photo updates", 4], ["Blog / Content", "Blog: dandruff treatment guide", 1]],
    "Performance Ads": [["Google Ads", "Google Ads – hair fall campaign optimisation", 0], ["Meta Ads", "Meta lead-gen ads – skin care offer", 2], ["Lead Report", "Weekly lead quality report", 1]],
    "Content & Design": [["Graphic Design", "Festival offer creatives", 5], ["Blog / Content", "Website service page copy", 2], ["WhatsApp / Email Campaign", "WhatsApp broadcast – Diwali offer", 1]],
    Video: [["Reel / Video", "Doctor explainer videos", 2], ["Reel / Video", "Patient testimonial edit", 2], ["Website Update", "Upload videos to website", 0]],
  };
  const tasks = [];
  const t0 = iso(new Date());
  let id = 1;
  users.filter((u) => u.role === "staff").forEach((u) => {
    const skill = 0.55 + r() * 0.4;
    for (let w = -8; w <= 1; w++) {
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const [category, title, target] = pick(titles[u.team]);
        const due = addDays(t0, w * 7 + Math.floor(r() * 7) - 3);
        const created = addDays(due, -3 - Math.floor(r() * 4));
        let status = "Committed", progress = 0, completedOn = "";
        const past = due < t0;
        if (r() < (past ? skill + 0.15 : 0.25)) {
          status = "Completed"; progress = 100;
          completedOn = addDays(due, r() < skill ? -Math.floor(r() * 2) : 1 + Math.floor(r() * 3));
          if (completedOn > t0) completedOn = t0;
        } else if (r() < 0.6) { status = "In Progress"; progress = 20 + Math.floor(r() * 6) * 10; }
        else if (r() < 0.25) { status = "Blocked"; progress = 10 * Math.floor(r() * 4); }
        const priority = pick(["High", "Medium", "Medium", "Low"]);
        tasks.push({
          id: "t" + id++, uid: u.uid, userName: u.name, branch: u.branch, team: u.team,
          title, description: "", category, priority, target: target || "",
          achieved: target ? Math.round((target * progress) / 100) : "",
          commitDate: created, dueDate: due, status, progress,
          proofLink: status === "Completed" ? "https://drive.google.com/" : "",
          remarks: status === "Blocked" ? "Waiting for doctor approval on content" : "",
          completedOn, createdBy: u.uid, adminComment: "",
          createdAt: created + "T09:00:00", updatedAt: (completedOn || created) + "T18:00:00", updates: [],
        });
      }
    }
  });
  return { users, settings, tasks };
}

function load() {
  try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) { /* storage unavailable */ }
  return null;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } }
const clone = (x) => JSON.parse(JSON.stringify(x));

export function init(config) {
  cfg = config;
  db = load() || seed();
  save();
  try { const c = sessionStorage.getItem(KEY + "-me"); if (c) current = JSON.parse(c); } catch (e) { /* ignore */ }
}
export function resetDemo() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } db = seed(); save(); }
export const demoUsers = () => db.users.filter((u) => u.active).map((u) => ({ email: u.email, name: u.name, role: u.role, branch: u.branch }));

export function onAuth(cb) { listener = cb; setTimeout(() => cb(current), 0); }
export async function signIn(email) {
  const u = db.users.find((x) => x.email === email.toLowerCase());
  if (!u) throw new Error("No demo user with that email.");
  current = { uid: u.uid, email: u.email };
  try { sessionStorage.setItem(KEY + "-me", JSON.stringify(current)); } catch (e) { /* ignore */ }
  listener && listener(current);
}
export async function signOut() {
  current = null;
  try { sessionStorage.removeItem(KEY + "-me"); } catch (e) { /* ignore */ }
  listener && listener(null);
}
export async function resetPassword() { /* no-op in demo */ }

export async function getProfile(uid) { const u = db.users.find((x) => x.uid === uid); return u ? clone(u) : null; }
export async function ensureBootstrap() { return null; }
const me = () => db.users.find((x) => x.uid === current?.uid);
const isAdmin = () => me()?.role === "admin";

export async function listUsers() { if (!isAdmin()) throw new Error("Permission denied"); return clone(db.users); }
export async function createUser({ name, email, role, branch, team }) {
  if (db.users.some((u) => u.email === email.toLowerCase())) throw new Error("Email already exists.");
  const u = { uid: "u" + Date.now(), name, email: email.toLowerCase(), role, branch, team, active: true };
  db.users.push(u); save(); return clone(u);
}
export async function updateUser(uid, patch) { Object.assign(db.users.find((u) => u.uid === uid), patch); save(); }
export async function getSettings() { return clone(db.settings); }
export async function saveSettings(s) { db.settings = clone(s); save(); }

export async function listTasks({ uid, from, to }) {
  if (uid) return clone(db.tasks.filter((t) => t.uid === uid));
  if (!isAdmin()) throw new Error("Permission denied");
  return clone(db.tasks.filter((t) => t.dueDate >= from && t.dueDate <= to));
}
export async function addTask(t) { const id = "t" + Date.now(); db.tasks.push({ ...t, id }); save(); return id; }
export async function updateTask(id, patch) { Object.assign(db.tasks.find((t) => t.id === id), patch); save(); }
export async function deleteTask(id) { db.tasks = db.tasks.filter((t) => t.id !== id); save(); }
