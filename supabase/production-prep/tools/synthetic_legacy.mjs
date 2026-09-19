// Phase 6.8 preparation: a SYNTHETIC copy of the legacy (old live) data, shaped like the real one, for TESTING ONLY.
// It reuses the REAL structure facts from the profile/reconciliation reports (ids, counts, status/priority distributions, key names,
// the BREAK/W8 column, field-length maxima, 10 shared task ids, unknown subsystem ids) but every name/title/PIN is fake.
// Used by rehearse_import.mjs and to measure the worst-case export size. Never connects to any database by itself.
const SUBS = [
  ['drivetrain-fitment', 'Powertrain & Drivetrain Tuning', 3], ['fabrication', 'Fabrication & Vehicle Integration', 4],
  ['front-suspension', 'Front Suspension & Steering', 4], ['pedals-driver-controls', 'Pedal Box & Driver Controls', 4],
  ['rear-suspension-brakes', 'Rear Suspension & Rear Brakes', 4], ['sae-deliverables', 'SAE Deliverables & Costing', 3],
  ['shielding-safety', 'Shielding & Cockpit Safety', 3],
];
const REAL_CATS = ['Footwell Placement & Ergonomics', 'Steering Column & Mechanical Stops', 'Driver Firewall & Underbody Belly Pan', 'Brake Pedal & Balance Bar', 'CVT Rotating Assembly Guard', 'A-Arms & Spherical Bearings', 'Axial Play & Alignment', 'Business Presentation Deck', 'Cost Prototype & Written Report', 'CV Couplers & Tensioners', 'Engine & Fuel Line Restrictor', 'Front Knuckles & Caliper Mounts', 'Component Mounts & Brackets', 'Dampers & Travel Checks', 'Double-Shear Tabs & Internal Sleeves', 'Fuel Tank Shielding & Splash Guard', 'Roll Cage Spec Sheet (RCSS)', 'Throttle Pedal & Cable Pull'];
const pad = (s, n) => (s + ' filler text to reach the observed maximum field length').slice(0, n).padEnd(n, '.');
const RULE = pad('Engineering rule: ', 114);

export function buildSynthetic() {
  // taxonomy: categories per subsystem (3,4,4,4,4,3,3 = 25); the 18 real names first, then filler
  let ci = 0;
  const taxonomy = SUBS.map(([id, name, n], si) => ({
    id, name, lead: ['Lead Alpha', 'Lead Bravo', 'Lead Charlie', 'Lead Delta', 'Lead Echo', 'Lead Foxtrot', 'Lead Golf'][si],
    leadPin: String(1000 + si * 111),                               // FAKE plaintext PINs: the extraction must strip them
    members: id === 'front-suspension' ? ['Member One'] : id === 'pedals-driver-controls' ? ['Member Two'] : id === 'sae-deliverables' ? ['Member Three', 'Member Four'] : [],
    categories: Array.from({ length: n }, () => { const nm = ci < REAL_CATS.length ? REAL_CATS[ci] : `Extra category ${ci - REAL_CATS.length + 1}`; ci++; return { name: nm, rule: RULE }; }),
  }));
  const catsOf = (sid) => taxonomy.find((s) => s.id === sid).categories.map((c) => c.name);

  // workspace_state.tasks: 49 (status 37/11/1, priority 31/9/7/2, subsystems 18/10/8/6/5/2), 7 ISO deadlines, 9 assigned (4 names)
  const wsSubs = [...Array(18).fill('pedals-driver-controls'), ...Array(10).fill('front-suspension'), ...Array(8).fill('shielding-safety'), ...Array(6).fill('drivetrain-fitment'), ...Array(5).fill('sae-deliverables'), ...Array(2).fill('fabrication')];
  const stat = [...Array(37).fill('To Do'), ...Array(11).fill('In Progress'), 'Complete'];
  const prio = [...Array(31).fill('Medium'), ...Array(9).fill('High'), ...Array(7).fill('Critical'), ...Array(2).fill('Low')];
  const shared = ['t18', 't19', 't20', 't21', 't22', 't23', 't24', 't25', 't26', 't27'];      // the 10 ids present in BOTH stores
  const names = ['Person A', 'Person B', 'Person C', 'Person D'];
  const wsTasks = wsSubs.map((sub, i) => {
    const cats = catsOf(sub);
    return {
      id: i < 10 ? shared[i] : `ws-${String(i).padStart(3, '0')}-${'x'.repeat(i % 7)}`.slice(0, 14),
      title: pad(`Task ${i + 1} `, 67 - (i % 30)), subsystemId: sub, category: cats[i % cats.length], priority: prio[(i * 7) % 49], status: stat[(i * 5) % 49],
      assignee: i < 9 ? names[i % 4] : '', deadline: i >= 40 && i < 47 ? `2026-1${(i % 3)}-${String(10 + i - 40).padStart(2, '0')}`.replace('2026-10-1', '2026-10-1') : '', notes: i % 3 === 0 ? pad('Notes ', 79) : '',
    };
  });
  // make priority/status distributions exact regardless of the shuffle above
  wsTasks.forEach((t, i) => { t.status = stat[i]; t.priority = prio[i]; });
  wsTasks.forEach((t, i) => { if (i >= 40 && i < 47) t.deadline = `2026-1${i % 2}-${String(10 + (i - 40)).padStart(2, '0')}`; });

  // relational public.tasks: 30 = the 10 shared ids (diverged copies) + 20 relational-only (the real 20 ids)
  const relOnlyIds = ['t1', 't10', 't11', 't12', 't13', 't14', 't15', 't16', 't17', 't1787328031626', 't1787328873948', 't2', 't28', 't3', 't4', 't5', 't6', 't7', 't8', 't9'];
  const unknown = ['chassis', 'chassis', 'chassis', 'brakes', 'rear-suspension'];                  // 5 relational-only rows use ids that are not in the taxonomy
  const known = ['front-suspension', 'sae-deliverables', 'shielding-safety', 'drivetrain-fitment', 'pedals-driver-controls', 'rear-suspension-brakes'];
  const relPrio = ['Critical', 'High', 'Medium'];
  const relRows = [];
  shared.forEach((id, i) => {
    const w = wsTasks.find((t) => t.id === id);
    relRows.push({ id, title: i < 8 ? w.title + ' (older title)' : w.title, subsystem_id: i === 0 ? 'chassis' : w.subsystemId, category: w.category, priority: w.priority,
      status: i < 5 ? (w.status === 'To Do' ? 'In Progress' : 'To Do') : w.status, assignee: w.assignee, deadline: `2026-09-${String(15 + i).padStart(2, '0')}`, notes: null, created_at: `2026-08-2${i % 5}T15:53:09.480248+00:00` });
  });
  relOnlyIds.forEach((id, i) => {
    const sub = i < 5 ? unknown[i] : known[i % known.length];
    const cats = sub === 'chassis' || sub === 'brakes' || sub === 'rear-suspension' ? ['Welds'] : catsOf(sub);
    relRows.push({ id, title: `Legacy relational task ${id}`, subsystem_id: sub, category: i === 7 || i === 9 ? 'A category that is not in this subsystem' : cats[i % cats.length], priority: relPrio[i % 3],
      status: i === 3 ? 'Complete' : i % 3 === 0 ? 'In Progress' : 'To Do', assignee: i % 4 === 0 ? names[i % 4] : '', deadline: i === 2 ? '2026-10-05' : null, notes: null, created_at: `2026-08-2${1 + (i % 5)}T0${i % 9}:18:08.652548+00:00` });
  });

  const orders = [
    { id: 'o1787624828935', item: pad('Bearing set ', 40), subsystem_id: 'chassis', vendor: 'Vendor One', vendor_url: 'https://example.com/a', part_number: 'PN-1001', qty: 2, unit_price: 12.5, urgency: 'Immediate Need', requested_by: 'Person A', status: 'Requested', submitted_at: '2026-08-25T02:27:00.938229+00:00' },
    { id: 'o1787626195417', item: pad('Steel tubing ', 40), subsystem_id: 'chassis', vendor: 'Vendor Two', vendor_url: 'https://example.com/b', part_number: 'PN-2002', qty: 4, unit_price: 30, urgency: 'Immediate Need', requested_by: 'Person A', status: 'Arrived in Shop', submitted_at: '2026-08-25T02:49:46.991155+00:00' },
  ];
  const subteams = [{ id: 'st_1787328826054', name: pad('Rear suspension crew ', 27), lead: 'Lead Echo', members: ['M1', 'M2', 'M3', 'M4'], subsystem_id: 'rear-suspension' }];
  const cols = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'BREAK', 'W9', 'W10', 'W11', 'W12', 'W13', 'W14', 'W15'].map((k) => ({ key: k, label: k === 'BREAK' ? 'W8' : k, highlight: k === 'W3' ? 'emerald' : 'none' }));
  const cells = { 'drivetrain-fitment': { W4: pad('Drivetrain fitment ', 32) }, fabrication: {}, 'front-suspension': { W4: pad('Front susp ', 18) }, 'pedals-driver-controls': { W4: pad('Pedals ', 18) }, 'rear-suspension-brakes': { W4: pad('Rear ', 13) }, 'shielding-safety': { W4: pad('Shielding ', 21) } };
  const recurring = [{ id: 'rec-123456789012', title: 'Tech Team Sync', dayOfWeek: 2, time: '12:30', color: 'navy' }];
  return { workspace_state: { id: 'bobcat_master_workspace_state', taxonomy, tasks: wsTasks, orders: [], timeline_columns: cols, recurring_events: recurring, timeline_milestones: cells }, relTasks: relRows, orders, subteams };
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
export const LEGACY_DDL = `
create table public.tasks (id text not null primary key, title text not null, subsystem_id text, category text, priority text default 'Medium', status text default 'To Do', assignee text, deadline date, notes text, created_at timestamptz default now());
create table public.orders (id text not null primary key, item text not null, subsystem_id text, vendor text, vendor_url text, part_number text, qty integer default 1, unit_price numeric(10,2) default 0, urgency text default 'Next Batch Order', requested_by text, status text default 'Requested', submitted_at timestamptz default now());
create table public.subteams (id text not null primary key, name text not null, lead text, members text[], subsystem_id text);
create table public.workspace_state (id text not null primary key, taxonomy jsonb, tasks jsonb, orders jsonb, timeline_columns jsonb, recurring_events jsonb, timeline_milestones jsonb, updated_at timestamptz default now());
`;
export function legacyInsertSql(d) {
  const j = (v) => q(JSON.stringify(v)) + '::jsonb';
  const ws = d.workspace_state;
  return [
    `insert into public.workspace_state(id,taxonomy,tasks,orders,timeline_columns,recurring_events,timeline_milestones,updated_at) values (${q(ws.id)},${j(ws.taxonomy)},${j(ws.tasks)},${j(ws.orders)},${j(ws.timeline_columns)},${j(ws.recurring_events)},${j(ws.timeline_milestones)},'2026-09-08T17:09:28.632+00:00');`,
    ...d.relTasks.map((t) => `insert into public.tasks(id,title,subsystem_id,category,priority,status,assignee,deadline,notes,created_at) values (${q(t.id)},${q(t.title)},${q(t.subsystem_id)},${q(t.category)},${q(t.priority)},${q(t.status)},${t.assignee ? q(t.assignee) : 'NULL'},${t.deadline ? q(t.deadline) : 'NULL'},${t.notes ? q(t.notes) : 'NULL'},${q(t.created_at)});`),
    ...d.orders.map((o) => `insert into public.orders(id,item,subsystem_id,vendor,vendor_url,part_number,qty,unit_price,urgency,requested_by,status,submitted_at) values (${q(o.id)},${q(o.item)},${q(o.subsystem_id)},${q(o.vendor)},${q(o.vendor_url)},${q(o.part_number)},${o.qty},${o.unit_price},${q(o.urgency)},${q(o.requested_by)},${q(o.status)},${q(o.submitted_at)});`),
    ...d.subteams.map((s) => `insert into public.subteams(id,name,lead,members,subsystem_id) values (${q(s.id)},${q(s.name)},${q(s.lead)},'{${s.members.map((m) => '"' + m + '"').join(',')}}',${q(s.subsystem_id)});`),
  ].join('\n');
}
