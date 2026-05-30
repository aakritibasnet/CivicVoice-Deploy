CREATE TABLE "task_completions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "completed_by_user_id" UUID,
    "completed_by_officer_id" UUID,
    "description" TEXT,
    "before_image_url" VARCHAR(2048),
    "after_image_url" VARCHAR(2048) NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_completions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "completion_id" UUID NOT NULL,
    "ward_id" UUID,
    "source_user_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100) NOT NULL,
    "priority" "priority_level" NOT NULL DEFAULT 'medium',
    "before_image_url" VARCHAR(2048),
    "after_image_url" VARCHAR(2048) NOT NULL,
    "ward_name_snapshot" VARCHAR(255) NOT NULL,
    "completed_by_name_snapshot" VARCHAR(255) NOT NULL,
    "completed_by_role_snapshot" VARCHAR(50) NOT NULL,
    "task_snapshot" JSONB NOT NULL DEFAULT '{}',
    "completion_snapshot" JSONB NOT NULL DEFAULT '{}',
    "rating_average" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "bookmark_count" INTEGER NOT NULL DEFAULT 0,
    "edited_count" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "report_ratings_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE TABLE "report_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "content" TEXT NOT NULL,
    "anonymous_name" VARCHAR(80) NOT NULL,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_comment_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_comment_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_post_bookmarks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_post_bookmarks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_completions_task_id_key" ON "task_completions"("task_id");
CREATE UNIQUE INDEX "report_posts_task_id_key" ON "report_posts"("task_id");
CREATE UNIQUE INDEX "report_posts_completion_id_key" ON "report_posts"("completion_id");
CREATE UNIQUE INDEX "report_ratings_post_id_user_id_key" ON "report_ratings"("post_id", "user_id");
CREATE UNIQUE INDEX "report_comment_reports_comment_id_user_id_key" ON "report_comment_reports"("comment_id", "user_id");
CREATE UNIQUE INDEX "report_post_bookmarks_post_id_user_id_key" ON "report_post_bookmarks"("post_id", "user_id");

CREATE INDEX "idx_task_completions_completed_at" ON "task_completions"("completed_at" DESC);
CREATE INDEX "idx_task_completions_completed_by_user" ON "task_completions"("completed_by_user_id");
CREATE INDEX "idx_task_completions_completed_by_officer" ON "task_completions"("completed_by_officer_id");
CREATE INDEX "idx_report_posts_ward" ON "report_posts"("ward_id");
CREATE INDEX "idx_report_posts_created" ON "report_posts"("created_at" DESC);
CREATE INDEX "idx_report_posts_rating_average" ON "report_posts"("rating_average" DESC);
CREATE INDEX "idx_report_posts_source_user" ON "report_posts"("source_user_id");
CREATE INDEX "idx_report_ratings_post" ON "report_ratings"("post_id");
CREATE INDEX "idx_report_ratings_user" ON "report_ratings"("user_id");
CREATE INDEX "idx_report_comments_post_created" ON "report_comments"("post_id", "created_at" ASC);
CREATE INDEX "idx_report_comments_parent" ON "report_comments"("parent_id");
CREATE INDEX "idx_report_comments_user" ON "report_comments"("user_id");
CREATE INDEX "idx_report_comment_reports_comment" ON "report_comment_reports"("comment_id");
CREATE INDEX "idx_report_comment_reports_user" ON "report_comment_reports"("user_id");
CREATE INDEX "idx_report_post_bookmarks_post" ON "report_post_bookmarks"("post_id");
CREATE INDEX "idx_report_post_bookmarks_user" ON "report_post_bookmarks"("user_id");

ALTER TABLE "task_completions"
    ADD CONSTRAINT "task_completions_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "reports"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "task_completions"
    ADD CONSTRAINT "task_completions_completed_by_user_id_fkey"
    FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "task_completions"
    ADD CONSTRAINT "task_completions_completed_by_officer_id_fkey"
    FOREIGN KEY ("completed_by_officer_id") REFERENCES "officers"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "report_posts"
    ADD CONSTRAINT "report_posts_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "reports"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "report_posts"
    ADD CONSTRAINT "report_posts_completion_id_fkey"
    FOREIGN KEY ("completion_id") REFERENCES "task_completions"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "report_posts"
    ADD CONSTRAINT "report_posts_ward_id_fkey"
    FOREIGN KEY ("ward_id") REFERENCES "wards"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "report_posts"
    ADD CONSTRAINT "report_posts_source_user_id_fkey"
    FOREIGN KEY ("source_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "report_ratings"
    ADD CONSTRAINT "report_ratings_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "report_posts"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "report_ratings"
    ADD CONSTRAINT "report_ratings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "report_comments"
    ADD CONSTRAINT "report_comments_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "report_posts"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "report_comments"
    ADD CONSTRAINT "report_comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "report_comments"
    ADD CONSTRAINT "report_comments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "report_comments"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "report_comment_reports"
    ADD CONSTRAINT "report_comment_reports_comment_id_fkey"
    FOREIGN KEY ("comment_id") REFERENCES "report_comments"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "report_comment_reports"
    ADD CONSTRAINT "report_comment_reports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "report_post_bookmarks"
    ADD CONSTRAINT "report_post_bookmarks_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "report_posts"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "report_post_bookmarks"
    ADD CONSTRAINT "report_post_bookmarks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
