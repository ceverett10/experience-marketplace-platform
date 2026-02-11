-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('PINTEREST', 'FACEBOOK', 'TWITTER');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'SOCIAL_POST_GENERATE';
ALTER TYPE "JobType" ADD VALUE 'SOCIAL_POST_PUBLISH';
ALTER TYPE "JobType" ADD VALUE 'SOCIAL_DAILY_POSTING';

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "accountId" TEXT,
    "accountName" TEXT,
    "accountUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPostedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "pageId" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[],
    "mediaUrls" TEXT[],
    "linkUrl" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "platformPostId" TEXT,
    "platformUrl" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "generationData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_siteId_platform_key" ON "SocialAccount"("siteId", "platform");

-- CreateIndex
CREATE INDEX "SocialAccount_siteId_idx" ON "SocialAccount"("siteId");

-- CreateIndex
CREATE INDEX "SocialPost_siteId_status_idx" ON "SocialPost"("siteId", "status");

-- CreateIndex
CREATE INDEX "SocialPost_accountId_idx" ON "SocialPost"("accountId");

-- CreateIndex
CREATE INDEX "SocialPost_scheduledFor_idx" ON "SocialPost"("scheduledFor");

-- CreateIndex
CREATE INDEX "SocialPost_status_idx" ON "SocialPost"("status");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
