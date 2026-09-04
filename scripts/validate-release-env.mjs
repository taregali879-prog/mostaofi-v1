const required=['DATABASE_URL','S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY','S3_SECRET_KEY','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET'];
const weak=new Set(['change-me','change-me-access','change-me-refresh','muqawil','password','secret','release-ci-minio-secret','release-ci-access-secret','release-ci-refresh-secret']);
let failed=false;
for(const key of required){const value=process.env[key];if(!value){console.error(`FAIL missing ${key}`);failed=true;continue}if((key.includes('SECRET')||key.includes('KEY'))&&weak.has(value)){console.error(`FAIL weak/default ${key}`);failed=true}else console.log(`PASS ${key}`)}
if(failed)process.exit(1);
