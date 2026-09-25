-- =========================================================
-- 0034_sponsorships_core.sql
-- Phase C, part 1: the Sponsorship core. Builds on 0033 (Business access) and
-- reuses the schema's patterns: SECURITY DEFINER boolean helpers with the full
-- EXECUTE revoke, additive policies, column-level grants, trigger-derived
-- who/when fields, append-only ledgers, and a transaction-local flag for the
-- one privileged write path. Changes NO existing table, policy or function.
--
-- Deliverables (0035) and renewal reminders (0036) come later. This file also
-- deliberately does NOT import any historical data and does NOT change any
-- season row; it only makes both safe to do afterwards.
--
-- Model
--   sponsors                       the company / foundation / family — persistent
--                                  across seasons; never deleted, only archived.
--   sponsor_contacts               people at a sponsor.
--   sponsorship_levels             the program catalog, PER SEASON (amounts can
--   sponsorship_level_deliverables change year to year without rewriting history).
--   sponsorships                   one sponsor's relationship in ONE season.
--   sponsorship_contributions      what they give: cash OR in-kind, kept separate.
--   sponsorship_payments           APPEND-ONLY cash ledger (payments / refunds).
--   sponsorship_level_decisions    APPEND-ONLY: why a level was set, with the
--                                  contribution basis at that moment.
--   sponsorship_history            APPEND-ONLY log: notes + system events.
--
-- Money rules
--   qualifying value = cash COMMITTED + in-kind ESTIMATED value (in-kind counts
--   toward a level, but is never treated as cash and is reported separately).
--   cash received = payments - refunds; outstanding = committed - received.
--   A level is NEVER changed automatically: it is written only by
--   set_sponsorship_level(), which reads the live contributions itself and
--   records an immutable decision. Later contribution changes only raise a
--   review flag (sponsorship_level_review).
--
-- Seasons: every season reference is a foreign key to the EXISTING
-- competition_settings.season, with ON UPDATE CASCADE so renaming a season key
-- later (e.g. 'Williamsport' -> '2026-2027') carries every sponsorship record
-- along, and ON DELETE RESTRICT so history can never be orphaned.
--
-- Historical import support (nullable, no behaviour of its own):
--   source_type / source_ref on sponsors, contacts, contributions and payments,
--   with a UNIQUE index, so an import can be repeated without duplicates and
--   every record says which spreadsheet row it came from; sponsorship_
--   contributions.source_supporting keeps extra references (e.g. a duplicate
--   row on another sheet); contribution/payment dates carry a precision
--   ('day' | 'month'); payments carry availability 'unknown'; and a level
--   decision of method 'historical_unassigned' lets a historical sponsorship be
--   committed WITHOUT inventing a level.
-- =========================================================

-- ---------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------
create or replace function public.can_manage_sponsorships()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_business_lead()
      or public.has_business_responsibility('sponsorship_lead')
      or public.is_cto_or_admin();
$$;

-- "Is this OTHER user an active member of the Business team" (for assignments).
create or replace function public.is_business_member_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.business_members bm
      join public.profiles p on p.id = bm.user_id
     where bm.user_id = p_user_id and p.approved = true and p.active = true
  );
$$;

revoke execute on function public.can_manage_sponsorships() from public;
revoke execute on function public.can_manage_sponsorships() from anon, authenticated;
grant execute on function public.can_manage_sponsorships() to authenticated;
revoke execute on function public.is_business_member_user(uuid) from public;
revoke execute on function public.is_business_member_user(uuid) from anon, authenticated;
grant execute on function public.is_business_member_user(uuid) to authenticated;

-- Shared trigger helpers ------------------------------------------------
create or replace function public.sponsorship_stamp_created_by()
returns trigger
language plpgsql
as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

-- ---------------------------------------------------------
-- sponsors
-- ---------------------------------------------------------
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  -- lower-cased, '&' spelled out, punctuation/spaces removed: "Core & Main" and "Core and Main" collide
  name_key text not null,
  sponsor_type text not null default 'company' check (sponsor_type in ('company', 'foundation', 'family_or_individual', 'other')),
  website text,
  notes text,
  active boolean not null default true,
  source_type text,
  source_ref text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsors_name_key_unique unique (name_key)
);

create unique index sponsors_source_unique on public.sponsors (source_type, source_ref) where source_ref is not null;

create or replace function public.sponsors_before_write()
returns trigger
language plpgsql
as $$
begin
  new.name := btrim(new.name);
  new.name_key := lower(regexp_replace(replace(new.name, '&', 'and'), '[^A-Za-z0-9]+', '', 'g'));
  if new.name_key = '' then
    raise exception 'A sponsor name needs letters or numbers' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger sponsors_before_write before insert or update on public.sponsors
  for each row execute function public.sponsors_before_write();
create trigger sponsors_stamp_created_by before insert on public.sponsors
  for each row execute function public.sponsorship_stamp_created_by();

-- ---------------------------------------------------------
-- sponsor_contacts
-- ---------------------------------------------------------
create table public.sponsor_contacts (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  name text,
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  active boolean not null default true,
  source_type text,
  source_ref text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_contacts_has_detail check (
    coalesce(btrim(name), '') <> '' or coalesce(btrim(email), '') <> '' or coalesce(btrim(phone), '') <> ''
  )
);

create index sponsor_contacts_sponsor_idx on public.sponsor_contacts (sponsor_id);
create unique index sponsor_contacts_one_primary on public.sponsor_contacts (sponsor_id) where is_primary and active;
create unique index sponsor_contacts_source_unique on public.sponsor_contacts (source_type, source_ref) where source_ref is not null;


create trigger sponsor_contacts_touch before update on public.sponsor_contacts
  for each row execute function public.set_updated_at();
create trigger sponsor_contacts_stamp_created_by before insert on public.sponsor_contacts
  for each row execute function public.sponsorship_stamp_created_by();

-- ---------------------------------------------------------
-- Program catalog, per season
-- ---------------------------------------------------------
create table public.sponsorship_levels (
  id uuid primary key default gen_random_uuid(),
  season text not null references public.competition_settings(season) on update cascade on delete restrict,
  level_key text not null check (level_key ~ '^[a-z0-9_]+$'),
  name text not null check (btrim(name) <> ''),
  min_amount numeric(12, 2) not null check (min_amount > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sponsorship_levels_season_key unique (season, level_key)
);

create table public.sponsorship_level_deliverables (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.sponsorship_levels(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  sort_order integer not null default 0,
  constraint sponsorship_level_deliverables_unique unique (level_id, title)
);

-- ---------------------------------------------------------
-- sponsorships: one sponsor, one season
-- level_id / level_decision_id are written ONLY by set_sponsorship_level().
-- ---------------------------------------------------------
create table public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete restrict,
  season text not null references public.competition_settings(season) on update cascade on delete restrict,
  stage text not null default 'prospect' check (stage in ('prospect', 'contacted', 'interested', 'committed', 'declined', 'withdrawn')),
  level_id uuid references public.sponsorship_levels(id) on delete restrict,
  level_decision_id uuid,
  custom_terms text,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  committed_on date,
  renewal_date date,
  agreement_url text check (agreement_url is null or public.is_valid_http_url(agreement_url)),
  notes text,
  source_type text,
  source_ref text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsorships_sponsor_season_key unique (sponsor_id, season)
);

create index sponsorships_season_idx on public.sponsorships (season);
create index sponsorships_stage_idx on public.sponsorships (stage);
create unique index sponsorships_source_unique on public.sponsorships (source_type, source_ref) where source_ref is not null;

-- ---------------------------------------------------------
-- Contributions: cash OR in-kind, never blurred
-- ---------------------------------------------------------
create table public.sponsorship_contributions (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null references public.sponsorships(id) on delete restrict,
  kind text not null check (kind in ('cash', 'in_kind')),
  description text,
  committed_amount numeric(12, 2),
  estimated_value numeric(12, 2),
  in_kind_type text check (in_kind_type in ('discount', 'components_products', 'tool', 'software', 'service', 'other')),
  contributed_on date,
  contributed_on_precision text not null default 'day' check (contributed_on_precision in ('day', 'month')),
  received_on date,
  received_on_precision text not null default 'day' check (received_on_precision in ('day', 'month')),
  withdrawn boolean not null default false,
  notes text,
  source_type text,
  source_ref text,
  source_supporting text[],
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contributions_cash_shape check (
    kind <> 'cash' or (committed_amount is not null and committed_amount > 0 and estimated_value is null and in_kind_type is null and received_on is null)
  ),
  constraint contributions_in_kind_shape check (
    kind <> 'in_kind' or (estimated_value is not null and estimated_value > 0 and committed_amount is null and in_kind_type is not null)
  )
);

create index sponsorship_contributions_sponsorship_idx on public.sponsorship_contributions (sponsorship_id);
create unique index sponsorship_contributions_source_unique on public.sponsorship_contributions (source_type, source_ref) where source_ref is not null;

create trigger sponsorship_contributions_touch before update on public.sponsorship_contributions
  for each row execute function public.set_updated_at();
create trigger sponsorship_contributions_stamp_created_by before insert on public.sponsorship_contributions
  for each row execute function public.sponsorship_stamp_created_by();

-- ---------------------------------------------------------
-- Payments: an append-only ledger. The ONE controlled change is stamping a
-- payment as available to the team (mark_payment_available), which is one-way.
-- ---------------------------------------------------------
create table public.sponsorship_payments (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.sponsorship_contributions(id) on delete restrict,
  entry_type text not null default 'payment' check (entry_type in ('payment', 'refund')),
  amount numeric(12, 2) not null check (amount > 0),
  received_on date not null,
  received_on_precision text not null default 'day' check (received_on_precision in ('day', 'month')),
  method text not null default 'unknown' check (method in ('check', 'cash', 'card', 'wire_ach', 'university_giving', 'other', 'unknown')),
  reference text,
  notes text,
  received_by text not null default 'unknown' check (received_by in ('university', 'team', 'unknown')),
  availability text not null default 'unknown' check (availability in ('held_by_university', 'available', 'unknown')),
  available_on date,
  source_type text,
  source_ref text,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint payments_available_needs_date check (availability <> 'available' or available_on is not null),
  constraint payments_held_needs_university check (availability <> 'held_by_university' or received_by = 'university'),
  -- who recorded it is always known, except for a labelled bulk import
  constraint payments_recorder_or_source check (recorded_by is not null or source_ref is not null)
);

create index sponsorship_payments_contribution_idx on public.sponsorship_payments (contribution_id);
create unique index sponsorship_payments_source_unique on public.sponsorship_payments (source_type, source_ref) where source_ref is not null;

-- ---------------------------------------------------------
-- Level decisions: append-only proof of why a sponsor holds a level
-- ---------------------------------------------------------
create table public.sponsorship_level_decisions (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null references public.sponsorships(id) on delete restrict,
  level_id uuid references public.sponsorship_levels(id) on delete restrict,
  method text not null check (method in ('qualified', 'exception', 'custom', 'historical_unassigned')),
  basis_cash numeric(12, 2) not null check (basis_cash >= 0),
  basis_in_kind numeric(12, 2) not null check (basis_in_kind >= 0),
  basis_total numeric(12, 2) generated always as (basis_cash + basis_in_kind) stored,
  threshold numeric(12, 2),
  reason text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz not null default now(),
  constraint decisions_qualified check (method <> 'qualified' or (level_id is not null and threshold is not null and basis_cash + basis_in_kind >= threshold)),
  constraint decisions_exception check (method <> 'exception' or (level_id is not null and threshold is not null and basis_cash + basis_in_kind < threshold and coalesce(btrim(reason), '') <> '')),
  constraint decisions_custom check (method <> 'custom' or (level_id is null and coalesce(btrim(reason), '') <> '')),
  constraint decisions_historical check (method <> 'historical_unassigned' or level_id is null)
);

create index sponsorship_level_decisions_sponsorship_idx on public.sponsorship_level_decisions (sponsorship_id);

alter table public.sponsorships
  add constraint sponsorships_level_decision_fk foreign key (level_decision_id)
  references public.sponsorship_level_decisions(id) on delete restrict;

-- ---------------------------------------------------------
-- History log (append-only): notes typed by people + system events
-- ---------------------------------------------------------
create table public.sponsorship_history (
  id uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null references public.sponsorships(id) on delete restrict,
  kind text not null check (kind in ('note', 'stage_change', 'level_decision', 'contribution', 'payment', 'availability')),
  body text,
  details jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index sponsorship_history_sponsorship_idx on public.sponsorship_history (sponsorship_id, created_at);

create trigger sponsorship_history_stamp_created_by before insert on public.sponsorship_history
  for each row execute function public.sponsorship_stamp_created_by();

-- ---------------------------------------------------------
-- Triggers: validation and history
-- ---------------------------------------------------------
-- sponsorships: created_by, updated_at; the responsible person must be a Business
-- member; a standard level must belong to the sponsorship's own season; level
-- fields are protected; "committed" needs real backing.
create or replace function public.sponsorships_before_write()
returns trigger
language plpgsql
as $$
declare
  v_level_season text;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.stage = 'committed' then
      raise exception 'Create the sponsorship first; it can be marked Committed once it has a contribution and a level decision'
        using errcode = '23514';
    end if;
  else
    new.updated_at := now();
    -- the level is only ever changed by set_sponsorship_level()
    if current_setting('bobcat.sponsorship_level_write', true) is distinct from 'true' then
      new.level_id := old.level_id;
      new.level_decision_id := old.level_decision_id;
    end if;
  end if;

  if new.responsible_user_id is not null
     and (tg_op = 'INSERT' or new.responsible_user_id is distinct from old.responsible_user_id)
     and not public.is_business_member_user(new.responsible_user_id) then
    raise exception 'The responsible person must be on the Business team' using errcode = '23514';
  end if;

  if new.level_id is not null and (tg_op = 'INSERT' or new.level_id is distinct from old.level_id) then
    select season into v_level_season from public.sponsorship_levels where id = new.level_id;
    if v_level_season is distinct from new.season then
      raise exception 'That level belongs to a different season' using errcode = '23514';
    end if;
  end if;

  if new.stage = 'committed' and (tg_op = 'INSERT' or old.stage is distinct from 'committed') then
    if not exists (
      select 1 from public.sponsorship_contributions c
       where c.sponsorship_id = new.id and c.withdrawn = false
         and coalesce(c.committed_amount, c.estimated_value, 0) > 0
    ) then
      raise exception 'A sponsorship needs an active contribution before it can be Committed' using errcode = '23514';
    end if;
    if new.level_decision_id is null then
      raise exception 'A sponsorship needs a level decision (or custom terms) before it can be Committed' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger sponsorships_before_write before insert or update on public.sponsorships
  for each row execute function public.sponsorships_before_write();

create or replace function public.sponsorships_log_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
    values (new.id, 'stage_change', old.stage || ' → ' || new.stage, jsonb_build_object('from', old.stage, 'to', new.stage), auth.uid());
  end if;
  return new;
end;
$$;

create trigger sponsorships_log_stage after update on public.sponsorships
  for each row execute function public.sponsorships_log_stage();

-- contributions: history on add / change of the committed amount or value
create or replace function public.contributions_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
    values (new.sponsorship_id, 'contribution',
            'Added ' || new.kind || ' contribution of ' || coalesce(new.committed_amount, new.estimated_value)::text,
            jsonb_build_object('contribution_id', new.id, 'kind', new.kind, 'amount', coalesce(new.committed_amount, new.estimated_value)),
            auth.uid());
  elsif coalesce(new.committed_amount, new.estimated_value) is distinct from coalesce(old.committed_amount, old.estimated_value)
        or new.withdrawn is distinct from old.withdrawn then
    insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
    values (new.sponsorship_id, 'contribution',
            case when new.withdrawn and not old.withdrawn then 'Withdrew ' || new.kind || ' contribution'
                 else 'Changed ' || new.kind || ' contribution from ' || coalesce(old.committed_amount, old.estimated_value)::text
                      || ' to ' || coalesce(new.committed_amount, new.estimated_value)::text end,
            jsonb_build_object('contribution_id', new.id, 'kind', new.kind,
                               'from', coalesce(old.committed_amount, old.estimated_value),
                               'to', coalesce(new.committed_amount, new.estimated_value),
                               'withdrawn', new.withdrawn),
            auth.uid());
  end if;
  return new;
end;
$$;

create trigger contributions_log after insert or update on public.sponsorship_contributions
  for each row execute function public.contributions_log();

-- payments: cash contributions only; refunds cannot exceed what was paid;
-- ledger rows are immutable except the one controlled availability stamp.
create or replace function public.payments_before_write()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
  v_withdrawn boolean;
  v_net numeric(12, 2);
begin
  if tg_op = 'INSERT' then
    select kind, withdrawn into v_kind, v_withdrawn from public.sponsorship_contributions where id = new.contribution_id;
    if v_kind is distinct from 'cash' then
      raise exception 'Payments can only be recorded against a cash contribution' using errcode = '23514';
    end if;
    if new.entry_type = 'payment' and v_withdrawn then
      raise exception 'This contribution was withdrawn' using errcode = '23514';
    end if;
    new.recorded_by := coalesce(auth.uid(), new.recorded_by);
    new.recorded_at := now();
    if new.entry_type = 'refund' then
      select coalesce(sum(case entry_type when 'payment' then amount else -amount end), 0) into v_net
        from public.sponsorship_payments where contribution_id = new.contribution_id;
      if new.amount > v_net then
        raise exception 'A refund cannot exceed the amount received (%)', v_net using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: only mark_payment_available() may change anything, and only these columns
  if current_setting('bobcat.payment_availability_write', true) is distinct from 'true' then
    raise exception 'Payment records cannot be edited. Record a refund and a new payment to correct one.' using errcode = '42501';
  end if;
  if (new.contribution_id, new.entry_type, new.amount, new.received_on, new.received_on_precision, new.method, new.reference, new.notes, new.received_by, new.source_type, new.source_ref, new.recorded_by, new.recorded_at)
     is distinct from
     (old.contribution_id, old.entry_type, old.amount, old.received_on, old.received_on_precision, old.method, old.reference, old.notes, old.received_by, old.source_type, old.source_ref, old.recorded_by, old.recorded_at) then
    raise exception 'Only the availability of a payment can change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger payments_before_write before insert or update on public.sponsorship_payments
  for each row execute function public.payments_before_write();

create or replace function public.payments_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsorship uuid;
begin
  select sponsorship_id into v_sponsorship from public.sponsorship_contributions where id = new.contribution_id;
  if tg_op = 'INSERT' then
    insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
    values (v_sponsorship, 'payment',
            case new.entry_type when 'payment' then 'Recorded payment of ' else 'Recorded refund of ' end || new.amount::text,
            jsonb_build_object('payment_id', new.id, 'entry_type', new.entry_type, 'amount', new.amount, 'method', new.method, 'availability', new.availability),
            auth.uid());
  elsif new.availability is distinct from old.availability then
    insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
    values (v_sponsorship, 'availability', 'Payment of ' || new.amount::text || ' marked ' || new.availability,
            jsonb_build_object('payment_id', new.id, 'from', old.availability, 'to', new.availability, 'available_on', new.available_on),
            auth.uid());
  end if;
  return new;
end;
$$;

create trigger payments_log after insert or update on public.sponsorship_payments
  for each row execute function public.payments_log();

-- level decisions: stamped, and mirrored into the history log
create or replace function public.decisions_before_insert()
returns trigger
language plpgsql
as $$
begin
  new.decided_by := coalesce(auth.uid(), new.decided_by);
  new.decided_at := now();
  return new;
end;
$$;

create trigger decisions_before_insert before insert on public.sponsorship_level_decisions
  for each row execute function public.decisions_before_insert();

create or replace function public.decisions_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sponsorship_history (sponsorship_id, kind, body, details, created_by)
  values (new.sponsorship_id, 'level_decision', 'Level decision: ' || new.method,
          jsonb_build_object('decision_id', new.id, 'method', new.method, 'level_id', new.level_id,
                             'basis_cash', new.basis_cash, 'basis_in_kind', new.basis_in_kind, 'threshold', new.threshold, 'reason', new.reason),
          auth.uid());
  return new;
end;
$$;

create trigger decisions_log after insert on public.sponsorship_level_decisions
  for each row execute function public.decisions_log();

-- ---------------------------------------------------------
-- Functions
-- ---------------------------------------------------------
-- Sets a sponsorship's level. Reads the live contributions ITSELF, so the basis
-- can never be supplied or faked by the caller, and records an immutable
-- decision. p_level_id null = a custom sponsorship (a reason is required).
-- SECURITY DEFINER because decisions have no client insert path; the manager check
-- below is the gate, and the actor is still the caller (auth.uid()).
create or replace function public.set_sponsorship_level(p_sponsorship_id uuid, p_level_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sponsorships;
  lv public.sponsorship_levels;
  v_cash numeric(12, 2);
  v_kind numeric(12, 2);
  v_method text;
  v_decision uuid;
begin
  if not public.can_manage_sponsorships() then
    raise exception 'Only the Sponsorship Lead, the Business Lead or an admin can set a sponsorship level' using errcode = '42501';
  end if;

  select * into s from public.sponsorships where id = p_sponsorship_id;
  if not found then
    raise exception 'Sponsorship not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(committed_amount), 0), coalesce(sum(estimated_value), 0)
    into v_cash, v_kind
    from public.sponsorship_contributions
   where sponsorship_id = p_sponsorship_id and withdrawn = false;

  if p_level_id is null then
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'A custom sponsorship needs a reason or its terms' using errcode = '23514';
    end if;
    v_method := 'custom';
  else
    select * into lv from public.sponsorship_levels where id = p_level_id;
    if not found or lv.season is distinct from s.season or not lv.active then
      raise exception 'That level is not available for this sponsorship''s season' using errcode = '23514';
    end if;
    if v_cash + v_kind >= lv.min_amount then
      v_method := 'qualified';
    else
      if coalesce(btrim(p_reason), '') = '' then
        raise exception 'This sponsorship''s value (%) is below the % minimum (%). Give a reason to record an exception.', v_cash + v_kind, lv.name, lv.min_amount
          using errcode = '23514';
      end if;
      v_method := 'exception';
    end if;
  end if;

  insert into public.sponsorship_level_decisions (sponsorship_id, level_id, method, basis_cash, basis_in_kind, threshold, reason)
  values (p_sponsorship_id, p_level_id, v_method, v_cash, v_kind, lv.min_amount, nullif(btrim(p_reason), ''))
  returning id into v_decision;

  perform set_config('bobcat.sponsorship_level_write', 'true', true);
  update public.sponsorships set level_id = p_level_id, level_decision_id = v_decision where id = p_sponsorship_id;
  perform set_config('bobcat.sponsorship_level_write', '', true);

  return v_decision;
end;
$$;

-- One-way: stamps a payment as available to the team.
create or replace function public.mark_payment_available(p_payment_id uuid, p_available_on date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_availability text;
begin
  if not public.can_manage_sponsorships() then
    raise exception 'Only the Sponsorship Lead, the Business Lead or an admin can do this' using errcode = '42501';
  end if;
  select availability into v_availability from public.sponsorship_payments where id = p_payment_id and entry_type = 'payment';
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if v_availability = 'available' then
    raise exception 'This payment is already marked available' using errcode = '55000';
  end if;
  perform set_config('bobcat.payment_availability_write', 'true', true);
  update public.sponsorship_payments set availability = 'available', available_on = coalesce(p_available_on, current_date) where id = p_payment_id;
  perform set_config('bobcat.payment_availability_write', '', true);
end;
$$;

-- Seeds a season's sponsorship program: from the flyer's four levels (with their
-- standard deliverables), or by copying another season's program. The season
-- itself must already exist (Admin > Competition); this never creates one.
create or replace function public.create_sponsorship_program(p_season text, p_copy_from text default null)
returns integer
language plpgsql
as $$
declare
  v_count integer := 0;
  v_level uuid;
  r record;
  d record;
begin
  if not public.can_manage_sponsorships() then
    raise exception 'Only the Sponsorship Lead, the Business Lead or an admin can set up a program' using errcode = '42501';
  end if;
  if not exists (select 1 from public.competition_settings where season = p_season) then
    raise exception 'The season % does not exist yet. Create it in Admin > Competition first.', p_season using errcode = '23503';
  end if;
  if exists (select 1 from public.sponsorship_levels where season = p_season) then
    raise exception 'The % program already has levels', p_season using errcode = '55000';
  end if;

  if p_copy_from is null then
    -- the 2026-2027 flyer
    for r in
      select * from (values
        ('platinum', 'Platinum', 3000::numeric, 10),
        ('bobcat_gold', 'Bobcat Gold', 1500::numeric, 20),
        ('qu_navy', 'QU Navy', 500::numeric, 30),
        ('qu_sky_blue', 'QU Sky Blue', 250::numeric, 40)
      ) as t(k, n, m, o)
    loop
      insert into public.sponsorship_levels (season, level_key, name, min_amount, sort_order)
      values (p_season, r.k, r.n, r.m, r.o) returning id into v_level;
      v_count := v_count + 1;
      for d in
        select * from (values
          ('platinum', 'Logo received', 1), ('platinum', 'Logo approved', 2),
          ('platinum', 'Large logo on trailer', 3), ('platinum', 'Large logo on car', 4),
          ('platinum', 'Large logo on T-shirts', 5), ('platinum', 'Post-race Thank You plaque', 6),
          ('bobcat_gold', 'Logo received', 1), ('bobcat_gold', 'Logo approved', 2),
          ('bobcat_gold', 'Medium logo on trailer', 3), ('bobcat_gold', 'Medium logo on car', 4),
          ('bobcat_gold', 'Medium logo on T-shirts', 5),
          ('qu_navy', 'Logo received', 1), ('qu_navy', 'Logo approved', 2),
          ('qu_navy', 'Small logo on car', 3), ('qu_navy', 'Small logo on T-shirt', 4),
          ('qu_sky_blue', 'Name confirmed', 1), ('qu_sky_blue', 'Name on car', 2), ('qu_sky_blue', 'Name on T-shirt', 3)
        ) as x(k, t, o) where x.k = r.k
      loop
        insert into public.sponsorship_level_deliverables (level_id, title, sort_order) values (v_level, d.t, d.o);
      end loop;
    end loop;
  else
    for r in select * from public.sponsorship_levels where season = p_copy_from and active order by sort_order loop
      insert into public.sponsorship_levels (season, level_key, name, min_amount, sort_order)
      values (p_season, r.level_key, r.name, r.min_amount, r.sort_order) returning id into v_level;
      v_count := v_count + 1;
      insert into public.sponsorship_level_deliverables (level_id, title, sort_order)
        select v_level, title, sort_order from public.sponsorship_level_deliverables where level_id = r.id;
    end loop;
    if v_count = 0 then
      raise exception 'The % season has no program to copy', p_copy_from using errcode = '23514';
    end if;
  end if;
  return v_count;
end;
$$;

revoke execute on function public.set_sponsorship_level(uuid, uuid, text) from public;
revoke execute on function public.set_sponsorship_level(uuid, uuid, text) from anon, authenticated;
grant execute on function public.set_sponsorship_level(uuid, uuid, text) to authenticated;
revoke execute on function public.mark_payment_available(uuid, date) from public;
revoke execute on function public.mark_payment_available(uuid, date) from anon, authenticated;
grant execute on function public.mark_payment_available(uuid, date) to authenticated;
revoke execute on function public.create_sponsorship_program(text, text) from public;
revoke execute on function public.create_sponsorship_program(text, text) from anon, authenticated;
grant execute on function public.create_sponsorship_program(text, text) to authenticated;

-- ---------------------------------------------------------
-- Derived figures (nothing is stored twice). security_invoker: the views apply
-- the CALLER's row-level security, so they reveal nothing the tables would not.
-- ---------------------------------------------------------
create view public.sponsorship_summary with (security_invoker = true) as
select
  s.id as sponsorship_id,
  s.sponsor_id,
  sp.name as sponsor_name,
  s.season,
  s.stage,
  s.level_id,
  lv.name as level_name,
  coalesce(c.cash_committed, 0) as cash_committed,
  coalesce(p.received, 0) as cash_received,
  greatest(coalesce(c.cash_committed, 0) - coalesce(p.received, 0), 0) as cash_outstanding,
  greatest(coalesce(p.received, 0) - coalesce(c.cash_committed, 0), 0) as cash_over_received,
  coalesce(p.available, 0) as cash_available,
  coalesce(p.held_by_university, 0) as cash_held_by_university,
  coalesce(p.availability_unknown, 0) as cash_availability_unknown,
  coalesce(p.refunded, 0) as cash_refunded,
  coalesce(c.in_kind_value, 0) as in_kind_value,
  coalesce(c.in_kind_received_value, 0) as in_kind_received_value,
  coalesce(c.cash_committed, 0) + coalesce(c.in_kind_value, 0) as total_sponsorship_value
from public.sponsorships s
join public.sponsors sp on sp.id = s.sponsor_id
left join public.sponsorship_levels lv on lv.id = s.level_id
left join lateral (
  select sum(committed_amount) filter (where kind = 'cash') as cash_committed,
         sum(estimated_value) filter (where kind = 'in_kind') as in_kind_value,
         sum(estimated_value) filter (where kind = 'in_kind' and received_on is not null) as in_kind_received_value
    from public.sponsorship_contributions where sponsorship_id = s.id and withdrawn = false
) c on true
left join lateral (
  select sum(case when pay.entry_type = 'payment' then pay.amount else -pay.amount end) as received,
         sum(pay.amount) filter (where pay.entry_type = 'payment' and pay.availability = 'available') as available,
         sum(pay.amount) filter (where pay.entry_type = 'payment' and pay.availability = 'held_by_university') as held_by_university,
         sum(pay.amount) filter (where pay.entry_type = 'payment' and pay.availability = 'unknown') as availability_unknown,
         sum(pay.amount) filter (where pay.entry_type = 'refund') as refunded
    from public.sponsorship_payments pay
    join public.sponsorship_contributions con on con.id = pay.contribution_id
   where con.sponsorship_id = s.id
) p on true;

-- Compares the RECORDED level with what the live contributions would qualify
-- for. It only flags; it never changes anything.
create view public.sponsorship_level_review with (security_invoker = true) as
select
  sm.sponsorship_id,
  sm.season,
  sm.total_sponsorship_value as qualifying_value,
  sm.level_id as recorded_level_id,
  sm.level_name as recorded_level_name,
  d.method as decision_method,
  d.basis_total as decision_basis_total,
  suggested.id as suggested_level_id,
  suggested.name as suggested_level_name,
  case
    when s.level_decision_id is null then 'none_recorded'
    when d.method = 'historical_unassigned' then 'historical_unassigned'
    when d.method = 'custom' then 'custom'
    when d.method = 'exception' and sm.total_sponsorship_value < lv.min_amount then 'exception_recorded'
    when sm.total_sponsorship_value < lv.min_amount then 'below_minimum'
    when suggested.min_amount > lv.min_amount then 'qualifies_higher'
    else 'ok'
  end as review_flag
from public.sponsorship_summary sm
join public.sponsorships s on s.id = sm.sponsorship_id
left join public.sponsorship_level_decisions d on d.id = s.level_decision_id
left join public.sponsorship_levels lv on lv.id = s.level_id
left join lateral (
  select l.id, l.name, l.min_amount from public.sponsorship_levels l
   where l.season = s.season and l.active and l.min_amount <= sm.total_sponsorship_value
   order by l.min_amount desc limit 1
) suggested on true;

-- ---------------------------------------------------------
-- Row Level Security
--   read : anyone who can view Business (members, COO read-only, cto/admin)
--   write: can_manage_sponsorships() (Sponsorship Lead, Business Lead, cto/admin)
-- ---------------------------------------------------------
alter table public.sponsors enable row level security;
alter table public.sponsor_contacts enable row level security;
alter table public.sponsorship_levels enable row level security;
alter table public.sponsorship_level_deliverables enable row level security;
alter table public.sponsorships enable row level security;
alter table public.sponsorship_contributions enable row level security;
alter table public.sponsorship_payments enable row level security;
alter table public.sponsorship_level_decisions enable row level security;
alter table public.sponsorship_history enable row level security;

create policy sponsors_select on public.sponsors for select to authenticated using (public.can_view_business());
create policy sponsor_contacts_select on public.sponsor_contacts for select to authenticated using (public.can_view_business());
create policy sponsorship_levels_select on public.sponsorship_levels for select to authenticated using (public.can_view_business());
create policy sponsorship_level_deliverables_select on public.sponsorship_level_deliverables for select to authenticated using (public.can_view_business());
create policy sponsorships_select on public.sponsorships for select to authenticated using (public.can_view_business());
create policy sponsorship_contributions_select on public.sponsorship_contributions for select to authenticated using (public.can_view_business());
create policy sponsorship_payments_select on public.sponsorship_payments for select to authenticated using (public.can_view_business());
create policy sponsorship_level_decisions_select on public.sponsorship_level_decisions for select to authenticated using (public.can_view_business());
create policy sponsorship_history_select on public.sponsorship_history for select to authenticated using (public.can_view_business());

-- sponsors / contacts / sponsorships / contributions: managers write; only cto/admin delete
create policy sponsors_insert on public.sponsors for insert to authenticated with check (public.can_manage_sponsorships());
create policy sponsors_update on public.sponsors for update to authenticated using (public.can_manage_sponsorships()) with check (public.can_manage_sponsorships());
create policy sponsors_delete on public.sponsors for delete to authenticated using (public.is_cto_or_admin());

create policy sponsor_contacts_insert on public.sponsor_contacts for insert to authenticated with check (public.can_manage_sponsorships());
create policy sponsor_contacts_update on public.sponsor_contacts for update to authenticated using (public.can_manage_sponsorships()) with check (public.can_manage_sponsorships());
create policy sponsor_contacts_delete on public.sponsor_contacts for delete to authenticated using (public.can_manage_sponsorships());

create policy sponsorships_insert on public.sponsorships for insert to authenticated with check (public.can_manage_sponsorships());
create policy sponsorships_update on public.sponsorships for update to authenticated using (public.can_manage_sponsorships()) with check (public.can_manage_sponsorships());
create policy sponsorships_delete on public.sponsorships for delete to authenticated using (public.is_cto_or_admin());

create policy sponsorship_contributions_insert on public.sponsorship_contributions for insert to authenticated with check (public.can_manage_sponsorships());
create policy sponsorship_contributions_update on public.sponsorship_contributions for update to authenticated using (public.can_manage_sponsorships()) with check (public.can_manage_sponsorships());
create policy sponsorship_contributions_delete on public.sponsorship_contributions for delete to authenticated using (public.is_cto_or_admin());

-- the program catalog: managers adjust it (decisions keep their own snapshot of the threshold)
create policy sponsorship_levels_insert on public.sponsorship_levels for insert to authenticated with check (public.can_manage_sponsorships());
create policy sponsorship_levels_update on public.sponsorship_levels for update to authenticated using (public.can_manage_sponsorships()) with check (public.can_manage_sponsorships());
create policy sponsorship_level_deliverables_insert on public.sponsorship_level_deliverables for insert to authenticated with check (public.can_manage_sponsorships());
create policy sponsorship_level_deliverables_update on public.sponsorship_level_deliverables for update to authenticated using (public.can_manage_sponsorships()) with check (public.can_manage_sponsorships());
create policy sponsorship_level_deliverables_delete on public.sponsorship_level_deliverables for delete to authenticated using (public.can_manage_sponsorships());

-- append-only: insert only
create policy sponsorship_payments_insert on public.sponsorship_payments for insert to authenticated with check (public.can_manage_sponsorships());
create policy sponsorship_history_insert_note on public.sponsorship_history for insert to authenticated
  with check (public.can_manage_sponsorships() and kind = 'note');
-- sponsorship_level_decisions: NO insert policy — only set_sponsorship_level() (and a privileged import) writes them

-- ---------------------------------------------------------
-- Column / table privileges (the coarse first gate, before RLS)
-- ---------------------------------------------------------
revoke all on public.sponsors from authenticated, anon;
revoke all on public.sponsor_contacts from authenticated, anon;
revoke all on public.sponsorship_levels from authenticated, anon;
revoke all on public.sponsorship_level_deliverables from authenticated, anon;
revoke all on public.sponsorships from authenticated, anon;
revoke all on public.sponsorship_contributions from authenticated, anon;
revoke all on public.sponsorship_payments from authenticated, anon;
revoke all on public.sponsorship_level_decisions from authenticated, anon;
revoke all on public.sponsorship_history from authenticated, anon;
revoke all on public.sponsorship_summary from authenticated, anon;
revoke all on public.sponsorship_level_review from authenticated, anon;

grant select on public.sponsors, public.sponsor_contacts, public.sponsorship_levels, public.sponsorship_level_deliverables,
  public.sponsorships, public.sponsorship_contributions, public.sponsorship_payments, public.sponsorship_level_decisions,
  public.sponsorship_history, public.sponsorship_summary, public.sponsorship_level_review to authenticated;

grant insert (name, sponsor_type, website, notes, active) on public.sponsors to authenticated;
grant update (name, sponsor_type, website, notes, active) on public.sponsors to authenticated;
grant delete on public.sponsors to authenticated;

grant insert (sponsor_id, name, title, email, phone, is_primary, notes, active) on public.sponsor_contacts to authenticated;
grant update (name, title, email, phone, is_primary, notes, active) on public.sponsor_contacts to authenticated;
grant delete on public.sponsor_contacts to authenticated;

grant insert (season, level_key, name, min_amount, sort_order, active) on public.sponsorship_levels to authenticated;
grant update (name, min_amount, sort_order, active) on public.sponsorship_levels to authenticated;
grant insert (level_id, title, sort_order) on public.sponsorship_level_deliverables to authenticated;
grant update (title, sort_order) on public.sponsorship_level_deliverables to authenticated;
grant delete on public.sponsorship_level_deliverables to authenticated;

-- level_id / level_decision_id are deliberately NOT grantable: set_sponsorship_level() only
grant insert (sponsor_id, season, stage, custom_terms, responsible_user_id, committed_on, renewal_date, agreement_url, notes)
  on public.sponsorships to authenticated;
grant update (stage, custom_terms, responsible_user_id, committed_on, renewal_date, agreement_url, notes)
  on public.sponsorships to authenticated;
grant delete on public.sponsorships to authenticated;

grant insert (sponsorship_id, kind, description, committed_amount, estimated_value, in_kind_type, contributed_on, contributed_on_precision, received_on, received_on_precision, withdrawn, notes)
  on public.sponsorship_contributions to authenticated;
grant update (description, committed_amount, estimated_value, in_kind_type, contributed_on, contributed_on_precision, received_on, received_on_precision, withdrawn, notes)
  on public.sponsorship_contributions to authenticated;
grant delete on public.sponsorship_contributions to authenticated;

grant insert (contribution_id, entry_type, amount, received_on, received_on_precision, method, reference, notes, received_by, availability, available_on)
  on public.sponsorship_payments to authenticated;
-- payments: no update / delete grant (mark_payment_available is the only change path)

grant insert (sponsorship_id, kind, body) on public.sponsorship_history to authenticated;
-- level decisions and history system rows: written by functions/triggers only
-- source_type / source_ref / source_supporting: never grantable through the API (import only)
