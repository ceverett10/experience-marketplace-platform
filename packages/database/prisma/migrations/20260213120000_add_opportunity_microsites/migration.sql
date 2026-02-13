-- Add OPPORTUNITY to MicrositeEntityType enum
ALTER TYPE "MicrositeEntityType" ADD VALUE 'OPPORTUNITY';

-- Add MICROSITE_ASSIGNED to OpportunityStatus enum
ALTER TYPE "OpportunityStatus" ADD VALUE 'MICROSITE_ASSIGNED';

-- Add opportunity reference and discovery config to microsite_configs
ALTER TABLE "microsite_configs" ADD COLUMN "opportunityId" TEXT;
ALTER TABLE "microsite_configs" ADD COLUMN "discoveryConfig" JSONB;

-- Add unique constraint on opportunityId
ALTER TABLE "microsite_configs" ADD CONSTRAINT "microsite_configs_opportunityId_key" UNIQUE ("opportunityId");

-- Add foreign key constraint
ALTER TABLE "microsite_configs" ADD CONSTRAINT "microsite_configs_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "SEOOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for opportunityId lookups
CREATE INDEX "microsite_configs_opportunityId_idx" ON "microsite_configs"("opportunityId");
