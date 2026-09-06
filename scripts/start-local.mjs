import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,openSync,closeSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
process.loadEnvFile('.env');
for(const key of ['DATABASE_URL','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','S3_ACCESS_KEY','S3_SECRET_KEY']){
 if(!process.env[key])throw new Error(`Missing ${key} in .env`);
}
const env={...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'4000',WEB_URL:'http://localhost:3000',NEXT_TELEMETRY_DISABLED:'1'};
const dir='.local-launch';mkdirSync(`${dir}/logs`,{recursive:true,mode:0o700});
function run(cmd,args){const r=spawnSync(cmd,args,{env,stdio:'inherit'});if(r.status!==0)throw new Error(`${cmd} failed (${r.status})`);}
async function free(port){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error(`Port ${port} is in use; inspect the existing process before launching.`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
await free(3000);await free(4000);
run('docker',['compose','up','-d']);
run('npm',['run','db:generate']);run('npm',['run','db:migrate']);
run('npm',['run','build']);
function start(name,args,cwd=root){const fd=openSync(`${dir}/logs/${name}.log`,'a',0o600);const child=spawn(process.execPath,args,{cwd,env,detached:true,stdio:['ignore',fd,fd]});closeSync(fd);child.unref();return child;}
const children=[];
async function ready(url,child){for(let i=0;i<60;i++){if(child.exitCode!==null)throw new Error(`Process ${child.pid} exited`);try{const r=await fetch(url,{signal:AbortSignal.timeout(2000)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw new Error(`Readiness timeout: ${url}`);}
try{
 const api=start('api',['apps/api/dist/main.js']);children.push(api);
 await ready('http://127.0.0.1:4000/api/v1/health/ready',api);
 const web=start('web',[`${root}node_modules/next/dist/bin/next`,'start','-H','127.0.0.1','-p','3000'],`${root}apps/web`);children.push(web);
 await ready('http://127.0.0.1:3000/login',web);
 writeFileSync(`${dir}/processes.json`,JSON.stringify({startedAt:new Date().toISOString(),api:api.pid,web:web.pid,root},null,2));
 console.log('LOCAL_START=OK\nWeb: http://localhost:3000/login\nAPI readiness: http://localhost:4000/api/v1/health/ready\nLogs: .local-launch/logs/\nOfficial release approval is a separate CI workflow.');
}catch(error){for(const c of children){if(c.exitCode===null)c.kill('SIGTERM');}throw error;}
