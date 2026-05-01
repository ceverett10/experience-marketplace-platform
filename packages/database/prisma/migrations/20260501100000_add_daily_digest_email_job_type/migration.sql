-- AlterEnum
-- Adds DAILY_DIGEST_EMAIL JobType for the scheduled 7am UTC ops digest
-- that summarises 24h errors, bookings, contact messages and (later) ad
-- campaign performance. Sent via Resend to CONTACT_NOTIFICATION_EMAIL.
ALTER TYPE "JobType" ADD VALUE 'DAILY_DIGEST_EMAIL';
