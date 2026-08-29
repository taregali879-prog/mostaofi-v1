CREATE TYPE procurement_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED','CLOSED');
CREATE TYPE rfq_status AS ENUM ('DRAFT','ISSUED','CLOSED','AWARDED','CANCELLED');
CREATE TYPE supplier_quote_status AS ENUM ('DRAFT','SUBMITTED','SELECTED','REJECTED');
CREATE TYPE purchase_order_status AS ENUM ('DRAFT','APPROVED','PARTIALLY_DELIVERED','FULLY_DELIVERED','CLOSED','CANCELLED');
CREATE TYPE delivery_status AS ENUM ('EXPECTED','ARRIVED','UNDER_INSPECTION','PARTIALLY_ACCEPTED','ACCEPTED','REJECTED');
CREATE TYPE inventory_movement_type AS ENUM ('PURCHASE_RECEIPT','PROJECT_ALLOCATION','PROJECT_ISSUE','PROJECT_RETURN','SUPPLIER_RETURN','WAREHOUSE_TRANSFER','ADJUSTMENT');

CREATE TABLE suppliers (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 name text NOT NULL, tax_number text, email text, phone text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX suppliers_org_name_idx ON suppliers(organization_id,name);

CREATE TABLE material_requirements (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 boq_version_id uuid NOT NULL REFERENCES boq_versions(id) ON DELETE RESTRICT,
 status procurement_status NOT NULL DEFAULT 'DRAFT', requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX material_requirements_org_project_idx ON material_requirements(organization_id,project_id);
CREATE TABLE material_requirement_items (
 id uuid PRIMARY KEY, material_requirement_id uuid NOT NULL REFERENCES material_requirements(id) ON DELETE RESTRICT,
 boq_item_id uuid NOT NULL REFERENCES boq_items(id) ON DELETE RESTRICT, quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 UNIQUE(material_requirement_id,boq_item_id)
);

CREATE TABLE rfqs (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 material_requirement_id uuid NOT NULL REFERENCES material_requirements(id) ON DELETE RESTRICT,
 status rfq_status NOT NULL DEFAULT 'DRAFT', due_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rfqs_org_project_idx ON rfqs(organization_id,project_id);

CREATE TABLE supplier_quotes (
 id uuid PRIMARY KEY, rfq_id uuid NOT NULL REFERENCES rfqs(id) ON DELETE RESTRICT,
 supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
 status supplier_quote_status NOT NULL DEFAULT 'DRAFT', currency text NOT NULL DEFAULT 'SAR',
 lead_time_days int CHECK(lead_time_days IS NULL OR lead_time_days>=0), payment_terms text,
 submitted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(rfq_id,supplier_id)
);
CREATE TABLE supplier_quote_items (
 id uuid PRIMARY KEY, supplier_quote_id uuid NOT NULL REFERENCES supplier_quotes(id) ON DELETE RESTRICT,
 boq_item_id uuid NOT NULL REFERENCES boq_items(id) ON DELETE RESTRICT, quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 unit_price numeric(14,2) NOT NULL CHECK(unit_price>=0), available_qty numeric(14,3) CHECK(available_qty IS NULL OR available_qty>=0),
 UNIQUE(supplier_quote_id,boq_item_id)
);

CREATE TABLE purchase_orders (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT, supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
 supplier_quote_id uuid REFERENCES supplier_quotes(id) ON DELETE RESTRICT, po_number text NOT NULL,
 status purchase_order_status NOT NULL DEFAULT 'DRAFT', approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,po_number)
);
CREATE INDEX purchase_orders_org_project_status_idx ON purchase_orders(organization_id,project_id,status);
CREATE TABLE purchase_order_items (
 id uuid PRIMARY KEY, purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
 boq_item_id uuid REFERENCES boq_items(id) ON DELETE RESTRICT, description text NOT NULL, unit text NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit_price numeric(14,2) NOT NULL CHECK(unit_price>=0)
);
CREATE INDEX purchase_order_items_po_idx ON purchase_order_items(purchase_order_id);

CREATE TABLE deliveries (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT, purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
 delivery_number text NOT NULL, status delivery_status NOT NULL DEFAULT 'EXPECTED', arrived_at timestamptz, received_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,delivery_number)
);
CREATE INDEX deliveries_org_project_status_idx ON deliveries(organization_id,project_id,status);
CREATE TABLE delivery_items (
 id uuid PRIMARY KEY, delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE RESTRICT,
 purchase_order_item_id uuid NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
 arrived_qty numeric(14,3) NOT NULL CHECK(arrived_qty>0), accepted_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK(accepted_qty>=0),
 rejected_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK(rejected_qty>=0), damaged_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK(damaged_qty>=0),
 CHECK(accepted_qty+rejected_qty+damaged_qty<=arrived_qty), UNIQUE(delivery_id,purchase_order_item_id)
);

CREATE TABLE warehouses (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 name text NOT NULL, city text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX warehouses_org_name_idx ON warehouses(organization_id,name);
CREATE TABLE inventory_movements (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT, project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
 boq_item_id uuid REFERENCES boq_items(id) ON DELETE RESTRICT, movement_type inventory_movement_type NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit_cost numeric(14,2) CHECK(unit_cost IS NULL OR unit_cost>=0),
 reference_type text NOT NULL, reference_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_org_warehouse_idx ON inventory_movements(organization_id,warehouse_id,occurred_at);
CREATE INDEX inventory_movements_org_project_idx ON inventory_movements(organization_id,project_id,occurred_at);
