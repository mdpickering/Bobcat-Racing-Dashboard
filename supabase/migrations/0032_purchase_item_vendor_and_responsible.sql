-- =========================================================
-- 0032_purchase_item_vendor_and_responsible.sql
-- A purchase request is a TEAM's order (its subsystem), and one order routinely
-- buys from several vendors and hands items to different members: the team's
-- real purchase sheet has McMaster, Amazon and Dan's Performance Parts on one
-- sheet, with a different member responsible on different rows. Until now the
-- vendor lived only on the request (one vendor per order) and the responsible
-- member was always the requester.
--
-- This adds two OPTIONAL columns to the existing line-item table:
--   vendor                the store this item is bought from
--   responsible_user_id   the member responsible for this item
-- purchase_requests.vendor stays exactly as it is and acts as a default: an
-- item with no vendor of its own uses the request's, then the link's website;
-- an item with no responsible member falls back to the requester.
-- No new table, no existing row touched (every current row has NULL for both).
--
-- Permissions are unchanged in kind: whoever can already create or edit a line
-- item (cto/admin, or the lead of the request's subsystem, via the existing
-- RLS policies) can set the two new fields; nobody else can. The two columns
-- are added to the existing explicit INSERT and UPDATE column grants.
--
-- create_purchase_request() gains optional parameters for the first item
-- (its own description, vendor, quantity, price and responsible member) so a
-- request can start with a real first item. All new parameters are optional
-- and trailing, so every existing call keeps working. The argument list
-- changes, so the previous version is dropped and recreated with the same
-- SECURITY INVOKER behaviour, required-link validation and EXECUTE privileges.
-- =========================================================

alter table public.purchase_request_items
  add column vendor text,
  add column responsible_user_id uuid references public.profiles(id) on delete set null,
  add constraint purchase_request_items_vendor_len
    check (vendor is null or char_length(vendor) between 1 and 100);

create index purchase_request_items_responsible_idx on public.purchase_request_items (responsible_user_id);

grant insert (vendor, responsible_user_id) on public.purchase_request_items to authenticated;
grant update (vendor, responsible_user_id) on public.purchase_request_items to authenticated;

drop function public.create_purchase_request(text, text, text, text, text, text, text);

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
  p_responsible_user_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_url text := btrim(p_product_url);
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'A title is required' using errcode = '23514';
  end if;
  if not public.is_valid_http_url(v_url) then
    raise exception 'A valid product link (http:// or https://) is required'
      using errcode = '23514';
  end if;

  insert into public.purchase_requests (subsystem_id, title, description, vendor)
  values (p_subsystem_id, btrim(p_title), nullif(btrim(p_description), ''), nullif(btrim(p_vendor), ''))
  returning id into v_id;

  insert into public.purchase_request_items
    (purchase_request_id, description, quantity, unit_cost, link, part_number, subassembly, vendor, responsible_user_id)
  values (
    v_id,
    coalesce(nullif(btrim(p_item_description), ''), btrim(p_title)),
    coalesce(p_quantity, 1),
    p_unit_cost,
    v_url,
    nullif(btrim(p_part_number), ''),
    nullif(btrim(p_subassembly), ''),
    coalesce(nullif(btrim(p_item_vendor), ''), nullif(btrim(p_vendor), '')),
    p_responsible_user_id
  );

  return v_id;
end;
$$;

revoke execute on function public.create_purchase_request(text, text, text, text, text, text, text, text, text, integer, numeric, uuid) from public;
revoke execute on function public.create_purchase_request(text, text, text, text, text, text, text, text, text, integer, numeric, uuid) from anon, authenticated;
grant execute on function public.create_purchase_request(text, text, text, text, text, text, text, text, text, integer, numeric, uuid) to authenticated;
