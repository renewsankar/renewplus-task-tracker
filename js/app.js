import * as config from "./config.js";

const DEMO = String(config.firebaseConfig.apiKey || "").startsWith("PASTE");
const store = DEMO ? await import("./store-demo.js") : await import("./store-firebase.js");
store.init(config);

// ================================================================ helpers
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
const monthOf = (d) => d.slice(0, 7);
const monthStart = (m) => m + "-01";
const monthEnd = (m) => { const [y, mo] = m.split("-").map(Number); return iso(new Date(y, mo, 0)); };
const addMonths = (m, n) => { const [y, mo] = m.split("-").map(Number); return iso(new Date(y, mo - 1 + n, 1)).slice(0, 7); };
const monthsBetween = (a, b) => { const out = []; for (let m = a; m <= b && out.length < 36; m = addMonths(m, 1)) out.push(m); return out; };
const fmtMonth = (m) => new Date(m + "-01T00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const inr = (n) => (n == null || !isFinite(n) ? "—" : "₹" + Math.round(n).toLocaleString("en-IN"));
const inrShort = (v) => (Math.abs(v) >= 1e5 ? "₹" + (v / 1e5).toFixed(1) + "L" : Math.abs(v) >= 1e3 ? "₹" + Math.round(v / 1e3) + "k" : "₹" + v);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sum = (arr, k = "count") => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
const groupBy = (list, fn) => list.reduce((a, t) => ((a[fn(t)] ||= []).push(t), a), {});
const branchesOf = (u) => (u?.branches?.length ? u.branches : u?.branch ? [u.branch] : []);
const opts = (arr, sel, all) => (all ? `<option value="">${esc(all)}</option>` : "") + arr.map((v) => {
  const [val, label] = Array.isArray(v) ? v : [v, v];
  return `<option value="${esc(val)}" ${val === sel ? "selected" : ""}>${esc(label)}</option>`;
}).join("");

const EXTRA_DEFAULTS = {
  leadSources: ["Meta Ads (FB / Instagram)", "Google Ads", "Instagram Organic", "Facebook Organic", "Google Business Profile",
    "Website / SEO", "WhatsApp", "YouTube", "Referral", "Other"],
  leadServices: ["Hair Transplant", "Hair Fall / PRP / GFC", "Dandruff / Scalp", "Acne & Scars", "Pigmentation",
    "Laser Hair Removal", "Anti-ageing", "Skin – General", "Other"],
  paidSources: ["Meta Ads (FB / Instagram)", "Google Ads", "YouTube"],
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

// ================================================================ state
const S = {
  user: null, profile: null, settings: { ...config.DEFAULT_SETTINGS, ...EXTRA_DEFAULTS },
  users: [], tasks: [], leads: [], budgets: [],
  view: "", f: { period: "this-month", from: "", to: "", branch: "", uid: "", category: "", status: "", source: "", service: "" },
  month: today().slice(0, 7), dashUid: "", dashBranch: "", bm: null,
  charts: [], sorts: {}, showAllLeads: false,
};
const isAdmin = () => S.profile?.role === "admin";
const staffUsers = () => S.users.filter((u) => u.role !== "admin" && u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
const scopeBranches = () => (isAdmin() ? S.settings.branches : branchesOf(S.profile));
const paid = () => S.settings.paidSources || [];

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
const inPeriod = (d) => { const [a, b] = range(); return d >= a && d <= b; };
const periodMonths = () => { const [a, b] = range(); return monthsBetween(monthOf(a), monthOf(b)); };
const monthsLabel = (ms) => (ms.length <= 2 ? ms.map(fmtMonth).join(", ") : `${fmtMonth(ms[0])} – ${fmtMonth(ms.at(-1))}`);

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

// Task / lead selection with the current filters + an optional fixed scope
const match = (x, sc) => (!sc.uid || x.uid === sc.uid) && (!sc.branch || x.branch === sc.branch) && (!sc.branches || sc.branches.includes(x.branch));
function selTasks(sc = {}, withStatus = false) {
  return S.tasks.filter((t) => inPeriod(t.dueDate) && match(t, sc) && (!S.f.category || t.category === S.f.category)
    && (!withStatus || !S.f.status || (S.f.status === "Overdue" ? isOverdue(t) : t.status === S.f.status)));
}
function selLeads(sc = {}) {
  return S.leads.filter((l) => inPeriod(l.date) && match(l, sc)
    && (!S.f.source || l.source === S.f.source) && (!S.f.service || l.service === S.f.service));
}
const fscope = () => ({ uid: S.f.uid, branch: S.f.branch });

// Budget + CPL for a set of locations and months (budgets are per location, not per person)
function budgetSummary(months, branches) {
  const bs = S.budgets.filter((b) => months.includes(b.month) && branches.includes(b.branch));
  const ls = S.leads.filter((l) => months.includes(monthOf(l.date)) && branches.includes(l.branch));
  const required = sum(bs, "required"), spent = sum(bs, "spent");
  const paidLeads = sum(ls.filter((l) => paid().includes(l.source))), allLeads = sum(ls);
  return {
    required, spent, balance: required - spent, util: pct(spent, required), paidLeads, allLeads,
    cpl: paidLeads ? spent / paidLeads : null, blended: allLeads ? spent / allLeads : null,
    channels: paid().map((src) => {
      const b = bs.filter((x) => x.source === src), lc = sum(ls.filter((l) => l.source === src)), sp = sum(b, "spent");
      return { source: src, required: sum(b, "required"), spent: sp, leads: lc, cpl: lc ? sp / lc : null };
    }),
  };
}

async function loadAll() {
  const [from, to] = range();
  if (isAdmin()) {
    const trendFrom = addDays(weekStart(to), -49);
    const lf = monthStart(monthOf(from)), lt = monthEnd(monthOf(to));
    [S.tasks, S.leads, S.budgets] = await Promise.all([
      store.listTasks({ from: from < trendFrom ? from : trendFrom, to }),
      store.listLeads({ from: lf < trendFrom ? lf : trendFrom, to: lt > to ? lt : to }),
      store.listBudgets({ from: monthOf(from), to: monthOf(to) }),
    ]);
  } else {
    const br = branchesOf(S.profile);
    [S.tasks, S.leads, S.budgets] = await Promise.all([
      store.listTasks({ uid: S.user.uid }),
      store.listLeads({ uid: S.user.uid, branches: br }),
      br.length ? store.listBudgets({ branches: br }) : Promise.resolve([]),
    ]);
  }
  S.bm = null;
}

// ================================================================ auth flow
store.onAuth(async (u) => {
  S.user = u;
  if (!u) { S.profile = null; return renderLogin(); }
  renderLoading();
  try {
    let p = await store.getProfile(u.uid);
    if (!p) p = await store.ensureBootstrap(u);
    if (!p) return renderBlocked("Your login exists, but your profile hasn't been set up. Please ask the admin to add you on the People page.");
    if (p.active === false) return renderBlocked("Your account has been deactivated. Please contact the admin.");
    S.profile = p;
    S.settings = { ...EXTRA_DEFAULTS, ...(await store.getSettings()) };
    if (isAdmin()) S.users = await store.listUsers();
    S.view = isAdmin() ? "overview" : "person";
    await loadAll();
    renderShell();
  } catch (e) {
    console.error(e);
    renderBlocked("Could not load your data: " + errMsg(e));
  }
});

const logo = `<img src="assets/logo.png" alt="Renew+ Hair and Skin Care" class="logo">`;

function renderLoading() { $("#app").innerHTML = `<div class="center"><div class="spinner"></div></div>`; }
function renderLoading2() { $("#main").innerHTML = `<div class="center"><div class="spinner"></div></div>`; }
function renderBlocked(msg) {
  $("#app").innerHTML = `<div class="login-wrap"><div class="login card">${logo}<p class="muted">${esc(msg)}</p>
    <button class="btn" id="out">Sign out</button></div></div>`;
  $("#out").onclick = () => store.signOut();
}

function renderLogin() {
  destroyCharts();
  const demo = DEMO ? `<div class="demo-box"><b>Demo mode</b> — Firebase isn't connected yet, so this uses sample data in your browser only. Sign in as:
    <div class="demo-users">${store.demoUsers().map((u) => `<button type="button" class="chip" data-email="${esc(u.email)}">
      ${esc(u.name)}<small>${u.role === "admin" ? "Admin – all locations" : esc(u.branches.join(", "))}</small></button>`).join("")}</div></div>` : "";
  $("#app").innerHTML = `<div class="login-wrap"><form class="login card" id="lf">
    ${logo}<h1>Marketing Task Tracker</h1><p class="muted">Tasks, leads, budgets and cost per lead across all locations.</p>
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

// ================================================================ shell
const NAV_ADMIN = [["overview", "Overview"], ["person", "Individual"], ["location", "Locations"], ["tasks", "Tasks"],
  ["leads", "Leads"], ["budget", "Budget & CPL"], ["people", "People"], ["settings", "Settings"]];
const NAV_STAFF = [["person", "My Dashboard"], ["location", "My Locations"], ["tasks", "My Tasks"], ["leads", "My Leads"], ["budget", "Budget & CPL"]];

function renderShell() {
  const nav = isAdmin() ? NAV_ADMIN : NAV_STAFF;
  const sub = isAdmin() ? "Admin · All locations" : branchesOf(S.profile).join(" · ") || "No location assigned";
  $("#app").innerHTML = `
    ${DEMO ? `<div class="demo-bar">Demo mode — sample data only. <button class="link" id="resetDemo">Reset sample data</button></div>` : ""}
    <header class="top">
      <div class="brand">${logo}<div><b>Marketing Task Tracker</b><span>${esc(sub)}</span></div></div>
      <nav>${nav.map(([k, l]) => `<button data-v="${k}" class="${S.view === k ? "on" : ""}">${l}</button>`).join("")}</nav>
      <div class="me"><span>${esc(S.profile.name)}</span><button class="btn sm" id="out">Sign out</button></div>
    </header>
    <main id="main"></main>`;
  $$("header nav button").forEach((b) => (b.onclick = () => { S.view = b.dataset.v; S.showAllLeads = false; renderShell(); }));
  $("#out").onclick = () => store.signOut();
  if ($("#resetDemo")) $("#resetDemo").onclick = () => { store.resetDemo(); store.signOut(); };
  renderView();
}

async function renderView() {
  destroyCharts();
  const views = { overview: viewOverview, person: viewPerson, location: viewLocation, tasks: viewTasks,
    leads: viewLeads, budget: viewBudget, people: viewPeople, settings: viewSettings };
  try { await (views[S.view] || viewPerson)(); }
  catch (e) { console.error(e); $("#main").innerHTML = `<p class="empty">Something went wrong: ${esc(errMsg(e))}</p>`; }
}
function destroyCharts() { S.charts.forEach((c) => c.destroy()); S.charts = []; }

// ================================================================ filters
function filterBar({ people = isAdmin(), status = false, leads = false, category = true, locs = null, peopleList = null, period = true } = {}) {
  const [from, to] = range();
  locs = locs || scopeBranches();
  if (S.f.branch && !locs.includes(S.f.branch)) S.f.branch = "";
  const plist = (peopleList || staffUsers().filter((u) => !S.f.branch || branchesOf(u).includes(S.f.branch))).map((u) => [u.uid, u.name]);
  if (S.f.uid && !plist.some(([id]) => id === S.f.uid)) S.f.uid = "";
  return `<div class="filters card no-print">
    ${period ? `<label>Period<select data-f="period">${opts(PERIODS, S.f.period)}</select></label>
    ${S.f.period === "custom" ? `<label>From<input type="date" data-f="from" value="${from}"></label><label>To<input type="date" data-f="to" value="${to}"></label>` : ""}` : ""}
    ${locs.length > 1 ? `<label>Location<select data-f="branch">${opts(locs, S.f.branch, "All locations")}</select></label>` : ""}
    ${people ? `<label>Responsible person<select data-f="uid">${opts(plist, S.f.uid, "All persons")}</select></label>` : ""}
    ${leads ? `<label>Lead source<select data-f="source">${opts(S.settings.leadSources, S.f.source, "All sources")}</select></label>
    <label>Service<select data-f="service">${opts(S.settings.leadServices, S.f.service, "All services")}</select></label>` : ""}
    ${category ? `<label>Task category<select data-f="category">${opts(S.settings.categories, S.f.category, "All categories")}</select></label>` : ""}
    ${status ? `<label>Status<select data-f="status">${opts([...STATUSES, "Overdue"], S.f.status, "All statuses")}</select></label>` : ""}
    ${period ? `<span class="range">${fmt(from)} – ${fmt(to)}</span>` : ""}
  </div>`;
}
function bindFilters() {
  $$("[data-f]").forEach((el) => (el.onchange = async () => {
    const k = el.dataset.f;
    if (k === "period" && el.value === "custom") { const [a, b] = range(); S.f.from = a; S.f.to = b; }
    S.f[k] = el.value;
    if (k === "branch" && isAdmin() && S.f.uid && !branchesOf(S.users.find((u) => u.uid === S.f.uid)).includes(el.value)) S.f.uid = "";
    if (isAdmin() && ["period", "from", "to"].includes(k)) { renderLoading2(); await loadAll(); }
    renderView();
  }));
}

// ================================================================ KPI tiles, charts, tables
const kpi = (label, val, sub = "", cls = "") => `<div class="kpi ${cls}"><span>${label}</span><b>${val}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
function taskKpis(m) {
  return `<div class="kpis">
    ${kpi("Tasks committed", m.total)}
    ${kpi("Completed", m.done, `${m.rate}% completion`, "good")}
    ${kpi("On-time delivery", m.ontimeRate + "%", `${m.ontime} of ${m.done} done on time`)}
    ${kpi("In progress", m.prog + m.committed, `${m.committed} not started`)}
    ${kpi("Overdue", m.overdue, "", m.overdue ? "bad" : "")}
    ${kpi("Blocked", m.blocked, "", m.blocked ? "warn" : "")}
  </div>`;
}
function moneyKpis(b, leadsInPeriod) {
  return `<div class="kpis">
    ${kpi("Leads", leadsInPeriod.toLocaleString("en-IN"), "in selected period", "good")}
    ${kpi("Required budget", inr(b.required))}
    ${kpi("Spent", inr(b.spent), `${b.util}% of budget used`, b.required && b.spent > b.required ? "bad" : "")}
    ${kpi("Balance", inr(b.balance), b.balance < 0 ? "over budget" : "left to spend", b.balance < 0 ? "bad" : "")}
    ${kpi("CPL (paid)", inr(b.cpl), `${b.paidLeads.toLocaleString("en-IN")} leads from paid sources`)}
    ${kpi("Blended CPL", inr(b.blended), `${b.allLeads.toLocaleString("en-IN")} leads, all sources`)}
  </div>`;
}
const section = (t, sub = "") => `<h3 class="section-label">${t}${sub ? ` <span>${esc(sub)}</span>` : ""}</h3>`;

const C = { done: "#21B573", pending: "#0F72BA", overdue: "#D64545", committed: "#9DC3E6", amber: "#E0A526", grid: "rgba(120,130,150,.18)", text: "#5b6b7d" };
const PALETTE = ["#0F72BA", "#21B573", "#E0A526", "#8E5CC4", "#D64545", "#09A79C", "#E07A26", "#5B6B7D", "#C2408E", "#7FA83A", "#3A8FD9", "#9C7B4A"];
function chart(id, cfg) {
  if (!window.Chart || !$("#" + id)) return;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = C.text;
  S.charts.push(new Chart($("#" + id), cfg));
}
const baseOpts = (horizontal, stacked, money = false) => {
  const val = { stacked, grid: { color: C.grid }, ticks: { precision: 0, ...(money ? { callback: (v) => inrShort(v) } : {}) }, beginAtZero: true };
  const cat = { stacked, grid: { color: "transparent" } };
  return {
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x",
    plugins: { legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } },
      tooltip: money ? { callbacks: { label: (c) => `${c.dataset.label}: ${inr(c.raw)}` } } : {} },
    scales: horizontal ? { x: val, y: cat } : { x: cat, y: val },
  };
};
const chartBox = (id, title, h = 260, cls = "") => `<section class="card ${cls}"><h3>${title}</h3><div class="chart" style="height:${h}px"><canvas id="${id}"></canvas></div></section>`;
const hFor = (n, per = 34, min = 220) => Math.max(min, n * per + 70);

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
function hbar(id, rows, color, money = false, label = "Leads") {
  chart(id, { type: "bar", data: { labels: rows.map((r) => r[0]),
    datasets: [{ label, data: rows.map((r) => r[1]), backgroundColor: color, borderRadius: 3 }] },
    options: { ...baseOpts(true, false, money), plugins: { legend: { display: false },
      tooltip: money ? { callbacks: { label: (c) => `${label}: ${inr(c.raw)}` } } : {} } } });
}
function budgetChart(id, labels, req, spent, horizontal = true) {
  chart(id, { type: "bar", data: { labels, datasets: [
    { label: "Required", data: req, backgroundColor: C.committed, borderRadius: 3 },
    { label: "Spent", data: spent, backgroundColor: C.pending, borderRadius: 3 },
  ] }, options: baseOpts(horizontal, false, true) });
}
function totalsBy(list, key) {
  const g = groupBy(list, (l) => l[key] || "—");
  return Object.entries(g).map(([k, v]) => [k, sum(v)]).sort((a, b) => b[1] - a[1]);
}

const meter = (rate, total) => `<div class="meter"><i style="width:${Math.min(100, rate)}%;background:${rate >= 80 ? C.done : rate >= 50 ? C.amber : C.overdue}"></i></div><span>${total ? rate + "%" : "—"}</span>`;

// Generic sortable table. cols: {k, label, num?, html?(row), cls?(row)}
function sortTable(id, rows, cols, { rowAttr = () => "", foot = null, defKey = null } = {}) {
  if (!rows.length) return `<p class="empty">Nothing to show for these filters.</p>`;
  const st = S.sorts[id] || { key: defKey || cols[0].k, dir: defKey ? -1 : 1 };
  rows = [...rows].sort((a, b) => {
    const x = a[st.key], y = b[st.key];
    const r = typeof x === "string" || typeof y === "string" ? String(x ?? "").localeCompare(String(y ?? "")) : (x ?? -1) - (y ?? -1);
    return r * st.dir;
  });
  const th = (c) => `<th data-sort="${c.k}" class="${c.num ? "num" : ""} ${st.key === c.k ? "sorted" : ""}">${c.label}${st.key === c.k ? (st.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
  const td = (c, r) => `<td class="${c.num ? "num" : ""} ${c.cls ? c.cls(r) : ""}">${c.html ? c.html(r) : esc(r[c.k])}</td>`;
  return `<div class="table-wrap"><table class="tbl" data-table="${id}"><thead><tr>${cols.map(th).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr ${rowAttr(r)}>${cols.map((c) => td(c, r)).join("")}</tr>`).join("")}</tbody>
    ${foot ? `<tfoot><tr class="total">${cols.map((c) => td(c, foot)).join("")}</tr></tfoot>` : ""}</table></div>`;
}
function bindSort() {
  $$("table[data-table] th[data-sort]").forEach((th) => (th.onclick = () => {
    const id = th.closest("table").dataset.table, k = th.dataset.sort, cur = S.sorts[id];
    S.sorts[id] = { key: k, dir: cur?.key === k ? -cur.dir : th.classList.contains("num") ? -1 : 1 };
    renderView();
  }));
}

// Location performance rows (tasks + leads in period, budget/CPL for the period's months)
function locationRows(branches, uid = "") {
  const months = periodMonths();
  return branches.map((b) => {
    const ts = selTasks({ branch: b, uid });
    const ls = selLeads({ branch: b, uid });
    const bs = budgetSummary(months, [b]);
    return {
      key: b, name: b, owners: staffUsers().filter((u) => branchesOf(u).includes(b)).map((u) => u.name).join(", ") || "—",
      ...metrics(ts), leads: sum(ls), required: bs.required, spent: bs.spent, balance: bs.balance, cpl: bs.cpl,
    };
  });
}
function locationCols(withOwners) {
  return [
    { k: "name", label: "Location", html: (r) => `<b>${esc(r.name)}</b>` },
    ...(withOwners ? [{ k: "owners", label: "Responsible persons" }] : []),
    { k: "total", label: "Committed", num: true }, { k: "done", label: "Completed", num: true },
    { k: "overdue", label: "Overdue", num: true, cls: (r) => (r.overdue ? "red" : "") },
    { k: "rate", label: "Completion", num: true, cls: () => "rate", html: (r) => meter(r.rate, r.total) },
    { k: "leads", label: "Leads", num: true },
    { k: "required", label: "Budget", num: true, html: (r) => inr(r.required) },
    { k: "spent", label: "Spent", num: true, html: (r) => inr(r.spent) },
    { k: "balance", label: "Balance", num: true, html: (r) => inr(r.balance), cls: (r) => (r.balance < 0 ? "red" : "") },
    { k: "cpl", label: "CPL", num: true, html: (r) => inr(r.cpl) },
  ];
}
function personRows(users, branch = "") {
  return users.map((u) => {
    const ts = selTasks({ uid: u.uid, branch });
    const ls = selLeads({ uid: u.uid, branch });
    return { key: u.uid, name: u.name, locs: branchesOf(u).join(", "), ...metrics(ts), leads: sum(ls), days: new Set(ls.map((l) => l.date)).size };
  });
}
const personCols = (withLocs = true) => [
  { k: "name", label: "Responsible person", html: (r) => `<b>${esc(r.name)}</b>` },
  ...(withLocs ? [{ k: "locs", label: "Locations" }] : []),
  { k: "total", label: "Committed", num: true }, { k: "done", label: "Completed", num: true },
  { k: "overdue", label: "Overdue", num: true, cls: (r) => (r.overdue ? "red" : "") },
  { k: "rate", label: "Completion", num: true, cls: () => "rate", html: (r) => meter(r.rate, r.total) },
  { k: "ontimeRate", label: "On-time", num: true, html: (r) => (r.done ? r.ontimeRate + "%" : "—") },
  { k: "leads", label: "Leads", num: true }, { k: "days", label: "Days leads reported", num: true, cls: (r) => (r.days ? "" : "red") },
];
const printHead = (title, sub) => `<div class="print-only print-head">${logo}<div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div></div>`;

// ================================================================ OVERVIEW (admin)
function viewOverview() {
  const list = selTasks(fscope());
  const m = metrics(list);
  const months = periodMonths();
  const locs = S.f.branch ? [S.f.branch] : S.f.uid ? branchesOf(S.users.find((u) => u.uid === S.f.uid)) : S.settings.branches;
  const b = budgetSummary(months, locs);
  const leadsNow = sum(selLeads(fscope()));
  const [from, to] = range();
  const persons = staffUsers().filter((u) => (!S.f.branch || branchesOf(u).includes(S.f.branch)) && (!S.f.uid || u.uid === S.f.uid));
  $("#main").innerHTML = `
    <div class="page-head"><h2>Overview</h2>
      <div class="actions no-print"><button class="btn" id="csv">Export tasks CSV</button><button class="btn" onclick="print()">Print / PDF</button></div></div>
    ${printHead("Marketing Overview", `${fmt(from)} – ${fmt(to)} · ${S.f.branch || "All locations"}`)}
    ${filterBar()}
    ${section("Tasks")}${taskKpis(m)}
    ${section("Leads, budget & CPL", monthsLabel(months))}${moneyKpis(b, leadsNow)}
    <div class="grid2">
      ${chartBox("cBranch", "Location-wise task completion", hFor(Object.keys(groupBy(list, (t) => t.branch)).length, 38))}
      ${chartBox("cTrend", "Weekly trend · committed vs completed")}
      ${chartBox("cPerson", "Responsible person-wise completion", hFor(Object.keys(groupBy(list, (t) => t.userName)).length, 32))}
      ${chartBox("cBudget", "Budget vs spent by location", hFor(locs.length, 40))}
    </div>
    <section class="card"><h3>Location-wise report</h3>${sortTable("ovLoc", locationRows(locs, S.f.uid), locationCols(true), { rowAttr: (r) => `class="click" data-goloc="${esc(r.key)}"`, defKey: "rate" })}</section>
    <section class="card"><h3>Responsible person-wise report</h3>${sortTable("ovPerson", personRows(persons, S.f.branch), personCols(), { rowAttr: (r) => `class="click" data-goperson="${esc(r.key)}"`, defKey: "rate" })}</section>`;
  bindFilters(); bindSort(); bindDrill();
  $("#csv").onclick = () => exportCSV(list);
  stackChart("cBranch", groupBy(list, (t) => t.branch));
  stackChart("cPerson", groupBy(list, (t) => t.userName || "?"));
  trendChart("cTrend", S.tasks.filter((t) => match(t, fscope()) && (!S.f.category || t.category === S.f.category)));
  const lb = locs.map((l) => budgetSummary(months, [l]));
  budgetChart("cBudget", locs, lb.map((x) => x.required), lb.map((x) => x.spent));
}
function bindDrill() {
  $$("[data-goloc]").forEach((r) => (r.onclick = () => { S.dashBranch = r.dataset.goloc; S.view = "location"; renderShell(); }));
  $$("[data-goperson]").forEach((r) => (r.onclick = () => { S.dashUid = r.dataset.goperson; S.view = "person"; renderShell(); }));
}

// ================================================================ INDIVIDUAL dashboard
function viewPerson() {
  const admin = isAdmin();
  const people = staffUsers();
  if (admin && (!S.dashUid || !people.some((u) => u.uid === S.dashUid))) S.dashUid = people[0]?.uid || "";
  const uid = admin ? S.dashUid : S.user.uid;
  const person = admin ? people.find((u) => u.uid === uid) : S.profile;
  if (!person) { $("#main").innerHTML = `<div class="page-head"><h2>Individual dashboard</h2></div><p class="empty">No responsible persons yet. Add them on the People page.</p>`; return; }
  const locs = branchesOf(person);
  const sc = { uid, branch: S.f.branch };
  const tasks = selTasks(sc);
  const leads = selLeads(sc);
  const months = periodMonths();
  const b = budgetSummary(months, S.f.branch ? [S.f.branch] : locs);
  const [from, to] = range();
  const t = today();
  const mine = S.tasks.filter((x) => x.uid === uid && (!S.f.branch || x.branch === S.f.branch));
  const late = mine.filter(isOverdue).sort((a, c) => a.dueDate.localeCompare(c.dueDate));
  const soon = mine.filter((x) => x.status !== "Completed" && x.dueDate >= t && x.dueDate <= addDays(t, 7)).sort((a, c) => a.dueDate.localeCompare(c.dueDate));
  const mini = (arr, empty) => arr.length ? `<ul class="mini">${arr.slice(0, 12).map((x) => `<li><button class="link" data-upd="${x.id}">${esc(x.title)}</button><span>${esc(x.branch)} · ${fmt(x.dueDate)}</span></li>`).join("")}</ul>` : `<p class="muted sm">${empty}</p>`;
  $("#main").innerHTML = `
    <div class="page-head"><div class="head-left"><h2>${admin ? "Individual dashboard" : `Hello, ${esc(person.name.split(" ")[0])}`}</h2>
      ${admin ? `<select id="pickPerson" class="picker no-print">${opts(people.map((u) => [u.uid, u.name]), uid)}</select>` : ""}</div>
      <div class="actions no-print">${admin ? "" : `<button class="btn primary" id="commit">+ Commit a task</button><button class="btn" id="addLead">+ Add leads</button>`}
      <button class="btn" onclick="print()">Print / PDF</button></div></div>
    ${printHead(`Individual report — ${person.name}`, `${fmt(from)} – ${fmt(to)} · ${locs.join(", ")}`)}
    <div class="chips">${locs.length ? locs.map((l) => `<span class="loc-chip">${esc(l)}</span>`).join("") : `<span class="muted">No locations assigned</span>`}</div>
    ${filterBar({ people: false, locs })}
    ${section("Tasks")}${taskKpis(metrics(tasks))}
    ${section("Leads, budget & CPL", `${monthsLabel(months)} · budget is for ${S.f.branch ? "this location" : "all their locations"}`)}${moneyKpis(b, sum(leads))}
    <div class="grid2">
      ${chartBox("pTrend", "Weekly trend · committed vs completed")}
      ${chartBox("pSource", "Leads by source", hFor(totalsBy(leads, "source").length, 30))}
      ${chartBox("pLocTasks", "Location-wise task completion", hFor(locs.length, 40))}
      ${chartBox("pBudget", "Budget vs spent by location", hFor(locs.length, 40))}
    </div>
    <section class="card"><h3>Location-wise performance</h3>${sortTable("pLoc", locationRows(S.f.branch ? [S.f.branch] : locs, uid), locationCols(false), { rowAttr: (r) => `class="click" data-goloc="${esc(r.key)}"` })}</section>
    <div class="grid2 no-print">
      <section class="card"><h3 class="red">Overdue (${late.length})</h3>${mini(late, "Nothing overdue.")}</section>
      <section class="card"><h3>Due in the next 7 days (${soon.length})</h3>${mini(soon, "No upcoming due dates.")}</section>
    </div>
    <section class="card print-only"><h3>Tasks in this period</h3>${taskTable(tasks, { admin: false })}</section>`;
  bindFilters(); bindSort(); bindDrill();
  if ($("#pickPerson")) $("#pickPerson").onchange = (e) => { S.dashUid = e.target.value; S.f.branch = ""; renderView(); };
  if ($("#commit")) $("#commit").onclick = () => taskModal(null);
  if ($("#addLead")) $("#addLead").onclick = () => leadModal(null);
  $$("[data-upd]").forEach((x) => (x.onclick = () => (admin ? taskModal : updateModal)(S.tasks.find((k) => k.id === x.dataset.upd))));
  trendChart("pTrend", mine.filter((x) => !S.f.category || x.category === S.f.category));
  hbar("pSource", totalsBy(leads, "source"), C.pending);
  const shownLocs = S.f.branch ? [S.f.branch] : locs;
  const g = {}; shownLocs.forEach((l) => (g[l] = tasks.filter((x) => x.branch === l)));
  stackChart("pLocTasks", g);
  const lb = shownLocs.map((l) => budgetSummary(months, [l]));
  budgetChart("pBudget", shownLocs, lb.map((x) => x.required), lb.map((x) => x.spent));
}

// ================================================================ LOCATION dashboard
function viewLocation() {
  const admin = isAdmin();
  const locs = scopeBranches();
  if (!locs.length) { $("#main").innerHTML = `<div class="page-head"><h2>Location dashboard</h2></div><p class="empty">No locations ${admin ? "set up yet. Add them in Settings." : "assigned to you yet. Ask the admin."}</p>`; return; }
  if (!S.dashBranch || !locs.includes(S.dashBranch)) S.dashBranch = locs[0];
  const loc = S.dashBranch;
  const owners = admin ? staffUsers().filter((u) => branchesOf(u).includes(loc)) : [S.profile];
  const uidF = admin ? S.f.uid : S.user.uid;
  const tasks = selTasks({ branch: loc, uid: uidF });
  const leads = selLeads({ branch: loc, uid: admin ? S.f.uid : "" });
  const months = periodMonths();
  const b = budgetSummary(months, [loc]);
  const [from, to] = range();
  const ch = b.channels;
  const chFoot = { source: "Total", required: b.required, spent: b.spent, balance: b.balance, util: b.util, leads: b.paidLeads, cpl: b.cpl };
  $("#main").innerHTML = `
    <div class="page-head"><div class="head-left"><h2>Location dashboard</h2>
      <select id="pickLoc" class="picker no-print">${opts(locs, loc)}</select></div>
      <div class="actions no-print"><button class="btn" onclick="print()">Print / PDF</button></div></div>
    ${printHead(`Location report — ${loc}`, `${fmt(from)} – ${fmt(to)}`)}
    <div class="chips"><span class="muted sm">Responsible ${owners.length === 1 ? "person" : "persons"}:</span>
      ${owners.length ? owners.map((u) => `<span class="loc-chip person">${esc(u.name)}</span>`).join("") : `<span class="muted sm">none assigned</span>`}</div>
    ${filterBar({ locs: [loc], people: admin, peopleList: owners })}
    ${section("Tasks")}${taskKpis(metrics(tasks))}
    ${section("Leads, budget & CPL", monthsLabel(months))}${moneyKpis(b, sum(leads))}
    <div class="grid2">
      ${chartBox("lTrend", "Weekly trend · committed vs completed")}
      ${chartBox("lSource", "Leads by source", hFor(totalsBy(leads, "source").length, 30))}
      ${chartBox("lBudget", "Budget vs spent by channel", hFor(ch.length, 44))}
      ${chartBox("lCpl", "Cost per lead by channel", hFor(ch.length, 44))}
    </div>
    <section class="card"><h3>Budget & CPL by channel <small class="muted">${esc(monthsLabel(months))}</small></h3>${sortTable("lCh",
      ch.map((c) => ({ ...c, balance: c.required - c.spent, util: pct(c.spent, c.required) })), [
        { k: "source", label: "Paid channel", html: (r) => `<b>${esc(r.source)}</b>` },
        { k: "required", label: "Required", num: true, html: (r) => inr(r.required) },
        { k: "spent", label: "Spent", num: true, html: (r) => inr(r.spent) },
        { k: "balance", label: "Balance", num: true, html: (r) => inr(r.balance), cls: (r) => (r.balance < 0 ? "red" : "") },
        { k: "util", label: "Used", num: true, html: (r) => (r.required ? r.util + "%" : "—") },
        { k: "leads", label: "Leads", num: true }, { k: "cpl", label: "CPL", num: true, html: (r) => inr(r.cpl) },
      ], { foot: chFoot })}</section>
    ${admin ? `<section class="card"><h3>Responsible person-wise at ${esc(loc)}</h3>${sortTable("lPerson", personRows(owners, loc), personCols(false), { rowAttr: (r) => `class="click" data-goperson="${esc(r.key)}"`, defKey: "rate" })}</section>` : ""}
    <section class="card"><h3>Tasks at ${esc(loc)} <small class="muted">${tasks.length}</small></h3>${taskTable(tasks, { admin })}</section>`;
  bindFilters(); bindSort(); bindDrill(); bindTaskButtons();
  $("#pickLoc").onchange = (e) => { S.dashBranch = e.target.value; S.f.uid = ""; renderView(); };
  trendChart("lTrend", S.tasks.filter((x) => x.branch === loc && (!uidF || x.uid === uidF) && (!S.f.category || x.category === S.f.category)));
  hbar("lSource", totalsBy(leads, "source"), C.pending);
  budgetChart("lBudget", ch.map((c) => c.source), ch.map((c) => c.required), ch.map((c) => c.spent));
  hbar("lCpl", ch.map((c) => [c.source, c.cpl ? Math.round(c.cpl) : 0]), C.amber, true, "CPL");
}

// ================================================================ TASKS
function viewTasks() {
  const admin = isAdmin();
  const sc = admin ? fscope() : { uid: S.user.uid, branch: S.f.branch };
  const list = selTasks(sc, true);
  $("#main").innerHTML = `<div class="page-head"><h2>${admin ? "All Tasks" : "My Tasks"} <small class="muted">${list.length}</small></h2>
    <div class="actions no-print"><button class="btn primary" id="newTask">${admin ? "+ Assign task" : "+ Commit a task"}</button>
    <button class="btn" id="csv">Export CSV</button><button class="btn" onclick="print()">Print / PDF</button></div></div>
    ${filterBar({ status: true })}
    <section class="card">${taskTable(list, { admin })}</section>`;
  bindFilters(); bindTaskButtons();
  $("#newTask").onclick = () => taskModal(null);
  $("#csv").onclick = () => exportCSV(list);
}
function exportCSV(list) {
  const cols = ["userName", "branch", "category", "title", "description", "priority", "target", "achieved", "commitDate", "dueDate", "status", "progress", "completedOn", "proofLink", "remarks", "adminComment"];
  const head = ["Responsible person", "Location", "Category", "Task", "Description", "Priority", "Target", "Achieved", "Committed on", "Due", "Status", "Progress %", "Completed on", "Proof link", "Remarks", "Admin comment", "Overdue"];
  download(`renewplus-tasks_${range().join("_to_")}.csv`, [head, ...list.map((t) => [...cols.map((c) => t[c]), isOverdue(t) ? "Yes" : ""])]);
}
function download(name, rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  a.download = name;
  a.click();
}
function badge(t) {
  return `<span class="badge ${statusKey(t.status)}">${esc(t.status)}</span>${isOverdue(t) ? ` <span class="badge overdue">Overdue</span>` : ""}`;
}
function taskTable(list, { admin }) {
  if (!list.length) return `<p class="empty">No tasks match these filters.</p>`;
  list = [...list].sort((a, b) => (a.status === "Completed") - (b.status === "Completed") || a.dueDate.localeCompare(b.dueDate));
  return `<div class="table-wrap"><table class="tbl tasks"><thead><tr>
    <th>Task</th>${admin ? "<th>Responsible person</th>" : ""}<th>Location</th><th>Category</th><th>Due</th><th>Status</th><th>Progress</th><th>Proof / remarks</th><th class="no-print"></th>
    </tr></thead><tbody>${list.map((t) => `<tr>
      <td><b>${esc(t.title)}</b><small class="pri ${statusKey(t.priority || "")}">${esc(t.priority || "")}</small>
        ${t.description ? `<div class="muted sm">${esc(t.description)}</div>` : ""}
        ${t.adminComment ? `<div class="admin-note">Admin: ${esc(t.adminComment)}</div>` : ""}</td>
      ${admin ? `<td>${esc(t.userName)}</td>` : ""}<td>${esc(t.branch)}</td>
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

// ================================================================ LEADS
function viewLeads() {
  const admin = isAdmin();
  const sc = admin ? fscope() : { uid: S.user.uid, branch: S.f.branch };
  const list = selLeads(sc);
  const total = sum(list);
  const [from, to] = range();
  const days = Math.round((new Date(to) - new Date(from)) / 864e5) + 1;
  const elapsed = Math.max(1, Math.min(days, Math.round((new Date(today()) - new Date(from)) / 864e5) + 1));
  const bySource = totalsBy(list, "source"), byService = totalsBy(list, "service");
  const locs = S.f.branch ? [S.f.branch] : scopeBranches();
  $("#main").innerHTML = `
    <div class="page-head"><h2>${admin ? "Leads Report" : "My Leads"}</h2>
      <div class="actions no-print"><button class="btn primary" id="addLead">+ Add leads</button>
      <button class="btn" id="csv">Export CSV</button><button class="btn" onclick="print()">Print / PDF</button></div></div>
    ${printHead(`Leads Report${admin ? "" : " — " + S.profile.name}`, `${fmt(from)} – ${fmt(to)}${S.f.branch ? " · " + S.f.branch : ""}`)}
    ${filterBar({ leads: true, category: false })}
    <div class="kpis">
      ${kpi("Total leads", total.toLocaleString("en-IN"), "", "good")}
      ${kpi("Average per day", (total / (to < today() ? days : elapsed)).toFixed(1))}
      ${kpi("Paid leads", sum(list.filter((l) => paid().includes(l.source))).toLocaleString("en-IN"), "from paid sources")}
      ${kpi("Top source", bySource[0] ? bySource[0][1] : 0, bySource[0]?.[0] || "—")}
      ${kpi("Top service", byService[0] ? byService[0][1] : 0, byService[0]?.[0] || "—")}
      ${kpi(admin ? "People reporting" : "Days reported", admin ? new Set(list.map((l) => l.uid)).size : new Set(list.map((l) => l.date)).size)}
    </div>
    <div class="grid2">
      ${chartBox("lSource", "Leads by source", hFor(bySource.length, 30))}
      ${chartBox("lService", "Leads by service", hFor(byService.length, 30))}
      ${chartBox("lTrendD", "Leads over time", 260, locs.length > 1 ? "" : "span2")}
      ${locs.length > 1 ? chartBox("lBranch", "Location-wise leads by source", hFor(locs.length, 38, 240)) : ""}
    </div>
    ${locs.length > 1 ? `<section class="card"><h3>Location-wise leads (by source)</h3>${matrixTable(list)}</section>` : ""}
    ${admin ? `<section class="card"><h3>Responsible person-wise leads</h3>${personLeadsTable(list)}</section>` : ""}
    <section class="card"><h3>${admin ? "All entries" : "My entries"} <small class="muted">${list.length}</small></h3>${leadEntries(list, admin)}</section>`;
  bindFilters(); bindSort();
  $("#addLead").onclick = () => leadModal(null);
  $("#csv").onclick = () => download(`renewplus-leads_${from}_to_${to}.csv`, [["Date", "Responsible person", "Location", "Lead source", "Service", "Leads"],
    ...[...list].sort((a, b) => a.date.localeCompare(b.date)).map((l) => [l.date, l.userName, l.branch, l.source, l.service, l.count])]);
  if ($("#moreLeads")) $("#moreLeads").onclick = () => { S.showAllLeads = true; renderView(); };
  $$("[data-ledit]").forEach((b) => (b.onclick = () => leadModal(S.leads.find((l) => l.id === b.dataset.ledit))));
  $$("[data-ldel]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this lead entry?")) return;
    try { await store.deleteLead(b.dataset.ldel); S.leads = S.leads.filter((l) => l.id !== b.dataset.ldel); renderView(); toast("Deleted"); }
    catch (e) { toast(errMsg(e), true); }
  }));
  $$("[data-lbranch]").forEach((r) => (r.onclick = () => { S.f.branch = r.dataset.lbranch; S.f.uid = ""; renderView(); }));
  $$("[data-lperson]").forEach((r) => (r.onclick = () => { S.f.uid = r.dataset.lperson; renderView(); }));
  hbar("lSource", bySource, C.pending);
  hbar("lService", byService, C.done);
  const daily = days <= 62;
  const buckets = [];
  for (let d = daily ? from : weekStart(from); d <= to; d = addDays(d, daily ? 1 : 7)) buckets.push(d);
  chart("lTrendD", { type: "bar", data: { labels: buckets.map(fmtShort), datasets: [{ label: daily ? "Leads per day" : "Leads per week",
    data: buckets.map((b) => sum(list.filter((l) => l.date >= b && l.date <= (daily ? b : addDays(b, 6))))), backgroundColor: C.pending, borderRadius: 3 }] },
    options: { ...baseOpts(false, false), plugins: { legend: { display: false } } } });
  if (locs.length > 1) {
    const branches = totalsBy(list, "branch").map((r) => r[0]);
    chart("lBranch", { type: "bar", data: { labels: branches, datasets: bySource.map(([src], i) => ({
      label: src, backgroundColor: PALETTE[i % PALETTE.length], borderRadius: 2,
      data: branches.map((b) => sum(list.filter((l) => l.branch === b && l.source === src))) })) }, options: baseOpts(true, true) });
  }
}
function matrixTable(list) {
  if (!list.length) return `<p class="empty">No leads in this period.</p>`;
  const cols = totalsBy(list, "source").map((r) => r[0]);
  const rows = totalsBy(list, "branch");
  return `<div class="table-wrap"><table class="tbl matrix"><thead><tr><th>Location</th>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}<th>Total</th></tr></thead><tbody>
    ${rows.map(([r, t]) => `<tr class="click" data-lbranch="${esc(r)}"><td><b>${esc(r)}</b></td>${cols.map((c) => {
      const v = sum(list.filter((l) => l.branch === r && l.source === c)); return `<td>${v || "·"}</td>`; }).join("")}<td><b>${t}</b></td></tr>`).join("")}
    <tr class="total"><td><b>Total</b></td>${cols.map((c) => `<td><b>${sum(list.filter((l) => l.source === c))}</b></td>`).join("")}<td><b>${sum(list)}</b></td></tr>
    </tbody></table></div>`;
}
function personLeadsTable(list) {
  const g = groupBy(list, (l) => l.uid);
  staffUsers().filter((u) => (!S.f.branch || branchesOf(u).includes(S.f.branch)) && (!S.f.uid || u.uid === S.f.uid)).forEach((u) => (g[u.uid] ||= []));
  const rows = Object.entries(g).map(([uid, ls]) => {
    const u = S.users.find((x) => x.uid === uid) || {};
    const src = totalsBy(ls, "source")[0], svc = totalsBy(ls, "service")[0];
    return { key: uid, name: u.name || ls[0]?.userName || "?", locs: branchesOf(u).join(", "), total: sum(ls),
      days: new Set(ls.map((l) => l.date)).size, src: src ? `${src[0]} (${src[1]})` : "—", svc: svc ? `${svc[0]} (${svc[1]})` : "—" };
  });
  return sortTable("leadPerson", rows, [
    { k: "name", label: "Responsible person", html: (r) => `<b>${esc(r.name)}</b>` }, { k: "locs", label: "Locations" },
    { k: "total", label: "Total leads", num: true, html: (r) => `<b>${r.total}</b>` },
    { k: "days", label: "Days reported", num: true, cls: (r) => (r.days ? "" : "red") },
    { k: "src", label: "Top source" }, { k: "svc", label: "Top service" },
  ], { rowAttr: (r) => `class="click" data-lperson="${esc(r.key)}"`, defKey: "total" });
}
function leadEntries(list, admin) {
  if (!list.length) return `<p class="empty">No lead entries yet. Click “+ Add leads”.</p>`;
  const rows = [...list].sort((a, b) => b.date.localeCompare(a.date) || (a.userName || "").localeCompare(b.userName || ""));
  const max = S.showAllLeads ? 1000 : 25;
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th>${admin ? "<th>Responsible person</th>" : ""}<th>Location</th><th>Lead source</th><th>Service</th><th class="num">Leads</th><th class="no-print"></th></tr></thead><tbody>
    ${rows.slice(0, max).map((l) => `<tr><td class="nowrap">${fmt(l.date)}</td>${admin ? `<td>${esc(l.userName)}</td>` : ""}<td>${esc(l.branch)}</td>
      <td>${esc(l.source)}</td><td>${esc(l.service)}</td><td class="num"><b>${l.count}</b></td>
      <td class="no-print nowrap"><button class="btn sm" data-ledit="${l.id}">Edit</button> <button class="btn sm ghost" data-ldel="${l.id}" title="Delete">✕</button></td></tr>`).join("")}
    </tbody></table></div>${rows.length > max ? `<p class="no-print"><button class="link" id="moreLeads">Show all ${rows.length} entries</button></p>` : ""}`;
}

// ================================================================ BUDGET & CPL
async function viewBudget() {
  const admin = isAdmin();
  const m = S.month;
  const prevM = addMonths(m, -1);
  let budgets, leads, prev;
  if (admin) {
    if (!S.bm || S.bm.month !== m) {
      renderLoading2();
      const [bb, ll, pp] = await Promise.all([
        store.listBudgets({ from: m, to: m }), store.listLeads({ from: monthStart(m), to: monthEnd(m) }), store.listBudgets({ from: prevM, to: prevM })]);
      S.bm = { month: m, budgets: bb, leads: ll, prev: pp };
    }
    ({ budgets, leads, prev } = S.bm);
  } else {
    budgets = S.budgets.filter((b) => b.month === m);
    leads = S.leads.filter((l) => monthOf(l.date) === m);
    prev = S.budgets.filter((b) => b.month === prevM);
  }
  const allLocs = scopeBranches();
  if (S.f.branch && !allLocs.includes(S.f.branch)) S.f.branch = "";
  const locs = S.f.branch ? [S.f.branch] : allLocs;
  const P = paid();
  if (!allLocs.length || !P.length) {
    $("#main").innerHTML = `<div class="page-head"><h2>Budget & CPL</h2></div><p class="empty">${!allLocs.length ? "No locations assigned yet." : "No paid lead sources set. Add them in Settings → Paid lead sources."}</p>`;
    return;
  }
  const rec = (b, s) => budgets.find((x) => x.branch === b && x.source === s) || {};
  const leadsOf = (b, s) => sum(leads.filter((l) => l.branch === b && (s ? l.source === s : true)));
  const paidLeadsOf = (b) => sum(leads.filter((l) => l.branch === b && P.includes(l.source)));
  const tot = { required: 0, spent: 0, paidLeads: 0, allLeads: 0 };
  locs.forEach((b) => P.forEach((s) => { const r = rec(b, s); tot.required += +r.required || 0; tot.spent += +r.spent || 0; }));
  locs.forEach((b) => { tot.paidLeads += paidLeadsOf(b); tot.allLeads += leadsOf(b); });
  const B = { required: tot.required, spent: tot.spent, balance: tot.required - tot.spent, util: pct(tot.spent, tot.required),
    paidLeads: tot.paidLeads, allLeads: tot.allLeads, cpl: tot.paidLeads ? tot.spent / tot.paidLeads : null, blended: tot.allLeads ? tot.spent / tot.allLeads : null };
  const cell = (b, s, k) => { const v = rec(b, s)[k]; return v === undefined || v === null ? "" : v; };
  const rows = locs.map((b) => {
    const lr = P.map((s) => {
      const r = rec(b, s), req = +r.required || 0, sp = +r.spent || 0, lc = leadsOf(b, s);
      return `<tr data-b="${esc(b)}" data-s="${esc(s)}">
        <td class="muted">${esc(s)}</td>
        <td class="num"><input type="number" min="0" step="any" class="money" data-k="required" value="${esc(cell(b, s, "required"))}" placeholder="0" aria-label="Required budget ${esc(b)} ${esc(s)}"></td>
        <td class="num"><input type="number" min="0" step="any" class="money" data-k="spent" value="${esc(cell(b, s, "spent"))}" placeholder="0" aria-label="Spent ${esc(b)} ${esc(s)}"></td>
        <td class="num c-bal ${req - sp < 0 ? "red" : ""}">${inr(req - sp)}</td>
        <td class="num c-util">${req ? pct(sp, req) + "%" : "—"}</td>
        <td class="num c-leads">${lc}</td>
        <td class="num c-cpl">${inr(lc ? sp / lc : null)}</td></tr>`;
    }).join("");
    const req = P.reduce((a, s) => a + (+rec(b, s).required || 0), 0), sp = P.reduce((a, s) => a + (+rec(b, s).spent || 0), 0);
    const pl = paidLeadsOf(b), al = leadsOf(b);
    return `<tbody class="loc-group"><tr class="loc-head"><td colspan="7"><b>${esc(b)}</b></td></tr>${lr}
      <tr class="subtotal"><td>Total — ${esc(b)}</td><td class="num">${inr(req)}</td><td class="num">${inr(sp)}</td>
      <td class="num ${req - sp < 0 ? "red" : ""}">${inr(req - sp)}</td><td class="num">${req ? pct(sp, req) + "%" : "—"}</td>
      <td class="num">${pl}<div class="muted sm">${al} all sources</div></td><td class="num">${inr(pl ? sp / pl : null)}<div class="muted sm">blended ${inr(al ? sp / al : null)}</div></td></tr></tbody>`;
  }).join("");
  $("#main").innerHTML = `
    <div class="page-head"><div class="head-left"><h2>Budget & CPL</h2>
      <input type="month" id="pickMonth" class="picker no-print" value="${m}" aria-label="Month"></div>
      <div class="actions no-print"><button class="btn" id="copyPrev">Copy required budget from ${fmtMonth(prevM)}</button>
      <button class="btn" id="csv">Export CSV</button><button class="btn" onclick="print()">Print / PDF</button></div></div>
    ${printHead("Budget & CPL Report", `${fmtMonth(m)}${S.f.branch ? " · " + S.f.branch : ""}`)}
    ${allLocs.length > 1 ? filterBar({ period: false, people: false, category: false }) : ""}
    ${section("Budget & CPL", fmtMonth(m))}
    <div class="kpis">
      ${kpi("Required budget", inr(B.required))}
      ${kpi("Spent", inr(B.spent), `${B.util}% of budget used`, B.required && B.spent > B.required ? "bad" : "")}
      ${kpi("Balance", inr(B.balance), B.balance < 0 ? "over budget" : "left to spend", B.balance < 0 ? "bad" : "good")}
      ${kpi("Paid leads", B.paidLeads.toLocaleString("en-IN"), `${B.allLeads.toLocaleString("en-IN")} from all sources`)}
      ${kpi("CPL (paid)", inr(B.cpl), "spent ÷ paid leads")}
      ${kpi("Blended CPL", inr(B.blended), "spent ÷ all leads")}
    </div>
    ${locs.length > 1 ? `<div class="grid2">
      ${chartBox("bLoc", "Required vs spent by location", hFor(locs.length, 40))}
      ${chartBox("bCpl", "CPL (paid) by location", hFor(locs.length, 40))}
    </div>` : ""}
    <form id="bf" class="card">
      <div class="bf-head"><h3>Monthly budget and spend — ${fmtMonth(m)}</h3>
        <span class="muted sm">Enter amounts in ₹. Leads and CPL are calculated from lead entries automatically.</span></div>
      <div class="table-wrap"><table class="tbl budget-grid"><thead><tr><th>Paid channel</th><th class="num">Required budget (₹)</th><th class="num">Spent (₹)</th>
        <th class="num">Balance</th><th class="num">Used</th><th class="num">Leads</th><th class="num">CPL</th></tr></thead>
        ${rows}
        <tfoot><tr class="total"><td>Grand total</td><td class="num">${inr(B.required)}</td><td class="num">${inr(B.spent)}</td>
          <td class="num ${B.balance < 0 ? "red" : ""}">${inr(B.balance)}</td><td class="num">${B.required ? B.util + "%" : "—"}</td>
          <td class="num">${B.paidLeads}</td><td class="num">${inr(B.cpl)}</td></tr></tfoot></table></div>
      <div class="bf-foot no-print"><span class="muted sm" id="dirty"></span><button class="btn primary" id="saveB">Save budget</button></div>
    </form>`;
  bindFilters();
  $("#pickMonth").onchange = (e) => { if (e.target.value) { S.month = e.target.value; renderView(); } };
  const form = $("#bf");
  $$("tr[data-b]", form).forEach((tr) => {
    const recalc = () => {
      const req = +$("[data-k=required]", tr).value || 0, sp = +$("[data-k=spent]", tr).value || 0, lc = leadsOf(tr.dataset.b, tr.dataset.s);
      $(".c-bal", tr).textContent = inr(req - sp); $(".c-bal", tr).classList.toggle("red", req - sp < 0);
      $(".c-util", tr).textContent = req ? pct(sp, req) + "%" : "—";
      $(".c-cpl", tr).textContent = inr(lc ? sp / lc : null);
      $("#dirty").textContent = "Unsaved changes";
    };
    $$("input", tr).forEach((i) => (i.oninput = recalc));
  });
  $("#copyPrev").onclick = () => {
    let n = 0;
    $$("tr[data-b]", form).forEach((tr) => {
      const p = prev.find((x) => x.branch === tr.dataset.b && x.source === tr.dataset.s);
      const inp = $("[data-k=required]", tr);
      if (p && p.required && !inp.value) { inp.value = p.required; inp.oninput(); n++; }
    });
    toast(n ? `Copied ${n} amounts from ${fmtMonth(prevM)} — click Save budget` : `Nothing to copy from ${fmtMonth(prevM)}`, !n);
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#saveB"); btn.disabled = true;
    try {
      let n = 0;
      for (const tr of $$("tr[data-b]", form)) {
        const b = tr.dataset.b, s = tr.dataset.s, r = rec(b, s);
        const reqV = $("[data-k=required]", tr).value, spV = $("[data-k=spent]", tr).value;
        const required = Math.max(0, Number(reqV) || 0), spent = Math.max(0, Number(spV) || 0);
        if (r.id ? required === (+r.required || 0) && spent === (+r.spent || 0) : reqV === "" && spV === "") continue;
        const d = { id: `${m}__${slug(b)}__${slug(s)}`, month: m, branch: b, source: s, required, spent,
          updatedBy: S.user.uid, updatedByName: S.profile.name, updatedAt: new Date().toISOString() };
        await store.saveBudget(d);
        const i = budgets.findIndex((x) => x.id === d.id);
        if (i >= 0) budgets[i] = { ...budgets[i], ...d }; else budgets.push(d);
        if (admin) {
          const j = S.budgets.findIndex((x) => x.id === d.id);
          if (j >= 0) S.budgets[j] = { ...S.budgets[j], ...d }; else if (periodMonths().includes(m)) S.budgets.push(d);
        }
        n++;
      }
      toast(n ? `Saved ${n} budget line${n > 1 ? "s" : ""}` : "No changes to save");
      renderView();
    } catch (er) { toast(errMsg(er), true); btn.disabled = false; }
  };
  $("#csv").onclick = () => {
    const out = [["Month", "Location", "Paid channel", "Required budget", "Spent", "Balance", "Used %", "Leads", "CPL"]];
    locs.forEach((b) => P.forEach((s) => { const r = rec(b, s), req = +r.required || 0, sp = +r.spent || 0, lc = leadsOf(b, s);
      out.push([m, b, s, req, sp, req - sp, req ? pct(sp, req) : "", lc, lc ? Math.round(sp / lc) : ""]); }));
    download(`renewplus-budget-cpl_${m}.csv`, out);
  };
  if (locs.length > 1) {
    const per = locs.map((b) => { const req = P.reduce((a, s) => a + (+rec(b, s).required || 0), 0), sp = P.reduce((a, s) => a + (+rec(b, s).spent || 0), 0), pl = paidLeadsOf(b);
      return { b, req, sp, cpl: pl ? Math.round(sp / pl) : 0 }; });
    budgetChart("bLoc", per.map((x) => x.b), per.map((x) => x.req), per.map((x) => x.sp));
    hbar("bCpl", per.map((x) => [x.b, x.cpl]).sort((a, c) => c[1] - a[1]), C.amber, true, "CPL");
  }
}

// ================================================================ PEOPLE (admin)
function viewPeople() {
  const users = [...S.users].sort((a, b) => (a.role === "admin" ? -1 : 0) - (b.role === "admin" ? -1 : 0) || a.name.localeCompare(b.name));
  const unassigned = S.settings.branches.filter((b) => !staffUsers().some((u) => branchesOf(u).includes(b)));
  $("#main").innerHTML = `<div class="page-head"><h2>People <small class="muted">${users.filter((u) => u.active !== false).length} active</small></h2>
    <div class="actions"><button class="btn primary" id="add">+ Add person</button></div></div>
    ${unassigned.length ? `<div class="notice">No responsible person yet for: <b>${unassigned.map(esc).join(", ")}</b></div>` : ""}
    <section class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Locations handled</th><th>Status</th><th></th></tr></thead>
    <tbody>${users.map((u) => `<tr class="${u.active !== false ? "" : "inactive"}"><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td>
      <td><span class="badge ${u.role === "admin" ? "completed" : "committed"}">${u.role === "admin" ? "Admin" : "Responsible person"}</span></td>
      <td>${u.role === "admin" ? `<span class="muted">All</span>` : branchesOf(u).map((b) => `<span class="loc-chip sm">${esc(b)}</span>`).join(" ") || `<span class="red">None</span>`}</td>
      <td>${u.active !== false ? "Active" : "Inactive"}</td>
      <td class="nowrap"><button class="btn sm" data-u="${u.uid}">Edit</button>
      ${u.uid !== S.user.uid ? `<button class="btn sm" data-pw="${u.uid}">Set password</button>` : ""}
      ${u.uid !== S.user.uid ? `<button class="btn sm ghost" data-act="${u.uid}">${u.active !== false ? "Deactivate" : "Activate"}</button> <button class="btn sm danger" data-delu="${u.uid}">Delete</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div></section>
    <p class="muted sm">Each responsible person can handle one or more locations. They see only their own tasks; for their locations they also see the budget and lead totals (for CPL). <b>Delete</b> removes a person for good; <b>Deactivate</b> blocks access but keeps them in reports.</p>`;
  $("#add").onclick = () => userModal(null);
  $$("[data-u]").forEach((b) => (b.onclick = () => userModal(S.users.find((u) => u.uid === b.dataset.u))));
  $$("[data-pw]").forEach((b) => (b.onclick = () => passwordModal(S.users.find((x) => x.uid === b.dataset.pw))));
  $$("[data-act]").forEach((b) => (b.onclick = async () => {
    const u = S.users.find((x) => x.uid === b.dataset.act);
    const active = u.active === false;
    try { await store.updateUser(u.uid, { active }); u.active = active; renderView(); } catch (e) { toast(errMsg(e), true); }
  }));
  $$("[data-delu]").forEach((b) => (b.onclick = () => deleteUserModal(S.users.find((x) => x.uid === b.dataset.delu))));
}

function userModal(u) {
  const mine = branchesOf(u);
  modal(u ? "Edit person" : "Add responsible person", `
    <label>Full name<input name="name" required value="${esc(u?.name)}"></label>
    <label>Email (login)<input name="email" type="email" required value="${esc(u?.email)}" ${u ? "disabled" : ""}></label>
    ${u ? "" : `<label>Temporary password<input name="password" minlength="6" required value="Renew@${Math.floor(1000 + Math.random() * 9000)}"><small class="muted">Share this with the person; they can change it via “Forgot password”.</small></label>`}
    <label>Role<select name="role">${opts([["staff", "Responsible person"], ["admin", "Admin (sees all locations)"]], u?.role || "staff")}</select></label>
    <div class="field"><span class="field-label">Locations handled <small class="muted">(tick one or more)</small></span>
      <div class="checks">${S.settings.branches.map((b) => `<label class="check"><input type="checkbox" name="loc" value="${esc(b)}" ${mine.includes(b) ? "checked" : ""}> ${esc(b)}</label>`).join("")}</div></div>`,
  async (f, el) => {
    const branches = $$("input[name=loc]:checked", el).map((i) => i.value);
    if (f.role !== "admin" && !branches.length) throw new Error("Tick at least one location");
    const data = { name: f.name.trim(), role: f.role, branches, branch: branches[0] || "" };
    if (u) { await store.updateUser(u.uid, data); Object.assign(u, data); toast("Saved"); }
    else {
      const nu = await store.createUser({ ...data, email: f.email.trim(), password: f.password }); S.users.push(nu);
      renderView(); setTimeout(() => shareLoginModal(nu, f.password, true), 50); return;
    }
    renderView();
  });
}

function deleteUserModal(u) {
  modal("Delete person", `
    <div class="task-sum"><b>${esc(u.name)}</b><span class="muted sm">${esc(u.email)} · ${esc(branchesOf(u).join(", "))}</span></div>
    <p>This removes ${esc(u.name)} from the People list and blocks their access to the tracker. It cannot be undone.</p>
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

// ================================================================ SETTINGS (admin)
function viewSettings() {
  const s = S.settings;
  const box = (k, label, hint) => `<section class="card"><h3>${label}</h3><p class="muted sm">${hint}</p>
    <textarea name="${k}" rows="10">${esc((s[k] || []).join("\n"))}</textarea></section>`;
  $("#main").innerHTML = `<div class="page-head"><h2>Settings</h2></div>
    <form id="sf"><div class="grid3">
      ${box("branches", "Locations", "One per line, e.g. “Chennai - Anna Nagar”. Assign them to people on the People page.")}
      ${box("categories", "Task categories", "Types of marketing work, one per line.")}
      ${box("leadSources", "Lead sources", "Where leads come from, one per line.")}
      ${box("paidSources", "Paid lead sources (have a budget)", "Copy the exact names from Lead sources that have ad spend. These get budget lines and CPL.")}
      ${box("leadServices", "Lead services", "Treatment / service the lead asked about, one per line.")}
    </div><button class="btn primary">Save settings</button></form>`;
  $("#sf").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const lines = (k) => [...new Set(f.get(k).split("\n").map((x) => x.trim()).filter(Boolean))];
    const ns = { ...S.settings, branches: lines("branches"), categories: lines("categories"), leadSources: lines("leadSources"),
      leadServices: lines("leadServices"), paidSources: lines("paidSources") };
    if (!ns.branches.length || !ns.categories.length || !ns.leadSources.length || !ns.leadServices.length)
      return toast("Locations, categories, lead sources and services each need at least one line", true);
    const bad = ns.paidSources.filter((p) => !ns.leadSources.includes(p));
    if (bad.length) return toast(`Paid source not in Lead sources: ${bad.join(", ")}`, true);
    try { await store.saveSettings(ns); S.settings = ns; toast("Settings saved"); } catch (er) { toast(errMsg(er), true); }
  };
}

// ================================================================ modals
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

// Admin: when the person changes, offer only that person's locations
function personLocBinding(form) {
  const ps = $("[name=uid]", form), ls = $("[name=branch]", form);
  if (!ps || !ls) return;
  ps.onchange = () => {
    const bs = branchesOf(S.users.find((x) => x.uid === ps.value));
    ls.innerHTML = opts(bs, bs[0] || "");
  };
}

// Commit (staff) / assign or edit (admin)
function taskModal(t) {
  const s = S.settings;
  const admin = isAdmin();
  const staff = staffUsers().map((u) => [u.uid, u.name]);
  const owner = t ? (S.users.find((u) => u.uid === t.uid) || S.profile) : admin ? S.users.find((u) => u.uid === (S.f.uid || (S.view === "person" ? S.dashUid : ""))) : S.profile;
  const locs = branchesOf(owner);
  const form = modal(t ? "Edit task" : admin ? "Assign a task" : "Commit a task", `
    ${admin && !t ? `<label>Responsible person<select name="uid" required>${opts(staff, owner?.uid || "", "Select person")}</select></label>` : ""}
    <label>Location<select name="branch" required>${opts(t && !locs.includes(t.branch) ? [t.branch, ...locs] : locs, t?.branch || (locs.includes(S.f.branch) ? S.f.branch : locs[0] || ""))}</select></label>
    <label>Task<input name="title" required maxlength="140" placeholder="e.g. 6 Instagram posts for PRP offer" value="${esc(t?.title)}"></label>
    <label>Details (optional)<textarea name="description" rows="2" maxlength="500">${esc(t?.description)}</textarea></label>
    <div class="row"><label>Category<select name="category" required>${opts(s.categories, t?.category, "Select")}</select></label>
    <label>Priority<select name="priority">${opts(PRIORITIES, t?.priority || "Medium")}</select></label></div>
    <div class="row"><label>Due date<input type="date" name="dueDate" required min="${t ? "" : today()}" value="${esc(t?.dueDate || addDays(today(), 7))}"></label>
    <label>Target quantity (optional)<input type="number" min="0" name="target" placeholder="e.g. 6" value="${esc(t?.target)}"></label></div>
    ${t ? `<label>Status<select name="status">${opts(STATUSES, t.status)}</select></label>` : ""}`,
  async (f) => {
    if (!f.branch) throw new Error("This person has no location assigned. Assign one on the People page.");
    const base = { title: f.title.trim(), description: f.description.trim(), category: f.category, priority: f.priority,
      dueDate: f.dueDate, target: f.target ? Number(f.target) : "", branch: f.branch };
    const now = new Date().toISOString();
    if (t) {
      const patch = { ...base, status: f.status, updatedAt: now };
      if (f.status === "Completed" && t.status !== "Completed") Object.assign(patch, { completedOn: today(), progress: 100 });
      if (f.status !== "Completed") patch.completedOn = "";
      await store.updateTask(t.id, patch); Object.assign(t, patch); toast("Task updated");
    } else {
      const who = admin ? S.users.find((u) => u.uid === f.uid) : S.profile;
      const nt = {
        ...base, uid: who.uid, userName: who.name, commitDate: today(), status: "Committed", progress: 0, achieved: "",
        proofLink: "", remarks: "", completedOn: "", createdBy: S.user.uid, adminComment: "", createdAt: now, updatedAt: now, updates: [],
      };
      nt.id = await store.addTask(nt);
      S.tasks.push(nt);
      toast(admin ? `Assigned to ${who.name}` : "Task committed");
    }
    renderView();
  }, t ? "Save" : admin ? "Assign" : "Commit");
  personLocBinding(form);
}

// Staff progress update
function updateModal(t) {
  const form = modal("Update progress", `
    <div class="task-sum"><b>${esc(t.title)}</b><span class="muted sm">${esc(t.branch)} · ${esc(t.category)} · due ${fmt(t.dueDate)}</span></div>
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

// Add (several rows at once) or edit one lead entry
function leadModal(entry) {
  const s = S.settings, admin = isAdmin();
  const staff = staffUsers().map((u) => [u.uid, u.name]);
  const owner = entry ? (S.users.find((u) => u.uid === entry.uid) || S.profile) : admin ? S.users.find((u) => u.uid === (S.f.uid || (S.view === "person" ? S.dashUid : ""))) : S.profile;
  const locs = branchesOf(owner);
  let n = 0;
  const row = (r = {}) => { const i = n++; return `<div class="lead-row">
    <select name="source_${i}" required aria-label="Lead source">${opts(s.leadSources, r.source, "Lead source")}</select>
    <select name="service_${i}" required aria-label="Service">${opts(s.leadServices, r.service, "Service")}</select>
    <input type="number" name="count_${i}" min="0" step="1" required placeholder="Leads" aria-label="Number of leads" value="${esc(r.count ?? "")}">
    ${entry ? "" : `<button type="button" class="btn sm ghost rm" title="Remove row">✕</button>`}</div>`; };
  const form = modal(entry ? "Edit lead entry" : "Add leads", `
    ${admin && !entry ? `<label>Responsible person<select name="uid" required>${opts(staff, owner?.uid || "", "Select person")}</select></label>` : ""}
    <div class="row"><label>Location<select name="branch" required>${opts(entry && !locs.includes(entry.branch) ? [entry.branch, ...locs] : locs, entry?.branch || (locs.includes(S.f.branch) ? S.f.branch : locs[0] || ""))}</select></label>
    <label>Date<input type="date" name="date" required max="${today()}" value="${esc(entry?.date || today())}"></label></div>
    <div><div class="lead-head"><span>Lead source</span><span>Service</span><span>Leads</span></div>
    <div id="leadRows">${entry ? row(entry) : row() + row()}</div>
    ${entry ? "" : `<button type="button" class="link" id="addRow">+ Add another row</button>`}</div>
    <p class="muted sm">Add one row per source + service combination for this day and location.</p>`,
  async (f, el) => {
    if (!f.branch) throw new Error("No location assigned. Ask the admin to assign one on the People page.");
    const rows = $$(".lead-row", el).map((r) => {
      const [src, svc, cnt] = $$("select,input", r);
      return { source: src.value, service: svc.value, count: parseInt(cnt.value, 10) || 0 };
    }).filter((r) => r.source && r.service);
    if (!rows.length) throw new Error("Add at least one row");
    const now = new Date().toISOString();
    if (entry) {
      const patch = { date: f.date, branch: f.branch, ...rows[0], updatedAt: now };
      await store.updateLead(entry.id, patch); Object.assign(entry, patch); toast("Lead entry updated");
    } else {
      const who = admin ? S.users.find((u) => u.uid === f.uid) : S.profile;
      for (const r of rows) {
        const l = { uid: who.uid, userName: who.name, branch: f.branch, date: f.date, ...r, createdBy: S.user.uid, createdAt: now, updatedAt: now };
        l.id = await store.addLead(l);
        S.leads.push(l);
      }
      S.bm = null;
      toast(`${sum(rows)} leads saved`);
    }
    renderView();
  }, entry ? "Save" : "Save leads");
  const bindRm = () => $$(".rm", form).forEach((b) => (b.onclick = () => { if ($$(".lead-row", form).length > 1) b.parentElement.remove(); }));
  bindRm();
  if ($("#addRow", form)) $("#addRow", form).onclick = () => { $("#leadRows", form).insertAdjacentHTML("beforeend", row()); bindRm(); };
  personLocBinding(form);
}

// ================================================================ admin: set a person's password
const genPassword = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(6));
  return "Renew@" + [...r].map((n) => c[n % c.length]).join("");
};
async function passwordModal(u) {
  let saved = null;
  try { saved = await store.getCredential(u.uid); } catch (e) { /* treated as not saved */ }
  const form = modal(`Set password — ${esc(u.name)}`, `
    <div class="task-sum"><b>${esc(u.name)}</b><span class="muted sm">${esc(u.email)}</span></div>
    <label>New password<div class="pw-row"><input name="pw" required minlength="6" value="${genPassword()}" autocomplete="off">
      <button type="button" class="btn sm" id="gen">Generate</button></div>
      <small class="muted">At least 6 characters. You will be able to copy or WhatsApp it after saving.</small></label>
    ${saved ? `<p class="muted sm">✓ The current password is on record, so no other details are needed.</p>`
      : `<label>Current password (needed once)<input name="cur" required autocomplete="off" placeholder="The password you last gave ${esc(u.name.split(" ")[0])}">
      <small class="muted">This person was added before passwords were recorded. Enter the password you shared with them (e.g. their temporary password). After this, it is remembered.</small></label>`}`,
  async (f) => {
    if (f.pw.trim().length < 6) throw new Error("Password must be at least 6 characters");
    try { await store.setPassword(u, f.pw.trim(), (f.cur || "").trim() || null); }
    catch (e) {
      if (e.message === "WRONG_CURRENT") throw new Error(saved
        ? `The recorded password no longer works — ${u.name} may have changed it. Ask them for their current password, or use "Forgot password?" on the sign-in page.`
        : "That current password is not correct. Check it and try again.");
      if (e.message === "NO_CURRENT") throw new Error("Enter the current password");
      throw e;
    }
    setTimeout(() => shareLoginModal(u, f.pw.trim(), false), 50);
  }, "Set password");
  $("#gen", form).onclick = () => { $("[name=pw]", form).value = genPassword(); };
  if (saved) {
    // allow the admin to enter the current password if the recorded one is out of date
    const add = document.createElement("button");
    add.type = "button"; add.className = "link sm"; add.textContent = "Recorded password out of date? Enter the current one";
    add.onclick = () => { add.outerHTML = `<label>Current password<input name="cur" autocomplete="off"></label>`; };
    $(".modal-body", form).appendChild(add);
  }
}
function shareLoginModal(u, pw, isNew) {
  const link = location.origin + location.pathname;
  const msg = `Hi ${u.name.split(" ")[0]}, ${isNew ? "your login for the Renew+ Marketing Task Tracker is ready" : "your Renew+ Marketing Task Tracker password has been reset"}.\n\nLink: ${link}\nEmail: ${u.email}\nPassword: ${pw}\n\nPlease keep it private.`;
  const form = modal(isNew ? "Person added — share login" : "Password set — share login", `
    <p>${isNew ? `${esc(u.name)} has been added.` : `The new password for ${esc(u.name)} is active now.`} Share these details with them:</p>
    <textarea id="shareTxt" rows="8" readonly>${esc(msg)}</textarea>`,
  async () => {}, "Done");
  const foot = $(".modal-foot", form);
  $(".cancel", foot).remove();
  foot.insertAdjacentHTML("afterbegin", `<button type="button" class="btn" id="copyTxt">Copy</button><a class="btn" id="waTxt" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Share on WhatsApp</a>`);
  $("#copyTxt", form).onclick = async () => {
    try { await navigator.clipboard.writeText(msg); toast("Copied"); }
    catch (e) { $("#shareTxt", form).select(); document.execCommand("copy"); toast("Copied"); }
  };
}
