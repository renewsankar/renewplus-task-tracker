import * as config from "./config.js";

const DEMO = String(config.firebaseConfig.apiKey || "").startsWith("PASTE");
const store = DEMO ? await import("./store-demo.js") : await import("./store-firebase.js");
store.init(config);

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + "T00:00"); d.setDate(d.getDate() + n); return iso(d); };
const weekStart = (s) => { const d = new Date(s + "T00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const fmt = (s) => (s ? new Date(s.slice(0, 10) + "T00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const fmtShort = (s) => new Date(s + "T00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const opts = (arr, sel, all) => (all ? `<option value="">${esc(all)}</option>` : "") + arr.map((v) => {
  const [val, label] = Array.isArray(v) ? v : [v, v];
  return `<option value="${esc(val)}" ${val === sel ? "selected" : ""}>${esc(label)}</option>`;
}).join("");
const LEAD_DEFAULTS = {
  leadSources: ["Meta Ads (FB / Instagram)", "Google Ads", "Instagram Organic", "Facebook Organic", "Google Business Profile",
    "Website / SEO", "WhatsApp", "YouTube", "Referral", "Other"],
  leadServices: ["Hair Transplant", "Hair Fall / PRP / GFC", "Dandruff / Scalp", "Acne & Scars", "Pigmentation",
    "Laser Hair Removal", "Anti-ageing", "Skin – General", "Other"],
};
const STATUSES = ["Committed", "In Progress", "Completed", "Blocked"];
const PRIORITIES = ["High", "Medium", "Low"];
const isOverdue = (t) => t.status !== "Completed" && t.dueDate < today();
const statusKey = (s) => s.toLowerCase().replace(/\s+/g, "-");

function toast(msg, bad) {
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
const errMsg = (e) => (e?.code || "").replace("auth/", "").replace(/-/g, " ") || e?.message || String(e);

// ---------------------------------------------------------------- state
const S = {
  user: null, profile: null, settings: { ...config.DEFAULT_SETTINGS }, users: [], tasks: [], leads: [],
  view: "", f: { period: "this-month", from: "", to: "", branch: "", team: "", uid: "", category: "", status: "", source: "", service: "" },
  charts: [], sort: { key: "rate", dir: -1 },
};
const isAdmin = () => S.profile?.role === "admin";

function range() {
  const t = today(), d = new Date(t + "T00:00");
  switch (S.f.period) {
    case "this-week": { const w = weekStart(t); return [w, addDays(w, 6)]; }
    case "last-week": { const w = addDays(weekStart(t), -7); return [w, addDays(w, 6)]; }
    case "next-week": { const w = addDays(weekStart(t), 7); return [w, addDays(w, 6)]; }
    case "last-month": return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))];
    case "last-30": return [addDays(t, -29), t];
    case "this-quarter": { const q = Math.floor(d.getMonth() / 3) * 3; return [iso(new Date(d.getFullYear(), q, 1)), iso(new Date(d.getFullYear(), q + 3, 0))]; }
    case "custom": return [S.f.from || addDays(t, -29), S.f.to || t];
    default: return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }
}
const PERIODS = [["this-week", "This week"], ["last-week", "Last week"], ["next-week", "Next week"], ["this-month", "This month"],
  ["last-month", "Last month"], ["last-30", "Last 30 days"], ["this-quarter", "This quarter"], ["custom", "Custom range"]];

function metrics(list) {
  const m = { total: list.length, done: 0, prog: 0, committed: 0, blocked: 0, overdue: 0, ontime: 0 };
  for (const t of list) {
    if (t.status === "Completed") { m.done++; if ((t.completedOn || "") <= t.dueDate) m.ontime++; }
    else {
      if (isOverdue(t)) m.overdue++;
      if (t.status === "In Progress") m.prog++;
      else if (t.status === "Blocked") m.blocked++;
      else m.committed++;
    }
  }
  m.pending = m.total - m.done;
  m.rate = pct(m.done, m.total);
  m.ontimeRate = pct(m.ontime, m.done);
  return m;
}
const groupBy = (list, fn) => list.reduce((a, t) => ((a[fn(t)] ||= []).push(t), a), {});

// tasks in the selected period, after filters
function filtered(extra = true) {
  const [from, to] = range();
  return S.tasks.filter((t) => t.dueDate >= from && t.dueDate <= to
    && (!S.f.branch || t.branch === S.f.branch) && (!S.f.team || t.team === S.f.team)
    && (!S.f.uid || t.uid === S.f.uid) && (!S.f.category || t.category === S.f.category)
    && (!extra || !S.f.status || (S.f.status === "Overdue" ? isOverdue(t) : t.status === S.f.status)));
}

async function loadTasks() {
  const [from, to] = range();
  if (isAdmin()) {
    const trendFrom = addDays(weekStart(to), -49);
    S.tasks = await store.listTasks({ from: from < trendFrom ? from : trendFrom, to });
    S.leads = await store.listLeads({ from, to });
  } else {
    S.tasks = await store.listTasks({ uid: S.user.uid });
    S.leads = await store.listLeads({ uid: S.user.uid });
  }
}

// ---------------------------------------------------------------- auth flow
store.onAuth(async (u) => {
  S.user = u;
  if (!u) { S.profile = null; return renderLogin(); }
  renderLoading();
  try {
    let p = await store.getProfile(u.uid);
    if (!p) p = await store.ensureBootstrap(u);
    if (!p) return renderBlocked("Your login exists, but your profile hasn't been set up. Please ask the admin to add you in the Team page.");
    if (!p.active) return renderBlocked("Your account has been deactivated. Please contact the admin.");
    S.profile = p;
    S.settings = { ...LEAD_DEFAULTS, ...(await store.getSettings()) };
    if (isAdmin()) S.users = await store.listUsers();
    S.view = isAdmin() ? "dashboard" : "my-dashboard";
    await loadTasks();
    renderShell();
  } catch (e) {
    console.error(e);
    renderBlocked("Could not load your data: " + errMsg(e));
  }
});

const logo = `<img src="assets/logo.png" alt="Renew+ Hair and Skin Care" class="logo">`;

function renderLoading() { $("#app").innerHTML = `<div class="center"><div class="spinner"></div></div>`; }
function renderBlocked(msg) {
  $("#app").innerHTML = `<div class="login-wrap"><div class="login card">${logo}<p class="muted">${esc(msg)}</p>
    <button class="btn" id="out">Sign out</button></div></div>`;
  $("#out").onclick = () => store.signOut();
}

function renderLogin() {
  destroyCharts();
  const demo = DEMO ? `<div class="demo-box"><b>Demo mode</b> — Firebase isn't connected yet, so this uses sample data in your browser only. Sign in as:
    <div class="demo-users">${store.demoUsers().map((u) => `<button type="button" class="chip" data-email="${esc(u.email)}">
      ${esc(u.name)}<small>${u.role === "admin" ? "Admin – all branches" : esc(u.branch)}</small></button>`).join("")}</div></div>` : "";
  $("#app").innerHTML = `<div class="login-wrap"><form class="login card" id="lf">
    ${logo}<h1>Marketing Task Tracker</h1><p class="muted">Commit tasks, report progress, track completion across branches.</p>
    ${DEMO ? "" : `<label>Email<input name="email" type="email" required autocomplete="username"></label>
    <label>Password<input name="pw" type="password" required autocomplete="current-password"></label>
    <button class="btn primary block">Sign in</button>
    <button type="button" class="link" id="forgot">Forgot password?</button>`}
    ${demo}</form></div>`;
  $$(".demo-users .chip").forEach((b) => (b.onclick = () => store.signIn(b.dataset.email)));
  if (DEMO) return;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await store.signIn(f.get("email").trim(), f.get("pw")); } catch (er) { toast("Sign-in failed: " + errMsg(er), true); }
  };
  $("#forgot").onclick = async () => {
    const em = $("#lf").email.value.trim();
    if (!em) return toast("Enter your email first", true);
    try { await store.resetPassword(em); toast("Password reset email sent"); } catch (er) { toast(errMsg(er), true); }
  };
}

// ---------------------------------------------------------------- shell
const NAV_ADMIN = [["dashboard", "Dashboard"], ["tasks", "All Tasks"], ["leads", "Leads"], ["team", "Team"], ["settings", "Settings"]];
const NAV_STAFF = [["my-dashboard", "My Dashboard"], ["my-tasks", "My Tasks"], ["my-leads", "My Leads"]];

function renderShell() {
  const nav = isAdmin() ? NAV_ADMIN : NAV_STAFF;
  $("#app").innerHTML = `
    ${DEMO ? `<div class="demo-bar">Demo mode — sample data only. <button class="link" id="resetDemo">Reset sample data</button></div>` : ""}
    <header class="top">
      <div class="brand">${logo}<div><b>Marketing Task Tracker</b><span>${isAdmin() ? "Admin · All branches" : esc(S.profile.branch + " · " + (S.profile.team || "Staff"))}</span></div></div>
      <nav>${nav.map(([k, l]) => `<button data-v="${k}" class="${S.view === k ? "on" : ""}">${l}</button>`).join("")}</nav>
      <div class="me"><span>${esc(S.profile.name)}</span><button class="btn sm" id="out">Sign out</button></div>
    </header>
    <main id="main"></main>`;
  $$("header nav button").forEach((b) => (b.onclick = () => { S.view = b.dataset.v; S.showAllLeads = false; renderShell(); }));
  $("#out").onclick = () => store.signOut();
  if ($("#resetDemo")) $("#resetDemo").onclick = () => { store.resetDemo(); store.signOut(); };
  renderView();
}

function renderView() {
  destroyCharts();
  ({ dashboard: viewDashboard, tasks: viewTasks, team: viewTeam, settings: viewSettings,
    "my-dashboard": viewMyDashboard, "my-tasks": viewMyTasks, leads: viewLeads, "my-leads": viewLeads })[S.view]();
}

function destroyCharts() { S.charts.forEach((c) => c.destroy()); S.charts = []; }

// ---------------------------------------------------------------- filters
function filterBar({ people = true, status = false, leads = false } = {}) {
  const [from, to] = range();
  const staff = S.users.filter((u) => u.role !== "admin" && (!S.f.branch || u.branch === S.f.branch))
    .sort((a, b) => a.name.localeCompare(b.name)).map((u) => [u.uid, u.name]);
  return `<div class="filters card no-print">
    <label>Period<select data-f="period">${opts(PERIODS, S.f.period)}</select></label>
    ${S.f.period === "custom" ? `<label>From<input type="date" data-f="from" value="${from}"></label><label>To<input type="date" data-f="to" value="${to}"></label>` : ""}
    ${isAdmin() ? `<label>Branch<select data-f="branch">${opts(S.settings.branches, S.f.branch, "All branches")}</select></label>
    <label>Team<select data-f="team">${opts(S.settings.teams, S.f.team, "All teams")}</select></label>
    ${people ? `<label>Person<select data-f="uid">${opts(staff, S.f.uid, "All people")}</select></label>` : ""}` : ""}
    ${leads ? `<label>Lead source<select data-f="source">${opts(S.settings.leadSources, S.f.source, "All sources")}</select></label>
    <label>Service<select data-f="service">${opts(S.settings.leadServices, S.f.service, "All services")}</select></label>`
    : `<label>Category<select data-f="category">${opts(S.settings.categories, S.f.category, "All categories")}</select></label>`}
    ${status ? `<label>Status<select data-f="status">${opts([...STATUSES, "Overdue"], S.f.status, "All statuses")}</select></label>` : ""}
    <span class="range">${fmt(from)} – ${fmt(to)}</span>
  </div>`;
}
function bindFilters() {
  $$("[data-f]").forEach((el) => (el.onchange = async () => {
    const k = el.dataset.f;
    if (k === "period" && el.value === "custom") { const [a, b] = range(); S.f.from = a; S.f.to = b; }
    S.f[k] = el.value;
    if (k === "branch") S.f.uid = "";
    if (isAdmin() && ["period", "from", "to"].includes(k)) { renderLoading2(); await loadTasks(); }
    renderView();
  }));
}
function renderLoading2() { $("#main").innerHTML = `<div class="center"><div class="spinner"></div></div>`; }

// ---------------------------------------------------------------- KPI + charts
function kpis(m) {
  const k = (label, val, cls = "", sub = "") => `<div class="kpi ${cls}"><span>${label}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  return `<div class="kpis">
    ${k("Tasks committed", m.total)}
    ${k("Completed", m.done, "good", `${m.rate}% completion`)}
    ${k("On-time delivery", m.ontimeRate + "%", "", `${m.ontime} of ${m.done} done on time`)}
    ${k("In progress", m.prog + m.committed, "", `${m.committed} not started`)}
    ${k("Overdue", m.overdue, m.overdue ? "bad" : "")}
    ${k("Blocked", m.blocked, m.blocked ? "warn" : "")}
  </div>`;
}
const C = { done: "#21B573", pending: "#0F72BA", overdue: "#D64545", committed: "#9DC3E6", grid: "rgba(120,130,150,.18)", text: "#5b6b7d" };
function chart(id, cfg) {
  if (!window.Chart || !$("#" + id)) return;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = C.text;
  S.charts.push(new Chart($("#" + id), cfg));
}
const baseOpts = (horizontal, stacked) => ({
  responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x",
  plugins: { legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } } },
  scales: {
    x: { stacked, grid: { color: horizontal ? C.grid : "transparent" }, ticks: { precision: 0 } },
    y: { stacked, grid: { color: horizontal ? "transparent" : C.grid }, ticks: { precision: 0 } },
  },
});
function stackChart(id, groups, horizontal = true) {
  const labels = Object.keys(groups).sort();
  const ms = labels.map((l) => metrics(groups[l]));
  chart(id, { type: "bar", data: { labels, datasets: [
    { label: "Completed", data: ms.map((m) => m.done), backgroundColor: C.done, borderRadius: 3 },
    { label: "Open", data: ms.map((m) => m.pending - m.overdue), backgroundColor: C.pending, borderRadius: 3 },
    { label: "Overdue", data: ms.map((m) => m.overdue), backgroundColor: C.overdue, borderRadius: 3 },
  ] }, options: baseOpts(horizontal, true) });
}
function trendChart(id, list) {
  const [, to] = range();
  const end = weekStart(to);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(end, (i - 7) * 7));
  const data = weeks.map((w) => metrics(list.filter((t) => t.dueDate >= w && t.dueDate <= addDays(w, 6))));
  chart(id, { type: "bar", data: { labels: weeks.map(fmtShort), datasets: [
    { label: "Committed", data: data.map((m) => m.total), backgroundColor: C.committed, borderRadius: 3 },
    { label: "Completed", data: data.map((m) => m.done), backgroundColor: C.done, borderRadius: 3 },
  ] }, options: baseOpts(false, false) });
}

// ---------------------------------------------------------------- admin: dashboard
function viewDashboard() {
  const list = filtered();
  const m = metrics(list);
  const trendList = S.tasks.filter((t) => (!S.f.branch || t.branch === S.f.branch) && (!S.f.team || t.team === S.f.team)
    && (!S.f.uid || t.uid === S.f.uid) && (!S.f.category || t.category === S.f.category));
  const [from, to] = range();
  $("#main").innerHTML = `
    <div class="page-head"><h2>Admin Dashboard</h2>
      <div class="actions no-print"><button class="btn" id="csv">Export CSV</button><button class="btn" onclick="print()">Print / PDF</button></div></div>
    <div class="print-only print-head">${logo}<div><h2>Marketing Task Report</h2><p>${fmt(from)} – ${fmt(to)}${S.f.branch ? " · " + esc(S.f.branch) : " · All branches"}</p></div></div>
    ${filterBar()}
    ${kpis(m)}
    <div class="grid2">
      <section class="card"><h3>Location-wise completion</h3><div class="chart" style="height:${Math.max(220, Object.keys(groupBy(list, (t) => t.branch)).length * 38 + 70)}px"><canvas id="cBranch"></canvas></div></section>
      <section class="card"><h3>Weekly trend · committed vs completed</h3><div class="chart"><canvas id="cTrend"></canvas></div></section>
      <section class="card"><h3>Team-wise completion</h3><div class="chart"><canvas id="cTeam"></canvas></div></section>
      <section class="card"><h3>Category-wise completion</h3><div class="chart" style="height:${Math.max(220, Object.keys(groupBy(list, (t) => t.category)).length * 30 + 70)}px"><canvas id="cCat"></canvas></div></section>
    </div>
    <section class="card"><h3>Location-wise report</h3>${summaryTable(list, "branch")}</section>
    <section class="card"><h3>Person-wise report</h3>${summaryTable(list, "person")}</section>
    ${list.length ? "" : `<p class="empty">No tasks due in this period for the selected filters.</p>`}`;
  bindFilters();
  bindSort();
  $("#csv").onclick = () => exportCSV(list);
  $$("[data-person]").forEach((r) => (r.onclick = () => { S.f.uid = r.dataset.person; S.view = "tasks"; renderShell(); }));
  $$("[data-branch]").forEach((r) => (r.onclick = () => { S.f.branch = r.dataset.branch; S.f.uid = ""; renderView(); }));
  stackChart("cBranch", groupBy(list, (t) => t.branch));
  stackChart("cTeam", groupBy(list, (t) => t.team || "—"), false);
  stackChart("cCat", groupBy(list, (t) => t.category));
  trendChart("cTrend", trendList);
}

function summaryTable(list, by) {
  let rows;
  if (by === "branch") {
    const g = groupBy(list, (t) => t.branch);
    rows = Object.entries(g).map(([b, ts]) => ({ key: b, name: b, people: new Set(ts.map((t) => t.uid)).size, ...metrics(ts) }));
  } else {
    const g = groupBy(list, (t) => t.uid);
    // include active staff with zero commitments so gaps are visible
    S.users.filter((u) => u.role !== "admin" && u.active && (!S.f.branch || u.branch === S.f.branch)
      && (!S.f.team || u.team === S.f.team) && (!S.f.uid || u.uid === S.f.uid)).forEach((u) => (g[u.uid] ||= []));
    rows = Object.entries(g).map(([uid, ts]) => {
      const u = S.users.find((x) => x.uid === uid) || {};
      return { key: uid, name: u.name || ts[0]?.userName || "?", branch: u.branch || ts[0]?.branch, team: u.team || ts[0]?.team, ...metrics(ts) };
    });
  }
  const { key, dir } = S.sort;
  rows.sort((a, b) => (typeof a[key] === "string" ? a[key].localeCompare(b[key]) : a[key] - b[key]) * dir || b.total - a.total);
  const th = (k, l) => `<th data-sort="${k}" class="${key === k ? "sorted" : ""}">${l}${key === k ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`;
  const bar = (r) => `<div class="meter"><i style="width:${r.rate}%;background:${r.rate >= 80 ? C.done : r.rate >= 50 ? "#E0A526" : C.overdue}"></i></div>`;
  return `<div class="table-wrap"><table class="tbl"><thead><tr>
    ${th("name", by === "branch" ? "Location" : "Person")}
    ${by === "branch" ? th("people", "People") : th("branch", "Location") + th("team", "Team")}
    ${th("total", "Committed")}${th("done", "Completed")}${th("pending", "Pending")}${th("overdue", "Overdue")}${th("rate", "Completion")}${th("ontimeRate", "On-time")}
    </tr></thead><tbody>
    ${rows.map((r) => `<tr class="click" data-${by}="${esc(r.key)}"><td><b>${esc(r.name)}</b></td>
      ${by === "branch" ? `<td>${r.people}</td>` : `<td>${esc(r.branch)}</td><td>${esc(r.team)}</td>`}
      <td>${r.total}</td><td>${r.done}</td><td>${r.pending}</td><td class="${r.overdue ? "red" : ""}">${r.overdue}</td>
      <td class="rate">${bar(r)}<span>${r.total ? r.rate + "%" : "—"}</span></td><td>${r.done ? r.ontimeRate + "%" : "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}
function bindSort() {
  $$("th[data-sort]").forEach((th) => (th.onclick = () => {
    const k = th.dataset.sort;
    S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : (["name", "branch", "team"].includes(k) ? 1 : -1) };
    renderView();
  }));
}

function exportCSV(list) {
  const cols = ["userName", "branch", "team", "category", "title", "description", "priority", "target", "achieved", "commitDate", "dueDate", "status", "progress", "completedOn", "proofLink", "remarks", "adminComment"];
  const head = ["Person", "Location", "Team", "Category", "Task", "Description", "Priority", "Target", "Achieved", "Committed on", "Due", "Status", "Progress %", "Completed on", "Proof link", "Remarks", "Admin comment", "Overdue"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [head.map(q).join(","), ...list.map((t) => [...cols.map((c) => q(t[c])), q(isOverdue(t) ? "Yes" : "")].join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  const [f, to] = range();
  a.download = `renewplus-tasks_${f}_to_${to}.csv`;
  a.click();
}

// ---------------------------------------------------------------- task table (shared)
function badge(t) {
  return `<span class="badge ${statusKey(t.status)}">${esc(t.status)}</span>${isOverdue(t) ? ` <span class="badge overdue">Overdue</span>` : ""}`;
}
function taskTable(list, { admin }) {
  if (!list.length) return `<p class="empty">No tasks match these filters.</p>`;
  list = [...list].sort((a, b) => (a.status === "Completed") - (b.status === "Completed") || a.dueDate.localeCompare(b.dueDate));
  return `<div class="table-wrap"><table class="tbl tasks"><thead><tr>
    <th>Task</th>${admin ? "<th>Person</th><th>Location</th>" : ""}<th>Category</th><th>Due</th><th>Status</th><th>Progress</th><th>Proof / remarks</th><th class="no-print"></th>
    </tr></thead><tbody>${list.map((t) => `<tr>
      <td><b>${esc(t.title)}</b><small class="pri ${statusKey(t.priority || "")}">${esc(t.priority || "")}</small>
        ${t.description ? `<div class="muted sm">${esc(t.description)}</div>` : ""}
        ${t.adminComment ? `<div class="admin-note">Admin: ${esc(t.adminComment)}</div>` : ""}</td>
      ${admin ? `<td>${esc(t.userName)}<div class="muted sm">${esc(t.team || "")}</div></td><td>${esc(t.branch)}</td>` : ""}
      <td>${esc(t.category)}</td>
      <td class="nowrap">${fmt(t.dueDate)}${t.completedOn ? `<div class="muted sm">Done ${fmt(t.completedOn)}</div>` : ""}</td>
      <td>${badge(t)}</td>
      <td class="rate"><div class="meter"><i style="width:${t.progress || 0}%"></i></div><span>${t.progress || 0}%</span>
        ${t.target ? `<div class="muted sm">${esc(t.achieved || 0)} / ${esc(t.target)}</div>` : ""}</td>
      <td class="sm">${t.proofLink ? `<a href="${esc(t.proofLink)}" target="_blank" rel="noopener">Open proof ↗</a>` : ""}
        ${t.remarks ? `<div class="muted">${esc(t.remarks)}</div>` : ""}</td>
      <td class="no-print nowrap">${admin
        ? `<button class="btn sm" data-edit="${t.id}">Edit</button> <button class="btn sm" data-note="${t.id}">Comment</button>`
        : `<button class="btn sm primary" data-upd="${t.id}">Update</button>${t.status === "Committed" ? ` <button class="btn sm ghost" data-del="${t.id}" title="Delete">✕</button>` : ""}`}</td>
    </tr>`).join("")}</tbody></table></div>`;
}
function bindTaskButtons() {
  const find = (id) => S.tasks.find((t) => t.id === id);
  $$("[data-upd]").forEach((b) => (b.onclick = () => updateModal(find(b.dataset.upd))));
  $$("[data-edit]").forEach((b) => (b.onclick = () => taskModal(find(b.dataset.edit))));
  $$("[data-note]").forEach((b) => (b.onclick = () => noteModal(find(b.dataset.note))));
  $$("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this commitment?")) return;
    try { await store.deleteTask(b.dataset.del); S.tasks = S.tasks.filter((t) => t.id !== b.dataset.del); renderView(); toast("Deleted"); }
    catch (e) { toast(errMsg(e), true); }
  }));
}

// ---------------------------------------------------------------- admin: tasks
function viewTasks() {
  const list = filtered();
  $("#main").innerHTML = `<div class="page-head"><h2>All Tasks <small class="muted">${list.length}</small></h2>
    <div class="actions no-print"><button class="btn primary" id="assign">+ Assign task</button><button class="btn" id="csv">Export CSV</button><button class="btn" onclick="print()">Print / PDF</button></div></div>
    ${filterBar({ status: true })}
    <section class="card">${taskTable(list, { admin: true })}</section>`;
  bindFilters();
  bindTaskButtons();
  $("#assign").onclick = () => taskModal(null);
  $("#csv").onclick = () => exportCSV(list);
}

// ---------------------------------------------------------------- admin: team
function viewTeam() {
  const users = [...S.users].sort((a, b) => (a.role === "admin" ? -1 : 0) - (b.role === "admin" ? -1 : 0) || a.branch.localeCompare(b.branch) || a.name.localeCompare(b.name));
  $("#main").innerHTML = `<div class="page-head"><h2>Team <small class="muted">${users.filter((u) => u.active).length} active</small></h2>
    <div class="actions"><button class="btn primary" id="add">+ Add person</button></div></div>
    <section class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Location</th><th>Team</th><th>Status</th><th></th></tr></thead>
    <tbody>${users.map((u) => `<tr class="${u.active ? "" : "inactive"}"><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td>
      <td><span class="badge ${u.role === "admin" ? "completed" : "committed"}">${u.role === "admin" ? "Admin" : "Staff"}</span></td>
      <td>${esc(u.branch)}</td><td>${esc(u.team)}</td><td>${u.active ? "Active" : "Inactive"}</td>
      <td class="nowrap"><button class="btn sm" data-u="${u.uid}">Edit</button>
      ${DEMO ? "" : `<button class="btn sm" data-reset="${esc(u.email)}">Reset password</button>`}
      ${u.uid !== S.user.uid ? `<button class="btn sm ghost" data-act="${u.uid}">${u.active ? "Deactivate" : "Activate"}</button> <button class="btn sm danger" data-delu="${u.uid}">Delete</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div></section>
    <p class="muted sm">Staff can only sign in and see their own commitments. Deactivated people lose access immediately but their past tasks stay in reports. <b>Delete</b> removes the person from this list for good.</p>`;
  $("#add").onclick = () => userModal(null);
  $$("[data-u]").forEach((b) => (b.onclick = () => userModal(S.users.find((u) => u.uid === b.dataset.u))));
  $$("[data-reset]").forEach((b) => (b.onclick = async () => {
    try { await store.resetPassword(b.dataset.reset); toast("Reset email sent to " + b.dataset.reset); } catch (e) { toast(errMsg(e), true); }
  }));
  $$("[data-act]").forEach((b) => (b.onclick = async () => {
    const u = S.users.find((x) => x.uid === b.dataset.act);
    try { await store.updateUser(u.uid, { active: !u.active }); u.active = !u.active; renderView(); } catch (e) { toast(errMsg(e), true); }
  }));
  $$("[data-delu]").forEach((b) => (b.onclick = () => deleteUserModal(S.users.find((x) => x.uid === b.dataset.delu))));
}

function deleteUserModal(u) {
  modal("Delete person", `
    <div class="task-sum"><b>${esc(u.name)}</b><span class="muted sm">${esc(u.email)} · ${esc(u.branch)}</span></div>
    <p>This removes ${esc(u.name)} from the Team list and blocks their access to the tracker. It cannot be undone.</p>
    <label class="check"><input type="checkbox" name="withTasks"> Also delete all of their tasks and lead entries (otherwise they stay in reports)</label>
    ${DEMO ? "" : `<p class="muted sm">To free the email for re-use, also delete the login in Firebase console → Authentication → Users.</p>`}`,
  async (f) => {
    await store.deleteUser(u.uid, !!f.withTasks);
    S.users = S.users.filter((x) => x.uid !== u.uid);
    if (f.withTasks) { S.tasks = S.tasks.filter((t) => t.uid !== u.uid); S.leads = S.leads.filter((l) => l.uid !== u.uid); }
    toast(`${u.name} deleted`);
    renderView();
  }, "Delete permanently");
}

function userModal(u) {
  const s = S.settings;
  modal(u ? "Edit person" : "Add person", `
    <label>Full name<input name="name" required value="${esc(u?.name)}"></label>
    <label>Email (login)<input name="email" type="email" required value="${esc(u?.email)}" ${u ? "disabled" : ""}></label>
    ${u ? "" : `<label>Temporary password<input name="password" minlength="6" required value="Renew@${Math.floor(1000 + Math.random() * 9000)}"><small class="muted">Share this with the person; they can change it via “Forgot password”.</small></label>`}
    <div class="row"><label>Role<select name="role">${opts([["staff", "Staff"], ["admin", "Admin"]], u?.role || "staff")}</select></label>
    <label>Location / branch<select name="branch" required>${opts(s.branches, u?.branch)}</select></label></div>
    <label>Team<select name="team">${opts(s.teams, u?.team, "—")}</select></label>`,
  async (f) => {
    const data = { name: f.name.trim(), role: f.role, branch: f.branch, team: f.team };
    if (u) { await store.updateUser(u.uid, data); Object.assign(u, data); toast("Saved"); }
    else { const nu = await store.createUser({ ...data, email: f.email.trim(), password: f.password }); S.users.push(nu); toast(`${nu.name} added. Share the login details with them.`); }
    renderView();
  });
}

// ---------------------------------------------------------------- admin: settings
function viewSettings() {
  const s = S.settings;
  const box = (k, label, hint) => `<section class="card"><h3>${label}</h3><p class="muted sm">${hint}</p>
    <textarea name="${k}" rows="10">${esc(s[k].join("\n"))}</textarea></section>`;
  $("#main").innerHTML = `<div class="page-head"><h2>Settings</h2></div>
    <form id="sf"><div class="grid3 settings-grid">
      ${box("branches", "Locations / branches", "One per line, e.g. “Chennai - Anna Nagar”.")}
      ${box("teams", "Teams", "Digital marketing teams, one per line.")}
      ${box("categories", "Task categories", "Types of marketing work, one per line.")}
      ${box("leadSources", "Lead sources", "Where leads come from, one per line.")}
      ${box("leadServices", "Lead services", "Treatment / service the lead asked about, one per line.")}
    </div><button class="btn primary">Save settings</button></form>`;
  $("#sf").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const lines = (k) => [...new Set(f.get(k).split("\n").map((x) => x.trim()).filter(Boolean))];
    const ns = { branches: lines("branches"), teams: lines("teams"), categories: lines("categories"),
      leadSources: lines("leadSources"), leadServices: lines("leadServices") };
    if (!ns.branches.length || !ns.categories.length || !ns.leadSources.length || !ns.leadServices.length)
      return toast("Each list needs at least one line (teams can be empty)", true);
    try { await store.saveSettings(ns); S.settings = ns; toast("Settings saved"); } catch (er) { toast(errMsg(er), true); }
  };
}

// ---------------------------------------------------------------- staff views
function viewMyDashboard() {
  const list = filtered();
  const m = metrics(list);
  const mine = S.tasks;
  const t = today();
  const dueSoon = mine.filter((x) => x.status !== "Completed" && x.dueDate >= t && x.dueDate <= addDays(t, 7)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const late = mine.filter(isOverdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const [from, to] = range();
  const mini = (arr, empty) => arr.length ? `<ul class="mini">${arr.map((x) => `<li><button class="link" data-upd="${x.id}">${esc(x.title)}</button><span>${fmt(x.dueDate)}</span></li>`).join("")}</ul>` : `<p class="muted sm">${empty}</p>`;
  $("#main").innerHTML = `
    <div class="page-head"><h2>Hello, ${esc(S.profile.name.split(" ")[0])}</h2>
      <div class="actions no-print"><button class="btn primary" id="commit">+ Commit a task</button><button class="btn" onclick="print()">Print my report</button></div></div>
    <div class="print-only print-head">${logo}<div><h2>Task Report — ${esc(S.profile.name)}</h2><p>${esc(S.profile.branch)} · ${fmt(from)} – ${fmt(to)}</p></div></div>
    ${filterBar()}
    ${kpis(m)}
    <div class="grid2">
      <section class="card"><h3>My weekly trend</h3><div class="chart"><canvas id="cTrend"></canvas></div></section>
      <section class="card"><h3>By category</h3><div class="chart"><canvas id="cCat"></canvas></div></section>
      <section class="card no-print"><h3 class="red">Overdue (${late.length})</h3>${mini(late, "Nothing overdue — great work.")}</section>
      <section class="card no-print"><h3>Due in the next 7 days (${dueSoon.length})</h3>${mini(dueSoon, "No upcoming due dates.")}</section>
    </div>
    <section class="card print-only"><h3>Tasks in this period</h3>${taskTable(list, { admin: false })}</section>`;
  bindFilters();
  bindTaskButtons();
  $("#commit").onclick = () => taskModal(null);
  trendChart("cTrend", mine.filter((x) => !S.f.category || x.category === S.f.category));
  stackChart("cCat", groupBy(list, (x) => x.category));
}

function viewMyTasks() {
  const list = filtered();
  $("#main").innerHTML = `<div class="page-head"><h2>My Tasks <small class="muted">${list.length}</small></h2>
    <div class="actions no-print"><button class="btn primary" id="commit">+ Commit a task</button></div></div>
    ${filterBar({ status: true })}
    <section class="card">${taskTable(list, { admin: false })}</section>`;
  bindFilters();
  bindTaskButtons();
  $("#commit").onclick = () => taskModal(null);
}

// ---------------------------------------------------------------- modals
function modal(title, body, onSubmit, submitLabel = "Save") {
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.innerHTML = `<form class="modal card"><div class="modal-head"><h3>${title}</h3><button type="button" class="x" aria-label="Close">✕</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot"><button type="button" class="btn cancel">Cancel</button><button class="btn primary">${submitLabel}</button></div></form>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  $(".x", wrap).onclick = close; $(".cancel", wrap).onclick = close;
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  const form = $("form", wrap);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $(".modal-foot .primary", wrap);
    btn.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(form)), form); close(); }
    catch (er) { console.error(er); toast(errMsg(er), true); btn.disabled = false; }
  };
  setTimeout(() => $("input:not([disabled]),select,textarea", wrap)?.focus(), 30);
  return form;
}

// Commit (staff) / assign or edit (admin)
function taskModal(t) {
  const s = S.settings;
  const admin = isAdmin();
  const staff = S.users.filter((u) => u.role !== "admin" && u.active).sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => [u.uid, `${u.name} — ${u.branch}`]);
  const form = modal(t ? "Edit task" : admin ? "Assign a task" : "Commit a task", `
    ${admin && !t ? `<label>Assign to<select name="uid" required>${opts(staff, S.f.uid, "Select person")}</select></label>` : ""}
    <label>Task<input name="title" required maxlength="140" placeholder="e.g. 6 Instagram posts for PRP offer" value="${esc(t?.title)}"></label>
    <label>Details (optional)<textarea name="description" rows="2" maxlength="500">${esc(t?.description)}</textarea></label>
    <div class="row"><label>Category<select name="category" required>${opts(s.categories, t?.category, "Select")}</select></label>
    <label>Priority<select name="priority">${opts(PRIORITIES, t?.priority || "Medium")}</select></label></div>
    <div class="row"><label>Due date<input type="date" name="dueDate" required min="${t ? "" : today()}" value="${esc(t?.dueDate || addDays(today(), 7))}"></label>
    <label>Target quantity (optional)<input type="number" min="0" name="target" placeholder="e.g. 6" value="${esc(t?.target)}"></label></div>
    ${t ? `<label>Status<select name="status">${opts(STATUSES, t.status)}</select></label>` : ""}`,
  async (f) => {
    const base = { title: f.title.trim(), description: f.description.trim(), category: f.category, priority: f.priority, dueDate: f.dueDate, target: f.target ? Number(f.target) : "" };
    const now = new Date().toISOString();
    if (t) {
      const patch = { ...base, status: f.status, updatedAt: now };
      if (f.status === "Completed" && t.status !== "Completed") Object.assign(patch, { completedOn: today(), progress: 100 });
      if (f.status !== "Completed") patch.completedOn = "";
      await store.updateTask(t.id, patch); Object.assign(t, patch); toast("Task updated");
    } else {
      const who = admin ? S.users.find((u) => u.uid === f.uid) : S.profile;
      const nt = {
        ...base, uid: who.uid, userName: who.name, branch: who.branch, team: who.team || "",
        commitDate: today(), status: "Committed", progress: 0, achieved: "", proofLink: "", remarks: "",
        completedOn: "", createdBy: S.user.uid, adminComment: "", createdAt: now, updatedAt: now, updates: [],
      };
      nt.id = await store.addTask(nt);
      const [from, to] = range();
      if (!admin || (nt.dueDate >= from && nt.dueDate <= to)) S.tasks.push(nt);
      toast(admin ? `Assigned to ${who.name}` : "Task committed");
    }
    renderView();
  }, t ? "Save" : admin ? "Assign" : "Commit");
  if (!admin && !t) $("[name=title]", form).focus();
}

// Staff progress update
function updateModal(t) {
  const form = modal("Update progress", `
    <div class="task-sum"><b>${esc(t.title)}</b><span class="muted sm">${esc(t.category)} · due ${fmt(t.dueDate)}</span></div>
    ${t.adminComment ? `<div class="admin-note">Admin: ${esc(t.adminComment)}</div>` : ""}
    <div class="row"><label>Status<select name="status">${opts(STATUSES, t.status)}</select></label>
    ${t.target ? `<label>Achieved (of ${esc(t.target)})<input type="number" min="0" name="achieved" value="${esc(t.achieved || 0)}"></label>` : ""}
    <label>Progress %<input type="number" min="0" max="100" step="5" name="progress" value="${t.progress || 0}"></label></div>
    <label>Proof link (Drive / post / report URL)<input type="url" name="proofLink" placeholder="https://" value="${esc(t.proofLink)}"></label>
    <label>Remarks / blockers<textarea name="remarks" rows="2" maxlength="500">${esc(t.remarks)}</textarea></label>
    ${(t.updates || []).length ? `<details><summary class="sm">Update history (${t.updates.length})</summary><ul class="hist">${t.updates.slice().reverse().map((u) =>
      `<li><span>${fmt(u.on)}</span> ${esc(u.status)} · ${u.progress}%${u.note ? ` — ${esc(u.note)}` : ""}</li>`).join("")}</ul></details>` : ""}`,
  async (f) => {
    let progress = Math.max(0, Math.min(100, Number(f.progress) || 0));
    const achieved = f.achieved !== undefined ? Number(f.achieved) || 0 : t.achieved;
    if (t.target && f.achieved !== undefined) progress = Math.min(100, Math.round((achieved / t.target) * 100));
    if (f.status === "Completed") progress = 100;
    if (f.status === "Committed" && progress > 0) f.status = "In Progress";
    const patch = {
      status: f.status, progress, achieved, proofLink: f.proofLink.trim(), remarks: f.remarks.trim(),
      completedOn: f.status === "Completed" ? (t.completedOn || today()) : "", updatedAt: new Date().toISOString(),
      updates: [...(t.updates || []), { on: today(), status: f.status, progress, note: f.remarks.trim().slice(0, 140) }].slice(-30),
    };
    await store.updateTask(t.id, patch); Object.assign(t, patch);
    toast(f.status === "Completed" ? "Marked complete — well done" : "Progress updated");
    renderView();
  }, "Save update");
  const st = $("[name=status]", form), pr = $("[name=progress]", form), ach = $("[name=achieved]", form);
  st.onchange = () => { if (st.value === "Completed") { pr.value = 100; if (ach) ach.value = t.target; } };
  if (ach) ach.oninput = () => { pr.value = Math.min(100, Math.round((Number(ach.value) / t.target) * 100)); };
}

function noteModal(t) {
  modal("Admin comment", `<div class="task-sum"><b>${esc(t.title)}</b><span class="muted sm">${esc(t.userName)} · ${esc(t.branch)}</span></div>
    <label>Comment (visible to ${esc(t.userName)})<textarea name="c" rows="3" maxlength="500">${esc(t.adminComment)}</textarea></label>`,
  async (f) => { const p = { adminComment: f.c.trim() }; await store.updateTask(t.id, p); Object.assign(t, p); toast("Comment saved"); renderView(); });
}

// ---------------------------------------------------------------- leads (admin + staff)
const PALETTE = ["#0F72BA", "#21B573", "#E0A526", "#8E5CC4", "#D64545", "#09A79C", "#E07A26", "#5B6B7D", "#C2408E", "#7FA83A", "#3A8FD9", "#9C7B4A"];
const sum = (arr) => arr.reduce((a, l) => a + (Number(l.count) || 0), 0);

function filteredLeads() {
  const [from, to] = range();
  return S.leads.filter((l) => l.date >= from && l.date <= to
    && (!S.f.branch || l.branch === S.f.branch) && (!S.f.team || l.team === S.f.team) && (!S.f.uid || l.uid === S.f.uid)
    && (!S.f.source || l.source === S.f.source) && (!S.f.service || l.service === S.f.service));
}
function totalsBy(list, key) {
  const g = groupBy(list, (l) => l[key] || "—");
  return Object.entries(g).map(([k, v]) => [k, sum(v)]).sort((a, b) => b[1] - a[1]);
}

function viewLeads() {
  const admin = isAdmin();
  const list = filteredLeads();
  const total = sum(list);
  const [from, to] = range();
  const days = Math.round((new Date(to) - new Date(from)) / 864e5) + 1;
  const elapsed = Math.max(1, Math.min(days, Math.round((new Date(today()) - new Date(from)) / 864e5) + 1));
  const bySource = totalsBy(list, "source"), byService = totalsBy(list, "service");
  const people = new Set(list.map((l) => l.uid)).size;
  const k = (label, val, sub = "", cls = "") => `<div class="kpi ${cls}"><span>${label}</span><b>${val}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
  $("#main").innerHTML = `
    <div class="page-head"><h2>${admin ? "Leads Report" : "My Leads"}</h2>
      <div class="actions no-print"><button class="btn primary" id="addLead">+ Add leads</button>
      <button class="btn" id="csv">Export CSV</button><button class="btn" onclick="print()">Print / PDF</button></div></div>
    <div class="print-only print-head">${logo}<div><h2>Leads Report${admin ? "" : " — " + esc(S.profile.name)}</h2><p>${fmt(from)} – ${fmt(to)}${S.f.branch ? " · " + esc(S.f.branch) : ""}</p></div></div>
    ${filterBar({ leads: true })}
    <div class="kpis">
      ${k("Total leads", total.toLocaleString("en-IN"), "", "good")}
      ${k("Average per day", (total / (to < today() ? days : elapsed)).toFixed(1))}
      ${k("Top source", bySource[0] ? bySource[0][1] : 0, bySource[0]?.[0] || "—")}
      ${k("Top service", byService[0] ? byService[0][1] : 0, byService[0]?.[0] || "—")}
      ${k(admin ? "People reporting" : "Days reported", admin ? people : new Set(list.map((l) => l.date)).size)}
      ${k("Entries", list.length)}
    </div>
    <div class="grid2">
      <section class="card"><h3>Leads by source</h3><div class="chart" style="height:${Math.max(220, bySource.length * 30 + 50)}px"><canvas id="lSource"></canvas></div></section>
      <section class="card"><h3>Leads by service</h3><div class="chart" style="height:${Math.max(220, byService.length * 30 + 50)}px"><canvas id="lService"></canvas></div></section>
      <section class="card ${admin ? "" : "span2"}"><h3>Leads over time</h3><div class="chart"><canvas id="lTrend"></canvas></div></section>
      ${admin ? `<section class="card"><h3>Location-wise leads by source</h3><div class="chart" style="height:${Math.max(240, new Set(list.map((l) => l.branch)).size * 38 + 90)}px"><canvas id="lBranch"></canvas></div></section>` : ""}
    </div>
    ${admin ? `<section class="card"><h3>Location-wise leads (by source)</h3>${matrixTable(list, "branch", "Location")}</section>
    <section class="card"><h3>Person-wise leads</h3>${personLeadsTable(list)}</section>` : ""}
    <section class="card"><h3>${admin ? "All entries" : "My entries"} <small class="muted">${list.length}</small></h3>${leadEntries(list, admin)}</section>`;
  bindFilters();
  $("#addLead").onclick = () => leadModal(null);
  if ($("#moreLeads")) $("#moreLeads").onclick = () => { S.showAllLeads = true; renderView(); };
  $("#csv").onclick = () => exportLeadsCSV(list);
  $$("[data-ledit]").forEach((b) => (b.onclick = () => leadModal(S.leads.find((l) => l.id === b.dataset.ledit))));
  $$("[data-ldel]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this lead entry?")) return;
    try { await store.deleteLead(b.dataset.ldel); S.leads = S.leads.filter((l) => l.id !== b.dataset.ldel); renderView(); toast("Deleted"); }
    catch (e) { toast(errMsg(e), true); }
  }));
  $$("[data-lbranch]").forEach((r) => (r.onclick = () => { S.f.branch = r.dataset.lbranch; S.f.uid = ""; renderView(); }));
  $$("[data-lperson]").forEach((r) => (r.onclick = () => { S.f.uid = r.dataset.lperson; renderView(); }));
  const hbar = (id, rows, color) => chart(id, { type: "bar", data: { labels: rows.map((r) => r[0]),
    datasets: [{ label: "Leads", data: rows.map((r) => r[1]), backgroundColor: color, borderRadius: 3 }] },
    options: { ...baseOpts(true, false), plugins: { legend: { display: false } } } });
  hbar("lSource", bySource, C.pending);
  hbar("lService", byService, C.done);
  // trend: daily up to 62 days, weekly beyond
  const daily = days <= 62;
  const buckets = [];
  for (let d = daily ? from : weekStart(from); d <= to; d = addDays(d, daily ? 1 : 7)) buckets.push(d);
  const tv = buckets.map((b) => sum(list.filter((l) => l.date >= b && l.date <= (daily ? b : addDays(b, 6)))));
  chart("lTrend", { type: "bar", data: { labels: buckets.map(fmtShort),
    datasets: [{ label: daily ? "Leads per day" : "Leads per week", data: tv, backgroundColor: C.pending, borderRadius: 3 }] },
    options: { ...baseOpts(false, false), plugins: { legend: { display: false } } } });
  if (admin) {
    const branches = totalsBy(list, "branch").map((r) => r[0]);
    const srcs = bySource.map((r) => r[0]);
    chart("lBranch", { type: "bar", data: { labels: branches, datasets: srcs.map((src, i) => ({
      label: src, backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 2,
      data: branches.map((b) => sum(list.filter((l) => l.branch === b && l.source === src))) })) },
      options: baseOpts(true, true) });
  }
}

function matrixTable(list, key, label) {
  if (!list.length) return `<p class="empty">No leads in this period.</p>`;
  const cols = totalsBy(list, "source").map((r) => r[0]);
  const rows = totalsBy(list, key);
  return `<div class="table-wrap"><table class="tbl matrix"><thead><tr><th>${label}</th>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}<th>Total</th></tr></thead><tbody>
    ${rows.map(([r, t]) => `<tr class="click" data-lbranch="${esc(r)}"><td><b>${esc(r)}</b></td>${cols.map((c) => {
      const v = sum(list.filter((l) => l[key] === r && l.source === c)); return `<td>${v || "·"}</td>`; }).join("")}<td><b>${t}</b></td></tr>`).join("")}
    <tr class="total"><td><b>Total</b></td>${cols.map((c) => `<td><b>${sum(list.filter((l) => l.source === c))}</b></td>`).join("")}<td><b>${sum(list)}</b></td></tr>
    </tbody></table></div>`;
}

function personLeadsTable(list) {
  const g = groupBy(list, (l) => l.uid);
  S.users.filter((u) => u.role !== "admin" && u.active && (!S.f.branch || u.branch === S.f.branch)
    && (!S.f.team || u.team === S.f.team) && (!S.f.uid || u.uid === S.f.uid)).forEach((u) => (g[u.uid] ||= []));
  const rows = Object.entries(g).map(([uid, ls]) => {
    const u = S.users.find((x) => x.uid === uid) || {};
    return { uid, name: u.name || ls[0]?.userName || "?", branch: u.branch || ls[0]?.branch, team: u.team || ls[0]?.team,
      total: sum(ls), days: new Set(ls.map((l) => l.date)).size, src: totalsBy(ls, "source")[0], svc: totalsBy(ls, "service")[0] };
  }).sort((a, b) => b.total - a.total);
  if (!rows.length) return `<p class="empty">No staff match these filters.</p>`;
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Location</th><th>Team</th><th>Total leads</th><th>Days reported</th><th>Top source</th><th>Top service</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="click" data-lperson="${esc(r.uid)}"><td><b>${esc(r.name)}</b></td><td>${esc(r.branch)}</td><td>${esc(r.team)}</td>
      <td><b>${r.total}</b></td><td class="${r.days ? "" : "red"}">${r.days}</td><td>${r.src ? `${esc(r.src[0])} <span class="muted">(${r.src[1]})</span>` : "—"}</td>
      <td>${r.svc ? `${esc(r.svc[0])} <span class="muted">(${r.svc[1]})</span>` : "—"}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function leadEntries(list, admin) {
  if (!list.length) return `<p class="empty">No lead entries yet. Click “+ Add leads”.</p>`;
  const rows = [...list].sort((a, b) => b.date.localeCompare(a.date) || (a.userName || "").localeCompare(b.userName || ""));
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th>${admin ? "<th>Person</th><th>Location</th>" : ""}<th>Lead source</th><th>Service</th><th>Leads</th><th class="no-print"></th></tr></thead><tbody>
    ${rows.slice(0, S.showAllLeads ? 1000 : 25).map((l) => `<tr><td class="nowrap">${fmt(l.date)}</td>${admin ? `<td>${esc(l.userName)}</td><td>${esc(l.branch)}</td>` : ""}
      <td>${esc(l.source)}</td><td>${esc(l.service)}</td><td><b>${l.count}</b></td>
      <td class="no-print nowrap"><button class="btn sm" data-ledit="${l.id}">Edit</button> <button class="btn sm ghost" data-ldel="${l.id}" title="Delete">✕</button></td></tr>`).join("")}
    </tbody></table></div>${rows.length > 25 && !S.showAllLeads ? `<p class="no-print"><button class="link" id="moreLeads">Show all ${rows.length} entries</button></p>`
      : rows.length > 1000 ? `<p class="muted sm">Showing latest 1000 of ${rows.length}. Export CSV for all.</p>` : ""}`;
}

function exportLeadsCSV(list) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Date", "Person", "Location", "Team", "Lead source", "Service", "Leads"];
  const csv = [head.map(q).join(","), ...list.sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => [l.date, l.userName, l.branch, l.team, l.source, l.service, l.count].map(q).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  const [f, t] = range();
  a.download = `renewplus-leads_${f}_to_${t}.csv`;
  a.click();
}

// Add (several rows at once) or edit one lead entry
function leadModal(entry) {
  const s = S.settings, admin = isAdmin();
  const staff = S.users.filter((u) => u.role !== "admin" && u.active).sort((a, b) => a.name.localeCompare(b.name)).map((u) => [u.uid, `${u.name} — ${u.branch}`]);
  let n = 0;
  const row = (r = {}) => { const i = n++; return `<div class="lead-row">
    <select name="source_${i}" required aria-label="Lead source">${opts(s.leadSources, r.source, "Lead source")}</select>
    <select name="service_${i}" required aria-label="Service">${opts(s.leadServices, r.service, "Service")}</select>
    <input type="number" name="count_${i}" min="0" step="1" required placeholder="Leads" aria-label="Number of leads" value="${esc(r.count ?? "")}">
    ${entry ? "" : `<button type="button" class="btn sm ghost rm" title="Remove row">✕</button>`}</div>`; };
  const form = modal(entry ? "Edit lead entry" : "Add leads", `
    ${admin && !entry ? `<label>Person<select name="uid" required>${opts(staff, S.f.uid, "Select person")}</select></label>` : ""}
    <label>Date<input type="date" name="date" required max="${today()}" value="${esc(entry?.date || today())}"></label>
    <div><div class="lead-head"><span>Lead source</span><span>Service</span><span>Leads</span></div>
    <div id="leadRows">${entry ? row(entry) : row() + row()}</div>
    ${entry ? "" : `<button type="button" class="link" id="addRow">+ Add another row</button>`}</div>
    <p class="muted sm">Add one row per source + service combination for this day.</p>`,
  async (f, el) => {
    const rows = $$(".lead-row", el).map((r) => {
      const [src, svc, cnt] = $$("select,input", r);
      return { source: src.value, service: svc.value, count: parseInt(cnt.value, 10) || 0 };
    }).filter((r) => r.source && r.service);
    if (!rows.length) throw new Error("Add at least one row");
    const now = new Date().toISOString();
    if (entry) {
      const patch = { date: f.date, ...rows[0], updatedAt: now };
      await store.updateLead(entry.id, patch); Object.assign(entry, patch); toast("Lead entry updated");
    } else {
      const who = admin ? S.users.find((u) => u.uid === f.uid) : S.profile;
      for (const r of rows) {
        const l = { uid: who.uid, userName: who.name, branch: who.branch, team: who.team || "", date: f.date, ...r,
          createdBy: S.user.uid, createdAt: now, updatedAt: now };
        l.id = await store.addLead(l);
        S.leads.push(l);
      }
      toast(`${sum(rows)} leads saved`);
    }
    renderView();
  }, entry ? "Save" : "Save leads");
  const bindRm = () => $$(".rm", form).forEach((b) => (b.onclick = () => { if ($$(".lead-row", form).length > 1) b.parentElement.remove(); }));
  bindRm();
  if ($("#addRow", form)) $("#addRow", form).onclick = () => { $("#leadRows", form).insertAdjacentHTML("beforeend", row()); bindRm(); };
}
