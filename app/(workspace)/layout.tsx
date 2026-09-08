import { requirePageSession } from '@/lib/server/page-auth';
import { Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requirePageSession();
  return <Workspace auth={auth}>{children}</Workspace>;
}
