// Phase 6.8: statically check the GENERATED import SQL before you paste it anywhere. Reads files only; executes nothing; no database, no network.
//   node check_generated_import_sql.mjs [--dir <folder>] [--no-baseline] [--payload-md5 <md5>]
// Default folder: supabase/production-prep/results/import/   Exit 0 = every check passed, 1 = at least one failed (DO NOT run the files).
// By default it also asserts the counts expected for the REAL production export (63 tasks, 6 held, 29 exceptions, 136 log rows, 7/25/15/5/1, 0 purchases).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTexts } from './import_sql_checks.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const prep = path.resolve(here, '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const dir = path.resolve(arg('--dir') || path.join(prep, 'results', 'import'));
const need = ['40a_import_DRY_RUN.sql', '40b_import_EXECUTE.sql', 'expected.json'];
const missing = need.filter((f) => !fs.existsSync(path.join(dir, f)));
if (missing.length) { console.log('MISSING in ' + dir + ': ' + missing.join(', ') + '\n(the generator leaves nothing behind when its own checks fail - re-run generate_import_sql.mjs)'); process.exit(1); }
const dry = fs.readFileSync(path.join(dir, need[0]), 'utf8'), exec = fs.readFileSync(path.join(dir, need[1]), 'utf8'), expected = JSON.parse(fs.readFileSync(path.join(dir, need[2]), 'utf8'));
let exportObj = null; const ep = path.join(prep, 'results', 'prod_30_source_export.json');
if (fs.existsSync(ep)) { try { exportObj = JSON.parse(fs.readFileSync(ep, 'utf8').replace(/^﻿/, '')); if (typeof exportObj === 'string') exportObj = JSON.parse(exportObj); if (Array.isArray(exportObj)) exportObj = exportObj[0]; if (exportObj.source_export) exportObj = exportObj.source_export; } catch { exportObj = null; } }
let ownerId = null; const dp = path.join(prep, 'results', 'dev_06_data_inventory.json');
if (fs.existsSync(dp)) { try { const d6 = JSON.parse(fs.readFileSync(dp, 'utf8')); const o = d6.profiles.filter((p) => !/@bobcat-test\.dev$/i.test(p.email || '')); if (o.length === 1) ownerId = o[0].id; } catch { /* optional */ } }
const baseline = process.argv.includes('--no-baseline') ? null : { tasks: 63, held_tasks: 6, exceptions_total: 29, migration_log_rows: 136, subsystems: 7, categories: 25, timeline_columns: 15, timeline_milestones: 5, recurring_events: 1, purchase_requests: 0, notifications: 0 };
const res = checkTexts({ dry, exec, expected, exportObj, ownerId, baseline, payloadMd5Ref: arg('--payload-md5') });
let group = '';
for (const r of res) { if (r.group !== group) { group = r.group; console.log(`\n== ${group} ==`); } console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '   [' + r.detail.slice(0, 140) + ']' : ''}`); }
const failed = res.filter((r) => !r.ok);
console.log(`\n${failed.length ? 'FAILED' : 'ALL PASSED'}: ${res.length - failed.length}/${res.length} static checks${failed.length ? ' - DO NOT RUN these files' : ''}`);
console.log(`files: 40a ${dry.split('\n').length} lines / 40b ${exec.split('\n').length} lines | export used: ${exportObj ? 'yes' : 'NO (payload-vs-export check skipped)'} | owner id from inventory 06: ${ownerId ? 'yes' : 'no'}`);
process.exit(failed.length ? 1 : 0);
