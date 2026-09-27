-- =========================================================
-- 0037_parts_and_vendors.sql
-- The parts catalog and the vendor directory, and an OPTIONAL link from
-- purchasing to both. Builds on 0002 (subsystems + helpers), 0007/0022/0027/
-- 0031/0032 (purchasing), 0011 (audit_logs) and 0033 (Business access) and
-- reuses their patterns: SECURITY DEFINER boolean helpers with the full EXECUTE
-- revoke, column-level grants, trigger-derived who/when fields,
-- archive-over-delete, and security_invoker views.
--
-- Changes NO existing row, policy or grant. The only existing objects touched
-- are purchase_request_items (two NEW nullable columns + one new trigger) and
-- create_purchase_request() (two NEW optional trailing parameters, the same
-- drop-and-recreate pattern as 0031/0032; every existing call keeps working).
-- Free-text purchasing data (vendor, part_number, link, description) is never
-- rewritten: catalog values are only COPIED into blank text fields at the
-- moment a line is linked (a snapshot), so later catalog edits or renames never
-- change what a past purchase says, and the Excel export keeps reading the same
-- text columns.
--
-- Model
--   vendors        the supplier directory. NOT sponsors: no link to them.
--   parts          the parts catalog; ONE primary subsystem per part (the
--                  existing subsystems.id text keys, unchanged).
--   part_vendors   which vendors sell a part, with vendor part number, price,
--                  product link, notes, last-verified date and at most ONE
--                  preferred vendor per part.
--   No inventory, stock or receiving fields (a later phase).
--
-- Who can do what (enforced by RLS + triggers + column grants)
--   read vendors / parts / links   any approved, ACTIVE user (like purchasing)
--   manage vendors                 an active Business member (incl. the Business
--                                  Lead), cto/admin. NOT team leads as such, NOT
--                                  the COO unless also on the Business team.
--   manage parts + their vendor    cto/admin, or the lead of the part's subsystem
--   links                          (never Business roles as such; a lead cannot
--                                  move a part to a subsystem they do not lead)
--   nobody deletes parts or vendors through the API: deactivate instead.
--
-- Audit: every create / change / deactivate / reactivate of a part, vendor or
-- part-vendor link is written to the EXISTING audit_logs table by a SECURITY
-- DEFINER trigger (audit_logs has no client write path at all). Only cto/admin
-- can read audit_logs, as designed in 0011.
-- =========================================================

-- ---------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------
create or replace function public.can_manage_vendors()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_business_member() or public.is_cto_or_admin();
$$;

create or replace function public.can_manage_part(p_subsystem_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_cto_or_admin() or public.is_subsystem_lead(p_subsystem_id);
$$;

revoke execute on function public.can_manage_vendors() from public;
revoke execute on function public.can_manage_vendors() from anon, authenticated;
grant execute on function public.can_manage_vendors() to authenticated;
revoke execute on function public.can_manage_part(text) from public;
revoke execute on function public.can_manage_part(text) from anon, authenticated;
grant execute on function public.can_manage_part(text) to authenticated;
-- ---------------------------------------------------------
-- vendors
-- ---------------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 150),
  -- lower-cased, '&' spelled out, punctuation/spaces removed: "McMaster-Carr" and "McMaster Carr" collide
  name_key text not null,
  website text check (website is null or public.is_valid_http_url(website)),
  contact_name text check (contact_name is null or char_length(contact_name) <= 150),
  contact_email text check (contact_email is null or (char_length(contact_email) <= 254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+$')),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 60),
  address text check (address is null or char_length(address) <= 500),
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendors_name_key_unique unique (name_key)
);

create or replace function public.vendors_before_write()
returns trigger
language plpgsql
as $$
begin
  new.name := btrim(new.name);
  new.name_key := lower(regexp_replace(replace(new.name, '&', 'and'), '[^A-Za-z0-9]+', '', 'g'));
  if new.name_key = '' then
    raise exception 'A vendor name needs letters or numbers' using errcode = '23514';
  end if;
  new.website := nullif(btrim(new.website), '');
  new.contact_name := nullif(btrim(new.contact_name), '');
  new.contact_email := nullif(btrim(new.contact_email), '');
  new.contact_phone := nullif(btrim(new.contact_phone), '');
  new.address := nullif(btrim(new.address), '');
  new.notes := nullif(btrim(new.notes), '');
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

create trigger vendors_before_write before insert or update on public.vendors
  for each row execute function public.vendors_before_write();

-- ---------------------------------------------------------
-- parts
-- ---------------------------------------------------------
create table public.parts (
  id uuid primary key default gen_random_uuid(),
  -- the team's internal identifier, e.g. "FS-0012"
  part_number text not null check (btrim(part_number) <> '' and char_length(part_number) <= 60),
  part_number_key text not null,
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  description text,
  subsystem_id text not null references public.subsystems(id) on delete restrict,
  category text check (category is null or char_length(category) <= 100),
  manufacturer text check (manufacturer is null or char_length(manufacturer) <= 150),
  manufacturer_part_number text check (manufacturer_part_number is null or char_length(manufacturer_part_number) <= 100),
  -- the team's reference cost for one unit (a vendor's own price lives on part_vendors)
  unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0),
  source_url text check (source_url is null or public.is_valid_http_url(source_url)),
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parts_part_number_key_unique unique (part_number_key)
);

create index parts_subsystem_idx on public.parts (subsystem_id);
create index parts_active_idx on public.parts (active);

create or replace function public.parts_before_write()
returns trigger
language plpgsql
as $$
begin
  new.part_number := btrim(new.part_number);
  new.part_number_key := lower(new.part_number);
  new.name := btrim(new.name);
  new.description := nullif(btrim(new.description), '');
  new.category := nullif(btrim(new.category), '');
  new.manufacturer := nullif(btrim(new.manufacturer), '');
  new.manufacturer_part_number := nullif(btrim(new.manufacturer_part_number), '');
  new.source_url := nullif(btrim(new.source_url), '');
  new.notes := nullif(btrim(new.notes), '');
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- moving a part across subsystems crosses two subsystems' scope: cto/admin only (same rule as tasks and purchasing).
    -- Skipped only when there is no signed-in caller at all (SQL editor / service role maintenance).
    if new.subsystem_id is distinct from old.subsystem_id and auth.uid() is not null and not public.is_cto_or_admin() then
      raise exception 'Only the CTO or an admin can move a part to another subsystem' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger parts_before_write before insert or update on public.parts
  for each row execute function public.parts_before_write();

-- The same rule addressed by part id (for the part_vendors policies).
create or replace function public.can_manage_part_id(p_part_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.parts p where p.id = p_part_id and public.can_manage_part(p.subsystem_id));
$$;

revoke execute on function public.can_manage_part_id(uuid) from public;
revoke execute on function public.can_manage_part_id(uuid) from anon, authenticated;
grant execute on function public.can_manage_part_id(uuid) to authenticated;

-- ---------------------------------------------------------
-- part_vendors
-- ---------------------------------------------------------
create table public.part_vendors (
  part_id uuid not null references public.parts(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  vendor_part_number text check (vendor_part_number is null or char_length(vendor_part_number) <= 100),
  unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0),
  product_url text check (product_url is null or public.is_valid_http_url(product_url)),
  is_preferred boolean not null default false,
  availability_notes text check (availability_notes is null or char_length(availability_notes) <= 500),
  last_verified_on date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (part_id, vendor_id)
);

create index part_vendors_vendor_idx on public.part_vendors (vendor_id);
-- at most ONE preferred vendor per part
create unique index part_vendors_one_preferred on public.part_vendors (part_id) where is_preferred;

create or replace function public.part_vendors_before_write()
returns trigger
language plpgsql
as $$
begin
  new.vendor_part_number := nullif(btrim(new.vendor_part_number), '');
  new.product_url := nullif(btrim(new.product_url), '');
  new.availability_notes := nullif(btrim(new.availability_notes), '');
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    if not exists (select 1 from public.vendors where id = new.vendor_id and active) then
      raise exception 'That vendor is inactive or does not exist' using errcode = '23514';
    end if;
  else
    new.part_id := old.part_id;
    new.vendor_id := old.vendor_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  -- choosing a new preferred vendor quietly retires the previous one (the unique index guarantees only one)
  if new.is_preferred then
    update public.part_vendors set is_preferred = false where part_id = new.part_id and vendor_id <> new.vendor_id and is_preferred;
  end if;
  return new;
end;
$$;

create trigger part_vendors_before_write before insert or update on public.part_vendors
  for each row execute function public.part_vendors_before_write();

-- ---------------------------------------------------------
-- Audit (the existing audit_logs table; written ONLY by this trigger)
-- One row per real change, with just the fields that changed.
-- ---------------------------------------------------------
create or replace function public.catalog_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity text := case tg_table_name when 'parts' then 'part' when 'vendors' then 'vendor' else 'part_vendor' end;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_old jsonb;
  v_new jsonb;
  k text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_id := (case when tg_table_name = 'part_vendors' then v_old ->> 'part_id' else v_old ->> 'id' end)::uuid;
    insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), v_entity || '.removed', v_entity, v_id, v_old - 'updated_at', null);
    return old;
  end if;

  v_new := to_jsonb(new);
  v_id := (case when tg_table_name = 'part_vendors' then v_new ->> 'part_id' else v_new ->> 'id' end)::uuid;

  if tg_op = 'INSERT' then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), v_entity || '.created', v_entity, v_id, null, v_new - 'updated_at');
    return new;
  end if;

  v_old := to_jsonb(old);
  v_before := '{}'::jsonb;
  v_after := '{}'::jsonb;
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
    when tg_table_name <> 'part_vendors' and (v_old ->> 'active') = 'true' and (v_new ->> 'active') = 'false' then v_entity || '.deactivated'
    when tg_table_name <> 'part_vendors' and (v_old ->> 'active') = 'false' and (v_new ->> 'active') = 'true' then v_entity || '.reactivated'
    else v_entity || '.updated'
  end;
  -- a part_vendors row is identified by its vendor too
  if tg_table_name = 'part_vendors' then
    v_before := v_before || jsonb_build_object('vendor_id', v_new -> 'vendor_id');
    v_after := v_after || jsonb_build_object('vendor_id', v_new -> 'vendor_id');
  end if;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), v_action, v_entity, v_id, v_before, v_after);
  return new;
end;
$$;

revoke execute on function public.catalog_audit() from public;
revoke execute on function public.catalog_audit() from anon, authenticated;

create trigger vendors_audit after insert or update or delete on public.vendors
  for each row execute function public.catalog_audit();
create trigger parts_audit after insert or update or delete on public.parts
  for each row execute function public.catalog_audit();
create trigger part_vendors_audit after insert or update or delete on public.part_vendors
  for each row execute function public.catalog_audit();

-- ---------------------------------------------------------
-- Purchasing: the two new OPTIONAL nullable columns on a line item (existing rows simply have NULL)
-- ---------------------------------------------------------
alter table public.purchase_request_items
  add column part_id uuid references public.parts(id) on delete set null,
  add column vendor_id uuid references public.vendors(id) on delete set null;

create index purchase_request_items_part_idx on public.purchase_request_items (part_id) where part_id is not null;
create index purchase_request_items_vendor_idx on public.purchase_request_items (vendor_id) where vendor_id is not null;

-- ---------------------------------------------------------
-- Derived views (security_invoker: the caller's own RLS applies; nothing stored twice)
-- ---------------------------------------------------------
create view public.parts_catalog with (security_invoker = true) as
select
  p.id, p.part_number, p.name, p.description, p.subsystem_id, s.name as subsystem_name,
  p.category, p.manufacturer, p.manufacturer_part_number, p.unit_cost, p.source_url, p.notes, p.active, p.created_at, p.updated_at,
  coalesce(pv.vendor_count, 0) as vendor_count,
  pref.vendor_id as preferred_vendor_id,
  pref.vendor_name as preferred_vendor_name,
  pref.unit_cost as preferred_vendor_cost,
  pref.vendor_part_number as preferred_vendor_part_number,
  coalesce(pv.vendor_names, '') as vendor_names,
  -- the price to show: the preferred vendor's, else the team's reference cost, else the cheapest listed
  coalesce(pref.unit_cost, p.unit_cost, pv.cheapest) as effective_unit_cost,
  coalesce(pv.vendor_count, 0) > 0 as has_vendor,
  coalesce(pref.unit_cost, p.unit_cost, pv.cheapest) is null as missing_cost
from public.parts p
join public.subsystems s on s.id = p.subsystem_id
left join lateral (
  select count(*)::integer as vendor_count, string_agg(v.name, ', ' order by v.name) as vendor_names, min(x.unit_cost) as cheapest
    from public.part_vendors x join public.vendors v on v.id = x.vendor_id
   where x.part_id = p.id
) pv on true
left join lateral (
  select x.vendor_id, v.name as vendor_name, x.unit_cost, x.vendor_part_number
    from public.part_vendors x join public.vendors v on v.id = x.vendor_id
   where x.part_id = p.id and x.is_preferred
   limit 1
) pref on true;

-- Real purchasing activity only: items that were LINKED to the vendor (vendor_id), on requests that are not
-- Draft, Cancelled or Rejected. Free-text vendor names are never guessed at.
create view public.vendors_overview with (security_invoker = true) as
select
  v.id, v.name, v.website, v.contact_name, v.contact_email, v.contact_phone, v.address, v.notes, v.active, v.created_at, v.updated_at,
  coalesce(pc.part_count, 0) as part_count,
  coalesce(pa.purchase_items, 0) as purchase_items,
  coalesce(pa.purchase_total, 0) as purchase_total,
  pa.last_purchase_at
from public.vendors v
left join lateral (
  select count(*)::integer as part_count
    from public.part_vendors x join public.parts p on p.id = x.part_id
   where x.vendor_id = v.id and p.active
) pc on true
left join lateral (
  select count(*)::integer as purchase_items,
         coalesce(sum(i.quantity * i.unit_cost), 0) as purchase_total,
         max(r.created_at) as last_purchase_at
    from public.purchase_request_items i join public.purchase_requests r on r.id = i.purchase_request_id
   where i.vendor_id = v.id and r.status not in ('Draft', 'Cancelled', 'Rejected')
) pa on true;

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.vendors enable row level security;
alter table public.parts enable row level security;
alter table public.part_vendors enable row level security;

create policy vendors_select on public.vendors for select to authenticated using (public.is_approved());
create policy vendors_insert on public.vendors for insert to authenticated with check (public.can_manage_vendors());
create policy vendors_update on public.vendors for update to authenticated using (public.can_manage_vendors()) with check (public.can_manage_vendors());

create policy parts_select on public.parts for select to authenticated using (public.is_approved());
create policy parts_insert on public.parts for insert to authenticated with check (public.can_manage_part(subsystem_id));
create policy parts_update on public.parts for update to authenticated using (public.can_manage_part(subsystem_id)) with check (public.can_manage_part(subsystem_id));

create policy part_vendors_select on public.part_vendors for select to authenticated using (public.is_approved());
create policy part_vendors_insert on public.part_vendors for insert to authenticated with check (public.can_manage_part_id(part_id));
create policy part_vendors_update on public.part_vendors for update to authenticated using (public.can_manage_part_id(part_id)) with check (public.can_manage_part_id(part_id));
create policy part_vendors_delete on public.part_vendors for delete to authenticated using (public.can_manage_part_id(part_id));

-- ---------------------------------------------------------
-- Column / table privileges (the coarse first gate, before RLS)
-- ---------------------------------------------------------
revoke all on public.vendors from authenticated, anon;
revoke all on public.parts from authenticated, anon;
revoke all on public.part_vendors from authenticated, anon;
revoke all on public.parts_catalog from authenticated, anon;
revoke all on public.vendors_overview from authenticated, anon;

grant select on public.vendors, public.parts, public.part_vendors, public.parts_catalog, public.vendors_overview to authenticated;

grant insert (name, website, contact_name, contact_email, contact_phone, address, notes, active) on public.vendors to authenticated;
grant update (name, website, contact_name, contact_email, contact_phone, address, notes, active) on public.vendors to authenticated;

grant insert (part_number, name, description, subsystem_id, category, manufacturer, manufacturer_part_number, unit_cost, source_url, notes, active) on public.parts to authenticated;
grant update (part_number, name, description, subsystem_id, category, manufacturer, manufacturer_part_number, unit_cost, source_url, notes, active) on public.parts to authenticated;

grant insert (part_id, vendor_id, vendor_part_number, unit_cost, product_url, is_preferred, availability_notes, last_verified_on) on public.part_vendors to authenticated;
grant update (vendor_part_number, unit_cost, product_url, is_preferred, availability_notes, last_verified_on) on public.part_vendors to authenticated;
grant delete on public.part_vendors to authenticated;
-- parts / vendors: NO delete grant (deactivate instead). created_by / created_at / name_key / part_number_key: derived, never grantable.

-- ---------------------------------------------------------
-- Purchasing: an OPTIONAL link from a line item to a catalog part / vendor
-- ---------------------------------------------------------
-- (the two columns themselves are added above, before the views that read them)
grant insert (part_id, vendor_id) on public.purchase_request_items to authenticated;
grant update (part_id, vendor_id) on public.purchase_request_items to authenticated;

-- Snapshot, never sync: when a line is linked to a part or vendor, that record must be ACTIVE, and its part
-- number / vendor name are COPIED into the existing free-text columns if (and only if) those are blank.
-- The trigger only runs when a line is written and only when the link itself changes, so editing or renaming
-- a catalog record later never rewrites a purchase line. SECURITY INVOKER: it reads the catalog under the
-- caller's own access.
create or replace function public.purchase_request_items_catalog_snapshot()
returns trigger
language plpgsql
as $$
declare
  v_part public.parts;
  v_vendor public.vendors;
begin
  if new.part_id is not null and (tg_op = 'INSERT' or new.part_id is distinct from old.part_id) then
    select * into v_part from public.parts where id = new.part_id;
    if not found or not v_part.active then
      raise exception 'That part is inactive or does not exist' using errcode = '23514';
    end if;
    if btrim(coalesce(new.part_number, '')) = '' then
      new.part_number := v_part.part_number;
    end if;
  end if;
  if new.vendor_id is not null and (tg_op = 'INSERT' or new.vendor_id is distinct from old.vendor_id) then
    select * into v_vendor from public.vendors where id = new.vendor_id;
    if not found or not v_vendor.active then
      raise exception 'That vendor is inactive or does not exist' using errcode = '23514';
    end if;
    if btrim(coalesce(new.vendor, '')) = '' then
      new.vendor := left(v_vendor.name, 100);
    end if;
  end if;
  return new;
end;
$$;

create trigger purchase_request_items_catalog_snapshot before insert or update on public.purchase_request_items
  for each row execute function public.purchase_request_items_catalog_snapshot();

-- create_purchase_request() with two more OPTIONAL trailing parameters (the 0031/0032 pattern: the argument
-- list changes, so the previous version is dropped and recreated with the same body, the same SECURITY INVOKER
-- behaviour, the same required-link validation and the same EXECUTE privileges). Every existing call, which
-- passes the first twelve parameters by name or position, keeps working unchanged.
drop function public.create_purchase_request(text, text, text, text, text, text, text, text, text, integer, numeric, uuid);

create or replace function public.create_purchase_request(
  p_subsystem_id text,
  p_title text,
  p_description text,
  p_vendor text,
  p_product_url text,
  p_part_number text default null,
  p_subassembly text default null,
  p_item_description text default null,
  p_item_vendor text default null,
  p_quantity integer default 1,
  p_unit_cost numeric default null,
  p_responsible_user_id uuid default null,
  p_part_id uuid default null,
  p_vendor_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_url text := btrim(p_product_url);
  v_vendor_name text;
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'A title is required' using errcode = '23514';
  end if;
  if not public.is_valid_http_url(v_url) then
    raise exception 'A valid product link (http:// or https://) is required'
      using errcode = '23514';
  end if;

  -- a chosen catalog vendor names the request too, unless the caller typed a vendor of their own
  if p_vendor_id is not null then
    select left(name, 100) into v_vendor_name from public.vendors where id = p_vendor_id;
  end if;

  insert into public.purchase_requests (subsystem_id, title, description, vendor)
  values (p_subsystem_id, btrim(p_title), nullif(btrim(p_description), ''), coalesce(nullif(btrim(p_vendor), ''), v_vendor_name))
  returning id into v_id;

  insert into public.purchase_request_items
    (purchase_request_id, description, quantity, unit_cost, link, part_number, subassembly, vendor, responsible_user_id, part_id, vendor_id)
  values (
    v_id,
    coalesce(nullif(btrim(p_item_description), ''), btrim(p_title)),
    coalesce(p_quantity, 1),
    p_unit_cost,
    v_url,
    nullif(btrim(p_part_number), ''),
    nullif(btrim(p_subassembly), ''),
    coalesce(nullif(btrim(p_item_vendor), ''), nullif(btrim(p_vendor), '')),
    p_responsible_user_id,
    p_part_id,
    p_vendor_id
  );

  return v_id;
end;
$$;

revoke execute on function public.create_purchase_request(text, text, text, text, text, text, text, text, text, integer, numeric, uuid, uuid, uuid) from public;
revoke execute on function public.create_purchase_request(text, text, text, text, text, text, text, text, text, integer, numeric, uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.create_purchase_request(text, text, text, text, text, text, text, text, text, integer, numeric, uuid, uuid, uuid) to authenticated;
