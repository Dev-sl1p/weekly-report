import { FileQuestion } from 'lucide-react';
export default function NotFound() {
  return (
    <main className="policy-page">
      <FileQuestion size={36} />
      <h1>ไม่พบหน้านี้</h1>
      <p>ลิงก์อาจไม่ถูกต้อง หรือคุณไม่มีสิทธิ์เปิดดู</p>
      <a className="text-primary underline" href="/">
        กลับหน้าหลัก
      </a>
    </main>
  );
}
