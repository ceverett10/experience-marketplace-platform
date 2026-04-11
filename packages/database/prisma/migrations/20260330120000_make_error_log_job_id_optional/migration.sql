-- AlterTable: Make jobId optional on ErrorLog to support client-side error reporting
ALTER TABLE "ErrorLog" ALTER COLUMN "jobId" DROP NOT NULL;

-- DropForeignKey: Recreate as optional
ALTER TABLE "ErrorLog" DROP CONSTRAINT "ErrorLog_jobId_fkey";

-- AddForeignKey: Optional foreign key with SetNull on delete
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
