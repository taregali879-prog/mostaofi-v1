'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { consumeRecoveryToken, resetRecoveryPassword } from '../lib/recovery';

export default function RecoveryBoundary({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const captured = useRef(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const requested = window.location.hash.startsWith('#reset=');
    const capturedToken = consumeRecoveryToken(window.location, window.history);
    setToken(capturedToken);
    setInvalidLink(requested && capturedToken === null);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy || done) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    const confirmation = String(data.get('confirmPassword') ?? '');
    if (password !== confirmation) { setMessage('كلمتا المرور غير متطابقتين.'); return; }
    setBusy(true); setMessage('');
    try {
      await resetRecoveryPassword(token, password, confirmation);
      try {
        localStorage.removeItem('muqawil_access_token');
        localStorage.removeItem('muqawil_refresh_token');
      } catch { /* The server has already revoked the old sessions. */ }
      form.reset(); setDone(true); setToken(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر الاتصال. حاول مرة أخرى.');
    } finally { setBusy(false); }
  }

  if (!token && !invalidLink && !done) return <>{children}</>;
  return <section className="card" style={{ maxWidth: 520 }} aria-labelledby="recovery-title">
    <h1 id="recovery-title">تعيين كلمة مرور جديدة</h1>
    {invalidLink ? <><p role="alert">رابط الاستعادة غير صالح. اطلب رابطًا جديدًا.</p><Link className="btn" href="/forgot-password" onClick={() => setInvalidLink(false)}>طلب رابط جديد</Link></> :
      done ? <><p role="status">تم تغيير كلمة المرور وإبطال جلسات الدخول السابقة.</p><Link className="btn" href="/login" onClick={() => setDone(false)}>تسجيل الدخول</Link></> :
        <form onSubmit={submit}>
          <p className="muted">استخدم كلمة مرور من 12 إلى 128 حرفًا.</p>
          <label htmlFor="new-password">كلمة المرور الجديدة</label>
          <input className="field" id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} />
          <label htmlFor="confirm-password">تأكيد كلمة المرور</label>
          <input className="field" id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} />
          <button className="btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}</button>
          {message && <p role="alert">{message}</p>}
          <p><Link href="/forgot-password" onClick={() => setToken(null)}>طلب رابط جديد</Link></p>
        </form>}
  </section>;
}
