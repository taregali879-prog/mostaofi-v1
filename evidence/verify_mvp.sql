-- Run after the full E2E scenario. Replace :project_id with the generated UUID.
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
