import 'server-only';
import { ViaSocket } from 'viasocket-apps';

let cached: ViaSocket | null = null;
export function viasocketConfigured() { return !!(process.env.VIASOCKET_ORG_ID && process.env.VIASOCKET_PROJECT_ID && process.env.VIASOCKET_EMBED_SECRET); }

/** Server-only. The signing secret never leaves this process. */
export function vs(): ViaSocket {
  if (!viasocketConfigured()) throw new Error('viaSocket is not configured (set VIASOCKET_* in the server environment).');
  return cached ??= new ViaSocket({ orgId: process.env.VIASOCKET_ORG_ID!, projectId: process.env.VIASOCKET_PROJECT_ID!, secret: process.env.VIASOCKET_EMBED_SECRET! });
}

/** Some catalog slugs are missing from the direct resolver but are present in the published app list. */
export async function serviceIdFor(slug: string): Promise<string> {
  const client = vs();
  try { return await client.catalog.serviceIdFor(slug); }
  catch (error) {
    const app = (await client.catalog.list({ limit: 200 })).find(item => item.slug === slug);
    if (app?.serviceId) return app.serviceId;
    throw error;
  }
}

/** One stable identifier per user, forever (docs: changing it makes connections "disappear"). */
export const uniqueIdentifier = (userId: string) => `cr_${userId}`;
