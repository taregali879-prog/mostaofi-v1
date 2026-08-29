CREATE TYPE contractor_status AS ENUM ('DRAFT','SUBMITTED','UNDER_REVIEW','TRIAL','APPROVED','SUSPENDED','REJECTED');
CREATE TYPE project_status AS ENUM ('DRAFT','ACTIVE','ON_HOLD','COMPLETED','CANCELLED');
CREATE TYPE document_status AS ENUM ('DRAFT','UPLOADED','APPROVED','REJECTED');

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  roles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);
CREATE INDEX memberships_org_idx ON memberships(organization_id);

CREATE TABLE contractor_profiles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
  legal_name text NOT NULL,
  commercial_registration_no text NOT NULL,
  city text,
  phone text,
  status contractor_status NOT NULL DEFAULT 'DRAFT',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contractor_profiles_status_idx ON contractor_profiles(status);

CREATE TABLE projects (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  client_name text NOT NULL,
  city text NOT NULL,
  scope text NOT NULL,
  estimated_value numeric(14,2),
  expected_start_date date,
  status project_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_org_status_idx ON projects(organization_id,status);
CREATE INDEX projects_org_created_idx ON projects(organization_id,created_at DESC);

CREATE TABLE documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  type text NOT NULL,
  title text NOT NULL,
  current_version int NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  status document_status NOT NULL DEFAULT 'UPLOADED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_org_project_idx ON documents(organization_id,project_id);

CREATE TABLE document_versions (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  version int NOT NULL CHECK (version >= 1),
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 char(64) NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, version)
);
CREATE INDEX document_versions_hash_idx ON document_versions(sha256);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  event text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  request_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_entity_idx ON audit_events(organization_id,entity_type,entity_id,occurred_at);
CREATE INDEX audit_request_idx ON audit_events(request_id);

-- Audit log is append-only at application role level; production should REVOKE UPDATE, DELETE after role creation.
