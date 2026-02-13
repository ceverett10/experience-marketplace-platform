-- CreateEnum
CREATE TYPE "MicrositeSupplierType" AS ENUM ('HOLIBOB', 'TICKITTO');

-- AlterTable
ALTER TABLE "microsite_configs" ADD COLUMN "supplierType" "MicrositeSupplierType" NOT NULL DEFAULT 'HOLIBOB';
ALTER TABLE "microsite_configs" ADD COLUMN "tickittoConfig" JSONB;
