import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const MIGRATION = 'database/migrations/20261004050000_v11_maintenance_slice/migration.sql';
const migrationSql = () => {
  assert.equal(existsSync(MIGRATION), true, `missing ${MIGRATION}`);
  return readFileSync(MIGRATION, 'utf8');
};
const enumValues = (sql, name) => {
  const match = sql.match(new RegExp(`CREATE\\s+TYPE\\s+${name}\\s+AS\\s+ENUM\\s*\\(([^;]+?)\\)`, 'i'));
  assert.ok(match, `missing enum ${name}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

const tenantTables = [
  'client','site','technician','sla_policy','maintenance_contract','maintenance_contract_site',
  'maintenance_contract_scope','maintenance_visit','work_order','work_order_assignment',
  'inspection_template','inspection_template_version','inspection_section','inspection_item',
  'inspection','inspection_answer','finding_classification','finding'
];

test('creates the governed maintenance chain', () => {
  const sql = migrationSql();
  for (const table of tenantTables) assert.match(sql, new RegExp(`CREATE\\s+TABLE\\s+${table}\\b`, 'i'));
  for (const legacy of ['projects','boqs','material_requirements','purchase_orders','deliveries','inventory_movements']) {
    assert.doesNotMatch(sql, new RegExp(`DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?\\s+${legacy}\\b`, 'i'));
  }
});
test('enforces composite tenant ownership', () => {
  const sql = migrationSql();
  assert.match(sql, /ALTER\s+TABLE\s+contractor_profiles[\s\S]*UNIQUE\s*\(\s*organization_id\s*,\s*id\s*\)/i);
  const compositeFks = [
    ['site','client_id','client'],
    ['maintenance_contract','client_id','client'],
    ['maintenance_contract','contractor_id','contractor_profiles'],
    ['maintenance_contract','sla_policy_id','sla_policy'],
    ['maintenance_contract_site','contract_id','maintenance_contract'],
    ['maintenance_contract_site','site_id','site'],
    ['maintenance_visit','contract_id','maintenance_contract'],
    ['maintenance_visit','site_id','site'],
    ['work_order','visit_id','maintenance_visit'],
    ['work_order','site_id','site'],
    ['inspection','work_order_id','work_order'],
    ['finding','inspection_id','inspection']
  ];
  for (const [table, column, parent] of compositeFks) {
    const pattern = new RegExp(`ALTER\\s+TABLE\\s+${table}[\\s\\S]*?FOREIGN\\s+KEY\\s*\\(\\s*tenant_id\\s*,\\s*${column}\\s*\\)\\s+REFERENCES\\s+${parent}\\s*\\(\\s*(?:tenant_id|organization_id)\\s*,\\s*id\\s*\\)`, 'i');
    assert.match(sql, pattern, `${table}.${column} must be tenant-safe`);
  }
});

test('forces RLS on every maintenance tenant table', () => {
  const sql = migrationSql();
  for (const table of tenantTables) {
    assert.match(sql, new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'));
    assert.match(sql, new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'));
    assert.match(sql, new RegExp(`CREATE\\s+POLICY\\s+${table}_tenant_isolation[\\s\\S]*?ON\\s+${table}[\\s\\S]*?tenant_id\\s*=\\s*current_tenant_id\\s*\\(\\s*\\)`, 'i'));
  }
});
test('preserves previous_visit_id visit sequencing', () => {
  const sql = migrationSql();
  assert.match(sql, /previous_visit_id\s+uuid\s+NULL/i);
  assert.match(sql, /UNIQUE\s*\(\s*tenant_id\s*,\s*contract_id\s*,\s*visit_sequence\s*\)/i);
  assert.match(sql, /FOREIGN\s+KEY\s*\(\s*tenant_id\s*,\s*previous_visit_id\s*\)\s+REFERENCES\s+maintenance_visit\s*\(\s*tenant_id\s*,\s*id\s*\)/i);
});

test('uses frozen enum values without additions', () => {
  const sql = migrationSql();
  assert.deepEqual(enumValues(sql, 'technician_status'), ['ACTIVE','INACTIVE','SUSPENDED']);
  assert.deepEqual(enumValues(sql, 'sla_policy_status'), ['DRAFT','ACTIVE','RETIRED']);
  assert.deepEqual(enumValues(sql, 'maintenance_contract_status'), ['DRAFT','PENDING_APPROVAL','ACTIVE','SUSPENDED','EXPIRING','EXPIRED','TERMINATED','CLOSED']);
  assert.deepEqual(enumValues(sql, 'maintenance_visit_kind'), ['PLANNED_MAINTENANCE','CORRECTIVE_REVISIT','CALL_OUT','FOLLOW_UP']);
  assert.deepEqual(enumValues(sql, 'maintenance_visit_status'), ['PLANNED','SCHEDULED','CONFIRMED','ARRIVED','IN_PROGRESS','COMPLETED','RESCHEDULE_REQUIRED','NO_SHOW','OVERDUE','CANCELLED']);
  assert.deepEqual(enumValues(sql, 'work_order_priority'), ['LOW','NORMAL','HIGH','URGENT']);
  assert.deepEqual(enumValues(sql, 'work_order_status'), ['DRAFT','PENDING_ASSIGNMENT','ASSIGNED','ACCEPTED','EN_ROUTE','ARRIVED','IN_PROGRESS','INSPECTION_COMPLETED','ACTION_REQUIRED','CLIENT_APPROVAL_PENDING','APPROVED','EXECUTION_IN_PROGRESS','COMPLETED','REPORT_PENDING','CLOSED','ON_HOLD','REVISIT_REQUIRED','REJECTED','CANCELLED']);
  assert.deepEqual(enumValues(sql, 'assignment_role'), ['LEAD_TECHNICIAN','ASSISTANT','SPECIALIST','INSPECTOR']);
  assert.deepEqual(enumValues(sql, 'assignment_status'), ['ASSIGNED','ACCEPTED','DECLINED','RELEASED']);
  assert.deepEqual(enumValues(sql, 'inspection_template_status'), ['ACTIVE','RETIRED']);
  assert.deepEqual(enumValues(sql, 'inspection_template_version_status'), ['DRAFT','REVIEW','PUBLISHED','RETIRED']);
  assert.deepEqual(enumValues(sql, 'inspection_answer_type'), ['PASS_FAIL','YES_NO','NUMBER','TEXT','READING','PHOTO','VIDEO','MULTI_SELECT','SIGNATURE']);
  assert.deepEqual(enumValues(sql, 'inspection_status'), ['DRAFT','IN_PROGRESS','COMPLETED','VOIDED']);
  assert.deepEqual(enumValues(sql, 'inspection_answer_result'), ['PASS','FAIL','RECORDED','NOT_APPLICABLE']);
  assert.deepEqual(enumValues(sql, 'finding_classification_status'), ['DRAFT','ACTIVE','RETIRED']);
  assert.deepEqual(enumValues(sql, 'finding_type'), ['OBSERVATION','FAULT','VIOLATION','RECOMMENDATION']);
  assert.deepEqual(enumValues(sql, 'finding_severity'), ['LOW','MEDIUM','HIGH','CRITICAL']);
  assert.deepEqual(enumValues(sql, 'finding_status'), ['OPEN','ACKNOWLEDGED','PROPOSAL_PENDING','APPROVAL_PENDING','APPROVED_FOR_ACTION','IN_PROGRESS','RESOLVED','VERIFIED','ACCEPTED_RISK','CLOSED','VOIDED']);
});