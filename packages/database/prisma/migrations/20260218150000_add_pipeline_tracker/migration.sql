-- CreateEnum
CREATE TYPE "PipelineTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTING', 'DEPLOYED', 'VERIFIED', 'BLOCKED', 'FAILED');

-- CreateTable
CREATE TABLE "pipeline_tasks" (
    "id" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "taskNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fixRefs" TEXT[],
    "keyFiles" TEXT[],
    "status" "PipelineTaskStatus" NOT NULL DEFAULT 'PENDING',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "implementedAt" TIMESTAMP(3),
    "testedAt" TIMESTAMP(3),
    "deployedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verificationQuery" TEXT,
    "verificationTarget" TEXT,
    "lastCheckResult" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckPassed" BOOLEAN,
    "prUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_task_events" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pipeline_task_events_taskId_idx" ON "pipeline_task_events"("taskId");

-- CreateIndex
CREATE INDEX "pipeline_task_events_createdAt_idx" ON "pipeline_task_events"("createdAt");
