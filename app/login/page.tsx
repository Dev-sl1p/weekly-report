import { Login } from '@/components/login';
import { configured } from '@/lib/server/service';
import { getRuntime } from '@/db';
import { pageSession } from '@/lib/server/page-auth';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await pageSession()) redirect('/');
  return <Login ready={configured(getRuntime())} />;
}
