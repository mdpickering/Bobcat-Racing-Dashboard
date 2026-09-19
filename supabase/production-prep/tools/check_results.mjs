// Phase 6.7 helper: validate the four pasted result files in supabase/production-prep/results/.
//   node check_results.mjs              one-shot report (exit 0 = all ready, 1 = something missing/invalid)
//   node check_results.mjs --wait 590   poll every 5 s for up to 590 s, exit as soon as all are ready (2 = timed out)
// Pure local file check. No network, no database, no credentials.
// It recognises placeholders/empty files, invalid JSON (e.g. a pasted SQL error), and the common
// paste wrappers: BOM, a JSON string containing JSON, a one-row array, or {"inventory": {...}}.
// If a wrapper is found the file is rewritten unwrapped (the original is kept as <name>.orig).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'results');
const wrapperKeys = ['inventory', 'profile', 'reconcile', 'preflight', 'dev_data_inventory', 'child_actor_inventory'];

const specs = [
  { file: 'prod_01_inventory.json', kind: 'inventory', label: 'production catalog inventory (script 01)',
    keys: ['meta', 'tables', 'columns', 'policies', 'functions', 'triggers', 'enums', 'storage_buckets', 'auth_summary'] },
  { file: 'dev_01_inventory.json', kind: 'inventory', label: 'bobcat-dev catalog inventory (script 01)',
    keys: ['meta', 'tables', 'columns', 'policies', 'functions', 'triggers', 'enums', 'storage_buckets', 'auth_summary'] },
  { file: 'prod_02_workspace_state_shape.json', kind: 'profile', label: 'workspace_state shape (script 02)',
    keys: ['shape', 'row_count', 'top_level_keys', 'enum_like_values'] },
  { file: 'prod_03_reconcile.json', kind: 'reconcile', label: 'legacy data reconciliation (script 03)',
    keys: ['workspace_state', 'fingerprints', 'tasks_reconcile', 'orders', 'subteams', 'taxonomy', 'task_rules_check', 'timeline', 'recurring_events'] },
  // Phase 6.8 preparation: optional (does not affect "ALL READY"); wrapper key is dev_data_inventory
  { file: 'dev_06_data_inventory.json', kind: 'devdata', optional: true, label: 'bobcat-dev auth users + test data (script 06)',
    keys: ['meta', 'auth_users', 'profiles', 'row_counts', 'tasks', 'storage_objects', 'member_applications'] },
  { file: 'dev_07_child_actors.json', kind: 'devchild', optional: true, label: 'bobcat-dev child-row actors (script 07)',
    keys: ['meta', 'purchase_status_history', 'purchase_request_items', 'cad_review_versions', 'cad_review_comments', 'comment_mentions', 'notification_rows'] },
];

function unwrap(text) {
  let notes = [];
  let t = text.replace(/^﻿/, '').trim();
  let v = JSON.parse(t);
  if (typeof v === 'string') { v = JSON.parse(v); notes.push('was a JSON string containing JSON'); }
  if (Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === 'object') { v = v[0]; notes.push('was a one-row array'); }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const ks = Object.keys(v);
    if (ks.length === 1 && wrapperKeys.includes(ks[0])) { v = v[ks[0]]; notes.push(`was wrapped in {"${ks[0]}": …}`); }
  }
  if (typeof v === 'string') { v = JSON.parse(v); notes.push('inner value was a JSON string'); }
  return { value: v, notes };
}

function check(spec) {
  const p = path.join(dir, spec.file);
  const res = { file: spec.file, label: spec.label, ok: false, status: '', warnings: [] };
  if (!fs.existsSync(p)) { res.status = 'MISSING (file does not exist)'; return res; }
  const text = fs.readFileSync(p, 'utf8');
  if (text.replace(/^﻿/, '').trim() === '') { res.status = 'EMPTY (0 bytes) — paste the query result JSON into this file'; return res; }
  let parsed;
  try { parsed = unwrap(text); }
  catch (e) {
    const head = text.replace(/\s+/g, ' ').trim().slice(0, 90);
    res.status = `INVALID JSON — ${e.message.slice(0, 80)} | file starts: "${head}"`;
    return res;
  }
  const v = parsed.value;
  if (v && typeof v === 'object' && v._status) { res.status = `PLACEHOLDER (${String(v._status).slice(0, 60)})`; return res; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) { res.status = 'INVALID SHAPE — expected a JSON object'; return res; }
  const missing = spec.keys.filter((k) => !(k in v));
  if (missing.length) { res.status = `WRONG CONTENT — missing keys: ${missing.join(', ')} (is this the right query's output?)`; return res; }

  if (spec.kind === 'inventory') {
    const names = (v.tables || []).map((t) => t.name);
    res.summary = `${names.length} tables, ${(v.functions || []).length} functions, ${(v.policies || []).length} policies, ${(v.triggers || []).length} triggers, db=${v.meta?.database}, at ${v.meta?.inspected_at}`;
    const isDev = spec.file.startsWith('dev_');
    const hasV2 = names.includes('public.profiles') && names.includes('public.subsystems');
    if (isDev && !hasV2) { res.status = 'WRONG CONTENT — no public.profiles/subsystems: this is not the migrated bobcat-dev schema (was script 01 run in bobcat-dev, not production?)'; return res; }
    if (!isDev && hasV2) res.warnings.push('production already contains v2 tables (public.profiles/subsystems)');
    if (!isDev && !names.includes('public.workspace_state')) res.warnings.push('no public.workspace_state — is this the production project?');
  } else if (spec.kind === 'profile') {
    res.summary = `${v.row_count} row(s), ${(v.shape || []).length} JSON paths, ${v.total_json_nodes} nodes`;
  } else if (spec.kind === 'devchild') {
    res.summary = `${(v.purchase_status_history || []).length} history, ${(v.cad_review_versions || []).length} CAD versions, ${(v.cad_review_comments || []).length} CAD comments, ${(v.comment_mentions || []).length} mentions, ${(v.notification_rows || []).length} notifications`;
  } else if (spec.kind === 'devdata') {
    const rc = v.row_counts || {};
    res.summary = `${(v.auth_users || []).length} auth users, ${(v.profiles || []).length} profiles, ${Object.values(rc).reduce((a, b) => a + Number(b), 0)} rows in ${Object.keys(rc).length} tables, ${(v.storage_objects || []).length} storage objects`;
  } else {
    const tr = v.tasks_reconcile || {};
    res.summary = `relational tasks=${tr.relational_count}, jsonb tasks=${tr.jsonb_count}, in both=${tr.ids_in_both}, orders=${v.orders?.count}`;
  }
  if (parsed.notes.length) {
    fs.copyFileSync(p, p + '.orig');
    fs.writeFileSync(p, JSON.stringify(v, null, 1) + '\n');
    res.warnings.push(`normalized in place (${parsed.notes.join('; ')}); original kept as ${spec.file}.orig`);
  }
  res.ok = true; res.status = 'OK'; res.value = v;
  return res;
}

function runOnce(quiet = false) {
  const results = specs.map(check);
  // guard: prod and dev inventories must not be the same paste
  const a = results.find((r) => r.file === 'prod_01_inventory.json'), b = results.find((r) => r.file === 'dev_01_inventory.json');
  if (a?.ok && b?.ok && JSON.stringify(a.value.tables) === JSON.stringify(b.value.tables) && a.value.meta?.inspected_at === b.value.meta?.inspected_at) {
    b.ok = false; b.status = 'WRONG CONTENT — identical to the production inventory (the same result was pasted into both files)';
  }
  if (!quiet) {
    for (const r of results) {
      const opt = specs.find((s) => s.file === r.file)?.optional;
      if (opt && !r.ok && /^(MISSING|EMPTY|PLACEHOLDER)/.test(r.status)) { console.log(`○ ${r.file.padEnd(38)} (optional, not provided yet)`); continue; }
      console.log(`${r.ok ? '✔' : '✘'} ${r.file.padEnd(38)} ${r.status}`);
      if (r.summary) console.log(`    ${r.summary}`);
      for (const w of r.warnings) console.log(`    ⚠ ${w}`);
    }
  }
  return results;
}

const argv = process.argv.slice(2);
const wi = argv.indexOf('--wait');
if (wi === -1) {
  const r = runOnce();
  const req = (x) => !specs.find((s) => s.file === x.file)?.optional;
  const ready = r.filter(req).every((x) => x.ok);
  console.log(ready ? '\nALL REQUIRED RESULT FILES READY.' : '\nNOT READY: ' + r.filter((x) => req(x) && !x.ok).map((x) => x.file).join(', '));
  process.exit(ready ? 0 : 1);
} else {
  const secs = Number(argv[wi + 1]) || 590;
  const end = Date.now() + secs * 1000;
  let lastSig = '';
  while (true) {
    const r = runOnce(true);
    const sig = r.map((x) => x.file + ':' + x.status.slice(0, 20)).join('|');
    if (sig !== lastSig) { lastSig = sig; console.log(new Date().toISOString().slice(11, 19), r.map((x) => (x.ok ? '✔' : '✘') + x.file.replace('.json', '')).join('  ')); }
    if (r.filter((x) => !specs.find((s) => s.file === x.file)?.optional).every((x) => x.ok)) { console.log('\nREADY'); runOnce(); process.exit(0); }
    if (Date.now() > end) { console.log('\nTIMEOUT after ' + secs + 's — still waiting on: ' + r.filter((x) => !x.ok).map((x) => x.file).join(', ')); process.exit(2); }
    await new Promise((res) => setTimeout(res, 5000));
  }
}
