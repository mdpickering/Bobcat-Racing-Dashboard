-- =========================================================
-- 0026_coo_role_enum.sql
-- Adds the 'coo' value to the user_role enum (member, team_lead, coo,
-- cto, admin). This is deliberately its OWN migration, run on its own:
-- Postgres refuses to use a newly-added enum value in the same
-- transaction that added it ("unsafe use of new value"), and the next
-- migration (0028) defines functions and policies that reference 'coo'.
-- Run this file first, let it finish, then run 0027 and 0028.
--
-- Nothing else changes here. No existing row is touched, and nothing
-- can be assigned the role until an admin/CTO does so explicitly via
-- the existing admin_set_user_role() RPC (0020), which already only
-- accepts cto/admin callers.
-- =========================================================

alter type public.user_role add value if not exists 'coo' before 'cto';
