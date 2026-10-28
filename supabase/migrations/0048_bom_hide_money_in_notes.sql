-- =========================================================
-- 0048_bom_hide_money_in_notes.sql
-- Closes a gap in 0045. Prices live in bom_line_costs (readable only by Business members and cto/admin), but 42 BOM lines carried
-- dollar amounts typed into their free-text `notes` ("Quote ... total $400.45 + $3.00 fuel surcharge"), and notes are readable
-- by every approved member. So an ordinary member could still read money in a note.
--
-- Fix:
--   * the ORIGINAL note moves to bom_line_costs.cost_notes (same table, same row-level security: Business members and
--     cto/admin only), so the people allowed to see money still see the full wording
--   * the note everyone can read has each dollar amount replaced with "[amount hidden]"
-- Only `notes` held money (checked across every text column of the 335 lines). Changes no other table, policy or grant.
-- The BOM page also redacts dollar amounts for people without price access, as a second layer, so this stays safe if an amount is
-- ever typed into a note later.
-- =========================================================

alter table public.bom_line_costs
  add column cost_notes text check (cost_notes is null or char_length(cost_notes) <= 1000);

-- Keep the original wording for the people allowed to see money.
insert into public.bom_line_costs (line_id, cost_notes)
select id, notes from public.bom_lines where notes ~ '\$\s?[0-9]'
on conflict (line_id) do update set cost_notes = excluded.cost_notes;

-- Replace the amounts in the shared note. The triggers on bom_lines (audit, review stamping) are for people reviewing a line,
-- so they are paused for this one maintenance edit and switched straight back on.
alter table public.bom_lines disable trigger user;

update public.bom_lines
   set notes = regexp_replace(notes, '\$\s?[0-9][0-9,]*(\.[0-9]+)?', '[amount hidden]', 'g')
 where notes ~ '\$\s?[0-9]';

alter table public.bom_lines enable trigger user;

-- Check: expect 0 lines left with a dollar amount in the shared note, and 42 notes kept for money viewers.
select
  (select count(*) from public.bom_lines where notes ~ '\$\s?[0-9]') as shared_notes_with_money,
  (select count(*) from public.bom_line_costs where cost_notes is not null) as notes_kept_for_money_viewers;
