// Phase 6.8: STATIC checks of the GENERATED import SQL (40a / 40b). Pure text analysis - no database, no network, executes nothing.
// Used by generate_import_sql.mjs (it refuses to leave files behind if any check fails) and by check_generated_import_sql.mjs (CLI you can run on
// the exact files you are about to paste). Every check returns { group, name, ok, detail }.
import crypto from 'node:crypto';

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const PAY = /\$legacy\$([\s\S]*?)\$legacy\$/;
const stripPayload = (sql) => sql.replace(PAY, '$legacy$<PAYLOAD>$legacy$');
const noComments = (sql) => sql.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join('\n');
export const SEVEN = ['drivetrain-fitment', 'fabrication', 'front-suspension', 'pedals-driver-controls', 'rear-suspension-brakes', 'sae-deliverables', 'shielding-safety'];
export const EXPECTED_TRIGGERS = ['tasks.tasks_before_write', 'timeline_milestones.timeline_milestones_before_write', 'purchase_requests.purchase_requests_before_write', 'purchase_requests.purchase_requests_log_status_change', 'purchase_requests.purchase_requests_notify_status_change', 'task_assignees.task_assignees_notify_assignment', 'task_requests.task_requests_notify_reviewed', 'cad_reviews.cad_reviews_notify_status_change', 'comment_mentions.comment_mentions_notify', 'member_applications.member_applications_notify_reviewed'];
const WRITE_ALLOW = new Set(['public.subsystems', 'public.subsystem_categories', 'public.timeline_columns', 'public.timeline_milestones', 'public.recurring_events', 'public.tasks', 'public.purchase_requests', 'public.purchase_request_items', 'public.purchase_status_history', 'public.migration_exceptions', 'public.migration_log']);
const TEMP = new Set(['_src', '_p', '_ctx', '_ex', '_tax', '_cat_map', '_alias', '_cols', '_cells', '_rec', '_t', '_pmap', '_o', '_st']);
const CRED_KEY = /^(lead)?pin$|password|passcode|secret|token|api[_-]?key/i;
const credKeys = (o, p = '$') => (Array.isArray(o) ? o.flatMap((v, i) => credKeys(v, `${p}[${i}]`)) : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => (CRED_KEY.test(k) ? [`${p}.${k}`] : credKeys(v, `${p}.${k}`))) : []);

/** files: { dry, exec } (texts); expected: the expected.json object; exportObj: the validated export; ownerId: uuid|null; baseline: object|null; payloadMd5Ref: string|null */
export function checkTexts({ dry, exec, expected, exportObj, ownerId = null, baseline = null, payloadMd5Ref = null }) {
  const R = [];
  const add = (group, name, ok, detail = '') => R.push({ group, name, ok: !!ok, detail: String(detail) });
  const files = { '40a (dry run)': dry, '40b (execute)': exec };
  const E = expected.expected;

  // ---- 1) no internal marker of any kind may survive
  for (const [n, s] of Object.entries(files)) {
    const rest = stripPayload(s);
    const markers = [...new Set(rest.match(/__[A-Z][A-Z0-9_]*__|@@[A-Z_]+@@?|@@TEMPLATE\w*/g) || [])];
    add('markers', `${n}: no "__MODE_END__"`, !s.includes('__MODE_END__'));
    add('markers', `${n}: no other unresolved template marker (__X__ / @@X@@)`, markers.length === 0, markers.join(', '));
    add('markers', `${n}: no template guard/banner left; the word "template" appears nowhere outside the payload`, !/template/i.test(rest) && !/@@/.test(rest), (rest.match(/.{0,40}template.{0,40}/i) || [''])[0]);
    add('markers', `${n}: stamped as GENERATED, complete (end marker is the last line)`, /^-- GENERATED /.test(s) && /-- END OF GENERATED SCRIPT [\w.]+ \(if you can read this line, the whole file was pasted\)\s*$/.test(s));
    const dq = (t) => (s.match(new RegExp('\\$' + t + '\\$', 'g')) || []).length;
    add('markers', `${n}: dollar-quote tags balanced (legacy/exp/guard/post/f = 2 each)`, ['legacy', 'exp', 'guard', 'post', 'f'].every((t) => dq(t) === 2), ['legacy', 'exp', 'guard', 'post', 'f'].map((t) => `${t}=${dq(t)}`).join(' '));
  }

  // ---- 2) transaction endings
  const stm = (s) => noComments(stripPayload(s));
  const cnt = (s, re) => (stm(s).match(re) || []).length;
  add('endings', '40a contains exactly one ROLLBACK statement and no COMMIT statement', cnt(dry, /^\s*rollback;\s*$/gim) === 1 && cnt(dry, /^\s*commit;\s*$/gim) === 0, `rollback=${cnt(dry, /^\s*rollback;\s*$/gim)} commit=${cnt(dry, /^\s*commit;\s*$/gim)}`);
  add('endings', '40b contains exactly one COMMIT statement and no ROLLBACK statement', cnt(exec, /^\s*commit;\s*$/gim) === 1 && cnt(exec, /^\s*rollback;\s*$/gim) === 0, `commit=${cnt(exec, /^\s*commit;\s*$/gim)} rollback=${cnt(exec, /^\s*rollback;\s*$/gim)}`);
  add('endings', 'both scripts open exactly one transaction (one BEGIN)', cnt(dry, /^\s*begin;\s*$/gim) === 1 && cnt(exec, /^\s*begin;\s*$/gim) === 1);
  const la = dry.split('\n'), lb = exec.split('\n');
  const diffLines = la.length === lb.length ? la.filter((x, i) => x !== lb[i]).length : Math.abs(la.length - lb.length) + Math.min(la.length, lb.length);
  const bodyDry = la.slice(1, la.findIndex((l) => /^-- DRY RUN ends here/.test(l))).filter((l) => !/^-- (=+|40[ab]_import|!!!)/.test(l)).join('\n');
  const bodyExe = lb.slice(1, lb.findIndex((l) => /^-- EXECUTE: keep the import/.test(l))).filter((l) => !/^-- (=+|40[ab]_import|!!!)/.test(l)).join('\n');
  add('endings', '40a and 40b are identical except banner/file name and the final ROLLBACK/COMMIT block', bodyDry.replace(/40a_import_DRY_RUN\.sql|\*\*\* DRY RUN[^\n]*/g, '') === bodyExe.replace(/40b_import_EXECUTE\.sql|\*\*\* WRITES DATA[^\n]*/g, ''), `${la.length} vs ${lb.length} lines; the only difference is the closing ROLLBACK/COMMIT block`);

  // ---- 3) payload
  const pa = dry.match(PAY), pb = exec.match(PAY);
  add('payload', 'each file embeds exactly one payload literal', !!pa && !!pb);
  const payload = pa ? pa[1] : '';
  add('payload', 'the payload is identical in 40a and 40b', pa && pb && pa[1] === pb[1]);
  add('payload', 'payload md5 == md5 written in the SQL guard == expected.json', payload && dry.includes(`<> '${md5(payload)}'`) && exec.includes(`<> '${md5(payload)}'`) && md5(payload) === expected.payload_md5, md5(payload));
  if (payloadMd5Ref) add('payload', `payload UNCHANGED vs the previously generated one (md5 ${payloadMd5Ref})`, md5(payload) === payloadMd5Ref, md5(payload));
  let pj = null; try { pj = JSON.parse(payload); } catch (e) { add('payload', 'payload parses as JSON', false, e.message); }
  if (pj && exportObj) add('payload', 'payload == the validated production export (semantically identical)', JSON.stringify(pj) === JSON.stringify(exportObj));
  add('payload', 'payload is a single minified line (stable md5 across a paste)', !/\n/.test(payload));

  // ---- 4) PINs and credentials
  add('security', 'no "leadPin" (any case) inside the payload', !/leadpin/i.test(payload));
  add('security', 'no PIN/password/secret/token-like KEY anywhere in the payload', pj ? credKeys(pj).length === 0 : false, pj ? credKeys(pj).slice(0, 5).join(', ') : '');
  const rest = stm(dry);
  const leadOutside = (rest.match(/leadpin/gi) || []).length;
  add('security', 'outside the payload "leadpin" appears only inside the abort checks (guard + post-check)', leadOutside === 4 || leadOutside === 3 || leadOutside === 2, `${leadOutside} mentions in check text`);
  add('security', 'the SQL aborts if the payload or any exception/log row mentions leadpin', /ABORT \(payload\): the payload contains "leadPin"/.test(dry) && /A LEAD PIN REFERENCE IS PRESENT/.test(dry));

  // ---- 5) writes: nothing against profiles / auth; only the allowed target tables
  const body = stm(exec);
  const writeRe = /\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?|merge\s+into)\s+(?:only\s+)?([\w."]+)/gi;
  const targets = new Map();
  for (const m of body.matchAll(writeRe)) { const t = m[2].replace(/"/g, ''); const k = m[1].toLowerCase().replace(/\s+/g, ' '); if (!/^(update|insert into|delete from)$/.test(k) && !/truncate|merge/.test(k)) continue; if (k === 'update' && !/\bset\b/i.test(body.slice(m.index, m.index + 160))) continue; targets.set(t, (targets.get(t) || 0) + 1); }
  const bad = [...targets.keys()].filter((t) => !WRITE_ALLOW.has(t) && !TEMP.has(t.replace(/^pg_temp\./, '')) && !/^_/.test(t));
  add('writes', 'NO INSERT/UPDATE/DELETE/TRUNCATE against public.profiles or any auth.* table', ![...targets.keys()].some((t) => /^public\.profiles$|^profiles$|^auth\./i.test(t)) && !/\b(alter|drop|create)\s+(table|trigger|policy)\s+(if\s+exists\s+)?(public\.profiles|auth\.)/i.test(body) && !/\b(grant|revoke)\b/i.test(body), [...targets.keys()].filter((t) => /profiles|auth\./i.test(t)).join(', '));
  add('writes', 'every write targets only the approved import tables or temp tables', bad.length === 0, bad.join(', ') || [...targets.keys()].filter((t) => WRITE_ALLOW.has(t)).sort().join(', '));
  const pubAlter = (body.match(/\balter\s+table\s+public\./gi) || []).length, allAlter = (body.match(/\balter\s+table\b/gi) || []).length;
  add('writes', 'no DDL other than disabling/re-enabling the 10 named triggers (20 ALTER TABLE on public.*) plus temp tables/functions', !/\bdrop\s+(table|function|trigger|policy|schema|index|type|view|column|extension|sequence)\b/i.test(body) && !/\btruncate\b/i.test(body) && pubAlter === 20 && [...body.matchAll(/\balter\s+table\s+(?!public\.)(\S+)/gi)].every((m) => /^_/.test(m[1])), `${pubAlter} on public tables, ${allAlter - pubAlter} on temp tables`);

  // ---- 6) owner profile protection
  add('owner', 'the profile row fingerprint is captured before and compared after (abort on any change)', /profile_md5/.test(dry) && /THE OWNER PROFILE ROW CHANGED/.test(dry));
  add('owner', 'requires the importer to be an approved, active cto/admin', /role in \('cto', 'admin'\)\s+and approved and active/.test(dry));
  add('owner', 'requires exactly 1 profile + 1 auth user before AND after', /expected exactly 1 profile and 1 auth user/.test(dry) && /profiles\/auth\.users count changed/.test(dry));
  const ids = [...new Set([...exec.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'::uuid/g)].map((m) => m[1]))];
  add('owner', 'exactly one importer uuid is used, and it equals expected.json' + (ownerId ? ' and the owner profile id (inventory 06)' : ''), ids.length === 1 && ids[0] === expected.importer && (!ownerId || ids[0] === ownerId), ids.join(','));
  const dis = [...body.matchAll(/alter table public\.(\w+) disable trigger (\w+);/g)].map((m) => `${m[1]}.${m[2]}`), en = [...body.matchAll(/alter table public\.(\w+) enable trigger (\w+);/g)].map((m) => `${m[1]}.${m[2]}`);
  add('owner', 'exactly the 10 named triggers are disabled and the same 10 are re-enabled', JSON.stringify(dis) === JSON.stringify(EXPECTED_TRIGGERS) && JSON.stringify(en) === JSON.stringify(EXPECTED_TRIGGERS), `${dis.length}/${en.length}`);

  // ---- 7) mapping rules
  const tax = pj?.workspace_state?.taxonomy || [];
  const tIds = tax.map((s) => s.id);
  add('mapping', 'all 7 source subsystem ids are in the payload taxonomy' + (baseline ? ' (the known 7)' : ''), tax.length === 7 && (!baseline || JSON.stringify([...tIds].sort()) === JSON.stringify(SEVEN)), tIds.join(', '));
  add('mapping', 'subsystems are inserted from the taxonomy with NO filter, and the SQL asserts the count', /insert into public\.subsystems \(id, name, active\)\s+select e ->> 'id', e ->> 'name', true from _tax order by ord;/.test(dry) && E.subsystems === tax.length, `expected.subsystems=${E.subsystems}`);
  const wsIds = new Set((pj?.workspace_state?.tasks || []).map((t) => t.id)), shared = (pj?.tasks || []).filter((t) => wsIds.has(t.id)).map((t) => t.id);
  add('mapping', 'workspace_state wins: relational rows are taken ONLY when the id is absent from workspace_state', /rel\.r ->> 'id' not in \(select id from ws_ids\)/.test(dry));
  add('mapping', 'the overlapping relational rows are skipped and logged (task_relational_superseded)', /task_relational_superseded/.test(dry) && E.log_by_entity_status['task_relational_superseded:skipped'] === shared.length, `${shared.length} overlapping ids: ${shared.join(', ')}`);
  add('mapping', 'no subsystem is guessed: unknown ids are held (no alias map unless explicitly given)', (JSON.stringify(expected.aliases || {}) === '{}') === !('subsystem_aliases' in (pj || {})), `aliases=${JSON.stringify(expected.aliases || {})}`);
  add('mapping', 'notifications: the SQL aborts if any notification exists', /NOTIFICATIONS WERE CREATED/.test(dry));
  add('mapping', 'the SQL embeds the same expected results as expected.json (independent JS expectation)', (() => { const g = (s) => { const m = s.match(/\$exp\$([\s\S]*?)\$exp\$/); try { return JSON.stringify(JSON.parse(m[1])); } catch { return null; } }; const want = JSON.stringify(E); return g(dry) === want && g(exec) === want; })());

  // ---- 8) the counts you asked to see confirmed (only when a baseline is supplied)
  if (baseline) {
    const tot = (o) => Object.values(o).reduce((x, y) => x + y, 0);
    const actual = { tasks: E.tasks, held_tasks: expected.held_tasks, exceptions_total: tot(E.exceptions_by_type), migration_log_rows: tot(E.log_by_entity_status), subsystems: E.subsystems, categories: E.categories, timeline_columns: E.timeline_columns, timeline_milestones: E.timeline_milestones, recurring_events: E.recurring_events, purchase_requests: E.purchase_requests, notifications: 0 };
    for (const [k, v] of Object.entries(baseline)) add('counts', `${k} = ${v}`, actual[k] === v, `found ${actual[k]}`);
  }
  return R;
}
