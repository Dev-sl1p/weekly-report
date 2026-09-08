import { ReportDetail } from '@/components/report-detail';
export const metadata = { title: 'อ่านรายงาน' };
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportDetail id={id} />;
}
