import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: {
    default: 'Weekly Report — รายงานของทีม',
    template: '%s · Weekly Report',
  },
  description: 'พื้นที่รายงานประจำสัปดาห์ของทีม เขียนรายงาน เก็บฉบับร่าง และเปิดอ่านย้อนหลัง',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
