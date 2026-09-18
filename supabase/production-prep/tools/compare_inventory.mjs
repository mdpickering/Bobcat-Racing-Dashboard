// Phase 6.7 helper: diff two outputs of 01_inspect_schema_readonly.sql.
//   node compare_inventory.mjs <A.json> <B.json> [labelA] [labelB]
// Typical use:  A = production inventory, B = bobcat-dev inventory.
//   "only in B"  -> exists in dev, missing in prod  => must be CREATED
//   "only in A"  -> exists in prod, not in dev      => legacy/foreign object (never dropped)
//   "differs"    -> same name, different definition => CONFLICT / ALTER candidate
// Pure read of two local JSON files. No network, no database.
import fs from 'node:fs';

const [fa, fb, la = 'A', lb = 'B'] = process.argv.slice(2);
if (!fa || !fb) { console.error('usage: node compare_inventory.mjs A.json B.json [labelA] [labelB]'); process.exit(1); }
const read = (f) => {
  let t = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').trim();
  let j = JSON.parse(t);
  if (j && j.inventory) j = j.inventory;           // tolerate {"inventory": {...}} wrapping
  if (typeof j === 'string') j = JSON.parse(j);
  return j;
};
const A = read(fa), B = read(fb);

const norm = (v) => JSON.stringify(v ?? null);
const sections = {
  extensions: [(x) => x.name, (x) => x.version],
  tables: [(x) => x.name, (x) => ({ kind: x.kind, rls: x.rls, force_rls: x.force_rls, acl: aclNorm(x.acl) })],
  columns: 'object',
  column_acls: [(x) => x.table + '.' + x.column, (x) => aclNorm(x.acl)],
  constraints: [(x) => x.table + ' :: ' + x.name, (x) => ({ type: x.type, def: x.def })],
  indexes: [(x) => x.table + ' :: ' + x.name, (x) => x.def],
  enums: [(x) => x.type, (x) => x.labels],
  functions: [(x) => x.name + '(' + x.args + ')', (x) => ({ secdef: x.security_definer, lang: x.language, cfg: x.config, returns: x.returns, acl: aclNorm(x.acl) })],
  triggers: [(x) => x.table + ' :: ' + x.name, (x) => ({ enabled: x.enabled, def: x.def })],
  policies: [(x) => x.table + ' :: ' + x.name, (x) => ({ permissive: x.permissive, roles: x.roles, cmd: x.cmd, using: x.using, check: x.check })],
  storage_buckets: [(x) => x.id, (x) => ({ public: x.public, size: x.file_size_limit, mime: x.allowed_mime_types })],
  default_privileges: [(x) => x.for_role + '|' + x.schema + '|' + x.object_type, (x) => aclNorm(x.acl)],
  publications: [(x) => x.publication + ' :: ' + x.table, () => 1],
};
// ACL text like {=X/postgres,anon=X/postgres} -> sorted, grantor-agnostic
function aclNorm(a) {
  if (a == null) return null;
  return String(a).replace(/^\{|\}$/g, '').split(',').map((s) => s.replace(/\/.*$/, '')).sort().join(',');
}

let anyDiff = false;
for (const [name, spec] of Object.entries(sections)) {
  const mapOf = (inv) => {
    const src = inv[name];
    const m = new Map();
    if (spec === 'object') { for (const [k, v] of Object.entries(src || {})) m.set(k, v); }
    else for (const row of src || []) m.set(spec[0](row), spec[1](row));
    return m;
  };
  const ma = mapOf(A), mb = mapOf(B);
  const onlyA = [...ma.keys()].filter((k) => !mb.has(k));
  const onlyB = [...mb.keys()].filter((k) => !ma.has(k));
  const differs = [...ma.keys()].filter((k) => mb.has(k) && norm(ma.get(k)) !== norm(mb.get(k)));
  console.log(`\n=== ${name}: ${la}=${ma.size}  ${lb}=${mb.size}  | only in ${la}: ${onlyA.length}  only in ${lb}: ${onlyB.length}  differs: ${differs.length}`);
  if (onlyA.length) { anyDiff = true; console.log(`  only in ${la}:`); onlyA.forEach((k) => console.log('    - ' + k)); }
  if (onlyB.length && onlyB.length <= 60) { anyDiff = true; console.log(`  only in ${lb}:`); onlyB.forEach((k) => console.log('    + ' + k)); }
  else if (onlyB.length) { anyDiff = true; console.log(`  only in ${lb}: ${onlyB.length} objects (first 10):`); onlyB.slice(0, 10).forEach((k) => console.log('    + ' + k)); }
  for (const k of differs) {
    anyDiff = true;
    console.log(`  differs: ${k}`);
    if (spec === 'object') {
      const sa = new Set(ma.get(k)), sb = new Set(mb.get(k));
      [...sa].filter((c) => !sb.has(c)).forEach((c) => console.log(`      ${la} only: ${c}`));
      [...sb].filter((c) => !sa.has(c)).forEach((c) => console.log(`      ${lb} only: ${c}`));
    } else {
      console.log(`      ${la}: ${norm(ma.get(k)).slice(0, 300)}`);
      console.log(`      ${lb}: ${norm(mb.get(k)).slice(0, 300)}`);
    }
  }
}
console.log(anyDiff ? '\nRESULT: inventories differ (see above).' : '\nRESULT: inventories are identical for all compared sections.');
