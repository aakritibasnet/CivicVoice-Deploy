-- Add new columns to kanban_columns table
ALTER TABLE "kanban_columns" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "kanban_columns" ADD COLUMN "role_access" "user_role"[] NOT NULL DEFAULT '{}';

-- Create indexes for new columns
CREATE INDEX "idx_kanban_columns_is_default" ON "kanban_columns"("is_default");
CREATE INDEX "idx_kanban_columns_role_access" ON "kanban_columns" USING GIN("role_access");

-- Create kanban_user_preferences table
CREATE TABLE "kanban_user_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "collapsed_columns" JSONB NOT NULL DEFAULT '[]',
    "column_order" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kanban_user_preferences_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on user_id
CREATE UNIQUE INDEX "kanban_user_preferences_user_id_key" ON "kanban_user_preferences"("user_id");

-- Create index for user_id
CREATE INDEX "idx_kanban_prefs_user" ON "kanban_user_preferences"("user_id");

-- Add foreign key constraint
ALTER TABLE "kanban_user_preferences" ADD CONSTRAINT "kanban_user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
