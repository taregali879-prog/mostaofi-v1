type Environment = Record<string, string | undefined>;

const PLACEHOLDERS = new Set([
  'change-me',
  'dev-only-change-me',
  'dev-refresh-change-me',
  'muqawil',
  'password',
  'secret',
]);

function required(env: Environment, name: string, errors: string[]): string {
  const value = env[name]?.trim() ?? '';
  if (!value) errors.push(`${name}: missing`);
  return value;
}

function rejectPlaceholder(name: string, value: string, errors: string[]) {
  if (PLACEHOLDERS.has(value.toLowerCase())) errors.push(`${name}: development placeholder is forbidden`);
}

function rejectLocalUrl(name: string, value: string, errors: string[]) {
  try {
    const parsed = new URL(value);
    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) errors.push(`${name}: localhost is forbidden in production`);
  } catch {
    errors.push(`${name}: invalid URL`);
  }
}

export function validateProductionConfig(env: Environment = process.env): void {
  if (env.NODE_ENV !== 'production') return;

  const errors: string[] = [];
  const databaseUrl = required(env, 'DATABASE_URL', errors);
  const webUrl = required(env, 'WEB_URL', errors);
  const accessSecret = required(env, 'JWT_ACCESS_SECRET', errors);
  const refreshSecret = required(env, 'JWT_REFRESH_SECRET', errors);
  const s3Endpoint = required(env, 'S3_ENDPOINT', errors);
  required(env, 'S3_BUCKET', errors);
  const s3AccessKey = required(env, 'S3_ACCESS_KEY', errors);
  const s3SecretKey = required(env, 'S3_SECRET_KEY', errors);
  const commitSha = required(env, 'RAILWAY_GIT_COMMIT_SHA', errors);
  const branch = required(env, 'RAILWAY_GIT_BRANCH', errors);
  const repoName = required(env, 'RAILWAY_GIT_REPO_NAME', errors);
  const repoOwner = required(env, 'RAILWAY_GIT_REPO_OWNER', errors);

  if (databaseUrl) rejectLocalUrl('DATABASE_URL', databaseUrl, errors);
  if (webUrl) {
    rejectLocalUrl('WEB_URL', webUrl, errors);
    try { if (new URL(webUrl).protocol !== 'https:') errors.push('WEB_URL: HTTPS required'); } catch { /* invalid already reported */ }
  }
  if (s3Endpoint) rejectLocalUrl('S3_ENDPOINT', s3Endpoint, errors);

  for (const [name, value, min] of [
    ['JWT_ACCESS_SECRET', accessSecret, 32],
    ['JWT_REFRESH_SECRET', refreshSecret, 32],
    ['S3_SECRET_KEY', s3SecretKey, 24],
  ] as const) {
    if (value) {
      rejectPlaceholder(name, value, errors);
      if (value.length < min) errors.push(`${name}: must be at least ${min} characters`);
    }
  }
  if (s3AccessKey) rejectPlaceholder('S3_ACCESS_KEY', s3AccessKey, errors);

  if (commitSha && !/^[0-9a-f]{40}$/i.test(commitSha)) errors.push('RAILWAY_GIT_COMMIT_SHA: expected 40 hexadecimal characters');
  if (branch && branch !== 'main') errors.push('RAILWAY_GIT_BRANCH: production must deploy main');
  if (repoName && repoName !== 'mostaofi-v1') errors.push('RAILWAY_GIT_REPO_NAME: unexpected repository');
  if (repoOwner && repoOwner !== 'taregali879-prog') errors.push('RAILWAY_GIT_REPO_OWNER: unexpected owner');

  if (errors.length) throw new Error(`PRODUCTION_CONFIG_INVALID: ${errors.join('; ')}`);
}
