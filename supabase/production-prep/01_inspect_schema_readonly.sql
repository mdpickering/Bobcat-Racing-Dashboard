-- =========================================================
-- 01_inspect_schema_readonly.sql
-- Phase 6.7: READ-ONLY schema inventory. NOT a migration.
--
-- One single SELECT statement. It reads ONLY system catalogs
-- (pg_class, pg_attribute, pg_constraint, pg_index, pg_proc,
-- pg_trigger, pg_policies, pg_enum, ...) plus:
--   * storage.buckets            (bucket configuration)
--   * count(*) per bucket_id of storage.objects (numbers only)
--   * count(*) of auth.users / auth.identities, grouped by
--     email DOMAIN or provider (no individual emails)
-- It does NOT read any row of workspace_state or any other
-- application table, does not call any function that writes,
-- and cannot change anything. Safe to run on production.
--
-- Run the identical file against BOTH projects (production and
-- bobcat-dev), then save each single-cell JSON result as:
--   supabase/production-prep/results/prod_01_inventory.json
--   supabase/production-prep/results/dev_01_inventory.json
-- (the results/ folder is git-ignored) so the two can be diffed.
--
-- Output: one row, one jsonb column named "inventory".
-- =========================================================
with s as (
  -- user-visible schemas: everything except Postgres/Supabase-managed
  select nspname
  from pg_namespace
  where nspname !~ '^pg_'
    and nspname not in (
      'information_schema', 'auth', 'storage', 'realtime', 'vault',
      'extensions', 'graphql', 'graphql_public', 'net', 'pgsodium',
      'pgsodium_masks', 'supabase_functions', '_realtime', 'pgbouncer',
      'cron', 'pgtle', '_analytics', 'topology'
    )
)
select jsonb_build_object(

  'meta', jsonb_build_object(
    'server_version', current_setting('server_version'),
    'database', current_database(),
    'inspected_as', current_user,
    'inspected_at', now()
  ),

  'extensions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', e.extname, 'version', e.extversion, 'schema', n.nspname
    ) order by e.extname), '[]'::jsonb)
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
  ),

  'schemas', (
    select coalesce(jsonb_agg(nspname order by nspname), '[]'::jsonb) from s
  ),

  -- relation kind: r table, p partitioned, v view, m matview, f foreign
  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', n.nspname || '.' || c.relname,
      'kind', c.relkind,
      'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity,
      'owner', pg_get_userbyid(c.relowner),
      'est_rows', (select st.n_live_tup from pg_stat_all_tables st where st.relid = c.oid),
      'acl', c.relacl::text
    ) order by n.nspname, c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'f')
      and n.nspname in (select nspname from s)
  ),

  'columns', (
    select coalesce(jsonb_object_agg(t.k, t.cols), '{}'::jsonb)
    from (
      select n.nspname || '.' || c.relname as k,
        jsonb_agg(
          a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
          || case when a.attnotnull then ' NOT NULL' else '' end
          || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')
          || case when a.attidentity <> '' then ' IDENTITY(' || a.attidentity::text || ')' else '' end
          || case when a.attgenerated <> '' then ' GENERATED' else '' end
          order by a.attnum
        ) as cols
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
      where c.relkind in ('r', 'p', 'v', 'm', 'f')
        and n.nspname in (select nspname from s)
      group by n.nspname, c.relname
    ) t
  ),

  -- column-level grants (the real write boundary on several tables)
  'column_acls', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', n.nspname || '.' || c.relname,
      'column', a.attname,
      'acl', a.attacl::text
    ) order by n.nspname, c.relname, a.attnum), '[]'::jsonb)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where a.attacl is not null
      and a.attnum > 0
      and not a.attisdropped
      and n.nspname in (select nspname from s)
  ),

  'constraints', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', n.nspname || '.' || c.relname,
      'name', con.conname,
      'type', con.contype,
      'def', pg_get_constraintdef(con.oid)
    ) order by n.nspname, c.relname, con.conname), '[]'::jsonb)
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in (select nspname from s)
  ),

  'indexes', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', i.schemaname || '.' || i.tablename,
      'name', i.indexname,
      'def', i.indexdef
    ) order by i.schemaname, i.tablename, i.indexname), '[]'::jsonb)
    from pg_indexes i
    where i.schemaname in (select nspname from s)
  ),

  'enums', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'type', n.nspname || '.' || t.typname,
      'labels', (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                 from pg_enum e where e.enumtypid = t.oid)
    ) order by n.nspname, t.typname), '[]'::jsonb)
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typtype = 'e'
      and n.nspname in (select nspname from s)
  ),

  -- extension-owned functions (e.g. pgcrypto installed into public) are excluded.
  -- acl NULL means "default privileges" (i.e. EXECUTE granted to PUBLIC).
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', n.nspname || '.' || p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'language', l.lanname,
      'kind', p.prokind,
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'config', p.proconfig,
      'owner', pg_get_userbyid(p.proowner),
      'acl', p.proacl::text
    ) order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname in (select nspname from s)
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  ),

  -- user triggers, plus any trigger on auth.users or storage.*
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', n.nspname || '.' || c.relname,
      'name', t.tgname,
      'enabled', t.tgenabled,
      'def', pg_get_triggerdef(t.oid)
    ) order by n.nspname, c.relname, t.tgname), '[]'::jsonb)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and (
        n.nspname in (select nspname from s)
        or (n.nspname = 'auth' and c.relname = 'users')
        or n.nspname = 'storage'
      )
  ),

  'event_triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', evtname, 'event', evtevent, 'enabled', evtenabled
    ) order by evtname), '[]'::jsonb)
    from pg_event_trigger
  ),

  -- RLS policies on user schemas plus storage.objects / storage.buckets
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', p.schemaname || '.' || p.tablename,
      'name', p.policyname,
      'permissive', p.permissive,
      'roles', to_jsonb(p.roles),
      'cmd', p.cmd,
      'using', p.qual,
      'check', p.with_check
    ) order by p.schemaname, p.tablename, p.policyname), '[]'::jsonb)
    from pg_policies p
    where p.schemaname in (select nspname from s)
       or p.schemaname = 'storage'
  ),

  'sequences', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', q.schemaname || '.' || q.sequencename,
      'data_type', q.data_type::text,
      'last_value', q.last_value
    ) order by q.schemaname, q.sequencename), '[]'::jsonb)
    from pg_sequences q
    where q.schemaname in (select nspname from s)
  ),

  'default_privileges', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'for_role', pg_get_userbyid(d.defaclrole),
      'schema', (select nspname from pg_namespace where oid = d.defaclnamespace),
      'object_type', d.defaclobjtype,
      'acl', d.defaclacl::text
    )), '[]'::jsonb)
    from pg_default_acl d
  ),

  'publications', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'publication', pt.pubname,
      'table', pt.schemaname || '.' || pt.tablename
    ) order by pt.pubname, pt.schemaname, pt.tablename), '[]'::jsonb)
    from pg_publication_tables pt
  ),

  'storage_buckets', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'public', b.public,
      'file_size_limit', b.file_size_limit,
      'allowed_mime_types', b.allowed_mime_types
    ) order by b.id), '[]'::jsonb)
    from storage.buckets b
  ),

  'storage_object_counts', (
    select coalesce(jsonb_object_agg(o.bucket_id, o.n), '{}'::jsonb)
    from (select bucket_id, count(*) as n from storage.objects group by bucket_id) o
  ),

  -- counts only; no individual emails or identities are returned
  'auth_summary', jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'users_email_confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'email_domains', (
      select coalesce(jsonb_object_agg(x.d, x.n), '{}'::jsonb)
      from (
        select split_part(email, '@', 2) as d, count(*) as n
        from auth.users group by 1
      ) x
    ),
    'identity_providers', (
      select coalesce(jsonb_object_agg(x.provider, x.n), '{}'::jsonb)
      from (select provider, count(*) as n from auth.identities group by provider) x
    )
  )

) as inventory;
