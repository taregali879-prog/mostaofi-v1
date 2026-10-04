'use client';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useEffect,useState} from 'react';
import {ApiError,apiFetch} from '../../../lib/api';

type WorkOrder={id:string;workOrderNumber:string;status:string;priority:string;contractId:string;visitId:string;siteId:string;serviceType:string;scheduledStart:string};
type Assignment={id:string;technicianId:string;role:string;status:string};
type Inspection={id:string;status:string;templateVersionId:string;performedBy:string};
type Finding={id:string;title:string;severity:string;status:string;inspectionId:string};

export default function WorkOrderDetail(){
 const {id}=useParams<{id:string}>();const [wo,setWo]=useState<WorkOrder|null>(null),[assignments,setAssignments]=useState<Assignment[]>([]),[inspections,setInspections]=useState<Inspection[]>([]),[findings,setFindings]=useState<Finding[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{if(!id)return;let live=true;(async()=>{try{const order=await apiFetch<WorkOrder>(`/maintenance/work-orders/${id}`);const [a,i]=await Promise.all([apiFetch<Assignment[]>(`/maintenance/work-orders/${id}/assignments`),apiFetch<Inspection[]>(`/maintenance/work-orders/${id}/inspections`)]);const f=(await Promise.all(i.map(x=>apiFetch<Finding[]>(`/maintenance/inspections/${x.id}/findings`)))).flat();if(live){setWo(order);setAssignments(a);setInspections(i);setFindings(f)}}catch(e){if(live)setError(e instanceof ApiError?`${e.status}: ${e.message}`:'تعذر تحميل أمر العمل')}finally{if(live)setLoading(false)}})();return()=>{live=false}},[id]);
 if(loading)return <div className="card"><p>جاري التحميل...</p></div>;if(error||!wo)return <div className="card"><h1>أمر العمل</h1><p>{error||'غير موجود'}</p></div>;
 return <><h1>{wo.workOrderNumber}</h1><div className="grid"><div className="card"><h3>دورة العمل</h3><p><span className="badge">{wo.status}</span> — {wo.priority}</p><p>الخدمة: {wo.serviceType}</p><p className="muted">Contract {wo.contractId}<br/>Visit {wo.visitId}<br/>Site {wo.siteId}</p></div><div className="card"><h3>التكليفات</h3>{assignments.length?assignments.map(a=><p key={a.id}>{a.role} — {a.status}<br/><span className="muted">{a.technicianId}</span></p>):<p>لا توجد تكليفات.</p>}</div></div><div className="card"><h3>الفحوص والملاحظات</h3><p>عدد الفحوص: {inspections.length} · عدد الملاحظات: {findings.length}</p>{findings.map(f=><p key={f.id}><Link href={`/findings/${f.id}`}>{f.title}</Link> — {f.severity} / {f.status}</p>)}{!findings.length&&<p className="muted">لا توجد ملاحظات مسجلة.</p>}</div><Link className="btn" href="/work-orders">العودة لأوامر العمل</Link></>;
}
