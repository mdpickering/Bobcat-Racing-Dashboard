-- =========================================================
-- 06_inventory_dev_data_readonly.sql
-- Phase 6.8 preparation: READ-ONLY inventory of bobcat-dev's auth users and application/test data,
-- taken BEFORE bobcat-dev is promoted to the live database. NOT a migration. One single SELECT
-- statement — it deletes and changes nothing.
--
-- RUN IT ON: bobcat-dev ONLY (never on the old live project).
-- SAVE THE SINGLE JSON CELL AS: supabase/production-prep/results/dev_06_data_inventory.json (git-ignored)
--
-- Unlike scripts 02/03 this one DOES return identifying details (account e-mails, task/purchase/CAD titles,
-- creator e-mails, application names/e-mails) because deciding "which of these rows is disposable test data"
-- requires seeing them. It stays in the git-ignored results/ folder. Comment BODIES are not returned (only lengths).
--
-- Returns: auth_users, profiles (+memberships), exact row counts of every public table, every row of the small
-- configuration tables, one summary line per task / task request / purchase / CAD review / calendar event / etc.
-- with creator e-mail and created_at, notification counts, member applications, migration exceptions, and
-- storage.objects with whether an attachment row points at them (+ attachment rows with no file).
-- =========================================================
select jsonb_build_object(

  'meta', jsonb_build_object('database', current_database(), 'inspected_as', current_user, 'inspected_at', now()),

  'auth_users', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at, 'banned_until', u.banned_until,
      'provider', u.raw_app_meta_data ->> 'provider', 'display_name', u.raw_user_meta_data ->> 'display_name',
      'is_anonymous', u.is_anonymous,
      'has_profile', exists (select 1 from public.profiles p where p.id = u.id)
    ) order by u.created_at), '[]'::jsonb) from auth.users u),

  'profiles', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'email', p.email, 'display_name', p.display_name, 'role', p.role, 'approved', p.approved,
      'active', p.active, 'year', p.year, 'created_at', p.created_at,
      'memberships', (select coalesce(jsonb_agg(jsonb_build_object('subsystem_id', sm.subsystem_id, 'is_lead', sm.is_lead)
                                                order by sm.subsystem_id), '[]'::jsonb)
                      from public.subsystem_members sm where sm.user_id = p.id)
    ) order by p.created_at), '[]'::jsonb) from public.profiles p),

  -- exact row counts for every table in public (query_to_xml trick: a single SELECT, no dynamic SQL/plpgsql)
  'row_counts', (select coalesce(jsonb_object_agg(t.tablename,
        (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.schemaname, t.tablename), false, true, '')))[1]::text::bigint
      ), '{}'::jsonb) from pg_tables t where t.schemaname = 'public'),

  -- small configuration tables: every row, every column
  'subsystems', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.subsystems s),
  'subsystem_categories', (select coalesce(jsonb_agg(to_jsonb(c) order by c.subsystem_id, c.name), '[]'::jsonb) from public.subsystem_categories c),
  'timeline_columns', (select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order), '[]'::jsonb) from public.timeline_columns c),
  'timeline_milestones', (select coalesce(jsonb_agg(to_jsonb(m) order by m.subsystem_id, m.timeline_column_key), '[]'::jsonb) from public.timeline_milestones m),
  'competition_settings', (select coalesce(jsonb_agg(to_jsonb(c) order by c.season), '[]'::jsonb) from public.competition_settings c),
  'recurring_events', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb) from public.recurring_events r),
  'milestones', (select coalesce(jsonb_agg(to_jsonb(m) order by m.date), '[]'::jsonb) from public.milestones m),
  'migration_exceptions', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) from public.migration_exceptions e),
  'migration_log_rows', (select count(*) from public.migration_log),
  'audit_log_rows', (select count(*) from public.audit_logs),

  'subsystem_members', (select coalesce(jsonb_agg(jsonb_build_object(
      'subsystem_id', sm.subsystem_id, 'user_email', (select email from public.profiles where id = sm.user_id), 'is_lead', sm.is_lead)
      order by sm.subsystem_id), '[]'::jsonb) from public.subsystem_members sm),

  -- one summary line per record, with who created it and when (bodies/descriptions are NOT returned)
  'tasks', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'legacy_id', t.legacy_id, 'title', t.title, 'subsystem_id', t.subsystem_id, 'status', t.status, 'priority', t.priority,
      'created_by', (select email from public.profiles where id = t.created_by),
      'primary_owner', (select email from public.profiles where id = t.primary_owner_id),
      'created_at', t.created_at) order by t.created_at), '[]'::jsonb) from public.tasks t),
  'task_assignees', (select coalesce(jsonb_agg(jsonb_build_object(
      'task_id', a.task_id, 'user_email', (select email from public.profiles where id = a.user_id), 'role', a.role)), '[]'::jsonb) from public.task_assignees a),
  'task_requests', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'status', r.status, 'subsystem_id', r.subsystem_id, 'converted_task_id', r.converted_task_id,
      'requester', (select email from public.profiles where id = r.requester_id), 'created_at', r.created_at) order by r.created_at), '[]'::jsonb) from public.task_requests r),
  'task_comments', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'task_id', c.task_id, 'author', (select email from public.profiles where id = c.user_id),
      'length', length(c.comment), 'created_at', c.created_at) order by c.created_at), '[]'::jsonb) from public.task_comments c),
  'comment_mentions_count', (select count(*) from public.comment_mentions),
  'task_attachments', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'task_id', a.task_id, 'file_name', a.file_name, 'storage_path', a.storage_path, 'file_size', a.file_size,
      'uploaded_by', (select email from public.profiles where id = a.uploaded_by), 'created_at', a.created_at,
      'has_storage_object', exists (select 1 from storage.objects o where o.bucket_id = 'task-attachments' and o.name = a.storage_path)
    ) order by a.created_at), '[]'::jsonb) from public.task_attachments a),

  'purchase_requests', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'legacy_id', p.legacy_id, 'title', p.title, 'status', p.status, 'subsystem_id', p.subsystem_id,
      'requested_by', (select email from public.profiles where id = p.requested_by), 'created_at', p.created_at,
      'items', (select count(*) from public.purchase_request_items i where i.purchase_request_id = p.id),
      'history_rows', (select count(*) from public.purchase_status_history h where h.purchase_request_id = p.id)
    ) order by p.created_at), '[]'::jsonb) from public.purchase_requests p),

  'cad_reviews', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'legacy_id', c.legacy_id, 'title', c.title, 'status', c.status, 'subsystem_id', c.subsystem_id,
      'current_revision', c.current_revision, 'task_id', c.task_id,
      'submitted_by', (select email from public.profiles where id = c.submitted_by), 'created_at', c.created_at,
      'versions', (select count(*) from public.cad_review_versions v where v.cad_review_id = c.id),
      'comments', (select count(*) from public.cad_review_comments cc where cc.cad_review_id = c.id)
    ) order by c.created_at), '[]'::jsonb) from public.cad_reviews c),

  'calendar_events', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'start_time', e.start_time, 'subsystem_id', e.subsystem_id, 'active', e.active,
      'created_by', (select email from public.profiles where id = e.created_by)) order by e.start_time), '[]'::jsonb) from public.calendar_events e),

  'notifications', (select coalesce(jsonb_agg(jsonb_build_object('user_email', x.email, 'type', x.type, 'total', x.n, 'unread', x.unread)
                                              order by x.email, x.type), '[]'::jsonb)
      from (select (select email from public.profiles where id = n.user_id) as email, n.type, count(*) as n,
                   count(*) filter (where n.read_at is null) as unread
            from public.notifications n group by n.user_id, n.type) x),

  'member_applications', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'email', a.email, 'status', a.status, 'submitted_at', a.submitted_at,
      'linked_profile_email', (select email from public.profiles where id = a.linked_profile_id),
      'reviewed_by', (select email from public.profiles where id = a.reviewed_by)) order by a.submitted_at), '[]'::jsonb) from public.member_applications a),

  'storage_objects', (select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', o.bucket_id, 'name', o.name, 'size', o.metadata ->> 'size', 'mimetype', o.metadata ->> 'mimetype',
      'created_at', o.created_at,
      'referenced_by_attachment_row', exists (select 1 from public.task_attachments a where a.storage_path = o.name)
    ) order by o.created_at), '[]'::jsonb) from storage.objects o),

  'storage_buckets', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public, 'file_size_limit', b.file_size_limit)), '[]'::jsonb) from storage.buckets b)

) as dev_data_inventory;
