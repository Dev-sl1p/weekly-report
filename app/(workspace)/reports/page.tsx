import { ReportListView } from '@/components/report-list';
export const metadata = { title: 'รายงานย้อนหลัง' };
export default function Archive() {
  return <ReportListView archive />;
}
