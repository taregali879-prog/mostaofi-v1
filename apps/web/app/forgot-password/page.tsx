'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { recoveryAvailable, requestRecovery } from '../../lib/recovery';

export default function ForgotPassword() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    recoveryAvailable(controller.signal).then(setAvailable).catch(error => {
      if (controller.signal.aborted) return;
      setAvailable(false); setMessage(error instanceof Error ? error.message : 'تعذر الاتصال.');
    });
    return () => controller.abort();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || busy || sent) return;
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    setBusy(true); setMessage('');
    try { await requestRecovery(email); setSent(true); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر الاتصال. حاول مرة أخرى.'); }
    finally { setBusy(false); }
  }
  return <section className="card" style={{ maxWidth: 520 }} aria-labelledby="forgot-title">
    <h1 id="forgot-title">استعادة كلمة المرور</h1>
    {available === null ? <p role="status">جارٍ التحقق من توفر الخدمة…</p> :
      available === false ? <p role="alert">{message || 'خدمة استعادة كلمة المرور غير متاحة حاليًا. حاول لاحقًا.'}</p> :
        sent ? <p role="status">إذا كان البريد مرتبطًا بحساب، فسيصلك رابط الاستعادة. تنتهي صلاحية الرابط بعد 15 دقيقة؛ تحقق أيضًا من البريد غير المرغوب.</p> :
          <form onSubmit={submit}>
            <label htmlFor="recovery-email">البريد الإلكتروني</label>
            <input className="field" id="recovery-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} />
            <button className="btn" disabled={busy}>{busy ? 'جارٍ الإرسال…' : 'إرسال رابط الاستعادة'}</button>
            {message && <p role="alert">{message}</p>}
          </form>}
    <p><Link href="/login">العودة لتسجيل الدخول</Link></p>
  </section>;
}
