#!/usr/bin/env node
// Run inside the API service environment. This never sends a message or prints credentials.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const required = ['MOSTAOFI_RECOVERY_ORIGIN', 'MOSTAOFI_MAIL_FROM', 'MOSTAOFI_SMTP_HOST', 'MOSTAOFI_SMTP_USER', 'MOSTAOFI_SMTP_PASSWORD', 'JWT_REFRESH_SECRET'];

export async function verifyRecoveryMail({ env = process.env, loadConfig, createTransport, configOnly = false } = {}) {
  const missing = required.filter(name => !env[name]);
  if (missing.length) return { status: 'BLOCKED', reason: 'MISSING_CONFIGURATION', missingVariables: missing, deliveryTest: 'NOT_PERFORMED' };
  if (!loadConfig) ({ recoveryMailConfig: loadConfig } = require('../apps/api/dist/auth/recovery-mailer.js'));
  const config = loadConfig(env);
  if (!config) return { status: 'BLOCKED', reason: 'INVALID_CONFIGURATION', deliveryTest: 'NOT_PERFORMED' };
  if (configOnly) return { status: 'CONFIGURED', smtpVerification: 'NOT_PERFORMED', deliveryTest: 'NOT_PERFORMED' };
  createTransport ??= require('nodemailer').createTransport;
  const transport = createTransport(config.options);
  try {
    const verified = await transport.verify();
    return verified === true
      ? { status: 'SMTP_VERIFIED', deliveryTest: 'NOT_PERFORMED' }
      : { status: 'BLOCKED', reason: 'SMTP_VERIFICATION_FAILED', deliveryTest: 'NOT_PERFORMED' };
  } catch (error) {
    const allowed = ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ESOCKET', 'ETLS'];
    return { status: 'BLOCKED', reason: allowed.includes(error?.code) ? error.code : 'SMTP_VERIFICATION_FAILED', deliveryTest: 'NOT_PERFORMED' };
  } finally { transport.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--config-only')) throw Error('UNKNOWN_ARGUMENT');
    const result = await verifyRecoveryMail({ configOnly: process.argv.includes('--config-only') });
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'BLOCKED' ? 2 : 0;
  } catch {
    console.log(JSON.stringify({ status: 'BLOCKED', reason: 'BUILD_OR_TOOLING_REQUIRED', deliveryTest: 'NOT_PERFORMED' }));
    process.exitCode = 2;
  }
}
