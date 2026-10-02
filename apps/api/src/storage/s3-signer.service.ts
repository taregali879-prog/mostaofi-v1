import { Injectable } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';

const h = (key: Buffer|string, data: string) => createHmac('sha256', key).update(data).digest();
const hex = (data: string) => createHash('sha256').update(data).digest('hex');

@Injectable()
export class S3SignerService {
  presignPut(key: string, contentType: string, expiresSeconds = 900) {
    const endpoint = new URL(process.env.S3_ENDPOINT ?? 'http://localhost:9000');
    const region = process.env.S3_REGION ?? 'us-east-1';
    const bucket = process.env.S3_BUCKET ?? 'muqawil-documents';
    const access = process.env.S3_ACCESS_KEY ?? 'muqawil';
    const secret = process.env.S3_SECRET_KEY ?? 'change-me';
    const urlStyle = (process.env.S3_URL_STYLE ?? 'path').toLowerCase();
    const virtualHosted = urlStyle === 'virtual-host' || urlStyle === 'virtual';
    const now = new Date();
    const amz = now.toISOString().replace(/[:-]|\.\d{3}/g,'');
    const date = amz.slice(0,8); const scope = `${date}/${region}/s3/aws4_request`;
    const objectPath = `/${key.split('/').map(encodeURIComponent).join('/')}`;
    const path = virtualHosted ? objectPath : `/${bucket}${objectPath}`;
    const requestHost = virtualHosted ? `${bucket}.${endpoint.host}` : endpoint.host;
    const requestOrigin = virtualHosted ? `${endpoint.protocol}//${requestHost}` : endpoint.origin;
    const params = new URLSearchParams({
      'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':`${access}/${scope}`,'X-Amz-Date':amz,
      'X-Amz-Expires':String(expiresSeconds),'X-Amz-SignedHeaders':'content-type;host'
    });
    params.sort();
    const canonicalHeaders = `content-type:${contentType}\nhost:${requestHost}\n`;
    const canonical = `PUT\n${path}\n${params.toString()}\n${canonicalHeaders}\ncontent-type;host\nUNSIGNED-PAYLOAD`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amz}\n${scope}\n${hex(canonical)}`;
    const kDate=h(`AWS4${secret}`,date), kRegion=h(kDate,region), kService=h(kRegion,'s3'), kSigning=h(kService,'aws4_request');
    const signature=createHmac('sha256',kSigning).update(stringToSign).digest('hex');
    return { uploadUrl: `${requestOrigin}${path}?${params.toString()}&X-Amz-Signature=${signature}`, storageKey:key, expiresIn:expiresSeconds, headers:{'content-type':contentType} };
  }
}
