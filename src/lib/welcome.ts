import type { ServiceType } from '../types';
import { fmtDate, serviceLabel, todayIso } from './services';

export type WelcomeChannel = 'auto' | 'sms' | 'whatsapp';

export interface WelcomeOptions {
  text: string;
  channel: WelcomeChannel;
}

export const PLACEHOLDERS = [
  { key: '{name}', hint: 'first name' },
  { key: '{location}', hint: 'where you met' },
  { key: '{date}', hint: 'date you met' },
  { key: '{service}', hint: 'service(s) they committed to' },
];

export function fillWelcome(
  template: string,
  data: { name: string; metLocation?: string; metDate?: string; committedServices?: ServiceType[]; committedSpecialEvent?: string }
): string {
  const first = data.name.trim().split(/\s+/)[0] || 'friend';
  const services = (data.committedServices ?? []).map((s) => serviceLabel(s, data.committedSpecialEvent));
  const service =
    services.length === 0
      ? 'Sunday Service'
      : services.length === 1
      ? services[0]
      : `${services.slice(0, -1).join(', ')} and ${services[services.length - 1]}`;
  return template
    .replace(/\{name\}/g, first)
    .replace(/\{location\}/g, data.metLocation?.trim() || 'our outreach')
    .replace(/\{date\}/g, fmtDate(data.metDate || todayIso()))
    .replace(/\{service\}/g, service);
}
