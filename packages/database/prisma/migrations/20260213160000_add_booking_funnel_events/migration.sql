-- CreateEnum
CREATE TYPE "BookingFunnelStep" AS ENUM ('AVAILABILITY_SEARCH', 'BOOKING_CREATED', 'AVAILABILITY_ADDED', 'CHECKOUT_LOADED', 'QUESTIONS_ANSWERED', 'PAYMENT_STARTED', 'BOOKING_COMPLETED');

-- CreateTable
CREATE TABLE "BookingFunnelEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "step" "BookingFunnelStep" NOT NULL,
    "siteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT,
    "bookingId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,

    CONSTRAINT "BookingFunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingFunnelEvent_siteId_step_createdAt_idx" ON "BookingFunnelEvent"("siteId", "step", "createdAt");

-- CreateIndex
CREATE INDEX "BookingFunnelEvent_sessionId_createdAt_idx" ON "BookingFunnelEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingFunnelEvent_createdAt_idx" ON "BookingFunnelEvent"("createdAt");
