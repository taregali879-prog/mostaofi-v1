export interface RequestContext {
  userId: string;
  organizationId: string;
  requestId: string;
}

export const DEV_CONTEXT: RequestContext = {
  userId: '01900000-0000-7000-8000-000000000001',
  organizationId: '01900000-0000-7000-8000-000000000101',
  requestId: 'dev-request',
};
