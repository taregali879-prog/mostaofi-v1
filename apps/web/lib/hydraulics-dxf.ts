// Conservative browser-side ASCII DXF takeoff helper.
// Supported: 2D LINE and LWPOLYLINE with bulge. Other entities are reported, not guessed.
export type CadSegment = {
  id: string;
  layer: string;
  kind: 'LINE' | 'POLY_SEG' | 'ARC_SEG';
  lengthM: number;
};
type Group = {code:number;value:string};
const num = (s:string) => Number(s.trim());
export function arcLength(a: [number,number], b: [number,number], bulge:number) {
  const chord=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if (!Number.isFinite(bulge) || Math.abs(bulge)<1e-10) return chord;
  const theta=4*Math.atan(Math.abs(bulge));
  const sin=Math.sin(theta/2);
  if (Math.abs(sin)<1e-12) throw new Error('INVALID_DXF_ARC');
  return chord*theta/(2*Math.abs(sin));
}
const units:Record<number,number>={1:0.0254,2:0.3048,4:0.001,5:0.01,6:1};
export function parseAsciiDxf(text:string, overrideUnitM?:number):{
 segments:CadSegment[];unitCode:number|null;unitScale:number;warnings:string[];
} {
  if (text.includes('\u0000')) throw new Error('BINARY_DXF_NOT_SUPPORTED');
  const lines=text.replace(/\r/g,'').split('\n');
  if (lines.length<10 || lines.length>3_000_000) throw new Error('INVALID_DXF_SIZE');
  const groups:Group[]=[];
  for (let i=0;i+1<lines.length;i+=2) {
    const code=Number(lines[i].trim());
    if (!Number.isInteger(code)) throw new Error('INVALID_DXF_GROUPS');
    groups.push({code,value:lines[i+1].trim()});
  }
  let unitCode:number|null=null;
  for (let i=0;i<groups.length-1;i++) {
    if(groups[i].code===9 && groups[i].value==='$INSUNITS') {
      for(let j=i+1;j<Math.min(groups.length,i+6);j++) {
        if(groups[j].code===70){unitCode=num(groups[j].value);break;}
      }
    }
  }
  const scale=overrideUnitM??(unitCode===null?undefined:units[unitCode]);
  if(typeof scale!=='number' || !Number.isFinite(scale) || scale<=0 || scale>10) {
    throw new Error('DXF_UNITS_UNKNOWN_SELECT_MANUAL_SCALE');
  }
  const segments:CadSegment[]=[];
  const warnings:string[]=[];
  let section='',inEntities=false,idx=0,unsupported=0;
  const add=(layer:string,kind:CadSegment['kind'],length:number)=>{
    if (length<=0 || !Number.isFinite(length)) return;
    if (!/FIRE|SPRINKLER|FF|HYDRANT/i.test(layer)) return;
    segments.push({id:`CAD-${++idx}`,layer,kind,lengthM:Math.round(length*scale*1000)/1000});
    if(idx>10000)throw new Error('DXF_TOO_MANY_SEGMENTS');
  };
  for(let i=0;i<groups.length;) {
    const g=groups[i];
    if (g.code!==0) {i++;continue;}
    const entity=g.value;
    let j=i+1;
    while(j<groups.length && groups[j].code!==0)j++;
    const block=groups.slice(i+1,j);
    if(entity==='SECTION'){
      section=block.find(x=>x.code===2)?.value??'';
      inEntities=section==='ENTITIES';
    } else if(entity==='ENDSEC'){section='';inEntities=false;}
    else if(inEntities && (entity==='LINE'||entity==='LWPOLYLINE')) {
      const layer=block.find(x=>x.code===8)?.value??'0';
      if(entity==='LINE') {
        const get=(c:number)=>num(block.find(x=>x.code===c)?.value??'NaN');
        const a:[number,number]=[get(10),get(20)],b:[number,number]=[get(11),get(21)];
        if([...a,...b].every(Number.isFinite)) add(layer,'LINE',Math.hypot(b[0]-a[0],b[1]-a[1]));
        else warnings.push('Invalid LINE coordinates skipped');
      } else {
        const points:{x:number;y:number;bulge:number}[]=[];
        let current:{x:number;y:number;bulge:number}|null=null;
        for(const g2 of block) {
          if(g2.code===10) {
            current={x:num(g2.value),y:NaN,bulge:0};points.push(current);
          } else if(g2.code===20 && current)current.y=num(g2.value);
          else if(g2.code===42 && current)current.bulge=num(g2.value);
        }
        const closed=(num(block.find(x=>x.code===70)?.value??'0')&1)!==0;
        const count=closed?points.length:points.length-1;
        for(let k=0;k<count;k++) {
          const a=points[k],b=points[(k+1)%points.length];
          if(!a||!b||![a.x,a.y,b.x,b.y,a.bulge].every(Number.isFinite)){
            warnings.push('Invalid LWPOLYLINE vertex skipped');continue;
          }
          const len=arcLength([a.x,a.y],[b.x,b.y],a.bulge);
          add(layer,Math.abs(a.bulge)>1e-10?'ARC_SEG':'POLY_SEG',len);
        }
      }
    } else if(inEntities && entity!=='ENDSEC' && entity!=='EOF'){
      unsupported++;
    }
    i=j;
  }
  if(unsupported)warnings.push(`${unsupported} unsupported DXF entities not included in takeoff`);
  if(segments.length===0)warnings.push('No supported FIRE-layer pipe segments found');
  return {segments,unitCode,unitScale:scale,warnings};
}
