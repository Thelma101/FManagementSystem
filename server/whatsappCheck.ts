/**
 * Server-side WhatsApp registration check.
 *
 * Runs in Node only (Vite dev/preview middleware and the serverless function in
 * /api). API keys are read from environment variables and never reach the browser.
 *
 *   WA_CHECK_PROVIDER = walookup | 2chat
 *   WA_CHECK_API_KEY  = provider API key
 *   WA_CHECK_SENDER   = (2chat only) your WhatsApp number connected to 2Chat, e.g. +2348000000000
 */

export type WaProvider = 'walookup' | '2chat';

export interface WaEnv {
  WA_CHECK_PROVIDER?: string;
  WA_CHECK_API_KEY?: string;
  WA_CHECK_SENDER?: string;
}

export interface WaCheckResponse {
  status: number;
  body: {
    status?: 'active' | 'inactive' | 'error';
    provider?: WaProvider;
    configured: boolean;
    error?: string;
  };
}

function providerFrom(env: WaEnv): WaProvider | null {
  const p = env.WA_CHECK_PROVIDER?.trim().toLowerCase();
  if (p === 'walookup' || p === '2chat') return p;
  return null;
}

export function waConfigStatus(env: WaEnv): { configured: boolean; provider?: WaProvider; problem?: string } {
  const provider = providerFrom(env);
  if (!provider) return { configured: false, problem: 'WA_CHECK_PROVIDER is not set to walookup or 2chat' };
  if (!env.WA_CHECK_API_KEY) return { configured: false, provider, problem: 'WA_CHECK_API_KEY is missing' };
  if (provider === '2chat' && !env.WA_CHECK_SENDER) {
    return { configured: false, provider, problem: 'WA_CHECK_SENDER is required for 2Chat' };
  }
  return { configured: true, provider };
}

const E164 = /^\+[1-9]\d{6,14}$/;

async function checkWithWaLookup(phone: string, apiKey: string): Promise<boolean> {
  const res = await fetch('https://walookup.com/api/v1/check', {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_type: 'ws', identifier: phone }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    code?: number;
    msg?: string;
    data?: { registered?: boolean };
  };
  if (json.code !== 0 || typeof json.data?.registered !== 'boolean') {
    throw new Error(`WA Lookup error ${json.code ?? res.status}: ${json.msg ?? 'unexpected response'}`);
  }
  return json.data.registered;
}

async function checkWith2Chat(phone: string, apiKey: string, sender: string): Promise<boolean> {
  const url = `https://api.p.2chat.io/open/whatsapp/check-number/${encodeURIComponent(sender)}/${encodeURIComponent(phone)}`;
  const res = await fetch(url, { headers: { 'X-User-API-Key': apiKey } });
  const json = (await res.json().catch(() => ({}))) as { is_valid?: boolean; on_whatsapp?: boolean; message?: string };
  if (!res.ok) throw new Error(`2Chat error ${res.status}: ${json.message ?? 'request failed'}`);
  if (json.is_valid === false) return false;
  if (typeof json.on_whatsapp !== 'boolean') throw new Error('2Chat returned an unexpected response');
  return json.on_whatsapp;
}

export async function handleWhatsAppCheck(phone: unknown, env: WaEnv): Promise<WaCheckResponse> {
  const cfg = waConfigStatus(env);
  if (!cfg.configured || !cfg.provider) {
    return { status: 501, body: { configured: false, error: cfg.problem } };
  }
  if (typeof phone !== 'string' || !E164.test(phone)) {
    return { status: 400, body: { configured: true, provider: cfg.provider, error: 'phone must be in E.164 format' } };
  }
  try {
    const onWhatsApp =
      cfg.provider === 'walookup'
        ? await checkWithWaLookup(phone, env.WA_CHECK_API_KEY!)
        : await checkWith2Chat(phone, env.WA_CHECK_API_KEY!, env.WA_CHECK_SENDER!);
    return {
      status: 200,
      body: { configured: true, provider: cfg.provider, status: onWhatsApp ? 'active' : 'inactive' },
    };
  } catch (err) {
    return {
      status: 502,
      body: {
        configured: true,
        provider: cfg.provider,
        status: 'error',
        error: err instanceof Error ? err.message : 'Provider request failed',
      },
    };
  }
}
