-- =========================================================
-- 07_child_rows_actors_readonly.sql
-- Phase 6.8 preparation: READ-ONLY supplement to script 06. NOT a migration. One single SELECT; deletes nothing.
--
-- RUN IT ON: bobcat-dev ONLY.   SAVE THE SINGLE JSON CELL AS: supabase/production-prep/results/dev_07_child_actors.json (git-ignored)
--
-- WHY: script 06 only COUNTED some child tables and omitted some actor columns, so 67 rows in the cleanup list could not be
-- attributed to an account: purchase_status_history (changed_by), purchase_request_items, cad_review_versions (submitted_by),
-- cad_review_comments (author), comment_mentions (author/mentioned), plus purchase/CAD/task-request REVIEWER columns
-- (reviewed_by / reviewer_id) and the individual notification rows. This lists them row by row so that nothing associated with
-- the owner's real account can be deleted by accident. Comment BODIES are not returned (only lengths).
-- =========================================================
select jsonb_build_object(

  'meta', jsonb_build_object('database', current_database(), 'inspected_as', current_user, 'inspected_at', now()),

  'purchase_status_history', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id, 'purchase_request_id', h.purchase_request_id, 'from_status', h.from_status, 'to_status', h.to_status,
      'changed_by', (select email from public.profiles where id = h.changed_by), 'changed_at', h.changed_at, 'note', h.note
    ) order by h.changed_at), '[]'::jsonb) from public.purchase_status_history h),

  'purchase_request_items', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'purchase_request_id', i.purchase_request_id, 'description', i.description, 'quantity', i.quantity, 'created_at', i.created_at
    ) order by i.created_at), '[]'::jsonb) from public.purchase_request_items i),

  'purchase_reviews', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'status', p.status, 'requested_by', (select email from public.profiles where id = p.requested_by),
      'reviewed_by', (select email from public.profiles where id = p.reviewed_by), 'reviewed_at', p.reviewed_at
    ) order by p.created_at), '[]'::jsonb) from public.purchase_requests p),

  'cad_review_versions', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'cad_review_id', v.cad_review_id, 'revision_number', v.revision_number,
      'submitted_by', (select email from public.profiles where id = v.submitted_by), 'created_at', v.created_at
    ) order by v.created_at), '[]'::jsonb) from public.cad_review_versions v),

  'cad_review_comments', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'cad_review_id', c.cad_review_id, 'author', (select email from public.profiles where id = c.user_id),
      'length', length(c.comment), 'created_at', c.created_at
    ) order by c.created_at), '[]'::jsonb) from public.cad_review_comments c),

  'cad_reviewers', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'status', r.status, 'submitted_by', (select email from public.profiles where id = r.submitted_by),
      'reviewer', (select email from public.profiles where id = r.reviewer_id), 'reviewed_at', r.reviewed_at
    ) order by r.created_at), '[]'::jsonb) from public.cad_reviews r),

  'comment_mentions', (select coalesce(jsonb_agg(jsonb_build_object(
      'comment_id', m.comment_id, 'task_id', c.task_id,
      'comment_author', (select email from public.profiles where id = c.user_id),
      'mentioned', (select email from public.profiles where id = m.mentioned_profile_id), 'created_at', m.created_at
    ) order by m.created_at), '[]'::jsonb)
    from public.comment_mentions m join public.task_comments c on c.id = m.comment_id),

  'task_request_reviews', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'requester', (select email from public.profiles where id = r.requester_id),
      'reviewed_by', (select email from public.profiles where id = r.reviewed_by), 'reviewed_at', r.reviewed_at,
      'converted_task_id', r.converted_task_id
    ) order by r.created_at), '[]'::jsonb) from public.task_requests r),

  'task_details', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'category', (select name from public.subsystem_categories where id = t.category_id), 'deadline', t.deadline,
      'completed_at', t.completed_at, 'updated_at', t.updated_at
    ) order by t.created_at), '[]'::jsonb) from public.tasks t),

  'notification_rows', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'user', (select email from public.profiles where id = n.user_id), 'type', n.type, 'entity_type', n.entity_type,
      'entity_id', n.entity_id, 'read_at', n.read_at, 'created_at', n.created_at
    ) order by n.created_at), '[]'::jsonb) from public.notifications n)

) as child_actor_inventory;
