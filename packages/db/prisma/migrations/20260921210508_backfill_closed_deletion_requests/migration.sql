-- Requests closed because the account was already gone were recorded as
-- REJECTED, with this exact reason written by the admin UI's "Close request"
-- button. Relabel them CLOSED. Matched on the reason too, not only on the
-- missing user: a request that was genuinely declined, whose account was
-- deleted later by some other path, also has a null userId and must stay
-- REJECTED.
--
-- A migration of its own: Postgres won't let a new enum value be used in the
-- same transaction that adds it.
UPDATE "data_deletion_requests"
SET "status" = 'CLOSED', "reason" = NULL
WHERE "status" = 'REJECTED'
  AND "userId" IS NULL
  AND "reason" = 'The account was already removed.';
