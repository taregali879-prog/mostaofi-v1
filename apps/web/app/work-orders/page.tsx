'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ApiError,apiFetch} from '../../lib/api';

type Assignment={id:string;technicianId:string;role:string;status:string};
type WorkOrder={id:string;workOrderNumber:string;status:string;priority:string;contractId:string;siteId:string;serviceType:string};
type Row=WorkOrder&{assignments:Assignment[]};

export default function WorkOrdersPage(){
 const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;(async()=>{try{const items=await apiFetch<WorkOrder[]>('/maintenance/work-orders');const enriched=await Promise.all(items.map(async item=>({...item,assignments:await apiFetch<Assignment[]>(`/maintenance/work-orders/${item.id}/assignments`).catch(()=>[])})));if(live)setRows(enriched)}catch(e){if(live)setError(e instanceof ApiError?`${e.status}: ${e.message}`:'تعذر تحميل أوامر العمل')}finally{if(live)setLoading(false)}})();return()=>{live=false}},[]);
 if(loading)return <div className="card"><h1>أوامر العمل</h1><p className="muted">جاري التحميل...</p></div>;
 if(error)return <div className="card"><h1>أوامر العمل</h1><p>{error}</p><Link className="btn" href="/login">تسجيل الدخول</Link></div>;
 return <><h1>أوامر العمل</h1><p className="muted">أوامر الصيانة المملوكة للمنشأة الحالية.</p>{rows.length===0?<div className="card"><p>لا توجد أوامر عمل حتى الآن.</p></div>:<div className="grid">{rows.map(row=><div className="card" key={row.id}><h3>{row.workOrderNumber}</h3><p><span className="badge">{row.status}</span> — {row.priority}</p><p className="muted">{row.serviceType} · Site {row.siteId}</p><p>التكليفات: {row.assignments.length?row.assignments.map(a=>`${a.role} (${a.status})`).join('، '):'لا يوجد'}</p><Link className="btn" href={`/work-orders/${row.id}`}>فتح أمر العمل</Link></div>)}</div>}</>;
}
