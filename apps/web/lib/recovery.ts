const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const messages: Record<string, string> = {
  RECOVERY_UNAVAILABLE: 'خدمة استعادة كلمة المرور غير متاحة حاليًا. حاول لاحقًا.',
  RECOVERY_TRY_LATER: 'وصلت إلى حد المحاولات المسموح. حاول بعد 15 دقيقة.',
  INVALID_RECOVERY_TOKEN: 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.',
  INVALID_RECOVERY_PASSWORD: 'استخدم كلمة مرور من 12 إلى 128 حرفًا وطابق حقل التأكيد.',
};

export function consumeRecoveryToken(
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  history: Pick<History, 'replaceState'>,
): string | null {
  if (!location.hash.startsWith('#reset=')) return null;
  const candidate = location.hash.slice(7);
  // The secret stays in component memory, never storage, query parameters or logs.
  history.replaceState(null, '', location.pathname + location.search);
  return /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : null;
}

async function recoveryRequest(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(API + '/auth/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit', cache: 'no-store', signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof payload?.message === 'string' ? payload.message : payload?.error?.code;
    throw new Error(messages[code] ?? 'تعذر إكمال الطلب. حاول لاحقًا.');
  }
  return payload;
}

export async function recoveryAvailable(signal?: AbortSignal): Promise<boolean> {
  const payload = await recoveryRequest('recovery/status', undefined, signal);
  if (typeof payload?.available !== 'boolean') throw new Error('تعذر التحقق من توفر الخدمة.');
  return payload.available;
}

export async function requestRecovery(email: string) {
  const payload = await recoveryRequest('forgot-password', { email: email.trim() });
  if (payload?.accepted !== true) throw new Error('تعذر إكمال الطلب. حاول لاحقًا.');
}

export async function resetRecoveryPassword(token: string, password: string, confirmPassword: string) {
  const payload = await recoveryRequest('reset-password', { token, password, confirmPassword });
  if (payload?.reset !== true) throw new Error('تعذر إكمال الطلب. حاول لاحقًا.');
}
