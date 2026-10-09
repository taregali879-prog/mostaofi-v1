'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../../../lib/api';
import { parseAsciiDxf } from '../../../../../lib/hydraulics-dxf';

type Document = {id:string;title:string;status:string;versions:{id:string;version:number;fileName:string;sha256:string;mimeType:string}[]};
type Row = {id:string;layer:string;kind:string;lengthM:number;equivalentLengthM:number;flowGpm:number;insideDiameterMm:number;cFactor:number;included:boolean};
type Calculation = {id:string;title:string;currentVersion:number;versions:{id:string;version:number;createdAt:string;documentVersionId:string;result?:any}[]};
const initial:Row={id:'MANUAL-1',layer:'MANUAL',kind:'LINE',lengthM:10,equivalentLengthM:0,flowGpm:500,insideDiameterMm:150,cFactor:120,included:true};
const statusText='حسابات أولية – غير معتمد للتنفيذ';
export default function HydraulicsProjectPage(){
  const params=useParams<{id:string}>();
  const projectId=params.id;
  const [docs,setDocs]=useState<Document[]>([]);
  const [drawingFile,setDrawingFile]=useState<File|null>(null);
  const [drawingTitle,setDrawingTitle]=useState('مخطط مكافحة الحريق');
  const [calculations,setCalculations]=useState<Calculation[]>([]);
  const [documentVersionId,setDocumentVersionId]=useState('');
  const [selectedCalculation,setSelectedCalculation]=useState('');
  const [title,setTitle]=useState('الحساب الهيدروليكي للمسار المحدد');
  const [rows,setRows]=useState<Row[]>([{...initial}]);
  const [residualPressurePsi,setResidualPressurePsi]=useState(12);
  const [designFlowGpm,setDesignFlowGpm]=useState(500);
  const [elevationRiseM,setElevationRiseM]=useState(0);
  const [usePump,setUsePump]=useState(false);
  const [ratedFlowGpm,setRatedFlowGpm]=useState(500);
  const [shutoffPsi,setShutoffPsi]=useState(95);
  const [ratedPsi,setRatedPsi]=useState(80);
  const [at150Psi,setAt150Psi]=useState(55);
  const [inletPsi,setInletPsi]=useState(0);
  const [unitOverride,setUnitOverride]=useState('');
  const [fileHash,setFileHash]=useState('');
  const [extracted,setExtracted]=useState(false);
  const [warnings,setWarnings]=useState<string[]>([]);
  const [result,setResult]=useState<any>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const allVersions=useMemo(()=>docs.flatMap(d=>d.versions.map(v=>({...v,documentTitle:d.title,status:d.status}))),[docs]);
  const selectedDoc=allVersions.find(v=>v.id===documentVersionId);
  const refresh=useCallback(async()=>{
    const [d,c]=await Promise.all([
      apiFetch<Document[]>(`/projects/${projectId}/documents`),
      apiFetch<Calculation[]>(`/projects/${projectId}/hydraulics`),
    ]);
    setDocs(d);setCalculations(c);
  },[projectId]);
  useEffect(()=>{
    let alive=true;
    Promise.all([
      apiFetch<Document[]>(`/projects/${projectId}/documents`),
      apiFetch<Calculation[]>(`/projects/${projectId}/hydraulics`),
    ]).then(([d,c])=>{if(alive){setDocs(d);setCalculations(c);}})
      .catch(e=>{if(alive)setMessage(e.message??'فشل جلب بيانات المشروع');});
    return ()=>{alive=false};
  },[projectId]);
  function updateRow(index:number, patch:Partial<Row>){
    setRows(prev=>prev.map((r,i)=>i===index?{...r,...patch}:r));
  }
  function addManual(){
    setRows(prev=>[...prev,{...initial,id:`MANUAL-${Date.now()}`,layer:'MANUAL',kind:'LINE'}]);
  }
  async function uploadDrawing(){
    if(!drawingFile){setMessage('اختر ملف DXF أو PDF أولًا');return;}
    if(!/\\.(dxf|pdf)$/i.test(drawingFile.name) || drawingFile.size<=0 || drawingFile.size>15*1024*1024){
      setMessage('الصيغ المسموحة DXF/PDF بحجم لا يتجاوز 15MB');return;
    }
    setBusy(true);setMessage('');
    try{
      const mimeType=drawingFile.name.toLowerCase().endsWith('.pdf')?'application/pdf':'application/dxf';
      const intent=await apiFetch<{documentId:string;version:number;uploadUrl:string;headers:Record<string,string>}>(
        `/projects/${projectId}/documents/upload-intent`,{
          method:'POST',body:JSON.stringify({fileName:drawingFile.name,mimeType,sizeBytes:drawingFile.size,
            type:'FIRE_DRAWING',title:drawingTitle.trim()||drawingFile.name})
        });
      const put=await fetch(intent.uploadUrl,{method:'PUT',headers:intent.headers,body:drawingFile});
      if(!put.ok)throw new Error(`فشل الرفع إلى مخزن الملفات: HTTP ${put.status}`);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await drawingFile.arrayBuffer())),
        x=>x.toString(16).padStart(2,'0')).join('');
      await apiFetch(`/documents/${intent.documentId}/complete`,{
        method:'POST',body:JSON.stringify({version:intent.version,sha256:hash})
      });
      await refresh();
      setMessage('رُفع المخطط وربط بإصدار موثق. اختر إصداره من القائمة.');
    }catch(e:any){setMessage(e.message??'تعذر رفع المخطط');}
    finally{setBusy(false);}
  }
  async function importDxf(file:File|null){
    setWarnings([]);setExtracted(false);setFileHash('');
    if(!file)return;
    if(!selectedDoc){setMessage('اختر إصدار المخطط المسجل في المشروع أولًا');return;}
    if(file.size>15*1024*1024){setMessage('ملف DXF أكبر من 15MB؛ استخدم حصرًا مدققًا أو ملفًا أصغر');return;}
    setBusy(true);setMessage('');
    try{
      const bytes=await file.arrayBuffer();
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      if(hash.toLowerCase()!==selectedDoc.sha256.toLowerCase())throw new Error('بصمة DXF لا تطابق إصدار المخطط المختار بالمشروع');
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const unitM=unitOverride===''?undefined:Number(unitOverride);
      const parsed=parseAsciiDxf(text,unitM);
      if(parsed.segments.length===0)throw new Error('لم تُعثر على أنابيب LINE/LWPOLYLINE في طبقات FIRE؛ لا توجد قياسات افتراضية');
      setRows(parsed.segments.map(s=>({...s,equivalentLengthM:0,flowGpm:designFlowGpm,insideDiameterMm:150,cFactor:120,included:false})));
      setWarnings([...parsed.warnings,'حدّد فقط المقاطع المتصلة فعليًا بالمسار المراد دراسته؛ لا يُحدد المسار الحرج آليًا.']);
      setExtracted(true);setFileHash(hash);
      setMessage(`استخراج ${parsed.segments.length} مقطع من الملف المطابق لبصمة المخطط. وحدات الرسم: ${parsed.unitCode??'غير محددة'}`);
    }catch(e:any){setMessage(e.message??'تعذر تحليل DXF');}
    finally{setBusy(false);}
  }
  async function save(){
    setMessage('');
    if(!selectedDoc){setMessage('يجب اختيار مخطط محفوظ ونسخة موثقة');return;}
    if(!['UPLOADED','APPROVED'].includes(selectedDoc.status)){setMessage('المخطط غير مكتمل الرفع');return;}
    const segments=rows.filter(r=>r.included).map(({id,lengthM,equivalentLengthM,flowGpm,insideDiameterMm,cFactor})=>({id,lengthM,equivalentLengthM,flowGpm,insideDiameterMm,cFactor}));
    if(segments.length<1){setMessage('اختر مقطعًا واحدًا على الأقل');return;}
    if(extracted && fileHash.toLowerCase()!==selectedDoc.sha256.toLowerCase()){setMessage('لم تتم مطابقة بصمة مخطط CAD');return;}
    const input={
      segments,designFlowGpm,residualPressurePsi,elevationRiseM,
      extractionMethod:extracted?'DXF_ASSISTED':'MANUAL_PATH',
      ...(usePump?{pump:{ratedFlowGpm,shutoffPsi,ratedPsi,at150Psi,inletPsi}}:{}),
    };
    const payload={title,documentVersionId,sourceSha256:selectedDoc.sha256,input};
    setBusy(true);
    try{
      if(selectedCalculation){
        const version=await apiFetch<{result:any;version:number}>(`/hydraulics/${selectedCalculation}/versions`,{method:'POST',body:JSON.stringify(payload)});
        setResult(version.result);setMessage(`حُفظ الإصدار ${version.version} من الحساب؛ الحالة: أولي`);
      }else{
        const calculation=await apiFetch<Calculation>(`/projects/${projectId}/hydraulics`,{method:'POST',body:JSON.stringify(payload)});
        setSelectedCalculation(calculation.id);
        setResult(calculation.versions[0]?.result);setMessage('حُفظ الإصدار الأول من الحساب؛ الحالة: أولي');
      }
      await refresh();
    }catch(e:any){setMessage(e.message??'فشل الحفظ');}
    finally{setBusy(false);}
  }
  async function openCalculation(id:string){
    setBusy(true);setMessage('');
    try{
      const c=await apiFetch<Calculation>(`/hydraulics/${id}`);
      setSelectedCalculation(id);setTitle(c.title);
      const version=c.versions[0];
      setResult(version?.result??null);
      setMessage(`عرض أحدث إصدار محفوظ: ${version?.version??0}. للتحرير استخدم إدخالات جديدة وسيُحفظ إصدار مستقل.`);
    }catch(e:any){setMessage(e.message??'تعذر الاسترجاع');}
    finally{setBusy(false);}
  }
  const numberField=(label:string,value:number,onChange:(n:number)=>void,min?:number)=>
    <label style={{display:'block'}}>{label}<input className="field" type="number" step="any" min={min} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
  return <div dir="rtl">
    <p className="muted"><Link href={`/projects/${projectId}`}>المشروع</Link> / الهندسة والتصميم / الحسابات الهيدروليكية</p>
    <h1>الحسابات الهيدروليكية لأنظمة مكافحة الحريق</h1>
    <div className="card" style={{borderColor:'#b91c1c',background:'#fff7ed'}}><strong>{statusText}</strong><p>تقرير استرشادي للمسار المختار؛ لا يعتمد شبكة متفرعة أو أجهزة بدون مراجعة هندسية وتحليل كامل.</p></div>
    {message&&<p role="status" className="card">{message}</p>}
    <div className="card"><h2>1. ربط الحساب بالمشروع وإصدار المخطط</h2>
      <details><summary>رفع مخطط جديد إلى مستندات المشروع</summary>
        <label>عنوان المخطط<input className="field" value={drawingTitle} onChange={e=>setDrawingTitle(e.target.value)}/></label>
        <input type="file" accept=".dxf,.pdf" onChange={e=>setDrawingFile(e.target.files?.[0]??null)}/>
        <p className="muted">يتطلب الرفع تهيئة S3 وCORS الصالحة؛ لن تُحفظ البصمة قبل اكتمال النقل.</p>
        <button className="btn" type="button" disabled={busy||!drawingFile} onClick={()=>void uploadDrawing()}>رفع المخطط وحفظه</button>
      </details>
      <label>المخطط المحفوظ في المشروع
        <select className="field" value={documentVersionId} onChange={e=>{setDocumentVersionId(e.target.value);setExtracted(false);setFileHash('');setRows([{...initial}]);setWarnings([]);}}>
          <option value="">اختر إصدار مستند</option>
          {allVersions.map(v=><option key={v.id} value={v.id}>{v.documentTitle} / {v.fileName} / V{v.version} / {v.status}</option>)}
        </select>
      </label>
      {selectedDoc&&<p className="muted">SHA-256: <code style={{wordBreak:'break-all'}}>{selectedDoc.sha256}</code></p>}
      {allVersions.length===0&&<p>لا توجد مخططات محفوظة لهذا المشروع. ارفع المخطط عبر وحدة المستندات أولًا.</p>}
      <label>اسم الدراسة<input className="field" value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>الحساب الحالي
        <select className="field" value={selectedCalculation} onChange={e=>setSelectedCalculation(e.target.value)}>
          <option value="">إنشاء حساب جديد</option>
          {calculations.map(c=><option key={c.id} value={c.id}>{c.title} (V{c.currentVersion})</option>)}
        </select>
      </label>
    </div>
    <div className="card"><h2>2. حصر المقاطع من DXF (اختياري)</h2>
      <p>يدعم ASCII DXF وطبقات FIRE/SPRINKLER/FF/HYDRANT: LINE وLWPOLYLINE. يجب اختيار ملف مطابق لإصدار المستند المرجعي. DWG وPDF غير قابلين للاستخراج بهذه الأداة.</p>
      <label>وحدة الرسم إذا كانت $INSUNITS غير محددة
        <select className="field" value={unitOverride} onChange={e=>setUnitOverride(e.target.value)}>
          <option value="">تحديد تلقائي من DXF فقط</option>
          <option value="0.001">ملليمتر</option><option value="0.01">سنتيمتر</option>
          <option value="1">متر</option><option value="0.0254">بوصة</option><option value="0.3048">قدم</option>
        </select>
      </label>
      <input type="file" accept=".dxf" onChange={e=>{void importDxf(e.target.files?.[0]??null);}}/>
      {warnings.map((w,i)=><p key={i} className="muted">{w}</p>)}
      <p className="muted">يمكن إدخال مسار مدقق يدويًا. المقاطع المستخرجة تبدأ غير مختارة لمنع افتراض الاتصال.</p>
    </div>
    <div className="card"><h2>3. المسار الهيدروليكي بعد المراجعة</h2>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>ضمن المسار</th><th>المقطع / الطبقة</th><th>طول م</th><th>مكافئ م</th><th>GPM</th><th>القطر الداخلي مم</th><th>C</th><th></th></tr></thead>
        <tbody>{rows.map((r,i)=><tr key={r.id}>
          <td><input aria-label={`تحديد ${r.id}`} type="checkbox" checked={r.included} onChange={e=>updateRow(i,{included:e.target.checked})}/></td>
          <td><small>{r.id} ({r.layer})</small></td>
          {(['lengthM','equivalentLengthM','flowGpm','insideDiameterMm','cFactor'] as const).map(field=>
            <td key={field}><input style={{width:90}} type="number" step="any" value={r[field]} onChange={e=>updateRow(i,{[field]:Number(e.target.value)})}/></td>)}
          <td><button type="button" onClick={()=>setRows(prev=>prev.filter((_,j)=>j!==i))}>حذف</button></td>
        </tr>)}</tbody></table></div>
      <button type="button" className="btn" onClick={addManual}>إضافة مقطع يدوي</button>
      <div className="grid">
        {numberField('التدفق التصميمي GPM',designFlowGpm,setDesignFlowGpm,0)}
        {numberField('الضغط المطلوب عند نقطة الإطفاء PSI',residualPressurePsi,setResidualPressurePsi,0)}
        {numberField('فرق الارتفاع من مصدر التغذية م',elevationRiseM,setElevationRiseM)}
      </div>
    </div>
    <div className="card"><h2>4. منحنى مضخة المصنع (اختياري)</h2>
      <label><input type="checkbox" checked={usePump} onChange={e=>setUsePump(e.target.checked)}/> أرفق بيانات منحنى المصنع لأغراض المقارنة الاسترشادية</label>
      {usePump&&<div className="grid">
        {numberField('Rated Flow GPM',ratedFlowGpm,setRatedFlowGpm,0)}
        {numberField('Shutoff PSI',shutoffPsi,setShutoffPsi,0)}
        {numberField('Rated PSI',ratedPsi,setRatedPsi,0)}
        {numberField('150% Flow PSI',at150Psi,setAt150Psi,0)}
        {numberField('Pump Inlet PSI',inletPsi,setInletPsi)}
      </div>}
    </div>
    <button className="btn" type="button" disabled={busy||!selectedDoc} onClick={()=>{void save()}}>{busy?'جارٍ المعالجة...':selectedCalculation?'حفظ إصدار جديد':'حفظ الحساب الأولي'}</button>
    {result&&<div className="card">
      <h2>ملخص نتيجة الحساب المحفوظة</h2>
      <p><strong>فقد الاحتكاك:</strong> {result.frictionLossPsi} PSI</p>
      <p><strong>فقد الارتفاع:</strong> {result.elevationLossPsi} PSI</p>
      <p><strong>الضغط التقديري المطلوب:</strong> {result.requiredPressurePsi} PSI</p>
      {result.pumpCheck&&<><p><strong>فحص النقطة 150%:</strong> {result.pumpCheck.heuristic150FlowLimit?'ضمن الحد الإرشادي':'خارج الحد الإرشادي'}</p><p><strong>هامش المضخة:</strong> {result.pumpCheck.marginPsi??'خارج نطاق بيانات المنحنى'} PSI</p></>}
      <p className="muted">{result.disclaimer}</p>
    </div>}
    <div className="card"><h2>5. الحسابات والإصدارات المحفوظة للمشروع</h2>
      {calculations.length===0?<p className="muted">لا توجد حسابات محفوظة حتى الآن.</p>:calculations.map(c=>
        <div key={c.id} style={{padding:12,borderBottom:'1px solid #ddd'}}>
          <strong>{c.title}</strong> — الإصدار V{c.currentVersion} <button type="button" className="btn" onClick={()=>{void openCalculation(c.id)}}>عرض المحفوظ</button>
          <p className="muted">{c.versions.map(v=>`V${v.version} (${new Date(v.createdAt).toLocaleDateString('ar-SA')})`).join(' · ')}</p>
        </div>)}
    </div>
  </div>;
}
