-- AlterTable: Make Content.siteId optional (microsites use micrositeId instead)
ALTER TABLE "Content" ALTER COLUMN "siteId" DROP NOT NULL;

-- AddColumn: Content.micrositeId for microsite content
ALTER TABLE "Content" ADD COLUMN "micrositeId" TEXT;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_micrositeId_fkey" FOREIGN KEY ("micrositeId") REFERENCES "microsite_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Content_micrositeId_idx" ON "Content"("micrositeId");
