/**
 * Serverless endpoint (Vercel-style) for portal user management:
 *   POST   /api/admin/users  { name, email, password, role }
 *   PATCH  /api/admin/users  { id, role }
 *   DELETE /api/admin/users  { id }
 * Requires "Authorization: Bearer <Supabase access token>".
 */
import { handleAdminUsers } from '../../server/adminUsers.js';

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
  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : ((req.body as Record<string, unknown>) ?? {});
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  const auth = req.headers.authorization;
  const result = await handleAdminUsers(req.method, Array.isArray(auth) ? auth[0] : auth, body, process.env);
  res.status(result.status).json(result.body);
}
