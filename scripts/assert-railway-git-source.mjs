const env = process.env;
const failures = [];
if (env.NODE_ENV !== 'production') failures.push('NODE_ENV: production required');
const required = ['RAILWAY_GIT_COMMIT_SHA','RAILWAY_GIT_BRANCH','RAILWAY_GIT_REPO_NAME','RAILWAY_GIT_REPO_OWNER'];
for (const name of required) if (!(env[name] ?? '').trim()) failures.push(`${name}: missing`);
if (env.RAILWAY_GIT_COMMIT_SHA && !/^[0-9a-f]{40}$/i.test(env.RAILWAY_GIT_COMMIT_SHA)) failures.push('RAILWAY_GIT_COMMIT_SHA: invalid');
if (env.RAILWAY_GIT_BRANCH && env.RAILWAY_GIT_BRANCH !== 'main') failures.push('RAILWAY_GIT_BRANCH: production must deploy main');
if (env.RAILWAY_GIT_REPO_NAME && env.RAILWAY_GIT_REPO_NAME !== 'mostaofi-v1') failures.push('RAILWAY_GIT_REPO_NAME: unexpected repository');
if (env.RAILWAY_GIT_REPO_OWNER && env.RAILWAY_GIT_REPO_OWNER !== 'taregali879-prog') failures.push('RAILWAY_GIT_REPO_OWNER: unexpected owner');
if (failures.length) {
  console.error(`GIT_SOURCE_INVALID: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`GIT_SOURCE_OK ${env.RAILWAY_GIT_REPO_OWNER}/${env.RAILWAY_GIT_REPO_NAME}@${env.RAILWAY_GIT_COMMIT_SHA}`);
