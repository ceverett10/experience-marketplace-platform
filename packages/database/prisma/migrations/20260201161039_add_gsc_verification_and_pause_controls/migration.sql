-- CreateTable: PlatformSettings for global autonomous process controls
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "allAutonomousProcessesPaused" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "pausedBy" TEXT,
    "pauseReason" TEXT,
    "enableSiteCreation" BOOLEAN NOT NULL DEFAULT true,
    "enableContentGeneration" BOOLEAN NOT NULL DEFAULT true,
    "enableGSCVerification" BOOLEAN NOT NULL DEFAULT true,
    "enableContentOptimization" BOOLEAN NOT NULL DEFAULT true,
    "enableABTesting" BOOLEAN NOT NULL DEFAULT true,
    "maxTotalSites" INTEGER NOT NULL DEFAULT 200,
    "maxSitesPerHour" INTEGER NOT NULL DEFAULT 10,
    "maxContentPagesPerHour" INTEGER NOT NULL DEFAULT 100,
    "maxGSCRequestsPerHour" INTEGER NOT NULL DEFAULT 200,
    "maxOpportunityScansPerDay" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Site - Add autonomous process pause controls
ALTER TABLE "Site" ADD COLUMN "autonomousProcessesPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN "pausedBy" TEXT;
ALTER TABLE "Site" ADD COLUMN "pauseReason" TEXT;

-- AlterTable: Site - Add GSC verification fields
ALTER TABLE "Site" ADD COLUMN "gscVerificationCode" TEXT;
ALTER TABLE "Site" ADD COLUMN "gscVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN "gscVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN "gscPropertyUrl" TEXT;
ALTER TABLE "Site" ADD COLUMN "gscLastSyncedAt" TIMESTAMP(3);

-- CreateIndex: Add index on gscVerified for fast querying
CREATE INDEX "Site_gscVerified_idx" ON "Site"("gscVerified");

-- AlterEnum: Add new statuses to SiteStatus
ALTER TYPE "SiteStatus" ADD VALUE 'DNS_PENDING';
ALTER TYPE "SiteStatus" ADD VALUE 'GSC_VERIFICATION';
ALTER TYPE "SiteStatus" ADD VALUE 'SSL_PENDING';

-- AlterEnum: Add new job types to JobType
ALTER TYPE "JobType" ADD VALUE 'GSC_VERIFY';
ALTER TYPE "JobType" ADD VALUE 'GSC_SETUP';

-- Insert default platform settings row (singleton pattern)
INSERT INTO "platform_settings" ("id", "createdAt", "updatedAt")
VALUES ('platform_settings_singleton', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
