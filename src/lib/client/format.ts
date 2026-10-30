export { formatRange, zoneLabel } from '@/lib/core/time';
import { DateTime } from 'luxon';
export const clock = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone).toFormat('h:mm a').toLowerCase();
export const dateLabel = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone).toFormat('ccc d LLL');
export const localDate = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone).toISODate()!;
export const localTime = (iso: string, zone: string) => DateTime.fromISO(iso).setZone(zone).toFormat('HH:mm');
