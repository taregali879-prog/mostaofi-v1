'use client';

const API=(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000/api/v1').replace(/\/$/,'');
const ACCESS_TOKEN='muqawil_access_token';
const REFRESH_TOKEN='muqawil_refresh_token';
let ongoingRefresh:Promise<string>|null=null;

export class ApiError extends Error {
  status: number;
  constructor(status:number,message:string){super(message);this.name='ApiError';this.status=status;}
}

function clearSession(){
  localStorage.removeItem(ACCESS_TOKEN);
  localStorage.removeItem(REFRESH_TOKEN);
}

async function refreshSession():Promise<string>{
  if(!ongoingRefresh){
    ongoingRefresh=(async()=>{
      const oldRefresh=localStorage.getItem(REFRESH_TOKEN);
      if(!oldRefresh)throw new ApiError(401,'SESSION_EXPIRED');
      const response=await fetch(API+'/auth/refresh',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({refreshToken:oldRefresh}),cache:'no-store',credentials:'omit',
      });
      if(!response.ok)throw new ApiError(401,'SESSION_EXPIRED');
      const payload=await response.json();
      if(typeof payload?.accessToken!=='string'||!payload.accessToken||typeof payload?.refreshToken!=='string'||!payload.refreshToken)
        throw new ApiError(401,'SESSION_EXPIRED');
      // A logout or replacement session that happened in flight must not be resurrected.
      if(localStorage.getItem(REFRESH_TOKEN)!==oldRefresh)throw new ApiError(401,'SESSION_EXPIRED');
      localStorage.setItem(ACCESS_TOKEN,payload.accessToken);
      localStorage.setItem(REFRESH_TOKEN,payload.refreshToken);
      return payload.accessToken as string;
    })().finally(()=>{ongoingRefresh=null;});
  }
  return ongoingRefresh;
}

export async function apiFetch<T>(path:string,init:RequestInit={}):Promise<T>{
  const token=typeof window==='undefined'?null:localStorage.getItem(ACCESS_TOKEN);
  const url=API+(path.startsWith('/')?path:'/'+path);
  const send=(access:string|null)=>{
    const headers=new Headers(init.headers??{});
    if(access)headers.set('authorization','Bearer '+access);
    if(init.body!==undefined&&!headers.has('content-type'))headers.set('content-type','application/json');
    return fetch(url,{...init,headers,cache:'no-store'});
  };
  let response=await send(token);
  if(response.status===401 && token && typeof window!=='undefined'){
    let retryAccess:string|null=null;
    try{
      const current=localStorage.getItem(ACCESS_TOKEN);
      const next=current&&current!==token?current:await refreshSession();
      retryAccess=next;
      response=await send(next);
      if(response.status===401)throw new ApiError(401,'SESSION_EXPIRED');
    }catch{
      const current=localStorage.getItem(ACCESS_TOKEN);
      if(current===token || (retryAccess!==null && current===retryAccess))clearSession();
      throw new ApiError(401,'SESSION_EXPIRED');
    }
  }
  const type=response.headers.get('content-type')??'';
  const body:any=type.includes('application/json')?await response.json():await response.text();
  if(!response.ok)throw new ApiError(response.status,typeof body==='string'?body:(body?.message??'HTTP_'+response.status));
  return body as T;
}
