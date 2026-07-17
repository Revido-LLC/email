-- Persist the provider push subscription/watch id on sync_state so a webhook push
-- (which carries no account id) can resolve the account it belongs to. Outlook's
-- Graph change notifications identify the mailbox only by subscription id.
ALTER TABLE "sync_state" ADD COLUMN "subscription_id" text;
