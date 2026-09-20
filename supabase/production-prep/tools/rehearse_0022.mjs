// Scratch rehearsal + authorization proof for migration 0022 (purchase link required, CAD/purchase
// delete, task-request review authorization). Applies supabase/migrations/0001-0022 to a CLEAN in-memory
// Postgres (PGlite/WASM) with a minimal Supabase-shaped stub, then exercises every rule as different
// simulated users (SET ROLE authenticated + request.jwt.claim.sub, exactly how RLS sees a PostgREST call).
// Touches no Supabase project, needs no credentials, leaves nothing behind.
//
// Setup (outside the project): mkdir %TEMP%\pg && cd %TEMP%\pg && npm init -y && npm i @electric-sql/pglite
// then copy this file next to that node_modules and run:  node rehearse_0022.mjs <repoRoot>
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
if (!repo) { console.log('usage: node rehearse_0022.mjs <repoRoot>'); process.exit(2); }

const prelude = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid, provider text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(prelude);

const dir = path.join(repo, 'supabase/migrations');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  try { await db.exec('begin;\n' + fs.readFileSync(path.join(dir, f), 'utf8') + '\ncommit;'); }
  catch (e) { console.log('MIGRATION FAIL', f, '->', e.message); process.exit(1); }
}
console.log('applied all migrations OK (0001-0022)\n');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => { if (cond) pass++; else fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   <-- ' + detail}`); };
const section = (t) => console.log(`\n== ${t} ==`);

// ---- simulated users ------------------------------------------------------------------------------------
const U = {
  admin:   '00000000-0000-4000-8000-0000000000a1',
  cto:     '00000000-0000-4000-8000-0000000000c1',
  lead1:   '00000000-0000-4000-8000-000000000101', // team_lead, lead of S1
  lead2:   '00000000-0000-4000-8000-000000000102', // team_lead, lead of S2
  lead3:   '00000000-0000-4000-8000-000000000103', // team_lead role, member of S1 but NOT its lead
  memLead: '00000000-0000-4000-8000-000000000201', // role member, flagged is_lead of S1 in subsystem_members
  member:  '00000000-0000-4000-8000-000000000202', // plain member of S1
  req:     '00000000-0000-4000-8000-000000000203', // plain member of S1 (submits task requests)
};
for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users(id,email) values ($1,$2)`, [id, `${k}@x.test`]);
const roles = { admin: 'admin', cto: 'cto', lead1: 'team_lead', lead2: 'team_lead', lead3: 'team_lead', memLead: 'member', member: 'member', req: 'member' };
for (const [k, r] of Object.entries(roles)) await db.query(`update public.profiles set role=$2, approved=true, active=true where id=$1`, [U[k], r]);
await db.exec(`insert into public.subsystems(id,name) values ('S1','Sub One'),('S2','Sub Two')`);
const sm = (s, k, lead) => db.query(`insert into public.subsystem_members(subsystem_id,user_id,is_lead) values ($1,$2,$3)`, [s, U[k], lead]);
await sm('S1', 'lead1', true); await sm('S2', 'lead2', true); await sm('S1', 'lead3', false);
await sm('S1', 'memLead', true); await sm('S1', 'member', false); await sm('S1', 'req', false);

async function attempt(who, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [U[who]]);
  try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, n: r.affectedRows ?? r.rows.length }; }
  catch (e) { return { ok: false, code: e.code, msg: String(e.message) }; }
  finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub','',false)`); }
}
const su = async (sql, params = []) => (await db.query(sql, params)).rows;
const count = async (t, where = 'true') => Number((await su(`select count(*)::int c from public.${t} where ${where}`))[0].c);

// =======================================================================================================
section('PART 1 - purchase product link required');
const rpc = (who, url, sub = 'S1', title = 'Bearing kit') =>
  attempt(who, `select public.create_purchase_request($1,$2,$3,$4,$5) id`, [sub, title, null, null, url]);

let r = await rpc('lead1', '  https://www.mcmaster.com/6384K11  ');
check('lead can create with a valid https link', r.ok, r.msg);
const prA = r.ok ? r.rows[0].id : null;
check('request + first line item created atomically', prA && (await count('purchase_request_items', `purchase_request_id='${prA}'`)) === 1);
check('link is stored trimmed', prA && (await su(`select link from public.purchase_request_items where purchase_request_id='${prA}'`))[0].link === 'https://www.mcmaster.com/6384K11');
check('status starts Draft', prA && (await su(`select status from public.purchase_requests where id='${prA}'`))[0].status === 'Draft');

for (const bad of [null, '', '   ', 'not a url', 'www.example.com', 'ftp://files.example.com/x', 'javascript:alert(1)', 'https://', 'http://localhost:3000/x', 'https://exa mple.com', 'https://nodot', 'data:text/html,hi', 'https://a.com/' + 'x'.repeat(2100)]) {
  const x = await rpc('lead1', bad);
  check(`RPC rejects link ${JSON.stringify(bad && bad.length > 40 ? bad.slice(0, 20) + '...' : bad)}`, !x.ok && x.code === '23514', JSON.stringify(x));
}
for (const good of ['http://example.com', 'https://example.com/a/b?c=1&d=2#frag', 'https://www.amazon.com/dp/B000', 'http://example.com:8080/x', 'HTTPS://EXAMPLE.COM']) {
  const x = await rpc('lead1', good);
  check(`RPC accepts link ${good}`, x.ok, JSON.stringify(x));
}
const before = await count('purchase_requests');
const bare = await attempt('lead1', `insert into public.purchase_requests(subsystem_id,title) values ('S1','no link at all') returning id`);
check('raw REST insert of a bare request (bypassing the RPC) is rejected at commit', !bare.ok && bare.code === '23514', JSON.stringify(bare));
check('...and leaves no row behind', (await count('purchase_requests')) === before);
const badItem = await attempt('lead1', `insert into public.purchase_request_items(purchase_request_id,description,link) values ($1,'x',null)`, [prA]);
check('raw insert of an item with no link is rejected', !badItem.ok && badItem.code === '23514', JSON.stringify(badItem));
const badItem2 = await attempt('lead1', `insert into public.purchase_request_items(purchase_request_id,description,link) values ($1,'x','ftp://a.com/x')`, [prA]);
check('raw insert of an item with a non-http link is rejected', !badItem2.ok && badItem2.code === '23514');
const itemId = (await su(`select id from public.purchase_request_items where purchase_request_id='${prA}'`))[0].id;
const blankUpd = await attempt('lead1', `update public.purchase_request_items set link='' where id=$1`, [itemId]);
check('clearing an existing link is rejected', !blankUpd.ok && blankUpd.code === '23514');
const qtyUpd = await attempt('lead1', `update public.purchase_request_items set quantity=3 where id=$1`, [itemId]);
check('editing another column (quantity) still works', qtyUpd.ok && qtyUpd.n === 1, JSON.stringify(qtyUpd));
const delLast = await attempt('lead1', `delete from public.purchase_request_items where id=$1`, [itemId]);
check('deleting the last linked item is rejected', !delLast.ok && delLast.code === '23514', JSON.stringify(delLast));
const add2 = await attempt('lead1', `insert into public.purchase_request_items(purchase_request_id,description,link) values ($1,'second','https://b.example.com/y')`, [prA]);
check('adding a second linked item works', add2.ok, JSON.stringify(add2));
const del1 = await attempt('lead1', `delete from public.purchase_request_items where id=$1`, [itemId]);
check('...and then the first can be removed (one linked item remains)', del1.ok && del1.n === 1, JSON.stringify(del1));
check('member (not a lead) cannot create a request', !(await rpc('member', 'https://ok.example.com/x')).ok);
check('lead of another subsystem cannot create in S1', !(await rpc('lead2', 'https://ok.example.com/x', 'S1')).ok);
check('admin can create in any subsystem', (await rpc('admin', 'https://ok.example.com/x', 'S2')).ok);
check('anon cannot execute create_purchase_request', await (async () => { await db.exec('set role anon'); try { await db.query(`select public.create_purchase_request('S1','t',null,null,'https://a.com')`); return false; } catch { return true; } finally { await db.exec('reset role'); } })());

// =======================================================================================================
section('PART 2a - purchase request delete');
const mkPr = async (who, sub = 'S1') => (await rpc(who, 'https://shop.example.com/item', sub, 'PR ' + Math.random().toString(36).slice(2, 6))).rows[0].id;

const pDraft = await mkPr('lead1');
await su(`insert into public.notifications(user_id,type,title,entity_type,entity_id) values ($1,'purchase_status','n','purchase_request',$2)`, [U.lead1, pDraft]);
await su(`insert into public.notifications(user_id,type,title,entity_type,entity_id) values ($1,'purchase_status','keep me','purchase_request',$2)`, [U.lead1, prA]);
const histBefore = await count('purchase_status_history', `purchase_request_id='${pDraft}'`);
check('draft has a status-history row to cascade', histBefore >= 1);

let d = await attempt('member', `delete from public.purchase_requests where id=$1`, [pDraft]);
check('plain member cannot delete (0 rows)', d.ok && d.n === 0);
d = await attempt('lead2', `delete from public.purchase_requests where id=$1`, [pDraft]);
check("another subsystem's lead cannot delete (0 rows)", d.ok && d.n === 0);
d = await attempt('memLead', `delete from public.purchase_requests where id=$1`, [pDraft]);
check("a member-role user flagged lead cannot delete someone else's draft (0 rows)", d.ok && d.n === 0);
d = await attempt('lead1', `delete from public.purchase_requests where id=$1`, [pDraft]);
check('creator can delete their own Draft (1 row)', d.ok && d.n === 1, JSON.stringify(d));
check('items cascaded', (await count('purchase_request_items', `purchase_request_id='${pDraft}'`)) === 0);
check('status history cascaded', (await count('purchase_status_history', `purchase_request_id='${pDraft}'`)) === 0);
check('its notifications removed (no dangling reference)', (await count('notifications', `entity_id='${pDraft}'`)) === 0);
check("an unrelated request's notification is untouched", (await count('notifications', `entity_id='${prA}'`)) === 1);
check('unrelated request still exists', (await count('purchase_requests', `id='${prA}'`)) === 1);

const pSub = await mkPr('lead1');
await attempt('lead1', `update public.purchase_requests set status='Submitted' where id=$1`, [pSub]);
d = await attempt('lead1', `delete from public.purchase_requests where id=$1`, [pSub]);
check('creator can NOT delete once it left Draft (0 rows)', d.ok && d.n === 0);
d = await attempt('cto', `delete from public.purchase_requests where id=$1`, [pSub]);
check('CTO can delete a non-Draft request (1 row)', d.ok && d.n === 1, JSON.stringify(d));

const pOld = await mkPr('lead1');
await su(`update public.purchase_requests set legacy_id='LEGACY-1' where id=$1`, [pOld]);
d = await attempt('admin', `delete from public.purchase_requests where id=$1`, [pOld]);
check('admin can NOT delete an imported (legacy_id) request (0 rows)', d.ok && d.n === 0);
d = await attempt('cto', `delete from public.purchase_requests where id=$1`, [pOld]);
check('CTO can NOT delete an imported request (0 rows)', d.ok && d.n === 0);
check('imported request untouched', (await count('purchase_requests', `id='${pOld}'`)) === 1);

const pAdm = await mkPr('lead1');
d = await attempt('admin', `delete from public.purchase_requests where id=$1`, [pAdm]);
check('admin can delete a Draft it did not create (1 row)', d.ok && d.n === 1);
d = await attempt('admin', `delete from public.purchase_requests`);
check('a blanket delete by admin only removes deletable rows (imported + others untouched)', d.ok && (await count('purchase_requests', `id='${pOld}'`)) === 1);

// =======================================================================================================
section('PART 2b - CAD review delete');
const mkCad = async (who, title = 'CAD ' + Math.random().toString(36).slice(2, 6)) => {
  const x = await attempt(who, `insert into public.cad_reviews(subsystem_id,title) values ('S1',$1) returning id`, [title]);
  if (!x.ok) throw new Error('cad insert failed: ' + x.msg);
  const id = x.rows[0].id;
  const v = await attempt(who, `insert into public.cad_review_versions(cad_review_id,external_cad_link) values ($1,'https://cad.example.com/a')`, [id]);
  if (!v.ok) throw new Error('version insert failed: ' + v.msg);
  return id;
};
const c1 = await mkCad('member');
await su(`insert into public.notifications(user_id,type,title,entity_type,entity_id) values ($1,'cad_review','n','cad_review',$2)`, [U.member, c1]);
d = await attempt('req', `delete from public.cad_reviews where id=$1`, [c1]);
check("another member cannot delete someone's draft review (0 rows)", d.ok && d.n === 0);
d = await attempt('lead1', `delete from public.cad_reviews where id=$1`, [c1]);
check("the subsystem's lead cannot delete a member's review (0 rows)", d.ok && d.n === 0);
d = await attempt('member', `delete from public.cad_reviews where id=$1`, [c1]);
check('creator can delete their own Draft review (1 row)', d.ok && d.n === 1, JSON.stringify(d));
check('versions cascaded', (await count('cad_review_versions', `cad_review_id='${c1}'`)) === 0);
check('its notifications removed', (await count('notifications', `entity_id='${c1}'`)) === 0);

const c2 = await mkCad('member');
await attempt('lead1', `insert into public.cad_review_comments(cad_review_id,comment) values ($1,'please fix')`, [c2]);
d = await attempt('member', `delete from public.cad_reviews where id=$1`, [c2]);
check("creator can NOT delete a draft once someone else commented (0 rows)", d.ok && d.n === 0);
d = await attempt('admin', `delete from public.cad_reviews where id=$1`, [c2]);
check('admin can delete it; comments + versions cascade (1 row)', d.ok && d.n === 1 && (await count('cad_review_comments', `cad_review_id='${c2}'`)) === 0 && (await count('cad_review_versions', `cad_review_id='${c2}'`)) === 0, JSON.stringify(d));

const c3 = await mkCad('member');
await attempt('member', `update public.cad_reviews set status='Submitted for Review' where id=$1`, [c3]);
d = await attempt('member', `delete from public.cad_reviews where id=$1`, [c3]);
check('creator can NOT delete once submitted for review (0 rows)', d.ok && d.n === 0);
d = await attempt('cto', `delete from public.cad_reviews where id=$1`, [c3]);
check('CTO can delete a submitted review (1 row)', d.ok && d.n === 1);

const c4 = await mkCad('member');
await su(`update public.cad_reviews set legacy_id='LEGACY-CAD' where id=$1`, [c4]);
d = await attempt('admin', `delete from public.cad_reviews where id=$1`, [c4]);
check('admin can NOT delete an imported CAD review (0 rows)', d.ok && d.n === 0);
check('imported CAD review untouched', (await count('cad_reviews', `id='${c4}'`)) === 1);
check('anon has no delete privilege', await (async () => { await db.exec('set role anon'); try { await db.query(`delete from public.cad_reviews`); return false; } catch { return true; } finally { await db.exec('reset role'); } })());

// =======================================================================================================
section('PART 3 - task-request approval authorization');
console.log('can_review_task_request(subsystem) by user, S1 / S2:');
const expected = { admin: [true, true], cto: [true, true], lead1: [true, false], lead2: [false, true], lead3: [false, false], memLead: [false, false], member: [false, false], req: [false, false] };
for (const who of Object.keys(expected)) {
  const a = await attempt(who, `select public.can_review_task_request('S1') s1, public.can_review_task_request('S2') s2`);
  const got = [a.rows[0].s1, a.rows[0].s2];
  console.log(`   ${who.padEnd(8)} role=${roles[who].padEnd(9)} S1=${got[0]}  S2=${got[1]}`);
  check(`rule for ${who}`, got[0] === expected[who][0] && got[1] === expected[who][1], JSON.stringify(got));
}
const mkReq = async (sub = 'S1', title = 'Req ' + Math.random().toString(36).slice(2, 6)) => {
  const x = await attempt('req', `insert into public.task_requests(subsystem_id,title,description) values ($1,$2,'d') returning id`, [sub, title]);
  if (!x.ok) throw new Error('request insert failed: ' + x.msg);
  return x.rows[0].id;
};
const review = (who, id, dec) => attempt(who, `select public.review_task_request($1,$2) task_id`, [id, dec]);
const tasksBefore = await count('tasks');

const q1 = await mkReq();
for (const who of ['req', 'member', 'memLead', 'lead2', 'lead3']) {
  const x = await review(who, q1, 'approved');
  check(`RPC approve as ${who} (${roles[who]}) -> authorization error 42501`, !x.ok && x.code === '42501', JSON.stringify(x));
}
check('no task was created by any denied attempt', (await count('tasks')) === tasksBefore);
check('request is still pending', (await su(`select status from public.task_requests where id='${q1}'`))[0].status === 'pending');

for (const who of ['req', 'member', 'memLead', 'lead2', 'lead3']) {
  const x = await attempt(who, `update public.task_requests set status='approved' where id=$1`, [q1]);
  check(`direct UPDATE approve as ${who} is blocked (0 rows)`, x.ok ? x.n === 0 : true, JSON.stringify(x));
}
check('request still pending after direct-update attempts', (await su(`select status from public.task_requests where id='${q1}'`))[0].status === 'pending');
const dec = await review('memLead', q1, 'declined');
check('RPC decline as member-role lead-flagged user also denied', !dec.ok && dec.code === '42501');
const badDec = await review('lead1', q1, 'maybe');
check('RPC rejects an invalid decision value', !badDec.ok);
check('anon cannot execute review_task_request', await (async () => { await db.exec('set role anon'); try { await db.query(`select public.review_task_request(gen_random_uuid(),'approved')`); return false; } catch { return true; } finally { await db.exec('reset role'); } })());

const ok = await review('lead1', q1, 'approved');
check('team lead of the subsystem CAN approve', ok.ok && ok.rows[0].task_id, JSON.stringify(ok));
const row = (await su(`select status, converted_task_id, reviewed_by, reviewed_at from public.task_requests where id='${q1}'`))[0];
check('request approved and linked to the new task', row.status === 'approved' && row.converted_task_id === ok.rows[0].task_id);
check('reviewed_by is the approver, reviewed_at set (server-derived)', row.reviewed_by === U.lead1 && row.reviewed_at);
check('exactly one task created', (await count('tasks')) === tasksBefore + 1);
check('task copied title/subsystem', (await su(`select subsystem_id from public.tasks where id='${ok.rows[0].task_id}'`))[0].subsystem_id === 'S1');
check('requester was notified (existing trigger still works)', (await count('notifications', `entity_type='task_request' and entity_id='${q1}'`)) === 1);
const again = await review('lead1', q1, 'approved');
check('re-reviewing a decided request is refused (no second task)', !again.ok && (await count('tasks')) === tasksBefore + 1, JSON.stringify(again));

const q2 = await mkReq('S2');
const cross = await review('lead1', q2, 'approved');
check('team lead of S1 cannot review an S2 request', !cross.ok && cross.code === '42501');
const q3 = await mkReq('S1');
const cto = await review('cto', q3, 'approved');
check('CTO can approve', cto.ok && cto.rows[0].task_id);
const q4 = await mkReq('S2');
const adm = await review('admin', q4, 'declined');
check('admin can decline; no task created for a decline', adm.ok && adm.rows[0].task_id === null && (await su(`select status from public.task_requests where id='${q4}'`))[0].status === 'declined');
const q5 = await mkReq('S2');
const l2 = await review('lead2', q5, 'approved');
check("S2's team lead can approve an S2 request", l2.ok && l2.rows[0].task_id);

const q6 = await mkReq('S1');
await attempt('lead1', `update public.task_requests set status='declined', reviewed_by=$2, reviewed_at='2001-01-01' where id=$1`, [q6, U.admin]);
const forged = (await su(`select status, reviewed_by, reviewed_at from public.task_requests where id='${q6}'`))[0];
check('a lead cannot forge reviewed_by / reviewed_at (server overrides them)', forged.status === 'declined' && forged.reviewed_by === U.lead1 && new Date(forged.reviewed_at).getFullYear() === new Date().getFullYear(), JSON.stringify(forged));

await su(`update public.profiles set active=false where id=$1`, [U.lead1]);
const q7 = await mkReq('S1');
const inactive = await review('lead1', q7, 'approved');
check('a deactivated team lead cannot approve', !inactive.ok);
await su(`update public.profiles set active=true where id=$1`, [U.lead1]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
