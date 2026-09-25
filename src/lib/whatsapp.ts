import type { WhatsAppStatus } from '../types';

export interface WaCheckResult {
  status: WhatsAppStatus;
  source: 'provider' | 'demo';
  provider?: string;
  message?: string;
}

export interface WaIntegrationStatus {
  configured: boolean;
  provider?: string;
}

const ENDPOINT = '/api/whatsapp/check';

const PROVIDER_NAME: Record<string, string> = { walookup: 'WA Lookup', '2chat': '2Chat' };

export function providerName(id?: string): string {
  return (id && PROVIDER_NAME[id]) || id || 'provider';
}

/** Simulated result used when no provider is connected: even last digit → on WhatsApp. */
async function demoCheck(phone: string): Promise<WaCheckResult> {
  await new Promise((r) => setTimeout(r, 900 + Math.random() * 700));
  const last = parseInt(phone.replace(/\D/g, '').slice(-1), 10);
  if (isNaN(last)) return { status: 'error', source: 'demo' };
  return { status: last % 2 === 0 ? 'active' : 'inactive', source: 'demo' };
}

export async function checkWhatsApp(phone: string): Promise<WaCheckResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
  } catch {
    return demoCheck(phone);
  }

  const data = (await res.json().catch(() => null)) as
    | { status?: WhatsAppStatus; provider?: string; configured?: boolean; error?: string }
    | null;

  // No endpoint on this host (static hosting serves HTML) or provider not configured.
  if (!data || data.configured === false) return demoCheck(phone);

  if (!res.ok || !data.status) {
    return { status: 'error', source: 'provider', provider: data.provider, message: data.error };
  }
  return { status: data.status, source: 'provider', provider: data.provider };
}

export async function getWaIntegrationStatus(): Promise<WaIntegrationStatus> {
  try {
    const res = await fetch(ENDPOINT, { method: 'GET' });
    const data = (await res.json()) as WaIntegrationStatus;
    return { configured: !!data.configured, provider: data.provider };
  } catch {
    return { configured: false };
  }
}
