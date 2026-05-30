-- CreateTable: municipalities
CREATE TABLE "municipalities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "name_ne" VARCHAR(255),
    "code" VARCHAR(50) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "province_id" INTEGER,
    "province_name" VARCHAR(100),
    "district" VARCHAR(100),
    "boundary_metadata" JSONB DEFAULT '{}',
    "total_wards" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boundary" geometry,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: municipalities
CREATE UNIQUE INDEX "municipalities_code_key" ON "municipalities"("code");
CREATE INDEX "idx_municipalities_boundary_gist" ON "municipalities" USING GIST ("boundary");
CREATE INDEX "idx_municipalities_province" ON "municipalities"("province_id");

-- AlterTable: wards — add municipality_id
ALTER TABLE "wards" ADD COLUMN "municipality_id" UUID;
ALTER TABLE "wards" ADD CONSTRAINT "wards_municipality_id_fkey"
    FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "idx_wards_municipality" ON "wards"("municipality_id");

-- AlterTable: users — add municipality_id
ALTER TABLE "users" ADD COLUMN "municipality_id" UUID;
ALTER TABLE "users" ADD CONSTRAINT "users_municipality_id_fkey"
    FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "idx_users_municipality" ON "users"("municipality_id");
