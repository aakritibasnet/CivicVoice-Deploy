-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "report_id" UUID;

-- CreateIndex
CREATE INDEX "idx_notifications_report" ON "notifications"("report_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
