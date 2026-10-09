import {DocumentsService} from '../src/documents/documents.service';
describe('document JSON response',()=>{
 it('serializes exact BigInt file sizes in detail and list',async()=>{
 const document={id:'document',status:'UPLOADED',versions:[{sizeBytes:9007199254740993n,sha256:'a'.repeat(64)}]};
 const db:any={project:{findFirst:async()=>({id:'project'})},document:{findFirst:async()=>document,findMany:async()=>[document]}};
 const service=new DocumentsService(db,{} as any,{} as any);
 const detail=await service.get({org:'org'},'document');const list=await service.list({org:'org'},'project');
 expect(detail.versions[0].sizeBytes).toBe('9007199254740993');expect(()=>JSON.stringify(detail)).not.toThrow();expect(JSON.parse(JSON.stringify(list))[0].versions[0].sizeBytes).toBe('9007199254740993');expect(document.versions[0].sizeBytes).toBe(9007199254740993n);
 });
 it('keeps inaccessible documents hidden',async()=>{const service=new DocumentsService({document:{findFirst:async()=>null}} as any,{} as any,{} as any);await expect(service.get({org:'other'},'document')).rejects.toThrow('DOCUMENT_NOT_FOUND')});
});
