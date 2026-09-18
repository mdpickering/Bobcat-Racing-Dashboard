-- =========================================================
-- 03_reconcile_legacy_data_readonly.sql
-- Phase 6.7: READ-ONLY reconciliation facts the data mapping depends on.
-- NOT a migration. One single SELECT statement; cannot modify anything.
--
-- Answers, for public.tasks / public.orders / public.subteams / public.workspace_state:
--   Q1  Is the relational public.tasks table the same data as workspace_state.tasks (49)?
--   Q2  What legacy order statuses / urgencies / subsystems exist (public.orders)?
--   Q3  What do subteams look like relative to workspace_state.taxonomy?
--   Q4  Would legacy tasks pass the new schema's rules (subsystem exists; category belongs to
--       that subsystem; deadline parses)? Any duplicate names/ids?
--   Q5  Timeline: real column keys, highlight values, milestone cells, orphans.
--   Q6  Recurring events: day/time/color values.
--
-- Privacy: returns ids, counts, dates and enum-like/org-taxonomy values (subsystem ids/names,
-- category names, statuses, colors). It does NOT return task titles/notes, assignee or requester
-- names, vendor names/URLs, lead names, members, or leadPin values (only whether they exist).
--
-- Save the single-cell JSON result as:
--   supabase/production-prep/results/prod_03_reconcile.json
-- =========================================================
with
ws as (select * from public.workspace_state limit 1),
jt as (
  select t.value as j
  from ws, jsonb_array_elements(coalesce(ws.tasks, '[]'::jsonb)) as t(value)
),
rt as (select * from public.tasks),
tax as (
  select s.value as s
  from ws, jsonb_array_elements(coalesce(ws.taxonomy, '[]'::jsonb)) as s(value)
),
cats as (
  select tax.s ->> 'id' as sid, c.value ->> 'name' as cname
  from tax, jsonb_array_elements(coalesce(tax.s -> 'categories', '[]'::jsonb)) as c(value)
),
tcols as (
  select c.value as c
  from ws, jsonb_array_elements(coalesce(ws.timeline_columns, '[]'::jsonb)) as c(value)
),
cells as (
  select sub.key as sid, cell.key as col, length(cell.value #>> '{}') as text_len
  from ws,
       jsonb_each(case when jsonb_typeof(ws.timeline_milestones) = 'object' then ws.timeline_milestones else '{}'::jsonb end) as sub,
       jsonb_each(case when jsonb_typeof(sub.value) = 'object' then sub.value else '{}'::jsonb end) as cell
),
recur as (
  select r.value as r
  from ws, jsonb_array_elements(coalesce(ws.recurring_events, '[]'::jsonb)) as r(value)
)
select jsonb_build_object(

  'workspace_state', (select jsonb_build_object(
      'id', ws.id, 'updated_at', ws.updated_at,
      'rows_in_table', (select count(*) from public.workspace_state),
      'orders_array_length', jsonb_array_length(coalesce(ws.orders, '[]'::jsonb))
    ) from ws),

  -- Drift detection: the legacy tables are writable by anyone holding the public key, so the source
  -- can change between inspection and import. Re-run this script right before the import and compare
  -- these hashes (they reveal nothing about the content).
  'fingerprints', jsonb_build_object(
    'ws_tasks', (select md5(tasks::text) from ws),
    'ws_taxonomy', (select md5(taxonomy::text) from ws),
    'ws_orders', (select md5(orders::text) from ws),
    'ws_timeline_columns', (select md5(timeline_columns::text) from ws),
    'ws_recurring_events', (select md5(recurring_events::text) from ws),
    'ws_timeline_milestones', (select md5(timeline_milestones::text) from ws),
    'ws_updated_at', (select updated_at from ws),
    'tbl_tasks', (select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from public.tasks t),
    'tbl_orders', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from public.orders o),
    'tbl_subteams', (select md5(coalesce(string_agg(s::text, '|' order by s.id), '')) from public.subteams s)
  ),

  -- Q1 -----------------------------------------------------------------
  'tasks_reconcile', jsonb_build_object(
    'relational_count', (select count(*) from rt),
    'jsonb_count', (select count(*) from jt),
    'jsonb_distinct_ids', (select count(distinct j ->> 'id') from jt),
    'jsonb_duplicate_ids', (select coalesce(jsonb_agg(id), '[]'::jsonb)
                            from (select j ->> 'id' as id from jt group by 1 having count(*) > 1) d),
    'ids_in_both', (select count(*) from rt where rt.id in (select j ->> 'id' from jt)),
    'only_in_relational_ids', (select coalesce(jsonb_agg(rt.id order by rt.id), '[]'::jsonb)
                               from rt where rt.id not in (select j ->> 'id' from jt)),
    'only_in_jsonb_count', (select count(*) from jt where (j ->> 'id') not in (select id from rt)),
    'both_status_differs', (select count(*) from rt join jt on rt.id = jt.j ->> 'id'
                            where rt.status is distinct from jt.j ->> 'status'),
    'both_title_differs', (select count(*) from rt join jt on rt.id = jt.j ->> 'id'
                           where rt.title is distinct from jt.j ->> 'title'),
    'both_assignee_differs', (select count(*) from rt join jt on rt.id = jt.j ->> 'id'
                              where coalesce(rt.assignee, '') is distinct from coalesce(jt.j ->> 'assignee', '')),
    'both_subsystem_differs', (select count(*) from rt join jt on rt.id = jt.j ->> 'id'
                               where coalesce(rt.subsystem_id, '') is distinct from coalesce(jt.j ->> 'subsystemId', '')),
    'both_deadline_differs', (select count(*) from rt join jt on rt.id = jt.j ->> 'id'
                              where coalesce(rt.deadline::text, '') is distinct from coalesce(jt.j ->> 'deadline', '')),
    'relational_status_values', (select coalesce(jsonb_object_agg(coalesce(status, '(null)'), n), '{}'::jsonb)
                                 from (select status, count(*) as n from rt group by status) x),
    'relational_priority_values', (select coalesce(jsonb_object_agg(coalesce(priority, '(null)'), n), '{}'::jsonb)
                                   from (select priority, count(*) as n from rt group by priority) x),
    'relational_subsystem_values', (select coalesce(jsonb_object_agg(coalesce(subsystem_id, '(null)'), n), '{}'::jsonb)
                                    from (select subsystem_id, count(*) as n from rt group by subsystem_id) x),
    'relational_created_at_range', (select jsonb_build_object('min', min(created_at), 'max', max(created_at)) from rt)
  ),

  -- Q2 -----------------------------------------------------------------
  'orders', jsonb_build_object(
    'count', (select count(*) from public.orders),
    'ids', (select coalesce(jsonb_agg(id order by id), '[]'::jsonb) from public.orders),
    'status_values', (select coalesce(jsonb_object_agg(coalesce(status, '(null)'), n), '{}'::jsonb)
                      from (select status, count(*) as n from public.orders group by status) x),
    'urgency_values', (select coalesce(jsonb_object_agg(coalesce(urgency, '(null)'), n), '{}'::jsonb)
                       from (select urgency, count(*) as n from public.orders group by urgency) x),
    'subsystem_values', (select coalesce(jsonb_object_agg(coalesce(subsystem_id, '(null)'), n), '{}'::jsonb)
                         from (select subsystem_id, count(*) as n from public.orders group by subsystem_id) x),
    'blank_requested_by', (select count(*) from public.orders where coalesce(trim(requested_by), '') = ''),
    'distinct_requested_by', (select count(distinct requested_by) from public.orders),
    'with_vendor_url', (select count(*) from public.orders where coalesce(trim(vendor_url), '') <> ''),
    'with_part_number', (select count(*) from public.orders where coalesce(trim(part_number), '') <> ''),
    'qty_min_max', (select jsonb_build_object('min', min(qty), 'max', max(qty)) from public.orders),
    'zero_or_null_price', (select count(*) from public.orders where coalesce(unit_price, 0) = 0),
    'submitted_at_range', (select jsonb_build_object('min', min(submitted_at), 'max', max(submitted_at)) from public.orders)
  ),

  -- Q3 -----------------------------------------------------------------
  'subteams', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'subsystem_id', subsystem_id, 'name_length', length(name),
      'lead_present', coalesce(trim(lead), '') <> '',
      'members_count', coalesce(array_length(members, 1), 0),
      'subsystem_id_in_taxonomy', subsystem_id in (select s ->> 'id' from tax)
    ) order by id), '[]'::jsonb) from public.subteams),

  'taxonomy', jsonb_build_object(
    'subsystems', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s ->> 'id',
        'name', s ->> 'name',
        'categories', jsonb_array_length(coalesce(s -> 'categories', '[]'::jsonb)),
        'members_count', jsonb_array_length(coalesce(s -> 'members', '[]'::jsonb)),
        'lead_present', coalesce(trim(s ->> 'lead'), '') <> '',
        'lead_pin_present', coalesce(trim(s ->> 'leadPin'), '') <> ''
      ) order by s ->> 'id'), '[]'::jsonb) from tax),
    'duplicate_subsystem_names', (select coalesce(jsonb_agg(n), '[]'::jsonb)
                                  from (select s ->> 'name' as n from tax group by 1 having count(*) > 1) d),
    'duplicate_category_names_within_subsystem', (select coalesce(jsonb_agg(jsonb_build_object('subsystem', sid, 'name', cname)), '[]'::jsonb)
                                                  from (select sid, cname from cats group by sid, cname having count(*) > 1) d),
    'category_total', (select count(*) from cats)
  ),

  -- Q4 -----------------------------------------------------------------
  'task_rules_check', jsonb_build_object(
    'tasks_total', (select count(*) from jt),
    'unknown_subsystem_count', (select count(*) from jt where (j ->> 'subsystemId') not in (select s ->> 'id' from tax)),
    'unknown_subsystem_values', (select coalesce(jsonb_agg(distinct j ->> 'subsystemId'), '[]'::jsonb)
                                 from jt where (j ->> 'subsystemId') not in (select s ->> 'id' from tax)),
    'category_not_in_own_subsystem_count', (select count(*) from jt
        where not exists (select 1 from cats where cats.sid = jt.j ->> 'subsystemId' and cats.cname = jt.j ->> 'category')),
    'category_not_in_own_subsystem_pairs', (select coalesce(jsonb_agg(jsonb_build_object('subsystem', sub, 'category', cat, 'n', n)), '[]'::jsonb)
        from (select j ->> 'subsystemId' as sub, j ->> 'category' as cat, count(*) as n from jt
              where not exists (select 1 from cats where cats.sid = jt.j ->> 'subsystemId' and cats.cname = jt.j ->> 'category')
              group by 1, 2) p),
    'category_found_in_other_subsystem_count', (select count(*) from jt
        where not exists (select 1 from cats where cats.sid = jt.j ->> 'subsystemId' and cats.cname = jt.j ->> 'category')
          and exists (select 1 from cats where cats.cname = jt.j ->> 'category')),
    'blank_category_count', (select count(*) from jt where coalesce(trim(j ->> 'category'), '') = ''),
    'blank_deadline_count', (select count(*) from jt where coalesce(trim(j ->> 'deadline'), '') = ''),
    'non_iso_deadline_values', (select coalesce(jsonb_agg(distinct j ->> 'deadline'), '[]'::jsonb)
        from jt where coalesce(trim(j ->> 'deadline'), '') <> '' and (j ->> 'deadline') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
    'iso_deadline_range', (select jsonb_build_object('min', min(j ->> 'deadline'), 'max', max(j ->> 'deadline'))
        from jt where (j ->> 'deadline') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
    'blank_assignee_count', (select count(*) from jt where coalesce(trim(j ->> 'assignee'), '') = ''),
    'distinct_nonblank_assignees', (select count(distinct trim(j ->> 'assignee')) from jt where coalesce(trim(j ->> 'assignee'), '') <> ''),
    'assignee_shared_by_multiple_tasks_count', (select count(*) from (
        select trim(j ->> 'assignee') from jt where coalesce(trim(j ->> 'assignee'), '') <> ''
        group by 1 having count(*) > 1) m),
    'duplicate_titles_within_subsystem', (select count(*) from (
        select j ->> 'subsystemId', j ->> 'title' from jt group by 1, 2 having count(*) > 1) d),
    'id_length_min_max', (select jsonb_build_object('min', min(length(j ->> 'id')), 'max', max(length(j ->> 'id'))) from jt),
    'status_values', (select coalesce(jsonb_object_agg(coalesce(s, '(null)'), n), '{}'::jsonb)
        from (select j ->> 'status' as s, count(*) as n from jt group by 1) x),
    'status_values_not_in_new_enum', (select coalesce(jsonb_agg(distinct j ->> 'status'), '[]'::jsonb)
        from jt where (j ->> 'status') is null or (j ->> 'status') not in ('To Do', 'In Progress', 'Blocked', 'Review', 'Complete')),
    'priority_values_not_in_new_enum', (select coalesce(jsonb_agg(distinct j ->> 'priority'), '[]'::jsonb)
        from jt where (j ->> 'priority') is null or (j ->> 'priority') not in ('Critical', 'High', 'Medium', 'Low'))
  ),

  -- Q5 -----------------------------------------------------------------
  'timeline', jsonb_build_object(
    'columns', (select coalesce(jsonb_agg(jsonb_build_object(
        'key', c ->> 'key', 'label', c ->> 'label', 'highlight', c -> 'highlight'
      )), '[]'::jsonb) from tcols),
    'highlight_values', (select coalesce(jsonb_object_agg(coalesce(h, '(null)'), n), '{}'::jsonb)
        from (select c ->> 'highlight' as h, count(*) as n from tcols group by 1) x),
    'duplicate_keys', (select coalesce(jsonb_agg(k), '[]'::jsonb)
        from (select c ->> 'key' as k from tcols group by 1 having count(*) > 1) d),
    'cells', (select coalesce(jsonb_agg(jsonb_build_object('subsystem', sid, 'column', col, 'text_length', text_len)
                                        order by sid, col), '[]'::jsonb) from cells),
    'cells_with_unknown_subsystem', (select count(*) from cells where sid not in (select s ->> 'id' from tax)),
    'cells_with_unknown_column', (select count(*) from cells where col not in (select c ->> 'key' from tcols)),
    'subsystems_in_milestones_object', (select coalesce(jsonb_agg(distinct sid), '[]'::jsonb) from (
        select sub.key as sid
        from ws, jsonb_each(case when jsonb_typeof(ws.timeline_milestones) = 'object' then ws.timeline_milestones else '{}'::jsonb end) as sub) z)
  ),

  -- Q6 -----------------------------------------------------------------
  'recurring_events', (select coalesce(jsonb_agg(jsonb_build_object(
      'id_length', length(r ->> 'id'), 'title_length', length(r ->> 'title'),
      'dayOfWeek', r -> 'dayOfWeek', 'time', r ->> 'time', 'color', r ->> 'color',
      'other_keys', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(r) k
                     where k not in ('id', 'title', 'dayOfWeek', 'time', 'color'))
    )), '[]'::jsonb) from recur)

) as reconcile;
