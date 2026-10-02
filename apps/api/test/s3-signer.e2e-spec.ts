import { S3SignerService } from '../src/storage/s3-signer.service';

describe('S3 signer URL style', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it('uses Railway virtual-hosted style when configured', () => {
    Object.assign(process.env, {
      S3_ENDPOINT: 'https://t3.storageapi.dev', S3_REGION: 'auto',
      S3_BUCKET: 'preview-bucket-123', S3_ACCESS_KEY: 'preview-access',
      S3_SECRET_KEY: 'c'.repeat(48), S3_URL_STYLE: 'virtual-host'
    });
    const signed = new S3SignerService().presignPut('docs/test.pdf', 'application/pdf');
    const url = new URL(signed.uploadUrl);
    expect(url.host).toBe('preview-bucket-123.t3.storageapi.dev');
    expect(url.pathname).toBe('/docs/test.pdf');
  });
});
