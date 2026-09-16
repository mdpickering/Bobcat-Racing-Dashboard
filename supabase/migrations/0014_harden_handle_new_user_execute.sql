-- =========================================================
-- 0014_harden_handle_new_user_execute.sql
-- Phase 6.2G patch — found during the final full-schema
-- privilege audit: handle_new_user() (0001) is SECURITY DEFINER
-- but has no REVOKE EXECUTE at all — it predates the hardening
-- pattern established from 0003 onward and was never brought in
-- line with it.
--
-- Not an active vulnerability: handle_new_user() is `returns
-- trigger`, and Postgres does not allow trigger-type functions
-- to be invoked directly via ordinary SQL/RPC regardless of
-- EXECUTE privilege (the same structural restriction that made
-- sync_task_primary_owner's pre-0006 state non-exploitable).
-- This closes the inconsistency for completeness and so every
-- SECURITY DEFINER function in the schema follows the same
-- audited pattern, per the Phase 6.2G verification requirement.
--
-- Does NOT modify 0001-0013. Does not touch workspace_state or
-- any legacy table, and does not migrate any production data.
-- Run against bobcat-dev only.
-- =========================================================

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;
