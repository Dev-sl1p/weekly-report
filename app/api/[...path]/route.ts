import { getRuntime } from '@/db';
import { handleApi } from '@/lib/server/service';
export const dynamic = 'force-dynamic';
const handler = (request: Request) => handleApi(request, getRuntime());
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
