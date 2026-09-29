-- =========================================================
-- 0042_meeting_agenda_sort_order_trigger.sql
-- Fixes a real bug in 0041: technical_meeting_agenda_items.sort_order was client-settable on
-- insert, but only the manual-topic UI path ever actually set it (to the current list length).
-- Every agenda item added from Suggested Topics or Previous Meeting Follow-up left it at the
-- column default (0) — so as soon a meeting had two or more suggestion-sourced items, they all
-- shared sort_order = 0, and the reorder buttons (which swap two rows' sort_order) silently
-- swapped 0 with 0: nothing visibly moved.
--
-- Fix: compute sort_order server-side on INSERT — "next slot in this meeting" — regardless of
-- what the client sends, then revoke the insert grant on that column entirely. Same pattern
-- already used elsewhere in this schema for exactly this kind of value: sponsorship_deliverables.
-- sort_order (0035) and cad_review_versions.revision_number (0008). The existing swap-two-rows
-- reorder (a plain UPDATE from the client) is untouched — sort_order stays updatable, just never
-- settable on insert. No SECURITY DEFINER needed: the trigger only reads rows in the same meeting
-- the caller is already inserting into, which requires can_manage_meetings() — a strictly higher
-- bar than the agenda_items_select policy this read relies on.
--
-- Builds on 0041 only. Does NOT touch 0038, 0039, or 0040. Run against bobcat-dev only.
-- =========================================================

create or replace function public.set_meeting_agenda_item_sort_order()
returns trigger
language plpgsql
as $$
declare
  next_order integer;
begin
  select coalesce(max(sort_order), -1) + 1 into next_order
  from public.technical_meeting_agenda_items
  where meeting_id = new.meeting_id;
  new.sort_order := next_order;
  return new;
end;
$$;

create trigger technical_meeting_agenda_items_set_sort_order
  before insert on public.technical_meeting_agenda_items
  for each row execute function public.set_meeting_agenda_item_sort_order();

revoke insert (sort_order) on public.technical_meeting_agenda_items from authenticated;
-- update (sort_order) stays granted — that's what the reorder swap uses.
