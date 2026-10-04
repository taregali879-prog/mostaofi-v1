import './globals.css';
import Link from 'next/link';
export const metadata={title:'مقاول الشريك'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><nav className="nav"><strong>مقاول الشريك</strong><Link href="/projects">المشاريع</Link><Link href="/work-orders">أوامر العمل</Link><Link href="/findings">الملاحظات</Link><Link href="/contractor">ملف المقاول</Link><Link href="/pilot">تجربة MVP</Link><Link href="/login">الدخول</Link></nav><main className="shell rtl">{children}</main></body></html>}
