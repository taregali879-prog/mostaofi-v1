'use client';

const API=(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000/api/v1').replace(/\/$/,'');

export class ApiError extends Error {
  status: number;
  constructor(status:number,message:string){super(message);this.name='ApiError';this.status=status;}
}

export async function apiFetch<T>(path:string,init:RequestInit={}):Promise<T>{
  const token=typeof window==='undefined'?null:localStorage.getItem('muqawil_access_token');
  const headers=new Headers(init.headers??{});
  if(token)headers.set('authorization',`Bearer ${token}`);
  if(init.body!==undefined&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(`${API}${path.startsWith('/')?path:`/${path}`}`,{...init,headers,cache:'no-store'});
  const type=response.headers.get('content-type')??'';
  const body:any=type.includes('application/json')?await response.json():await response.text();
  if(!response.ok)throw new ApiError(response.status,typeof body==='string'?body:(body?.message??`HTTP_${response.status}`));
  return body as T;
}
