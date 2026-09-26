/**
 * Serverless endpoint (Vercel-style) for production deployments:
 *   POST /api/whatsapp/check   { "phone": "+2348031234567" }
 *   GET  /api/whatsapp/check   → configuration status
 */
// Node ESM on Vercel needs the explicit extension; TypeScript maps .js to the .ts source.
import { handleWhatsAppCheck, waConfigStatus } from '../../server/whatsappCheck.js';

interface Req {
  method?: string;
  body?: unknown;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

export default async function handler(req: Req, res: Res) {
  if (req.method === 'GET') {
    const cfg = waConfigStatus(process.env);
    res.status(200).json({ configured: cfg.configured, provider: cfg.provider });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  let body: unknown;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  } catch {
    res.status(400).json({ configured: true, error: 'Invalid JSON body' });
    return;
  }
  const result = await handleWhatsAppCheck((body as { phone?: unknown }).phone, process.env);
  res.status(result.status).json(result.body);
}
