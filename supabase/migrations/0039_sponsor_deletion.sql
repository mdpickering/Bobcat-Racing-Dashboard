-- =========================================================
-- 0039_sponsor_deletion.sql
-- A safe, permission-gated way to permanently delete a sponsor. Builds on 0033
-- (Business access) and 0034-0036 (sponsorship core, deliverables, renewals) and
-- reuses their patterns: a SECURITY DEFINER function as the sole write path
-- (never a raw client DELETE), the existing can_manage_sponsorships() helper,
-- and the existing audit_logs table (written only by triggers/functions, never
-- by clients). Changes NO existing table, column, policy, grant or trigger.
--
-- Why a function instead of relying on the existing "sponsors_delete" RLS
-- policy (0034, cto/admin only): that policy still exists and is untouched, but
-- it (a) does not include the Business Lead / Sponsorship Lead the way every
-- other sponsorship-management action already does, and (b) a raw DELETE would
-- either silently succeed and CASCADE away sponsor_contacts (fine — contacts are
-- exclusively sponsor-owned in this schema, there is no shared/global contact
-- concept) or hit the sponsorships.sponsor_id ON DELETE RESTRICT foreign key
-- and surface a raw, unfriendly Postgres error. This function checks first and
-- explains, instead of relying on a caller to interpret a 23503.
--
-- Rule (revised): the normal "Add Sponsorship" UI flow creates a sponsor AND a
-- prospect-stage sponsorship together in one step, so "any sponsorship row
-- blocks deletion" made a brand-new, still-empty test sponsor undeletable
-- through the app. A sponsor is deletable when EVERY sponsorship it has (if
-- any) is BOTH:
--   (a) still at stage = 'prospect', AND
--   (b) proven empty — no contribution, no payment, no level decision, no
--       deliverable, no renewal reminder, and no history entry of ANY kind
--       (including a plain typed note: that is real, human-written content,
--       not a system artifact, so it counts as meaningful and blocks deletion
--       exactly like the others).
-- A sponsorship at any OTHER stage (contacted / interested / committed /
-- declined / withdrawn) blocks deletion UNCONDITIONALLY — this migration does
-- not attempt to prove one of those is "safe" even if it happens to have no
-- rows in the dependent tables, because reaching a non-prospect stage is
-- itself a real, deliberate action someone took (declining or withdrawing a
-- sponsor is exactly the kind of outcome worth keeping a record of) and
-- because stage is the one signal a caller could otherwise manipulate to route
-- around this check. This is the one deliberate use of the "unless you
-- explicitly document why" allowance: we do NOT take it, and stage alone is
-- always a hard stop outside 'prospect'.
--
-- When a sponsor IS deletable, every one of its (now proven-empty) prospect
-- sponsorships is removed in the same atomic operation as the sponsor itself.
-- =========================================================

create or replace function public.delete_sponsor(p_sponsor_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor public.sponsors;
  v_contact_count integer;
  v_sponsorship_ids uuid[];
  v_non_prospect_count integer;
  v_contribution_count integer;
  v_payment_count integer;
  v_decision_count integer;
  v_history_count integer;
  v_deliverable_count integer;
  v_reminder_count integer;
  v_parts text[] := '{}';
  v_before jsonb;
begin
  if not public.can_manage_sponsorships() then
    raise exception 'Only the Sponsorship Lead, the Business Lead or an admin can delete a sponsor' using errcode = '42501';
  end if;

  select * into v_sponsor from public.sponsors where id = p_sponsor_id;
  if not found then
    raise exception 'Sponsor not found' using errcode = 'P0002';
  end if;

  -- lock every sponsorship this sponsor has so nothing can be added underneath this check (FOR UPDATE cannot be
  -- combined with an aggregate in the same SELECT, hence the subquery)
  select coalesce(array_agg(x.id), '{}') into v_sponsorship_ids
    from (select id from public.sponsorships where sponsor_id = p_sponsor_id for update) x;

  select count(*) into v_non_prospect_count from public.sponsorships
    where id = any (v_sponsorship_ids) and stage <> 'prospect';
  select count(*) into v_contribution_count from public.sponsorship_contributions
    where sponsorship_id = any (v_sponsorship_ids);
  select count(*) into v_payment_count from public.sponsorship_payments pay
    join public.sponsorship_contributions c on c.id = pay.contribution_id
    where c.sponsorship_id = any (v_sponsorship_ids);
  select count(*) into v_decision_count from public.sponsorship_level_decisions
    where sponsorship_id = any (v_sponsorship_ids);
  select count(*) into v_deliverable_count from public.sponsorship_deliverables
    where sponsorship_id = any (v_sponsorship_ids);
  select count(*) into v_reminder_count from public.sponsorship_renewal_reminders
    where sponsorship_id = any (v_sponsorship_ids);
  select count(*) into v_history_count from public.sponsorship_history
    where sponsorship_id = any (v_sponsorship_ids);

  if v_non_prospect_count > 0 then
    v_parts := v_parts || (v_non_prospect_count || ' sponsorship record' || case when v_non_prospect_count = 1 then '' else 's' end || ' past the prospect stage');
  end if;
  if v_contribution_count > 0 then v_parts := v_parts || (v_contribution_count || ' contribution' || case when v_contribution_count = 1 then '' else 's' end); end if;
  if v_payment_count > 0 then v_parts := v_parts || (v_payment_count || ' payment' || case when v_payment_count = 1 then '' else 's' end); end if;
  if v_decision_count > 0 then v_parts := v_parts || (v_decision_count || ' level decision' || case when v_decision_count = 1 then '' else 's' end); end if;
  if v_deliverable_count > 0 then v_parts := v_parts || (v_deliverable_count || ' deliverable' || case when v_deliverable_count = 1 then '' else 's' end); end if;
  if v_reminder_count > 0 then v_parts := v_parts || (v_reminder_count || ' renewal reminder' || case when v_reminder_count = 1 then '' else 's' end); end if;
  if v_history_count > 0 then v_parts := v_parts || (v_history_count || ' history entr' || case when v_history_count = 1 then 'y' else 'ies' end); end if;

  if array_length(v_parts, 1) > 0 then
    raise exception 'This sponsor cannot be deleted because it has sponsorship history or financial records (%). Remove the dependent records first, or keep the sponsor archived.',
      array_to_string(v_parts, ', ')
      using errcode = '23503';
  end if;

  select count(*) into v_contact_count from public.sponsor_contacts where sponsor_id = p_sponsor_id;
  v_before := (to_jsonb(v_sponsor) - 'updated_at')
    || jsonb_build_object('contacts_removed', v_contact_count, 'empty_prospect_sponsorships_removed', coalesce(array_length(v_sponsorship_ids, 1), 0));

  -- every sponsorship left in v_sponsorship_ids is now PROVEN empty: stage = 'prospect' and no contribution,
  -- payment, level decision, deliverable, renewal reminder or history row of any kind. Safe to remove along
  -- with the sponsor itself, atomically. sponsor_contacts cascades — every contact in this schema belongs to
  -- exactly one sponsor (not null, no shared/global contact), so this never touches another sponsor's record.
  delete from public.sponsorships where id = any (v_sponsorship_ids);
  delete from public.sponsors where id = p_sponsor_id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'sponsor.deleted', 'sponsor', p_sponsor_id, v_before, null);

  return v_sponsor.name;
end;
$$;

revoke execute on function public.delete_sponsor(uuid) from public;
revoke execute on function public.delete_sponsor(uuid) from anon, authenticated;
grant execute on function public.delete_sponsor(uuid) to authenticated;
