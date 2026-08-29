# MVP Sprint Execution
Current Test Ready certification requires a network-enabled CI run: install -> Prisma generate -> PostgreSQL migration -> seed -> build -> HTTP E2E.

S1–S3 baseline already exists.
S4: Approved BOQ -> Material Requirement -> RFQ -> Supplier Quotations.
S5: Comparison -> Award -> Purchase Order.
S6: Delivery -> Inspection -> Goods Receipt. Only accepted quantity enters inventory.
S7: append-only InventoryMovement ledger -> Allocation -> Issue -> Return.
S8: Material KPIs + full E2E + UAT.

MVP Exit E2E:
Login -> Contractor -> Project -> Approved BOQ -> Requirement -> RFQ -> Quote -> Award -> PO -> Delivery -> Inspection -> Inventory -> Project Allocation -> KPI Dashboard -> Audit.
