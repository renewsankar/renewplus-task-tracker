# Renew+ Marketing Task Tracker

Task commitment & completion reporting for the Renew+ Hair and Skin Care digital-marketing teams across all branches.

- **Staff** sign in, commit tasks with a due date, update progress (status, % / quantity achieved, proof link, remarks) and print their own report. They can **never** see anyone else's tasks — this is enforced by the database rules, not just hidden in the screen.
- **Admin** sees every branch and person: KPIs, location-wise and person-wise reports, team and category charts, 8-week trend, overdue tracking, comments on tasks, task assignment, CSV export and print/PDF.

Hosted free on **GitHub Pages**; logins and data on **Firebase** (free Spark plan).

---

## Try it first (demo mode)

Until you paste your Firebase keys, the app runs in **demo mode** with sample branches, people and tasks stored only in your browser. Open the GitHub Pages link (or `index.html` via any local web server) and click a demo user to explore both views.

---

## Go live — one-time setup (~15 minutes)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> → **Add project** → name it e.g. `renewplus-tasks` (Google Analytics not needed).
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database** → choose location **asia-south1 (Mumbai)** → *Start in production mode*.
4. Firestore → **Rules** tab → replace everything with the contents of [`firestore.rules`](firestore.rules) → **Publish**.
   (If your first admin is not `sankar@renewgroups.com`, change the email inside `bootstrapEmails()`.)

### 2. Connect the app
1. Firebase console → ⚙ **Project settings → General → Your apps → Web (`</>`)** → register app (no hosting needed).
2. Copy the `firebaseConfig` values into [`js/config.js`](js/config.js).
3. Make sure `BOOTSTRAP_ADMINS` in `js/config.js` has the same admin email as `firestore.rules`.

> The Firebase web config is not a secret — it's safe in a public repo. Security comes from the rules.

### 3. Publish on GitHub Pages
1. Create a repository on GitHub (e.g. `renewplus-task-tracker`) and upload all files in this folder (keep the folder structure).
2. Repo → **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save**.
3. After ~1 minute your site is live at `https://<your-github-username>.github.io/renewplus-task-tracker/`.
4. Firebase console → **Authentication → Settings → Authorized domains → Add domain** → `<your-github-username>.github.io`.

### 4. First admin login
1. Firebase console → **Authentication → Users → Add user** → `sankar@renewgroups.com` + a password.
2. Open the site and sign in. Your admin profile and default settings are created automatically.
3. **Settings** page → enter your real branch list, teams and task categories → Save.
4. **Team** page → **Add person** for each staff member (name, email, branch, team, temporary password). Share the link + login with them; they can change their password with *Forgot password*.

---

## How the workflow runs

| Who | What |
|---|---|
| Staff (each week) | **Commit a task** → task, category, priority, due date, optional target quantity (e.g. 6 posts) |
| Staff (daily) | **Update** → status, achieved qty / %, proof link (Drive, post URL, report), remarks / blockers. Each update is kept in the task history. |
| Admin | Dashboard filters by period, branch, team, person, category. Click a branch row to drill in, click a person to see their tasks. Assign tasks, edit, comment, export CSV, print. |

**Definitions used in reports**
- *Completion %* = completed ÷ committed (tasks due in the selected period)
- *On-time %* = completed on or before due date ÷ completed
- *Overdue* = not completed and due date has passed

**What staff cannot do** (enforced by `firestore.rules`): read others' tasks or profiles, change a task's title / due date / owner / branch after committing, edit admin comments, change their own role, or delete a task once work has started.

---

## Files

```
index.html            app page
css/styles.css        styling (Renew+ brand colours)
js/config.js          ← paste Firebase config here
js/app.js             dashboards & screens
js/store-firebase.js  Firebase data layer
js/store-demo.js      demo data layer (used until config is filled)
firestore.rules       ← paste into Firebase console
assets/logo.png       Renew+ logo
```

Free-tier limits (Firebase Spark: 50k reads / 20k writes per day) comfortably cover dozens of staff.
