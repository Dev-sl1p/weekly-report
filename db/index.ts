import { env } from 'cloudflare:workers';
import type { Runtime } from '@/lib/server/service';
export function getRuntime(): Runtime {
  return env as unknown as Runtime;
}
