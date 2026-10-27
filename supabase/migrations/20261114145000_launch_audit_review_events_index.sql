-- Launch audit A17, first part: the index the review rules read (20261114150000_launch_audit_review_trust.sql).
--
-- same_browser looks up a buyer's first-party sessions in marketplace_events, then whether the seller or a member of
-- the store used one of them. This index covers signed-in visitors' events only.
--
-- Locks: building it takes a SHARE lock on marketplace_events, which blocks event writes, not reads, until this file
-- commits (about a second per million rows). It has a file of its own so that the lock is gone before the next file
-- takes its ACCESS EXCLUSIVE lock on transaction_reviews. In one transaction the two could deadlock with a review sent
-- at that moment: the review holds transaction_reviews and waits to write its event, while the migration holds
-- marketplace_events and waits for transaction_reviews. This file locks nothing else. Lock waits are capped at 10
-- seconds.
-- Rollback: drop index public.marketplace_events_actor_session_idx (after rolling back 20261114150000).

set lock_timeout = '10s';

create index if not exists marketplace_events_actor_session_idx on public.marketplace_events(actor_user_id, session_id)
  where actor_user_id is not null and session_id is not null;

reset lock_timeout;
