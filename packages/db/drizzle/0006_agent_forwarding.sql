-- Forwarding-rule support for inbox agents.
-- agent_actions.params : action config (e.g. forward destination {"to": "..."}), plaintext.
-- agents.trusted       : opt-in auto-run — a trusted rule runs consequential actions
--                        (forward) without the approval queue, relying on the send 10s undo.
-- approvals.params     : carries the forward destination through the approval queue.
-- approvals.message_id : the source inbound message a forward approval acts on.
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS params jsonb;
--> statement-breakpoint
ALTER TABLE agents ADD COLUMN IF NOT EXISTS trusted boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS params jsonb;
--> statement-breakpoint
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS message_id uuid;
