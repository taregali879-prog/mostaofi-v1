'use client';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useEffect,useState} from 'react';
import {ApiError,apiFetch} from '../../../lib/api';

type Finding={id:string;workOrderId:string;inspectionId:string;inspectionItemId?:string|null;findingType:string;category:string;title:string;description:string;severity:string;riskLevel:string;status:string;detectedAt:string};
type WorkOrder={id:string;workOrderNumber:string;status:string;siteId:string;contractId:string};
type Inspection={id:string;status:string;templateVersionId:string;performedBy:string};

export default function FindingDetail(){
 const {id}=useParams<{id:string}>();const [finding,setFinding]=useState<Finding|null>(null),[workOrder,setWorkOrder]=useState<WorkOrder|null>(null),[inspection,setInspection]=useState<Inspection|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{if(!id)return;let live=true;(async()=>{try{const f=await apiFetch<Finding>(`/maintenance/findings/${id}`);const [wo,ins]=await Promise.all([apiFetch<WorkOrder>(`/maintenance/work-orders/${f.workOrderId}`),apiFetch<Inspection>(`/maintenance/inspections/${f.inspectionId}`)]);if(live){setFinding(f);setWorkOrder(wo);setInspection(ins)}}catch(e){if(live)setError(e instanceof ApiError?`${e.status}: ${e.message}`:'تعذر تحميل الملاحظة')}finally{if(live)setLoading(false)}})();return()=>{live=false}},[id]);
 if(loading)return <div className="card"><p>جاري التحميل...</p></div>;if(error||!finding)return <div className="card"><h1>الملاحظة</h1><p>{error||'غير موجودة'}</p></div>;
 return <><h1>{finding.title}</h1><div className="grid"><div className="card"><h3>تفاصيل الملاحظة</h3><p><span className="badge">{finding.status}</span> — {finding.severity}</p><p>{finding.description}</p><p>النوع: {finding.findingType}<br/>التصنيف: {finding.category}<br/>مستوى الخطر: {finding.riskLevel}</p></div><div className="card"><h3>السياق التشغيلي</h3><p>الفحص: {inspection?.status??'—'}<br/>القالب: {inspection?.templateVersionId??'—'}</p>{workOrder&&<><p>أمر العمل: {workOrder.workOrderNumber}<br/>حالته: {workOrder.status}</p><Link className="btn" href={`/work-orders/${workOrder.id}`}>فتح أمر العمل</Link></>}</div></div><div className="card"><h3>الامتدادات اللاحقة</h3><p className="muted">الأدلة والعرض التصحيحي والتنفيذ خارج نطاق هذه الشريحة، ولا يتم محاكاتها هنا.</p></div><Link className="btn" href="/findings">العودة للملاحظات</Link></>;
}
