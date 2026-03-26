-- CreateTable
CREATE TABLE "trend_snapshots" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "trendScore" INTEGER NOT NULL DEFAULT 0,
    "trendDirection" TEXT NOT NULL DEFAULT 'stable',
    "searchVolume" INTEGER NOT NULL DEFAULT 0,
    "cpc" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "relatedQueries" JSONB,
    "topCities" JSONB,
    "demandScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focused_strategy_configs" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "combinations" JSONB NOT NULL,
    "totalDailyBudget" DECIMAL(10,2) NOT NULL,
    "perComboBudgetMax" DECIMAL(10,2) NOT NULL DEFAULT 25.00,
    "targetRoas" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "hardFloorRoas" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "pauseRoas" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "pauseAfterDays" INTEGER NOT NULL DEFAULT 5,
    "scaleRoas" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "scaleIncrement" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "rampPhase" INTEGER NOT NULL DEFAULT 1,
    "rampWeekOf" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "focused_strategy_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trend_snapshots_date_location_category_key" ON "trend_snapshots"("date", "location", "category");

-- CreateIndex
CREATE INDEX "trend_snapshots_date_idx" ON "trend_snapshots"("date");

-- CreateIndex
CREATE INDEX "trend_snapshots_demandScore_idx" ON "trend_snapshots"("demandScore");

-- CreateIndex
CREATE INDEX "trend_snapshots_category_idx" ON "trend_snapshots"("category");

-- Add TREND_DATA_COLLECT to JobType enum
ALTER TYPE "JobType" ADD VALUE 'TREND_DATA_COLLECT';
