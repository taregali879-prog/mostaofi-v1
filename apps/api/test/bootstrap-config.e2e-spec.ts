import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('production bootstrap guard', () => {
  it('validates production configuration before creating the Nest application', () => {
    const source = readFileSync(join(__dirname, '../src/main.ts'), 'utf8');
    const validateIndex = source.indexOf('validateProductionConfig();');
    const createIndex = source.indexOf('NestFactory.create(AppModule)');
    expect(validateIndex).toBeGreaterThanOrEqual(0);
    expect(validateIndex).toBeLessThan(createIndex);
  });
});
