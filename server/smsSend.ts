/**
 * Sending one SMS or WhatsApp message from the portal.
 *
 * Runs in Node only (Vite dev/preview middleware and the serverless function in
 * /api). Only signed-in portal members can send, so the route also needs the
 * Supabase server settings; without them it reports "not configured" and the
 * portal shows that sending is not set up. Provider settings: see ./ebulksms.ts.
 */
import { createClient } from '@supabase/supabase-js';
import { balance, deliver, prepareMessage, providerFrom, type ProviderEnv } from './ebulksms.js';

export interface SmsEnv extends ProviderEnv {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
}

export interface SmsResponse {
  status: number;
  body: {
    configured: boolean;
    sender?: string;
    ok?: boolean;
    units?: number;
    balance?: number;
    error?: string;
  };
}

const fail = (status: number, error: string, sender?: string): SmsResponse => ({
  status,
  body: { configured: true, sender, error },
});

async function isPortalMember(token: string, url: string, secret: string): Promise<boolean> {
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: profile } = await admin.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
  return !!profile;
}

export async function handleSms(
  method: string | undefined,
  authorization: string | undefined,
  body: Record<string, unknown>,
  env: SmsEnv,
): Promise<SmsResponse> {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const provider = providerFrom(env);
  if (!provider || !supabaseUrl || !env.SUPABASE_SECRET_KEY) return { status: 200, body: { configured: false } };
  const { sender } = provider;

  const token = authorization?.replace(/^Bearer\s+/i, '');
  const member = token ? await isPortalMember(token, supabaseUrl, env.SUPABASE_SECRET_KEY) : false;

  if (method === 'GET') {
    const result: SmsResponse = { status: 200, body: { configured: true, sender } };
    if (member) result.body.balance = await balance(provider).catch(() => undefined);
    return result;
  }
  if (method !== 'POST') return fail(405, 'Method not allowed', sender);
  if (!token) return fail(401, 'Not signed in', sender);
  if (!member) return fail(401, 'Your session has expired or you no longer have portal access. Please sign in again.', sender);

  const phone = String(body.phone ?? '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return fail(400, 'Phone number must be in international format, e.g. +2348031234567', sender);

  const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'sms';
  const prepared = prepareMessage(channel, String(body.message ?? ''));
  if (!prepared.ok) return fail(400, prepared.error, sender);

  // The portal passes its message-history id so delivery reports can update that row.
  const requested = String(body.msgid ?? '');
  const msgid = /^[A-Za-z0-9]{6,40}$/.test(requested) ? requested : `fms${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  const result = await deliver(provider, channel, prepared.text, [{ phone, msgid }]);
  if (result.ok) return { status: 200, body: { configured: true, sender, ok: true, units: result.units } };
  return fail(result.httpStatus, result.error, sender);
}
