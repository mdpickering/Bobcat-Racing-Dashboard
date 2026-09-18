-- =========================================================
-- 02_profile_workspace_state_readonly.sql
-- Phase 6.7: READ-ONLY *shape* profile of public.workspace_state.
-- NOT a migration. One single SELECT statement.
--
-- This is the ONLY script in this phase that reads rows of the
-- legacy table (SELECT only — it cannot modify it). It is built
-- to return STRUCTURE, not content:
--   * every JSON path, its JSON type, and how many times it occurs
--   * for text values: min/max length, and how many look like a
--     UUID / a number / an ISO date / an e-mail address / embedded
--     JSON (counts only — the values themselves are NOT returned)
--   * distinct VALUES are returned only for enum-like fields whose
--     last path segment is status/priority/state/type/kind/role/
--     category/level/year/subsystem/phase/stage/column and that
--     have <= 40 distinct values (e.g. purchase statuses, subsystem
--     ids). Names, e-mails, titles, comments etc. are never listed.
--
-- Run it in the PRODUCTION SQL Editor only after reviewing
-- 01_inspect_schema_readonly.sql's "tables" section: if
-- workspace_state has a very large row count (> ~100) tell me
-- first. Save the single-cell JSON result as:
--   supabase/production-prep/results/prod_02_workspace_state_shape.json
--
-- Output: one row, one jsonb column named "profile".
-- If the table is not public.workspace_state this fails harmlessly
-- with "relation does not exist" — nothing is changed either way.
-- =========================================================
with recursive
src as (
  select to_jsonb(w) as doc from public.workspace_state w
),
walk(path, val) as (
  select '$'::text, doc from src
  union all
  select
    case when jsonb_typeof(p.val) = 'object' then p.path || '.' || kv.k else p.path || '[]' end,
    kv.v
  from walk p
  cross join lateral (
    select e.key as k, e.value as v
    from jsonb_each(case when jsonb_typeof(p.val) = 'object' then p.val else '{}'::jsonb end) e
    union all
    select null::text as k, a.value as v
    from jsonb_array_elements(case when jsonb_typeof(p.val) = 'array' then p.val else '[]'::jsonb end) a
  ) kv
),
shape as (
  select
    path,
    jsonb_typeof(val) as t,
    count(*) as n,
    min(length(val #>> '{}')) filter (where jsonb_typeof(val) = 'string') as min_len,
    max(length(val #>> '{}')) filter (where jsonb_typeof(val) = 'string') as max_len,
    count(*) filter (where jsonb_typeof(val) = 'string'
      and (val #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') as uuid_like,
    count(*) filter (where jsonb_typeof(val) = 'string' and (val #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$') as numeric_like,
    count(*) filter (where jsonb_typeof(val) = 'string' and (val #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}') as iso_date_like,
    count(*) filter (where jsonb_typeof(val) = 'string' and (val #>> '{}') ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$') as email_like,
    count(*) filter (where jsonb_typeof(val) = 'string' and (val #>> '{}') ~ '^\s*[\[{]') as embedded_json_like
  from walk
  group by path, jsonb_typeof(val)
),
enum_candidates as (
  select
    path,
    val #>> '{}' as v,
    count(*) as n,
    count(*) over (partition by path) as distinct_n
  from walk
  where jsonb_typeof(val) in ('string', 'number', 'boolean')
    and path ~* '(status|priority|state|type|kind|role|category|level|year|subsystem|phase|stage|column)[^.\[\]]*(\[\])?$'
  group by path, val #>> '{}'
)
select jsonb_build_object(
  'row_count', (select count(*) from src),
  'top_level_keys', (select coalesce(jsonb_agg(distinct k order by k), '[]'::jsonb)
                     from src, lateral jsonb_object_keys(doc) k),
  'total_json_nodes', (select count(*) from walk),
  'shape', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'path', path, 'type', t, 'n', n,
      'min_len', min_len, 'max_len', max_len,
      'uuid_like', uuid_like, 'numeric_like', numeric_like,
      'iso_date_like', iso_date_like, 'email_like', email_like,
      'embedded_json_like', embedded_json_like
    ) order by path, t), '[]'::jsonb)
    from shape
  ),
  'enum_like_values', (
    select coalesce(jsonb_object_agg(x.path, x.vals), '{}'::jsonb)
    from (
      select path, jsonb_agg(jsonb_build_object('v', v, 'n', n) order by n desc, v) as vals
      from enum_candidates
      where distinct_n <= 40
      group by path
    ) x
  )
) as profile;
