const base=process.env.API_URL??'http://localhost:4000/api/v1';
const n=Number(process.env.PERF_REQUESTS??25);const samples=[];let failures=0;
for(let i=0;i<n;i++){const t=performance.now();try{const r=await fetch(`${base}/health/live`);if(!r.ok)failures++}catch{failures++}samples.push(performance.now()-t)}
samples.sort((a,b)=>a-b);const p95=samples[Math.min(samples.length-1,Math.ceil(samples.length*.95)-1)];console.log(JSON.stringify({requests:n,failures,p95_ms:Number(p95.toFixed(2)),avg_ms:Number((samples.reduce((a,b)=>a+b,0)/n).toFixed(2))},null,2));if(failures||p95>400)process.exit(1);
