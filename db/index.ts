import 'server-only';
import type { Runtime } from '@/lib/server/service';
import { connectDatabase } from './postgres';
import { normalizeSettings } from '@/lib/server/config';

let connection: ReturnType<typeof connectDatabase> | undefined;
export function getRuntime(): Runtime {
  const url = process.env.DATABASE_URL?.trim();
  let databaseInvalid = false;
  if (url && !connection) {
    try {
      connection = connectDatabase(url, process.env.DATABASE_CA_CERT);
    } catch {
      // Invalid configuration must show setup guidance, not a server error
      // containing a connection string. Actual connection errors occur on query.
      databaseInvalid = true;
    }
  }
  return {
    DB: connection?.db,
    databaseInvalid,
    ...normalizeSettings({
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      APP_ORIGIN: process.env.APP_ORIGIN,
    }),
  };
}
