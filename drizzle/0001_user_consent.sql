ALTER TABLE `users` ADD COLUMN `privacy_accepted_at` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `marketing_consent` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `marketing_consent_at` text;
