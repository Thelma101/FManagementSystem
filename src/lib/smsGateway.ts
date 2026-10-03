import { accessToken } from './cloud';

const ENDPOINT = '/api/sms/send';

export type GatewayResult =
  | { configured: false }
  | { configured: true; ok: true; units?: number }
  /** fatal: an account problem (credit, key, sender, session) that will fail every send. */
  | { configured: true; ok: false; error: string; fatal?: boolean };

export interface SmsGatewayStatus {
  configured: boolean;
  provider?: string;
  sender?: string;
  /** eBulkSMS units left (an SMS page costs about 4). */
  balance?: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Sends one SMS or WhatsApp message through the server. */
export async function sendViaGateway(phone: string, message: string, channel: 'sms' | 'whatsapp' = 'sms'): Promise<GatewayResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ phone, message, channel }),
    });
  } catch {
    return { configured: true, ok: false, error: 'Could not reach the server. Check your connection.' };
  }
  const data = (await res.json().catch(() => null)) as
    | { configured?: boolean; ok?: boolean; units?: number; error?: string }
    | null;
  // Static hosting without the /api function serves HTML instead of JSON.
  if (!data || data.configured === false) return { configured: false };
  if (!res.ok || !data.ok) {
    const fatal = res.status === 401 || res.status === 402 || res.status === 502;
    return { configured: true, ok: false, error: data.error ?? `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} failed (${res.status})`, fatal };
  }
  return { configured: true, ok: true, units: data.units };
}

export async function getSmsGatewayStatus(): Promise<SmsGatewayStatus> {
  try {
    const res = await fetch(ENDPOINT, { headers: await authHeaders() });
    const data = (await res.json()) as SmsGatewayStatus;
    return { configured: !!data.configured, provider: data.provider, sender: data.sender, balance: data.balance };
  } catch {
    return { configured: false };
  }
}
