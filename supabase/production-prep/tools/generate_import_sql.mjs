// Phase 6.8: GENERATE the bobcat-dev import SQL from a VALIDATED legacy source export. Executes nothing; never contacts a database.
//   node generate_import_sql.mjs [--export <file>] [--importer <uuid>] [--out <dir>] [--accept-drift] [--aliases '{"legacy":"target"}'] [--scratch]
// Inputs : results/prod_30_source_export.json (validated first; a BLOCK refuses generation, a DRIFT warning needs --accept-drift)
//          the importer id = the owner's existing profile (read from results/dev_06_data_inventory.json unless --importer is given)
// Outputs: <out>/40a_import_DRY_RUN.sql (ends in ROLLBACK), <out>/40b_import_EXECUTE.sql (ends in COMMIT), <out>/expected.json
//          default <out> = results/import/  (git-ignored: the SQL embeds the legacy data - titles, names)
// The EXPECTED results are computed here in JavaScript, independently of the SQL, and embedded; the SQL asserts equality - so the two implementations
// of the mapping must agree or the import aborts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const prep = path.resolve(here, '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const flag = (n) => process.argv.includes(n);
const exportPath = arg('--export') || path.join(prep, 'results', 'prod_30_source_export.json');
const outDir = path.resolve(arg('--out') || path.join(prep, 'results', 'import'));
const scratch = flag('--scratch');
const FUNCS = scratch ? 35 : 36;

// ---- 1) the export must validate first
let vout = '';
try { vout = execFileSync('node', [path.join(here, 'validate_source_export.mjs'), exportPath], { encoding: 'utf8' }); }
catch (e) { console.log(String(e.stdout || e.message)); console.error('REFUSING to generate: the source export is BLOCKED or missing.'); process.exit(1); }
const drifted = /RESULT: USABLE WITH/.test(vout);
if (drifted && !flag('--accept-drift')) { console.log(vout); console.error('REFUSING to generate: the export differs from the recorded baseline (legacy data changed). Review the warnings, then re-run with --accept-drift if that is intended.'); process.exit(1); }

let x = JSON.parse(fs.readFileSync(exportPath, 'utf8').replace(/^﻿/, ''));
if (typeof x === 'string') x = JSON.parse(x); if (Array.isArray(x)) x = x[0]; if (x.source_export) x = x.source_export;
const aliases = arg('--aliases') ? JSON.parse(arg('--aliases')) : {};
if (Object.keys(aliases).length) x.subsystem_aliases = aliases;      // explicit, owner-approved only - empty in the initial import
let importer = arg('--importer');
if (!importer) {
  const d6 = JSON.parse(fs.readFileSync(path.join(prep, 'results', 'dev_06_data_inventory.json'), 'utf8'));
  const owners = d6.profiles.filter((p) => !/@bobcat-test\.dev$/i.test(p.email || ''));
  if (owners.length !== 1) { console.error('cannot determine the importer (owner) profile'); process.exit(1); }
  importer = owners[0].id;
}
if (!/^[0-9a-f-]{36}$/i.test(importer)) { console.error('importer is not a uuid'); process.exit(1); }

const payload = JSON.stringify(x);                       // minified, single line -> stable md5 across paste
if (payload.includes('$legacy$') || payload.includes('$exp$')) { console.error('payload contains a SQL dollar-quote tag'); process.exit(1); }
if (/leadpin/i.test(payload)) { console.error('payload contains leadPin'); process.exit(1); }
const payloadMd5 = crypto.createHash('md5').update(payload, 'utf8').digest('hex');

// ---- 2) INDEPENDENT expectation (mirrors the mapping rules of PRODUCTION_PLAN.md section 9, NOT the SQL text)
const ws = x.workspace_state, tax = ws.taxonomy, subIds = new Set(tax.map((s) => s.id));
const eff = (s) => (subIds.has(s) ? s : aliases[s] && subIds.has(aliases[s]) ? aliases[s] : null);
const catSet = new Set(tax.flatMap((s) => (s.categories || []).map((c) => `${s.id}::${c.name}`)));
const nb = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const tryDate = (t) => { if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null; const d = new Date(t + 'T00:00:00Z'); return d.toISOString().slice(0, 10) === t ? t : null; };
const TS = ['To Do', 'In Progress', 'Blocked', 'Review', 'Complete'], TP = ['Critical', 'High', 'Medium', 'Low'];
const wsIds = new Set(ws.tasks.map((t) => t.id));
const srcTasks = [...ws.tasks.map((t) => ({ src: 'ws', id: t.id, title: t.title, sub: t.subsystemId, cat: t.category, prio: t.priority, stat: t.status, assignee: t.assignee, dl: t.deadline })),
  ...x.tasks.filter((t) => !wsIds.has(t.id)).map((t) => ({ src: 'rel', id: t.id, title: t.title, sub: t.subsystem_id, cat: t.category, prio: t.priority, stat: t.status, assignee: t.assignee, dl: t.deadline }))];
const inc = (o, k, n = 1) => { if (n) o[k] = (o[k] || 0) + n; };      // zero counts create no key (the SQL creates no rows either)
const ex = {}, logs = {};
let complete = 0, withDl = 0, withCat = 0, withAsg = 0, imported = 0;
const assignees = new Set();
for (const t of srcTasks) {
  const e = eff(t.sub); let hold = null;
  if (!nb(t.title)) hold = 'task_invalid_title'; else if (!e) hold = 'task_unmapped_subsystem'; else if (!TS.includes(t.stat)) hold = 'task_invalid_status'; else if (!TP.includes(t.prio)) hold = 'task_invalid_priority';
  inc(logs, `task:${hold ? 'exception' : 'migrated'}`);
  if (hold) { inc(ex, hold); continue; }
  imported++;
  if (t.stat === 'Complete') complete++;
  const d = tryDate(t.dl); if (d) withDl++; else if (nb(t.dl)) inc(ex, 'task_invalid_deadline');
  if (catSet.has(`${e}::${t.cat}`)) withCat++; else if (nb(t.cat)) inc(ex, 'task_invalid_category');
  if (nb(t.assignee)) { withAsg++; assignees.add(nb(t.assignee)); }
}
inc(ex, 'task_assignee', assignees.size);
inc(logs, 'task_relational_superseded:skipped', x.tasks.filter((t) => wsIds.has(t.id)).length);
// purchases
const PM = { draft: 'Draft', requested: 'Submitted', submitted: 'Submitted', 'under review': 'Under Review', approved: 'Approved', ordered: 'Ordered', shipped: 'In Transit', 'in transit': 'In Transit', 'arrived in shop': 'Arrived in Shop', arrived: 'Arrived in Shop', received: 'Arrived in Shop', delivered: 'Arrived in Shop', complete: 'Completed', completed: 'Completed', rejected: 'Rejected', denied: 'Rejected', cancelled: 'Cancelled', canceled: 'Cancelled' };
let pr = 0; const reqs = new Set();
for (const o of x.orders) {
  const e = eff(o.subsystem_id); let hold = null;
  if (!nb(o.item)) hold = 'purchase_request_invalid_title'; else if (!e) hold = 'purchase_request_unmapped_subsystem'; else if (!(o.qty > 0)) hold = 'purchase_request_invalid_quantity';
  inc(logs, `order:${hold ? 'exception' : 'migrated'}`);
  if (hold) { inc(ex, hold); continue; }
  pr++; if (!(String(o.status ?? '').trim().toLowerCase() in PM)) inc(ex, 'purchase_status'); if (nb(o.requested_by)) reqs.add(nb(o.requested_by));
}
inc(ex, 'purchase_requester', reqs.size);
// people (never PINs)
for (const s of tax) { if (nb(s.lead)) inc(ex, 'subsystem_lead'); for (const m of s.members || []) if (nb(m)) inc(ex, 'subsystem_member'); }
for (const s of x.subteams) { if (!eff(s.subsystem_id)) inc(ex, 'subteam_unmapped_subsystem'); if (nb(s.lead)) inc(ex, 'subsystem_lead'); for (const m of s.members || []) if (nb(m)) inc(ex, 'subsystem_member'); inc(logs, 'subteam:skipped'); }
// timeline
const colKeys = new Set(ws.timeline_columns.map((c) => c.key));
let cellsOk = 0;
for (const [sid, o] of Object.entries(ws.timeline_milestones || {})) for (const [col, v] of Object.entries(o && typeof o === 'object' ? o : {})) {
  const t = nb(typeof v === 'string' ? v : v == null ? null : JSON.stringify(v));
  const ok = !!t && subIds.has(sid) && colKeys.has(col);
  inc(logs, `timeline_cell:${ok ? 'migrated' : t ? 'exception' : 'skipped'}`); if (ok) cellsOk++; else if (t) inc(ex, 'timeline_cell_orphan');
}
let recOk = 0;
for (const r of ws.recurring_events) { const ok = !!nb(r.title) && /^[0-6]$/.test(String(r.dayOfWeek)); inc(logs, `recurring_event:${ok ? 'migrated' : 'exception'}`); if (ok) recOk++; else inc(ex, 'recurring_event_invalid'); }
inc(logs, 'workspace_state:migrated'); inc(logs, 'subsystem:migrated', tax.length);
const nCats = tax.reduce((n, s) => n + (s.categories || []).length, 0);
inc(logs, 'subsystem_category:migrated', nCats); inc(logs, 'timeline_column:migrated', ws.timeline_columns.length);
const hl = (v) => (typeof v === 'boolean' ? v : !['none', 'false', 'no', '0', 'off'].includes(String(nb(v) ?? 'none').toLowerCase()));
const expected = {
  subsystems: tax.length, categories: nCats, timeline_columns: ws.timeline_columns.length, timeline_columns_highlighted: ws.timeline_columns.filter((c) => hl(c.highlight)).length,
  timeline_milestones: cellsOk, recurring_events: recOk, tasks: imported, tasks_complete: complete, tasks_with_deadline: withDl, tasks_with_category: withCat, tasks_with_assignee_raw: withAsg,
  purchase_requests: pr, purchase_items: pr, purchase_history: pr, exceptions_by_type: ex, log_by_entity_status: logs,
};
const held = srcTasks.length - imported;

// ---- 3) fill the template. HARDENED (Phase 6.8 fix): the template is now parse-safe and self-blocking; the generator removes the template-only guard,
//         fills every placeholder with PLAIN string replacement (split/join: a "$&", "$'" or "$1" inside any value can never be read as a replacement pattern),
//         and then REFUSES to leave any file behind unless every static check passes (no marker of any kind, ROLLBACK/COMMIT endings, payload identity, ...).
import { checkTexts } from './import_sql_checks.mjs';
const tplPath = arg('--template') ? path.resolve(arg('--template')) : path.join(prep, 'import', '40_import_TEMPLATE_DO_NOT_RUN.sql');   // --template is for TESTING the refusal logic only
let tpl = fs.readFileSync(tplPath, 'utf8').replace(/\r\n/g, '\n');
tpl = tpl.replace(/-- @@TEMPLATE_GUARD_BEGIN[\s\S]*?-- @@TEMPLATE_GUARD_END\n/, () => '');
const fail = (m) => { for (const f of ['40a_import_DRY_RUN.sql', '40b_import_EXECUTE.sql', 'expected.json']) fs.rmSync(path.join(outDir, f), { force: true }); console.error('GENERATION FAILED (no files left behind): ' + m); process.exit(1); };
fs.mkdirSync(outDir, { recursive: true });
for (const f of ['40a_import_DRY_RUN.sql', '40b_import_EXECUTE.sql', 'expected.json']) fs.rmSync(path.join(outDir, f), { force: true });   // never leave a stale file from an earlier run
if (/TEMPLATE_GUARD|template_guard/.test(tpl)) fail('the template guard could not be removed');
const put = (s, key, val) => s.split(key).join(String(val));
const modeEndBlock = (mode) => mode === 'dry'
  ? `-- DRY RUN ends here: undo everything, then report.\nrollback;\nselect 'IMPORT DRY RUN PASSED - guards, ${imported} tasks + ${held} held, all post-checks succeeded; then everything was ROLLED BACK. Nothing was imported.' as result,\n       (select count(*) from public.tasks) as tasks_after_rollback, (select count(*) from public.subsystems) as subsystems_after_rollback;`
  : `-- EXECUTE: keep the import.\ncommit;\nselect 'IMPORT COMMITTED - ${imported} tasks imported, ${held} held as exceptions. Next: run 41_post_import_verify_readonly.sql.' as result,\n       (select count(*) from public.subsystems) as subsystems, (select count(*) from public.subsystem_categories) as categories, (select count(*) from public.tasks) as tasks,\n       (select count(*) from public.migration_exceptions) as exceptions, (select count(*) from public.notifications) as notifications;`;
const fill = (mode) => {
  const fname = mode === 'dry' ? '40a_import_DRY_RUN.sql' : '40b_import_EXECUTE.sql';
  let s = tpl;
  s = put(s, '__FILE__', fname);
  s = put(s, '__MODE_BANNER__', mode === 'dry' ? '*** DRY RUN: ends in ROLLBACK, imports nothing ***' : '*** WRITES DATA: ends in COMMIT ***');
  s = put(s, '__IMPORTER__', importer); s = put(s, '__PAYLOAD_MD5__', payloadMd5); s = put(s, '__FUNCS__', FUNCS);
  s = put(s, '__EXPECT__', JSON.stringify(expected));
  const re = /-- @@MODE_END@@[^\n]*/;
  if (!re.test(s)) fail('the template has no MODE_END marker line');
  s = s.replace(re, () => modeEndBlock(mode));
  s = `-- GENERATED ${fname} | ${mode === 'dry' ? 'DRY RUN (ends in ROLLBACK)' : 'EXECUTE (ends in COMMIT)'} | payload md5 ${payloadMd5} | expects ${imported} tasks + ${held} held | generated, runnable file (all placeholders resolved)\n`
    + s.replace(/\s+$/, '') + `\n-- END OF GENERATED SCRIPT ${fname} (if you can read this line, the whole file was pasted)\n`;
  const i = s.indexOf('__PAYLOAD__');                                            // the payload goes in LAST, by index, so nothing inside it is ever re-scanned
  if (i < 0 || s.indexOf('__PAYLOAD__', i + 1) >= 0) fail('the template must contain exactly one __PAYLOAD__ marker');
  return s.slice(0, i) + payload + s.slice(i + '__PAYLOAD__'.length);
};
const dryText = fill('dry'), execText = fill('exec');
const expectedObj = { importer, payload_md5: payloadMd5, payload_kb: +(payload.length / 1024).toFixed(1), aliases, expected, held_tasks: held };
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
expectedObj.files = { '40a_import_DRY_RUN.sql': { lines: dryText.split('\n').length, sha256: sha(dryText) }, '40b_import_EXECUTE.sql': { lines: execText.split('\n').length, sha256: sha(execText) } };

// ---- 4) static verification BEFORE anything is left on disk
let ownerForCheck = null;
try { const d6 = JSON.parse(fs.readFileSync(path.join(prep, 'results', 'dev_06_data_inventory.json'), 'utf8')); const o = d6.profiles.filter((p) => !/@bobcat-test\.dev$/i.test(p.email || '')); if (o.length === 1) ownerForCheck = o[0].id; } catch { /* optional */ }
const checks = checkTexts({ dry: dryText, exec: execText, expected: expectedObj, exportObj: x, ownerId: scratch ? null : ownerForCheck, baseline: null, payloadMd5Ref: null });
const bad = checks.filter((c) => !c.ok);
if (bad.length) fail(`${bad.length} static check(s) failed: ` + bad.map((c) => `${c.name} [${c.detail}]`).join(' | '));

// ---- 5) write (only now)
fs.writeFileSync(path.join(outDir, '40a_import_DRY_RUN.sql'), dryText);
fs.writeFileSync(path.join(outDir, '40b_import_EXECUTE.sql'), execText);
fs.writeFileSync(path.join(outDir, 'expected.json'), JSON.stringify(expectedObj, null, 1));

console.log(`generated${scratch ? ' (SCRATCH variant)' : ''} into ${outDir}`);
console.log(`static checks: ${checks.length}/${checks.length} passed (no template marker of any kind, 40a=ROLLBACK, 40b=COMMIT, payload identical to the validated export, no writes to profiles/auth)`);
console.log(`payload ${(payload.length / 1024).toFixed(1)} KB, md5 ${payloadMd5}${drifted ? '  [DRIFT ACCEPTED]' : ''} | importer ${importer} | aliases ${JSON.stringify(aliases)}`);
console.log(`expected: subsystems ${expected.subsystems}, categories ${expected.categories}, timeline columns ${expected.timeline_columns} (${expected.timeline_columns_highlighted} highlighted), cells ${expected.timeline_milestones}, recurring ${expected.recurring_events}`);
console.log(`          tasks imported ${imported} + held ${held} = ${srcTasks.length} (${wsIds.size} workspace_state + ${x.tasks.filter((t) => !wsIds.has(t.id)).length} relational-only; ${x.tasks.filter((t) => wsIds.has(t.id)).length} superseded) | purchases ${pr} | exceptions ${JSON.stringify(ex)}`);
