-- ============================================================
-- MindSync Track B — lockdown for apply_managed_credit_usage
--
-- The 20260618_managed_credit_usage.sql migration leaves the function
-- callable by PUBLIC / anon / authenticated. Combined with security definer
-- this lets any logged-in user reach the function over PostgREST and pass
-- p_user_id of an arbitrary teammate to write/read managed credit ledger
-- entries directly. Only the Edge Function (service_role) should invoke it.
-- ============================================================

revoke execute on function public.apply_managed_credit_usage(uuid, uuid, numeric, text, text, jsonb) from public;
revoke execute on function public.apply_managed_credit_usage(uuid, uuid, numeric, text, text, jsonb) from anon;
revoke execute on function public.apply_managed_credit_usage(uuid, uuid, numeric, text, text, jsonb) from authenticated;
grant   execute on function public.apply_managed_credit_usage(uuid, uuid, numeric, text, text, jsonb) to service_role;
