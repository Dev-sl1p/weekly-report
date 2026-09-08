import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRuntime } from '@/db';
import { session } from './service';
export async function pageSession() {
  return session(
    new Request('http://internal/', { headers: await headers() }),
    getRuntime(),
  );
}
export async function requirePageSession() {
  const auth = await pageSession();
  if (!auth) redirect('/login');
  return auth;
}
