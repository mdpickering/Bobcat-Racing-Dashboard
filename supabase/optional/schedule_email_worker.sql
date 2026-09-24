-- =========================================================
-- OPTIONAL — not a migration. Run by hand, once, in the Supabase SQL Editor,
-- AFTER migration 0029 and AFTER the environment variables below are set on
-- Vercel and the app has been redeployed.
--
-- What it does: makes Supabase call the app's email worker every 5 minutes.
-- The worker (app/api/cron/email) sends queued emails and runs the once-a-day
-- "task due soon" scan. Until something calls it, emails simply stay queued
-- (nothing is lost, and in-app notifications are unaffected).
--
-- Vercel environment variables (server-side only, never NEXT_PUBLIC_):
--   CRON_SECRET                long random string; the worker refuses any call without it
--   SUPABASE_SERVICE_ROLE_KEY  the project's service_role key (Supabase > Settings > API)
--   EMAIL_FROM                 e.g.  Bobcat Racing <you@yourdomain.com>
--   plus ONE provider:
--     RESEND_API_KEY                                     (Resend)
--     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS        (any SMTP, e.g. Gmail app password)
--   APP_URL                    optional; defaults to https://bobcat-racing-dashboard.vercel.app
--
-- Alternative schedulers (use ONE, not both): Vercel Cron (vercel.json) — but
-- Vercel's Hobby plan only allows daily cron jobs, and a more frequent schedule
-- makes the deployment fail there — or any external cron service that sends
--   GET https://<your-app>/api/cron/email   with header   Authorization: Bearer <CRON_SECRET>
-- =========================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Replace both placeholders below, then run.
select cron.schedule(
  'bobcat-email-worker',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://bobcat-racing-dashboard.vercel.app/api/cron/email',
    headers := jsonb_build_object('Authorization', 'Bearer REPLACE_WITH_CRON_SECRET')
  );
  $$
);

-- To look at recent runs:   select * from cron.job_run_details order by start_time desc limit 10;
-- To stop it:                select cron.unschedule('bobcat-email-worker');
