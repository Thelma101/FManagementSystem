/**
 * Serverless endpoint (Vercel-style) for self-registration:
 *   POST /api/auth/register  { name, email, password }
 * New accounts always get the lowest role (Authorized user).
 */
import { handleRegister } from '../../server/adminUsers.js';

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

export default async function handler(req: Req, res: Res) {
  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : ((req.body as Record<string, unknown>) ?? {});
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const result = await handleRegister(req.method, body, process.env, ip);
  res.status(result.status).json(result.body);
}
