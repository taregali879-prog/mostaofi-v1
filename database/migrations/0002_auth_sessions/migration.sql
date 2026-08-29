ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
UPDATE users SET password_hash = 'scrypt$d9f8847443b776e895b60c17d3b1d1ee$4f1c3a2bbc486446ec1bdcc22e0f2b06aec12996720d0a50dbeaf042e812396d27fc857cc395d913b571a2cef6b5d8757c67c6dd4d09093f53f2f74aed60b338' WHERE email = 'admin@partner.local' AND password_hash IS NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
CREATE TABLE IF NOT EXISTS auth_sessions (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 refresh_token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_org_idx ON auth_sessions(user_id,organization_id);
