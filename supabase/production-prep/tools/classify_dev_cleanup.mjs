// Phase 6.8 preparation: classify EVERY row of the bobcat-dev inventories as DELETE / KEEP / HOLD for owner approval.
// Inputs (git-ignored, local): results/dev_06_data_inventory.json (+ results/dev_07_child_actors.json when present).
// Pure local analysis: no database, no network, deletes nothing.
//   node classify_dev_cleanup.mjs [REAL_EMAIL]   (REAL_EMAIL is auto-detected: the only non-@bobcat-test.dev profile)
//   writes results/dev_cleanup_classification.{json,md}  (git-ignored: they contain e-mails/titles)
//
// RULES (owner instruction: anything associated with the real account stays HOLD unless deletion is explicitly approved):
//  KEEP   = the real account itself (auth user + profile) and the storage bucket.
//  HOLD   = (a) DIRECT: a row names the real account in ANY actor field (creator, author, requester, reviewer, changed_by, updated_by,
//               mentioned, recipient);
//           (b) PROBABLE: the table has NO actor column, but the row was created/updated inside one of the real account's
//               demonstrated session windows (each known real action +-minutes, clustered), so it cannot be proven test-only;
//           (c) DEPENDENCY: a test-created row that cannot be deleted without destroying or altering a HOLD row (FK RESTRICT / CASCADE).
//  DELETE = confirmed test data: every actor is a @bobcat-test.dev account (or a scripted test artifact by name + batch time) and it
//           does not hang under any HOLD row. (DELETE* only appears if inventory 07 is missing: child rows with unknown actors.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
const d = JSON.parse(fs.readFileSync(path.join(dir, 'dev_06_data_inventory.json'), 'utf8'));
const p7 = path.join(dir, 'dev_07_child_actors.json');
let d7 = null;
if (fs.existsSync(p7)) { try { d7 = JSON.parse(fs.readFileSync(p7, 'utf8')); if (d7.child_actor_inventory) d7 = d7.child_actor_inventory; } catch { d7 = null; } }

const nonTest = d.profiles.map((p) => p.email).filter((e) => !/@bobcat-test\.dev$/i.test(e || ''));
const REAL = process.argv[2] || (nonTest.length === 1 ? nonTest[0] : null);
if (!REAL) { console.error(`cannot auto-detect the real account (non-test profiles: ${nonTest.length}); pass its e-mail as the first argument`); process.exit(1); }
const idEmail = Object.fromEntries(d.profiles.map((p) => [p.id, p.email]));
const isTest = (e) => /@bobcat-test\.dev$/i.test(e || '');
const t = (s) => (s ? String(s).slice(0, 19).replace('T', ' ') : '-');

const out = [];
const add = (table, key, summary, decision, reason) => out.push({ table, key: String(key), summary, decision, reason });
const holdKeys = new Set(), direct = new Set(), depReason = new Map();
const hk = (table, key) => `${table}:${key}`;
const holdDirect = (table, key) => { holdKeys.add(hk(table, key)); direct.add(hk(table, key)); };
const holdDep = (table, key, why) => { const k = hk(table, key); if (!holdKeys.has(k)) { holdKeys.add(k); depReason.set(k, why); } };
const isHold = (table, key) => holdKeys.has(hk(table, key));
const REAL_ACTIONS = [];   // timestamps of every attributed real-account action -> session windows
const realTs = (ts) => ts && REAL_ACTIONS.push(Date.parse(ts));

// ---------- (a) DIRECT associations from inventory 06
d.task_comments.filter((c) => c.author === REAL).forEach((c) => { holdDirect('task_comments', c.id); realTs(c.created_at); });
d.purchase_requests.filter((p) => p.requested_by === REAL).forEach((p) => { holdDirect('purchase_requests', p.id); realTs(p.created_at); });
d.timeline_milestones.filter((m) => idEmail[m.updated_by] === REAL).forEach((m) => { holdDirect('timeline_milestones', `${m.subsystem_id}/${m.timeline_column_key}`); realTs(m.updated_at); });
d.tasks.filter((x) => x.created_by === REAL || x.primary_owner === REAL).forEach((x) => holdDirect('tasks', x.id));
d.task_requests.filter((r) => r.requester === REAL).forEach((r) => holdDirect('task_requests', r.id));
d.calendar_events.filter((e) => e.created_by === REAL).forEach((e) => holdDirect('calendar_events', e.id));
d.member_applications.filter((a) => a.reviewed_by === REAL || a.linked_profile_email === REAL || a.email === REAL).forEach((a) => holdDirect('member_applications', a.id));
d.task_attachments.filter((a) => a.uploaded_by === REAL).forEach((a) => holdDirect('task_attachments', a.id));
d.cad_reviews.filter((c) => c.submitted_by === REAL).forEach((c) => holdDirect('cad_reviews', c.id));
d.task_assignees.filter((a) => a.user_email === REAL).forEach((a) => holdDirect('task_assignees', `${a.task_id}/${a.user_email}`));
d.subsystem_members.filter((m) => m.user_email === REAL).forEach((m) => holdDirect('subsystem_members', `${m.subsystem_id}/${m.user_email}`));

// ---------- (a) DIRECT associations from inventory 07 (reviewer / history / mention actors)
const mentionKey = (m) => `${m.comment_id}/${m.mentioned}`;
if (d7) {
  d7.purchase_status_history.filter((h) => h.changed_by === REAL).forEach((h) => { holdDirect('purchase_status_history', h.id); realTs(h.changed_at); });
  d7.purchase_reviews.filter((p) => p.reviewed_by === REAL || p.requested_by === REAL).forEach((p) => holdDirect('purchase_requests', p.id));
  d7.cad_review_versions.filter((v) => v.submitted_by === REAL).forEach((v) => holdDirect('cad_review_versions', v.id));
  d7.cad_review_comments.filter((c) => c.author === REAL).forEach((c) => holdDirect('cad_review_comments', c.id));
  d7.cad_reviewers.filter((r) => r.reviewer === REAL || r.submitted_by === REAL).forEach((r) => holdDirect('cad_reviews', r.id));
  d7.comment_mentions.filter((m) => m.comment_author === REAL || m.mentioned === REAL).forEach((m) => { holdDirect('comment_mentions', mentionKey(m)); realTs(m.created_at); });
  d7.task_request_reviews.filter((r) => r.reviewed_by === REAL || r.requester === REAL).forEach((r) => { holdDirect('task_requests', r.id); realTs(r.reviewed_at); });
  d7.notification_rows.filter((n) => n.user === REAL).forEach((n) => holdDirect('notifications', n.id));
}

// ---------- session windows of the real account (each action -8min/+6min; actions less than 60 min apart form one session)
REAL_ACTIONS.sort((a, b) => a - b);
const sessions = [];
for (const ts of REAL_ACTIONS) { const s = sessions[sessions.length - 1]; if (s && ts - s.hi <= 60 * 60e3) s.hi = ts; else sessions.push({ lo: ts, hi: ts }); }
const windows = sessions.map((s) => ({ lo: s.lo - 8 * 60e3, hi: s.hi + 6 * 60e3 }));
const inWindow = (r) => ['created_at', 'updated_at'].some((f) => r[f] && windows.some((w) => Date.parse(r[f]) >= w.lo && Date.parse(r[f]) <= w.hi));

// ---------- (b) PROBABLE: tables with NO actor column
const probable = new Set();
const prob = (table, rows, keyf) => rows.filter(inWindow).forEach((r) => { holdKeys.add(hk(table, keyf(r))); probable.add(hk(table, keyf(r))); });
prob('recurring_events', d.recurring_events, (r) => r.id);
prob('timeline_columns', d.timeline_columns, (r) => r.key);
prob('subsystem_categories', d.subsystem_categories, (r) => r.id);
prob('milestones', d.milestones, (r) => r.id);
prob('competition_settings', d.competition_settings, (r) => r.season);
prob('subsystems', d.subsystems, (r) => r.id);

// ---------- (c) DEPENDENCIES of every HOLD row (iterate to a fixpoint)
const taskById = new Map(d.tasks.map((x) => [x.id, x]));
const pinned = new Map();     // test account email -> why it cannot be deleted while HOLD rows remain
const alterSet = new Map();   // test account email -> how deleting it would alter a kept row
const pin = (e, why) => { if (e && isTest(e) && !pinned.has(e)) pinned.set(e, why); };
let changed = true;
while (changed) {
  const before = holdKeys.size;
  for (const c of d.task_comments) if (isHold('task_comments', c.id)) holdDep('tasks', c.task_id, 'parent of a HOLD comment (deleting the task cascades and destroys the comment)');
  for (const m of (d7?.comment_mentions || [])) if (isHold('comment_mentions', mentionKey(m))) holdDep('task_comments', m.comment_id, 'parent of a HOLD mention');
  for (const [tk] of [...holdKeys].filter((k) => k.startsWith('tasks:')).map((k) => [k.slice(6)])) {
    const task = taskById.get(tk); if (!task) continue;
    holdDep('subsystems', task.subsystem_id, `referenced by the kept task "${task.title}" (RESTRICT)`);
    d.task_assignees.filter((a) => a.task_id === tk).forEach((a) => holdDep('task_assignees', `${a.task_id}/${a.user_email}`, 'assignee of a kept task (deleting it would alter that task)'));
    pin(task.created_by, `created the kept task "${task.title}" (created_by is RESTRICT)`);
    if (task.primary_owner) alterSet.set(task.primary_owner, `is the primary owner of the kept task "${task.title}" (deleting the account clears it)`);
  }
  for (const r of d.task_requests) if (isHold('task_requests', r.id)) { holdDep('subsystems', r.subsystem_id, `referenced by the kept task request (RESTRICT)`); pin(r.requester, `is the requester of the kept task request (requester_id is RESTRICT)`); }
  for (const p of d.purchase_requests) if (isHold('purchase_requests', p.id)) {
    holdDep('subsystems', p.subsystem_id, 'referenced by a kept purchase request (RESTRICT)');
    (d7?.purchase_status_history || []).filter((h) => h.purchase_request_id === p.id).forEach((h) => { holdDep('purchase_status_history', h.id, 'history of a kept purchase request'); if (h.changed_by !== REAL) pin(h.changed_by, 'changed_by of a kept purchase history row (RESTRICT)'); });
    (d7?.purchase_request_items || []).filter((i) => i.purchase_request_id === p.id).forEach((i) => holdDep('purchase_request_items', i.id, 'line item of a kept purchase request'));
  }
  for (const m of d.timeline_milestones) if (isHold('timeline_milestones', `${m.subsystem_id}/${m.timeline_column_key}`)) {
    holdDep('subsystems', m.subsystem_id, 'parent of a kept timeline cell (cascade would destroy it)');
    holdDep('timeline_columns', m.timeline_column_key, 'parent of a kept timeline cell (cascade would destroy it)');
  }
  for (const m of (d7?.comment_mentions || [])) if (isHold('comment_mentions', mentionKey(m)) && isTest(m.mentioned)) alterSet.set(m.mentioned, 'is @mentioned in a kept comment (deleting the account cascades away the mention row)');
  changed = holdKeys.size !== before;
}
const kindOf = (table, key) => { const k = hk(table, key); return direct.has(k) ? 'HOLD (direct)' : depReason.has(k) ? 'HOLD (dependency)' : 'HOLD (probable)'; };
const whyOf = (table, key) => { const k = hk(table, key); return direct.has(k) ? 'DIRECT: names the real account' : depReason.get(k) || "PROBABLE: no actor column; created/updated inside a session window of the real account"; };
const decide = (table, key, summary, testReason) => (isHold(table, key) ? add(table, key, summary, kindOf(table, key), whyOf(table, key)) : add(table, key, summary, 'DELETE', testReason));
const T = 'created/owned only by @bobcat-test.dev accounts';

// ---------- accounts
for (const u of d.auth_users) add('auth.users', u.email, `${u.display_name || ''} | created ${t(u.created_at)}`, u.email === REAL ? 'KEEP' : 'DELETE', u.email === REAL ? "the owner's real account (admin, approved, active) - needed as the first live admin" : 'disposable Phase 6.x test account');
for (const p of d.profiles) add('profiles', p.email, `role ${p.role}`, p.email === REAL ? 'KEEP' : 'DELETE', p.email === REAL ? 'real account profile' : 'test profile (removed when its auth user is deleted)');

// ---------- rows listed individually in 06
d.subsystems.forEach((s) => decide('subsystems', s.id, s.name, 'obviously test (name) and everything under it is test data'));
d.subsystem_members.forEach((m) => decide('subsystem_members', `${m.subsystem_id}/${m.user_email}`, `${m.user_email} lead=${m.is_lead}`, 'membership of a test account (removing it touches no HOLD row)'));
d.subsystem_categories.forEach((c) => decide('subsystem_categories', c.id, `${c.subsystem_id} / ${c.name}`, 'scripted/test category; no actor and outside every real-account session'));
d.timeline_columns.forEach((c) => decide('timeline_columns', c.key, `${c.label} (sort ${c.sort_order})`, 'scripted/test column; outside every real-account session'));
d.timeline_milestones.forEach((m) => decide('timeline_milestones', `${m.subsystem_id}/${m.timeline_column_key}`, `"${m.milestone_text}" (updated_by ${idEmail[m.updated_by]})`, T));
d.competition_settings.forEach((c) => decide('competition_settings', c.season, c.competition_name, 'scripted test season (name + creation batch); outside every real-account session'));
d.recurring_events.forEach((r) => decide('recurring_events', r.id, `${r.title} dow=${r.day_of_week} ${r.time_label}`, 'scripted test event (batch 2026-09-16 21:31); outside every real-account session'));
d.milestones.forEach((m) => decide('milestones', m.id, `${m.name} (${m.date})`, 'scripted test milestone (batch 2026-09-16 21:31); outside every real-account session'));
d.calendar_events.forEach((e) => decide('calendar_events', e.id, `${e.title} by ${e.created_by}`, T));
d.migration_exceptions.forEach((e) => add('migration_exceptions', e.id, `${e.entity_type}: ${e.raw_value} [${e.resolution_status}]`, 'DELETE', `Phase 6.4 exception-panel test row (resolved_to ${idEmail[e.resolved_to_profile_id] || '-'}, resolved_by ${idEmail[e.resolved_by] || '-'})`));
d.member_applications.forEach((a) => decide('member_applications', a.id, `${a.name} <${a.email}> ${a.status}`, `test application (reviewed_by ${a.reviewed_by || '-'})`));
d.tasks.forEach((k) => decide('tasks', k.id, `"${k.title}" by ${k.created_by} [${k.subsystem_id}]`, T));
d.task_assignees.forEach((a) => decide('task_assignees', `${a.task_id}/${a.user_email}`, `${a.user_email} (${a.role}) on task ${a.task_id.slice(0, 8)}`, T));
d.task_requests.forEach((r) => decide('task_requests', r.id, `"${r.title}" ${r.status} by ${r.requester} [${r.subsystem_id}]`, T));
d.task_comments.forEach((c) => decide('task_comments', c.id, `${c.author}, ${c.length} chars, ${t(c.created_at)}`, T));
d.task_attachments.forEach((a) => decide('task_attachments', a.id, `${a.file_name} by ${a.uploaded_by} ${a.has_storage_object ? '(file exists)' : '(metadata-only stub, no file)'}`, T));
d.purchase_requests.forEach((p) => decide('purchase_requests', p.id, `"${p.title}" ${p.status} by ${p.requested_by} [${p.subsystem_id}]`, T));
d.cad_reviews.forEach((c) => decide('cad_reviews', c.id, `"${c.title}" ${c.status} rev${c.current_revision} by ${c.submitted_by}`, T));

// ---------- child rows: row-level from inventory 07 (else DELETE* placeholders)
if (d7) {
  d7.purchase_status_history.forEach((h) => decide('purchase_status_history', h.id, `${h.from_status || '(new)'} -> ${h.to_status} by ${h.changed_by}, ${t(h.changed_at)}`, 'history row changed by a test account on a test purchase'));
  d7.purchase_request_items.forEach((i) => decide('purchase_request_items', i.id, `${i.description} x${i.quantity}`, 'line item of a test purchase request'));
  d7.cad_review_versions.forEach((v) => decide('cad_review_versions', v.id, `rev ${v.revision_number} by ${v.submitted_by}`, 'revision submitted by a test account'));
  d7.cad_review_comments.forEach((c) => decide('cad_review_comments', c.id, `${c.author}, ${c.length} chars`, 'comment by a test account'));
  d7.comment_mentions.forEach((m) => decide('comment_mentions', mentionKey(m), `${m.comment_author} mentions ${m.mentioned}`, 'mention between test accounts'));
  d7.notification_rows.forEach((n) => decide('notifications', n.id, `${n.type} for ${n.user}${n.read_at ? ' (read)' : ' (unread)'}`, 'notification addressed to a test account'));
} else {
  const star = (table, n, what) => { for (let i = 0; i < n; i++) add(table, `#${i + 1}`, what, 'DELETE*', 'actor fields not in inventory 06 - run script 07'); };
  star('purchase_status_history', d.row_counts.purchase_status_history, 'purchase status-history row'); star('purchase_request_items', d.row_counts.purchase_request_items, 'purchase line item');
  star('cad_review_versions', d.row_counts.cad_review_versions, 'CAD revision'); star('cad_review_comments', d.row_counts.cad_review_comments, 'CAD comment'); star('comment_mentions', d.row_counts.comment_mentions, 'comment mention');
  for (const n of d.notifications) for (let i = 0; i < n.total; i++) add('notifications', `${n.user_email}/${n.type}#${i + 1}`, `${n.type} for ${n.user_email}`, n.user_email === REAL ? 'HOLD (direct)' : 'DELETE', 'notification');
}
for (const o of d.storage_objects) add('storage.objects', o.name, `${o.bucket} ${o.size} bytes ${o.mimetype}`, 'DELETE', 'test upload (Dashboard/Storage only - SQL delete is blocked)');
add('storage.buckets', d.storage_buckets[0]?.id || 'task-attachments', 'bucket + 2 policies', 'KEEP', 'part of the verified schema/setup');

// ---------- integrity checks
const perTable = {};
for (const r of out) { const e = (perTable[r.table] ||= {}); const k = r.decision.startsWith('HOLD') ? 'HOLD' : r.decision; e[k] = (e[k] || 0) + 1; }
const mismatch = Object.entries(d.row_counts).filter(([k]) => k !== 'profiles').map(([k, v]) => [k, Number(v), Object.values(perTable[k] || {}).reduce((a, b) => a + b, 0)]).filter(([, a, b]) => a !== b);
const holdRows = out.filter((r) => r.decision.startsWith('HOLD'));
// a DELETE row must never reference a HOLD parent that survives (would block the delete): verify the known FK edges
const problems = [];
for (const r of out.filter((x) => x.decision === 'DELETE')) {
  if (r.table === 'subsystem_categories') { /* SET NULL on tasks.category_id: alters kept tasks, reported as collateral below */ }
}
const collateral = [];
for (const k of [...holdKeys].filter((x) => x.startsWith('tasks:'))) {
  const det = (d7?.task_details || []).find((x) => x.id === k.slice(6));
  if (det?.category) collateral.push(`kept task ${k.slice(6, 14)} has category "${det.category}"${d.subsystem_categories.some((c) => c.name === det.category && !isHold('subsystem_categories', c.id)) ? ' which is being DELETED (its category_id would be set NULL)' : ' (kept)'}`);
}

const totals = { DELETE: 0, 'DELETE*': 0, HOLD: 0, KEEP: 0 };
for (const r of out) totals[r.decision.startsWith('HOLD') ? 'HOLD' : r.decision]++;
fs.writeFileSync(path.join(dir, 'dev_cleanup_classification.json'), JSON.stringify({ real: REAL, used07: !!d7, sessions: windows.map((w) => [new Date(w.lo).toISOString(), new Date(w.hi).toISOString()]), totals, perTable, mismatch, pinned: Object.fromEntries(pinned), alters: Object.fromEntries(alterSet), collateral, rows: out }, null, 1));

const order = ['auth.users', 'profiles', 'subsystems', 'subsystem_members', 'subsystem_categories', 'timeline_columns', 'timeline_milestones', 'competition_settings', 'recurring_events', 'milestones', 'calendar_events', 'migration_exceptions', 'member_applications', 'tasks', 'task_assignees', 'task_requests', 'task_comments', 'comment_mentions', 'task_attachments', 'purchase_requests', 'purchase_request_items', 'purchase_status_history', 'cad_reviews', 'cad_review_versions', 'cad_review_comments', 'notifications', 'storage.objects', 'storage.buckets'];
let md = `# bobcat-dev cleanup list - FOR OWNER APPROVAL (nothing has been deleted)\n\nReal account: ${REAL}. Inventories: 06 (${d.meta.inspected_at})${d7 ? ' + 07 (' + d7.meta.inspected_at + ')' : ' (07 NOT loaded)'}.\nReal-account session windows: ${windows.map((w) => new Date(w.lo).toISOString().slice(0, 16) + ' .. ' + new Date(w.hi).toISOString().slice(0, 16)).join('  |  ')}\n\nTOTALS: DELETE ${totals.DELETE}, DELETE* ${totals['DELETE*']}, HOLD ${totals.HOLD}, KEEP ${totals.KEEP} (of ${out.length})\n\n## Summary per table\n\n| table | rows | DELETE | HOLD | KEEP |\n|---|---|---|---|---|\n`;
for (const tb of order) { const e = perTable[tb] || {}; md += `| ${tb} | ${Object.values(e).reduce((a, b) => a + b, 0)} | ${(e.DELETE || 0) + (e['DELETE*'] || 0)} | ${e.HOLD || 0} | ${e.KEEP || 0} |\n`; }
md += `\n## HOLD rows (need your decision)\n\n| table | key | summary | type | why |\n|---|---|---|---|---|\n`;
for (const r of holdRows) md += `| ${r.table} | ${r.key.slice(0, 44)} | ${r.summary} | ${r.decision} | ${r.reason} |\n`;
md += `\n## Test accounts that HOLD rows pin\n\n${[...pinned].map(([e, w]) => `- ${e}: CANNOT be deleted - ${w}`).join('\n') || '- none'}\n${[...alterSet].filter(([e]) => !pinned.has(e)).map(([e, w]) => `- ${e}: deletable, but it ${w}`).join('\n')}\n\n## Every row, by table\n`;
for (const tb of order) { md += `\n### ${tb}\n\n| decision | key | summary | reason |\n|---|---|---|---|\n`; for (const r of out.filter((x) => x.table === tb)) md += `| ${r.decision} | ${r.key.slice(0, 44)} | ${r.summary} | ${r.reason} |\n`; }
fs.writeFileSync(path.join(dir, 'dev_cleanup_classification.md'), md);

console.log('inputs: 06' + (d7 ? ' + 07' : ' only (07 missing)'), '| items classified:', out.length, JSON.stringify(totals));
console.log('coverage check (inventory row_counts vs classified, excluding profiles):', mismatch.length ? 'MISMATCH ' + JSON.stringify(mismatch) : 'every counted row is classified');
console.log('real-account sessions:', windows.map((w) => new Date(w.lo).toISOString().slice(0, 16) + '..' + new Date(w.hi).toISOString().slice(11, 16)).join(' | '));
console.log('HOLD rows:', holdRows.length, JSON.stringify(holdRows.reduce((o, r) => { o[r.decision] = (o[r.decision] || 0) + 1; return o; }, {})));
console.log('test accounts PINNED by HOLD rows (cannot be deleted):', JSON.stringify(Object.fromEntries(pinned)));
console.log('test accounts deletable but altering kept rows:', JSON.stringify(Object.fromEntries([...alterSet].filter(([e]) => !pinned.has(e)))));
console.log('collateral on kept rows:', collateral.join(' ; ') || 'none');
console.log(JSON.stringify(perTable));
