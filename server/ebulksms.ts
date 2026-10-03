/**
 * The SMS provider (eBulkSMS, https://www.ebulksms.com/pages/json-api and
 * /pages/json-whatsapp-api). Server only: the API key must never reach the browser.
 * Staff never see the provider's name, so every message here says "messaging account".
 *
 *   EBULKSMS_USERNAME = login email on eBulkSMS
 *   EBULKSMS_API_KEY  = API key from eBulkSMS → API Settings
 *   EBULKSMS_SENDER   = sender name, max 11 letters/numbers
 *   EBULKSMS_DND      = 1 to also deliver to MTN Do-Not-Disturb numbers (costs more), 0 to skip them
 */
import { smsInfo, toGsm } from '../src/lib/sms.js';

export interface ProviderEnv {
  EBULKSMS_USERNAME?: string;
  EBULKSMS_API_KEY?: string;
  EBULKSMS_SENDER?: string;
  EBULKSMS_DND?: string;
}

export interface Provider {
  username: string;
  apiKey: string;
  sender: string;
  dnd: boolean;
}

export type Channel = 'sms' | 'whatsapp';
type Fetch = typeof fetch;

const API = 'https://api.ebulksms.com';
const MAX_PAGES = 6;
const MAX_WHATSAPP_CHARS = 4000;

export function providerFrom(env: ProviderEnv): Provider | null {
  const username = env.EBULKSMS_USERNAME?.trim();
  const apiKey = env.EBULKSMS_API_KEY?.trim();
  if (!username || !apiKey) return null;
  return {
    username,
    apiKey,
    sender: (env.EBULKSMS_SENDER?.trim() || 'LivingFaith').slice(0, 11),
    dnd: env.EBULKSMS_DND?.trim() !== '0',
  };
}

/** [HTTP status for the portal, message for staff, problem with the whole account?] */
const STATUS_MESSAGES: Record<string, [number, string, boolean]> = {
  INSUFFICIENT_CREDIT: [402, 'Not enough SMS credit. Top up the messaging account and try again.', true],
  AUTH_FAILURE: [502, 'The messaging account rejected the server\'s login details. Check the SMS settings on the server.', true],
  INVALID_SENDER: [502, 'The sender name was rejected. Use up to 11 letters or numbers.', true],
  MISSING_SENDER: [502, 'No sender name is set for SMS.', true],
  INVALID_RECIPIENT: [400, 'This phone number is not valid.', false],
  INVALID_MESSAGE: [400, 'The message was rejected: it is too long or has characters SMS cannot carry.', false],
  NOT_SUBSCRIBED: [502, 'No WhatsApp number is connected yet. Connect the church phone by scanning the WhatsApp QR code in the messaging account.', true],
  MISSING_RECIPIENT: [400, 'This is not a valid WhatsApp number.', false],
};

export type Prepared = { ok: true; text: string } | { ok: false; error: string };

/** Checks a message and converts SMS text to characters every phone can show. */
export function prepareMessage(channel: Channel, raw: string): Prepared {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Message is empty' };
  if (channel === 'whatsapp') {
    if (trimmed.length > MAX_WHATSAPP_CHARS) return { ok: false, error: `Message is too long (maximum ${MAX_WHATSAPP_CHARS} characters for WhatsApp)` };
    return { ok: true, text: trimmed };
  }
  const text = toGsm(trimmed);
  const { parts } = smsInfo(text);
  if (parts > MAX_PAGES) return { ok: false, error: `Message is too long (${parts} SMS pages, maximum ${MAX_PAGES})` };
  return { ok: true, text };
}

export type DeliverResult =
  | { ok: true; units?: number }
  /** `uncertain`: no answer came back, so the message may still have gone out. */
  | { ok: false; httpStatus: number; error: string; accountProblem: boolean; uncertain: boolean };

/**
 * Sends one prepared text to up to 100 numbers (+234… format). For SMS each number
 * carries its own message id, which delivery reports refer back to.
 */
export async function deliver(
  p: Provider,
  channel: Channel,
  text: string,
  recipients: { phone: string; msgid: string }[],
  fetchImpl: Fetch = fetch,
): Promise<DeliverResult> {
  const whatsapp = channel === 'whatsapp';
  const auth = { username: p.username, apikey: p.apiKey };
  const payload = whatsapp
    ? {
        WA: {
          auth,
          message: { subject: `Portal message ${new Date().toISOString().slice(0, 10)}`, messagetext: text },
          recipients: recipients.map((r) => r.phone.slice(1)),
        },
      }
    : {
        SMS: {
          auth,
          message: { sender: p.sender, messagetext: text, flash: '0' },
          recipients: { gsm: recipients.map((r) => ({ msidn: r.phone.slice(1), msgid: r.msgid })) },
          dndsender: p.dnd ? 1 : 0,
        },
      };

  let res: Response;
  try {
    res = await fetchImpl(`${API}/${whatsapp ? 'sendwhatsapp' : 'sendsms'}.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, httpStatus: 504, error: 'Could not reach the messaging service. Please try again.', accountProblem: false, uncertain: true };
  }

  const data = (await res.json().catch(() => null)) as { response?: { status?: string; cost?: string | number } } | null;
  const status = data?.response?.status;
  if (status === 'SUCCESS') {
    const units = Number(data?.response?.cost);
    return { ok: true, units: Number.isFinite(units) ? units : undefined };
  }
  const known = status ? STATUS_MESSAGES[status] : undefined;
  if (known) return { ok: false, httpStatus: known[0], error: known[1], accountProblem: known[2], uncertain: false };
  return {
    ok: false,
    httpStatus: 502,
    error: `The messaging service could not send the ${whatsapp ? 'WhatsApp message' : 'SMS'} (${status ?? `HTTP ${res.status}`}).`,
    accountProblem: false,
    uncertain: res.status >= 500 || !status,
  };
}

export async function balance(p: Provider, fetchImpl: Fetch = fetch): Promise<number | undefined> {
  const res = await fetchImpl(`${API}/balance/${encodeURIComponent(p.username)}/${encodeURIComponent(p.apiKey)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const value = Number((await res.text()).trim());
  return res.ok && Number.isFinite(value) ? value : undefined;
}

export interface DeliveryReport {
  id: string;
  status: 'sent' | 'delivered' | 'failed';
  detail: string;
}

const REPORT_TEXT: Record<string, string> = {
  UNDELIV: 'Not delivered: the phone was off or out of coverage',
  UNDELIVERED: 'Not delivered: the phone was off or out of coverage',
  EXPIRED: 'Not delivered: the phone stayed unreachable until the message expired',
  REJECTD: 'Not delivered: the network rejected it',
  REJECTED: 'Not delivered: the network rejected it',
  DND: 'Not delivered: the number is on Do-Not-Disturb',
};

export function readReportStatus(raw: string): Pick<DeliveryReport, 'status' | 'detail'> {
  const code = raw.trim().toUpperCase();
  if (/UNDELIV|FAIL|REJECT|EXPIR|BLACK|DND|INVALID|ERR/.test(code)) {
    return { status: 'failed', detail: REPORT_TEXT[code] ?? `Not delivered (${code})` };
  }
  if (/DELIV/.test(code)) return { status: 'delivered', detail: 'Delivered to the phone' };
  return { status: 'sent', detail: code ? `With the network (${code})` : 'With the network' };
}

/**
 * New SMS delivery reports. The provider hands each report out once (up to 1000 per
 * call), so the caller must save them straight away.
 */
export async function fetchDeliveryReports(p: Provider, fetchImpl: Fetch = fetch): Promise<DeliveryReport[]> {
  const url = `${API}/getdlr.json?username=${encodeURIComponent(p.username)}&apikey=${encodeURIComponent(p.apiKey)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  const text = (await res.text()).trim();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    if (/AUTH|FAIL|ERROR/i.test(text)) throw new Error(`Delivery reports unavailable (${text.slice(0, 40)})`);
    return [];
  }
  const raw = (data as { dlr?: unknown })?.dlr;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  return list
    .map((r) => r as { id?: unknown; status?: unknown })
    .filter((r) => r.id !== undefined && r.id !== null && String(r.id).trim())
    .map((r) => ({ id: String(r.id).trim(), ...readReportStatus(String(r.status ?? '')) }));
}
