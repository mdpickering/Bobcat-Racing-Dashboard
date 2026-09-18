-- =========================================================
-- 05_tasks_side_by_side_readonly.sql
-- Phase 6.7: READ-ONLY side-by-side report for the legacy tasks reconciliation. NOT a migration.
-- One single SELECT statement; cannot modify anything.
--
-- WHY: script 03 showed production keeps TWO task datasets that only partly overlap and have
-- diverged: public.tasks (30 rows) vs workspace_state.tasks (49 rows), 10 ids in common, and on those
-- 10 the titles/statuses/deadlines/subsystems differ. Counts cannot say which side is right — a human
-- must look at the actual rows. This script produces that report, plus the unknown-subsystem aliases.
--
-- Returns: task ids, titles, status, priority, deadline, subsystem id, category name, created_at.
-- Does NOT return: assignee names (only a blank/non-blank flag), notes, vendors, lead/member names, PINs.
-- Task titles ARE returned (they are needed to compare rows) — keep the saved file local: it lives in the
-- git-ignored results/ folder and does not need to be pasted anywhere.
--
-- Save the single-cell JSON result as:
--   supabase/production-prep/results/prod_05_tasks_side_by_side.json
-- =========================================================
with
ws as (select * from public.workspace_state limit 1),
jt as (
  select t.value as j
  from ws, jsonb_array_elements(coalesce(ws.tasks, '[]'::jsonb)) as t(value)
),
tax as (
  select s.value as s
  from ws, jsonb_array_elements(coalesce(ws.taxonomy, '[]'::jsonb)) as s(value)
),
cats as (
  select tax.s ->> 'id' as sid, c.value ->> 'name' as cname
  from tax, jsonb_array_elements(coalesce(tax.s -> 'categories', '[]'::jsonb)) as c(value)
),
rt as (select * from public.tasks),
sub_refs as (
  select 'tasks' as src, subsystem_id from public.tasks
  union all select 'orders', subsystem_id from public.orders
  union all select 'subteams', subsystem_id from public.subteams
)
select jsonb_build_object(

  'taxonomy_subsystem_ids', (select coalesce(jsonb_agg(s ->> 'id' order by s ->> 'id'), '[]'::jsonb) from tax),

  -- legacy subsystem ids that do not exist in the taxonomy (need an explicit human mapping)
  'unknown_subsystem_ids', (select coalesce(jsonb_agg(jsonb_build_object('subsystem_id', subsystem_id, 'source', src, 'rows', n)
                                                    order by subsystem_id, src), '[]'::jsonb)
                            from (select src, subsystem_id, count(*) as n from sub_refs
                                  where subsystem_id is not null and subsystem_id not in (select s ->> 'id' from tax)
                                  group by src, subsystem_id) u),

  'relational_rows', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', rt.id,
      'also_in_workspace_state', exists (select 1 from jt where j ->> 'id' = rt.id),
      'title', rt.title,
      'subsystem_id', rt.subsystem_id,
      'subsystem_in_taxonomy', rt.subsystem_id in (select s ->> 'id' from tax),
      'category', rt.category,
      'category_in_own_subsystem', exists (select 1 from cats where cats.sid = rt.subsystem_id and cats.cname = rt.category),
      'category_in_any_subsystem', exists (select 1 from cats where cats.cname = rt.category),
      'status', rt.status,
      'priority', rt.priority,
      'deadline', rt.deadline,
      'created_at', rt.created_at,
      'assignee_blank', coalesce(trim(rt.assignee), '') = ''
    ) order by rt.id), '[]'::jsonb) from rt),

  'overlap_pairs', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', rt.id,
      'title', jsonb_build_object('relational', rt.title, 'workspace_state', jt.j ->> 'title'),
      'status', jsonb_build_object('relational', rt.status, 'workspace_state', jt.j ->> 'status'),
      'priority', jsonb_build_object('relational', rt.priority, 'workspace_state', jt.j ->> 'priority'),
      'deadline', jsonb_build_object('relational', rt.deadline::text, 'workspace_state', jt.j ->> 'deadline'),
      'subsystem', jsonb_build_object('relational', rt.subsystem_id, 'workspace_state', jt.j ->> 'subsystemId'),
      'category', jsonb_build_object('relational', rt.category, 'workspace_state', jt.j ->> 'category'),
      'assignee_same', coalesce(rt.assignee, '') = coalesce(jt.j ->> 'assignee', '')
    ) order by rt.id), '[]'::jsonb)
    from rt join jt on rt.id = jt.j ->> 'id'),

  'workspace_state_only_ids', (select coalesce(jsonb_agg(j ->> 'id' order by j ->> 'id'), '[]'::jsonb)
                               from jt where (j ->> 'id') not in (select id from rt))

) as side_by_side;
