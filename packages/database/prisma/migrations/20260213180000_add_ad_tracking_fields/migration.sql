-- Add AD_CONVERSION_UPLOAD to JobType enum
ALTER TYPE "JobType" ADD VALUE 'AD_CONVERSION_UPLOAD';
ALTER TYPE "JobType" ADD VALUE 'AD_PLATFORM_IDS_SYNC';

-- AlterTable: Add ad platform click IDs to Booking for CAPI conversion uploads
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "gclid" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "fbclid" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Booking_gclid_idx" ON "Booking"("gclid");
CREATE INDEX IF NOT EXISTS "Booking_fbclid_idx" ON "Booking"("fbclid");

-- CreateTable: Ad alerts for campaign performance monitoring
CREATE TABLE "ad_alerts" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "campaignId" TEXT,
    "siteId" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_alerts_type_acknowledged_idx" ON "ad_alerts"("type", "acknowledged");
CREATE INDEX "ad_alerts_createdAt_idx" ON "ad_alerts"("createdAt");
