-- AlterTable: Make siteId nullable and add micrositeId for microsite bookings
ALTER TABLE "Booking" ALTER COLUMN "siteId" DROP NOT NULL;

-- AddColumn: micrositeId for bookings made on microsites
ALTER TABLE "Booking" ADD COLUMN "micrositeId" TEXT;

-- CreateIndex
CREATE INDEX "Booking_micrositeId_idx" ON "Booking"("micrositeId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_micrositeId_fkey" FOREIGN KEY ("micrositeId") REFERENCES "microsite_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
