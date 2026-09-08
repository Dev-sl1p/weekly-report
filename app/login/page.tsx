import { Login } from '@/components/login';
import { configured } from '@/lib/server/service';
import { configurationIssues } from '@/lib/server/config';
import { getRuntime } from '@/db';
import { pageSession } from '@/lib/server/page-auth';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await pageSession()) redirect('/');
  const env = getRuntime();
  return (
    <Login ready={configured(env)} setupIssues={configurationIssues(env)} />
  );
}
