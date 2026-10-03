/**
 * Serverless endpoint for the background job (see server/tick.ts):
 *   POST /api/cron/tick   with header "X-Cron-Key: <key>"
 * Called every few minutes by the database scheduler set up with `npm run cron:setup`.
 */
import { handleTick } from '../../server/tick.js';

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status: (code: number) => Res;
  json: (body: unknown) => void;
}

export default async function handler(req: Req, res: Res) {
  const key = req.headers['x-cron-key'];
  const result = await handleTick(req.method, Array.isArray(key) ? key[0] : key, process.env);
  res.status(result.status).json(result.body);
}
