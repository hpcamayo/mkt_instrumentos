-- Catalog Phase 5 (Henri's P5, 2026-09-30): schedule catalog_search_log_prune() (20261009120000: catalog_search_log
-- keeps 12 months) daily at 08:30 UTC = 03:30 Lima, with pg_cron. Nothing writes the search log yet (autofill is
-- post-V1), so the job deletes nothing until then.
-- cron.schedule() with a job name replaces the job of that name, so applying this again is harmless.
-- Local only; production with the other catalog migrations after Henri's review (roadmap 2.8 supautils note: pg_cron is
-- enabled the same way on hosted Supabase).

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'catalog-search-log-prune',
  '30 8 * * *',
  $$select public.catalog_search_log_prune()$$
);
