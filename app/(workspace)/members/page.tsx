import { Members } from '@/components/members';
import { requirePageSession } from '@/lib/server/page-auth';
import { redirect } from 'next/navigation';
export const metadata = { title: 'สมาชิกทีม' };
export default async function MembersPage() {
  const { user } = await requirePageSession();
  if (user.role !== 'admin') redirect('/');
  return <Members />;
}
