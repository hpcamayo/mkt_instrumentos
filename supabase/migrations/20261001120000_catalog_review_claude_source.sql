-- Canonical catalog (roadmap: review queue, 2026-09-29): Henri asked Claude to work through the duplicate-review
-- queue under stated rules (evidence-based verdicts, every merge read, Henri spot-checks a sample). Those decisions
-- come from config/review_decisions.yaml with source 'claude_review', so they stay distinguishable from admin
-- decisions ('human', 'ai_accepted') and rule verdicts ('rule'). The admin RPC still only writes human/ai_accepted.
alter table public.catalog_review_decisions drop constraint if exists catalog_review_decisions_source_check;
alter table public.catalog_review_decisions add constraint catalog_review_decisions_source_check
  check (source in ('human', 'ai_accepted', 'rule', 'claude_review'));
