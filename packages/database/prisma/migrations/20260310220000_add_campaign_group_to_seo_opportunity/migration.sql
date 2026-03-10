-- AlterTable
ALTER TABLE "SEOOpportunity" ADD COLUMN "campaignGroup" TEXT;

-- CreateIndex
CREATE INDEX "SEOOpportunity_campaignGroup_idx" ON "SEOOpportunity"("campaignGroup");
