-- AlterEnum
-- Adds two new JobType values for booking health monitoring.
-- These power scheduled jobs that detect booking-API outages early
-- (follow-up to the 2026-04-15 P0 incident where bookings were
-- broken in production for 2 weeks before detection).
ALTER TYPE "JobType" ADD VALUE 'BOOKING_ERROR_ALERT';
ALTER TYPE "JobType" ADD VALUE 'BOOKING_HEALTH_CANARY';
