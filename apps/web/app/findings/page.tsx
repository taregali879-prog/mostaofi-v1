'use client';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {ApiError,apiFetch} from '../../lib/api';

type Finding={id:string;workOrderId:string;inspectionId:string;findingType:string;category:string;title:string;severity:string;riskLevel:string;status:string};

export default function FindingsPage(){
 const [items,setItems]=useState<Finding[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[status,setStatus]=useState(''),[severity,setSeverity]=useState(''),[type,setType]=useState('');
 useEffect(()=>{let live=true;apiFetch<Finding[]>('/maintenance/findings').then(x=>{if(live)setItems(x)}).catch(e=>{if(live)setError(e instanceof ApiError?`${e.status}: ${e.message}`:'تعذر تحميل الملاحظات')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 const filtered=useMemo(()=>items.filter(x=>(!status||x.status===status)&&(!severity||x.severity===severity)&&(!type||x.findingType===type)),[items,status,severity,type]);
 if(loading)return <div className="card"><h1>الملاحظات</h1><p>جاري التحميل...</p></div>;if(error)return <div className="card"><h1>الملاحظات</h1><p>{error}</p></div>;
 return <><h1>الملاحظات</h1><div className="card"><h3>التصفية</h3><div className="grid"><select className="field" value={status} onChange={e=>setStatus(e.target.value)}><option value="">كل الحالات</option><option>OPEN</option><option>ACKNOWLEDGED</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>CLOSED</option></select><select className="field" value={severity} onChange={e=>setSeverity(e.target.value)}><option value="">كل درجات الخطورة</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select><select className="field" value={type} onChange={e=>setType(e.target.value)}><option value="">كل الأنواع</option><option>OBSERVATION</option><option>FAULT</option><option>VIOLATION</option><option>RECOMMENDATION</option></select></div></div>{filtered.length===0?<div className="card"><p>لا توجد ملاحظات مطابقة.</p></div>:<div className="grid">{filtered.map(f=><div className="card" key={f.id}><h3>{f.title}</h3><p><span className="badge">{f.status}</span> — {f.severity}</p><p>{f.findingType} · {f.category}</p><Link className="btn" href={`/findings/${f.id}`}>عرض الملاحظة</Link></div>)}</div>}</>;
}
