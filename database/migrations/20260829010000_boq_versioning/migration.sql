CREATE TYPE boq_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED','SUPERSEDED');
CREATE TABLE boqs (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT, title text NOT NULL,
 current_version int NOT NULL DEFAULT 1 CHECK(current_version>=1), status boq_status NOT NULL DEFAULT 'DRAFT',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX boqs_org_project_idx ON boqs(organization_id,project_id);
CREATE TABLE boq_versions (
 id uuid PRIMARY KEY, boq_id uuid NOT NULL REFERENCES boqs(id) ON DELETE RESTRICT, version int NOT NULL CHECK(version>=1),
 status boq_status NOT NULL DEFAULT 'DRAFT', change_reason text, submitted_at timestamptz, approved_at timestamptz,
 approved_by uuid REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(boq_id,version)
);
CREATE TABLE boq_items (
 id uuid PRIMARY KEY, version_id uuid NOT NULL REFERENCES boq_versions(id) ON DELETE RESTRICT, line_no int NOT NULL CHECK(line_no>0),
 item_code text, description text NOT NULL, category text, manufacturer text, model text, unit text NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit_price numeric(14,2) CHECK(unit_price>=0), specification text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(version_id,line_no)
);
CREATE INDEX boq_items_version_idx ON boq_items(version_id);
