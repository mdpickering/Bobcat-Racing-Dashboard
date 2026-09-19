// Phase 6.8 preparation: classify EVERY row of results/dev_06_data_inventory.json as DELETE / KEEP / HOLD for owner approval.
// Pure local analysis of the saved JSON: no database, no network, deletes nothing.
//   node classify_dev_cleanup.mjs [REAL_EMAIL]      (REAL_EMAIL is auto-detected: the only non-@bobcat-test.dev profile)   writes results/dev_cleanup_classification.{json,md}  (git-ignored: contains e-mails/titles)
//
// RULES (owner instruction: anything associated with the real account is HOLD unless deletion is explicitly approved):
//  KEEP  = the real account itself (auth user + profile).
//  HOLD  = (a) DIRECT: the row names the real account in any actor field;
//          (b) PROBABLE: no actor field exists on that table, but the row was created/updated inside the real account's activity
//              window (the minutes around its known actions), so it cannot be proven to be test-only;
//          (c) DEPENDENCY: a test-created row that cannot be deleted without destroying/altering a HOLD row (FK RESTRICT/CASCADE).
//  DELETE = everything else that is test data (actors are all @bobcat-test.dev accounts, or scripted test artifacts by name + batch time).
//  DELETE* = same, but the inventory did not list that child table row-by-row (actor fields missing) - confirm with script 07 before approval.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
const d = JSON.parse(fs.readFileSync(path.join(dir, 'dev_06_data_inventory.json'), 'utf8'));
// the real account = the single profile that is NOT a @bobcat-test.dev test account (or pass its e-mail explicitly)
const nonTest = d.profiles.map((p) => p.email).filter((e) => !/@bobcat-test\.dev$/i.test(e || ''));
const REAL = process.argv[2] || (nonTest.length === 1 ? nonTest[0] : null);
if (!REAL) { console.error(`cannot auto-detect the real account (non-test profiles: ${nonTest.length}); pass its e-mail as the first argument`); process.exit(1); }
const idEmail = Object.fromEntries(d.profiles.map((p) => [p.id, p.email]));
const realId = d.profiles.find((p) => p.email === REAL)?.id;
const isTest = (e) => /@bobcat-test\.dev$/i.test(e || '');
const t = (s) => (s ? String(s).slice(0, 19).replace('T', ' ') : '-');

// the real account's demonstrated activity window (its 4 attributed actions span 04:03:26-04:09:58 UTC on 2026-09-18)
const realTimes = [];
const noteReal = (ts) => ts && realTimes.push(Date.parse(ts));
d.task_comments.filter((c) => c.author === REAL).forEach((c) => noteReal(c.created_at));
d.purchase_requests.filter((p) => p.requested_by === REAL).forEach((p) => noteReal(p.created_at));
d.timeline_milestones.filter((m) => idEmail[m.updated_by] === REAL).forEach((m) => noteReal(m.updated_at));
const WIN_LO = Math.min(...realTimes) - 8 * 60e3, WIN_HI = Math.max(...realTimes) + 6 * 60e3;
const inWindow = (r) => ['created_at', 'updated_at'].some((f) => r[f] && Date.parse(r[f]) >= WIN_LO && Date.parse(r[f]) <= WIN_HI);

const out = [];   // {table,key,summary,decision,reason}
const add = (table, key, summary, decision, reason) => out.push({ table, key, summary, decision, reason });

// ---- HOLD sets computed first (direct + probable), then dependencies
const holdKeys = new Set();          // "table:key"
const hk = (table, key) => `${table}:${key}`;
const directReal = [];
d.task_comments.filter((c) => c.author === REAL).forEach((c) => { holdKeys.add(hk('task_comments', c.id)); directReal.push(['task_comments', c.id]); });
d.purchase_requests.filter((p) => p.requested_by === REAL).forEach((p) => { holdKeys.add(hk('purchase_requests', p.id)); directReal.push(['purchase_requests', p.id]); });
d.timeline_milestones.filter((m) => idEmail[m.updated_by] === REAL).forEach((m) => { const k = `${m.subsystem_id}/${m.timeline_column_key}`; holdKeys.add(hk('timeline_milestones', k)); directReal.push(['timeline_milestones', k]); });
const probable = [];
// tables with NO actor column: probable if inside the real account's window
d.recurring_events.filter(inWindow).forEach((r) => { holdKeys.add(hk('recurring_events', r.id)); probable.push(['recurring_events', r.id]); });
d.timeline_columns.filter(inWindow).forEach((c) => { holdKeys.add(hk('timeline_columns', c.key)); probable.push(['timeline_columns', c.key]); });
d.subsystem_categories.filter(inWindow).forEach((c) => { holdKeys.add(hk('subsystem_categories', c.id)); probable.push(['subsystem_categories', c.id]); });
d.milestones.filter(inWindow).forEach((m) => { holdKeys.add(hk('milestones', m.id)); probable.push(['milestones', m.id]); });
d.competition_settings.filter(inWindow).forEach((c) => { holdKeys.add(hk('competition_settings', c.season)); probable.push(['competition_settings', c.season]); });
d.subsystems.filter(inWindow).forEach((s) => { holdKeys.add(hk('subsystems', s.id)); probable.push(['subsystems', s.id]); });

// ---- dependency closure (test rows that a HOLD row hangs on)
const depReason = new Map();         // "table:key" -> reason
const dep = (table, key, why) => { const k = hk(table, key); if (!holdKeys.has(k)) { holdKeys.add(k); depReason.set(k, why); } };
for (const c of d.task_comments.filter((c) => holdKeys.has(hk('task_comments', c.id)))) {
  const task = d.tasks.find((x) => x.id === c.task_id);
  dep('tasks', task.id, `parent of HOLD comment (deleting the task cascades and destroys the comment)`);
  dep('subsystems', task.subsystem_id, `referenced by HOLD-dependency task ${task.title ? '"' + task.title + '"' : task.id} (RESTRICT)`);
  d.task_assignees.filter((a) => a.task_id === task.id).forEach((a) => dep('task_assignees', `${a.task_id}/${a.user_email}`, 'assignee of a HOLD-dependency task (deleting it would alter the kept task)'));
}
for (const p of d.purchase_requests.filter((p) => holdKeys.has(hk('purchase_requests', p.id)))) dep('subsystems', p.subsystem_id, `referenced by HOLD purchase request (RESTRICT)`);
for (const m of d.timeline_milestones.filter((m) => holdKeys.has(hk('timeline_milestones', `${m.subsystem_id}/${m.timeline_column_key}`)))) {
  dep('subsystems', m.subsystem_id, 'parent of HOLD timeline cell (cascade would destroy it)');
  dep('timeline_columns', m.timeline_column_key, 'parent of HOLD timeline cell (cascade would destroy it)');
}
const isHold = (table, key) => holdKeys.has(hk(table, key));
const holdWhy = (table, key) => depReason.get(hk(table, key)) || (directReal.some(([a, b]) => a === table && b === key) ? 'DIRECT: names the real account' : 'PROBABLE: no actor column; created/updated inside the real account\'s session window');
const kind = (table, key) => (depReason.has(hk(table, key)) ? 'HOLD (dependency)' : directReal.some(([a, b]) => a === table && b === key) ? 'HOLD (direct)' : 'HOLD (probable)');

// ---- auth users / profiles
for (const u of d.auth_users) add('auth.users', u.email, `${u.display_name || ''} | created ${t(u.created_at)}`, u.email === REAL ? 'KEEP' : 'DELETE', u.email === REAL ? 'the owner\'s real account (admin, approved, active) — needed as the first live admin' : 'disposable Phase 6.x test account');
for (const p of d.profiles) add('profiles', p.email, `role ${p.role}`, p.email === REAL ? 'KEEP' : 'DELETE', p.email === REAL ? 'real account profile' : 'test profile (removed when its auth user is deleted)');

// ---- generic per-row decisions
const test = (table, key, summary, reason = 'created/owned only by @bobcat-test.dev accounts') => add(table, key, summary, 'DELETE', reason);
const hold = (table, key, summary) => add(table, key, summary, kind(table, key), holdWhy(table, key));

d.subsystems.forEach((s) => (isHold('subsystems', s.id) ? hold('subsystems', s.id, `${s.name}`) : test('subsystems', s.id, s.name, 'obviously test (name) and every row under it is test data')));
d.subsystem_members.forEach((m) => test('subsystem_members', `${m.subsystem_id}/${m.user_email}`, `${m.user_email} lead=${m.is_lead}`, isTest(m.user_email) ? 'membership of a test account (removing it does not touch any HOLD row)' : 'REAL'));
d.subsystem_categories.forEach((c) => (isHold('subsystem_categories', c.id) ? hold('subsystem_categories', c.id, `${c.subsystem_id} / ${c.name}`) : test('subsystem_categories', c.id, `${c.subsystem_id} / ${c.name}`, 'scripted/test category, no actor and not in the real session window')));
d.timeline_columns.forEach((c) => (isHold('timeline_columns', c.key) ? hold('timeline_columns', c.key, `${c.label} (sort ${c.sort_order})`) : test('timeline_columns', c.key, `${c.label} (sort ${c.sort_order})`, 'scripted/test column, not in the real session window')));
d.timeline_milestones.forEach((m) => { const k = `${m.subsystem_id}/${m.timeline_column_key}`; (isHold('timeline_milestones', k) ? hold('timeline_milestones', k, `"${m.milestone_text}" (updated_by ${idEmail[m.updated_by]})`) : test('timeline_milestones', k, `"${m.milestone_text}" (updated_by ${idEmail[m.updated_by]})`)); });
d.competition_settings.forEach((c) => (isHold('competition_settings', c.season) ? hold('competition_settings', c.season, c.competition_name) : test('competition_settings', c.season, `${c.competition_name}`, 'scripted test season (name + creation batch time), not in the real session window')));
d.recurring_events.forEach((r) => (isHold('recurring_events', r.id) ? hold('recurring_events', r.id, `${r.title} dow=${r.day_of_week} ${r.time_label}`) : test('recurring_events', r.id, `${r.title} dow=${r.day_of_week} ${r.time_label}`, 'scripted test event (batch time 2026-09-16 21:31)')));
d.milestones.forEach((m) => (isHold('milestones', m.id) ? hold('milestones', m.id, m.name) : test('milestones', m.id, `${m.name} (${m.date})`, 'scripted test milestone (batch time 2026-09-16 21:31)')));
d.calendar_events.forEach((e) => test('calendar_events', e.id, `${e.title} by ${e.created_by}`));
d.migration_exceptions.forEach((e) => test('migration_exceptions', e.id, `${e.entity_type}: ${e.raw_value} [${e.resolution_status}]`, `Phase 6.4 exception-panel test row; resolved_to=${idEmail[e.resolved_to_profile_id] || e.resolved_to_profile_id} resolved_by=${idEmail[e.resolved_by] || e.resolved_by || '-'}`));
d.member_applications.forEach((a) => test('member_applications', a.id, `${a.name} <${a.email}> ${a.status}`, 'test application (reviewed_by ' + (a.reviewed_by || '-') + ')'));
d.tasks.forEach((k) => (isHold('tasks', k.id) ? hold('tasks', k.id, `"${k.title}" by ${k.created_by} [${k.subsystem_id}]`) : test('tasks', k.id, `"${k.title}" by ${k.created_by} [${k.subsystem_id}]`)));
d.task_assignees.forEach((a) => { const key = `${a.task_id}/${a.user_email}`; (isHold('task_assignees', key) ? hold('task_assignees', key, `${a.user_email} (${a.role}) on task ${a.task_id.slice(0, 8)}`) : test('task_assignees', key, `${a.user_email} (${a.role}) on task ${a.task_id.slice(0, 8)}`)); });
d.task_requests.forEach((r) => test('task_requests', r.id, `"${r.title}" ${r.status} by ${r.requester}`));
d.task_comments.forEach((c) => (isHold('task_comments', c.id) ? hold('task_comments', c.id, `${c.author}, ${c.length} chars, ${t(c.created_at)}`) : test('task_comments', c.id, `${c.author}, ${c.length} chars`)));
d.task_attachments.forEach((a) => test('task_attachments', a.id, `${a.file_name} by ${a.uploaded_by} ${a.has_storage_object ? '(file exists)' : '(metadata-only stub, no file)'}`));
d.purchase_requests.forEach((p) => (isHold('purchase_requests', p.id) ? hold('purchase_requests', p.id, `"${p.title}" ${p.status} by ${p.requested_by} [${p.subsystem_id}]`) : test('purchase_requests', p.id, `"${p.title}" ${p.status} by ${p.requested_by}`)));
d.cad_reviews.forEach((c) => test('cad_reviews', c.id, `"${c.title}" ${c.status} rev${c.current_revision} by ${c.submitted_by}`));

// ---- child tables the inventory only counted (no per-row actor data)
const star = (table, n, what) => { for (let i = 0; i < n; i++) out.push({ table, key: `#${i + 1}`, summary: what, decision: 'DELETE*', reason: 'test child row; per-row actor fields were not in inventory 06 - confirm with script 07' }); };
const histHold = d.purchase_requests.filter((p) => isHold('purchase_requests', p.id)).reduce((n, p) => n + p.history_rows, 0);
for (let i = 0; i < histHold; i++) out.push({ table: 'purchase_status_history', key: `#hold${i + 1}`, summary: 'history row of the HOLD purchase request', decision: 'HOLD (dependency)', reason: 'child of a HOLD purchase request' });
star('purchase_status_history', d.row_counts.purchase_status_history - histHold, 'status-history row of a test purchase request');
star('purchase_request_items', d.row_counts.purchase_request_items, 'line item of a test purchase request');
star('cad_review_versions', d.row_counts.cad_review_versions, 'revision of a test CAD review');
star('cad_review_comments', d.row_counts.cad_review_comments, 'comment on a test CAD review');
star('comment_mentions', d.row_counts.comment_mentions, 'mention inside a test task comment');
// notifications: recipients are all test accounts (the real account has none)
for (const n of d.notifications) for (let i = 0; i < n.total; i++) out.push({ table: 'notifications', key: `${n.user_email}/${n.type}#${i + 1}`, summary: `${n.type} for ${n.user_email}${n.unread ? ' (' + n.unread + ' unread of ' + n.total + ')' : ''}`, decision: n.user_email === REAL ? 'HOLD (direct)' : 'DELETE', reason: n.user_email === REAL ? 'notification of the real account' : 'notification addressed to a test account' });
for (const o of d.storage_objects) add('storage.objects', o.name, `${o.bucket} ${o.size} bytes ${o.mimetype}`, 'DELETE', 'test upload (Dashboard/Storage only — SQL delete is blocked)');
add('storage.buckets', d.storage_buckets[0]?.id || 'task-attachments', 'bucket + 2 policies', 'KEEP', 'part of the verified schema/setup');

// ---- sanity: every counted row is classified
const perTable = {};
for (const r of out) { const e = (perTable[r.table] ||= {}); e[r.decision] = (e[r.decision] || 0) + 1; }
const counted = Object.entries(d.row_counts).filter(([k]) => k !== 'profiles').map(([k, v]) => [k, Number(v), Object.values(perTable[k] || {}).reduce((a, b) => a + b, 0)]);
const mismatch = counted.filter(([, a, b]) => a !== b);

// ---- accounts pinned by HOLD rows
const pinned = new Set();
for (const k of holdKeys) if (k.startsWith('tasks:')) { const tk = d.tasks.find((x) => x.id === k.slice(6)); pinned.add(tk.created_by); }
const holdRows = out.filter((r) => r.decision.startsWith('HOLD'));
// test accounts whose deletion would silently ALTER a kept row (assignee rows cascade; tasks.primary_owner_id is set NULL)
const alters = new Set();
for (const a of d.task_assignees) if (isHold('task_assignees', `${a.task_id}/${a.user_email}`) && !pinned.has(a.user_email)) alters.add(a.user_email);
for (const k of d.tasks) if (isHold('tasks', k.id) && k.primary_owner && !pinned.has(k.primary_owner)) alters.add(k.primary_owner);

fs.writeFileSync(path.join(dir, 'dev_cleanup_classification.json'), JSON.stringify({ real: REAL, window: [new Date(WIN_LO).toISOString(), new Date(WIN_HI).toISOString()], perTable, mismatch, pinnedTestAccounts: [...pinned], rows: out }, null, 1));

const order = ['auth.users', 'profiles', 'subsystems', 'subsystem_members', 'subsystem_categories', 'timeline_columns', 'timeline_milestones', 'competition_settings', 'recurring_events', 'milestones', 'calendar_events', 'migration_exceptions', 'member_applications', 'tasks', 'task_assignees', 'task_requests', 'task_comments', 'comment_mentions', 'task_attachments', 'purchase_requests', 'purchase_request_items', 'purchase_status_history', 'cad_reviews', 'cad_review_versions', 'cad_review_comments', 'notifications', 'storage.objects', 'storage.buckets'];
let md = `# bobcat-dev cleanup list — FOR OWNER APPROVAL (nothing has been deleted)\n\nReal account: ${REAL}. Inventory taken ${d.meta.inspected_at}. Real-account activity window used for "probable": ${new Date(WIN_LO).toISOString()} .. ${new Date(WIN_HI).toISOString()}.\n\n## Summary per table\n\n| table | rows | DELETE | DELETE* | HOLD | KEEP |\n|---|---|---|---|---|---|\n`;
for (const tb of order) { const e = perTable[tb] || {}; const hs = Object.entries(e).filter(([k]) => k.startsWith('HOLD')).reduce((a, [, v]) => a + v, 0); md += `| ${tb} | ${Object.values(e).reduce((a, b) => a + b, 0)} | ${e.DELETE || 0} | ${e['DELETE*'] || 0} | ${hs} | ${e.KEEP || 0} |\n`; }
md += `\n## HOLD rows (need your decision)\n\n| table | key | summary | type | why |\n|---|---|---|---|---|\n`;
for (const r of holdRows) md += `| ${r.table} | ${String(r.key).slice(0, 40)} | ${r.summary} | ${r.decision} | ${r.reason} |\n`;
md += `\n## Every row, by table\n`;
for (const tb of order) { md += `\n### ${tb}\n\n| decision | key | summary | reason |\n|---|---|---|---|\n`; for (const r of out.filter((x) => x.table === tb)) md += `| ${r.decision} | ${String(r.key).slice(0, 44)} | ${r.summary} | ${r.reason} |\n`; }
fs.writeFileSync(path.join(dir, 'dev_cleanup_classification.md'), md);

const totals = { DELETE: 0, 'DELETE*': 0, HOLD: 0, KEEP: 0 };
for (const r of out) totals[r.decision.startsWith('HOLD') ? 'HOLD' : r.decision]++;
console.log('classified rows:', out.length, JSON.stringify(totals));
console.log('coverage check (inventory row_counts vs classified, excluding profiles):', mismatch.length ? 'MISMATCH ' + JSON.stringify(mismatch) : 'every counted row is classified');
console.log('HOLD rows:', holdRows.length, '| test accounts pinned by HOLD rows (cannot be deleted while those rows remain):', [...pinned].join(', ') || 'none');
console.log('test accounts deletable but whose deletion would ALTER kept HOLD rows (owner cleared / assignee rows cascade):', [...alters].join(', ') || 'none');
console.log('real-account session window:', new Date(WIN_LO).toISOString(), '..', new Date(WIN_HI).toISOString());
console.log(JSON.stringify(perTable));
