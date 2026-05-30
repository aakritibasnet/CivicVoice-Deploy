/*
  Warnings:

  - The values [supervisor,administrator] on the enum `user_role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "user_role_new" AS ENUM ('ward', 'municipality', 'admin', 'citizen', 'officer');
ALTER TABLE "public"."kanban_columns" ALTER COLUMN "role_access" DROP DEFAULT;
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "kanban_columns" ALTER COLUMN "role_access" TYPE "user_role_new"[] USING ("role_access"::text::"user_role_new"[]);
ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_new" USING ("role"::text::"user_role_new");
ALTER TYPE "user_role" RENAME TO "user_role_old";
ALTER TYPE "user_role_new" RENAME TO "user_role";
DROP TYPE "public"."user_role_old";
ALTER TABLE "kanban_columns" ALTER COLUMN "role_access" SET DEFAULT ARRAY[]::"user_role"[];
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'officer';
COMMIT;

-- DropIndex
DROP INDEX "idx_kanban_columns_role_access";

-- CreateIndex
CREATE INDEX "idx_kanban_columns_role_access" ON "kanban_columns"("role_access");
