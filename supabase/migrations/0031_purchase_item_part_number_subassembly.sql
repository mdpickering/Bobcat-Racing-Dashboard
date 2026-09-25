-- =========================================================
-- 0031_purchase_item_part_number_subassembly.sql
-- The purchasing Excel sheet has "Part #" and "Subassembly" columns that the
-- purchasing schema could not fill: purchase_request_items had no part
-- number and no subassembly. Adds both as OPTIONAL text columns on the
-- existing line-item table (no new table, no existing row touched — every
-- current row simply has NULL for both).
--
-- Permissions are unchanged in kind: the same people who can already
-- create or edit a line item (cto/admin, or the lead of the request's
-- subsystem, via the existing RLS policies) can set the two new fields;
-- nobody else can. Because column privileges here are explicit lists, the
-- two columns are added to the existing INSERT and UPDATE grants.
--
-- create_purchase_request() gains two optional trailing parameters so the
-- request and its first line item can be created with a part number and
-- subassembly in one transaction. Changing a function's argument list means
-- replacing it, so the old five-argument version is dropped and recreated
-- with the same body, same SECURITY INVOKER behaviour, same required-link
-- validation and the same EXECUTE privileges (authenticated only).
-- =========================================================

alter table public.purchase_request_items
  add column part_number text,
  add column subassembly text,
  add constraint purchase_request_items_part_number_len
    check (part_number is null or char_length(part_number) between 1 and 100),
  add constraint purchase_request_items_subassembly_len
    check (subassembly is null or char_length(subassembly) between 1 and 100);

grant insert (part_number, subassembly) on public.purchase_request_items to authenticated;
grant update (part_number, subassembly) on public.purchase_request_items to authenticated;

drop function public.create_purchase_request(text, text, text, text, text);

create or replace function public.create_purchase_request(
  p_subsystem_id text,
  p_title text,
  p_description text,
  p_vendor text,
  p_product_url text,
  p_part_number text default null,
  p_subassembly text default null
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

  insert into public.purchase_request_items (purchase_request_id, description, quantity, link, part_number, subassembly)
  values (v_id, btrim(p_title), 1, v_url, nullif(btrim(p_part_number), ''), nullif(btrim(p_subassembly), ''));

  return v_id;
end;
$$;

revoke execute on function public.create_purchase_request(text, text, text, text, text, text, text) from public;
revoke execute on function public.create_purchase_request(text, text, text, text, text, text, text) from anon, authenticated;
grant execute on function public.create_purchase_request(text, text, text, text, text, text, text) to authenticated;
