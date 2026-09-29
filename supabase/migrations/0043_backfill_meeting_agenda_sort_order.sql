-- =========================================================
-- 0043_backfill_meeting_agenda_sort_order.sql
-- One-time data fix, not a schema change. 0042 added a trigger that correctly computes
-- sort_order on every NEW insert, but a trigger only fires on inserts that happen after it
-- exists — every agenda item created before 0042 ran keeps whatever colliding value it already
-- had (typically 0 for every suggestion-sourced item, per the original 0041 bug). Confirmed live:
-- swapping two such rows exchanges 0 with 0, a real no-op that reverts to creation order on reload.
--
-- This assigns each existing meeting's agenda items a correct, distinct, sequential sort_order —
-- 0, 1, 2, ... — preserving their current relative order (by existing sort_order, then created_at
-- as the same tiebreaker the UI already uses) so nothing visibly reshuffles; it just becomes
-- reorderable going forward. Builds on 0041/0042 only. Run against bobcat-dev only.
-- =========================================================

-- The SQL Editor session has no auth.uid() (no Supabase Auth JWT), so
-- technical_meeting_agenda_items_before_write's field-locking (0041) would see "not a manager" and
-- silently revert every sort_order change in this backfill — caught locally before this ever ran
-- live. Disabling the trigger for the duration of this one statement, in the same transaction the
-- migration runner already wraps this file in, is the same DDL-level trust every other migration
-- in this schema already relies on (CREATE TRIGGER, REVOKE, etc.).
alter table public.technical_meeting_agenda_items disable trigger technical_meeting_agenda_items_before_write;

with ranked as (
  select id, row_number() over (partition by meeting_id order by sort_order, created_at) - 1 as new_order
  from public.technical_meeting_agenda_items
)
update public.technical_meeting_agenda_items t
set sort_order = ranked.new_order
from ranked
where t.id = ranked.id
  and t.sort_order is distinct from ranked.new_order;

alter table public.technical_meeting_agenda_items enable trigger technical_meeting_agenda_items_before_write;
