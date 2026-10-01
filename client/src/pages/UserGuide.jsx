import { Fragment, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useApi } from '../hooks.js';
import { SheetHead } from '../components/ui.jsx';

// ---------------------------------------------------------------- small building blocks
const Steps = ({ children }) => <ol className="g-steps">{children}</ol>;
const Tip = ({ children }) => <div className="g-tip"><b>Tip</b> {children}</div>;
const Note = ({ children }) => <div className="g-note"><b>Note</b> {children}</div>;
const Task = ({ title, children }) => <section className="g-task"><h4>{title}</h4>{children}</section>;
const Ui = ({ children }) => <span className="g-ui">{children}</span>;
const Go = ({ to, children }) => <Link to={to}>{children}</Link>;

function CanTable({ rows }) {
  return (
    <div className="tablewrap" style={{ margin: '8px 0 16px' }}>
      <table className="t">
        <thead><tr><th>Area</th><th>What you can do</th></tr></thead>
        <tbody>{rows.map(([a, b]) => <tr key={a}><td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{a}</td><td>{b}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- sections
function Everyone() {
  return (
    <>
      <h3>What this app is</h3>
      <p>The PHI Process Blueprint is the single place for the Odoo 19 rollout. It holds:</p>
      <ul>
        <li><b>The process blueprint:</b> the world map of PHI's processes, each process's COPIS, its hand-off steps, the swimlane diagrams and master data.</li>
        <li><b>The work around the vendor:</b> the re-engineering opportunities, the review of AWB's SOW S343096 and the document library.</li>
        <li><b>The project toolkit:</b> the schedule, RAID log, change requests, UAT, cutover and other registers the team runs the project with.</li>
      </ul>
      <p>Everything is linked. A process connects to its diagrams, steps, re-engineering opportunities and SOW items, and every change is recorded.</p>

      <h3>Signing in</h3>
      <Steps>
        <li>Open the app link from the Project Manager and sign in with your work email.</li>
        <li>The first time, you'll be asked to set a new password. Use at least 10 characters. The one you were given is temporary.</li>
        <li>To change your password later, click your name at the bottom of the left menu, then <Ui>Change password</Ui>.</li>
      </Steps>
      <Note>Forgot your password? Ask the Project Manager or a Superadmin to reset it. You'll get a new temporary password to change on sign-in.</Note>

      <h3>Finding your way around</h3>
      <ul>
        <li><b>Left menu:</b> grouped into <i>Process blueprint</i> (S-0 to S-8), <i>Project</i> (the toolkit), <i>Administration</i> and <i>Help</i>. You only see the areas your role can open.</li>
        <li><b>Collapse:</b> at the bottom of the menu, shrinks it to icons for more screen space, which is useful for the Gantt chart. On a phone, the menu opens from the ☰ button at the top.</li>
        <li><b>Theme:</b> <Ui>Auto · Calm · Contrast · Dark</Ui> at the bottom of the menu. <i>Contrast</i> is the easiest to read in bright site offices or on a projector. Your choice is remembered on that device.</li>
        <li><b>Search and filters:</b> most lists have a search box and filters at the top.</li>
      </ul>

      <h3>Things everyone can do</h3>
      <ul>
        <li><b>Read</b> the blueprint, re-engineering, SOW review, documents and toolkit. Viewers can't see documents marked confidential.</li>
        <li><b>Comment</b> using the <Ui>Discussion</Ui> threads on processes, diagrams, open items, re-engineering opportunities, SOW gaps, observations and documents. Use comments for questions; they're kept with the record.</li>
        <li><b>Export:</b> <Ui>Export Excel</Ui> on the world map gives the whole blueprint in one workbook, and <Ui>Export BPMN (.zip)</Ui> downloads every swimlane diagram.</li>
        <li><b>See what changed</b> in <Go to="/activity">Activity</Go>, if your role includes it.</li>
      </ul>

      <h3>Key ideas</h3>
      <dl className="kv">
        <dt>World map (S-0)</dt><dd>Every PHI process in value-chain order. The bar under each shows how many of its hand-off steps are validated.</dd>
        <dt>COPIS (S-1)</dt><dd>Customers → Outputs → Process → Inputs → Suppliers. Read from the customer backwards: "begin with the end in mind". Each process starts with <b>customer requirements</b>: what the customer needs, a measure and a target, marked Draft until the customer agrees it, then Validated.</dd>
        <dt>Hand-off step</dt><dd>A point where work or data passes between people or systems. It has a trigger, data fields, system hand-off and exceptions. Process owners validate each one as <i>Approved</i>, <i>Approved with changes</i> or <i>Needs rework</i>. The last two need a comment.</dd>
        <dt>Swimlanes (S-2)</dt><dd>BPMN 2.0 diagrams of the end-to-end flows. Every save is a new version.</dd>
        <dt>Domain</dt><dd>An area of the business: SR Sales & Reservation, BC Billing & Collection, AF Accounting & Finance, IP Inventory & Project Management, IT IT & Data. Domain owners can change the processes, steps and toolkit records of their own domain.</dd>
        <dt>Project-wide record</dt><dd>A toolkit record with no domain. Only the Project Manager edits it, but domain owners can update its status.</dd>
        <dt>Update status</dt><dd>Changing just a record's status, e.g. Not Started → In Progress, without full edit rights. Use the coloured status pill.</dd>
        <dt>Audit log</dt><dd>A permanent, tamper-evident record of every change, download and sign-in.</dd>
      </dl>

      <h3>Getting help</h3>
      <p>Open the tab for your role above for step-by-step tasks. The <b>FAQ</b> tab covers common problems. For access changes, contact the Project Manager; for new accounts, contact a Superadmin.</p>
    </>
  );
}

function Superadmin() {
  return (
    <>
      <p className="lede">Superadmins have full access to everything. They are the only people who can add or delete user accounts, and the only ones who can manage other Superadmin accounts. There must always be at least one active Superadmin.</p>
      <CanTable rows={[
        ['Users', 'Add and delete users. Edit anyone, including other Superadmins. Reset any password. Grant or remove Superadmin.'],
        ['Everything else', 'Everything the Project Manager can do (see that tab).'],
        ['Server tools', 'Account recovery and storage commands on the server (see below).'],
      ]} />

      <Task title="Add a new team member">
        <Steps>
          <li>Go to <Go to="/users">Users</Go> → <Ui>Add user</Ui>.</li>
          <li>Enter their name, work email and a temporary password of at least 10 characters.</li>
          <li>Choose a <b>role</b>:
            <ul>
              <li><i>Process Owner</i> for team members who own an area.</li>
              <li><i>Executive</i> for sponsors and the SteerCo; they can view everything and change nothing.</li>
              <li><i>Viewer</i> for read-only staff.</li>
              <li><i>Project Manager</i> for the PMO.</li>
            </ul>
          </li>
          <li>Tick their <b>domains</b>, e.g. SR for a sales lead. This decides which processes, steps and toolkit records they can change.</li>
          <li>Optionally assign specific <b>processes</b> outside their domain.</li>
          <li>Send them the link and temporary password privately. They must change it on first sign-in.</li>
        </Steps>
      </Task>

      <Task title="When someone leaves or changes role">
        <Steps>
          <li>Changed role or area: <Ui>Edit</Ui> the user and update their role and domains. The change takes effect on their next page load.</li>
          <li>Leaving: <Ui>Edit</Ui> → untick <Ui>Account active</Ui>. This is reversible and keeps their name on everything they did.</li>
          <li>Only <Ui>Delete</Ui> an account created by mistake. Their past work stays, the audit log keeps their name and email, and their name disappears from records they edited. Deleting can't be undone.</li>
        </Steps>
      </Task>

      <Task title="Reset a password">
        <p><Go to="/users">Users</Go> → <Ui>Reset password</Ui> → enter a temporary password. They'll be asked to change it at the next sign-in. Only a Superadmin can reset another Superadmin's password.</p>
      </Task>

      <Task title="Grant or remove Superadmin">
        <p>Edit the user and choose the <i>Superadmin</i> role. Keep it to two or three people. The app refuses to remove or deactivate the last active Superadmin.</p>
      </Task>

      <Task title="Server recovery (IT)">
        <ul>
          <li><code>npm run create-admin -- email "Name" 'TempPass12345'</code> creates or recovers a Superadmin account if everyone is locked out.</li>
          <li><code>npm run set-role -- email superadmin</code> sets anyone's role from the server.</li>
          <li><code>npm run sharepoint:check</code> tests the SharePoint connection. <code>npm run docs:to-sharepoint</code> moves files that are still in the database into SharePoint.</li>
          <li><code>./scripts/backup-db.sh</code> takes a database backup. <code>./scripts/deploy.sh</code> deploys an update.</li>
        </ul>
      </Task>
      <Tip>Review the <Go to="/audit">Audit log</Go> monthly for failed sign-ins, access-denied events and downloads of confidential documents.</Tip>
    </>
  );
}

function ProjectManager() {
  return (
    <>
      <p className="lede">The Project Manager runs the project in the app. You see and change everything, except adding or deleting user accounts and changing Superadmin accounts; those are for Superadmins.</p>
      <CanTable rows={[
        ['World map & COPIS', 'Add processes to the world map, move them between stages, set each process\'s domain, remove processes added in the app. Edit any COPIS and customer requirements.'],
        ['Hand-off steps', 'Add, edit, validate and delete steps for any process; map them to diagrams, re-engineering and SOW items.'],
        ['Diagrams & master data', 'Edit swimlanes (new versions), restore old versions; maintain master data and Lot touchpoints.'],
        ['Re-engineering & SOW', 'Record PHI decisions and KPI baselines; edit opportunity content; track AWB responses, estimates and status on gaps, Appendix A/B and observations.'],
        ['Documents', 'Upload, version, rename, mark confidential, delete; sync with SharePoint and move older files into SharePoint.'],
        ['Project toolkit', 'Everything in every register and the schedule; key dates; Configure toolkit (registers, columns, pick-lists, phases, domains, guide).'],
        ['Administration', 'Edit users who aren\'t Superadmins (role, domains, processes, password reset); create and edit custom roles; read the audit log.'],
      ]} />

      <Task title="Set up the blueprint for the team">
        <Steps>
          <li>Open each process from the <Go to="/">World map</Go> and check its <b>domain</b> under <Ui>Edit placement & mapping</Ui>. The domain decides which owners can edit it.</li>
          <li>Ask a Superadmin to create accounts. Then give each owner their domains, plus any extra processes, in <Go to="/users">Users</Go>.</li>
          <li>Need a process that isn't on the map? On the World map, click <Ui>Add process</Ui>:
            <ul>
              <li>Enter the ID, name and stage.</li>
              <li>Set the domain and colour group.</li>
              <li>Fill in customers and outputs first.</li>
              <li>Pick the diagrams, re-engineering opportunities and SOW items it relates to.</li>
            </ul>
            It gets a "Not assessed" row in the SOW gap analysis automatically.</li>
        </Steps>
      </Task>

      <Task title="Run the validation cycle">
        <Steps>
          <li>Ask each owner to review their processes: customer requirements first, then COPIS, then each hand-off step.</li>
          <li>Watch progress on the <Go to="/">World map</Go> (bars under each process) and in the <Go to="/matrix">Data matrix</Go>. Filter it by validation status, e.g. "Needs rework".</li>
          <li>Resolve rework items with the owner in the step's comments, then re-validate.</li>
        </Steps>
      </Task>

      <Task title="Keep the schedule current">
        <Steps>
          <li><Go to="/toolkit/key-dates">Key dates</Go>: move an anchor, e.g. BRD start or Go-Live, and every task tied to it moves.</li>
          <li><Go to="/toolkit/schedule">Master schedule</Go>: use <Ui>Gantt</Ui> or <Ui>Table</Ui>. Change status with the coloured pill, or click a bar to edit it. <Ui>Add item</Ui> adds tasks and milestones.</li>
          <li>The red line on the Gantt is today; dashed lines are anchors.</li>
        </Steps>
      </Task>

      <Task title="Weekly PMO routine">
        <Steps>
          <li>RAID log: review new items, owners and due dates. Close items only with evidence.</li>
          <li>Change requests: record CCB decisions.</li>
          <li><Go to="/sow">SOW & vendor</Go>: update AWB responses, estimates and status on gaps, Appendix A/B and observations.</li>
          <li><Go to="/reengineering">Re-engineering</Go>: record PHI decisions and KPI baselines.</li>
          <li>Write the week's status report in the toolkit, and export Excel for the SteerCo pack if needed.</li>
        </Steps>
      </Task>

      <Task title="Change the toolkit itself">
        <p>Go to <Go to="/toolkit/configure">Configure toolkit</Go>. It has four tabs:</p>
        <ul>
          <li><b>Registers:</b> rename them, change the menu group, description and how-to notes. Add, reorder or remove columns, and change pick-list options. Mark <b>status</b> columns, the ones domain owners can update quickly. Create new registers or archive old ones.</li>
          <li><b>Schedule phases:</b> names, colours and order.</li>
          <li><b>Domains:</b> add or rename them.</li>
          <li><b>Guide page:</b> rules, confirmations, folders and naming convention.</li>
        </ul>
        <Note>Removing a column hides it; existing values are kept and can be restored. A phase or domain that is still in use can't be removed.</Note>
      </Task>

      <Task title="Roles and permissions">
        <p>In <Go to="/roles">Roles</Go>, built-in roles are locked. Custom roles, e.g. a "Finance reviewer", are made by copying an existing role and adjusting the matrix:</p>
        <ul>
          <li><b>View</b> means the user can see it.</li>
          <li><b>Own</b> means in their domains or assigned processes.</li>
          <li><b>All</b> means everywhere.</li>
          <li><b>Update status</b> with <i>Own</i> covers their domains plus project-wide records.</li>
        </ul>
        <p>Adding and deleting users, and adding processes to the world map, can't be given to custom roles.</p>
      </Task>

      <Task title="Documents and SharePoint">
        <p>On <Go to="/documents">Documents</Go>, the bar at the top shows where files are stored.</p>
        <ul>
          <li>With SharePoint on, uploads go straight to SharePoint.</li>
          <li><Ui>Sync with SharePoint</Ui> brings in files added or edited directly there. This also runs automatically.</li>
          <li><Ui>Move files to SharePoint</Ui> moves older files that are still stored in the app.</li>
          <li>Deleting a document moves the SharePoint file to SharePoint's recycle bin.</li>
        </ul>
      </Task>
    </>
  );
}

function Executive() {
  return (
    <>
      <p className="lede">Executives (sponsors and the Steering Committee) can see everything, including confidential documents and the audit log, but can't change anything. You can comment.</p>
      <CanTable rows={[
        ['Everything', 'View all areas, export to Excel and BPMN, download documents.'],
        ['Discussion', 'Comment on processes, diagrams, opportunities, SOW items and documents.'],
        ['Audit log', 'Read the complete, tamper-evident change history.'],
        ['Changes', 'None — ask the Project Manager.'],
      ]} />

      <Task title="Your 10-minute weekly review">
        <Steps>
          <li><Go to="/">World map</Go>: the top tiles show validation progress, re-engineering decisions, SOW coverage, open high-priority gaps and unresolved commercial observations.</li>
          <li><Go to="/toolkit">Project toolkit → Guide & status</Go>: overall progress and open items. Then the <Go to="/toolkit/schedule">Master schedule</Go>: what's late (amber or red status) and what's next.</li>
          <li>RAID log: the top risks and issues. Raising a real issue early is never blamed.</li>
          <li><Go to="/reengineering">Re-engineering</Go>: decisions awaiting management (filter by "Not decided").</li>
          <li><Go to="/sow">SOW & vendor</Go> → Overview: vendor coverage, appendix items AWB hasn't answered, and commercial observations.</li>
        </Steps>
      </Task>
      <Task title="Prepare for a SteerCo">
        <p>Use <Ui>Export Excel</Ui> on the World map for the full workbook. On any document, <Ui>Open</Ui> shows PDFs in the browser, and <Ui>Download</Ui> gets the file.</p>
      </Task>
      <Tip>Leave your decisions or questions as comments on the record itself. The project team sees them in context, and they're kept in the history.</Tip>
    </>
  );
}

function ProcessOwner() {
  return (
    <>
      <p className="lede">Process Owners are the project team members who own an area of the business (your <b>domains</b>, shown under your name at the bottom of the menu). You can read everything and change what belongs to your domain.</p>
      <CanTable rows={[
        ['COPIS', 'Edit the COPIS and customer requirements of processes in your domain (and any processes assigned to you).'],
        ['Hand-off steps', 'Add steps to your processes, edit them, map them to diagrams / re-engineering / SOW items, and validate them.'],
        ['Swimlanes', 'Edit diagrams and save new versions.'],
        ['Toolkit', 'Add and edit records tagged with your domain; update the status of your records and of project-wide records.'],
        ['Re-engineering & SOW', 'Record PHI decisions, owners and KPI baselines; record AWB responses on gaps, Appendix A/B and observations.'],
        ['Documents & open items', 'Upload documents and new versions; add and update open items.'],
        ['Not available', 'Adding processes to the world map, changing a process\'s domain, editing other domains\' records, users, roles, key dates, toolkit configuration — ask the Project Manager.'],
      ]} />

      <Task title="Validate your processes (start here)">
        <Steps>
          <li>Open <Go to="/processes">COPIS</Go>. Your domain's processes have a domain tag; open one.</li>
          <li><b>Customer requirements first</b>: for each customer, write what they need, how it's measured and the target. Agree it with the customer, then mark it <i>Validated</i>.</li>
          <li><Ui>Edit COPIS</Ui>: check customers, outputs, process steps, inputs and suppliers, one item per line.</li>
          <li>Hand-off steps: read each one and choose <i>Approved</i>, <i>Approved with changes</i> or <i>Needs rework</i>, then <Ui>Save validation</Ui>. Explain what must change in the comment.</li>
          <li>Missing a step? <Ui>Add hand-off step</Ui>. Fill in trigger, data fields, system hand-off and exceptions, and tick the swimlane, re-engineering opportunity and SOW items it relates to.</li>
          <li>Check <Ui>Edit placement & mapping</Ui>: is the process linked to the right diagrams, opportunities and SOW items?</li>
        </Steps>
      </Task>

      <Task title="Keep your toolkit items current">
        <Steps>
          <li>Open a register in the <Go to="/toolkit">Project toolkit</Go>, e.g. RAID log or UAT scripts. Use the domain filter to see your own records.</li>
          <li>Change status with the <b>coloured status pill</b> in the list. You can do this on your domain's records and on project-wide ones.</li>
          <li><Ui>Add</Ui> new records for your domain. Tag them with your domain so you can edit them later.</li>
          <li>In the <Go to="/toolkit/schedule">Master schedule</Go>, update the status of your tasks from the pill next to each one.</li>
        </Steps>
        <Note>A lock note at the top of each register tells you exactly what you can change there.</Note>
      </Task>

      <Task title="Edit a swimlane diagram">
        <Steps>
          <li><Go to="/diagrams">Swimlanes</Go> → open a diagram → <Ui>Edit diagram</Ui>.</li>
          <li>Use the palette on the left to add tasks, events and gateways. Drag from an element's context pad to connect it.</li>
          <li>Type a short note on what changed, then <Ui>Save new version</Ui>. Older versions stay in <i>Version history</i>.</li>
        </Steps>
      </Task>

      <Task title="Re-engineering and SOW follow-up">
        <ul>
          <li><Go to="/reengineering">Re-engineering</Go>: open an opportunity in your area. Under <i>PHI decision</i> → <Ui>Update</Ui>, record the decision, owner and target date. Under <i>KPI tracking</i> → <Ui>Update</Ui>, record today's baseline.</li>
          <li><Go to="/sow?tab=gaps">SOW gap analysis</Go>: record PHI's position and AWB's answer for gaps in your processes.</li>
        </ul>
      </Task>

      <Task title="Share a document">
        <p><Go to="/documents">Documents</Go> → <Ui>Upload document</Ui>. Pick a category and add a description. Tick <i>Confidential</i> for vendor commercials or anything sensitive. To update a file, use <Ui>New version</Ui> on the same document rather than uploading a new one, so the history stays together.</p>
      </Task>
      <Tip>Can't change something you think you should? Check the record's domain tag. If it's another domain or project-wide, comment on it or ask the Project Manager.</Tip>
    </>
  );
}

function Viewer() {
  return (
    <>
      <p className="lede">Viewers can read the blueprint, re-engineering, SOW review, documents and toolkit, and add comments. Confidential documents, users, roles and the audit log are not visible.</p>
      <CanTable rows={[
        ['Read', 'Everything except confidential documents, users, roles and the audit log.'],
        ['Comment', 'On processes, diagrams, opportunities, SOW items, open items and documents.'],
        ['Export', 'Excel workbook and BPMN diagrams; download non-confidential documents.'],
      ]} />
      <Task title="Getting oriented">
        <Steps>
          <li>Start at the <Go to="/">World map</Go> and click any process to see who it serves (COPIS), its hand-off steps and its diagrams.</li>
          <li>Use <Go to="/matrix">Data matrix</Go> to search all hand-off steps, e.g. "Pag-IBIG" or "receipt".</li>
          <li>The <Go to="/toolkit">Project toolkit</Go> shows the schedule and the project's registers.</li>
        </Steps>
      </Task>
      <Tip>Spotted something wrong or missing? Leave a comment on the record. The owner sees it there.</Tip>
    </>
  );
}

function Faq() {
  const qa = [
    ['I can see a record but the Edit button is missing.', 'It belongs to another domain, or it is project-wide, or your role is read-only for that area. The lock note at the top of each register says what you can change. You may still be able to change its status with the status pill.'],
    ['Why must I comment when I choose "Approved with changes" or "Needs rework"?', 'So the owner knows exactly what to change. Approval alone needs no comment.'],
    ['The status pill doesn\'t change or shows an error.', 'Your role can update status only for your domains and project-wide records. Sign-offs and CCB decisions need full edit rights.'],
    ['I changed a key date and many tasks moved.', 'That is intended: tasks are anchored to key dates. Move the anchor back to undo.'],
    ['A document says it is no longer in SharePoint.', 'Someone moved or deleted it in SharePoint. Ask the Project Manager to run "Sync with SharePoint", or upload it again.'],
    ['I edited a file in SharePoint — why isn\'t it in the app yet?', 'Edits come in at the next sync (automatic every few minutes, or "Sync with SharePoint" on Documents). They appear as a new version named "Edited in SharePoint by …".'],
    ['Can I undo a change?', 'Most things keep history: diagrams have versions you can restore, documents keep every version, and the audit log shows the before and after of every change so the Project Manager can put it back.'],
    ['I added a process but can\'t find its SOW coverage.', 'New processes start as "Not assessed" in SOW & vendor → Gap analysis. Update the rating there once assessed.'],
    ['The page looks too faint or too bright.', 'Switch the theme at the bottom of the menu — Contrast is the most legible, Dark for low light.'],
    ['Who do I ask for access?', 'Role, domain or process changes: the Project Manager. A new account or a locked account: a Superadmin.'],
  ];
  const terms = [
    ['AWB', 'Achieve Without Borders Inc., the Odoo implementation partner (SOW S343096).'],
    ['BRD', 'Business Requirements Document, agreed with AWB before build.'],
    ['COPIS', 'Customers, Outputs, Process, Inputs, Suppliers — the customer-first process summary.'],
    ['CTS', 'Contract to Sell.'],
    ['DOA', 'Delegation of Authority — who may approve what, up to which amount.'],
    ['Fit', 'How well Odoo 19 covers a need: Standard, Configure or Extend (custom).'],
    ['Hypercare', 'The 90-day support period after go-live.'],
    ['RAID', 'Risks, Assumptions, Issues and Dependencies.'],
    ['TORC', 'Taxes and other related charges.'],
    ['UAT / SIT', 'User Acceptance Testing / System Integration Testing.'],
  ];
  return (
    <>
      <h3>Frequently asked questions</h3>
      {qa.map(([q, a]) => <details key={q} className="g-faq"><summary>{q}</summary><p>{a}</p></details>)}
      <h3>Glossary</h3>
      <dl className="kv">{terms.map(([t, d]) => <Fragment key={t}><dt>{t}</dt><dd>{d}</dd></Fragment>)}</dl>
    </>
  );
}

// Live summary of what the signed-in account can do, built from its actual permissions.
function YourAccess() {
  const { user } = useAuth();
  const { data } = useApi('/auth/modules');
  const rows = useMemo(() => {
    if (!data) return [];
    const word = { add: 'add', edit: 'edit', status: 'update status', delete: 'delete' };
    return data.flatMap((g) => g.modules.map((m) => {
      const p = user.permissions[m.key] || {};
      if (p.view !== 'all') return null;
      const acts = Object.entries(word).filter(([a]) => p[a] && p[a] !== 'none')
        .map(([a, w]) => (p[a] === 'own' ? `${w} (own)` : w));
      return { group: g.label, label: m.label.replace(/\s*\(.*\)$/, ''), acts };
    })).filter(Boolean);
  }, [data, user]);
  if (!data) return null;
  return (
    <details className="g-access">
      <summary>What <b>your account</b> can do — {user.role_name}{user.domains?.length ? ` · domains ${user.domains.join(', ')}` : ''}</summary>
      <p className="small muted">“Own” means records in your domain(s){user.process_ids?.length ? ` and your processes (${user.process_ids.join(', ')})` : ''}; for status updates it also includes project-wide records.</p>
      <div className="tablewrap"><table className="t">
        <thead><tr><th>Area</th><th>You can</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}<div className="small muted">{r.group}</div></td>
          <td>{r.acts.length ? <>view, {r.acts.join(', ')}</> : <span className="muted">view only</span>}</td></tr>)}</tbody>
      </table></div>
    </details>
  );
}

const TABS = [
  ['everyone', 'Everyone: start here', Everyone],
  ['superadmin', 'Superadmin', Superadmin],
  ['project_manager', 'Project Manager', ProjectManager],
  ['executive', 'Executive', Executive],
  ['process_owner', 'Process Owner (domain owner)', ProcessOwner],
  ['viewer', 'Viewer', Viewer],
  ['faq', 'FAQ & glossary', Faq],
];

export default function UserGuide() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const mine = { superadmin: 'superadmin', project_manager: 'project_manager', executive: 'executive' }[user.role_key]
    || (/viewer/i.test(user.role_name) ? 'viewer' : /owner/i.test(user.role_name) ? 'process_owner' : null);
  const tab = params.get('tab') || 'everyone';
  const [, , Section] = TABS.find(([k]) => k === tab) || TABS[0];
  return (
    <section className="sheet guide">
      <SheetHead code="Help" title="User guide"
        actions={<button className="btn" onClick={() => window.print()}><Printer size={15} /> Print this section</button>}>
        How to use the PHI Process Blueprint, with a section for each type of user. Your role is <b>{user.role_name}</b>{mine && mine !== tab ? <> — <a href={`?tab=${mine}`} onClick={(e) => { e.preventDefault(); setParams({ tab: mine }); }}>open your section</a></> : null}.
      </SheetHead>
      <YourAccess />
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k })}>
            {label}{k === mine ? ' ★' : ''}
          </button>
        ))}
      </div>
      <div className="guide-body"><Section /></div>
    </section>
  );
}
