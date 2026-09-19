// Phase 6.8: validate the saved legacy source export BEFORE any import SQL is generated from it.
//   node validate_source_export.mjs [path]     default: results/prod_30_source_export.json
// Pure local file check (no network, no database). Exit 0 = usable (warnings allowed), 1 = BLOCKING problem, 2 = file missing/empty/placeholder.
// BLOCK  = the export must not be used (PIN present, section missing, ids not unique, a sequence that would break the SQL literal, ...)
// WARN   = differs from the baseline recorded in the plan (legacy data changed since 2026-09-18) - review before importing
// INFO   = facts the import design depends on
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, '..', 'results', 'prod_30_source_export.json');
if (!fs.existsSync(file)) { console.log('MISSING: ' + file); process.exit(2); }
const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
if (!raw.trim()) { console.log('EMPTY file: paste the JSON cell of 30_extract_legacy_source_readonly.sql into ' + file); process.exit(2); }
let x;
try { x = JSON.parse(raw.trim()); if (typeof x === 'string') x = JSON.parse(x); if (Array.isArray(x) && x.length === 1) x = x[0]; if (x && x.source_export) x = x.source_export; }
catch (e) { console.log('INVALID JSON: ' + e.message.slice(0, 100) + ' | starts: ' + raw.replace(/\s+/g, ' ').slice(0, 90)); process.exit(1); }
if (x && x._status) { console.log('PLACEHOLDER: ' + x._status); process.exit(2); }

const B = [], W = [], I = [];
const block = (m) => B.push(m), warn = (m) => W.push(m), info = (m) => I.push(m);

// ---- baselines recorded in PRODUCTION_PLAN.md (2026-09-18, script 03)
const BASE = {
  counts: { ws_tasks: 49, rel_tasks: 30, orders: 2, subteams: 1, subsystems: 7, categories: 25, timeline_columns: 15, cells: 5, recurring: 1, ws_orders: 0 },
  fp: { ws_tasks: '1eb724f93f71730f43f5760366456ff8', ws_taxonomy: '68605bf421fdd84b5116526cf91dbdbb', ws_orders: 'd751713988987e9331980363e24189ce', ws_timeline_columns: 'e3ffea8a87f2d86777f4733ca7679e3b', ws_recurring_events: '239a0c95988fd4d94d277ca80dd562be', ws_timeline_milestones: '43eb4eb1ff583ad31bdbc309559678d5', ws_updated_at: '2026-09-08T17:09:28.632+00:00', tbl_tasks: '5e34cca3ff667b070de136004e2d598d', tbl_orders: '53df8fc92d204df9c8bb93af878306cb', tbl_subteams: 'eefd49f2fe63111d3e87f4e355dc5160' },
};

for (const k of ['export_meta', 'row_counts', 'fingerprints', 'workspace_state', 'tasks', 'orders', 'subteams']) if (!(k in x)) block(`missing section "${k}" (is this the output of 30_extract_legacy_source_readonly.sql?)`);
if (B.length) { report(); }
const ws = x.workspace_state || {};
for (const k of ['id', 'taxonomy', 'tasks', 'orders', 'timeline_columns', 'recurring_events', 'timeline_milestones']) if (!(k in ws)) block(`workspace_state.${k} is missing`);
if (B.length) report();
if (x.export_meta?.format !== 'bobcat-legacy-export-v1') block('export_meta.format is not bobcat-legacy-export-v1');

// ---- security: no PIN of any kind may be present
const text = JSON.stringify(x);
if (/leadpin/i.test(text)) block('the export still contains "leadPin" - the extraction script strips it; do NOT use this file');
const pinKey = (o, p = '$') => { if (Array.isArray(o)) return o.flatMap((v, i) => pinKey(v, `${p}[${i}]`)); if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => (/^(lead)?pin$|password|passcode|secret/i.test(k) ? [`${p}.${k}`] : pinKey(v, `${p}.${k}`))); return []; };
const pk = pinKey(x); if (pk.length) block('credential-like keys present: ' + pk.slice(0, 5).join(', '));
if (text.includes('$legacy$')) block('the payload contains the SQL dollar-quote tag $legacy$ - it would break the import literal');
if (x.export_meta?.database && /bobcat-dev/i.test(String(x.export_meta.database))) warn('export_meta.database looks like bobcat-dev');
if (x.export_meta?.lead_pins_removed_from_taxonomy !== 7) warn(`lead_pins_removed_from_taxonomy = ${x.export_meta?.lead_pins_removed_from_taxonomy} (baseline 7)`);

// ---- structure
const tax = ws.taxonomy, wsT = ws.tasks, rel = x.tasks;
if (![tax, wsT, rel, x.orders, x.subteams, ws.timeline_columns, ws.recurring_events].every(Array.isArray)) block('an expected array is not an array');
if (typeof ws.timeline_milestones !== 'object' || Array.isArray(ws.timeline_milestones)) block('workspace_state.timeline_milestones is not an object');
if (B.length) report();
const uniq = (a) => new Set(a).size === a.length;
if (!wsT.every((t) => t && t.id)) block('a workspace_state task has no id'); else if (!uniq(wsT.map((t) => t.id))) block('duplicate ids inside workspace_state.tasks');
if (!rel.every((t) => t && t.id)) block('a relational task has no id'); else if (!uniq(rel.map((t) => t.id))) block('duplicate ids inside public.tasks');
if (!uniq(x.orders.map((o) => o.id))) block('duplicate order ids');
if (!uniq(tax.map((s) => s.id))) block('duplicate subsystem ids in taxonomy');
if (!uniq(tax.map((s) => s.name))) block('duplicate subsystem NAMES in taxonomy (subsystems.name is UNIQUE)');
const cats = tax.flatMap((s) => (s.categories || []).map((c) => [s.id, c.name]));
if (!uniq(cats.map((c) => c.join('::')))) block('duplicate category names inside a subsystem (UNIQUE (subsystem_id,name))');
if (!uniq(ws.timeline_columns.map((c) => c.key))) block('duplicate timeline column keys');
for (const [k, v] of Object.entries(x.row_counts || {})) { const a = { workspace_state_rows: 1, tasks: rel.length, orders: x.orders.length, subteams: x.subteams.length }[k]; if (a !== undefined && a !== v) block(`row_counts.${k}=${v} but the array has ${a}`); }
if (x.row_counts?.workspace_state_rows !== 1) warn(`workspace_state has ${x.row_counts?.workspace_state_rows} rows (expected exactly 1; only the first was exported)`);
if (B.length) report();

// ---- counts vs baseline
const cells = Object.values(ws.timeline_milestones).flatMap((o) => (o && typeof o === 'object' ? Object.values(o) : [])).filter((v) => String(v ?? '').trim()).length;
const got = { ws_tasks: wsT.length, rel_tasks: rel.length, orders: x.orders.length, subteams: x.subteams.length, subsystems: tax.length, categories: cats.length, timeline_columns: ws.timeline_columns.length, cells, recurring: ws.recurring_events.length, ws_orders: ws.orders.length };
for (const [k, v] of Object.entries(BASE.counts)) if (got[k] !== v) warn(`${k}: ${got[k]} (baseline ${v})`);
// ---- fingerprints vs baseline (legacy tables are anon-writable, so this detects any change since the plan)
const drift = Object.entries(BASE.fp).filter(([k, v]) => x.fingerprints?.[k] !== v).map(([k]) => k);
if (drift.length) warn(`DRIFT: fingerprints differ from the 2026-09-18 baseline for: ${drift.join(', ')} - the legacy data changed since the reconciliation`);
else info('all 10 fingerprints equal the 2026-09-18 baseline: the legacy data has NOT changed since the reconciliation');

// ---- facts the import depends on
const ids = new Set(wsT.map((t) => t.id));
const shared = rel.filter((t) => ids.has(t.id)), relOnly = rel.filter((t) => !ids.has(t.id));
const subIds = new Set(tax.map((s) => s.id));
const unknownSub = (rows, f) => Object.entries(rows.filter((r) => f(r) && !subIds.has(f(r))).reduce((o, r) => ((o[f(r)] = (o[f(r)] || 0) + 1), o), {}));
info(`size ${(raw.length / 1024).toFixed(1)} KB | ws tasks ${wsT.length} | relational ${rel.length} = ${shared.length} shared + ${relOnly.length} relational-only | orders ${x.orders.length} | subteams ${x.subteams.length}`);
info(`categories ${cats.length} in ${tax.length} subsystems | timeline columns ${ws.timeline_columns.length} (keys: ${ws.timeline_columns.map((c) => c.key).join(',')}) | milestone cells ${cells} | recurring events ${ws.recurring_events.length}`);
info(`expected imported+held tasks = ${wsT.length} + ${relOnly.length} = ${wsT.length + relOnly.length} (shared ${shared.length} relational rows are superseded by workspace_state)`);
const uw = unknownSub(wsT, (t) => t.subsystemId), ur = unknownSub(relOnly, (t) => t.subsystem_id), uo = unknownSub(x.orders, (o) => o.subsystem_id), us = unknownSub(x.subteams, (s) => s.subsystem_id);
if (uw.length) warn('workspace_state tasks with an unknown subsystem: ' + JSON.stringify(uw));
info(`unknown subsystem ids (held as exceptions per D4): relational-only tasks ${JSON.stringify(ur)} | orders ${JSON.stringify(uo)} | subteams ${JSON.stringify(us)}`);
const TS = ['To Do', 'In Progress', 'Blocked', 'Review', 'Complete'], TP = ['Critical', 'High', 'Medium', 'Low'];
const badS = [...wsT, ...relOnly].filter((t) => !TS.includes(t.status)).length, badP = [...wsT, ...relOnly].filter((t) => !TP.includes(t.priority)).length;
if (badS || badP) warn(`tasks that would be held for an invalid status/priority: ${badS} / ${badP}`);
const catOk = new Set(cats.map((c) => c.join('::')));
info(`ws tasks whose category is not in their own subsystem: ${wsT.filter((t) => !catOk.has(`${t.subsystemId}::${t.category}`)).length} (baseline 0) | relational-only rows with a category that would not resolve: ${relOnly.filter((t) => subIds.has(t.subsystem_id) && t.category && !catOk.has(`${t.subsystem_id}::${t.category}`)).length}`);
const badDl = [...wsT.map((t) => t.deadline), ...relOnly.map((t) => t.deadline)].filter((d) => d && String(d).trim() && !/^\d{4}-\d{2}-\d{2}$/.test(String(d))).length;
info(`non-ISO deadlines: ${badDl} | distinct non-blank assignee names (ws + relational-only): ${new Set([...wsT, ...relOnly].map((t) => (t.assignee || '').trim()).filter(Boolean)).size}`);
info(`order statuses: ${JSON.stringify(x.orders.reduce((o, r) => ((o[r.status] = (o[r.status] || 0) + 1), o), {}))} | timeline highlight values: ${JSON.stringify(ws.timeline_columns.reduce((o, r) => ((o[r.highlight] = (o[r.highlight] || 0) + 1), o), {}))}`);
report();

function report() {
  console.log(`file: ${file}\n`);
  for (const m of B) console.log('BLOCK  ' + m);
  for (const m of W) console.log('WARN   ' + m);
  for (const m of I) console.log('INFO   ' + m);
  console.log(B.length ? `\nRESULT: BLOCKED (${B.length} blocking problem(s)) - do not generate import SQL from this file.` : W.length ? `\nRESULT: USABLE WITH ${W.length} WARNING(S) - review the warnings (drift) before generating import SQL.` : '\nRESULT: VALID - matches the baseline; safe to generate the import SQL.');
  process.exit(B.length ? 1 : 0);
}
