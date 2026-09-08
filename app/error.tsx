'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="policy-page" role="alert">
      <h1>เปิดหน้านี้ไม่สำเร็จ</h1>
      <p>กรุณาลองอีกครั้งในอีกสักครู่</p>
      <Button onClick={reset}>ลองอีกครั้ง</Button>
    </main>
  );
}
