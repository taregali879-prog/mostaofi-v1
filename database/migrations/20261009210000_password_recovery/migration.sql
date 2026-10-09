ALTER TABLE "users" ADD COLUMN "credential_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "credential_changed_at" TIMESTAMPTZ(3);
CREATE TABLE "password_recovery_requests" (
  "id" UUID PRIMARY KEY, "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "token_hash" CHAR(64) NOT NULL UNIQUE, "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "password_recovery_requests_user_id_used_at_idx" ON "password_recovery_requests"("user_id", "used_at");
CREATE TABLE "recovery_mail" (
  "id" UUID PRIMARY KEY, "kind" TEXT NOT NULL, "payload" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "lease_until" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "recovery_mail_status_available_at_idx" ON "recovery_mail"("status", "available_at");
CREATE TABLE "recovery_throttle" ("key" CHAR(64) PRIMARY KEY, "hits" INTEGER NOT NULL, "expires_at" TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX "recovery_throttle_expires_at_idx" ON "recovery_throttle"("expires_at");
