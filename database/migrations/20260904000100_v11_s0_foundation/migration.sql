-- MOSTAOFI v1.1 — S0 Foundation
-- Derived from MOSTAOFI-V1.1-ERD-BASELINE-001.
-- This migration does not redefine the frozen ERD. The current v0.5 Core calls
-- the tenant boundary "organizations"; the tenant view is a compatibility bridge
-- until a controlled Core naming migration is adopted.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE VIEW tenant AS
SELECT id, name, created_at
FROM organizations;

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION current_actor_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.actor_user_id', true), '')::uuid
$$;

CREATE TYPE idempotency_status AS ENUM (
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);

CREATE TYPE domain_event_status AS ENUM (
  'PENDING',
  'PUBLISHED',
  'FAILED',
  'DEAD_LETTER'
);

CREATE TABLE idempotency_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation_scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_status integer NULL,
  response_json jsonb NULL,
  resource_type text NULL,
  resource_id uuid NULL,
  status idempotency_status NOT NULL DEFAULT 'IN_PROGRESS',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, actor_user_id, operation_scope, idempotency_key)
);

CREATE INDEX idempotency_record_tenant_expires_idx
  ON idempotency_record (tenant_id, expires_at);

CREATE TABLE domain_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_json jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  status domain_event_status NOT NULL DEFAULT 'PENDING',
  correlation_id uuid NOT NULL,
  causation_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id)
);

CREATE INDEX domain_event_status_occurred_idx
  ON domain_event (status, occurred_at);

-- Fail closed: if app.tenant_id is absent, current_tenant_id() is NULL and
-- neither USING nor WITH CHECK can match a tenant-owned row.
ALTER TABLE idempotency_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_record FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_record_tenant_isolation
  ON idempotency_record
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE domain_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_event FORCE ROW LEVEL SECURITY;
CREATE POLICY domain_event_tenant_isolation
  ON domain_event
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; UPDATE/DELETE is forbidden';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE OR REPLACE FUNCTION enforce_domain_event_immutable_content()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'domain_event immutable content cannot be deleted';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.aggregate_type IS DISTINCT FROM OLD.aggregate_type
     OR NEW.aggregate_id IS DISTINCT FROM OLD.aggregate_id
     OR NEW.payload_json IS DISTINCT FROM OLD.payload_json
     OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.causation_id IS DISTINCT FROM OLD.causation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'domain_event business content is immutable after insert';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS domain_event_immutable_content ON domain_event;
CREATE TRIGGER domain_event_immutable_content
BEFORE UPDATE OR DELETE ON domain_event
FOR EACH ROW EXECUTE FUNCTION enforce_domain_event_immutable_content();
