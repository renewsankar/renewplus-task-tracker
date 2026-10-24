// Demo data store — runs entirely in the browser (localStorage) so the
// dashboards can be previewed before Firebase is connected.
// It mimics the Firestore security rules: staff only receive their own tasks/leads
// and the budgets of their own locations.

const KEY = "renewplus-demo-v3";
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
const addMonths = (m, n) => { const [y, mo] = m.split("-").map(Number); return iso(new Date(y, mo - 1 + n, 1)).slice(0, 7); };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const BRANCHES = ["Chennai - Anna Nagar", "Chennai - Velachery", "Bengaluru", "Hyderabad", "Coimbatore", "Kochi"];
const PAID = ["Meta Ads (FB / Instagram)", "Google Ads", "YouTube"];

function seed() {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const settings = { ...cfg.DEFAULT_SETTINGS, branches: [...BRANCHES] };
  const people = [
    ["Priya R", [0, 1]], ["Karthik S", [0]], ["Arun K", [1, 4]], ["Sneha P", [2]],
    ["Rahul V", [2, 5]], ["Meena J", [3]], ["Vijay N", [3, 4]], ["Anjali D", [5]],
  ];
  const users = [{ uid: "admin", name: "SG (Admin)", email: "admin@demo", role: "admin", branches: [], branch: "", active: true }];
  people.forEach(([name, bs], i) => users.push({
    uid: "u" + i, name, email: name.split(" ")[0].toLowerCase() + "@demo", role: "staff",
    branches: bs.map((b) => BRANCHES[b]), branch: BRANCHES[bs[0]], active: true,
  }));
  const titles = [
    ["Social Media Post", "Instagram posts – PRP hair therapy", 6], ["Reel / Video", "Before/after reels", 3],
    ["Reviews & Reputation", "Reply to Google reviews", 20], ["SEO", "On-page SEO for hair-transplant page", 0],
    ["Google Business Profile", "GBP posts & photo updates", 4], ["Google Ads", "Google Ads – hair fall campaign optimisation", 0],
    ["Meta Ads", "Meta lead-gen ads – skin care offer", 2], ["Lead Report", "Weekly lead quality report", 1],
    ["Graphic Design", "Festival offer creatives", 5], ["WhatsApp / Email Campaign", "WhatsApp broadcast – festive offer", 1],
  ];
  const tasks = [];
  const t0 = iso(new Date());
  let id = 1;
  users.filter((u) => u.role === "staff").forEach((u) => {
    const skill = 0.55 + r() * 0.4;
    for (let w = -8; w <= 1; w++) {
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const [category, title, target] = pick(titles);
        const due = addDays(t0, w * 7 + Math.floor(r() * 7) - 3);
        const created = addDays(due, -3 - Math.floor(r() * 4));
        let status = "Committed", progress = 0, completedOn = "";
        if (r() < (due < t0 ? skill + 0.15 : 0.25)) {
          status = "Completed"; progress = 100;
          completedOn = addDays(due, r() < skill ? -Math.floor(r() * 2) : 1 + Math.floor(r() * 3));
          if (completedOn > t0) completedOn = t0;
        } else if (r() < 0.6) { status = "In Progress"; progress = 20 + Math.floor(r() * 6) * 10; }
        else if (r() < 0.25) { status = "Blocked"; progress = 10 * Math.floor(r() * 4); }
        tasks.push({
          id: "t" + id++, uid: u.uid, userName: u.name, branch: pick(u.branches),
          title, description: "", category, priority: pick(["High", "Medium", "Medium", "Low"]), target: target || "",
          achieved: target ? Math.round((target * progress) / 100) : "", commitDate: created, dueDate: due, status, progress,
          proofLink: status === "Completed" ? "https://drive.google.com/" : "",
          remarks: status === "Blocked" ? "Waiting for doctor approval on content" : "",
          completedOn, createdBy: u.uid, adminComment: "",
          createdAt: created + "T09:00:00", updatedAt: (completedOn || created) + "T18:00:00", updates: [],
        });
      }
    }
  });
  const leads = seedLeads(users, r);
  const budgets = seedBudgets(r);
  return { users, settings, tasks, leads, budgets };
}

function seedLeads(users, r) {
  const sources = ["Meta Ads (FB / Instagram)", "Google Ads", "Instagram Organic", "Google Business Profile", "Website / SEO", "WhatsApp", "YouTube", "Referral"];
  const weight = [7, 5, 3, 2, 2, 2, 1, 1];
  const services = ["Hair Transplant", "Hair Fall / PRP / GFC", "Dandruff / Scalp", "Acne & Scars", "Pigmentation", "Laser Hair Removal", "Anti-ageing"];
  const leads = [];
  const t0 = iso(new Date());
  let id = 1;
  users.filter((u) => u.role === "staff").forEach((u) => {
    for (let d = -95; d <= 0; d++) {
      const date = addDays(t0, d);
      if (r() < 0.12) continue;
      u.branches.forEach((branch) => {
        const k = 1 + Math.floor(r() * 3);
        for (let j = 0; j < k; j++) {
          const si = Math.floor(r() * sources.length);
          leads.push({
            id: "l" + id++, uid: u.uid, userName: u.name, branch, date, source: sources[si],
            service: services[Math.floor(r() * r() * services.length)], count: Math.max(1, Math.round(r() * weight[si])),
            createdBy: u.uid, createdAt: date + "T19:00:00", updatedAt: date + "T19:00:00",
          });
        }
      });
    }
  });
  return leads;
}

function seedBudgets(r) {
  const now = new Date();
  const m0 = iso(now).slice(0, 7);
  const dayShare = now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const out = [];
  for (let k = -3; k <= 0; k++) {
    const month = addMonths(m0, k);
    BRANCHES.forEach((branch, bi) => PAID.forEach((source, si) => {
      const base = [60000, 40000, 10000][si] * (1 + (bi % 3) * 0.25);
      const required = Math.round(base / 1000) * 1000;
      const ratio = k < 0 ? 0.85 + r() * 0.25 : dayShare * (0.9 + r() * 0.2);
      out.push({
        id: `${month}__${slug(branch)}__${slug(source)}`, month, branch, source, required,
        spent: Math.round(required * ratio / 100) * 100, updatedBy: "admin", updatedByName: "SG (Admin)",
        updatedAt: month + "-28T10:00:00",
      });
    }));
  }
  return out;
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
export const demoUsers = () => db.users.filter((u) => u.active).map((u) => ({ email: u.email, name: u.name, role: u.role, branches: u.branches || [] }));

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
const myBranches = () => me()?.branches || [];

export async function listUsers() { if (!isAdmin()) throw new Error("Permission denied"); return clone(db.users); }
export async function createUser({ name, email, role, branches }) {
  if (db.users.some((u) => u.email === email.toLowerCase())) throw new Error("Email already exists.");
  const u = { uid: "u" + Date.now(), name, email: email.toLowerCase(), role, branches, branch: branches[0] || "", active: true };
  db.users.push(u); save(); return clone(u);
}
export async function updateUser(uid, patch) { Object.assign(db.users.find((u) => u.uid === uid), patch); save(); }
export async function deleteUser(uid, withTasks) {
  db.users = db.users.filter((u) => u.uid !== uid);
  if (withTasks) { db.tasks = db.tasks.filter((t) => t.uid !== uid); db.leads = db.leads.filter((l) => l.uid !== uid); }
  save();
}
export async function getSettings() { return clone(db.settings); }
export async function saveSettings(s) { db.settings = clone(s); save(); }

export async function listTasks({ uid, from, to }) {
  if (uid) return clone(db.tasks.filter((t) => t.uid === uid));
  if (!isAdmin()) throw new Error("Permission denied");
  return clone(db.tasks.filter((t) => t.dueDate >= from && t.dueDate <= to));
}
export async function addTask(t) { const id = "t" + Date.now() + Math.floor(Math.random() * 1000); db.tasks.push({ ...t, id }); save(); return id; }
export async function updateTask(id, patch) { Object.assign(db.tasks.find((t) => t.id === id), patch); save(); }
export async function deleteTask(id) { db.tasks = db.tasks.filter((t) => t.id !== id); save(); }

export async function listLeads({ uid, branches, from, to }) {
  if (uid) return clone(db.leads.filter((l) => l.uid === uid || (branches || []).includes(l.branch)));
  if (!isAdmin()) throw new Error("Permission denied");
  return clone(db.leads.filter((l) => l.date >= from && l.date <= to));
}
export async function addLead(l) { const id = "l" + Date.now() + Math.floor(Math.random() * 1000); db.leads.push({ ...l, id }); save(); return id; }
export async function updateLead(id, patch) { Object.assign(db.leads.find((l) => l.id === id), patch); save(); }
export async function deleteLead(id) { db.leads = db.leads.filter((l) => l.id !== id); save(); }

export async function listBudgets({ branches, from, to }) {
  if (branches) {
    if (!isAdmin() && branches.some((b) => !myBranches().includes(b))) throw new Error("Permission denied");
    return clone(db.budgets.filter((b) => branches.includes(b.branch)));
  }
  if (!isAdmin()) throw new Error("Permission denied");
  return clone(db.budgets.filter((b) => b.month >= from && b.month <= to));
}
export async function saveBudget(b) {
  if (!isAdmin() && !myBranches().includes(b.branch)) throw new Error("Permission denied");
  const i = db.budgets.findIndex((x) => x.id === b.id);
  if (i >= 0) Object.assign(db.budgets[i], b); else db.budgets.push({ ...b });
  save();
}
