import { createHash, createHmac } from 'node:crypto';

const h = (key, data) => createHmac('sha256', key).update(data).digest();
const hex = (data) => createHash('sha256').update(data).digest('hex');

export const PREVIEW_GATE_ADMIN_ROLES = Object.freeze(['ORG_ADMIN', 'PROJECT_MANAGER']);

export function canDeleteGateUser(auditCount) {
  return Number(auditCount ?? 0) === 0;
}

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function assertPreviewBucketName(value) {
  if (!String(value ?? '').toLowerCase().includes('preview')) throw new Error('PREVIEW_BUCKET_REQUIRED');
  return true;
}

export function assertLocalApiBase(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('LOCAL_API_REQUIRED'); }
  if (!['127.0.0.1','localhost'].includes(parsed.hostname)) throw new Error('LOCAL_API_REQUIRED');
  return true;
}

export function assertPreviewDatabaseUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('PREVIEW_DATABASE_REQUIRED'); }
  const database = parsed.pathname.replace(/^\//, '').split('/')[0];
  if (database !== 'mostaofi_preview') throw new Error('PREVIEW_DATABASE_REQUIRED');
  return true;
}

export function presignS3Request({ method, key, contentType, endpoint, region, bucket, accessKey, secretKey, urlStyle = 'path', expiresSeconds = 300, now = new Date() }) {
  const verb = String(method ?? '').toUpperCase();
  if (!['PUT', 'GET', 'DELETE'].includes(verb)) throw new Error('UNSUPPORTED_S3_METHOD');
  if (verb === 'PUT' && !contentType) throw new Error('CONTENT_TYPE_REQUIRED');
  const endpointUrl = new URL(endpoint);
  const virtualHosted = ['virtual-host', 'virtual'].includes(String(urlStyle).toLowerCase());
  const objectPath = `/${String(key).split('/').map(encodeURIComponent).join('/')}`;
  const path = virtualHosted ? objectPath : `/${bucket}${objectPath}`;
  const requestHost = virtualHosted ? `${bucket}.${endpointUrl.host}` : endpointUrl.host;
  const origin = virtualHosted ? `${endpointUrl.protocol}//${requestHost}` : endpointUrl.origin;
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amz.slice(0, 8), scope = `${date}/${region}/s3/aws4_request`;
  const signedHeaders = verb === 'PUT' ? 'content-type;host' : 'host';
  const params = new URLSearchParams({ 'X-Amz-Algorithm':'AWS4-HMAC-SHA256', 'X-Amz-Credential':`${accessKey}/${scope}`, 'X-Amz-Date':amz, 'X-Amz-Expires':String(expiresSeconds), 'X-Amz-SignedHeaders':signedHeaders });
  params.sort();
  const canonicalHeaders = verb === 'PUT' ? `content-type:${contentType}\nhost:${requestHost}\n` : `host:${requestHost}\n`;
  const canonical = `${verb}\n${path}\n${params.toString()}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amz}\n${scope}\n${hex(canonical)}`;
  const kDate=h(`AWS4${secretKey}`,date), kRegion=h(kDate,region), kService=h(kRegion,'s3'), kSigning=h(kService,'aws4_request');
  const signature=createHmac('sha256',kSigning).update(stringToSign).digest('hex');
  return { url: `${origin}${path}?${params.toString()}&X-Amz-Signature=${signature}`, headers: verb === 'PUT' ? {'content-type':contentType} : {} };
}