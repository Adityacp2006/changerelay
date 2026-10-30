import { handle, limit, HttpError } from '@/lib/server/api';
import { requireUser } from '@/lib/server/supabase';
import { vs, uniqueIdentifier, serviceIdFor } from '@/lib/viasocket/client';
import { config } from '@/lib/viasocket/config';

export const dynamic = 'force-dynamic';

/** Signs a short-lived embed token for the signed-in user only. The signing secret stays on the server. Returned per request, never cached. */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    limit(`token:${user.id}`, 30);
    const kind = new URL(req.url).searchParams.get('kind') as 'calendar' | 'sheets' | 'gmail' | null;
    const svc = kind ? config.services[kind] : null;
    if (!svc) throw new HttpError(400, 'Unknown app');
    const [token, serviceId] = await Promise.all([vs().user(uniqueIdentifier(user.id)).token(), serviceIdFor(svc.slug)]);
    return { token, serviceId };
  });
}
