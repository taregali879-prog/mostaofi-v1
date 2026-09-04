\set ON_ERROR_STOP on

SELECT id AS project_id
FROM projects
WHERE name='MVP Pilot Fire Project'
ORDER BY created_at DESC
LIMIT 1
\gset

\if :{?project_id}
\else
  \echo 'FAIL no MVP pilot project found'
  \quit 20
\endif

SELECT id,email,created_at FROM users WHERE email='admin@partner.local';
SELECT id,user_id,organization_id,revoked_at,expires_at FROM auth_sessions ORDER BY created_at DESC LIMIT 5;
SELECT id,organization_id,name,status FROM projects WHERE id=:'project_id';
SELECT b.id,b.status,b.current_version,v.version,v.status,v.approved_at
FROM boqs b JOIN boq_versions v ON v.boq_id=b.id WHERE b.project_id=:'project_id' ORDER BY v.version;
SELECT mr.id,mr.status,mr.boq_version_id,mri.boq_item_id,mri.quantity
FROM material_requirements mr JOIN material_requirement_items mri ON mri.material_requirement_id=mr.id WHERE mr.project_id=:'project_id';
SELECT r.id,r.status,q.id quote_id,q.status quote_status,q.supplier_id
FROM rfqs r LEFT JOIN supplier_quotes q ON q.rfq_id=r.id WHERE r.project_id=:'project_id';
SELECT po.id,po.po_number,po.status,poi.boq_item_id,poi.quantity,poi.unit_price
FROM purchase_orders po JOIN purchase_order_items poi ON poi.purchase_order_id=po.id WHERE po.project_id=:'project_id';
SELECT d.id,d.delivery_number,d.status,d.received_at,di.arrived_qty,di.accepted_qty,di.rejected_qty,di.damaged_qty
FROM deliveries d JOIN delivery_items di ON di.delivery_id=d.id WHERE d.project_id=:'project_id';
SELECT movement_type,boq_item_id,quantity,unit_cost,reference_type,reference_id,occurred_at
FROM inventory_movements WHERE project_id=:'project_id' ORDER BY occurred_at;
SELECT event,entity_type,entity_id,occurred_at,metadata FROM audit_events
WHERE entity_type='project' AND entity_id=:'project_id' ORDER BY occurred_at;

DO $$
DECLARE p uuid; n int;
BEGIN
 SELECT id INTO p FROM projects WHERE name='MVP Pilot Fire Project' ORDER BY created_at DESC LIMIT 1;
 IF p IS NULL THEN RAISE EXCEPTION 'MVP project missing'; END IF;
 SELECT count(*) INTO n FROM boqs WHERE project_id=p AND status='APPROVED'; IF n<1 THEN RAISE EXCEPTION 'approved BOQ missing'; END IF;
 SELECT count(*) INTO n FROM rfqs WHERE project_id=p AND status='AWARDED'; IF n<1 THEN RAISE EXCEPTION 'awarded RFQ missing'; END IF;
 SELECT count(*) INTO n FROM purchase_orders WHERE project_id=p AND status IN ('APPROVED','PARTIALLY_DELIVERED','FULLY_DELIVERED','CLOSED'); IF n<1 THEN RAISE EXCEPTION 'approved PO missing'; END IF;
 SELECT count(*) INTO n FROM deliveries WHERE project_id=p AND status IN ('PARTIALLY_ACCEPTED','ACCEPTED'); IF n<1 THEN RAISE EXCEPTION 'accepted delivery missing'; END IF;
 SELECT count(*) INTO n FROM inventory_movements WHERE project_id=p AND movement_type='PURCHASE_RECEIPT'; IF n<1 THEN RAISE EXCEPTION 'inventory receipt missing'; END IF;
 SELECT count(*) INTO n FROM audit_events WHERE entity_type='project' AND entity_id=p; IF n<10 THEN RAISE EXCEPTION 'insufficient audit events: %',n; END IF;
END $$;

\echo 'SQL_VERIFICATION=PASS project=' :project_id
