CREATE TABLE IF NOT EXISTS "officer_refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "officer_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    CONSTRAINT "officer_refresh_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "officer_refresh_tokens_officer_id_fkey"
      FOREIGN KEY ("officer_id") REFERENCES "officers"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_officer_refresh_tokens_expires"
  ON "officer_refresh_tokens"("expires_at");

CREATE INDEX IF NOT EXISTS "idx_officer_refresh_tokens_hash"
  ON "officer_refresh_tokens"("token_hash");

CREATE INDEX IF NOT EXISTS "idx_officer_refresh_tokens_officer"
  ON "officer_refresh_tokens"("officer_id");
