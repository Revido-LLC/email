-- Composer attachments are uploaded before the outbound message exists, so an
-- attachment starts life PENDING: its bytes are encrypted into `content_ct` with
-- no `message_id` yet. Send then claims the row by setting `message_id`. Drop the
-- NOT NULL so a pending row can exist; the FK + ON DELETE CASCADE are unchanged.
ALTER TABLE "attachments" ALTER COLUMN "message_id" DROP NOT NULL;--> statement-breakpoint
-- Serves the pending lookup (user_id + message_id IS NULL) and per-message reads.
CREATE INDEX "attachments_user_message_idx" ON "attachments" USING btree ("user_id","message_id");
