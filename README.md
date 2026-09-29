# PHI Enterprise Process Blueprint

The living master blueprint for PHI's Odoo 19 implementation. The team reviews and validates it in the browser:

- **S-0 World map** — Level 0 value chain with validation progress per process.
- **S-1 COPIS** — one COPIS per Level 1 process, read customer-first (Customers → Outputs → Process → Inputs → Suppliers) so every process is designed from the result backwards. Admins and assigned owners can edit it. Each process starts with **Customer requirements**: what each customer needs from the outputs, with a measure, a target and a Draft/Validated status. Twelve processes come with draft requirements taken from the re-engineering KPIs, which process owners confirm with their customers.
- **S-2 Swimlanes** — seven BPMN 2.0 collaboration diagrams. They are viewed and edited in the browser with bpmn-js; every save becomes a new version, older versions can be restored, and each can be downloaded as `.bpmn`.
- **S-3 Data & interconnection matrix** — for each hand-off step: trigger, data fields, system hand-off, exceptions and fit. Process owners approve each step, approve it with changes, or send it back for rework.
- **S-4 Master data & Lot** — shared records, plus the vendor-proposed Lot master model and which fields each process needs on it.
- **S-5 Open items** — decisions to close before BRD sign-off, with owner, target date and status.
- **S-6 Re-engineering** — 23 opportunities, each with:
  - the current and proposed process side by side, and the justification (problem, fix, control effect, expected outcome);
  - the before and after steps, tagged Manual, Paper, Rekey or Wait before, and Auto, Rule, Parallel, Earlier, New or Same after;
  - the effect on the AWB SOW, plus PHI's decision, KPI baseline and negotiation status.
- **S-7 SOW & vendor** — AWB SOW S343096 reviewed against the blueprint in six tabs:
  - overview (key facts, milestones, headline risks);
  - gap analysis by process, cross-cutting and SOW-only items;
  - Appendix A/B items raised with AWB, with their responses and estimates;
  - the 14 commercial observations, each shown with the request as worded to AWB;
  - the 100-item scope map;
  - the effort-table check.
- **S-8 Documents** — versioned library for the SOW, letters, workbooks and diagrams. Files up to 25 MB are stored in PostgreSQL, so they're included in database backups. Documents can be marked confidential to hide them from viewers.
- **Discussion threads** on processes, diagrams, open items, re-engineering opportunities, SOW gaps, observations and documents, and a full **activity log**.
- **Exports** — the Excel workbook (current state, including validation status) and all `.bpmn` files as a zip.

- **T Project toolkit** — the ERP program toolkit: key dates, a master schedule with a Gantt chart (pre-work + the AWB SOW phases to Go-Live and hypercare), milestones and gates, and 20 registers (RAID, decision log, change requests, status reports, process inventory, pain points, Shadow IT, data migration, fit-gap, UAT scripts, defects, training, cutover runbook, Go/No-Go, sign-offs with printable forms, and more). Every record belongs to a domain or is project-wide.
- **Audit log** — immutable, hash-chained record of every change (see below).

**Superadmin**

Superadmin is a built-in, locked role with full access. It is the **only** role that can add or delete users, reset a Superadmin's password, change a Superadmin account, or grant or remove Superadmin. These rights can't be given to any other role on the Roles page.

- **Project Manager** keeps everything else, and can still edit non-Superadmin users: name, role, domains, processes and password resets.
- **Always one left:** the app keeps at least one active Superadmin, and at least one active Project Manager or Superadmin.
- **Deleting a user** keeps their work. References to them become empty, and the audit log keeps their name and email. Deactivating is still the reversible option.
- **Existing accounts:** migration `007_superadmin.sql` makes the accounts named **scradmin** (by name or by email before the @) and **Blueprint Admin** Superadmins. The migration prints who was assigned.
- **Recovery:**
  - `npm run set-role -- <email> superadmin` assigns the role from the server.
  - `npm run create-admin` now creates a Superadmin.

**Configuring the toolkit in the app**

Toolkit → **Configure toolkit** (Project Manager by default; permission *Toolkit configuration*) changes the toolkit without code or a redeploy:

- **Registers:**
  - Rename a register, regroup it in the menu, reorder, archive or restore it, and edit its description and how-to notes.
  - Add, rename, reorder or remove columns. Column types are short text, long text, date or pick-list.
  - Edit pick-list options, and choose which columns show in the list, show as badges, or count as **status** columns for quick updates.
  - Set the auto-numbered ID prefix and edit the printable sign-off forms.
  - Create new registers. Custom roles get the same access as a register you pick.
- **Schedule phases:** names, colours and order. Add new phases. A phase can't be removed while schedule items use it.
- **Domains:** add or rename them. A domain can only be deleted when nothing uses it.
- **Guide page:** introduction, rules, items to confirm, schedule note, project folders and naming convention.

**How data is protected.** Removing a column only archives it, and records keep their values. A pick-list value that was valid when entered stays valid after the option list changes.

**Audit and sync.** Every change goes to the audit log. Both PM2 instances pick up changes within a few seconds. The shipped definitions in `server/src/lib/registers.json` are used only to set up a new database.

**Colour themes**

Pick a theme at the bottom of the sidebar; the choice is remembered per browser.

- **Calm** (default) is a gentle, low-glare palette. Body text is 15:1 contrast, muted text at least 4.9:1, and every status badge at least 7:1.
- **High contrast** is for bright site offices, projectors and low vision.
- **Dark** is a dark palette.
- **Auto** follows the device: Calm, or Dark when the device prefers dark.

Schedule phase colours follow the theme.

**Updating status**

Anyone whose role has *Update status* can change a toolkit record's status straight from the list — the coloured status pill in the Gantt, the schedule table, and each register — or from the record's dialog. Other fields stay read-only.

- **Status fields covered:**
  - Schedule tasks and milestones.
  - Milestones, comms, RAID, change requests, process inventory, defects and cutover status.
  - Data-migration mock results.
  - UAT round results.
  - Go/No-Go RAG.
- **Status fields not covered:** sign-offs and CCB decisions still need full *Edit* rights.
- **What "Own" means here:** the user's own domain(s) **plus** project-wide records, so the whole team can keep shared items current. Process Owners get this by default (migration `004_status_permission.sql`).
- **Audit:** every status change is logged with the old and new value.

**Roles and permissions (RBAC)**

Each user has one role, and optionally one or more **domains** (SR Sales & Reservation, BC Billing & Collection, AF Accounting & Finance, IP Inventory & Project Management, IT IT & Data) and assigned **processes**. For every module a role grants View, Add, Edit and Delete at one of three levels: **All**, **Own** (records in the user's domains, or processes assigned to them) or **No**. The server enforces every check; the UI only hides what a role can't do.

| Role | Built-in | Can do |
|---|---|---|
| Executive | Yes, locked | Sponsors and SteerCo. View everything, including the audit log. No changes. |
| Project Manager | Yes, locked | View and change everything; manages users, roles and key dates. |
| Process Owner | No (editable) | View everything; add and edit in own domain(s) and assigned processes. |
| Viewer | No (editable) | View everything except confidential documents; comment. |

Custom roles are created on the **Roles** page. The app never lets the last active Project Manager be demoted or deactivated.

**Audit log**

- Database triggers record every insert, update and delete on every table: who, when, IP, changed fields, before and after values. Sign-ins, failed sign-ins, sign-outs, downloads, exports and refused write attempts are logged by the app.
- The `audit_log` table rejects UPDATE, DELETE and TRUNCATE, and each entry carries a SHA-256 hash of its content and the previous entry's hash. **Audit log → Verify** re-computes the whole chain.
- Readable (and exportable to CSV) by roles with *Audit log: view* — Executive and Project Manager by default.
- Hardening: a database superuser or the table owner can still disable triggers. The hash chain exposes edits to past entries; to also rule out removal of the newest entries, write down the "Latest #id / hash" periodically (e.g. in the monthly SteerCo minutes), and see *Running the app as a non-owner database user* below.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite, React Router, bpmn-js 17 (viewer + modeler), self-hosted Barlow fonts |
| Backend | Node.js 22 (works on 20+), Express 5, Zod validation, JWT in an httpOnly cookie, bcrypt |
| Database | PostgreSQL 14+ (plain SQL migrations in `server/migrations`) |
| Process manager | PM2, cluster mode, 2 instances |
| Web server | Nginx reverse proxy + Let's Encrypt (certbot) |

One Node process serves both the API (`/api/*`) and the built React app, so there is one port to proxy and one thing for PM2 to run.

```
phi-blueprint/
├── client/                React app (Vite)
│   └── src/pages/         World map, COPIS, matrix, diagrams, open items, users…
├── server/
│   ├── migrations/        SQL migrations, applied in filename order
│   ├── seed/              blueprint.json + the 7 baseline .bpmn files
│   └── src/               Express app, routes, auth, DB
├── deploy/nginx.conf      Nginx site template
├── scripts/deploy.sh      git pull → install → build → backup → migrate → pm2 reload
├── scripts/backup-db.sh   pg_dump to ./backups (keeps 14)
└── ecosystem.config.cjs   PM2 config
```

## Run locally

```bash
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, ADMIN_*; COOKIE_SECURE=false; NODE_ENV=development
npm install
npm run migrate
npm run seed                  # loads the blueprint and creates the first admin
npm run dev:server            # API on :3100
npm run dev:client            # UI on http://localhost:5173 (proxies /api)
```

## First deploy on the VPS (Ubuntu)

### 1. Prerequisites (once per server)

```bash
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql nginx git
sudo npm install -g pm2
```

### 2. Database

Use your own strong password in place of `STRONG_PASSWORD`.

```bash
sudo -u postgres psql <<'SQL'
CREATE USER phi WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE phi_blueprint OWNER phi;
SQL
```

### 3. Code and config

Run these as the deploy user, not root.

```bash
cd /var/www        # or wherever you keep apps
git clone git@github.com:<your-org>/phi-blueprint.git
cd phi-blueprint
cp .env.example .env
nano .env
```

In `.env`, set `DATABASE_URL`, `JWT_SECRET` and the `ADMIN_*` values. To generate a value for `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

If you'll test over plain http before TLS is set up, set `COOKIE_SECURE=false` for now. Otherwise sign-in won't stick.

### 4. Install, build, migrate, seed, start

```bash
npm ci
npm run build
npm run migrate
npm run seed
mkdir -p logs
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup          # run the command it prints, so PM2 restarts on reboot
curl http://127.0.0.1:3100/api/health
```

### 5. Nginx and HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/phi-blueprint
sudo nano /etc/nginx/sites-available/phi-blueprint     # set server_name
sudo ln -s /etc/nginx/sites-available/phi-blueprint /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d blueprint.yourdomain.com
```

Then set `COOKIE_SECURE=true` in `.env` and run `pm2 reload phi-blueprint --update-env`.

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (created as a Project Manager). You'll be asked to set a new password. Then add users under **Users**, pick each one's role, and tick their domains and the processes they validate.

## Updating

Push to `main`, then on the VPS:

```bash
cd /var/www/phi-blueprint && ./scripts/deploy.sh      # or ./scripts/deploy.sh some-branch
```

The script:
1. Pulls the branch (fast-forward only).
2. Runs `npm ci` and builds the client.
3. Backs up the database.
4. Applies new migrations.
5. Runs `pm2 reload`. This is zero-downtime in cluster mode.
6. Checks `/api/health`.

## Upgrading an existing server to this version

This release adds migration `002_project_workspace.sql`, new seed data (`server/seed/project.json`) and a larger Nginx upload limit.

```bash
cd /var/www/phi-blueprint
./scripts/deploy.sh                      # pulls, builds, migrates, seeds the new modules, reloads PM2
sudo nano /etc/nginx/sites-available/phi-blueprint   # set client_max_body_size 30m;
sudo nginx -t && sudo systemctl reload nginx
```

`npm run seed` only fills modules that are still empty, so existing processes, validations, comments and diagram versions are untouched.

## Loading project documents

Upload files one by one on the Documents page, or bulk-import a folder on the server:

```bash
scp -r ./phi-documents user@vps:/tmp/phi-documents        # from your machine
npm run import-docs -- /tmp/phi-documents                  # on the VPS, in the project folder
npm run import-docs -- /tmp/phi-documents --category "Correspondence"   # force one category
rm -rf /tmp/phi-documents
```

The import guesses a category from each file name and skips files already in the library. Vendor documents such as the SOW are confidential, so keep them out of git and load them this way.

## Upgrading to the RBAC, audit and toolkit release (migration 003)

```bash
cd /var/www/phi-blueprint && ./scripts/deploy.sh
```

`deploy.sh` backs up the database, then migration `003_rbac_audit_toolkit.sql`:
- maps existing users: `admin` → Project Manager, `owner` → Process Owner, `viewer` → Viewer;
- adds domains, roles, the toolkit tables and the audit log, and copies the existing activity history into the audit log as `LEGACY` entries;
- `npm run seed` then loads the toolkit (schedule, key dates, registers) once.

After deploying, open **Users** and assign each Process Owner their domain(s). Until they have a domain, they can view the toolkit but not change it.

## Running the app as a non-owner database user (recommended)

The app normally connects as the owner of the tables, which means that account could drop the audit triggers. For a stronger guarantee, run migrations as the owner but the app as a separate user:

```sql
CREATE USER phi_app WITH PASSWORD 'ANOTHER_STRONG_PASSWORD';
GRANT CONNECT ON DATABASE phi_blueprint TO phi_app;
GRANT USAGE ON SCHEMA public TO phi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO phi_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO phi_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM phi_app;
-- after future migrations, re-run the GRANT lines for new tables
```

Set `DATABASE_URL` in `.env` to `phi_app` for the running app, and run `npm run migrate` / `npm run seed` with the owner's URL (for example `DATABASE_URL=postgres://phi:…@localhost:5432/phi_blueprint npm run migrate`).

## SharePoint storage (optional)

With `SP_ENABLED=true`, document files live in a SharePoint document library instead of the database:

| What happens | In the app | In SharePoint |
|---|---|---|
| Upload | Goes straight to SharePoint. | Filed under `<SP_FOLDER>/<Category>/<id> - <title>.<ext>`. Confidential documents go under `<SP_FOLDER>/_Confidential/…`. |
| New version | Recorded as the next version. | Overwrites the same file, so SharePoint's version history matches the app's. |
| View or download | Always pulls the file from SharePoint. Older versions come from SharePoint's version history. | — |
| Rename, change category or confidentiality | — | The file is renamed or moved to match. |
| Delete | The document is removed. | The file goes to the SharePoint recycle bin. |
| File edited in SharePoint or Office Online | Recorded as a new version, e.g. "Edited in SharePoint by …". | — |
| File added directly to the folder | Imported as a new document; the subfolder decides the category. | — |

The last two rows happen on **Sync with SharePoint** (Documents page), and automatically every `SP_SYNC_MINUTES`.

**Setup:** register an app in Microsoft Entra ID with the Microsoft Graph application permission `Sites.Selected`, and grant it *write* on the one site (steps in the deployment notes). Then set the `SP_*` / `MS_*` values in `.env`.

**Commands:**
- `npm run sharepoint:check` tests the connection.
- `npm run docs:to-sharepoint`, or **Move files to SharePoint** on the Documents page, moves files already in the database.

## Everyday operations

| Task | Command |
|---|---|
| Logs | `pm2 logs phi-blueprint` (files in `./logs`) |
| Status / memory | `pm2 status`, `pm2 monit` |
| Manual backup | `./scripts/backup-db.sh` |
| Daily backup (cron) | `0 2 * * * cd /var/www/phi-blueprint && ./scripts/backup-db.sh >> logs/backup.log 2>&1` |
| Restore a backup | `gunzip -c backups/<file>.sql.gz \| psql "$DATABASE_URL"` (into an empty DB) |
| Locked out / new Project Manager | `npm run create-admin -- you@primaryhomes.com.ph "Your Name" 'TempPass12345'` |
| Reset blueprint content to baseline | `npm run seed:force` — **deletes all edits, validations, comments, diagram versions, re-engineering decisions and SOW responses**; users, documents, the toolkit and the audit log stay (the reset itself is recorded in the audit log) |

## Schema changes

Add a new numbered file such as `server/migrations/002_add_lot_fields.sql`. `deploy.sh` applies it on the next deploy. Never edit a migration that has already run on the server.

## Security notes

- Passwords are hashed with bcrypt (cost 12). Sessions are signed JWTs in an httpOnly, SameSite=Lax cookie (Secure over HTTPS) and last 12 hours by default.
- Sign-in is rate-limited to 20 attempts per 15 minutes per IP.
- New users and password resets must change their password on first sign-in.
- Helmet sets security headers, including a strict CSP. Only `'unsafe-inline'` styles are allowed, because bpmn-js needs them.
- The app binds to `127.0.0.1`. Only Nginx is exposed.
