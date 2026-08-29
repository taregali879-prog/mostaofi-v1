#!/usr/bin/env bash
set -euo pipefail
API=${API:-http://localhost:4000/api/v1}
EMAIL=${EMAIL:-admin@partner.local}
PASSWORD=${PASSWORD:-ChangeMe123!}
WAREHOUSE=${WAREHOUSE:-01900000-0000-7000-8000-000000000301}
SUPPLIER=${SUPPLIER:-01900000-0000-7000-8000-000000000401}
jqget(){ jq -r "$1"; }
AUTH=$(curl -fsS -X POST "$API/auth/login" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$AUTH"|jqget '.accessToken'); H=(-H "Authorization: Bearer $TOKEN" -H 'content-type: application/json')
PROJECT=$(curl -fsS -X POST "$API/projects" "${H[@]}" -d '{"name":"Pilot Fire Project","clientName":"Pilot Client","city":"جازان","scope":"Fire systems"}'); PROJECT_ID=$(echo "$PROJECT"|jqget '.id')
BOQ=$(curl -fsS -X POST "$API/projects/$PROJECT_ID/boqs" "${H[@]}" -d '{"title":"Pilot BOQ"}'); BOQ_ID=$(echo "$BOQ"|jqget '.id')
ITEM=$(curl -fsS -X POST "$API/boqs/$BOQ_ID/versions/1/items" "${H[@]}" -d '{"lineNo":1,"description":"Fire sprinkler","unit":"EA","quantity":10,"unitPrice":25}'); ITEM_ID=$(echo "$ITEM"|jqget '.id')
curl -fsS -X POST "$API/boqs/$BOQ_ID/versions/1/submit" "${H[@]}" -d '{}' >/dev/null
curl -fsS -X POST "$API/boqs/$BOQ_ID/versions/1/approve" "${H[@]}" -d '{}' >/dev/null
MR=$(curl -fsS -X POST "$API/projects/$PROJECT_ID/material-requirements" "${H[@]}" -d "{\"boqId\":\"$BOQ_ID\",\"version\":1,\"items\":[{\"boqItemId\":\"$ITEM_ID\",\"quantity\":10}]}"); MR_ID=$(echo "$MR"|jqget '.id')
curl -fsS -X POST "$API/material-requirements/$MR_ID/submit" "${H[@]}" -d '{}' >/dev/null
curl -fsS -X POST "$API/material-requirements/$MR_ID/approve" "${H[@]}" -d '{}' >/dev/null
RFQ=$(curl -fsS -X POST "$API/material-requirements/$MR_ID/rfqs" "${H[@]}" -d '{}'); RFQ_ID=$(echo "$RFQ"|jqget '.id')
curl -fsS -X POST "$API/rfqs/$RFQ_ID/issue" "${H[@]}" -d '{}' >/dev/null
QUOTE=$(curl -fsS -X POST "$API/rfqs/$RFQ_ID/quotes" "${H[@]}" -d "{\"supplierId\":\"$SUPPLIER\",\"leadTimeDays\":2,\"paymentTerms\":\"30 days\",\"items\":[{\"boqItemId\":\"$ITEM_ID\",\"quantity\":10,\"unitPrice\":20,\"availableQty\":10}]}"); QUOTE_ID=$(echo "$QUOTE"|jqget '.id')
curl -fsS -X POST "$API/supplier-quotes/$QUOTE_ID/submit" "${H[@]}" -d '{}' >/dev/null
curl -fsS -X POST "$API/rfqs/$RFQ_ID/award" "${H[@]}" -d "{\"quoteId\":\"$QUOTE_ID\"}" >/dev/null
PO=$(curl -fsS -X POST "$API/rfqs/$RFQ_ID/purchase-orders" "${H[@]}" -d "{\"poNumber\":\"PO-PILOT-$(date +%s)\"}"); PO_ID=$(echo "$PO"|jqget '.id'); PO_ITEM_ID=$(echo "$PO"|jqget '.items[0].id')
curl -fsS -X POST "$API/purchase-orders/$PO_ID/approve" "${H[@]}" -d '{}' >/dev/null
DEL=$(curl -fsS -X POST "$API/purchase-orders/$PO_ID/deliveries" "${H[@]}" -d "{\"deliveryNumber\":\"DEL-PILOT-$(date +%s)\",\"items\":[{\"purchaseOrderItemId\":\"$PO_ITEM_ID\",\"arrivedQty\":8}]}"); DEL_ID=$(echo "$DEL"|jqget '.id'); DEL_ITEM_ID=$(echo "$DEL"|jqget '.items[0].id')
curl -fsS -X POST "$API/deliveries/$DEL_ID/arrive" "${H[@]}" -d '{}' >/dev/null
curl -fsS -X POST "$API/deliveries/$DEL_ID/inspect" "${H[@]}" -d "{\"items\":[{\"deliveryItemId\":\"$DEL_ITEM_ID\",\"acceptedQty\":7,\"rejectedQty\":1,\"damagedQty\":0}]}" >/dev/null
curl -fsS -X POST "$API/deliveries/$DEL_ID/receive" "${H[@]}" -d "{\"warehouseId\":\"$WAREHOUSE\"}" >/dev/null
curl -fsS -X POST "$API/projects/$PROJECT_ID/materials/allocate" "${H[@]}" -d "{\"warehouseId\":\"$WAREHOUSE\",\"boqItemId\":\"$ITEM_ID\",\"quantity\":5}" >/dev/null
KPI=$(curl -fsS "$API/projects/$PROJECT_ID/materials/kpis" "${H[@]}"); AUDIT=$(curl -fsS "$API/projects/$PROJECT_ID/activity" "${H[@]}")
echo "PROJECT_ID=$PROJECT_ID"
echo "$KPI" | jq .
echo "$AUDIT" | jq 'map(.event)'
