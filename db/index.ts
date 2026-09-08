import 'server-only';
import type { Runtime } from '@/lib/server/service';
import { connectDatabase } from './postgres';

let connection: ReturnType<typeof connectDatabase> | undefined;
export function getRuntime(): Runtime {
  const url = process.env.DATABASE_URL?.trim();
  if (url && !connection)
    connection = connectDatabase(url, process.env.DATABASE_CA_CERT);
  return {
    DB: connection?.db,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    APP_ORIGIN: process.env.APP_ORIGIN,
  };
}
