-- Additive only. Deliberately not applied to production in this change.
CREATE TABLE hydraulic_calculations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title text NOT NULL,
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hydraulic_calculations_org_project_idx
  ON hydraulic_calculations (organization_id, project_id);
CREATE TABLE hydraulic_calculation_versions (
  id uuid PRIMARY KEY,
  calculation_id uuid NOT NULL REFERENCES hydraulic_calculations(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version >= 1),
  document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
  source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-fA-F]{64}$'),
  input jsonb NOT NULL,
  result jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calculation_id, version)
);
CREATE INDEX hydraulic_calculation_versions_document_version_idx
  ON hydraulic_calculation_versions (document_version_id);
-- Cross-tenant/document-project consistency enforced by authenticated application service.
