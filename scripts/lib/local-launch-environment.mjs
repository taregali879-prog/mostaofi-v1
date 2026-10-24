export function localLaunchEnvironment(source) {
  return { ...source, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '4000',
    WEB_URL: 'http://localhost:3000', NEXT_PUBLIC_API_URL: 'http://localhost:4000/api/v1', NEXT_TELEMETRY_DISABLED: '1' };
}
