-- AlterTable: Add consolidated campaign support (parent-child model)
ALTER TABLE "ad_campaigns" ADD COLUMN "parentCampaignId" TEXT;
ALTER TABLE "ad_campaigns" ADD COLUMN "platformAdSetId" TEXT;
ALTER TABLE "ad_campaigns" ADD COLUMN "platformAdId" TEXT;
ALTER TABLE "ad_campaigns" ADD COLUMN "campaignGroup" TEXT;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_parentCampaignId_fkey" FOREIGN KEY ("parentCampaignId") REFERENCES "ad_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ad_campaigns_parentCampaignId_idx" ON "ad_campaigns"("parentCampaignId");
CREATE INDEX "ad_campaigns_campaignGroup_idx" ON "ad_campaigns"("campaignGroup");
