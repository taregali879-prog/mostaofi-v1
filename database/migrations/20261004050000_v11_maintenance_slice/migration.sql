-- Mostaofi v1.1 first maintenance vertical slice.
-- Governed by MOSTAOFI-V1.1-ERD-BASELINE-001. Additive only: existing MVP tables are preserved.

CREATE TYPE technician_status AS ENUM ('ACTIVE','INACTIVE','SUSPENDED');
CREATE TYPE sla_policy_status AS ENUM ('DRAFT','ACTIVE','RETIRED');
CREATE TYPE maintenance_contract_status AS ENUM ('DRAFT','PENDING_APPROVAL','ACTIVE','SUSPENDED','EXPIRING','EXPIRED','TERMINATED','CLOSED');
CREATE TYPE maintenance_asset_status AS ENUM ('ACTIVE','OUT_OF_SERVICE','UNDER_REPAIR','REPLACED','RETIRED');
CREATE TYPE maintenance_visit_kind AS ENUM ('PLANNED_MAINTENANCE','CORRECTIVE_REVISIT','CALL_OUT','FOLLOW_UP');
CREATE TYPE maintenance_visit_status AS ENUM ('PLANNED','SCHEDULED','CONFIRMED','ARRIVED','IN_PROGRESS','COMPLETED','RESCHEDULE_REQUIRED','NO_SHOW','OVERDUE','CANCELLED');
CREATE TYPE work_order_priority AS ENUM ('LOW','NORMAL','HIGH','URGENT');
CREATE TYPE work_order_status AS ENUM ('DRAFT','PENDING_ASSIGNMENT','ASSIGNED','ACCEPTED','EN_ROUTE','ARRIVED','IN_PROGRESS','INSPECTION_COMPLETED','ACTION_REQUIRED','CLIENT_APPROVAL_PENDING','APPROVED','EXECUTION_IN_PROGRESS','COMPLETED','REPORT_PENDING','CLOSED','ON_HOLD','REVISIT_REQUIRED','REJECTED','CANCELLED');
CREATE TYPE assignment_role AS ENUM ('LEAD_TECHNICIAN','ASSISTANT','SPECIALIST','INSPECTOR');
CREATE TYPE assignment_status AS ENUM ('ASSIGNED','ACCEPTED','DECLINED','RELEASED');
CREATE TYPE inspection_template_status AS ENUM ('ACTIVE','RETIRED');
CREATE TYPE inspection_template_version_status AS ENUM ('DRAFT','REVIEW','PUBLISHED','RETIRED');
CREATE TYPE inspection_answer_type AS ENUM ('PASS_FAIL','YES_NO','NUMBER','TEXT','READING','PHOTO','VIDEO','MULTI_SELECT','SIGNATURE');
CREATE TYPE inspection_status AS ENUM ('DRAFT','IN_PROGRESS','COMPLETED','VOIDED');
CREATE TYPE inspection_answer_result AS ENUM ('PASS','FAIL','RECORDED','NOT_APPLICABLE');
CREATE TYPE finding_classification_status AS ENUM ('DRAFT','ACTIVE','RETIRED');
CREATE TYPE finding_type AS ENUM ('OBSERVATION','FAULT','VIOLATION','RECOMMENDATION');
CREATE TYPE finding_severity AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE finding_status AS ENUM ('OPEN','ACKNOWLEDGED','PROPOSAL_PENDING','APPROVAL_PENDING','APPROVED_FOR_ACTION','IN_PROGRESS','RESOLVED','VERIFIED','ACCEPTED_RISK','CLOSED','VOIDED');

ALTER TABLE contractor_profiles
  ADD CONSTRAINT contractor_profiles_org_id_id_unique UNIQUE (organization_id, id);

CREATE TABLE client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id)
);
CREATE TABLE site (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL, display_name text NOT NULL, city text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id)
);
CREATE TABLE technician (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contractor_id uuid NOT NULL, user_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT, employee_code text NOT NULL,
  display_name text NOT NULL, mobile text NOT NULL, status technician_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,employee_code)
);
CREATE TABLE sla_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL, version integer NOT NULL CHECK (version >= 1), response_target_minutes integer NOT NULL CHECK (response_target_minutes >= 0),
  arrival_target_minutes integer NOT NULL CHECK (arrival_target_minutes >= 0), resolution_target_minutes integer NOT NULL CHECK (resolution_target_minutes >= 0),
  working_hours_policy jsonb NOT NULL DEFAULT '{}'::jsonb, timezone text NOT NULL, status sla_policy_status NOT NULL DEFAULT 'DRAFT',
  effective_from date NOT NULL, effective_to date NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,name,version), CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE TABLE maintenance_contract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contract_number text NOT NULL, client_id uuid NOT NULL, contractor_id uuid NOT NULL, contract_type text NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL, planned_visits integer NOT NULL CHECK (planned_visits >= 0),
  completed_visits integer NOT NULL DEFAULT 0 CHECK (completed_visits >= 0), visit_frequency_type text NOT NULL,
  visit_frequency_value integer NOT NULL CHECK (visit_frequency_value >= 1), contract_value numeric(19,4) NOT NULL CHECK (contract_value >= 0),
  vat_amount numeric(19,4) NOT NULL CHECK (vat_amount >= 0), total_value numeric(19,4) NOT NULL CHECK (total_value >= 0),
  currency char(3) NOT NULL, sla_policy_id uuid NOT NULL, status maintenance_contract_status NOT NULL DEFAULT 'DRAFT',
  activated_at timestamptz NULL, suspended_at timestamptz NULL, closed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,contract_number), CHECK (end_date >= start_date), CHECK (completed_visits <= planned_visits)
);
CREATE TABLE maintenance_contract_site (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL, site_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,contract_id,site_id)
);
CREATE TABLE maintenance_contract_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL, scope_category text NOT NULL, service_type text NOT NULL, description text NOT NULL, included boolean NOT NULL,
  visit_limit integer NULL CHECK (visit_limit IS NULL OR visit_limit >= 0), notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id)
);
CREATE TABLE maintenance_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL, contract_id uuid NULL, asset_code text NOT NULL, asset_type text NOT NULL, manufacturer text NOT NULL, model text NOT NULL,
  serial_number text NULL, installation_date date NULL, commissioned_at timestamptz NULL, location_description text NOT NULL,
  status maintenance_asset_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,asset_code)
);
CREATE TABLE maintenance_visit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL, site_id uuid NOT NULL, previous_visit_id uuid NULL, visit_sequence integer NOT NULL CHECK (visit_sequence >= 1),
  visit_kind maintenance_visit_kind NOT NULL, scheduled_start timestamptz NOT NULL, scheduled_end timestamptz NOT NULL,
  confirmed_at timestamptz NULL, actual_arrival_at timestamptz NULL, actual_start_at timestamptz NULL, actual_end_at timestamptz NULL,
  status maintenance_visit_status NOT NULL DEFAULT 'PLANNED', reschedule_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,contract_id,visit_sequence), CHECK (scheduled_end > scheduled_start),
  CHECK (actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at)
);
CREATE TABLE work_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  work_order_number text NOT NULL, contract_id uuid NOT NULL, visit_id uuid NOT NULL, site_id uuid NOT NULL, contractor_id uuid NOT NULL,
  service_type text NOT NULL, priority work_order_priority NOT NULL DEFAULT 'NORMAL', scheduled_start timestamptz NOT NULL,
  sla_deadline timestamptz NULL, actual_start_at timestamptz NULL, actual_completion_at timestamptz NULL,
  status work_order_status NOT NULL DEFAULT 'DRAFT', created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,work_order_number), CHECK (actual_completion_at IS NULL OR actual_start_at IS NULL OR actual_completion_at >= actual_start_at)
);
CREATE TABLE work_order_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  work_order_id uuid NOT NULL, technician_id uuid NOT NULL, role assignment_role NOT NULL, assigned_at timestamptz NOT NULL,
  accepted_at timestamptz NULL, released_at timestamptz NULL, status assignment_status NOT NULL DEFAULT 'ASSIGNED', assigned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,work_order_id,technician_id,role)
);
CREATE TABLE inspection_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL, service_type text NOT NULL, status inspection_template_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id)
);
CREATE TABLE inspection_template_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL, version_number integer NOT NULL CHECK (version_number >= 1), status inspection_template_version_status NOT NULL DEFAULT 'DRAFT',
  effective_from date NULL, published_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,template_id,version_number)
);
CREATE TABLE inspection_section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL, title text NOT NULL, display_order integer NOT NULL CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,template_version_id,display_order)
);
CREATE TABLE inspection_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  section_id uuid NOT NULL, code text NOT NULL, question text NOT NULL, answer_type inspection_answer_type NOT NULL,
  required boolean NOT NULL DEFAULT true, requires_evidence_on_fail boolean NOT NULL DEFAULT false, display_order integer NOT NULL CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,section_id,code), UNIQUE (tenant_id,section_id,display_order)
);
CREATE TABLE inspection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  work_order_id uuid NOT NULL, template_version_id uuid NOT NULL, started_at timestamptz NOT NULL, completed_at timestamptz NULL,
  performed_by uuid NOT NULL, status inspection_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE TABLE inspection_answer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  inspection_id uuid NOT NULL, inspection_item_id uuid NOT NULL, answer_boolean boolean NULL, answer_number numeric NULL,
  answer_text text NULL, answer_json jsonb NULL, result inspection_answer_result NOT NULL, recorded_at timestamptz NOT NULL, recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,inspection_id,inspection_item_id)
);
CREATE TABLE finding_classification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code text NOT NULL, classification_type text NOT NULL, title text NOT NULL, description text NOT NULL,
  reference_source text NULL, reference_version text NULL, reference_section text NULL,
  status finding_classification_status NOT NULL DEFAULT 'DRAFT', effective_from date NULL, effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id), UNIQUE (tenant_id,code), CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE TABLE finding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  work_order_id uuid NOT NULL, inspection_id uuid NOT NULL, inspection_item_id uuid NULL, asset_id uuid NULL, finding_classification_id uuid NULL,
  finding_type finding_type NOT NULL, category text NOT NULL, title text NOT NULL, description text NOT NULL,
  severity finding_severity NOT NULL, risk_level text NOT NULL, status finding_status NOT NULL DEFAULT 'OPEN', detected_by uuid NOT NULL,
  detected_at timestamptz NOT NULL, resolved_at timestamptz NULL, verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,id)
);

-- Tenant-safe foreign keys.
ALTER TABLE site ADD CONSTRAINT site_client_tenant_fk FOREIGN KEY (tenant_id,client_id) REFERENCES client(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE technician ADD CONSTRAINT technician_contractor_tenant_fk FOREIGN KEY (tenant_id,contractor_id) REFERENCES contractor_profiles(organization_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_contract ADD CONSTRAINT maintenance_contract_client_tenant_fk FOREIGN KEY (tenant_id,client_id) REFERENCES client(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_contract ADD CONSTRAINT maintenance_contract_contractor_tenant_fk FOREIGN KEY (tenant_id,contractor_id) REFERENCES contractor_profiles(organization_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_contract ADD CONSTRAINT maintenance_contract_sla_tenant_fk FOREIGN KEY (tenant_id,sla_policy_id) REFERENCES sla_policy(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_contract_site ADD CONSTRAINT maintenance_contract_site_contract_tenant_fk FOREIGN KEY (tenant_id,contract_id) REFERENCES maintenance_contract(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_contract_site ADD CONSTRAINT maintenance_contract_site_site_tenant_fk FOREIGN KEY (tenant_id,site_id) REFERENCES site(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_contract_scope ADD CONSTRAINT maintenance_contract_scope_contract_tenant_fk FOREIGN KEY (tenant_id,contract_id) REFERENCES maintenance_contract(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_asset ADD CONSTRAINT maintenance_asset_site_tenant_fk FOREIGN KEY (tenant_id,site_id) REFERENCES site(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_asset ADD CONSTRAINT maintenance_asset_contract_tenant_fk FOREIGN KEY (tenant_id,contract_id) REFERENCES maintenance_contract(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_visit ADD CONSTRAINT maintenance_visit_contract_tenant_fk FOREIGN KEY (tenant_id,contract_id) REFERENCES maintenance_contract(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_visit ADD CONSTRAINT maintenance_visit_site_tenant_fk FOREIGN KEY (tenant_id,site_id) REFERENCES site(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE maintenance_visit ADD CONSTRAINT maintenance_visit_previous_tenant_fk FOREIGN KEY (tenant_id,previous_visit_id) REFERENCES maintenance_visit(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE work_order ADD CONSTRAINT work_order_contract_tenant_fk FOREIGN KEY (tenant_id,contract_id) REFERENCES maintenance_contract(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE work_order ADD CONSTRAINT work_order_visit_tenant_fk FOREIGN KEY (tenant_id,visit_id) REFERENCES maintenance_visit(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE work_order ADD CONSTRAINT work_order_site_tenant_fk FOREIGN KEY (tenant_id,site_id) REFERENCES site(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE work_order ADD CONSTRAINT work_order_contractor_tenant_fk FOREIGN KEY (tenant_id,contractor_id) REFERENCES contractor_profiles(organization_id,id) ON DELETE RESTRICT;
ALTER TABLE work_order_assignment ADD CONSTRAINT work_order_assignment_work_order_tenant_fk FOREIGN KEY (tenant_id,work_order_id) REFERENCES work_order(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE work_order_assignment ADD CONSTRAINT work_order_assignment_technician_tenant_fk FOREIGN KEY (tenant_id,technician_id) REFERENCES technician(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inspection_template_version ADD CONSTRAINT inspection_template_version_template_tenant_fk FOREIGN KEY (tenant_id,template_id) REFERENCES inspection_template(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inspection_section ADD CONSTRAINT inspection_section_version_tenant_fk FOREIGN KEY (tenant_id,template_version_id) REFERENCES inspection_template_version(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inspection_item ADD CONSTRAINT inspection_item_section_tenant_fk FOREIGN KEY (tenant_id,section_id) REFERENCES inspection_section(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inspection ADD CONSTRAINT inspection_work_order_tenant_fk FOREIGN KEY (tenant_id,work_order_id) REFERENCES work_order(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inspection ADD CONSTRAINT inspection_template_version_tenant_fk FOREIGN KEY (tenant_id,template_version_id) REFERENCES inspection_template_version(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inspection ADD CONSTRAINT inspection_performer_tenant_fk FOREIGN KEY (tenant_id,performed_by) REFERENCES technician(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inspection_answer ADD CONSTRAINT inspection_answer_inspection_tenant_fk FOREIGN KEY (tenant_id,inspection_id) REFERENCES inspection(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inspection_answer ADD CONSTRAINT inspection_answer_item_tenant_fk FOREIGN KEY (tenant_id,inspection_item_id) REFERENCES inspection_item(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE inspection_answer ADD CONSTRAINT inspection_answer_recorder_tenant_fk FOREIGN KEY (tenant_id,recorded_by) REFERENCES technician(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE finding ADD CONSTRAINT finding_work_order_tenant_fk FOREIGN KEY (tenant_id,work_order_id) REFERENCES work_order(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE finding ADD CONSTRAINT finding_inspection_tenant_fk FOREIGN KEY (tenant_id,inspection_id) REFERENCES inspection(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE finding ADD CONSTRAINT finding_item_tenant_fk FOREIGN KEY (tenant_id,inspection_item_id) REFERENCES inspection_item(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE finding ADD CONSTRAINT finding_asset_tenant_fk FOREIGN KEY (tenant_id,asset_id) REFERENCES maintenance_asset(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE finding ADD CONSTRAINT finding_classification_tenant_fk FOREIGN KEY (tenant_id,finding_classification_id) REFERENCES finding_classification(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE finding ADD CONSTRAINT finding_detector_tenant_fk FOREIGN KEY (tenant_id,detected_by) REFERENCES technician(tenant_id,id) ON DELETE RESTRICT;

CREATE INDEX maintenance_contract_tenant_status_idx ON maintenance_contract(tenant_id,status);
CREATE INDEX maintenance_visit_tenant_status_start_idx ON maintenance_visit(tenant_id,status,scheduled_start);
CREATE INDEX work_order_tenant_status_start_idx ON work_order(tenant_id,status,scheduled_start);
CREATE INDEX inspection_tenant_status_idx ON inspection(tenant_id,status);
CREATE INDEX finding_tenant_status_severity_idx ON finding(tenant_id,status,severity);

-- Fail closed under the S0 current_tenant_id() transaction context.
ALTER TABLE client ENABLE ROW LEVEL SECURITY;
ALTER TABLE client FORCE ROW LEVEL SECURITY;
CREATE POLICY client_tenant_isolation ON client FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE site ENABLE ROW LEVEL SECURITY;
ALTER TABLE site FORCE ROW LEVEL SECURITY;
CREATE POLICY site_tenant_isolation ON site FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE technician ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician FORCE ROW LEVEL SECURITY;
CREATE POLICY technician_tenant_isolation ON technician FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE sla_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY sla_policy_tenant_isolation ON sla_policy FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE maintenance_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_contract FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_contract_tenant_isolation ON maintenance_contract FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE maintenance_contract_site ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_contract_site FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_contract_site_tenant_isolation ON maintenance_contract_site FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE maintenance_contract_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_contract_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_contract_scope_tenant_isolation ON maintenance_contract_scope FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE maintenance_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_asset FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_asset_tenant_isolation ON maintenance_asset FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE maintenance_visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_visit FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_visit_tenant_isolation ON maintenance_visit FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE work_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order FORCE ROW LEVEL SECURITY;
CREATE POLICY work_order_tenant_isolation ON work_order FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE work_order_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY work_order_assignment_tenant_isolation ON work_order_assignment FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE inspection_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_template FORCE ROW LEVEL SECURITY;
CREATE POLICY inspection_template_tenant_isolation ON inspection_template FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE inspection_template_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_template_version FORCE ROW LEVEL SECURITY;
CREATE POLICY inspection_template_version_tenant_isolation ON inspection_template_version FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE inspection_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_section FORCE ROW LEVEL SECURITY;
CREATE POLICY inspection_section_tenant_isolation ON inspection_section FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE inspection_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_item FORCE ROW LEVEL SECURITY;
CREATE POLICY inspection_item_tenant_isolation ON inspection_item FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE inspection ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection FORCE ROW LEVEL SECURITY;
CREATE POLICY inspection_tenant_isolation ON inspection FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE inspection_answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_answer FORCE ROW LEVEL SECURITY;
CREATE POLICY inspection_answer_tenant_isolation ON inspection_answer FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE finding_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_classification FORCE ROW LEVEL SECURITY;
CREATE POLICY finding_classification_tenant_isolation ON finding_classification FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE finding ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding FORCE ROW LEVEL SECURITY;
CREATE POLICY finding_tenant_isolation ON finding FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
