export function evaluateSamples(samples,{maxP95Ms=800,minAvailability=0.99}={}){
  const total=samples.length;
  const ok=samples.filter(x=>x.ok).length;
  const availability=total?ok/total:0;
  const latencies=samples.map(x=>x.ms).sort((a,b)=>a-b);
  const p95=latencies.length?latencies[Math.min(latencies.length-1,Math.ceil(latencies.length*.95)-1)]:Infinity;
  return {pass:availability>=minAvailability&&p95<=maxP95Ms,total,ok,availability,p95};
}
