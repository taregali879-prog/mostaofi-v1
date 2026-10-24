import { InventoryService } from '../src/inventory/inventory.service';
import { DeliveryService } from '../src/delivery/delivery.service';
import { BoqService } from '../src/boq/boq.service';

// These tests exercise service validation with only database I/O stubbed out.
describe('Reject malformed quantities before persistence', () => {
  const ctx={org:'org',sub:'user'};
  let db:any, audit:any;
  beforeEach(() => {
    db={project:{findFirst:jest.fn().mockResolvedValue({id:'project'})},
      warehouse:{findFirst:jest.fn().mockResolvedValue({id:'warehouse'})},
      inventoryMovement:{findMany:jest.fn().mockResolvedValue([]),create:jest.fn().mockResolvedValue({id:'movement'})},
      boq:{findFirst:jest.fn().mockResolvedValue({projectId:'project',versions:[{id:'version',version:1,status:'DRAFT'}]})},
      boqItem:{create:jest.fn().mockResolvedValue({id:'item'})},
      purchaseOrder:{findFirst:jest.fn().mockResolvedValue({id:'po',status:'APPROVED',projectId:'project',items:[{id:'po-item',quantity:10}]})},
      delivery:{create:jest.fn().mockResolvedValue({id:'delivery'})},
    };
    audit={append:jest.fn()};
  });
  for(const quantity of ['invalid','Infinity','NaN',null,true,{},[],0,-1]) {
    it(`rejects allocation quantity ${JSON.stringify(quantity)} with HTTP 400`,async()=>{
      await expect(new InventoryService(db,audit).allocate(ctx,'project',{warehouseId:'warehouse',boqItemId:'item',quantity})).rejects.toMatchObject({status:400});
      expect(db.inventoryMovement.create).not.toHaveBeenCalled();
    });
  }
  it('rejects non-numeric BOQ quantity with HTTP 400',async()=>{
    await expect(new BoqService(db,audit).addItem(ctx,'boq',1,{lineNo:1,description:'Sprinkler',unit:'EA',quantity:'bad'})).rejects.toMatchObject({status:400});
    expect(db.boqItem.create).not.toHaveBeenCalled();
  });
  it('rejects non-numeric delivered quantity with HTTP 400',async()=>{
    await expect(new DeliveryService(db,audit).create(ctx,'po',{items:[{purchaseOrderItemId:'po-item',arrivedQty:'bad'}]})).rejects.toMatchObject({status:400});
    expect(db.delivery.create).not.toHaveBeenCalled();
  });
  it('rejects duplicate purchase order lines in a delivery',async()=>{
    await expect(new DeliveryService(db,audit).create(ctx,'po',{items:[{purchaseOrderItemId:'po-item',arrivedQty:6},{purchaseOrderItemId:'po-item',arrivedQty:6}]})).rejects.toMatchObject({status:400});
    expect(db.delivery.create).not.toHaveBeenCalled();
  });
});
