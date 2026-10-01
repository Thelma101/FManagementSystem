/**
 * Serverless endpoint (Vercel-style) for real SMS sending:
 *   POST /api/sms/send  { "phone": "+2348031234567", "message": "..." }
 *   GET  /api/sms/send  → configuration status (+ credit balance when signed in)
 * Requires "Authorization: Bearer <Supabase access token>".
 */
import { handleSms } from '../../server/smsSend.js';

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

export default async function handler(req: Req, res: Res) {
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : ((req.body as Record<string, unknown>) ?? {});
    } catch {
      res.status(400).json({ configured: true, error: 'Invalid JSON body' });
      return;
    }
  }
  const auth = req.headers.authorization;
  const result = await handleSms(req.method, Array.isArray(auth) ? auth[0] : auth, body, process.env);
  res.status(result.status).json(result.body);
}
