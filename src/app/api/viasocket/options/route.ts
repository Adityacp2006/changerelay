import { handle, limit, HttpError } from '@/lib/server/api';
import { requireUser, adminClient } from '@/lib/server/supabase';
import { uniqueIdentifier } from '@/lib/viasocket/client';
import { listOptionValues } from '@/lib/viasocket/connector';

const KIND_TO_SERVICE: Record<string, 'calendar' | 'sheets'> = { calendars: 'calendar', calendarEvents: 'calendar', spreadsheets: 'sheets', sheetTabs: 'sheets' };

/** Readable dropdown values from the user's own connected accounts. `parent` carries the earlier choice (calendar → its events, spreadsheet → its tabs). */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(); limit(`options:${user.id}`, 60);
    const u = new URL(req.url);
    const kind = u.searchParams.get('kind') ?? '';
    const service = KIND_TO_SERVICE[kind]; if (!service) throw new HttpError(400, 'Unknown list');
    const { data: c } = await adminClient().from('connections').select('service_id,auth_id,status').eq('owner_id', user.id).eq('kind', service).maybeSingle();
    if (!c || c.status !== 'active') throw new HttpError(409, `Connect ${service === 'calendar' ? 'Google Calendar' : 'Google Sheets'} first.`, 'disconnected');
    const options = await listOptionValues(uniqueIdentifier(user.id), { serviceId: c.service_id, authId: c.auth_id }, kind, u.searchParams.get('parent') ?? undefined, u.searchParams.get('q') ?? undefined);
    return { options };
  });
}
