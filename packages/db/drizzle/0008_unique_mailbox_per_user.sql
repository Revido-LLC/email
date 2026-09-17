UPDATE "accounts" SET "email" = lower(trim("email"));--> statement-breakpoint
DROP INDEX IF EXISTS "accounts_user_provider_email_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_email_uq" ON "accounts" USING btree ("user_id","email");
