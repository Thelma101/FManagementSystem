/**
 * Server-side SMS and WhatsApp sending through eBulkSMS
 * (https://www.ebulksms.com/pages/json-api, /pages/json-whatsapp-api).
 * WhatsApp needs the church's WhatsApp number connected on ebulksms.com first.
 *
 * Runs in Node only (Vite dev/preview middleware and the serverless function in
 * /api). The eBulkSMS API key must never reach the browser. Only signed-in portal
 * members can send, so the route also needs the Supabase server settings; without
 * them it reports "not configured" and the portal shows that sending is not set up.
 *
 *   EBULKSMS_USERNAME = login email on eBulkSMS
 *   EBULKSMS_API_KEY  = API key from eBulkSMS → API Settings
 *   EBULKSMS_SENDER   = sender name, max 11 letters/numbers
 *   EBULKSMS_DND      = 1 to also deliver to MTN Do-Not-Disturb numbers (costs more), 0 to skip them
 */
import { createClient } from '@supabase/supabase-js';
import { smsInfo, toGsm } from '../src/lib/sms.js';

export interface SmsEnv {
  EBULKSMS_USERNAME?: string;
  EBULKSMS_API_KEY?: string;
  EBULKSMS_SENDER?: string;
  EBULKSMS_DND?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
}

export interface SmsResponse {
  status: number;
  body: {
    configured: boolean;
    provider?: 'ebulksms';
    sender?: string;
    ok?: boolean;
    units?: number;
    balance?: number;
    error?: string;
  };
}

const API = 'https://api.ebulksms.com';
const MAX_PAGES = 6;
const MAX_WHATSAPP_CHARS = 4000;

const STATUS_MESSAGES: Record<string, [number, string]> = {
  INSUFFICIENT_CREDIT: [402, 'Not enough SMS credit on eBulkSMS. Top up the account and try again.'],
  AUTH_FAILURE: [502, 'eBulkSMS rejected the username or API key.'],
  INVALID_SENDER: [502, 'eBulkSMS rejected the sender name. Use up to 11 letters or numbers.'],
  MISSING_SENDER: [502, 'No sender name is set for eBulkSMS.'],
  INVALID_RECIPIENT: [400, 'eBulkSMS says this phone number is not valid.'],
  INVALID_MESSAGE: [400, 'eBulkSMS rejected the message: it is too long or has characters SMS cannot carry.'],
  NOT_SUBSCRIBED: [502, 'No WhatsApp number is connected on eBulkSMS. Log in to ebulksms.com, open WhatsApp and scan the QR code with the church phone.'],
  MISSING_RECIPIENT: [400, 'eBulkSMS says this is not a valid WhatsApp number.'],
};

function settings(env: SmsEnv) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const username = env.EBULKSMS_USERNAME?.trim();
  const apiKey = env.EBULKSMS_API_KEY?.trim();
  const sender = (env.EBULKSMS_SENDER?.trim() || 'LivingFaith').slice(0, 11);
  const configured = !!(username && apiKey && supabaseUrl && env.SUPABASE_SECRET_KEY);
  return { configured, supabaseUrl, username, apiKey, sender, dnd: env.EBULKSMS_DND?.trim() !== '0' };
}

const fail = (status: number, error: string, sender?: string): SmsResponse => ({
  status,
  body: { configured: true, provider: 'ebulksms', sender, error },
});

async function isPortalMember(token: string, url: string, secret: string): Promise<boolean> {
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: profile } = await admin.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
  return !!profile;
}

async function balance(username: string, apiKey: string): Promise<number | undefined> {
  const res = await fetch(`${API}/balance/${encodeURIComponent(username)}/${encodeURIComponent(apiKey)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const value = Number((await res.text()).trim());
  return res.ok && Number.isFinite(value) ? value : undefined;
}

export async function handleSms(
  method: string | undefined,
  authorization: string | undefined,
  body: Record<string, unknown>,
  env: SmsEnv,
): Promise<SmsResponse> {
  const cfg = settings(env);
  if (!cfg.configured) return { status: 200, body: { configured: false } };

  const token = authorization?.replace(/^Bearer\s+/i, '');
  const member = token ? await isPortalMember(token, cfg.supabaseUrl!, env.SUPABASE_SECRET_KEY!) : false;

  if (method === 'GET') {
    const result: SmsResponse = { status: 200, body: { configured: true, provider: 'ebulksms', sender: cfg.sender } };
    if (member) result.body.balance = await balance(cfg.username!, cfg.apiKey!).catch(() => undefined);
    return result;
  }
  if (method !== 'POST') return fail(405, 'Method not allowed', cfg.sender);
  if (!token) return fail(401, 'Not signed in', cfg.sender);
  if (!member) return fail(401, 'Your session has expired or you no longer have portal access. Please sign in again.', cfg.sender);

  const phone = String(body.phone ?? '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return fail(400, 'Phone number must be in international format, e.g. +2348031234567', cfg.sender);

  const whatsapp = body.channel === 'whatsapp';
  const raw = String(body.message ?? '').trim();
  if (!raw) return fail(400, 'Message is empty', cfg.sender);

  let url: string;
  let payload: unknown;
  if (whatsapp) {
    if (raw.length > MAX_WHATSAPP_CHARS) return fail(400, `Message is too long (maximum ${MAX_WHATSAPP_CHARS} characters for WhatsApp)`, cfg.sender);
    url = `${API}/sendwhatsapp.json`;
    payload = {
      WA: {
        auth: { username: cfg.username, apikey: cfg.apiKey },
        message: { subject: `Portal message ${new Date().toISOString().slice(0, 10)}`, messagetext: raw },
        recipients: [phone.slice(1)],
      },
    };
  } else {
    const message = toGsm(raw);
    const info = smsInfo(message);
    if (info.parts > MAX_PAGES) return fail(400, `Message is too long (${info.parts} SMS pages, maximum ${MAX_PAGES})`, cfg.sender);
    url = `${API}/sendsms.json`;
    payload = {
      SMS: {
        auth: { username: cfg.username, apikey: cfg.apiKey },
        message: { sender: cfg.sender, messagetext: message, flash: '0' },
        recipients: { gsm: [{ msidn: phone.slice(1), msgid: `fms${Date.now()}${Math.floor(Math.random() * 1e6)}` }] },
        dndsender: cfg.dnd ? 1 : 0,
      },
    };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return fail(504, 'Could not reach eBulkSMS. Please try again.', cfg.sender);
  }

  const data = (await res.json().catch(() => null)) as { response?: { status?: string; cost?: string | number } } | null;
  const status = data?.response?.status;
  if (status === 'SUCCESS') {
    const units = Number(data?.response?.cost);
    return {
      status: 200,
      body: { configured: true, provider: 'ebulksms', sender: cfg.sender, ok: true, units: Number.isFinite(units) ? units : undefined },
    };
  }
  const [code, text] = (status && STATUS_MESSAGES[status]) || [502, `eBulkSMS could not send the ${whatsapp ? 'WhatsApp message' : 'SMS'} (${status ?? `HTTP ${res.status}`}).`];
  return fail(code, text, cfg.sender);
}
