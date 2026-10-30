// Prints the real actions + input fields for Google Calendar, Sheets and Gmail from YOUR viaSocket project catalog.
// Usage: VIASOCKET_ORG_ID=... VIASOCKET_PROJECT_ID=... VIASOCKET_EMBED_SECRET=... npm run discover:actions
import { ViaSocket } from 'viasocket-apps';
const vs = new ViaSocket({ orgId: process.env.VIASOCKET_ORG_ID, projectId: process.env.VIASOCKET_PROJECT_ID, secret: process.env.VIASOCKET_EMBED_SECRET });
const catalogApps = await vs.catalog.list({ limit: 200 });
for (const slug of ['google-calendar', 'google-sheets', 'gmail']) {
  try {
    let serviceId;
    try { serviceId = await vs.catalog.serviceIdFor(slug); }
    catch (error) {
      serviceId = catalogApps.find(app => app.slug === slug)?.serviceId;
      if (!serviceId) throw error;
    }
    const v = await vs.catalog.versions(serviceId);
    console.log(`\n=== ${slug}  service_id=${serviceId}`);
    for (const a of v?.actions ?? []) {
      console.log(`- ${a.name}  action_id=${a.action_id}  action_version_id=${a.action_version_id}`);
      const fields = a.input_schema?.properties ?? a.input_schema ?? {};
      console.log('    input fields:', JSON.stringify(fields).slice(0, 600));
    }
  } catch (e) { console.log(`\n=== ${slug}: ${e.message} (check the slug on https://flow.viasocket.com/documentation/${slug}.md)`); }
}
