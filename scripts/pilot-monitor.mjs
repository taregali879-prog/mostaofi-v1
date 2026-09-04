import { appendFile } from 'node:fs/promises';
import { evaluateSamples } from './pilot-monitor-core.mjs';

const url=process.env.PILOT_HEALTH_URL??'http://127.0.0.1:4000/api/v1/health/ready';
const requests=Number(process.env.PILOT_MONITOR_REQUESTS??10);
const intervalMs=Number(process.env.PILOT_MONITOR_INTERVAL_MS??1000);
const maxP95Ms=Number(process.env.PILOT_MAX_P95_MS??800);
const minAvailability=Number(process.env.PILOT_MIN_AVAILABILITY??1);
const logFile=process.env.PILOT_MONITOR_LOG??'evidence/runtime/pilot-monitor.ndjson';
const samples=[];
for(let i=0;i<requests;i++){
  const start=performance.now(); let ok=false,status=0,error;
  try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});status=r.status;ok=r.ok}catch(e){error=String(e?.message??e)}
  const ms=Number((performance.now()-start).toFixed(2));
  const sample={ts:new Date().toISOString(),ok,status,ms,error};samples.push(sample);
  await appendFile(logFile,JSON.stringify({type:'health_sample',...sample})+'\n');
  if(i+1<requests) await new Promise(r=>setTimeout(r,intervalMs));
}
const result=evaluateSamples(samples,{maxP95Ms,minAvailability});
const out={type:'pilot_monitor_summary',ts:new Date().toISOString(),...result,maxP95Ms,minAvailability};
console.log(JSON.stringify(out,null,2));await appendFile(logFile,JSON.stringify(out)+'\n');
if(!result.pass)process.exit(1);
