-- =========================================================
-- 0038_inventory_and_receiving.sql
-- Inventory (what we physically have, and where) and Receiving (what has actually
-- arrived against a purchase), tied to the parts catalog from 0037 and to the
-- existing purchasing tables. Builds on 0002 (helpers), 0007/0022/0027/0031/0032
-- (purchasing), 0011 (audit_logs), 0028 (operations permissions) and 0037 (parts)
-- and reuses their patterns: SECURITY DEFINER boolean helpers with the full EXECUTE
-- revoke, trigger-derived who/when fields, append-only history, archive-over-delete,
-- transaction-local locking and security_invoker views.
--
-- Changes NO existing row, policy or grant. The only existing objects touched are two
-- NEW guard triggers: one on purchase_request_items (a line cannot be lowered below,
-- or removed after, what has been received) and one on purchase_requests (a request
-- that has been received against cannot go back to an early status). Purchase status
-- is never changed by receiving; the existing workflow and its meanings are untouched.
--
-- Model
--   A part is the catalog identity (0037). Inventory is the physical quantity of that
--   part: one row per part + location. There is no second "item" identity.
--   inventory_locations     the team's real locations. NO rows are created here.
--   inventory_stock         current quantity per part + location. A CACHE of the ledger:
--                           written only by the ledger trigger, never by a client.
--   inventory_transactions  the append-only ledger (the source of truth). Every change to a
--                           quantity is one row here: opening_balance, receipt,
--                           receipt_reversal, adjustment, write_off, transfer_out/in.
--   purchase_receipts       one receiving event (a delivery) against one purchase request.
--   purchase_receipt_lines  the quantities accepted / rejected per purchase line. A receipt
--                           is never edited; a mistake is undone by a REVERSAL line.
--
-- Receiving math (integers only, like purchasing quantities)
--   accepted = sum of quantity_received on the line's receipt lines (reversals are negative)
--   rejected = sum of quantity_rejected (recorded with a reason; never enters stock)
--   outstanding = ordered - accepted
--   A line is FULLY RECEIVED only when accepted = ordered. Rejected units do not consume the
--   order, so ordered 10 / accepted 8 / rejected 2 is still outstanding 2 and NOT fully received.
--   Accepted can never exceed ordered (0 <= accepted <= ordered), enforced by a database trigger.
--
-- Who can do what (enforced by RLS, column grants, functions with explicit 42501 checks)
--   read everything                any approved, ACTIVE user (like purchasing, parts, vendors)
--   receive a purchase             cto / admin / COO for any request; a team lead for requests
--                                  of a subsystem they lead. Business roles are read-only.
--   adjust / write off / transfer  cto / admin / COO for any part; a team lead for parts of a
--                                  subsystem they lead
--   opening balance, locations     cto / admin / COO
--   reverse a receipt line         cto / admin
--   nobody can write any inventory table directly (no insert / update / delete grant), and the
--   ledger, receipts and receipt lines cannot be changed or deleted by anyone once written.
--
-- Audit: locations (created / updated / deactivated / reactivated), opening balances and receipt
-- reversals are written to the EXISTING audit_logs table (cto/admin read only). The ledger itself
-- is the operational history everyone can read.
-- =========================================================

-- ---------------------------------------------------------
-- Helpers (boolean only, EXECUTE for authenticated only)
-- ---------------------------------------------------------
create or replace function public.can_manage_inventory()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_operations();
$$;

create or replace function public.can_receive_purchase(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.purchase_requests pr
     where pr.id = p_request_id
       and (public.can_manage_inventory() or (public.is_approved() and public.is_subsystem_lead(pr.subsystem_id)))
  );
$$;

create or replace function public.can_adjust_part_stock(p_part_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_inventory() or (public.is_approved() and public.can_manage_part_id(p_part_id));
$$;

revoke execute on function public.can_manage_inventory() from public;
revoke execute on function public.can_manage_inventory() from anon, authenticated;
grant execute on function public.can_manage_inventory() to authenticated;
revoke execute on function public.can_receive_purchase(uuid) from public;
revoke execute on function public.can_receive_purchase(uuid) from anon, authenticated;
grant execute on function public.can_receive_purchase(uuid) to authenticated;
revoke execute on function public.can_adjust_part_stock(uuid) from public;
revoke execute on function public.can_adjust_part_stock(uuid) from anon, authenticated;
grant execute on function public.can_adjust_part_stock(uuid) to authenticated;

-- ---------------------------------------------------------
-- inventory_locations (no rows are created by this migration)
-- ---------------------------------------------------------
create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  -- lower-cased, punctuation / spaces removed: "Team Storage" and "team-storage" collide
  name_key text not null,
  description text check (description is null or char_length(description) <= 500),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_locations_name_key_unique unique (name_key)
);

create or replace function public.inventory_locations_before_write()
returns trigger
language plpgsql
as $$
begin
  new.name := btrim(new.name);
  new.name_key := lower(regexp_replace(new.name, '[^A-Za-z0-9]+', '', 'g'));
  if new.name_key = '' then
    raise exception 'A location name needs letters or numbers' using errcode = '23514';
  end if;
  new.description := nullif(btrim(new.description), '');
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger inventory_locations_before_write before insert or update on public.inventory_locations
  for each row execute function public.inventory_locations_before_write();

-- ---------------------------------------------------------
-- inventory_stock: the current quantity, a cache of the ledger
-- ---------------------------------------------------------
create table public.inventory_stock (
  part_id uuid not null references public.parts(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  updated_at timestamptz not null default now(),
  primary key (part_id, location_id)
);

create index inventory_stock_location_idx on public.inventory_stock (location_id);

-- ---------------------------------------------------------
-- purchase_receipts / purchase_receipt_lines
-- ---------------------------------------------------------
create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  received_by uuid not null references public.profiles(id) on delete restrict,
  received_on date not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  -- generated by the form when it opens: a retry or double click replays the same receipt instead of receiving twice
  client_token uuid not null,
  created_at timestamptz not null default now(),
  constraint purchase_receipts_client_token_key unique (client_token)
);

create index purchase_receipts_request_idx on public.purchase_receipts (purchase_request_id);
create index purchase_receipts_received_on_idx on public.purchase_receipts (received_on desc, created_at desc);

create table public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.purchase_receipts(id) on delete restrict,
  purchase_request_item_id uuid not null references public.purchase_request_items(id) on delete restrict,
  -- accepted units (they enter stock when the line has a part). Negative only on a reversal line.
  quantity_received integer not null,
  -- rejected / damaged units: recorded, never stocked, and they do NOT consume the order
  quantity_rejected integer not null default 0 check (quantity_rejected >= 0),
  rejected_reason text check (rejected_reason is null or char_length(rejected_reason) <= 500),
  -- the part these units were stocked as: the purchase line's own catalog link, or, for a free-text line, the receiver's choice.
  -- The purchase line itself is never rewritten.
  part_id uuid references public.parts(id) on delete restrict,
  location_id uuid references public.inventory_locations(id) on delete restrict,
  -- a correction: this line undoes another (one reversal per line, full quantity only)
  reverses_line_id uuid references public.purchase_receipt_lines(id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 500),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  constraint purchase_receipt_lines_reverses_once unique (reverses_line_id),
  constraint purchase_receipt_lines_shape check (
    (reverses_line_id is null and quantity_received >= 0 and quantity_received + quantity_rejected > 0)
    or (reverses_line_id is not null and quantity_received < 0 and quantity_rejected = 0 and nullif(btrim(reason), '') is not null)
  ),
  constraint purchase_receipt_lines_rejected_reason check (quantity_rejected = 0 or nullif(btrim(rejected_reason), '') is not null),
  -- a location exists exactly when accepted units were stocked
  constraint purchase_receipt_lines_stock_shape check ((location_id is not null) = (part_id is not null and quantity_received <> 0))
);

create index purchase_receipt_lines_receipt_idx on public.purchase_receipt_lines (receipt_id);
create index purchase_receipt_lines_item_idx on public.purchase_receipt_lines (purchase_request_item_id);
create index purchase_receipt_lines_part_idx on public.purchase_receipt_lines (part_id) where part_id is not null;

-- ---------------------------------------------------------
-- inventory_transactions: the append-only ledger
-- ---------------------------------------------------------
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity_delta integer not null check (quantity_delta <> 0),
  kind text not null check (kind in ('opening_balance', 'receipt', 'receipt_reversal', 'adjustment', 'write_off', 'transfer_out', 'transfer_in')),
  reason text check (reason is null or char_length(reason) <= 500),
  notes text check (notes is null or char_length(notes) <= 1000),
  receipt_line_id uuid references public.purchase_receipt_lines(id) on delete restrict,
  transfer_group_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_transactions_sign check (
    (kind in ('opening_balance', 'receipt', 'transfer_in') and quantity_delta > 0)
    or (kind in ('receipt_reversal', 'write_off', 'transfer_out') and quantity_delta < 0)
    or kind = 'adjustment'
  ),
  constraint inventory_transactions_reason_required check (kind in ('receipt', 'transfer_in', 'transfer_out') or nullif(btrim(reason), '') is not null),
  -- an opening balance or adjustment is never dressed up as a purchase, and a receipt always names its receipt line
  constraint inventory_transactions_receipt_link check ((kind in ('receipt', 'receipt_reversal')) = (receipt_line_id is not null)),
  constraint inventory_transactions_transfer_link check ((kind in ('transfer_in', 'transfer_out')) = (transfer_group_id is not null))
);

create index inventory_transactions_part_idx on public.inventory_transactions (part_id, created_at desc);
create index inventory_transactions_location_idx on public.inventory_transactions (location_id);
create index inventory_transactions_created_idx on public.inventory_transactions (created_at desc);
-- a receipt line can be posted to the ledger only once; a transfer is exactly one "out" and one "in"
create unique index inventory_transactions_one_per_receipt_line on public.inventory_transactions (receipt_line_id) where receipt_line_id is not null;
create unique index inventory_transactions_one_per_transfer_side on public.inventory_transactions (transfer_group_id, kind) where transfer_group_id is not null;

-- who / when are never client-supplied
create or replace function public.inventory_transactions_before_insert()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'An inventory change needs a signed-in person' using errcode = '42501';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  new.reason := nullif(btrim(new.reason), '');
  new.notes := nullif(btrim(new.notes), '');
  return new;
end;
$$;

create trigger inventory_transactions_before_insert before insert on public.inventory_transactions
  for each row execute function public.inventory_transactions_before_insert();

-- The stock cache follows the ledger, in the same transaction. A row that would take a quantity below zero
-- is refused (the CHECK on quantity_on_hand is the backstop; the functions below give the friendly message).
create or replace function public.inventory_transactions_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quantity_delta > 0 then
    insert into public.inventory_stock (part_id, location_id, quantity_on_hand)
    values (new.part_id, new.location_id, new.quantity_delta)
    on conflict (part_id, location_id)
    do update set quantity_on_hand = public.inventory_stock.quantity_on_hand + excluded.quantity_on_hand, updated_at = now();
  else
    update public.inventory_stock
       set quantity_on_hand = quantity_on_hand + new.quantity_delta, updated_at = now()
     where part_id = new.part_id and location_id = new.location_id;
    if not found then
      raise exception 'There is no stock of this part at this location to take from' using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.inventory_transactions_apply() from public;
revoke execute on function public.inventory_transactions_apply() from anon, authenticated;

create trigger inventory_transactions_apply after insert on public.inventory_transactions
  for each row execute function public.inventory_transactions_apply();

-- Ledger, receipts and receipt lines are permanent history: nobody (no role) can change or remove a row.
create or replace function public.inventory_history_is_permanent()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Inventory and receiving history is permanent and cannot be changed or deleted; record a correction instead'
    using errcode = '42501';
end;
$$;

create trigger inventory_transactions_permanent before update or delete on public.inventory_transactions
  for each row execute function public.inventory_history_is_permanent();
create trigger inventory_transactions_no_truncate before truncate on public.inventory_transactions
  for each statement execute function public.inventory_history_is_permanent();
create trigger purchase_receipts_permanent before update or delete on public.purchase_receipts
  for each row execute function public.inventory_history_is_permanent();
create trigger purchase_receipts_no_truncate before truncate on public.purchase_receipts
  for each statement execute function public.inventory_history_is_permanent();
create trigger purchase_receipt_lines_permanent before update or delete on public.purchase_receipt_lines
  for each row execute function public.inventory_history_is_permanent();
create trigger purchase_receipt_lines_no_truncate before truncate on public.purchase_receipt_lines
  for each statement execute function public.inventory_history_is_permanent();

-- ---------------------------------------------------------
-- Receipt line guard: the database, not just the function, keeps 0 <= accepted <= ordered
-- ---------------------------------------------------------
create or replace function public.purchase_receipt_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.purchase_request_items;
  v_request uuid;
  v_net integer;
  v_orig public.purchase_receipt_lines;
begin
  select purchase_request_id into v_request from public.purchase_receipts where id = new.receipt_id;
  select * into v_item from public.purchase_request_items where id = new.purchase_request_item_id for update;
  if not found or v_request is distinct from v_item.purchase_request_id then
    raise exception 'That purchase line does not belong to this receipt''s purchase request' using errcode = '23503';
  end if;

  select coalesce(sum(quantity_received), 0)::integer into v_net
    from public.purchase_receipt_lines where purchase_request_item_id = new.purchase_request_item_id;
  if v_net + new.quantity_received > v_item.quantity then
    raise exception 'Receiving % would put "%" over what was ordered (% ordered, % already received)',
      new.quantity_received, v_item.description, v_item.quantity, v_net using errcode = '23514';
  end if;
  if v_net + new.quantity_received < 0 then
    raise exception 'That would take the received quantity of "%" below zero', v_item.description using errcode = '23514';
  end if;

  if new.reverses_line_id is not null then
    select * into v_orig from public.purchase_receipt_lines where id = new.reverses_line_id;
    if not found
       or v_orig.reverses_line_id is not null
       or v_orig.purchase_request_item_id <> new.purchase_request_item_id
       or v_orig.quantity_received <= 0
       or new.quantity_received <> -v_orig.quantity_received
       or v_orig.part_id is distinct from new.part_id
       or v_orig.location_id is distinct from new.location_id then
      raise exception 'A reversal must undo the whole accepted quantity of one receipt line, at the same part and location' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.purchase_receipt_lines_guard() from public;
revoke execute on function public.purchase_receipt_lines_guard() from anon, authenticated;

create trigger purchase_receipt_lines_guard before insert on public.purchase_receipt_lines
  for each row execute function public.purchase_receipt_lines_guard();

-- ---------------------------------------------------------
-- Guards on the two existing purchasing tables (new triggers only; existing ones are untouched)
-- ---------------------------------------------------------
-- A purchase line cannot be lowered below what has already been accepted, and cannot be removed once it has receiving records.
create or replace function public.purchase_request_items_receipt_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_net integer;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.purchase_receipt_lines where purchase_request_item_id = old.id) then
      raise exception 'This line has receiving records and cannot be removed' using errcode = '23503';
    end if;
    return old;
  end if;
  if new.quantity < old.quantity then
    select coalesce(sum(quantity_received), 0)::integer into v_net from public.purchase_receipt_lines where purchase_request_item_id = old.id;
    if new.quantity < v_net then
      raise exception 'The quantity cannot be lowered to %: % have already been received', new.quantity, v_net using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.purchase_request_items_receipt_guard() from public;
revoke execute on function public.purchase_request_items_receipt_guard() from anon, authenticated;

create trigger purchase_request_items_receipt_guard_delete before delete on public.purchase_request_items
  for each row execute function public.purchase_request_items_receipt_guard();
create trigger purchase_request_items_receipt_guard_update before update of quantity on public.purchase_request_items
  for each row execute function public.purchase_request_items_receipt_guard();

-- A request that has been received against cannot go back to an early status (or be rejected). Cancelled stays possible
-- (the rest of a partly delivered order can be cancelled), and moving forward is never blocked.
create or replace function public.purchase_requests_receipt_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected')
     and exists (select 1 from public.purchase_receipts where purchase_request_id = old.id) then
    raise exception 'This purchase request has receiving records and cannot go back to %', new.status using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.purchase_requests_receipt_guard() from public;
revoke execute on function public.purchase_requests_receipt_guard() from anon, authenticated;

create trigger purchase_requests_receipt_guard before update of status on public.purchase_requests
  for each row execute function public.purchase_requests_receipt_guard();

-- ---------------------------------------------------------
-- Audit for locations (the existing audit_logs table; written only by this trigger)
-- ---------------------------------------------------------
create or replace function public.inventory_locations_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb := to_jsonb(new);
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_action text;
  k text;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), 'inventory_location.created', 'inventory_location', new.id, null, v_new - 'updated_at');
    return new;
  end if;
  v_old := to_jsonb(old);
  for k in select jsonb_object_keys(v_new) loop
    if k <> 'updated_at' and (v_new -> k) is distinct from (v_old -> k) then
      v_before := v_before || jsonb_build_object(k, v_old -> k);
      v_after := v_after || jsonb_build_object(k, v_new -> k);
    end if;
  end loop;
  if v_after = '{}'::jsonb then
    return new;
  end if;
  v_action := case
    when old.active and not new.active then 'inventory_location.deactivated'
    when not old.active and new.active then 'inventory_location.reactivated'
    else 'inventory_location.updated'
  end;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), v_action, 'inventory_location', new.id, v_before, v_after);
  return new;
end;
$$;

revoke execute on function public.inventory_locations_audit() from public;
revoke execute on function public.inventory_locations_audit() from anon, authenticated;

create trigger inventory_locations_audit after insert or update on public.inventory_locations
  for each row execute function public.inventory_locations_audit();

-- ---------------------------------------------------------
-- The one place a quantity changes: inventory_post() writes the ledger row (the trigger updates the stock cache).
-- Internal only: no role can call it directly; the public functions below do the authorization first.
-- ---------------------------------------------------------
create or replace function public.inventory_post(
  p_part_id uuid,
  p_location_id uuid,
  p_delta integer,
  p_kind text,
  p_reason text,
  p_notes text,
  p_receipt_line_id uuid default null,
  p_transfer_group uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part public.parts;
  v_loc public.inventory_locations;
  v_have integer;
  v_id uuid;
begin
  select * into v_part from public.parts where id = p_part_id;
  if not found then
    raise exception 'That part does not exist' using errcode = 'P0002';
  end if;
  select * into v_loc from public.inventory_locations where id = p_location_id;
  if not found then
    raise exception 'That location does not exist' using errcode = 'P0002';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'The quantity cannot be zero' using errcode = '23514';
  end if;

  if p_delta > 0 then
    if not v_loc.active then
      raise exception 'The location "%" is inactive; choose an active location', v_loc.name using errcode = '23514';
    end if;
    -- adding units needs an active part; moving stock between locations does not change the total
    if p_kind <> 'transfer_in' and not v_part.active then
      raise exception 'The part % is inactive; reactivate it before adding stock', v_part.part_number using errcode = '23514';
    end if;
  else
    select quantity_on_hand into v_have from public.inventory_stock where part_id = p_part_id and location_id = p_location_id for update;
    if coalesce(v_have, 0) < -p_delta then
      raise exception 'Only % of % are on hand at "%" (you asked to remove %)', coalesce(v_have, 0), v_part.part_number, v_loc.name, -p_delta using errcode = '23514';
    end if;
  end if;

  insert into public.inventory_transactions (part_id, location_id, quantity_delta, kind, reason, notes, receipt_line_id, transfer_group_id)
  values (p_part_id, p_location_id, p_delta, p_kind, p_reason, p_notes, p_receipt_line_id, p_transfer_group)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.inventory_post(uuid, uuid, integer, text, text, text, uuid, uuid) from public;
revoke execute on function public.inventory_post(uuid, uuid, integer, text, text, text, uuid, uuid) from anon, authenticated;

-- ---------------------------------------------------------
-- Receiving
-- ---------------------------------------------------------
-- p_lines is a JSON array of { item_id, received, rejected, rejected_reason, part_id, location_id, notes }.
-- One call is one transaction: every line is received, or none is. Repeating a call with the same p_client_token
-- returns the existing receipt and changes nothing.
create or replace function public.receive_purchase_items(
  p_request_id uuid,
  p_received_on date,
  p_notes text,
  p_client_token uuid,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.purchase_requests;
  v_existing public.purchase_receipts;
  v_receipt uuid;
  v_item public.purchase_request_items;
  v_net integer;
  v_recv integer;
  v_rej integer;
  v_part uuid;
  v_loc uuid;
  v_line uuid;
  v_seen uuid[] := '{}';
  v_done integer := 0;
  r record;
begin
  if v_uid is null or not public.can_receive_purchase(p_request_id) then
    raise exception 'You do not have permission to receive against this purchase request' using errcode = '42501';
  end if;
  if p_client_token is null then
    raise exception 'A receiving token is required' using errcode = '22023';
  end if;

  -- a retry / double click: same token, same request, same person -> the receipt that already exists
  select * into v_existing from public.purchase_receipts where client_token = p_client_token;
  if found then
    if v_existing.purchase_request_id = p_request_id and v_existing.received_by = v_uid then
      return v_existing.id;
    end if;
    raise exception 'That receiving token was already used for a different receipt' using errcode = '23505';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 100 then
    raise exception 'Enter the quantities received for at least one line' using errcode = '22023';
  end if;

  select * into v_req from public.purchase_requests where id = p_request_id for share;
  if v_req.status not in ('Ordered', 'In Transit', 'Arrived in Shop') then
    raise exception 'Only an Ordered, In Transit or Arrived in Shop request can be received (this one is %)', v_req.status using errcode = '55000';
  end if;
  if p_received_on is null or p_received_on > current_date + 1 or p_received_on < v_req.created_at::date then
    raise exception 'The received date must be on or after the day the request was created, and not in the future' using errcode = '23514';
  end if;

  insert into public.purchase_receipts (purchase_request_id, received_by, received_on, notes, client_token)
  values (p_request_id, v_uid, p_received_on, nullif(btrim(p_notes), ''), p_client_token)
  on conflict (client_token) do nothing
  returning id into v_receipt;
  if v_receipt is null then
    -- a simultaneous identical call won the race: return its receipt
    select * into v_existing from public.purchase_receipts where client_token = p_client_token;
    if v_existing.purchase_request_id = p_request_id and v_existing.received_by = v_uid then
      return v_existing.id;
    end if;
    raise exception 'That receiving token was already used for a different receipt' using errcode = '23505';
  end if;

  -- lock the purchase lines in a fixed order so two people receiving the same order cannot deadlock
  for r in
    select x.item_id, x.received, x.rejected, x.rejected_reason, x.part_id, x.location_id, x.notes
      from jsonb_to_recordset(p_lines) as x(item_id uuid, received integer, rejected integer, rejected_reason text, part_id uuid, location_id uuid, notes text)
     order by x.item_id
  loop
    if r.item_id is null then
      raise exception 'Every line needs its purchase line id' using errcode = '22023';
    end if;
    if r.item_id = any (v_seen) then
      raise exception 'The same purchase line is listed twice' using errcode = '22023';
    end if;
    v_seen := v_seen || r.item_id;
    v_recv := coalesce(r.received, 0);
    v_rej := coalesce(r.rejected, 0);
    if v_recv < 0 or v_rej < 0 then
      raise exception 'Quantities cannot be negative' using errcode = '23514';
    end if;
    if v_recv = 0 and v_rej = 0 then
      continue;
    end if;
    if v_rej > 0 and nullif(btrim(r.rejected_reason), '') is null then
      raise exception 'Say why the rejected units were rejected' using errcode = '23514';
    end if;

    select * into v_item from public.purchase_request_items where id = r.item_id and purchase_request_id = p_request_id for update;
    if not found then
      raise exception 'A line does not belong to this purchase request' using errcode = 'P0002';
    end if;
    select coalesce(sum(quantity_received), 0)::integer into v_net from public.purchase_receipt_lines where purchase_request_item_id = v_item.id;
    if v_net + v_recv > v_item.quantity then
      raise exception 'Cannot receive % of "%": only % still outstanding (% ordered, % already received)',
        v_recv, v_item.description, v_item.quantity - v_net, v_item.quantity, v_net using errcode = '23514';
    end if;

    -- which part these units are stocked as: the line's own catalog link, else (free-text line) the receiver's choice
    v_part := v_item.part_id;
    if r.part_id is not null then
      if v_item.part_id is not null and r.part_id <> v_item.part_id then
        raise exception '"%" is already linked to a catalog part; it cannot be received as a different part', v_item.description using errcode = '23514';
      end if;
      if not exists (select 1 from public.parts where id = r.part_id) then
        raise exception 'That part does not exist' using errcode = 'P0002';
      end if;
      v_part := r.part_id;
    end if;
    if v_recv > 0 and v_part is not null then
      if r.location_id is null then
        raise exception 'Choose where "%" is being stored', v_item.description using errcode = '23514';
      end if;
      v_loc := r.location_id;
    else
      v_loc := null;
    end if;

    insert into public.purchase_receipt_lines (receipt_id, purchase_request_item_id, quantity_received, quantity_rejected, rejected_reason, part_id, location_id, notes)
    values (v_receipt, v_item.id, v_recv, v_rej, nullif(btrim(r.rejected_reason), ''), v_part, v_loc, nullif(btrim(r.notes), ''))
    returning id into v_line;

    if v_part is not null and v_recv > 0 then
      perform public.inventory_post(v_part, v_loc, v_recv, 'receipt', null, nullif(btrim(r.notes), ''), v_line, null);
    end if;
    v_done := v_done + 1;
  end loop;

  if v_done = 0 then
    raise exception 'Enter a quantity received or rejected for at least one line' using errcode = '23514';
  end if;
  return v_receipt;
end;
$$;

revoke execute on function public.receive_purchase_items(uuid, date, text, uuid, jsonb) from public;
revoke execute on function public.receive_purchase_items(uuid, date, text, uuid, jsonb) from anon, authenticated;
grant execute on function public.receive_purchase_items(uuid, date, text, uuid, jsonb) to authenticated;

-- Undo a receipt line (cto / admin). Never edits the original: it adds a reversal line (with its own receipt record)
-- and, when the units were stocked, takes them back out of stock. Refused if those units are no longer there.
create or replace function public.reverse_purchase_receipt_line(p_line_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_line public.purchase_receipt_lines;
  v_request uuid;
  v_receipt uuid;
  v_rev uuid;
begin
  if v_uid is null or not public.is_cto_or_admin() then
    raise exception 'Only the CTO or an admin can reverse a receipt' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required to reverse a receipt' using errcode = '23514';
  end if;
  select * into v_line from public.purchase_receipt_lines where id = p_line_id;
  if not found then
    raise exception 'Receipt line not found' using errcode = 'P0002';
  end if;
  if v_line.reverses_line_id is not null then
    raise exception 'A reversal cannot itself be reversed' using errcode = '23514';
  end if;
  if v_line.quantity_received <= 0 then
    raise exception 'That line accepted nothing, so there is nothing to reverse' using errcode = '23514';
  end if;
  perform 1 from public.purchase_request_items where id = v_line.purchase_request_item_id for update;
  if exists (select 1 from public.purchase_receipt_lines where reverses_line_id = p_line_id) then
    raise exception 'That receipt line has already been reversed' using errcode = '23505';
  end if;

  select purchase_request_id into v_request from public.purchase_receipts where id = v_line.receipt_id;
  insert into public.purchase_receipts (purchase_request_id, received_by, received_on, notes, client_token)
  values (v_request, v_uid, current_date, 'Reversal: ' || left(btrim(p_reason), 900), gen_random_uuid())
  returning id into v_receipt;

  insert into public.purchase_receipt_lines (receipt_id, purchase_request_item_id, quantity_received, quantity_rejected, part_id, location_id, reverses_line_id, reason)
  values (v_receipt, v_line.purchase_request_item_id, -v_line.quantity_received, 0, v_line.part_id, v_line.location_id, p_line_id, btrim(p_reason))
  returning id into v_rev;

  if v_line.part_id is not null then
    begin
      perform public.inventory_post(v_line.part_id, v_line.location_id, -v_line.quantity_received, 'receipt_reversal', btrim(p_reason), null, v_rev, null);
    exception when sqlstate '23514' then
      raise exception 'Those units are no longer in stock at that location (they were used, moved or written off); record a write-off or adjustment instead. Detail: %', sqlerrm using errcode = '23514';
    end;
  end if;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
  values (v_uid, 'purchase_receipt_line.reversed', 'purchase_receipt_line', p_line_id,
          jsonb_build_object('quantity_received', v_line.quantity_received, 'part_id', v_line.part_id, 'location_id', v_line.location_id),
          jsonb_build_object('reversal_line_id', v_rev, 'reason', btrim(p_reason)));
  return v_rev;
end;
$$;

revoke execute on function public.reverse_purchase_receipt_line(uuid, text) from public;
revoke execute on function public.reverse_purchase_receipt_line(uuid, text) from anon, authenticated;
grant execute on function public.reverse_purchase_receipt_line(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- Manual changes: adjustment, write-off, transfer, opening balance
-- ---------------------------------------------------------
create or replace function public.adjust_inventory(p_part_id uuid, p_location_id uuid, p_delta integer, p_reason text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_adjust_part_stock(p_part_id) then
    raise exception 'You do not have permission to adjust the stock of this part' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'The adjustment cannot be zero' using errcode = '23514';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required for an adjustment' using errcode = '23514';
  end if;
  return public.inventory_post(p_part_id, p_location_id, p_delta, 'adjustment', btrim(p_reason), p_notes);
end;
$$;

create or replace function public.write_off_inventory(p_part_id uuid, p_location_id uuid, p_quantity integer, p_reason text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_adjust_part_stock(p_part_id) then
    raise exception 'You do not have permission to write off the stock of this part' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter how many units to write off' using errcode = '23514';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required for a write-off' using errcode = '23514';
  end if;
  return public.inventory_post(p_part_id, p_location_id, -p_quantity, 'write_off', btrim(p_reason), p_notes);
end;
$$;

-- Both sides of a transfer are written in one transaction with one transfer_group_id; the source must hold enough.
create or replace function public.transfer_inventory(p_part_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity integer, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.can_adjust_part_stock(p_part_id) then
    raise exception 'You do not have permission to move the stock of this part' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter how many units to move' using errcode = '23514';
  end if;
  if p_from_location_id is null or p_to_location_id is null or p_from_location_id = p_to_location_id then
    raise exception 'Choose two different locations' using errcode = '23514';
  end if;
  -- take both stock rows in a fixed order so opposite transfers cannot deadlock
  perform 1 from public.inventory_stock
   where part_id = p_part_id and location_id in (p_from_location_id, p_to_location_id)
   order by location_id for update;
  perform public.inventory_post(p_part_id, p_from_location_id, -p_quantity, 'transfer_out', null, p_notes, null, v_group);
  perform public.inventory_post(p_part_id, p_to_location_id, p_quantity, 'transfer_in', null, p_notes, null, v_group);
  return v_group;
end;
$$;

create or replace function public.record_opening_balance(p_part_id uuid, p_location_id uuid, p_quantity integer, p_reason text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.can_manage_inventory() then
    raise exception 'Only the COO, CTO or an admin can record an opening balance' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter how many units are on hand' using errcode = '23514';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason or note is required for an opening balance' using errcode = '23514';
  end if;
  v_id := public.inventory_post(p_part_id, p_location_id, p_quantity, 'opening_balance', btrim(p_reason), p_notes);
  insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'inventory.opening_balance', 'inventory_transaction', v_id, null,
          jsonb_build_object('part_id', p_part_id, 'location_id', p_location_id, 'quantity', p_quantity, 'reason', btrim(p_reason)));
  return v_id;
end;
$$;

revoke execute on function public.adjust_inventory(uuid, uuid, integer, text, text) from public;
revoke execute on function public.adjust_inventory(uuid, uuid, integer, text, text) from anon, authenticated;
grant execute on function public.adjust_inventory(uuid, uuid, integer, text, text) to authenticated;
revoke execute on function public.write_off_inventory(uuid, uuid, integer, text, text) from public;
revoke execute on function public.write_off_inventory(uuid, uuid, integer, text, text) from anon, authenticated;
grant execute on function public.write_off_inventory(uuid, uuid, integer, text, text) to authenticated;
revoke execute on function public.transfer_inventory(uuid, uuid, uuid, integer, text) from public;
revoke execute on function public.transfer_inventory(uuid, uuid, uuid, integer, text) from anon, authenticated;
grant execute on function public.transfer_inventory(uuid, uuid, uuid, integer, text) to authenticated;
revoke execute on function public.record_opening_balance(uuid, uuid, integer, text, text) from public;
revoke execute on function public.record_opening_balance(uuid, uuid, integer, text, text) from anon, authenticated;
grant execute on function public.record_opening_balance(uuid, uuid, integer, text, text) to authenticated;

-- ---------------------------------------------------------
-- Derived views (security_invoker: the caller's own RLS applies; nothing is stored twice)
-- ---------------------------------------------------------
-- One row per purchase line: what was ordered, what has been accepted / rejected, what is still outstanding.
create view public.purchase_receiving_status with (security_invoker = true) as
select
  i.id as item_id,
  i.purchase_request_id,
  r.subsystem_id,
  r.title as request_title,
  r.status as request_status,
  i.description,
  i.part_number,
  i.vendor,
  i.part_id,
  i.vendor_id,
  i.quantity as ordered_quantity,
  coalesce(x.accepted, 0) as accepted_quantity,
  coalesce(x.rejected, 0) as rejected_quantity,
  i.quantity - coalesce(x.accepted, 0) as outstanding_quantity,
  coalesce(x.accepted, 0) = i.quantity as fully_received,
  x.last_received_on,
  r.status in ('Ordered', 'In Transit', 'Arrived in Shop') as receivable
from public.purchase_request_items i
join public.purchase_requests r on r.id = i.purchase_request_id
left join lateral (
  select sum(l.quantity_received)::integer as accepted,
         sum(l.quantity_rejected)::integer as rejected,
         max(rc.received_on) filter (where l.reverses_line_id is null) as last_received_on
    from public.purchase_receipt_lines l
    join public.purchase_receipts rc on rc.id = l.receipt_id
   where l.purchase_request_item_id = i.id
) x on true;

-- One row per purchase request that has lines. all_received is true only when EVERY line has accepted = ordered.
create view public.purchase_request_receiving with (security_invoker = true) as
select
  s.purchase_request_id,
  count(*)::integer as line_count,
  sum(s.ordered_quantity)::integer as ordered_total,
  sum(s.accepted_quantity)::integer as accepted_total,
  sum(s.rejected_quantity)::integer as rejected_total,
  sum(s.outstanding_quantity)::integer as outstanding_total,
  count(*) filter (where s.fully_received)::integer as lines_fully_received,
  bool_and(s.fully_received) as all_received,
  max(s.last_received_on) as last_received_on
from public.purchase_receiving_status s
group by s.purchase_request_id;

-- One row per part: what is on hand (all locations), what is on order, when it last arrived, and its value at the
-- part's own effective cost (null when the part has no cost: nothing is estimated).
create view public.inventory_overview with (security_invoker = true) as
select
  pc.id as part_id,
  pc.part_number,
  pc.name,
  pc.subsystem_id,
  pc.subsystem_name,
  pc.category,
  pc.active,
  pc.effective_unit_cost,
  pc.missing_cost,
  st.on_hand,
  st.location_count,
  st.location_names,
  oo.on_order,
  lr.last_received_on,
  case when pc.effective_unit_cost is null then null else st.on_hand * pc.effective_unit_cost end as stock_value
from public.parts_catalog pc
left join lateral (
  select coalesce(sum(s.quantity_on_hand), 0)::integer as on_hand,
         (count(*) filter (where s.quantity_on_hand > 0))::integer as location_count,
         coalesce(string_agg(l.name, ', ' order by l.name) filter (where s.quantity_on_hand > 0), '') as location_names
    from public.inventory_stock s join public.inventory_locations l on l.id = s.location_id
   where s.part_id = pc.id
) st on true
left join lateral (
  select coalesce(sum(x.outstanding_quantity), 0)::integer as on_order
    from public.purchase_receiving_status x
   where x.part_id = pc.id and x.request_status in ('Ordered', 'In Transit')
) oo on true
left join lateral (
  select max(rc.received_on) as last_received_on
    from public.purchase_receipt_lines l
    join public.purchase_receipts rc on rc.id = l.receipt_id
   where l.part_id = pc.id and l.quantity_received > 0
     and not exists (select 1 from public.purchase_receipt_lines rv where rv.reverses_line_id = l.id)
) lr on true;

-- One row per part + location.
create view public.inventory_by_location with (security_invoker = true) as
select
  s.part_id,
  p.part_number,
  p.name as part_name,
  p.subsystem_id,
  p.active as part_active,
  s.location_id,
  l.name as location_name,
  l.active as location_active,
  s.quantity_on_hand,
  s.updated_at
from public.inventory_stock s
join public.parts p on p.id = s.part_id
join public.inventory_locations l on l.id = s.location_id;

-- Health check: the stock cache must equal the ledger for every part + location. matches is false only if something is wrong.
create view public.inventory_reconciliation with (security_invoker = true) as
select
  coalesce(s.part_id, t.part_id) as part_id,
  coalesce(s.location_id, t.location_id) as location_id,
  coalesce(s.quantity_on_hand, 0) as stock_quantity,
  coalesce(t.ledger_quantity, 0) as ledger_quantity,
  coalesce(s.quantity_on_hand, 0) = coalesce(t.ledger_quantity, 0) as matches
from public.inventory_stock s
full join (
  select part_id, location_id, sum(quantity_delta)::integer as ledger_quantity
    from public.inventory_transactions group by part_id, location_id
) t on t.part_id = s.part_id and t.location_id = s.location_id;

-- ---------------------------------------------------------
-- Row Level Security: everyone approved can read; nobody writes a table directly (except locations, below)
-- ---------------------------------------------------------
alter table public.inventory_locations enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_lines enable row level security;

create policy inventory_locations_select on public.inventory_locations for select to authenticated using (public.is_approved());
create policy inventory_locations_insert on public.inventory_locations for insert to authenticated with check (public.can_manage_inventory());
create policy inventory_locations_update on public.inventory_locations for update to authenticated using (public.can_manage_inventory()) with check (public.can_manage_inventory());

create policy inventory_stock_select on public.inventory_stock for select to authenticated using (public.is_approved());
create policy inventory_transactions_select on public.inventory_transactions for select to authenticated using (public.is_approved());
create policy purchase_receipts_select on public.purchase_receipts for select to authenticated using (public.is_approved());
create policy purchase_receipt_lines_select on public.purchase_receipt_lines for select to authenticated using (public.is_approved());

-- ---------------------------------------------------------
-- Privileges (the coarse first gate, before RLS)
-- ---------------------------------------------------------
revoke all on public.inventory_locations from authenticated, anon;
revoke all on public.inventory_stock from authenticated, anon;
revoke all on public.inventory_transactions from authenticated, anon;
revoke all on public.purchase_receipts from authenticated, anon;
revoke all on public.purchase_receipt_lines from authenticated, anon;
revoke all on public.purchase_receiving_status from authenticated, anon;
revoke all on public.purchase_request_receiving from authenticated, anon;
revoke all on public.inventory_overview from authenticated, anon;
revoke all on public.inventory_by_location from authenticated, anon;
revoke all on public.inventory_reconciliation from authenticated, anon;

grant select on public.inventory_locations, public.inventory_stock, public.inventory_transactions,
  public.purchase_receipts, public.purchase_receipt_lines,
  public.purchase_receiving_status, public.purchase_request_receiving, public.inventory_overview,
  public.inventory_by_location, public.inventory_reconciliation to authenticated;

grant insert (name, description, active, sort_order) on public.inventory_locations to authenticated;
grant update (name, description, active, sort_order) on public.inventory_locations to authenticated;
-- inventory_stock, inventory_transactions, purchase_receipts, purchase_receipt_lines: NO insert / update / delete grant to anyone.
-- They are written only by the functions above. Locations have no delete grant (deactivate instead).
